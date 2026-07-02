-- ==========================================================================
-- Revoke the default PUBLIC EXECUTE grant on user-facing RPCs
-- ==========================================================================
--
-- Postgres grants EXECUTE to PUBLIC on every new function, and
-- `revoke ... from anon` (20260410000000_delete_own_account.sql) never
-- removed it — anon kept EXECUTE on these RPCs through PUBLIC membership.
-- export_my_data() and is_gallery_admin() additionally carried the
-- explicit anon grant from Supabase's schema-public default privileges
-- (pg_default_acl), hence the revokes below name both grantees.
-- Not exploitable (each body self-guards on auth.uid(): export_my_data()
-- raises P0001, delete_own_account() matches zero rows), but the grant
-- layer should enforce the boundary the bodies already do.
--
-- `authenticated` is the only intended caller: PostgREST runs browser RPCs
-- as `authenticated` for permanent and anonymous-session users alike, and
-- the web app never calls these without a session (Profile.tsx sits behind
-- AuthGuard; checkIsGalleryAdmin() returns early). No server path calls
-- them (apps/api has no .rpc usage), so this migration adds no
-- service_role grant; service_role keeps the EXECUTE it already holds
-- from those same default privileges — fine, it is server-only and
-- never exposed to browsers.
--
-- is_gallery_admin() appears in RLS policies on gallery_entries, but both
-- are `to authenticated` — they never evaluate for anon queries, so
-- revoking anon EXECUTE cannot break logged-out gallery reads.
--
-- `create or replace function` preserves the ACL; `drop` + `create` would
-- resurrect the PUBLIC default grant. rpc_definitions_test.sql pins the
-- revocation against that.

revoke execute on function public.delete_own_account() from public, anon;
revoke execute on function public.export_my_data() from public, anon;
revoke execute on function public.is_gallery_admin(uuid) from public, anon;

-- Re-assert the intended audience (no-ops where the grant already exists).
grant execute on function public.delete_own_account() to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.is_gallery_admin(uuid) to authenticated;
