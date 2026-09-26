# Rhythm progress

Working branch: `foundation/m0-m1` (`main` untouched until merge).
Full plan: https://claude.ai/artifact/PUSAAMdbWh549kCepRxRUi

## Status

| Milestone | State |
|---|---|
| M0 — cleanup and guardrails | Done |
| M1 — foundation slice (Supabase, ownership, one recompute path) | Blocked on setup (see below) |
| M2 — capacity engine v2 + check-in | Not started |

## M0 — done

- `rhythm.db` archived read-only to `~/rhythm-archive/rhythm-2026-09-26.db`; original unchanged (SHA-256 verified).
- `.venv-backend/` untracked (kept on disk); `.gitignore` covers `.venv*/`, env files, Supabase local stack, pytest cache.
- Committed secrets removed: `backend/.env.example` holds placeholders only; the ElevenLabs key is read from `ELEVENLABS_API_KEY`.
- `config.py` loads `backend/.env` (priority) then the legacy root `.env`, independent of the working directory.
- Characterization tests (`backend/tests/`) pin current scoring, parser and data-flow behavior. They are guardrails, not a parity requirement.
- Interpretation provider switched from Gemini to OpenAI (see decisions).

Run tests: `.venv/bin/python -m pytest`

### Known bugs recorded as strict `xfail` (M1 should fix)

- Check-in reclassifies with `exposure=None`, ignoring stored calendar load.
- Oura CSV upload overwrites `exposure_score` with `None`.
- Oura API sync overwrites `exposure_score` with `None`.

### Known issues documented, deferred to M2

- Oura API sync reads HRV, resting HR and total sleep from `daily_sleep`, which doesn't return them (they're in the `sleep` endpoint). Only 3 of 113 stored days have HRV.
- CSV parsers leak `NaN` for out-of-range sensor values; `_normalize_hrv(nan)` returns 0.

## M1 — blocked on you

1. Rotate secrets that were in git history: Google OAuth client secret (Calendar), Oura client secret, ElevenLabs key. The old Gemini key is no longer used; delete it.
2. Install Docker Desktop (Supabase CLI 2.111.0 is already installed).
3. Create the Supabase dev project, enable anonymous sign-ins, and check which JWT mode it uses (signing keys vs legacy secret).
4. Fill `backend/.env` from `backend/.env.example`, including a fresh `OPENAI_API_KEY`.
5. Add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to `mobile/.env`.
6. Keep your own independent copy of `rhythm.db` before the data migration step.

## Decisions log

- **2026-09-26** — Rhythm states are relational (capacity × demand); capacity is the concept and health/self-report/profile are evidence. One source-agnostic engine. Two-layer timeline (read-only external calendar + editable `plan_block`); Rhythm never writes to external calendars. Tasks have no status column. Supabase Postgres + Auth replaces Firebase + SQLite; FastAPI remains the only data path. HealthKit v1: sleep, HRV, resting HR (no steps). Dashboard frozen, not deleted.
- **2026-09-26** — Interpretation layer uses the OpenAI API instead of Gemini. `backend/services/interpretation.py` is provider-agnostic: only `_complete_json` is provider-specific. The LLM only phrases derived engine output. Scores are converted to qualitative bands before any prompt is built, so no raw health values or numeric scores are sent. Config: `OPENAI_API_KEY`, optional `INTERPRETATION_MODEL` (default `gpt-4.1-mini`).
