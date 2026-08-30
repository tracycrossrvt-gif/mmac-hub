create table public.assistance_requests (
  id uuid primary key default gen_random_uuid(),

  requester_person_id uuid not null
    references public.people(id)
    on delete restrict,

  household_id uuid
    references public.households(id)
    on delete set null,

  service_area_id uuid
    references public.service_areas(id)
    on delete set null,

  status text not null default 'new'
    check (
      status in (
        'new',
        'under_review',
        'needs_info',
        'referred',
        'unable_to_assist',
        'accepted'
      )
    ),

  help_summary text,

  stated_contribution_amount numeric(10,2)
    check (
      stated_contribution_amount is null
      or stated_contribution_amount >= 0
    ),

  transportation_notes text,

  internal_notes text,

  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assistance_requests enable row level security;