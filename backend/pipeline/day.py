"""The person's local day. The engine never reads the clock or resolves time zones; this does."""
from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from backend.engine.types import DayContext


def zone(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def day_context(timezone: str | None, now: dt.datetime) -> DayContext:
    """`now` must be aware. Day boundaries follow the zone (23/25-hour days on DST changes)."""
    tz = zone(timezone)
    local_now = now.astimezone(tz)
    start = dt.datetime.combine(local_now.date(), dt.time(), tzinfo=tz)
    end = dt.datetime.combine(local_now.date() + dt.timedelta(days=1), dt.time(), tzinfo=tz)
    return DayContext(local_date=local_now.date(), day_start=start, day_end=end, now=local_now)
