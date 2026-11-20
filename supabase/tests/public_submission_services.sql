-- Slice 2a requested services. Disposable development database only.
-- Run as the trusted database owner. All fixtures roll back.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Assertion failed: %', message; end if; end; $$;
create function pg_temp.expect_error(statement text, expected_state text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate = expected_state then return; end if;
    raise exception 'Expected %, got % (%)', expected_state, sqlstate, sqlerrm;
  end;
  raise exception 'Expected error %', expected_state;
end; $$;
-- Passes when the role either lacks the privilege (42501, including RLS insert
-- violations) or the statement is silently filtered by RLS (zero rows).
create function pg_temp.expect_no_write(statement text) returns void language plpgsql as $$
declare n bigint;
begin
  begin execute statement; get diagnostics n = row_count;
  exception when insufficient_privilege then return;
  end;
  if n <> 0 then raise exception 'Write unexpectedly affected % rows: %', n, statement; end if;
end; $$;

-- Fictional payload; v2 by default. Positional call through the public signature.
create function pg_temp.submit(k uuid, ids uuid[], advice boolean, changes jsonb default '{}', version smallint default 2)
returns table (assistance_request_id uuid, status text) language sql as $$
  with input as (select jsonb_build_object(
    'first_name','Fictional','last_name','Services','phone','555-0103','email','',
    'animal_name','Test animal','species','dog','sex','male','altered_status','unknown',
    'age_years',3,'breed','','color_description','','help_summary','Fictional services test',
    'stated_contribution_amount',10,'transportation_notes','','additional_information','',
    'rabies_status','unknown','prevention_use_status','unknown','prevention_product','',
    'medical_concerns','','last_heat_cycle_notes','','available_days',jsonb_build_array('tuesday')) || changes as p)
  select result.* from input cross join lateral public.submit_public_assistance_request(
    k, p->>'first_name', p->>'last_name', p->>'phone', p->>'email', p->>'animal_name',
    p->>'species', p->>'sex', p->>'altered_status', (p->>'age_years')::numeric,
    p->>'breed', p->>'color_description', p->>'help_summary', (p->>'stated_contribution_amount')::numeric,
    p->>'transportation_notes', p->>'additional_information', p->>'rabies_status',
    p->>'prevention_use_status', p->>'prevention_product', p->>'medical_concerns', p->>'last_heat_cycle_notes',
    array(select jsonb_array_elements_text(p->'available_days')), version, ids, advice) result;
$$;
-- Legacy v1 caller: omits all three new arguments (the deployed app before 2a).
create function pg_temp.submit_v1(k uuid)
returns table (assistance_request_id uuid, status text) language sql as $$
  select * from public.submit_public_assistance_request(
    p_submission_id => k, p_first_name => 'Fictional', p_last_name => 'Legacy', p_phone => '555-0104',
    p_email => '', p_animal_name => '', p_species => 'cat', p_sex => 'female', p_altered_status => 'altered',
    p_age_years => null, p_breed => '', p_color_description => '', p_help_summary => 'Fictional legacy test',
    p_stated_contribution_amount => null, p_transportation_notes => '', p_additional_information => '',
    p_rabies_status => 'current', p_prevention_use_status => 'using', p_prevention_product => '',
    p_medical_concerns => '', p_last_heat_cycle_notes => '', p_available_days => array[]::text[]);
$$;
create function pg_temp.counts() returns jsonb language plpgsql as $$
declare t text; n bigint; result jsonb := '{}'; begin
  foreach t in array array['people','households','household_members','animals','assistance_requests',
    'request_animals','request_animal_services','prescreens','request_availability',
    'public_assistance_submission_receipts'] loop
    execute format('select count(*) from public.%I',t) into n;
    result := result || jsonb_build_object(t,n);
  end loop;
  return result;
end; $$;
create function pg_temp.request_for(k uuid) returns uuid language sql as $$
  select assistance_request_id from public.public_assistance_submission_receipts where submission_id = k; $$;
create function pg_temp.services_for(k uuid) returns text[] language sql as $$
  select coalesce(array_agg(s.slug order by s.slug), '{}') from public.request_animals ra
  join public.request_animal_services ras on ras.request_animal_id = ra.id
  join public.services s on s.id = ras.service_id
  where ra.assistance_request_id = pg_temp.request_for(k); $$;
create function pg_temp.advice_for(k uuid) returns boolean language sql as $$
  select ra.service_advice_requested from public.request_animals ra
  where ra.assistance_request_id = pg_temp.request_for(k); $$;

-- Option IDs fixed by the migration; 199 is a test-only option created below.
select set_config('t.surgery', '50000000-0000-0000-0000-000000000101', true);
select set_config('t.medical', '50000000-0000-0000-0000-000000000102', true);
select set_config('t.vaccine', '50000000-0000-0000-0000-000000000103', true);
select set_config('t.dog_only', '50000000-0000-0000-0000-000000000199', true);
select set_config('t.detailed', '50000000-0000-0000-0000-000000000001', true);

-- 1. Single function / overload guard -------------------------------------------
select pg_temp.assert_true((select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'submit_public_assistance_request'), 'exactly one submit function');
select pg_temp.assert_true(to_regprocedure('public.submit_public_assistance_request(uuid,text,text,text,text,text,text,text,text,numeric,text,text,text,numeric,text,text,text,text,text,text,text,text[])') is null,
  'old 22-argument signature dropped');
select pg_temp.assert_true(to_regprocedure('public.submit_public_assistance_request(uuid,text,text,text,text,text,text,text,text,numeric,text,text,text,numeric,text,text,text,text,text,text,text,text[],smallint,uuid[],boolean)') is not null,
  'new signature exists');
select pg_temp.assert_true((select prosecdef and proconfig = array['search_path=""'] from pg_proc
  where oid = 'public.submit_public_assistance_request(uuid,text,text,text,text,text,text,text,text,numeric,text,text,text,numeric,text,text,text,text,text,text,text,text[],smallint,uuid[],boolean)'::regprocedure),
  'security definer with empty search_path');

-- 2. Public options come from the migration ---------------------------------------
select pg_temp.assert_true((select array_agg(id::text || ':' || name || ':' || species_scope order by sort_order)
  from public.services where is_public_request_option and is_active) = array[
    current_setting('t.surgery') || ':Surgery:all', current_setting('t.medical') || ':Medical care:all',
    current_setting('t.vaccine') || ':Vaccine clinic:all'], 'exactly the three public categories');
select pg_temp.assert_true(not exists (select 1 from public.services where is_public_request_option
  and slug not in ('surgery','medical-care','vaccine-clinic')), 'no other service is public');
-- Repeat the migration's insert block: still exactly three, nothing overwritten.
update public.services set sort_order = 999 where id = current_setting('t.medical')::uuid;
insert into public.services (id, name, slug, description, species_scope, is_active, sort_order, is_public_request_option)
values
  ('50000000-0000-0000-0000-000000000101', 'Surgery', 'surgery', null, 'all', true, 110, true),
  ('50000000-0000-0000-0000-000000000102', 'Medical care', 'medical-care', null, 'all', true, 120, true),
  ('50000000-0000-0000-0000-000000000103', 'Vaccine clinic', 'vaccine-clinic', null, 'all', true, 130, true)
on conflict do nothing;
update public.services set is_public_request_option = true, updated_at = now()
  where slug in ('surgery', 'medical-care', 'vaccine-clinic') and not is_public_request_option;
select pg_temp.assert_true((select count(*) = 3 from public.services where is_public_request_option)
  and (select sort_order = 999 from public.services where id = current_setting('t.medical')::uuid),
  'category insert is repeat-safe and never overwrites');
update public.services set sort_order = 120 where id = current_setting('t.medical')::uuid;
-- A detailed staff service (seeded Spay / Neuter, or an equivalent fixture).
insert into public.services (id, name, slug, species_scope)
values (current_setting('t.detailed')::uuid, 'Spay / Neuter', 'spay-neuter', 'all') on conflict do nothing;
select pg_temp.assert_true((select is_active and not is_public_request_option from public.services
  where id = current_setting('t.detailed')::uuid), 'detailed service is active but not public');

create temporary table services_test_state as select pg_temp.counts() before_counts;

set local role service_role;
-- 3. Valid v2 ----------------------------------------------------------------------
select set_config('t.k1', gen_random_uuid()::text, true);
select * from pg_temp.submit(current_setting('t.k1')::uuid,
  array[current_setting('t.vaccine'), current_setting('t.surgery')]::uuid[], false);
reset role;
-- service_role cannot read receipts; record the request ID as the owner.
select set_config('t.r1', pg_temp.request_for(current_setting('t.k1')::uuid)::text, true);
select pg_temp.assert_true(pg_temp.services_for(current_setting('t.k1')::uuid) = array['surgery','vaccine-clinic'],
  'one row per requested option');
select pg_temp.assert_true(pg_temp.advice_for(current_setting('t.k1')::uuid) = false, 'advice flag false');
select pg_temp.assert_true((select contract_version = 2 from public.public_assistance_submission_receipts
  where submission_id = current_setting('t.k1')::uuid), 'v2 receipt');

set local role service_role;
-- 4. Advice only (dog, and species other) -------------------------------------------
select set_config('t.k2', gen_random_uuid()::text, true);
select set_config('t.k3', gen_random_uuid()::text, true);
select * from pg_temp.submit(current_setting('t.k2')::uuid, '{}', true);
select * from pg_temp.submit(current_setting('t.k3')::uuid, '{}', true, '{"species":"other"}');
reset role;
select pg_temp.assert_true(pg_temp.services_for(current_setting('t.k2')::uuid) = '{}'
  and pg_temp.advice_for(current_setting('t.k2')::uuid), 'advice only: no rows, flag true');
select pg_temp.assert_true(pg_temp.services_for(current_setting('t.k3')::uuid) = '{}'
  and pg_temp.advice_for(current_setting('t.k3')::uuid), 'species other: advice only');

update services_test_state set before_counts = pg_temp.counts();
-- Test-only dog-only public option (exercises species_scope for future options).
insert into public.services (id, name, slug, species_scope, is_public_request_option)
values (current_setting('t.dog_only')::uuid, 'Test dog-only option', 'test-dog-only', 'dog', true);

set local role service_role;
-- 5–10. Rejections: each adds nothing (no rows, no receipt) -------------------------
select pg_temp.expect_error($q$select * from pg_temp.submit(gen_random_uuid(), '{}', false)$q$, 'PT422');
select pg_temp.expect_error($q$select * from pg_temp.submit(gen_random_uuid(), array[current_setting('t.detailed')]::uuid[], false)$q$, 'PT422');
select pg_temp.expect_error($q$select * from pg_temp.submit(gen_random_uuid(), array[current_setting('t.surgery'), current_setting('t.detailed')]::uuid[], true)$q$, 'PT422');
select pg_temp.expect_error($q$select * from pg_temp.submit(gen_random_uuid(), array[current_setting('t.surgery')]::uuid[], false, '{"species":"other"}')$q$, 'PT422');
select pg_temp.expect_error($q$select * from pg_temp.submit(gen_random_uuid(), array[current_setting('t.dog_only')]::uuid[], false, '{"species":"cat"}')$q$, 'PT422');
select pg_temp.expect_error($q$select * from pg_temp.submit(gen_random_uuid(), array[gen_random_uuid()], false)$q$, 'PT422');
select pg_temp.expect_error($q$select * from pg_temp.submit(gen_random_uuid(), array[current_setting('t.surgery'), current_setting('t.surgery')]::uuid[], false)$q$, 'PT422');
select pg_temp.expect_error($q$select * from pg_temp.submit(gen_random_uuid(), array[current_setting('t.surgery'), null]::uuid[], false)$q$, 'PT422');
select pg_temp.expect_error($q$select * from pg_temp.submit(gen_random_uuid(), array(select gen_random_uuid() from generate_series(1, 21)), false)$q$, 'PT422');
select pg_temp.expect_error($q$select * from pg_temp.submit(gen_random_uuid(), array[[current_setting('t.surgery')]]::uuid[], false)$q$, 'PT422');
select pg_temp.expect_error($q$select * from pg_temp.submit(gen_random_uuid(), null, true)$q$, 'PT422');
select pg_temp.expect_error($q$select * from pg_temp.submit(gen_random_uuid(), '{}', null)$q$, 'PT422');
select pg_temp.expect_error($q$select * from pg_temp.submit(gen_random_uuid(), '{}', true, '{}', 3::smallint)$q$, 'PT422');
select pg_temp.expect_error($q$select * from pg_temp.submit(gen_random_uuid(), '{}', true, '{}', null)$q$, 'PT422');
reset role;
-- 7. Inactive public option.
update public.services set is_active = false where id = current_setting('t.medical')::uuid;
set local role service_role;
select pg_temp.expect_error($q$select * from pg_temp.submit(gen_random_uuid(), array[current_setting('t.medical')]::uuid[], false)$q$, 'PT422');
reset role;
update public.services set is_active = true where id = current_setting('t.medical')::uuid;
select pg_temp.assert_true(pg_temp.counts() = (select before_counts from services_test_state), 'rejections add nothing');

set local role service_role;
-- 8. Scope logic: the dog-only option is accepted for a dog.
select set_config('t.k4', gen_random_uuid()::text, true);
select * from pg_temp.submit(current_setting('t.k4')::uuid, array[current_setting('t.dog_only')]::uuid[], false);
reset role;
select pg_temp.assert_true(pg_temp.services_for(current_setting('t.k4')::uuid) = array['test-dog-only'], 'dog-only option for dog');
update services_test_state set before_counts = pg_temp.counts();

set local role service_role;
-- 11. Replay with reordered IDs → original receipt, nothing added -----------------
select pg_temp.assert_true((select assistance_request_id = current_setting('t.r1')::uuid
  from pg_temp.submit(current_setting('t.k1')::uuid,
    array[current_setting('t.surgery'), current_setting('t.vaccine')]::uuid[], false)), 'reordered replay');
select pg_temp.assert_true((select assistance_request_id = current_setting('t.r1')::uuid
  from pg_temp.submit(current_setting('t.k1')::uuid,
    array[upper(current_setting('t.vaccine')), current_setting('t.surgery')]::uuid[], false)), 'case-insensitive replay');
-- 12. Same ID, different options / flag / version → PT409 --------------------------
select pg_temp.expect_error($q$select * from pg_temp.submit(current_setting('t.k1')::uuid, array[current_setting('t.surgery')]::uuid[], false)$q$, 'PT409');
select pg_temp.expect_error($q$select * from pg_temp.submit(current_setting('t.k1')::uuid, array[current_setting('t.surgery'), current_setting('t.medical')]::uuid[], false)$q$, 'PT409');
select pg_temp.expect_error($q$select * from pg_temp.submit(current_setting('t.k1')::uuid, array[current_setting('t.surgery'), current_setting('t.vaccine')]::uuid[], true)$q$, 'PT409');
select pg_temp.expect_error($q$select * from pg_temp.submit(current_setting('t.k2')::uuid, array[current_setting('t.surgery')]::uuid[], true)$q$, 'PT409');
select pg_temp.expect_error($q$select * from pg_temp.submit(current_setting('t.k1')::uuid, '{}', false, '{}', 1::smallint)$q$, 'PT409');
reset role;
select pg_temp.assert_true(pg_temp.counts() = (select before_counts from services_test_state), 'replays and conflicts add nothing');

-- 13. Replay after options are deactivated / unpublished → original receipt -------
update public.services set is_active = false where id = current_setting('t.surgery')::uuid;
update public.services set is_public_request_option = false where id = current_setting('t.vaccine')::uuid;
set local role service_role;
select pg_temp.assert_true((select assistance_request_id = current_setting('t.r1')::uuid
  from pg_temp.submit(current_setting('t.k1')::uuid,
    array[current_setting('t.surgery'), current_setting('t.vaccine')]::uuid[], false)), 'replay survives catalog change');
reset role;
update public.services set is_active = true where id = current_setting('t.surgery')::uuid;
update public.services set is_public_request_option = true where id = current_setting('t.vaccine')::uuid;

-- 14. v1 compatibility ---------------------------------------------------------------
set local role service_role;
select set_config('t.k5', gen_random_uuid()::text, true);
select * from pg_temp.submit_v1(current_setting('t.k5')::uuid);
reset role;
select set_config('t.r5', pg_temp.request_for(current_setting('t.k5')::uuid)::text, true);
select pg_temp.assert_true((select contract_version = 1 from public.public_assistance_submission_receipts
  where submission_id = current_setting('t.k5')::uuid), 'omitted arguments give a v1 receipt');
select pg_temp.assert_true(pg_temp.services_for(current_setting('t.k5')::uuid) = '{}'
  and pg_temp.advice_for(current_setting('t.k5')::uuid) = false, 'v1 records no services or advice');
update services_test_state set before_counts = pg_temp.counts();
set local role service_role;
select pg_temp.assert_true((select assistance_request_id = current_setting('t.r5')::uuid
  from pg_temp.submit_v1(current_setting('t.k5')::uuid)), 'v1 replay');
select pg_temp.expect_error($q$select * from pg_temp.submit(gen_random_uuid(), array[current_setting('t.surgery')]::uuid[], false, '{}', 1::smallint)$q$, 'PT422');
select pg_temp.expect_error($q$select * from pg_temp.submit(gen_random_uuid(), '{}', true, '{}', 1::smallint)$q$, 'PT422');
reset role;
select pg_temp.assert_true(pg_temp.counts() = (select before_counts from services_test_state), 'v1 replay and v1 misuse add nothing');

-- Late failure in the service insert rolls back every entity and the receipt.
create function public.test_reject_requested_service() returns trigger language plpgsql as $$
begin raise exception 'Injected test failure' using errcode = '23514'; end; $$;
create trigger test_reject_requested_service before insert on public.request_animal_services
  for each row execute function public.test_reject_requested_service();
set local role service_role;
select pg_temp.expect_error($q$select * from pg_temp.submit(gen_random_uuid(), array[current_setting('t.surgery')]::uuid[], false)$q$, '23514');
reset role;
drop trigger test_reject_requested_service on public.request_animal_services;
select pg_temp.assert_true(pg_temp.counts() = (select before_counts from services_test_state), 'late failure rolls back everything');

-- 15. Privileges -----------------------------------------------------------------------
select pg_temp.assert_true(not has_function_privilege('anon', 'public.submit_public_assistance_request(uuid,text,text,text,text,text,text,text,text,numeric,text,text,text,numeric,text,text,text,text,text,text,text,text[],smallint,uuid[],boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.submit_public_assistance_request(uuid,text,text,text,text,text,text,text,text,numeric,text,text,text,numeric,text,text,text,text,text,text,text,text[],smallint,uuid[],boolean)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.submit_public_assistance_request(uuid,text,text,text,text,text,text,text,text,numeric,text,text,text,numeric,text,text,text,text,text,text,text,text[],smallint,uuid[],boolean)', 'EXECUTE'),
  'EXECUTE only for service_role');
select pg_temp.assert_true(has_column_privilege('service_role', 'public.services', 'is_public_request_option', 'SELECT')
  and has_column_privilege('service_role', 'public.services', 'species_scope', 'SELECT')
  and has_column_privilege('service_role', 'public.request_animals', 'service_advice_requested', 'SELECT'),
  'service_role can read options and the advice flag');
set local role anon;
select pg_temp.expect_error($q$select * from pg_temp.submit(gen_random_uuid(), '{}', true)$q$, '42501');
select pg_temp.expect_no_write($q$insert into public.services (name, slug, is_public_request_option) values ('Injected', 'injected', true)$q$);
select pg_temp.expect_no_write($q$update public.services set is_public_request_option = true$q$);
select pg_temp.expect_no_write($q$delete from public.services$q$);
select pg_temp.expect_no_write(format('insert into public.request_animal_services (request_animal_id, service_id) values (gen_random_uuid(), %L)', current_setting('t.surgery')));
select pg_temp.expect_no_write($q$delete from public.request_animal_services$q$);
reset role;
set local role authenticated;
select pg_temp.expect_error($q$select * from pg_temp.submit(gen_random_uuid(), '{}', true)$q$, '42501');
select pg_temp.expect_no_write($q$insert into public.services (name, slug, is_public_request_option) values ('Injected', 'injected', true)$q$);
select pg_temp.expect_no_write($q$update public.services set is_public_request_option = true$q$);
select pg_temp.expect_no_write($q$delete from public.services$q$);
select pg_temp.expect_no_write(format('insert into public.request_animal_services (request_animal_id, service_id) values (gen_random_uuid(), %L)', current_setting('t.surgery')));
select pg_temp.expect_no_write($q$delete from public.request_animal_services$q$);
reset role;
select pg_temp.assert_true((select count(*) = 4 from public.services where is_public_request_option), 'no injected public option');

do $$ begin raise notice 'Slice 2a requested-services assertions passed; rolling back fixtures.'; end $$;
rollback;
