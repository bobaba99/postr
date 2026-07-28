-- Postr · grant_export_credits(p_user_id, p_amount) RPC
--
-- Atomic credit GRANT for the webhook, mirroring consume_export_credit.
-- The webhook previously read export_credits then wrote the sum, which
-- could lose a grant if two DISTINCT pack sessions fulfilled concurrently
-- (the per-session idempotency ledger only serialises the SAME session).
-- A single `SET export_credits = export_credits + p_amount` statement is
-- atomic, so concurrent grants sum correctly.
--
-- service_role only (called by the billing webhook), same grant model as
-- consume_export_credit — revoked from public/anon/authenticated.

create or replace function public.grant_export_credits(
  p_user_id uuid,
  p_amount integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_remaining integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'grant amount must be a positive integer';
  end if;

  update public.users
     set export_credits = export_credits + p_amount
   where id = p_user_id
  returning export_credits into v_remaining;

  return v_remaining;
end;
$$;

comment on function public.grant_export_credits(uuid, integer) is
  'Atomically add export credits for a user; returns the new balance. '
  'service_role only (called by the billing webhook).';

revoke execute on function public.grant_export_credits(uuid, integer)
  from public, anon, authenticated;
