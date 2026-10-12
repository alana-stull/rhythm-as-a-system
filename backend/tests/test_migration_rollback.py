"""
A failed migration leaves the database exactly as it was.

Runs the real Alembic runner against the local stack as a role that can do
everything 0001 needs except one hosted-sensitive privilege on auth.users
(TRIGGER for the profile trigger, or REFERENCES for the profiles foreign key),
and checks that nothing at all remains: no schema, version table, tables,
functions, policies or trigger. Restores head afterwards.
"""
import subprocess
from pathlib import Path

import psycopg
import pytest

from backend.tests.pg_support import pg_engine  # noqa: F401

pytestmark = pytest.mark.postgres

ROOT = Path(__file__).resolve().parents[2]
ALEMBIC = [str(ROOT / ".venv" / "bin" / "alembic"), "-c", str(ROOT / "backend" / "alembic.ini")]
OWNER = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
OWNER_SA = "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"  # for Alembic
ADMIN = "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres"  # local superuser: grants on auth.users
SIM = "rhythm_migrator_sim"


def _alembic(url: str, *args: str) -> subprocess.CompletedProcess:
    env = {"PATH": "/usr/bin:/bin", "DATABASE_URL": url}
    return subprocess.run(ALEMBIC + list(args), capture_output=True, text=True, env=env, cwd=ROOT, timeout=120)


def _inventory() -> dict:
    with psycopg.connect(OWNER) as c:
        one = lambda s: c.execute(s).fetchone()[0]
        return {
            "public_tables": one("select count(*) from pg_tables where schemaname = 'public'"),
            "rhythm_private": one("select count(*) from pg_namespace where nspname = 'rhythm_private'"),
            "functions": one("select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
                             "where n.nspname = 'rhythm_private'"),
            "policies": one("select count(*) from pg_policies where schemaname = 'public'"),
            "trigger": one("select count(*) from pg_trigger where tgname = 'rhythm_on_auth_user_created'"),
        }


EMPTY = {"public_tables": 0, "rhythm_private": 0, "functions": 0, "policies": 0, "trigger": 0}


@pytest.fixture
def fresh_project(pg_engine):
    """A never-migrated database (like the hosted project), restored to head afterwards."""
    try:
        psycopg.connect(ADMIN).close()
    except psycopg.Error:
        pytest.skip("local supabase_admin not reachable")
    with psycopg.connect(OWNER) as c:
        if c.execute("select count(*) from public.profiles").fetchone()[0]:
            pytest.skip("local database holds real data (someone has signed in); this test drops the whole schema")
    assert _alembic(OWNER_SA, "downgrade", "base").returncode == 0
    with psycopg.connect(OWNER, autocommit=True) as c:
        c.execute("drop schema if exists rhythm_private cascade")  # only the empty version table remains
    assert _inventory() == EMPTY
    yield
    with psycopg.connect(ADMIN, autocommit=True) as c:
        if c.execute("select 1 from pg_roles where rolname = %s", (SIM,)).fetchone():
            c.execute(f"drop owned by {SIM}")
            c.execute(f"drop role {SIM}")
    if _inventory()["public_tables"] == 0:  # a failed run: nothing (or an empty schema) to clean up
        with psycopg.connect(OWNER, autocommit=True) as c:
            c.execute("drop schema if exists rhythm_private cascade")
        restored = _alembic(OWNER_SA, "upgrade", "head")
        assert restored.returncode == 0, restored.stderr[-2000:]
    assert "0002 (head)" in _alembic(OWNER_SA, "current").stdout


def _sim_role(*, trigger: bool, references: bool) -> str:
    with psycopg.connect(ADMIN, autocommit=True) as c:
        c.execute(f"create role {SIM} login password 'sim'")
        c.execute(f"grant create on database postgres to {SIM}")
        c.execute(f"grant usage, create on schema public to {SIM}")
        c.execute(f"grant usage on schema auth to {SIM}")
        if references:
            c.execute(f"grant references on auth.users to {SIM}")
        if trigger:
            c.execute(f"grant trigger on auth.users to {SIM}")
    return f"postgresql+psycopg://{SIM}:sim@127.0.0.1:54322/postgres"


@pytest.mark.parametrize("missing", ["trigger", "references"])
def test_failed_migration_leaves_nothing_behind(fresh_project, missing):
    url = _sim_role(trigger=missing != "trigger", references=missing != "references")
    result = _alembic(url, "upgrade", "head")
    assert result.returncode != 0
    assert "permission denied for table users" in result.stderr
    assert _inventory() == EMPTY


def test_successful_migration_is_complete(fresh_project):
    result = _alembic(OWNER_SA, "upgrade", "head")
    assert result.returncode == 0, result.stderr[-2000:]
    inv = _inventory()
    assert inv["public_tables"] == 17 and inv["rhythm_private"] == 1 and inv["functions"] == 3
    assert inv["policies"] == 45 and inv["trigger"] == 1
    assert "0002 (head)" in _alembic(OWNER_SA, "current").stdout
