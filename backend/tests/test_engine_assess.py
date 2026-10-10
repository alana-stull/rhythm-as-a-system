"""assess_day: states, insufficient evidence, pathways, confidence and invariants."""
import dataclasses

import pytest

from backend.engine import ASSUMPTIONS, DEFAULT_THRESHOLDS, ENGINE_VERSION, STATE_MATRIX, assess_day
from backend.engine.types import (
    STATE_COLOR_FAMILY, Confidence, EvidenceKind, NextAction, Pathway, State, Status, rank,
)
from backend.tests.engine_fixtures import (
    DAY, YESTERDAY, apple_history, apple_today, calendar, checkin, inputs, oura, task,
)

ENERGY_FOR = {"low": "low", "moderate": "moderate", "high": "high"}
DEMAND_FOR = {"light": "light", "moderate": "moderate", "heavy": "heavy"}


@pytest.mark.parametrize("capacity, demand, state", [
    ("high", "light", "Aligned"), ("high", "moderate", "Aligned"), ("high", "heavy", "Balanced"),
    ("moderate", "light", "Aligned"), ("moderate", "moderate", "Balanced"), ("moderate", "heavy", "Strained"),
    ("low", "light", "Balanced"), ("low", "moderate", "Strained"), ("low", "heavy", "Overloaded"),
])
def test_relational_state_matrix_from_self_report_alone(capacity, demand, state):
    a = assess_day(inputs(checkins=[checkin(energy=ENERGY_FOR[capacity], demand=DEMAND_FOR[demand])]))
    assert a.status == Status.ASSESSED and a.state == State(state)
    assert a.pathway == Pathway.SELF_REPORTED and a.confidence == Confidence.MEDIUM


def test_all_four_states_are_reachable_and_keep_their_color_families():
    assert set(STATE_MATRIX.values()) == set(State)
    assert {s.value: STATE_COLOR_FAMILY[s] for s in State} == {
        "Aligned": "green", "Balanced": "blue", "Strained": "amber", "Overloaded": "burgundy",
    }


def test_no_evidence_is_insufficient_never_balanced():
    a = assess_day(inputs())
    assert a.status == Status.INSUFFICIENT_EVIDENCE
    assert a.state is None and a.confidence is None and a.color_family == "neutral"
    assert a.pathway == Pathway.NONE and a.missing == ("capacity", "demand")
    assert a.next_actions == (NextAction.CHECK_IN, NextAction.ADD_TODAYS_TASKS)


def test_energy_only_keeps_what_is_known_and_asks_for_the_rest():
    a = assess_day(inputs(checkins=[checkin(energy="low")]))
    assert a.status == Status.INSUFFICIENT_EVIDENCE and a.missing == ("demand",)
    assert a.capacity.band.value == "low"
    assert a.next_actions == (NextAction.CHECK_IN, NextAction.ADD_TODAYS_TASKS)


def test_tasks_present_but_no_capacity_asks_for_a_check_in():
    a = assess_day(inputs(tasks=[task("a", "deep", 60)], checkins=[checkin(demand="moderate")]))
    assert a.missing == ("capacity",) and a.next_actions == (NextAction.CHECK_IN,)


def test_unsized_tasks_ask_for_details_not_invented_values():
    a = assess_day(inputs(tasks=[task("a"), task("b")], checkins=[checkin(energy="low")]))
    assert a.status == Status.INSUFFICIENT_EVIDENCE and a.missing == ("demand",)
    assert a.next_actions == (NextAction.CHECK_IN, NextAction.ADD_TASK_DETAILS)


# ── Pathway × freshness matrix ─────────────────────────────────────────────────

FULL_CHECKIN = checkin(energy="high", demand="moderate", tags=("stress",))

SCENARIOS = {
    # name: (inputs kwargs, expected status, expected pathway)
    "nothing": (dict(), Status.INSUFFICIENT_EVIDENCE, Pathway.NONE),
    "self_report/fresh": (dict(checkins=[FULL_CHECKIN]), Status.ASSESSED, Pathway.SELF_REPORTED),
    "self_report/stale": (dict(checkins=[checkin(energy="high", demand="moderate", day=YESTERDAY)]),
                          Status.INSUFFICIENT_EVIDENCE, Pathway.NONE),
    "self_report/partial": (dict(checkins=[checkin(energy="high")]), Status.INSUFFICIENT_EVIDENCE, Pathway.SELF_REPORTED),
    "tasks/fresh": (dict(tasks=[task("a", "deep", 60)]), Status.INSUFFICIENT_EVIDENCE, Pathway.SELF_REPORTED),
    "tasks/stale": (dict(tasks=[task("a", "deep", 60, focus_on=YESTERDAY)]), Status.INSUFFICIENT_EVIDENCE, Pathway.NONE),
    "tasks/partial": (dict(tasks=[task("a")]), Status.INSUFFICIENT_EVIDENCE, Pathway.SELF_REPORTED),
    "wearable/fresh": (dict(wearable=[oura(85)]), Status.INSUFFICIENT_EVIDENCE, Pathway.CONNECTED),
    "wearable/stale": (dict(wearable=[oura(85, day=YESTERDAY)]), Status.INSUFFICIENT_EVIDENCE, Pathway.NONE),
    "wearable/partial": (dict(wearable=[*apple_history(days=3), apple_today(sleep=400)]),
                         Status.INSUFFICIENT_EVIDENCE, Pathway.NONE),
    "calendar/fresh": (dict(cal=calendar((9, 12))), Status.INSUFFICIENT_EVIDENCE, Pathway.CONNECTED),
    "calendar/stale": (dict(cal=calendar((9, 12), synced_hours_ago=48)), Status.INSUFFICIENT_EVIDENCE, Pathway.NONE),
    "calendar/empty": (dict(cal=calendar(), checkins=[checkin(energy="high")]), Status.INSUFFICIENT_EVIDENCE, Pathway.HYBRID),
    "self_report/unknown_effort": (dict(checkins=[checkin(energy="moderate")], tasks=[task("a", None, 240)]),
                                   Status.UNCERTAIN, Pathway.SELF_REPORTED),
    "demand_disagreement": (dict(cal=calendar((9, 14)), tasks=[task("a", "deep", 60), task("b", "deep")],
                                 checkins=[checkin(energy="low", demand="light")]), Status.UNCERTAIN, Pathway.HYBRID),
    "connected/fresh": (dict(wearable=[oura(85)], cal=calendar((9, 12))), Status.ASSESSED, Pathway.CONNECTED),
    "hybrid/fresh": (dict(wearable=[oura(85)], cal=calendar((9, 12)), tasks=[task("a", "deep", 60)], checkins=[FULL_CHECKIN]),
                     Status.ASSESSED, Pathway.HYBRID),
    "hybrid/stale": (dict(wearable=[oura(85, day=YESTERDAY)], cal=calendar((9, 12), synced_hours_ago=48), checkins=[FULL_CHECKIN]),
                     Status.ASSESSED, Pathway.SELF_REPORTED),
    "hybrid/partial": (dict(wearable=[oura(85)], checkins=[checkin(energy="low", demand="moderate")]),
                       Status.ASSESSED, Pathway.HYBRID),
}


@pytest.mark.parametrize("name", SCENARIOS)
def test_pathway_freshness_matrix(name):
    kwargs, status, pathway = SCENARIOS[name]
    a = assess_day(inputs(**kwargs))
    assert (a.status, a.pathway) == (status, pathway)


@pytest.mark.parametrize("name", SCENARIOS)
def test_invariants_hold_for_every_scenario(name):
    kwargs, _, _ = SCENARIOS[name]
    a = assess_day(inputs(**kwargs))
    used = [e for e in a.capacity.evidence + a.demand.evidence if e.used]

    # Insufficient evidence never becomes a state, a color or a confidence.
    if a.status == Status.INSUFFICIENT_EVIDENCE:
        assert a.state is None and a.confidence is None and a.missing and a.next_actions
        assert a.possible_states == () and a.color_family == "neutral"
    # Uncertainty is never presented as one state.
    if a.status == Status.UNCERTAIN:
        assert a.state is None and len(a.possible_states) > 1 and a.confidence == Confidence.LOW
        assert a.color_family == "neutral" and not a.missing
    if a.status == Status.ASSESSED:
        assert a.possible_states == (a.state,)
    # Nothing from another day is used for today.
    assert all(e.observed_for == DAY for e in used)
    assert all(not e.used for e in a.unused_evidence)
    # Self-report is never labelled as a measurement.
    for e in used:
        if e.kind == EvidenceKind.SELF_REPORT:
            assert not any(w in e.display.lower() for w in ("recovery", "readiness", "hrv", "score"))
    # Self-report alone is capped at medium (D7).
    if a.pathway == Pathway.SELF_REPORTED and a.confidence:
        assert rank(a.confidence) <= rank(Confidence.MEDIUM)
    assert a.engine_version == ENGINE_VERSION and a.thresholds_version == DEFAULT_THRESHOLDS.version


def test_demand_disagreement_is_uncertain_not_a_definitive_overload():
    a = assess_day(inputs(**SCENARIOS["demand_disagreement"][0]))
    assert a.status == Status.UNCERTAIN and a.state is None
    assert a.possible_states == (State.BALANCED, State.STRAINED, State.OVERLOADED)
    assert [b.value for b in a.demand.known_range] == ["heavy", "heavy"] and a.demand.reported_band.value == "light"
    assert a.disagreements[0].domain == "demand"


def test_adjacent_demand_disagreement_with_one_possible_state_is_assessed():
    a = assess_day(inputs(cal=calendar((9, 10)), checkins=[checkin(energy="high", demand="moderate")]))
    assert a.status == Status.ASSESSED and a.state == State.ALIGNED  # high × light or moderate
    assert a.demand.band is None and len(a.disagreements) == 1
    assert a.confidence == Confidence.MEDIUM


def test_unknown_effort_is_uncertain_until_the_person_says_how_heavy_it_feels():
    a = assess_day(inputs(**SCENARIOS["self_report/unknown_effort"][0]))
    assert a.possible_states == (State.ALIGNED, State.BALANCED)
    assert a.next_actions == (NextAction.CHECK_IN, NextAction.ADD_TASK_DETAILS)
    settled = assess_day(inputs(checkins=[checkin(energy="moderate", demand="moderate")], tasks=[task("a", None, 240)]))
    assert settled.status == Status.ASSESSED and settled.state == State.BALANCED


def test_hybrid_disagreement_is_assessed_and_explicit():
    a = assess_day(inputs(**SCENARIOS["hybrid/partial"][0]))
    assert a.state == State.STRAINED  # low (as reported) × moderate
    assert a.capacity.wearable_band.value == "high" and a.capacity.reported_band.value == "low"
    assert len(a.disagreements) == 1 and a.disagreements[0].strong
    assert a.confidence == Confidence.LOW


def test_fully_connected_and_agreeing_can_be_high_confidence():
    a = assess_day(inputs(wearable=[oura(85)], cal=calendar((9, 12)), checkins=[checkin(energy="high", demand="moderate")]))
    assert a.state == State.ALIGNED and a.confidence == Confidence.HIGH and a.pathway == Pathway.HYBRID


def test_stale_connected_data_falls_back_to_self_report_with_capped_confidence():
    a = assess_day(inputs(**SCENARIOS["hybrid/stale"][0]))
    assert a.confidence == Confidence.MEDIUM
    assert {e.kind for e in a.unused_evidence} == {EvidenceKind.WEARABLE_MEASUREMENT, EvidenceKind.CALENDAR_DEMAND}


def test_context_tags_come_from_the_latest_checkin():
    a = assess_day(inputs(checkins=[checkin(energy="low", tags=("stress",), hour=7, id="a"),
                                    checkin(demand="light", tags=("travel",), hour=9, id="b")]))
    assert a.context_tags == frozenset({"travel"})


def test_deterministic():
    kw = SCENARIOS["hybrid/fresh"][0]
    assert assess_day(inputs(**kw)) == assess_day(inputs(**kw))


def test_thresholds_are_refinable_and_versioned():
    kw = dict(checkins=[checkin(energy="moderate")], cal=calendar((9, 13)))  # 240 min
    assert assess_day(inputs(**kw)).state == State.BALANCED
    stricter = dataclasses.replace(DEFAULT_THRESHOLDS, minutes_heavy_above=200, version="test-strict")
    a = assess_day(inputs(**kw), stricter)
    assert a.state == State.STRAINED and a.thresholds_version == "test-strict"


def test_assumptions_are_documented():
    assert len(ASSUMPTIONS) >= 10 and all(isinstance(s, str) and s for s in ASSUMPTIONS)
