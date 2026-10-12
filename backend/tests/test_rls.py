"""
Database access restrictions, tested the way clients reach Postgres through
the Supabase API: as the `anon` or `authenticated` role with a JWT subject.
Runs against the local Supabase stack only.
"""
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from backend.db.deletion import USER_TABLES
from backend.tests.pg_support import as_role, make_user, pg_engine  # noqa: F401 (fixtures)

pytestmark = pytest.mark.postgres

CLIENT_WRITABLE = {"areas", "goals", "tasks", "recurring_items", "recurring_item_logs", "plan_blocks",
                   "calendar_settings", "event_overrides", "what_helps"}
CLIENT_READ_ONLY = {"health_daily", "external_events", "daily_assessments", "interpretations"}
BACKEND_ONLY = {"connections", "llm_usage"}


def _sqlstate(exc: DBAPIError) -> str:
    return getattr(exc.orig, "sqlstate", None)


def expect_denied(conn, sql, params=None, sqlstate="42501"):
    """Run in a savepoint and expect a Postgres error (default: insufficient_privilege)."""
    sp = conn.begin_nested()
    with pytest.raises(DBAPIError) as info:
        conn.execute(text(sql), params or {})
    sp.rollback()
    assert _sqlstate(info.value) == sqlstate, info.value


@pytest.fixture
def tx(pg_engine, make_user):
    """A transaction that is always rolled back.

    Depends on make_user so it is torn down first: the test users are deleted
    only after this transaction has released its locks on their rows.
    """
    conn = pg_engine.connect()
    trans = conn.begin()
    yield conn
    trans.rollback()
    conn.close()


# ── Structural guarantees (also cover tables added later) ─────────────────────

def _public_tables(conn):
    return set(conn.execute(text(
        "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace "
        "where n.nspname = 'public' and c.relkind = 'r'")).scalars())


def test_every_public_table_has_rls_and_nothing_for_anon(tx):
    tables = _public_tables(tx)
    assert tables >= CLIENT_WRITABLE | CLIENT_READ_ONLY | BACKEND_ONLY | {"profiles", "checkins"}
    no_rls = tx.execute(text(
        "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace "
        "where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity")).scalars().all()
    assert no_rls == []
    anon = tx.execute(text(
        "select table_name, privilege_type from information_schema.role_table_grants "
        "where table_schema = 'public' and grantee in ('anon', 'PUBLIC')")).all()
    assert anon == []


def test_client_roles_cannot_truncate_or_bypass(tx):
    rows = tx.execute(text(
        "select table_name, privilege_type from information_schema.role_table_grants "
        "where table_schema = 'public' and grantee = 'authenticated' "
        "and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')")).all()
    assert rows == []


def test_privileges_match_the_access_matrix(tx):
    grants = {}
    for table, priv in tx.execute(text(
            "select table_name, privilege_type from information_schema.role_table_grants "
            "where table_schema = 'public' and grantee = 'authenticated'")).all():
        grants.setdefault(table, set()).add(priv)
    for t in CLIENT_WRITABLE:
        assert grants[t] == {"SELECT", "INSERT", "UPDATE", "DELETE"}, t
    for t in CLIENT_READ_ONLY:
        assert grants[t] == {"SELECT"}, t
    for t in BACKEND_ONLY:
        assert t not in grants, t
    assert grants["profiles"] == {"SELECT"}          # update is column-level only
    assert grants["checkins"] == {"SELECT", "DELETE"}  # insert is column-level only


def test_data_deletion_covers_every_user_owned_table(tx):
    owned = set(tx.execute(text(
        "select table_name from information_schema.columns "
        "where table_schema = 'public' and column_name = 'user_id'")).scalars())
    assert owned == set(USER_TABLES)


def test_migration_internals_are_not_exposed(tx):
    with as_role(tx, "anon"):
        expect_denied(tx, "select * from rhythm_private.alembic_version")
    with as_role(tx, "authenticated", uuid.uuid4()):
        expect_denied(tx, "select * from rhythm_private.alembic_version")


# ── Ownership and isolation ───────────────────────────────────────────────────

def test_profile_is_created_for_each_new_auth_user(pg_engine, make_user):
    uid = make_user()
    with pg_engine.connect() as conn:
        row = conn.execute(text("select timezone, display_name from public.profiles where id = :id"), {"id": uid}).one()
    assert row.timezone == "UTC" and row.display_name is None


def test_anon_cannot_read_or_write_anything(tx, make_user):
    make_user()
    with as_role(tx, "anon"):
        for table in ("profiles", "tasks", "checkins", "daily_assessments", "connections"):
            expect_denied(tx, f"select * from public.{table}")
        expect_denied(tx, "insert into public.tasks (user_id, title) values (gen_random_uuid(), 'x')")


def test_users_see_and_change_only_their_own_rows(tx, make_user):
    a, b = make_user(), make_user()
    with as_role(tx, "authenticated", a):
        task_a = tx.execute(text("insert into public.tasks (user_id, title) values (:u, 'mine') returning id"),
                            {"u": a}).scalar_one()
    with as_role(tx, "authenticated", b):
        assert tx.execute(text("select count(*) from public.tasks")).scalar_one() == 0
        assert tx.execute(text("select count(*) from public.profiles")).scalar_one() == 1  # only B's own
        assert tx.execute(text("update public.tasks set title = 'stolen' where id = :id"), {"id": task_a}).rowcount == 0
        assert tx.execute(text("delete from public.tasks where id = :id"), {"id": task_a}).rowcount == 0
        assert tx.execute(text("update public.profiles set display_name = 'x' where id = :id"), {"id": a}).rowcount == 0
    with as_role(tx, "authenticated", a):
        assert tx.execute(text("select title from public.tasks where id = :id"), {"id": task_a}).scalar_one() == "mine"


def test_users_cannot_write_rows_owned_by_someone_else(tx, make_user):
    a, b = make_user(), make_user()
    with as_role(tx, "authenticated", a):
        expect_denied(tx, "insert into public.tasks (user_id, title) values (:u, 'x')", {"u": b})
        task = tx.execute(text("insert into public.tasks (user_id, title) values (:u, 't') returning id"),
                          {"u": a}).scalar_one()
        expect_denied(tx, "update public.tasks set user_id = :u where id = :id", {"u": b, "id": task})


def test_rows_cannot_reference_another_users_records(tx, make_user):
    a, b = make_user(), make_user()
    with as_role(tx, "authenticated", b):
        goal_b = tx.execute(text("insert into public.goals (user_id, title) values (:u, 'B goal') returning id"),
                            {"u": b}).scalar_one()
    with as_role(tx, "authenticated", a):
        expect_denied(tx, "insert into public.tasks (user_id, title, goal_id) values (:u, 'x', :g)",
                      {"u": a, "g": goal_b}, sqlstate="23503")  # composite FK: (user_id, goal_id)


def test_profile_columns_outside_the_editable_set_are_protected(tx, make_user):
    a = make_user()
    with as_role(tx, "authenticated", a):
        assert tx.execute(text("update public.profiles set tone = 'gentle' where id = :id"), {"id": a}).rowcount == 1
        expect_denied(tx, "update public.profiles set created_at = now() where id = :id", {"id": a})
        expect_denied(tx, "update public.profiles set id = gen_random_uuid() where id = :id", {"id": a})
        expect_denied(tx, "insert into public.profiles (id) values (gen_random_uuid())")
        expect_denied(tx, "delete from public.profiles where id = :id", {"id": a})


def test_checkins_are_append_only_history_from_clients(tx, make_user):
    a = make_user()
    with as_role(tx, "authenticated", a):
        cid = tx.execute(text(
            "insert into public.checkins (user_id, local_date, energy, perceived_demand, context_tags) "
            "values (:u, current_date, 'low', 'heavy', '{stress}') returning id"), {"u": a}).scalar_one()
        expect_denied(tx, "update public.checkins set energy = 'high' where id = :id", {"id": cid})
        expect_denied(tx, "insert into public.checkins (user_id, local_date, legacy_friction) "
                          "values (:u, current_date, 5)", {"u": a})
        expect_denied(tx, "insert into public.checkins (user_id, local_date, energy, source) "
                          "values (:u, current_date, 'low', 'legacy_import')", {"u": a})
        expect_denied(tx, "insert into public.checkins (user_id, local_date) values (:u, current_date)",
                      {"u": a}, sqlstate="23514")  # at least one answer
        assert tx.execute(text("delete from public.checkins where id = :id"), {"id": cid}).rowcount == 1


def test_backend_written_tables_are_read_only_for_clients(tx, make_user):
    a, b = make_user(), make_user()
    for uid in (a, b):  # backend (privileged) writes an assessment for each user
        tx.execute(text(
            "insert into public.daily_assessments (user_id, local_date, status, pathway, capacity, demand, "
            "engine_version, thresholds_version, inputs_hash) values (:u, current_date, 'insufficient_evidence', "
            "'none', '{}', '{}', '2.0.0', 't', 'h')"), {"u": uid})
    with as_role(tx, "authenticated", a):
        assert tx.execute(text("select count(*) from public.daily_assessments")).scalar_one() == 1
        expect_denied(tx, "insert into public.daily_assessments (user_id, local_date, status, pathway, capacity, "
                          "demand, engine_version, thresholds_version, inputs_hash) values (:u, current_date + 1, "
                          "'insufficient_evidence', 'none', '{}', '{}', 'x', 'x', 'x')", {"u": a})
        expect_denied(tx, "delete from public.daily_assessments")
        expect_denied(tx, "insert into public.health_daily (user_id, source, local_date, readiness) "
                          "values (:u, 'oura', current_date, 80)", {"u": a})


def test_connections_are_invisible_to_clients(tx, make_user):
    a = make_user()
    tx.execute(text("insert into public.connections (user_id, provider, access_token_enc) "
                    "values (:u, 'oura', 'ciphertext')"), {"u": a})
    with as_role(tx, "authenticated", a):
        expect_denied(tx, "select * from public.connections")
        expect_denied(tx, "select provider from public.connections where user_id = :u", {"u": a})


# ── Integrity rules that encode product decisions ─────────────────────────────

def test_top_three_priorities_are_unique_per_day(tx, make_user):
    a = make_user()
    with as_role(tx, "authenticated", a):
        tx.execute(text("insert into public.tasks (user_id, title, focus_on, priority_rank) "
                        "values (:u, 'one', current_date, 1)"), {"u": a})
        expect_denied(tx, "insert into public.tasks (user_id, title, focus_on, priority_rank) "
                          "values (:u, 'dup', current_date, 1)", {"u": a}, sqlstate="23505")
        expect_denied(tx, "insert into public.tasks (user_id, title, priority_rank) values (:u, 'no day', 2)",
                      {"u": a}, sqlstate="23514")


def test_habits_and_routines_have_no_automatic_effect(tx, make_user):
    a = make_user()
    with as_role(tx, "authenticated", a):
        row = tx.execute(text("insert into public.recurring_items (user_id, kind, title) "
                              "values (:u, 'habit', 'Walk') returning demand_effect, capacity_effect"),
                         {"u": a}).one()
    assert (row.demand_effect, row.capacity_effect) == ("unknown", "unknown")


def test_plan_blocks_must_point_at_what_they_schedule(tx, make_user):
    a = make_user()
    with as_role(tx, "authenticated", a):
        expect_denied(tx, "insert into public.plan_blocks (user_id, kind, starts_at, ends_at) "
                          "values (:u, 'task', now(), now() + interval '1 hour')", {"u": a}, sqlstate="23514")
        expect_denied(tx, "insert into public.plan_blocks (user_id, kind, starts_at, ends_at) "
                          "values (:u, 'reset', now(), now())", {"u": a}, sqlstate="23514")


def test_deleting_the_auth_user_cascades_to_all_their_data(pg_engine, make_user):
    a = make_user()
    with pg_engine.begin() as conn:
        conn.execute(text("insert into public.tasks (user_id, title) values (:u, 't')"), {"u": a})
        conn.execute(text("delete from auth.users where id = :u"), {"u": a})
        assert conn.execute(text("select count(*) from public.tasks where user_id = :u"), {"u": a}).scalar_one() == 0
        assert conn.execute(text("select count(*) from public.profiles where id = :u"), {"u": a}).scalar_one() == 0


# ── Policy coverage: no client privilege without an own-rows policy ──────────

def test_every_client_privilege_is_backed_by_an_own_rows_policy(tx):
    granted = set(tx.execute(text(
        "select table_name, privilege_type from information_schema.role_table_grants "
        "where table_schema = 'public' and grantee = 'authenticated' "
        "union select table_name, privilege_type from information_schema.column_privileges "
        "where table_schema = 'public' and grantee = 'authenticated'")).all())
    policies = tx.execute(text(
        "select tablename, cmd, roles, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check "
        "from pg_policies where schemaname = 'public'")).all()
    for table, priv in granted:
        matching = [p for p in policies if p.tablename == table and p.cmd in (priv, "ALL")]
        assert matching, f"{table}: {priv} granted without a policy"
        for p in matching:
            assert p.roles == ["authenticated"], (table, p.roles)
            owner_col = "id" if table == "profiles" else "user_id"
            for expr in filter(None, (p.qual, p.with_check)):
                assert "auth.uid()" in expr and owner_col in expr, (table, priv, expr)
    # and nothing is granted to authenticated on a table that has no RLS policies at all
    assert {t for t, _ in granted} <= {p.tablename for p in policies}
