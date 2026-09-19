-- Run as postgres against a DEVELOPMENT database after applying the migration.
-- All synthetic rows and helper functions roll back, including the credential-free
-- Auth fixture. This does not create a usable login or touch real case records.
begin;

create function pg_temp.assert_true(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAIL: %', message; end if;
end; $$;

create function pg_temp.expect_error(statement text, expected_state text) returns void
language plpgsql as $$ begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_state then return; end if;
    raise;
  end;
  raise exception 'Expected SQLSTATE % but statement succeeded', expected_state;
end; $$;

select set_config('mmac.test_actor', gen_random_uuid()::text, true);
select set_config('mmac.test_request', gen_random_uuid()::text, true);
select set_config('mmac.test_person', gen_random_uuid()::text, true);
insert into auth.users (id, email) values (current_setting('mmac.test_actor')::uuid, 'unit3-fixture@example.invalid');
insert into public.people (id, first_name, last_name)
values (current_setting('mmac.test_person')::uuid, 'Unit3', 'Fixture');
insert into public.assistance_requests (id, requester_person_id, created_at, submitted_at)
values (current_setting('mmac.test_request')::uuid, current_setting('mmac.test_person')::uuid,
  statement_timestamp() - interval '2 days', statement_timestamp() - interval '2 days');

create function pg_temp.add_event(kind text, result text, note text default 'Test interaction',
  occurred timestamptz default statement_timestamp(), outcome text default null) returns uuid
language plpgsql security invoker as $$ declare event_id uuid; begin
  insert into public.assistance_request_events
    (assistance_request_id, interaction_type, contact_result, notes, occurred_at, case_outcome, actor_user_id, actor_label)
  values (current_setting('mmac.test_request')::uuid, kind, result, note, occurred, outcome,
    current_setting('mmac.test_actor')::uuid, 'Test administrator') returning id into event_id;
  return event_id;
end; $$;

select pg_temp.assert_true((select relrowsecurity from pg_class where oid = 'public.assistance_request_events'::regclass), 'RLS enabled');
select pg_temp.assert_true(not has_table_privilege('anon', 'public.assistance_request_events', 'SELECT'), 'anon has no read grant');
select pg_temp.assert_true(not has_table_privilege('authenticated', 'public.assistance_request_events', 'SELECT'), 'authenticated has no read grant');
select pg_temp.assert_true(not has_table_privilege('service_role', 'public.assistance_request_events', 'UPDATE'), 'service role cannot update');
select pg_temp.assert_true(not has_table_privilege('service_role', 'public.assistance_request_events', 'DELETE'), 'service role cannot delete');
select pg_temp.assert_true(not has_table_privilege('service_role', 'public.assistance_request_events', 'TRUNCATE'), 'service role cannot truncate');
select pg_temp.assert_true(not has_column_privilege('service_role', 'public.assistance_request_events', 'created_at', 'INSERT'), 'audit time cannot be supplied');
select pg_temp.assert_true(not has_column_privilege('service_role', 'public.assistance_request_events', 'event_type', 'INSERT'), 'event kind cannot be supplied');

set local role service_role;
select pg_temp.add_event('call', 'contacted');
select pg_temp.add_event('call', 'left_message');
select pg_temp.add_event('call', 'no_answer');
select pg_temp.add_event('call', 'other');
select pg_temp.add_event('text', 'sent');
select pg_temp.add_event('text', 'received');
select pg_temp.add_event('text', 'other');
select pg_temp.add_event('email', 'sent');
select pg_temp.add_event('email', 'received');
select pg_temp.add_event('email', 'other');
select pg_temp.add_event('note', null);
select pg_temp.add_event('note', null, 'Backdated', statement_timestamp() - interval '1 day');
select pg_temp.add_event('note', null, 'At request creation',
  (select created_at from public.assistance_requests where id = current_setting('mmac.test_request')::uuid));
select pg_temp.add_event('note', null, 'Small clock difference', statement_timestamp() + interval '1 minute');
select pg_temp.add_event('call', 'contacted', 'Outcome', statement_timestamp(), outcome)
from unnest(array['care_established', 'awaiting_information', 'follow_up_needed', 'referred_elsewhere',
  'unable_to_establish_care', 'no_further_action_needed']) as outcome;

select pg_temp.expect_error($q$select pg_temp.add_event('call', null)$q$, '23514');
select pg_temp.expect_error($q$select pg_temp.add_event('call', 'sent')$q$, '23514');
select pg_temp.expect_error($q$select pg_temp.add_event('note', 'contacted')$q$, '23514');
select pg_temp.expect_error($q$select pg_temp.add_event('text', 'no_answer')$q$, '23514');
select pg_temp.expect_error($q$select pg_temp.add_event('recording', null)$q$, '23514');
select pg_temp.expect_error($q$select pg_temp.add_event('note', null, E' \n\t')$q$, '23514');
select pg_temp.expect_error($q$select pg_temp.add_event('note', null, repeat('x', 10001))$q$, '23514');
select pg_temp.expect_error($q$select pg_temp.add_event('note', null, 'Before request', statement_timestamp() - interval '3 days')$q$, '23514');
select pg_temp.expect_error($q$select pg_temp.add_event('note', null, 'Future', statement_timestamp() + interval '3 minutes')$q$, '23514');
select pg_temp.expect_error($q$select pg_temp.add_event('note', null, 'Infinite time', 'infinity')$q$, '23514');
select pg_temp.expect_error($q$select pg_temp.add_event('note', null, 'Invalid outcome', statement_timestamp(), 'accepted')$q$, '23514');
select pg_temp.expect_error($q$update public.assistance_request_events set notes = 'Rewrite'$q$, '42501');
select pg_temp.expect_error($q$delete from public.assistance_request_events$q$, '42501');
select pg_temp.expect_error($q$truncate public.assistance_request_events$q$, '42501');
select pg_temp.expect_error($q$insert into public.assistance_request_events
  (assistance_request_id, interaction_type, notes, actor_user_id, actor_label, created_at)
  values (current_setting('mmac.test_request')::uuid, 'note', 'Forged audit', current_setting('mmac.test_actor')::uuid,
    'Test', '2000-01-01')$q$, '42501');
select pg_temp.expect_error($q$insert into public.assistance_request_events
  (assistance_request_id, interaction_type, notes, actor_user_id, actor_label)
  values (current_setting('mmac.test_request')::uuid, 'note', 'Missing actor', gen_random_uuid(), 'Test')$q$, '23503');
select pg_temp.expect_error($q$insert into public.assistance_request_events
  (assistance_request_id, interaction_type, notes, actor_user_id, actor_label)
  values (gen_random_uuid(), 'note', 'Missing request', current_setting('mmac.test_actor')::uuid, 'Test')$q$, '23503');

select pg_temp.assert_true((select count(*) = 20 from public.assistance_request_events
  where assistance_request_id = current_setting('mmac.test_request')::uuid), '20 valid interactions persisted');
select pg_temp.assert_true((select status = 'new' from public.assistance_requests
  where id = current_setting('mmac.test_request')::uuid), 'outcomes did not change request status');
select pg_temp.assert_true((select bool_and(created_at > statement_timestamp() - interval '5 minutes')
  from public.assistance_request_events where assistance_request_id = current_setting('mmac.test_request')::uuid), 'audit timestamps are current');

reset role;
set local role anon;
select pg_temp.expect_error($q$select * from public.assistance_request_events$q$, '42501');
select pg_temp.expect_error($q$select pg_temp.add_event('note', null)$q$, '42501');
reset role;
set local role authenticated;
select pg_temp.expect_error($q$select * from public.assistance_request_events$q$, '42501');
select pg_temp.expect_error($q$select pg_temp.add_event('note', null)$q$, '42501');
reset role;
select pg_temp.expect_error($q$delete from public.assistance_requests where id = current_setting('mmac.test_request')::uuid$q$, '23503');
select pg_temp.expect_error($q$delete from auth.users where id = current_setting('mmac.test_actor')::uuid$q$, '23503');
select 'Unit 3 database assertions passed; rolling back fixtures.' as result;
rollback;
