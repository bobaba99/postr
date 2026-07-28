-- Postr · consume_export_credit(p_user_id) RPC
--
-- Atomically spends one export credit for a user, called ONLY by the
-- API (apps/api/src/billing.ts) with the service_role key after a
-- successful credit-based export. A term holder never calls it (their
-- exports are unlimited).
--
-- Atomicity: a single conditional UPDATE guarded by `export_credits > 0`,
-- RETURNING the new balance. Two concurrent exports cannot drive the
-- balance negative — the second matches zero rows and returns NULL, which
-- the caller reads as "no credit".
--
-- Grant model: SERVICE_ROLE ONLY. Unlike the user-facing RPCs, this is
-- never called from the browser — the client hits the authed API route,
-- which invokes this with service_role. Revoking public/anon/authenticated
-- EXECUTE means a browser cannot burn or manipulate its own credits even
-- by calling the RPC directly.
--
-- SECURITY DEFINER + pinned search_path so it can write the guarded
-- export_credits column (the billing-column trigger permits service_role)
-- and can't be subverted via a shadowed function on the search_path.

create or replace function public.consume_export_credit(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_remaining integer;
begin
  update public.users
     set export_credits = export_credits - 1
   where id = p_user_id
     and export_credits > 0
  returning export_credits into v_remaining;

  -- NULL when the user had no credits (zero rows updated) — the caller
  -- treats that as "no credit available".
  return v_remaining;
end;
$$;

comment on function public.consume_export_credit(uuid) is
  'Atomically spend one export credit for a user; returns the new balance '
  'or NULL if none. service_role only (called by the billing API).';

-- Postgres grants EXECUTE to PUBLIC by default. Strip it and every
-- browser-facing role; service_role keeps EXECUTE from schema defaults.
revoke execute on function public.consume_export_credit(uuid)
  from public, anon, authenticated;
