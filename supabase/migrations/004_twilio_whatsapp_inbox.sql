-- Twilio WhatsApp: inbound, delivery receipts and approved drafts.
--
-- Reuses public.whatsapp_messages from 003 instead of a second inbox. The
-- provider column tells Meta rows from Twilio rows; wa_message_id holds the
-- Twilio MessageSid (SM.../MM...), which is globally unique, so the existing
-- unique index keeps webhook redeliveries idempotent.
-- Additive only: no existing column, row or policy is changed or dropped.

alter table public.whatsapp_messages
  add column if not exists provider text not null default 'meta';

alter table public.whatsapp_messages
  add column if not exists source text;

create index if not exists whatsapp_messages_provider_dir_idx
on public.whatsapp_messages (provider, direction, sent_at desc);

-- Messages to anyone outside the notification directory start as a draft and
-- are only sent after Samy explicitly approves that exact text and recipient.
create table if not exists public.whatsapp_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  to_number text not null,              -- E.164 without the +
  contact_name text,
  hub_client_id text,                   -- Amazing Business Hub clients.id
  recipient_source text not null,       -- 'hub_client' | 'inbound_history'
  body text,
  content_sid text,
  content_variables jsonb,
  -- sha256 of recipient + body + template; approval must quote it, so any
  -- edit invalidates a previous approval.
  approval_hash text not null,
  status text not null default 'draft'
    check (status in ('draft', 'sending', 'sent', 'failed', 'cancelled')),
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_drafts_user_idx
on public.whatsapp_drafts (user_id, created_at desc);

alter table public.whatsapp_drafts enable row level security;

drop policy if exists "whatsapp_drafts_owner_all" on public.whatsapp_drafts;
create policy "whatsapp_drafts_owner_all" on public.whatsapp_drafts
for all using (auth.uid() = user_id)
with check (auth.uid() = user_id);
