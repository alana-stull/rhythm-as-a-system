"""
Open windows: stretches of today with nothing scheduled.

Only claimed when a calendar is connected and fresh; without one Rhythm
doesn't know what's free and says nothing about windows. Protected time is
never offered. Provisional assumptions (versioned with the recommendations):
- suggestions only between 8am and 9pm local time, starting from now;
- a window must be at least 30 minutes long.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

WINDOW_VERSION = "windows-1"
EARLIEST = dt.time(8, 0)
LATEST = dt.time(21, 0)
MIN_MINUTES = 30


@dataclass(frozen=True)
class Window:
    start: dt.datetime
    end: dt.datetime

    @property
    def minutes(self) -> int:
        return int((self.end - self.start).total_seconds() // 60)


def _round_up(t: dt.datetime, minutes: int = 15) -> dt.datetime:
    t = t.replace(second=0, microsecond=0)
    extra = (-t.minute) % minutes
    return t + dt.timedelta(minutes=extra)


def open_windows(now: dt.datetime, day_start: dt.datetime,
                 busy: list[tuple[dt.datetime, dt.datetime]]) -> list[Window]:
    """`now` and `day_start` are local, aware. `busy` spans may overlap and be in any zone."""
    tz = day_start.tzinfo
    now = now.astimezone(tz)
    busy = [(s.astimezone(tz), e.astimezone(tz)) for s, e in busy]  # stored times come back in UTC
    lo = max(_round_up(now), day_start.replace(hour=EARLIEST.hour, minute=EARLIEST.minute))
    hi = day_start.replace(hour=LATEST.hour, minute=LATEST.minute)
    if lo >= hi:
        return []
    spans = sorted((max(s, lo), min(e, hi)) for s, e in busy if e > lo and s < hi)
    windows, cursor = [], lo
    for s, e in spans:
        if s > cursor and (s - cursor) >= dt.timedelta(minutes=MIN_MINUTES):
            windows.append(Window(cursor, s))
        cursor = max(cursor, e)
    if hi > cursor and (hi - cursor) >= dt.timedelta(minutes=MIN_MINUTES):
        windows.append(Window(cursor, hi))
    return windows


def clock(t: dt.datetime) -> str:
    """"2" / "3:30" — the app's clock style (no am/pm inside a range)."""
    h = t.hour % 12 or 12
    return str(h) if t.minute == 0 else f"{h}:{t.minute:02d}"


def label(w: Window) -> str:
    return f"{clock(w.start)}–{clock(w.end)}"
