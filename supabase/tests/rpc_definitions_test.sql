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

select plan(64);

-- --------------------------------------------------------------------------
-- Functions exist
-- --------------------------------------------------------------------------
select has_function('public', 'export_my_data', array[]::name[],
  'export_my_data() exists');
select has_function('public', 'delete_own_account', array[]::name[],
  'delete_own_account() exists');
select has_function('public', 'enforce_feedback_rate_limit', array[]::name[],
  'enforce_feedback_rate_limit() exists');
select has_function('public', 'consume_review_credit', array['uuid']::name[],
  'consume_review_credit(uuid) exists');
select has_function('public', 'grant_review_credits', array['uuid', 'integer']::name[],
  'grant_review_credits(uuid, integer) exists');
select has_function(
  'public',
  'consume_review_addon_slot',
  array['uuid', 'integer']::name[],
  'consume_review_addon_slot(uuid, integer) exists');
select has_function('public', 'claim_initial_review', array['uuid', 'uuid']::name[],
  'claim_initial_review(uuid, uuid) exists');
select has_function('public', 'release_initial_review', array['uuid', 'uuid', 'uuid']::name[],
  'release_initial_review(uuid, uuid, uuid) exists');
select has_function(
  'public',
  'finalize_initial_review',
  array['uuid', 'uuid', 'uuid', 'uuid', 'text', 'jsonb', 'jsonb', 'text']::name[],
  'finalize_initial_review(uuid, uuid, uuid, uuid, text, jsonb, jsonb, text) exists');
select has_function(
  'public',
  'fulfill_credit_pack',
  array['text', 'uuid', 'integer', 'text']::name[],
  'fulfill_credit_pack(text, uuid, integer, text) exists');

-- --------------------------------------------------------------------------
-- Return types
-- --------------------------------------------------------------------------
select function_returns('public', 'export_my_data', array[]::name[], 'jsonb',
  'export_my_data() returns jsonb');
select function_returns('public', 'delete_own_account', array[]::name[], 'void',
  'delete_own_account() returns void');
select function_returns('public', 'enforce_feedback_rate_limit', array[]::name[], 'trigger',
  'enforce_feedback_rate_limit() returns trigger');
select function_returns('public', 'consume_review_credit', array['uuid']::name[], 'integer',
  'consume_review_credit(uuid) returns integer');
select function_returns('public', 'grant_review_credits', array['uuid', 'integer']::name[], 'integer',
  'grant_review_credits(uuid, integer) returns integer');
select function_returns(
  'public',
  'consume_review_addon_slot',
  array['uuid', 'integer']::name[],
  'jsonb',
  'consume_review_addon_slot(uuid, integer) returns jsonb');
select function_returns('public', 'claim_initial_review', array['uuid', 'uuid']::name[], 'jsonb',
  'claim_initial_review(uuid, uuid) returns jsonb');
select function_returns('public', 'release_initial_review', array['uuid', 'uuid', 'uuid']::name[], 'boolean',
  'release_initial_review(uuid, uuid, uuid) returns boolean');
select function_returns(
  'public',
  'finalize_initial_review',
  array['uuid', 'uuid', 'uuid', 'uuid', 'text', 'jsonb', 'jsonb', 'text']::name[],
  'jsonb',
  'finalize_initial_review(uuid, uuid, uuid, uuid, text, jsonb, jsonb, text) returns jsonb');
select function_returns(
  'public',
  'fulfill_credit_pack',
  array['text', 'uuid', 'integer', 'text']::name[],
  'integer',
  'fulfill_credit_pack(text, uuid, integer, text) returns integer');

-- --------------------------------------------------------------------------
-- security definer — all three read/write across RLS boundaries on purpose
-- --------------------------------------------------------------------------
select is_definer('public', 'export_my_data', array[]::name[],
  'export_my_data() is security definer');
select is_definer('public', 'delete_own_account', array[]::name[],
  'delete_own_account() is security definer');
select is_definer('public', 'enforce_feedback_rate_limit', array[]::name[],
  'enforce_feedback_rate_limit() is security definer');
select is_definer('public', 'consume_review_credit', array['uuid']::name[],
  'consume_review_credit(uuid) is security definer');
select is_definer('public', 'grant_review_credits', array['uuid', 'integer']::name[],
  'grant_review_credits(uuid, integer) is security definer');
select is_definer(
  'public',
  'consume_review_addon_slot',
  array['uuid', 'integer']::name[],
  'consume_review_addon_slot(uuid, integer) is security definer');
select is_definer('public', 'claim_initial_review', array['uuid', 'uuid']::name[],
  'claim_initial_review(uuid, uuid) is security definer');
select is_definer('public', 'release_initial_review', array['uuid', 'uuid', 'uuid']::name[],
  'release_initial_review(uuid, uuid, uuid) is security definer');
select is_definer(
  'public',
  'finalize_initial_review',
  array['uuid', 'uuid', 'uuid', 'uuid', 'text', 'jsonb', 'jsonb', 'text']::name[],
  'finalize_initial_review(uuid, uuid, uuid, uuid, text, jsonb, jsonb, text) is security definer');
select is_definer(
  'public',
  'fulfill_credit_pack',
  array['text', 'uuid', 'integer', 'text']::name[],
  'fulfill_credit_pack(text, uuid, integer, text) is security definer');

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
select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'consume_review_credit'
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  ),
  'consume_review_credit() pins search_path');
select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'grant_review_credits'
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  ),
  'grant_review_credits() pins search_path');
select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'consume_review_addon_slot'
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  ),
  'consume_review_addon_slot() pins search_path');
select ok(
  exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'consume_review_addon_slot'
       and pg_get_functiondef(p.oid) ~* 'for update'
       and pg_get_functiondef(p.oid) ~* 'ceil'
  ),
  'consume_review_addon_slot() locks the user row and ceilings retry-after');
select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'claim_initial_review'
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  ),
  'claim_initial_review() pins search_path');
select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'release_initial_review'
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  ),
  'release_initial_review() pins search_path');
select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'finalize_initial_review'
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  ),
  'finalize_initial_review() pins search_path');
select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fulfill_credit_pack'
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  ),
  'fulfill_credit_pack() pins search_path');

-- --------------------------------------------------------------------------
-- Wiring + grants
--
-- 20260610120000_rpc_grant_hardening.sql revoked the default PUBLIC
-- EXECUTE grant, so grants are a real access boundary: only `authenticated`
-- may call the user-facing RPCs. The negative assertions below pin that —
-- has_function_privilege('anon', ...) sees privileges inherited via PUBLIC,
-- so they also catch a drop+recreate that silently resurrects the default
-- grant. The auth.uid() guards inside each body stay covered behaviorally:
-- export_my_data() raises P0001 unauthenticated (export_my_data_test.sql),
-- delete_own_account() deletes nothing (delete_own_account_test.sql).
-- --------------------------------------------------------------------------
select has_trigger('public', 'feedback', 'feedback_rate_limit_trigger',
  'rate-limit trigger is attached to public.feedback');

select function_privs_are('public', 'export_my_data', array[]::name[],
  'authenticated', array['EXECUTE'],
  'authenticated role can execute export_my_data()');
select function_privs_are('public', 'delete_own_account', array[]::name[],
  'authenticated', array['EXECUTE'],
  'authenticated role can execute delete_own_account()');
select function_privs_are('public', 'is_gallery_admin', array['uuid']::name[],
  'authenticated', array['EXECUTE'],
  'authenticated role can execute is_gallery_admin(uuid)');

select ok(
  not has_function_privilege('anon', 'public.delete_own_account()', 'EXECUTE'),
  'anon cannot execute delete_own_account()');
select ok(
  not has_function_privilege('anon', 'public.export_my_data()', 'EXECUTE'),
  'anon cannot execute export_my_data()');
select ok(
  not has_function_privilege('anon', 'public.is_gallery_admin(uuid)', 'EXECUTE'),
  'anon cannot execute is_gallery_admin(uuid)');

-- service_role-only RPCs: BOTH browser-facing roles must lack EXECUTE.
select ok(
  not has_function_privilege('anon', 'public.consume_review_credit(uuid)', 'EXECUTE'),
  'anon cannot execute consume_review_credit(uuid)');
select ok(
  not has_function_privilege('anon', 'public.grant_review_credits(uuid, integer)', 'EXECUTE'),
  'anon cannot execute grant_review_credits(uuid, integer)');
select ok(
  not has_function_privilege('authenticated', 'public.consume_review_credit(uuid)', 'EXECUTE'),
  'authenticated cannot execute consume_review_credit(uuid)');
select ok(
  not has_function_privilege('authenticated', 'public.grant_review_credits(uuid, integer)', 'EXECUTE'),
  'authenticated cannot execute grant_review_credits(uuid, integer)');
select ok(
  not has_function_privilege(
    'anon',
    'public.consume_review_addon_slot(uuid, integer)',
    'EXECUTE'),
  'anon cannot execute consume_review_addon_slot(uuid, integer)');
select ok(
  not has_function_privilege(
    'authenticated',
    'public.consume_review_addon_slot(uuid, integer)',
    'EXECUTE'),
  'authenticated cannot execute consume_review_addon_slot(uuid, integer)');
select ok(
  has_function_privilege(
    'service_role',
    'public.consume_review_addon_slot(uuid, integer)',
    'EXECUTE'),
  'service_role can execute consume_review_addon_slot(uuid, integer)');
select ok(
  not has_function_privilege('anon', 'public.claim_initial_review(uuid, uuid)', 'EXECUTE'),
  'anon cannot execute claim_initial_review(uuid, uuid)');
select ok(
  not has_function_privilege('authenticated', 'public.claim_initial_review(uuid, uuid)', 'EXECUTE'),
  'authenticated cannot execute claim_initial_review(uuid, uuid)');
select ok(
  not has_function_privilege('anon', 'public.release_initial_review(uuid, uuid, uuid)', 'EXECUTE'),
  'anon cannot execute release_initial_review(uuid, uuid, uuid)');
select ok(
  not has_function_privilege('authenticated', 'public.release_initial_review(uuid, uuid, uuid)', 'EXECUTE'),
  'authenticated cannot execute release_initial_review(uuid, uuid, uuid)');
select ok(
  not has_function_privilege(
    'anon',
    'public.finalize_initial_review(uuid, uuid, uuid, uuid, text, jsonb, jsonb, text)',
    'EXECUTE'),
  'anon cannot execute finalize_initial_review(uuid, uuid, uuid, uuid, text, jsonb, jsonb, text)');
select ok(
  not has_function_privilege(
    'authenticated',
    'public.finalize_initial_review(uuid, uuid, uuid, uuid, text, jsonb, jsonb, text)',
    'EXECUTE'),
  'authenticated cannot execute finalize_initial_review(uuid, uuid, uuid, uuid, text, jsonb, jsonb, text)');
select ok(
  not has_function_privilege(
    'anon',
    'public.fulfill_credit_pack(text, uuid, integer, text)',
    'EXECUTE'),
  'anon cannot execute fulfill_credit_pack(text, uuid, integer, text)');
select ok(
  not has_function_privilege(
    'authenticated',
    'public.fulfill_credit_pack(text, uuid, integer, text)',
    'EXECUTE'),
  'authenticated cannot execute fulfill_credit_pack(text, uuid, integer, text)');
select ok(
  has_function_privilege(
    'service_role',
    'public.fulfill_credit_pack(text, uuid, integer, text)',
    'EXECUTE'),
  'service_role can execute fulfill_credit_pack(text, uuid, integer, text)');

select * from finish();
rollback;
