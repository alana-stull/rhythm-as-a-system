"""
Optional model phrasing for "What matters now", with privacy and cost limits.

The rules (pipeline/recommend.py) already produced a complete, true sentence.
The model may only rephrase it from the same facts. Anything else falls back
to the rules' sentence, so Today never depends on the model.

Privacy
- The model receives the recommendation's facts, the day's state and band
  words, and the person's chosen tone. Never: health numbers, calendar
  titles, notes, check-in free text, names or email.
- A task title is included only if the person accepted the disclosure
  (`profiles.ai_task_titles_consented_at`); otherwise it is replaced by
  "this task" and re-inserted only into the rules' sentence.
- Every call stores exactly what was sent (interpretations.context).

Cost
- Hard monthly ceiling across all users (`llm_monthly_budget_usd`), checked
  against the usage ledger before each call with the call's worst-case cost.
- Per-person daily cap (`llm_user_daily_calls`).
- One call per distinct recommendation per day: wording is cached by the
  facts' hash, so reloading Today doesn't call the model again.
- Short timeout, no retries, small output limit.
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Protocol

from sqlalchemy import Connection, text

from backend.config import settings
from backend.pipeline.recommend import RULES_VERSION, Recommendation
from backend.pipeline.serialize import stable_hash

logger = logging.getLogger(__name__)

PROMPT_VERSION = "wmn-1"
CONTEXT_VERSION = "wmn-context-1"
PURPOSE = "what_matters_now"
MAX_CHARS = 160
_PLACEHOLDER = "this task"

SYSTEM_PROMPT = """You are Rhythm, a calm, grounded planning companion.
You rephrase one short suggestion about what someone could do today.
Rules:
- Use only the facts given. Never add numbers, times, causes or details that aren't in the facts.
- Keep every number and time exactly as given.
- One or two short sentences, under 160 characters. Suggest, don't dictate.
- No medical, diagnostic or clinical language. No exclamation marks or em dashes. Never say "score".
- Reply as JSON: {"text": "...", "highlight": "<exact substring of text to emphasize, or null>"}"""

_BANNED = re.compile(r"\b(diagnos\w*|symptom\w*|clinical|medical|disorder|burnout|anxiety|depress\w*|score)\b|!|\u2014", re.I)


class Completer(Protocol):
    def __call__(self, system: str, user: str) -> tuple[dict[str, Any], int, int, str]:
        """Returns (json reply, input tokens, output tokens, model)."""


def openai_completer(system: str, user: str) -> tuple[dict[str, Any], int, int, str]:
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key, timeout=settings.llm_timeout_seconds, max_retries=0)
    response = client.chat.completions.create(
        model=settings.interpretation_model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        response_format={"type": "json_object"},
        max_completion_tokens=settings.llm_max_output_tokens,
    )
    usage = response.usage
    data = json.loads(response.choices[0].message.content or "{}")
    return data, getattr(usage, "prompt_tokens", 0) or 0, getattr(usage, "completion_tokens", 0) or 0, response.model


# ── What may be sent ──────────────────────────────────────────────────────────

def model_input(rec: Recommendation, *, state: str | None, tone: str | None, titles_allowed: bool) -> dict[str, Any]:
    facts = dict(rec.facts)
    title = facts.pop("task_title", None)
    if title is not None:
        facts["task"] = title if titles_allowed else _PLACEHOLDER
    sentence = rec.text if (titles_allowed or title is None) else rec.text.replace(title, _PLACEHOLDER)
    return {"kind": rec.kind, "state": state, "tone": tone or "gentle", "facts": facts, "sentence": sentence}


def _allowed_numbers(payload: dict[str, Any]) -> set[str]:
    return set(re.findall(r"\d+", json.dumps(payload["facts"]) + payload["sentence"]))


def validate(reply: dict[str, Any], payload: dict[str, Any]) -> tuple[str, str | None] | None:
    """The reply's text and highlight if they're safe to show, else None."""
    text_ = reply.get("text")
    if not isinstance(text_, str):
        return None
    text_ = " ".join(text_.split())
    if not text_ or len(text_) > MAX_CHARS or _BANNED.search(text_):
        return None
    if not set(re.findall(r"\d+", text_)) <= _allowed_numbers(payload):
        return None  # an invented number or time
    window = payload["facts"].get("window")
    if window and window not in text_:
        return None  # the one concrete fact must survive intact
    highlight = reply.get("highlight")
    if not isinstance(highlight, str) or highlight not in text_:
        highlight = None
    return text_, highlight


# ── Budget and ledger ─────────────────────────────────────────────────────────

def _cost(input_tokens: int, output_tokens: int) -> float:
    return (input_tokens * settings.llm_price_input_per_mtok + output_tokens * settings.llm_price_output_per_mtok) / 1e6


def _record(conn: Connection, user_id: uuid.UUID, model: str, input_tokens: int, output_tokens: int, outcome: str) -> None:
    conn.execute(text(
        "insert into public.llm_usage (user_id, purpose, model, input_tokens, output_tokens, cost_usd, outcome) "
        "values (:u, :p, :m, :i, :o, :c, :outcome)"), {
            "u": user_id, "p": PURPOSE, "m": model[:80], "i": input_tokens, "o": output_tokens,
            "c": _cost(input_tokens, output_tokens), "outcome": outcome})


def budget_block(conn: Connection, user_id: uuid.UUID, worst_case_input_tokens: int) -> str | None:
    """Why this call may not happen, or None. Serialized so concurrent calls can't overspend."""
    conn.execute(text("select pg_advisory_xact_lock(hashtext('rhythm_llm_budget'))"))
    spent = conn.execute(text(
        "select coalesce(sum(cost_usd), 0) from public.llm_usage "
        "where created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'")).scalar_one()
    worst = _cost(worst_case_input_tokens, settings.llm_max_output_tokens)
    if float(spent) + worst > settings.llm_monthly_budget_usd:
        return "blocked_budget"
    calls = conn.execute(text(
        "select count(*) from public.llm_usage where user_id = :u and outcome in ('ok', 'error', 'invalid_output') "
        "and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'"), {"u": user_id}).scalar_one()
    if calls >= settings.llm_user_daily_calls:
        return "blocked_rate_limit"
    return None


# ── Entry point ───────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Phrased:
    text: str
    highlight: str | None
    source: str             # "rules" | "model"
    includes_task_titles: bool
    pending: bool = False   # model wording will be generated after the response


def phrase(conn: Connection, user_id: uuid.UUID, assessment_id: uuid.UUID, rec: Recommendation, *,
           state: str | None, tone: str | None, titles_allowed: bool,
           completer: Callable[..., tuple[dict[str, Any], int, int, str]] | None = None,
           defer: bool = False) -> Phrased:
    """Run inside `privileged()` (writes the ledger and interpretations, both backend-only).

    With `defer`, a model call is never made here: the rules' sentence comes
    back marked `pending`, and the caller runs `phrase` again after the
    response so the next load shows the model's wording (if it passes).
    """
    from backend.db import assessments

    rules = Phrased(rec.text, rec.highlight, "rules", False)
    payload = model_input(rec, state=state, tone=tone, titles_allowed=titles_allowed)
    key = stable_hash({"payload": payload, "prompt": PROMPT_VERSION, "rules": RULES_VERSION})

    cached = assessments.cached_interpretation(conn, user_id, assessment_id, PURPOSE, key)
    if cached is not None:
        actions = cached["actions"] or []
        return Phrased(cached["body"], actions[0] if actions else None,
                       "model" if cached["kind"] == "llm" else "rules", cached["includes_task_titles"])

    def store(result: Phrased, kind: str, model: str | None) -> Phrased:
        sent = {"cache_key": key, "payload": payload, "system_prompt_version": PROMPT_VERSION} if kind == "llm" \
            else {"cache_key": key, "rules_version": RULES_VERSION, "kind": rec.kind}
        assessments.store_interpretation(
            conn, user_id, assessment_id, purpose=PURPOSE, kind=kind, model=model, context_version=CONTEXT_VERSION,
            prompt_version=PROMPT_VERSION if kind == "llm" else None, context=sent, headline=None,
            body=result.text, actions=[result.highlight] if result.highlight else [],
            includes_task_titles=result.includes_task_titles)
        return result

    completer = completer or (openai_completer if settings.openai_api_key else None)
    if not settings.recommendations_llm_enabled or completer is None:
        return store(rules, "fallback", None)
    if defer:
        return Phrased(rules.text, rules.highlight, "rules", False, pending=True)

    user_msg = json.dumps(payload, ensure_ascii=False)
    blocked = budget_block(conn, user_id, worst_case_input_tokens=(len(SYSTEM_PROMPT) + len(user_msg)) // 2)
    if blocked:
        _record(conn, user_id, settings.interpretation_model, 0, 0, blocked)
        return store(rules, "fallback", None)

    try:
        reply, tin, tout, model = completer(SYSTEM_PROMPT, user_msg)
    except Exception as exc:  # noqa: BLE001 — any provider failure falls back to the rules
        logger.warning("recommendation model call failed: %s", type(exc).__name__)
        _record(conn, user_id, settings.interpretation_model, 0, 0, "error")
        return store(rules, "fallback", None)

    checked = validate(reply, payload)
    if checked is None:
        _record(conn, user_id, model, tin, tout, "invalid_output")
        return store(rules, "fallback", None)
    _record(conn, user_id, model, tin, tout, "ok")
    text_, highlight = checked
    title = rec.facts.get("task_title")
    if title and not titles_allowed:
        # The title is shown to its owner, never sent.
        swap = re.compile(re.escape(_PLACEHOLDER), re.I)
        text_ = swap.sub(lambda _: title, text_)
        if highlight:
            highlight = swap.sub(lambda _: title, highlight)
    return store(Phrased(text_, highlight, "model", bool(title and titles_allowed)), "llm", model)
