"""
/insights — how days have gone, from stored assessments only.

Nothing is reconstructed for days Rhythm never assessed: those show as
"no read". The state is the headline; evidence and numbers are secondary
and only ever real (a labelled readiness value, scheduled time, task counts).

Patterns are deterministic and deliberately sparse (provisional, `patterns-1`):
a weekday where at least 3 of its last 4 occurrences were Strained or
Overloaded. No pattern is better than an invented one.
"""
from __future__ import annotations

import datetime as dt
import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Engine, text

from backend.auth import CurrentUser, get_current_user
from backend.db import assessments
from backend.db.scope import engine_or_503, user_scope
from backend.engine.explain import disagreement_sentence
from backend.engine.types import Disagreement
from backend.pipeline.day import zone

router = APIRouter()

HEAVY = ("Strained", "Overloaded")
WEEKDAYS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"]


class DayOut(BaseModel):
    date: dt.date
    status: str
    state: str | None
    confidence: str | None
    pathway: str


class Pattern(BaseModel):
    title: str
    body: str


class TagTime(BaseModel):
    area_id: uuid.UUID
    name: str
    color_family: str | None
    minutes: int


class InsightsOut(BaseModel):
    days: list[DayOut]
    patterns: list[Pattern]
    where_time_went: list[TagTime]


def weekday_patterns(history: list[dict], end: dt.date) -> list[Pattern]:
    by_weekday: dict[int, list[str | None]] = defaultdict(list)
    for a in sorted(history, key=lambda a: a["local_date"], reverse=True):
        wd = a["local_date"].weekday()
        if len(by_weekday[wd]) < 4 and a["status"] == "assessed":
            by_weekday[wd].append(a["state"])
    out = []
    for wd, states in sorted(by_weekday.items()):
        heavy = sum(s in HEAVY for s in states)
        if len(states) >= 4 and heavy >= 3:
            out.append(Pattern(title=f"Strain clusters on {WEEKDAYS[wd]}",
                               body=f"{heavy} of the last 4 {WEEKDAYS[wd]} were Strained or Overloaded."))
    return out


def _tag_minutes(conn, user_id: uuid.UUID, start: dt.datetime, end: dt.datetime) -> list[dict]:
    """Time per tag from synced events (calendar default or per-event tag) and Rhythm blocks (via their task)."""
    return [dict(r) for r in conn.execute(text(
        "with spans as ("
        "  select coalesce(o.area_id, s.default_area_id) as area_id, "
        "         greatest(e.starts_at, :s) as a, least(e.ends_at, :e) as b "
        "  from public.external_events e "
        "  left join public.calendar_settings s on s.user_id = e.user_id and s.source = e.source "
        "    and s.calendar_ref = e.calendar_ref "
        "  left join public.event_overrides o on o.user_id = e.user_id and o.source = e.source "
        "    and o.external_id = e.external_id "
        "  where e.user_id = :u and not e.all_day and not e.declined and e.starts_at < :e and e.ends_at > :s "
        "  union all "
        "  select t.area_id, greatest(p.starts_at, :s), least(p.ends_at, :e) from public.plan_blocks p "
        "  join public.tasks t on t.user_id = p.user_id and t.id = p.task_id "
        "  where p.user_id = :u and p.starts_at < :e and p.ends_at > :s and p.skipped_at is null) "
        "select a.id as area_id, a.name, a.color_family, "
        "  round(sum(extract(epoch from (sp.b - sp.a)) / 60))::int as minutes "
        "from spans sp join public.areas a on a.user_id = :u and a.id = sp.area_id "
        "group by a.id, a.name, a.color_family order by minutes desc"),
        {"u": user_id, "s": start, "e": end}).mappings()]


@router.get("", response_model=InsightsOut)
def get_insights(start: dt.date, end: dt.date, user: CurrentUser = Depends(get_current_user),
                 engine: Engine = Depends(engine_or_503)):
    if end < start or (end - start).days > 62:
        raise HTTPException(422, "Range must be 1–63 days.")
    with user_scope(engine, user.id) as conn:
        days = assessments.assessments_between(conn, user.id, start, end)
        history = assessments.assessments_between(conn, user.id, end - dt.timedelta(days=27), end)
        tz = conn.execute(text("select timezone from public.profiles where id = :u"), {"u": user.id}).scalar() or "UTC"
        z = zone(tz)
        tags = _tag_minutes(conn, user.id, dt.datetime.combine(start, dt.time(), tzinfo=z),
                            dt.datetime.combine(end + dt.timedelta(days=1), dt.time(), tzinfo=z))
    return InsightsOut(days=[DayOut(date=d["local_date"], **{k: d[k] for k in ("status", "state", "confidence", "pathway")})
                             for d in days], patterns=weekday_patterns(history, end),
                       where_time_went=[t for t in tags if t["minutes"] > 0])


# ── One day, in detail ────────────────────────────────────────────────────────

class DayDetailOut(BaseModel):
    date: dt.date
    status: str
    state: str | None
    possible_states: list[str]
    confidence: str | None
    pathway: str
    basis: str
    evidence: list[str]        # real, labelled facts ("Energy: Okay", "Oura readiness 62", "3h scheduled")
    disagreements: list[str]
    interpretation: str | None


_BASIS = {"none": "No check-in or connected data", "self_reported": "Based on your check-in",
          "connected": "Based on your connected data", "hybrid": "Based on your check-in and connected data"}


@router.get("/days/{day}", response_model=DayDetailOut)
def get_day(day: dt.date, user: CurrentUser = Depends(get_current_user), engine: Engine = Depends(engine_or_503)):
    with user_scope(engine, user.id) as conn:
        row = conn.execute(text(
            "select id, local_date, status, state, possible_states, confidence, pathway, capacity, demand "
            "from public.daily_assessments where user_id = :u and local_date = :d"), {"u": user.id, "d": day}).mappings().first()
        if row is None:
            raise HTTPException(404, "Rhythm didn't read this day.")
        why = conn.execute(text(
            "select body from public.interpretations where user_id = :u and assessment_id = :a "
            "and purpose = 'capacity_context' order by created_at desc limit 1"), {"u": user.id, "a": row["id"]}).scalar()
    evidence = [e["display"] for part in (row["capacity"], row["demand"]) for e in part.get("evidence", []) if e.get("used")]
    disagreements = [disagreement_sentence(Disagreement(**d)) for d in
                     (row["capacity"].get("disagreement"), row["demand"].get("disagreement")) if d]
    return DayDetailOut(date=row["local_date"], status=row["status"], state=row["state"],
                        possible_states=row["possible_states"], confidence=row["confidence"], pathway=row["pathway"],
                        basis=_BASIS[row["pathway"]], evidence=evidence, disagreements=disagreements, interpretation=why)
