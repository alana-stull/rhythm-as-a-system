"""
Health normalization: provider records → one `health_daily` row per source and local day.

Only the fields the engine uses (HealthKit v1 scope: sleep, HRV, resting HR;
plus Oura's readiness composite). Values outside physiological ranges, NaN or
non-numbers become missing — never zero, never clamped, never guessed.
HRV keeps its method (Oura: RMSSD, Apple: SDNN); the engine never compares
the two.
"""
from __future__ import annotations

import datetime as dt
import math
from typing import Any

# (min, max) inclusive; matches the database CHECKs.
RANGES = {
    "readiness": (0, 100),
    "sleep_minutes": (0, 1440),
    "hrv_ms": (1, 500),
    "resting_hr": (20, 250),
}


def clean(field: str, value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    lo, hi = RANGES[field]
    if not math.isfinite(f) or f < lo or f > hi:
        return None
    return round(f, 2)


def _day(value: Any) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def normalize_oura(readiness: list[dict[str, Any]], sleep: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Oura v2 `daily_readiness` documents + `sleep` periods → health days.

    Sleep: the main sleep period attributed to each day (Oura's `day` is the day
    the person woke up): the longest `long_sleep`, or, on nights Oura only
    recorded a shorter `sleep` period, the longest of those. Naps (`late_nap`)
    and rest periods are never used. Resting HR uses that period's
    `lowest_heart_rate`, Oura's own overnight resting measure.
    """
    days: dict[dt.date, dict[str, Any]] = {}

    for r in readiness:
        d = _day(r.get("day"))
        if d is None:
            continue
        days.setdefault(d, {"local_date": d})
        days[d]["readiness"] = clean("readiness", r.get("score"))
        days[d]["record_id"] = r.get("id")

    def duration(p: dict[str, Any]) -> float:
        v = p.get("total_sleep_duration")
        return v if isinstance(v, (int, float)) else 0

    main_sleep: dict[dt.date, dict[str, Any]] = {}
    for kind in ("long_sleep", "sleep"):  # "sleep" only fills days with no long_sleep
        for s in sleep:
            d = _day(s.get("day"))
            if d is None or s.get("type") != kind:
                continue
            if kind == "sleep" and main_sleep.get(d, {}).get("type") == "long_sleep":
                continue
            if d not in main_sleep or duration(s) > duration(main_sleep[d]):
                main_sleep[d] = s
    for d, s in main_sleep.items():
        row = days.setdefault(d, {"local_date": d})
        seconds = s.get("total_sleep_duration")
        row["sleep_minutes"] = clean("sleep_minutes", seconds / 60 if isinstance(seconds, (int, float)) else None)
        row["hrv_ms"] = clean("hrv_ms", s.get("average_hrv"))
        row["hrv_method"] = "rmssd" if row["hrv_ms"] is not None else None
        row["resting_hr"] = clean("resting_hr", s.get("lowest_heart_rate"))
        row.setdefault("record_id", s.get("id"))

    return [r for r in sorted(days.values(), key=lambda r: r["local_date"])
            if any(r.get(k) is not None for k in ("readiness", "sleep_minutes", "hrv_ms", "resting_hr"))]


def normalize_apple(days: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Per-day summaries computed on the device from HealthKit (HRV is SDNN)."""
    out = []
    for raw in days:
        d = _day(raw.get("local_date"))
        if d is None:
            continue
        row = {
            "local_date": d,
            "readiness": None,  # Apple has no vendor composite
            "sleep_minutes": clean("sleep_minutes", raw.get("sleep_minutes")),
            "hrv_ms": clean("hrv_ms", raw.get("hrv_sdnn_ms")),
            "resting_hr": clean("resting_hr", raw.get("resting_hr")),
            "record_id": None,
        }
        row["hrv_method"] = "sdnn" if row["hrv_ms"] is not None else None
        if any(row[k] is not None for k in ("sleep_minutes", "hrv_ms", "resting_hr")):
            out.append(row)
    return out
