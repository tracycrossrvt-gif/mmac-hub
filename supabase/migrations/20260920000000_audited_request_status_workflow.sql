-- Apply only after reviewing unit4_privileges.sql against the target database.
-- Abort (and roll back) on unexpected broad/inherited access; do not guess which
-- unrelated grants or memberships to revoke. Pause admin decisions during rollout.
begin;

alter table public.assistance_requests
  add column status_version integer not null default 0 check (status_version >= 0);

-- One authoritative SQL transition predicate for both RPC and event constraints.
create function public.is_assistance_request_transition_allowed(old_status text, new_status text)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select coalesce(
    (old_status = 'new' and new_status = 'under_review')
    or (old_status = 'under_review' and new_status in ('needs_info', 'accepted', 'referred', 'unable_to_assist'))
    or (old_status = 'needs_info' and new_status in ('under_review', 'accepted', 'referred', 'unable_to_assist')),
    false
  );
$$;
revoke all on function public.is_assistance_request_transition_allowed(text, text)
  from public, anon, authenticated, service_role;
-- Needed when service_role's interaction INSERT evaluates CHECK constraints.
grant execute on function public.is_assistance_request_transition_allowed(text, text) to service_role;

alter table public.assistance_request_events
  drop constraint assistance_request_events_event_type_check,
  drop constraint interaction_contact_result_valid,
  alter column interaction_type drop not null,
  add column old_status text,
  add column new_status text,
  add column status_version integer,
  add constraint assistance_request_events_event_type_check check (event_type in ('interaction', 'status_change')),
  add constraint assistance_request_event_shape check ((
    (event_type = 'interaction'
      and interaction_type is not null
      and old_status is null and new_status is null and status_version is null
      and (
        (interaction_type = 'note' and contact_result is null)
        or (interaction_type = 'call' and contact_result is not null
          and contact_result in ('contacted', 'left_message', 'no_answer', 'other'))
        or (interaction_type in ('text', 'email') and contact_result is not null
          and contact_result in ('sent', 'received', 'other'))
      ))
    or (event_type = 'status_change'
      and interaction_type is null and contact_result is null and case_outcome is null
      and old_status is not null and new_status is not null and status_version is not null
      and status_version > 0
      and public.is_assistance_request_transition_allowed(old_status, new_status))
  ) is true);

create unique index assistance_request_events_status_version_idx
  on public.assistance_request_events (assistance_request_id, status_version)
  where event_type = 'status_change';

-- Preserve Unit 3 backdating/audit semantics for interactions. Status timestamps
-- are generated AFTER the RPC obtains the request lock, never from client time or
-- statement-start time (a competing transaction may have held the lock for ages).
create or replace function public.validate_assistance_request_event_insert()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  request_created_at timestamptz;
begin
  select created_at into request_created_at
  from public.assistance_requests where id = new.assistance_request_id;
  if not found then
    raise exception 'Request does not exist' using errcode = '23503';
  end if;
  if new.event_type = 'status_change' then
    new.created_at := clock_timestamp();
    new.occurred_at := new.created_at;
  else
    new.created_at := statement_timestamp();
  end if;
  if new.occurred_at < request_created_at
     or new.occurred_at > new.created_at + interval '2 minutes' then
    raise exception 'Event occurrence is outside the permitted range' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function public.transition_assistance_request_status(
  p_request_id uuid, p_expected_status text, p_expected_version integer,
  p_new_status text, p_reason text, p_actor_user_id uuid, p_actor_label text
)
returns table (status text, status_version integer)
language plpgsql security definer set search_path = '' as $$
declare
  current_request public.assistance_requests%rowtype;
  normalized_reason text;
  next_version integer;
begin
  -- Actor identity is supplied ONLY by the verified server action. The FK confirms
  -- existence, not MMAC authorization; access to this RPC is infrastructure trust.
  if p_actor_user_id is null or p_actor_label is null or p_actor_label !~ '[^[:space:]]'
     or p_expected_status is null or p_expected_version is null or p_expected_version < 0 then
    raise exception 'Invalid transition input' using errcode = 'PT422';
  end if;

  select r.* into current_request from public.assistance_requests r
  where r.id = p_request_id for update;
  if not found then
    raise exception 'Request does not exist' using errcode = 'PT404';
  end if;
  if current_request.status is distinct from p_expected_status
     or current_request.status_version is distinct from p_expected_version then
    raise exception 'Request status or version has changed' using errcode = 'PT409';
  end if;
  if not public.is_assistance_request_transition_allowed(current_request.status, p_new_status) then
    raise exception 'Transition is not permitted' using errcode = 'PT422';
  end if;

  normalized_reason := regexp_replace(coalesce(p_reason, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  if current_request.status = 'new' and normalized_reason = '' then
    normalized_reason := 'Review started.';
  end if;
  if normalized_reason !~ '[^[:space:]]' or char_length(normalized_reason) > 10000 then
    raise exception 'A reason of at most 10000 characters is required' using errcode = 'PT422';
  end if;

  next_version := current_request.status_version + 1;
  update public.assistance_requests r
    set status = p_new_status, status_version = next_version, updated_at = clock_timestamp()
    where r.id = p_request_id;
  insert into public.assistance_request_events
    (assistance_request_id, event_type, old_status, new_status, status_version, notes, actor_user_id, actor_label)
  values (p_request_id, 'status_change', current_request.status, p_new_status, next_version,
    normalized_reason, p_actor_user_id, p_actor_label);
  -- No exception handler: ANY failure rolls back both writes. Locks last through
  -- the surrounding transaction; PostgREST executes each RPC in one transaction.
  return query select p_new_status, next_version;
end;
$$;

revoke all on function public.transition_assistance_request_status(uuid, text, integer, text, text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.transition_assistance_request_status(uuid, text, integer, text, text, uuid, text)
  to service_role;

-- Remove only the known application grant. Broader table/inherited permissions
-- override a column-level revoke, so the assertions below MUST also pass.
revoke update (status, status_version) on public.assistance_requests from service_role;

do $$
declare
  app_role text;
  audit_column text;
  owner_oid oid;
begin
  if current_user in ('anon', 'authenticated', 'service_role') then
    raise exception 'Apply this migration as the trusted database owner';
  end if;
  foreach app_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_column_privilege(app_role, 'public.assistance_requests', 'status', 'UPDATE')
       or has_column_privilege(app_role, 'public.assistance_requests', 'status_version', 'UPDATE')
       or has_column_privilege(app_role, 'public.assistance_requests', 'status', 'INSERT')
       or has_column_privilege(app_role, 'public.assistance_requests', 'status_version', 'INSERT') then
      raise exception 'Unexpected effective status write access for %. Inspect grants/memberships; migration rolled back.', app_role;
    end if;
    if has_any_column_privilege(app_role, 'public.assistance_request_events', 'UPDATE')
       or has_table_privilege(app_role, 'public.assistance_request_events', 'DELETE,TRUNCATE') then
      raise exception 'Unexpected history rewrite access for %. Inspect privileges; migration rolled back.', app_role;
    end if;
    foreach audit_column in array array['id', 'event_type', 'old_status', 'new_status', 'status_version', 'created_at'] loop
      if has_column_privilege(app_role, 'public.assistance_request_events', audit_column, 'INSERT') then
        raise exception 'Unexpected audit-field INSERT access for %.%. Migration rolled back.', app_role, audit_column;
      end if;
    end loop;
    -- Effective ACL checks alone cannot rule out assuming an owning role.
    for owner_oid in
      select relowner from pg_class where oid in ('public.assistance_requests'::regclass, 'public.assistance_request_events'::regclass)
      union select proowner from pg_proc where oid = 'public.transition_assistance_request_status(uuid,text,integer,text,text,uuid,text)'::regprocedure
    loop
      if pg_has_role(app_role, owner_oid, 'MEMBER') then
        raise exception 'Application role % can assume an owner role. Migration rolled back.', app_role;
      end if;
    end loop;
    if app_role <> 'service_role' and has_function_privilege(app_role,
      'public.transition_assistance_request_status(uuid,text,integer,text,text,uuid,text)', 'EXECUTE') then
      raise exception 'Unexpected RPC access for %. Migration rolled back.', app_role;
    end if;
  end loop;
  if not has_function_privilege('service_role',
    'public.transition_assistance_request_status(uuid,text,integer,text,text,uuid,text)', 'EXECUTE') then
    raise exception 'service_role requires transition RPC execution';
  end if;
end;
$$;

commit;
