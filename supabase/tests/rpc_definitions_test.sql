-- ==========================================================================
-- pgTAP · RPC definition pins
-- ==========================================================================
--
-- Asserts the security-relevant shape of every SQL RPC: it exists, returns
-- the right type, runs as `security definer`, and pins `search_path`
-- (the definer-hijack guard). Catches "someone dropped/renamed/loosened a
-- function" instantly, with readable diagnostics.
--
-- Run via `npm run db:test` (requires Docker + the local Supabase stack,
-- `npm run db:start`). Everything here runs inside one transaction and
-- rolls back — the database is left untouched.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(15);

-- --------------------------------------------------------------------------
-- Functions exist
-- --------------------------------------------------------------------------
select has_function('public', 'export_my_data', array[]::name[],
  'export_my_data() exists');
select has_function('public', 'delete_own_account', array[]::name[],
  'delete_own_account() exists');
select has_function('public', 'enforce_feedback_rate_limit', array[]::name[],
  'enforce_feedback_rate_limit() exists');

-- --------------------------------------------------------------------------
-- Return types
-- --------------------------------------------------------------------------
select function_returns('public', 'export_my_data', array[]::name[], 'jsonb',
  'export_my_data() returns jsonb');
select function_returns('public', 'delete_own_account', array[]::name[], 'void',
  'delete_own_account() returns void');
select function_returns('public', 'enforce_feedback_rate_limit', array[]::name[], 'trigger',
  'enforce_feedback_rate_limit() returns trigger');

-- --------------------------------------------------------------------------
-- security definer — all three read/write across RLS boundaries on purpose
-- --------------------------------------------------------------------------
select is_definer('public', 'export_my_data', array[]::name[],
  'export_my_data() is security definer');
select is_definer('public', 'delete_own_account', array[]::name[],
  'delete_own_account() is security definer');
select is_definer('public', 'enforce_feedback_rate_limit', array[]::name[],
  'enforce_feedback_rate_limit() is security definer');

-- --------------------------------------------------------------------------
-- Pinned search_path — a security definer function without one is open to
-- search_path-based privilege escalation
-- --------------------------------------------------------------------------
select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'export_my_data'
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  ),
  'export_my_data() pins search_path');
select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_own_account'
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  ),
  'delete_own_account() pins search_path');
select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'enforce_feedback_rate_limit'
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  ),
  'enforce_feedback_rate_limit() pins search_path');

-- --------------------------------------------------------------------------
-- Wiring + grants
--
-- NOTE: these assert callability, not an access boundary. EXECUTE is also
-- held by PUBLIC — Postgres grants it on every function by default, and the
-- `revoke ... from anon` in 20260410000000_delete_own_account.sql does not
-- remove the PUBLIC grant. The enforced boundary is the auth.uid() guard
-- inside each function body, covered behaviorally: export_my_data() raises
-- P0001 unauthenticated (export_my_data_test.sql) and delete_own_account()
-- deletes nothing (delete_own_account_test.sql). Tightening the grants with
-- `revoke execute ... from public` is tracked as separate hardening work.
-- --------------------------------------------------------------------------
select has_trigger('public', 'feedback', 'feedback_rate_limit_trigger',
  'rate-limit trigger is attached to public.feedback');

select function_privs_are('public', 'export_my_data', array[]::name[],
  'authenticated', array['EXECUTE'],
  'authenticated role can execute export_my_data()');
select function_privs_are('public', 'delete_own_account', array[]::name[],
  'authenticated', array['EXECUTE'],
  'authenticated role can execute delete_own_account()');

select * from finish();
rollback;
