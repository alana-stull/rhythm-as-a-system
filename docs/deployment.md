# Deploying the Rhythm API

The API is a FastAPI app hosted on Render (`render.yaml`, a Blueprint), next to the hosted Supabase project
in us-east-1. The mobile app talks to it over HTTPS; nothing else is public.

## What's public

`tests/test_production_surface.py` enforces this: every route requires a Supabase sign-in, except

- `GET /health` (Render's health check)
- `GET /oura/callback` and `GET /connections/oura/callback` (Oura's redirect; they verify a signed, expiring state)

The pre-Supabase single-user endpoints (`/upload`, `/checkin`, `/scores`, `/suggestions`, `/lamp`,
`/calendar`, the rest of `/oura`) have no authentication and return 404 unless `LEGACY_ENDPOINTS_ENABLED=true`,
which is for local dashboard/menu bar work only. With `ENVIRONMENT=production`, `/docs` and `/openapi.json` are off.

## Paid calls

The only OpenAI path reachable in production is the optional rewording of a Today recommendation
(`pipeline/llm.py`): signed-in only, cached per recommendation, a hard monthly ceiling across all users
(`LLM_MONTHLY_BUDGET_USD`, default $20) and a per-person daily cap (`LLM_USER_DAILY_CALLS`, default 8).
Those limits live in the `llm_usage` table (migration 0002), so `RECOMMENDATIONS_LLM_ENABLED` stays `false`
until that migration is applied and a working `OPENAI_API_KEY` is set.

## First deploy

1. Render → New → Blueprint → this repository and branch. Render reads `render.yaml`.
2. Enter each `sync: false` value (Render stores them encrypted):
   - `SUPABASE_URL`, `DATABASE_URL` (session pooler, `postgresql+psycopg://` prefix), `SUPABASE_SERVICE_ROLE_KEY`
   - `TOKEN_ENCRYPTION_KEY`: `python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'`.
     Generate it once for production and never change it, or stored Oura tokens can't be decrypted.
   - `OAUTH_STATE_SECRET`: `python -c 'import secrets; print(secrets.token_urlsafe(48))'`
   - `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`, `OURA_REDIRECT_URI` = `https://<api host>/oura/callback`
     (register the same URL in the Oura developer app)
   - `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`
   - `OPENAI_API_KEY` (optional)
3. Deploy, then check `https://<api host>/health` returns `{"status":"ok"}`.
4. Optional: add a custom domain (e.g. `api.findrhythm.co`) in Render and a CNAME at the DNS provider.

`autoDeploy` is off during the beta: deploy from the dashboard (or turn it on once the release flow is settled).

## Database migrations

Never run on deploy. The hosted database is changed only deliberately, after review:

```bash
DATABASE_URL=... .venv/bin/alembic -c backend/alembic.ini -x "url=$DATABASE_URL" -x allow_remote=true upgrade head
```

## The app

EAS build profiles read their variables from EAS environments (`eas.json` → `"environment"`), never from
files in the repo. For `preview` and `production`, set in EAS (expo.dev → project → Environment variables):

- `EXPO_PUBLIC_API_URL` = `https://<api host>` (release builds refuse anything but https)
- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (public by design; RLS protects the data)
