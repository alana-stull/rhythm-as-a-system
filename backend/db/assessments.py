"""Engine output and its wording. Backend-written (clients may only read their own rows)."""
from __future__ import annotations

import datetime as dt
import json
import uuid
from typing import Any

from sqlalchemy import Connection, text


def upsert_assessment(conn: Connection, user_id: uuid.UUID, row: dict[str, Any]) -> uuid.UUID:
    """Privileged. One row per user and local day; recomputing replaces it."""
    return conn.execute(text(
        "insert into public.daily_assessments (user_id, local_date, status, state, possible_states, confidence, "
        "  pathway, capacity, demand, unused_evidence, engine_version, thresholds_version, inputs_hash, computed_at) "
        "values (:u, :local_date, :status, :state, :possible_states, :confidence, :pathway, "
        "  cast(:capacity as jsonb), cast(:demand as jsonb), cast(:unused_evidence as jsonb), :engine_version, "
        "  :thresholds_version, :inputs_hash, now()) "
        "on conflict (user_id, local_date) do update set status = excluded.status, state = excluded.state, "
        "  possible_states = excluded.possible_states, confidence = excluded.confidence, pathway = excluded.pathway, "
        "  capacity = excluded.capacity, demand = excluded.demand, unused_evidence = excluded.unused_evidence, "
        "  engine_version = excluded.engine_version, thresholds_version = excluded.thresholds_version, "
        "  inputs_hash = excluded.inputs_hash, computed_at = now() "
        "returning id"), {
            **row, "u": user_id,
            "capacity": json.dumps(row["capacity"]), "demand": json.dumps(row["demand"]),
            "unused_evidence": json.dumps(row["unused_evidence"]),
        }).scalar_one()


def assessments_between(conn: Connection, user_id: uuid.UUID, start: dt.date, end: dt.date) -> list[dict[str, Any]]:
    return [dict(r) for r in conn.execute(text(
        "select id, local_date, status, state, possible_states, confidence, pathway, engine_version, computed_at "
        "from public.daily_assessments where user_id = :u and local_date between :s and :e order by local_date"
    ), {"u": user_id, "s": start, "e": end}).mappings()]


def cached_interpretation(conn: Connection, user_id: uuid.UUID, assessment_id: uuid.UUID, purpose: str,
                          cache_key: str) -> dict[str, Any] | None:
    row = conn.execute(text(
        "select id, kind, model, headline, body, actions, includes_task_titles, created_at "
        "from public.interpretations where user_id = :u and assessment_id = :a and purpose = :p "
        "and context ->> 'cache_key' = :k order by created_at desc limit 1"
    ), {"u": user_id, "a": assessment_id, "p": purpose, "k": cache_key}).mappings().first()
    return dict(row) if row else None


def store_interpretation(conn: Connection, user_id: uuid.UUID, assessment_id: uuid.UUID, *, purpose: str, kind: str,
                         model: str | None, context_version: str, prompt_version: str | None, context: dict[str, Any],
                         headline: str | None, body: str, actions: list[str], includes_task_titles: bool) -> uuid.UUID:
    """Privileged. `context` is exactly what was sent to the model (or used by the rules)."""
    return conn.execute(text(
        "insert into public.interpretations (user_id, assessment_id, kind, model, context_version, prompt_version, "
        "  context, headline, body, actions, purpose, includes_task_titles) "
        "values (:u, :a, :kind, :model, :cv, :pv, cast(:ctx as jsonb), :headline, :body, cast(:actions as jsonb), "
        "  :purpose, :titles) returning id"), {
            "u": user_id, "a": assessment_id, "kind": kind, "model": model, "cv": context_version,
            "pv": prompt_version, "ctx": json.dumps(context), "headline": headline, "body": body,
            "actions": json.dumps(actions), "purpose": purpose, "titles": includes_task_titles,
        }).scalar_one()
