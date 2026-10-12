"""Builders for capacity-engine tests. Fixed clock and offset; no I/O."""
from __future__ import annotations

import datetime as dt

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

TZ = dt.timezone(dt.timedelta(hours=-7))
DAY = dt.date(2026, 10, 12)  # a Monday
YESTERDAY = DAY - dt.timedelta(days=1)


def at(hour: float, day: dt.date = DAY) -> dt.datetime:
    return dt.datetime(day.year, day.month, day.day, tzinfo=TZ) + dt.timedelta(hours=hour)


def day_ctx(now_hour: float = 12) -> DayContext:
    return DayContext(local_date=DAY, day_start=at(0), day_end=at(24), now=at(now_hour))


def checkin(energy: str | None = None, demand: str | None = None, hour: float = 8,
            id: str = "c1", day: dt.date = DAY, tags: tuple[str, ...] = (), rested: str | None = None) -> CheckIn:
    return CheckIn(
        id=id, local_date=day, recorded_at=at(hour, day),
        energy=EnergyLevel(energy) if energy else None,
        perceived_demand=PerceivedDemand(demand) if demand else None,
        context_tags=frozenset(tags),
        rested=RestedLevel(rested) if rested else None,
    )


def task(id: str, effort: str | None = None, estimate: int | None = None,
         focus_on: dt.date | None = DAY, due_on: dt.date | None = None, let_go: bool = False) -> Task:
    return Task(
        id=id, effort=Effort(effort) if effort else None, estimate_minutes=estimate,
        focus_on=focus_on, due_on=due_on, let_go_at=at(9) if let_go else None,
    )


def calendar(*spans: tuple[float, float], synced_hours_ago: float = 1, now_hour: float = 12,
             source: str = "apple_calendar", extra: tuple[CalendarBlock, ...] = ()) -> CalendarSnapshot:
    blocks = tuple(CalendarBlock(id=f"e{i}", start=at(s), end=at(e)) for i, (s, e) in enumerate(spans))
    return CalendarSnapshot(source=source, synced_at=at(now_hour - synced_hours_ago), blocks=blocks + extra)


def oura(readiness: float | None = None, day: dt.date = DAY, **kw) -> WearableDay:
    return WearableDay(source="oura", local_date=day, readiness=readiness, record_id=f"oura-{day}", **kw)


def apple_history(days: int = 10, sleep: float = 450, hrv: float = 50, rhr: float = 60,
                  hrv_method: str = "sdnn") -> tuple[WearableDay, ...]:
    return tuple(
        WearableDay(source="apple_health", local_date=DAY - dt.timedelta(days=i), sleep_minutes=sleep,
                    hrv_ms=hrv, hrv_method=hrv_method, resting_hr=rhr, record_id=f"ah-{i}")
        for i in range(1, days + 1)
    )


def apple_today(sleep: float | None = None, hrv: float | None = None, rhr: float | None = None,
                hrv_method: str = "sdnn") -> WearableDay:
    return WearableDay(source="apple_health", local_date=DAY, sleep_minutes=sleep, hrv_ms=hrv,
                       hrv_method=hrv_method, resting_hr=rhr, record_id="ah-0")


def inputs(*, checkins=(), tasks=(), cal=None, wearable=(), now_hour: float = 12) -> DayInputs:
    return DayInputs(day=day_ctx(now_hour), checkins=tuple(checkins), tasks=tuple(tasks),
                     calendar=cal, wearable=tuple(wearable))
