"""
Sign in with Apple, server side: only what account deletion needs.

Apple requires apps that offer Sign in with Apple to revoke the person's tokens
when they delete their account. The app re-authenticates with Apple and sends
a fresh, single-use authorization code; this module exchanges it for tokens
(proving which Apple account it is) and revokes them. The private key never
leaves the backend.
"""
from __future__ import annotations

import time

import httpx
import jwt

from backend.config import settings

TOKEN_URL = "https://appleid.apple.com/auth/token"
REVOKE_URL = "https://appleid.apple.com/auth/revoke"
ISSUER = "https://appleid.apple.com"


class AppleNotConfigured(RuntimeError):
    pass


class AppleRejected(RuntimeError):
    """The authorization code was invalid, expired or already used."""


def configured() -> bool:
    return bool(settings.apple_team_id and settings.apple_key_id and settings.apple_private_key and settings.apple_client_id)


def _client_secret(now: float | None = None) -> str:
    if not configured():
        raise AppleNotConfigured("APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY are not set")
    now = int(now or time.time())
    key = settings.apple_private_key.replace("\\n", "\n")
    return jwt.encode({"iss": settings.apple_team_id, "iat": now, "exp": now + 300, "aud": ISSUER,
                       "sub": settings.apple_client_id}, key, algorithm="ES256",
                      headers={"kid": settings.apple_key_id})


def redeem(http: httpx.Client, code: str) -> tuple[str, str]:
    """Exchange a fresh authorization code. Returns (apple user ID, refresh token). Raises AppleRejected."""
    resp = http.post(TOKEN_URL, data={"client_id": settings.apple_client_id, "client_secret": _client_secret(),
                                      "code": code, "grant_type": "authorization_code"})
    if resp.status_code == 400:
        raise AppleRejected(resp.json().get("error", "invalid_grant") if resp.content else "invalid_grant")
    resp.raise_for_status()
    body = resp.json()
    # Received directly from Apple over TLS in exchange for our client secret, so its claims can be read without
    # re-verifying the signature; audience and issuer are still checked.
    claims = jwt.decode(body["id_token"], options={"verify_signature": False})
    if claims.get("aud") != settings.apple_client_id or claims.get("iss") != ISSUER or not claims.get("sub"):
        raise AppleRejected("token was not issued to this app")
    return claims["sub"], body.get("refresh_token") or body["access_token"]


def revoke(http: httpx.Client, token: str) -> None:
    hint = "refresh_token"
    resp = http.post(REVOKE_URL, data={"client_id": settings.apple_client_id, "client_secret": _client_secret(),
                                       "token": token, "token_type_hint": hint})
    resp.raise_for_status()
