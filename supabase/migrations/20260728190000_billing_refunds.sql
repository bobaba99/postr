-- Postr · refunds — ledger, export tracking, pack attribution
--
-- Supports the refund policy (docs/plans + project_refund_policy):
--   TERM: full refund of the last charge within 14 days AND only if no
--         editable export was taken since the charge.
--   PACK: refund UNUSED credits at a flat CA$3.33/credit (CA$9.99 ÷ 3).
-- Cancellation is NOT a refund — a cancelled term keeps access to period
-- end (handled in the webhook), so nothing here touches that path.
--
-- Refunds are RACE-SAFE against Stripe/Link's own refund path (Managed
-- Payments = Stripe is MoR, so a customer can also get refunded via Link):
-- the billing_refunds ledger keys on stripe_refund_id UNIQUE, so a
-- self-serve button and a charge.refunded webhook can't double-revoke.

-- =========================================================================
-- 1. Refund ledger — service_role only (idempotency + audit)
-- =========================================================================
create table if not exists public.billing_refunds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('term', 'pack')),
  -- Stripe's refund id — UNIQUE is the idempotency key: whether the refund
  -- was initiated by our button or by Link, we record it exactly once.
  stripe_refund_id text not null unique,
  amount_cents integer not null check (amount_cents >= 0),
  -- How many pack credits this refund revoked (0 for a term refund).
  credits_revoked integer not null default 0 check (credits_revoked >= 0),
  -- The pack purchase (billing_fulfilled_sessions.session_id) refunded, if
  -- this is a pack refund. Null for a term refund.
  session_id text,
  created_at timestamptz not null default now()
);

comment on table public.billing_refunds is
  'Refund ledger: one row per Stripe refund (button- or Link-initiated). '
  'stripe_refund_id UNIQUE makes revocation idempotent. service_role only.';

-- RLS on with NO anon/authenticated policies → invisible + unwritable from
-- the browser; the service_role key (webhook / refund route) bypasses RLS.
alter table public.billing_refunds enable row level security;

-- =========================================================================
-- 2. Export tracking — for the term "no export taken" refund condition
-- =========================================================================
-- A term holder exports without limit and never calls consume-credit, so
-- there was no server record they exported at all. This column is stamped
-- (once) the first time a term user takes a paid export, so the refund
-- route can enforce "unused = no export since the charge". Server-owned:
-- the client ping goes through a service_role RPC, never a direct write.
alter table public.users
  add column if not exists first_paid_export_at timestamptz;

comment on column public.users.first_paid_export_at is
  'When the user first took a paid (PPTX/LaTeX) export under a term. Used '
  'by the refund eligibility check (no export since the charge). Server-owned.';

-- =========================================================================
-- 3. Pack attribution — record credits granted per pack (Option A)
-- =========================================================================
-- The single export_credits counter can't say which of N remaining credits
-- came from which pack. Recording credits_granted per fulfilled session
-- lets the refund route validate `unused ≤ granted` and cap the refund at
-- one pack (3 credits). Consumption stays a single counter (Option A);
-- a full per-lot ledger (Option B) is deferred.
alter table public.billing_fulfilled_sessions
  add column if not exists credits_granted integer not null default 0
    check (credits_granted >= 0);

comment on column public.billing_fulfilled_sessions.credits_granted is
  'How many export credits this pack session granted (for refund '
  'attribution / cap). 0 for non-pack rows. Server-owned.';

-- =========================================================================
-- 4. Extend the billing-column guard for first_paid_export_at
-- =========================================================================
-- first_paid_export_at is server-owned exactly like the other billing
-- columns — a client must not forge it (e.g. to fake "already exported" or
-- "never exported"). Extend the guard's changed-column check. The other new
-- columns live on dedicated service_role-only tables (no user RLS), so they
-- need no guard-trigger coverage — only public.users columns do.
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
     or new.first_paid_export_at is distinct from old.first_paid_export_at
     )
     and current_setting('role', true) is distinct from 'service_role'
     and (select auth.role()) is distinct from 'service_role'
  then
    raise exception
      'billing columns (plan, plan_expires_at, stripe_customer_id, export_credits, stripe_subscription_id, subscription_status, first_paid_export_at) are server-owned and cannot be changed by the client';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_billing_columns() from public, anon, authenticated;

-- =========================================================================
-- 5. RPCs — service_role only (called by the API with the service key)
-- =========================================================================

-- Stamp first_paid_export_at once, the first time a term user exports.
-- Idempotent: coalesce keeps the ORIGINAL timestamp on repeat calls, so
-- the refund "no export since the charge" test uses the true first export.
create or replace function public.mark_first_paid_export(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  update public.users
     set first_paid_export_at = coalesce(first_paid_export_at, now())
   where id = p_user_id;
end;
$$;

comment on function public.mark_first_paid_export(uuid) is
  'Stamp first_paid_export_at once (coalesce) for a term export. '
  'service_role only (called by the billing API).';

revoke execute on function public.mark_first_paid_export(uuid)
  from public, anon, authenticated;

-- Atomically revoke up to p_amount credits during a pack refund, floored at
-- zero (never negative). Returns the credits actually revoked so the caller
-- can record the exact number and refund only for what was removed.
create or replace function public.revoke_export_credits(
  p_user_id uuid,
  p_amount integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_removed integer;
begin
  if p_amount is null or p_amount <= 0 then
    return 0;
  end if;

  -- Lock the row and read the current balance in one statement, then write
  -- the floored result. FOR UPDATE serialises concurrent refunds on this
  -- user so they can't both revoke against a stale balance. `v_removed` is
  -- exactly min(requested, available) — never more than existed, never
  -- negative.
  select least(p_amount, export_credits) into v_removed
    from public.users
   where id = p_user_id
     for update;

  if v_removed is null then
    return 0; -- no such user
  end if;

  update public.users
     set export_credits = export_credits - v_removed
   where id = p_user_id;

  return v_removed;
end;
$$;

comment on function public.revoke_export_credits(uuid, integer) is
  'Atomically remove up to p_amount export credits (floored at 0) for a '
  'pack refund. service_role only.';

revoke execute on function public.revoke_export_credits(uuid, integer)
  from public, anon, authenticated;
