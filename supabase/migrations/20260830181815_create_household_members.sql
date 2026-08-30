create table public.household_members (
  id uuid primary key default gen_random_uuid(),

  household_id uuid not null
    references public.households(id)
    on delete cascade,

  person_id uuid not null
    references public.people(id)
    on delete cascade,

  relationship_type text,
  is_primary_contact boolean not null default false,

  created_at timestamptz not null default now(),

  constraint household_members_household_person_unique
    unique (household_id, person_id)
);

alter table public.household_members enable row level security;