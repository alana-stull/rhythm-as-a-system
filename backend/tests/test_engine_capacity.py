"""Capacity: wearable evidence vs self-reported energy, kept distinct."""
import dataclasses

import pytest

from backend.engine import DEFAULT_THRESHOLDS as T
from backend.engine.capacity import assess_capacity
from backend.engine.types import CapacityAssessment, CapacityBand, Confidence, EvidenceKind, UnusedReason
from backend.tests.engine_fixtures import (
    YESTERDAY, apple_history, apple_today, checkin, inputs, oura,
)


def cap(**kw):
    return assess_capacity(inputs(**kw), T)


@pytest.mark.parametrize("energy, band", [
    ("very_low", "low"), ("low", "low"), ("moderate", "moderate"), ("high", "high"), ("very_high", "high"),
])
def test_energy_maps_to_capacity_band_at_medium_confidence(energy, band):
    c, _ = cap(checkins=[checkin(energy=energy)])
    assert c.band == CapacityBand(band)
    assert c.confidence == Confidence.MEDIUM
    assert c.basis == (EvidenceKind.SELF_REPORT,)
    assert c.wearable_band is None and c.reported_band == CapacityBand(band)


@pytest.mark.parametrize("readiness, band", [(0, "low"), (59.9, "low"), (60, "moderate"), (79.9, "moderate"), (80, "high"), (100, "high")])
def test_readiness_is_wearable_evidence_with_carried_over_cutoffs(readiness, band):
    c, _ = cap(wearable=[oura(readiness)])
    assert c.wearable_band == CapacityBand(band)
    assert c.band == CapacityBand(band)
    assert c.confidence == Confidence.MEDIUM


def test_readiness_is_never_presented_as_capacity():
    fields = {f.name for f in dataclasses.fields(CapacityAssessment)}
    assert not fields & {"score", "value", "readiness", "recovery_score"}
    c, _ = cap(wearable=[oura(82)])
    (e,) = c.evidence
    assert e.kind == EvidenceKind.WEARABLE_MEASUREMENT and e.signal == "readiness"
    assert e.display == "Oura readiness 82" and e.quantity == 82  # real quantity, labelled as what it is
    assert "capacity" not in e.display.lower()


def test_readiness_components_are_not_double_counted():
    c, unused = cap(wearable=[oura(85, sleep_minutes=300, hrv_ms=20, hrv_method="rmssd", resting_hr=80)])
    assert [e.signal for e in c.evidence] == ["readiness"]
    assert not unused


def test_agreement_raises_confidence():
    c, _ = cap(wearable=[oura(85)], checkins=[checkin(energy="high")])
    assert c.band == CapacityBand.HIGH and c.confidence == Confidence.HIGH
    assert c.disagreement is None
    assert set(c.basis) == {EvidenceKind.WEARABLE_MEASUREMENT, EvidenceKind.SELF_REPORT}


def test_disagreement_keeps_both_follows_person_and_lowers_confidence():
    c, _ = cap(wearable=[oura(85)], checkins=[checkin(energy="moderate")])
    assert c.band == CapacityBand.MODERATE
    assert c.wearable_band == CapacityBand.HIGH and c.reported_band == CapacityBand.MODERATE
    assert c.confidence == Confidence.MEDIUM
    d = c.disagreement
    assert (d.domain, d.other_level, d.other_source, d.reported_level) == ("capacity", "high", "oura", "moderate")
    assert d.other_is_connected and d.resolution == "followed_self_report" and not d.strong
    assert not d.reported_is_higher
    assert {e.kind for e in c.evidence} == {EvidenceKind.WEARABLE_MEASUREMENT, EvidenceKind.SELF_REPORT}


def test_strong_disagreement_is_low_confidence():
    c, _ = cap(wearable=[oura(90)], checkins=[checkin(energy="very_low")])
    assert c.band == CapacityBand.LOW and c.confidence == Confidence.LOW and c.disagreement.strong


def test_stale_wearable_is_not_used_but_reported():
    c, unused = cap(wearable=[oura(90, day=YESTERDAY)])
    assert c.band is None and c.confidence is None and c.evidence == ()
    (u,) = unused
    assert u.unused_reason == UnusedReason.STALE and u.observed_for == YESTERDAY and not u.used


def test_nan_readiness_is_missing_not_zero():
    c, _ = cap(wearable=[oura(float("nan"))])
    assert c.band is None


def test_components_need_a_personal_baseline():
    history = apple_history(days=3)
    c, unused = cap(wearable=[*history, apple_today(sleep=300, hrv=30, rhr=70)])
    assert c.band is None
    assert {u.unused_reason for u in unused} == {UnusedReason.NO_BASELINE}


def test_components_below_usual_read_low():
    c, _ = cap(wearable=[*apple_history(), apple_today(sleep=300, hrv=35, rhr=66)])
    assert c.band == CapacityBand.LOW and c.confidence == Confidence.MEDIUM
    assert all(e.kind == EvidenceKind.WEARABLE_MEASUREMENT for e in c.evidence)
    assert c.evidence[0].display == "Slept 5h (usual 7h 30m)"


def test_components_above_usual_read_high():
    c, _ = cap(wearable=[*apple_history(), apple_today(sleep=460, hrv=60, rhr=56)])
    assert c.band == CapacityBand.HIGH


def test_longer_sleep_alone_is_neutral():
    c, _ = cap(wearable=[*apple_history(), apple_today(sleep=600)])
    assert c.band == CapacityBand.MODERATE and c.confidence == Confidence.LOW  # one signal


def test_hrv_is_never_compared_across_methods():
    c, unused = cap(wearable=[*apple_history(hrv_method="sdnn"), apple_today(hrv=20, hrv_method="rmssd")])
    assert c.band is None
    assert unused[0].signal == "hrv" and unused[0].unused_reason == UnusedReason.NO_BASELINE


def test_composite_source_wins_and_other_is_superseded():
    c, unused = cap(wearable=[*apple_history(), apple_today(sleep=300, hrv=30, rhr=70), oura(85)])
    assert c.band == CapacityBand.HIGH and c.evidence[0].source == "oura"
    assert [u.unused_reason for u in unused] == [UnusedReason.SUPERSEDED]


def test_latest_energy_answer_wins_and_earlier_stays_out_of_current_read():
    c, _ = cap(checkins=[checkin(energy="very_high", hour=7, id="a"), checkin(energy="low", hour=10, id="b")])
    assert c.band == CapacityBand.LOW and c.evidence[0].record_ids == ("b",)


def test_later_demand_only_checkin_does_not_erase_energy():
    c, _ = cap(checkins=[checkin(energy="high", hour=7, id="a"), checkin(demand="heavy", hour=10, id="b")])
    assert c.band == CapacityBand.HIGH and c.evidence[0].record_ids == ("a",)


def test_future_and_other_day_checkins_are_ignored():
    c, _ = cap(checkins=[checkin(energy="low", hour=15), checkin(energy="low", day=YESTERDAY)], now_hour=12)
    assert c.band is None


# ── "How rested" (engine 2.1) ─────────────────────────────────────────────────

@pytest.mark.parametrize("rested,band", [
    ("very_low", CapacityBand.LOW), ("low", CapacityBand.LOW), ("moderate", CapacityBand.MODERATE),
    ("high", CapacityBand.HIGH), ("very_high", CapacityBand.HIGH),
])
def test_rested_alone_is_self_reported_capacity(rested, band):
    c, _ = cap(checkins=(checkin(rested=rested),))
    assert c.band == band and c.reported_band == band and c.confidence == Confidence.MEDIUM
    assert c.basis == (EvidenceKind.SELF_REPORT,)
    [e] = c.evidence
    assert e.signal == "rested" and e.kind == EvidenceKind.SELF_REPORT and e.record_ids == ("c1",)


@pytest.mark.parametrize("energy,rested,band", [
    ("high", "high", CapacityBand.HIGH),
    ("high", "very_low", CapacityBand.MODERATE),     # two bands apart: midpoint
    ("low", "very_high", CapacityBand.MODERATE),
    ("high", "moderate", CapacityBand.HIGH),         # one band apart: energy (right now) wins the tie
    ("moderate", "low", CapacityBand.MODERATE),
    ("low", "moderate", CapacityBand.LOW),
])
def test_rested_and_energy_combine_without_erasing_either(energy, rested, band):
    c, _ = cap(checkins=(checkin(energy=energy, rested=rested),))
    assert c.band == band
    assert {e.signal for e in c.evidence} == {"energy", "rested"}


def test_rested_and_energy_each_use_their_latest_answer():
    c, _ = cap(checkins=(
        checkin(energy="low", rested="very_low", hour=7, id="early"),
        checkin(energy="high", hour=10, id="later"),
    ))
    by_signal = {e.signal: e for e in c.evidence}
    assert by_signal["energy"].record_ids == ("later",) and by_signal["rested"].record_ids == ("early",)
    assert c.band == CapacityBand.MODERATE  # high + low → midpoint


def test_rested_counts_against_a_disagreeing_wearable_as_the_persons_report():
    c, _ = cap(checkins=(checkin(energy="high", rested="high"),), wearable=(oura(readiness=40),))
    assert c.band == CapacityBand.HIGH and c.disagreement is not None
    assert c.disagreement.resolution == "followed_self_report"
