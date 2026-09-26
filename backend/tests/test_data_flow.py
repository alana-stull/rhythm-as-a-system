"""
Characterization tests for the paths that write daily_scores today:
CSV upload, check-in, Oura API sync, Google Calendar sync, and the
exposure PATCH.

Two kinds of test live here:
- Plain tests pin current behavior so the M1 migration can't change data
  flow by accident.
- `xfail` tests (strict, see pytest.ini) assert the behavior we WANT for
  known bugs. They fail today, as expected. When M1's single recompute path
  fixes a bug, its test starts passing, strict mode turns that into a
  failure, and the marker has to be removed deliberately.
"""
import datetime as dt
import json

import pytest

from backend.models import DailyScore, OuraReading
from backend.routers import gcal_oauth, oura_oauth

DAY = dt.date(2026, 4, 1)


def _upload_oura_readiness(client, readiness=82, day=DAY):
    body = f"date,score\n{day.isoformat()},{readiness}\n".encode()
    resp = client.post("/upload/oura", files={"file": ("readiness.csv", body, "text/csv")})
    assert resp.status_code == 200, resp.text
    return resp


def _score(db, day=DAY) -> DailyScore | None:
    db.expire_all()
    return db.query(DailyScore).filter(DailyScore.date == day).first()


# ── Upload ───────────────────────────────────────────────────────────────────

def test_oura_upload_creates_daily_score(client, db):
    _upload_oura_readiness(client, readiness=82)
    row = _score(db)
    # 0.60*82 + 0.25*50 (no HRV) + 0.15*50 (no sleep score) = 69.2
    assert row.recovery_score == 69.2
    assert row.exposure_score is None
    assert row.friction_score is None
    assert row.condition == "Balanced"
    assert json.loads(row.data_sources) == ["oura"]


def test_upload_rejects_non_csv(client):
    resp = client.post("/upload/oura", files={"file": ("data.txt", b"date,score\n", "text/plain")})
    assert resp.status_code == 400


# ── Check-in ─────────────────────────────────────────────────────────────────

def test_checkin_after_upload_adds_friction_and_keeps_recovery(client, db):
    _upload_oura_readiness(client, readiness=82)
    resp = client.post("/checkin", json={"date": DAY.isoformat(), "friction_rating": 10})
    assert resp.status_code == 200
    row = _score(db)
    assert row.recovery_score == 69.2
    assert row.friction_score == 100.0
    assert row.condition == "Overloaded"
    assert json.loads(row.data_sources) == ["oura", "checkin"]


def test_checkin_without_wearable_creates_a_row_that_latest_ignores(client, db):
    resp = client.post("/checkin", json={"date": DAY.isoformat(), "friction_rating": 3})
    assert resp.status_code == 200
    row = _score(db)
    assert row.recovery_score is None
    assert row.condition == "Balanced"
    assert json.loads(row.data_sources) == ["checkin"]
    # /scores/latest only returns rows that have recovery, so a user without
    # a wearable gets a 404 even after checking in.
    assert client.get("/scores/latest").status_code == 404


@pytest.mark.xfail(reason="KNOWN BUG: check-in reclassifies with exposure=None, ignoring stored calendar exposure")
def test_checkin_reclassification_uses_stored_exposure(client, db):
    # Check-in recomputes recovery from the reading tables, so the reading
    # has to exist: 0.60*100 + 0.25*50 + 0.15*100 = 87.5.
    db.add(OuraReading(date=DAY, readiness_score=100.0, sleep_score=100.0))
    db.add(DailyScore(date=DAY, recovery_score=87.5, exposure_score=100.0, condition="Balanced", data_sources='["oura", "gcal"]'))
    db.commit()
    client.post("/checkin", json={"date": DAY.isoformat(), "friction_rating": 5})
    # load = mean(100, 44.4) = 72.2 → not Aligned → Balanced. Today: load = 44.4 → Aligned.
    assert _score(db).condition == "Balanced"


# ── Google Calendar sync ─────────────────────────────────────────────────────

def test_calendar_exposure_is_skipped_when_no_wearable_row_exists(db):
    gcal_oauth._upsert_exposure(db, DAY, 50.0)
    db.commit()
    assert _score(db) is None


def test_calendar_exposure_patches_existing_row_and_reclassifies(client, db):
    _upload_oura_readiness(client, readiness=82)
    gcal_oauth._upsert_exposure(db, DAY, 90.0)
    db.commit()
    row = _score(db)
    assert row.exposure_score == 90.0
    assert row.condition == "Overloaded"
    assert json.loads(row.data_sources) == ["oura", "gcal"]


@pytest.mark.xfail(reason="KNOWN BUG: Oura CSV upload overwrites exposure_score with None")
def test_oura_upload_preserves_calendar_exposure(client, db):
    _upload_oura_readiness(client, readiness=82)
    gcal_oauth._upsert_exposure(db, DAY, 90.0)
    db.commit()
    _upload_oura_readiness(client, readiness=82)
    assert _score(db).exposure_score == 90.0


@pytest.mark.xfail(reason="KNOWN BUG: Oura API sync overwrites exposure_score with None")
def test_oura_sync_preserves_calendar_exposure(client, db):
    _upload_oura_readiness(client, readiness=82)
    gcal_oauth._upsert_exposure(db, DAY, 90.0)
    db.commit()
    oura_oauth._upsert_daily_score(db, DAY, {"readiness_score": 82, "sleep_score": 70, "hrv_avg": None})
    db.commit()
    assert _score(db).exposure_score == 90.0


# ── Oura API sync ────────────────────────────────────────────────────────────

def test_oura_sync_scoring_uses_readiness_and_sleep_score(db):
    oura_oauth._upsert_daily_score(db, DAY, {"readiness_score": 80, "sleep_score": 70, "hrv_avg": None})
    db.commit()
    row = _score(db)
    assert row.recovery_score == 71.0
    assert json.loads(row.data_sources) == ["oura"]


# ── Exposure PATCH (removed in M1) ───────────────────────────────────────────

def test_exposure_patch_requires_a_row_for_today(client):
    assert client.patch("/scores/today/exposure", json={"exposure": 60}).status_code == 404


def test_exposure_patch_overwrites_stored_exposure(client, db):
    db.add(DailyScore(date=dt.date.today(), recovery_score=70.0, exposure_score=20.0, condition="Balanced", data_sources='["oura"]'))
    db.commit()
    resp = client.patch("/scores/today/exposure", json={"exposure": 80})
    assert resp.json()["condition"] == "Overloaded"
    assert _score(db, dt.date.today()).exposure_score == 80.0


# ── Readers ──────────────────────────────────────────────────────────────────

def test_latest_returns_most_recent_day_with_recovery_even_if_old(client):
    _upload_oura_readiness(client, readiness=82, day=dt.date(2026, 4, 21))
    resp = client.get("/scores/latest")
    assert resp.status_code == 200
    # No staleness signal: an April row is returned as "latest" with nothing
    # saying it isn't today. M1's /today adds as_of_date / is_today.
    assert resp.json()["date"] == "2026-04-21"
    assert "is_today" not in resp.json()


def test_history_returns_ascending_window(client):
    today = dt.date.today()
    for offset in (3, 1, 2):
        _upload_oura_readiness(client, readiness=70, day=today - dt.timedelta(days=offset))
    entries = client.get("/scores/history?days=7").json()["entries"]
    assert [e["date"] for e in entries] == sorted(e["date"] for e in entries)
    assert len(entries) == 3


def test_generate_suggestion_needs_scores_and_recovery(client, db):
    assert client.post("/suggestions/generate").status_code == 404
    db.add(DailyScore(date=DAY, recovery_score=None, condition="Balanced", data_sources='["checkin"]'))
    db.commit()
    assert client.post("/suggestions/generate").status_code == 422


def test_lamp_returns_lowercase_state(client):
    assert client.get("/lamp").status_code == 404
    _upload_oura_readiness(client, readiness=82, day=dt.date.today())
    body = client.get("/lamp").json()
    assert body["state"] == "balanced"
    assert body["recovery"] == 69.2
