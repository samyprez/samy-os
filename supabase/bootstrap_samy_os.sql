-- Samy OS one-shot bootstrap for a fresh Supabase project.
-- Safe to run more than once.

create extension if not exists "pgcrypto";

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  brand text,
  primary_contact text,
  secondary_contact text,
  whatsapp_name text,
  service text,
  status text not null default 'Activo',
  priority text not null default 'Media',
  last_important_message text,
  next_step text,
  due_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_id uuid references public.clients(id) on delete set null,
  area text,
  title text not null,
  priority text not null default 'Media',
  status text not null default 'Pendiente',
  source text,
  responsible text,
  due_date date,
  next_action text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  category text,
  body text not null,
  related_to text,
  pending_action text,
  priority text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  type text,
  objective text,
  platforms text,
  active_pending text,
  content_frequency text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  related_to text,
  status text not null default 'Programado',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.health_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  entry_date date not null default current_date,
  sleep_hours numeric(4,1),
  energy_level integer check (energy_level between 1 and 10),
  water_glasses integer check (water_glasses >= 0),
  movement_minutes integer check (movement_minutes >= 0),
  mood text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.brands enable row level security;
alter table public.events enable row level security;
alter table public.health_entries enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='clients' and policyname='clients_owner_all') then
    create policy "clients_owner_all" on public.clients for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tasks' and policyname='tasks_owner_all') then
    create policy "tasks_owner_all" on public.tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notes' and policyname='notes_owner_all') then
    create policy "notes_owner_all" on public.notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='brands' and policyname='brands_owner_all') then
    create policy "brands_owner_all" on public.brands for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='events' and policyname='events_owner_all') then
    create policy "events_owner_all" on public.events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='health_entries' and policyname='health_entries_owner_all') then
    create policy "health_entries_owner_all" on public.health_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists clients_user_name_idx on public.clients (user_id, name);
create index if not exists tasks_user_status_idx on public.tasks (user_id, status);
create index if not exists notes_user_created_idx on public.notes (user_id, created_at desc);
create index if not exists events_user_starts_at_idx on public.events (user_id, starts_at);
create index if not exists health_entries_user_date_idx on public.health_entries (user_id, entry_date desc);
