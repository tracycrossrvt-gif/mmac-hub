insert into public.service_areas (
  name,
  state,
  service_level,
  is_active
)
values
  ('Macon County', 'NC', 'primary', true),
  ('Jackson County', 'NC', 'primary', true),
  ('Rabun County', 'GA', 'primary', true)
on conflict (name, state) do nothing;

-- ------------------------------------------------------------
-- Sample household data
-- Fictional development/test records only
-- ------------------------------------------------------------

insert into public.people (
  id,
  first_name,
  last_name,
  email,
  phone,
  preferred_contact_method
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'Jamie',
    'Carter',
    'jamie@example.com',
    '828-555-0101',
    'text'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'Morgan',
    'Carter',
    'morgan@example.com',
    '828-555-0102',
    'phone'
  )
on conflict (id) do nothing;


insert into public.households (
  id,
  name,
  address_line_1,
  city,
  state,
  postal_code,
  service_area_id
)
select
  '20000000-0000-0000-0000-000000000001',
  'Sample Household',
  '123 Example Road',
  'Franklin',
  'NC',
  '28734',
  id
from public.service_areas
where name = 'Macon County'
  and state = 'NC'
on conflict (id) do nothing;


insert into public.household_members (
  id,
  household_id,
  person_id,
  relationship_type,
  is_primary_contact
)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'adult',
    true
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'adult',
    false
  )
on conflict (id) do nothing;


insert into public.animals (
  id,
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
  '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Roscoe',
  'dog',
  'male',
  'altered',
  6,
  'Mixed Breed',
  'Brown and white'
)
on conflict (id) do nothing;