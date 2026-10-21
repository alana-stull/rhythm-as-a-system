"""You: goals, everyday rhythms (habits/routines) and "what helps me feel my best".

No `from __future__ import annotations` here: the route factory passes model
classes as annotations, which FastAPI must see as real types, not strings.
"""

import datetime as dt
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import Engine, text
from sqlalchemy.exc import IntegrityError

from backend.auth import CurrentUser, get_current_user
from backend.db import records
from backend.db.scope import engine_or_503, user_scope
from backend.pipeline.clock import get_now

router = APIRouter()


def _stripped(v: str | None) -> str | None:
    if v is None:
        return v
    v = v.strip()
    if not v:
        raise ValueError("cannot be blank")
    return v


class GoalWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)
    area_id: uuid.UUID | None = None
    target_on: dt.date | None = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: str | None) -> str | None:
        return _stripped(v)


class GoalCreate(GoalWrite):
    title: str = Field(max_length=200)  # type: ignore[assignment]


class GoalOut(BaseModel):
    id: uuid.UUID
    title: str
    notes: str | None
    area_id: uuid.UUID | None
    target_on: dt.date | None
    achieved_at: dt.datetime | None
    created_at: dt.datetime


class RhythmWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, max_length=200)
    cadence_note: str | None = Field(default=None, max_length=200)
    area_id: uuid.UUID | None = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: str | None) -> str | None:
        return _stripped(v)


class RhythmCreate(RhythmWrite):
    title: str = Field(max_length=200)  # type: ignore[assignment]
    kind: Literal["habit", "routine"] = "routine"


class RhythmOut(BaseModel):
    id: uuid.UUID
    kind: str
    title: str
    cadence_note: str | None
    area_id: uuid.UUID | None
    created_at: dt.datetime


class HelpWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(max_length=200)

    @field_validator("text")
    @classmethod
    def _text(cls, v: str | None) -> str | None:
        return _stripped(v)


class HelpOut(BaseModel):
    id: uuid.UUID
    text: str
    sort_order: int
    created_at: dt.datetime


def _crud(prefix: str, spec: records.Spec, create_model, write_model, out_model, noun: str):
    @router.get(prefix, response_model=list[out_model], name=f"list_{noun}")
    def _list(user: CurrentUser = Depends(get_current_user), engine: Engine = Depends(engine_or_503)):
        with user_scope(engine, user.id) as conn:
            return records.list_records(conn, user.id, spec)

    @router.post(prefix, response_model=out_model, status_code=status.HTTP_201_CREATED, name=f"create_{noun}")
    def _create(body: create_model, user: CurrentUser = Depends(get_current_user),
                engine: Engine = Depends(engine_or_503)):
        try:
            with user_scope(engine, user.id) as conn:
                return records.create_record(conn, user.id, spec, body.model_dump(exclude_unset=False))
        except IntegrityError:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Tag not found.") from None

    @router.patch(prefix + "/{record_id}", response_model=out_model, name=f"update_{noun}")
    def _update(record_id: uuid.UUID, body: write_model, user: CurrentUser = Depends(get_current_user),
                engine: Engine = Depends(engine_or_503)):
        values = {k: getattr(body, k) for k in body.model_fields_set}
        try:
            with user_scope(engine, user.id) as conn:
                row = records.update_record(conn, user.id, spec, record_id, values)
        except IntegrityError:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Tag not found.") from None
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"{noun.capitalize()} not found.")
        return row

    @router.delete(prefix + "/{record_id}", status_code=status.HTTP_204_NO_CONTENT, name=f"delete_{noun}")
    def _delete(record_id: uuid.UUID, user: CurrentUser = Depends(get_current_user),
                engine: Engine = Depends(engine_or_503)):
        with user_scope(engine, user.id) as conn:
            if not records.archive_or_delete(conn, user.id, spec, record_id):
                raise HTTPException(status.HTTP_404_NOT_FOUND, f"{noun.capitalize()} not found.")
        return Response(status_code=status.HTTP_204_NO_CONTENT)


_crud("/goals", records.GOALS, GoalCreate, GoalWrite, GoalOut, "goal")
_crud("/rhythms", records.RHYTHMS, RhythmCreate, RhythmWrite, RhythmOut, "rhythm")


class HelpPatch(HelpWrite):
    text: str | None = Field(default=None, max_length=200)  # type: ignore[assignment]
    sort_order: int | None = Field(default=None, ge=0, le=10_000)


_crud("/what-helps", records.HELPS, HelpWrite, HelpPatch, HelpOut, "item")


# ── Your week, in reflection ──────────────────────────────────────────────────
# One observation about something the person actually did in the past seven
# days, picked by fixed rules from explicitly linked records only: a completed
# task tied to a goal, a completed block for one of their rhythms, a completed
# priority, a completed task. Nothing is inferred from unrelated activity, and
# with nothing to point to there is no reflection at all.

class ReflectionOut(BaseModel):
    kind: Literal["goal", "rhythm", "priorities", "tasks"] | None
    text: str | None


def _times(n: int) -> str:
    return {1: "once", 2: "twice"}.get(n, f"{n} times")


def pick_reflection(goal_tasks: list[tuple[str, int]], rhythm_blocks: list[tuple[str, int]],
                    priorities_done: int, tasks_done: int) -> ReflectionOut:
    """First match wins: goal progress, then a rhythm, then priorities, then tasks."""
    def top(rows: list[tuple[str, int]]) -> tuple[str, int] | None:
        rows = [r for r in rows if r[1] > 0]
        return min(rows, key=lambda r: (-r[1], r[0].casefold())) if rows else None

    if g := top(goal_tasks):
        n = g[1]
        return ReflectionOut(kind="goal", text=f"You finished {n} task{'s' if n != 1 else ''} toward “{g[0]}” "
                                               "over the past week.")
    if r := top(rhythm_blocks):
        return ReflectionOut(kind="rhythm", text=f"You made time for {r[0]} {_times(r[1])} over the past week.")
    if priorities_done:
        what = "one of your priorities" if priorities_done == 1 else f"{priorities_done} of your priorities"
        return ReflectionOut(kind="priorities", text=f"You completed {what} over the past week.")
    if tasks_done >= 2:  # a single checked-off task isn't much of a reflection
        return ReflectionOut(kind="tasks", text=f"You finished {tasks_done} tasks over the past week.")
    return ReflectionOut(kind=None, text=None)


@router.get("/you/reflection", response_model=ReflectionOut)
def get_reflection(user: CurrentUser = Depends(get_current_user), engine: Engine = Depends(engine_or_503),
                   now: dt.datetime = Depends(get_now)):
    since = now - dt.timedelta(days=7)
    p = {"u": user.id, "s": since, "n": now}
    with user_scope(engine, user.id) as conn:
        goal_tasks = [(r[0], r[1]) for r in conn.execute(text(
            "select g.title, count(*) from public.tasks t join public.goals g on g.user_id = t.user_id and g.id = t.goal_id "
            "where t.user_id = :u and g.archived_at is null and t.completed_at between :s and :n group by g.title"), p)]
        rhythm_blocks = [(r[0], r[1]) for r in conn.execute(text(
            "select ri.title, count(*) from public.plan_blocks b "
            "join public.recurring_items ri on ri.user_id = b.user_id and ri.id = b.recurring_item_id "
            "where b.user_id = :u and b.kind in ('habit', 'routine') and ri.archived_at is null "
            "and b.completed_at between :s and :n group by ri.title"), p)]
        priorities_done, tasks_done = conn.execute(text(
            "select count(*) filter (where priority_rank is not null), count(*) from public.tasks "
            "where user_id = :u and completed_at between :s and :n"), p).one()
    return pick_reflection(goal_tasks, rhythm_blocks, priorities_done, tasks_done)
