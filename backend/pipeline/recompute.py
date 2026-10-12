"""
recompute_day: stored evidence → engine → stored assessment.

The one place a day's assessment is produced. It always rebuilds from every
piece of evidence for the day (check-ins, tasks, calendar, wearable), so no
single update can overwrite another source's contribution (the v1 bugs where
a check-in or an Oura sync wiped calendar exposure cannot happen here).
"""
from __future__ import annotations

import dataclasses
import datetime as dt
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import Engine

from backend.db import assessments, profiles
from backend.db.day_inputs import load_day_inputs
from backend.db.scope import privileged
from backend.engine import DEFAULT_THRESHOLDS, assess_day
from backend.engine.types import Assessment, DayContext, DayInputs
from backend.pipeline.day import day_context
from backend.pipeline.serialize import jsonable, stable_hash


@dataclass(frozen=True)
class DayResult:
    day: DayContext
    profile: dict[str, Any]
    inputs: DayInputs
    assessment: Assessment
    assessment_id: uuid.UUID
    inputs_hash: str


def _row(a: Assessment, inputs_hash: str) -> dict[str, Any]:
    return {
        "local_date": a.local_date,
        "status": a.status.value,
        "state": a.state.value if a.state else None,
        "possible_states": [s.value for s in a.possible_states],
        "confidence": a.confidence.value if a.confidence else None,
        "pathway": a.pathway.value,
        "capacity": jsonable(a.capacity),
        "demand": jsonable(a.demand),
        "unused_evidence": jsonable(a.unused_evidence),
        "engine_version": a.engine_version,
        "thresholds_version": a.thresholds_version,
        "inputs_hash": inputs_hash,
    }


def recompute_day(engine: Engine, user_id: uuid.UUID, now: dt.datetime) -> DayResult:
    with privileged(engine) as conn:
        profiles.ensure_profile(conn, user_id)
        profile = profiles.get_profile(conn, user_id) or {}
        day = day_context(profile.get("timezone"), now)
        inputs = load_day_inputs(conn, user_id, day, profile.get("preferred_health_source"))
        assessment = assess_day(inputs, DEFAULT_THRESHOLDS)
        # The hash ignores the clock so cached wording survives reloads of an unchanged day.
        inputs_hash = stable_hash({
            "inputs": dataclasses.replace(inputs, day=dataclasses.replace(day, now=day.day_start)),
            "engine": assessment.engine_version, "thresholds": assessment.thresholds_version,
        })
        assessment_id = assessments.upsert_assessment(conn, user_id, _row(assessment, inputs_hash))
    return DayResult(day=day, profile=profile, inputs=inputs, assessment=assessment,
                     assessment_id=assessment_id, inputs_hash=inputs_hash)
