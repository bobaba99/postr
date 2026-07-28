-- Postr · billing: the term becomes a recurring subscription
--
-- The $18.99 term is now a RECURRING Stripe subscription (billed every 4
-- months, auto-renews until cancelled), not a one-time 4-month unlock.
-- The $9.99 pack stays one-time (3 export credits that never expire).
-- See docs/plans/2026-07-28-payment-and-paywall.md and
-- 20260728120000_billing_plan.sql (which added plan/plan_expires_at/etc).
--
-- Two new server-owned columns track the subscription:
--   stripe_subscription_id  the Stripe sub id, for webhook reconciliation
--                            (later lifecycle events carry the sub/customer
--                            but NOT the checkout's client_reference_id).
--   subscription_status      mirror of Stripe's sub status. Access is gated
--                            on plan_expires_at being in the future AND the
--                            status not being terminal — NOT revoked on the
--                            first past_due (Stripe's dunning retries a
--                            failed card for days; slamming the paywall shut
--                            mid-term would punish a paying user).
--
-- plan_expires_at is now DERIVED from the subscription's current period end
-- (written by the webhook on checkout + every renewal), not a fixed +4mo.

alter table public.users
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text;

-- Reconcile a subscription-lifecycle event back to its user quickly.
create index if not exists users_stripe_subscription_id_idx
  on public.users (stripe_subscription_id)
  where stripe_subscription_id is not null;

comment on column public.users.stripe_subscription_id is
  'Stripe subscription id for the recurring term. Set by the webhook on '
  'checkout.session.completed (subscription mode). service_role only.';
comment on column public.users.subscription_status is
  'Mirror of the Stripe subscription status (active|trialing|past_due|'
  'canceled|unpaid|incomplete|incomplete_expired|paused). Drives term '
  'access together with plan_expires_at. service_role only.';

-- =========================================================================
-- Extend the billing-column guard to the two new columns
-- =========================================================================
-- These columns are server-owned exactly like plan/plan_expires_at: a
-- client must not be able to forge a subscription_status of 'active' and
-- grant itself the term. The BEFORE UPDATE trigger already fires on every
-- row update; `create or replace function` swaps in a body that also
-- rejects client writes to the new columns. (The new columns are added
-- above, before this reference, so the function body resolves.)
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
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.subscription_status is distinct from old.subscription_status
     )
     and current_setting('role', true) is distinct from 'service_role'
     and (select auth.role()) is distinct from 'service_role'
  then
    raise exception
      'billing columns (plan, plan_expires_at, stripe_customer_id, export_credits, stripe_subscription_id, subscription_status) are server-owned and cannot be changed by the client';
  end if;
  return new;
end;
$$;

-- Re-harden EXECUTE. Postgres grants EXECUTE to PUBLIC by default on a
-- create-or-replace; the revoke must name public AND anon explicitly
-- (default privileges grant both — see the db test harness notes). The
-- guard function is only ever invoked by the trigger, never directly.
revoke all on function public.guard_billing_columns() from public, anon, authenticated;
