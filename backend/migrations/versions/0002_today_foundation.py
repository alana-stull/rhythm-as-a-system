"""Today foundation: rested check-ins, protected time, calendar treatments, AI safeguards.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-11

Additive only. Existing rows are never rewritten: new columns are nullable or
have defaults, and the only constraint changes widen an allowed vocabulary.

Adds
- checkins.rested                 "How rested do you feel?" (separate from energy)
- profiles.onboarding_answers     answers the engine never reads (life shape, help goals,
                                  responsibilities, protected-time and rest preferences)
- profiles.preferred_health_source  oura | apple_health (when both are connected)
- profiles.ai_task_titles_consented_at  disclosure accepted: relevant task titles may
                                  be sent to the recommendation model
- tasks.first_focus_on, tasks.times_deferred  maintained by a trigger, so "pushed N
                                  days" is a fact, not a guess; clients can't set them
- recurring_items.kind 'protected', recurring_items.cadence_note (free-text cadence)
- plan_blocks.kind 'protected' (no auto-suggest) and 'event' (one-off Rhythm commitment)
- calendar_settings               per calendar: included, default tag, demand treatment
- event_overrides                 per synced event: demand treatment and/or tag
- what_helps                      "What helps me feel my best" (person-authored)
- llm_usage                       every model call (backend only): tokens, cost, outcome;
                                  the budget is enforced from this ledger
- interpretations.purpose, interpretations.includes_task_titles

Access matrix additions (authenticated clients, own rows only)
  calendar_settings, event_overrides, what_helps   select, insert, update, delete
  llm_usage                                        none (backend only)
  checkins                                         insert(+ rested)
  profiles                                         update(+ onboarding_answers,
                                                   preferred_health_source,
                                                   ai_task_titles_consented_at)
"""
from alembic import op
from sqlalchemy import text

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

TABLES = ["calendar_settings", "event_overrides", "what_helps", "llm_usage"]
COLUMNS = [  # (table, column) this migration adds
    ("checkins", "rested"),
    ("profiles", "onboarding_answers"), ("profiles", "preferred_health_source"),
    ("profiles", "ai_task_titles_consented_at"),
    ("tasks", "first_focus_on"), ("tasks", "times_deferred"),
    ("recurring_items", "cadence_note"),
    ("interpretations", "purpose"), ("interpretations", "includes_task_titles"),
]
FUNCTIONS = ["track_task_deferral"]


def _preflight() -> None:
    bind = op.get_bind()
    conflicts = [f"public.{t}" for t in bind.execute(text(
        "select tablename from pg_tables where schemaname = 'public' and tablename = any(:t)"
    ), {"t": TABLES}).scalars()]
    for table, column in COLUMNS:
        if bind.execute(text(
            "select 1 from information_schema.columns "
            "where table_schema = 'public' and table_name = :t and column_name = :c"
        ), {"t": table, "c": column}).first():
            conflicts.append(f"public.{table}.{column}")
    conflicts += [f"rhythm_private.{f}()" for f in bind.execute(text(
        "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
        "where n.nspname = 'rhythm_private' and p.proname = any(:f)"
    ), {"f": FUNCTIONS}).scalars()]
    if conflicts:
        raise RuntimeError(
            "Refusing to migrate: these objects already exist and would be overwritten: " + ", ".join(conflicts)
        )


SCHEMA_SQL = r"""
-- ── Check-ins: "How rested do you feel?" ──────────────────────────────────────
alter table public.checkins
  add column rested text check (rested in ('very_low', 'low', 'moderate', 'high', 'very_high'));
alter table public.checkins drop constraint checkins_check;
alter table public.checkins add constraint checkins_answered_check
  check (energy is not null or perceived_demand is not null or rested is not null or legacy_friction is not null);
grant insert (rested) on public.checkins to authenticated;

-- ── Profiles ──────────────────────────────────────────────────────────────────
alter table public.profiles
  add column onboarding_answers jsonb not null default '{}'
    check (jsonb_typeof(onboarding_answers) = 'object' and pg_column_size(onboarding_answers) <= 8192),
  add column preferred_health_source text check (preferred_health_source in ('oura', 'apple_health')),
  add column ai_task_titles_consented_at timestamptz;
grant update (onboarding_answers, preferred_health_source, ai_task_titles_consented_at)
  on public.profiles to authenticated;

-- ── Tasks: deferral history kept by the database ─────────────────────────────
alter table public.tasks
  add column first_focus_on date,
  add column times_deferred smallint not null default 0 check (times_deferred >= 0);

create function rhythm_private.track_task_deferral() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.first_focus_on := new.focus_on;
    new.times_deferred := 0;
  else
    -- Clients can't set these directly; they follow focus_on.
    new.first_focus_on := coalesce(old.first_focus_on, new.focus_on);
    new.times_deferred := old.times_deferred
      + case when old.focus_on is not null and new.focus_on is not null and new.focus_on > old.focus_on
             then 1 else 0 end;
  end if;
  return new;
end $$;
revoke all on function rhythm_private.track_task_deferral() from public;
create trigger track_task_deferral before insert or update on public.tasks
  for each row execute function rhythm_private.track_task_deferral();

-- ── Protected time and one-off Rhythm events ─────────────────────────────────
alter table public.recurring_items drop constraint recurring_items_kind_check;
alter table public.recurring_items add constraint recurring_items_kind_check
  check (kind in ('habit', 'routine', 'commitment', 'protected'));
alter table public.recurring_items
  add column cadence_note text check (char_length(cadence_note) <= 200);

alter table public.plan_blocks drop constraint plan_blocks_kind_check;
alter table public.plan_blocks add constraint plan_blocks_kind_check
  check (kind in ('task', 'habit', 'routine', 'commitment', 'reset', 'focus', 'protected', 'event'));
alter table public.plan_blocks add constraint plan_blocks_event_title_check
  check (kind <> 'event' or title is not null);

-- ── Calendar preferences (client-owned; survive re-syncs) ────────────────────
create table public.calendar_settings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  source          text not null check (source in ('apple_calendar', 'google_calendar')),
  calendar_ref    text not null check (char_length(calendar_ref) between 1 and 128),  -- hashed identifier
  included        boolean not null default true,
  default_area_id uuid,
  treatment       text not null default 'counts' check (treatment in ('counts', 'ignore')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, source, calendar_ref),
  foreign key (user_id, default_area_id) references public.areas (user_id, id) on delete set null (default_area_id)
);

create table public.event_overrides (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  source      text not null check (source in ('apple_calendar', 'google_calendar')),
  external_id text not null check (char_length(external_id) between 1 and 512),
  treatment   text check (treatment in ('counts', 'ignore')),
  area_id     uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, source, external_id),
  check (treatment is not null or area_id is not null),
  foreign key (user_id, area_id) references public.areas (user_id, id) on delete set null (area_id)
);

-- ── "What helps me feel my best" ─────────────────────────────────────────────
create table public.what_helps (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  text       text not null check (char_length(text) between 1 and 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index what_helps_user_idx on public.what_helps (user_id, sort_order);

-- ── Model usage ledger (backend only) ────────────────────────────────────────
create table public.llm_usage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  purpose       text not null check (purpose in ('what_matters_now', 'day_summary')),
  model         text not null check (char_length(model) <= 80),
  input_tokens  integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd      numeric(10, 6) not null default 0 check (cost_usd >= 0),
  outcome       text not null check (outcome in ('ok', 'error', 'invalid_output',
                                                 'blocked_budget', 'blocked_rate_limit'))
);
create index llm_usage_created_idx on public.llm_usage (created_at);
create index llm_usage_user_created_idx on public.llm_usage (user_id, created_at);

-- ── Interpretations: what they're for, and whether titles were included ──────
alter table public.interpretations
  add column purpose text not null default 'day_summary'
    check (purpose in ('day_summary', 'what_matters_now', 'capacity_context')),
  add column includes_task_titles boolean not null default false;

-- ── updated_at, RLS and privileges for the new tables ────────────────────────
do $$
declare t text;
begin
  foreach t in array array['calendar_settings', 'event_overrides', 'what_helps'] loop
    execute format('create trigger touch_updated_at before update on public.%I
                    for each row execute function rhythm_private.touch_updated_at()', t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['calendar_settings', 'event_overrides', 'what_helps', 'llm_usage'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated, public', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['calendar_settings', 'event_overrides', 'what_helps'] loop
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

-- llm_usage: no client privileges or policies at all (backend only).
"""

DOWNGRADE_SQL = r"""
drop table if exists public.llm_usage, public.what_helps, public.event_overrides, public.calendar_settings;
alter table public.interpretations drop column if exists includes_task_titles, drop column if exists purpose;
alter table public.plan_blocks drop constraint if exists plan_blocks_event_title_check;
alter table public.plan_blocks drop constraint plan_blocks_kind_check;
alter table public.plan_blocks add constraint plan_blocks_kind_check
  check (kind in ('task', 'habit', 'routine', 'commitment', 'reset', 'focus'));
alter table public.recurring_items drop column if exists cadence_note;
alter table public.recurring_items drop constraint recurring_items_kind_check;
alter table public.recurring_items add constraint recurring_items_kind_check
  check (kind in ('habit', 'routine', 'commitment'));
drop trigger if exists track_task_deferral on public.tasks;
drop function if exists rhythm_private.track_task_deferral();
alter table public.tasks drop column if exists times_deferred, drop column if exists first_focus_on;
alter table public.profiles drop column if exists ai_task_titles_consented_at,
  drop column if exists preferred_health_source, drop column if exists onboarding_answers;
alter table public.checkins drop constraint if exists checkins_answered_check;
alter table public.checkins drop column if exists rested;
alter table public.checkins add constraint checkins_check
  check (energy is not null or perceived_demand is not null or legacy_friction is not null);
"""


def upgrade() -> None:
    _preflight()
    op.execute(SCHEMA_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
