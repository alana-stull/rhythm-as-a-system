"""
assess_day: the engine's single entry point.

Pure function of its inputs. Same inputs and thresholds → same Assessment.
"""
from __future__ import annotations

from backend.engine._util import latest_answer, todays_checkins
from backend.engine.capacity import assess_capacity
from backend.engine.demand import assess_demand
from backend.engine.thresholds import DEFAULT_THRESHOLDS, ENGINE_VERSION, Thresholds
from backend.engine.types import (
    CONNECTED_KINDS,
    Assessment,
    CapacityBand,
    Confidence,
    DayInputs,
    DemandBand,
    NextAction,
    Pathway,
    State,
    Status,
    min_confidence,
    rank,
)

# Relational states: capacity × demand (approved 2026-09-26).
STATE_MATRIX: dict[tuple[CapacityBand, DemandBand], State] = {
    (CapacityBand.HIGH, DemandBand.LIGHT): State.ALIGNED,
    (CapacityBand.HIGH, DemandBand.MODERATE): State.ALIGNED,
    (CapacityBand.HIGH, DemandBand.HEAVY): State.BALANCED,
    (CapacityBand.MODERATE, DemandBand.LIGHT): State.ALIGNED,
    (CapacityBand.MODERATE, DemandBand.MODERATE): State.BALANCED,
    (CapacityBand.MODERATE, DemandBand.HEAVY): State.STRAINED,
    (CapacityBand.LOW, DemandBand.LIGHT): State.BALANCED,
    (CapacityBand.LOW, DemandBand.MODERATE): State.STRAINED,
    (CapacityBand.LOW, DemandBand.HEAVY): State.OVERLOADED,
}


def _pathway(kinds: set) -> Pathway:
    connected = bool(kinds & CONNECTED_KINDS)
    self_provided = bool(kinds - CONNECTED_KINDS)
    if connected and self_provided:
        return Pathway.HYBRID
    if connected:
        return Pathway.CONNECTED
    if self_provided:
        return Pathway.SELF_REPORTED
    return Pathway.NONE


def assess_day(inputs: DayInputs, thresholds: Thresholds = DEFAULT_THRESHOLDS) -> Assessment:
    capacity, unused_c = assess_capacity(inputs, thresholds)
    demand, unused_d = assess_demand(inputs, thresholds)
    pathway = _pathway(set(capacity.basis) | set(demand.basis))

    missing = []
    if capacity.band is None:
        missing.append("capacity")
    if demand.band_range is None:
        missing.append("demand")

    possible: tuple[State, ...] = ()
    if missing:
        status, state, confidence = Status.INSUFFICIENT_EVIDENCE, None, None
    else:
        lo, hi = demand.band_range
        bands = [b for b in DemandBand if rank(lo) <= rank(b) <= rank(hi)]
        # Ordered lighter → heavier; for a fixed capacity, states only get heavier.
        possible = tuple(dict.fromkeys(STATE_MATRIX[(capacity.band, b)] for b in bands))
        if len(possible) == 1:
            status, state = Status.ASSESSED, possible[0]
            confidence = min_confidence(capacity.confidence, demand.confidence)
            if pathway == Pathway.SELF_REPORTED:  # D7
                confidence = min_confidence(confidence, Confidence.MEDIUM)
        else:
            # More than one state fits: say so instead of presenting one as definitive.
            status, state, confidence = Status.UNCERTAIN, None, Confidence.LOW

    actions: list[NextAction] = []
    if capacity.band is None:
        actions.append(NextAction.CHECK_IN)
    if demand.band is None:  # missing or a range
        if latest_answer(inputs.checkins, inputs.day, "perceived_demand") is None and NextAction.CHECK_IN not in actions:
            actions.append(NextAction.CHECK_IN)
        if demand.task_count == 0 and demand.band_range is None:
            actions.append(NextAction.ADD_TODAYS_TASKS)
        if demand.unestimated_task_count or demand.unknown_effort_task_count:
            actions.append(NextAction.ADD_TASK_DETAILS)

    latest = max(todays_checkins(inputs.checkins, inputs.day), key=lambda c: c.recorded_at, default=None)

    return Assessment(
        local_date=inputs.day.local_date,
        status=status,
        state=state,
        possible_states=possible,
        confidence=confidence,
        pathway=pathway,
        capacity=capacity,
        demand=demand,
        missing=tuple(missing),
        next_actions=tuple(actions),
        context_tags=latest.context_tags if latest else frozenset(),
        unused_evidence=tuple(unused_c + unused_d),
        engine_version=ENGINE_VERSION,
        thresholds_version=thresholds.version,
    )
