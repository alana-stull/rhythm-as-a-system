"""/checkins — energy, rested and perceived demand on five labeled points. Append-only history."""
from __future__ import annotations

import datetime as dt
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import Engine

from backend.auth import CurrentUser, get_current_user
from backend.db import checkins, profiles
from backend.db.scope import engine_or_503, privileged, user_scope
from backend.pipeline.clock import get_now
from backend.pipeline.day import day_context

router = APIRouter()

Level = Literal["very_low", "low", "moderate", "high", "very_high"]
Demand = Literal["very_light", "light", "moderate", "heavy", "very_heavy"]
ContextTag = Literal["sleep", "stress", "illness", "emotions", "none"]


class CheckinCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    energy: Level | None = None
    rested: Level | None = None
    perceived_demand: Demand | None = None
    context_tags: list[ContextTag] = Field(default_factory=list, max_length=5)
    note: str | None = Field(default=None, max_length=1000)  # stays on the server; never sent to a model

    @field_validator("context_tags")
    @classmethod
    def _unique(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(v))

    @model_validator(mode="after")
    def _answered(self):
        if self.energy is None and self.rested is None and self.perceived_demand is None:
            raise ValueError("answer at least one of energy, rested or perceived_demand")
        return self


class CheckinOut(BaseModel):
    id: uuid.UUID
    local_date: dt.date
    recorded_at: dt.datetime
    energy: Level | None
    rested: Level | None
    perceived_demand: Demand | None
    context_tags: list[str]
    note: str | None


def _local_date(engine: Engine, user: CurrentUser, now: dt.datetime) -> dt.date:
    with privileged(engine) as conn:
        profiles.ensure_profile(conn, user.id)
        tz = (profiles.get_profile(conn, user.id) or {}).get("timezone")
    return day_context(tz, now).local_date


@router.post("", response_model=CheckinOut, status_code=status.HTTP_201_CREATED)
def create_checkin(body: CheckinCreate, user: CurrentUser = Depends(get_current_user),
                   engine: Engine = Depends(engine_or_503), now: dt.datetime = Depends(get_now)):
    """Recorded for the person's local today. GET /today reflects it immediately."""
    local_date = _local_date(engine, user, now)
    with user_scope(engine, user.id) as conn:
        return checkins.create_checkin(conn, user.id, local_date, now, body.model_dump())


@router.get("", response_model=list[CheckinOut])
def list_checkins(date: dt.date | None = None, user: CurrentUser = Depends(get_current_user),
                  engine: Engine = Depends(engine_or_503), now: dt.datetime = Depends(get_now)):
    local_date = date or _local_date(engine, user, now)
    with user_scope(engine, user.id) as conn:
        return checkins.checkins_for(conn, user.id, local_date)


@router.delete("/{checkin_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checkin(checkin_id: uuid.UUID, user: CurrentUser = Depends(get_current_user),
                   engine: Engine = Depends(engine_or_503)):
    with user_scope(engine, user.id) as conn:
        if not checkins.delete_checkin(conn, user.id, checkin_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Check-in not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
