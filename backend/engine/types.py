"""
Engine vocabulary: inputs, evidence and outputs.

Everything here is a plain frozen dataclass or string enum, so the engine
stays pure (no database, network or framework imports) and its output can
be serialized as-is for the API, the UI and the interpretation layer.
"""
from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass
from enum import Enum


# ── Ordered levels ─────────────────────────────────────────────────────────────

class CapacityBand(str, Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"


class DemandBand(str, Enum):
    LIGHT = "light"
    MODERATE = "moderate"
    HEAVY = "heavy"


class Confidence(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


_ORDER = {
    CapacityBand.LOW: 0, CapacityBand.MODERATE: 1, CapacityBand.HIGH: 2,
    DemandBand.LIGHT: 0, DemandBand.MODERATE: 1, DemandBand.HEAVY: 2,
    Confidence.LOW: 0, Confidence.MEDIUM: 1, Confidence.HIGH: 2,
}


def rank(level: CapacityBand | DemandBand | Confidence) -> int:
    return _ORDER[level]


def min_confidence(*levels: Confidence) -> Confidence:
    return min(levels, key=rank)


# ── Self-report scales (D1: five labeled points, no numbers shown) ─────────────

class EnergyLevel(str, Enum):
    VERY_LOW = "very_low"
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    VERY_HIGH = "very_high"


class PerceivedDemand(str, Enum):
    VERY_LIGHT = "very_light"
    LIGHT = "light"
    MODERATE = "moderate"
    HEAVY = "heavy"
    VERY_HEAVY = "very_heavy"


# Default wording only. Final copy belongs to the UI redesign.
ENERGY_LABELS: dict[EnergyLevel, str] = {
    EnergyLevel.VERY_LOW: "Running on empty",
    EnergyLevel.LOW: "Low",
    EnergyLevel.MODERATE: "Okay",
    EnergyLevel.HIGH: "Good",
    EnergyLevel.VERY_HIGH: "Full of energy",
}

PERCEIVED_DEMAND_LABELS: dict[PerceivedDemand, str] = {
    PerceivedDemand.VERY_LIGHT: "Very light",
    PerceivedDemand.LIGHT: "Light",
    PerceivedDemand.MODERATE: "Manageable",
    PerceivedDemand.HEAVY: "Heavy",
    PerceivedDemand.VERY_HEAVY: "Too much",
}


class Effort(str, Enum):
    LIGHT = "light"
    MODERATE = "moderate"
    DEEP = "deep"


# ── States ─────────────────────────────────────────────────────────────────────

class State(str, Enum):
    ALIGNED = "Aligned"
    BALANCED = "Balanced"
    STRAINED = "Strained"
    OVERLOADED = "Overloaded"


class Status(str, Enum):
    ASSESSED = "assessed"
    UNCERTAIN = "uncertain"  # evidence points to more than one state; see possible_states
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"


# Color families, not shades. Exact values belong to the UI redesign.
STATE_COLOR_FAMILY: dict[State | None, str] = {
    State.ALIGNED: "green",
    State.BALANCED: "blue",
    State.STRAINED: "amber",
    State.OVERLOADED: "burgundy",
    None: "neutral",  # uncertain or insufficient evidence
}


class Pathway(str, Enum):
    NONE = "none"
    SELF_REPORTED = "self_reported"
    CONNECTED = "connected"
    HYBRID = "hybrid"


class NextAction(str, Enum):
    CHECK_IN = "check_in"
    ADD_TODAYS_TASKS = "add_todays_tasks"
    ADD_TASK_DETAILS = "add_task_details"  # effort level or time estimate


# ── Evidence and provenance ────────────────────────────────────────────────────

class EvidenceKind(str, Enum):
    WEARABLE_MEASUREMENT = "wearable_measurement"
    SELF_REPORT = "self_report"
    CALENDAR_DEMAND = "calendar_demand"
    TASK_DEMAND = "task_demand"


CONNECTED_KINDS = frozenset({EvidenceKind.WEARABLE_MEASUREMENT, EvidenceKind.CALENDAR_DEMAND})


class Method(str, Enum):
    MEASURED = "measured"          # wearable value as reported by the vendor
    DERIVED = "derived"            # computed from measurements (e.g. vs personal baseline)
    SELF_REPORTED = "self_reported"
    USER_ENTERED = "user_entered"  # tasks
    SYNCED = "synced"              # calendar


class UnusedReason(str, Enum):
    STALE = "stale"
    NO_BASELINE = "no_baseline"
    SUPERSEDED = "superseded"


@dataclass(frozen=True)
class Evidence:
    """One fact the engine considered, with where it came from.

    `display` may contain real quantities ("3 tasks", "90 min scheduled",
    "Oura readiness 82"). `qualitative` never contains digits; it is what the
    interpretation layer may receive for health data.
    """
    kind: EvidenceKind
    signal: str
    source: str
    method: Method
    observed_for: _dt.date
    display: str
    qualitative: str
    quantity: float | None = None
    unit: str | None = None
    level: str | None = None
    recorded_at: _dt.datetime | None = None
    record_ids: tuple[str, ...] = ()
    used: bool = True
    unused_reason: UnusedReason | None = None


@dataclass(frozen=True)
class Disagreement:
    """Connected (or entered) data and the person's report point different ways.

    Both sides are kept; `resolution` says how the engine combined them so the
    guidance can say so out loud.
    """
    domain: str               # "capacity" | "demand"
    other_level: str          # band (or "light-moderate" range) from wearable / calendar+tasks
    other_source: str         # e.g. "oura", "calendar_and_tasks"
    other_is_connected: bool
    reported_level: str       # band from the person's check-in
    reported_is_higher: bool  # person reports more capacity / more demand than the other side
    resolution: str           # "followed_self_report" (capacity) | "kept_as_range" (demand)
    strong: bool              # opposite ends of the scale


# ── Inputs ─────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class DayContext:
    """The person's local day. The caller resolves time zones."""
    local_date: _dt.date
    day_start: _dt.datetime  # aware
    day_end: _dt.datetime    # aware, exclusive
    now: _dt.datetime        # aware; the engine never reads the clock


@dataclass(frozen=True)
class CheckIn:
    id: str
    local_date: _dt.date
    recorded_at: _dt.datetime
    energy: EnergyLevel | None = None
    perceived_demand: PerceivedDemand | None = None
    context_tags: frozenset[str] = frozenset()


@dataclass(frozen=True)
class Task:
    """No title: the engine never needs it, so it can never leak it."""
    id: str
    effort: Effort | None = None
    estimate_minutes: int | None = None
    focus_on: _dt.date | None = None
    due_on: _dt.date | None = None
    completed_at: _dt.datetime | None = None
    let_go_at: _dt.datetime | None = None


@dataclass(frozen=True)
class CalendarBlock:
    id: str
    start: _dt.datetime
    end: _dt.datetime
    all_day: bool = False
    busy: bool = True
    declined: bool = False


@dataclass(frozen=True)
class CalendarSnapshot:
    """Present only when a calendar is connected and synced for this day.

    An empty `blocks` tuple then means "nothing scheduled", which is evidence.
    No snapshot means "unknown", which is not.
    """
    source: str  # "apple_calendar" | "google_calendar"
    synced_at: _dt.datetime
    blocks: tuple[CalendarBlock, ...] = ()


@dataclass(frozen=True)
class WearableDay:
    source: str  # "oura" | "apple_health"
    local_date: _dt.date
    readiness: float | None = None      # vendor composite, 0-100 (Oura)
    sleep_minutes: float | None = None
    hrv_ms: float | None = None
    hrv_method: str | None = None       # "rmssd" | "sdnn"; never compared across methods
    resting_hr: float | None = None
    record_id: str | None = None


@dataclass(frozen=True)
class DayInputs:
    day: DayContext
    checkins: tuple[CheckIn, ...] = ()
    tasks: tuple[Task, ...] = ()
    calendar: CalendarSnapshot | None = None
    wearable: tuple[WearableDay, ...] = ()  # today plus history (for baselines)


# ── Outputs ────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class CapacityAssessment:
    """What the person has to give.

    There is deliberately no numeric value: a wearable readiness score is one
    piece of evidence (`wearable_band`), never the capacity itself.
    """
    band: CapacityBand | None
    confidence: Confidence | None
    basis: tuple[EvidenceKind, ...]
    wearable_band: CapacityBand | None
    reported_band: CapacityBand | None
    evidence: tuple[Evidence, ...]
    disagreement: Disagreement | None = None


@dataclass(frozen=True)
class DemandAssessment:
    """What the day is asking. Quantities are only what was actually known.

    `band_range` is (lighter, heavier). When the evidence can't settle on one
    band (sources disagree, or tasks have unknown effort) the range spans more
    than one band and `band` is None, rather than picking one side.
    """
    band: DemandBand | None
    band_range: tuple[DemandBand, DemandBand] | None
    confidence: Confidence | None
    basis: tuple[EvidenceKind, ...]
    known_range: tuple[DemandBand, DemandBand] | None
    reported_band: DemandBand | None
    scheduled_minutes: int | None
    task_count: int
    estimated_task_minutes: int | None
    unestimated_task_count: int
    unknown_effort_task_count: int
    deep_task_count: int
    evidence: tuple[Evidence, ...]
    disagreement: Disagreement | None = None


@dataclass(frozen=True)
class Assessment:
    local_date: _dt.date
    status: Status
    state: State | None
    possible_states: tuple[State, ...]  # (state,) when assessed; lighter → heavier when uncertain
    confidence: Confidence | None
    pathway: Pathway
    capacity: CapacityAssessment
    demand: DemandAssessment
    missing: tuple[str, ...]
    next_actions: tuple[NextAction, ...]
    context_tags: frozenset[str]
    unused_evidence: tuple[Evidence, ...]
    engine_version: str
    thresholds_version: str

    @property
    def color_family(self) -> str:
        return STATE_COLOR_FAMILY[self.state]

    @property
    def disagreements(self) -> tuple[Disagreement, ...]:
        return tuple(d for d in (self.capacity.disagreement, self.demand.disagreement) if d)
