"""Connected providers (backend only) and normalized health days. Privileged; every statement filters on the user."""
from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from sqlalchemy import Connection, text


def get_connection(conn: Connection, user_id: uuid.UUID, provider: str) -> dict[str, Any] | None:
    row = conn.execute(text(
        "select id, provider, status, scopes, access_token_enc, refresh_token_enc, token_expires_at, "
        "external_account_id, last_synced_at, last_error, created_at from public.connections "
        "where user_id = :u and provider = :p"), {"u": user_id, "p": provider}).mappings().first()
    return dict(row) if row else None


def lock_connection(conn: Connection, user_id: uuid.UUID, provider: str) -> dict[str, Any] | None:
    """The connection row, locked until this transaction ends (one token refresh at a time)."""
    row = conn.execute(text(
        "select status, access_token_enc, refresh_token_enc, token_expires_at from public.connections "
        "where user_id = :u and provider = :p for update"), {"u": user_id, "p": provider}).mappings().first()
    return dict(row) if row else None


def list_connections(conn: Connection, user_id: uuid.UUID) -> list[dict[str, Any]]:
    return [dict(r) for r in conn.execute(text(
        "select provider, status, last_synced_at, last_error, created_at from public.connections "
        "where user_id = :u order by provider"), {"u": user_id}).mappings()]


def save_tokens(conn: Connection, user_id: uuid.UUID, provider: str, *, access_enc: str, refresh_enc: str | None,
                expires_at: dt.datetime | None, scopes: list[str]) -> None:
    conn.execute(text(
        "insert into public.connections (user_id, provider, status, scopes, access_token_enc, refresh_token_enc, "
        "  token_expires_at, last_error) values (:u, :p, 'active', :scopes, :a, :r, :exp, null) "
        "on conflict (user_id, provider) do update set status = 'active', scopes = excluded.scopes, "
        "  access_token_enc = excluded.access_token_enc, "
        "  refresh_token_enc = coalesce(excluded.refresh_token_enc, public.connections.refresh_token_enc), "
        "  token_expires_at = excluded.token_expires_at, last_error = null"
    ), {"u": user_id, "p": provider, "scopes": scopes, "a": access_enc, "r": refresh_enc, "exp": expires_at})


def mark(conn: Connection, user_id: uuid.UUID, provider: str, *, status: str, error: str | None = None,
         synced_at: dt.datetime | None = None) -> None:
    conn.execute(text(
        "update public.connections set status = :s, last_error = :err, "
        "last_synced_at = coalesce(:synced, last_synced_at) where user_id = :u and provider = :p"
    ), {"u": user_id, "p": provider, "s": status, "err": (error or None) and error[:1000], "synced": synced_at})


def mark_synced(conn: Connection, user_id: uuid.UUID, provider: str, synced_at: dt.datetime) -> None:
    """For device-side sources (Apple Health, Apple Calendar): no tokens, just freshness."""
    conn.execute(text(
        "insert into public.connections (user_id, provider, status, last_synced_at) values (:u, :p, 'active', :t) "
        "on conflict (user_id, provider) do update set status = 'active', last_synced_at = excluded.last_synced_at, "
        "last_error = null"), {"u": user_id, "p": provider, "t": synced_at})


def disconnect(conn: Connection, user_id: uuid.UUID, provider: str) -> bool:
    """Tokens are destroyed; the provider's data already in Rhythm stays until the person deletes it."""
    return conn.execute(text(
        "update public.connections set status = 'revoked', access_token_enc = null, refresh_token_enc = null, "
        "token_expires_at = null where user_id = :u and provider = :p"), {"u": user_id, "p": provider}).rowcount == 1


def revoke_device_calendar(conn: Connection, user_id: uuid.UUID, provider: str, from_: dt.datetime) -> int:
    """Calendar access was turned off: the connection stops counting, and events from `from_` on are removed so
    nothing stale is shown or counted. Earlier days stay as history (Insights). Returns events removed."""
    conn.execute(text("update public.connections set status = 'revoked' where user_id = :u and provider = :p"),
                 {"u": user_id, "p": provider})
    return conn.execute(text("delete from public.external_events where user_id = :u and source = :p "
                             "and ends_at > :f"), {"u": user_id, "p": provider, "f": from_}).rowcount


def latest_health_day(conn: Connection, user_id: uuid.UUID, source: str) -> dt.date | None:
    return conn.execute(text("select max(local_date) from public.health_daily where user_id = :u and source = :s"),
                        {"u": user_id, "s": source}).scalar()


def upsert_health_days(conn: Connection, user_id: uuid.UUID, source: str, days: list[dict[str, Any]],
                       batch: str) -> int:
    for d in days:
        conn.execute(text(
            "insert into public.health_daily (user_id, source, local_date, readiness, sleep_minutes, hrv_ms, hrv_method, "
            "  resting_hr, source_record_id, import_batch, ingested_at) "
            "values (:u, :s, :local_date, :readiness, :sleep_minutes, :hrv_ms, :hrv_method, :resting_hr, :record_id, "
            "  :batch, now()) "
            "on conflict (user_id, source, local_date) do update set readiness = excluded.readiness, "
            "  sleep_minutes = excluded.sleep_minutes, hrv_ms = excluded.hrv_ms, hrv_method = excluded.hrv_method, "
            "  resting_hr = excluded.resting_hr, source_record_id = excluded.source_record_id, "
            "  import_batch = excluded.import_batch, ingested_at = now()"
        ), {"u": user_id, "s": source, "batch": batch, **{
            k: d.get(k) for k in ("local_date", "readiness", "sleep_minutes", "hrv_ms", "hrv_method", "resting_hr")},
            "record_id": d.get("record_id")})
    return len(days)


def health_sources_on(conn: Connection, user_id: uuid.UUID, day: dt.date) -> set[str]:
    return set(conn.execute(text("select source from public.health_daily where user_id = :u and local_date = :d"),
                            {"u": user_id, "d": day}).scalars())


def replace_calendar_events(conn: Connection, user_id: uuid.UUID, source: str, start: dt.datetime,
                            end: dt.datetime, events: list[dict[str, Any]]) -> int:
    """Busy blocks only: titles are never stored (the app reads them from the device)."""
    conn.execute(text("delete from public.external_events where user_id = :u and source = :s "
                      "and starts_at < :e and ends_at > :b"), {"u": user_id, "s": source, "b": start, "e": end})
    for ev in events:
        conn.execute(text(
            "insert into public.external_events (user_id, source, calendar_ref, external_id, starts_at, ends_at, "
            "  all_day, busy, declined, title, synced_at) "
            "values (:u, :s, :calendar_ref, :external_id, :starts_at, :ends_at, :all_day, :busy, :declined, null, now()) "
            "on conflict (user_id, source, external_id) do update set calendar_ref = excluded.calendar_ref, "
            "  starts_at = excluded.starts_at, ends_at = excluded.ends_at, all_day = excluded.all_day, "
            "  busy = excluded.busy, declined = excluded.declined, title = null, synced_at = now()"
        ), {"u": user_id, "s": source, **{k: ev[k] for k in (
            "calendar_ref", "external_id", "starts_at", "ends_at", "all_day", "busy", "declined")}})
    return len(events)
