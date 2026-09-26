"""
Characterization tests for the current scoring functions.

These pin down what the code does TODAY so the M1 migration can't change
data flow by accident. They are guardrails, not product requirements:
several of these values come from known-flawed assumptions (missing
signals imputed as 50, readiness plus HRV double counting, a fixed HRV
baseline). Capacity engine v2 (M2) is expected to replace this module,
and these tests should be rewritten or deleted along with it.
"""
import pytest

from backend.services.gcal_api import compute_exposure_from_events
from backend.services.scoring import (
    _normalize_hrv,
    _normalize_rhr,
    _normalize_sleep,
    classify_condition,
    compute_exposure_score,
    compute_friction_score,
    compute_recovery_score,
)


# ── Normalizers ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("hours, expected", [(4, 40.0), (6, 60.0), (7, 70.0), (8, 85.0), (9, 100.0), (10, 90.0), (14, 60.0)])
def test_normalize_sleep(hours, expected):
    assert _normalize_sleep(hours) == pytest.approx(expected)


@pytest.mark.parametrize("hrv, expected", [(0, 50.0), (None, 50.0), (27.5, 35.0), (55, 70.0), (110, 100.0)])
def test_normalize_hrv_uses_fixed_55ms_baseline(hrv, expected):
    assert _normalize_hrv(hrv) == pytest.approx(expected)


@pytest.mark.parametrize("rhr, expected", [(52, 100.0), (60, 60.0), (62, 50.0), (72, 0.0)])
def test_normalize_rhr_uses_fixed_62bpm_baseline(rhr, expected):
    assert _normalize_rhr(rhr) == pytest.approx(expected)


# ── Recovery ─────────────────────────────────────────────────────────────────

def test_oura_readiness_path_imputes_missing_hrv_as_50():
    # This is what every API-synced Oura day looks like today: the sync never
    # receives HRV, so the 0.25 HRV term is a constant 12.5.
    assert compute_recovery_score("oura", readiness_score=80, sleep_score=70) == 71.0


def test_oura_readiness_path_imputes_missing_sleep_as_50():
    assert compute_recovery_score("oura", readiness_score=80) == 0.60 * 80 + 0.25 * 50 + 0.15 * 50


def test_oura_readiness_path_adds_hrv_on_top_of_readiness():
    assert compute_recovery_score("oura", readiness_score=80, hrv_avg=55, sleep_score=70) == 76.0


def test_oura_sleep_only_path():
    assert compute_recovery_score("oura", sleep_score=70, hrv_avg=55) == 70.0


def test_oura_hrv_only_path():
    assert compute_recovery_score("oura", hrv_avg=55) == 70.0


def test_oura_with_no_signals_is_none():
    assert compute_recovery_score("oura") is None


def test_apple_health_all_signals():
    assert compute_recovery_score("apple_health", sleep_hours=8, hrv_avg=55, resting_heart_rate=62) == 72.0


def test_apple_health_imputes_missing_signals_as_50():
    assert compute_recovery_score("apple_health", sleep_hours=8) == 64.0


def test_apple_health_with_no_signals_is_none():
    assert compute_recovery_score("apple_health") is None


def test_unknown_source_is_none():
    assert compute_recovery_score("whoop", readiness_score=90) is None


# ── Exposure ─────────────────────────────────────────────────────────────────

def test_exposure_score_is_none_without_calendar_data():
    assert compute_exposure_score(None) is None
    assert compute_exposure_score({}) is None


def test_exposure_score_formula():
    assert compute_exposure_score({"meeting_hours_today": 4, "deadlines_today": 2}) == 55.0


def _event(start, end, **extra):
    return {"start": {"dateTime": start}, "end": {"dateTime": end}, **extra}


def test_calendar_exposure_is_busy_minutes_over_480():
    events = [_event("2026-09-01T09:00:00Z", "2026-09-01T11:00:00Z")]
    assert compute_exposure_from_events(events) == 25.0


def test_calendar_exposure_skips_declined_and_all_day_events():
    events = [
        _event("2026-09-01T09:00:00Z", "2026-09-01T11:00:00Z"),
        _event("2026-09-01T12:00:00Z", "2026-09-01T13:00:00Z",
               attendees=[{"self": True, "responseStatus": "declined"}]),
        {"start": {"date": "2026-09-01"}, "end": {"date": "2026-09-02"}},
    ]
    assert compute_exposure_from_events(events) == 25.0


def test_calendar_exposure_caps_at_100():
    events = [_event("2026-09-01T00:00:00Z", "2026-09-01T12:00:00Z")]
    assert compute_exposure_from_events(events) == 100.0


# ── Friction ─────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("rating, expected", [(1, 0.0), (5, 44.4), (10, 100.0), (None, None)])
def test_friction_maps_1_to_10_onto_0_to_100(rating, expected):
    assert compute_friction_score(rating) == expected


# ── Condition ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "recovery, exposure, friction, expected",
    [
        (None, 90, 90, "Balanced"),     # no recovery → Balanced regardless of load
        (85, None, None, "Aligned"),
        (70, None, None, "Balanced"),
        (50, None, None, "Strained"),
        (55, 90, None, "Strained"),     # low recovery wins over high load
        (85, 40, None, "Aligned"),
        (85, 60, None, "Balanced"),
        (70, 80, None, "Overloaded"),
        (76, 80, None, "Balanced"),     # Overloaded needs recovery < 75
        (85, 100, 0, "Aligned"),        # exposure and friction are averaged into load
    ],
)
def test_classify_condition(recovery, exposure, friction, expected):
    assert classify_condition(recovery, exposure, friction) == expected


def test_normalize_hrv_turns_nan_into_zero():
    # NaN is truthy, so the "missing" guard doesn't catch it, and
    # max(0.0, nan) returns 0.0. See test_parsers for where NaN comes from.
    assert _normalize_hrv(float("nan")) == 0.0
