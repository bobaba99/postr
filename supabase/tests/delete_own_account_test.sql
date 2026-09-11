-- ==========================================================================
-- pgTAP · account deletion cascade (auth.users → everything user-owned)
-- ==========================================================================
--
-- Account deletion runs through POST /account/delete
-- (apps/api/src/account.ts): the API cancels Stripe billing, removes the
-- user's Storage objects, then calls auth.admin.deleteUser, which is a
-- plain `delete from auth.users`. This file pins the FK cascade contract
-- that single delete relies on:
--
--   auth.users ─cascade→ public.users ─cascade→ public.posters
--   auth.users ─cascade→ public.gallery_entries
--   auth.users ─set null→ public.feedback   (row survives, anonymized)
--
-- It also pins that the old browser-callable RPC delete_own_account() is
-- gone (dropped by 20260911000000_account_delete_hardening.sql — dropped
-- rather than revoked, because on supabase/postgres 17.6.1.106 a browser
-- role calling a function it lacks EXECUTE on segfaults the backend).
--
-- Run via `npm run db:test` (requires Docker + `npm run db:start`).
-- Rolls back at the end; the database is left untouched.
--
-- Fixture ids (u1 is deleted, u2 is the survivor):
--   u1  0d000000-0000-4000-a000-000000000001
--   u2  0d000000-0000-4000-a000-000000000002
--   f1  0d000000-0000-4000-d000-000000000001  (u1 feedback — must survive)
--   f2  0d000000-0000-4000-d000-000000000002  (u2 feedback — untouched)

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(10);

-- --------------------------------------------------------------------------
-- Fixtures
-- --------------------------------------------------------------------------
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '0d000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated',
   'jane.doe@example.com', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '0d000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated',
   'john.smith@example.com', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now());

insert into public.posters (user_id, title)
values
  ('0d000000-0000-4000-a000-000000000001', 'Poster doomed with its owner'),
  ('0d000000-0000-4000-a000-000000000002', 'Survivor poster');

insert into public.gallery_entries (user_id, source, poster_id, image_path, title, field)
values
  ('0d000000-0000-4000-a000-000000000001', 'upload', null,
   '0d000000-0000-4000-a000-000000000001/upload.png',
   'Gallery entry doomed with its owner', 'other');

insert into public.feedback (id, user_id, kind, title, body)
values
  ('0d000000-0000-4000-d000-000000000001',
   '0d000000-0000-4000-a000-000000000001', 'bug',
   'Feedback that must outlive the account',
   'Feedback is kept anonymized after account deletion.'),
  ('0d000000-0000-4000-d000-000000000002',
   '0d000000-0000-4000-a000-000000000002', 'feature',
   'Feedback from the surviving user',
   'Must keep its user_id.');

-- --------------------------------------------------------------------------
-- 1 · The old RPC is gone — the browser has nothing to call
-- --------------------------------------------------------------------------
select hasnt_function('public', 'delete_own_account', array[]::name[],
  'delete_own_account() is dropped (account deletion is POST /account/delete)');

-- --------------------------------------------------------------------------
-- 2 · The API deletes the auth row (what auth.admin.deleteUser does)
-- --------------------------------------------------------------------------
select lives_ok(
  $q$ delete from auth.users where id = '0d000000-0000-4000-a000-000000000001' $q$,
  'deleting the auth.users row succeeds');

-- --------------------------------------------------------------------------
-- 3–7 · u1 is gone everywhere; feedback survives anonymized
-- --------------------------------------------------------------------------
select is(
  (select count(*) from public.users
    where id = '0d000000-0000-4000-a000-000000000001'),
  0::bigint,
  'public.users profile is cascade-deleted');

select is(
  (select count(*) from public.posters
    where user_id = '0d000000-0000-4000-a000-000000000001'),
  0::bigint,
  'posters are cascade-deleted');

select is(
  (select count(*) from public.gallery_entries
    where user_id = '0d000000-0000-4000-a000-000000000001'),
  0::bigint,
  'gallery entries are cascade-deleted');

select is(
  (select count(*) from public.feedback
    where id = '0d000000-0000-4000-d000-000000000001'),
  1::bigint,
  'feedback row survives account deletion');

select is(
  (select user_id from public.feedback
    where id = '0d000000-0000-4000-d000-000000000001'),
  null::uuid,
  '...anonymized: its user_id is set null');

-- --------------------------------------------------------------------------
-- 8–10 · The other user is untouched
-- --------------------------------------------------------------------------
select is(
  (select count(*) from auth.users
    where id = '0d000000-0000-4000-a000-000000000002'),
  1::bigint,
  'other auth.users row is untouched');

select is(
  (select count(*) from public.posters
    where user_id = '0d000000-0000-4000-a000-000000000002'),
  1::bigint,
  'other user''s posters are untouched');

select is(
  (select user_id from public.feedback
    where id = '0d000000-0000-4000-d000-000000000002'),
  '0d000000-0000-4000-a000-000000000002'::uuid,
  'other user''s feedback keeps its user_id');

select * from finish();
rollback;
