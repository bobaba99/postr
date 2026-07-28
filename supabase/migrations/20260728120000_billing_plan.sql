-- Postr · billing: plan + export credits on public.users
--
-- Backs the paywall (docs/plans/2026-07-28-payment-and-paywall.md).
-- Everyone pays from launch; provider is Stripe Managed Payments (an MoR).
--
--   plan               'free' | 'term'      — the term is a one-time 4-month
--                       unlock, NOT a subscription; it expires without a
--                       cancellation event.
--   plan_expires_at    when a 'term' lapses back to free.
--   stripe_customer_id links the row to Stripe for webhook reconciliation.
--   export_credits     consumable count for the $9.99 3-export pack; +3 on
--                       purchase, −1 per successful paid export. Named for
--                       EXPORTS (not "decks") because it covers poster
--                       PPTX/LaTeX exports today and talk export later.
--
-- SECURITY (the whole point): these columns are SERVER-OWNED. The existing
-- users_update_own policy lets the owner update their whole row, so without
-- a guard a user could set plan='term' from the browser. A BEFORE UPDATE
-- trigger rejects any change to a billing column unless the caller is
-- service_role (the Stripe webhook). Column-level GRANTs don't compose with
-- RLS the way we need, so the trigger is the airtight seam.

-- =========================================================================
-- Columns
-- =========================================================================
alter table public.users
  add column if not exists plan text not null default 'free',
  add column if not exists plan_expires_at timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists export_credits integer not null default 0;

alter table public.users
  drop constraint if exists users_plan_check;
alter table public.users
  add constraint users_plan_check check (plan in ('free', 'term'));

alter table public.users
  drop constraint if exists users_export_credits_nonneg;
alter table public.users
  add constraint users_export_credits_nonneg check (export_credits >= 0);

comment on column public.users.plan is
  'Billing plan: free | term. The term is a one-time 4-month unlock, not a '
  'subscription. Written ONLY by the Stripe webhook (service_role) via the '
  'billing-column guard trigger.';
comment on column public.users.export_credits is
  'Consumable export credits from the $9.99 pack. +3 on purchase, -1 per '
  'successful paid export (poster PPTX/LaTeX now, talk later). Server-owned.';

-- Reconcile the webhook to a user quickly.
create index if not exists users_stripe_customer_id_idx
  on public.users (stripe_customer_id)
  where stripe_customer_id is not null;

-- =========================================================================
-- Billing-column guard — reject client writes to server-owned columns
-- =========================================================================
-- Fires on UPDATE. If any billing column changed AND the caller is not
-- service_role, raise. The Stripe webhook runs with the service_role key,
-- so it passes; a browser (authenticated role) cannot forge a plan.
--
-- security definer + pinned search_path so the role check can't be
-- subverted by a shadowed current_setting/role function.
create or replace function public.guard_billing_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if (
        new.plan is distinct from old.plan
     or new.plan_expires_at is distinct from old.plan_expires_at
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.export_credits is distinct from old.export_credits
     )
     and current_setting('role', true) is distinct from 'service_role'
     and (select auth.role()) is distinct from 'service_role'
  then
    raise exception
      'billing columns (plan, plan_expires_at, stripe_customer_id, export_credits) are server-owned and cannot be changed by the client';
  end if;
  return new;
end;
$$;

drop trigger if exists users_guard_billing_columns on public.users;
create trigger users_guard_billing_columns
  before update on public.users
  for each row
  execute function public.guard_billing_columns();

-- The trigger function must not be executable in a way that bypasses the
-- check; it's only ever invoked by the trigger, so revoke direct EXECUTE.
revoke all on function public.guard_billing_columns() from public, anon, authenticated;
