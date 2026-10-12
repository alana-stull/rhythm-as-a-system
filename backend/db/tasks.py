"""Tasks and Today's Top 3.

There is no status column: a task is open until `completed_at` or `let_go_at`
is set, and where it shows up comes from `focus_on` / `due_on`. Deferral
history (`first_focus_on`, `times_deferred`) is maintained by a database
trigger and is read-only here.
"""
from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from sqlalchemy import Connection, text

COLUMNS = ("id", "title", "notes", "area_id", "goal_id", "effort", "estimate_minutes", "due_on", "focus_on",
           "priority_rank", "completed_at", "let_go_at", "source", "first_focus_on", "times_deferred",
           "created_at", "updated_at")
EDITABLE = ("title", "notes", "area_id", "goal_id", "effort", "estimate_minutes", "due_on", "focus_on",
            "completed_at", "let_go_at")
CREATABLE = EDITABLE + ("source",)
TOP = 3
_SELECT = ", ".join(COLUMNS)


class TopThreeFull(Exception):
    pass


def get_task(conn: Connection, user_id: uuid.UUID, task_id: uuid.UUID) -> dict[str, Any] | None:
    row = conn.execute(text(f"select {_SELECT} from public.tasks where user_id = :u and id = :id"),
                       {"u": user_id, "id": task_id}).mappings().first()
    return dict(row) if row else None


def list_tasks(conn: Connection, user_id: uuid.UUID, *, completed_since: dt.datetime | None = None) -> list[dict[str, Any]]:
    """Open tasks, plus tasks completed or let go since `completed_since` (so today's done items stay visible)."""
    sql = (f"select {_SELECT} from public.tasks where user_id = :u and "
           "((completed_at is null and let_go_at is null) or "
           " (:since is not null and greatest(completed_at, let_go_at) >= :since)) "
           "order by focus_on nulls last, due_on nulls last, created_at")
    return [dict(r) for r in conn.execute(text(sql), {"u": user_id, "since": completed_since}).mappings()]


def create_task(conn: Connection, user_id: uuid.UUID, values: dict[str, Any]) -> dict[str, Any]:
    cols = [c for c in CREATABLE if c in values]
    row = conn.execute(text(
        f"insert into public.tasks (user_id, {', '.join(cols)}) values (:u, {', '.join(':' + c for c in cols)}) "
        f"returning {_SELECT}"), {"u": user_id, **{c: values[c] for c in cols}}).mappings().one()
    return dict(row)


def update_task(conn: Connection, user_id: uuid.UUID, task_id: uuid.UUID, values: dict[str, Any]) -> dict[str, Any] | None:
    unknown = set(values) - set(EDITABLE)
    if unknown:
        raise ValueError(f"not editable: {sorted(unknown)}")
    if not values:
        return get_task(conn, user_id, task_id)
    sets = ", ".join(f"{c} = :{c}" for c in values)  # names from EDITABLE only
    # Moving a priority off today drops it from the Top 3.
    if "focus_on" in values:
        sets += ", priority_rank = case when :focus_on is distinct from focus_on then null else priority_rank end"
    row = conn.execute(text(f"update public.tasks set {sets} where user_id = :u and id = :id returning {_SELECT}"),
                       {**values, "u": user_id, "id": task_id}).mappings().first()
    return dict(row) if row else None


def delete_task(conn: Connection, user_id: uuid.UUID, task_id: uuid.UUID) -> bool:
    return conn.execute(text("delete from public.tasks where user_id = :u and id = :id"),
                        {"u": user_id, "id": task_id}).rowcount == 1


def priorities_for(conn: Connection, user_id: uuid.UUID, day: dt.date) -> list[dict[str, Any]]:
    """Today's Top 3, in rank order. Completed ones stay listed (they still take a slot)."""
    sql = (f"select {_SELECT} from public.tasks where user_id = :u and focus_on = :d and priority_rank is not null "
           "and let_go_at is null order by priority_rank, created_at")
    return [dict(r) for r in conn.execute(text(sql), {"u": user_id, "d": day}).mappings()]


def make_priority(conn: Connection, user_id: uuid.UUID, task_id: uuid.UUID, day: dt.date) -> dict[str, Any] | None:
    """Focus the task on `day` and give it the lowest free rank. Raises TopThreeFull."""
    task = get_task(conn, user_id, task_id)
    if task is None:
        return None
    if task["focus_on"] == day and task["priority_rank"] is not None:
        return task
    # Serialize concurrent requests for this user's day before counting slots.
    conn.execute(text("select pg_advisory_xact_lock(hashtext(:k))"), {"k": f"top3:{user_id}:{day}"})
    taken = {t["priority_rank"] for t in priorities_for(conn, user_id, day)}
    free = [r for r in range(1, TOP + 1) if r not in taken]
    if not free:
        raise TopThreeFull()
    row = conn.execute(text(
        f"update public.tasks set focus_on = :d, priority_rank = :r where user_id = :u and id = :id returning {_SELECT}"
    ), {"d": day, "r": free[0], "u": user_id, "id": task_id}).mappings().first()
    return dict(row) if row else None


def clear_priority(conn: Connection, user_id: uuid.UUID, task_id: uuid.UUID) -> dict[str, Any] | None:
    row = conn.execute(text(f"update public.tasks set priority_rank = null where user_id = :u and id = :id "
                            f"returning {_SELECT}"), {"u": user_id, "id": task_id}).mappings().first()
    return dict(row) if row else None
