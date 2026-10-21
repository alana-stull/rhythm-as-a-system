"""
/insights — how days have gone, kept honest.

Two different things are shown side by side and never mixed:
- Wearable readings (Oura readiness, sleep, HRV, resting heart rate): real
  values for the days they exist. Missing days stay missing.
- Rhythm states: only for days whose own evidence supported an assessment.
  Past days with a check-in or tasks are assessed as of the end of that day
  (pipeline/history.py); days with only wearable data never get a state.

Patterns are deterministic and deliberately sparse (provisional, `patterns-1`):
a weekday where at least 3 of its last 4 occurrences were Strained or
Overloaded. No pattern is better than an invented one.
"""
from __future__ import annotations

import datetime as dt
import uuid
from collections import Counter, defaultdict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Engine, text

from backend.auth import CurrentUser, get_current_user
from backend.db import assessments
from backend.db.scope import engine_or_503, user_scope
from backend.engine.explain import STATE_MEANING, disagreement_sentence
from backend.engine.types import Disagreement, State
from backend.pipeline.clock import get_now
from backend.pipeline.day import day_context, zone
from backend.pipeline.history import MAX_DAYS, fill_history

router = APIRouter()

HEAVY = ("Strained", "Overloaded")
MIN_FOR_PATTERN = 5  # fewer assessed days than this: describe them, don't generalize
WEEKDAYS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"]


class Pattern(BaseModel):
    title: str
    body: str


class TagTime(BaseModel):
    area_id: uuid.UUID
    name: str
    color_family: str | None
    minutes: int


class Reading(BaseModel):
    source: str
    readiness: float | None
    sleep_minutes: int | None
    hrv_ms: float | None
    hrv_method: str | None
    resting_hr: float | None


class RhythmDay(BaseModel):
    status: str                 # assessed | uncertain | insufficient_evidence
    state: str | None
    possible_states: list[str]
    confidence: str | None
    pathway: str


class DayOut(BaseModel):
    date: dt.date
    rhythm: RhythmDay | None    # None: Rhythm never assessed this day
    reading: Reading | None     # None: no wearable reading for this day
    checked_in: bool


class StateCount(BaseModel):
    state: str
    days: int


class Breakdown(BaseModel):
    days_so_far: int            # days in the range up to today
    assessed_days: int          # a Rhythm state was assessed
    uncertain_days: int         # evidence fit more than one state
    reading_only_days: int      # wearable reading, but no Rhythm state
    no_data_days: int           # neither
    states: list[StateCount]    # most frequent first
    summary: str


class InsightsOut(BaseModel):
    days: list[DayOut]
    breakdown: Breakdown
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
    """Time per tag from synced events (calendar default or per-event tag) and Rhythm blocks (their own tag, else their task's)."""
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
        "  select coalesce(p.area_id, t.area_id), greatest(p.starts_at, :s), least(p.ends_at, :e) "
        "  from public.plan_blocks p "
        "  left join public.tasks t on t.user_id = p.user_id and t.id = p.task_id "
        "  where p.user_id = :u and p.starts_at < :e and p.ends_at > :s and p.skipped_at is null) "
        "select a.id as area_id, a.name, a.color_family, "
        "  round(sum(extract(epoch from (sp.b - sp.a)) / 60))::int as minutes "
        "from spans sp join public.areas a on a.user_id = :u and a.id = sp.area_id "
        "group by a.id, a.name, a.color_family order by minutes desc"),
        {"u": user_id, "s": start, "e": end}).mappings()]


def _readings(conn, user_id: uuid.UUID, start: dt.date, end: dt.date, preferred: str | None) -> dict[dt.date, dict]:
    """One reading per day: the preferred source if set, else Oura, else Apple Health."""
    rows = conn.execute(text(
        "select local_date, source, readiness, sleep_minutes, hrv_ms, hrv_method, resting_hr from public.health_daily "
        "where user_id = :u and local_date between :s and :e"), {"u": user_id, "s": start, "e": end}).mappings()
    rank = {preferred: 0, "oura": 1, "apple_health": 2}
    out: dict[dt.date, dict] = {}
    for r in sorted(rows, key=lambda r: rank.get(r["source"], 9)):
        out.setdefault(r["local_date"], dict(r))
    return out


def summarize(counts: Counter, assessed: int, uncertain: int, reading_only: int, source: str | None) -> str:
    """A short reading of the distribution, using only what was assessed."""
    name = {"oura": "Oura", "apple_health": "Apple Health"}.get(source or "", "wearable")
    if not assessed:
        text_ = "No day in this range had enough evidence for a Rhythm state yet."
        if reading_only:
            text_ += (f" {reading_only} day{'s' if reading_only != 1 else ''} had {name} readings, which show capacity "
                      "but not what the day asked. Check-ins give Rhythm the other half.")
        return text_
    ranked = counts.most_common()
    plural = "s" if assessed != 1 else ""
    if assessed < MIN_FOR_PATTERN:
        listed = ", ".join(f"{k} {st}" for st, k in ranked)
        text_ = (f"Rhythm has assessed {assessed} day{plural} in this range so far ({listed}). "
                 "That's too few to read a pattern yet.")
    elif len(ranked) > 1 and ranked[0][1] == ranked[1][1]:
        tied = [st for st, k in ranked if k == ranked[0][1]]
        names = " and ".join(tied) if len(tied) == 2 else ", ".join(tied[:-1]) + " and " + tied[-1]
        text_ = f"Your {assessed} assessed days were split evenly between {names}, {ranked[0][1]} each."
    else:
        top, n = ranked[0]
        meaning = STATE_MEANING[State(top)]
        text_ = (f"{top} was your most frequent state, on {n} of {assessed} assessed days. "
                 f"On those days, {meaning.replace('they have', 'you had').replace('today asks', 'the day asked')}.")
    if uncertain:
        text_ += f" {uncertain} more day{'s' if uncertain != 1 else ''} could have gone either way."
    if reading_only:
        text_ += f" {reading_only} day{'s' if reading_only != 1 else ''} had only {name} readings and no Rhythm state."
    return text_


@router.get("", response_model=InsightsOut)
def get_insights(start: dt.date, end: dt.date, user: CurrentUser = Depends(get_current_user),
                 engine: Engine = Depends(engine_or_503), now: dt.datetime = Depends(get_now)):
    if end < start or (end - start).days > MAX_DAYS:
        raise HTTPException(422, f"Range must be 1–{MAX_DAYS + 1} days.")
    with user_scope(engine, user.id) as conn:
        prof = conn.execute(text("select timezone, preferred_health_source from public.profiles where id = :u"),
                            {"u": user.id}).mappings().first() or {}
    today = day_context(prof.get("timezone"), now).local_date
    fill_history(engine, user.id, start, end, today)

    with user_scope(engine, user.id) as conn:
        stored = {a["local_date"]: a for a in assessments.assessments_between(conn, user.id, start, end)}
        reads = _readings(conn, user.id, start, end, prof.get("preferred_health_source"))
        checked = set(conn.execute(text("select distinct local_date from public.checkins where user_id = :u "
                                        "and local_date between :s and :e"), {"u": user.id, "s": start, "e": end}).scalars())
        history = assessments.assessments_between(conn, user.id, end - dt.timedelta(days=27), end)
        z = zone(prof.get("timezone"))
        tags = _tag_minutes(conn, user.id, dt.datetime.combine(start, dt.time(), tzinfo=z),
                            dt.datetime.combine(end + dt.timedelta(days=1), dt.time(), tzinfo=z))

    days, counts = [], Counter()
    assessed = uncertain = reading_only = no_data = so_far = 0
    for i in range((end - start).days + 1):
        d = start + dt.timedelta(days=i)
        a, r = stored.get(d), reads.get(d)
        rhythm = RhythmDay(status=a["status"], state=a["state"], possible_states=a["possible_states"],
                           confidence=a["confidence"], pathway=a["pathway"]) if a else None
        days.append(DayOut(date=d, rhythm=rhythm, checked_in=d in checked,
                           reading=Reading(source=r["source"], readiness=r["readiness"], sleep_minutes=r["sleep_minutes"],
                                           hrv_ms=r["hrv_ms"], hrv_method=r["hrv_method"], resting_hr=r["resting_hr"])
                           if r else None))
        if d > today:
            continue
        so_far += 1
        if a and a["status"] == "assessed":
            assessed += 1
            counts[a["state"]] += 1
        elif a and a["status"] == "uncertain":
            uncertain += 1
        elif r:
            reading_only += 1
        else:
            no_data += 1

    breakdown = Breakdown(
        days_so_far=so_far, assessed_days=assessed, uncertain_days=uncertain, reading_only_days=reading_only,
        no_data_days=no_data, states=[StateCount(state=s, days=n) for s, n in counts.most_common()],
        summary=summarize(counts, assessed, uncertain, reading_only,
                          prof.get("preferred_health_source") or next((r["source"] for r in reads.values()), None)))
    return InsightsOut(days=days, breakdown=breakdown, patterns=weekday_patterns(history, end),
                       where_time_went=[t for t in tags if t["minutes"] > 0])


# ── One day, in detail ────────────────────────────────────────────────────────

class CheckinOut(BaseModel):
    recorded_at: dt.datetime
    energy: str | None
    rested: str | None
    perceived_demand: str | None
    context_tags: list[str]


class DayDetailOut(BaseModel):
    date: dt.date
    rhythm: RhythmDay | None
    basis: str | None
    evidence: list[str]         # real, labelled facts the engine used ("Energy: Okay", "3h scheduled")
    disagreements: list[str]
    interpretation: str | None  # the day's "why" sentence, when one was produced
    reading: Reading | None
    checkins: list[CheckinOut]
    calendar: str | None        # what the calendar said that day, or None if no calendar evidence


_BASIS = {"none": "No check-in or connected data", "self_reported": "Based on your check-in",
          "connected": "Based on your connected data", "hybrid": "Based on your check-in and connected data"}


@router.get("/days/{day}", response_model=DayDetailOut)
def get_day(day: dt.date, user: CurrentUser = Depends(get_current_user), engine: Engine = Depends(engine_or_503)):
    with user_scope(engine, user.id) as conn:
        pref = conn.execute(text("select preferred_health_source from public.profiles where id = :u"),
                            {"u": user.id}).scalar()
        row = conn.execute(text(
            "select id, status, state, possible_states, confidence, pathway, capacity, demand "
            "from public.daily_assessments where user_id = :u and local_date = :d"), {"u": user.id, "d": day}).mappings().first()
        why = conn.execute(text(
            "select body from public.interpretations where user_id = :u and assessment_id = :a "
            "and purpose = 'capacity_context' order by created_at desc limit 1"),
            {"u": user.id, "a": row["id"]}).scalar() if row else None
        reading = _readings(conn, user.id, day, day, pref).get(day)
        checkins = [dict(r) for r in conn.execute(text(
            "select recorded_at, energy, rested, perceived_demand, context_tags from public.checkins "
            "where user_id = :u and local_date = :d order by recorded_at"), {"u": user.id, "d": day}).mappings()]
    if row is None and reading is None and not checkins:
        raise HTTPException(404, "Nothing was recorded for this day.")

    evidence, disagreements, calendar = [], [], None
    if row:
        used = [e for part in (row["capacity"], row["demand"]) for e in part.get("evidence", []) if e.get("used")]
        evidence = [e["display"] for e in used]
        calendar = next((e["display"] for e in used if e.get("kind") == "calendar_demand"), None)
        disagreements = [disagreement_sentence(Disagreement(**d)) for d in
                         (row["capacity"].get("disagreement"), row["demand"].get("disagreement")) if d]
    return DayDetailOut(
        date=day,
        rhythm=RhythmDay(status=row["status"], state=row["state"], possible_states=row["possible_states"],
                         confidence=row["confidence"], pathway=row["pathway"]) if row else None,
        basis=_BASIS[row["pathway"]] if row else None, evidence=evidence, disagreements=disagreements,
        interpretation=why, calendar=calendar,
        reading=Reading(source=reading["source"], readiness=reading["readiness"], sleep_minutes=reading["sleep_minutes"],
                        hrv_ms=reading["hrv_ms"], hrv_method=reading["hrv_method"], resting_hr=reading["resting_hr"])
        if reading else None,
        checkins=checkins)
