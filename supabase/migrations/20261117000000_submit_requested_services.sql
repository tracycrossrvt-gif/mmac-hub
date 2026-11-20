-- Slice 2a: requested services for a single animal (docs/slice2a-requested-services.md).
-- Apply BEFORE deploying the matching application: the defaulted service inputs keep
-- the currently deployed application on the frozen v1 contract.
begin;

-- 1. Public request options ---------------------------------------------------
alter table public.services
  add column is_public_request_option boolean not null default false;

-- Broad public categories. Staff decide specific services during review. The
-- detailed catalog rows stay non-public. Repeat-safe: an existing row is never
-- overwritten (for example, one later deactivated by staff).
insert into public.services (id, name, slug, description, species_scope, is_active, sort_order, is_public_request_option)
values
  ('50000000-0000-0000-0000-000000000101', 'Surgery', 'surgery', null, 'all', true, 110, true),
  ('50000000-0000-0000-0000-000000000102', 'Medical care', 'medical-care', null, 'all', true, 120, true),
  ('50000000-0000-0000-0000-000000000103', 'Vaccine clinic', 'vaccine-clinic', null, 'all', true, 130, true)
on conflict do nothing;
update public.services set is_public_request_option = true, updated_at = now()
  where slug in ('surgery', 'medical-care', 'vaccine-clinic') and not is_public_request_option;

do $$
begin
  if (select array_agg(id::text || ':' || slug order by slug)
      from public.services where is_public_request_option)
     is distinct from array['50000000-0000-0000-0000-000000000102:medical-care',
       '50000000-0000-0000-0000-000000000101:surgery',
       '50000000-0000-0000-0000-000000000103:vaccine-clinic']
     or exists (select 1 from public.services where is_public_request_option and not is_active) then
    raise exception 'Unexpected public request options; migration rolled back';
  end if;
end;
$$;

-- 2. "Not sure — I'd like advice" (per animal, so Slice 2b can reuse it) -------
alter table public.request_animals
  add column service_advice_requested boolean not null default false;

-- 3. Receipts accept contract v2 ---------------------------------------------
do $$
declare
  v_count bigint;
  v_name text;
begin
  -- Find the constraint by its definition, not its generated name.
  select count(*), min(conname) into v_count, v_name
    from pg_constraint
    where conrelid = 'public.public_assistance_submission_receipts'::regclass
      and contype = 'c' and pg_get_constraintdef(oid) = 'CHECK ((contract_version = 1))';
  if v_count <> 1 then
    raise exception 'Receipt contract_version constraint not found exactly once; migration rolled back';
  end if;
  execute format('alter table public.public_assistance_submission_receipts drop constraint %I', v_name);
end;
$$;
alter table public.public_assistance_submission_receipts
  add constraint public_submission_receipts_contract_version_check check (contract_version in (1, 2));

-- 4. Replace the submission function -------------------------------------------
-- DROP the old signature (never CREATE OR REPLACE alongside it). No CASCADE: an
-- unexpected dependency must stop the migration.
drop function public.submit_public_assistance_request(uuid,text,text,text,text,text,text,text,text,numeric,text,text,text,numeric,text,text,text,text,text,text,text,text[]);

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
  p_available_days text[],
  -- Transitional defaults: an omitted value means the frozen v1 contract.
  p_contract_version smallint default 1,
  p_service_ids uuid[] default '{}',
  p_service_advice_requested boolean default false
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
  v_fingerprint jsonb;
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

  -- Requested-services shape. Separate IF statements: each condition is non-null.
  if p_contract_version is null or p_contract_version not in (1, 2)
     or coalesce(array_ndims(p_service_ids), 1) <> 1 then
    raise exception 'Invalid submission data' using errcode = 'PT422';
  end if;
  if p_contract_version = 1 then
    -- v1 has no service inputs at all.
    if coalesce(cardinality(p_service_ids), 0) <> 0 or coalesce(p_service_advice_requested, false) then
      raise exception 'Invalid submission data' using errcode = 'PT422';
    end if;
  elsif p_service_ids is null or p_service_advice_requested is null
     or cardinality(p_service_ids) > 20
     or exists (select 1 from unnest(p_service_ids) s where s is null)
     or (select count(*) <> count(distinct s) from unnest(p_service_ids) s)
     -- Required: at least one option, or "Not sure — I'd like advice".
     or (cardinality(p_service_ids) = 0 and not p_service_advice_requested)
     -- Species "other" may only ask for advice.
     or (p_species = 'other' and cardinality(p_service_ids) > 0) then
    raise exception 'Invalid submission data' using errcode = 'PT422';
  end if;

  -- v1 canonicalization is FROZEN: these keys and values must keep producing the
  -- same bytes so receipts written before Slice 2a still verify. Text has already
  -- been normalized by the server; optional empty/null values are equivalent.
  -- Numbers ignore display scale, not meaningful pre-rounding precision. Weekday
  -- order is immaterial. JSON exists only transiently; no raw payload is stored.
  -- jsonb_build_object accepts at most 100 arguments; extend with || instead.
  v_fingerprint := jsonb_build_object(
    'contract_version', p_contract_version, 'submission_id', p_submission_id,
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
  );
  if p_contract_version = 2 then
    -- v2: service order is immaterial; the uuid type canonicalizes case and format.
    v_fingerprint := v_fingerprint || jsonb_build_object(
      'service_ids', array(select s::text from unnest(p_service_ids) s order by s),
      'service_advice_requested', p_service_advice_requested
    );
  end if;
  v_hash := pg_catalog.sha256(pg_catalog.convert_to(v_fingerprint::text, 'UTF8'));

  insert into public.public_assistance_submission_receipts
    (submission_id, assistance_request_id, payload_hash, contract_version)
  values (p_submission_id, v_assistance_request_id, v_hash, p_contract_version)
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
    if v_receipt.contract_version <> p_contract_version or v_receipt.payload_hash <> v_hash then
      raise exception 'Submission identifier conflicts with submitted data' using errcode = 'PT409';
    end if;
    -- Original acceptance receipt, never the mutable administrator workflow state.
    return query select v_receipt.assistance_request_id, 'new'::text;
    return;
  end if;

  -- Catalog checks run only for a first-time claim, AFTER the replay branch, so a
  -- committed request always replays even if an option was later deactivated.
  -- Raising here rolls back the claim. Only active public request options for
  -- this species are accepted; detailed staff services are rejected.
  if cardinality(p_service_ids) > 0
     and (select count(*) from public.services s
          where s.id = any(p_service_ids)
            and s.is_active
            and s.is_public_request_option
            and p_species in ('dog', 'cat')
            and s.species_scope in ('all', p_species)) <> cardinality(p_service_ids) then
    raise exception 'Invalid submission data' using errcode = 'PT422';
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
    animal_id,
    service_advice_requested
  )
  values (
    v_assistance_request_id,
    v_animal_id,
    coalesce(p_service_advice_requested, false)
  )
  returning id into v_request_animal_id;

  insert into public.request_animal_services (
    request_animal_id,
    service_id
  )
  select v_request_animal_id, s
  from unnest(coalesce(p_service_ids, array[]::uuid[])) s
  order by s;

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

revoke all on function public.submit_public_assistance_request(uuid,text,text,text,text,text,text,text,text,numeric,text,text,text,numeric,text,text,text,text,text,text,text,text[],smallint,uuid[],boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_public_assistance_request(uuid,text,text,text,text,text,text,text,text,numeric,text,text,text,numeric,text,text,text,text,text,text,text,text[],smallint,uuid[],boolean) to service_role;

-- 5. Read access the application needs ----------------------------------------
-- Inspect effective privileges BEFORE adding any existing-table grant; existing
-- table-level, column-level and inherited privileges count. Nothing is revoked.
do $$
declare
  required record;
begin
  for required in
    select t.table_name, unnest(t.columns) as column_name
    from (values
      ('services', array['id', 'name', 'species_scope', 'is_active', 'sort_order', 'is_public_request_option']),
      ('request_animals', array['service_advice_requested'])
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

-- 6. Post-conditions -------------------------------------------------------------
do $$
declare
  app_role text;
  object_owner oid;
  rpc_oid oid := 'public.submit_public_assistance_request(uuid,text,text,text,text,text,text,text,text,numeric,text,text,text,numeric,text,text,text,text,text,text,text,text[],smallint,uuid[],boolean)'::regprocedure;
begin
  if current_user in ('anon','authenticated','service_role') then
    raise exception 'Trusted migration owner required';
  end if;
  -- Overload guard (same as 20261012000000): exactly one function by this name.
  if to_regprocedure('public.submit_public_assistance_request(uuid,text,text,text,text,text,text,text,text,numeric,text,text,text,numeric,text,text,text,text,text,text,text,text[])') is not null
     or to_regprocedure('public.submit_public_assistance_request(text,text,text,text,text,text,text,text,numeric,text,text,text,numeric,text,text,text,text,text,text,text,text[])') is not null
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
        'public.assistance_requests'::regclass, 'public.services'::regclass,
        'public.request_animals'::regclass, 'public.request_animal_services'::regclass)
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
  if not has_column_privilege('service_role', 'public.services', 'is_public_request_option', 'SELECT')
     or not has_column_privilege('service_role', 'public.request_animals', 'service_advice_requested', 'SELECT') then
    raise exception 'service_role requires option and advice SELECT; migration rolled back';
  end if;
end;
$$;
notify pgrst, 'reload schema';
commit;
