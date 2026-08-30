create table public.services (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  slug text not null,

  description text,

  species_scope text not null default 'all'
    check (
      species_scope in (
        'all',
        'dog',
        'cat'
      )
    ),

  is_active boolean not null default true,

  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint services_name_unique
    unique (name),

  constraint services_slug_unique
    unique (slug)
);

alter table public.services enable row level security;