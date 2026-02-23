"""
Google Gemini integration for generating Rhythm suggestions.
"""
from __future__ import annotations

import json
import logging
from datetime import date

from google import genai
from google.genai import types

from backend.config import settings

logger = logging.getLogger(__name__)

CONDITION_DESCRIPTIONS: dict[str, str] = {
    "Aligned":    "body is well-recovered and load is manageable — a good day for demanding work",
    "Balanced":   "moderate recovery and moderate load — sustainable but not a day for major pushes",
    "Strained":   "physiological recovery is low — demands should be reduced regardless of schedule",
    "Overloaded": "load is high relative to current recovery — risk of accumulating fatigue",
}

SYSTEM_PROMPT = """You are Rhythm, a calm and supportive wellness assistant.
You help people understand their energy and workload without judgment or alarm.
Your tone is warm, grounded, and precise — like a trusted advisor who never overreacts.
You never use corporate wellness jargon. You never say "self-care" or "hustle."
Keep reflections human and specific to the numbers provided.
Never use the word "score" in the reflection text."""


def _build_user_prompt(
    recovery: float | None,
    exposure: float | None,
    friction: float | None,
    condition: str,
    today: date,
) -> str:
    def fmt(val: float | None, label: str) -> str:
        if val is None:
            return f"{label}: not available"
        return f"{label}: {val}/100"

    condition_desc = CONDITION_DESCRIPTIONS.get(condition, "")

    return f"""Today is {today.strftime('%A, %B %-d')}. Here are the user's current signals:

{fmt(recovery, 'Recovery')}
{fmt(exposure, 'Exposure (task/calendar load)')}
{fmt(friction, 'Friction (perceived effort)')}
Condition: {condition} — {condition_desc}

Score interpretation:
- Recovery (0-100): Below 40 = poor. 40-65 = moderate. Above 65 = strong.
- Exposure (0-100): Below 40 = light day. 40-70 = moderate. Above 70 = heavy.
- Friction (0-100): Below 35 = flowing. 35-65 = noticeable effort. Above 65 = struggling.

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


def generate_suggestion(
    recovery: float | None,
    exposure: float | None,
    friction: float | None,
    condition: str,
    today: date,
) -> tuple[str, list[str]]:
    """
    Call Gemini and return (reflection, bullets).
    Raises ValueError if the response cannot be parsed.
    """
    client = genai.Client(api_key=settings.google_api_key)
    prompt = _build_user_prompt(recovery, exposure, friction, condition, today)

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                max_output_tokens=300,
                temperature=0.7,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
        raw = response.text or ""
        data = json.loads(raw)
        reflection = data.get("reflection", "").strip()
        bullets = data.get("bullets", [])
        if not isinstance(bullets, list):
            bullets = [str(bullets)]
        bullets = [b.strip() for b in bullets if b]
        if not reflection:
            raise ValueError("Empty reflection in Gemini response")
        return reflection, bullets

    except json.JSONDecodeError as exc:
        logger.error("Gemini returned non-JSON: %s", raw)
        raise ValueError(f"Gemini response was not valid JSON: {exc}") from exc
    except Exception as exc:
        logger.error("Gemini call failed: %s", exc)
        raise
