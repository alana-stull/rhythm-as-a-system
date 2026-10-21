"""
"How you're doing": one sentence on *why* capacity looks the way it does.

Built only from evidence the engine actually used. A signal that is missing,
stale or without a baseline is left out, never guessed. Health data appears
in words (no numbers); entered or synced facts (scheduled time, task counts)
may keep real quantities. Deterministic: no model involved.
"""
from __future__ import annotations

from backend.engine._util import fmt_minutes, source_name
from backend.engine.types import Assessment, Evidence, EvidenceKind

_ENERGY = {"very_low": "very low energy", "low": "low energy", "moderate": "moderate energy",
           "high": "good energy", "very_high": "lots of energy"}
_RESTED = {"very_low": "not rested at all", "low": "not very rested", "moderate": "fairly rested",
           "high": "well rested", "very_high": "fully rested"}
_DEMAND = {"very_light": "very light", "light": "light", "moderate": "manageable", "heavy": "heavy",
           "very_heavy": "like too much"}
_READINESS = {"low": "low", "moderate": "in its middle range", "high": "high"}
_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]


def _count(n: int, noun: str) -> str:
    return f"{_WORDS[n] if n < len(_WORDS) else n} {noun}{'' if n == 1 else 's'}"


def _used(a: Assessment) -> dict[str, Evidence]:
    return {e.signal: e for e in a.capacity.evidence + a.demand.evidence if e.used}


def _wearable_clause(ev: dict[str, Evidence]) -> str | None:
    if "readiness" in ev:
        e = ev["readiness"]
        return f"Your {source_name(e.source)} readiness is {_READINESS[e.level]}"
    if "sleep_vs_usual" in ev:
        return "You slept less than usual" if ev["sleep_vs_usual"].level == "-1" else "You slept about as much as usual"
    if "hrv_vs_usual" in ev:
        word = {"-1": "lower than", "0": "about", "1": "higher than"}[ev["hrv_vs_usual"].level]
        return f"Your heart rate variability is {word} usual"
    return None


def _reported_clause(ev: dict[str, Evidence]) -> str | None:
    rested, energy = ev.get("rested"), ev.get("energy")
    if rested and energy:
        return f"you said you're {_RESTED[rested.level]}, with {_ENERGY[energy.level]}"
    if rested:
        return f"you said you're {_RESTED[rested.level]}"
    if energy:
        return f"you said you have {_ENERGY[energy.level]}"
    return None


def _demand_clause(ev: dict[str, Evidence], a: Assessment) -> str | None:
    cal = ev.get("scheduled_minutes")
    if cal is not None and cal.kind == EvidenceKind.CALENDAR_DEMAND:
        minutes = int(cal.quantity or 0)
        return (f"your calendar has {fmt_minutes(minutes)} scheduled today" if minutes
                else "nothing is scheduled on your calendar")
    if "tasks" in ev and a.demand.task_count:
        return f"you've planned {_count(a.demand.task_count, 'task')} for today"
    if "perceived_demand" in ev:
        return f"today feels {_DEMAND[ev['perceived_demand'].level]}"
    return None


def capacity_context(a: Assessment) -> str | None:
    ev = _used(a)
    wearable, reported = _wearable_clause(ev), _reported_clause(ev)
    if wearable and reported:
        joiner = "but" if a.capacity.disagreement else "and"
        capacity = f"{wearable} {joiner} {reported}"
    else:
        capacity = wearable or (reported[0].upper() + reported[1:] if reported else None)
    demand = _demand_clause(ev, a)
    if capacity and demand:
        return f"{capacity}, and {demand}."
    if capacity:
        return f"{capacity}."
    if demand:
        return f"{demand[0].upper()}{demand[1:]}."
    return None


def insufficient_context(a: Assessment) -> str:
    """What Rhythm knows so far, then what's missing. Never implies a light day."""
    if "capacity" in a.missing and "demand" in a.missing and not capacity_context(a):
        text = "Rhythm doesn't have enough to read your day yet. A quick check-in is all it needs to start."
    else:
        missing = ("Rhythm doesn't know yet how much you have to give." if "capacity" in a.missing
                   else "Rhythm doesn't know yet what today asks.")
        known = capacity_context(a)
        text = f"{known} {missing}" if known else missing
    if a.demand.scheduled_minutes == 0:
        text += " An empty calendar doesn't mean today is light."
    return text
