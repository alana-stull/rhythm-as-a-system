"""
Guardrails for the backend's own database access.

The backend's credential (postgres) bypasses RLS, so isolation on the backend
side rests on code. These tests pin that code down:
- user-facing work runs in user_scope, where RLS applies even if a query
  forgets its WHERE clause;
- the role and JWT claims never leak into pooled connections;
- privileged access is limited to an allowlist, and every privileged
  statement filters on an explicit user ID;
- only backend/db/scope.py may switch roles or set JWT claims.
"""
import ast
import re
from pathlib import Path

import pytest
from sqlalchemy import text

from backend.db import assessments, connections, day_inputs, deletion, profiles
from backend.pipeline import llm
from backend.db.scope import privileged, user_scope
from backend.tests.pg_support import make_user, pg_engine  # noqa: F401

BACKEND = Path(__file__).resolve().parents[1]
APP_FILES = [p for p in BACKEND.rglob("*.py")
             if ".venv" not in p.parts and "tests" not in p.parts and "migrations" not in p.parts]

# Where privileged (RLS-bypassing) access is allowed, and why.
PRIVILEGED_CALLERS = {
    "routers/me.py": {"_ensure", "delete_my_data"},  # profile fallback; data deletion
    "routers/tasks.py": {"_today"},                   # profile fallback + time zone for "today"
    "routers/checkins.py": {"_local_date"},           # same
    "pipeline/recompute.py": {"recompute_day"},       # reads backend-only connections; writes assessments
    "pipeline/today.py": {"build_today", "_remember_context", "_phrase_later"},  # writes interpretations and the usage ledger
    # backend-only tokens and provider data
    "routers/connections.py": {"list_connections", "oura_disconnect", "apple_health_upload", "apple_calendar_upload"},
    "integrations/oura.py": {"_store", "_access_token", "sync"},
}
PRIVILEGED_SQL_FUNCTIONS = {
    deletion.delete_user_data, profiles.ensure_profile, profiles.get_profile,
    day_inputs._checkins, day_inputs._tasks, day_inputs._calendar, day_inputs._wearable,
    assessments.upsert_assessment, assessments.cached_interpretation, assessments.store_interpretation,
    llm._record,
    connections.get_connection, connections.list_connections, connections.save_tokens, connections.mark,
    connections.mark_synced, connections.disconnect, connections.latest_health_day, connections.upsert_health_days,
    connections.health_sources_on, connections.replace_calendar_events,
}


# ── Static guardrails (no database) ───────────────────────────────────────────

def _calls(tree: ast.AST, name: str):
    for fn in ast.walk(tree):
        if isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for node in ast.walk(fn):
                if isinstance(node, ast.Call) and getattr(node.func, "id", getattr(node.func, "attr", None)) == name:
                    yield fn.name


def test_privileged_access_is_allowlisted():
    found = {}
    for path in APP_FILES:
        rel = path.relative_to(BACKEND).as_posix()
        if rel == "db/scope.py":
            continue
        callers = set(_calls(ast.parse(path.read_text()), "privileged"))
        if callers:
            found[rel] = callers
    assert found == PRIVILEGED_CALLERS


def _sql_literals(fn) -> list[str]:
    """SQL strings in a function, as Python sees them (adjacent literals joined, f-string parts joined)."""
    import inspect
    import textwrap
    tree = ast.parse(textwrap.dedent(inspect.getsource(fn)))
    parts_of_fstrings = {id(v) for n in ast.walk(tree) if isinstance(n, ast.JoinedStr) for v in n.values}
    out = []
    for node in ast.walk(tree):
        if id(node) in parts_of_fstrings:
            continue
        if isinstance(node, ast.JoinedStr):
            s = "".join(v.value for v in node.values if isinstance(v, ast.Constant) and isinstance(v.value, str))
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            s = node.value
        else:
            continue
        if re.match(r"\s*(insert|update|delete|select)\b", s, re.I):
            out.append(s)
    return out


def test_every_privileged_statement_filters_on_a_user_id():
    for fn in PRIVILEGED_SQL_FUNCTIONS:
        sql = _sql_literals(fn)
        if fn is deletion.delete_user_data:
            sql += [deletion._PROFILE_RESET]
        assert sql, fn.__name__
        for stmt in sql:
            if stmt.strip().startswith("select pg_advisory_xact_lock"):
                continue
            assert re.search(r"(user_id|\bid)\s*=\s*:(uid|id|u)\b|values \(:(id|u)\b", stmt, re.I), (fn.__name__, stmt)


def test_the_only_unfiltered_privileged_query_is_the_global_budget_total():
    """budget_block sums spend across all users (it returns one number, no rows); its per-user cap filters."""
    import inspect
    src = inspect.getsource(llm.budget_block)
    selects = re.findall(r'"(select [^"]*)"', src, re.I)
    unfiltered = [q for q in selects if "user_id" not in q and "pg_advisory_xact_lock" not in q]
    assert len(unfiltered) == 1 and unfiltered[0].startswith("select coalesce(sum(cost_usd), 0) from public.llm_usage")


def test_only_scope_module_switches_roles_or_sets_claims():
    pattern = re.compile(r"set\s+(local\s+)?role|reset\s+role|request\.jwt", re.I)
    offenders = [p.relative_to(BACKEND).as_posix() for p in APP_FILES
                 if pattern.search(p.read_text()) and p.relative_to(BACKEND).as_posix() != "db/scope.py"]
    assert offenders == []


# ── Behavior against local Postgres ───────────────────────────────────────────

@pytest.mark.postgres
def test_user_scope_enforces_rls_even_without_a_where_clause(pg_engine, make_user):
    a, b = make_user(), make_user()
    with privileged(pg_engine) as conn:
        for uid in (a, b):
            conn.execute(text("insert into public.tasks (user_id, title) values (:u, 'secret')"), {"u": uid})
    with user_scope(pg_engine, a) as conn:
        owners = set(conn.execute(text("select user_id from public.tasks")).scalars())  # deliberately unfiltered
        assert owners == {a}
        assert conn.execute(text("select count(*) from public.profiles")).scalar_one() == 1
        assert conn.execute(text("update public.tasks set title = 'x'")).rowcount == 1  # only A's row


@pytest.mark.postgres
def test_user_scope_cannot_read_backend_only_tables(pg_engine, make_user):
    a = make_user()
    with pytest.raises(Exception) as info:
        with user_scope(pg_engine, a) as conn:
            conn.execute(text("select * from public.connections"))
    assert "permission denied" in str(info.value)


@pytest.mark.postgres
def test_role_and_claims_never_leak_into_pooled_connections(pg_engine, make_user):
    a = make_user()
    with user_scope(pg_engine, a) as conn:
        assert conn.execute(text("select current_user")).scalar_one() == "authenticated"
    with pytest.raises(Exception):
        with user_scope(pg_engine, a) as conn:
            conn.execute(text("select 1/0"))  # failure mid-scope rolls back too
    for _ in range(3):  # whichever pooled connection we get back
        with pg_engine.connect() as conn:
            assert conn.execute(text("select current_user")).scalar_one() == "postgres"
            assert conn.execute(text("select coalesce(current_setting('request.jwt.claims', true), '')")).scalar_one() == ""
