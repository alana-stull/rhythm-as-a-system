-- Pre-migration checklist for applying Rhythm's migration 0001 to an existing
-- Supabase project.
--
-- Strictly read-only and catalog-only: it reads system catalogs (pg_class,
-- pg_namespace, pg_proc, pg_trigger, pg_roles, pg_policies, ...) and asks
-- Postgres's privilege functions about objects by OID. It never reads rows
-- from auth.users, never resolves names inside the auth schema, and never
-- attempts an operation to see whether it would succeed.
--
-- Two roles are assessed separately:
--   * migration role: the role Alembic connects as. With the Supabase session
--     pooler (postgres.<project-ref>@...pooler.supabase.com) this is `postgres`.
--     Change it in `params` below if yours differs.
--   * SQL Editor role: current_user, i.e. whoever runs this script. It only
--     matters for supabase/verify_behavior_after_0001.sql.
--
-- Status: CLEAR (nothing in the way) · REVIEW (look before applying) ·
-- CONFLICT (0001 would refuse to run) · BLOCKER (0001 cannot run as designed).

with params(migration_role) as (values ('postgres')),
rhythm_tables(name) as (
  values ('profiles'), ('areas'), ('goals'), ('tasks'), ('recurring_items'), ('recurring_item_logs'),
         ('plan_blocks'), ('checkins'), ('connections'), ('health_daily'), ('external_events'),
         ('daily_assessments'), ('interpretations')
),
public_objects as (
  select c.relname, c.relkind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
),
auth_users as (  -- catalog row only; no data is read
  select c.oid, c.relowner, c.reltuples, c.relacl
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'auth' and c.relname = 'users' and c.relkind in ('r', 'p')
),
roles as (
  select (select migration_role from params) as mig,
         exists (select 1 from pg_roles where rolname = (select migration_role from params)) as mig_exists,
         current_user::text as editor
),
checks(n, item, status, detail) as (
  select 1, 'Postgres version 15 or newer',
         case when current_setting('server_version_num')::int >= 150000 then 'CLEAR' else 'BLOCKER' end,
         current_setting('server_version')
  union all
  select 2, 'No public tables/views with Rhythm names',
         case when count(*) = 0 then 'CLEAR' else 'CONFLICT' end,
         coalesce(string_agg(relname, ', ' order by relname), 'none')
    from public_objects where relname in (select name from rhythm_tables)
  union all
  select 3, 'Other objects in public (informational)',
         case when count(*) = 0 then 'CLEAR' else 'REVIEW' end,
         coalesce(string_agg(relname || ' (' || relkind::text || ')', ', ' order by relname), 'none')
    from public_objects where relname not in (select name from rhythm_tables)
  union all
  select 4, 'No rhythm_private schema yet',
         case when count(*) = 0 then 'CLEAR' else 'REVIEW' end,
         case when count(*) = 0 then 'absent' else 'exists (0001 reuses it; see checks 5 and 6)' end
    from pg_namespace where nspname = 'rhythm_private'
  union all
  select 5, 'No Rhythm functions already defined',
         case when count(*) = 0 then 'CLEAR' else 'CONFLICT' end,
         coalesce(string_agg('rhythm_private.' || p.proname, ', '), 'none')
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'rhythm_private' and p.proname in ('touch_updated_at', 'handle_new_user')
  union all
  select 6, 'No Alembic version recorded',
         case when count(*) = 0 then 'CLEAR' else 'REVIEW' end,
         case when count(*) = 0 then 'absent' else 'rhythm_private.alembic_version exists' end
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'rhythm_private' and c.relname = 'alembic_version'
  union all
  select 7, 'auth.users present (Supabase Auth installed)',
         case when count(*) = 1 then 'CLEAR' else 'BLOCKER' end,
         case when count(*) = 1 then 'owner: ' || pg_get_userbyid(min(relowner)) else 'not found' end
    from auth_users
  union all
  select 8, 'No Rhythm trigger on auth.users',
         case when count(*) = 0 then 'CLEAR' else 'CONFLICT' end,
         coalesce(string_agg(t.tgname, ', '), 'none')
    from pg_trigger t join auth_users u on u.oid = t.tgrelid
   where not t.tgisinternal and t.tgname = 'rhythm_on_auth_user_created'
  union all
  select 9, 'Other triggers on auth.users (could also insert profiles)',
         case when count(*) = 0 then 'CLEAR' else 'REVIEW' end,
         coalesce(string_agg(t.tgname || ' -> ' || p.proname, ', '), 'none')
    from pg_trigger t join auth_users u on u.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
   where not t.tgisinternal and t.tgname <> 'rhythm_on_auth_user_created'
  union all
  select 10, 'No RLS policies in public',
         case when count(*) = 0 then 'CLEAR' else 'REVIEW' end,
         coalesce(string_agg(tablename || '.' || policyname, ', '), 'none')
    from pg_policies where schemaname = 'public'
  union all
  select 11, 'No user-defined functions in public',
         case when count(*) = 0 then 'CLEAR' else 'REVIEW' end,
         coalesce(string_agg(p.proname, ', '), 'none')
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  union all
  -- ── Migration role ─────────────────────────────────────────────────────────
  select 12, 'Migration role exists',
         case when mig_exists then 'CLEAR' else 'BLOCKER' end, mig
    from roles
  union all
  select 13, 'Migration role can create the profile trigger on auth.users',
         case when not r.mig_exists or u.oid is null then 'BLOCKER'
              when pg_has_role(r.mig, u.relowner, 'USAGE') then 'CLEAR'
              when has_table_privilege(r.mig, u.oid, 'TRIGGER') then 'REVIEW'
              else 'BLOCKER' end,
         case when not r.mig_exists or u.oid is null then 'cannot assess'
              else 'owner=' || pg_get_userbyid(u.relowner)
                   || ', ' || r.mig || ' is owner/member: ' || pg_has_role(r.mig, u.relowner, 'USAGE')::text
                   || ', has TRIGGER: ' || has_table_privilege(r.mig, u.oid, 'TRIGGER')::text
                   || case when not pg_has_role(r.mig, u.relowner, 'USAGE') and has_table_privilege(r.mig, u.oid, 'TRIGGER')
                           then ' (Postgres allows CREATE TRIGGER with this privilege, but hosted platform guards can still refuse it; '
                                || 'if so 0001 rolls back completely)'
                           when not has_table_privilege(r.mig, u.oid, 'TRIGGER')
                           then ' (0001 would fail and roll back; profile creation must move out of the database)'
                           else '' end end
    from roles r left join auth_users u on true
  union all
  select 14, 'Migration role can create objects in public',
         case when mig_exists and has_schema_privilege(mig, 'public', 'CREATE') then 'CLEAR' else 'BLOCKER' end,
         case when mig_exists then 'CREATE on public: ' || has_schema_privilege(mig, 'public', 'CREATE')::text else 'cannot assess' end
    from roles
  union all
  select 15, 'Migration role can create the rhythm_private schema',
         case when not mig_exists then 'BLOCKER'
              when exists (select 1 from pg_namespace where nspname = 'rhythm_private') then 'CLEAR'
              when has_database_privilege(mig, current_database(), 'CREATE') then 'CLEAR' else 'BLOCKER' end,
         case when mig_exists then 'CREATE on database: ' || has_database_privilege(mig, current_database(), 'CREATE')::text
              else 'cannot assess' end
    from roles
  union all
  select 16, 'Migration role can act as authenticated (backend RLS scoping)',
         case when mig_exists and exists (select 1 from pg_roles where rolname = 'authenticated')
                   and pg_has_role(mig, 'authenticated', 'MEMBER') then 'CLEAR' else 'BLOCKER' end,
         'member of authenticated'
    from roles
  union all
  select 17, 'Migration role bypasses RLS (backend privileged path)',
         case when rolbypassrls then 'CLEAR' else 'REVIEW' end,
         'bypassrls=' || rolbypassrls::text
         || case when not rolbypassrls then ' (backend data deletion and profile fallback would need a different design)' else '' end
    from pg_roles where rolname = (select migration_role from params)
  union all
  -- ── Supabase platform pieces the authorization model relies on ─────────────
  select 18, 'Supabase roles present (anon, authenticated, service_role, authenticator)',
         case when count(*) = 4 then 'CLEAR' else 'BLOCKER' end,
         coalesce(string_agg(rolname, ', ' order by rolname), 'none')
    from pg_roles where rolname in ('anon', 'authenticated', 'service_role', 'authenticator')
  union all
  select 19, 'auth.uid() available (every Rhythm policy uses it)',
         case when count(*) > 0 then 'CLEAR' else 'BLOCKER' end, ''
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'auth' and p.proname = 'uid' and p.pronargs = 0
  union all
  select 20, 'API role can switch to authenticated (client requests get RLS identity)',
         case when exists (select 1 from pg_roles where rolname = 'authenticator')
                   and pg_has_role('authenticator', 'authenticated', 'MEMBER') then 'CLEAR' else 'BLOCKER' end, ''
  union all
  select 21, 'gen_random_uuid() available',
         case when count(*) > 0 then 'CLEAR' else 'BLOCKER' end, ''
    from pg_proc where proname = 'gen_random_uuid' and pronargs = 0
  union all
  select 22, 'Auth users (estimate from catalog statistics; informational)', 'CLEAR',
         coalesce((select case when reltuples < 0 then 'not yet analyzed' else reltuples::bigint::text end from auth_users), 'n/a')
  union all
  select 23, 'Default privileges on new public tables (informational; 0001 revokes explicitly)', 'CLEAR',
         coalesce(string_agg(pg_get_userbyid(d.defaclrole) || '/' || d.defaclobjtype::text || ': '
                             || array_to_string(d.defaclacl::text[], ' '), ' | '), 'none')
    from pg_default_acl d join pg_namespace ns on ns.oid = d.defaclnamespace
   where ns.nspname = 'public' and d.defaclobjtype = 'r'
  union all
  -- ── SQL Editor role (only for verify_behavior_after_0001.sql) ──────────────
  select 24, 'SQL Editor role (informational)', 'CLEAR',
         editor || case when editor = mig then ' (same as migration role)' else ' (differs from migration role ' || mig || ')' end
    from roles
  union all
  select 25, 'SQL Editor role can run verify_behavior_after_0001.sql',
         case when u.oid is not null
                   and has_table_privilege(r.editor, u.oid, 'INSERT') and has_table_privilege(r.editor, u.oid, 'DELETE')
                   and pg_has_role(r.editor, 'authenticated', 'MEMBER') and pg_has_role(r.editor, 'anon', 'MEMBER')
              then 'CLEAR' else 'REVIEW' end,
         case when u.oid is null then 'auth.users not found'
              else 'insert/delete on auth.users: ' || has_table_privilege(r.editor, u.oid, 'INSERT')::text
                   || '/' || has_table_privilege(r.editor, u.oid, 'DELETE')::text
                   || ', can act as authenticated/anon: ' || pg_has_role(r.editor, 'authenticated', 'MEMBER')::text
                   || '/' || pg_has_role(r.editor, 'anon', 'MEMBER')::text
                   || ' (if REVIEW, verify behavior through the API with two test accounts instead)' end
    from roles r left join auth_users u on true
)
select n, item, status, detail from checks order by n;
