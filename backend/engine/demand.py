"""
Demand: what the day is asking.

Three independent kinds of evidence:
- known calendar commitments (only when a calendar is connected and fresh);
- tasks focused on or due today (real estimates; effort points when there is
  an effort level but no estimate; tasks with neither stay visible but add
  nothing numeric; never invented minutes or assumed effort);
- the person's perceived demand from the check-in.

When these don't settle on one band, demand is a range, not a guess.
"""
from __future__ import annotations

import datetime as _dt

from backend.engine._util import fmt_minutes, latest_answer, source_name
from backend.engine.thresholds import Thresholds
from backend.engine.types import (
    PERCEIVED_DEMAND_LABELS,
    CalendarSnapshot,
    Confidence,
    DayInputs,
    DemandAssessment,
    DemandBand,
    Disagreement,
    Effort,
    Evidence,
    EvidenceKind,
    Method,
    PerceivedDemand,
    Task,
    UnusedReason,
    rank,
)

PERCEIVED_TO_BAND: dict[PerceivedDemand, DemandBand] = {
    PerceivedDemand.VERY_LIGHT: DemandBand.LIGHT,
    PerceivedDemand.LIGHT: DemandBand.LIGHT,
    PerceivedDemand.MODERATE: DemandBand.MODERATE,
    PerceivedDemand.HEAVY: DemandBand.HEAVY,
    PerceivedDemand.VERY_HEAVY: DemandBand.HEAVY,
}

_CALENDAR_WORD = {DemandBand.LIGHT: "lightly", DemandBand.MODERATE: "moderately", DemandBand.HEAVY: "heavily"}


def tasks_for_day(tasks: tuple[Task, ...], day: _dt.date) -> list[Task]:
    return [t for t in tasks if t.let_go_at is None and day in (t.focus_on, t.due_on)]


def _weight(effort: Effort, t: Thresholds) -> float:
    return {Effort.LIGHT: t.weight_light, Effort.MODERATE: t.weight_moderate, Effort.DEEP: t.weight_deep}[effort]


def _points(effort: Effort, t: Thresholds) -> int:
    return {Effort.LIGHT: t.points_light, Effort.MODERATE: t.points_moderate, Effort.DEEP: t.points_deep}[effort]


def _minutes_band(weighted: float, t: Thresholds) -> DemandBand:
    if weighted > t.minutes_heavy_above:
        return DemandBand.HEAVY
    if weighted >= t.minutes_moderate_from:
        return DemandBand.MODERATE
    return DemandBand.LIGHT


def _points_band(points: int, t: Thresholds) -> DemandBand:
    if points >= t.points_heavy_from:
        return DemandBand.HEAVY
    if points >= t.points_moderate_from:
        return DemandBand.MODERATE
    return DemandBand.LIGHT


def scheduled_minutes(snapshot: CalendarSnapshot, day_start: _dt.datetime, day_end: _dt.datetime) -> int:
    """Busy, timed, accepted time inside the local day, with overlaps merged."""
    spans = []
    for b in snapshot.blocks:
        if b.all_day or not b.busy or b.declined:
            continue
        start, end = max(b.start, day_start), min(b.end, day_end)
        if end > start:
            spans.append((start, end))
    total = _dt.timedelta()
    cur_start = cur_end = None
    for start, end in sorted(spans):
        if cur_end is None or start > cur_end:
            if cur_end is not None:
                total += cur_end - cur_start
            cur_start, cur_end = start, end
        else:
            cur_end = max(cur_end, end)
    if cur_end is not None:
        total += cur_end - cur_start
    return int(round(total.total_seconds() / 60))


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" + ("" if n == 1 else "s")


def assess_demand(inputs: DayInputs, t: Thresholds) -> tuple[DemandAssessment, list[Evidence]]:
    day = inputs.day
    evidence: list[Evidence] = []
    unused: list[Evidence] = []
    basis: list[EvidenceKind] = []

    # ── Calendar ──
    calendar_used = False
    minutes: int | None = None
    cal = inputs.calendar
    if cal is not None:
        name = source_name(cal.source)
        if day.now - cal.synced_at > _dt.timedelta(hours=t.calendar_max_age_hours) or cal.synced_at > day.now:
            unused.append(Evidence(
                kind=EvidenceKind.CALENDAR_DEMAND, signal="scheduled_minutes", source=cal.source,
                method=Method.SYNCED, observed_for=day.local_date,
                display=f"{name} not synced recently", qualitative=f"{name} not synced recently",
                recorded_at=cal.synced_at, used=False, unused_reason=UnusedReason.STALE,
            ))
        else:
            calendar_used = True
            minutes = scheduled_minutes(cal, day.day_start, day.day_end)
            word = _CALENDAR_WORD[_minutes_band(minutes, t)]
            evidence.append(Evidence(
                kind=EvidenceKind.CALENDAR_DEMAND, signal="scheduled_minutes", source=cal.source,
                method=Method.SYNCED, observed_for=day.local_date,
                display=f"{fmt_minutes(minutes)} scheduled" if minutes else "Nothing scheduled on your calendar",
                qualitative=f"a {word} scheduled calendar" if minutes else "nothing scheduled on the calendar",
                quantity=minutes, unit="minutes", recorded_at=cal.synced_at,
                record_ids=tuple(b.id for b in cal.blocks),
            ))
            basis.append(EvidenceKind.CALENDAR_DEMAND)

    # ── Tasks ──
    todays = tasks_for_day(inputs.tasks, day.local_date)
    sized = [x for x in todays if x.estimate_minutes is not None and x.estimate_minutes > 0]
    sized_ids = {x.id for x in sized}
    unsized = [x for x in todays if x.id not in sized_ids]
    no_effort = [x for x in todays if x.effort is None]
    deep = sum(1 for x in todays if x.effort == Effort.DEEP)
    estimated = sum(x.estimate_minutes for x in sized) if sized else None
    if todays:
        parts = [_plural(len(todays), "task") + " for today" + (f" ({deep} deep)" if deep else "")]
        if estimated:
            parts.append(f"{fmt_minutes(estimated)} estimated")
        if unsized:
            parts.append(f"{len(unsized)} without an estimate")
        if no_effort:
            parts.append(f"{len(no_effort)} without an effort level")
        qualitative = "tasks planned for today" + (", including deep work" if deep else "")
        if unsized or no_effort:
            qualitative += ", some not yet sized"
        evidence.append(Evidence(
            kind=EvidenceKind.TASK_DEMAND, signal="tasks", source="rhythm_tasks",
            method=Method.USER_ENTERED, observed_for=day.local_date,
            display=" · ".join(parts), qualitative=qualitative,
            quantity=len(todays), unit="tasks", record_ids=tuple(x.id for x in todays),
        ))
        basis.append(EvidenceKind.TASK_DEMAND)

    # ── Known demand range (calendar + tasks) ──
    # An empty calendar alone says "nothing scheduled", not "a light day", so
    # minutes only set a band when something actually takes time.
    lows: list[DemandBand] = []
    highs: list[DemandBand] = []
    if minutes or sized:
        fixed = (minutes or 0) + sum(x.estimate_minutes * _weight(x.effort, t) for x in sized if x.effort)
        unknown = sum(x.estimate_minutes for x in sized if x.effort is None)
        lows.append(_minutes_band(fixed + unknown * t.weight_light, t))
        highs.append(_minutes_band(fixed + unknown * t.weight_deep, t))
    sized_by_effort_only = [x for x in unsized if x.effort is not None]
    if sized_by_effort_only:
        pband = _points_band(sum(_points(x.effort, t) for x in sized_by_effort_only), t)
        lows.append(pband)
        highs.append(pband)
    known_range = (max(lows, key=rank), max(highs, key=rank)) if lows else None
    unquantified = any(x.effort is None and x.id not in sized_ids for x in todays)
    if known_range is None:
        known_conf = None
    elif calendar_used and known_range[0] == known_range[1] and not unquantified:
        known_conf = Confidence.MEDIUM
    else:
        known_conf = Confidence.LOW  # tasks alone, unknown effort, or tasks we can't size

    # ── Perceived demand ──
    checkin = latest_answer(inputs.checkins, day, "perceived_demand")
    reported = None
    if checkin is not None:
        reported = PERCEIVED_TO_BAND[checkin.perceived_demand]
        label = PERCEIVED_DEMAND_LABELS[checkin.perceived_demand]
        evidence.append(Evidence(
            kind=EvidenceKind.SELF_REPORT, signal="perceived_demand", source="checkin",
            method=Method.SELF_REPORTED, observed_for=checkin.local_date,
            display=f"Today feels: {label}", qualitative=f"said today feels {label.lower()}",
            level=checkin.perceived_demand.value, recorded_at=checkin.recorded_at, record_ids=(checkin.id,),
        ))
        basis.append(EvidenceKind.SELF_REPORT)

    # ── Combine: never pick a side; keep a range when the evidence doesn't settle ──
    disagreement = None
    if known_range is None and reported is None:
        band_range, confidence = None, None
    elif reported is None:
        band_range, confidence = known_range, known_conf
    elif known_range is None:
        band_range, confidence = (reported, reported), Confidence.MEDIUM
    elif rank(known_range[0]) <= rank(reported) <= rank(known_range[1]):
        band_range = (reported, reported)
        settled = known_range[0] == known_range[1]
        confidence = Confidence.HIGH if settled and known_conf == Confidence.MEDIUM else Confidence.MEDIUM
    else:
        higher = rank(reported) > rank(known_range[1])
        nearest = known_range[1] if higher else known_range[0]
        strong = abs(rank(nearest) - rank(reported)) == 2
        band_range = (nearest, reported) if higher else (reported, nearest)
        confidence = Confidence.LOW if strong else Confidence.MEDIUM
        lo, hi = known_range
        disagreement = Disagreement(
            domain="demand",
            other_level=lo.value if lo == hi else f"{lo.value}-{hi.value}",
            other_source="calendar_and_tasks" if calendar_used and todays else ("calendar" if calendar_used else "tasks"),
            other_is_connected=calendar_used, reported_level=reported.value,
            reported_is_higher=higher, resolution="kept_as_range", strong=strong,
        )

    band = band_range[0] if band_range and band_range[0] == band_range[1] else None
    return DemandAssessment(
        band=band, band_range=band_range, confidence=confidence, basis=tuple(basis),
        known_range=known_range, reported_band=reported,
        scheduled_minutes=minutes if calendar_used else None,
        task_count=len(todays), estimated_task_minutes=estimated,
        unestimated_task_count=len(unsized), unknown_effort_task_count=len(no_effort),
        deep_task_count=deep, evidence=tuple(evidence), disagreement=disagreement,
    ), unused
