"""Legacy SQLite → Supabase mapping rules (dry-run planner; no database writes)."""
import datetime as dt
import hashlib
import json
import sqlite3

import pytest

from backend.scripts.plan_sqlite_migration import (
    build_plan, checkin_row_to_checkin, oura_row_to_health_daily, verify_checksum,
)


def test_oura_row_maps_to_normalized_health_with_provenance():
    issues = []
    out = oura_row_to_health_daily({"id": 7, "date": "2026-04-21", "readiness_score": 82.0, "hrv_avg": 41.5,
                                    "total_sleep_hours": 7.25, "resting_heart_rate": 54.0}, issues)
    assert out == {
        "source": "oura", "local_date": dt.date(2026, 4, 21), "readiness": 82.0, "sleep_minutes": 435,
        "hrv_ms": 41.5, "hrv_method": "rmssd", "resting_hr": 54.0,
        "source_record_id": "sqlite:oura_readings:7", "import_batch": "sqlite-legacy-2026-04-21",
    }
    assert issues == []


def test_nan_and_out_of_range_values_are_dropped_not_guessed():
    issues = []
    out = oura_row_to_health_daily({"id": 1, "date": "2026-01-01", "readiness_score": 140,
                                    "hrv_avg": float("nan"), "resting_heart_rate": 55}, issues)
    assert out["readiness"] is None and out["hrv_ms"] is None and out["hrv_method"] is None
    assert out["resting_hr"] == 55 and len(issues) == 2


def test_rows_with_nothing_usable_are_skipped_and_reported():
    issues = []
    assert oura_row_to_health_daily({"id": 2, "date": "2026-01-04", "sleep_score": 70}, issues) is None
    assert "no usable values" in issues[-1]


def test_legacy_checkins_keep_friction_as_history_only():
    out = checkin_row_to_checkin({"id": 3, "date": "2026-02-20", "friction_rating": 7,
                                  "note": "long day", "recorded_at": "2026-02-20 18:00:00"}, [])
    assert out["legacy_friction"] == 7 and out["source"] == "legacy_import"
    assert out["recorded_at"].tzinfo == dt.timezone.utc
    assert "energy" not in out and "perceived_demand" not in out


def _legacy_db(path):
    conn = sqlite3.connect(path)
    conn.executescript("""
        create table oura_readings (id integer primary key, date text, readiness_score real, hrv_avg real,
            sleep_score real, total_sleep_hours real, resting_heart_rate real, activity_score real);
        create table checkins (id integer primary key, date text, friction_rating integer, note text, recorded_at text);
        create table apple_health_readings (id integer primary key);
        create table daily_scores (id integer primary key);
        create table suggestions (id integer primary key);
        create table oura_tokens (id integer primary key);
        create table gcal_tokens (id integer primary key);
        insert into oura_readings (id, date, readiness_score) values (1, '2026-04-20', 70), (2, '2026-04-21', 85);
        insert into checkins values (1, '2026-04-21', 4, null, '2026-04-21 08:00:00');
        insert into daily_scores (id) values (1), (2);
    """)
    conn.commit()
    conn.close()


def test_plan_reads_without_writing_and_lists_what_is_not_migrated(tmp_path):
    db = tmp_path / "legacy.db"
    _legacy_db(db)
    before = db.read_bytes()
    with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as conn:
        plan = build_plan(conn)
    assert len(plan.health_daily) == 2 and len(plan.checkins) == 1
    assert "recomputed" in plan.not_migrated["daily_scores"]
    assert db.read_bytes() == before


def test_checksum_mismatch_refuses_to_plan(tmp_path):
    db = tmp_path / "copy.db"
    db.write_bytes(b"original")
    manifest = tmp_path / "MANIFEST.json"
    manifest.write_text(json.dumps({"files": {"copy.db": {"sha256_file": hashlib.sha256(b"original").hexdigest()}}}))
    verify_checksum(db, manifest)
    db.write_bytes(b"tampered")
    with pytest.raises(SystemExit, match="Checksum mismatch"):
        verify_checksum(db, manifest)
