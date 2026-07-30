-- Postr · Presentation Checker — poster_reviews + review billing columns + RPCs
--
-- The data layer for the review economy (spec §5):
--   poster_reviews     one row per review: source, findings JSON, and the
--                      initial → followup → closed stage machine (§5.1/§5.2).
--   review_credits     the review pack's consumable count (§5.3) — mirrors
--                      export_credits; credits never expire.
--   review_addon / review_addon_subscription_id
--                      the term-subscription add-on granting a weekly review
--                      quota (enforced API-side via createRateLimiter; no
--                      per-review decrement).
--
-- RLS on poster_reviews is OWNER SELECT-ONLY (D3 — a hardening of the §5.1
-- draft's owner select/insert/update): every write goes through the API's
-- service_role client, which bypasses RLS. An owner-writable `stage` would
-- let a client reset a closed review to `initial` and farm free follow-ups;
-- an owner-insertable row would forge a paid review. The API writes a row
-- exactly once, after a successful critique, with status 'complete';
-- 'pending'/'failed' stay in the CHECK for future async use — v1 never
-- writes a failed row (D16).
--
-- The three users columns are SERVER-OWNED exactly like plan/export_credits:
-- folded into guard_billing_columns(), whose error message now lists all ten
-- guarded columns. consume_review_credit / grant_review_credits mirror the
-- export-credit RPCs verbatim: security definer, pinned search_path, atomic
-- conditional UPDATE, service_role only (browser EXECUTE revoked). Refunds
-- for the review SKUs are deferred (manual via the Stripe dashboard).

-- =========================================================================
-- 1. poster_reviews — the review + follow-up state machine (spec §5.1)
-- =========================================================================
create table if not exists public.poster_reviews (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  poster_id         uuid references public.posters(id) on delete set null, -- null for uploads
  source_kind       text not null check (source_kind in ('postr','pdf','pptx','image')),
  source_meta       jsonb not null default '{}'::jsonb,   -- filename, page count, ingest info
  status            text not null default 'pending'
                      check (status in ('pending','complete','failed')),
  stage             text not null default 'initial'
                      check (stage in ('initial','followup','closed')),
  initial_findings  jsonb,                                 -- CritiqueResult
  followup_findings jsonb,                                 -- CritiqueResult (diffed vs initial)
  credit_source     text check (credit_source in ('pack','subscription_addon')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.poster_reviews is
  'Presentation Checker reviews: one row per review with the initial → '
  'followup → closed stage machine. Written ONLY by the API (service_role) '
  'after a successful critique; the owner reads it back over RLS.';

alter table public.poster_reviews enable row level security;

-- Owner SELECT-only (D3): reads come back to the browser over PostgREST;
-- ALL writes are service_role (the API), which bypasses RLS. No insert /
-- update / delete policy exists on purpose — see the header comment.
drop policy if exists "poster_reviews_select_own" on public.poster_reviews;
create policy "poster_reviews_select_own"
  on public.poster_reviews
  for select
  to authenticated
  using (auth.uid() = user_id);

-- =========================================================================
-- 2. Review billing columns on public.users (server-owned)
-- =========================================================================
alter table public.users
  add column if not exists review_credits integer not null default 0,
  add column if not exists review_addon boolean not null default false,
  add column if not exists review_addon_subscription_id text;

alter table public.users
  drop constraint if exists users_review_credits_nonneg;
alter table public.users
  add constraint users_review_credits_nonneg check (review_credits >= 0);

comment on column public.users.review_credits is
  'Consumable review credits from the review pack. +N on purchase, -1 per '
  'successful initial critique (the follow-up is included — spec §5.3). '
  'Never expire. Server-owned.';
comment on column public.users.review_addon is
  'Whether the user holds the review add-on on their term subscription '
  '(weekly review quota, enforced API-side). Server-owned.';
comment on column public.users.review_addon_subscription_id is
  'Stripe subscription id of the review add-on, for webhook reconciliation. '
  'Server-owned.';

-- Reconcile an add-on subscription-lifecycle event back to its user quickly
-- (same precedent as users_stripe_subscription_id_idx).
create index if not exists users_review_addon_subscription_id_idx
  on public.users (review_addon_subscription_id)
  where review_addon_subscription_id is not null;

-- =========================================================================
-- 3. Extend the billing-column guard — ten server-owned columns
-- =========================================================================
-- review_credits / review_addon / review_addon_subscription_id are
-- server-owned exactly like the other billing columns — a client must not
-- grant itself review credits or the add-on. Body copied verbatim from
-- 20260728190000_billing_refunds.sql with the three new columns appended;
-- the error message now lists all ten. (The columns are added above, before
-- this reference, so the function body resolves.)
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
     or new.review_credits is distinct from old.review_credits
     or new.review_addon is distinct from old.review_addon
     or new.review_addon_subscription_id is distinct from old.review_addon_subscription_id
     )
     and current_setting('role', true) is distinct from 'service_role'
     and (select auth.role()) is distinct from 'service_role'
  then
    raise exception
      'billing columns (plan, plan_expires_at, stripe_customer_id, export_credits, stripe_subscription_id, subscription_status, first_paid_export_at, review_credits, review_addon, review_addon_subscription_id) are server-owned and cannot be changed by the client';
  end if;
  return new;
end;
$$;

-- Re-harden EXECUTE. Postgres grants EXECUTE to PUBLIC by default on a
-- create-or-replace; the revoke must name public AND anon explicitly. The
-- guard function is only ever invoked by the trigger, never directly.
revoke all on function public.guard_billing_columns() from public, anon, authenticated;

-- =========================================================================
-- 4. consume_review_credit / grant_review_credits — service_role only
-- =========================================================================
-- Verbatim mirrors of consume_export_credit / grant_export_credits against
-- review_credits, called ONLY by the API / billing webhook with the
-- service_role key. Atomicity: a single conditional UPDATE guarded by
-- `review_credits > 0`, RETURNING the new balance. Two concurrent critiques
-- cannot drive the balance negative — the second matches zero rows and
-- returns NULL, which the caller reads as "no credit".
create or replace function public.consume_review_credit(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_remaining integer;
begin
  update public.users
     set review_credits = review_credits - 1
   where id = p_user_id
     and review_credits > 0
  returning review_credits into v_remaining;

  -- NULL when the user had no credits (zero rows updated) — the caller
  -- treats that as "no credit available".
  return v_remaining;
end;
$$;

comment on function public.consume_review_credit(uuid) is
  'Atomically spend one review credit for a user; returns the new balance '
  'or NULL if none. service_role only (called by the review API).';

-- Postgres grants EXECUTE to PUBLIC by default. Strip it and every
-- browser-facing role; service_role keeps EXECUTE from schema defaults.
revoke execute on function public.consume_review_credit(uuid)
  from public, anon, authenticated;

-- Atomic credit GRANT for the webhook, mirroring grant_export_credits: a
-- single `SET review_credits = review_credits + p_amount` is atomic, so
-- concurrent grants from DISTINCT pack sessions sum correctly (the
-- per-session idempotency ledger only serialises the SAME session).
create or replace function public.grant_review_credits(
  p_user_id uuid,
  p_amount integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_remaining integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'grant amount must be a positive integer';
  end if;

  update public.users
     set review_credits = review_credits + p_amount
   where id = p_user_id
  returning review_credits into v_remaining;

  return v_remaining;
end;
$$;

comment on function public.grant_review_credits(uuid, integer) is
  'Atomically add review credits for a user; returns the new balance. '
  'service_role only (called by the billing webhook).';

revoke execute on function public.grant_review_credits(uuid, integer)
  from public, anon, authenticated;
