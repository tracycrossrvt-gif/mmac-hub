create table public.request_animal_services (
  id uuid primary key default gen_random_uuid(),

  request_animal_id uuid not null
    references public.request_animals(id)
    on delete cascade,

  service_id uuid not null
    references public.services(id)
    on delete restrict,

  notes text,

  created_at timestamptz not null default now(),

  constraint request_animal_services_unique
    unique (request_animal_id, service_id)
);

alter table public.request_animal_services enable row level security;