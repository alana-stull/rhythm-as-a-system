"""
Capacity: what the person has to give today.

Two independent kinds of evidence, never merged into one number:
- wearable measurements (a vendor composite such as Oura readiness, or sleep,
  HRV and resting heart rate compared with the person's own baseline);
- the person's self-reported energy.

A readiness score is one piece of evidence about recovery. It is reported as
`wearable_band`, never as capacity itself.
"""
from __future__ import annotations

import datetime as _dt

from backend.engine._util import finite, fmt_minutes, latest_answer, median, source_name
from backend.engine.thresholds import Thresholds
from backend.engine.types import (
    ENERGY_LABELS,
    CapacityAssessment,
    CapacityBand,
    Confidence,
    DayInputs,
    Disagreement,
    EnergyLevel,
    Evidence,
    EvidenceKind,
    Method,
    UnusedReason,
    WearableDay,
    rank,
)

ENERGY_TO_BAND: dict[EnergyLevel, CapacityBand] = {
    EnergyLevel.VERY_LOW: CapacityBand.LOW,
    EnergyLevel.LOW: CapacityBand.LOW,
    EnergyLevel.MODERATE: CapacityBand.MODERATE,
    EnergyLevel.HIGH: CapacityBand.HIGH,
    EnergyLevel.VERY_HIGH: CapacityBand.HIGH,
}

_RANGE_WORD = {CapacityBand.LOW: "lower", CapacityBand.MODERATE: "middle", CapacityBand.HIGH: "upper"}


def _has_data(w: WearableDay) -> bool:
    return any(finite(v) is not None for v in (w.readiness, w.sleep_minutes, w.hrv_ms, w.resting_hr))


def _component_count(w: WearableDay) -> int:
    return sum(finite(v) is not None for v in (w.sleep_minutes, w.hrv_ms, w.resting_hr))


def _readiness_band(value: float, t: Thresholds) -> CapacityBand:
    if value >= t.readiness_high_from:
        return CapacityBand.HIGH
    if value >= t.readiness_moderate_from:
        return CapacityBand.MODERATE
    return CapacityBand.LOW


def _wearable(inputs: DayInputs, t: Thresholds) -> tuple[CapacityBand | None, Confidence | None, list[Evidence], list[Evidence]]:
    """Returns (band, confidence, used evidence, unused evidence)."""
    day = inputs.day.local_date
    used: list[Evidence] = []
    unused: list[Evidence] = []

    today = [w for w in inputs.wearable if w.local_date == day and _has_data(w)]
    if not today:
        prior = [w for w in inputs.wearable if w.local_date < day and _has_data(w)]
        if prior:
            last = max(prior, key=lambda w: w.local_date)
            name = source_name(last.source)
            unused.append(Evidence(
                kind=EvidenceKind.WEARABLE_MEASUREMENT, signal="last_reading", source=last.source,
                method=Method.MEASURED, observed_for=last.local_date,
                display=f"Last {name} reading: {last.local_date:%B} {last.local_date.day}",
                qualitative=f"no {name} reading for today",
                record_ids=(last.record_id,) if last.record_id else (),
                used=False, unused_reason=UnusedReason.STALE,
            ))
        return None, None, used, unused

    # Prefer a source with a vendor composite; otherwise the most complete one.
    chosen = max(today, key=lambda w: (finite(w.readiness) is not None, _component_count(w)))
    for other in today:
        if other is not chosen:
            unused.append(Evidence(
                kind=EvidenceKind.WEARABLE_MEASUREMENT, signal="other_source", source=other.source,
                method=Method.MEASURED, observed_for=day,
                display=f"{source_name(other.source)} data also available",
                qualitative=f"{source_name(other.source)} data also available",
                record_ids=(other.record_id,) if other.record_id else (),
                used=False, unused_reason=UnusedReason.SUPERSEDED,
            ))

    name = source_name(chosen.source)
    ids = (chosen.record_id,) if chosen.record_id else ()
    readiness = finite(chosen.readiness)
    if readiness is not None:
        band = _readiness_band(readiness, t)
        used.append(Evidence(
            kind=EvidenceKind.WEARABLE_MEASUREMENT, signal="readiness", source=chosen.source,
            method=Method.MEASURED, observed_for=day,
            display=f"{name} readiness {readiness:.0f}",
            qualitative=f"{name} readiness in its {_RANGE_WORD[band]} range",
            quantity=readiness, unit="readiness_0_100", level=band.value, record_ids=ids,
        ))
        # Readiness already reflects sleep, HRV and resting HR: don't count them again.
        return band, Confidence.MEDIUM, used, unused

    return _components(inputs, chosen, t, used, unused)


def _components(inputs: DayInputs, chosen: WearableDay, t: Thresholds, used: list[Evidence], unused: list[Evidence]):
    day = inputs.day.local_date
    window_start = day - _dt.timedelta(days=t.baseline_window_days)
    history = [w for w in inputs.wearable
               if w.source == chosen.source and window_start <= w.local_date < day]
    name = source_name(chosen.source)
    ids = (chosen.record_id,) if chosen.record_id else ()
    signals: list[int] = []

    def baseline(values: list[float | None]) -> float | None:
        vals = [v for v in (finite(x) for x in values) if v is not None]
        return median(vals) if len(vals) >= t.baseline_min_days else None

    def record(signal: str, value: float, unit: str, shown: str, usual: float | None, direction: int | None, words: dict[int, str]):
        if usual is None or direction is None:
            unused.append(Evidence(
                kind=EvidenceKind.WEARABLE_MEASUREMENT, signal=signal, source=chosen.source,
                method=Method.MEASURED, observed_for=day,
                display=f"{shown} (still learning your usual)",
                qualitative=f"{name} {signal.replace('_', ' ')} recorded; personal baseline not established yet",
                quantity=value, unit=unit, record_ids=ids,
                used=False, unused_reason=UnusedReason.NO_BASELINE,
            ))
            return
        signals.append(direction)
        used.append(Evidence(
            kind=EvidenceKind.WEARABLE_MEASUREMENT, signal=f"{signal}_vs_usual", source=chosen.source,
            method=Method.DERIVED, observed_for=day,
            display=shown, qualitative=f"{name}: {words[direction]}",
            quantity=value, unit=unit, level=str(direction), record_ids=ids,
        ))

    sleep = finite(chosen.sleep_minutes)
    if sleep is not None:
        usual = baseline([w.sleep_minutes for w in history])
        d = None if usual is None else (-1 if sleep < usual * t.sleep_below_usual_ratio else 0)
        shown = f"Slept {fmt_minutes(sleep)}" + (f" (usual {fmt_minutes(usual)})" if usual else "")
        record("sleep", sleep, "minutes", shown, usual, d,
               {-1: "sleep shorter than usual", 0: "sleep about usual or longer"})

    hrv = finite(chosen.hrv_ms)
    if hrv is not None:
        usual = None
        if chosen.hrv_method:  # never compare RMSSD with SDNN
            usual = baseline([w.hrv_ms for w in history if w.hrv_method == chosen.hrv_method])
        d = None
        if usual is not None:
            d = -1 if hrv < usual * t.hrv_below_usual_ratio else (1 if hrv > usual * t.hrv_above_usual_ratio else 0)
        shown = f"HRV {hrv:.0f} ms" + (f" (usual {usual:.0f})" if usual else "")
        record("hrv", hrv, "ms", shown, usual, d,
               {-1: "HRV below usual", 0: "HRV about usual", 1: "HRV above usual"})

    rhr = finite(chosen.resting_hr)
    if rhr is not None:
        usual = baseline([w.resting_hr for w in history])
        d = None
        if usual is not None:
            d = -1 if rhr >= usual + t.resting_hr_above_usual_bpm else (1 if rhr <= usual - t.resting_hr_below_usual_bpm else 0)
        shown = f"Resting heart rate {rhr:.0f} bpm" + (f" (usual {usual:.0f})" if usual else "")
        record("resting_hr", rhr, "bpm", shown, usual, d,
               {-1: "resting heart rate above usual", 0: "resting heart rate about usual", 1: "resting heart rate below usual"})

    if not signals:
        return None, None, used, unused
    mean = sum(signals) / len(signals)
    if mean <= t.components_low_at_or_below:
        band = CapacityBand.LOW
    elif mean >= t.components_high_at_or_above:
        band = CapacityBand.HIGH
    else:
        band = CapacityBand.MODERATE
    confidence = Confidence.LOW if len(signals) == 1 else Confidence.MEDIUM
    return band, confidence, used, unused


def assess_capacity(inputs: DayInputs, t: Thresholds) -> tuple[CapacityAssessment, list[Evidence]]:
    w_band, w_conf, evidence, unused = _wearable(inputs, t)

    checkin = latest_answer(inputs.checkins, inputs.day, "energy")
    r_band = None
    if checkin is not None:
        r_band = ENERGY_TO_BAND[checkin.energy]
        label = ENERGY_LABELS[checkin.energy]
        evidence.append(Evidence(
            kind=EvidenceKind.SELF_REPORT, signal="energy", source="checkin",
            method=Method.SELF_REPORTED, observed_for=checkin.local_date,
            display=f"Energy: {label}", qualitative=f"described their energy as {label.lower()}",
            level=checkin.energy.value, recorded_at=checkin.recorded_at, record_ids=(checkin.id,),
        ))

    basis: list[EvidenceKind] = []
    if w_band is not None:
        basis.append(EvidenceKind.WEARABLE_MEASUREMENT)
    if r_band is not None:
        basis.append(EvidenceKind.SELF_REPORT)

    disagreement = None
    if w_band is None and r_band is None:
        band, confidence = None, None
    elif r_band is None:
        band, confidence = w_band, w_conf
    elif w_band is None:
        band, confidence = r_band, Confidence.MEDIUM
    elif w_band == r_band:
        band = r_band
        confidence = Confidence.HIGH if w_conf != Confidence.LOW else Confidence.MEDIUM
    else:
        # Keep both; follow the person (their lived experience leads) and say so.
        strong = abs(rank(w_band) - rank(r_band)) == 2
        band = r_band
        confidence = Confidence.LOW if strong else Confidence.MEDIUM
        wearable_source = next(e.source for e in evidence if e.kind == EvidenceKind.WEARABLE_MEASUREMENT)
        disagreement = Disagreement(
            domain="capacity", other_level=w_band.value, other_source=wearable_source,
            other_is_connected=True, reported_level=r_band.value,
            reported_is_higher=rank(r_band) > rank(w_band),
            resolution="followed_self_report", strong=strong,
        )

    return CapacityAssessment(
        band=band, confidence=confidence, basis=tuple(basis),
        wearable_band=w_band, reported_band=r_band,
        evidence=tuple(evidence), disagreement=disagreement,
    ), unused
