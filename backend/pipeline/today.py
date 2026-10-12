"""Compose GET /today from one recompute: state + why, what matters now, Top 3, next two."""
from __future__ import annotations

import datetime as dt
import uuid
from typing import Any, Callable

from sqlalchemy import Engine

from backend.db import plan_blocks, tasks
from backend.db.scope import privileged, user_scope
from backend.engine._util import source_name
from backend.engine.types import Assessment, EvidenceKind, Pathway
from backend.pipeline import llm
from backend.pipeline.context import capacity_context
from backend.pipeline.recommend import recommend
from backend.pipeline.recompute import DayResult, recompute_day
from backend.pipeline.windows import Window, open_windows

SCHEDULE_PREVIEW = 2
SHOWN_PLAN_KINDS = ("event", "commitment", "routine")  # protected time and task blocks stay in Plan


def source_label(a: Assessment) -> str | None:
    """Short provenance for the state badge ("self-reported", "check-in + Oura")."""
    if a.pathway == Pathway.NONE:
        return None
    if a.pathway == Pathway.SELF_REPORTED:
        return "self-reported"
    connected = []
    for e in a.capacity.evidence + a.demand.evidence:
        if e.used and e.kind in (EvidenceKind.WEARABLE_MEASUREMENT, EvidenceKind.CALENDAR_DEMAND):
            name = source_name(e.source)
            if name not in connected:
                connected.append(name)
    joined = " + ".join(connected)
    return f"check-in + {joined}" if a.pathway == Pathway.HYBRID else joined


def _calendar_is_fresh(a: Assessment) -> bool:
    return any(e.used and e.kind == EvidenceKind.CALENDAR_DEMAND for e in a.demand.evidence)


def windows_for(r: DayResult, blocks: list[dict[str, Any]]) -> list[Window] | None:
    """None = unknown (no fresh calendar): Rhythm makes no claims about free time."""
    if r.inputs.calendar is None or not _calendar_is_fresh(r.assessment):
        return None
    busy = [(b.start, b.end) for b in r.inputs.calendar.blocks if b.busy and not b.declined and not b.all_day]
    busy += [(b["starts_at"], b["ends_at"]) for b in blocks]  # every Rhythm block, protected time included
    return open_windows(r.day.now, r.day.day_start, busy)


def _schedule(r: DayResult, blocks: list[dict[str, Any]], events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    now = r.day.now
    items = [{
        "id": str(e["id"]), "kind": "calendar", "source": e["source"], "external_id": e["external_id"],
        "title": e["title"], "starts_at": e["starts_at"], "ends_at": e["ends_at"],
        "area_id": str(e["area_id"]) if e["area_id"] else None,
    } for e in events if not e["all_day"] and e["starts_at"] >= now]
    items += [{
        "id": str(b["id"]), "kind": "rhythm", "source": "rhythm", "external_id": None, "title": b["title"],
        "starts_at": b["starts_at"], "ends_at": b["ends_at"], "area_id": None,
    } for b in blocks if b["kind"] in SHOWN_PLAN_KINDS and b["starts_at"] >= now]
    return sorted(items, key=lambda i: i["starts_at"])[:SCHEDULE_PREVIEW]


def _remember_context(engine: Engine, user_id: uuid.UUID, r: DayResult, context: str) -> None:
    """Keep the day's "why" sentence so Insights can show it later (one row per distinct day state)."""
    from backend.db import assessments
    with privileged(engine) as conn:
        if assessments.cached_interpretation(conn, user_id, r.assessment_id, "capacity_context", r.inputs_hash) is None:
            assessments.store_interpretation(
                conn, user_id, r.assessment_id, purpose="capacity_context", kind="fallback", model=None,
                context_version="capacity-context-1", prompt_version=None, context={"cache_key": r.inputs_hash},
                headline=None, body=context, actions=[], includes_task_titles=False)


def _phrase_later(engine: Engine, user_id: uuid.UUID, assessment_id: uuid.UUID, rec, wording: dict) -> None:
    with privileged(engine) as conn:
        llm.phrase(conn, user_id, assessment_id, rec, **wording)


def build_today(engine: Engine, user_id: uuid.UUID, now: dt.datetime,
                completer: Callable[..., Any] | None = None, background: Any = None) -> dict[str, Any]:
    r = recompute_day(engine, user_id, now)
    a, day = r.assessment, r.day

    with user_scope(engine, user_id) as conn:
        top = tasks.priorities_for(conn, user_id, day.local_date)
        blocks = plan_blocks.blocks_between(conn, user_id, day.day_start, day.day_end)
        events = plan_blocks.external_events_between(conn, user_id, day.day_start, day.day_end)

    context = capacity_context(a)
    if context:
        _remember_context(engine, user_id, r, context)
    rec = recommend(a, top, windows_for(r, blocks), day.local_date)
    what_matters_now = None
    if rec is not None:
        wording = dict(state=a.state.value if a.state else None, tone=r.profile.get("tone"),
                       titles_allowed=r.profile.get("ai_task_titles_consented_at") is not None, completer=completer)
        with privileged(engine) as conn:
            phrased = llm.phrase(conn, user_id, r.assessment_id, rec, defer=background is not None, **wording)
        if phrased.pending and background is not None:
            # Today never waits on the model: it words this recommendation after
            # the response, and the next load shows it.
            background.add_task(_phrase_later, engine, user_id, r.assessment_id, rec, wording)
        what_matters_now = {
            "kind": rec.kind, "text": phrased.text, "highlight": phrased.highlight,
            "task_id": rec.task_id, "worded_by": phrased.source,
            "window": {"starts_at": rec.window.start, "ends_at": rec.window.end} if rec.window else None,
        }

    return {
        "date": day.local_date,
        "timezone": r.profile.get("timezone") or "UTC",
        "now": day.now,
        "capacity": {
            "status": a.status.value,
            "state": a.state.value if a.state else None,
            "possible_states": [s.value for s in a.possible_states],
            "confidence": a.confidence.value if a.confidence else None,
            "pathway": a.pathway.value,
            "source_label": source_label(a),
            "context": context,
            "checked_in_today": bool(r.inputs.checkins),
            "next_actions": [n.value for n in a.next_actions],
        },
        "what_matters_now": what_matters_now,
        "priorities": top,
        "schedule": {"upcoming": _schedule(r, blocks, events), "calendar_connected": r.inputs.calendar is not None},
        "assessment_id": r.assessment_id,
        "engine_version": a.engine_version,
    }
