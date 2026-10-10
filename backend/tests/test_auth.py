"""JWT verification: accepted and rejected tokens (no database needed)."""
import datetime as dt
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from fastapi.testclient import TestClient

from backend.auth import AuthError, get_token_verifier
from backend.main import app
from backend.tests.pg_support import ISSUER, TEST_KEY, TEST_KID, make_token, verifier_for_tests

USER = uuid.uuid4()
LEGACY_SECRET = "legacy-secret-at-least-32-characters-long!!"


def test_valid_es256_token_is_accepted():
    user = verifier_for_tests().verify(make_token(USER))
    assert user.id == USER and user.email == f"{USER}@example.test"


def test_legacy_hs256_is_accepted_only_when_configured():
    token = make_token(USER, key=LEGACY_SECRET, alg="HS256", kid=None)
    assert verifier_for_tests(hs256_secret=LEGACY_SECRET).verify(token).id == USER
    with pytest.raises(AuthError, match="algorithm not accepted"):
        verifier_for_tests().verify(token)


@pytest.mark.parametrize("overrides, reason", [
    (dict(exp_in=-120), "expired"),
    (dict(aud="anon"), "(?i)audience"),
    (dict(iss="https://other.supabase.co/auth/v1"), "issuer"),
    (dict(role="anon"), "role not accepted"),
    (dict(role="service_role"), "role not accepted"),
    (dict(is_anonymous=True), "anonymous"),
    (dict(sub="not-a-uuid"), "UUID"),
])
def test_invalid_claims_are_rejected(overrides, reason):
    with pytest.raises(AuthError, match=reason):
        verifier_for_tests().verify(make_token(USER, **overrides))


def test_missing_required_claims_are_rejected():
    for claim in ("exp", "sub", "iat"):
        with pytest.raises(AuthError):
            verifier_for_tests().verify(make_token(USER, **{claim: None}))


def test_signature_from_another_key_is_rejected():
    other = ec.generate_private_key(ec.SECP256R1())
    with pytest.raises(AuthError, match="invalid token"):
        verifier_for_tests().verify(make_token(USER, key=other))


def test_unknown_kid_is_rejected():
    with pytest.raises(AuthError, match="no matching signing key"):
        verifier_for_tests().verify(make_token(USER, kid="someone-elses-key"))


def test_alg_none_and_garbage_are_rejected():
    unsigned = jwt.encode({"sub": str(USER), "aud": "authenticated", "iss": ISSUER, "role": "authenticated",
                           "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=1)}, None, algorithm="none")
    for token in (unsigned, "not.a.jwt", "", "a.b"):
        with pytest.raises(AuthError):
            verifier_for_tests().verify(token)


def _hs256_forgery(secret: bytes) -> str:
    """Hand-built HS256 token (PyJWT refuses to sign with a PEM key, an attacker wouldn't)."""
    import base64, hashlib, hmac, json
    b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=")
    now = int(dt.datetime.now(dt.timezone.utc).timestamp())
    header = b64(json.dumps({"alg": "HS256", "typ": "JWT", "kid": TEST_KID}).encode())
    body = b64(json.dumps({"sub": str(USER), "aud": "authenticated", "role": "authenticated",
                           "iss": ISSUER, "iat": now, "exp": now + 3600}).encode())
    sig = b64(hmac.new(secret, header + b"." + body, hashlib.sha256).digest())
    return (header + b"." + body + b"." + sig).decode()


def test_algorithm_confusion_with_the_public_key_is_rejected():
    from cryptography.hazmat.primitives import serialization
    pem = TEST_KEY.public_key().public_bytes(serialization.Encoding.PEM,
                                             serialization.PublicFormat.SubjectPublicKeyInfo)
    forged = _hs256_forgery(pem)
    with pytest.raises(AuthError, match="algorithm not accepted"):
        verifier_for_tests().verify(forged)  # HS256 disabled without a legacy secret
    with pytest.raises(AuthError, match="invalid token"):
        verifier_for_tests(hs256_secret=LEGACY_SECRET).verify(forged)  # and never keyed by the public key


def test_alg_that_does_not_match_the_signing_key_is_rejected():
    # RS256 token pointing at the ES256 key's kid: rejected cleanly, not a 500.
    rsa_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(AuthError, match="does not match signing key"):
        verifier_for_tests().verify(make_token(USER, key=rsa_key, alg="RS256"))


# ── HTTP layer: 401s happen before any database access ────────────────────────

@pytest.fixture
def api():
    app.dependency_overrides[get_token_verifier] = verifier_for_tests
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.mark.parametrize("headers", [
    {}, {"Authorization": ""}, {"Authorization": "Bearer"}, {"Authorization": "Basic abc"},
    {"Authorization": "Bearer not.a.jwt"},
])
def test_me_requires_a_bearer_token(api, headers):
    r = api.get("/me", headers=headers)
    assert r.status_code == 401 and r.headers["www-authenticate"] == "Bearer"
    assert r.json() == {"detail": "Not authenticated."}


def test_expired_token_gets_401_without_detail_leak(api):
    r = api.get("/me", headers={"Authorization": f"Bearer {make_token(USER, exp_in=-120)}"})
    assert r.status_code == 401 and "expired" not in r.text.lower()


def test_auth_not_configured_is_503(monkeypatch):
    from backend import auth
    auth._default_verifier.cache_clear()
    monkeypatch.setattr(auth.settings, "supabase_url", "")
    with TestClient(app) as c:
        r = c.get("/me", headers={"Authorization": "Bearer x.y.z"})
    auth._default_verifier.cache_clear()
    assert r.status_code == 503
