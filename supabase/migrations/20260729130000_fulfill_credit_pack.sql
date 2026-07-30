-- Postr · transaction-safe credit-pack fulfillment
--
-- Stripe may deliver the same checkout.session.completed event
-- concurrently. Claiming the session, granting credits, and writing the
-- fulfillment marker in separate API calls permits a double grant. This RPC
-- makes the idempotency claim and balance increment one database transaction.

create or replace function public.fulfill_credit_pack(
  p_session_id text,
  p_user_id uuid,
  p_amount integer,
  p_sku text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_claimed_session text;
  v_new_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'credit pack amount must be positive';
  end if;

  if p_sku is null or p_sku not in ('pack', 'review_pack') then
    raise exception 'credit pack sku must be pack or review_pack';
  end if;

  -- The primary-key conflict is the idempotency gate. Under concurrent
  -- calls PostgreSQL waits for the first transaction, then the loser takes
  -- DO NOTHING and returns NULL without touching either balance.
  insert into public.billing_fulfilled_sessions (
    session_id,
    user_id,
    credits_granted
  )
  values (
    p_session_id,
    p_user_id,
    case when p_sku = 'pack' then p_amount else 0 end
  )
  on conflict (session_id) do nothing
  returning session_id into v_claimed_session;

  if v_claimed_session is null then
    return null;
  end if;

  if p_sku = 'pack' then
    update public.users
       set export_credits = export_credits + p_amount
     where id = p_user_id
    returning export_credits into v_new_balance;
  else
    update public.users
       set review_credits = review_credits + p_amount
     where id = p_user_id
    returning review_credits into v_new_balance;
  end if;

  if v_new_balance is null then
    raise exception 'credit pack user not found';
  end if;

  return v_new_balance;
end;
$$;

comment on function public.fulfill_credit_pack(text, uuid, integer, text) is
  'Atomically claim a Stripe credit-pack session and increment the matching '
  'user balance. Duplicate session ids return NULL. service_role only.';

revoke all privileges
  on function public.fulfill_credit_pack(text, uuid, integer, text)
  from public, anon, authenticated;
grant execute
  on function public.fulfill_credit_pack(text, uuid, integer, text)
  to service_role;
