"""GET /today — everything the Today screen shows, from one recompute of the person's local day."""
from __future__ import annotations

import datetime as dt
import uuid
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel
from sqlalchemy import Engine

from backend.auth import CurrentUser, get_current_user
from backend.db.scope import engine_or_503
from backend.pipeline.clock import get_now
from backend.pipeline.today import build_today
from backend.routers.schemas_v2 import TaskOut

router = APIRouter()

StateName = Literal["Aligned", "Balanced", "Strained", "Overloaded"]


class CapacityOut(BaseModel):
    status: Literal["assessed", "uncertain", "insufficient_evidence"]
    state: StateName | None
    possible_states: list[StateName]
    confidence: Literal["low", "medium", "high"] | None
    pathway: Literal["none", "self_reported", "connected", "hybrid"]
    source_label: str | None
    context: str | None          # "How you're doing": why capacity looks this way
    checked_in_today: bool
    next_actions: list[str]


class WindowOut(BaseModel):
    starts_at: dt.datetime
    ends_at: dt.datetime


class WhatMattersNowOut(BaseModel):
    kind: str
    text: str
    highlight: str | None
    task_id: uuid.UUID | None
    worded_by: Literal["rules", "model"]
    window: WindowOut | None


class ScheduleItemOut(BaseModel):
    id: uuid.UUID
    kind: Literal["calendar", "rhythm"]
    source: str
    external_id: str | None       # the app resolves on-device calendar titles from this
    title: str | None
    starts_at: dt.datetime
    ends_at: dt.datetime
    area_id: uuid.UUID | None


class ScheduleOut(BaseModel):
    upcoming: list[ScheduleItemOut]
    calendar_connected: bool


class TodayOut(BaseModel):
    date: dt.date
    timezone: str
    now: dt.datetime
    capacity: CapacityOut
    what_matters_now: WhatMattersNowOut | None
    priorities: list[TaskOut]
    schedule: ScheduleOut
    assessment_id: uuid.UUID
    engine_version: str


def get_completer():
    """Overridden in tests; None means the configured provider (if any)."""
    return None


@router.get("", response_model=TodayOut)
def get_today(background: BackgroundTasks, user: CurrentUser = Depends(get_current_user),
              engine: Engine = Depends(engine_or_503), now: dt.datetime = Depends(get_now),
              completer=Depends(get_completer)):
    return build_today(engine, user.id, now, completer=completer, background=background)
