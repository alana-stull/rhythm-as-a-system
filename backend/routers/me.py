"""
/me — the signed-in user's profile, and deletion of their data.

Reads and updates run inside user_scope (RLS enforced on top of explicit ID
filters). Creating the profile row and deleting data are privileged backend
operations, always filtered on the verified user ID.
"""
from __future__ import annotations

import datetime as dt
import json
import uuid
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import Engine
from sqlalchemy.exc import IntegrityError

from backend.auth import CurrentUser, get_current_user
from backend.db import deletion, profiles
from backend.db.scope import engine_or_503, privileged, user_scope

router = APIRouter()

Tone = Literal["gentle", "direct", "motivating"]
TrackerChoice = Literal["oura", "apple_watch", "whoop", "other", "none"]
HealthSource = Literal["oura", "apple_health"]


class ProfileOut(BaseModel):
    id: uuid.UUID
    email: str | None
    display_name: str | None
    tone: Tone | None
    timezone: str
    tracker_choice: TrackerChoice | None
    onboarding_step: str | None
    onboarding_completed: bool
    onboarding_completed_at: dt.datetime | None
    onboarding_answers: dict
    preferred_health_source: HealthSource | None
    ai_task_titles_consented: bool
    ai_task_titles_consented_at: dt.datetime | None
    created_at: dt.datetime
    updated_at: dt.datetime


class ProfileUpdate(BaseModel):
    """Only fields present in the request are changed; null clears a field."""
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    tone: Tone | None = None
    timezone: str | None = None
    tracker_choice: TrackerChoice | None = None
    onboarding_step: str | None = Field(default=None, max_length=40)
    onboarding_completed: bool | None = None
    onboarding_answers: dict | None = None
    preferred_health_source: HealthSource | None = None
    # Accepting the disclosure that relevant task titles may be sent to the
    # recommendation model. False withdraws consent.
    ai_task_titles_consented: bool | None = None

    @field_validator("onboarding_answers")
    @classmethod
    def _answers(cls, v: dict | None) -> dict:
        if v is None:
            raise ValueError("onboarding_answers cannot be null; send {} to clear")
        if len(json.dumps(v)) > 6000:
            raise ValueError("onboarding_answers is too large")
        return v

    @field_validator("display_name")
    @classmethod
    def _strip_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("display_name cannot be blank")
        return v

    @field_validator("timezone")
    @classmethod
    def _valid_timezone(cls, v: str | None) -> str | None:
        if v is None:
            raise ValueError("timezone cannot be cleared")
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("timezone must be an IANA name such as America/Los_Angeles") from exc
        return v


class DataDeletionOut(BaseModel):
    deleted: dict[str, int]
    profile_reset: bool
    account_deleted: bool
    note: str


def _out(row: dict, user: CurrentUser) -> ProfileOut:
    return ProfileOut(**{k: v for k, v in row.items()}, email=user.email,
                      onboarding_completed=row["onboarding_completed_at"] is not None,
                      ai_task_titles_consented=row["ai_task_titles_consented_at"] is not None)


def _ensure(engine: Engine, user: CurrentUser) -> None:
    try:
        with privileged(engine) as conn:
            profiles.ensure_profile(conn, user.id)
    except IntegrityError:
        # Valid token, but the auth user no longer exists.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found.",
                            headers={"WWW-Authenticate": "Bearer"}) from None


@router.get("", response_model=ProfileOut)
def get_me(user: CurrentUser = Depends(get_current_user), engine: Engine = Depends(engine_or_503)):
    _ensure(engine, user)
    with user_scope(engine, user.id) as conn:
        row = profiles.get_profile(conn, user.id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found.")
    return _out(row, user)


@router.patch("", response_model=ProfileOut)
def update_me(body: ProfileUpdate, user: CurrentUser = Depends(get_current_user),
              engine: Engine = Depends(engine_or_503)):
    flags = {"onboarding_completed": "onboarding_completed_at",
             "ai_task_titles_consented": "ai_task_titles_consented_at"}
    values = {k: getattr(body, k) for k in body.model_fields_set if k not in flags}
    for flag, column in flags.items():
        if flag in body.model_fields_set:
            values[column] = dt.datetime.now(dt.timezone.utc) if getattr(body, flag) else None
    _ensure(engine, user)
    with user_scope(engine, user.id) as conn:
        row = profiles.update_profile(conn, user.id, values)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found.")
    return _out(row, user)


@router.delete("/data", response_model=DataDeletionOut)
def delete_my_data(confirm: bool = Query(False, description="Must be true."),
                   user: CurrentUser = Depends(get_current_user), engine: Engine = Depends(engine_or_503)):
    if not confirm:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pass confirm=true to delete your data.")
    with privileged(engine) as conn:
        counts = deletion.delete_user_data(conn, user.id)
    return DataDeletionOut(
        deleted=counts, profile_reset=True, account_deleted=False,
        note="Your Rhythm data was deleted. Your sign-in account still exists; "
             "account deletion is a separate step.",
    )
