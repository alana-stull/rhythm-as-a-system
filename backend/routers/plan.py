"""
/plan — the two-layer timeline for Day, Week and Month.

Layer 1: synced calendar events (read-only here; titles resolved on the phone).
Layer 2: Rhythm's own blocks (one-off events, protected time, scheduled tasks),
which the person creates, moves and removes. Rhythm never writes to the
external calendar. Open windows are offered for today only, and only when a
fresh calendar says what's free.
"""
from __future__ import annotations

import datetime as dt
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import Engine, text
from sqlalchemy.exc import IntegrityError

from backend.auth import CurrentUser, get_current_user
from backend.db import assessments, plan_blocks, records
from backend.db.scope import engine_or_503, user_scope
from backend.pipeline.clock import get_now
from backend.pipeline.day import zone
from backend.pipeline.recompute import recompute_day
from backend.pipeline.today import windows_for

router = APIRouter()

ItemKind = Literal["calendar", "event", "commitment", "routine", "habit", "protected", "task", "reset", "focus"]


class PlanItem(BaseModel):
    id: uuid.UUID
    kind: ItemKind
    source: str
    external_id: str | None
    title: str | None
    starts_at: dt.datetime
    ends_at: dt.datetime
    all_day: bool
    area_id: uuid.UUID | None
    task_id: uuid.UUID | None
    editable: bool
    completed: bool


class PlanTask(BaseModel):
    id: uuid.UUID
    title: str
    focus_on: dt.date | None
    due_on: dt.date | None
    completed_at: dt.datetime | None
    area_id: uuid.UUID | None
    priority_rank: int | None
    estimate_minutes: int | None


class PlanDay(BaseModel):
    date: dt.date
    status: str | None
    state: str | None


class Window(BaseModel):
    starts_at: dt.datetime
    ends_at: dt.datetime


class PlanOut(BaseModel):
    timezone: str
    start: dt.date
    end: dt.date
    days: list[PlanDay]
    items: list[PlanItem]
    tasks: list[PlanTask]
    open_windows: list[Window] | None   # today only; null = unknown (no fresh calendar)


def _tasks_between(conn, user_id: uuid.UUID, start: dt.date, end: dt.date) -> list[dict]:
    return [dict(r) for r in conn.execute(text(
        "select id, title, focus_on, due_on, completed_at, area_id, priority_rank, estimate_minutes from public.tasks "
        "where user_id = :u and let_go_at is null and (focus_on between :s and :e or due_on between :s and :e) "
        "order by coalesce(focus_on, due_on), priority_rank nulls last, created_at"),
        {"u": user_id, "s": start, "e": end}).mappings()]


@router.get("", response_model=PlanOut)
def get_plan(start: dt.date | None = None, days: int = Query(1, ge=1, le=42),
             user: CurrentUser = Depends(get_current_user), engine: Engine = Depends(engine_or_503),
             now: dt.datetime = Depends(get_now)):
    today = recompute_day(engine, user.id, now)   # keeps today's state current; gives zone and windows
    tz = zone(today.profile.get("timezone"))
    start = start or today.day.local_date
    end = start + dt.timedelta(days=days - 1)
    lo = dt.datetime.combine(start, dt.time(), tzinfo=tz)
    hi = dt.datetime.combine(end + dt.timedelta(days=1), dt.time(), tzinfo=tz)

    with user_scope(engine, user.id) as conn:
        events = plan_blocks.external_events_between(conn, user.id, lo, hi)
        blocks = plan_blocks.blocks_between(conn, user.id, lo, hi)
        task_rows = _tasks_between(conn, user.id, start, end)
        states = {a["local_date"]: a for a in assessments.assessments_between(conn, user.id, start, end)}

    items = [PlanItem(id=e["id"], kind="calendar", source=e["source"], external_id=e["external_id"], title=e["title"],
                      starts_at=e["starts_at"], ends_at=e["ends_at"], all_day=e["all_day"], area_id=e["area_id"],
                      task_id=None, editable=False, completed=False) for e in events]
    items += [PlanItem(id=b["id"], kind=b["kind"], source="rhythm", external_id=None, title=b["title"],
                       starts_at=b["starts_at"], ends_at=b["ends_at"], all_day=False, area_id=b["area_id"],
                       task_id=b["task_id"], editable=True, completed=b["completed_at"] is not None) for b in blocks]
    items.sort(key=lambda i: i.starts_at)

    windows = None
    if start <= today.day.local_date <= end:
        today_blocks = [b for b in blocks if b["starts_at"] < today.day.day_end and b["ends_at"] > today.day.day_start]
        found = windows_for(today, today_blocks)
        windows = None if found is None else [Window(starts_at=w.start, ends_at=w.end) for w in found]

    return PlanOut(
        timezone=str(tz), start=start, end=end,
        days=[PlanDay(date=d, status=states.get(d, {}).get("status"), state=states.get(d, {}).get("state"))
              for d in (start + dt.timedelta(days=i) for i in range(days))],
        items=items, tasks=task_rows, open_windows=windows)


class BlockCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["event", "protected", "task"]
    title: str | None = Field(default=None, min_length=1, max_length=200)
    task_id: uuid.UUID | None = None
    area_id: uuid.UUID | None = None
    starts_at: dt.datetime
    ends_at: dt.datetime

    @model_validator(mode="after")
    def _valid(self):
        if self.starts_at.tzinfo is None or self.ends_at <= self.starts_at:
            raise ValueError("blocks need aware times and must end after they start")
        if self.ends_at - self.starts_at > dt.timedelta(hours=24):
            raise ValueError("blocks can't be longer than a day")
        if self.kind == "event" and not (self.title and self.title.strip()):
            raise ValueError("an event needs a title")
        if self.kind == "task" and self.task_id is None:
            raise ValueError("a task block needs task_id")
        return self


class BlockUpdate(BaseModel):
    """Edit any of a block's details. Only fields present change; null clears title or tag."""
    model_config = ConfigDict(extra="forbid")
    kind: Literal["event", "protected"] | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    area_id: uuid.UUID | None = None
    starts_at: dt.datetime | None = None
    ends_at: dt.datetime | None = None
    completed: bool | None = None

    @model_validator(mode="after")
    def _valid(self):
        for t in (self.starts_at, self.ends_at):
            if t is not None and t.tzinfo is None:
                raise ValueError("times must be timezone-aware")
        if self.starts_at and self.ends_at and not (self.starts_at < self.ends_at <= self.starts_at + dt.timedelta(hours=24)):
            raise ValueError("blocks must end after they start, within a day")
        return self


@router.post("/blocks", response_model=PlanItem, status_code=status.HTTP_201_CREATED)
def create_block(body: BlockCreate, user: CurrentUser = Depends(get_current_user),
                 engine: Engine = Depends(engine_or_503)):
    try:
        with user_scope(engine, user.id) as conn:
            b = records.create_record(conn, user.id, records.BLOCKS, body.model_dump())
    except IntegrityError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Task or tag not found.") from None
    return _item(b)


@router.patch("/blocks/{block_id}", response_model=PlanItem)
def update_block(block_id: uuid.UUID, body: BlockUpdate, user: CurrentUser = Depends(get_current_user),
                 engine: Engine = Depends(engine_or_503), now: dt.datetime = Depends(get_now)):
    values = {k: getattr(body, k) for k in body.model_fields_set if k != "completed"}
    if "completed" in body.model_fields_set:
        values["completed_at"] = now if body.completed else None
    try:
        with user_scope(engine, user.id) as conn:
            b = records.update_record(conn, user.id, records.BLOCKS, block_id, values)
    except IntegrityError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "That change isn't valid (an event needs a title, blocks must end after they start, "
                            "and tags must be yours).") from None
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Block not found.")
    return _item(b)


@router.delete("/blocks/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_block(block_id: uuid.UUID, user: CurrentUser = Depends(get_current_user),
                 engine: Engine = Depends(engine_or_503)):
    with user_scope(engine, user.id) as conn:
        if not records.archive_or_delete(conn, user.id, records.BLOCKS, block_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Block not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _item(b: dict) -> PlanItem:
    return PlanItem(id=b["id"], kind=b["kind"], source="rhythm", external_id=None, title=b["title"],
                    starts_at=b["starts_at"], ends_at=b["ends_at"], all_day=False, area_id=b["area_id"],
                    task_id=b["task_id"], editable=True, completed=b["completed_at"] is not None)
