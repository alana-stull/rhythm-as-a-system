"""Demand: calendar, tasks and perceived demand — only what is actually known."""
import pytest

from backend.engine import DEFAULT_THRESHOLDS as T
from backend.engine.demand import assess_demand
from backend.engine.types import CalendarBlock, Confidence, DemandBand, EvidenceKind, UnusedReason
from backend.tests.engine_fixtures import DAY, YESTERDAY, at, calendar, checkin, inputs, task


def dem(**kw):
    return assess_demand(inputs(**kw), T)


def test_nothing_known_is_no_demand_not_light_demand():
    d, unused = dem()
    assert d.band is None and d.band_range is None and d.confidence is None and d.basis == ()
    assert d.scheduled_minutes is None and d.estimated_task_minutes is None
    assert not unused


def test_overlaps_merge_and_excluded_events_do_not_count():
    extra = (
        CalendarBlock(id="allday", start=at(0), end=at(24), all_day=True),
        CalendarBlock(id="free", start=at(13), end=at(14), busy=False),
        CalendarBlock(id="declined", start=at(15), end=at(16), declined=True),
    )
    d, _ = dem(cal=calendar((9, 11), (10, 12), extra=extra))
    assert d.scheduled_minutes == 180
    assert d.evidence[0].display == "3h scheduled"


def test_blocks_are_clipped_to_the_local_day():
    d, _ = dem(cal=calendar((-2, 1), (23, 26)))
    assert d.scheduled_minutes == 120


def test_empty_calendar_is_evidence_of_no_events_not_of_a_light_day():
    d, _ = dem(cal=calendar())
    assert d.scheduled_minutes == 0 and d.band is None and d.band_range is None
    (e,) = d.evidence
    assert e.used and e.quantity == 0 and e.display == "Nothing scheduled on your calendar"


def test_empty_calendar_still_counts_as_zero_alongside_other_evidence():
    d, _ = dem(cal=calendar(), checkins=[checkin(demand="heavy")])
    assert d.band == DemandBand.HEAVY and d.disagreement is None and d.scheduled_minutes == 0


def test_stale_calendar_is_reported_not_used():
    d, unused = dem(cal=calendar((9, 17), synced_hours_ago=30))
    assert d.band is None and d.scheduled_minutes is None
    assert unused[0].kind == EvidenceKind.CALENDAR_DEMAND and unused[0].unused_reason == UnusedReason.STALE


@pytest.mark.parametrize("spans, band", [
    ([(9, 11)], "light"),             # 120
    ([(9, 12)], "moderate"),          # 180: boundary
    ([(9, 15)], "moderate"),          # 360: boundary
    ([(9, 15), (16, 16.5)], "heavy"),  # 390
])
def test_calendar_minutes_bands(spans, band):
    d, _ = dem(cal=calendar(*spans))
    assert d.band == DemandBand(band) and d.confidence == Confidence.MEDIUM


def test_unestimated_tasks_never_get_minutes():
    d, _ = dem(tasks=[task("a", "deep"), task("b", "moderate"), task("c")])
    assert d.estimated_task_minutes is None and d.unestimated_task_count == 3
    assert d.unknown_effort_task_count == 1
    assert not any(e.unit == "minutes" for e in d.evidence)
    assert d.evidence[0].display == "3 tasks for today (1 deep) · 3 without an estimate · 1 without an effort level"
    assert d.band == DemandBand.MODERATE  # 3 + 2 points; the unsized, effortless task adds nothing


@pytest.mark.parametrize("efforts, band", [
    (["light", "light", "light"], "light"),        # 3 points
    (["deep", "light"], "moderate"),               # 4
    (["deep", "deep", "moderate"], "heavy"),       # 8
])
def test_unestimated_tasks_use_effort_points(efforts, band):
    d, _ = dem(tasks=[task(str(i), e) for i, e in enumerate(efforts)])
    assert d.band == DemandBand(band) and d.confidence == Confidence.LOW


def test_tasks_with_neither_estimate_nor_effort_stay_visible_but_set_no_band():
    d, _ = dem(tasks=[task(str(i)) for i in range(4)])
    assert d.band_range is None and d.confidence is None
    assert d.task_count == 4 and d.basis == (EvidenceKind.TASK_DEMAND,)
    assert d.evidence[0].display == "4 tasks for today · 4 without an estimate · 4 without an effort level"


def test_estimate_without_effort_is_a_range_not_assumed_moderate():
    d, _ = dem(tasks=[task("a", None, 240)])  # 120 (as light) .. 360 (as deep) weighted
    assert d.band is None and d.band_range == (DemandBand.LIGHT, DemandBand.MODERATE)
    assert d.confidence == Confidence.LOW and d.estimated_task_minutes == 240


def test_perceived_demand_inside_the_known_range_settles_it():
    d, _ = dem(tasks=[task("a", None, 240)], checkins=[checkin(demand="moderate")])
    assert d.band == DemandBand.MODERATE and d.disagreement is None and d.confidence == Confidence.MEDIUM


def test_estimates_are_weighted_by_effort():
    d, _ = dem(tasks=[task("a", "deep", 240)])  # 360 weighted
    assert d.band == DemandBand.MODERATE and d.estimated_task_minutes == 240
    d, _ = dem(tasks=[task("a", "deep", 241)])
    assert d.band == DemandBand.HEAVY


def test_calendar_and_tasks_combine():
    d, _ = dem(cal=calendar((9, 14)), tasks=[task("a", "deep", 60)])  # 300 + 90
    assert d.band == DemandBand.HEAVY and d.confidence == Confidence.MEDIUM
    assert set(d.basis) == {EvidenceKind.CALENDAR_DEMAND, EvidenceKind.TASK_DEMAND}


def test_mixed_tasks_take_the_heavier_scale_and_keep_real_quantities():
    d, _ = dem(tasks=[task("a", "light", 30), task("b", "deep", 60), task("c", "deep"), task("d", "deep"), task("e", "deep")])
    assert d.band == DemandBand.HEAVY  # minutes light (105 weighted), points heavy (9)
    assert d.evidence[0].display == "5 tasks for today (4 deep) · 1h 30m estimated · 3 without an estimate"


def test_only_tasks_for_today_count():
    d, _ = dem(tasks=[
        task("today", "deep"),
        task("due", "deep", focus_on=None, due_on=DAY),
        task("overdue", "deep", focus_on=None, due_on=YESTERDAY),
        task("rescheduled", "deep", focus_on=DAY, due_on=YESTERDAY),
        task("later", "deep", focus_on=None),
        task("dropped", "deep", let_go=True),
    ])
    assert d.task_count == 3 and set(d.evidence[0].record_ids) == {"today", "due", "rescheduled"}


def test_perceived_only_is_medium_confidence():
    d, _ = dem(checkins=[checkin(demand="very_heavy")])
    assert d.band == DemandBand.HEAVY and d.confidence == Confidence.MEDIUM
    assert d.basis == (EvidenceKind.SELF_REPORT,)


def test_perceived_agreeing_with_calendar_is_high_confidence():
    d, _ = dem(cal=calendar((9, 12)), checkins=[checkin(demand="moderate")])
    assert d.band == DemandBand.MODERATE and d.confidence == Confidence.HIGH and d.disagreement is None


def test_perceived_agreeing_with_tasks_alone_stays_medium():
    d, _ = dem(tasks=[task("a", "deep"), task("b", "light")], checkins=[checkin(demand="moderate")])
    assert d.confidence == Confidence.MEDIUM


def test_disagreement_keeps_a_range_instead_of_picking_the_heavier():
    d, _ = dem(cal=calendar((9, 10)), checkins=[checkin(demand="heavy")])
    assert d.band is None and d.band_range == (DemandBand.LIGHT, DemandBand.HEAVY)
    assert d.known_range == (DemandBand.LIGHT, DemandBand.LIGHT) and d.reported_band == DemandBand.HEAVY
    dis = d.disagreement
    assert dis.resolution == "kept_as_range" and dis.other_is_connected and dis.strong and dis.reported_is_higher
    assert dis.other_source == "calendar" and d.confidence == Confidence.LOW


def test_lighter_report_than_tasks_is_also_a_range_and_marked_not_connected():
    d, _ = dem(tasks=[task("a", "deep", 300)], checkins=[checkin(demand="light")])
    assert d.band is None and d.band_range == (DemandBand.LIGHT, DemandBand.HEAVY)
    assert d.disagreement.other_source == "tasks" and not d.disagreement.reported_is_higher
    assert not d.disagreement.other_is_connected


def test_adjacent_disagreement_spans_two_bands_at_medium_confidence():
    d, _ = dem(cal=calendar((9, 12)), checkins=[checkin(demand="heavy")])
    assert d.band_range == (DemandBand.MODERATE, DemandBand.HEAVY) and d.confidence == Confidence.MEDIUM
    assert not d.disagreement.strong
