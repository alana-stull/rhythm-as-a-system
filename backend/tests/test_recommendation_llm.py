"""
"What matters now" model wording: privacy, validation, budget and caching.

A fake model stands in for OpenAI: nothing here makes a network call or costs
money. Live quality evals live in backend/scripts/eval_recommendations.py and
only run when someone chooses to spend on them.
"""
import datetime as dt
import json

import pytest
from sqlalchemy import text

from backend.config import settings
from backend.main import app
from backend.pipeline import llm
from backend.pipeline.recommend import Recommendation
from backend.routers.today import get_completer
from backend.tests.pg_support import make_user, pg_engine  # noqa: F401
from backend.tests.test_today_api import NOW, TODAY, api, auth, connect_calendar, person  # noqa: F401


class FakeModel:
    def __init__(self, reply=None, error=None):
        self.reply, self.error, self.calls = reply, error, []

    def __call__(self, system, user):
        self.calls.append(json.loads(user))
        if self.error:
            raise self.error
        return self.reply, 300, 40, "fake-model"


def use(model):
    app.dependency_overrides[get_completer] = lambda: model
    return model


def deferred_gym(api, person, pg_engine, *, consent=False):
    """Gym pushed 4 days, an open 2–4 window, a calendar event with a sensitive title, a health reading, a note."""
    from backend.tests import test_today_api as t
    t.Clock.now = NOW - dt.timedelta(days=4)
    task = api.post("/tasks", headers=auth(person), json={"title": "Gym", "focus_on": str(TODAY - dt.timedelta(days=4)),
                                                          "estimate_minutes": 90}).json()
    t.Clock.now = NOW
    api.patch(f"/tasks/{task['id']}", headers=auth(person), json={"focus_on": str(TODAY)})
    api.put(f"/tasks/{task['id']}/priority", headers=auth(person))
    connect_calendar(pg_engine, person, (13.5, 14, "Therapy session"), (16, 16.5, "Call mom"))
    with pg_engine.begin() as conn:
        conn.execute(text("insert into public.health_daily (user_id, source, local_date, readiness) "
                          "values (:u, 'oura', :d, 82)"), {"u": person, "d": TODAY})
    api.post("/checkins", headers=auth(person), json={"energy": "moderate", "perceived_demand": "moderate",
                                                      "note": "secret note about my week"})
    if consent:
        api.patch("/me", headers=auth(person), json={"ai_task_titles_consented": True})
    return task


def ledger(pg_engine, uid):
    with pg_engine.connect() as conn:
        return [r.outcome for r in conn.execute(text(
            "select outcome from public.llm_usage where user_id = :u order by created_at"), {"u": uid})]


GOOD = {"text": "Gym has waited 4 days. Your 2–4 is open, and it fits.", "highlight": "4 days"}


# ── Privacy ───────────────────────────────────────────────────────────────────

def test_without_consent_the_title_is_never_sent_but_is_still_shown(api, person, pg_engine):
    model = use(FakeModel({"text": "This task has waited 4 days. Your 2–4 is open, and it fits.", "highlight": "4 days"}))
    deferred_gym(api, person, pg_engine)
    first = api.get("/today", headers=auth(person)).json()["what_matters_now"]
    assert first["worded_by"] == "rules"  # Today never waits on the model
    wmn = api.get("/today", headers=auth(person)).json()["what_matters_now"]
    [sent] = model.calls
    blob = json.dumps(sent)
    assert "Gym" not in blob and "this task" in blob
    assert wmn["worded_by"] == "model" and wmn["text"].startswith("Gym has waited 4 days")


def test_with_consent_the_title_is_sent_and_recorded(api, person, pg_engine):
    model = use(FakeModel(GOOD))
    deferred_gym(api, person, pg_engine, consent=True)
    api.get("/today", headers=auth(person))
    assert model.calls[0]["facts"]["task"] == "Gym"
    with pg_engine.connect() as conn:
        row = conn.execute(text("select includes_task_titles, kind from public.interpretations "
                                "where user_id = :u and purpose = 'what_matters_now'"), {"u": person}).one()
    assert row.includes_task_titles is True and row.kind == "llm"


def test_calendar_titles_health_numbers_notes_and_identity_never_reach_the_model(api, person, pg_engine):
    model = use(FakeModel(GOOD))
    deferred_gym(api, person, pg_engine, consent=True)
    api.get("/today", headers=auth(person))
    blob = json.dumps(model.calls[0])
    for secret in ("Therapy", "Call mom", "82", "secret note", f"{person}", "example.test"):
        assert secret not in blob, secret


# ── Validation ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("reply", [
    {"text": "Gym has been pushed 5 days. Your 2–4 is open."},                 # invented number
    {"text": "Gym has been pushed 4 days. Try this afternoon."},               # dropped the window
    {"text": "Gym has been pushed 4 days. Your 2–4 is open! Go for it."},      # exclamation
    {"text": "Your burnout risk is rising. Your 2–4 is open after 4 days."},   # clinical framing
    {"text": "x" * 200},                                                       # too long
    {"nope": "missing text"},
])
def test_unsafe_wording_falls_back_to_the_rules(api, person, pg_engine, reply):
    use(FakeModel(reply))
    deferred_gym(api, person, pg_engine)
    wmn = api.get("/today", headers=auth(person)).json()["what_matters_now"]
    assert wmn["worded_by"] == "rules"
    assert wmn["text"] == "Gym has been pushed 4 days. Your 2–4 is open and fits it."
    assert ledger(pg_engine, person) == ["invalid_output"]


def test_provider_failure_falls_back_and_is_recorded(api, person, pg_engine):
    use(FakeModel(error=TimeoutError("slow")))
    deferred_gym(api, person, pg_engine)
    assert api.get("/today", headers=auth(person)).json()["what_matters_now"]["worded_by"] == "rules"
    assert ledger(pg_engine, person) == ["error"]


# ── Cost ──────────────────────────────────────────────────────────────────────

def test_wording_is_cached_per_recommendation(api, person, pg_engine):
    model = use(FakeModel(GOOD))
    deferred_gym(api, person, pg_engine)
    first = api.get("/today", headers=auth(person)).json()["what_matters_now"]
    second = api.get("/today", headers=auth(person)).json()["what_matters_now"]
    third = api.get("/today", headers=auth(person)).json()["what_matters_now"]
    assert first["worded_by"] == "rules"                       # returned before the model ran
    assert second["worded_by"] == "model" and second["text"] == third["text"]
    assert len(model.calls) == 1                               # worded once, then cached
    assert ledger(pg_engine, person) == ["ok"]


def test_monthly_budget_blocks_the_call_before_it_happens(api, person, pg_engine, monkeypatch, make_user):
    someone_else = make_user()
    with pg_engine.begin() as conn:
        conn.execute(text("insert into public.llm_usage (user_id, purpose, model, cost_usd, outcome) "
                          "values (:u, 'what_matters_now', 'm', 19.9999, 'ok')"), {"u": someone_else})
    monkeypatch.setattr(settings, "llm_monthly_budget_usd", 20.0)
    model = use(FakeModel(GOOD))
    deferred_gym(api, person, pg_engine)
    wmn = api.get("/today", headers=auth(person)).json()["what_matters_now"]
    assert model.calls == [] and wmn["worded_by"] == "rules"
    assert ledger(pg_engine, person) == ["blocked_budget"]


def test_per_person_daily_cap(api, person, pg_engine, monkeypatch):
    with pg_engine.begin() as conn:
        conn.execute(text("insert into public.llm_usage (user_id, purpose, model, outcome) "
                          "values (:u, 'what_matters_now', 'm', 'ok')"), {"u": person})
    monkeypatch.setattr(settings, "llm_user_daily_calls", 1)
    model = use(FakeModel(GOOD))
    deferred_gym(api, person, pg_engine)
    api.get("/today", headers=auth(person))
    assert model.calls == [] and ledger(pg_engine, person) == ["ok", "blocked_rate_limit"]


def test_recorded_cost_uses_the_configured_prices(api, person, pg_engine, monkeypatch):
    monkeypatch.setattr(settings, "llm_price_input_per_mtok", 1.0)
    monkeypatch.setattr(settings, "llm_price_output_per_mtok", 4.0)
    use(FakeModel(GOOD))
    deferred_gym(api, person, pg_engine)
    api.get("/today", headers=auth(person))
    with pg_engine.connect() as conn:
        cost = conn.execute(text("select cost_usd from public.llm_usage where user_id = :u"), {"u": person}).scalar_one()
    assert float(cost) == pytest.approx((300 * 1.0 + 40 * 4.0) / 1e6)


def test_disabled_model_never_calls_out(api, person, pg_engine, monkeypatch):
    monkeypatch.setattr(settings, "recommendations_llm_enabled", False)
    model = use(FakeModel(GOOD))
    deferred_gym(api, person, pg_engine)
    assert api.get("/today", headers=auth(person)).json()["what_matters_now"]["worded_by"] == "rules"
    assert model.calls == [] and ledger(pg_engine, person) == []


# ── Pure checks (no database) ─────────────────────────────────────────────────

def test_model_input_is_only_the_recommendations_facts():
    rec = Recommendation(kind="deferred_priority", text="Gym has been pushed 4 days. Your 2–4 is open.",
                         highlight="4 days", facts={"task_title": "Gym", "days_pushed": 4, "window": "2–4"})
    payload = llm.model_input(rec, state="Balanced", tone=None, titles_allowed=False)
    assert payload == {"kind": "deferred_priority", "state": "Balanced", "tone": "gentle",
                       "facts": {"days_pushed": 4, "window": "2–4", "task": "this task"},
                       "sentence": "this task has been pushed 4 days. Your 2–4 is open."}
