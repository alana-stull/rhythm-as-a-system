"""Migration 0001 only creates; it never drops, deletes, updates or truncates existing data."""
import importlib.util
import re
from pathlib import Path

MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "versions" / "0001_core_schema.py"


def _module():
    spec = importlib.util.spec_from_file_location("m0001", MIGRATION)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _top_level_statements(sql: str) -> list[str]:
    body = re.sub(r"\$\$.*?\$\$", "$$ … $$", sql, flags=re.S)  # function/DO bodies checked separately
    body = re.sub(r"--[^\n]*", "", body)
    return [" ".join(s.split()).lower() for s in body.split(";") if s.strip()]


def test_upgrade_only_creates_and_restricts():
    sql = _module().SCHEMA_SQL
    allowed = ("create schema if not exists rhythm_private", "create function rhythm_private.",
               "create table public.", "create index ", "create unique index ", "create trigger ",
               "create policy ", "revoke all on schema rhythm_private", "revoke all on function rhythm_private.",
               "grant select", "grant update (", "grant insert (", "do $$")
    for stmt in _top_level_statements(sql):
        assert stmt.startswith(allowed), stmt[:80]
    no_bodies = re.sub(r"\$\$.*?\$\$", "", sql, flags=re.S)
    assert not re.search(r"^\s*(drop|delete|truncate|update|alter|insert)\b", no_bodies, re.I | re.M)
    # grants on existing objects outside Rhythm's own tables: none
    for g in re.findall(r"grant [^;]* on (?:table )?([\w.]+)", no_bodies):
        assert g.startswith("public.") and g.split(".")[1] in _module().TABLES, g


def test_dynamic_statements_only_touch_rhythm_tables():
    sql = _module().SCHEMA_SQL
    loops = re.findall(r"foreach t in array array\[(.*?)\] loop", sql, re.S)
    named = {n.strip().strip("'") for loop in loops for n in loop.replace("\n", " ").split(",")}
    assert named <= set(_module().TABLES)
    allowed = ("create trigger touch_updated_at before update on public.%I", "alter table public.%I enable row level security",
               "revoke all on table public.%I", "grant all on table public.%I to service_role",
               "grant select, insert, update, delete on table public.%I to authenticated",
               "grant select on table public.%I to authenticated", "create policy %I on public.%I")
    for stmt in re.findall(r"execute format\('([^']+)", sql):
        assert " ".join(stmt.split()).startswith(allowed), stmt[:80]
    # the only function body that writes data inserts a profile for a new auth user
    bodies = re.findall(r"as \$\$(.*?)\$\$", sql, re.S)
    writes = [b for b in bodies if re.search(r"\b(insert|update|delete)\b", b, re.I)]
    assert len(writes) == 1 and "insert into public.profiles (id) values (new.id) on conflict (id) do nothing" in writes[0]


def test_preflight_refuses_any_existing_object_it_would_create():
    src = MIGRATION.read_text()
    assert "_preflight()" in src.split("def upgrade")[1]
    mod = _module()
    assert set(mod.TABLES) == set(re.findall(r"create table public\.(\w+)", mod.SCHEMA_SQL))
    assert set(mod.FUNCTIONS) == set(re.findall(r"create function rhythm_private\.(\w+)", mod.SCHEMA_SQL))
