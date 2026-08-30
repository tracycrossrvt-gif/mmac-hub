create table public.prescreens (
  id uuid primary key default gen_random_uuid(),

  request_animal_id uuid not null
    references public.request_animals(id)
    on delete cascade,

  rabies_status text
    check (
      rabies_status is null
      or rabies_status in (
        'current',
        'not_current',
        'unknown'
      )
    ),

  vaccine_status text
    check (
      vaccine_status is null
      or vaccine_status in (
        'current',
        'partial',
        'not_current',
        'unknown'
      )
    ),

    prevention_use_status text
  check (
    prevention_use_status is null
    or prevention_use_status in (
      'using',
      'not_using',
      'unknown'
    )
  ),

prevention_product text,

prevention_last_given_date date,

  established_veterinarian text,

  last_vet_visit text,

  medical_concerns text,

  estimated_care_scope text
    check (
      estimated_care_scope is null
      or estimated_care_scope in (
        'routine',
        'expanded',
        'needs_review'
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint prescreens_request_animal_unique
    unique (request_animal_id)
);

alter table public.prescreens enable row level security;