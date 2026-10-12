"""
Load one local day's evidence from Postgres into engine inputs.

What goes in, and what deliberately does not:
- Check-ins for the day (the engine picks the latest answer per question).
- Tasks that could count for the day (focused on or due that day). No titles.
- Calendar blocks only from an active connection that has synced. Calendars
  the person excluded, and events they marked "doesn't count", are dropped
  here; event titles never enter the engine. No connection = no snapshot,
  which the engine treats as "unknown", not "light".
- Wearable days from the last baseline window, from the preferred source if
  the person chose one.

Run inside `privileged()`: `connections` is backend-only. Every query here
filters on the given user ID.
"""
from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import Connection, text

from backend.engine.thresholds import DEFAULT_THRESHOLDS
from backend.engine.types import (
    CalendarBlock,
    CalendarSnapshot,
    CheckIn,
    DayContext,
    DayInputs,
    Effort,
    EnergyLevel,
    PerceivedDemand,
    RestedLevel,
    Task,
    WearableDay,
)

CALENDAR_SOURCES = ("apple_calendar", "google_calendar")


def _checkins(conn: Connection, user_id: uuid.UUID, day: DayContext) -> tuple[CheckIn, ...]:
    rows = conn.execute(text(
        "select id, local_date, recorded_at, energy, perceived_demand, rested, context_tags from public.checkins "
        "where user_id = :u and local_date = :d"), {"u": user_id, "d": day.local_date}).mappings()
    return tuple(CheckIn(
        id=str(r["id"]), local_date=r["local_date"], recorded_at=r["recorded_at"],
        energy=EnergyLevel(r["energy"]) if r["energy"] else None,
        perceived_demand=PerceivedDemand(r["perceived_demand"]) if r["perceived_demand"] else None,
        rested=RestedLevel(r["rested"]) if r["rested"] else None,
        context_tags=frozenset(r["context_tags"] or ()),
    ) for r in rows)


def _tasks(conn: Connection, user_id: uuid.UUID, day: DayContext) -> tuple[Task, ...]:
    rows = conn.execute(text(
        "select id, effort, estimate_minutes, focus_on, due_on, completed_at, let_go_at from public.tasks "
        "where user_id = :u and (focus_on = :d or due_on = :d)"), {"u": user_id, "d": day.local_date}).mappings()
    return tuple(Task(
        id=str(r["id"]), effort=Effort(r["effort"]) if r["effort"] else None,
        estimate_minutes=r["estimate_minutes"], focus_on=r["focus_on"], due_on=r["due_on"],
        completed_at=r["completed_at"], let_go_at=r["let_go_at"],
    ) for r in rows)


def _calendar(conn: Connection, user_id: uuid.UUID, day: DayContext) -> CalendarSnapshot | None:
    conn_row = conn.execute(text(
        "select provider, last_synced_at from public.connections where user_id = :u and provider = any(:p) "
        "and status = 'active' and last_synced_at is not null order by last_synced_at desc limit 1"
    ), {"u": user_id, "p": list(CALENDAR_SOURCES)}).mappings().first()
    if conn_row is None:
        return None
    rows = conn.execute(text(
        "select e.external_id, e.starts_at, e.ends_at, e.all_day, e.busy, e.declined from public.external_events e "
        "left join public.calendar_settings s on s.user_id = e.user_id and s.source = e.source "
        "  and s.calendar_ref = e.calendar_ref "
        "left join public.event_overrides o on o.user_id = e.user_id and o.source = e.source "
        "  and o.external_id = e.external_id "
        "where e.user_id = :u and e.source = :src and e.starts_at < :end and e.ends_at > :start "
        "and coalesce(s.included, true) "
        "and coalesce(o.treatment, s.treatment, 'counts') = 'counts'"
    ), {"u": user_id, "src": conn_row["provider"], "start": day.day_start, "end": day.day_end}).mappings()
    blocks = tuple(CalendarBlock(id=r["external_id"], start=r["starts_at"], end=r["ends_at"], all_day=r["all_day"],
                                 busy=r["busy"], declined=r["declined"]) for r in rows)
    return CalendarSnapshot(source=conn_row["provider"], synced_at=conn_row["last_synced_at"], blocks=blocks)


def _wearable(conn: Connection, user_id: uuid.UUID, day: DayContext, preferred: str | None) -> tuple[WearableDay, ...]:
    since = day.local_date - dt.timedelta(days=DEFAULT_THRESHOLDS.baseline_window_days)
    sql = ("select source, local_date, readiness, sleep_minutes, hrv_ms, hrv_method, resting_hr, id "
           "from public.health_daily where user_id = :u and local_date between :since and :d")
    params = {"u": user_id, "since": since, "d": day.local_date}
    if preferred:
        sql += " and source = :src"
        params["src"] = preferred
    return tuple(WearableDay(
        source=r["source"], local_date=r["local_date"],
        readiness=float(r["readiness"]) if r["readiness"] is not None else None,
        sleep_minutes=float(r["sleep_minutes"]) if r["sleep_minutes"] is not None else None,
        hrv_ms=float(r["hrv_ms"]) if r["hrv_ms"] is not None else None, hrv_method=r["hrv_method"],
        resting_hr=float(r["resting_hr"]) if r["resting_hr"] is not None else None, record_id=str(r["id"]),
    ) for r in conn.execute(text(sql), params).mappings())


def load_day_inputs(conn: Connection, user_id: uuid.UUID, day: DayContext,
                    preferred_health_source: str | None = None) -> DayInputs:
    return DayInputs(
        day=day,
        checkins=_checkins(conn, user_id, day),
        tasks=_tasks(conn, user_id, day),
        calendar=_calendar(conn, user_id, day),
        wearable=_wearable(conn, user_id, day, preferred_health_source),
    )
