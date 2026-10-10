"""Core user-owned schema: profiles, planning, check-ins, connected data, assessments.

Revision ID: 0001
Revises:
Create Date: 2026-10-10

Design rules
- Every row belongs to one user. Child rows reference their parent with a
  composite (user_id, id) foreign key, so a row can never point at another
  user's goal, task or routine.
- RLS is on for every table. Nothing is granted to `anon`. `authenticated`
  gets only the privileges listed in the access matrix below (column-level
  where it matters), and policies restrict them to the caller's own rows.
- Backend-only tables (connections: encrypted tokens) grant clients nothing.
- Text + CHECK constraints instead of enums, so vocabularies can evolve with
  a one-line migration.
- Fails loudly (and rolls back) if any object it would create already exists:
  it never overwrites existing tables in a project.

Access matrix (authenticated clients, own rows only)
  profiles               select; update(display_name, tone, timezone, tracker_choice,
                         onboarding_step, onboarding_completed_at)
  areas, goals, tasks,
  recurring_items,
  recurring_item_logs,
  plan_blocks            select, insert, update, delete
  checkins               select, insert(app columns only), delete   (history is not edited)
  health_daily,
  external_events,
  daily_assessments,
  interpretations        select                                      (written by the backend)
  connections            none                                        (backend only)
"""
from alembic import op
from sqlalchemy import text

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

TABLES = [  # creation order (parents first)
    "profiles", "areas", "goals", "tasks", "recurring_items", "recurring_item_logs",
    "plan_blocks", "checkins", "connections", "health_daily", "external_events",
    "daily_assessments", "interpretations",
]
FUNCTIONS = ["touch_updated_at", "handle_new_user"]
AUTH_TRIGGER = "rhythm_on_auth_user_created"


def _preflight() -> None:
    bind = op.get_bind()
    existing_tables = bind.execute(text(
        "select tablename from pg_tables where schemaname = 'public' and tablename = any(:t)"
    ), {"t": TABLES}).scalars().all()
    existing_funcs = bind.execute(text(
        "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
        "where n.nspname = 'rhythm_private' and p.proname = any(:f)"
    ), {"f": FUNCTIONS}).scalars().all()
    existing_trigger = bind.execute(text(
        "select tgname from pg_trigger where tgname = :t and not tgisinternal"
    ), {"t": AUTH_TRIGGER}).scalars().all()
    conflicts = [f"public.{t}" for t in existing_tables] + \
                [f"rhythm_private.{f}()" for f in existing_funcs] + existing_trigger
    if conflicts:
        raise RuntimeError(
            "Refusing to migrate: these objects already exist and would be overwritten: "
            + ", ".join(conflicts)
        )


SCHEMA_SQL = r"""
-- ── Private helpers (not exposed through the Supabase API) ───────────────────
create schema if not exists rhythm_private;
revoke all on schema rhythm_private from public;

create function rhythm_private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── Profiles: one per auth user ───────────────────────────────────────────────
create table public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  display_name            text check (char_length(display_name) between 1 and 80),
  tone                    text check (tone in ('gentle', 'direct', 'motivating')),
  timezone                text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  tracker_choice          text check (tracker_choice in ('oura', 'apple_watch', 'whoop', 'other', 'none')),
  onboarding_step         text check (char_length(onboarding_step) <= 40),
  onboarding_completed_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create function rhythm_private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;
revoke all on function rhythm_private.handle_new_user() from public;

create trigger rhythm_on_auth_user_created
  after insert on auth.users
  for each row execute function rhythm_private.handle_new_user();

-- ── Areas of life (organizing dimension for goals, tasks, routines) ──────────
create table public.areas (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  color_family text check (char_length(color_family) <= 20),
  sort_order   integer not null default 0,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, id)
);

-- ── Goals: longer-term outcomes that tasks connect to ────────────────────────
create table public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  area_id     uuid,
  title       text not null check (char_length(title) between 1 and 200),
  notes       text check (char_length(notes) <= 2000),
  target_on   date,
  achieved_at timestamptz,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, area_id) references public.areas (user_id, id) on delete set null (area_id)
);

-- ── Tasks: no status column; placement comes from dates and timestamps ───────
create table public.tasks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 300),
  notes            text check (char_length(notes) <= 5000),
  area_id          uuid,
  goal_id          uuid,
  effort           text check (effort in ('light', 'moderate', 'deep')),
  estimate_minutes integer check (estimate_minutes between 1 and 1440),
  due_on           date,
  focus_on         date,
  priority_rank    smallint check (priority_rank between 1 and 3),  -- Top 3 for focus_on
  completed_at     timestamptz,
  let_go_at        timestamptz,
  source           text not null default 'capture' check (source in ('capture', 'brain_dump', 'goal', 'import')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, id),
  check (priority_rank is null or focus_on is not null),
  foreign key (user_id, area_id) references public.areas (user_id, id) on delete set null (area_id),
  foreign key (user_id, goal_id) references public.goals (user_id, id) on delete set null (goal_id)
);
create index tasks_user_focus_idx on public.tasks (user_id, focus_on);
create index tasks_user_due_idx on public.tasks (user_id, due_on);
create unique index tasks_one_priority_per_rank_idx on public.tasks (user_id, focus_on, priority_rank)
  where priority_rank is not null and completed_at is null and let_go_at is null;

-- ── Habits, routines and manual commitments ──────────────────────────────────
-- Effects on capacity and demand are explicit and default to 'unknown':
-- nothing is automatically a benefit or a cost.
create table public.recurring_items (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  kind              text not null check (kind in ('habit', 'routine', 'commitment')),
  title             text not null check (char_length(title) between 1 and 200),
  notes             text check (char_length(notes) <= 2000),
  area_id           uuid,
  goal_id           uuid,
  recurrence        text check (char_length(recurrence) <= 500),  -- RFC 5545 RRULE; null = as needed
  starts_on         date,
  ends_on           date,
  start_time        time,
  duration_minutes  integer check (duration_minutes between 1 and 1440),
  effort            text check (effort in ('light', 'moderate', 'deep')),
  is_non_negotiable boolean not null default false,
  demand_effect     text not null default 'unknown' check (demand_effect in ('unknown', 'adds', 'neutral')),
  capacity_effect   text not null default 'unknown' check (capacity_effect in ('unknown', 'supports', 'neutral')),
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, id),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  foreign key (user_id, area_id) references public.areas (user_id, id) on delete set null (area_id),
  foreign key (user_id, goal_id) references public.goals (user_id, id) on delete set null (goal_id)
);

-- Practice log for habits/routines. No streak column: history, not pressure.
create table public.recurring_item_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  item_id     uuid not null,
  occurred_on date not null,
  outcome     text not null check (outcome in ('done', 'partly', 'skipped')),
  note        text check (char_length(note) <= 1000),
  recorded_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (user_id, item_id) references public.recurring_items (user_id, id) on delete cascade
);
create index recurring_item_logs_user_item_idx on public.recurring_item_logs (user_id, item_id, occurred_on);

-- ── Rhythm's editable planning layer (never written to external calendars) ───
create table public.plan_blocks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  kind              text not null check (kind in ('task', 'habit', 'routine', 'commitment', 'reset', 'focus')),
  task_id           uuid,
  recurring_item_id uuid,
  title             text check (char_length(title) <= 200),
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  origin            text not null default 'user' check (origin in ('user', 'suggestion')),
  completed_at      timestamptz,
  skipped_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (ends_at > starts_at),
  check (kind <> 'task' or task_id is not null),
  check (kind not in ('habit', 'routine', 'commitment') or recurring_item_id is not null),
  foreign key (user_id, task_id) references public.tasks (user_id, id) on delete cascade,
  foreign key (user_id, recurring_item_id) references public.recurring_items (user_id, id) on delete cascade
);
create index plan_blocks_user_start_idx on public.plan_blocks (user_id, starts_at);

-- ── Check-ins: history kept; latest answer per question informs the day ──────
create table public.checkins (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  local_date       date not null,
  recorded_at      timestamptz not null default now(),
  energy           text check (energy in ('very_low', 'low', 'moderate', 'high', 'very_high')),
  perceived_demand text check (perceived_demand in ('very_light', 'light', 'moderate', 'heavy', 'very_heavy')),
  context_tags     text[] not null default '{}' check (cardinality(context_tags) <= 10),
  note             text check (char_length(note) <= 1000),  -- never sent to the interpretation layer
  legacy_friction  smallint check (legacy_friction between 1 and 10),  -- retired 1-10 slider (import only)
  source           text not null default 'app' check (source in ('app', 'legacy_import')),
  created_at       timestamptz not null default now(),
  check (energy is not null or perceived_demand is not null or legacy_friction is not null)
);
create index checkins_user_day_idx on public.checkins (user_id, local_date, recorded_at desc);

-- ── Connected data ───────────────────────────────────────────────────────────
-- Backend only. Tokens are encrypted by the backend before storage.
create table public.connections (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  provider            text not null check (provider in ('oura', 'google_calendar', 'apple_calendar', 'apple_health')),
  status              text not null default 'active' check (status in ('active', 'needs_reauth', 'revoked', 'error')),
  scopes              text[] not null default '{}',
  access_token_enc    text,
  refresh_token_enc   text,
  token_expires_at    timestamptz,
  external_account_id text,
  settings            jsonb not null default '{}',  -- e.g. selected calendars (hashed refs)
  last_synced_at      timestamptz,
  last_error          text check (char_length(last_error) <= 1000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, provider),
  unique (user_id, id)
);

-- One normalized row per user, source and local day. Only fields the engine uses.
create table public.health_daily (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  source           text not null check (source in ('oura', 'apple_health')),
  local_date       date not null,
  readiness        numeric(5, 2) check (readiness between 0 and 100),  -- vendor composite (Oura)
  sleep_minutes    integer check (sleep_minutes between 0 and 1440),
  hrv_ms           numeric(6, 2) check (hrv_ms > 0),
  hrv_method       text check (hrv_method in ('rmssd', 'sdnn')),
  resting_hr       numeric(5, 2) check (resting_hr between 20 and 250),
  source_record_id text,
  import_batch     text,
  ingested_at      timestamptz not null default now(),
  unique (user_id, source, local_date),
  check (hrv_ms is null or hrv_method is not null)
);

-- Read-only mirror of external calendars. Busy blocks by default; titles opt-in.
create table public.external_events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  connection_id     uuid,
  source            text not null check (source in ('apple_calendar', 'google_calendar')),
  calendar_ref      text not null,  -- hashed calendar identifier
  external_id       text not null,
  series_ref        text,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  all_day           boolean not null default false,
  busy              boolean not null default true,
  declined          boolean not null default false,
  title             text check (char_length(title) <= 300),
  source_updated_at timestamptz,
  synced_at         timestamptz not null default now(),
  unique (user_id, source, external_id),
  check (ends_at >= starts_at),
  foreign key (user_id, connection_id) references public.connections (user_id, id) on delete cascade
);
create index external_events_user_start_idx on public.external_events (user_id, starts_at);

-- ── Engine output and interpretation ─────────────────────────────────────────
create table public.daily_assessments (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  local_date         date not null,
  status             text not null check (status in ('assessed', 'uncertain', 'insufficient_evidence')),
  state              text check (state in ('Aligned', 'Balanced', 'Strained', 'Overloaded')),
  possible_states    text[] not null default '{}',
  confidence         text check (confidence in ('low', 'medium', 'high')),
  pathway            text not null check (pathway in ('none', 'self_reported', 'connected', 'hybrid')),
  capacity           jsonb not null,
  demand             jsonb not null,
  unused_evidence    jsonb not null default '[]',
  engine_version     text not null,
  thresholds_version text not null,
  inputs_hash        text not null,
  computed_at        timestamptz not null default now(),
  unique (user_id, local_date),
  unique (user_id, id),
  check ((status = 'assessed') = (state is not null))
);

create table public.interpretations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  assessment_id   uuid not null,
  kind            text not null check (kind in ('llm', 'fallback')),
  model           text,
  context_version text not null,
  prompt_version  text,
  context         jsonb not null,  -- the exact (free-text-free) context sent or used
  headline        text,
  body            text not null,
  actions         jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  foreign key (user_id, assessment_id) references public.daily_assessments (user_id, id) on delete cascade
);
create index interpretations_user_created_idx on public.interpretations (user_id, created_at desc);

-- ── updated_at maintenance ───────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['profiles', 'areas', 'goals', 'tasks', 'recurring_items',
                           'recurring_item_logs', 'plan_blocks', 'connections'] loop
    execute format('create trigger touch_updated_at before update on public.%I
                    for each row execute function rhythm_private.touch_updated_at()', t);
  end loop;
end $$;

-- ── Row-level security and privileges ────────────────────────────────────────
-- Start from nothing: RLS on, every privilege revoked from client roles
-- (including TRUNCATE/REFERENCES/TRIGGER, which RLS does not cover).
do $$
declare t text;
begin
  foreach t in array array['profiles', 'areas', 'goals', 'tasks', 'recurring_items', 'recurring_item_logs',
                           'plan_blocks', 'checkins', 'connections', 'health_daily', 'external_events',
                           'daily_assessments', 'interpretations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated, public', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

-- Profiles: read own; update only the editable columns.
grant select on public.profiles to authenticated;
grant update (display_name, tone, timezone, tracker_choice, onboarding_step, onboarding_completed_at)
  on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Client-authored planning data: full CRUD on own rows.
do $$
declare t text;
begin
  foreach t in array array['areas', 'goals', 'tasks', 'recurring_items', 'recurring_item_logs', 'plan_blocks'] loop
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
                   t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
                   t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
                   t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
                   t || '_delete_own', t);
  end loop;
end $$;

-- Check-ins: append-only history from clients (no update); legacy columns are import-only.
grant select, delete on public.checkins to authenticated;
grant insert (user_id, local_date, recorded_at, energy, perceived_demand, context_tags, note)
  on public.checkins to authenticated;
create policy checkins_select_own on public.checkins for select to authenticated
  using (user_id = (select auth.uid()));
create policy checkins_insert_own on public.checkins for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy checkins_delete_own on public.checkins for delete to authenticated
  using (user_id = (select auth.uid()));

-- Backend-written data: clients may read their own rows only.
do $$
declare t text;
begin
  foreach t in array array['health_daily', 'external_events', 'daily_assessments', 'interpretations'] loop
    execute format('grant select on table public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
                   t || '_select_own', t);
  end loop;
end $$;

-- connections: no client privileges or policies at all (backend only).
"""

DOWNGRADE_SQL = r"""
drop trigger if exists rhythm_on_auth_user_created on auth.users;
drop table if exists public.interpretations, public.daily_assessments, public.external_events,
  public.health_daily, public.connections, public.checkins, public.plan_blocks,
  public.recurring_item_logs, public.recurring_items, public.tasks, public.goals,
  public.areas, public.profiles;
drop function if exists rhythm_private.handle_new_user();
drop function if exists rhythm_private.touch_updated_at();
"""


def upgrade() -> None:
    _preflight()
    op.execute(SCHEMA_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
