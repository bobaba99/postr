-- ==========================================================================
-- pgTAP · public.poster_versions — RLS + version-cap trigger
-- ==========================================================================
--
-- Named "Save As" checkpoints for a poster. This file exercises the
-- authenticated-role RLS path the way PostgREST does:
--
--   * owner can insert / list / delete versions on their own poster
--   * versions are invisible to other users (select_own)
--   * forged user_id and versions on someone else's poster both 42501
--   * versions are immutable — no UPDATE policy, updates hit 0 rows
--   * the BEFORE INSERT trigger caps a poster at 30 versions (P0001),
--     per-poster (a second poster is unaffected)
--   * deleting the poster cascades its versions away
--
-- Run via `npm run db:test` (requires Docker + `npm run db:start`).
-- Rolls back at the end; the database is left untouched.
--
-- Fixture ids:
--   u1  a1000000-0000-4000-a000-000000000001  (owns p1 + p1b)
--   u2  a1000000-0000-4000-a000-000000000002  (owns p2, has one version)
--   p1  b1000000-0000-4000-a000-000000000001
--   p1b b1000000-0000-4000-a000-000000000002
--   p2  b1000000-0000-4000-a000-000000000003

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(11);

-- --------------------------------------------------------------------------
-- Fixtures (as superuser): two users, three posters, one version for u2,
-- and 29 pre-existing versions on p1 so the 30-cap is one insert away.
-- --------------------------------------------------------------------------
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, is_anonymous, created_at, updated_at)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
  u.email, '', now(),
  '{"provider":"email","providers":["email"]}', '{}', false, now(), now()
from (values
  ('a1000000-0000-4000-a000-000000000001'::uuid, 'jane.doe@example.com'),
  ('a1000000-0000-4000-a000-000000000002'::uuid, 'john.smith@example.com')
) as u (id, email);

insert into public.posters (id, user_id) values
  ('b1000000-0000-4000-a000-000000000001', 'a1000000-0000-4000-a000-000000000001'),
  ('b1000000-0000-4000-a000-000000000002', 'a1000000-0000-4000-a000-000000000001'),
  ('b1000000-0000-4000-a000-000000000003', 'a1000000-0000-4000-a000-000000000002');

insert into public.poster_versions (id, poster_id, user_id, name, data) values
  ('c1000000-0000-4000-a000-000000000001',
   'b1000000-0000-4000-a000-000000000003',
   'a1000000-0000-4000-a000-000000000002',
   'u2 checkpoint', '{}'::jsonb);

insert into public.poster_versions (poster_id, user_id, name, data)
select
  'b1000000-0000-4000-a000-000000000001',
  'a1000000-0000-4000-a000-000000000001',
  'Fixture version #' || n, '{}'::jsonb
from generate_series(1, 29) as n;

-- --------------------------------------------------------------------------
-- Impersonate u1 as PostgREST would: claims GUC + the authenticated role.
-- --------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-a000-000000000001","role":"authenticated"}',
  true);
set local role authenticated;

-- 1 · owner can save a version on their own poster (this is #30 on p1)
select lives_ok(
  $q$ insert into public.poster_versions (poster_id, user_id, name, data)
      values ('b1000000-0000-4000-a000-000000000001',
              'a1000000-0000-4000-a000-000000000001',
              'Milestone', '{"blocks":[]}'::jsonb) $q$,
  'owner can insert a version on their own poster');

-- 2 · select_own: u1 sees all 30 of their p1 versions…
select is(
  (select count(*) from public.poster_versions
    where poster_id = 'b1000000-0000-4000-a000-000000000001'),
  30::bigint,
  'owner lists every version of their own poster');

-- 3 · …and none of u2's.
select is(
  (select count(*) from public.poster_versions
    where poster_id = 'b1000000-0000-4000-a000-000000000003'),
  0::bigint,
  'another user''s versions are invisible');

-- 4 · forged user_id is rejected by insert with-check
select throws_ok(
  $q$ insert into public.poster_versions (poster_id, user_id, name, data)
      values ('b1000000-0000-4000-a000-000000000003',
              'a1000000-0000-4000-a000-000000000002',
              'Forged attribution', '{}'::jsonb) $q$,
  '42501',
  null,
  'RLS rejects a version filed under another user''s id');

-- 5 · own user_id on someone else's poster is rejected too
select throws_ok(
  $q$ insert into public.poster_versions (poster_id, user_id, name, data)
      values ('b1000000-0000-4000-a000-000000000003',
              'a1000000-0000-4000-a000-000000000001',
              'Not my poster', '{}'::jsonb) $q$,
  '42501',
  'new row violates row-level security policy for table "poster_versions"',
  'RLS rejects a version attached to a poster the user does not own');

-- 6 · versions are immutable: no UPDATE policy → 0 rows affected.
-- The data-modifying CTE must sit at the TOP LEVEL of the statement
-- (Postgres rejects it inside is()'s subquery), so is() reads the CTE.
with updated as (
  update public.poster_versions
     set name = 'Renamed'
   where poster_id = 'b1000000-0000-4000-a000-000000000001'
  returning 1
)
select is(
  (select count(*) from updated),
  0::bigint,
  'updates hit zero rows — versions are immutable snapshots');

-- 7 · the 31st version on p1 trips the server-side cap
select throws_ok(
  $q$ insert into public.poster_versions (poster_id, user_id, name, data)
      values ('b1000000-0000-4000-a000-000000000001',
              'a1000000-0000-4000-a000-000000000001',
              'One too many', '{}'::jsonb) $q$,
  'P0001',
  'version limit: max 30 versions per poster',
  '31st version on one poster is rejected by the cap trigger');

-- 8 · the cap is per-poster: u1's second poster is unaffected
select lives_ok(
  $q$ insert into public.poster_versions (poster_id, user_id, name, data)
      values ('b1000000-0000-4000-a000-000000000002',
              'a1000000-0000-4000-a000-000000000001',
              'Different poster', '{}'::jsonb) $q$,
  'cap is scoped per poster — a second poster still accepts versions');

-- 9 · deleting another user's version hits 0 rows
with deleted as (
  delete from public.poster_versions
   where id = 'c1000000-0000-4000-a000-000000000001'
  returning 1
)
select is(
  (select count(*) from deleted),
  0::bigint,
  'deleting another user''s version affects zero rows');

-- 10 · owner can delete their own version
with deleted as (
  delete from public.poster_versions
   where poster_id = 'b1000000-0000-4000-a000-000000000001'
     and name = 'Milestone'
  returning 1
)
select is(
  (select count(*) from deleted),
  1::bigint,
  'owner can delete their own version');

-- --------------------------------------------------------------------------
-- 11 · cascade: dropping the poster takes its versions with it
-- --------------------------------------------------------------------------
reset role;

delete from public.posters where id = 'b1000000-0000-4000-a000-000000000001';

select is(
  (select count(*) from public.poster_versions
    where poster_id = 'b1000000-0000-4000-a000-000000000001'),
  0::bigint,
  'deleting a poster cascades away its versions');

select * from finish();
rollback;
