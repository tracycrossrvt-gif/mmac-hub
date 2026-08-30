create table public.households (
  id uuid primary key default gen_random_uuid(),

  name text,

  address_line_1 text,
  address_line_2 text,
  city text,
  state text,
  postal_code text,

  service_area_id uuid
    references public.service_areas(id)
    on delete set null,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.households enable row level security;