create or replace function public.submit_public_assistance_request(
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
returns table (
  assistance_request_id uuid,
  person_id uuid,
  animal_id uuid,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person_id uuid;
  v_household_id uuid;
  v_animal_id uuid;
  v_assistance_request_id uuid;
  v_request_animal_id uuid;
  v_day text;
begin
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
    requester_person_id,
    household_id,
    help_summary,
    stated_contribution_amount,
    transportation_notes,
    additional_information
  )
  values (
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

  return query
  select
    v_assistance_request_id,
    v_person_id,
    v_animal_id,
    'new'::text;
end;
$$;

revoke all on function public.submit_public_assistance_request(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  text,
  text,
  text,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text[]
) from public;

revoke all on function public.submit_public_assistance_request(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  text,
  text,
  text,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text[]
) from anon;

revoke all on function public.submit_public_assistance_request(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  text,
  text,
  text,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text[]
) from authenticated;

grant execute on function public.submit_public_assistance_request(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  text,
  text,
  text,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text[]
) to service_role;