"""Interpretation context v2 and deterministic fallback guidance."""
import json
import re

import pytest

from backend.engine import assess_day, build_interpretation_context, fallback_guidance
from backend.engine.types import State, Status
from backend.tests.test_engine_assess import SCENARIOS
from backend.tests.engine_fixtures import (
    YESTERDAY, apple_history, apple_today, calendar, checkin, inputs, oura, task,
)

BANNED = ("score", "diagnos", "medical", "clinical", "illness", "symptom", "disease", "%")


def _all_text(g) -> str:
    return " ".join([g.headline, g.body, *g.actions]).lower()


@pytest.mark.parametrize("name", SCENARIOS)
def test_fallback_exists_for_every_scenario_and_stays_non_clinical(name):
    g = fallback_guidance(assess_day(inputs(**SCENARIOS[name][0])))
    assert g.headline and g.body and g.actions
    assert not any(w in _all_text(g) for w in BANNED)


@pytest.mark.parametrize("energy, demand", [(e, d) for e in ("low", "moderate", "high") for d in ("light", "moderate", "heavy")])
def test_fallback_for_every_state_names_its_basis_and_qualifies_self_report(energy, demand):
    a = assess_day(inputs(checkins=[checkin(energy=energy, demand=demand)]))
    g = fallback_guidance(a)
    assert g.state == a.state.value and g.color_family == a.color_family
    assert "how you said you're feeling" in g.body and "how heavy you said today feels" in g.body
    assert "built from what you've shared" in g.body


def test_insufficient_evidence_copy_and_next_action():
    g = fallback_guidance(assess_day(inputs()))
    assert g.status == Status.INSUFFICIENT_EVIDENCE.value and g.state is None and g.color_family == "neutral"
    assert g.headline == "Still getting to know your day"
    assert g.actions == ("Do a quick check-in: how's your energy, and how heavy does today feel?",
                         "Add what you're planning to work on today")
    assert "balanced" not in _all_text(g)


def test_insufficient_evidence_says_what_is_known_and_what_is_stale():
    g = fallback_guidance(assess_day(inputs(checkins=[checkin(energy="low")], wearable=[oura(80, day=YESTERDAY)])))
    assert "what you have to give from how you said you're feeling" in g.body
    assert "what today is asking of you" in g.body
    assert "last Oura reading is from October 11" in g.body
    assert g.actions[0] == "Tell Rhythm how heavy today feels"


def test_disagreements_are_stated_and_uncertainty_is_a_range():
    a = assess_day(inputs(wearable=[oura(90)], cal=calendar((9, 10)),
                          checkins=[checkin(energy="low", demand="heavy")]))
    g = fallback_guidance(a)
    assert g.headline == "Today could go either way" and g.state is None and g.color_family == "neutral"
    assert "Today looks somewhere between balanced and overloaded." in g.body
    assert "Your Oura data suggests more in the tank than you described" in g.body
    assert "Today feels heavier than your calendar shows" in g.body
    assert "keeping both in view rather than picking one" in g.body
    assert g.actions[-1] == "Start with what has to happen today, and keep the rest flexible"
    assert not any(w in _all_text(g) for w in BANNED)


def test_strong_capacity_disagreement_is_qualified():
    a = assess_day(inputs(wearable=[oura(90)], checkins=[checkin(energy="very_low", demand="light")]))
    body = fallback_guidance(a).body
    assert a.state == State.BALANCED
    assert "Because your signals point different ways, hold this read loosely." in body


def test_unknown_effort_uncertainty_explains_itself_and_asks_for_details():
    a = assess_day(inputs(checkins=[checkin(energy="moderate")], tasks=[task("a", None, 240)]))
    g = fallback_guidance(a)
    assert "somewhere between aligned and balanced" in g.body
    assert "don't have an effort level yet" in g.body
    assert "Add an effort level or time estimate to today's tasks" in g.actions


def test_empty_calendar_never_reads_as_a_light_day():
    g = fallback_guidance(assess_day(inputs(cal=calendar(), checkins=[checkin(energy="high")])))
    assert g.headline == "Still getting to know your day"
    assert "Your calendar is clear, but that doesn't mean today is light." in g.body


def test_unsized_tasks_are_acknowledged_without_numbers_invented():
    g = fallback_guidance(assess_day(inputs(tasks=[task("a")], checkins=[checkin(energy="high")])))
    assert "Today's tasks don't have an effort level or estimate yet" in g.body


def test_low_confidence_without_disagreement_is_an_early_read():
    a = assess_day(inputs(wearable=[*apple_history(), apple_today(sleep=600)], tasks=[task("a", "deep")]))
    assert a.confidence.value == "low" and not a.disagreements
    assert "It's an early read, so hold it loosely." in fallback_guidance(a).body


def test_high_confidence_has_no_hedge():
    a = assess_day(inputs(wearable=[oura(85)], cal=calendar((9, 12)), checkins=[checkin(energy="high", demand="moderate")]))
    body = fallback_guidance(a).body
    assert a.state == State.ALIGNED
    assert "early read" not in body and "built from what you've shared" not in body
    assert "your Oura data" in body and "your calendar" in body


# ── LLM context ────────────────────────────────────────────────────────────────

def test_context_never_carries_wearable_quantities():
    a = assess_day(inputs(
        wearable=[oura(87, sleep_minutes=413, hrv_ms=41, hrv_method="rmssd", resting_hr=57)],
        checkins=[checkin(energy="high", demand="moderate")],
    ))
    payload = json.dumps(build_interpretation_context(a).to_dict())
    for n in ("87", "413", "41", "57"):
        assert not re.search(rf"\b{n}\b", payload)
    assert "Oura readiness in its upper range" in payload


def test_context_carries_component_evidence_without_numbers():
    a = assess_day(inputs(wearable=[*apple_history(), apple_today(sleep=300, hrv=35, rhr=66)],
                          checkins=[checkin(demand="light")]))
    ctx = build_interpretation_context(a)
    wearable_lines = [line for line in ctx.evidence if line.startswith("Apple Health")]
    assert wearable_lines and not any(re.search(r"\d", line) for line in wearable_lines)


def test_context_keeps_real_demand_quantities_and_provenance():
    a = assess_day(inputs(cal=calendar((9, 10.5)), tasks=[task("a", "deep"), task("b", "light", 30), task("c")],
                          checkins=[checkin(energy="moderate", tags=("stress",))]))
    ctx = build_interpretation_context(a, tone="gentle")
    assert "1h 30m scheduled" in ctx.evidence
    assert "3 tasks for today (1 deep) · 30 min estimated · 2 without an estimate · 1 without an effort level" in ctx.evidence
    assert ctx.demand["basis"] == ["calendar_demand", "task_demand"]
    assert ctx.capacity["basis"] == ["self_report"]
    assert ctx.context_tags == ["stress"] and ctx.tone == "gentle"
    assert ctx.state_meaning and ctx.rules


def test_context_for_insufficient_evidence_has_no_state():
    ctx = build_interpretation_context(assess_day(inputs(checkins=[checkin(energy="low")])))
    assert ctx.status == "insufficient_evidence" and ctx.state is None and ctx.confidence is None
    assert ctx.missing == ["demand"] and ctx.next_actions == ["check_in", "add_todays_tasks"]


def test_uncertain_context_lists_possible_states_and_demand_range():
    a = assess_day(inputs(cal=calendar((9, 10)), checkins=[checkin(energy="low", demand="heavy")]))
    ctx = build_interpretation_context(a)
    assert ctx.status == "uncertain" and ctx.state is None
    assert ctx.possible_states == ["Balanced", "Strained", "Overloaded"]
    assert ctx.demand["range"] == ["light", "heavy"] and ctx.demand["band"] is None
    assert any("never pick one" in r for r in ctx.rules)


def test_context_includes_disagreement_sentences():
    a = assess_day(inputs(wearable=[oura(85)], checkins=[checkin(energy="moderate", demand="moderate")]))
    ctx = build_interpretation_context(a)
    assert ctx.disagreements == ["Your Oura data suggests more in the tank than you described. Rhythm is going with how you feel."]
