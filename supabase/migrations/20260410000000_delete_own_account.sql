-- Allow users to delete their own account via RPC.
-- This calls auth.users deletion using the service role,
-- which cascades through all ON DELETE CASCADE FKs.
--
-- Security: auth.uid() ensures users can only delete themselves.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer  -- runs as the DB owner, not the calling user
set search_path = ''
as $$
begin
  -- Delete from auth.users (cascades to public.users → posters → etc.)
  delete from auth.users where id = auth.uid();
end;
$$;

-- Only authenticated users can call this
revoke all on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;
