-- ==========================================================================
-- pgTAP · export_my_data()
-- ==========================================================================
--
-- The GDPR Art. 15 / 20 export. This is the function that shipped broken:
-- 20260411040000_gdpr_export.sql built the feedback section from
-- `f.message` / `f.page`, columns that never existed. PL/pgSQL bodies are
-- only syntax-checked at CREATE time, so nothing caught it until a real
-- user with feedback rows pressed "Download my data". The key-shape
-- assertion below ("every feedback entry carries kind/title/body/page_url")
-- fails loudly against that broken version — this file exists so that class
-- of bug can never ship silently again.
--
-- Caller simulation: insert a row into auth.users (the on_auth_user_created
-- trigger spawns the public.users profile), then set the JWT claims GUC the
-- way PostgREST does — auth.uid() reads claims->>'sub'. Transaction-local
-- (`set_config(..., true)`) and rolled back at the end, so the database is
-- left untouched.
--
-- Run via `npm run db:test` (requires Docker + `npm run db:start`).
--
-- Fixture ids (u1 = exporting user, u2 = decoy who must never leak):
--   u1  0e000000-0000-4000-a000-000000000001
--   u2  0e000000-0000-4000-a000-000000000002
--   p1  0e000000-0000-4000-b000-000000000001  (u1 poster, in gallery)
--   p2  0e000000-0000-4000-b000-000000000002  (u1 poster)
--   p3  0e000000-0000-4000-b000-000000000003  (u2 decoy poster)
--   g1  0e000000-0000-4000-c000-000000000001  (u1 gallery entry)

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(18);

-- --------------------------------------------------------------------------
-- 1 · Unauthenticated: auth.uid() is null
-- --------------------------------------------------------------------------
-- Pin the precondition explicitly instead of relying on "no claims set yet
-- in this transaction" — auth.uid() treats '' as unset. Keeps the assertion
-- honest if blocks are ever reordered.
select set_config('request.jwt.claims', '', true);

select throws_ok(
  $q$ select public.export_my_data() $q$,
  'P0001', 'Not authenticated',
  'export_my_data() raises P0001 ''Not authenticated'' for unauthenticated callers');

-- --------------------------------------------------------------------------
-- Fixtures (as superuser, before impersonation)
-- --------------------------------------------------------------------------
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '0e000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated',
   'jane.doe@example.com', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '0e000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated',
   'john.smith@example.com', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now());

insert into public.posters (id, user_id, title)
values
  ('0e000000-0000-4000-b000-000000000001',
   '0e000000-0000-4000-a000-000000000001',
   'Feline Proximity to Keyboard as a Function of Human Typing Speed'),
  ('0e000000-0000-4000-b000-000000000002',
   '0e000000-0000-4000-a000-000000000001',
   'Untitled Poster'),
  ('0e000000-0000-4000-b000-000000000003',
   '0e000000-0000-4000-a000-000000000002',
   'Decoy poster owned by another user');

insert into public.gallery_entries (id, user_id, source, poster_id, image_path, title, field)
values
  ('0e000000-0000-4000-c000-000000000001',
   '0e000000-0000-4000-a000-000000000001',
   'postr_poster',
   '0e000000-0000-4000-b000-000000000001',
   '0e000000-0000-4000-a000-000000000001/poster-snapshot.png',
   'Feline Proximity to Keyboard: A Multi-Paw Analysis',
   'neuroscience');

insert into public.feedback (user_id, kind, title, body, page_url)
values
  ('0e000000-0000-4000-a000-000000000001', 'bug',
   'Export button mislabeled',
   'Steps: open profile, click export, observe label.',
   'https://www.postr.sh/profile'),
  ('0e000000-0000-4000-a000-000000000001', 'feature',
   'Dark mode for the editor',
   'A dark theme would help during late-night sessions.',
   null),
  ('0e000000-0000-4000-a000-000000000002', 'other',
   'Decoy feedback from another user',
   'Must never appear in u1''s export.',
   null);

-- --------------------------------------------------------------------------
-- Impersonate u1 the way PostgREST does and capture one export
-- --------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"0e000000-0000-4000-a000-000000000001","role":"authenticated"}',
  true);

create temp table export_doc as
  select public.export_my_data() as doc;

-- --------------------------------------------------------------------------
-- 2–6 · Envelope + user object
-- --------------------------------------------------------------------------
select is(
  (select doc ->> 'export_version' from export_doc),
  '1',
  'export_version is 1');

select ok(
  (select doc ? 'exported_at' from export_doc),
  'export carries an exported_at timestamp');

select is(
  (select doc -> 'user' ->> 'id' from export_doc),
  '0e000000-0000-4000-a000-000000000001',
  'user.id is the caller''s id');

select is(
  (select doc -> 'user' ->> 'email' from export_doc),
  'jane.doe@example.com',
  'user.email is the caller''s email');

select ok(
  (select doc -> 'user' ?& array['id', 'email', 'created_at', 'is_anonymous', 'last_sign_in_at']
     from export_doc),
  'user object carries the documented keys');

-- --------------------------------------------------------------------------
-- 7–9 · Posters: caller''s only, full row snapshot
-- --------------------------------------------------------------------------
select is(
  (select jsonb_array_length(doc -> 'posters') from export_doc),
  2,
  'both of the caller''s posters are exported (decoy from another user excluded)');

select ok(
  (select bool_and(p ->> 'user_id' = '0e000000-0000-4000-a000-000000000001')
     from export_doc, jsonb_array_elements(doc -> 'posters') as p),
  'every exported poster belongs to the caller');

select ok(
  (select bool_and(p ? 'data')
     from export_doc, jsonb_array_elements(doc -> 'posters') as p),
  'poster rows include the full data JSONB snapshot (portability)');

-- --------------------------------------------------------------------------
-- 10–11 · Gallery entries
-- --------------------------------------------------------------------------
select is(
  (select jsonb_array_length(doc -> 'gallery_entries') from export_doc),
  1,
  'the caller''s gallery entry is exported');

select is(
  (select doc -> 'gallery_entries' -> 0 ->> 'id' from export_doc),
  '0e000000-0000-4000-c000-000000000001',
  'gallery entry id round-trips');

-- --------------------------------------------------------------------------
-- 12–18 · Feedback: the section that shipped broken
-- --------------------------------------------------------------------------
select is(
  (select jsonb_array_length(doc -> 'feedback') from export_doc),
  2,
  'only the caller''s feedback is exported (decoy excluded)');

-- The regression assertion. Against the pre-fix function this whole file
-- aborts with `column f.message does not exist`; if someone reintroduces
-- wrong keys via jsonb_build_object, this check still fails on shape.
select ok(
  (select bool_and(f ?& array['kind', 'title', 'body', 'page_url'])
     from export_doc, jsonb_array_elements(doc -> 'feedback') as f),
  'every feedback entry carries kind/title/body/page_url keys');

select is(
  (select f ->> 'title'
     from export_doc, jsonb_array_elements(doc -> 'feedback') as f
     where f ->> 'kind' = 'bug'),
  'Export button mislabeled',
  'feedback title round-trips');

select is(
  (select f ->> 'body'
     from export_doc, jsonb_array_elements(doc -> 'feedback') as f
     where f ->> 'kind' = 'bug'),
  'Steps: open profile, click export, observe label.',
  'feedback body round-trips');

select is(
  (select f ->> 'page_url'
     from export_doc, jsonb_array_elements(doc -> 'feedback') as f
     where f ->> 'kind' = 'bug'),
  'https://www.postr.sh/profile',
  'feedback page_url round-trips');

select ok(
  (select f ? 'page_url' and f ->> 'page_url' is null
     from export_doc, jsonb_array_elements(doc -> 'feedback') as f
     where f ->> 'kind' = 'feature'),
  'page_url key is present (null) when the row has no page_url');

select ok(
  (select bool_and(not (f ? 'status') and not (f ? 'user_agent'))
     from export_doc, jsonb_array_elements(doc -> 'feedback') as f),
  'moderation state (status) and user_agent are not exported');

select * from finish();
rollback;
