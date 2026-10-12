"""
/connections — Oura (server OAuth), Apple Health and Apple Calendar (device-side, uploaded).

Status is live, not "linked or not": each provider reports the six states the
Settings screen shows (syncing, up_to_date, not_yet, delayed, expired, off).

Apple Calendar privacy: the device uploads busy blocks only. Event titles are
never stored server-side; the app shows them from the on-device calendar.
"""
from __future__ import annotations

import datetime as dt
import uuid
from typing import Iterator, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import Engine

from backend.auth import CurrentUser, get_current_user
from backend.config import settings
from backend.db import connections, profiles
from backend.db.scope import engine_or_503, privileged
from backend.integrations import health, oura, secrets
from backend.pipeline.clock import get_now
from backend.pipeline.day import day_context

router = APIRouter()

DisplayState = Literal["syncing", "up_to_date", "not_yet", "delayed", "expired", "off", "unavailable"]
STALE_AFTER = dt.timedelta(hours=12)


def get_http() -> Iterator[httpx.Client]:
    with httpx.Client(timeout=15) as client:
        yield client


class ConnectionOut(BaseModel):
    provider: Literal["oura", "apple_health", "apple_calendar", "google_calendar"]
    state: DisplayState
    last_synced_at: dt.datetime | None
    has_today: bool | None


def _display(row: dict | None, has_today: bool, now: dt.datetime) -> DisplayState:
    if row is None or row["status"] == "revoked":
        return "off"
    if row["status"] == "needs_reauth":
        return "expired"
    if row["status"] == "error":
        return "delayed"
    if row["last_synced_at"] is None:
        return "syncing"
    if now - row["last_synced_at"] > STALE_AFTER:
        return "delayed"
    return "up_to_date" if has_today else "not_yet"


@router.get("", response_model=list[ConnectionOut])
def list_connections(user: CurrentUser = Depends(get_current_user), engine: Engine = Depends(engine_or_503),
                     now: dt.datetime = Depends(get_now)):
    with privileged(engine) as conn:
        profiles.ensure_profile(conn, user.id)
        tz = (profiles.get_profile(conn, user.id) or {}).get("timezone")
        rows = {r["provider"]: r for r in connections.list_connections(conn, user.id)}
        today = day_context(tz, now).local_date
        with_today = connections.health_sources_on(conn, user.id, today)
    out = []
    for provider in ("oura", "apple_health", "apple_calendar"):
        row = rows.get(provider)
        is_health = provider != "apple_calendar"
        out.append(ConnectionOut(provider=provider, state=_display(row, provider in with_today or not is_health, now),
                                 last_synced_at=row["last_synced_at"] if row else None,
                                 has_today=(provider in with_today) if is_health else None))
    # Google Cloud project suspended (2026-10-10): shown, but unavailable.
    out.append(ConnectionOut(provider="google_calendar", state="unavailable", last_synced_at=None, has_today=None))
    return out


# ── Oura ──────────────────────────────────────────────────────────────────────

class AuthorizeOut(BaseModel):
    url: str


def _oura_ready() -> None:
    try:
        oura._require_config()
    except (oura.OuraNotConfigured, secrets.NotConfigured) as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Oura isn't available right now.") from exc


@router.post("/oura/authorize", response_model=AuthorizeOut)
def oura_authorize(user: CurrentUser = Depends(get_current_user)):
    """The app opens this URL in an auth session; Oura returns to /callback, which returns to the app."""
    _oura_ready()
    return AuthorizeOut(url=oura.authorize_url(user.id))


@router.get("/oura/callback", include_in_schema=False)
def oura_callback(state: str, code: str | None = None, error: str | None = None,
                  engine: Engine = Depends(engine_or_503), http: httpx.Client = Depends(get_http),
                  now: dt.datetime = Depends(get_now)):
    """Unauthenticated browser redirect: the signed state is what identifies the person."""
    back = f"{settings.app_return_url}?provider=oura&status="
    try:
        user_id = secrets.verify_state(state, oura.PROVIDER)
    except (secrets.BadState, secrets.NotConfigured):
        return RedirectResponse(back + "error", status_code=302)
    if error or not code:
        return RedirectResponse(back + "cancelled", status_code=302)
    try:
        oura.exchange_code(engine, user_id, code, http, now)
    except (oura.NeedsReauth, httpx.HTTPError, oura.OuraNotConfigured, secrets.NotConfigured):
        return RedirectResponse(back + "error", status_code=302)
    return RedirectResponse(back + "connected", status_code=302)


class SyncOut(BaseModel):
    days_written: int


@router.post("/oura/sync", response_model=SyncOut)
def oura_sync(days: int | None = Query(None, ge=1, le=oura.MAX_DAYS), user: CurrentUser = Depends(get_current_user),
              engine: Engine = Depends(engine_or_503), http: httpx.Client = Depends(get_http),
              now: dt.datetime = Depends(get_now)):
    _oura_ready()
    try:
        return SyncOut(days_written=oura.sync(engine, user.id, http, now, days))
    except oura.NeedsReauth:
        raise HTTPException(status.HTTP_409_CONFLICT, "Reconnect Oura to keep syncing.") from None
    except httpx.HTTPError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Oura didn't respond. Try again shortly.") from None


@router.delete("/oura", status_code=status.HTTP_204_NO_CONTENT)
def oura_disconnect(user: CurrentUser = Depends(get_current_user), engine: Engine = Depends(engine_or_503)):
    with privileged(engine) as conn:
        connections.disconnect(conn, user.id, oura.PROVIDER)


# ── Apple Health (computed on the device from HealthKit) ─────────────────────

class AppleHealthDay(BaseModel):
    model_config = ConfigDict(extra="forbid")
    local_date: dt.date
    sleep_minutes: float | None = None
    hrv_sdnn_ms: float | None = None
    resting_hr: float | None = None


class AppleHealthUpload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    days: list[AppleHealthDay] = Field(max_length=120)


@router.post("/apple-health/days", response_model=SyncOut)
def apple_health_upload(body: AppleHealthUpload, user: CurrentUser = Depends(get_current_user),
                        engine: Engine = Depends(engine_or_503), now: dt.datetime = Depends(get_now)):
    rows = health.normalize_apple([d.model_dump() for d in body.days])
    with privileged(engine) as conn:
        profiles.ensure_profile(conn, user.id)
        written = connections.upsert_health_days(conn, user.id, "apple_health", rows, batch=f"apple-{now:%Y%m%dT%H%M}")
        connections.mark_synced(conn, user.id, "apple_health", now)
    return SyncOut(days_written=written)


# ── Apple Calendar (busy blocks from EventKit) ───────────────────────────────

class CalendarEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    external_id: str = Field(min_length=1, max_length=512)
    calendar_ref: str = Field(min_length=1, max_length=128)  # hashed on the device
    starts_at: dt.datetime
    ends_at: dt.datetime
    all_day: bool = False
    busy: bool = True
    declined: bool = False

    @model_validator(mode="after")
    def _order(self):
        if self.ends_at < self.starts_at or self.starts_at.tzinfo is None:
            raise ValueError("events need aware times and must not end before they start")
        return self


class CalendarUpload(BaseModel):
    """Everything in [range_start, range_end) is replaced by `events` (deleted events disappear)."""
    model_config = ConfigDict(extra="forbid")
    range_start: dt.datetime
    range_end: dt.datetime
    events: list[CalendarEvent] = Field(max_length=2000)

    @model_validator(mode="after")
    def _range(self):
        if self.range_end <= self.range_start or self.range_end - self.range_start > dt.timedelta(days=62):
            raise ValueError("range must be positive and at most 62 days")
        return self


@router.post("/apple-calendar/events", response_model=SyncOut)
def apple_calendar_upload(body: CalendarUpload, user: CurrentUser = Depends(get_current_user),
                          engine: Engine = Depends(engine_or_503), now: dt.datetime = Depends(get_now)):
    with privileged(engine) as conn:
        profiles.ensure_profile(conn, user.id)
        written = connections.replace_calendar_events(
            conn, user.id, "apple_calendar", body.range_start, body.range_end,
            [e.model_dump() for e in body.events if e.ends_at > body.range_start and e.starts_at < body.range_end])
        connections.mark_synced(conn, user.id, "apple_calendar", now)
    return SyncOut(days_written=written)
