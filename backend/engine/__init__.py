"""
Capacity engine v2 (F1).

Pure and isolated: no database, network, framework or clock access, and no
existing endpoint imports it yet. It turns evidence (check-ins, tasks,
calendar blocks, wearable readings) into capacity, demand and a relational
state, with confidence and provenance for every conclusion.
"""
from backend.engine.assess import STATE_MATRIX, assess_day
from backend.engine.explain import Guidance, InterpretationContext, build_interpretation_context, fallback_guidance
from backend.engine.thresholds import ASSUMPTIONS, DEFAULT_THRESHOLDS, ENGINE_VERSION, Thresholds

__all__ = [
    "ASSUMPTIONS",
    "DEFAULT_THRESHOLDS",
    "ENGINE_VERSION",
    "STATE_MATRIX",
    "Guidance",
    "InterpretationContext",
    "Thresholds",
    "assess_day",
    "build_interpretation_context",
    "fallback_guidance",
]
