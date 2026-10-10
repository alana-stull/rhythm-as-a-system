from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import Connection, text

COLUMNS = ("id", "display_name", "tone", "timezone", "tracker_choice", "onboarding_step",
           "onboarding_completed_at", "created_at", "updated_at")
EDITABLE = ("display_name", "tone", "timezone", "tracker_choice", "onboarding_step", "onboarding_completed_at")
_SELECT = ", ".join(COLUMNS)


def ensure_profile(conn: Connection, user_id: uuid.UUID) -> None:
    """Privileged: create the profile if the auth trigger hasn't (idempotent)."""
    conn.execute(text("insert into public.profiles (id) values (:id) on conflict (id) do nothing"), {"id": user_id})


def get_profile(conn: Connection, user_id: uuid.UUID) -> dict[str, Any] | None:
    row = conn.execute(text(f"select {_SELECT} from public.profiles where id = :id"), {"id": user_id}).mappings().first()
    return dict(row) if row else None


def update_profile(conn: Connection, user_id: uuid.UUID, values: dict[str, Any]) -> dict[str, Any] | None:
    unknown = set(values) - set(EDITABLE)
    if unknown:
        raise ValueError(f"not editable: {sorted(unknown)}")
    if not values:
        return get_profile(conn, user_id)
    assignments = ", ".join(f"{col} = :{col}" for col in values)  # column names from EDITABLE only
    row = conn.execute(
        text(f"update public.profiles set {assignments} where id = :id returning {_SELECT}"),
        {**values, "id": user_id},
    ).mappings().first()
    return dict(row) if row else None
