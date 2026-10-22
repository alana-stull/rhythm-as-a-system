"""
What a public deployment exposes. Every route must require sign-in, be a
legacy route that is off by default, or be on a short, reviewed public list.
"""
import os
import subprocess
import sys

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from backend.auth import get_current_user
from backend.legacy import legacy_only
from backend.main import app

# Public on purpose: the health check and Oura's registered redirect URI (it verifies a signed state).
PUBLIC = {("GET", "/health"), ("GET", "/oura/callback"), ("GET", "/connections/oura/callback")}


def _calls(dependant):
    yield dependant.call
    for d in dependant.dependencies:
        yield from _calls(d)


def _routes():
    for r in app.routes:
        if isinstance(r, APIRoute):
            for m in r.methods:
                yield m, r.path, set(_calls(r.dependant))


def test_every_route_is_authenticated_legacy_gated_or_reviewed_public():
    unexpected = [(m, p) for m, p, calls in _routes()
                  if get_current_user not in calls and legacy_only not in calls and (m, p) not in PUBLIC]
    assert unexpected == []


@pytest.fixture
def anon():
    with TestClient(app) as c:
        yield c


@pytest.mark.parametrize("method,path", [
    ("POST", "/upload/oura"), ("POST", "/upload/apple-health"), ("POST", "/checkin"),
    ("GET", "/scores/latest"), ("GET", "/scores/history"), ("PATCH", "/scores/today/exposure"),
    ("POST", "/suggestions/generate"), ("GET", "/suggestions/latest"),   # /generate would call OpenAI
    ("GET", "/lamp"), ("GET", "/calendar/auth-url"), ("POST", "/calendar/sync"),
    ("GET", "/oura/auth-url"), ("GET", "/oura/status"), ("POST", "/oura/sync"), ("DELETE", "/oura/disconnect"),
    ("GET", "/oura/callback?code=x"),                                     # the unsigned single-user branch
])
def test_legacy_endpoints_are_off_by_default(anon, method, path):
    assert anon.request(method, path).status_code == 404


def test_signed_oura_callbacks_still_work_without_legacy(anon):
    r = anon.get("/oura/callback", params={"state": "x.y", "code": "c"}, follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"].endswith("status=error")  # tampered state, handled


def test_production_hides_api_docs():
    code = "from backend.main import app; print(app.docs_url, app.openapi_url)"
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True,
                         env={**os.environ, "ENVIRONMENT": "production"}, cwd=os.path.dirname(os.path.dirname(__file__)) + "/..")
    assert out.stdout.strip() == "None None", out.stderr
