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
REVOKE_URL = "https://api.ouraring.com/oauth/revoke"
API = "https://api.ouraring.com/v2/usercollection"
SCOPES = ["daily"]  # readiness + sleep; nothing more
PROVIDER = "oura"
MAX_DAYS = 90


def redirect_uri() -> str:
    """The callback Oura sends the browser to; authorize and code exchange must use the same one."""
    return settings.oura_v2_redirect_uri or settings.oura_redirect_uri


def http_client():
    """FastAPI dependency (overridden in tests)."""
    with httpx.Client(timeout=15) as client:
        yield client


class OuraNotConfigured(RuntimeError):
    pass


class NeedsReauth(RuntimeError):
    """Oura genuinely refused (rejected refresh token, no tokens): only the person can fix it."""


class NotConnected(NeedsReauth):
    """Nothing to sync (never connected, or turned off). Leaves the connection's status alone."""


class TokenRejected(RuntimeError):
    """The API refused an access token that hadn't expired yet; worth one forced refresh."""


# Refresh responses that mean the refresh token itself is dead. Anything else
# (429, 5xx, network) is temporary: the connection is kept and retried later.
_DEAD_REFRESH = {400, 401, 403}


def _require_config() -> None:
    if not (settings.oura_client_id and settings.oura_client_secret):
        raise OuraNotConfigured("OURA_CLIENT_ID / OURA_CLIENT_SECRET are not set")
    # In production the redirect must be this server's public https callback. The local default
    # (http://localhost:8000/oura/callback) would send the person's browser to their own phone.
    if settings.environment == "production" and not redirect_uri().startswith("https://"):
        raise OuraNotConfigured("OURA_REDIRECT_URI must be this server's https /oura/callback in production")
    secrets._fernet()  # raises NotConfigured without a valid key
    secrets._key()


def authorize_url(user_id: uuid.UUID) -> str:
    _require_config()
    return AUTH_URL + "?" + urlencode({
        "response_type": "code", "client_id": settings.oura_client_id,
        "redirect_uri": redirect_uri(), "scope": " ".join(SCOPES),
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
        "grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri(),
        "client_id": settings.oura_client_id, "client_secret": settings.oura_client_secret})
    if resp.status_code >= 400:
        raise NeedsReauth(f"code exchange failed ({resp.status_code})")
    _store(engine, user_id, resp.json(), now)


def _access_token(engine: Engine, user_id: uuid.UUID, http: httpx.Client, now: dt.datetime,
                  force_refresh: bool = False) -> str:
    """A usable access token, refreshing it if it's (nearly) expired. The row is locked while refreshing:
    Oura's refresh tokens are single-use, so two concurrent syncs must not both spend the same one."""
    with privileged(engine) as conn:
        row = connections.lock_connection(conn, user_id, PROVIDER)
        if row is None or row["status"] == "revoked" or not row["access_token_enc"]:
            raise NotConnected("not connected")
        fresh = row["token_expires_at"] is None or row["token_expires_at"] > now + dt.timedelta(minutes=5)
        if fresh and not force_refresh:
            return secrets.decrypt(row["access_token_enc"])
        refresh = secrets.decrypt(row["refresh_token_enc"])
        if not refresh:
            raise NeedsReauth("token expired and no refresh token")
        resp = http.post(TOKEN_URL, data={"grant_type": "refresh_token", "refresh_token": refresh,
                                          "client_id": settings.oura_client_id,
                                          "client_secret": settings.oura_client_secret})
        if resp.status_code in _DEAD_REFRESH:
            raise NeedsReauth(f"refresh rejected ({resp.status_code})")
        resp.raise_for_status()  # temporary: surfaces as httpx.HTTPError, the connection stays
        tokens = resp.json()
        if not tokens.get("access_token"):
            raise NeedsReauth("token response had no access token")
        connections.save_tokens(conn, user_id, PROVIDER, access_enc=secrets.encrypt(tokens["access_token"]),
                                refresh_enc=secrets.encrypt(tokens.get("refresh_token")),
                                expires_at=_expiry(tokens, now), scopes=SCOPES)
        return tokens["access_token"]


def _fetch(http: httpx.Client, token: str, path: str, start: dt.date, end: dt.date) -> list[dict]:
    docs, params = [], {"start_date": start.isoformat(), "end_date": end.isoformat()}
    while True:
        resp = http.get(f"{API}/{path}", params=params, headers={"Authorization": f"Bearer {token}"})
        if resp.status_code == 401:
            raise TokenRejected("Oura rejected the access token")
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

    def fetch(token: str) -> list[dict]:
        return health.normalize_oura(_fetch(http, token, "daily_readiness", start, end),
                                     _fetch(http, token, "sleep", start, end))

    try:
        try:
            rows = fetch(_access_token(engine, user_id, http, now))
        except TokenRejected:
            # Tokens can be invalidated before their expiry: refresh once before asking the person to reconnect.
            try:
                rows = fetch(_access_token(engine, user_id, http, now, force_refresh=True))
            except TokenRejected as exc:
                raise NeedsReauth(str(exc)) from exc
    except NotConnected:
        raise
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


def handle_callback(state: str, code: str | None, error: str | None, engine: Engine | None,
                    http: httpx.Client, now: dt.datetime) -> str:
    """Finish a per-user connection; returns the app URL to send the browser back to.

    The signed state is what identifies the person (this is an unauthenticated
    browser redirect). Any failure ends in a status the app can show.
    """
    back = f"{settings.app_return_url}?provider=oura&status="
    try:
        user_id = secrets.verify_state(state, PROVIDER)
    except (secrets.BadState, secrets.NotConfigured):
        return back + "error"
    if error or not code:
        return back + "cancelled"
    if engine is None:
        return back + "error"
    try:
        exchange_code(engine, user_id, code, http, now)
    except (NeedsReauth, httpx.HTTPError, OuraNotConfigured, secrets.NotConfigured):
        return back + "error"
    return back + "connected"


def revoke_at_oura(engine: Engine, user_id: uuid.UUID, http: httpx.Client) -> bool:
    """Ask Oura to revoke Rhythm's access (account deletion). Best effort: True if Oura confirmed. Rhythm's own
    copies of the tokens are deleted with the account either way, so they can never be used again."""
    with privileged(engine) as conn:
        row = connections.get_connection(conn, user_id, PROVIDER)
    if not (row and row["access_token_enc"]):
        return True
    try:
        token = secrets.decrypt(row["access_token_enc"])
        return bool(token) and http.get(REVOKE_URL, params={"access_token": token}).status_code < 400
    except (httpx.HTTPError, secrets.NotConfigured):
        return False

