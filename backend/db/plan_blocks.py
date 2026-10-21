"""Rhythm's own timeline layer (never written to external calendars)."""
from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from sqlalchemy import Connection, text


def blocks_between(conn: Connection, user_id: uuid.UUID, start: dt.datetime, end: dt.datetime) -> list[dict[str, Any]]:
    return [dict(r) for r in conn.execute(text(
        # A block scheduled from a task has no title of its own; it shows the task's.
        "select b.id, b.kind, b.task_id, b.recurring_item_id, coalesce(b.title, t.title) as title, b.area_id, b.starts_at, "
        "  b.ends_at, b.origin, b.completed_at, b.skipped_at "
        "from public.plan_blocks b left join public.tasks t on t.user_id = b.user_id and t.id = b.task_id "
        "where b.user_id = :u and b.starts_at < :e and b.ends_at > :s "
        "and b.skipped_at is null order by b.starts_at"), {"u": user_id, "s": start, "e": end}).mappings()]


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
        "and coalesce(s.included, true) "
        # One calendar source at a time, so the same meeting synced from Apple and Google never shows twice:
        # the most recently synced source (connections is backend-only, so its own sync times decide).
        "and e.source = (select x.source from public.external_events x where x.user_id = :u "
        "  order by x.synced_at desc limit 1) "
        "order by e.starts_at"
    ), {"u": user_id, "start": start, "end": end}).mappings()]
