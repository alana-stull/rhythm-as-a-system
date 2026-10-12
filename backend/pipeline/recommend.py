"""
"What matters now": what the person can do about today.

Rules choose the recommendation and write a complete, honest sentence. The
model (pipeline/llm.py) may only rephrase that sentence, from the same facts.

Candidates, first match wins:
1. Rhythm can't read capacity yet            → a check-in
2. Strained / Overloaded                      → make room (move or shrink something)
3. An open priority that keeps getting pushed → name it, with an open window if one exists
4. Any open priority                          → its best open window
5. Otherwise                                  → the engine's own guidance for the state
Facts are only stated when they exist: no calendar means no window claims,
no estimate means no "fits".
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Any

from backend.engine import fallback_guidance
from backend.engine.types import Assessment, State, Status
from backend.pipeline.windows import Window, label

RULES_VERSION = "recommend-1"


@dataclass(frozen=True)
class Recommendation:
    kind: str                       # check_in | make_room | deferred_priority | priority_window | state_guidance
    text: str
    highlight: str | None = None    # exact substring to emphasize
    task_id: str | None = None
    window: Window | None = None
    facts: dict[str, Any] = field(default_factory=dict)  # everything the text may rely on (model input)


def _open(task: dict[str, Any]) -> bool:
    return task["completed_at"] is None and task["let_go_at"] is None


def _days_pushed(task: dict[str, Any], today: dt.date) -> int:
    first = task.get("first_focus_on")
    return (today - first).days if first and first < today else 0


def _fitting(windows: list[Window], estimate: int | None) -> Window | None:
    if not windows:
        return None
    if estimate:
        return next((w for w in windows if w.minutes >= estimate), None)
    return windows[0]


def recommend(a: Assessment, priorities: list[dict[str, Any]], windows: list[Window] | None,
              today: dt.date) -> Recommendation | None:
    """`windows` is None when no fresh calendar is connected (unknown), [] when the day is full."""
    if a.capacity.band is None:
        return Recommendation(kind="check_in", text="A quick check-in will help Rhythm read your day.",
                              facts={"missing": list(a.missing)})

    open_priorities = [p for p in priorities if _open(p)]
    state = a.state

    if state in (State.STRAINED, State.OVERLOADED) and open_priorities:
        n = len(open_priorities)
        what = "one of your priorities" if n > 1 else "your priority"
        return Recommendation(
            kind="make_room",
            text=f"Today asks more than you have. Could {what} move to another day or get smaller?",
            facts={"state": state.value, "open_priorities": n})

    deferred = sorted((p for p in open_priorities if _days_pushed(p, today) > 0),
                      key=lambda p: _days_pushed(p, today), reverse=True)
    if deferred:
        task = deferred[0]
        days = _days_pushed(task, today)
        days_text = f"{days} day{'s' if days != 1 else ''}"
        w = _fitting(windows or [], task.get("estimate_minutes"))
        if w is not None:
            fits = " and fits it" if task.get("estimate_minutes") else ""
            tail = f" Your {label(w)} is open{fits}."
        elif windows is None:
            tail = " Could today be the day?"
        else:
            tail = " Today looks full, so it may be worth choosing a new day for it."
        return Recommendation(
            kind="deferred_priority", text=f"{task['title']} has been pushed {days_text}.{tail}",
            highlight=days_text, task_id=str(task["id"]), window=w,
            facts={"task_title": task["title"], "days_pushed": days, "window": label(w) if w else None,
                   "estimate_fits": bool(w and task.get("estimate_minutes")), "calendar_known": windows is not None})

    if open_priorities and windows:
        task = open_priorities[0]
        w = _fitting(windows, task.get("estimate_minutes"))
        if w is not None:
            return Recommendation(
                kind="priority_window", text=f"Your {label(w)} is open — a good stretch for {task['title']}.",
                highlight=label(w), task_id=str(task["id"]), window=w,
                facts={"task_title": task["title"], "window": label(w),
                       "estimate_fits": bool(task.get("estimate_minutes"))})

    if a.status == Status.INSUFFICIENT_EVIDENCE:
        return None  # nothing honest to add beyond "How you're doing"
    guidance = fallback_guidance(a)
    if not guidance.actions:
        return None
    return Recommendation(kind="state_guidance", text=f"{guidance.actions[0]}.",
                          facts={"state": a.state.value if a.state else None, "status": a.status.value})
