"""Migration 0002: additive only, and the new behavior holds for client roles."""
import datetime as dt
import importlib.util
import re
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text

from backend.tests.pg_support import as_role, make_user, pg_engine  # noqa: F401 (fixtures)
from backend.tests.test_rls import expect_denied, tx  # noqa: F401 (fixtures/helpers)

MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "versions" / "0002_today_foundation.py"


def _module():
    spec = importlib.util.spec_from_file_location("m0002", MIGRATION)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _statements(sql: str) -> list[str]:
    body = re.sub(r"\$\$.*?\$\$", "$$ … $$", sql, flags=re.S)
    body = re.sub(r"--[^\n]*", "", body)
    return [" ".join(s.split()).lower() for s in body.split(";") if s.strip()]


# ── Static safety ─────────────────────────────────────────────────────────────

# The only constraints 0002 may drop, each immediately re-added (wider) under a known name.
REPLACED = {
    "checkins_check": "checkins_answered_check",
    "recurring_items_kind_check": "recurring_items_kind_check",
    "plan_blocks_kind_check": "plan_blocks_kind_check",
}


def test_upgrade_is_additive():
    mod = _module()
    allowed = ("alter table public.", "create function rhythm_private.", "revoke all on function rhythm_private.",
               "create trigger ", "create table public.", "create index ", "grant insert (", "grant update (",
               "do $$")
    for stmt in _statements(mod.SCHEMA_SQL):
        assert stmt.startswith(allowed), stmt[:80]
        if stmt.startswith("alter table"):
            assert re.match(r"alter table public\.\w+ (add column|add constraint|drop constraint)", stmt), stmt[:80]
            dropped = re.findall(r"drop constraint (\w+)", stmt)
            assert all(d in REPLACED for d in dropped), dropped
    no_bodies = re.sub(r"\$\$.*?\$\$", "", mod.SCHEMA_SQL, flags=re.S)
    assert not re.search(r"^\s*(drop table|drop column|delete|truncate|update|insert)\b", no_bodies, re.I | re.M)
    assert "drop column" not in no_bodies.lower()
    for name, readded in REPLACED.items():
        assert f"add constraint {readded}" in no_bodies


def test_preflight_lists_everything_it_creates():
    mod = _module()
    assert set(mod.TABLES) == set(re.findall(r"create table public\.(\w+)", mod.SCHEMA_SQL))
    assert set(mod.FUNCTIONS) == set(re.findall(r"create function rhythm_private\.(\w+)", mod.SCHEMA_SQL))
    added = set()
    for table, cols in re.findall(r"alter table public\.(\w+)\s+((?:add column[^;]*))", mod.SCHEMA_SQL):
        added |= {(table, c) for c in re.findall(r"add column (\w+)", cols)}
    assert added == set(mod.COLUMNS)


# ── Behavior (local Supabase) ─────────────────────────────────────────────────

pg = pytest.mark.postgres


def _task(conn, uid, focus_on, title="t"):
    return conn.execute(text(
        "insert into public.tasks (user_id, title, focus_on) values (:u, :t, :f) "
        "returning id, first_focus_on, times_deferred"), {"u": uid, "t": title, "f": focus_on}).one()


@pg
def test_deferral_is_tracked_by_the_database_not_the_client(tx, make_user):
    a = make_user()
    d0 = dt.date(2026, 10, 9)
    with as_role(tx, "authenticated", a):
        row = _task(tx, a, d0)
        assert row.first_focus_on == d0 and row.times_deferred == 0
        tid = row.id
        # moved later twice, earlier once: two deferrals, first date kept
        for day in (d0 + dt.timedelta(1), d0 + dt.timedelta(3), d0 + dt.timedelta(2)):
            tx.execute(text("update public.tasks set focus_on = :f where id = :id"), {"f": day, "id": tid})
        # a client can't rewrite the history
        tx.execute(text("update public.tasks set times_deferred = 0, first_focus_on = :f where id = :id"),
                   {"f": d0 + dt.timedelta(5), "id": tid})
        row = tx.execute(text("select first_focus_on, times_deferred from public.tasks where id = :id"),
                         {"id": tid}).one()
    assert row.first_focus_on == d0 and row.times_deferred == 2


@pg
def test_rested_is_its_own_checkin_answer(tx, make_user):
    a = make_user()
    with as_role(tx, "authenticated", a):
        tx.execute(text("insert into public.checkins (user_id, local_date, rested) values (:u, current_date, 'high')"),
                   {"u": a})
        expect_denied(tx, "insert into public.checkins (user_id, local_date, rested) values (:u, current_date, 'great')",
                      {"u": a}, sqlstate="23514")
        expect_denied(tx, "insert into public.checkins (user_id, local_date) values (:u, current_date)",
                      {"u": a}, sqlstate="23514")


@pg
def test_protected_time_and_one_off_events(tx, make_user):
    a = make_user()
    start = dt.datetime(2026, 10, 12, 16, tzinfo=dt.timezone.utc)
    with as_role(tx, "authenticated", a):
        tx.execute(text("insert into public.plan_blocks (user_id, kind, starts_at, ends_at) "
                        "values (:u, 'protected', :s, :e)"), {"u": a, "s": start, "e": start + dt.timedelta(hours=2)})
        tx.execute(text("insert into public.plan_blocks (user_id, kind, title, starts_at, ends_at) "
                        "values (:u, 'event', 'Dentist', :s, :e)"), {"u": a, "s": start, "e": start + dt.timedelta(hours=1)})
        expect_denied(tx, "insert into public.plan_blocks (user_id, kind, starts_at, ends_at) values (:u, 'event', :s, :e)",
                      {"u": a, "s": start, "e": start + dt.timedelta(hours=1)}, sqlstate="23514")
        tx.execute(text("insert into public.recurring_items (user_id, kind, title, cadence_note) "
                        "values (:u, 'protected', 'Evenings', 'Weekdays after 6')"), {"u": a})


@pg
def test_calendar_preferences_are_private_and_tag_safe(tx, make_user):
    a, b = make_user(), make_user()
    with as_role(tx, "authenticated", b):
        b_area = tx.execute(text("insert into public.areas (user_id, name) values (:u, 'B') returning id"),
                            {"u": b}).scalar()
    with as_role(tx, "authenticated", a):
        area = tx.execute(text("insert into public.areas (user_id, name, color_family) values (:u, 'Work', 'sky') "
                               "returning id"), {"u": a}).scalar()
        tx.execute(text("insert into public.calendar_settings (user_id, source, calendar_ref, default_area_id) "
                        "values (:u, 'apple_calendar', 'cal-hash', :a)"), {"u": a, "a": area})
        tx.execute(text("insert into public.event_overrides (user_id, source, external_id, treatment) "
                        "values (:u, 'apple_calendar', 'evt-1', 'ignore')"), {"u": a})
        # can't point at another user's tag
        expect_denied(tx, "insert into public.event_overrides (user_id, source, external_id, area_id) "
                          "values (:u, 'apple_calendar', 'evt-2', :a)", {"u": a, "a": b_area}, sqlstate="23503")
        # an override must say something
        expect_denied(tx, "insert into public.event_overrides (user_id, source, external_id) "
                          "values (:u, 'apple_calendar', 'evt-3')", {"u": a}, sqlstate="23514")
    with as_role(tx, "authenticated", b):
        assert tx.execute(text("select count(*) from public.calendar_settings")).scalar() == 0
        assert tx.execute(text("select count(*) from public.event_overrides")).scalar() == 0


@pg
def test_usage_ledger_is_backend_only(tx, make_user):
    a = make_user()
    with as_role(tx, "authenticated", a):
        expect_denied(tx, "select * from public.llm_usage")
        expect_denied(tx, "insert into public.llm_usage (user_id, purpose, model, outcome) "
                          "values (:u, 'what_matters_now', 'm', 'ok')", {"u": a})


@pg
def test_profile_preferences_are_client_editable_and_bounded(tx, make_user):
    a = make_user()
    with as_role(tx, "authenticated", a):
        tx.execute(text("update public.profiles set onboarding_answers = '{\"life_shape\": \"school\"}', "
                        "preferred_health_source = 'oura', ai_task_titles_consented_at = now() where id = :u"), {"u": a})
        expect_denied(tx, "update public.profiles set onboarding_answers = '[]' where id = :u", {"u": a}, sqlstate="23514")
        expect_denied(tx, "update public.profiles set preferred_health_source = 'whoop' where id = :u", {"u": a},
                      sqlstate="23514")
        row = tx.execute(text("select onboarding_answers, preferred_health_source from public.profiles where id = :u"),
                         {"u": a}).one()
    assert row.onboarding_answers == {"life_shape": "school"} and row.preferred_health_source == "oura"


@pg
def test_existing_rows_survive_the_upgrade_path(tx, make_user):
    """Rows written under 0001 rules remain valid under 0002 (nothing is rewritten)."""
    a = make_user()
    tx.execute(text("insert into public.checkins (user_id, local_date, energy) values (:u, current_date, 'low')"), {"u": a})
    tx.execute(text("insert into public.checkins (user_id, local_date, legacy_friction, source) "
                    "values (:u, current_date, 5, 'legacy_import')"), {"u": a})
    assert tx.execute(text("select count(*) from public.checkins where user_id = :u"), {"u": a}).scalar() == 2
    assert uuid.UUID(str(a))
