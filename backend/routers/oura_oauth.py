"""
Oura Ring OAuth 2.0 router.

Endpoints:
  GET  /oura/auth-url   → return the Oura authorization URL
  GET  /oura/callback   → exchange code, store token, redirect to dashboard
  GET  /oura/status     → connected? last synced?
  POST /oura/sync       → fetch last 7 days from Oura API, upsert OuraReadings + DailyScores
  DELETE /oura/disconnect → remove stored token
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
from backend.models import DailyScore, OuraReading, OuraToken
from backend.services import oura_api
from backend.services.scoring import (
    classify_condition,
    compute_exposure_score,
    compute_friction_score,
    compute_recovery_score,
)

logger = logging.getLogger(__name__)
router = APIRouter()

DASHBOARD_URL = "http://localhost:5173"


# ── helpers ────────────────────────────────────────────────────────────────────

def _get_token(db: Session) -> OuraToken | None:
    return db.query(OuraToken).first()


async def _ensure_fresh_token(token: OuraToken, db: Session) -> OuraToken:
    """Refresh the access token if it has expired (or is about to)."""
    now = datetime.now(timezone.utc)
    expires_at = token.expires_at
    if expires_at:
        # Make expires_at timezone-aware if it's naive
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at - now < timedelta(minutes=5):
            data = await oura_api.refresh_access_token(
                token.refresh_token,
                settings.oura_client_id,
                settings.oura_client_secret,
            )
            token.access_token = data["access_token"]
            if "refresh_token" in data:
                token.refresh_token = data["refresh_token"]
            token.expires_at = oura_api.token_expires_at(data)
            db.commit()
    return token


def _upsert_oura_reading(db: Session, row_date: date, fields: dict) -> None:
    existing = db.query(OuraReading).filter(OuraReading.date == row_date).first()
    if existing:
        for k, v in fields.items():
            if v is not None:
                setattr(existing, k, v)
    else:
        db.add(OuraReading(date=row_date, **fields))


def _upsert_daily_score(db: Session, row_date: date, reading: dict) -> None:
    from backend.models import Checkin

    recovery = compute_recovery_score(
        source="oura",
        readiness_score=reading.get("readiness_score"),
        hrv_avg=reading.get("hrv_avg"),
        sleep_score=reading.get("sleep_score"),
    )
    checkin = (
        db.query(Checkin)
        .filter(Checkin.date == row_date)
        .order_by(Checkin.recorded_at.desc())
        .first()
    )
    friction = compute_friction_score(checkin.friction_rating if checkin else None)
    exposure = compute_exposure_score(None)
    condition = classify_condition(recovery, exposure, friction)

    sources = ["oura"]
    if checkin:
        sources.append("checkin")

    existing = db.query(DailyScore).filter(DailyScore.date == row_date).first()
    if existing:
        existing.recovery_score = recovery
        existing.exposure_score = exposure
        existing.friction_score = friction
        existing.condition = condition
        existing.data_sources = json.dumps(sources)
    else:
        db.add(DailyScore(
            date=row_date,
            recovery_score=recovery,
            exposure_score=exposure,
            friction_score=friction,
            condition=condition,
            data_sources=json.dumps(sources),
        ))


# ── endpoints ──────────────────────────────────────────────────────────────────

@router.get("/auth-url")
def get_auth_url():
    if not settings.oura_client_id:
        raise HTTPException(400, "OURA_CLIENT_ID is not configured.")
    url = oura_api.build_auth_url(settings.oura_client_id, settings.oura_redirect_uri)
    return {"url": url}


@router.get("/callback")
async def callback(code: str, db: Session = Depends(get_db)):
    if not settings.oura_client_id or not settings.oura_client_secret:
        raise HTTPException(400, "Oura credentials not configured.")

    try:
        token_data = await oura_api.exchange_code(
            code,
            settings.oura_client_id,
            settings.oura_client_secret,
            settings.oura_redirect_uri,
        )
    except Exception as exc:
        logger.error("Oura token exchange failed: %s", exc)
        return RedirectResponse(f"{DASHBOARD_URL}/?oura=error")

    # Upsert — only ever store one token row
    existing = db.query(OuraToken).first()
    if existing:
        existing.access_token = token_data["access_token"]
        existing.refresh_token = token_data.get("refresh_token", existing.refresh_token)
        existing.token_type = token_data.get("token_type", "Bearer")
        existing.expires_at = oura_api.token_expires_at(token_data)
    else:
        db.add(OuraToken(
            access_token=token_data["access_token"],
            refresh_token=token_data.get("refresh_token", ""),
            token_type=token_data.get("token_type", "Bearer"),
            expires_at=oura_api.token_expires_at(token_data),
        ))
    db.commit()

    return RedirectResponse(f"{DASHBOARD_URL}/?oura=connected")


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
        raise HTTPException(401, "Oura not connected. Visit /oura/auth-url to connect.")

    token = await _ensure_fresh_token(token, db)

    end = date.today()
    start = end - timedelta(days=days - 1)
    start_str = start.isoformat()
    end_str = end.isoformat()

    try:
        readiness_records = await oura_api.fetch_daily_readiness(
            token.access_token, start_str, end_str
        )
        sleep_records = await oura_api.fetch_daily_sleep(
            token.access_token, start_str, end_str
        )
    except Exception as exc:
        logger.error("Oura API fetch failed: %s", exc)
        raise HTTPException(502, f"Oura API error: {exc}")

    # Index sleep by day for easy lookup
    sleep_by_day: dict[str, dict] = {r["day"]: r for r in sleep_records}

    dates_synced: list[str] = []

    for r in readiness_records:
        day_str: str = r.get("day", "")
        if not day_str:
            continue

        try:
            row_date = date.fromisoformat(day_str)
        except ValueError:
            continue

        sleep = sleep_by_day.get(day_str, {})

        total_sleep_s = sleep.get("total_sleep_duration")
        total_sleep_hours = round(total_sleep_s / 3600, 2) if total_sleep_s else None

        fields = {
            "readiness_score": r.get("score"),
            "hrv_avg": sleep.get("average_hrv"),
            "sleep_score": sleep.get("score"),
            "total_sleep_hours": total_sleep_hours,
            "resting_heart_rate": sleep.get("lowest_heart_rate"),
            "activity_score": None,
        }

        _upsert_oura_reading(db, row_date, fields)
        _upsert_daily_score(db, row_date, fields)
        dates_synced.append(day_str)

    # Mark last sync time
    token.last_synced_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "synced_days": len(dates_synced),
        "date_range": {
            "start": start_str,
            "end": end_str,
        },
        "days": sorted(dates_synced),
    }


@router.delete("/disconnect")
def disconnect(db: Session = Depends(get_db)):
    token = _get_token(db)
    if token:
        db.delete(token)
        db.commit()
    return {"disconnected": True}
