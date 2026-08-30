create table public.animals (
  id uuid primary key default gen_random_uuid(),

  household_id uuid
    references public.households(id)
    on delete set null,

  name text,
  species text not null
    check (species in ('dog', 'cat', 'other')),

  sex text
    check (
      sex is null
      or sex in ('male', 'female', 'unknown')
    ),

  altered_status text
    check (
      altered_status is null
      or altered_status in ('altered', 'unaltered', 'unknown')
    ),

  age_years numeric(4,1),

  breed text,
  color_description text,

  microchip_number text,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.animals enable row level security;