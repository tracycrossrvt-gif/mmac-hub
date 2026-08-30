create table public.people (
  id uuid primary key default gen_random_uuid(),

  first_name text not null,
  last_name text not null,

  email text,
  phone text,

  preferred_contact_method text
    check (
      preferred_contact_method is null
      or preferred_contact_method in ('phone', 'text', 'email')
    ),

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.people enable row level security;