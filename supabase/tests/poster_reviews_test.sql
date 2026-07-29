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

select plan(31);

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

reset role;

select * from finish();
rollback;
