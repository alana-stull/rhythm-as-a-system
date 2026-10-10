"""The SQL scripts handed to the hosted project stay correct as the schema evolves."""
from pathlib import Path

import psycopg
import pytest

from backend.tests.pg_support import pg_engine  # noqa: F401

pytestmark = pytest.mark.postgres

SUPABASE = Path(__file__).resolve().parents[2] / "supabase"
LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"


def _run(sql: str, *, read_only: bool = True):
    with psycopg.connect(LOCAL) as conn:
        if read_only:
            conn.execute("set transaction read only")
        return conn.execute(sql).fetchall()


AUDIT = (SUPABASE / "audit_existing_project.sql").read_text()


def _code_only(sql: str) -> str:
    """SQL without comments; string literals (labels, catalog names) reduced to their bare content."""
    import re
    code = "\n".join(line.split("--")[0] for line in sql.splitlines())
    return re.sub(r"'[^']*'", lambda m: "'" + ("auth.<name>" if m.group(0).startswith("'auth.") and " " not in m.group(0) else "") + "'", code)


def test_audit_never_reads_auth_tables_or_resolves_auth_names():
    code = _code_only(AUDIT).lower()
    assert "from auth." not in code and "join auth." not in code      # no reads of auth tables
    assert "'auth.<name>'" not in code                                 # no name lookups inside auth ('auth.users', 'auth.uid()')
    assert "::regclass" not in code and "to_regprocedure" not in code and "to_regclass" not in code
    for word in ("insert ", "update ", "delete ", "create ", "alter ", "drop ", "grant ", "revoke ", "set role", "truncate"):
        assert word not in code, word


def _audit_as(conn, run_as: str, migration_role: str = "postgres"):
    sql = AUDIT.replace("params(migration_role) as (values ('postgres'))",
                        f"params(migration_role) as (values ('{migration_role}'))")
    conn.execute("create role rhythm_audit_sim nologin noinherit")  # rolled back with the transaction
    conn.execute("grant rhythm_audit_sim to postgres")
    conn.execute(f"set local role {run_as}")
    conn.execute("set local transaction_read_only = on")
    return {r[0]: (r[2], r[3]) for r in conn.execute(sql).fetchall()}


@pytest.mark.parametrize("run_as, migration_role", [
    ("postgres", "postgres"), ("authenticated", "postgres"), ("anon", "postgres"),
    ("rhythm_audit_sim", "rhythm_audit_sim"),  # no rights in the auth schema at all
])
def test_audit_runs_read_only_under_restricted_roles(pg_engine, run_as, migration_role):
    with psycopg.connect(LOCAL) as conn:
        try:
            with conn.transaction():
                rows = _audit_as(conn, run_as, migration_role)
                raise _Rollback
        except _Rollback:
            pass
        assert conn.execute("select count(*) from pg_roles where rolname = 'rhythm_audit_sim'").fetchone()[0] == 0
    assert sorted(rows) == list(range(1, 26))
    assert rows[2][0] == "CONFLICT"  # locally 0001 is applied, so its tables are flagged
    if migration_role == "postgres":
        assert rows[13][0] == "REVIEW" and "has TRIGGER: true" in rows[13][1]  # not owner, has TRIGGER
        assert all(rows[n][0] == "CLEAR" for n in (1, 7, 12, 14, 15, 16, 17, 18, 19, 20, 21))
    else:
        assert rows[13][0] == "BLOCKER" and "has TRIGGER: false" in rows[13][1]
        assert rows[25][0] == "REVIEW"


class _Rollback(Exception):
    pass


def test_structural_verification_reports_rls_everywhere(pg_engine):
    rows = _run((SUPABASE / "verify_after_0001.sql").read_text())
    tables = [r for r in rows if not r[0].startswith(("auth trigger", "alembic"))]
    assert len(tables) == 13 and all(r[1] is True and r[2] == "none" for r in tables)


def test_behavioral_verification_passes_and_persists_nothing(pg_engine):
    with psycopg.connect(LOCAL) as conn:
        with pytest.raises(psycopg.Error, match="RHYTHM VERIFY PASSED: 19 of 19"):
            conn.execute((SUPABASE / "verify_behavior_after_0001.sql").read_text())
    assert _run("select count(*) from auth.users where email like '%@verify.invalid'") == [(0,)]


def test_behavioral_verification_catches_a_leaking_policy(pg_engine):
    with psycopg.connect(LOCAL) as conn:
        with pytest.raises(psycopg.Error, match="RHYTHM VERIFY FAILED.*B can read A's rows"):
            with conn.transaction():
                conn.execute("create policy leak on public.tasks for select to authenticated using (true)")
                conn.execute((SUPABASE / "verify_behavior_after_0001.sql").read_text())
    assert _run("select count(*) from pg_policies where policyname = 'leak'") == [(0,)]


def test_behavioral_verification_skips_cleanly_without_auth_rights(pg_engine):
    with psycopg.connect(LOCAL) as conn:
        with pytest.raises(psycopg.Error, match="RHYTHM VERIFY SKIPPED: rhythm_audit_sim cannot create test users"):
            with conn.transaction():
                conn.execute("create role rhythm_audit_sim nologin noinherit")
                conn.execute("grant rhythm_audit_sim to postgres")
                conn.execute("set local role rhythm_audit_sim")
                conn.execute((SUPABASE / "verify_behavior_after_0001.sql").read_text())
    assert _run("select count(*) from pg_roles where rolname = 'rhythm_audit_sim'") == [(0,)]
