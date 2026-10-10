"""
Fixtures for tests against the local Supabase Postgres (supabase start).

Safety: refuses any non-local host. Skips cleanly when the local stack isn't
running, so the rest of the suite still runs without Docker.
"""
from __future__ import annotations

import datetime as dt
import json
import uuid
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlparse

import jwt
import pytest
from alembic import command
from alembic.config import Config
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import create_engine, text

from backend.auth import TokenVerifier
from backend.config import settings

LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}
ISSUER = "http://127.0.0.1:54321/auth/v1"
ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


# ── Tokens signed with a test-only key ─────────────────────────────────────────

TEST_KEY = ec.generate_private_key(ec.SECP256R1())
TEST_KID = "test-es256"


class _StaticJWKS:
    """Stands in for PyJWKClient: one known public key, by kid."""

    def __init__(self, keys: dict[str, object]):
        self.keys = keys

    def get_signing_key_from_jwt(self, token: str):
        kid = jwt.get_unverified_header(token).get("kid")
        if kid not in self.keys:
            raise jwt.PyJWKClientError(f"unknown kid {kid!r}")
        return type("SigningKey", (), {"key": self.keys[kid], "algorithm_name": "ES256"})()


def verifier_for_tests(hs256_secret: str | None = None) -> TokenVerifier:
    return TokenVerifier(issuer=ISSUER, jwks=_StaticJWKS({TEST_KID: TEST_KEY.public_key()}),
                         hs256_secret=hs256_secret)


def make_token(user_id: uuid.UUID | str, *, key=None, alg: str = "ES256", kid: str | None = TEST_KID,
               exp_in: int = 3600, **overrides) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    claims = {
        "sub": str(user_id), "aud": "authenticated", "role": "authenticated", "iss": ISSUER,
        "email": f"{user_id}@example.test", "iat": now, "exp": now + dt.timedelta(seconds=exp_in),
        "is_anonymous": False,
    }
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not None}
    headers = {"kid": kid} if kid else {}
    return jwt.encode(claims, key if key is not None else TEST_KEY, algorithm=alg, headers=headers)


# ── Local Postgres ─────────────────────────────────────────────────────────────

def _assert_local(url: str) -> None:
    host = urlparse(url.replace("postgresql+psycopg", "postgresql", 1)).hostname
    assert host in LOCAL_HOSTS, f"Tests only run against local Supabase, not {host!r}"


@pytest.fixture(scope="session")
def pg_engine():
    url = settings.database_url
    _assert_local(url)
    engine = create_engine(url, pool_pre_ping=True)
    try:
        with engine.connect() as conn:
            conn.execute(text("select 1 from auth.users limit 1"))
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"local Supabase not running ({type(exc).__name__}); run `supabase start`")
    cfg = Config(str(ALEMBIC_INI))
    cfg.cmd_opts = type("Opts", (), {"x": [f"url={url}"]})()
    command.upgrade(cfg, "head")
    yield engine
    engine.dispose()


@pytest.fixture
def make_user(pg_engine):
    """Create auth users (the profile trigger creates their profiles); remove them after."""
    created: list[uuid.UUID] = []

    def _make(email: str | None = None) -> uuid.UUID:
        uid = uuid.uuid4()
        with pg_engine.begin() as conn:
            conn.execute(text(
                "insert into auth.users (id, email, aud, role, created_at, updated_at) "
                "values (:id, :email, 'authenticated', 'authenticated', now(), now())"
            ), {"id": uid, "email": email or f"{uid}@example.test"})
        created.append(uid)
        return uid

    yield _make
    with pg_engine.begin() as conn:
        conn.execute(text("delete from auth.users where id = any(:ids)"), {"ids": created})


@contextmanager
def as_role(conn, role: str, sub: uuid.UUID | None = None):
    """Inside the current transaction, act as a client role the way PostgREST would."""
    conn.execute(text(f"set local role {role}"))
    if sub is not None:
        conn.execute(text("select set_config('request.jwt.claims', :c, true)"),
                     {"c": json.dumps({"sub": str(sub), "role": role})})
    yield conn
    conn.execute(text("reset role"))
