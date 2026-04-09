-- Postr · Task 1.3 · public.assets (asset metadata for storage objects)
--
-- Binaries live in the poster-assets storage bucket (created in 1.4).
-- This table holds the metadata: which user/poster owns each asset,
-- mime type, dimensions, etc. The actual storage_path is keyed by
-- {user_id}/{poster_id}/{asset_id}.{ext} so RLS on storage.objects
-- can scope by path prefix.
--
-- See PRD §19 Asset Storage.

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  poster_id uuid references public.posters (id) on delete cascade,
  storage_path text not null unique,
  mime_type text,
  size_bytes integer,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);

create index if not exists assets_user_idx
  on public.assets (user_id, created_at desc);

create index if not exists assets_poster_idx
  on public.assets (poster_id)
  where poster_id is not null;

alter table public.assets enable row level security;

drop policy if exists "assets_select_own" on public.assets;
create policy "assets_select_own"
  on public.assets
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "assets_insert_own" on public.assets;
create policy "assets_insert_own"
  on public.assets
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "assets_update_own" on public.assets;
create policy "assets_update_own"
  on public.assets
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "assets_delete_own" on public.assets;
create policy "assets_delete_own"
  on public.assets
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Public asset access for shared posters: when the asset belongs to a
-- poster that is_public, anyone can read its metadata. The storage
-- bucket itself is private — public viewers will hit signed URLs
-- generated server-side.
drop policy if exists "assets_select_public_poster" on public.assets;
create policy "assets_select_public_poster"
  on public.assets
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.posters p
      where p.id = assets.poster_id and p.is_public = true
    )
  );
