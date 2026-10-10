"""
Alembic environment for the Supabase Postgres schema.

Safety rails:
- The URL comes from DATABASE_URL only, and must be postgres.
- A non-local host is refused unless `-x allow_remote=true` is passed, so a
  hosted project is never migrated by accident.
- The version table lives in the private `rhythm_private` schema, which is not
  exposed through the Supabase API.
- Everything (schema, version table, all pending migrations) runs in a single
  transaction, so a failure at any step leaves nothing behind.
"""
from __future__ import annotations

from urllib.parse import urlparse

from alembic import context
from sqlalchemy import create_engine, text

from backend.config import settings

LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}
VERSION_SCHEMA = "rhythm_private"


def _url() -> str:
    url = context.get_x_argument(as_dictionary=True).get("url") or settings.database_url
    if not url.startswith("postgresql"):
        raise SystemExit("DATABASE_URL must be a postgresql+psycopg:// URL for migrations.")
    host = urlparse(url.replace("postgresql+psycopg", "postgresql", 1)).hostname or ""
    allow_remote = context.get_x_argument(as_dictionary=True).get("allow_remote") == "true"
    if host not in LOCAL_HOSTS and not allow_remote:
        raise SystemExit(
            f"Refusing to migrate non-local database host '{host}'. "
            "Hosted migrations need explicit approval; rerun with -x allow_remote=true."
        )
    return url


def run_migrations_offline() -> None:
    context.configure(url=_url(), literal_binds=True, version_table_schema=VERSION_SCHEMA,
                      transaction_per_migration=False)
    with context.begin_transaction():
        context.execute(f"create schema if not exists {VERSION_SCHEMA}")
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_url())
    with engine.connect() as connection:
        context.configure(connection=connection, version_table_schema=VERSION_SCHEMA,
                          transaction_per_migration=False)
        # One transaction for everything: the private schema, the version table
        # and every pending migration. Any failure leaves the database unchanged.
        with context.begin_transaction():
            connection.execute(text(f"create schema if not exists {VERSION_SCHEMA}"))
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
