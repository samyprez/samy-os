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

alter table public.events enable row level security;
alter table public.health_entries enable row level security;

create policy "events_owner_all" on public.events
for all using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "health_entries_owner_all" on public.health_entries
for all using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists events_user_starts_at_idx
on public.events (user_id, starts_at);

create index if not exists health_entries_user_date_idx
on public.health_entries (user_id, entry_date desc);
