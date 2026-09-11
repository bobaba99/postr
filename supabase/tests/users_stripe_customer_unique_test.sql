-- ==========================================================================
-- pgTAP · users.stripe_customer_id is unique per account (20260911000100)
-- ==========================================================================
--
-- create-checkout passes the stored customer id to Stripe Checkout, so two
-- accounts naming one customer would bind one user's payment to another's
-- Stripe customer. The partial unique index makes that unreachable; NULL
-- (never paid) stays free.
--
-- Run via `npm run db:test` (Docker + `npm run db:start`). Rolls back.
--
-- Fixture ids:
--   u1  0f000000-0000-4000-a000-000000000001
--   u2  0f000000-0000-4000-a000-000000000002

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(4);

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '0f000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated',
   'jane.doe@example.com', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '0f000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated',
   'john.smith@example.com', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now());

grant select, update on public.users to service_role;

-- 1 · the index exists and is unique
select has_index('public', 'users', 'users_stripe_customer_id_unique_idx',
  'users_stripe_customer_id_unique_idx exists');
select index_is_unique('public', 'users', 'users_stripe_customer_id_unique_idx',
  'users_stripe_customer_id_unique_idx is unique');

-- Billing columns are server-owned: write them as the webhook does.
set local role service_role;

-- 2 · the first account takes the customer
select lives_ok(
  $q$ update public.users set stripe_customer_id = 'cus_shared'
      where id = '0f000000-0000-4000-a000-000000000001' $q$,
  'service_role can stamp a customer id on one account');

-- 3 · a second account cannot name the same customer
select throws_ok(
  $q$ update public.users set stripe_customer_id = 'cus_shared'
      where id = '0f000000-0000-4000-a000-000000000002' $q$,
  '23505', null,
  'a second account naming the same Stripe customer is rejected (23505)');

reset role;

select * from finish();
rollback;
