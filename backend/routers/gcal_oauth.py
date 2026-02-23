"""
Google Calendar OAuth 2.0 router.

Endpoints:
  GET  /calendar/auth-url    → return Google OAuth URL
  GET  /calendar/callback    → exchange code, store token, redirect to dashboard
  GET  /calendar/status      → connected? last synced?
  POST /calendar/sync        → fetch events for last N days, upsert exposure scores
  DELETE /calendar/disconnect → remove stored token
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import get_db
from backend.models import DailyScore, GoogleCalToken
from backend.services import gcal_api
from backend.services.scoring import classify_condition

logger = logging.getLogger(__name__)
router = APIRouter()

DASHBOARD_URL = "http://localhost:5173"


# ── helpers ────────────────────────────────────────────────────────────────────

def _get_token(db: Session) -> GoogleCalToken | None:
    return db.query(GoogleCalToken).first()


async def _ensure_fresh_token(token: GoogleCalToken, db: Session) -> GoogleCalToken:
    now = datetime.now(timezone.utc)
    expires_at = token.expires_at
    if expires_at:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at - now < timedelta(minutes=5):
            data = await gcal_api.refresh_access_token(
                token.refresh_token,
                settings.gcal_client_id,
                settings.gcal_client_secret,
            )
            token.access_token = data["access_token"]
            # Google only returns a new refresh_token if it expires; keep old one otherwise
            if "refresh_token" in data:
                token.refresh_token = data["refresh_token"]
            token.expires_at = gcal_api.token_expires_at(data)
            db.commit()
    return token


def _upsert_exposure(db: Session, row_date: date, exposure: float) -> None:
    """Patch the exposure_score on an existing DailyScore row and reclassify."""
    existing = db.query(DailyScore).filter(DailyScore.date == row_date).first()
    if not existing:
        return  # no wearable data yet for this day; skip

    existing.exposure_score = exposure

    # Re-run condition classification with updated exposure
    condition = classify_condition(
        existing.recovery_score,
        exposure,
        existing.friction_score,
    )
    existing.condition = condition

    # Add "gcal" to data_sources if not already there
    sources: list[str] = json.loads(existing.data_sources or "[]")
    if "gcal" not in sources:
        sources.append("gcal")
    existing.data_sources = json.dumps(sources)


# ── endpoints ──────────────────────────────────────────────────────────────────

@router.get("/auth-url")
def get_auth_url():
    if not settings.gcal_client_id:
        raise HTTPException(400, "GCAL_CLIENT_ID is not configured.")
    url = gcal_api.build_auth_url(settings.gcal_client_id, settings.gcal_redirect_uri)
    return {"url": url}


@router.get("/callback")
async def callback(code: str, db: Session = Depends(get_db)):
    if not settings.gcal_client_id or not settings.gcal_client_secret:
        raise HTTPException(400, "Google Calendar credentials not configured.")

    try:
        token_data = await gcal_api.exchange_code(
            code,
            settings.gcal_client_id,
            settings.gcal_client_secret,
            settings.gcal_redirect_uri,
        )
    except Exception as exc:
        logger.error("Google Calendar token exchange failed: %s", exc)
        return RedirectResponse(f"{DASHBOARD_URL}/?gcal=error")

    refresh_token = token_data.get("refresh_token", "")
    existing = db.query(GoogleCalToken).first()
    if existing:
        existing.access_token = token_data["access_token"]
        if refresh_token:
            existing.refresh_token = refresh_token
        existing.token_type = token_data.get("token_type", "Bearer")
        existing.expires_at = gcal_api.token_expires_at(token_data)
    else:
        db.add(GoogleCalToken(
            access_token=token_data["access_token"],
            refresh_token=refresh_token,
            token_type=token_data.get("token_type", "Bearer"),
            expires_at=gcal_api.token_expires_at(token_data),
        ))
    db.commit()

    return RedirectResponse(f"{DASHBOARD_URL}/?gcal=connected")


@router.get("/status")
def get_status(db: Session = Depends(get_db)):
    token = _get_token(db)
    if not token:
        return {"connected": False, "last_synced": None}
    last = token.last_synced_at.isoformat() if token.last_synced_at else None
    return {"connected": True, "last_synced": last}


@router.post("/sync")
async def sync(days: int = 30, db: Session = Depends(get_db)):
    token = _get_token(db)
    if not token:
        raise HTTPException(401, "Google Calendar not connected.")

    token = await _ensure_fresh_token(token, db)

    end   = date.today()
    start = end - timedelta(days=days - 1)

    dates_synced: list[str] = []
    current = start
    while current <= end:
        day_str = current.isoformat()
        try:
            events = await gcal_api.fetch_events(token.access_token, day_str)
            exposure = gcal_api.compute_exposure_from_events(events)
            _upsert_exposure(db, current, exposure)
            dates_synced.append(day_str)
        except Exception as exc:
            logger.warning("Failed to fetch events for %s: %s", day_str, exc)
        current += timedelta(days=1)

    token.last_synced_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "synced_days": len(dates_synced),
        "date_range": {"start": start.isoformat(), "end": end.isoformat()},
    }


@router.delete("/disconnect")
def disconnect(db: Session = Depends(get_db)):
    token = _get_token(db)
    if token:
        db.delete(token)
        db.commit()
    return {"disconnected": True}
