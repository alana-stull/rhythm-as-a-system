"""
The pre-Supabase single-user endpoints (/upload, /checkin, /scores, /suggestions,
/lamp, /calendar, and /oura other than the per-user callback). They predate
sign-in and have no authentication, so they're off unless explicitly enabled
for local work on the dashboard or menu bar app. The mobile app never uses them.

Checked per request (not at import), so tests can cover both settings.
"""
from fastapi import HTTPException, status

from backend.config import settings


def legacy_only() -> None:
    if not settings.legacy_endpoints_enabled:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not Found")
