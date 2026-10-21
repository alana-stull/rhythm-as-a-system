"""
Supabase Auth admin API, backend-only (service-role key): reading a person's
sign-in identities and deleting their sign-in account. Used only by account
deletion. The key never leaves the backend.
"""
from __future__ import annotations

import uuid

import httpx

from backend.config import settings


class AdminNotConfigured(RuntimeError):
    pass


def configured() -> bool:
    return bool(settings.supabase_url and settings.supabase_service_role_key)


def _req(http: httpx.Client, method: str, user_id: uuid.UUID) -> httpx.Response:
    if not configured():
        raise AdminNotConfigured("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set")
    key = settings.supabase_service_role_key
    return http.request(method, f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}",
                        headers={"apikey": key, "Authorization": f"Bearer {key}"})


def apple_subject(http: httpx.Client, user_id: uuid.UUID) -> str | None:
    """The Apple account ID linked to this person, or None if they never used Sign in with Apple."""
    resp = _req(http, "GET", user_id)
    resp.raise_for_status()
    for ident in resp.json().get("identities") or []:
        if ident.get("provider") == "apple":
            data = ident.get("identity_data") or {}
            return data.get("sub") or data.get("provider_id") or ident.get("provider_id")
    return None


def delete_user(http: httpx.Client, user_id: uuid.UUID) -> None:
    resp = _req(http, "DELETE", user_id)
    if resp.status_code != 404:  # already gone is fine: deletion is retryable
        resp.raise_for_status()
