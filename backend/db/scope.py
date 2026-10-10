"""
Connections to the Supabase Postgres schema, and per-user scoping.

The backend connects with privileged credentials (the `postgres` role, which
bypasses RLS), so it never relies on RLS alone. Two layers apply:

1. Every query takes an explicit user ID and filters on it in SQL.
2. `user_scope()` additionally drops to the `authenticated` role and sets the
   verified user as the JWT subject for the transaction, so the same RLS
   policies that protect direct client access also apply to backend queries.

`privileged()` is reserved for operations clients may never perform
(e.g. creating the profile row, connections, data deletion); those still
filter on an explicit user ID.
"""
from __future__ import annotations

import json
import uuid
from contextlib import contextmanager
from functools import lru_cache
from typing import Iterator

from fastapi import HTTPException, status
from sqlalchemy import Connection, Engine, create_engine, text

from backend.config import settings


class DatabaseNotConfigured(RuntimeError):
    pass


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    url = settings.database_url
    if not url.startswith("postgresql"):
        raise DatabaseNotConfigured("DATABASE_URL is not a Postgres URL")
    return create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5)


def engine_or_503() -> Engine:
    try:
        return get_engine()
    except DatabaseNotConfigured as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Database is not configured.") from exc


@contextmanager
def user_scope(engine: Engine, user_id: uuid.UUID) -> Iterator[Connection]:
    """One transaction running as `authenticated` with sub = user_id (RLS enforced)."""
    claims = json.dumps({"sub": str(user_id), "role": "authenticated"})
    with engine.begin() as conn:
        conn.execute(text("set local role authenticated"))
        conn.execute(text("select set_config('request.jwt.claims', :claims, true)"), {"claims": claims})
        yield conn


@contextmanager
def privileged(engine: Engine) -> Iterator[Connection]:
    """One transaction as the backend's own role. Callers must filter by user ID."""
    with engine.begin() as conn:
        yield conn
