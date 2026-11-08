-- Requires reviewed public_submission_privileges.sql results. Pause intake,
-- drain old requests and deploy the matching application before reopening.
begin;

create table public.public_assistance_submission_receipts (
  submission_id uuid primary key,
  assistance_request_id uuid not null unique,
  payload_hash bytea not null check (octet_length(payload_hash) = 32),
  contract_version smallint not null check (contract_version = 1),
  created_at timestamptz not null default statement_timestamp(),
  constraint public_submission_request_fk foreign key (assistance_request_id)
    references public.assistance_requests(id) on delete restrict
    deferrable initially deferred
);
alter table public.public_assistance_submission_receipts enable row level security;
revoke all on public.public_assistance_submission_receipts from public, anon, authenticated, service_role;

-- No CASCADE: an unexpected dependency must stop the migration.
drop function public.submit_public_assistance_request(text,text,text,text,text,text,text,text,numeric,text,text,text,numeric,text,text,text,text,text,text,text,text[]);

create function public.submit_public_assistance_request(
  p_submission_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_animal_name text,
  p_species text,
  p_sex text,
  p_altered_status text,
  p_age_years numeric,
  p_breed text,
  p_color_description text,
  p_help_summary text,
  p_stated_contribution_amount numeric,
  p_transportation_notes text,
  p_additional_information text,
  p_rabies_status text,
  p_prevention_use_status text,
  p_prevention_product text,
  p_medical_concerns text,
  p_last_heat_cycle_notes text,
  p_available_days text[]
)
returns table (assistance_request_id uuid, status text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_person_id uuid;
  v_household_id uuid;
  v_animal_id uuid;
  v_assistance_request_id uuid := gen_random_uuid();
  v_request_animal_id uuid;
  v_day text;
  v_claimed_id uuid;
  v_hash bytea;
  v_receipt public.public_assistance_submission_receipts%rowtype;
begin
  if p_submission_id is null then
    raise exception 'Invalid submission identifier' using errcode = 'PT422';
  end if;
  -- Server validation remains authoritative for the public form. These checks
  -- also reject invalid typed RPC inputs before replay lookup or entity creation.
  if p_first_name is null or btrim(p_first_name) = ''
     or p_last_name is null or btrim(p_last_name) = ''
     or (coalesce(btrim(p_phone), '') = '' and coalesce(btrim(p_email), '') = '')
     or p_help_summary is null or char_length(btrim(p_help_summary)) < 5
     or p_species is null or p_species not in ('dog','cat','other')
     or p_sex is null or p_sex not in ('male','female','unknown')
     or p_altered_status is null or p_altered_status not in ('altered','unaltered','unknown')
     or p_rabies_status is null or p_rabies_status not in ('current','not_current','unknown')
     or p_prevention_use_status is null or p_prevention_use_status not in ('using','not_using','unknown')
     or (p_sex = 'female' and p_altered_status = 'unaltered' and coalesce(btrim(p_last_heat_cycle_notes), '') = '')
     or p_age_years < 0 or p_age_years > 999.9
     or p_stated_contribution_amount < 0 or p_stated_contribution_amount > 99999999.99
     or cardinality(p_available_days) > 7
     or exists (select 1 from unnest(p_available_days) d where d is null or d not in
       ('monday','tuesday','wednesday','thursday','friday','saturday','sunday'))
     or (select count(*) <> count(distinct d) from unnest(p_available_days) d) then
    raise exception 'Invalid submission data' using errcode = 'PT422';
  end if;

  -- Freeze v1 canonicalization. Text has already been normalized by the server;
  -- optional empty/null values are equivalent. Numbers ignore display scale,
  -- not meaningful pre-rounding precision. Weekday order is immaterial.
  -- JSON exists only transiently; the receipt stores no raw business payload.
  v_hash := pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_object(
    'contract_version', 1, 'submission_id', p_submission_id,
    'first_name', nullif(p_first_name, ''),
    'last_name', nullif(p_last_name, ''),
    'phone', nullif(p_phone, ''),
    'email', nullif(p_email, ''),
    'animal_name', nullif(p_animal_name, ''),
    'species', nullif(p_species, ''),
    'sex', nullif(p_sex, ''),
    'altered_status', nullif(p_altered_status, ''),
    'age_years', pg_catalog.trim_scale(p_age_years),
    'breed', nullif(p_breed, ''),
    'color_description', nullif(p_color_description, ''),
    'help_summary', nullif(p_help_summary, ''),
    'stated_contribution_amount', pg_catalog.trim_scale(p_stated_contribution_amount),
    'transportation_notes', nullif(p_transportation_notes, ''),
    'additional_information', nullif(p_additional_information, ''),
    'rabies_status', nullif(p_rabies_status, ''),
    'prevention_use_status', nullif(p_prevention_use_status, ''),
    'prevention_product', nullif(p_prevention_product, ''),
    'medical_concerns', nullif(p_medical_concerns, ''),
    'last_heat_cycle_notes', nullif(p_last_heat_cycle_notes, ''),
    'available_days', array(select d from unnest(coalesce(p_available_days, array[]::text[])) d order by d collate "C")
  )::text, 'UTF8'));

  insert into public.public_assistance_submission_receipts
    (submission_id, assistance_request_id, payload_hash, contract_version)
  values (p_submission_id, v_assistance_request_id, v_hash, 1)
  on conflict (submission_id) do nothing
  returning public_assistance_submission_receipts.assistance_request_id into v_claimed_id;

  if v_claimed_id is null then
    -- A NEW statement snapshot is essential after ON CONFLICT waits for another
    -- transaction. Do not combine this read with the INSERT in a CTE.
    select r.* into v_receipt from public.public_assistance_submission_receipts r
      where r.submission_id = p_submission_id;
    if not found then
      raise exception 'Submission receipt unavailable' using errcode = '40001';
    end if;
    if v_receipt.contract_version <> 1 or v_receipt.payload_hash <> v_hash then
      raise exception 'Submission identifier conflicts with submitted data' using errcode = 'PT409';
    end if;
    -- Original acceptance receipt, never the mutable administrator workflow state.
    return query select v_receipt.assistance_request_id, 'new'::text;
    return;
  end if;

  insert into public.people (
    first_name,
    last_name,
    phone,
    email
  )
  values (
    p_first_name,
    p_last_name,
    nullif(p_phone, ''),
    nullif(p_email, '')
  )
  returning id into v_person_id;

  insert into public.households (
    name
  )
  values (
    p_last_name || ' Household'
  )
  returning id into v_household_id;

  insert into public.household_members (
    household_id,
    person_id,
    is_primary_contact
  )
  values (
    v_household_id,
    v_person_id,
    true
  );

  insert into public.animals (
    household_id,
    name,
    species,
    sex,
    altered_status,
    age_years,
    breed,
    color_description
  )
  values (
    v_household_id,
    nullif(p_animal_name, ''),
    p_species,
    p_sex,
    p_altered_status,
    p_age_years,
    nullif(p_breed, ''),
    nullif(p_color_description, '')
  )
  returning id into v_animal_id;

  insert into public.assistance_requests (
    id,
    requester_person_id,
    household_id,
    help_summary,
    stated_contribution_amount,
    transportation_notes,
    additional_information
  )
  values (
    v_assistance_request_id,
    v_person_id,
    v_household_id,
    p_help_summary,
    p_stated_contribution_amount,
    nullif(p_transportation_notes, ''),
    nullif(p_additional_information, '')
  )
  returning id into v_assistance_request_id;

  insert into public.request_animals (
    assistance_request_id,
    animal_id
  )
  values (
    v_assistance_request_id,
    v_animal_id
  )
  returning id into v_request_animal_id;

  insert into public.prescreens (
    request_animal_id,
    rabies_status,
    prevention_use_status,
    prevention_product,
    medical_concerns,
    last_heat_cycle_notes
  )
  values (
    v_request_animal_id,
    p_rabies_status,
    p_prevention_use_status,
    nullif(p_prevention_product, ''),
    nullif(p_medical_concerns, ''),
    nullif(p_last_heat_cycle_notes, '')
  );

  foreach v_day in array coalesce(p_available_days, array[]::text[])
  loop
    insert into public.request_availability (
      assistance_request_id,
      day_of_week
    )
    values (
      v_assistance_request_id,
      v_day
    );
  end loop;


  -- The deferred FK forbids an orphan claim at commit. Any error rolls back the
  -- claim AND all entity writes. There is deliberately no exception suppression.
  return query select v_assistance_request_id, 'new'::text;
end;
$$;

revoke all on function public.submit_public_assistance_request(uuid,text,text,text,text,text,text,text,text,numeric,text,text,text,numeric,text,text,text,text,text,text,text,text[])
  from public, anon, authenticated, service_role;
grant execute on function public.submit_public_assistance_request(uuid,text,text,text,text,text,text,text,text,numeric,text,text,text,numeric,text,text,text,text,text,text,text,text[]) to service_role;

do $$
declare
  app_role text;
  object_owner oid;
  rpc_oid oid := 'public.submit_public_assistance_request(uuid,text,text,text,text,text,text,text,text,numeric,text,text,text,numeric,text,text,text,text,text,text,text,text[])'::regprocedure;
begin
  if current_user in ('anon','authenticated','service_role') then
    raise exception 'Trusted migration owner required';
  end if;
  if to_regprocedure('public.submit_public_assistance_request(text,text,text,text,text,text,text,text,numeric,text,text,text,numeric,text,text,text,text,text,text,text,text[])') is not null
     or (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'submit_public_assistance_request') <> 1 then
    raise exception 'Unexpected submission overload; migration rolled back';
  end if;
  foreach app_role in array array['anon','authenticated','service_role'] loop
    if has_any_column_privilege(app_role, 'public.public_assistance_submission_receipts', 'SELECT')
       or has_any_column_privilege(app_role, 'public.public_assistance_submission_receipts', 'INSERT')
       or has_any_column_privilege(app_role, 'public.public_assistance_submission_receipts', 'UPDATE')
       or has_any_column_privilege(app_role, 'public.public_assistance_submission_receipts', 'REFERENCES')
       or has_table_privilege(app_role, 'public.public_assistance_submission_receipts', 'DELETE,TRUNCATE,TRIGGER') then
      raise exception 'Unexpected receipt access for %', app_role;
    end if;
    -- Do not silently revoke unexpected existing-table grants.
    if has_any_column_privilege(app_role, 'public.assistance_requests', 'INSERT') then
      raise exception 'Unexpected direct case creation access for %', app_role;
    end if;
    for object_owner in
      select relowner from pg_class where oid in ('public.public_assistance_submission_receipts'::regclass,
        'public.assistance_requests'::regclass)
      union select proowner from pg_proc where oid = rpc_oid
    loop
      if pg_has_role(app_role, object_owner, 'MEMBER') then
        raise exception 'Application role % can assume an owner', app_role;
      end if;
    end loop;
    if has_function_privilege(app_role, rpc_oid, 'EXECUTE') <> (app_role = 'service_role') then
      raise exception 'Unexpected submission execution access for %', app_role;
    end if;
  end loop;
end;
$$;
notify pgrst, 'reload schema';
commit;
