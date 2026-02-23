"""
Google Calendar API — OAuth 2.0 helpers and event fetching.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx

logger = logging.getLogger(__name__)

GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GCAL_API_BASE    = "https://www.googleapis.com/calendar/v3"

SCOPES = "https://www.googleapis.com/auth/calendar.readonly"


def build_auth_url(client_id: str, redirect_uri: str) -> str:
    params = urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",   # request refresh token
        "prompt": "consent",        # always show consent to get refresh token
    })
    return f"{GOOGLE_AUTH_URL}?{params}"


async def exchange_code(
    code: str,
    client_id: str,
    client_secret: str,
    redirect_uri: str,
) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": client_id,
                "client_secret": client_secret,
            },
        )
        resp.raise_for_status()
        return resp.json()


async def refresh_access_token(
    refresh_token: str,
    client_id: str,
    client_secret: str,
) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
            },
        )
        resp.raise_for_status()
        return resp.json()


def token_expires_at(token_data: dict) -> datetime | None:
    expires_in = token_data.get("expires_in")
    if expires_in is None:
        return None
    return datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))


async def fetch_events(
    access_token: str,
    date_str: str,  # "YYYY-MM-DD"
) -> list[dict]:
    """Fetch all events for a single calendar day (primary calendar)."""
    day_start = f"{date_str}T00:00:00Z"
    day_end   = f"{date_str}T23:59:59Z"
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GCAL_API_BASE}/calendars/primary/events",
            params={
                "timeMin": day_start,
                "timeMax": day_end,
                "singleEvents": "true",
                "orderBy": "startTime",
                "maxResults": 100,
            },
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json().get("items", [])


def compute_exposure_from_events(events: list[dict]) -> float:
    """
    Convert calendar events to an exposure score (0-100).

    Logic: sum total event minutes for the day.
    - 0 min  → 0
    - 480 min (8 h) → 100 (capped)
    Declined events and all-day events are excluded.
    """
    total_minutes = 0.0
    for evt in events:
        # Skip declined events
        attendees = evt.get("attendees", [])
        self_status = next(
            (a.get("responseStatus") for a in attendees if a.get("self")),
            None,
        )
        if self_status == "declined":
            continue

        start = evt.get("start", {})
        end   = evt.get("end", {})

        # Skip all-day events (they have "date" not "dateTime")
        if "dateTime" not in start:
            continue

        try:
            t_start = datetime.fromisoformat(start["dateTime"].replace("Z", "+00:00"))
            t_end   = datetime.fromisoformat(end["dateTime"].replace("Z", "+00:00"))
            total_minutes += (t_end - t_start).total_seconds() / 60
        except (ValueError, KeyError):
            continue

    return min(100.0, round((total_minutes / 480) * 100, 1))
