"""
Plain per-user records (goals, everyday rhythms, "what helps", Rhythm plan blocks).

Each table has a fixed spec: which columns are read, written on create, and
editable. Column names in SQL come only from these specs, never from input.
Every statement filters on the caller's user ID; callers run in user_scope (RLS).
"""
from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import Connection, text


@dataclass(frozen=True)
class Spec:
    table: str
    columns: tuple[str, ...]
    creatable: tuple[str, ...]
    editable: tuple[str, ...]
    order: str
    where: str = ""   # fixed extra filter, e.g. kind restriction


GOALS = Spec("goals", ("id", "title", "notes", "area_id", "target_on", "achieved_at", "created_at"),
             ("title", "notes", "area_id", "target_on"), ("title", "notes", "area_id", "target_on", "achieved_at"),
             "created_at", "archived_at is null")
RHYTHMS = Spec("recurring_items", ("id", "kind", "title", "cadence_note", "area_id", "created_at"),
               ("kind", "title", "cadence_note", "area_id"), ("title", "cadence_note", "area_id"),
               "created_at", "archived_at is null and kind in ('habit', 'routine')")
HELPS = Spec("what_helps", ("id", "text", "sort_order", "created_at"), ("text", "sort_order"), ("text", "sort_order"),
             "sort_order, created_at")
BLOCKS = Spec("plan_blocks", ("id", "kind", "task_id", "recurring_item_id", "title", "area_id", "starts_at", "ends_at",
                              "origin", "completed_at", "created_at"),
              ("kind", "title", "area_id", "starts_at", "ends_at", "task_id"),
              ("kind", "title", "area_id", "starts_at", "ends_at", "completed_at"),
              "starts_at", "skipped_at is null")


def _sel(spec: Spec) -> str:
    return ", ".join(spec.columns)


def _where(spec: Spec) -> str:
    return f" and {spec.where}" if spec.where else ""


def list_records(conn: Connection, user_id: uuid.UUID, spec: Spec) -> list[dict[str, Any]]:
    return [dict(r) for r in conn.execute(text(
        f"select {_sel(spec)} from public.{spec.table} where user_id = :u{_where(spec)} order by {spec.order}"
    ), {"u": user_id}).mappings()]


def create_record(conn: Connection, user_id: uuid.UUID, spec: Spec, values: dict[str, Any]) -> dict[str, Any]:
    cols = [c for c in spec.creatable if c in values]
    return dict(conn.execute(text(
        f"insert into public.{spec.table} (user_id, {', '.join(cols)}) values (:u, {', '.join(':' + c for c in cols)}) "
        f"returning {_sel(spec)}"), {"u": user_id, **{c: values[c] for c in cols}}).mappings().one())


def update_record(conn: Connection, user_id: uuid.UUID, spec: Spec, record_id: uuid.UUID,
                  values: dict[str, Any]) -> dict[str, Any] | None:
    unknown = set(values) - set(spec.editable)
    if unknown:
        raise ValueError(f"not editable: {sorted(unknown)}")
    if not values:
        row = conn.execute(text(f"select {_sel(spec)} from public.{spec.table} where user_id = :u and id = :id"
                                f"{_where(spec)}"), {"u": user_id, "id": record_id}).mappings().first()
        return dict(row) if row else None
    sets = ", ".join(f"{c} = :{c}" for c in values)
    row = conn.execute(text(f"update public.{spec.table} set {sets} where user_id = :u and id = :id{_where(spec)} "
                            f"returning {_sel(spec)}"), {**values, "u": user_id, "id": record_id}).mappings().first()
    return dict(row) if row else None


def archive_or_delete(conn: Connection, user_id: uuid.UUID, spec: Spec, record_id: uuid.UUID) -> bool:
    """Goals and rhythms are archived (history kept); other records are deleted."""
    if "archived_at" in spec.where:
        sql = f"update public.{spec.table} set archived_at = :now where user_id = :u and id = :id{_where(spec)}"
        return conn.execute(text(sql), {"u": user_id, "id": record_id,
                                        "now": dt.datetime.now(dt.timezone.utc)}).rowcount == 1
    return conn.execute(text(f"delete from public.{spec.table} where user_id = :u and id = :id{_where(spec)}"),
                        {"u": user_id, "id": record_id}).rowcount == 1
