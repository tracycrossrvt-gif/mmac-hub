create table public.request_animals (
  id uuid primary key default gen_random_uuid(),

  assistance_request_id uuid not null
    references public.assistance_requests(id)
    on delete cascade,

  animal_id uuid not null
    references public.animals(id)
    on delete restrict,

  outcome text
    check (
      outcome is null
      or outcome in (
        'accepted',
        'referred',
        'unable_to_assist'
      )
    ),

  outcome_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint request_animals_request_animal_unique
    unique (assistance_request_id, animal_id)
);

alter table public.request_animals enable row level security;