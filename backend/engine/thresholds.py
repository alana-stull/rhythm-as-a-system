"""
Provisional, versioned thresholds (D6).

Every number the engine compares against lives here, next to the assumption
behind it. To refine one, change it (or pass `dataclasses.replace(DEFAULT,
...)` to `assess_day`) and bump `version`; stored assessments carry the
version they were computed with, so a change means recompute, not migrate.
"""
from __future__ import annotations

from dataclasses import dataclass

ENGINE_VERSION = "2.0.0"


@dataclass(frozen=True)
class Thresholds:
    version: str = "2026-10-10.2-provisional"

    # Wearable vendor composite (Oura readiness, 0-100) → wearable band.
    readiness_moderate_from: float = 60.0
    readiness_high_from: float = 80.0

    # Wearable components compared with the person's own baseline.
    baseline_window_days: int = 28
    baseline_min_days: int = 7
    sleep_below_usual_ratio: float = 0.85
    hrv_below_usual_ratio: float = 0.85
    hrv_above_usual_ratio: float = 1.10
    resting_hr_above_usual_bpm: float = 3.0
    resting_hr_below_usual_bpm: float = 2.0
    components_low_at_or_below: float = -0.5
    components_high_at_or_above: float = 0.5

    # Task effort weights, applied only to a real estimate. An estimate with no
    # effort level is bracketed between the lightest and deepest weight.
    weight_light: float = 0.5
    weight_moderate: float = 1.0
    weight_deep: float = 1.5

    # Tasks with an effort level but no estimate count as effort points, never
    # minutes. Tasks with neither stay visible but add nothing numeric.
    points_light: int = 1
    points_moderate: int = 2
    points_deep: int = 3

    # Known demand from minutes (calendar + estimated tasks, effort-weighted).
    minutes_moderate_from: float = 180.0   # 3 weighted hours
    minutes_heavy_above: float = 360.0     # 6 weighted hours

    # Known demand from unestimated task points.
    points_moderate_from: int = 4
    points_heavy_from: int = 8

    # A calendar sync older than this is not used for the day.
    calendar_max_age_hours: float = 24.0


DEFAULT_THRESHOLDS = Thresholds()

ASSUMPTIONS: tuple[str, ...] = (
    "Readiness cutoffs (60 / 80) carry over from the v1 classifier; they describe the wearable signal only, not capacity.",
    "Wearable components need at least 7 days of the person's own history from the same source (and same HRV method); there are no population baselines.",
    "Sleep longer than usual is treated as neutral, not as extra capacity.",
    "Only today's wearable reading counts for today; older readings are reported as stale and not used.",
    "Each check-in signal uses the latest check-in that answered it (D3); earlier check-ins stay in history.",
    "Energy maps to capacity: very low/low → low, moderate → moderate, high/very high → high.",
    "Perceived demand maps to demand: very light/light → light, moderate → moderate, heavy/very heavy → heavy.",
    "When a wearable and the person's energy disagree, capacity follows the person, the disagreement is kept and stated, and confidence drops.",
    "When known demand (calendar + tasks) and perceived demand disagree, neither is picked: demand becomes a range spanning both, and if that range covers more than one state the outcome is `uncertain` with the possible states listed.",
    "Perceived demand that falls inside the known range settles it (the person resolves uncertainty about effort).",
    "A task counts toward a day only when it is focused on or due that day and has not been let go; an overdue task counts only once the person reschedules it or focuses it on today.",
    "Effort weights (0.5 / 1.0 / 1.5) apply only to real estimates; an estimate with no effort level is bracketed between the light and deep weights, never assumed moderate.",
    "Tasks without an estimate never receive minutes; with an effort level they add effort points (1 / 2 / 3) on a separate scale; with neither they stay visible as evidence but add nothing numeric, and keep confidence low.",
    "Known demand range is the heavier of the minutes band and the points band at each end.",
    "Demand bands: under 3 weighted hours light, 3 to 6 moderate, over 6 heavy; under 4 points light, 4 to 7 moderate, 8+ heavy.",
    "Overlapping calendar blocks are merged; all-day, free and declined events are excluded; blocks are clipped to the local day.",
    "A connected, fresh calendar with nothing scheduled is evidence of no scheduled events (0 minutes), not of a light day: on its own it sets no demand band. No calendar is no evidence.",
    "Routines, habits and commitments have no automatic effect on capacity or demand; once modeled (F3+), only their actual scheduled time counts, merged with calendar time so nothing is counted twice.",
    "With no connected source contributing, overall confidence is capped at medium (D7).",
)
