-- ==========================================================================
-- pgTAP · delete_own_account()
-- ==========================================================================
--
-- Account self-deletion. The function deletes the caller's auth.users row
-- and relies on the FK graph for everything else, so this file pins the
-- whole cascade contract:
--
--   auth.users ─cascade→ public.users ─cascade→ public.posters
--   auth.users ─cascade→ public.gallery_entries
--   auth.users ─set null→ public.feedback   (row survives, anonymized)
--
-- It also pins the unauthenticated safety property: with auth.uid() null
-- the delete matches nothing — it must never touch other rows.
--
-- Run via `npm run db:test` (requires Docker + `npm run db:start`).
-- Rolls back at the end; the database is left untouched.
--
-- Fixture ids (u1 deletes their account, u2 is the survivor):
--   u1  0d000000-0000-4000-a000-000000000001
--   u2  0d000000-0000-4000-a000-000000000002
--   f1  0d000000-0000-4000-d000-000000000001  (u1 feedback — must survive)
--   f2  0d000000-0000-4000-d000-000000000002  (u2 feedback — untouched)

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(12);

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
-- 1–2 · Unauthenticated: auth.uid() is null → must delete nothing
-- --------------------------------------------------------------------------
-- Pin the precondition explicitly (auth.uid() treats '' as unset) so a
-- future reorder can't silently turn this into an authenticated call.
select set_config('request.jwt.claims', '', true);

select lives_ok(
  $q$ select public.delete_own_account() $q$,
  'unauthenticated call does not error');

select is(
  (select count(*) from auth.users
    where id in ('0d000000-0000-4000-a000-000000000001',
                 '0d000000-0000-4000-a000-000000000002')),
  2::bigint,
  '...and deletes nothing');

-- --------------------------------------------------------------------------
-- 3 · u1 deletes their own account
-- --------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"0d000000-0000-4000-a000-000000000001","role":"authenticated"}',
  true);
-- Call as the actual `authenticated` role, not the superuser: proves the
-- EXECUTE grant reaches the cascade end-to-end the way PostgREST calls it.
set local role authenticated;

select lives_ok(
  $q$ select public.delete_own_account() $q$,
  'authenticated user can delete their own account');

-- Back to superuser so the assertions below see every row, unfiltered by RLS.
reset role;

-- --------------------------------------------------------------------------
-- 4–9 · u1 is gone everywhere; feedback survives anonymized
-- --------------------------------------------------------------------------
select is(
  (select count(*) from auth.users
    where id = '0d000000-0000-4000-a000-000000000001'),
  0::bigint,
  'auth.users row is deleted');

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
-- 10–12 · The other user is untouched
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
