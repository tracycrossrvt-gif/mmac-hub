create table public.assistance_request_events (
  id uuid primary key default gen_random_uuid(),
  assistance_request_id uuid not null references public.assistance_requests(id) on delete restrict,
  event_type text not null default 'interaction' check (event_type = 'interaction'),
  interaction_type text not null check (interaction_type in ('call', 'text', 'email', 'note')),
  contact_result text,
  case_outcome text check (case_outcome in (
    'care_established', 'awaiting_information', 'follow_up_needed',
    'referred_elsewhere', 'unable_to_establish_care', 'no_further_action_needed'
  )),
  notes text not null check (notes ~ '[^[:space:]]' and char_length(notes) <= 10000),
  occurred_at timestamptz not null default statement_timestamp() check (isfinite(occurred_at)),
  created_at timestamptz not null default statement_timestamp() check (isfinite(created_at)),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_label text not null check (actor_label ~ '[^[:space:]]'),
  constraint interaction_contact_result_valid check (
    (interaction_type = 'note' and contact_result is null)
    or (interaction_type = 'call' and contact_result is not null
      and contact_result in ('contacted', 'left_message', 'no_answer', 'other'))
    or (interaction_type in ('text', 'email') and contact_result is not null
      and contact_result in ('sent', 'received', 'other'))
  )
);

create index assistance_request_events_timeline_idx
  on public.assistance_request_events (assistance_request_id, occurred_at desc, created_at desc, id desc);

-- CHECK constraints cannot safely read a different table. Validate the parent
-- creation boundary at insertion; application users cannot change that timestamp.
-- SECURITY INVOKER: this function does not confer any additional authority.
create function public.validate_assistance_request_event_insert()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  request_created_at timestamptz;
begin
  select created_at into request_created_at
  from public.assistance_requests where id = new.assistance_request_id;
  if not found then
    raise exception 'Request does not exist' using errcode = '23503';
  end if;
  new.created_at := statement_timestamp();
  if new.occurred_at < request_created_at
     or new.occurred_at > new.created_at + interval '2 minutes' then
    raise exception 'Interaction occurrence is outside the permitted range' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_assistance_request_event_insert()
  from public, anon, authenticated, service_role;

create trigger validate_assistance_request_event_insert
  before insert on public.assistance_request_events
  for each row execute function public.validate_assistance_request_event_insert();

alter table public.assistance_request_events enable row level security;
-- Clear default grants on this NEW table only, then grant the application exactly
-- its read/append privileges. RLS has no direct-client policies for case history.
revoke all on public.assistance_request_events from public, anon, authenticated, service_role;
grant select on public.assistance_request_events to service_role;
grant insert (assistance_request_id, interaction_type, contact_result, case_outcome,
  notes, occurred_at, actor_user_id, actor_label)
  on public.assistance_request_events to service_role;

-- Inspect effective privileges BEFORE adding any existing-table grant. A table
-- grant or inherited grant already covering a column makes this a no-op for it.
-- No public policies, role membership, or existing write grants are changed.
do $$
declare
  required record;
begin
  for required in
    select t.table_name, unnest(t.columns) as column_name
    from (values
      ('service_areas', array['id', 'name', 'state']),
      ('services', array['id', 'name', 'description']),
      ('request_animal_services', array['id', 'request_animal_id', 'service_id', 'notes']),
      ('prescreen_diagnostics', array['id', 'prescreen_id', 'diagnostic_type', 'status', 'notes'])
    ) as t(table_name, columns)
  loop
    if has_column_privilege('service_role', 'public.' || required.table_name, required.column_name, 'SELECT') then
      raise notice 'Existing SELECT covers %.%', required.table_name, required.column_name;
    else
      raise notice 'Adding SELECT on %.% for service_role', required.table_name, required.column_name;
      execute format('grant select (%I) on public.%I to service_role', required.column_name, required.table_name);
    end if;
  end loop;
end;
$$;
