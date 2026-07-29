-- ==========================================================================
-- pgTAP · public.poster_reviews — RLS + review billing columns / RPCs
-- ==========================================================================
--
-- The Presentation Checker's review rows are written ONLY by the API
-- (service_role); the owner may read them but never write (D3 — an
-- owner-writable `stage` would let a client reset a closed review and farm
-- free follow-ups). The review-credit ledger mirrors export_credits: a
-- server-owned users column with service_role-only consume/grant RPCs.
--
--   * defaults: status 'pending', stage 'initial', empty source_meta
--   * owner can SELECT their own reviews
--   * another user's reviews are invisible
--   * authenticated INSERT is rejected (42501 — no insert policy)
--   * owner UPDATE hits zero rows (no update policy — D3)
--   * the billing guard rejects a client write to review_credits
--   * service_role (the API) can INSERT and UPDATE reviews
--   * consume_review_credit decrements; returns NULL at zero
--   * grant_review_credits adds atomically
--   * CHECK rejects a negative review_credits balance
--
-- Run via `npm run db:test` (Docker + `npm run db:start`). Rolls back.
--
-- Fixture ids:
--   u1  d1000000-0000-4000-a000-000000000001
--   u2  d1000000-0000-4000-a000-000000000002
--   r1  e1000000-0000-4000-a000-000000000001  (u1's review)
--   r2  e1000000-0000-4000-a000-000000000002  (u2's review)

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(56);

-- --------------------------------------------------------------------------
-- Fixtures (as superuser): two users (handle_new_user auto-creates their
-- public.users rows) and one review each, written directly — the API's
-- service_role write path is exercised separately below.
-- --------------------------------------------------------------------------
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, is_anonymous, created_at, updated_at)
select
  '00000000-0000-4000-a000-000000000000', u.id, 'authenticated', 'authenticated',
  u.email, '', now(),
  '{"provider":"email","providers":["email"]}', '{}', false, now(), now()
from (values
  ('d1000000-0000-4000-a000-000000000001'::uuid, 'jane.doe@example.com'),
  ('d1000000-0000-4000-a000-000000000002'::uuid, 'john.smith@example.com')
) as u (id, email);

-- The historical schema predates Supabase's generated API grants. Give this
-- transaction's service_role fixture only the legacy privileges exercised by
-- the pre-existing poster-review tests; rollback removes these fixture grants.
-- The new quota ledger's production least-privilege grants are asserted
-- independently below and are not supplemented here.
grant select, update, delete on public.users to service_role;
grant select, insert, update on public.poster_reviews to service_role;
grant select, update on public.poster_review_requests to service_role;
grant execute on function public.consume_review_credit(uuid) to service_role;
grant execute on function public.grant_review_credits(uuid, integer) to service_role;
grant select, update on public.users to authenticated;
grant select, insert, update on public.poster_reviews to authenticated;

insert into public.poster_reviews (id, user_id, source_kind) values
  ('e1000000-0000-4000-a000-000000000001', 'd1000000-0000-4000-a000-000000000001', 'postr'),
  ('e1000000-0000-4000-a000-000000000002', 'd1000000-0000-4000-a000-000000000002', 'pdf');

-- 1 · default status
select is(
  (select status from public.poster_reviews where id = 'e1000000-0000-4000-a000-000000000001'),
  'pending',
  'a fresh review row starts pending');

-- 2 · default stage
select is(
  (select stage from public.poster_reviews where id = 'e1000000-0000-4000-a000-000000000001'),
  'initial',
  'a fresh review row starts at stage initial');

-- 3 · default source_meta
select is(
  (select source_meta from public.poster_reviews where id = 'e1000000-0000-4000-a000-000000000001'),
  '{}'::jsonb,
  'a fresh review row starts with empty source_meta');

-- Seed one review credit for u1. The billing guard fires for ANY
-- non-service_role caller — even this superuser session — so the fixture
-- write must run as service_role (same pattern as billing_plan_test.sql).
set local role service_role;
update public.users set review_credits = 1
  where id = 'd1000000-0000-4000-a000-000000000001';
reset role;

-- --------------------------------------------------------------------------
-- As the AUTHENTICATED owner (PostgREST-style): read yes, write never
-- --------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-4000-a000-000000000001","role":"authenticated"}',
  true);
set local role authenticated;

-- 4 · owner can select their own reviews
select is(
  (select count(*) from public.poster_reviews
    where user_id = 'd1000000-0000-4000-a000-000000000001'),
  1::bigint,
  'owner can select their own reviews');

-- 5 · another user's reviews are invisible
select is(
  (select count(*) from public.poster_reviews
    where user_id = 'd1000000-0000-4000-a000-000000000002'),
  0::bigint,
  'another user''s reviews are invisible');

-- 6 · INSERT is rejected — no insert policy (writes are service_role only)
select throws_ok(
  $q$ insert into public.poster_reviews (user_id, source_kind)
      values ('d1000000-0000-4000-a000-000000000001', 'pdf') $q$,
  '42501',
  'new row violates row-level security policy for table "poster_reviews"',
  'authenticated INSERT is rejected — no insert policy (service_role only)');

-- 7 · UPDATE hits zero rows — no update policy. The data-modifying CTE must
-- sit at the TOP LEVEL of the statement (Postgres rejects it inside is()'s
-- subquery), so is() reads the CTE.
with updated as (
  update public.poster_reviews
     set stage = 'initial'
   where id = 'e1000000-0000-4000-a000-000000000001'
  returning 1
)
select is(
  (select count(*) from updated),
  0::bigint,
  'owner UPDATE hits zero rows — a closed review cannot be reset from the client');

-- 8 · the billing guard rejects a client write to review_credits
select throws_ok(
  $q$ update public.users set review_credits = 99
      where id = 'd1000000-0000-4000-a000-000000000001' $q$,
  'P0001',
  'billing columns (plan, plan_expires_at, stripe_customer_id, export_credits, stripe_subscription_id, subscription_status, first_paid_export_at, review_credits, review_addon, review_addon_subscription_id) are server-owned and cannot be changed by the client',
  'the billing guard rejects a client write to review_credits');

reset role;
select set_config('request.jwt.claims', null, true);

-- --------------------------------------------------------------------------
-- As SERVICE_ROLE (the API): the only writer of review rows and credits
-- --------------------------------------------------------------------------
set local role service_role;

-- 9 · service_role can insert the completed review (D16: one write, after a
-- successful critique, status 'complete'; rubric version stamped in
-- source_meta per the Global Constraints)
select lives_ok(
  $q$ insert into public.poster_reviews
        (user_id, source_kind, source_meta, status, initial_findings, credit_source)
      values (
        'd1000000-0000-4000-a000-000000000001',
        'pdf',
        '{"filename":"talk.pdf","pageCount":12,"rubric_version":"rubric.v1"}'::jsonb,
        'complete',
        '{"dimensionScores":{"narrative":3,"design":3,"content":3},"attentionSummary":"The entry point is the results figure.","findings":[]}'::jsonb,
        'pack') $q$,
  'service_role (the API) can insert a completed review');

-- 10 · service_role can write followup_findings and close the review
select lives_ok(
  $q$ update public.poster_reviews
        set stage = 'closed',
            followup_findings = '{"dimensionScores":{"narrative":4,"design":4,"content":4},"attentionSummary":"The revision lands the key result early.","findings":[]}'::jsonb
      where id = 'e1000000-0000-4000-a000-000000000001' $q$,
  'service_role can write followup_findings and close the review');

-- 11 · consume_review_credit spends the seeded credit (1 → 0)
select is(
  (select public.consume_review_credit('d1000000-0000-4000-a000-000000000001')),
  0,
  'consume_review_credit decrements and returns the new balance');

-- 12 · …and returns NULL once the balance is zero (the "no credit" signal)
select ok(
  (select public.consume_review_credit('d1000000-0000-4000-a000-000000000001')) is null,
  'consume_review_credit returns NULL when no credit remains');

-- 13 · grant_review_credits adds atomically (0 → 3)
select is(
  (select public.grant_review_credits('d1000000-0000-4000-a000-000000000001', 3)),
  3,
  'grant_review_credits adds credits and returns the new balance');

-- 14 · the nonneg CHECK rejects a negative balance (checked AS service_role
-- so the billing guard passes and the write reaches the constraint — same
-- pattern as billing_plan_test.sql's plan-CHECK assertion)
select throws_ok(
  $q$ update public.users set review_credits = -1
      where id = 'd1000000-0000-4000-a000-000000000001' $q$,
  '23514',
  null,
  'the review_credits nonneg CHECK rejects a negative balance');

-- 15 · initial requests carry a durable browser-generated idempotency key
select has_column(
  'public',
  'poster_reviews',
  'request_key',
  'poster_reviews has the initial-review request key');

-- 16 · one logical initial request can create at most one review per user
select ok(
  exists (
    select 1
      from pg_index i
      join pg_class t on t.oid = i.indrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'poster_reviews'
       and i.indisunique
       and pg_get_indexdef(i.indexrelid)
           like '%(user_id, request_key)%'
  ),
  'poster_reviews uniquely indexes (user_id, request_key)');

-- Set an exact one-credit fixture for transactional finalization.
update public.users
   set review_credits = 1
 where id = 'd1000000-0000-4000-a000-000000000001';

create temporary table review_claim_fixtures (
  name text primary key,
  payload jsonb not null
);

insert into review_claim_fixtures (name, payload)
values (
  'first',
  public.claim_initial_review(
    'd1000000-0000-4000-a000-000000000001',
    'a1000000-0000-4000-a000-000000000001'
  )
);

-- 17 · first claimant owns the request key
select is(
  (select payload->>'outcome'
     from review_claim_fixtures
    where name = 'first'),
  'claimed',
  'the first initial-review request claims its key');

-- 18 · a concurrent claimant is deduplicated before provider work
select is(
  public.claim_initial_review(
    'd1000000-0000-4000-a000-000000000001',
    'a1000000-0000-4000-a000-000000000001'
  )->>'outcome',
  'in_progress',
  'a second claimant sees the request in progress');

-- 19 · pack finalization atomically spends + inserts
select is(
  public.finalize_initial_review(
    'd1000000-0000-4000-a000-000000000001',
    'a1000000-0000-4000-a000-000000000001',
    (select (payload->>'claimToken')::uuid
       from review_claim_fixtures
      where name = 'first'),
    null,
    'pdf',
    '{"pageCount":1,"rubric_version":"rubric.v1"}'::jsonb,
    '{"dimensionScores":{"narrative":4,"design":3,"content":4},"attentionSummary":"Results first.","findings":[]}'::jsonb,
    'pack'
  )->>'outcome',
  'complete',
  'pack finalization returns complete');

-- 20 · the same transaction spent exactly one credit
select is(
  (select review_credits
     from public.users
    where id = 'd1000000-0000-4000-a000-000000000001'),
  0,
  'pack finalization spends exactly one credit');

-- 21 · and inserted exactly one completed review carrying the key
select is(
  (select count(*)
     from public.poster_reviews
    where user_id = 'd1000000-0000-4000-a000-000000000001'
      and request_key = 'a1000000-0000-4000-a000-000000000001'
      and status = 'complete'
      and credit_source = 'pack'),
  1::bigint,
  'pack finalization inserts one keyed completed review');

-- 22 · replay returns the stored review without another spend/insert
select is(
  public.finalize_initial_review(
    'd1000000-0000-4000-a000-000000000001',
    'a1000000-0000-4000-a000-000000000001',
    (select (payload->>'claimToken')::uuid
       from review_claim_fixtures
      where name = 'first'),
    null,
    'pdf',
    '{}'::jsonb,
    '{"dimensionScores":{"narrative":1,"design":1,"content":1},"attentionSummary":"must not replace stored","findings":[]}'::jsonb,
    'pack'
  )->>'outcome',
  'replay',
  're-finalizing a completed key replays the stored review');

-- A keyed initial operation must keep replaying its original response even
-- after its included follow-up advances the review to closed.
update public.poster_reviews
   set stage = 'closed',
       followup_findings =
         '{"dimensionScores":{"narrative":5,"design":5,"content":5},"attentionSummary":"Follow-up result must not replace initial.","findings":[]}'::jsonb
 where user_id = 'd1000000-0000-4000-a000-000000000001'
   and request_key = 'a1000000-0000-4000-a000-000000000001';

-- 23 · replay remains the initial operation's stage
select is(
  public.claim_initial_review(
    'd1000000-0000-4000-a000-000000000001',
    'a1000000-0000-4000-a000-000000000001'
  )->>'stage',
  'initial',
  'a closed review still replays with the initial stage');

-- 24 · replay remains the initially stored critique, never follow-up findings
select is(
  public.claim_initial_review(
    'd1000000-0000-4000-a000-000000000001',
    'a1000000-0000-4000-a000-000000000001'
  )#>>'{critique,attentionSummary}',
  'Results first.',
  'a closed review still replays its initial critique');

-- Set up a second request whose lease will expire and whose eventual insert
-- will violate the poster FK.
update public.users
   set review_credits = 1
 where id = 'd1000000-0000-4000-a000-000000000001';

insert into review_claim_fixtures (name, payload)
values (
  'stale',
  public.claim_initial_review(
    'd1000000-0000-4000-a000-000000000001',
    'a1000000-0000-4000-a000-000000000002'
  )
);

update public.poster_review_requests
   set expires_at = now() - interval '1 second'
 where user_id = 'd1000000-0000-4000-a000-000000000001'
   and request_key = 'a1000000-0000-4000-a000-000000000002';

insert into review_claim_fixtures (name, payload)
values (
  'replacement',
  public.claim_initial_review(
    'd1000000-0000-4000-a000-000000000001',
    'a1000000-0000-4000-a000-000000000002'
  )
);

-- 25 · a takeover receives a distinct fencing token
select isnt(
  (select payload->>'claimToken'
     from review_claim_fixtures
    where name = 'stale'),
  (select payload->>'claimToken'
     from review_claim_fixtures
    where name = 'replacement'),
  'an expired-lease takeover receives a new claim token');

-- 26 · an old worker cannot release the newer claimant's lease
select is(
  public.release_initial_review(
    'd1000000-0000-4000-a000-000000000001',
    'a1000000-0000-4000-a000-000000000002',
    (select (payload->>'claimToken')::uuid
       from review_claim_fixtures
      where name = 'stale')
  ),
  false,
  'a stale claim token cannot release its replacement');

-- 27 · an old worker cannot finalize the newer claimant's lease
select is(
  public.finalize_initial_review(
    'd1000000-0000-4000-a000-000000000001',
    'a1000000-0000-4000-a000-000000000002',
    (select (payload->>'claimToken')::uuid
       from review_claim_fixtures
      where name = 'stale'),
    null,
    'pdf',
    '{}'::jsonb,
    '{"dimensionScores":{"narrative":4,"design":3,"content":4},"attentionSummary":"Results first.","findings":[]}'::jsonb,
    'pack'
  )->>'outcome',
  'claim_missing',
  'a stale claim token cannot finalize its replacement');

-- 28 · the fenced stale finalizer cannot spend a credit
select is(
  (select review_credits
     from public.users
    where id = 'd1000000-0000-4000-a000-000000000001'),
  1,
  'a stale finalizer leaves the credit untouched');

-- 29 · the insert error escapes the RPC
select throws_ok(
  $q$
    select public.finalize_initial_review(
      'd1000000-0000-4000-a000-000000000001',
      'a1000000-0000-4000-a000-000000000002',
      (select (payload->>'claimToken')::uuid
         from review_claim_fixtures
        where name = 'replacement'),
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      'postr',
      '{}'::jsonb,
      '{"dimensionScores":{"narrative":4,"design":3,"content":4},"attentionSummary":"Results first.","findings":[]}'::jsonb,
      'pack'
    )
  $q$,
  '23503',
  null,
  'a poster FK failure aborts finalization');

-- 30 · transaction rollback means the failed insert cannot lose a credit
select is(
  (select review_credits
     from public.users
    where id = 'd1000000-0000-4000-a000-000000000001'),
  1,
  'an insert/FK failure rolls the credit spend back');

-- 31 · and no partially finalized review exists
select is(
  (select count(*)
     from public.poster_reviews
    where user_id = 'd1000000-0000-4000-a000-000000000001'
      and request_key = 'a1000000-0000-4000-a000-000000000002'),
  0::bigint,
  'an insert/FK failure leaves no partial review row');

-- --------------------------------------------------------------------------
-- Persistent review add-on quota ledger + sliding-window RPC
-- --------------------------------------------------------------------------

-- 32 · usage is persisted in a dedicated service-only table
select has_table(
  'public',
  'review_addon_usage',
  'review_addon_usage persists weekly add-on consumption');

-- 33 · every event carries a database-owned consumption timestamp
select has_column(
  'public',
  'review_addon_usage',
  'consumed_at',
  'review_addon_usage records consumed_at');

-- 34 · usage follows the public.users lifecycle
select ok(
  exists (
    select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'review_addon_usage'
       and c.contype = 'f'
       and c.confdeltype = 'c'
  ),
  'review_addon_usage user FK cascades on delete');

-- 35 · the prune/count/oldest query has the required compound index
select ok(
  exists (
    select 1
      from pg_indexes
     where schemaname = 'public'
       and tablename = 'review_addon_usage'
       and indexdef ~ '\(user_id, consumed_at\)'
  ),
  'review_addon_usage indexes (user_id, consumed_at)');

-- 36 · defense in depth: direct table access is still behind RLS
select is(
  (select relrowsecurity
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'review_addon_usage'),
  true,
  'review_addon_usage has RLS enabled');

-- 37 · neither browser-facing role has any direct table privilege
select ok(
  not has_table_privilege('anon', 'public.review_addon_usage', 'SELECT')
  and not has_table_privilege('anon', 'public.review_addon_usage', 'INSERT')
  and not has_table_privilege('authenticated', 'public.review_addon_usage', 'SELECT')
  and not has_table_privilege('authenticated', 'public.review_addon_usage', 'INSERT')
  and not has_table_privilege('authenticated', 'public.review_addon_usage', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.review_addon_usage', 'DELETE'),
  'browser roles have no review_addon_usage table access');

-- 38 · the API service role can maintain the ledger
select ok(
  has_table_privilege('service_role', 'public.review_addon_usage', 'SELECT')
  and has_table_privilege('service_role', 'public.review_addon_usage', 'INSERT')
  and has_table_privilege('service_role', 'public.review_addon_usage', 'DELETE')
  and not has_table_privilege('service_role', 'public.review_addon_usage', 'UPDATE')
  and not has_table_privilege('service_role', 'public.review_addon_usage', 'TRUNCATE'),
  'service_role has only the table privileges needed to maintain usage');

-- 39 · the identity sequence is not browser-accessible
select ok(
  not has_sequence_privilege(
    'anon',
    'public.review_addon_usage_id_seq',
    'USAGE')
  and not has_sequence_privilege(
    'authenticated',
    'public.review_addon_usage_id_seq',
    'USAGE'),
  'browser roles cannot use the review_addon_usage sequence');

-- 40 · service_role owns the corresponding sequence path
select ok(
  has_sequence_privilege(
    'service_role',
    'public.review_addon_usage_id_seq',
    'USAGE'),
  'service_role can use the review_addon_usage sequence');

delete from public.review_addon_usage;
create temporary table review_addon_results (
  name text primary key,
  payload jsonb not null
);

insert into review_addon_results values
  ('first', public.consume_review_addon_slot(
    'd1000000-0000-4000-a000-000000000001', 2)),
  ('second', public.consume_review_addon_slot(
    'd1000000-0000-4000-a000-000000000001', 2)),
  ('third', public.consume_review_addon_slot(
    'd1000000-0000-4000-a000-000000000001', 2));

-- 41 · the first slot through the configured quota is admitted
select is(
  (select payload->>'allowed' from review_addon_results where name = 'first'),
  'true',
  'the first add-on slot is allowed');

-- 42 · the final slot through the configured quota is admitted
select is(
  (select payload->>'allowed' from review_addon_results where name = 'second'),
  'true',
  'the quota-th add-on slot is allowed');

-- 43 · the next slot is denied
select is(
  (select payload->>'allowed' from review_addon_results where name = 'third'),
  'false',
  'the slot after quota is denied');

-- 44 · denial never inserts another usage event
select is(
  (select count(*)
     from public.review_addon_usage
    where user_id = 'd1000000-0000-4000-a000-000000000001'),
  2::bigint,
  'a denied slot is not consumed');

-- 45 · retry-after is an integer ceiling within the seven-day window
select ok(
  (select jsonb_typeof(payload->'retryAfterSec') = 'number'
          and (payload->>'retryAfterSec')::integer between 1 and 604800
     from review_addon_results
    where name = 'third'),
  'denial returns a positive integer retryAfterSec');

-- 46 · admitted events use database time, not caller input
select ok(
  (select bool_and(consumed_at is not null and consumed_at <= pg_catalog.clock_timestamp())
     from public.review_addon_usage),
  'admitted usage events receive consumed_at from the database');

-- An event exactly on the boundary is expired and must be pruned before
-- quota is counted.
delete from public.review_addon_usage;
insert into public.review_addon_usage (user_id, consumed_at)
values (
  'd1000000-0000-4000-a000-000000000001',
  pg_catalog.now() - interval '7 days'
);
insert into review_addon_results values
  ('after_expiry', public.consume_review_addon_slot(
    'd1000000-0000-4000-a000-000000000001', 1));

-- 47 · the boundary-expired event no longer blocks a slot
select is(
  (select payload->>'allowed'
     from review_addon_results
    where name = 'after_expiry'),
  'true',
  'an event at now minus seven days is expired');

-- 48 · expiration is physical pruning, not only a filtered count
select is(
  (select count(*)
     from public.review_addon_usage
    where user_id = 'd1000000-0000-4000-a000-000000000001'
      and consumed_at <= pg_catalog.now() - interval '7 days'),
  0::bigint,
  'expired usage events are pruned');

-- Each user owns an independent serialized window.
delete from public.review_addon_usage;
insert into review_addon_results values
  ('u1_isolated', public.consume_review_addon_slot(
    'd1000000-0000-4000-a000-000000000001', 1)),
  ('u2_isolated', public.consume_review_addon_slot(
    'd1000000-0000-4000-a000-000000000002', 1));

-- 49 · u1 receives its own slot
select is(
  (select payload->>'allowed'
     from review_addon_results
    where name = 'u1_isolated'),
  'true',
  'the first user receives an isolated slot');

-- 50 · u2 is not denied by u1's usage
select is(
  (select payload->>'allowed'
     from review_addon_results
    where name = 'u2_isolated'),
  'true',
  'the second user has an independent quota');

-- 51 · each user has exactly its own event
select is(
  (select count(distinct user_id) from public.review_addon_usage),
  2::bigint,
  'usage rows remain isolated by user');

-- 52–54 · quota validation is fail-closed across both bounds and NULL
select throws_ok(
  $q$ select public.consume_review_addon_slot(
        'd1000000-0000-4000-a000-000000000001', 0) $q$,
  '22023',
  'review add-on quota must be between 1 and 100',
  'zero quota is rejected');
select throws_ok(
  $q$ select public.consume_review_addon_slot(
        'd1000000-0000-4000-a000-000000000001', 101) $q$,
  '22023',
  'review add-on quota must be between 1 and 100',
  'quota above 100 is rejected');
select throws_ok(
  $q$ select public.consume_review_addon_slot(
        'd1000000-0000-4000-a000-000000000001', null) $q$,
  '22023',
  'review add-on quota must be between 1 and 100',
  'NULL quota is rejected');

-- 55 · a slot cannot be consumed for a missing public.users row
select throws_ok(
  $q$ select public.consume_review_addon_slot(
        'ffffffff-ffff-4fff-8fff-ffffffffffff', 1) $q$,
  'P0002',
  'review add-on user not found',
  'missing user is rejected');

-- 56 · deleting the public.users owner cascades its usage events
delete from public.users
 where id = 'd1000000-0000-4000-a000-000000000002';
select is(
  (select count(*)
     from public.review_addon_usage
    where user_id = 'd1000000-0000-4000-a000-000000000002'),
  0::bigint,
  'deleting public.users cascades review add-on usage');

reset role;

select * from finish();
rollback;
