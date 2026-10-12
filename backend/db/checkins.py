"""Check-ins: append-only history; each question uses its latest answer (D3)."""
from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from sqlalchemy import Connection, text

COLUMNS = ("id", "local_date", "recorded_at", "energy", "perceived_demand", "rested", "context_tags", "note", "source")
_SELECT = ", ".join(COLUMNS)


def create_checkin(conn: Connection, user_id: uuid.UUID, local_date: dt.date, recorded_at: dt.datetime,
                   values: dict[str, Any]) -> dict[str, Any]:
    row = conn.execute(text(
        "insert into public.checkins (user_id, local_date, recorded_at, energy, perceived_demand, rested, context_tags, note) "
        "values (:u, :d, :at, :energy, :perceived_demand, :rested, :context_tags, :note) "
        f"returning {_SELECT}"), {
            "u": user_id, "d": local_date, "at": recorded_at,
            "energy": values.get("energy"), "perceived_demand": values.get("perceived_demand"),
            "rested": values.get("rested"), "context_tags": list(values.get("context_tags") or []),
            "note": values.get("note"),
        }).mappings().one()
    return dict(row)


def checkins_for(conn: Connection, user_id: uuid.UUID, local_date: dt.date) -> list[dict[str, Any]]:
    return [dict(r) for r in conn.execute(text(
        f"select {_SELECT} from public.checkins where user_id = :u and local_date = :d order by recorded_at"
    ), {"u": user_id, "d": local_date}).mappings()]


def delete_checkin(conn: Connection, user_id: uuid.UUID, checkin_id: uuid.UUID) -> bool:
    return conn.execute(text("delete from public.checkins where user_id = :u and id = :id"),
                        {"u": user_id, "id": checkin_id}).rowcount == 1
