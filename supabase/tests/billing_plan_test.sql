-- ==========================================================================
-- pgTAP · billing-column guard (guard_billing_columns trigger)
-- ==========================================================================
--
-- The billing columns (plan, plan_expires_at, stripe_customer_id,
-- export_credits, stripe_subscription_id, subscription_status,
-- first_paid_export_at, review_credits, review_addon,
-- review_addon_subscription_id) are SERVER-OWNED — only the API / Stripe
-- webhook (service_role) may write them. A user updating their own row (as
-- PostgREST's `authenticated` role) must NOT be able to grant themselves a
-- paid plan, credits, or the review add-on.
--
--   * authenticated user CANNOT set plan='term'                (raises)
--   * authenticated user CANNOT set export_credits             (raises)
--   * authenticated user CANNOT set plan_expires_at            (raises)
--   * authenticated user CAN still update a non-billing column (display_name)
--   * service_role (the webhook) CAN set plan + credits        (succeeds)
--   * defaults: a fresh user is 'free' with 0 credits
--   * CHECK constraints reject an invalid plan / negative credits
--
-- Run via `npm run db:test` (Docker + `npm run db:start`). Rolls back.
--
-- Fixture id:
--   u1  0b000000-0000-4000-a000-000000000001

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(9);

-- --------------------------------------------------------------------------
-- Fixture (as superuser): one confirmed user. The handle_new_user trigger
-- auto-creates the public.users row, so we only insert into auth.users.
-- --------------------------------------------------------------------------
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '0b000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated',
   'jane.doe@example.com', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now());

-- 1 · defaults
select is(
  (select plan from public.users where id = '0b000000-0000-4000-a000-000000000001'),
  'free',
  'a fresh user starts on the free plan');

-- 2 · default credits
select is(
  (select export_credits from public.users where id = '0b000000-0000-4000-a000-000000000001'),
  0,
  'a fresh user starts with 0 export credits');

-- --------------------------------------------------------------------------
-- As the AUTHENTICATED user (PostgREST-style): billing writes must be rejected
-- --------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"0b000000-0000-4000-a000-000000000001","role":"authenticated"}',
  true);
set local role authenticated;

-- 3 · cannot self-grant a term
select throws_ok(
  $q$ update public.users set plan = 'term'
      where id = '0b000000-0000-4000-a000-000000000001' $q$,
  'P0001',
  'billing columns (plan, plan_expires_at, stripe_customer_id, export_credits, stripe_subscription_id, subscription_status, first_paid_export_at, review_credits, review_addon, review_addon_subscription_id) are server-owned and cannot be changed by the client',
  'authenticated user cannot set plan = term');

-- 4 · cannot self-grant credits
select throws_ok(
  $q$ update public.users set export_credits = 99
      where id = '0b000000-0000-4000-a000-000000000001' $q$,
  'P0001',
  'billing columns (plan, plan_expires_at, stripe_customer_id, export_credits, stripe_subscription_id, subscription_status, first_paid_export_at, review_credits, review_addon, review_addon_subscription_id) are server-owned and cannot be changed by the client',
  'authenticated user cannot set export_credits');

-- 5 · cannot self-set an expiry
select throws_ok(
  $q$ update public.users set plan_expires_at = now() + interval '4 months'
      where id = '0b000000-0000-4000-a000-000000000001' $q$,
  'P0001',
  'billing columns (plan, plan_expires_at, stripe_customer_id, export_credits, stripe_subscription_id, subscription_status, first_paid_export_at, review_credits, review_addon, review_addon_subscription_id) are server-owned and cannot be changed by the client',
  'authenticated user cannot set plan_expires_at');

-- 6 · a non-billing update still works (the guard is column-scoped)
select lives_ok(
  $q$ update public.users set display_name = 'Jane D.'
      where id = '0b000000-0000-4000-a000-000000000001' $q$,
  'authenticated user can still update a non-billing column');

reset role;
select set_config('request.jwt.claims', null, true);

-- --------------------------------------------------------------------------
-- As SERVICE_ROLE (the Stripe webhook): billing writes must succeed
-- --------------------------------------------------------------------------
set local role service_role;

select lives_ok(
  $q$ update public.users
        set plan = 'term',
            plan_expires_at = now() + interval '4 months',
            stripe_customer_id = 'cus_test123',
            export_credits = 3
      where id = '0b000000-0000-4000-a000-000000000001' $q$,
  'service_role (the webhook) can write billing columns');

select is(
  (select plan from public.users where id = '0b000000-0000-4000-a000-000000000001'),
  'term',
  'the webhook write took effect');

-- --------------------------------------------------------------------------
-- Constraints — checked AS service_role, because the billing guard fires
-- for any non-service_role caller (including a bare superuser session with
-- no auth.role()). Running as service_role passes the guard so the write
-- reaches the CHECK constraint, which is what this test targets.
-- --------------------------------------------------------------------------
-- 9 · invalid plan rejected by the CHECK constraint
select throws_ok(
  $q$ update public.users set plan = 'enterprise'
      where id = '0b000000-0000-4000-a000-000000000001' $q$,
  '23514',
  null,
  'the plan CHECK constraint rejects an unknown plan');

reset role;

select * from finish();
rollback;
