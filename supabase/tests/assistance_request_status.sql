-- DEVELOPMENT DB ONLY, as postgres after the Unit 4 migration. No live credentials
-- or real cases. Every fixture and helper rolls back. psql: -v ON_ERROR_STOP=1.
-- This is a single-connection suite; see docs/unit4-acceptance.md for concurrency.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAIL: %', message; end if;
end; $$;
create function pg_temp.expect_error(statement text, expected_state text) returns void
language plpgsql as $$ begin
  begin execute statement;
  exception when others then
    if sqlstate = expected_state then return; end if;
    raise;
  end;
  raise exception 'Expected SQLSTATE % but statement succeeded', expected_state;
end; $$;
select set_config('mmac.test_actor', gen_random_uuid()::text, true);
select set_config('mmac.test_person', gen_random_uuid()::text, true);
select set_config('mmac.test_request', gen_random_uuid()::text, true);
insert into auth.users (id, email) values (current_setting('mmac.test_actor')::uuid, 'unit4-fixture@example.invalid');
insert into public.people (id, first_name, last_name) values (current_setting('mmac.test_person')::uuid, 'Unit4', 'Fixture');
insert into public.assistance_requests (id, requester_person_id)
values (current_setting('mmac.test_request')::uuid, current_setting('mmac.test_person')::uuid);

create temp table transition_cases (id uuid, old_status text, new_status text, allowed boolean);
insert into transition_cases
select gen_random_uuid(), old_status, new_status,
  (old_status, new_status) in (('new','under_review'), ('under_review','needs_info'),
    ('under_review','accepted'), ('under_review','referred'), ('under_review','unable_to_assist'),
    ('needs_info','under_review'), ('needs_info','accepted'), ('needs_info','referred'), ('needs_info','unable_to_assist'))
from unnest(array['new','under_review','needs_info','accepted','referred','unable_to_assist']) old_status
cross join unnest(array['new','under_review','needs_info','accepted','referred','unable_to_assist']) new_status;
insert into public.assistance_requests (id, requester_person_id, status)
select id, current_setting('mmac.test_person')::uuid, old_status from transition_cases;
grant select on transition_cases to service_role;

create function pg_temp.transition_case(old_status text, version integer, new_status text, reason text default 'Test decision')
returns void language plpgsql security invoker as $$ begin
  perform * from public.transition_assistance_request_status(current_setting('mmac.test_request')::uuid,
    old_status, version, new_status, reason, current_setting('mmac.test_actor')::uuid, 'Test administrator');
end; $$;

set local role service_role;
do $$ declare t record; begin
  for t in select * from transition_cases loop
    if t.allowed then
      perform * from public.transition_assistance_request_status(t.id, t.old_status, 0, t.new_status,
        case when t.old_status = 'new' then null else E' \n Test reason \t ' end,
        current_setting('mmac.test_actor')::uuid, 'Test administrator');
    else
      perform pg_temp.expect_error(format('select * from public.transition_assistance_request_status(%L,%L,0,%L,%L,%L,%L)',
        t.id, t.old_status, t.new_status, 'Test reason', current_setting('mmac.test_actor'), 'Test administrator'), 'PT422');
    end if;
    perform pg_temp.assert_true((select status = case when t.allowed then t.new_status else t.old_status end
      and status_version = case when t.allowed then 1 else 0 end
      from public.assistance_requests where id = t.id), 'pair status/version');
    perform pg_temp.assert_true((select count(*) = case when t.allowed then 1 else 0 end
      from public.assistance_request_events where assistance_request_id = t.id), 'exactly one event per accepted transition');
    if t.allowed then
      perform pg_temp.assert_true((select old_status = t.old_status and new_status = t.new_status
        and status_version = 1 and event_type = 'status_change'
        and notes = case when t.old_status = 'new' then 'Review started.' else 'Test reason' end
        and interaction_type is null and contact_result is null and case_outcome is null
        and actor_user_id = current_setting('mmac.test_actor')::uuid
        and occurred_at = created_at
        from public.assistance_request_events where assistance_request_id = t.id), 'audit matches accepted transition');
    end if;
  end loop;
end; $$;

-- Force event insertion to fail its Auth FK AFTER the UPDATE in the RPC.
select pg_temp.expect_error(format('select * from public.transition_assistance_request_status(%L,%L,0,%L,%L,%L,%L)',
  current_setting('mmac.test_request'), 'new', 'under_review', '', gen_random_uuid(), 'Invalid actor'), '23503');
select pg_temp.assert_true((select status = 'new' and status_version = 0 and updated_at = created_at
  from public.assistance_requests where id = current_setting('mmac.test_request')::uuid), 'failed audit insert rolled back status, version and timestamp');
select pg_temp.assert_true((select count(*) = 0 from public.assistance_request_events
  where assistance_request_id = current_setting('mmac.test_request')::uuid), 'no partial event');
select pg_temp.transition_case('new', 0, 'under_review', '');
select pg_temp.expect_error($q$select pg_temp.transition_case('new', 0, 'under_review', '')$q$, 'PT409');
select pg_temp.expect_error($q$select pg_temp.transition_case('needs_info', 1, 'accepted')$q$, 'PT409');
select pg_temp.expect_error($q$select pg_temp.transition_case('under_review', 0, 'accepted')$q$, 'PT409');
select pg_temp.expect_error($q$select pg_temp.transition_case('under_review', 1, 'accepted', E' \n\t')$q$, 'PT422');
select pg_temp.expect_error($q$select pg_temp.transition_case('under_review', 1, 'accepted', repeat('x', 10001))$q$, 'PT422');
select pg_temp.expect_error($q$select pg_temp.transition_case('under_review', 1, 'accepted', null)$q$, 'PT422');
select pg_temp.expect_error($q$select pg_temp.transition_case('under_review', null, 'accepted')$q$, 'PT422');
select pg_temp.expect_error($q$select pg_temp.transition_case('under_review', 1, 'completed')$q$, 'PT422');
select pg_temp.transition_case('under_review', 1, 'needs_info');
select pg_temp.transition_case('needs_info', 2, 'under_review');
-- ABA: the status text matches again, but the reviewed version does not.
select pg_temp.expect_error($q$select pg_temp.transition_case('under_review', 1, 'accepted')$q$, 'PT409');

insert into public.assistance_request_events
  (assistance_request_id, interaction_type, contact_result, case_outcome, notes, actor_user_id, actor_label)
values (current_setting('mmac.test_request')::uuid, 'call', 'contacted', 'care_established',
  'Interaction must not decide status', current_setting('mmac.test_actor')::uuid, 'Test administrator');
select pg_temp.assert_true((select status = 'under_review' and status_version = 3
  from public.assistance_requests where id = current_setting('mmac.test_request')::uuid), 'interaction/outcome leave status/version unchanged');
select pg_temp.transition_case('under_review', 3, 'accepted', repeat('x', 10000));
select pg_temp.expect_error($q$select pg_temp.transition_case('accepted', 4, 'under_review')$q$, 'PT422');
select pg_temp.assert_true((select count(*) = 4 from public.assistance_request_events
  where assistance_request_id = current_setting('mmac.test_request')::uuid and event_type = 'status_change'), 'no events for rejected/duplicate/stale requests');

select pg_temp.expect_error($q$update public.assistance_requests set status = 'new'$q$, '42501');
select pg_temp.expect_error($q$update public.assistance_requests set status_version = 0$q$, '42501');
select pg_temp.expect_error($q$update public.assistance_request_events set notes = 'Rewrite'$q$, '42501');
select pg_temp.expect_error($q$delete from public.assistance_request_events$q$, '42501');
select pg_temp.expect_error($q$truncate public.assistance_request_events$q$, '42501');
select pg_temp.expect_error($q$insert into public.assistance_request_events
  (assistance_request_id, event_type, old_status, new_status, status_version, notes, actor_user_id, actor_label)
  values (current_setting('mmac.test_request')::uuid, 'status_change', 'new', 'under_review', 99,
    'Forged', current_setting('mmac.test_actor')::uuid, 'Test')$q$, '42501');
reset role;

-- Exercise constraints as owner (who can supply audit fields); app INSERT cannot.
create function pg_temp.raw_status_event(kind text, old_status text, new_status text, version integer, interaction_type text default null)
returns void language plpgsql as $$ begin
  insert into public.assistance_request_events
    (assistance_request_id, event_type, old_status, new_status, status_version, interaction_type, notes, actor_user_id, actor_label)
  values (current_setting('mmac.test_request')::uuid, kind, old_status, new_status, version, interaction_type,
    'Shape check', current_setting('mmac.test_actor')::uuid, 'Test');
end; $$;
select pg_temp.expect_error($q$select pg_temp.raw_status_event('status_change',null,'under_review',99)$q$, '23514');
select pg_temp.expect_error($q$select pg_temp.raw_status_event('status_change','new','under_review',null)$q$, '23514');
select pg_temp.expect_error($q$select pg_temp.raw_status_event('status_change','new','under_review',0)$q$, '23514');
select pg_temp.expect_error($q$select pg_temp.raw_status_event('status_change','accepted','under_review',99)$q$, '23514');
select pg_temp.expect_error($q$select pg_temp.raw_status_event('status_change','new','under_review',99,'note')$q$, '23514');
select pg_temp.expect_error($q$select pg_temp.raw_status_event('interaction','new','under_review',99,'note')$q$, '23514');
select pg_temp.expect_error($q$select pg_temp.raw_status_event('interaction',null,null,null,null)$q$, '23514');
select pg_temp.expect_error($q$select pg_temp.raw_status_event('status_change','new','under_review',1)$q$, '23505');

set local role anon;
select pg_temp.expect_error($q$select pg_temp.transition_case('accepted',4,'under_review')$q$, '42501');
reset role;
set local role authenticated;
select pg_temp.expect_error($q$select pg_temp.transition_case('accepted',4,'under_review')$q$, '42501');
reset role;
select 'Unit 4 database assertions passed; rolling back fixtures.' as result;
rollback;
