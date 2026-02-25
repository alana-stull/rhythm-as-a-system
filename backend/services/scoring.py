"""
Recovery / Exposure / Friction scoring and condition classification.
All scores are 0-100. None means the signal is absent — not zero.
"""
from __future__ import annotations


# ── Normalization helpers ──────────────────────────────────────────────────────

def _normalize_sleep(hours: float) -> float:
    """7-9h → 85-100, <5h → ~20, >10h → diminishing returns."""
    if 7 <= hours <= 9:
        return min(100.0, 70 + (hours - 7) * 15)
    elif hours < 7:
        return max(0.0, hours / 7 * 70)
    else:
        return max(60.0, 100 - (hours - 9) * 10)


def _normalize_hrv(hrv_ms: float, baseline: float = 55.0) -> float:
    """HRV relative to personal baseline. At baseline → 70, higher → up to 100."""
    if not hrv_ms or hrv_ms <= 0:
        return 50.0
    ratio = hrv_ms / baseline
    return min(100.0, max(0.0, ratio * 70))


def _normalize_rhr(rhr: float, baseline: float = 62.0) -> float:
    """Lower RHR relative to baseline = better recovery."""
    delta = baseline - rhr
    return min(100.0, max(0.0, 50 + delta * 5))


# ── Recovery score ─────────────────────────────────────────────────────────────

def compute_recovery_score(
    source: str,
    readiness_score: float | None = None,
    hrv_avg: float | None = None,
    sleep_score: float | None = None,
    sleep_hours: float | None = None,
    resting_heart_rate: float | None = None,
) -> float | None:
    if source == "oura":
        h = _normalize_hrv(hrv_avg) if hrv_avg else 50.0
        if readiness_score is not None:
            # Full readiness score available — primary signal
            s = sleep_score if sleep_score is not None else 50.0
            return round(0.60 * readiness_score + 0.25 * h + 0.15 * s, 1)
        elif sleep_score is not None:
            # Only sleep data — fall back to sleep+HRV composite
            return round(0.60 * sleep_score + 0.40 * h, 1)
        elif hrv_avg is not None:
            return round(h, 1)
        return None

    elif source == "apple_health":
        if sleep_hours is None and hrv_avg is None and resting_heart_rate is None:
            return None
        s = _normalize_sleep(sleep_hours) if sleep_hours else 50.0
        h = _normalize_hrv(hrv_avg) if hrv_avg else 50.0
        r = _normalize_rhr(resting_heart_rate) if resting_heart_rate else 50.0
        return round(0.40 * s + 0.40 * h + 0.20 * r, 1)

    return None


# ── Exposure score ─────────────────────────────────────────────────────────────

def compute_exposure_score(calendar_data: dict | None = None) -> float | None:
    """Returns None until calendar CSV integration is added (v2)."""
    if not calendar_data:
        return None
    meeting_hours = calendar_data.get("meeting_hours_today", 0)
    deadline_count = calendar_data.get("deadlines_today", 0)
    meeting_load = min(100.0, (meeting_hours / 8) * 70)
    deadline_load = min(30.0, deadline_count * 10)
    return round(meeting_load + deadline_load, 1)


# ── Friction score ─────────────────────────────────────────────────────────────

def compute_friction_score(friction_rating: int | None) -> float | None:
    """Maps 1-10 self-report to 0-100."""
    if friction_rating is None:
        return None
    return round((friction_rating - 1) / 9 * 100, 1)


# ── Condition classification ───────────────────────────────────────────────────

def classify_condition(
    recovery: float | None,
    exposure: float | None,
    friction: float | None,
) -> str:
    if recovery is None:
        return "Balanced"  # not enough data to say anything meaningful

    available_loads = [s for s in [exposure, friction] if s is not None]

    if not available_loads:
        # Only recovery available
        if recovery >= 80:
            return "Aligned"
        elif recovery >= 60:
            return "Balanced"
        else:
            return "Strained"

    load = sum(available_loads) / len(available_loads)

    if recovery < 60:
        return "Strained"
    elif recovery >= 80 and load <= 50:
        return "Aligned"
    elif load >= 70 and recovery < 75:
        return "Overloaded"
    else:
        return "Balanced"
