create table public.service_areas (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  state text not null,

  service_level text not null
    check (service_level in ('primary', 'active', 'limited', 'case_by_case')),

  is_active boolean not null default true,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint service_areas_name_state_unique
    unique (name, state)
);

alter table public.service_areas enable row level security;