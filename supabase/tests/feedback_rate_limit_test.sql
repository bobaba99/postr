-- ==========================================================================
-- pgTAP · enforce_feedback_rate_limit()
-- ==========================================================================
--
-- BEFORE INSERT trigger on public.feedback: max 10 submissions per user per
-- rolling day. This file inserts as the `authenticated` role with JWT
-- claims set the way PostgREST does, so the RLS insert path is exercised
-- alongside the trigger:
--
--   * inserts 1–10 in a day succeed, insert 11 raises P0001
--   * the limit is per-user — another user can still submit
--   * the window rolls both ways: 23h-old rows still count, 25h-old do not
--   * RLS: you cannot file feedback as someone else (42501)
--
-- Run via `npm run db:test` (requires Docker + `npm run db:start`).
-- Rolls back at the end; the database is left untouched.
--
-- Fixture ids:
--   u1  0f000000-0000-4000-a000-000000000001  (hits the limit, all fresh)
--   u2  0f000000-0000-4000-a000-000000000002  (9 rows from 23h ago — in window)
--   u3  0f000000-0000-4000-a000-000000000003  (10 rows from 25h ago — expired)

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(8);

-- --------------------------------------------------------------------------
-- Fixtures (as superuser): three users, plus 10 stale feedback rows for u3
-- dated 25h ago — outside the rolling window, so they must not count.
-- --------------------------------------------------------------------------
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, is_anonymous, created_at, updated_at)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
  u.email, '', now(),
  '{"provider":"email","providers":["email"]}', '{}', false, now(), now()
from (values
  ('0f000000-0000-4000-a000-000000000001'::uuid, 'jane.doe@example.com'),
  ('0f000000-0000-4000-a000-000000000002'::uuid, 'john.smith@example.com'),
  ('0f000000-0000-4000-a000-000000000003'::uuid, 'sam.sample@example.com')
) as u (id, email);

insert into public.feedback (user_id, kind, title, body, created_at)
select
  '0f000000-0000-4000-a000-000000000003', 'other',
  'Stale feedback #' || n,
  'Filed more than a day ago; must not count toward today''s limit.',
  now() - interval '25 hours'
from generate_series(1, 10) as n;

insert into public.feedback (user_id, kind, title, body, created_at)
select
  '0f000000-0000-4000-a000-000000000002', 'other',
  'Earlier today #' || n,
  'Filed 23 hours ago; still inside the rolling window.',
  now() - interval '23 hours'
from generate_series(1, 9) as n;

-- Let the fixture role reach RLS + the rate-limit trigger even when the local
-- Supabase stack has not installed its environment-owned API table grants.
-- Rollback removes this test-only privilege.
grant select, insert on public.feedback to authenticated;

-- 1 ·
select is(
  (select count(*) from public.feedback
    where user_id = '0f000000-0000-4000-a000-000000000003'),
  10::bigint,
  'fixture: u3 starts with 10 stale feedback rows');

-- --------------------------------------------------------------------------
-- Impersonate u1 as PostgREST would: claims GUC + the authenticated role,
-- so inserts also pass through RLS (feedback_insert_own).
-- --------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"0f000000-0000-4000-a000-000000000001","role":"authenticated"}',
  true);
set local role authenticated;

-- Nine submissions, one statement each — matching how the client submits.
insert into public.feedback (user_id, kind, title, body) values ('0f000000-0000-4000-a000-000000000001', 'bug', 'Submission #1', 'Filler body.');
insert into public.feedback (user_id, kind, title, body) values ('0f000000-0000-4000-a000-000000000001', 'bug', 'Submission #2', 'Filler body.');
insert into public.feedback (user_id, kind, title, body) values ('0f000000-0000-4000-a000-000000000001', 'bug', 'Submission #3', 'Filler body.');
insert into public.feedback (user_id, kind, title, body) values ('0f000000-0000-4000-a000-000000000001', 'bug', 'Submission #4', 'Filler body.');
insert into public.feedback (user_id, kind, title, body) values ('0f000000-0000-4000-a000-000000000001', 'bug', 'Submission #5', 'Filler body.');
insert into public.feedback (user_id, kind, title, body) values ('0f000000-0000-4000-a000-000000000001', 'bug', 'Submission #6', 'Filler body.');
insert into public.feedback (user_id, kind, title, body) values ('0f000000-0000-4000-a000-000000000001', 'bug', 'Submission #7', 'Filler body.');
insert into public.feedback (user_id, kind, title, body) values ('0f000000-0000-4000-a000-000000000001', 'bug', 'Submission #8', 'Filler body.');
insert into public.feedback (user_id, kind, title, body) values ('0f000000-0000-4000-a000-000000000001', 'bug', 'Submission #9', 'Filler body.');

-- 2 ·
select lives_ok(
  $q$ insert into public.feedback (user_id, kind, title, body)
      values ('0f000000-0000-4000-a000-000000000001', 'bug', 'Submission #10', 'Filler body.') $q$,
  '10th feedback insert within a day is still allowed');

-- 3 ·
select throws_ok(
  $q$ insert into public.feedback (user_id, kind, title, body)
      values ('0f000000-0000-4000-a000-000000000001', 'bug', 'Submission #11', 'Filler body.') $q$,
  'P0001',
  'rate_limit_exceeded: max 10 feedback submissions per day',
  '11th feedback insert within a rolling day is rejected');

-- 4 · (RLS select_own: as u1 we only see our own rows)
select is(
  (select count(*) from public.feedback
    where user_id = '0f000000-0000-4000-a000-000000000001'),
  10::bigint,
  'the rejected insert stored nothing — u1 still has exactly 10 rows');

-- --------------------------------------------------------------------------
-- 5–6 · The limit is per-user, and old-but-in-window rows count: u2 has 9
-- rows from 23h ago, so their 10th submission passes and the 11th fails.
-- --------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"0f000000-0000-4000-a000-000000000002","role":"authenticated"}',
  true);

select lives_ok(
  $q$ insert into public.feedback (user_id, kind, title, body)
      values ('0f000000-0000-4000-a000-000000000002', 'feature', 'From the other user', 'Unaffected by u1''s limit.') $q$,
  'another user can still submit after u1 hit the limit (their 10th in-window row)');

select throws_ok(
  $q$ insert into public.feedback (user_id, kind, title, body)
      values ('0f000000-0000-4000-a000-000000000002', 'feature', 'One past the line', 'The 23h-old rows still count.') $q$,
  'P0001',
  'rate_limit_exceeded: max 10 feedback submissions per day',
  'rows filed 23h ago still count toward the window — u2''s 11th is rejected');

-- --------------------------------------------------------------------------
-- 7 · The window rolls off: u3''s 10 stale rows do not count
-- --------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"0f000000-0000-4000-a000-000000000003","role":"authenticated"}',
  true);

select lives_ok(
  $q$ insert into public.feedback (user_id, kind, title, body)
      values ('0f000000-0000-4000-a000-000000000003', 'other', 'Fresh after a quiet day', 'Stale rows are outside the rolling window.') $q$,
  'rows older than one day do not count toward the limit');

-- --------------------------------------------------------------------------
-- 8 · RLS: impersonating u2, filing feedback as u3 must be rejected.
-- The forgery targets u3 (1 in-window row) on purpose: the rate-limit
-- trigger fires BEFORE RLS with-check and counts the target user_id, so a
-- target already at the limit would raise P0001 before RLS gets a look.
-- --------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"0f000000-0000-4000-a000-000000000002","role":"authenticated"}',
  true);

select throws_ok(
  $q$ insert into public.feedback (user_id, kind, title, body)
      values ('0f000000-0000-4000-a000-000000000003', 'other', 'Forged attribution', 'user_id differs from auth.uid().') $q$,
  '42501',
  null,
  'RLS rejects feedback filed under another user''s id');

select * from finish();
rollback;
