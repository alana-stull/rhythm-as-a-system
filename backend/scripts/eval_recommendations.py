"""
Live wording eval for "What matters now" (calls OpenAI; costs a little money).

Runs fixed scenarios through the real model with the production prompt, then
applies the production validator. Reports how often the model's wording would
be shown vs. replaced by the rules' sentence, and shows every reply.

Nothing is written to any database. Requires OPENAI_API_KEY and --yes.

    .venv/bin/python -m backend.scripts.eval_recommendations --yes
"""
from __future__ import annotations

import argparse
import json
import sys

from backend.config import settings
from backend.pipeline import llm
from backend.pipeline.recommend import Recommendation

SCENARIOS: list[tuple[str, Recommendation, str | None, str | None, bool]] = [
    # (name, recommendation, state, tone, titles_allowed)
    ("deferred, fits, consented",
     Recommendation("deferred_priority", "Gym has been pushed 4 days. Your 2–4 is open and fits it.", "4 days",
                    facts={"task_title": "Gym", "days_pushed": 4, "window": "2–4", "estimate_fits": True,
                           "calendar_known": True}), "Balanced", "gentle", True),
    ("deferred, no consent",
     Recommendation("deferred_priority", "Finish the reading response has been pushed 2 days. Your 3:30–5 is open.",
                    "2 days", facts={"task_title": "Finish the reading response", "days_pushed": 2, "window": "3:30–5",
                                     "estimate_fits": False, "calendar_known": True}), "Aligned", "direct", False),
    ("deferred, no calendar",
     Recommendation("deferred_priority", "Call mom back has been pushed 1 day. Could today be the day?", "1 day",
                    facts={"task_title": "Call mom back", "days_pushed": 1, "window": None, "calendar_known": False}),
     "Balanced", "gentle", True),
    ("priority window",
     Recommendation("priority_window", "Your 10–12 is open, a good stretch for Draft midterm outline.", "10–12",
                    facts={"task_title": "Draft midterm outline", "window": "10–12", "estimate_fits": False}),
     "Aligned", "motivating", True),
    ("make room, overloaded",
     Recommendation("make_room", "Today asks more than you have. Could one of your priorities move to another day "
                    "or get smaller?", facts={"state": "Overloaded", "open_priorities": 3}), "Overloaded", "gentle", True),
    ("check-in",
     Recommendation("check_in", "A quick check-in will help Rhythm read your day.",
                    facts={"missing": ["capacity", "demand"]}), None, "gentle", True),
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true", help="confirm: this calls the paid API")
    args = parser.parse_args()
    if not settings.openai_api_key:
        print("OPENAI_API_KEY is not set.")
        return 2
    worst = len(SCENARIOS) * (2000 * settings.llm_price_input_per_mtok
                              + settings.llm_max_output_tokens * settings.llm_price_output_per_mtok) / 1e6
    print(f"{len(SCENARIOS)} calls to {settings.interpretation_model}; worst case ≈ ${worst:.4f}")
    if not args.yes:
        print("Re-run with --yes to spend it.")
        return 1

    shown = 0
    for name, rec, state, tone, titles in SCENARIOS:
        payload = llm.model_input(rec, state=state, tone=tone, titles_allowed=titles)
        try:
            reply, tin, tout, model = llm.openai_completer(llm.SYSTEM_PROMPT, json.dumps(payload, ensure_ascii=False))
        except Exception as exc:  # noqa: BLE001
            print(f"✗ {name}: provider error {type(exc).__name__}")
            continue
        checked = llm.validate(reply, payload)
        shown += checked is not None
        mark = "✓" if checked else "✗ (rules used)"
        print(f"{mark} {name}  [{tin}+{tout} tokens]\n    rules: {payload['sentence']}\n    model: {reply.get('text')!r}")
    print(f"\nModel wording passed validation in {shown}/{len(SCENARIOS)} scenarios.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
