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

alter table public.clients enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.brands enable row level security;

create policy "clients_owner_all" on public.clients for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tasks_owner_all" on public.tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notes_owner_all" on public.notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "brands_owner_all" on public.brands for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
