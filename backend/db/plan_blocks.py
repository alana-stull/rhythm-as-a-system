"""Rhythm's own timeline layer (never written to external calendars)."""
from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from sqlalchemy import Connection, text


def blocks_between(conn: Connection, user_id: uuid.UUID, start: dt.datetime, end: dt.datetime) -> list[dict[str, Any]]:
    return [dict(r) for r in conn.execute(text(
        "select id, kind, task_id, recurring_item_id, title, starts_at, ends_at, origin, completed_at, skipped_at "
        "from public.plan_blocks where user_id = :u and starts_at < :e and ends_at > :s "
        "and skipped_at is null order by starts_at"), {"u": user_id, "s": start, "e": end}).mappings()]


def external_events_between(conn: Connection, user_id: uuid.UUID, start: dt.datetime,
                            end: dt.datetime) -> list[dict[str, Any]]:
    """Synced events for display. Titles are only present if the person opted in to syncing them."""
    return [dict(r) for r in conn.execute(text(
        "select e.id, e.source, e.external_id, e.calendar_ref, e.title, e.starts_at, e.ends_at, e.all_day, "
        "  coalesce(o.area_id, s.default_area_id) as area_id, "
        "  coalesce(o.treatment, s.treatment, 'counts') as treatment "
        "from public.external_events e "
        "left join public.calendar_settings s on s.user_id = e.user_id and s.source = e.source "
        "  and s.calendar_ref = e.calendar_ref "
        "left join public.event_overrides o on o.user_id = e.user_id and o.source = e.source "
        "  and o.external_id = e.external_id "
        "where e.user_id = :u and e.starts_at < :end and e.ends_at > :start and not e.declined "
        "and coalesce(s.included, true) order by e.starts_at"
    ), {"u": user_id, "start": start, "end": end}).mappings()]
