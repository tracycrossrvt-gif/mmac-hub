create table public.prescreen_diagnostics (
  id uuid primary key default gen_random_uuid(),

  prescreen_id uuid not null
    references public.prescreens(id)
    on delete cascade,

  diagnostic_type text not null
    check (
    diagnostic_type in (
  'heartworm',
  'felv',
  'fiv'
)
    ),

  status text not null
    check (
      status in (
        'negative',
        'positive',
        'unknown',
        'not_tested'
      )
    ),

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint prescreen_diagnostics_type_unique
    unique (prescreen_id, diagnostic_type)
);

alter table public.prescreen_diagnostics enable row level security;