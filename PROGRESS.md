# Rhythm progress

Working branch: `foundation/m0-m1` (`main` untouched until merge).
Original plan (2026-09-26): https://claude.ai/artifact/PUSAAMdbWh549kCepRxRUi. Where it conflicts with the 2026-10-10 decisions below, this file wins.

## Roadmap

The technical foundation is not the product MVP. Every product capability below stays in scope; the foundation reserves the schema hooks they need.

| Tier | Contents |
|---|---|
| **Technical foundation** | F0 backups and prerequisites · F1 capacity engine v2 (pure) · F2 identity and persistence (Supabase Auth: Apple + email, Postgres, `/me`, deletion) · F3 inputs and one pipeline (tasks, check-ins, health, calendar intake, `recompute_day`, `GET /today`, OpenAI with fallback) · F4 SQLite migration · F5 mobile auth and headless data layer, Firebase removed · F6 integration adapters (Oura per user, Google Calendar dormant, EventKit intake) |
| **Functional product MVP** | Onboarding (account required; no preview mode), Today, Plan (Day + Week, capacity-aware planning), Tasks, Insights, You, check-ins, goals, habits, routines, commitments, EventKit, Oura, HealthKit, connected web dashboard (existing dashboard kept as reference; UI replaced incrementally). |
| **TestFlight** | Hosted FastAPI (staging + prod), Supabase Pro, custom SMTP, account deletion incl. Apple token revocation, privacy policy and App Privacy labels, error reporting, rate limits, data export |
| **Public release** | App Review, terms, data-request process, monitoring, accessibility, web dashboard GA, Google Calendar restored if still wanted |

## Status

| Milestone | State |
|---|---|
| M0 — cleanup and guardrails | Done |
| F0 — backups and prerequisites | Local work done; remaining items need approval or your action (below) |
| F1 — capacity engine v2, isolated | Done: `backend/engine/`, 162 tests, not wired to any endpoint or screen |
| F2 — identity and persistence | Stage 1 done and verified on the hosted project (2026-10-10): migration `0001` applied; structural and behavioral (19/19) verification passed. Stage 2 not started. |
| P0 — mobile design system and navigation shell | Done and approved 2026-10-11 (Today design approved; other tabs are labelled shells on mock data) |
| F3 — inputs and one pipeline | Done locally 2026-10-11 (uncommitted): migration 0002, engine 2.1 (rested), /tasks, /areas, /checkins, recompute_day, GET /today, recommendations with OpenAI safeguards. 422 backend tests. |
| F5 — mobile auth and data layer | Partly done 2026-10-11: email-code sign-in, Keychain session, access gate, Today/Settings/onboarding basics on real data. Firebase code still on disk (unused). |
| F6 — integration adapters | Built, not yet tested on a device: Oura per user (needs secret rotation + redirect registration), Apple Calendar (Expo Go), Apple Health (needs a development build). |

## P0 — mobile design system and navigation shell

Source of truth: `Rhythm product mockups (1).html` (iOS boards first). Done 2026-10-11, local only:
- `mobile/src/design/`: tokens (colors, six display states, eight tag pastels, spacing, radius), type roles (Source Serif 4 + DM Sans), SVG icons, components (Text, Card, DarkCallout, Eyebrow, SectionHeader, Button, TextField, StateBadge, TagChip, ConnectionRow, Check, ChecklistRow, OptionRow, CollapsedQuestionRow, ScaleSelector, SegmentedControl, PastelPicker, ToggleRow, FAB, BottomSheet, Screen, ScreenHeader, TabBar).
- Accessibility: mockup sizes mapped up ~1.15x (11pt floor), Dynamic Type with per-role caps, 44pt targets, VoiceOver roles and labels, Reduce Motion respected in sheets. Contrast fixes: amber text `#9C6524` (fills keep `#B8772A`), Clay tag text `#865733`, Honey `#7B601B`, text on ink at 62% opacity.
- `mobile/app/` (expo-router): tabs Today / Plan / Tasks / Insights / You; Settings, onboarding frame and a component gallery (`/design`) as stack routes. Today is composed on mock data; other tabs are labelled shells. No auth gate and no backend calls yet (F5).
- Expo upgraded SDK 54 → 57 (2026-10-11) so the App Store Expo Go can run it: React Native 0.86.3, React 19.2.3, expo-router 57, TypeScript 6. Fixes: tab bar types now from `expo-router/tabs` (React Navigation is bundled inside expo-router), `StyleSheet.absoluteFillObject` → `absoluteFill`, `app.json` drops `newArchEnabled`/`edgeToEdgeEnabled` and moves the splash into the `expo-splash-screen` plugin. `expo-doctor` 21/21. Only the six used font weights are bundled. Tiempos trial font no longer bundled; `App.tsx`/`index.ts` removed (entry is `expo-router/entry`); legacy `src/screens/` kept for reference until F5. Break tab removed (no data touched).
- Review round 1 (2026-10-11): Today gets 24pt between sections; capacity card: "How you're doing" eyebrow with the state pill at its right (no source label), then one context sentence built only from evidence that exists (`mobile/src/today/capacityContext.ts`: sleep, check-in, synced calendar; the person's report is kept when it disagrees with sleep; nothing is shown with no evidence); the dark "What matters now" card follows it; schedule previews only the next 2 events (time, title, optional tag) with "View full day" opening Plan; The recommendation only shows while its task is open and its window is still ahead today. Tab bar is icon-only (labels kept for VoiceOver, 48pt targets). Mock Today runs at a fixed 1:15 PM so the review is stable at any hour.
- Verified: `tsc` clean, iOS bundle export succeeds, runs in Expo Go (SDK 57) on the iOS 26.3 simulator; reviewed on the simulator and approved.

Run tests: `.venv/bin/python -m pytest` (Postgres tests need `supabase start`; they skip otherwise). Setup and access rules: `docs/supabase-foundation.md`.

## F3/F5/F6 — data foundation (2026-10-11, local only, uncommitted)

Backend
- Migration `0002` (applied locally only; round-trip downgrade/upgrade verified): `checkins.rested`; profile `onboarding_answers`, `preferred_health_source`, `ai_task_titles_consented_at`; task deferral history kept by a trigger (`first_focus_on`, `times_deferred`; clients can't write them); `protected` and one-off `event` plan blocks; protected recurring items + `cadence_note`; `calendar_settings` and `event_overrides` (per-calendar default tag, per-event "counts / doesn't count"); `what_helps`; backend-only `llm_usage` ledger; `interpretations.purpose` / `includes_task_titles`.
- Engine 2.1.0: "How rested" is its own self-report evidence. With energy, the reported band is the midpoint; a one-band tie goes to energy. Recorded in `ASSUMPTIONS`.
- `backend/pipeline/`: `recompute_day` rebuilds each day from all evidence (the v1 overwrite bugs can't occur there); "How you're doing" sentence from used evidence only (`context.py`); open windows (only with a fresh calendar; 8am–9pm, ≥30 min, protected time excluded); "What matters now" rules (`recommend.py`); optional OpenAI rewording (`llm.py`).
- Endpoints: `GET /today`, `/tasks` (+ `PUT/DELETE /tasks/{id}/priority`, Top 3 incl. completed), `/areas`, `/checkins`, `/connections` (Oura OAuth/sync/disconnect; Apple Health daily summaries; Apple Calendar busy blocks), `/me` new fields.
- OpenAI safeguards: rules always produce the sentence; the model only rephrases it; output validated (no new numbers, window kept, length, no clinical words); task titles only with consent (else "this task"); calendar titles, notes, health numbers and identity never sent; cached per recommendation; $20/month ceiling across users + per-person daily cap enforced from the ledger before calling; 6 s timeout, no retries. Live eval: `backend/scripts/eval_recommendations.py --yes` (spends money; not run).
- Oura: tokens Fernet-encrypted; signed 10-minute OAuth state; scope `daily` only; HRV/RHR/sleep from `sleep` periods (fixes the `daily_sleep` issue); single-use refresh tokens saved first; 30-day backfill, then incremental.
- Guardrail tests extended: every privileged SQL statement is checked for a user filter (parsed via AST); the global budget total is the one documented exception.

Mobile
- Supabase email 6-digit code sign-in, session in the Keychain (chunked), access gate (signed out → sign-in; not onboarded → onboarding; else app), `/me` time zone kept in sync with the phone.
- Today on `GET /today` with the approved design; check-in sheet; Top 3 edits; schedule titles resolved on the device.
- Settings: live connection states, Oura via auth session, Apple Calendar and Apple Health connect/sync, tags on `/areas`, sign out.
- `app.json`: read-only Health (no write, no background delivery), calendar read only, no Reminders, no Face ID; `expo-dev-client`; `eas.json` profiles. `scripts/dev-local.sh` runs everything against local services (writes git-ignored `mobile/.env.local` and `backend/.env.local`).
- Verified: real local sign-in → `/me` → check-in → task → Top 3 → `/today` over HTTP with a Supabase-issued token; app bundles and opens on the sign-in screen in the simulator.

Still mocked or not built: Plan, Tasks, Insights and You screens (shells); onboarding steps 2–5 and 8; check-in reminder (toggle only); full account deletion; the AI task-title disclosure screen (titles are not sent until it exists).

Blockers before real-world testing
1. Rotate the Oura client secret (exposed in git history) and register `…/connections/oura/callback` in the Oura developer app; Oura apps are limited to 10 users until Oura approves them.
2. Apple Health needs a development build with the HealthKit entitlement: Apple Developer Program membership.
3. Set OpenAI prices in config to the model's current published rates (defaults are deliberately high).

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
6. Prerequisites still open: Apple Developer Program membership (Sign in with Apple, EAS builds). Done: Docker Desktop, existing Supabase project audited, `backend/.env` filled, dependencies declared.

## F2 — identity and persistence

Stage 1 (2026-10-10) — complete; built and tested on local Supabase, then applied and verified on the hosted project:
- `backend/requirements.txt` adds psycopg, Alembic, PyJWT (existing pins unchanged).
- Alembic `0001` (`backend/migrations/`): profiles, areas, goals, tasks (Top 3 via `priority_rank`), recurring items (habits, routines, commitments; effects default to `unknown`), practice logs, plan blocks, check-ins, connections, health_daily, external events, daily assessments, interpretations. RLS on every table, nothing for `anon`, explicit per-table client privileges, composite same-owner foreign keys. Refuses to overwrite existing objects; refuses non-local hosts without `-x allow_remote=true`.
- `backend/auth.py`: Supabase JWT verification (JWKS signing keys; legacy HS256 only if configured), anonymous and non-`authenticated` tokens rejected.
- `backend/db/`: explicit user filters plus `user_scope()` (RLS applies to backend queries too); `delete_user_data` (data only, not account deletion).
- `GET/PATCH /me`, `DELETE /me/data?confirm=true`.
- `LEGACY_DATABASE_URL` (SQLite, legacy endpoints) split from `DATABASE_URL` (Supabase); the backend starts again with the current `.env`.
- `supabase/`: local config (email 6-digit code, Apple prepared but off, no anonymous sign-ins), sign-in code template, read-only audit query for the hosted project.
- `backend/scripts/plan_sqlite_migration.py`: read-only dry run (108 Oura days, 5 legacy check-ins; 5 sleep-score-only days skipped).

Hosted Rhythm project (`tiljxtrvtyaycdorccvs`, Postgres 17.6):
- 25-check catalog-only audit: 24 CLEAR, 1 REVIEW (#13: `postgres` has TRIGGER on `auth.users` but isn't owner).
- Read-only preflight (`backend/scripts/preflight_hosted.py`, read-only session and 15s timeout verified first): 13/13 PASS.
- Migration runner made fully atomic (schema, version table and migrations in one transaction); rollback proven by `test_migration_rollback.py` (missing TRIGGER or REFERENCES leaves nothing behind).
- Committed as `b3f1e6e`, then `0001` applied with explicit approval. Read-only inventory: version `0001`, 13 tables with RLS, 33 policies, no anon privileges, `connections` without client access, both `rhythm_private` functions, `rhythm_on_auth_user_created` enabled, 8 `updated_at` triggers, 0 rows.
- `supabase/verify_after_0001.sql` passed; `supabase/verify_behavior_after_0001.sql`: RHYTHM VERIFY PASSED, 19 of 19 checks, rolled back.
- No historical data migrated; hosted Auth settings (email template, redirect URLs, providers) not changed yet.

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
- **2026-10-10** — Product: existing dashboard preserved as reference, UI replaced incrementally; goals, habits and routines are in the functional MVP; accounts-first (Apple + email code) with optional preview.
- **2026-10-10** — Supabase is the primary auth and persistence layer for mobile and web; FastAPI owns the engine, interpretations and secure integration operations. Restrictive RLS with an explicit client/backend access matrix; backend authorization never relies on RLS alone. Data deletion foundation is distinct from full account deletion. Use the existing Rhythm Supabase project (no new project); hosted changes need approval.
- **2026-10-11** — Design: the latest HTML mockups are the source of truth (iOS first). Source Serif 4 + DM Sans. "What matters now" stays, with real context-aware recommendations. "How rested" is a separate signal from energy. Top 3 priorities. Uncertain and insufficient-evidence states both supported. Protected time, per-calendar default tags and Plan Month are in. Break tab removed (data kept). Text accessibility improved while preserving the designs. Account deletion before external TestFlight. (Preview mode: superseded the same day, see below.)
- **2026-10-11** — Technical: Oura, Apple Health, both or neither; the user picks a preferred source (Oura suggested when connected). Oura API backfill first; archived data preserved but not imported yet. Render proposed for staging (not deployed). Relevant task titles may go to OpenAI with disclosure; calendar titles excluded by default; health data minimized. Conservative calendar-demand scoring with user-adjustable event treatments. OpenAI budget target $20/month with enforced backend limits. Email auth is enough for the initial beta.
- **2026-10-11** — Approval scope: local-only work approved (P0, health normalization, engine improvements, local migration 0002, per-user Oura OAuth/sync, Apple Health and Calendar, backend OpenAI recommendations and evals, Expo/EAS config). Not approved without asking: hosted service changes, remote migrations, deploys, credential rotation, historical imports. Before real Oura connections: flag the exposed Oura secret for rotation and verify developer-app user limits for external testers. Real integrations are tested on a physical iPhone; scoring is evaluated against real data. P0 is reviewed before full screen implementation.
- **2026-10-11** — No preview, guest or demo mode. Everyone signs in with email and completes onboarding before using Rhythm. The welcome screen has one action, "Continue with email". Supersedes the 2026-10-10 "optional on-device preview".
- **2026-10-11** — Today's two cards have distinct jobs: "How you're doing" explains why capacity looks the way it does (evidence only: health, check-in, calendar); "What matters now" says what to do about it. The context sentence will come from the backend in F3; the mobile version mirrors that contract.
- **2026-10-11** — Calendar privacy: Apple Calendar event titles never leave the phone; the server stores busy blocks with hashed calendar IDs. Rested + energy combine at the midpoint (ties to energy), provisional. Oura resting HR = the main sleep's lowest heart rate.
