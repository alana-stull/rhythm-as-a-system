# Rhythm progress

Working branch: `foundation/m0-m1` (`main` untouched until merge).
Original plan (2026-09-26): https://claude.ai/artifact/PUSAAMdbWh549kCepRxRUi. Where it conflicts with the 2026-10-10 decisions below, this file wins.

## Roadmap

The technical foundation is not the product MVP. Every product capability below stays in scope; the foundation reserves the schema hooks they need.

| Tier | Contents |
|---|---|
| **Technical foundation** | F0 backups and prerequisites · F1 capacity engine v2 (pure) · F2 identity and persistence (Supabase Auth: Apple + email, Postgres, `/me`, deletion) · F3 inputs and one pipeline (tasks, check-ins, health, calendar intake, `recompute_day`, `GET /today`, OpenAI with fallback) · F4 SQLite migration · F5 mobile auth and headless data layer, Firebase removed · F6 integration adapters (Oura per user, Google Calendar dormant, EventKit intake) |
| **Functional product MVP** | Onboarding (account or on-device preview), Today, Plan (Day + Week, capacity-aware planning), Tasks, Insights, You, check-ins, EventKit, Oura, HealthKit, goals, habits, routines, commitments, connected web dashboard. Scope split between MVP and pre-public is still to be decided. |
| **TestFlight** | Hosted FastAPI (staging + prod), Supabase Pro, custom SMTP, account deletion incl. Apple token revocation, privacy policy and App Privacy labels, error reporting, rate limits, data export |
| **Public release** | App Review, terms, data-request process, monitoring, accessibility, web dashboard GA, Google Calendar restored if still wanted |

## Status

| Milestone | State |
|---|---|
| M0 — cleanup and guardrails | Done |
| F0 — backups and prerequisites | Local work done; remaining items need approval or your action (below) |
| F1 — capacity engine v2, isolated | Done: `backend/engine/`, 162 tests, not wired to any endpoint or screen |
| F2 — identity and persistence | Not started; blocked on setup (below) |

Run tests: `.venv/bin/python -m pytest`

## F0 — backups and prerequisites

Done (2026-10-10):
- `~/rhythm-archive/` restricted to owner (`700`); archive DB and env backups `600`. Repo `rhythm.db`, root `.env`, `backend/.env`, `mobile/.env` set to `600`.
- Archive verified: logically identical to live `rhythm.db` (`.dump` SHA-256 match; file hashes differ between equal copies, so compare dumps). Live DB unchanged since 2026-04-21.
- `~/rhythm-archive/2026-10-10/`: credential-free working copy (token rows removed, VACUUMed, verified no token bytes remain), Oura history CSV (113 days), `MANIFEST.json` with checksums and row counts.

Needs your approval or action:
1. Firebase backup: export Firebase Auth users and Firestore `users/**` (needs project credentials; external API call), and check Firestore security rules. Discard test-only records afterwards only once confirmed.
2. Raw Oura history re-pull (`daily_readiness`, `daily_sleep`, `sleep`) to the archive (external API call; stored token is from April and may need reconnecting).
3. An independent off-disk copy of `~/rhythm-archive/` (encrypted volume or encrypted external drive).
4. Rotate secrets that were in git history: Google OAuth client secret, Oura client secret, ElevenLabs key; delete the old Gemini key (still in root `.env` as `GOOGLE_API_KEY`).
5. After rotation: delete `~/rhythm-archive/backend.env.before-secrets` and the legacy root `.env` (both hold old plaintext secrets).
6. Prerequisites for F2: Docker Desktop, Apple Developer Program membership, Supabase dev project (check JWT mode: signing keys vs legacy secret), fill `backend/.env`. Backend dependencies must be declared (`requirements.txt`) before any hosting.

## F1 — capacity engine v2 (done, isolated)

`backend/engine/` is pure: stdlib only, never reads the clock, and nothing in `backend/main.py`, `routers/` or `services/` imports it (enforced by `test_engine_isolation.py`).

- `assess_day(DayInputs, thresholds) → Assessment`: capacity and demand, each with band, confidence, basis and evidence; one of three outcomes: `assessed` (one relational state: Aligned, Balanced, Strained, Overloaded), `uncertain` (evidence fits more than one state; `possible_states` lists them, lighter → heavier) or `insufficient_evidence`; pathway (self-reported, connected, hybrid, none); next actions.
- Evidence kinds stay distinct: wearable measurement, self-report, calendar demand, task demand. Each piece carries source, method, date, record IDs and a used/unused reason (stale, no baseline, superseded).
- A wearable readiness score is evidence (`wearable_band`), never capacity. There is no numeric capacity.
- Real quantities are kept (`"5h scheduled"`, `"3 tasks for today (1 deep) · 30 min estimated · 1 without an effort level"`, `"Oura readiness 82"`). Nothing is filled in: no default minutes, no assumed effort, no points for unknown effort, no 50s, no population baselines.
- Disagreements are kept and stated. Capacity follows the person's report (connected evidence preserved). Demand never picks a side: it becomes a range, and if the range spans more than one state the outcome is `uncertain`. An estimate with no effort level is also a range (light to deep weight) until the person settles it.
- An empty, freshly synced calendar is evidence of no scheduled events, not of a light day. Overdue tasks count only once rescheduled or focused on today.
- `thresholds.py`: provisional, versioned thresholds plus a written list of assumptions. Refine with `dataclasses.replace` and bump the version.
- `explain.py`: interpretation context v2 (wearable data qualitative only; no free text exists in the engine) and deterministic fallback guidance for every outcome. The existing OpenAI implementation is unchanged; wiring happens in F3.

### Known bugs recorded as strict `xfail` (fixed by `recompute_day` in F3)

- Check-in reclassifies with `exposure=None`, ignoring stored calendar load.
- Oura CSV upload overwrites `exposure_score` with `None`.
- Oura API sync overwrites `exposure_score` with `None`.

### Known issues for F3/F6

- Oura API sync reads HRV, resting HR and total sleep from `daily_sleep`, which doesn't return them (they're in the `sleep` endpoint). Only 3 of 113 stored days have HRV.
- CSV parsers leak `NaN` for out-of-range values (the engine treats NaN as missing).
- Mobile and dashboard compute Exposure as `40 + task effort` and PATCH it back; removed with the F5 client swap.

## Decisions log

- **2026-09-26** — Rhythm states are relational (capacity × demand); capacity is the concept and health/self-report/profile are evidence. One source-agnostic engine. Two-layer timeline (read-only external calendar + editable `plan_block`); Rhythm never writes to external calendars. Tasks have no status column. Supabase Postgres + Auth replaces Firebase + SQLite; FastAPI remains the only data path. HealthKit v1: sleep, HRV, resting HR (no steps). Dashboard frozen, not deleted.
- **2026-09-26** — Interpretation layer uses the OpenAI API instead of Gemini. `backend/services/interpretation.py` is provider-agnostic: only `_complete_json` is provider-specific. The LLM only phrases derived engine output. Config: `OPENAI_API_KEY`, optional `INTERPRETATION_MODEL` (default `gpt-4.1-mini`).
- **2026-10-10** — Auth: accounts-first with Sign in with Apple and email (6-digit code), plus an optional on-device preview that writes nothing to the server. Replaces anonymous-first.
- **2026-10-10** — Check-ins: five-point labeled scales for energy (capacity evidence) and perceived demand (demand evidence); stress is an optional context tag. Multiple check-ins per day; each signal uses the latest check-in that answered it; all are kept with timestamps. The 1-10 friction slider is retired as an engine input (legacy rows kept).
- **2026-10-10** — `insufficient_evidence` is a separate outcome, never Balanced. UI language along the lines of "Still getting to know your day" plus a concrete next action.
- **2026-10-10** — Tasks: minimal server-side tasks move into the foundation. No effort-based default durations; unestimated tasks count as effort points, never minutes.
- **2026-10-10** — Demand thresholds are provisional, versioned and tested. Self-report-only confidence is capped at medium; confidence and evidence are available to the UI, but the UI need not show a confidence indicator.
- **2026-10-10** — The four states keep their names and color families (Aligned green, Balanced blue, Strained amber, Overloaded burgundy); exact shades belong to the redesign.
- **2026-10-10** — Numbers from real evidence are allowed (task counts, scheduled minutes, a labelled readiness value); invented or filled-in values are not.
- **2026-10-10** — EventKit: privacy-first, minimal collection. Google Calendar code stays dormant (Cloud project suspended). OpenAI implementation kept; context contract improved; deterministic fallback added.
- **2026-10-10** — Web dashboard is part of the product vision (reverses "remove later"); whether to evolve `dashboard/` or rebuild is open.
- **2026-10-10** — Engine clarifications: latest valid answer per check-in question, all history kept. Capacity disagreement follows the person and keeps the connected evidence. Demand disagreement is represented as uncertainty (a range and possible states), never a conservative state presented as definitive. Tasks without estimate or effort stay visible but get no point value or assumed effort. An empty calendar doesn't imply no demands. Overdue tasks count only when rescheduled or planned for today. Check-in labels and guidance text are placeholders for the redesign. Task counts and scheduled time may reach the interpretation layer; notes and task titles are excluded by default.
- **2026-10-10** — Definitions: *Goals* are longer-term outcomes that connect to tasks. *Habits* are repeatable behaviors without streak-driven pressure. *Routines* structure the day and may occupy calendar time. *Commitments* are scheduled obligations or non-negotiables. None is automatically a capacity benefit or added demand; their effect depends on actual scheduling and context, and scheduled time is merged with calendar time so nothing is double-counted. They connect to Plan and Today; management screens may live under You.
