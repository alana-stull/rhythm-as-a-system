"""
Provider tokens at rest, and OAuth state.

- Tokens are encrypted with Fernet (AES-128-CBC + HMAC-SHA256) under
  TOKEN_ENCRYPTION_KEY before they reach `connections`. Without the key the
  integration is unavailable (503), never stored in plaintext.
- OAuth `state` binds the browser round trip to the signed-in user: it is
  HMAC-signed with OAUTH_STATE_SECRET, carries the user ID, provider, a nonce
  and an expiry (10 minutes), and is checked in constant time.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
import uuid
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from backend.config import settings

STATE_TTL_SECONDS = 600


class NotConfigured(RuntimeError):
    pass


class BadState(ValueError):
    pass


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    if not settings.token_encryption_key:
        raise NotConfigured("TOKEN_ENCRYPTION_KEY is not set")
    try:
        return Fernet(settings.token_encryption_key.encode())
    except (ValueError, TypeError) as exc:
        raise NotConfigured("TOKEN_ENCRYPTION_KEY is not a valid Fernet key") from exc


def encrypt(value: str | None) -> str | None:
    return None if value is None else _fernet().encrypt(value.encode()).decode()


def decrypt(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise NotConfigured("stored token can't be decrypted with the current key") from exc


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _key() -> bytes:
    if len(settings.oauth_state_secret) < 32:
        raise NotConfigured("OAUTH_STATE_SECRET is not set (32+ characters)")
    return settings.oauth_state_secret.encode()


def sign_state(user_id: uuid.UUID, provider: str, now: float | None = None) -> str:
    body = json.dumps({"u": str(user_id), "p": provider, "n": secrets.token_urlsafe(12),
                       "e": int((now or time.time()) + STATE_TTL_SECONDS)}, separators=(",", ":")).encode()
    sig = hmac.new(_key(), body, hashlib.sha256).digest()
    return f"{_b64(body)}.{_b64(sig)}"


def verify_state(state: str, provider: str, now: float | None = None) -> uuid.UUID:
    try:
        body_s, sig_s = state.split(".", 1)
        body, sig = _unb64(body_s), _unb64(sig_s)
    except (ValueError, TypeError) as exc:
        raise BadState("malformed state") from exc
    if not hmac.compare_digest(hmac.new(_key(), body, hashlib.sha256).digest(), sig):
        raise BadState("bad signature")
    data = json.loads(body)
    if data.get("p") != provider:
        raise BadState("wrong provider")
    if int(data.get("e", 0)) < (now or time.time()):
        raise BadState("expired")
    return uuid.UUID(data["u"])
