"""
Supabase JWT verification for FastAPI.

- Asymmetric signing keys (ES256/RS256) are verified against the project's
  JWKS at {SUPABASE_URL}/auth/v1/.well-known/jwks.json (fetched lazily, cached).
- The legacy shared HS256 secret is accepted only when SUPABASE_JWT_SECRET is
  set, and the secret is never confused with a public key.
- Required: valid signature, exp, iat, sub (UUID), aud = "authenticated",
  iss = {SUPABASE_URL}/auth/v1, role = "authenticated".
- Anonymous-user tokens are rejected (Rhythm is accounts-first).

Authorization is not done here. Endpoints receive a verified user ID and must
scope every query to it (see backend/db/scope.py).
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Protocol

import jwt
from fastapi import Depends, HTTPException, Request, status

from backend.config import settings

AUDIENCE = "authenticated"
ASYMMETRIC_ALGS = ("ES256", "RS256")


class AuthError(Exception):
    """Token rejected. The message is safe to log but not shown to clients."""


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    email: str | None
    claims: dict[str, Any] = field(repr=False)


class SigningKeySource(Protocol):
    def get_signing_key_from_jwt(self, token: str) -> Any: ...


class TokenVerifier:
    def __init__(self, issuer: str, jwks: SigningKeySource | None = None,
                 hs256_secret: str | None = None, leeway_seconds: int = 30):
        if not issuer:
            raise ValueError("issuer is required")
        self.issuer = issuer
        self.jwks = jwks
        self.hs256_secret = hs256_secret or None
        self.leeway = leeway_seconds

    def verify(self, token: str) -> CurrentUser:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as exc:
            raise AuthError(f"malformed token: {exc}") from exc

        alg = header.get("alg")
        if alg in ASYMMETRIC_ALGS:
            if self.jwks is None:
                raise AuthError("asymmetric token but no JWKS configured")
            try:
                signing_key = self.jwks.get_signing_key_from_jwt(token)
            except jwt.PyJWTError as exc:
                raise AuthError(f"no matching signing key: {exc}") from exc
            key_alg = getattr(signing_key, "algorithm_name", None)
            if key_alg != alg:
                raise AuthError(f"token alg {alg!r} does not match signing key alg {key_alg!r}")
            key = signing_key.key
        elif alg == "HS256" and self.hs256_secret:
            key = self.hs256_secret
        else:
            raise AuthError(f"algorithm not accepted: {alg!r}")

        try:
            claims = jwt.decode(
                token, key, algorithms=[alg], audience=AUDIENCE, issuer=self.issuer,
                leeway=self.leeway, options={"require": ["exp", "iat", "sub", "aud", "iss"]},
            )
        except (jwt.PyJWTError, TypeError, ValueError) as exc:  # key/format mismatches raise TypeError/ValueError
            raise AuthError(f"invalid token: {exc}") from exc

        if claims.get("role") != "authenticated":
            raise AuthError(f"role not accepted: {claims.get('role')!r}")
        if claims.get("is_anonymous") is True:
            raise AuthError("anonymous users are not accepted")
        try:
            user_id = uuid.UUID(str(claims["sub"]))
        except ValueError as exc:
            raise AuthError("sub is not a UUID") from exc
        return CurrentUser(id=user_id, email=claims.get("email"), claims=claims)


@lru_cache(maxsize=1)
def _default_verifier() -> TokenVerifier:
    base = settings.supabase_url.rstrip("/")
    if not base:
        raise RuntimeError("SUPABASE_URL is not configured")
    jwks = jwt.PyJWKClient(f"{base}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=600, timeout=5)
    return TokenVerifier(issuer=f"{base}/auth/v1", jwks=jwks, hs256_secret=settings.supabase_jwt_secret or None)


def get_token_verifier() -> TokenVerifier:
    """FastAPI dependency; tests override it with a verifier using local keys."""
    try:
        return _default_verifier()
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Authentication is not configured.") from exc


_UNAUTHORIZED = HTTPException(
    status.HTTP_401_UNAUTHORIZED, "Not authenticated.", headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(request: Request, verifier: TokenVerifier = Depends(get_token_verifier)) -> CurrentUser:
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _UNAUTHORIZED
    try:
        return verifier.verify(token.strip())
    except AuthError:
        raise _UNAUTHORIZED from None
