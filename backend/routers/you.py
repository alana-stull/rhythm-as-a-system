"""You: goals, everyday rhythms (habits/routines) and "what helps me feel my best".

No `from __future__ import annotations` here: the route factory passes model
classes as annotations, which FastAPI must see as real types, not strings.
"""

import datetime as dt
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import Engine
from sqlalchemy.exc import IntegrityError

from backend.auth import CurrentUser, get_current_user
from backend.db import records
from backend.db.scope import engine_or_503, user_scope

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
