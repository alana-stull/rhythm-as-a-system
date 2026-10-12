"""Areas of life ("tags" in the app): name + pastel color key."""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import Connection, text

COLUMNS = ("id", "name", "color_family", "sort_order", "archived_at", "created_at", "updated_at")
EDITABLE = ("name", "color_family", "sort_order", "archived_at")
_SELECT = ", ".join(COLUMNS)


def list_areas(conn: Connection, user_id: uuid.UUID, include_archived: bool = False) -> list[dict[str, Any]]:
    sql = f"select {_SELECT} from public.areas where user_id = :u"
    if not include_archived:
        sql += " and archived_at is null"
    return [dict(r) for r in conn.execute(text(sql + " order by sort_order, created_at"), {"u": user_id}).mappings()]


def create_area(conn: Connection, user_id: uuid.UUID, values: dict[str, Any]) -> dict[str, Any]:
    cols = [c for c in EDITABLE if c in values]
    row = conn.execute(text(
        f"insert into public.areas (user_id, {', '.join(cols)}) values (:u, {', '.join(':' + c for c in cols)}) "
        f"returning {_SELECT}"), {"u": user_id, **{c: values[c] for c in cols}}).mappings().one()
    return dict(row)


def update_area(conn: Connection, user_id: uuid.UUID, area_id: uuid.UUID, values: dict[str, Any]) -> dict[str, Any] | None:
    unknown = set(values) - set(EDITABLE)
    if unknown:
        raise ValueError(f"not editable: {sorted(unknown)}")
    if not values:
        row = conn.execute(text(f"select {_SELECT} from public.areas where user_id = :u and id = :id"),
                           {"u": user_id, "id": area_id}).mappings().first()
        return dict(row) if row else None
    sets = ", ".join(f"{c} = :{c}" for c in values)  # names from EDITABLE only
    row = conn.execute(text(f"update public.areas set {sets} where user_id = :u and id = :id returning {_SELECT}"),
                       {**values, "u": user_id, "id": area_id}).mappings().first()
    return dict(row) if row else None


def delete_area(conn: Connection, user_id: uuid.UUID, area_id: uuid.UUID) -> bool:
    """Tasks, goals and calendar preferences that used it keep existing, untagged."""
    result = conn.execute(text("delete from public.areas where user_id = :u and id = :id"), {"u": user_id, "id": area_id})
    return result.rowcount == 1
