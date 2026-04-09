-- Postr · Task 1.4 · poster-assets storage bucket + RLS
--
-- Path convention: {user_id}/{poster_id}/{asset_id}.{ext}
-- The bucket is PRIVATE — public posters expose assets via signed URLs
-- generated server-side.
--
-- See PRD §19 Asset Storage and §System Architecture > Storage bucket.

insert into storage.buckets (id, name, public)
values ('poster-assets', 'poster-assets', false)
on conflict (id) do nothing;

-- =========================================================================
-- RLS on storage.objects scoped to the poster-assets bucket
-- =========================================================================
-- Path prefix == user_id (storage.foldername returns the path split into
-- folders; element 1 is the first folder, which is the user_id in our
-- {user_id}/{poster_id}/{asset_id}.{ext} convention).

drop policy if exists "poster_assets_select_own" on storage.objects;
create policy "poster_assets_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'poster-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "poster_assets_insert_own" on storage.objects;
create policy "poster_assets_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'poster-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "poster_assets_update_own" on storage.objects;
create policy "poster_assets_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'poster-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'poster-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "poster_assets_delete_own" on storage.objects;
create policy "poster_assets_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'poster-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Note: anon access is intentionally NOT granted at the bucket level.
-- Public posters surface their assets through signed URLs that the
-- backend (or an authenticated client owner) generates explicitly.
