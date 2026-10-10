"""
End to end against the local Supabase stack, with no test-only keys:
email OTP via Supabase Auth → code from the local Mailpit inbox → real
session JWT → GET /me verified by the backend's own JWKS verifier.
"""
import json
import re
import subprocess
import time
import uuid

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from backend import auth
from backend.db import scope
from backend.main import app
from backend.tests.pg_support import pg_engine  # noqa: F401

pytestmark = pytest.mark.postgres

API = "http://127.0.0.1:54321"
MAILPIT = "http://127.0.0.1:54324"


@pytest.fixture(scope="module")
def publishable_key():
    try:
        out = subprocess.run(["supabase", "status", "-o", "json"], capture_output=True, text=True, timeout=30, check=True)
        status = json.loads(out.stdout[out.stdout.index("{"):])
        key = status.get("PUBLISHABLE_KEY") or status.get("ANON_KEY")
        httpx.get(f"{API}/auth/v1/health", headers={"apikey": key}, timeout=5).raise_for_status()
        return key
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"local Supabase auth not available ({type(exc).__name__})")


def _code_for(email: str, timeout: float = 15) -> str:
    deadline = time.time() + timeout
    while time.time() < deadline:
        found = httpx.get(f"{MAILPIT}/api/v1/search", params={"query": f"to:{email}"}, timeout=5).json()
        for msg in found.get("messages", []):
            body = httpx.get(f"{MAILPIT}/api/v1/message/{msg['ID']}", timeout=5).json()
            match = re.search(r"\b(\d{6})\b", body.get("Text", "") + body.get("HTML", ""))
            if match:
                return match.group(1)
        time.sleep(0.5)
    raise AssertionError("no sign-in code arrived")


def test_email_otp_sign_in_then_me_with_real_jwks(publishable_key, pg_engine):
    email = f"e2e-{uuid.uuid4().hex[:10]}@example.test"
    headers = {"apikey": publishable_key}
    try:
        r = httpx.post(f"{API}/auth/v1/otp", headers=headers, json={"email": email, "create_user": True}, timeout=10)
        assert r.status_code == 200, r.text
        code = _code_for(email)

        mail = httpx.get(f"{MAILPIT}/api/v1/search", params={"query": f"to:{email}"}, timeout=5).json()["messages"][0]
        assert mail["Subject"] == "Your Rhythm sign-in code"

        r = httpx.post(f"{API}/auth/v1/verify", headers=headers, json={"type": "email", "email": email, "token": code}, timeout=10)
        assert r.status_code == 200, r.text
        session = r.json()
        access = session["access_token"]

        # The auth trigger (not the /me fallback) created the profile: checked before /me is called.
        with pg_engine.connect() as conn:
            profile = conn.execute(text(
                "select p.id, p.timezone, u.email from public.profiles p join auth.users u on u.id = p.id "
                "where u.email = :e"), {"e": email}).one_or_none()
        assert profile is not None, "rhythm_on_auth_user_created did not create a profile"
        assert str(profile.id) == session["user"]["id"] and profile.timezone == "UTC"

        auth._default_verifier.cache_clear()  # real verifier: SUPABASE_URL + JWKS
        app.dependency_overrides[scope.engine_or_503] = lambda: pg_engine
        with TestClient(app) as c:
            me = c.get("/me", headers={"Authorization": f"Bearer {access}"})
            assert me.status_code == 200, me.text
            assert me.json()["email"] == email and me.json()["id"] == session["user"]["id"]
            # The publishable/anon key is not a user session and is never accepted.
            assert c.get("/me", headers={"Authorization": f"Bearer {publishable_key}"}).status_code == 401
    finally:
        app.dependency_overrides.clear()
        auth._default_verifier.cache_clear()
        with pg_engine.begin() as conn:
            conn.execute(text("delete from auth.users where email = :e"), {"e": email})


def test_repeat_sign_in_is_idempotent_and_admin_delete_cascades(publishable_key, pg_engine):
    """Signing in again is idempotent (no duplicate profile); deleting via Auth's admin API cascades."""
    email = f"e2e-{uuid.uuid4().hex[:10]}@example.test"
    headers = {"apikey": publishable_key}
    try:
        for _ in range(2):  # second sign-in for the same email must not create anything new
            assert httpx.post(f"{API}/auth/v1/otp", headers=headers, json={"email": email, "create_user": True},
                              timeout=10).status_code == 200
            time.sleep(1.1)  # local max_frequency is 1s
        with pg_engine.begin() as conn:
            uid = conn.execute(text("select id from auth.users where email = :e"), {"e": email}).scalar_one()
            assert conn.execute(text("select count(*) from public.profiles where id = :u"), {"u": uid}).scalar_one() == 1
            conn.execute(text("insert into public.tasks (user_id, title) values (:u, 't')"), {"u": uid})
        out = subprocess.run(["supabase", "status", "-o", "json"], capture_output=True, text=True, timeout=30, check=True)
        status = json.loads(out.stdout[out.stdout.index("{"):])
        service = status.get("SECRET_KEY") or status.get("SERVICE_ROLE_KEY")
        r = httpx.delete(f"{API}/auth/v1/admin/users/{uid}", headers={"apikey": service, "Authorization": f"Bearer {service}"},
                         timeout=10)
        assert r.status_code == 200, r.text
        with pg_engine.connect() as conn:
            assert conn.execute(text("select count(*) from public.profiles where id = :u"), {"u": uid}).scalar_one() == 0
            assert conn.execute(text("select count(*) from public.tasks where user_id = :u"), {"u": uid}).scalar_one() == 0
    finally:
        with pg_engine.begin() as conn:
            conn.execute(text("delete from auth.users where email = :e"), {"e": email})
