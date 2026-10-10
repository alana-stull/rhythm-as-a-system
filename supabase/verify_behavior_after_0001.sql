-- Behavioral authorization check after migration 0001. Run in the SQL Editor.
--
-- It creates two throwaway users inside ONE transaction, acts as each of them
-- (and as anon) exactly the way client requests reach Postgres, attempts both
-- allowed and forbidden operations, and then ALWAYS raises an exception at
-- the end. The exception rolls back everything: no users, rows or settings
-- persist, whether the checks pass or fail.
--
-- Read the error message: it starts with RHYTHM VERIFY PASSED or RHYTHM VERIFY FAILED.

do $verify$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  goal_a uuid;
  task_a uuid;
  r text;
  n int;
  passed int := 0;
  failures text[] := '{}';
begin
  -- Helpers live in pg_temp and are rolled back with everything else.
  execute $f$
    create function pg_temp.expect_error(stmt text, want text) returns text language plpgsql as $b$
    begin
      execute stmt;
      return 'no error';
    exception when others then
      return case when sqlstate = want then 'ok' else sqlstate || ' ' || sqlerrm end;
    end $b$ $f$;
  execute $f$
    create function pg_temp.affected(stmt text) returns int language plpgsql as $b$
    declare n int;
    begin
      execute stmt;
      get diagnostics n = row_count;
      return n;
    end $b$ $f$;

  -- Two synthetic users, created the way Supabase Auth creates them. If the
  -- SQL Editor role may not do this (audit check 25), stop and say so.
  begin
    insert into auth.users (id, email, aud, role, created_at, updated_at)
    values (a, a || '@verify.invalid', 'authenticated', 'authenticated', now(), now()),
           (b, b || '@verify.invalid', 'authenticated', 'authenticated', now(), now());
  exception when insufficient_privilege or invalid_schema_name then
    raise exception 'RHYTHM VERIFY SKIPPED: % cannot create test users in auth.users (%). Nothing was changed. Verify through the API with two test accounts instead.',
      current_user, sqlerrm;
  end;

  -- 1. Profile trigger
  if (select count(*) from public.profiles where id in (a, b)) = 2 then passed := passed + 1;
  else failures := failures || 'profile trigger did not create both profiles'::text; end if;

  -- ── As user A ──
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  insert into public.goals (user_id, title) values (a, 'A goal') returning id into goal_a;
  insert into public.tasks (user_id, title, goal_id) values (a, 'A task', goal_a) returning id into task_a;
  insert into public.checkins (user_id, local_date, energy) values (a, current_date, 'low');
  passed := passed + 1;  -- 2. owner can create planning data and check-ins

  if (select count(*) from public.profiles) = 1 then passed := passed + 1;  -- 3
  else failures := failures || 'A can see more than its own profile'::text; end if;

  n := pg_temp.affected(format('update public.profiles set tone = %L where id = %L', 'gentle', a));
  if n = 1 then passed := passed + 1; else failures := failures || ('A cannot edit own profile: ' || n); end if;  -- 4

  foreach r in array array[
    pg_temp.expect_error('select * from public.connections', '42501'),                                           -- 5
    pg_temp.expect_error('update public.checkins set energy = ''high''', '42501'),                                -- 6
    pg_temp.expect_error(format('insert into public.checkins (user_id, local_date, legacy_friction) values (%L, current_date, 5)', a), '42501'),  -- 7
    pg_temp.expect_error(format('insert into public.daily_assessments (user_id, local_date, status, pathway, capacity, demand, engine_version, thresholds_version, inputs_hash) values (%L, current_date, ''insufficient_evidence'', ''none'', ''{}'', ''{}'', ''x'', ''x'', ''x'')', a), '42501'),  -- 8
    pg_temp.expect_error(format('update public.profiles set created_at = now() where id = %L', a), '42501'),      -- 9
    pg_temp.expect_error('truncate public.tasks', '42501'),                                                        -- 10
    pg_temp.expect_error('select * from rhythm_private.alembic_version', '42501')                                  -- 11
  ] loop
    if r = 'ok' then passed := passed + 1; else failures := failures || ('A forbidden op: ' || r); end if;
  end loop;

  -- ── As user B ──
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);

  if (select count(*) from public.tasks) = 0 and (select count(*) from public.goals) = 0
     and (select count(*) from public.checkins) = 0 then passed := passed + 1;  -- 12
  else failures := failures || 'B can read A''s rows'::text; end if;

  if pg_temp.affected(format('update public.tasks set title = %L where id = %L', 'stolen', task_a)) = 0
     and pg_temp.affected(format('delete from public.tasks where id = %L', task_a)) = 0
     and pg_temp.affected(format('update public.profiles set display_name = %L where id = %L', 'x', a)) = 0
  then passed := passed + 1;  -- 13
  else failures := failures || 'B can change A''s rows'::text; end if;

  foreach r in array array[
    pg_temp.expect_error(format('insert into public.tasks (user_id, title) values (%L, ''x'')', a), '42501'),             -- 14
    pg_temp.expect_error(format('insert into public.tasks (user_id, title, goal_id) values (%L, ''x'', %L)', b, goal_a), '23503')  -- 15
  ] loop
    if r = 'ok' then passed := passed + 1; else failures := failures || ('B cross-user op: ' || r); end if;
  end loop;

  -- ── As anon (no user) ──
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  foreach r in array array[
    pg_temp.expect_error('select * from public.profiles', '42501'),                                  -- 16
    pg_temp.expect_error('select * from public.tasks', '42501'),                                     -- 17
    pg_temp.expect_error('insert into public.tasks (user_id, title) values (gen_random_uuid(), ''x'')', '42501')  -- 18
  ] loop
    if r = 'ok' then passed := passed + 1; else failures := failures || ('anon: ' || r); end if;
  end loop;
  execute 'reset role';

  -- 19. Deleting an auth user removes all their data
  delete from auth.users where id = a;
  if (select count(*) from public.tasks where user_id = a) = 0 and not exists (select 1 from public.profiles where id = a)
  then passed := passed + 1;
  else failures := failures || 'auth user deletion did not cascade'::text; end if;

  if cardinality(failures) = 0 then
    raise exception 'RHYTHM VERIFY PASSED: % of 19 checks. Everything was rolled back.', passed;
  else
    raise exception 'RHYTHM VERIFY FAILED: % passed; failures: %. Everything was rolled back.',
      passed, array_to_string(failures, ' | ');
  end if;
end
$verify$;
