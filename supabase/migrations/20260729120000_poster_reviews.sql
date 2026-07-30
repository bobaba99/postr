-- Postr · Presentation Checker — poster_reviews + review billing columns + RPCs
--
-- The data layer for the review economy (spec §5):
--   poster_reviews     one row per review: source, findings JSON, and the
--                      initial → followup → closed stage machine (§5.1/§5.2).
--   review_credits     the review pack's consumable count (§5.3) — mirrors
--                      export_credits; credits never expire.
--   review_addon / review_addon_subscription_id
--                      the term-subscription add-on granting a weekly review
--                      quota. Usage is persisted in review_addon_usage and
--                      consumed through one serialized service-role RPC.
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
  request_key       uuid,
  poster_id         uuid references public.posters(id) on delete set null, -- null for uploads
  source_kind       text not null check (source_kind in ('postr','pdf','pptx','image')),
  source_meta       jsonb not null default '{}'::jsonb,   -- filename, page count, ingest info
  status            text not null default 'pending'
                      check (status in ('pending','complete','failed')),
  stage             text not null default 'initial'
                      check (stage in ('initial','followup','closed')),
  initial_findings  jsonb,                                 -- CritiqueResult
  followup_findings jsonb,                                 -- CritiqueResult (diffed vs initial)
  followup_request_id uuid,                                -- durable follow-up idempotency key
  followup_lease_token uuid,                               -- fences stale follow-up workers
  followup_lease_expires_at timestamptz,                   -- ten-minute provider-work lease
  credit_source     text check (credit_source in ('pack','subscription_addon')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Existing development databases may already have the pre-idempotency table
-- from an earlier version of this migration.
alter table public.poster_reviews
  add column if not exists request_key uuid,
  add column if not exists followup_request_id uuid,
  add column if not exists followup_lease_token uuid,
  add column if not exists followup_lease_expires_at timestamptz;

create unique index if not exists poster_reviews_user_request_key_uidx
  on public.poster_reviews (user_id, request_key)
  where request_key is not null;

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

-- =========================================================================
-- 5. Persistent weekly review add-on quota — service_role only
-- =========================================================================
-- One row is one consumed initial-review slot. The API never reads or writes
-- this ledger directly: consume_review_addon_slot serializes each user's
-- sliding window by locking their public.users row, prunes expired events,
-- and inserts at database time. RLS plus explicit privilege revocation keeps
-- both the table and its identity sequence inaccessible to browser roles.
create table if not exists public.review_addon_usage (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.users(id) on delete cascade,
  consumed_at timestamptz not null default pg_catalog.now()
);

comment on table public.review_addon_usage is
  'Service-only sliding-window ledger for consumed Presentation Checker '
  'review add-on slots. Browser roles have no direct access.';

create index if not exists review_addon_usage_user_consumed_at_idx
  on public.review_addon_usage (user_id, consumed_at);

alter table public.review_addon_usage enable row level security;

revoke all on table public.review_addon_usage
  from public, anon, authenticated, service_role;
revoke all on sequence public.review_addon_usage_id_seq
  from public, anon, authenticated, service_role;
grant select, insert, delete on table public.review_addon_usage to service_role;
grant usage on sequence public.review_addon_usage_id_seq to service_role;

create or replace function public.consume_review_addon_slot(
  p_user_id uuid,
  p_quota integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_now timestamptz;
  v_count integer;
  v_oldest timestamptz;
  v_retry_after_sec integer;
begin
  if p_quota is null or p_quota < 1 or p_quota > 100 then
    raise exception 'review add-on quota must be between 1 and 100'
      using errcode = '22023';
  end if;

  -- This row is the per-user mutex. Concurrent calls for the same user
  -- serialize before either counts or inserts, while different users remain
  -- independent.
  perform id
    from public.users
   where id = p_user_id
   for update;

  if not found then
    raise exception 'review add-on user not found'
      using errcode = 'P0002';
  end if;

  -- Acquire real database time only after a possible lock wait. Transaction
  -- start time would make a queued caller's window stale.
  v_now := pg_catalog.clock_timestamp();

  delete from public.review_addon_usage
   where user_id = p_user_id
     and consumed_at <= v_now - interval '7 days';

  select count(*)::integer, min(consumed_at)
    into v_count, v_oldest
    from public.review_addon_usage
   where user_id = p_user_id;

  if v_count >= p_quota then
    v_retry_after_sec := greatest(
      1,
      pg_catalog.ceil(
        extract(epoch from (v_oldest + interval '7 days' - v_now))
      )::integer
    );
    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'retryAfterSec', v_retry_after_sec
    );
  end if;

  insert into public.review_addon_usage (user_id, consumed_at)
  values (p_user_id, v_now);

  return pg_catalog.jsonb_build_object('allowed', true);
end;
$$;

comment on function public.consume_review_addon_slot(uuid, integer) is
  'Atomically consumes one persistent seven-day review add-on slot and '
  'returns {allowed:true}, or {allowed:false,retryAfterSec:N}. '
  'service_role only.';

revoke execute on function public.consume_review_addon_slot(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.consume_review_addon_slot(uuid, integer)
  to service_role;

-- =========================================================================
-- 6. Retry-idempotent initial-review finalization
-- =========================================================================
-- A short-lived claim prevents concurrent requests carrying the same
-- browser-generated key from both reaching the model. The durable result
-- lives on poster_reviews.request_key; claims are only coordination state.
create table if not exists public.poster_review_requests (
  user_id              uuid not null references auth.users(id) on delete cascade,
  request_key          uuid not null,
  claim_token          uuid not null default gen_random_uuid(),
  pack_credit_reserved boolean not null default false,
  claimed_at           timestamptz not null default now(),
  expires_at           timestamptz not null default (now() + interval '10 minutes'),
  primary key (user_id, request_key)
);

alter table public.poster_review_requests
  add column if not exists pack_credit_reserved boolean not null default false;

comment on table public.poster_review_requests is
  'Service-role-only claims for in-flight initial presentation reviews. '
  'Completed idempotency records live on poster_reviews.request_key.';

alter table public.poster_review_requests enable row level security;
revoke all on table public.poster_review_requests from public, anon, authenticated;

-- Claim before page fetch/model work. The transaction-scoped advisory lock
-- serializes same-key contenders even before either transaction has committed
-- its claim row. A ten-minute lease recovers keys abandoned by a crashed API
-- process; normal review calls complete well inside that window.
create or replace function public.claim_initial_review(
  p_user_id uuid,
  p_request_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_review public.poster_reviews%rowtype;
  v_claimed boolean;
  v_expired_reservations integer;
  v_claim_token uuid := gen_random_uuid();
  v_expires_at timestamptz := pg_catalog.now() + interval '10 minutes';
begin
  if p_user_id is null or p_request_key is null then
    raise exception 'user id and request key are required'
      using errcode = '22004';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_request_key::text, 0)
  );

  select *
    into v_review
    from public.poster_reviews
   where user_id = p_user_id
     and request_key = p_request_key
     and status = 'complete'
   limit 1;

  if found then
    return pg_catalog.jsonb_build_object(
      'outcome', 'replay',
      'reviewId', v_review.id,
      'stage', 'initial',
      'critique', v_review.initial_findings
    );
  end if;

  -- Recover every abandoned reservation for this user, not only this request
  -- key. Browser keys live in memory, so a reload after an API crash can retry
  -- with a different key. DELETE ... RETURNING makes concurrent sweep/release
  -- contenders refund each exact row at most once.
  with expired as (
    delete from public.poster_review_requests
     where user_id = p_user_id
       and expires_at <= pg_catalog.now()
    returning pack_credit_reserved
  )
  select count(*) filter (where pack_credit_reserved)::integer
    into v_expired_reservations
    from expired;

  if coalesce(v_expired_reservations, 0) > 0 then
    update public.users
       set review_credits = review_credits + v_expired_reservations
     where id = p_user_id;
  end if;

  insert into public.poster_review_requests (
    user_id,
    request_key,
    claim_token,
    expires_at
  )
  values (p_user_id, p_request_key, v_claim_token, v_expires_at)
  on conflict do nothing
  returning true into v_claimed;

  if coalesce(v_claimed, false) then
    return pg_catalog.jsonb_build_object(
      'outcome', 'claimed',
      'claimToken', v_claim_token,
      'expiresAt', v_expires_at
    );
  end if;
  return pg_catalog.jsonb_build_object('outcome', 'in_progress');
end;
$$;

comment on function public.claim_initial_review(uuid, uuid) is
  'Claims a client request key before provider work, or returns its completed '
  'stored review. service_role only.';

revoke execute on function public.claim_initial_review(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_initial_review(uuid, uuid)
  to service_role;

-- Reserve the scarce pack credit before provider work. Exact-token fencing
-- makes this idempotent for a retry of the same worker. Distinct request keys
-- serialize on the public.users row through the conditional decrement, so a
-- one-credit balance can permit at most one provider call.
create or replace function public.reserve_initial_review_credit(
  p_user_id uuid,
  p_request_key uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_reserved boolean;
  v_remaining integer;
begin
  if p_user_id is null or p_request_key is null or p_claim_token is null then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_request_key::text, 0)
  );

  select pack_credit_reserved
    into v_reserved
    from public.poster_review_requests
   where user_id = p_user_id
     and request_key = p_request_key
     and claim_token = p_claim_token
   for update;

  if not found then
    return false;
  end if;
  if v_reserved then
    return true;
  end if;

  update public.users
     set review_credits = review_credits - 1
   where id = p_user_id
     and review_credits > 0
  returning review_credits into v_remaining;

  if v_remaining is null then
    return false;
  end if;

  update public.poster_review_requests
     set pack_credit_reserved = true
   where user_id = p_user_id
     and request_key = p_request_key
     and claim_token = p_claim_token;

  return true;
end;
$$;

comment on function public.reserve_initial_review_credit(uuid, uuid, uuid) is
  'Atomically reserves one pack credit for an exact initial-review claim '
  'before provider work. Exact-token retries are idempotent. service_role only.';

revoke execute on function public.reserve_initial_review_credit(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_initial_review_credit(uuid, uuid, uuid)
  to service_role;

create or replace function public.release_initial_review(
  p_user_id uuid,
  p_request_key uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_reserved boolean;
begin
  if p_user_id is null or p_request_key is null or p_claim_token is null then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_request_key::text, 0)
  );

  delete from public.poster_review_requests
   where user_id = p_user_id
     and request_key = p_request_key
     and claim_token = p_claim_token
  returning pack_credit_reserved into v_reserved;

  if not found then
    return false;
  end if;

  if v_reserved then
    update public.users
       set review_credits = review_credits + 1
     where id = p_user_id;
  end if;

  return true;
end;
$$;

comment on function public.release_initial_review(uuid, uuid, uuid) is
  'Releases an unfinished initial-review claim after fetch/provider/API '
  'failure. service_role only.';

revoke execute on function public.release_initial_review(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.release_initial_review(uuid, uuid, uuid)
  to service_role;

-- This is the paid-review completion boundary. Pack reviews must arrive with
-- a credit reserved before provider work; the completed insert consumes that
-- reservation without a second decrement. Subscription add-on reviews use the
-- same durable idempotency path without reserving pack credits.
create or replace function public.finalize_initial_review(
  p_user_id uuid,
  p_request_key uuid,
  p_claim_token uuid,
  p_poster_id uuid,
  p_source_kind text,
  p_source_meta jsonb,
  p_initial_findings jsonb,
  p_credit_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_review public.poster_reviews%rowtype;
  v_claim public.poster_review_requests%rowtype;
  v_review_id uuid;
  v_remaining integer;
begin
  if p_user_id is null or p_request_key is null or p_claim_token is null then
    raise exception 'user id, request key, and claim token are required'
      using errcode = '22004';
  end if;
  if p_credit_source not in ('pack', 'subscription_addon') then
    raise exception 'invalid credit source'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_request_key::text, 0)
  );

  select *
    into v_review
    from public.poster_reviews
   where user_id = p_user_id
     and request_key = p_request_key
     and status = 'complete'
   limit 1;

  if found then
    return pg_catalog.jsonb_build_object(
      'outcome', 'replay',
      'reviewId', v_review.id,
      'stage', 'initial',
      'critique', v_review.initial_findings
    );
  end if;

  select *
    into v_claim
    from public.poster_review_requests
   where user_id = p_user_id
     and request_key = p_request_key
     and claim_token = p_claim_token
   for update;

  if not found then
    return pg_catalog.jsonb_build_object('outcome', 'claim_missing');
  end if;

  -- A caller-controlled poster id must never let a service-role insert attach
  -- a paid review to another user's poster. FOR KEY SHARE keeps a verified
  -- owner row stable through the insert; a missing or foreign poster settles
  -- only this exact claim before returning, without spending a credit.
  if p_poster_id is not null then
    perform 1
      from public.posters
     where id = p_poster_id
       and user_id = p_user_id
       for key share;

    if not found then
      if v_claim.pack_credit_reserved then
        update public.users
           set review_credits = review_credits + 1
         where id = p_user_id;
      end if;
      delete from public.poster_review_requests
       where user_id = p_user_id
         and request_key = p_request_key
         and claim_token = p_claim_token;
      return pg_catalog.jsonb_build_object('outcome', 'poster_not_owned');
    end if;
  end if;

  if p_credit_source = 'pack' then
    if not v_claim.pack_credit_reserved then
      delete from public.poster_review_requests
       where user_id = p_user_id
         and request_key = p_request_key
         and claim_token = p_claim_token;
      return pg_catalog.jsonb_build_object('outcome', 'no_credit');
    end if;

    select review_credits
      into v_remaining
      from public.users
     where id = p_user_id;
  elsif v_claim.pack_credit_reserved then
    -- Defensive reconciliation: the add-on path never consumes a pack
    -- reservation, even if a caller mixed the two protocols.
    update public.users
       set review_credits = review_credits + 1
     where id = p_user_id;
  end if;

  insert into public.poster_reviews (
    user_id,
    request_key,
    poster_id,
    source_kind,
    source_meta,
    status,
    stage,
    initial_findings,
    credit_source
  )
  values (
    p_user_id,
    p_request_key,
    p_poster_id,
    p_source_kind,
    coalesce(p_source_meta, '{}'::jsonb),
    'complete',
    'initial',
    p_initial_findings,
    p_credit_source
  )
  returning id into v_review_id;

  delete from public.poster_review_requests
   where user_id = p_user_id
     and request_key = p_request_key
     and claim_token = p_claim_token;

  return pg_catalog.jsonb_build_object(
    'outcome', 'complete',
    'reviewId', v_review_id,
    'stage', 'initial',
    'critique', p_initial_findings,
    'remainingCredits', v_remaining
  );
end;
$$;

comment on function public.finalize_initial_review(
  uuid, uuid, uuid, uuid, text, jsonb, jsonb, text
) is
  'Consumes a previously reserved pack credit (when applicable) while '
  'inserting the keyed completed review. Replays a prior completed key. '
  'service_role only.';

revoke execute on function public.finalize_initial_review(
  uuid, uuid, uuid, uuid, text, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.finalize_initial_review(
  uuid, uuid, uuid, uuid, text, jsonb, jsonb, text
) to service_role;

-- =========================================================================
-- 7. Leased, replay-safe included follow-up
-- =========================================================================
-- Follow-up provider work uses the same claim/fence/replay pattern as the
-- initial operation, but the coordination and durable request identity live
-- directly on the already-paid poster_reviews row:
--   initial  -> followup (request id + active ten-minute lease)
--   followup -> initial  (exact-token release after provider/API failure)
--   followup -> closed   (exact-token completion; request id retained)
-- A closed row replays only the request that completed it. A different
-- request sees `closed`, so the included follow-up cannot be farmed.
create or replace function public.claim_review_followup(
  p_user_id uuid,
  p_review_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_review public.poster_reviews%rowtype;
  v_lease_token uuid := gen_random_uuid();
  v_expires_at timestamptz := pg_catalog.now() + interval '10 minutes';
begin
  if p_user_id is null or p_review_id is null or p_request_id is null then
    raise exception 'user id, review id, and request id are required'
      using errcode = '22004';
  end if;

  select *
    into v_review
    from public.poster_reviews
   where id = p_review_id
   for update;

  if not found then
    return pg_catalog.jsonb_build_object('outcome', 'not_found');
  end if;
  if v_review.user_id <> p_user_id then
    return pg_catalog.jsonb_build_object('outcome', 'not_owner');
  end if;
  if v_review.status <> 'complete' or v_review.initial_findings is null then
    return pg_catalog.jsonb_build_object('outcome', 'not_complete');
  end if;

  if v_review.stage = 'closed' then
    if v_review.followup_request_id = p_request_id then
      return pg_catalog.jsonb_build_object(
        'outcome', 'replay',
        'reviewId', v_review.id,
        'stage', 'closed',
        'critique', v_review.followup_findings
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'outcome', 'closed',
      'reviewId', v_review.id,
      'stage', 'closed'
    );
  end if;

  if v_review.stage = 'followup'
     and v_review.followup_lease_expires_at > pg_catalog.now() then
    return pg_catalog.jsonb_build_object(
      'outcome', 'in_progress',
      'reviewId', v_review.id,
      'expiresAt', v_review.followup_lease_expires_at
    );
  end if;

  update public.poster_reviews
     set stage = 'followup',
         followup_request_id = p_request_id,
         followup_lease_token = v_lease_token,
         followup_lease_expires_at = v_expires_at,
         updated_at = pg_catalog.now()
   where id = p_review_id;

  return pg_catalog.jsonb_build_object(
    'outcome', 'claimed',
    'reviewId', v_review.id,
    'stage', 'followup',
    'leaseToken', v_lease_token,
    'expiresAt', v_expires_at,
    'initialCritique', v_review.initial_findings
  );
end;
$$;

comment on function public.claim_review_followup(uuid, uuid, uuid) is
  'Claims an included follow-up, takes over an expired lease, or replays the '
  'same completed follow-up request. service_role only.';

revoke execute on function public.claim_review_followup(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_review_followup(uuid, uuid, uuid)
  to service_role;

create or replace function public.complete_review_followup(
  p_user_id uuid,
  p_review_id uuid,
  p_request_id uuid,
  p_lease_token uuid,
  p_followup_findings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_review public.poster_reviews%rowtype;
begin
  if p_user_id is null
     or p_review_id is null
     or p_request_id is null
     or p_lease_token is null
     or p_followup_findings is null then
    raise exception 'user id, review id, request id, lease token, and findings are required'
      using errcode = '22004';
  end if;

  select *
    into v_review
    from public.poster_reviews
   where id = p_review_id
   for update;

  if not found then
    return pg_catalog.jsonb_build_object('outcome', 'not_found');
  end if;
  if v_review.user_id <> p_user_id then
    return pg_catalog.jsonb_build_object('outcome', 'not_owner');
  end if;
  if v_review.status <> 'complete' then
    return pg_catalog.jsonb_build_object('outcome', 'not_complete');
  end if;

  if v_review.stage = 'closed' then
    if v_review.followup_request_id = p_request_id then
      return pg_catalog.jsonb_build_object(
        'outcome', 'replay',
        'reviewId', v_review.id,
        'stage', 'closed',
        'critique', v_review.followup_findings
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'outcome', 'closed',
      'reviewId', v_review.id,
      'stage', 'closed'
    );
  end if;

  if v_review.stage <> 'followup'
     or v_review.followup_request_id is distinct from p_request_id
     or v_review.followup_lease_token is distinct from p_lease_token then
    return pg_catalog.jsonb_build_object('outcome', 'claim_missing');
  end if;

  update public.poster_reviews
     set stage = 'closed',
         followup_findings = p_followup_findings,
         followup_lease_token = null,
         followup_lease_expires_at = null,
         updated_at = pg_catalog.now()
   where id = p_review_id;

  return pg_catalog.jsonb_build_object(
    'outcome', 'complete',
    'reviewId', v_review.id,
    'stage', 'closed',
    'critique', p_followup_findings
  );
end;
$$;

comment on function public.complete_review_followup(uuid, uuid, uuid, uuid, jsonb) is
  'Completes a follow-up only for its exact active fencing token and preserves '
  'the request id for response-loss replay. service_role only.';

revoke execute on function public.complete_review_followup(uuid, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_review_followup(uuid, uuid, uuid, uuid, jsonb)
  to service_role;

create or replace function public.release_review_followup(
  p_user_id uuid,
  p_review_id uuid,
  p_request_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_released boolean;
begin
  if p_user_id is null
     or p_review_id is null
     or p_request_id is null
     or p_lease_token is null then
    return false;
  end if;

  update public.poster_reviews
     set stage = 'initial',
         followup_request_id = null,
         followup_lease_token = null,
         followup_lease_expires_at = null,
         updated_at = pg_catalog.now()
   where id = p_review_id
     and user_id = p_user_id
     and stage = 'followup'
     and followup_request_id = p_request_id
     and followup_lease_token = p_lease_token
  returning true into v_released;

  return coalesce(v_released, false);
end;
$$;

comment on function public.release_review_followup(uuid, uuid, uuid, uuid) is
  'Releases only an exact follow-up fencing token; a stale worker cannot undo '
  'a newer takeover. service_role only.';

revoke execute on function public.release_review_followup(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.release_review_followup(uuid, uuid, uuid, uuid)
  to service_role;
