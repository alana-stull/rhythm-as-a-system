"""
Interpretation layer: turns derived engine output into language.

The LLM decides nothing. Scoring and condition classification (and, from
M2, capacity and demand) happen in deterministic code. This module converts
that output into qualitative bands before anything leaves the backend, so
the model never sees raw health values or numeric scores. It only phrases
what the engine already concluded.

Provider-specific code lives in `_complete_json`. Switching providers means
replacing that one function; prompts, banding and parsing stay the same.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import date

from backend.config import settings

logger = logging.getLogger(__name__)

CONDITION_DESCRIPTIONS: dict[str, str] = {
    "Aligned":    "body is well-recovered and load is manageable — a good day for demanding work",
    "Balanced":   "moderate recovery and moderate load — sustainable but not a day for major pushes",
    "Strained":   "physiological recovery is low — demands should be reduced regardless of schedule",
    "Overloaded": "load is high relative to current recovery — risk of accumulating fatigue",
}

SYSTEM_PROMPT = """You are Rhythm, a calm and supportive assistant.
You help people understand their energy and workload without judgment or alarm.
Your tone is warm, grounded, and precise — like a trusted advisor who never overreacts.
You never use corporate wellness jargon. You never say "self-care" or "hustle."
You receive qualitative signals only. Never invent numbers, percentages, or scores,
and never use the word "score"."""


@dataclass(frozen=True)
class InterpretationInput:
    """Derived, qualitative engine output. The only data sent to the LLM."""
    condition: str
    recovery: str | None  # "low" | "moderate" | "high"; becomes capacity in M2
    load: str | None      # "light" | "moderate" | "heavy"
    effort: str | None    # "flowing" | "noticeable" | "struggling"
    day: date


def _band(value: float | None, bands: list[tuple[float, str]], top: str) -> str | None:
    if value is None:
        return None
    for upper_bound, label in bands:
        if value < upper_bound:
            return label
    return top


def build_input(
    recovery: float | None,
    exposure: float | None,
    friction: float | None,
    condition: str,
    today: date,
) -> InterpretationInput:
    # Recovery cutoffs match classify_condition (60 / 80). Load and effort
    # cutoffs match the bands the previous prompt described in words.
    return InterpretationInput(
        condition=condition,
        recovery=_band(recovery, [(60, "low"), (80, "moderate")], "high"),
        load=_band(exposure, [(40, "light"), (70, "moderate")], "heavy"),
        effort=_band(friction, [(35, "flowing"), (65, "noticeable")], "struggling"),
        day=today,
    )


def build_user_prompt(inp: InterpretationInput) -> str:
    def line(label: str, value: str | None) -> str:
        return f"{label}: {value if value is not None else 'not available'}"

    return f"""Today is {inp.day.strftime('%A, %B %-d')}. Here is what Rhythm has concluded about the user's day:

Rhythm state: {inp.condition} — {CONDITION_DESCRIPTIONS.get(inp.condition, "")}
{line("Recovery", inp.recovery)}
{line("Load (what their calendar asks)", inp.load)}
{line("Perceived effort (how hard today feels)", inp.effort)}

Write a response in exactly this JSON format:
{{
  "reflection": "<2-3 sentences: a grounded, honest interpretation of what these signals mean together today>",
  "bullets": [
    "<concrete, specific action or adjustment — 12 words max>",
    "<second action or observation — 12 words max>"
  ]
}}

Rules:
- Do not name specific apps or tools
- The reflection should read like a journal note, not a wellness report
- Bullets are actionable, not motivational platitudes
- If a signal is not available, work with what you have — do not mention missing data"""


def _complete_json(system: str, user: str) -> dict:
    """Send one prompt to the configured provider and return its JSON reply."""
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY is not configured.")

    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.chat.completions.create(
        model=settings.interpretation_model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format={"type": "json_object"},
        max_completion_tokens=400,
    )
    raw = response.choices[0].message.content or ""
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("Interpretation model returned non-JSON: %s", raw)
        raise ValueError(f"Interpretation response was not valid JSON: {exc}") from exc


def generate_suggestion(
    recovery: float | None,
    exposure: float | None,
    friction: float | None,
    condition: str,
    today: date,
) -> tuple[str, list[str]]:
    """
    Return (reflection, bullets) for the day.
    Raises ValueError if the provider isn't configured or the reply can't be used.
    """
    inp = build_input(recovery, exposure, friction, condition, today)
    data = _complete_json(SYSTEM_PROMPT, build_user_prompt(inp))

    reflection = str(data.get("reflection", "")).strip()
    bullets = data.get("bullets", [])
    if not isinstance(bullets, list):
        bullets = [str(bullets)]
    bullets = [str(b).strip() for b in bullets if b]
    if not reflection:
        raise ValueError("Empty reflection in interpretation response")
    return reflection, bullets
