"""You (goals, rhythms, what helps), Plan and Insights against local Supabase."""
import datetime as dt

import pytest
from sqlalchemy import text

from backend.routers.insights import weekday_patterns
from backend.tests.pg_support import make_user, pg_engine  # noqa: F401
from backend.tests.test_today_api import NOW, TODAY, Clock, api, auth, connect_calendar, local, person  # noqa: F401

pytestmark = pytest.mark.postgres


# ── You ───────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("path,create,patch", [
    ("/goals", {"title": " Launch Rhythm v1 ", "notes": "Ship onboarding."}, {"notes": "Advisor meeting Nov 3."}),
    ("/rhythms", {"title": "Morning pages", "cadence_note": "Every day"}, {"cadence_note": "Weekdays"}),
    ("/what-helps", {"text": "A walk after lunch"}, {"text": "A short walk after lunch"}),
])
def test_you_records_are_private_crud(api, person, make_user, path, create, patch):
    other = make_user()
    made = api.post(path, headers=auth(person), json=create)
    assert made.status_code == 201, made.text
    rid = made.json()["id"]
    assert all(v.strip() in str(made.json().values()) for v in create.values())
    assert api.get(path, headers=auth(other)).json() == []
    assert api.patch(f"{path}/{rid}", headers=auth(other), json=patch).status_code == 404
    updated = api.patch(f"{path}/{rid}", headers=auth(person), json=patch)
    assert updated.status_code == 200 and list(patch.values())[0] in str(updated.json().values())
    assert api.delete(f"{path}/{rid}", headers=auth(person)).status_code == 204
    assert api.get(path, headers=auth(person)).json() == []


@pytest.mark.parametrize("path,body", [("/goals", {"title": "  "}), ("/rhythms", {"title": "x", "kind": "protected"}),
                                       ("/what-helps", {"text": ""}), ("/goals", {"title": "x", "user_id": "y"})])
def test_you_records_validate(api, person, path, body):
    assert api.post(path, headers=auth(person), json=body).status_code == 422


# ── Plan ──────────────────────────────────────────────────────────────────────

def test_plan_day_has_both_layers_tasks_and_todays_windows(api, person, pg_engine):
    connect_calendar(pg_engine, person, (9, 10, "Sync"), (15, 16, "Call"))
    made = api.post("/plan/blocks", headers=auth(person), json={
        "kind": "event", "title": "Dentist", "starts_at": local(17).isoformat(), "ends_at": local(18).isoformat()})
    assert made.status_code == 201, made.text
    api.post("/plan/blocks", headers=auth(person), json={
        "kind": "protected", "starts_at": local(18).isoformat(), "ends_at": local(21).isoformat()})
    api.post("/tasks", headers=auth(person), json={"title": "Reading response", "due_on": str(TODAY)})

    plan = api.get("/plan", headers=auth(person)).json()
    kinds = [(i["kind"], i["editable"]) for i in plan["items"]]
    assert kinds == [("calendar", False), ("calendar", False), ("event", True), ("protected", True)]
    assert [t["title"] for t in plan["tasks"]] == ["Reading response"]
    windows = [(w["starts_at"], w["ends_at"]) for w in plan["open_windows"]]
    assert len(windows) == 2  # 1:15–3 and 4–5; protected 6–9 and the evening are never offered
    assert plan["days"] == [{"date": str(TODAY), "status": "insufficient_evidence", "state": None}]


def test_plan_blocks_move_and_validate(api, person):
    b = api.post("/plan/blocks", headers=auth(person), json={
        "kind": "event", "title": "Gym", "starts_at": local(14).isoformat(), "ends_at": local(15).isoformat()}).json()
    moved = api.patch(f"/plan/blocks/{b['id']}", headers=auth(person), json={
        "starts_at": local(14.5).isoformat(), "ends_at": local(15.5).isoformat()})
    assert moved.status_code == 200 and moved.json()["starts_at"].startswith(f"{TODAY}T")
    for bad in ({"kind": "event", "starts_at": local(14).isoformat(), "ends_at": local(15).isoformat()},   # no title
                {"kind": "event", "title": "x", "starts_at": local(15).isoformat(), "ends_at": local(14).isoformat()},
                {"kind": "task", "starts_at": local(14).isoformat(), "ends_at": local(15).isoformat()}):
        assert api.post("/plan/blocks", headers=auth(person), json=bad).status_code == 422


def test_plan_week_and_month_carry_day_states(api, person):
    api.post("/checkins", headers=auth(person), json={"energy": "moderate", "perceived_demand": "heavy"})
    api.get("/today", headers=auth(person))
    week = api.get("/plan", headers=auth(person), params={"start": str(TODAY - dt.timedelta(days=1)), "days": 7}).json()
    assert len(week["days"]) == 7
    assert week["days"][1] == {"date": str(TODAY), "status": "assessed", "state": "Strained"}
    assert week["days"][0]["state"] is None  # never read: shown as no data, never guessed


# ── Insights ──────────────────────────────────────────────────────────────────

def test_insights_days_detail_and_reasons(api, person, pg_engine):
    connect_calendar(pg_engine, person, (9, 16, "Workshop"))  # heavy, agreeing with the check-in
    api.post("/checkins", headers=auth(person), json={"energy": "low", "perceived_demand": "heavy"})
    api.get("/today", headers=auth(person))
    ins = api.get("/insights", headers=auth(person), params={"start": str(TODAY - dt.timedelta(days=6)),
                                                              "end": str(TODAY)}).json()
    assert [d["state"] for d in ins["days"]] == ["Overloaded"]
    day = api.get(f"/insights/days/{TODAY}", headers=auth(person)).json()
    assert day["basis"] == "Based on your check-in and connected data"
    assert "Energy: Low" in day["evidence"] and "7h scheduled" in day["evidence"]
    assert day["interpretation"].startswith("You said you have low energy")
    assert api.get(f"/insights/days/{TODAY - dt.timedelta(days=3)}", headers=auth(person)).status_code == 404


def test_where_time_went_uses_calendar_tags(api, person, pg_engine):
    work = api.post("/areas", headers=auth(person), json={"name": "Work", "color_family": "sky"}).json()
    connect_calendar(pg_engine, person, (9, 11, "Sync"))
    with pg_engine.begin() as conn:
        conn.execute(text("insert into public.calendar_settings (user_id, source, calendar_ref, default_area_id) "
                          "values (:u, 'apple_calendar', 'cal-1', :a)"), {"u": person, "a": work["id"]})
    ins = api.get("/insights", headers=auth(person), params={"start": str(TODAY), "end": str(TODAY)}).json()
    assert ins["where_time_went"] == [{"area_id": work["id"], "name": "Work", "color_family": "sky", "minutes": 120}]


def test_weekday_pattern_needs_three_of_the_last_four():
    wed = dt.date(2026, 10, 7)
    rows = [{"local_date": wed - dt.timedelta(weeks=i), "status": "assessed", "state": s}
            for i, s in enumerate(["Strained", "Overloaded", "Balanced", "Strained", "Strained"])]
    assert [p.title for p in weekday_patterns(rows, wed)] == ["Strain clusters on Wednesdays"]
    rows[0]["state"] = "Aligned"
    assert weekday_patterns(rows, wed) == []
