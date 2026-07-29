-- ==========================================================================
-- pgTAP · public.poster_reviews — RLS + review billing columns / RPCs
-- ==========================================================================
--
-- The Presentation Checker's review rows are written ONLY by the API
-- (service_role); the owner may read them but never write (D3 — an
-- owner-writable `stage` would let a client reset a closed review and farm
-- free follow-ups). The review-credit ledger mirrors export_credits: a
-- server-owned users column with service_role-only consume/grant RPCs.
--
--   * defaults: status 'pending', stage 'initial', empty source_meta
--   * owner can SELECT their own reviews
--   * another user's reviews are invisible
--   * authenticated INSERT is rejected (42501 — no insert policy)
--   * owner UPDATE hits zero rows (no update policy — D3)
--   * the billing guard rejects a client write to review_credits
--   * service_role (the API) can INSERT and UPDATE reviews
--   * consume_review_credit decrements; returns NULL at zero
--   * grant_review_credits adds atomically
--   * CHECK rejects a negative review_credits balance
--
-- Run via `npm run db:test` (Docker + `npm run db:start`). Rolls back.
--
-- Fixture ids:
--   u1  d1000000-0000-4000-a000-000000000001
--   u2  d1000000-0000-4000-a000-000000000002
--   r1  e1000000-0000-4000-a000-000000000001  (u1's review)
--   r2  e1000000-0000-4000-a000-000000000002  (u2's review)

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(14);

-- --------------------------------------------------------------------------
-- Fixtures (as superuser): two users (handle_new_user auto-creates their
-- public.users rows) and one review each, written directly — the API's
-- service_role write path is exercised separately below.
-- --------------------------------------------------------------------------
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, is_anonymous, created_at, updated_at)
select
  '00000000-0000-4000-a000-000000000000', u.id, 'authenticated', 'authenticated',
  u.email, '', now(),
  '{"provider":"email","providers":["email"]}', '{}', false, now(), now()
from (values
  ('d1000000-0000-4000-a000-000000000001'::uuid, 'jane.doe@example.com'),
  ('d1000000-0000-4000-a000-000000000002'::uuid, 'john.smith@example.com')
) as u (id, email);

insert into public.poster_reviews (id, user_id, source_kind) values
  ('e1000000-0000-4000-a000-000000000001', 'd1000000-0000-4000-a000-000000000001', 'postr'),
  ('e1000000-0000-4000-a000-000000000002', 'd1000000-0000-4000-a000-000000000002', 'pdf');

-- 1 · default status
select is(
  (select status from public.poster_reviews where id = 'e1000000-0000-4000-a000-000000000001'),
  'pending',
  'a fresh review row starts pending');

-- 2 · default stage
select is(
  (select stage from public.poster_reviews where id = 'e1000000-0000-4000-a000-000000000001'),
  'initial',
  'a fresh review row starts at stage initial');

-- 3 · default source_meta
select is(
  (select source_meta from public.poster_reviews where id = 'e1000000-0000-4000-a000-000000000001'),
  '{}'::jsonb,
  'a fresh review row starts with empty source_meta');

-- Seed one review credit for u1. The billing guard fires for ANY
-- non-service_role caller — even this superuser session — so the fixture
-- write must run as service_role (same pattern as billing_plan_test.sql).
set local role service_role;
update public.users set review_credits = 1
  where id = 'd1000000-0000-4000-a000-000000000001';
reset role;

-- --------------------------------------------------------------------------
-- As the AUTHENTICATED owner (PostgREST-style): read yes, write never
-- --------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-4000-a000-000000000001","role":"authenticated"}',
  true);
set local role authenticated;

-- 4 · owner can select their own reviews
select is(
  (select count(*) from public.poster_reviews
    where user_id = 'd1000000-0000-4000-a000-000000000001'),
  1::bigint,
  'owner can select their own reviews');

-- 5 · another user's reviews are invisible
select is(
  (select count(*) from public.poster_reviews
    where user_id = 'd1000000-0000-4000-a000-000000000002'),
  0::bigint,
  'another user''s reviews are invisible');

-- 6 · INSERT is rejected — no insert policy (writes are service_role only)
select throws_ok(
  $q$ insert into public.poster_reviews (user_id, source_kind)
      values ('d1000000-0000-4000-a000-000000000001', 'pdf') $q$,
  '42501',
  'new row violates row-level security policy for table "poster_reviews"',
  'authenticated INSERT is rejected — no insert policy (service_role only)');

-- 7 · UPDATE hits zero rows — no update policy. The data-modifying CTE must
-- sit at the TOP LEVEL of the statement (Postgres rejects it inside is()'s
-- subquery), so is() reads the CTE.
with updated as (
  update public.poster_reviews
     set stage = 'initial'
   where id = 'e1000000-0000-4000-a000-000000000001'
  returning 1
)
select is(
  (select count(*) from updated),
  0::bigint,
  'owner UPDATE hits zero rows — a closed review cannot be reset from the client');

-- 8 · the billing guard rejects a client write to review_credits
select throws_ok(
  $q$ update public.users set review_credits = 99
      where id = 'd1000000-0000-4000-a000-000000000001' $q$,
  'P0001',
  'billing columns (plan, plan_expires_at, stripe_customer_id, export_credits, stripe_subscription_id, subscription_status, first_paid_export_at, review_credits, review_addon, review_addon_subscription_id) are server-owned and cannot be changed by the client',
  'the billing guard rejects a client write to review_credits');

reset role;
select set_config('request.jwt.claims', null, true);

-- --------------------------------------------------------------------------
-- As SERVICE_ROLE (the API): the only writer of review rows and credits
-- --------------------------------------------------------------------------
set local role service_role;

-- 9 · service_role can insert the completed review (D16: one write, after a
-- successful critique, status 'complete'; rubric version stamped in
-- source_meta per the Global Constraints)
select lives_ok(
  $q$ insert into public.poster_reviews
        (user_id, source_kind, source_meta, status, initial_findings, credit_source)
      values (
        'd1000000-0000-4000-a000-000000000001',
        'pdf',
        '{"filename":"talk.pdf","pageCount":12,"rubric_version":"rubric.v1"}'::jsonb,
        'complete',
        '{"dimensionScores":{"narrative":3,"design":3,"content":3},"attentionSummary":"The entry point is the results figure.","findings":[]}'::jsonb,
        'pack') $q$,
  'service_role (the API) can insert a completed review');

-- 10 · service_role can write followup_findings and close the review
select lives_ok(
  $q$ update public.poster_reviews
        set stage = 'closed',
            followup_findings = '{"dimensionScores":{"narrative":4,"design":4,"content":4},"attentionSummary":"The revision lands the key result early.","findings":[]}'::jsonb
      where id = 'e1000000-0000-4000-a000-000000000001' $q$,
  'service_role can write followup_findings and close the review');

-- 11 · consume_review_credit spends the seeded credit (1 → 0)
select is(
  (select public.consume_review_credit('d1000000-0000-4000-a000-000000000001')),
  0,
  'consume_review_credit decrements and returns the new balance');

-- 12 · …and returns NULL once the balance is zero (the "no credit" signal)
select ok(
  (select public.consume_review_credit('d1000000-0000-4000-a000-000000000001')) is null,
  'consume_review_credit returns NULL when no credit remains');

-- 13 · grant_review_credits adds atomically (0 → 3)
select is(
  (select public.grant_review_credits('d1000000-0000-4000-a000-000000000001', 3)),
  3,
  'grant_review_credits adds credits and returns the new balance');

-- 14 · the nonneg CHECK rejects a negative balance (checked AS service_role
-- so the billing guard passes and the write reaches the constraint — same
-- pattern as billing_plan_test.sql's plan-CHECK assertion)
select throws_ok(
  $q$ update public.users set review_credits = -1
      where id = 'd1000000-0000-4000-a000-000000000001' $q$,
  '23514',
  null,
  'the review_credits nonneg CHECK rejects a negative balance');

reset role;

select * from finish();
rollback;
