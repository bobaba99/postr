-- ==========================================================================
-- One Stripe customer per account (lifecycle review follow-up to P0-2)
-- ==========================================================================
--
-- POST /billing/create-checkout now passes the stored users.stripe_customer_id
-- as `customer` to Checkout, so the column is load-bearing for money
-- movement: whichever Stripe customer it names receives the payment
-- method, receipts and subscription. It was a plain `text` with a
-- non-unique index (20260728120000_billing_plan.sql), so nothing stopped
-- two accounts from naming one customer — and the webhook / refund
-- reconciler resolve events by that column with maybeSingle(), which
-- silently returns nothing on a duplicate.
--
-- Partial unique index: NULLs (never-paid accounts) stay unconstrained.
-- The API now refuses (500, operator-visible) instead of guessing when a
-- customer lookup is ambiguous; this index makes that state unreachable.
--
-- If `supabase db push` fails here, prod already holds a duplicate — find
-- it and merge the accounts by hand before re-running:
--   select stripe_customer_id, array_agg(id)
--     from public.users
--    where stripe_customer_id is not null
--    group by 1 having count(*) > 1;

create unique index if not exists users_stripe_customer_id_unique_idx
  on public.users (stripe_customer_id)
  where stripe_customer_id is not null;

comment on index public.users_stripe_customer_id_unique_idx is
  'One Postr account per Stripe customer: create-checkout reuses the stored customer id, so it must never name two accounts.';
