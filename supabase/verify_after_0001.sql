-- Read-only verification after applying migration 0001. Run in the SQL Editor.
-- One row per Rhythm table; every row should read: rls = true, anon = none,
-- and the authenticated privileges listed in docs/supabase-foundation.md.

with rhythm_tables(name, expected_client_access) as (
  values ('profiles', 'select; update(6 columns)'),
         ('areas', 'select, insert, update, delete'), ('goals', 'select, insert, update, delete'),
         ('tasks', 'select, insert, update, delete'), ('recurring_items', 'select, insert, update, delete'),
         ('recurring_item_logs', 'select, insert, update, delete'), ('plan_blocks', 'select, insert, update, delete'),
         ('checkins', 'select, delete; insert(app columns)'),
         ('health_daily', 'select'), ('external_events', 'select'),
         ('daily_assessments', 'select'), ('interpretations', 'select'),
         ('connections', 'none')
)
select t.name as "table",
       coalesce(c.relrowsecurity, false) as rls,
       coalesce((select string_agg(distinct privilege_type, ',') from information_schema.role_table_grants g
                  where g.table_schema = 'public' and g.table_name = t.name and g.grantee in ('anon', 'PUBLIC')), 'none') as anon,
       coalesce((select string_agg(distinct privilege_type, ',') from information_schema.role_table_grants g
                  where g.table_schema = 'public' and g.table_name = t.name and g.grantee = 'authenticated'), 'none') as authenticated_table,
       coalesce((select string_agg(distinct privilege_type, ',') from information_schema.column_privileges p
                  where p.table_schema = 'public' and p.table_name = t.name and p.grantee = 'authenticated'), 'none') as authenticated_columns,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.name) as policies,
       t.expected_client_access
  from rhythm_tables t
  left join pg_class c on c.relname = t.name and c.relnamespace = 'public'::regnamespace
union all
select 'auth trigger: rhythm_on_auth_user_created',
       exists (select 1 from pg_trigger where tgname = 'rhythm_on_auth_user_created'
                 and tgrelid = 'auth.users'::regclass), null, null, null, null, 'present = true'
union all
select 'alembic version: ' || coalesce((select string_agg(version_num, ',') from rhythm_private.alembic_version), 'none'),
       null, null, null, null, null, '0001'
order by 1;
