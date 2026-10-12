"""
Oura per user: OAuth, token refresh, backfill and sync into health_daily.

The HTTP client is injectable so tests never call Oura. Refresh tokens are
single-use at Oura, so a refreshed pair is saved before anything else.
"""
from __future__ import annotations

import datetime as dt
import uuid
from urllib.parse import urlencode

import httpx
from sqlalchemy import Engine

from backend.config import settings
from backend.db import connections
from backend.db.scope import privileged
from backend.integrations import health, secrets

AUTH_URL = "https://cloud.ouraring.com/oauth/authorize"
TOKEN_URL = "https://api.ouraring.com/oauth/token"
API = "https://api.ouraring.com/v2/usercollection"
SCOPES = ["daily"]  # readiness + sleep; nothing more
PROVIDER = "oura"
MAX_DAYS = 90


class OuraNotConfigured(RuntimeError):
    pass


class NeedsReauth(RuntimeError):
    pass


def _require_config() -> None:
    if not (settings.oura_client_id and settings.oura_client_secret):
        raise OuraNotConfigured("OURA_CLIENT_ID / OURA_CLIENT_SECRET are not set")
    secrets._fernet()  # raises NotConfigured without a valid key
    secrets._key()


def authorize_url(user_id: uuid.UUID) -> str:
    _require_config()
    return AUTH_URL + "?" + urlencode({
        "response_type": "code", "client_id": settings.oura_client_id,
        "redirect_uri": settings.oura_v2_redirect_uri, "scope": " ".join(SCOPES),
        "state": secrets.sign_state(user_id, PROVIDER),
    })


def _expiry(tokens: dict, now: dt.datetime) -> dt.datetime | None:
    seconds = tokens.get("expires_in")
    return now + dt.timedelta(seconds=int(seconds)) if seconds else None


def _store(engine: Engine, user_id: uuid.UUID, tokens: dict, now: dt.datetime) -> str:
    access = tokens.get("access_token")
    if not access:
        raise NeedsReauth("token response had no access token")
    with privileged(engine) as conn:
        connections.save_tokens(conn, user_id, PROVIDER, access_enc=secrets.encrypt(access),
                                refresh_enc=secrets.encrypt(tokens.get("refresh_token")),
                                expires_at=_expiry(tokens, now), scopes=SCOPES)
    return access


def exchange_code(engine: Engine, user_id: uuid.UUID, code: str, http: httpx.Client, now: dt.datetime) -> None:
    _require_config()
    resp = http.post(TOKEN_URL, data={
        "grant_type": "authorization_code", "code": code, "redirect_uri": settings.oura_v2_redirect_uri,
        "client_id": settings.oura_client_id, "client_secret": settings.oura_client_secret})
    if resp.status_code >= 400:
        raise NeedsReauth(f"code exchange failed ({resp.status_code})")
    _store(engine, user_id, resp.json(), now)


def _access_token(engine: Engine, user_id: uuid.UUID, http: httpx.Client, now: dt.datetime) -> str:
    with privileged(engine) as conn:
        row = connections.get_connection(conn, user_id, PROVIDER)
    if row is None or row["status"] == "revoked" or not row["access_token_enc"]:
        raise NeedsReauth("not connected")
    if row["token_expires_at"] is None or row["token_expires_at"] > now + dt.timedelta(minutes=5):
        return secrets.decrypt(row["access_token_enc"])
    refresh = secrets.decrypt(row["refresh_token_enc"])
    if not refresh:
        raise NeedsReauth("token expired and no refresh token")
    resp = http.post(TOKEN_URL, data={"grant_type": "refresh_token", "refresh_token": refresh,
                                      "client_id": settings.oura_client_id, "client_secret": settings.oura_client_secret})
    if resp.status_code >= 400:
        raise NeedsReauth(f"refresh failed ({resp.status_code})")
    return _store(engine, user_id, resp.json(), now)


def _fetch(http: httpx.Client, token: str, path: str, start: dt.date, end: dt.date) -> list[dict]:
    docs, params = [], {"start_date": start.isoformat(), "end_date": end.isoformat()}
    while True:
        resp = http.get(f"{API}/{path}", params=params, headers={"Authorization": f"Bearer {token}"})
        if resp.status_code == 401:
            raise NeedsReauth("Oura rejected the token")
        resp.raise_for_status()
        body = resp.json()
        docs += body.get("data", [])
        if not body.get("next_token"):
            return docs
        params = {**params, "next_token": body["next_token"]}


def sync(engine: Engine, user_id: uuid.UUID, http: httpx.Client, now: dt.datetime, days: int | None = None) -> int:
    """Fetch and upsert the last `days` days (backfill on first sync). Returns days written."""
    _require_config()
    with privileged(engine) as conn:
        last = connections.latest_health_day(conn, user_id, PROVIDER)
    today = now.date()
    if days is None:
        # First sync backfills; later syncs re-read a few days so late-arriving data is picked up.
        days = settings.oura_backfill_days if last is None else max(3, min((today - last).days + 2, MAX_DAYS))
    days = max(1, min(days, MAX_DAYS))
    start, end = today - dt.timedelta(days=days), today + dt.timedelta(days=1)
    try:
        token = _access_token(engine, user_id, http, now)
        rows = health.normalize_oura(_fetch(http, token, "daily_readiness", start, end),
                                     _fetch(http, token, "sleep", start, end))
    except NeedsReauth as exc:
        with privileged(engine) as conn:
            connections.mark(conn, user_id, PROVIDER, status="needs_reauth", error=str(exc))
        raise
    except httpx.HTTPError as exc:
        with privileged(engine) as conn:
            connections.mark(conn, user_id, PROVIDER, status="error", error=f"Oura sync failed: {type(exc).__name__}")
        raise
    with privileged(engine) as conn:
        written = connections.upsert_health_days(conn, user_id, PROVIDER, rows, batch=f"oura-{now:%Y%m%dT%H%M}")
        connections.mark(conn, user_id, PROVIDER, status="active", synced_at=now)
    return written
