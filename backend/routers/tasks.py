"""/tasks and Today's Top 3. Every query runs in user_scope (RLS) with an explicit user filter."""
from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import Engine
from sqlalchemy.exc import IntegrityError

from backend.auth import CurrentUser, get_current_user
from backend.db import profiles, tasks
from backend.db.scope import engine_or_503, privileged, user_scope
from backend.pipeline.clock import get_now
from backend.pipeline.day import day_context
from backend.routers.schemas_v2 import Effort, TaskOut

router = APIRouter()


class TaskWrite(BaseModel):
    """Only fields present are written; null clears a field."""
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=300)
    notes: str | None = Field(default=None, max_length=5000)
    area_id: uuid.UUID | None = None
    goal_id: uuid.UUID | None = None
    effort: Effort | None = None
    estimate_minutes: int | None = Field(default=None, ge=1, le=1440)
    due_on: dt.date | None = None
    focus_on: dt.date | None = None
    completed: bool | None = None
    let_go: bool | None = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: str | None) -> str | None:
        if v is None:
            raise ValueError("title cannot be cleared")
        v = v.strip()
        if not v:
            raise ValueError("title cannot be blank")
        return v


class TaskCreate(TaskWrite):
    title: str = Field(min_length=1, max_length=300)  # type: ignore[assignment]
    source: str = Field(default="capture", pattern="^(capture|brain_dump)$")


def _values(body: TaskWrite, now: dt.datetime) -> dict:
    flags = {"completed": "completed_at", "let_go": "let_go_at"}
    values = {k: getattr(body, k) for k in body.model_fields_set if k not in flags}
    for flag, column in flags.items():
        if flag in body.model_fields_set:
            values[column] = now if getattr(body, flag) else None
    return values


def _today(engine: Engine, user: CurrentUser, now: dt.datetime) -> dt.date:
    with privileged(engine) as conn:
        profiles.ensure_profile(conn, user.id)
        tz = (profiles.get_profile(conn, user.id) or {}).get("timezone")
    return day_context(tz, now).local_date


def _fk_error(exc: IntegrityError) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Tag or goal not found.") if \
        getattr(exc.orig, "sqlstate", None) == "23503" else HTTPException(status.HTTP_409_CONFLICT, "Conflict.")


@router.get("", response_model=list[TaskOut])
def list_tasks(user: CurrentUser = Depends(get_current_user), engine: Engine = Depends(engine_or_503),
               now: dt.datetime = Depends(get_now)):
    """Open tasks, plus anything finished in the last day (so today's done items stay visible)."""
    with user_scope(engine, user.id) as conn:
        return tasks.list_tasks(conn, user.id, completed_since=now - dt.timedelta(hours=24))


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(body: TaskCreate, user: CurrentUser = Depends(get_current_user),
                engine: Engine = Depends(engine_or_503), now: dt.datetime = Depends(get_now)):
    try:
        with user_scope(engine, user.id) as conn:
            return tasks.create_task(conn, user.id, _values(body, now) | {"title": body.title, "source": body.source})
    except IntegrityError as exc:
        raise _fk_error(exc) from None


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: uuid.UUID, body: TaskWrite, user: CurrentUser = Depends(get_current_user),
                engine: Engine = Depends(engine_or_503), now: dt.datetime = Depends(get_now)):
    try:
        with user_scope(engine, user.id) as conn:
            row = tasks.update_task(conn, user.id, task_id, _values(body, now))
    except IntegrityError as exc:
        raise _fk_error(exc) from None
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found.")
    return row


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: uuid.UUID, user: CurrentUser = Depends(get_current_user),
                engine: Engine = Depends(engine_or_503)):
    with user_scope(engine, user.id) as conn:
        if not tasks.delete_task(conn, user.id, task_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{task_id}/priority", response_model=TaskOut)
def make_priority(task_id: uuid.UUID, user: CurrentUser = Depends(get_current_user),
                  engine: Engine = Depends(engine_or_503), now: dt.datetime = Depends(get_now)):
    """Add to today's Top 3 (focuses it on today). 409 when all three slots are taken."""
    today = _today(engine, user, now)
    try:
        with user_scope(engine, user.id) as conn:
            row = tasks.make_priority(conn, user.id, task_id, today)
    except tasks.TopThreeFull:
        raise HTTPException(status.HTTP_409_CONFLICT, "Today already has three priorities.") from None
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Today already has three priorities.") from None
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found.")
    return row


@router.delete("/{task_id}/priority", response_model=TaskOut)
def clear_priority(task_id: uuid.UUID, user: CurrentUser = Depends(get_current_user),
                   engine: Engine = Depends(engine_or_503)):
    with user_scope(engine, user.id) as conn:
        row = tasks.clear_priority(conn, user.id, task_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found.")
    return row
