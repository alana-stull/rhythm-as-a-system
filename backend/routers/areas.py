"""/areas — the person's own tags (name + pastel)."""
from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import Engine

from backend.auth import CurrentUser, get_current_user
from backend.db import areas
from backend.db.scope import engine_or_503, user_scope
from backend.pipeline.clock import get_now
from backend.routers.schemas_v2 import AreaOut, Pastel

router = APIRouter()


class AreaWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=60)
    color_family: Pastel | None = None
    sort_order: int | None = Field(default=None, ge=0, le=10_000)
    archived: bool | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            raise ValueError("name cannot be cleared")
        v = v.strip()
        if not v:
            raise ValueError("name cannot be blank")
        return v


class AreaCreate(AreaWrite):
    name: str = Field(min_length=1, max_length=60)  # type: ignore[assignment]
    color_family: Pastel  # type: ignore[assignment]


def _values(body: AreaWrite, now: dt.datetime) -> dict:
    values = {k: getattr(body, k) for k in body.model_fields_set if k != "archived"}
    if "archived" in body.model_fields_set:
        values["archived_at"] = now if body.archived else None
    return values


@router.get("", response_model=list[AreaOut])
def list_areas(user: CurrentUser = Depends(get_current_user), engine: Engine = Depends(engine_or_503)):
    with user_scope(engine, user.id) as conn:
        return areas.list_areas(conn, user.id)


@router.post("", response_model=AreaOut, status_code=status.HTTP_201_CREATED)
def create_area(body: AreaCreate, user: CurrentUser = Depends(get_current_user),
                engine: Engine = Depends(engine_or_503), now: dt.datetime = Depends(get_now)):
    with user_scope(engine, user.id) as conn:
        return areas.create_area(conn, user.id, _values(body, now))


@router.patch("/{area_id}", response_model=AreaOut)
def update_area(area_id: uuid.UUID, body: AreaWrite, user: CurrentUser = Depends(get_current_user),
                engine: Engine = Depends(engine_or_503), now: dt.datetime = Depends(get_now)):
    with user_scope(engine, user.id) as conn:
        row = areas.update_area(conn, user.id, area_id, _values(body, now))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found.")
    return row


@router.delete("/{area_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_area(area_id: uuid.UUID, user: CurrentUser = Depends(get_current_user),
                engine: Engine = Depends(engine_or_503)):
    with user_scope(engine, user.id) as conn:
        if not areas.delete_area(conn, user.id, area_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
