from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy import Connection, text

COLUMNS = ("id", "display_name", "tone", "timezone", "tracker_choice", "onboarding_step",
           "onboarding_completed_at", "onboarding_answers", "preferred_health_source",
           "ai_task_titles_consented_at", "created_at", "updated_at")
EDITABLE = ("display_name", "tone", "timezone", "tracker_choice", "onboarding_step", "onboarding_completed_at",
            "onboarding_answers", "preferred_health_source", "ai_task_titles_consented_at")
JSONB = ("onboarding_answers",)
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
    # column names from EDITABLE only; jsonb values are sent as JSON text
    assignments = ", ".join(
        f"{col} = cast(:{col} as jsonb)" if col in JSONB else f"{col} = :{col}" for col in values)
    params = {k: (json.dumps(v) if k in JSONB else v) for k, v in values.items()}
    row = conn.execute(
        text(f"update public.profiles set {assignments} where id = :id returning {_SELECT}"),
        {**params, "id": user_id},
    ).mappings().first()
    return dict(row) if row else None
