-- WhatsApp Business Cloud API support.
--
-- Messages are stored in both directions so the assistant can answer
-- "what did this client say" and "who have I not replied to" without
-- calling Meta on every question. Meta only retains message content
-- briefly, so the webhook write is the only durable copy.

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_id uuid references public.clients(id) on delete set null,

  -- Meta's id, used to deduplicate: webhooks are delivered at least once
  -- and Meta retries on any non-200, so the same message arrives twice.
  wa_message_id text not null,

  direction text not null check (direction in ('in', 'out')),
  from_number text not null,
  to_number text not null,
  contact_name text,

  body text,
  message_type text not null default 'text',
  media_url text,

  -- 'received' for inbound; Meta's lifecycle for outbound:
  -- sent -> delivered -> read, or failed.
  status text not null default 'received',
  error text,

  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The webhook upserts on this, so a retried delivery updates the row
-- instead of inserting a duplicate.
create unique index if not exists whatsapp_messages_wa_id_idx
on public.whatsapp_messages (wa_message_id);

create index if not exists whatsapp_messages_user_sent_idx
on public.whatsapp_messages (user_id, sent_at desc);

create index if not exists whatsapp_messages_client_idx
on public.whatsapp_messages (client_id, sent_at desc);

-- Answers "who wrote to me and I have not replied", which needs a cheap
-- lookup of the newest inbound message per counterparty.
create index if not exists whatsapp_messages_counterparty_idx
on public.whatsapp_messages (user_id, from_number, sent_at desc)
where direction = 'in';

alter table public.whatsapp_messages enable row level security;

create policy "whatsapp_messages_owner_all" on public.whatsapp_messages
for all using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Clients already carry primary_contact (now e-mail) and whatsapp_name.
-- The phone needs its own column: matching an inbound message to a client
-- is done by number, and it must be stored in one normalised shape.
alter table public.clients
add column if not exists whatsapp_phone text;

-- Store E.164 without the +, which is exactly what Meta sends and expects
-- (for example 16474692835), so lookups are a plain equality match.
create index if not exists clients_whatsapp_phone_idx
on public.clients (user_id, whatsapp_phone);

comment on column public.clients.whatsapp_phone is
  'E.164 without the leading +, e.g. 16474692835. Matches the wa_id Meta sends.';
