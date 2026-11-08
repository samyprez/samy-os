-- PROPOSAL ONLY: not applied, not a migration. Original Samy OS database only.
-- Generate a migration with the Supabase CLI after access/schema verification.
-- Contains hashes and execution receipts, not email bodies or recipients.
begin;
create table public.email_send_approvals (
  id uuid primary key,
  principal text not null check (length(principal) > 0),
  draft_hash text not null check (draft_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  state text not null check (state in ('prepared', 'processing', 'sent', 'unknown')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  provider_id text,
  check (state <> 'sent' or provider_id is not null)
);
alter table public.email_send_approvals enable row level security;
revoke all on public.email_send_approvals from public, anon, authenticated;
grant select, insert, update on public.email_send_approvals to service_role;
-- No browser policies and no SECURITY DEFINER functions.
commit;
