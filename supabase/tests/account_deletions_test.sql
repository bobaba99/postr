-- ==========================================================================
-- pgTAP · account deletion hardening (20260911000000)
-- ==========================================================================
--
-- Account deletion runs through POST /account/delete (apps/api/src/
-- account.ts) so Stripe billing is wound down before the auth delete.
-- This file pins the two DB-side halves of that contract:
--
--   * public.account_deletions is server-only — RLS on, zero policies,
--     no table privilege for anon / authenticated, full access for
--     service_role (the API writes the audit row with it).
--   * delete_own_account() no longer exists — dropped, not revoked: on
--     supabase/postgres 17.6.1.106 a browser role calling a function it
--     lacks EXECUTE on segfaults the backend, so a stale client must hit
--     a plain undefined-function error (42883) instead of a grant check.
--
-- Both are asserted at the grant layer AND behaviourally (as the actual
-- `authenticated` role, the way PostgREST runs browser calls).
--
-- Run via `npm run db:test` (Docker + `npm run db:start`). Rolls back.
--
-- Fixture id:
--   u1  0e000000-0000-4000-a000-000000000001

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(17);

-- --------------------------------------------------------------------------
-- Fixture (as superuser): one confirmed user, so the behavioural RPC call
-- below has a real auth.uid() to match — and must still be refused.
-- --------------------------------------------------------------------------
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '0e000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated',
   'jane.doe@example.com', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now());

-- --------------------------------------------------------------------------
-- 1–6 · account_deletions shape
-- --------------------------------------------------------------------------
select has_table('public', 'account_deletions', 'account_deletions table exists');
select has_column('public', 'account_deletions', 'user_id', 'has user_id');
select has_column('public', 'account_deletions', 'stripe_customer_id', 'has stripe_customer_id');
select col_type_is('public', 'account_deletions', 'cancelled_subscription_ids', 'text[]',
  'cancelled_subscription_ids is text[]');
select col_type_is('public', 'account_deletions', 'storage_objects_removed', 'integer',
  'storage_objects_removed is integer');
select col_not_null('public', 'account_deletions', 'deleted_at', 'deleted_at is not null');

-- --------------------------------------------------------------------------
-- 7–12 · account_deletions is service_role-only
-- --------------------------------------------------------------------------
select ok(
  (select relrowsecurity from pg_class where oid = 'public.account_deletions'::regclass),
  'RLS is enabled on account_deletions');
select policies_are('public', 'account_deletions', array[]::name[],
  'account_deletions has no RLS policies (nothing lets a browser role in)');
select table_privs_are('public', 'account_deletions', 'anon', array[]::name[],
  'anon has no privilege on account_deletions');
select table_privs_are('public', 'account_deletions', 'authenticated', array[]::name[],
  'authenticated has no privilege on account_deletions');
select ok(
  has_table_privilege('service_role', 'public.account_deletions', 'INSERT'),
  'service_role can insert into account_deletions');
select ok(
  has_table_privilege('service_role', 'public.account_deletions', 'SELECT'),
  'service_role can read account_deletions');

-- --------------------------------------------------------------------------
-- 13 · delete_own_account() is gone
-- --------------------------------------------------------------------------
select hasnt_function('public', 'delete_own_account', array[]::name[],
  'delete_own_account() is dropped (deletion runs through POST /account/delete)');

-- --------------------------------------------------------------------------
-- 14–16 · Behavioural: as the real `authenticated` role, with a matching
-- auth.uid(), every browser path is refused — the old RPC with 42883
-- (undefined function, no privilege check involved), the table with 42501.
-- --------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"0e000000-0000-4000-a000-000000000001","role":"authenticated"}',
  true);
set local role authenticated;

select throws_ok(
  $q$ select public.delete_own_account() $q$,
  '42883', null,
  'a stale client calling the old RPC gets undefined_function, not a grant check');
select throws_ok(
  $q$ insert into public.account_deletions (user_id)
      values ('0e000000-0000-4000-a000-000000000001') $q$,
  '42501', null,
  'authenticated cannot write an audit row');
select throws_ok(
  $q$ select count(*) from public.account_deletions $q$,
  '42501', null,
  'authenticated cannot read the audit table');

reset role;

-- Nothing above may have deleted anyone.
select is(
  (select count(*) from auth.users
    where id = '0e000000-0000-4000-a000-000000000001'),
  1::bigint,
  '...and the user still exists');  -- 17

select * from finish();
rollback;
