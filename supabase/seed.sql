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