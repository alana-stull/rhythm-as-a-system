"""
Characterization tests for the CSV parsers. The upload routes are frozen,
but the Oura parser is the likely tool for any one-off backfill.
"""
import datetime as dt
import math

import pytest

from backend.services.apple_health_parser import parse_apple_health_csv
from backend.services.oura_parser import parse_oura_csv


def _csv(text: str) -> bytes:
    return text.strip().encode()


def test_oura_sleep_csv_is_autodetected_and_normalized():
    rows = parse_oura_csv(_csv("""
bedtime_start,score,total,rmssd,hr_lowest
2026-04-01T23:10:00,78,27000,48,52
2026-04-02T23:40:00,65,21600,400,54
"""))
    assert rows[0] == {"date": dt.date(2026, 4, 1), "sleep_score": 78, "total_sleep_hours": 7.5, "hrv_avg": 48, "resting_heart_rate": 52}
    assert rows[1]["total_sleep_hours"] == 6.0


def test_oura_out_of_range_hrv_leaks_as_nan_not_none():
    # Current behavior, not intended behavior: the sanity filter sets
    # rmssd > 300 to None, but pandas keeps it as NaN in a float column and
    # df.where(..., None) does not convert it back. Downstream,
    # _normalize_hrv(nan) returns 0. The parser is frozen; M2 replaces this path.
    rows = parse_oura_csv(_csv("""
bedtime_start,score,total,rmssd
2026-04-01T23:10:00,78,27000,48
2026-04-02T23:40:00,65,21600,400
"""))
    assert math.isnan(rows[1]["hrv_avg"])


def test_oura_readiness_csv_maps_score_to_readiness():
    rows = parse_oura_csv(_csv("""
date,score,hrv_balance
2026-04-01,82,70
"""))
    assert rows == [{"date": dt.date(2026, 4, 1), "readiness_score": 82, "hrv_balance": 70}]


def test_oura_keeps_last_row_per_date():
    rows = parse_oura_csv(_csv("""
date,score
2026-04-01,60
2026-04-01,82
"""))
    assert [r["readiness_score"] for r in rows] == [82]


def test_oura_without_date_column_raises():
    with pytest.raises(ValueError, match="date"):
        parse_oura_csv(_csv("score\n80"))


def test_apple_health_aggregates_segments_per_day():
    rows = parse_apple_health_csv(_csv("""
Date,Asleep (hr),Heart Rate Variability (ms),Resting Heart Rate (bpm),Steps
2026-04-01,3.5,40,60,4000
2026-04-01,4.0,50,62,2000
2026-04-02,7.0,45,58,9000
"""))
    assert rows == [
        {"date": dt.date(2026, 4, 1), "sleep_hours": 7.5, "hrv_avg": 45.0, "resting_heart_rate": 61.0, "step_count": 6000},
        {"date": dt.date(2026, 4, 2), "sleep_hours": 7.0, "hrv_avg": 45.0, "resting_heart_rate": 58.0, "step_count": 9000},
    ]


def test_apple_health_without_date_column_raises():
    with pytest.raises(ValueError, match="date"):
        parse_apple_health_csv(_csv("Steps\n100"))
