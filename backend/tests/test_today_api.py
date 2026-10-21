"""F3 endpoints end to end against local Supabase: tasks, Top 3, check-ins, GET /today."""
import datetime as dt
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from backend.auth import get_token_verifier
from backend.db import scope
from backend.main import app
from backend.pipeline.clock import get_now
from backend.routers.today import get_completer
from backend.tests.pg_support import make_token, make_user, pg_engine, verifier_for_tests  # noqa: F401

pytestmark = pytest.mark.postgres

LA = ZoneInfo("America/Los_Angeles")
NOW = dt.datetime(2026, 10, 12, 13, 15, tzinfo=LA)  # Monday, 1:15 PM
TODAY = NOW.date()


class Clock:
    now = NOW


@pytest.fixture
def api(pg_engine):
    Clock.now = NOW
    app.dependency_overrides[get_token_verifier] = verifier_for_tests
    app.dependency_overrides[scope.engine_or_503] = lambda: pg_engine
    app.dependency_overrides[get_now] = lambda: Clock.now.astimezone(dt.timezone.utc)
    app.dependency_overrides[get_completer] = lambda: None
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def auth(uid):
    return {"Authorization": f"Bearer {make_token(uid)}"}


@pytest.fixture
def person(api, make_user):
    uid = make_user()
    assert api.patch("/me", headers=auth(uid), json={"timezone": "America/Los_Angeles"}).status_code == 200
    return uid


def local(hour: float, day: dt.date = TODAY) -> dt.datetime:
    return dt.datetime.combine(day, dt.time(), tzinfo=LA) + dt.timedelta(hours=hour)


def connect_calendar(pg_engine, uid, *spans, synced=NOW - dt.timedelta(minutes=30)):
    with pg_engine.begin() as conn:
        conn.execute(text("insert into public.connections (user_id, provider, last_synced_at) "
                          "values (:u, 'apple_calendar', :s)"), {"u": uid, "s": synced})
        for i, (start, end, title) in enumerate(spans):
            conn.execute(text(
                "insert into public.external_events (user_id, source, calendar_ref, external_id, starts_at, ends_at, title) "
                "values (:u, 'apple_calendar', 'cal-1', :x, :s, :e, :t)"),
                {"u": uid, "x": f"evt-{i}", "s": local(start), "e": local(end), "t": title})


# ── Tasks and Top 3 ───────────────────────────────────────────────────────────

def test_task_crud_is_private_to_its_owner(api, person, make_user):
    other = make_user()
    r = api.post("/tasks", headers=auth(person), json={"title": "  Reading response ", "effort": "moderate"})
    assert r.status_code == 201, r.text
    task = r.json()
    assert task["title"] == "Reading response" and task["times_deferred"] == 0

    assert api.patch(f"/tasks/{task['id']}", headers=auth(other), json={"title": "x"}).status_code == 404
    assert api.delete(f"/tasks/{task['id']}", headers=auth(other)).status_code == 404
    assert api.get("/tasks", headers=auth(other)).json() == []

    done = api.patch(f"/tasks/{task['id']}", headers=auth(person), json={"completed": True}).json()
    assert done["completed_at"] is not None
    assert [t["id"] for t in api.get("/tasks", headers=auth(person)).json()] == [task["id"]]  # done today: still listed
    assert api.delete(f"/tasks/{task['id']}", headers=auth(person)).status_code == 204


@pytest.mark.parametrize("payload", [
    {"title": ""}, {"title": "x" * 301}, {"effort": "huge"}, {"estimate_minutes": 0},
    {"times_deferred": 0}, {"first_focus_on": "2026-01-01"}, {"priority_rank": 1}, {"user_id": "x"},
])
def test_task_writes_are_validated(api, person, payload):
    assert api.post("/tasks", headers=auth(person), json={"title": "t", **payload}).status_code == 422


def test_tags_on_tasks_must_belong_to_the_person(api, person, make_user):
    other = make_user()
    theirs = api.post("/areas", headers=auth(other), json={"name": "Work", "color_family": "sky"}).json()
    r = api.post("/tasks", headers=auth(person), json={"title": "t", "area_id": theirs["id"]})
    assert r.status_code == 422


def test_top_three_is_enforced_and_counts_completed_items(api, person):
    ids = [api.post("/tasks", headers=auth(person), json={"title": f"t{i}"}).json()["id"] for i in range(4)]
    ranks = [api.put(f"/tasks/{i}/priority", headers=auth(person)).json()["priority_rank"] for i in ids[:3]]
    assert ranks == [1, 2, 3]
    assert api.put(f"/tasks/{ids[3]}/priority", headers=auth(person)).status_code == 409

    api.patch(f"/tasks/{ids[0]}", headers=auth(person), json={"completed": True})
    assert api.put(f"/tasks/{ids[3]}/priority", headers=auth(person)).status_code == 409  # done still takes a slot

    cleared = api.delete(f"/tasks/{ids[1]}/priority", headers=auth(person)).json()
    assert cleared["priority_rank"] is None
    assert api.put(f"/tasks/{ids[3]}/priority", headers=auth(person)).json()["priority_rank"] == 2
    assert api.put(f"/tasks/{ids[3]}/priority", headers=auth(person)).status_code == 200  # idempotent


def test_moving_a_priority_to_another_day_counts_as_a_deferral_and_frees_the_slot(api, person):
    t = api.post("/tasks", headers=auth(person), json={"title": "Gym"}).json()
    api.put(f"/tasks/{t['id']}/priority", headers=auth(person))
    moved = api.patch(f"/tasks/{t['id']}", headers=auth(person),
                      json={"focus_on": str(TODAY + dt.timedelta(days=1))}).json()
    assert moved["times_deferred"] == 1 and moved["first_focus_on"] == str(TODAY)
    assert moved["priority_rank"] is None


# ── Check-ins ─────────────────────────────────────────────────────────────────

def test_checkin_is_recorded_on_the_persons_local_day(api, person):
    Clock.now = dt.datetime(2026, 10, 12, 23, 30, tzinfo=LA)  # already Oct 13 in UTC
    r = api.post("/checkins", headers=auth(person), json={"energy": "high", "rested": "low", "context_tags": ["sleep"]})
    assert r.status_code == 201, r.text
    assert r.json()["local_date"] == "2026-10-12" and r.json()["rested"] == "low"


@pytest.mark.parametrize("payload", [{}, {"note": "only a note"}, {"energy": "great"}, {"rested": 3},
                                     {"perceived_demand": "low"}, {"context_tags": ["hungover"]}])
def test_checkins_need_a_real_answer(api, person, payload):
    assert api.post("/checkins", headers=auth(person), json=payload).status_code == 422


# ── GET /today ────────────────────────────────────────────────────────────────

def test_a_new_person_gets_an_honest_empty_today(api, person):
    r = api.get("/today", headers=auth(person))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["date"] == str(TODAY)
    cap = body["capacity"]
    assert cap["status"] == "insufficient_evidence" and cap["state"] is None
    assert cap["context"] == "Rhythm doesn't have enough to read your day yet. A quick check-in is all it needs to start."
    assert cap["checked_in_today"] is False and "check_in" in cap["next_actions"]
    assert body["what_matters_now"] is None  # the card itself asks for the check-in
    assert body["priorities"] == [] and body["schedule"] == {"upcoming": [], "calendar_connected": False}


def test_checkin_alone_gives_a_self_reported_read_with_its_reasons(api, person):
    api.post("/checkins", headers=auth(person), json={"energy": "moderate", "rested": "moderate",
                                                      "perceived_demand": "moderate"})
    cap = api.get("/today", headers=auth(person)).json()["capacity"]
    assert cap["status"] == "assessed" and cap["state"] == "Balanced"
    assert cap["pathway"] == "self_reported" and cap["source_label"] == "self-reported"
    assert cap["confidence"] == "medium"
    assert cap["context"] == "You said you're fairly rested, with moderate energy, and today feels manageable."


def test_calendar_evidence_respects_treatments_and_titles_stay_out_of_reasons(api, person, pg_engine):
    connect_calendar(pg_engine, person, (9, 10, "Team sync"), (14, 15, "Client call"), (16, 17, "Dentist"))
    with pg_engine.begin() as conn:  # "Dentist" doesn't count toward demand
        conn.execute(text("insert into public.event_overrides (user_id, source, external_id, treatment) "
                          "values (:u, 'apple_calendar', 'evt-2', 'ignore')"), {"u": person})
    api.post("/checkins", headers=auth(person), json={"energy": "high"})
    body = api.get("/today", headers=auth(person)).json()
    assert body["capacity"]["context"] == "You said you have good energy, and your calendar has 2h scheduled today."
    assert "Team sync" not in body["capacity"]["context"]
    upcoming = body["schedule"]["upcoming"]
    assert [u["external_id"] for u in upcoming] == ["evt-1", "evt-2"]  # the next two, in order (9am is past)
    assert body["schedule"]["calendar_connected"] is True


def test_a_checkin_never_erases_calendar_evidence(api, person, pg_engine):
    """The v1 bug (check-in reclassified with exposure=None) can't happen: every read rebuilds from all evidence."""
    connect_calendar(pg_engine, person, (14, 17, "Workshop"))
    api.post("/checkins", headers=auth(person), json={"energy": "low"})
    first = api.get("/today", headers=auth(person)).json()["capacity"]
    api.post("/checkins", headers=auth(person), json={"perceived_demand": "heavy"})
    second = api.get("/today", headers=auth(person)).json()["capacity"]
    assert "calendar" in first["context"] and "calendar" in second["context"]
    assert second["pathway"] == "hybrid"


def test_what_matters_now_names_a_pushed_priority_and_a_real_open_window(api, person, pg_engine):
    Clock.now = NOW - dt.timedelta(days=4)
    t = api.post("/tasks", headers=auth(person), json={"title": "Gym", "focus_on": str(TODAY - dt.timedelta(days=4)),
                                                       "estimate_minutes": 90}).json()
    Clock.now = NOW
    api.patch(f"/tasks/{t['id']}", headers=auth(person), json={"focus_on": str(TODAY)})
    api.put(f"/tasks/{t['id']}/priority", headers=auth(person))
    connect_calendar(pg_engine, person, (13.5, 14, "Client call"), (16, 16.5, "Call mom"))
    api.post("/checkins", headers=auth(person), json={"energy": "moderate", "perceived_demand": "moderate"})

    wmn = api.get("/today", headers=auth(person)).json()["what_matters_now"]
    assert wmn["kind"] == "deferred_priority" and wmn["task_id"] == t["id"]
    assert wmn["text"] == "Gym has been pushed 4 days. Your 2–4 is open and fits it."
    assert wmn["highlight"] == "4 days" and wmn["worded_by"] == "rules"


def test_protected_time_is_never_offered_as_a_window(api, person, pg_engine):
    t = api.post("/tasks", headers=auth(person), json={"title": "Write"}).json()
    api.put(f"/tasks/{t['id']}/priority", headers=auth(person))
    connect_calendar(pg_engine, person, (13.5, 14, "Call"))
    with pg_engine.begin() as conn:
        conn.execute(text("insert into public.plan_blocks (user_id, kind, starts_at, ends_at) "
                          "values (:u, 'protected', :s, :e)"), {"u": person, "s": local(14), "e": local(21)})
    api.post("/checkins", headers=auth(person), json={"energy": "high", "perceived_demand": "light"})
    wmn = api.get("/today", headers=auth(person)).json()["what_matters_now"]
    assert wmn["kind"] != "priority_window"  # 1:30–2 is the only gap and it's under 30 minutes; 2pm on is protected


def test_no_calendar_means_no_claims_about_free_time(api, person):
    t = api.post("/tasks", headers=auth(person), json={"title": "Write", "focus_on": str(TODAY - dt.timedelta(days=2))}).json()
    api.patch(f"/tasks/{t['id']}", headers=auth(person), json={"focus_on": str(TODAY)})
    api.put(f"/tasks/{t['id']}/priority", headers=auth(person))
    api.post("/checkins", headers=auth(person), json={"energy": "high", "perceived_demand": "light"})
    wmn = api.get("/today", headers=auth(person)).json()["what_matters_now"]
    assert wmn["text"] == "Write has been pushed 2 days. Could today be the day?" and wmn["window"] is None


def test_strained_days_suggest_making_room_not_doing_more(api, person):
    t = api.post("/tasks", headers=auth(person), json={"title": "Deck"}).json()
    api.put(f"/tasks/{t['id']}/priority", headers=auth(person))
    api.post("/checkins", headers=auth(person), json={"energy": "moderate", "perceived_demand": "heavy"})
    body = api.get("/today", headers=auth(person)).json()
    assert body["capacity"]["state"] == "Strained"
    assert body["what_matters_now"]["kind"] == "make_room"


# ── An unconnected calendar is "unknown", never "light" ──────────────────────

LIGHT_WORDS = ("light", "clear", "free", "open", "nothing is scheduled", "calendar")


def test_without_a_calendar_reasons_never_mention_the_calendar_or_a_light_day(api, person):
    api.post("/checkins", headers=auth(person), json={"energy": "high"})        # capacity only
    cap = api.get("/today", headers=auth(person)).json()["capacity"]
    assert cap["status"] == "insufficient_evidence"
    assert cap["context"] == "You said you have good energy. Rhythm doesn't know yet what today asks."
    assert not any(w in cap["context"].lower() for w in LIGHT_WORDS)

    api.post("/tasks", headers=auth(person), json={"title": "Write", "focus_on": str(TODAY), "effort": "light"})
    api.post("/checkins", headers=auth(person), json={"perceived_demand": "moderate"})
    cap = api.get("/today", headers=auth(person)).json()["capacity"]
    assert cap["status"] == "assessed" and "calendar" not in cap["context"] and " light" not in cap["context"]


def test_a_connected_empty_calendar_is_called_clear_not_light(api, person, pg_engine):
    connect_calendar(pg_engine, person)  # connected and fresh, nothing scheduled
    api.post("/checkins", headers=auth(person), json={"energy": "high"})
    cap = api.get("/today", headers=auth(person)).json()["capacity"]
    assert cap["status"] == "insufficient_evidence"  # an empty calendar sets no demand band on its own
    assert cap["context"] == ("You said you have good energy, and nothing is scheduled on your calendar. "
                              "Rhythm doesn't know yet what today asks. An empty calendar doesn't mean today is light.")
