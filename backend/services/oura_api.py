"""
Oura Ring API v2 — OAuth 2.0 helpers and data fetching.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx

logger = logging.getLogger(__name__)

OURA_AUTH_URL = "https://cloud.ouraring.com/oauth/authorize"
OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token"
OURA_API_BASE = "https://api.ouraring.com/v2/usercollection"


def build_auth_url(client_id: str, redirect_uri: str) -> str:
    params = urlencode({
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": "daily personal",
    })
    return f"{OURA_AUTH_URL}?{params}"


async def exchange_code(
    code: str,
    client_id: str,
    client_secret: str,
    redirect_uri: str,
) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            OURA_TOKEN_URL,
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
            OURA_TOKEN_URL,
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


async def fetch_daily_readiness(
    access_token: str,
    start_date: str,
    end_date: str,
) -> list[dict]:
    """Returns list of daily readiness records for the date range."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{OURA_API_BASE}/daily_readiness",
            params={"start_date": start_date, "end_date": end_date},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json().get("data", [])


async def fetch_daily_sleep(
    access_token: str,
    start_date: str,
    end_date: str,
) -> list[dict]:
    """Returns list of daily sleep records for the date range."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{OURA_API_BASE}/daily_sleep",
            params={"start_date": start_date, "end_date": end_date},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json().get("data", [])
