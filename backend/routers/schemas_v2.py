"""Shared response models for the F3 (Supabase) endpoints."""
from __future__ import annotations

import datetime as dt
import uuid
from typing import Literal

from pydantic import BaseModel

Effort = Literal["light", "moderate", "deep"]
Pastel = Literal["clay", "honey", "sage", "sky", "lilac", "blush", "stone", "seafoam"]


class TaskOut(BaseModel):
    id: uuid.UUID
    title: str
    notes: str | None
    area_id: uuid.UUID | None
    goal_id: uuid.UUID | None
    effort: Effort | None
    estimate_minutes: int | None
    due_on: dt.date | None
    focus_on: dt.date | None
    priority_rank: int | None
    completed_at: dt.datetime | None
    let_go_at: dt.datetime | None
    source: str
    first_focus_on: dt.date | None
    times_deferred: int
    created_at: dt.datetime
    updated_at: dt.datetime


class AreaOut(BaseModel):
    id: uuid.UUID
    name: str
    color_family: Pastel | None
    sort_order: int
    archived_at: dt.datetime | None
    created_at: dt.datetime
    updated_at: dt.datetime
