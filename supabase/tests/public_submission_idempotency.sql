-- Disposable development database only. All fixtures/temporary triggers roll back.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Assertion failed: %', message; end if; end; $$;
create function pg_temp.expect_error(statement text, expected_state text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate = expected_state then return; end if;
    raise exception 'Expected %, got %', expected_state, sqlstate;
  end;
  raise exception 'Expected error %', expected_state;
end; $$;
create function pg_temp.submit(k uuid, changes jsonb default '{}')
returns table (assistance_request_id uuid, status text) language sql as $$
  with input as (select jsonb_build_object(
    'first_name','Fictional','last_name','Idempotency','phone','555-0102','email','',
    'animal_name','Test animal','species','dog','sex','male','altered_status','unknown',
    'age_years',2.5,'breed','','color_description','','help_summary','Fictional test help',
    'stated_contribution_amount',25,'transportation_notes','','additional_information','',
    'rabies_status','unknown','prevention_use_status','unknown','prevention_product','',
    'medical_concerns','','last_heat_cycle_notes','','available_days',jsonb_build_array('monday','friday')) || changes as p)
  select result.* from input cross join lateral public.submit_public_assistance_request(
    k, p->>'first_name', p->>'last_name', p->>'phone', p->>'email', p->>'animal_name',
    p->>'species', p->>'sex', p->>'altered_status', (p->>'age_years')::numeric,
    p->>'breed', p->>'color_description', p->>'help_summary', (p->>'stated_contribution_amount')::numeric,
    p->>'transportation_notes', p->>'additional_information', p->>'rabies_status',
    p->>'prevention_use_status', p->>'prevention_product', p->>'medical_concerns', p->>'last_heat_cycle_notes',
    array(select jsonb_array_elements_text(p->'available_days'))) result;
$$;
create function pg_temp.counts() returns jsonb language plpgsql as $$
declare t text; n bigint; result jsonb := '{}'; begin
  foreach t in array array['people','households','household_members','animals','assistance_requests',
    'request_animals','prescreens','request_availability','public_assistance_submission_receipts'] loop
    execute format('select count(*) from public.%I',t) into n;
    result := result || jsonb_build_object(t,n);
  end loop;
  return result;
end; $$;
create temporary table submission_test_state as select gen_random_uuid() k, pg_temp.counts() before_counts;
grant select on submission_test_state to service_role;
set local role service_role;
select * from pg_temp.submit((select k from submission_test_state));
reset role;
-- Commit-time integrity checked explicitly; this script itself always rolls back.
set constraints public.public_submission_request_fk immediate;
set constraints public.public_submission_request_fk deferred;
select pg_temp.assert_true((select r.status = 'new' and r.status_version = 0
  from public.assistance_requests r join public.public_assistance_submission_receipts s on s.assistance_request_id = r.id
  where s.submission_id = (select k from submission_test_state)), 'new request and version zero');
do $$ declare t text; expected integer; begin
  for t in select jsonb_object_keys((select before_counts from submission_test_state)) loop
    expected := case when t = 'request_availability' then 2 else 1 end;
    perform pg_temp.assert_true((pg_temp.counts()->>t)::bigint =
      ((select before_counts from submission_test_state)->>t)::bigint + expected, 'one record set: '||t);
  end loop;
end; $$;
alter table submission_test_state add column after_counts jsonb;
update submission_test_state set after_counts = pg_temp.counts();
create temporary table original_receipt as select * from public.public_assistance_submission_receipts
where submission_id = (select k from submission_test_state);
set local role service_role;
select * from pg_temp.submit((select k from submission_test_state));
select * from pg_temp.submit((select k from submission_test_state),
  '{"age_years":2.500,"stated_contribution_amount":25.0,"available_days":["friday","monday"],"email":null,"medical_concerns":null}');
reset role;
select pg_temp.assert_true(pg_temp.counts() = (select after_counts from submission_test_state), 'replay adds nothing');
select pg_temp.assert_true((select to_jsonb(r) = to_jsonb(o) from public.public_assistance_submission_receipts r
  join original_receipt o using (submission_id)), 'receipt never rewritten');
-- Every business argument participates in the DB fingerprint.
set local role service_role;
do $$ declare change jsonb; begin
  for change in select value from jsonb_array_elements('[
    {"first_name":"Another"},{"last_name":"Another"},{"phone":"555-0199"},{"email":"test@example.invalid"},
    {"animal_name":"Another"},{"species":"cat"},{"sex":"unknown"},{"altered_status":"altered"},
    {"age_years":2.51},{"breed":"other"},{"color_description":"other"},{"help_summary":"Different help"},
    {"stated_contribution_amount":25.001},{"transportation_notes":"other"},{"additional_information":"other"},
    {"rabies_status":"current"},{"prevention_use_status":"using"},{"prevention_product":"other"},
    {"medical_concerns":"other"},{"last_heat_cycle_notes":"other"},{"available_days":["tuesday"]}
  ]'::jsonb) loop
    perform pg_temp.expect_error(format('select * from pg_temp.submit(%L,%L)',
      (select k from submission_test_state), change), 'PT409');
  end loop;
end; $$;
select pg_temp.expect_error('select * from pg_temp.submit(null)', 'PT422');
select pg_temp.expect_error('select * from pg_temp.submit(gen_random_uuid(), ''{"available_days":["monday","monday"]}'')', 'PT422');
select pg_temp.expect_error('select * from pg_temp.submit(gen_random_uuid(), ''{"age_years":"NaN"}'')', 'PT422');
reset role;
select pg_temp.assert_true(pg_temp.counts() = (select after_counts from submission_test_state), 'conflicts/invalid inputs add nothing');

-- Force a failure at the final entity stage, AFTER receipt and early inserts.
create function public.test_reject_submission_availability() returns trigger language plpgsql as $$
begin
  if current_setting('mmac.test_fail_submission',true) = 'yes' then
    raise exception 'Injected test failure' using errcode = '23514';
  end if;
  return new;
end; $$;
create trigger test_reject_submission_availability before insert on public.request_availability
  for each row execute function public.test_reject_submission_availability();
select set_config('mmac.test_retry_key',gen_random_uuid()::text,true);
select set_config('mmac.test_fail_submission','yes',true);
set local role service_role;
select pg_temp.expect_error($q$select * from pg_temp.submit(current_setting('mmac.test_retry_key')::uuid)$q$, '23514');
reset role;
select pg_temp.assert_true(pg_temp.counts() = (select after_counts from submission_test_state), 'late failure rolls back EVERY entity and receipt');
select set_config('mmac.test_fail_submission','no',true);
set local role service_role;
select * from pg_temp.submit(current_setting('mmac.test_retry_key')::uuid);
reset role;
select pg_temp.assert_true((select count(*) = 1 from public.public_assistance_submission_receipts
  where submission_id = current_setting('mmac.test_retry_key')::uuid), 'same key succeeds after rollback');

-- No orphan receipt may commit; test deferred validation inside a subtransaction.
create function pg_temp.orphan_receipt() returns void language plpgsql as $$ begin
  insert into public.public_assistance_submission_receipts values (gen_random_uuid(),gen_random_uuid(),sha256('test'::bytea),1,now());
  set constraints public.public_submission_request_fk immediate;
end; $$;
select pg_temp.expect_error('select pg_temp.orphan_receipt()', '23503');

-- Exercise the actual audited status RPC, then replay without changing history.
insert into auth.users (id,email) values ('32e315ad-644f-40cc-9030-1f4e48c40c6d','idempotency-test@example.invalid');
select set_config('mmac.test_request',(select assistance_request_id::text from original_receipt),true);
set local role service_role;
select * from public.transition_assistance_request_status(current_setting('mmac.test_request')::uuid,
  'new',0,'under_review',null,'32e315ad-644f-40cc-9030-1f4e48c40c6d','Fictional test actor');
select pg_temp.assert_true((select status = 'new' and assistance_request_id = current_setting('mmac.test_request')::uuid
  from pg_temp.submit((select k from submission_test_state))), 'original receipt replays after status change');
reset role;
select pg_temp.assert_true((select status = 'under_review' and status_version = 1 from public.assistance_requests
  where id = current_setting('mmac.test_request')::uuid), 'replay preserves admin state');
select pg_temp.assert_true((select count(*) = 1 from public.assistance_request_events
  where assistance_request_id = current_setting('mmac.test_request')::uuid), 'replay preserves audit history');

set local role anon;
select pg_temp.expect_error('select * from public.public_assistance_submission_receipts', '42501');
select pg_temp.expect_error('select * from pg_temp.submit(gen_random_uuid())', '42501');
reset role;
set local role authenticated;
select pg_temp.expect_error('select * from public.public_assistance_submission_receipts', '42501');
select pg_temp.expect_error('select * from pg_temp.submit(gen_random_uuid())', '42501');
reset role;
set local role service_role;
select pg_temp.expect_error('select * from public.public_assistance_submission_receipts', '42501');
select pg_temp.expect_error('delete from public.public_assistance_submission_receipts', '42501');
select pg_temp.expect_error('truncate public.public_assistance_submission_receipts', '42501');
select pg_temp.expect_error('update public.public_assistance_submission_receipts set contract_version=1', '42501');
select pg_temp.expect_error('insert into public.public_assistance_submission_receipts default values', '42501');
reset role;
rollback;
