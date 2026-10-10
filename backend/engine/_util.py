from __future__ import annotations

import math
from typing import Callable, Iterable, TypeVar

from backend.engine.types import CheckIn, DayContext

T = TypeVar("T")

SOURCE_NAMES = {
    "oura": "Oura",
    "apple_health": "Apple Health",
    "apple_calendar": "Apple Calendar",
    "google_calendar": "Google Calendar",
}


def source_name(source: str) -> str:
    return SOURCE_NAMES.get(source, source.replace("_", " ").title())


def finite(value: float | None) -> float | None:
    """Treat NaN/inf (seen from the v1 CSV parsers) as missing."""
    if value is None or isinstance(value, bool):
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def median(values: list[float]) -> float:
    s = sorted(values)
    mid = len(s) // 2
    return s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2


def fmt_minutes(minutes: float) -> str:
    m = int(round(minutes))
    if m < 60:
        return f"{m} min"
    h, rem = divmod(m, 60)
    return f"{h}h" if rem == 0 else f"{h}h {rem}m"


def join_phrases(parts: Iterable[str]) -> str:
    items = list(dict.fromkeys(p for p in parts if p))
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def todays_checkins(checkins: Iterable[CheckIn], day: DayContext) -> list[CheckIn]:
    """Check-ins for this local day that were not recorded in the future."""
    return [c for c in checkins if c.local_date == day.local_date and c.recorded_at <= day.now]


def latest_answer(checkins: Iterable[CheckIn], day: DayContext, attr: str) -> CheckIn | None:
    """D3: the most recent check-in today that answered `attr`."""
    answered = [c for c in todays_checkins(checkins, day) if getattr(c, attr) is not None]
    return max(answered, key=lambda c: c.recorded_at, default=None)


def first(items: Iterable[T], pred: Callable[[T], bool]) -> T | None:
    return next((i for i in items if pred(i)), None)
