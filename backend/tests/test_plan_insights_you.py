"""You (goals, rhythms, what helps), Plan and Insights against local Supabase."""
import datetime as dt

import pytest
from sqlalchemy import text

from backend.routers.insights import weekday_patterns
from backend.routers.you import pick_reflection
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


def test_reflection_rules_are_fixed_and_say_nothing_without_evidence():
    assert pick_reflection([], [], 0, 0).text is None
    assert pick_reflection([], [], 0, 1).text is None  # one task isn't a reflection
    assert pick_reflection([], [], 0, 3).text == "You finished 3 tasks over the past week."
    assert pick_reflection([], [], 1, 3).text == "You completed one of your priorities over the past week."
    assert pick_reflection([], [("Morning pages", 2)], 2, 5).text == \
        "You made time for Morning pages twice over the past week."
    r = pick_reflection([("Launch", 1), ("Apply to grad school", 1)], [("Morning pages", 4)], 2, 5)
    assert (r.kind, r.text) == ("goal", "You finished 1 task toward “Apply to grad school” over the past week.")


def test_reflection_comes_only_from_linked_records_in_the_past_week(api, person, make_user):
    assert api.get("/you/reflection", headers=auth(person)).json() == {"kind": None, "text": None}
    a = api.post("/tasks", headers=auth(person), json={"title": "Draft essay"}).json()
    api.put(f"/tasks/{a['id']}/priority", headers=auth(person))
    api.patch(f"/tasks/{a['id']}", headers=auth(person), json={"completed": True})
    assert api.get("/you/reflection", headers=auth(person)).json()["kind"] == "priorities"

    goal = api.post("/goals", headers=auth(person), json={"title": "Apply to grad school"}).json()
    b = api.post("/tasks", headers=auth(person), json={"title": "Email advisor", "goal_id": goal["id"]}).json()
    api.patch(f"/tasks/{b['id']}", headers=auth(person), json={"completed": True})
    got = api.get("/you/reflection", headers=auth(person)).json()
    assert got == {"kind": "goal", "text": "You finished 1 task toward “Apply to grad school” over the past week."}
    assert api.get("/you/reflection", headers=auth(make_user())).json()["text"] is None  # private

    Clock.now = NOW + dt.timedelta(days=8)  # a week later, last week's work isn't "this week"
    assert api.get("/you/reflection", headers=auth(person)).json()["text"] is None


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


def test_a_task_block_shows_its_task_title(api, person):
    t = api.post("/tasks", headers=auth(person), json={"title": "Prototype iteration"}).json()
    api.post("/plan/blocks", headers=auth(person), json={
        "kind": "task", "task_id": t["id"], "starts_at": local(14).isoformat(), "ends_at": local(15).isoformat()})
    items = api.get("/plan", headers=auth(person)).json()["items"]
    assert [(i["kind"], i["title"]) for i in items] == [("task", "Prototype iteration")]


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
    assert [d["rhythm"]["state"] if d["rhythm"] else None for d in ins["days"]] == [None] * 6 + ["Overloaded"]
    day = api.get(f"/insights/days/{TODAY}", headers=auth(person)).json()
    assert day["basis"] == "Based on your check-in and connected data"
    assert "Energy: Low" in day["evidence"] and day["calendar"] == "7h scheduled"
    assert day["interpretation"].startswith("You said you have low energy")
    assert [c["energy"] for c in day["checkins"]] == ["low"]
    assert api.get(f"/insights/days/{TODAY - dt.timedelta(days=3)}", headers=auth(person)).status_code == 404


def _reading(pg_engine, uid, day, readiness):
    with pg_engine.begin() as conn:
        conn.execute(text("insert into public.health_daily (user_id, source, local_date, readiness, sleep_minutes) "
                          "values (:u, 'oura', :d, :r, 420)"), {"u": uid, "d": day, "r": readiness})


def test_reading_only_days_never_get_a_rhythm_state(api, person, pg_engine):
    for i, r in enumerate((72, 81, 64)):
        _reading(pg_engine, person, TODAY - dt.timedelta(days=5 - i), r)
    ins = api.get("/insights", headers=auth(person), params={"start": str(TODAY - dt.timedelta(days=6)),
                                                              "end": str(TODAY + dt.timedelta(days=2))}).json()
    by = {d["date"]: d for d in ins["days"]}
    assert len(ins["days"]) == 9
    d = by[str(TODAY - dt.timedelta(days=5))]
    assert d["rhythm"] is None and d["reading"]["readiness"] == 72 and d["reading"]["source"] == "oura"
    b = ins["breakdown"]
    assert b["days_so_far"] == 7 and b["assessed_days"] == 0 and b["reading_only_days"] == 3 and b["no_data_days"] == 4
    assert b["summary"].startswith("No day in this range had enough evidence for a Rhythm state yet. 3 days had Oura")
    detail = api.get(f"/insights/days/{TODAY - dt.timedelta(days=5)}", headers=auth(person)).json()
    assert detail["rhythm"] is None and detail["reading"]["readiness"] == 72 and detail["checkins"] == []


def test_past_days_are_assessed_only_from_their_own_evidence(api, person, pg_engine):
    yesterday = TODAY - dt.timedelta(days=1)
    _reading(pg_engine, person, yesterday, 85)
    with pg_engine.begin() as conn:  # a check-in recorded yesterday evening (local)
        conn.execute(text("insert into public.checkins (user_id, local_date, recorded_at, energy, perceived_demand) "
                          "values (:u, :d, :t, 'high', 'light')"),
                     {"u": person, "d": yesterday, "t": local(20, yesterday)})
    ins = api.get("/insights", headers=auth(person), params={"start": str(yesterday), "end": str(yesterday)}).json()
    [d] = ins["days"]
    assert d["rhythm"]["status"] == "assessed" and d["rhythm"]["state"] == "Aligned" and d["rhythm"]["pathway"] == "hybrid"  # check-in + that day's Oura reading
    assert ins["breakdown"]["states"] == [{"state": "Aligned", "days": 1}]
    assert ins["breakdown"]["summary"].startswith(
        "Rhythm has assessed 1 day in this range so far (1 Aligned). That's too few to read a pattern yet.")
    # a stored assessment is never rewritten by history
    with pg_engine.begin() as conn:
        conn.execute(text("update public.daily_assessments set state = 'Balanced' where user_id = :u and local_date = :d"),
                     {"u": person, "d": yesterday})
    again = api.get("/insights", headers=auth(person), params={"start": str(yesterday), "end": str(yesterday)}).json()
    assert again["days"][0]["rhythm"]["state"] == "Balanced"


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


# ── Editing, protected time and tags on plan blocks (0003) ────────────────────

def test_blocks_take_your_own_tags_and_can_be_fully_edited(api, person, make_user):
    other = make_user()
    mine = api.post("/areas", headers=auth(person), json={"name": "Health", "color_family": "seafoam"}).json()
    theirs = api.post("/areas", headers=auth(other), json={"name": "X", "color_family": "sky"}).json()
    body = {"kind": "event", "title": "Gym", "starts_at": local(14).isoformat(), "ends_at": local(15).isoformat()}
    assert api.post("/plan/blocks", headers=auth(person), json={**body, "area_id": theirs["id"]}).status_code == 422
    b = api.post("/plan/blocks", headers=auth(person), json={**body, "area_id": mine["id"]}).json()
    assert b["area_id"] == mine["id"]

    tomorrow = TODAY + dt.timedelta(days=1)
    start = dt.datetime.combine(tomorrow, dt.time(7, 30), tzinfo=NOW.tzinfo)
    edited = api.patch(f"/plan/blocks/{b['id']}", headers=auth(person), json={
        "title": "Morning gym", "starts_at": start.isoformat(), "ends_at": (start + dt.timedelta(minutes=75)).isoformat(),
        "area_id": None}).json()
    assert edited["title"] == "Morning gym" and edited["area_id"] is None
    assert edited["starts_at"].startswith(str(tomorrow)) and edited["ends_at"].startswith(str(tomorrow))

    protected = api.patch(f"/plan/blocks/{b['id']}", headers=auth(person), json={"kind": "protected", "title": None})
    assert protected.status_code == 200 and protected.json()["kind"] == "protected"
    # back to an event without a title is refused (an event needs a name)
    assert api.patch(f"/plan/blocks/{b['id']}", headers=auth(person), json={"kind": "event"}).status_code == 422
    # times must still make sense
    assert api.patch(f"/plan/blocks/{b['id']}", headers=auth(person), json={
        "starts_at": start.isoformat(), "ends_at": start.isoformat()}).status_code == 422


def test_protected_time_can_be_created_with_a_tag_and_counts_toward_where_time_went(api, person):
    rest = api.post("/areas", headers=auth(person), json={"name": "Rest", "color_family": "lilac"}).json()
    made = api.post("/plan/blocks", headers=auth(person), json={
        "kind": "protected", "area_id": rest["id"], "starts_at": local(18).isoformat(), "ends_at": local(20).isoformat()})
    assert made.status_code == 201 and made.json()["title"] is None
    ins = api.get("/insights", headers=auth(person), params={"start": str(TODAY), "end": str(TODAY)}).json()
    assert ins["where_time_went"] == [{"area_id": rest["id"], "name": "Rest", "color_family": "lilac", "minutes": 120}]


def test_breakdown_summary_is_honest_about_ties_and_small_samples():
    from collections import Counter

    from backend.routers.insights import summarize
    assert summarize(Counter({"Overloaded": 1, "Balanced": 1}), 2, 0, 22, "oura").startswith(
        "Rhythm has assessed 2 days in this range so far (1 Overloaded, 1 Balanced). That's too few")
    assert summarize(Counter({"Balanced": 3, "Strained": 3}), 6, 0, 0, "oura") == \
        "Your 6 assessed days were split evenly between Balanced and Strained, 3 each."
    assert summarize(Counter({"Balanced": 4, "Strained": 2}), 6, 1, 3, "oura").startswith(
        "Balanced was your most frequent state, on 4 of 6 assessed days. On those days, what you had to give")
