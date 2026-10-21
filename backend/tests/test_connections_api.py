"""Oura (per user), Apple Health and Apple Calendar intake. Oura is a fake server; nothing leaves the machine."""
import datetime as dt
import json
import math
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import text

from backend.config import settings
from backend.integrations import health, secrets
from backend.main import app
from backend.routers.connections import get_http
from backend.tests.pg_support import make_user, pg_engine  # noqa: F401
from backend.tests.test_today_api import NOW, TODAY, Clock, api, auth, person  # noqa: F401


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(settings, "oura_redirect_uri", "http://localhost:8000/oura/callback")  # as registered
    monkeypatch.setattr(settings, "oura_v2_redirect_uri", "")
    monkeypatch.setattr(settings, "oura_client_id", "client-id")
    monkeypatch.setattr(settings, "oura_client_secret", "client-secret")
    monkeypatch.setattr(settings, "token_encryption_key", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "oauth_state_secret", "s" * 40)
    secrets._fernet.cache_clear()
    yield
    secrets._fernet.cache_clear()


class FakeOura:
    """Token endpoint + daily_readiness + sleep, with switches for failure modes."""

    def __init__(self):
        self.reject_api = False
        self.reject_next = 0        # reject this many API calls, then accept (a token invalidated early)
        self.refresh_status = 200   # what the token endpoint answers to a refresh
        self.refreshes = 0
        self.seen_tokens = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.url.path == "/oauth/token":
            form = parse_qs(request.content.decode())
            if form["grant_type"] == ["authorization_code"]:
                assert form["redirect_uri"] == ["http://localhost:8000/oura/callback"]  # must match authorize
            if form["grant_type"] == ["refresh_token"]:
                if self.refresh_status != 200:
                    return httpx.Response(self.refresh_status, json={"error": "nope"})
                self.refreshes += 1
                return httpx.Response(200, json={"access_token": f"access-{self.refreshes + 1}",
                                                 "refresh_token": f"refresh-{self.refreshes + 1}", "expires_in": 86400})
            assert form["client_secret"] == ["client-secret"] and form["code"] == ["the-code"]
            return httpx.Response(200, json={"access_token": "access-1", "refresh_token": "refresh-1", "expires_in": 86400})
        self.seen_tokens.append(request.headers["Authorization"])
        if self.reject_api or self.reject_next:
            self.reject_next = max(0, self.reject_next - 1)
            return httpx.Response(401, json={"detail": "expired"})
        day = TODAY.isoformat()
        if request.url.path.endswith("/daily_readiness"):
            return httpx.Response(200, json={"data": [{"id": "r1", "day": day, "score": 84}], "next_token": None})
        if request.url.path.endswith("/sleep"):
            return httpx.Response(200, json={"data": [
                {"id": "s-nap", "day": day, "type": "late_nap", "total_sleep_duration": 1800, "average_hrv": 20},
                {"id": "s1", "day": day, "type": "long_sleep", "total_sleep_duration": 27000,
                 "average_hrv": 48, "lowest_heart_rate": 52},
            ], "next_token": None})
        return httpx.Response(404)


@pytest.fixture
def oura_server():
    fake = FakeOura()
    client = httpx.Client(transport=httpx.MockTransport(fake.handler))
    app.dependency_overrides[get_http] = lambda: client
    yield fake
    client.close()


def connect(api, person):
    url = api.post("/connections/oura/authorize", headers=auth(person)).json()["url"]
    q = parse_qs(urlparse(url).query)
    assert q["scope"] == ["daily"] and q["client_id"] == ["client-id"]
    # Oura sends the browser to the redirect URI registered in the developer app.
    assert q["redirect_uri"] == [settings.oura_redirect_uri]
    path = urlparse(settings.oura_redirect_uri).path
    r = api.get(path, params={"code": "the-code", "state": q["state"][0]}, follow_redirects=False)
    return r


def states(api, person):
    return {c["provider"]: c["state"] for c in api.get("/connections", headers=auth(person)).json()}


# ── Secrets ───────────────────────────────────────────────────────────────────

def test_state_is_bound_to_user_provider_and_time(make_user):
    import uuid
    uid = uuid.uuid4()
    s = secrets.sign_state(uid, "oura", now=1000)
    assert secrets.verify_state(s, "oura", now=1000) == uid
    with pytest.raises(secrets.BadState):
        secrets.verify_state(s, "google_calendar", now=1000)
    with pytest.raises(secrets.BadState):
        secrets.verify_state(s, "oura", now=1000 + secrets.STATE_TTL_SECONDS + 1)
    body, sig = s.split(".")
    forged = secrets._b64(json.dumps({"u": str(uuid.uuid4()), "p": "oura", "n": "x", "e": 9e9}).encode())
    with pytest.raises(secrets.BadState):
        secrets.verify_state(f"{forged}.{sig}", "oura", now=1000)


# ── Oura ──────────────────────────────────────────────────────────────────────

def test_connect_stores_only_encrypted_tokens(api, person, oura_server, pg_engine):
    r = connect(api, person)
    assert r.status_code == 302 and r.headers["location"].endswith("provider=oura&status=connected")
    with pg_engine.connect() as conn:
        row = conn.execute(text("select access_token_enc, refresh_token_enc, scopes from public.connections "
                                "where user_id = :u"), {"u": person}).one()
    assert "access-1" not in row.access_token_enc and secrets.decrypt(row.access_token_enc) == "access-1"
    assert row.scopes == ["daily"]


def test_tampered_or_cancelled_callbacks_store_nothing(api, person, oura_server, pg_engine):
    bad = api.get("/oura/callback", params={"code": "the-code", "state": "x.y"}, follow_redirects=False)
    assert bad.headers["location"].endswith("status=error")
    url = api.post("/connections/oura/authorize", headers=auth(person)).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    cancelled = api.get("/oura/callback", params={"state": state, "error": "access_denied"},
                        follow_redirects=False)
    assert cancelled.headers["location"].endswith("status=cancelled")
    with pg_engine.connect() as conn:
        assert conn.execute(text("select count(*) from public.connections where user_id = :u"),
                            {"u": person}).scalar() == 0


def test_sync_normalizes_and_feeds_today(api, person, oura_server, pg_engine):
    connect(api, person)
    assert states(api, person)["oura"] == "syncing"
    r = api.post("/connections/oura/sync", headers=auth(person))
    assert r.status_code == 200 and r.json()["days_written"] == 1
    with pg_engine.connect() as conn:
        row = conn.execute(text("select readiness, sleep_minutes, hrv_ms, hrv_method, resting_hr from public.health_daily "
                                "where user_id = :u"), {"u": person}).one()
    assert (float(row.readiness), row.sleep_minutes, float(row.hrv_ms), row.hrv_method, float(row.resting_hr)) == \
        (84, 450, 48, "rmssd", 52)  # the long sleep, not the nap
    assert states(api, person)["oura"] == "up_to_date"

    cap = api.get("/today", headers=auth(person)).json()["capacity"]
    assert cap["context"] == "Your Oura readiness is high. Rhythm doesn't know yet what today asks."
    assert "84" not in json.dumps(cap)  # health numbers never shown in reasons


def test_expired_tokens_refresh_and_rejected_tokens_ask_to_reconnect(api, person, oura_server, pg_engine):
    connect(api, person)
    with pg_engine.begin() as conn:
        conn.execute(text("update public.connections set token_expires_at = :t where user_id = :u"),
                     {"u": person, "t": NOW - dt.timedelta(hours=1)})  # the test clock, not the database's
    api.post("/connections/oura/sync", headers=auth(person))
    assert oura_server.refreshes == 1 and oura_server.seen_tokens[-1] == "Bearer access-2"

    oura_server.reject_api = True
    assert api.post("/connections/oura/sync", headers=auth(person)).status_code == 409
    assert states(api, person)["oura"] == "expired"


def _expire(pg_engine, person):
    with pg_engine.begin() as conn:
        conn.execute(text("update public.connections set token_expires_at = :t where user_id = :u"),
                     {"u": person, "t": NOW - dt.timedelta(hours=1)})  # the test clock, not the database's


def test_a_temporary_oura_failure_never_asks_to_reconnect(api, person, oura_server, pg_engine):
    connect(api, person)
    _expire(pg_engine, person)
    oura_server.refresh_status = 503                     # Oura is down while the token needs refreshing
    assert api.post("/connections/oura/sync", headers=auth(person)).status_code == 502
    assert states(api, person)["oura"] == "delayed"      # kept, not "expired"
    oura_server.refresh_status = 200                     # back up: the same refresh token still works
    assert api.post("/connections/oura/sync", headers=auth(person)).status_code == 200
    assert states(api, person)["oura"] == "up_to_date"


def test_only_a_rejected_refresh_asks_to_reconnect(api, person, oura_server, pg_engine):
    connect(api, person)
    _expire(pg_engine, person)
    oura_server.refresh_status = 400                     # invalid_grant: the person revoked access at Oura
    assert api.post("/connections/oura/sync", headers=auth(person)).status_code == 409
    assert states(api, person)["oura"] == "expired"


def test_a_token_rejected_early_is_refreshed_once_before_giving_up(api, person, oura_server):
    connect(api, person)
    oura_server.reject_next = 1
    assert api.post("/connections/oura/sync", headers=auth(person)).status_code == 200
    assert oura_server.refreshes == 1 and states(api, person)["oura"] == "up_to_date"


def test_syncing_a_turned_off_oura_leaves_it_off(api, person, oura_server):
    connect(api, person)
    api.delete("/connections/oura", headers=auth(person))
    assert api.post("/connections/oura/sync", headers=auth(person)).status_code == 409
    assert states(api, person)["oura"] == "off"           # never flipped to "Reconnect"


def test_disconnect_destroys_tokens(api, person, oura_server, pg_engine):
    connect(api, person)
    assert api.delete("/connections/oura", headers=auth(person)).status_code == 204
    with pg_engine.connect() as conn:
        row = conn.execute(text("select status, access_token_enc, refresh_token_enc from public.connections "
                                "where user_id = :u"), {"u": person}).one()
    assert row == ("revoked", None, None)
    assert states(api, person)["oura"] == "off"


def test_oura_unconfigured_is_503_not_a_crash(api, person, monkeypatch):
    monkeypatch.setattr(settings, "oura_client_secret", "")
    assert api.post("/connections/oura/authorize", headers=auth(person)).status_code == 503


# ── Apple Health and Apple Calendar ───────────────────────────────────────────

def test_apple_health_days_are_cleaned_and_kept_as_sdnn(api, person, pg_engine):
    r = api.post("/connections/apple-health/days", headers=auth(person), json={"days": [
        {"local_date": str(TODAY), "sleep_minutes": 420, "hrv_sdnn_ms": 41.5, "resting_hr": 58},
        {"local_date": str(TODAY - dt.timedelta(days=1)), "sleep_minutes": 9999, "resting_hr": 3},  # impossible → dropped
    ]})
    assert r.json()["days_written"] == 1
    with pg_engine.connect() as conn:
        row = conn.execute(text("select hrv_method, hrv_ms from public.health_daily where user_id = :u"),
                           {"u": person}).one()
    assert row.hrv_method == "sdnn" and float(row.hrv_ms) == 41.5
    assert states(api, person)["apple_health"] == "up_to_date"


def test_calendar_upload_replaces_its_range_and_never_takes_titles(api, person, pg_engine):
    def ev(i, h):
        start = dt.datetime.combine(TODAY, dt.time(h), tzinfo=NOW.tzinfo)
        return {"external_id": f"e{i}", "calendar_ref": "hash-1", "starts_at": start.isoformat(),
                "ends_at": (start + dt.timedelta(hours=1)).isoformat()}
    day = dt.datetime.combine(TODAY, dt.time(), tzinfo=NOW.tzinfo)
    rng = {"range_start": day.isoformat(), "range_end": (day + dt.timedelta(days=1)).isoformat()}
    api.post("/connections/apple-calendar/events", headers=auth(person), json={**rng, "events": [ev(1, 9), ev(2, 15)]})
    api.post("/connections/apple-calendar/events", headers=auth(person), json={**rng, "events": [ev(2, 16)]})
    with pg_engine.connect() as conn:
        rows = conn.execute(text("select external_id, title from public.external_events where user_id = :u"),
                            {"u": person}).all()
    assert rows == [("e2", None)]  # e1 was deleted on the device; e2 moved
    titled = {**rng, "events": [{**ev(3, 10), "title": "Therapy"}]}
    assert api.post("/connections/apple-calendar/events", headers=auth(person), json=titled).status_code == 422
    assert states(api, person)["apple_calendar"] == "up_to_date"


def _cal_upload(api, person, *events, day=TODAY):
    start = dt.datetime.combine(day - dt.timedelta(days=1), dt.time(), tzinfo=NOW.tzinfo)
    evs = [{"external_id": eid, "calendar_ref": "hash-1",
            "starts_at": dt.datetime.combine(d, dt.time(h), tzinfo=NOW.tzinfo).isoformat(),
            "ends_at": dt.datetime.combine(d, dt.time(h + 1), tzinfo=NOW.tzinfo).isoformat()} for eid, d, h in events]
    return api.post("/connections/apple-calendar/events", headers=auth(person), json={
        "range_start": start.isoformat(), "range_end": (start + dt.timedelta(days=3)).isoformat(), "events": evs})


def test_revoked_calendar_access_drops_upcoming_events_but_keeps_history(api, person, pg_engine):
    yesterday = TODAY - dt.timedelta(days=1)
    _cal_upload(api, person, ("past", yesterday, 10), ("now", TODAY, 15), ("next", TODAY + dt.timedelta(days=1), 9))
    assert api.get("/today", headers=auth(person)).json()["schedule"]["calendar_connected"] is True

    assert api.delete("/connections/apple-calendar", headers=auth(person)).status_code == 204
    with pg_engine.connect() as conn:
        left = conn.execute(text("select external_id from public.external_events where user_id = :u"),
                            {"u": person}).scalars().all()
    assert left == ["past"]                                   # history kept for Insights
    today = api.get("/today", headers=auth(person)).json()
    assert today["schedule"]["calendar_connected"] is False   # never counted toward demand
    assert today["schedule"]["upcoming"] == []                # nothing stale shown
    assert states(api, person)["apple_calendar"] == "off"

    _cal_upload(api, person, ("now", TODAY, 15))              # access granted again: the next sync reconnects
    assert states(api, person)["apple_calendar"] == "up_to_date"


def test_a_calendar_shows_from_one_source_only(api, person, pg_engine):
    _cal_upload(api, person, ("a1", TODAY, 15))
    with pg_engine.begin() as conn:                           # the same meeting, synced earlier from Google
        conn.execute(text("insert into public.external_events (user_id, source, calendar_ref, external_id, starts_at, "
                          "ends_at, synced_at) values (:u, 'google_calendar', 'g', 'g1', :s, :e, now() - interval '1 day')"),
                     {"u": person, "s": dt.datetime.combine(TODAY, dt.time(15), tzinfo=NOW.tzinfo),
                      "e": dt.datetime.combine(TODAY, dt.time(16), tzinfo=NOW.tzinfo)})
    plan = api.get("/plan", headers=auth(person)).json()
    assert [(i["kind"], i.get("source")) for i in plan["items"] if i["kind"] == "calendar"] == [("calendar", "apple_calendar")]


# ── Normalization (pure) ──────────────────────────────────────────────────────

@pytest.mark.parametrize("field,value,expected", [
    ("readiness", 84, 84), ("readiness", 101, None), ("readiness", math.nan, None), ("readiness", "84", 84),
    ("sleep_minutes", -1, None), ("hrv_ms", 0, None), ("resting_hr", 19, None), ("resting_hr", True, None),
    ("hrv_ms", "fast", None),
])
def test_out_of_range_values_become_missing_not_zero(field, value, expected):
    assert health.clean(field, value) == expected


def test_main_sleep_falls_back_to_a_short_sleep_period_but_never_a_nap():
    rows = health.normalize_oura([], [
        {"id": "a", "day": "2026-10-05", "type": "sleep", "total_sleep_duration": 18000, "average_hrv": 40, "lowest_heart_rate": 55},
        {"id": "b", "day": "2026-10-05", "type": "late_nap", "total_sleep_duration": 21000, "average_hrv": 99},
        {"id": "c", "day": "2026-10-06", "type": "sleep", "total_sleep_duration": 30000, "average_hrv": 70},
        {"id": "d", "day": "2026-10-06", "type": "long_sleep", "total_sleep_duration": 25000, "average_hrv": 45},
        {"id": "e", "day": "2026-10-07", "type": "rest", "total_sleep_duration": 9000},
    ])
    by = {str(r["local_date"]): r for r in rows}
    assert by["2026-10-05"]["sleep_minutes"] == 300 and by["2026-10-05"]["hrv_ms"] == 40   # the short night, not the nap
    assert by["2026-10-06"]["hrv_ms"] == 45                                               # long_sleep wins when present
    assert "2026-10-07" not in by                                                          # a rest period alone is no reading
