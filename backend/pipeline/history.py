"""
Rhythm states for past days, only where that day's own evidence supports one.

A past day gets an assessment only if the person left Rhythm evidence for that
date (a check-in, or tasks focused on or due that day). The engine then runs
"as of the end of that day". Days with only wearable readings are never given
a Rhythm state: a readiness score says something about capacity, nothing about
what the day asked. Existing assessments are never overwritten.

Limitation: calendar blocks synced after a day has passed are treated as stale
for that day by the engine, so historical states use check-ins, tasks and
wearable data only.
"""
from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import Engine, text

from backend.db import assessments, profiles
from backend.db.day_inputs import load_day_inputs
from backend.db.scope import privileged
from backend.engine import DEFAULT_THRESHOLDS, assess_day
from backend.engine.types import DayContext
from backend.pipeline.day import zone
from backend.pipeline.recompute import _row
from backend.pipeline.serialize import stable_hash

MAX_DAYS = 93


def _days_with_own_evidence(conn, user_id: uuid.UUID, start: dt.date, end: dt.date) -> set[dt.date]:
    return set(conn.execute(text(
        "select local_date from public.checkins where user_id = :u and local_date between :s and :e "
        "union select focus_on from public.tasks where user_id = :u and focus_on between :s and :e "
        "union select due_on from public.tasks where user_id = :u and due_on between :s and :e"
    ), {"u": user_id, "s": start, "e": end}).scalars())


def fill_history(engine: Engine, user_id: uuid.UUID, start: dt.date, end: dt.date, today: dt.date) -> int:
    """Assess past days in [start, end] that have own evidence and no assessment yet. Returns days added."""
    end = min(end, today - dt.timedelta(days=1))
    if end < start or (end - start).days > MAX_DAYS:
        return 0
    added = 0
    with privileged(engine) as conn:
        profile = profiles.get_profile(conn, user_id) or {}
        tz = zone(profile.get("timezone"))
        have = set(conn.execute(text(
            "select local_date from public.daily_assessments where user_id = :u and local_date between :s and :e"
        ), {"u": user_id, "s": start, "e": end}).scalars())
        for day in sorted(_days_with_own_evidence(conn, user_id, start, end) - have):
            day_start = dt.datetime.combine(day, dt.time(), tzinfo=tz)
            day_end = dt.datetime.combine(day + dt.timedelta(days=1), dt.time(), tzinfo=tz)
            ctx = DayContext(local_date=day, day_start=day_start, day_end=day_end,
                             now=day_end - dt.timedelta(microseconds=1))
            inputs = load_day_inputs(conn, user_id, ctx, profile.get("preferred_health_source"))
            a = assess_day(inputs, DEFAULT_THRESHOLDS)
            assessments.upsert_assessment(conn, user_id, _row(a, stable_hash({"history": inputs})))
            added += 1
    return added
