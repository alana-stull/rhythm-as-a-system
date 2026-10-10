# Supabase foundation (F2)

How Rhythm's authentication and user-owned data work, how to run them
locally, and what has to happen before the hosted Rhythm project is used.

## Responsibilities

| Layer | Owns |
|---|---|
| Supabase Auth | Accounts: email 6-digit code, Sign in with Apple (when configured). No anonymous sign-ins. |
| Supabase Postgres | All user-owned data. Clients may read and write some tables directly, under RLS (matrix below). |
| FastAPI | The capacity engine, interpretations (OpenAI + fallback), integration tokens and syncs, data deletion, and anything clients must not do directly. Verifies Supabase JWTs. |

## Access matrix

Clients (mobile, web) act as the `authenticated` role and only ever see their own rows. `anon` has no access to any table.

| Table | Client access | Written by |
|---|---|---|
| `profiles` | select; update of `display_name, tone, timezone, tracker_choice, onboarding_step, onboarding_completed_at` | auth trigger creates it; client or `/me` updates it |
| `areas`, `goals`, `tasks`, `recurring_items`, `recurring_item_logs`, `plan_blocks` | select, insert, update, delete | client or backend |
| `checkins` | select, insert (app columns only), delete; no update | client or backend; `legacy_friction`/`source` are import-only |
| `health_daily`, `external_events`, `daily_assessments`, `interpretations` | select only | backend |
| `connections` (encrypted tokens) | none | backend only |

Backend authorization does not rely on RLS alone. The backend's database role
bypasses RLS, so every backend query filters on the verified user ID, and
user-facing reads and writes also run inside `user_scope()`, which switches to
`authenticated` with the user as JWT subject so the same policies apply.

Child rows reference parents through composite `(user_id, id)` foreign keys,
so no row can point at another user's goal, task, routine or assessment.

## Local development

```bash
open -a Docker                                   # Docker Desktop must be running
supabase start                                   # local Postgres, Auth, Studio, Mailpit
.venv/bin/alembic -c backend/alembic.ini upgrade head   # with DATABASE_URL pointing at 127.0.0.1:54322
.venv/bin/python -m pytest                       # Postgres tests skip if the stack is down
```

- Studio: http://127.0.0.1:54323 · Mailpit (sign-in code emails): http://127.0.0.1:54324
- Local JWTs are signed with an ES256 key in `supabase/signing_keys.json` (git-ignored; regenerate with `supabase gen signing-key --algorithm ES256`).
- `supabase/config.toml` disables anonymous sign-ins, sets 6-digit codes, uses `supabase/templates/sign_in_code.html`, allows the `rhythm://auth/callback` and local dashboard redirects, and turns off Realtime, Storage, Edge Functions and Analytics.

## Migrations

- Alembic (`backend/migrations`) is the single source of truth for the schema; Supabase CLI migrations are not used.
- The version table lives in `rhythm_private`, which the Supabase API does not expose.
- `0001` refuses to run if any object it would create already exists, and runs in one transaction, so a conflict changes nothing.
- Non-local hosts are refused unless `-x allow_remote=true` is passed. That flag is only used after explicit approval.

## Before using the hosted Rhythm project

1. Restore the project if it is paused (Dashboard → project → Restore). The read-only checks on 2026-10-10 got 502/521 from Auth and REST, which usually means paused.
2. Run `supabase/audit_existing_project.sql` (25 catalog-only checks) in Dashboard → SQL Editor and share the result. It never reads auth.users rows or resolves names in the auth schema, and reports the migration role (`postgres` via the session pooler) separately from the SQL Editor role.
3. Dashboard → Project Settings → JWT Keys: report whether it shows "JWT signing keys" (current) or only a legacy JWT secret. If only legacy, either migrate to signing keys (recommended) or set `SUPABASE_JWT_SECRET` in `backend/.env` yourself; never paste it into chat.
4. Fill `backend/.env` yourself: `SUPABASE_URL=https://<ref>.supabase.co`, `DATABASE_URL` from Connect → Session pooler (with your password). Fix `mobile/.env`: `EXPO_PUBLIC_SUPABASE_URL` currently holds a placeholder URL that does not match its key.
5. Approval step: apply `0001` to the hosted project.
6. Verify in the SQL Editor:
   - `supabase/verify_after_0001.sql` (read-only): RLS, grants and policies per table.
   - `supabase/verify_behavior_after_0001.sql`: acts as two throwaway users and as anon, attempts allowed and forbidden operations, then always raises an exception so everything is rolled back. The message starts with `RHYTHM VERIFY PASSED` (19 checks) or `RHYTHM VERIFY FAILED` with the failing checks.

All three scripts are exercised by `backend/tests/test_supabase_scripts.py` against the local stack, including a deliberately leaking policy that the behavioral script must catch.

## Authentication setup

**Email code (works locally now):** Authentication → Providers → Email: enabled, "Confirm email" off for OTP-first sign-in, OTP length 6. Authentication → Email Templates → Magic Link and Confirm signup: use the body of `supabase/templates/sign_in_code.html` (it shows `{{ .Token }}` instead of a link). Production needs custom SMTP (the built-in sender is rate-limited) before TestFlight.

**Sign in with Apple (when the Apple Developer account is ready):**
1. Apple Developer → Identifiers: App ID for the iOS bundle with "Sign in with Apple" enabled. Current `mobile/app.json` bundle ID: `com.rhythm.mobile` (confirm it is the one you want before registering).
2. For web sign-in later: a Services ID, plus a Sign in with Apple key (.p8), your Team ID and Key ID.
3. Supabase → Authentication → Providers → Apple: enable; Client IDs = the bundle ID (and Services ID for web); enter the secret generated from the .p8 key directly in the dashboard.
4. Native iOS sign-in needs an EAS development build (Expo Go can't use your bundle ID).
5. Apple returns the user's name only on the first sign-in; the app must save it to the profile right away.

## SQLite → Supabase migration strategy (F4)

The original `rhythm.db` and the archive are never modified.

1. Source: the credential-free copy `~/rhythm-archive/2026-10-10/rhythm-2026-10-10-no-credentials.db`, opened read-only after its checksum is verified against `MANIFEST.json`.
2. Dry run (available now): `.venv/bin/python -m backend.scripts.plan_sqlite_migration`.
3. Mapping:
   - `oura_readings` → `health_daily` (source `oura`, HRV marked RMSSD, provenance `sqlite:oura_readings:<id>`, batch `sqlite-legacy-2026-04-21`). NaN and out-of-range values are dropped, not guessed. Rows with nothing the engine uses are skipped (5 rows that only hold a sleep score; they remain in the archive).
   - `checkins` → `checkins` with `legacy_friction` and `source = legacy_import`; never fed to the engine.
   - `daily_scores` are not copied: engine v2 recomputes assessments (most historic days will honestly be `insufficient_evidence`, since there was no demand data).
   - `suggestions` stay in the archive (decision pending). Tokens are never migrated; connections are re-established per user.
4. Apply (F4, needs approval): runs once your Rhythm account exists, as one transaction keyed to your user ID, idempotent on `(user_id, source, local_date)`; locally first, then hosted only with approval.
5. Optional before F4: re-pull raw Oura history (approved separately) to recover sleep, HRV and resting heart rate the old sync missed.
