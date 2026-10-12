"""
What the engine hands to the interpretation layer, and what the person sees
when the interpretation layer is unavailable.

- `build_interpretation_context` is the v2 contract for the LLM: state,
  confidence, basis, disagreements and evidence. Wearable values reach it
  only in qualitative form. Demand facts the person entered or synced (task
  counts, scheduled time) may carry real quantities. No free text from the
  person (notes, task titles) exists in the engine, so none can leak.
- `fallback_guidance` is deterministic copy for every outcome. It is the
  floor, not a placeholder: Today always has something honest to say.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

from backend.engine._util import join_phrases, source_name
from backend.engine.types import (
    Assessment,
    Confidence,
    Disagreement,
    Evidence,
    EvidenceKind,
    NextAction,
    Pathway,
    State,
    Status,
)

CONTEXT_VERSION = "interpretation-context-2"

STATE_MEANING: dict[State, str] = {
    State.ALIGNED: "what they have to give comfortably covers what today asks",
    State.BALANCED: "what they have to give roughly matches what today asks, with little to spare",
    State.STRAINED: "today asks somewhat more than they have to give",
    State.OVERLOADED: "today asks considerably more than they have to give",
}


# ── Phrasing helpers ───────────────────────────────────────────────────────────

def _basis_phrase(e: Evidence) -> str:
    if e.signal in ("energy", "rested"):
        return "how you said you're feeling"
    if e.signal == "perceived_demand":
        return "how heavy you said today feels"
    if e.kind == EvidenceKind.WEARABLE_MEASUREMENT:
        return f"your {source_name(e.source)} data"
    if e.kind == EvidenceKind.CALENDAR_DEMAND:
        return "your calendar"
    if e.kind == EvidenceKind.TASK_DEMAND:
        return "the tasks you've planned for today"
    return ""


def _basis(evidence: tuple[Evidence, ...]) -> str:
    return join_phrases(_basis_phrase(e) for e in evidence if e.used)


# (subject, "show" verb, "look" verb)
_OTHER_SOURCE_PHRASE = {
    "calendar_and_tasks": ("your calendar and tasks", "show", "look"),
    "calendar": ("your calendar", "shows", "looks"),
    "tasks": ("your tasks", "show", "look"),
}


def disagreement_sentence(d: Disagreement) -> str:
    if d.domain == "capacity":
        name = source_name(d.other_source)
        if d.reported_is_higher:
            return (f"You described more energy than your {name} data suggests. "
                    "Rhythm is going with how you feel, and it may still be worth pacing yourself.")
        return (f"Your {name} data suggests more in the tank than you described. "
                "Rhythm is going with how you feel.")
    other, shows, looks = _OTHER_SOURCE_PHRASE[d.other_source]
    if d.reported_is_higher:
        return (f"Today feels heavier than {other} {shows}; there may be demands not captured there. "
                "Rhythm is keeping both in view rather than picking one.")
    return (f"{other[0].upper() + other[1:]} {looks} heavier than today feels. "
            "Rhythm is keeping both in view rather than picking one.")


# ── LLM contract ───────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class InterpretationContext:
    version: str
    weekday: str
    status: str
    state: str | None
    possible_states: list[str]
    state_meaning: str | None
    pathway: str
    confidence: str | None
    capacity: dict
    demand: dict
    evidence: list[str]
    disagreements: list[str]
    missing: list[str]
    next_actions: list[str]
    context_tags: list[str]
    tone: str | None = None
    rules: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


_RULES = [
    "Only restate what the evidence says; never invent measurements, numbers or causes.",
    "Match certainty to confidence: low confidence is an early read, medium is qualified, high is plain.",
    "If status is uncertain, describe the range of possible states; never pick one as the answer.",
    "Name the basis of the read when it is self-reported or partial.",
    "When sources disagree, say so plainly and say which way Rhythm leaned.",
    "No medical, diagnostic or clinical language.",
    "Suggest, don't dictate.",
]


def _llm_line(e: Evidence) -> str:
    # Health data: qualitative only. Entered/synced demand facts may keep quantities.
    return e.qualitative if e.kind == EvidenceKind.WEARABLE_MEASUREMENT else e.display


def build_interpretation_context(a: Assessment, tone: str | None = None) -> InterpretationContext:
    used = [e for e in a.capacity.evidence + a.demand.evidence if e.used]
    return InterpretationContext(
        version=CONTEXT_VERSION,
        weekday=a.local_date.strftime("%A"),
        status=a.status.value,
        state=a.state.value if a.state else None,
        possible_states=[s.value for s in a.possible_states],
        state_meaning=STATE_MEANING[a.state] if a.state else None,
        pathway=a.pathway.value,
        confidence=a.confidence.value if a.confidence else None,
        capacity={
            "band": a.capacity.band.value if a.capacity.band else None,
            "confidence": a.capacity.confidence.value if a.capacity.confidence else None,
            "basis": [k.value for k in a.capacity.basis],
        },
        demand={
            "band": a.demand.band.value if a.demand.band else None,
            "range": [b.value for b in a.demand.band_range] if a.demand.band_range else None,
            "confidence": a.demand.confidence.value if a.demand.confidence else None,
            "basis": [k.value for k in a.demand.basis],
        },
        evidence=[_llm_line(e) for e in used],
        disagreements=[disagreement_sentence(d) for d in a.disagreements],
        missing=list(a.missing),
        next_actions=[n.value for n in a.next_actions],
        context_tags=sorted(a.context_tags),
        tone=tone,
        rules=list(_RULES),
    )


# ── Deterministic fallback ─────────────────────────────────────────────────────

@dataclass(frozen=True)
class Guidance:
    status: str
    state: str | None
    color_family: str
    headline: str
    body: str
    actions: tuple[str, ...]


_HEADLINES = {
    State.ALIGNED: "You have room today",
    State.BALANCED: "A steady day. Pace it",
    State.STRAINED: "Today asks a bit more than you have",
    State.OVERLOADED: "More is being asked than you have today",
}

_SUMMARIES = {
    State.ALIGNED: "What you have to give looks like a good match for what today asks.",
    State.BALANCED: "You can meet what today asks, but there isn't much to spare.",
    State.STRAINED: "Today's demands are likely to stretch what you have.",
    State.OVERLOADED: "Today's demands are well beyond what you have to give.",
}

_STATE_ACTIONS = {
    State.ALIGNED: ("Put your most demanding work where you feel sharpest",
                    "Leave some room rather than filling every gap"),
    State.BALANCED: ("Pick the one thing that matters most today",
                     "Build in a short break between demanding stretches"),
    State.STRAINED: ("Choose what can wait or get smaller",
                     "Protect a break before your heaviest stretch"),
    State.OVERLOADED: ("Decide what to move or let go of today",
                       "Keep only what truly has to happen"),
}


def _qualifier(a: Assessment) -> str:
    if a.status == Status.UNCERTAIN:
        return ""  # the range itself already says how sure Rhythm is
    if a.confidence == Confidence.LOW and any(d.strong for d in a.disagreements):
        return "Because your signals point different ways, hold this read loosely."
    if a.confidence == Confidence.LOW:
        return "It's an early read, so hold it loosely."
    if a.confidence == Confidence.MEDIUM and a.pathway == Pathway.SELF_REPORTED:
        return "It's built from what you've shared, so adjust it if it doesn't feel right."
    return ""


_UNCERTAIN_ACTION = "Start with what has to happen today, and keep the rest flexible"
_TASK_DETAILS_ACTION = "Add an effort level or time estimate to today's tasks"


def _check_in_action(a: Assessment) -> str:
    if "capacity" in a.missing and "demand" in a.missing:
        return "Do a quick check-in: how's your energy, and how heavy does today feel?"
    if "capacity" in a.missing:
        return "Tell Rhythm how your energy is right now"
    return "Tell Rhythm how heavy today feels"


def _action_text(a: Assessment, n: NextAction) -> str:
    if n == NextAction.CHECK_IN:
        return _check_in_action(a)
    if n == NextAction.ADD_TASK_DETAILS:
        return _TASK_DETAILS_ACTION
    return "Add what you're planning to work on today"


def fallback_guidance(a: Assessment) -> Guidance:
    sentences: list[str] = []

    if a.status == Status.INSUFFICIENT_EVIDENCE:
        headline = "Still getting to know your day"
        if a.capacity.band is not None:
            sentences.append(f"Rhythm has a sense of what you have to give from {_basis(a.capacity.evidence)}.")
        if a.demand.band_range is not None:
            sentences.append(f"Rhythm has a sense of what today asks from {_basis(a.demand.evidence)}.")
        elif a.demand.scheduled_minutes == 0:
            sentences.append("Your calendar is clear, but that doesn't mean today is light.")
        elif a.demand.task_count:
            sentences.append("Today's tasks don't have an effort level or estimate yet, so Rhythm can't tell how much they'll ask.")
        needs = join_phrases(["how much you have to give" if m == "capacity" else "what today is asking of you"
                              for m in a.missing])
        sentences.append(f"To give you a read, it needs a sense of {needs}.")
        for e in a.unused_evidence:
            if e.kind == EvidenceKind.WEARABLE_MEASUREMENT and e.signal == "last_reading":
                sentences.append(f"Your last {source_name(e.source)} reading is from "
                                 f"{e.observed_for:%B} {e.observed_for.day}, so it isn't used for today.")
        actions = tuple(_action_text(a, n) for n in a.next_actions)
    elif a.status == Status.UNCERTAIN:
        headline = "Today could go either way"
        lighter, heavier = a.possible_states[0].value.lower(), a.possible_states[-1].value.lower()
        sentences.append(f"Today looks somewhere between {lighter} and {heavier}.")
        sentences.extend(disagreement_sentence(d) for d in a.disagreements)
        if a.demand.known_range and a.demand.known_range[0] != a.demand.known_range[1]:
            sentences.append("Some of today's tasks don't have an effort level yet, so Rhythm can't tell how much they'll ask.")
        sentences.append(f"This read is based on {_basis(a.capacity.evidence + a.demand.evidence)}.")
        actions = (*(_action_text(a, n) for n in a.next_actions), _UNCERTAIN_ACTION)
    else:
        headline = _HEADLINES[a.state]
        sentences.append(_SUMMARIES[a.state])
        sentences.append(f"This read is based on {_basis(a.capacity.evidence + a.demand.evidence)}.")
        sentences.extend(disagreement_sentence(d) for d in a.disagreements)
        actions = _STATE_ACTIONS[a.state]

    qualifier = _qualifier(a)
    if qualifier:
        sentences.append(qualifier)

    return Guidance(
        status=a.status.value,
        state=a.state.value if a.state else None,
        color_family=a.color_family,
        headline=headline,
        body=" ".join(sentences),
        actions=actions,
    )
