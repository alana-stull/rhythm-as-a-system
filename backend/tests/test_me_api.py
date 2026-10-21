"""/me endpoints against the local Supabase Postgres: profile, isolation, data deletion."""
import uuid

import jwt

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from backend.auth import get_token_verifier
from backend.db import scope
from backend.main import app
from backend.tests.pg_support import make_token, make_user, pg_engine, verifier_for_tests  # noqa: F401

pytestmark = pytest.mark.postgres


@pytest.fixture
def api(pg_engine):
    app.dependency_overrides[get_token_verifier] = verifier_for_tests
    app.dependency_overrides[scope.engine_or_503] = lambda: pg_engine
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def auth(uid):
    return {"Authorization": f"Bearer {make_token(uid)}"}


def test_new_user_gets_a_default_profile(api, make_user):
    a = make_user()
    r = api.get("/me", headers=auth(a))
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == str(a) and body["email"] == f"{a}@example.test"
    assert body["timezone"] == "UTC" and body["onboarding_completed"] is False
    assert body["display_name"] is None and body["tone"] is None


def test_profile_updates_persist_and_onboarding_is_a_timestamp(api, make_user):
    a = make_user()
    r = api.patch("/me", headers=auth(a), json={
        "display_name": "  Alana ", "tone": "gentle", "timezone": "America/Los_Angeles",
        "tracker_choice": "none", "onboarding_step": "sources",
    })
    assert r.status_code == 200, r.text
    assert r.json()["display_name"] == "Alana" and r.json()["timezone"] == "America/Los_Angeles"

    done = api.patch("/me", headers=auth(a), json={"onboarding_completed": True}).json()
    assert done["onboarding_completed"] is True and done["onboarding_completed_at"]
    assert done["tone"] == "gentle"  # untouched fields keep their values

    again = api.get("/me", headers=auth(a)).json()
    assert again["onboarding_completed"] is True and again["display_name"] == "Alana"

    undone = api.patch("/me", headers=auth(a), json={"onboarding_completed": False, "display_name": None}).json()
    assert undone["onboarding_completed"] is False and undone["display_name"] is None


@pytest.mark.parametrize("payload", [
    {"tone": "harsh"},
    {"timezone": "Mars/Olympus_Mons"},
    {"timezone": None},
    {"tracker_choice": "fitbit"},
    {"display_name": "   "},
    {"display_name": "x" * 81},
    {"onboarding_step": "x" * 41},
    {"id": str(uuid.uuid4())},
    {"created_at": "2020-01-01T00:00:00Z"},
    {"onboarding_completed_at": "2020-01-01T00:00:00Z"},
])
def test_invalid_or_protected_fields_are_rejected(api, make_user, payload):
    a = make_user()
    assert api.patch("/me", headers=auth(a), json=payload).status_code == 422


def test_users_only_ever_see_their_own_profile(api, make_user):
    a, b = make_user(), make_user()
    api.patch("/me", headers=auth(a), json={"display_name": "A"})
    rb = api.get("/me", headers=auth(b)).json()
    assert rb["id"] == str(b) and rb["display_name"] is None
    api.patch("/me", headers=auth(b), json={"display_name": "B"})
    assert api.get("/me", headers=auth(a)).json()["display_name"] == "A"


def test_valid_token_for_a_deleted_account_is_rejected(api, pg_engine, make_user):
    a = make_user()
    token = make_token(a)
    with pg_engine.begin() as conn:
        conn.execute(text("delete from auth.users where id = :u"), {"u": a})
    r = api.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def _seed(conn, uid):
    """One row in every user-owned table."""
    area = conn.execute(text("insert into public.areas (user_id, name) values (:u, 'Work') returning id"), {"u": uid}).scalar_one()
    goal = conn.execute(text("insert into public.goals (user_id, title, area_id) values (:u, 'g', :a) returning id"),
                        {"u": uid, "a": area}).scalar_one()
    task = conn.execute(text("insert into public.tasks (user_id, title, goal_id) values (:u, 't', :g) returning id"),
                        {"u": uid, "g": goal}).scalar_one()
    conn.execute(text("insert into public.plan_blocks (user_id, kind, task_id, starts_at, ends_at) "
                      "values (:u, 'task', :t, now(), now() + interval '1 hour')"), {"u": uid, "t": task})
    conn.execute(text("insert into public.external_events (user_id, source, calendar_ref, external_id, starts_at, ends_at) "
                      "values (:u, 'apple_calendar', 'cal-hash', 'evt-1', now(), now() + interval '1 hour')"), {"u": uid})
    item = conn.execute(text("insert into public.recurring_items (user_id, kind, title) values (:u, 'habit', 'h') "
                             "returning id"), {"u": uid}).scalar_one()
    conn.execute(text("insert into public.recurring_item_logs (user_id, item_id, occurred_on, outcome) "
                      "values (:u, :i, current_date, 'done')"), {"u": uid, "i": item})
    conn.execute(text("insert into public.checkins (user_id, local_date, energy) values (:u, current_date, 'low')"), {"u": uid})
    conn.execute(text("insert into public.connections (user_id, provider, access_token_enc) values (:u, 'oura', 'c')"), {"u": uid})
    conn.execute(text("insert into public.health_daily (user_id, source, local_date, readiness) "
                      "values (:u, 'oura', current_date, 80)"), {"u": uid})
    a_id = conn.execute(text(
        "insert into public.daily_assessments (user_id, local_date, status, pathway, capacity, demand, engine_version, "
        "thresholds_version, inputs_hash) values (:u, current_date, 'insufficient_evidence', 'none', '{}', '{}', "
        "'2.0.0', 't', 'h') returning id"), {"u": uid}).scalar_one()
    conn.execute(text("insert into public.interpretations (user_id, assessment_id, kind, context_version, context, body) "
                      "values (:u, :a, 'fallback', 'interpretation-context-2', '{}', 'b')"), {"u": uid, "a": a_id})
    # 0002
    conn.execute(text("insert into public.calendar_settings (user_id, source, calendar_ref, default_area_id) "
                      "values (:u, 'apple_calendar', 'cal-hash', :a)"), {"u": uid, "a": area})
    conn.execute(text("insert into public.event_overrides (user_id, source, external_id, treatment) "
                      "values (:u, 'apple_calendar', 'evt-1', 'ignore')"), {"u": uid})
    conn.execute(text("insert into public.what_helps (user_id, text) values (:u, 'A walk after lunch')"), {"u": uid})
    conn.execute(text("insert into public.llm_usage (user_id, purpose, model, outcome) "
                      "values (:u, 'what_matters_now', 'm', 'ok')"), {"u": uid})


def _count(conn, uid):
    from backend.db.deletion import USER_TABLES
    return {t: conn.execute(text(f"select count(*) from public.{t} where user_id = :u"), {"u": uid}).scalar_one()
            for t in USER_TABLES}


def test_data_deletion_removes_only_the_callers_data(api, pg_engine, make_user):
    a, b = make_user(), make_user()
    api.patch("/me", headers=auth(a), json={"display_name": "A", "tone": "direct", "onboarding_completed": True})
    with pg_engine.begin() as conn:
        _seed(conn, a)
        _seed(conn, b)

    assert api.delete("/me/data", headers=auth(a)).status_code == 400  # needs confirm=true
    r = api.delete("/me/data", params={"confirm": "true"}, headers=auth(a))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["account_deleted"] is False and body["profile_reset"] is True
    assert body["deleted"]["tasks"] == 1 and body["deleted"]["connections"] == 1

    with pg_engine.connect() as conn:
        assert set(_count(conn, a).values()) == {0}
        assert set(_count(conn, b).values()) == {1}
    me = api.get("/me", headers=auth(a)).json()  # identity survives; personal fields cleared
    assert me["id"] == str(a) and me["display_name"] is None and me["onboarding_completed"] is False


def test_database_not_configured_is_503(monkeypatch):
    scope.get_engine.cache_clear()
    monkeypatch.setattr(scope.settings, "database_url", "sqlite://")
    app.dependency_overrides[get_token_verifier] = verifier_for_tests
    try:
        with TestClient(app) as c:
            r = c.get("/me", headers=auth(uuid.uuid4()))
    finally:
        app.dependency_overrides.clear()
        scope.get_engine.cache_clear()
    assert r.status_code == 503


# ── Account deletion ─────────────────────────────────────────────────────────
# Supabase's admin API, Apple and Oura are fakes; nothing leaves the machine.

class FakeServices:
    def __init__(self, apple_sub=None):
        self.apple_sub = apple_sub      # the Apple identity linked to the Rhythm account (None: email only)
        self.code_sub = apple_sub       # who the re-authentication code belongs to
        self.apple_down = False
        self.oura_revoked_token = None
        self.calls = []

    def handler(self, request):
        import httpx
        from urllib.parse import parse_qs
        self.calls.append((request.method, request.url.host, request.url.path))
        if request.url.path.startswith("/auth/v1/admin/users/"):
            assert request.headers["apikey"] == "service-key"
            if request.method == "GET":
                ids = [{"provider": "email", "identity_data": {}}]
                if self.apple_sub:
                    ids.append({"provider": "apple", "identity_data": {"sub": self.apple_sub}})
                return httpx.Response(200, json={"identities": ids})
            return httpx.Response(200, json={})
        if request.url.host == "appleid.apple.com":
            if self.apple_down:
                return httpx.Response(503)
            form = parse_qs(request.content.decode())
            claims = jwt.decode(form["client_secret"][0], options={"verify_signature": False})
            assert claims["sub"] == "co.findrhythm.app" and claims["aud"] == "https://appleid.apple.com"
            if request.url.path == "/auth/token":
                if form["code"] == ["used"]:
                    return httpx.Response(400, json={"error": "invalid_grant"})
                id_token = jwt.encode({"iss": "https://appleid.apple.com", "aud": "co.findrhythm.app",
                                       "sub": self.code_sub}, "x" * 32, algorithm="HS256")
                return httpx.Response(200, json={"access_token": "a", "refresh_token": "apple-refresh", "id_token": id_token})
            assert form["token"] == ["apple-refresh"]
            return httpx.Response(200)
        if request.url.host == "api.ouraring.com" and request.url.path == "/oauth/revoke":
            self.oura_revoked_token = request.url.params["access_token"]
            return httpx.Response(200)
        return httpx.Response(404)


@pytest.fixture
def services(monkeypatch):
    import httpx
    from cryptography.fernet import Fernet
    from cryptography.hazmat.primitives import serialization
    from backend.integrations import secrets
    from cryptography.hazmat.primitives.asymmetric import ec
    from backend.config import settings
    from backend.routers.me import get_http
    pem = ec.generate_private_key(ec.SECP256R1()).private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    for k, v in {"supabase_url": "http://supabase.test", "supabase_service_role_key": "service-key",
                 "apple_team_id": "TEAM", "apple_key_id": "KEY", "apple_private_key": pem.replace("\n", "\\n"),
                 "token_encryption_key": Fernet.generate_key().decode()}.items():
        monkeypatch.setattr(settings, k, v)
    secrets._fernet.cache_clear()
    fake = FakeServices()
    client = httpx.Client(transport=httpx.MockTransport(fake.handler))
    app.dependency_overrides[get_http] = lambda: client
    yield fake
    client.close()
    secrets._fernet.cache_clear()


def _real_oura_token(pg_engine, uid):
    from backend.integrations import secrets
    with pg_engine.begin() as conn:
        conn.execute(text("update public.connections set access_token_enc = :t where user_id = :u and provider = 'oura'"),
                     {"t": secrets.encrypt("oura-access"), "u": uid})


def _delete(api, uid, **body):
    return api.request("DELETE", "/me", headers=auth(uid), json={"confirm": True, **body})


def test_deleting_an_email_account_removes_everything_and_the_sign_in(api, pg_engine, make_user, services):
    a, b = make_user(), make_user()
    with pg_engine.begin() as conn:
        _seed(conn, a)
        _seed(conn, b)
    _real_oura_token(pg_engine, a)
    assert api.request("DELETE", "/me", headers=auth(a), json={"confirm": False}).status_code == 400
    r = _delete(api, a)
    assert r.status_code == 200, r.text
    assert r.json() == {"account_deleted": True, "oura_revoked": True}
    assert services.oura_revoked_token == "oura-access"                               # Oura asked to revoke
    assert ("DELETE", "supabase.test", f"/auth/v1/admin/users/{a}") in services.calls  # the sign-in itself
    with pg_engine.connect() as conn:
        assert set(_count(conn, a).values()) == {0}
        assert set(_count(conn, b).values()) == {1}                                    # nobody else touched


def test_apple_accounts_must_reconfirm_and_tokens_are_revoked_before_anything_is_deleted(
        api, pg_engine, make_user, services):
    a = make_user()
    services.apple_sub = services.code_sub = "apple-123"
    with pg_engine.begin() as conn:
        _seed(conn, a)

    assert _delete(api, a).status_code == 428                                          # no Apple confirmation
    assert _delete(api, a, apple_authorization_code="used").status_code == 400         # Apple refused the code
    services.code_sub = "someone-else"
    assert _delete(api, a, apple_authorization_code="fresh").status_code == 403        # a different Apple ID
    services.code_sub, services.apple_down = "apple-123", True
    assert _delete(api, a, apple_authorization_code="fresh").status_code == 502        # Apple unreachable
    with pg_engine.connect() as conn:
        assert set(_count(conn, a).values()) == {1}                                    # nothing deleted yet

    services.apple_down = False
    r = _delete(api, a, apple_authorization_code="fresh")
    assert r.status_code == 200 and r.json()["oura_revoked"] is False                 # undecryptable token: not
    assert ("POST", "appleid.apple.com", "/auth/revoke") in services.calls            # confirmed, but still deleted
    with pg_engine.connect() as conn:
        assert set(_count(conn, a).values()) == {0}


def test_account_deletion_unconfigured_is_503_and_deletes_nothing(api, pg_engine, make_user, services, monkeypatch):
    from backend.config import settings
    monkeypatch.setattr(settings, "supabase_service_role_key", "")
    a = make_user()
    with pg_engine.begin() as conn:
        _seed(conn, a)
    assert _delete(api, a).status_code == 503
    with pg_engine.connect() as conn:
        assert set(_count(conn, a).values()) == {1}
