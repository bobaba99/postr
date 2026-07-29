-- ==========================================================================
-- pgTAP · atomic credit-pack fulfillment behavior
-- ==========================================================================
--
-- The Stripe checkout-session claim and credit increment must be one
-- transaction. These assertions catch double-grants, partial markers, and
-- review-pack rows leaking into the export-pack refund query.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(15);

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-4000-a000-000000000000',
   'f1000000-0000-4000-a000-000000000001',
   'authenticated', 'authenticated', 'credit-pack@example.com', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now()),
  ('00000000-0000-4000-a000-000000000000',
   'f1000000-0000-4000-a000-000000000002',
   'authenticated', 'authenticated', 'missing-profile@example.com', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now());

set local role service_role;
delete from public.users
 where id = 'f1000000-0000-4000-a000-000000000002';

select is(
  public.fulfill_credit_pack(
    'cs_export_1',
    'f1000000-0000-4000-a000-000000000001',
    3,
    'pack'),
  3,
  'an export pack returns the new export-credit balance');

select is(
  (select export_credits from public.users
    where id = 'f1000000-0000-4000-a000-000000000001'),
  3,
  'an export pack increments export_credits');

select is(
  (select credits_granted from public.billing_fulfilled_sessions
    where session_id = 'cs_export_1'),
  3,
  'an export-pack marker records its export credits for refund attribution');

select ok(
  public.fulfill_credit_pack(
    'cs_export_1',
    'f1000000-0000-4000-a000-000000000001',
    3,
    'pack') is null,
  'a duplicate export-pack session returns NULL');

select is(
  (select export_credits from public.users
    where id = 'f1000000-0000-4000-a000-000000000001'),
  3,
  'a duplicate export-pack session does not grant twice');

select is(
  public.fulfill_credit_pack(
    'cs_review_1',
    'f1000000-0000-4000-a000-000000000001',
    3,
    'review_pack'),
  3,
  'a review pack returns the new review-credit balance');

select is(
  (select review_credits from public.users
    where id = 'f1000000-0000-4000-a000-000000000001'),
  3,
  'a review pack increments review_credits');

select is(
  (select credits_granted from public.billing_fulfilled_sessions
    where session_id = 'cs_review_1'),
  0,
  'a review-pack marker records zero export credits');

select is(
  (select array_agg(session_id order by session_id)
     from public.billing_fulfilled_sessions
    where user_id = 'f1000000-0000-4000-a000-000000000001'
      and credits_granted > 0),
  array['cs_export_1']::text[],
  'the export-refund selection excludes review-pack sessions');

select ok(
  public.fulfill_credit_pack(
    'cs_review_1',
    'f1000000-0000-4000-a000-000000000001',
    3,
    'review_pack') is null,
  'a duplicate review-pack session returns NULL');

select is(
  (select review_credits from public.users
    where id = 'f1000000-0000-4000-a000-000000000001'),
  3,
  'a duplicate review-pack session does not grant twice');

select throws_ok(
  $q$ select public.fulfill_credit_pack(
        'cs_bad_amount',
        'f1000000-0000-4000-a000-000000000001',
        0,
        'pack') $q$,
  'P0001',
  'credit pack amount must be positive',
  'a non-positive amount is rejected');

select throws_ok(
  $q$ select public.fulfill_credit_pack(
        'cs_bad_sku',
        'f1000000-0000-4000-a000-000000000001',
        3,
        'term') $q$,
  'P0001',
  'credit pack sku must be pack or review_pack',
  'a non-credit SKU is rejected');

select throws_ok(
  $q$ select public.fulfill_credit_pack(
        'cs_missing_user',
        'f1000000-0000-4000-a000-000000000002',
        3,
        'pack') $q$,
  'P0001',
  'credit pack user not found',
  'a missing public user row raises instead of leaving a partial fulfillment');

select is(
  (select count(*) from public.billing_fulfilled_sessions
    where session_id = 'cs_missing_user'),
  0::bigint,
  'a missing-user failure rolls back the fulfillment marker');

reset role;
select * from finish();
rollback;
