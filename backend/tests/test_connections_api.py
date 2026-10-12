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
        self.refreshes = 0
        self.seen_tokens = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.url.path == "/oauth/token":
            form = parse_qs(request.content.decode())
            if form["grant_type"] == ["refresh_token"]:
                self.refreshes += 1
                return httpx.Response(200, json={"access_token": f"access-{self.refreshes + 1}",
                                                 "refresh_token": f"refresh-{self.refreshes + 1}", "expires_in": 86400})
            assert form["client_secret"] == ["client-secret"] and form["code"] == ["the-code"]
            return httpx.Response(200, json={"access_token": "access-1", "refresh_token": "refresh-1", "expires_in": 86400})
        self.seen_tokens.append(request.headers["Authorization"])
        if self.reject_api:
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
    r = api.get("/connections/oura/callback", params={"code": "the-code", "state": q["state"][0]},
                follow_redirects=False)
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
    bad = api.get("/connections/oura/callback", params={"code": "the-code", "state": "x.y"}, follow_redirects=False)
    assert bad.headers["location"].endswith("status=error")
    url = api.post("/connections/oura/authorize", headers=auth(person)).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    cancelled = api.get("/connections/oura/callback", params={"state": state, "error": "access_denied"},
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
    assert cap["context"] == "Your Oura readiness is high."
    assert "84" not in json.dumps(cap)  # health numbers never shown in reasons


def test_expired_tokens_refresh_and_rejected_tokens_ask_to_reconnect(api, person, oura_server, pg_engine):
    connect(api, person)
    with pg_engine.begin() as conn:
        conn.execute(text("update public.connections set token_expires_at = now() - interval '1 hour' where user_id = :u"),
                     {"u": person})
    api.post("/connections/oura/sync", headers=auth(person))
    assert oura_server.refreshes == 1 and oura_server.seen_tokens[-1] == "Bearer access-2"

    oura_server.reject_api = True
    assert api.post("/connections/oura/sync", headers=auth(person)).status_code == 409
    assert states(api, person)["oura"] == "expired"


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


# ── Normalization (pure) ──────────────────────────────────────────────────────

@pytest.mark.parametrize("field,value,expected", [
    ("readiness", 84, 84), ("readiness", 101, None), ("readiness", math.nan, None), ("readiness", "84", 84),
    ("sleep_minutes", -1, None), ("hrv_ms", 0, None), ("resting_hr", 19, None), ("resting_hr", True, None),
    ("hrv_ms", "fast", None),
])
def test_out_of_range_values_become_missing_not_zero(field, value, expected):
    assert health.clean(field, value) == expected
