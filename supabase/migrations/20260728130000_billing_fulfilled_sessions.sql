-- Postr · billing idempotency ledger
--
-- Records Stripe checkout-session ids that have already granted export
-- credits, so a webhook retry or duplicate delivery cannot double-grant
-- the $9.99 pack. The term path is naturally idempotent (it sets an
-- absolute expiry), so only pack fulfillment consults this table.
--
-- Written ONLY by the webhook (service_role). No RLS grants to
-- anon/authenticated — this table is never touched from the browser.

create table if not exists public.billing_fulfilled_sessions (
  session_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  fulfilled_at timestamptz not null default now()
);

comment on table public.billing_fulfilled_sessions is
  'Idempotency ledger: Stripe checkout sessions already fulfilled (pack '
  'credit grants). Prevents double-granting on webhook retry. '
  'service_role only.';

-- RLS on, with NO policies for anon/authenticated → the table is
-- invisible and unwritable from the browser. service_role bypasses RLS,
-- so the webhook can read/write it.
alter table public.billing_fulfilled_sessions enable row level security;
