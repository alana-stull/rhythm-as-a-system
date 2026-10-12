"""
User-data deletion foundation.

Deletes everything a user owns in Rhythm's tables and clears the personal
fields on their profile. It deliberately does NOT do full account deletion,
which additionally needs (later milestones):
- deleting the Supabase Auth identity (admin API, service credentials);
- revoking provider tokens (Oura, Google) and Sign in with Apple tokens
  before the encrypted copies are removed;
- removing data held outside Postgres (backups, logs, LLM provider retention).
"""
from __future__ import annotations

import uuid

from sqlalchemy import Connection, text

# Children before parents. A test checks this covers every table with user_id.
USER_TABLES = (
    "interpretations", "daily_assessments", "external_events", "health_daily", "connections",
    "llm_usage", "event_overrides", "calendar_settings", "what_helps",
    "checkins", "plan_blocks", "recurring_item_logs", "recurring_items", "tasks", "goals", "areas",
)

_PROFILE_RESET = """
update public.profiles
   set display_name = null, tone = null, tracker_choice = null, onboarding_step = null,
       onboarding_completed_at = null, timezone = 'UTC', onboarding_answers = '{}',
       preferred_health_source = null, ai_task_titles_consented_at = null
 where id = :uid
"""


def delete_user_data(conn: Connection, user_id: uuid.UUID) -> dict[str, int]:
    """Privileged. Every statement is filtered on the given user ID."""
    counts: dict[str, int] = {}
    for table in USER_TABLES:
        result = conn.execute(text(f"delete from public.{table} where user_id = :uid"), {"uid": user_id})
        counts[table] = result.rowcount
    conn.execute(text(_PROFILE_RESET), {"uid": user_id})
    return counts
