-- OPTIONAL: create one clearly labelled, synthetic two-animal request in a
-- development database for browser acceptance. This script COMMITs its fixture.
-- No Auth users, credentials, existing cases or existing service catalog rows change.
begin;
do $$
declare
  person_id uuid;
  request_id uuid;
  dog_id uuid;
  cat_id uuid;
  dog_link_id uuid;
  prescreen_id uuid;
  selected_service uuid;
  selected_area uuid;
begin
  select id into selected_service from public.services where slug = 'microchipping' limit 1;
  if selected_service is null then
    raise exception 'Fixture requires the existing Microchipping service catalog entry';
  end if;
  select id into selected_area from public.service_areas where is_active order by name limit 1;
  insert into public.people (first_name, last_name, phone, email, preferred_contact_method)
    values ('Unit3', 'Browser Test', '555-0100', 'unit3-browser@example.invalid', 'text') returning id into person_id;
  insert into public.assistance_requests (requester_person_id, service_area_id, help_summary,
    transportation_notes, stated_contribution_amount, additional_information, created_at, submitted_at)
    values (person_id, selected_area, 'SYNTHETIC TEST: help for two animals.',
      'Test transportation note', 0, 'Synthetic browser acceptance case.',
      statement_timestamp() - interval '2 days', statement_timestamp() - interval '2 days') returning id into request_id;
  insert into public.animals (name, species, sex, altered_status, age_years)
    values ('Unit3 Roscoe', 'dog', 'male', 'altered', 6) returning id into dog_id;
  insert into public.animals (name, species, sex, altered_status, age_years)
    values ('Unit3 Pigeon', 'cat', 'female', 'unknown', 3) returning id into cat_id;
  insert into public.request_animals (assistance_request_id, animal_id)
    values (request_id, dog_id) returning id into dog_link_id;
  insert into public.request_animals (assistance_request_id, animal_id) values (request_id, cat_id);
  insert into public.prescreens (request_animal_id, rabies_status, vaccine_status,
    prevention_use_status, prevention_product, medical_concerns)
    values (dog_link_id, 'current', 'partial', 'using', 'Fictional prevention', 'Synthetic concern') returning id into prescreen_id;
  insert into public.prescreen_diagnostics (prescreen_id, diagnostic_type, status, notes)
    values (prescreen_id, 'heartworm', 'negative', 'Synthetic diagnostic');
  insert into public.request_animal_services (request_animal_id, service_id, notes)
    values (dog_link_id, selected_service, 'Synthetic requested service');
  insert into public.request_availability (assistance_request_id, day_of_week) values (request_id, 'friday');
  raise notice 'Open /admin/requests/% for the synthetic Unit3 Browser Test case', request_id;
end;
$$;
commit;
