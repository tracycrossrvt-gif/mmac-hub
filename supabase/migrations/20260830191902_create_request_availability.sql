create table public.request_availability (
  id uuid primary key default gen_random_uuid(),

  assistance_request_id uuid not null
    references public.assistance_requests(id)
    on delete cascade,

  day_of_week text not null
    check (
      day_of_week in (
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday'
      )
    ),

  availability_window text not null default 'am_dropoff'
    check (
      availability_window in (
        'am_dropoff'
      )
    ),

  notes text,

  created_at timestamptz not null default now(),

  constraint request_availability_day_window_unique
    unique (
      assistance_request_id,
      day_of_week,
      availability_window
    )
);

alter table public.request_availability enable row level security;