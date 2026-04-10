-- Postr · RLS performance pass
--
-- Addresses two Supabase advisor warnings:
--
-- 1. auth_rls_initplan: every policy that calls `auth.uid()` directly
--    re-evaluates the function per row. Wrapping in `(select auth.uid())`
--    lets Postgres treat the call as a stable subquery, evaluated once.
--    Docs: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- 2. multiple_permissive_policies: posters and assets each had two
--    permissive SELECT policies (owner + public). For authenticated
--    users both policies execute on every read. Merge into one combined
--    policy: `using ( owner OR public )`.
--
-- All policies in this migration replace policies created in
-- 20260408000000..000500. Behavior is identical; performance only.

-- =========================================================================
-- public.users
-- =========================================================================
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "users_delete_own" on public.users;
create policy "users_delete_own" on public.users
  for delete to authenticated
  using ((select auth.uid()) = id);

-- =========================================================================
-- public.posters
-- Merge owner-select + public-select into a single combined SELECT policy.
-- =========================================================================
drop policy if exists "posters_select_own" on public.posters;
drop policy if exists "posters_select_public" on public.posters;
create policy "posters_select" on public.posters
  for select to anon, authenticated
  using (
    (select auth.uid()) = user_id
    or is_public = true
  );

drop policy if exists "posters_insert_own" on public.posters;
create policy "posters_insert_own" on public.posters
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "posters_update_own" on public.posters;
create policy "posters_update_own" on public.posters
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "posters_delete_own" on public.posters;
create policy "posters_delete_own" on public.posters
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- =========================================================================
-- public.presets
-- =========================================================================
drop policy if exists "presets_select_own" on public.presets;
create policy "presets_select_own" on public.presets
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "presets_insert_own" on public.presets;
create policy "presets_insert_own" on public.presets
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "presets_update_own" on public.presets;
create policy "presets_update_own" on public.presets
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "presets_delete_own" on public.presets;
create policy "presets_delete_own" on public.presets
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- =========================================================================
-- public.institutions_lib
-- =========================================================================
drop policy if exists "institutions_lib_select_own" on public.institutions_lib;
create policy "institutions_lib_select_own" on public.institutions_lib
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "institutions_lib_insert_own" on public.institutions_lib;
create policy "institutions_lib_insert_own" on public.institutions_lib
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "institutions_lib_update_own" on public.institutions_lib;
create policy "institutions_lib_update_own" on public.institutions_lib
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "institutions_lib_delete_own" on public.institutions_lib;
create policy "institutions_lib_delete_own" on public.institutions_lib
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- =========================================================================
-- public.authors_lib
-- =========================================================================
drop policy if exists "authors_lib_select_own" on public.authors_lib;
create policy "authors_lib_select_own" on public.authors_lib
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "authors_lib_insert_own" on public.authors_lib;
create policy "authors_lib_insert_own" on public.authors_lib
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "authors_lib_update_own" on public.authors_lib;
create policy "authors_lib_update_own" on public.authors_lib
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "authors_lib_delete_own" on public.authors_lib;
create policy "authors_lib_delete_own" on public.authors_lib
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- =========================================================================
-- public.references_lib
-- =========================================================================
drop policy if exists "references_lib_select_own" on public.references_lib;
create policy "references_lib_select_own" on public.references_lib
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "references_lib_insert_own" on public.references_lib;
create policy "references_lib_insert_own" on public.references_lib
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "references_lib_update_own" on public.references_lib;
create policy "references_lib_update_own" on public.references_lib
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "references_lib_delete_own" on public.references_lib;
create policy "references_lib_delete_own" on public.references_lib
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- =========================================================================
-- public.assets
-- Merge owner-select + public-via-poster into a single combined SELECT.
-- =========================================================================
drop policy if exists "assets_select_own" on public.assets;
drop policy if exists "assets_select_public_poster" on public.assets;
create policy "assets_select" on public.assets
  for select to anon, authenticated
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.posters p
      where p.id = assets.poster_id and p.is_public = true
    )
  );

drop policy if exists "assets_insert_own" on public.assets;
create policy "assets_insert_own" on public.assets
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "assets_update_own" on public.assets;
create policy "assets_update_own" on public.assets
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "assets_delete_own" on public.assets;
create policy "assets_delete_own" on public.assets
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- =========================================================================
-- storage.objects (poster-assets bucket)
-- =========================================================================
drop policy if exists "poster_assets_select_own" on storage.objects;
create policy "poster_assets_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'poster-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "poster_assets_insert_own" on storage.objects;
create policy "poster_assets_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'poster-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "poster_assets_update_own" on storage.objects;
create policy "poster_assets_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'poster-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'poster-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "poster_assets_delete_own" on storage.objects;
create policy "poster_assets_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'poster-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
