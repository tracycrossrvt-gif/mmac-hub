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
-- ------------------------------------------------------------
-- Service catalog
-- ------------------------------------------------------------

insert into public.services (
  id,
  name,
  slug,
  description,
  species_scope,
  is_active,
  sort_order,
  is_public_request_option
)
values
  (
    '50000000-0000-0000-0000-000000000001',
    'Spay / Neuter',
    'spay-neuter',
    'Spay or neuter coordination.',
    'all',
    true,
    10,
    false
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    'Rabies Vaccination',
    'rabies-vaccination',
    'Rabies vaccination coordination.',
    'all',
    true,
    20,
    false
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    'Core Vaccines',
    'core-vaccines',
    'Routine core vaccination coordination.',
    'all',
    true,
    30,
    false
  ),
 (
  '50000000-0000-0000-0000-000000000004',
  'Parasite Prevention',
  'parasite-prevention',
  'Parasite prevention assistance.',
  'all',
  true,
  40,
  false
  ),
  (
    '50000000-0000-0000-0000-000000000005',
    'Heartworm Testing',
    'heartworm-testing',
    'Routine heartworm screening request.',
    'dog',
    true,
    50,
    false
  ),
  (
    '50000000-0000-0000-0000-000000000006',
    'FeLV / FIV Testing',
    'felv-fiv-testing',
    'Routine feline FeLV/FIV screening request.',
    'cat',
    true,
    60,
    false
  ),
  (
    '50000000-0000-0000-0000-000000000007',
    'Nail Trim',
    'nail-trim',
    'Basic nail trimming service.',
    'all',
    true,
    70,
    false
  ),
  (
    '50000000-0000-0000-0000-000000000008',
    'Microchipping',
    'microchipping',
    'Microchip placement request.',
    'all',
    true,
    80,
    false
  ),
  -- Broad public request categories (Slice 2a). The migration
  -- 20261117000000_submit_requested_services.sql inserts the same rows so
  -- databases that are never reset get them too. Keep both in sync.
  (
    '50000000-0000-0000-0000-000000000101',
    'Surgery',
    'surgery',
    null,
    'all',
    true,
    110,
    true
  ),
  (
    '50000000-0000-0000-0000-000000000102',
    'Medical care',
    'medical-care',
    null,
    'all',
    true,
    120,
    true
  ),
  (
    '50000000-0000-0000-0000-000000000103',
    'Vaccine clinic',
    'vaccine-clinic',
    null,
    'all',
    true,
    130,
    true
  )
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  species_scope = excluded.species_scope,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  is_public_request_option = excluded.is_public_request_option;