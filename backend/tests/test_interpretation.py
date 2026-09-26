"""
Interpretation layer tests. The provider call (`_complete_json`) is always
replaced, so these never reach the network.
"""
import datetime as dt
import re

import pytest

from backend.config import settings
from backend.models import DailyScore, Suggestion
from backend.services import interpretation
from backend.services.interpretation import build_input, build_user_prompt, generate_suggestion

DAY = dt.date(2026, 9, 26)


@pytest.mark.parametrize(
    "recovery, expected",
    [(None, None), (0, "low"), (59.9, "low"), (60, "moderate"), (79.9, "moderate"), (80, "high"), (100, "high")],
)
def test_recovery_band_matches_classifier_cutoffs(recovery, expected):
    assert build_input(recovery, None, None, "Balanced", DAY).recovery == expected


@pytest.mark.parametrize("exposure, expected", [(None, None), (39.9, "light"), (40, "moderate"), (70, "heavy")])
def test_load_band(exposure, expected):
    assert build_input(None, exposure, None, "Balanced", DAY).load == expected


@pytest.mark.parametrize("friction, expected", [(None, None), (34.9, "flowing"), (35, "noticeable"), (65, "struggling")])
def test_effort_band(friction, expected):
    assert build_input(None, None, friction, "Balanced", DAY).effort == expected


def _signal_block(prompt: str) -> str:
    """The part of the prompt that carries user data (the rest is fixed instructions)."""
    return prompt[prompt.index("Rhythm state:"):prompt.index("Write a response")]


def test_prompt_contains_no_numeric_signal_values():
    prompt = build_user_prompt(build_input(73.4, 56.2, 44.4, "Balanced", DAY))
    block = _signal_block(prompt)
    assert re.search(r"\d", block) is None
    assert "Recovery: moderate" in block
    assert "moderate" in block and "noticeable" in block


def test_prompt_marks_missing_signals():
    block = _signal_block(build_user_prompt(build_input(None, None, None, "Balanced", DAY)))
    assert block.count(": not available") == 3


def test_generate_suggestion_parses_provider_reply(monkeypatch):
    captured = {}

    def fake_complete(system, user):
        captured["user"] = user
        return {"reflection": "  A steady day.  ", "bullets": ["Take a walk", "", "Stop by six"]}

    monkeypatch.setattr(interpretation, "_complete_json", fake_complete)
    reflection, bullets = generate_suggestion(72.0, 30.0, None, "Balanced", DAY)
    assert reflection == "A steady day."
    assert bullets == ["Take a walk", "Stop by six"]
    assert "72" not in captured["user"]


def test_generate_suggestion_wraps_non_list_bullets(monkeypatch):
    monkeypatch.setattr(interpretation, "_complete_json", lambda s, u: {"reflection": "Ok.", "bullets": "One thing"})
    assert generate_suggestion(None, None, None, "Balanced", DAY)[1] == ["One thing"]


def test_generate_suggestion_rejects_empty_reflection(monkeypatch):
    monkeypatch.setattr(interpretation, "_complete_json", lambda s, u: {"reflection": " ", "bullets": []})
    with pytest.raises(ValueError, match="Empty reflection"):
        generate_suggestion(None, None, None, "Balanced", DAY)


def test_missing_api_key_raises_before_any_request(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    with pytest.raises(ValueError, match="OPENAI_API_KEY"):
        interpretation._complete_json("system", "user")


def test_generate_route_stores_suggestion(client, db, monkeypatch):
    db.add(DailyScore(date=DAY, recovery_score=72.0, condition="Balanced", data_sources='["oura"]'))
    db.commit()
    monkeypatch.setattr(interpretation, "_complete_json", lambda s, u: {"reflection": "Steady.", "bullets": ["Pace it"]})
    resp = client.post("/suggestions/generate")
    assert resp.status_code == 200
    assert resp.json()["bullets"] == ["Pace it"]
    assert db.query(Suggestion).count() == 1


def test_generate_route_reports_unconfigured_provider(client, db, monkeypatch):
    db.add(DailyScore(date=DAY, recovery_score=72.0, condition="Balanced", data_sources='["oura"]'))
    db.commit()
    monkeypatch.setattr(settings, "openai_api_key", "")
    resp = client.post("/suggestions/generate")
    assert resp.status_code == 502
    assert "OPENAI_API_KEY" in resp.text
