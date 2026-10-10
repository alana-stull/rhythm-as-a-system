"""
Read-only preflight before applying migration 0001 to the hosted project.

Connects with DATABASE_URL in a READ ONLY session, reads system catalogs only
(never auth.users rows), prints no secrets, and exits 0 only if everything 0001
needs is in place:

- the connection role is `postgres` (the role the migration will run as);
- it has TRIGGER and REFERENCES on auth.users, CREATE on the database and on
  public, and membership in `authenticated`;
- nothing 0001 creates already exists, and no Alembic version is recorded.

    .venv/bin/python -m backend.scripts.preflight_hosted
"""
from __future__ import annotations

import sys
from urllib.parse import urlparse

import psycopg

from backend.config import settings

RHYTHM_TABLES = ["profiles", "areas", "goals", "tasks", "recurring_items", "recurring_item_logs", "plan_blocks",
                 "checkins", "connections", "health_daily", "external_events", "daily_assessments", "interpretations"]
PLACEHOLDERS = ("your-project-ref", "your-db-password", "[YOUR-PASSWORD]", "aws-0-region")

CHECKS_SQL = """
with au as (
  select c.oid, c.relowner from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'auth' and c.relname = 'users'
)
select
  current_setting('server_version')                                             as server_version,
  current_user::text                                                            as current_user,
  session_user::text                                                            as session_user,
  current_setting('transaction_read_only')                                      as read_only,
  (select pg_get_userbyid(relowner) from au)                                    as auth_users_owner,
  (select has_table_privilege(current_user, oid, 'TRIGGER') from au)            as trigger_on_auth_users,
  (select has_table_privilege(current_user, oid, 'REFERENCES') from au)         as references_on_auth_users,
  has_database_privilege(current_database(), 'CREATE')                         as create_on_database,
  has_schema_privilege('public', 'CREATE')                                      as create_on_public,
  pg_has_role(current_user, 'authenticated', 'MEMBER')                          as member_of_authenticated,
  (select rolbypassrls from pg_roles where rolname = current_user)              as bypassrls,
  (select coalesce(string_agg(c.relname, ', '), '') from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = any(%(tables)s))                 as conflicting_tables,
  (select coalesce(string_agg(p.proname, ', '), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'rhythm_private' and p.proname in ('touch_updated_at', 'handle_new_user')) as conflicting_functions,
  (select count(*) from pg_trigger t join au on au.oid = t.tgrelid
    where t.tgname = 'rhythm_on_auth_user_created')                             as conflicting_trigger,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'rhythm_private' and c.relname = 'alembic_version')       as alembic_version_table
"""


def _describe(url: str) -> dict:
    u = urlparse(url.replace("postgresql+psycopg", "postgresql", 1))
    return {"host": u.hostname, "port": u.port, "user": u.username, "database": (u.path or "/").lstrip("/")}


def main() -> int:
    url = settings.database_url
    if not url.startswith("postgresql") or any(p in url for p in PLACEHOLDERS):
        print("DATABASE_URL is not set to the hosted project yet (placeholder or non-Postgres). Nothing was run.")
        return 2
    target = _describe(url)
    print(f"Target: {target['user']}@{target['host']}:{target['port']}/{target['database']} (password not shown)")
    if target["port"] != 5432:
        print("Note: port is not 5432; migrations should use the Session pooler (5432), not the Transaction pooler (6543).")

    dsn = url.replace("postgresql+psycopg", "postgresql", 1)
    # Startup options (-c ...) are not forwarded by the Supabase pooler, so the
    # session is made read-only with SQL and verified before anything is read.
    with psycopg.connect(dsn, connect_timeout=15, autocommit=True) as conn:
        conn.execute("set session characteristics as transaction read only")
        conn.execute("set statement_timeout = 15000")
        guard = conn.execute("select current_setting('default_transaction_read_only'), "
                             "current_setting('statement_timeout')").fetchone()
        if guard != ("on", "15s"):
            print(f"Could not make the session read-only (default_transaction_read_only={guard[0]}, "
                  f"statement_timeout={guard[1]}). Stopped before reading anything.")
            return 3
        print(f"Safeguards confirmed before any catalog read: default_transaction_read_only={guard[0]}, "
              f"statement_timeout={guard[1]}")
        cur = conn.execute(CHECKS_SQL, {"tables": RHYTHM_TABLES})
        r = dict(zip([d.name for d in cur.description], cur.fetchone()))

    checks = [
        ("Session is read-only (this preflight changes nothing)", r["read_only"] == "on", r["read_only"]),
        ("Postgres 15 or newer", int(r["server_version"].split(".")[0]) >= 15, r["server_version"]),
        ("Connected as postgres (the migration role)", r["current_user"] == "postgres",
         f"current_user={r['current_user']}, session_user={r['session_user']}"),
        ("TRIGGER on auth.users (profile trigger)", bool(r["trigger_on_auth_users"]),
         f"owner={r['auth_users_owner']}"),
        ("REFERENCES on auth.users (profiles foreign key)", bool(r["references_on_auth_users"]), ""),
        ("CREATE on database (rhythm_private schema)", bool(r["create_on_database"]), ""),
        ("CREATE on schema public (tables)", bool(r["create_on_public"]), ""),
        ("Member of authenticated (backend RLS scoping)", bool(r["member_of_authenticated"]), ""),
        ("Bypasses RLS (backend privileged path)", bool(r["bypassrls"]), ""),
        ("No existing Rhythm tables", r["conflicting_tables"] == "", r["conflicting_tables"] or "none"),
        ("No existing Rhythm functions", r["conflicting_functions"] == "", r["conflicting_functions"] or "none"),
        ("No existing Rhythm trigger on auth.users", r["conflicting_trigger"] == 0, str(r["conflicting_trigger"])),
        ("No Alembic version recorded", r["alembic_version_table"] == 0,
         "absent" if r["alembic_version_table"] == 0 else "rhythm_private.alembic_version exists"),
    ]
    width = max(len(c[0]) for c in checks)
    for name, ok, detail in checks:
        print(f"  {'PASS' if ok else 'FAIL'}  {name.ljust(width)}  {detail}")
    passed = all(ok for _, ok, _ in checks)
    print("\nPREFLIGHT PASSED: ready for approval to apply 0001." if passed
          else "\nPREFLIGHT FAILED: do not apply 0001; review the FAIL rows.")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
