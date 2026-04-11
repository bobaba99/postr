-- Public gallery — user-published posters browseable by anyone.
--
-- A gallery entry is decoupled from the `posters` table for two reasons:
--   1. Entries can come from a poster created in Postr OR from an external
--      PDF / image upload. The external path has no posters row at all.
--   2. Retracting a gallery entry should not touch the underlying poster.
--
-- Anyone on the internet can SELECT gallery rows and read the image/PDF
-- file in the `gallery` bucket. Writes are owner-scoped. Triage happens
-- in Supabase Studio via service role.

-- =========================================================================
-- Table
-- =========================================================================
create type public.gallery_source as enum ('postr_poster', 'upload');

create type public.gallery_field as enum (
  'neuroscience',
  'psychology',
  'medicine',
  'biology',
  'computer_science',
  'physics',
  'chemistry',
  'engineering',
  'social_sciences',
  'humanities',
  'other'
);

create table public.gallery_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source public.gallery_source not null,
  poster_id uuid references public.posters(id) on delete set null,
  image_path text not null check (char_length(image_path) <= 500),
  pdf_path text check (pdf_path is null or char_length(pdf_path) <= 500),

  title text not null check (char_length(title) between 1 and 200),
  field public.gallery_field not null,
  conference text check (conference is null or char_length(conference) <= 200),
  year int check (year is null or (year between 1900 and 2100)),
  notes text check (notes is null or char_length(notes) <= 2000),

  created_at timestamptz not null default now(),
  retracted_at timestamptz,

  -- An `upload` source row has no poster_id. A `postr_poster` source row
  -- is allowed to lose its poster_id (posters.delete sets it to null) but
  -- must still have a stored image.
  constraint gallery_source_shape check (
    (source = 'upload' and poster_id is null)
    or source = 'postr_poster'
  )
);

create index gallery_entries_user_id_idx on public.gallery_entries(user_id);
create index gallery_entries_field_idx on public.gallery_entries(field);
create index gallery_entries_created_at_idx on public.gallery_entries(created_at desc);
-- Partial index so the public listing (which filters out retracted rows)
-- stays fast as the table grows.
create index gallery_entries_public_recent_idx
  on public.gallery_entries(created_at desc)
  where retracted_at is null;

-- =========================================================================
-- Row-level security
-- =========================================================================
alter table public.gallery_entries enable row level security;

-- Anyone — including unauthenticated visitors — can read non-retracted
-- entries. Retracted rows stay in the table for a short audit window but
-- are invisible to the public.
drop policy if exists "gallery_entries_public_select" on public.gallery_entries;
create policy "gallery_entries_public_select"
  on public.gallery_entries
  for select
  to anon, authenticated
  using (retracted_at is null);

-- Owners can always see their own rows, including retracted ones, so the
-- Profile "My submissions" section can show an accurate history.
drop policy if exists "gallery_entries_select_own" on public.gallery_entries;
create policy "gallery_entries_select_own"
  on public.gallery_entries
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Authenticated users (including anonymous sessions) can insert entries
-- that belong to themselves.
drop policy if exists "gallery_entries_insert_own" on public.gallery_entries;
create policy "gallery_entries_insert_own"
  on public.gallery_entries
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Owners can update their own rows — primarily to set retracted_at.
drop policy if exists "gallery_entries_update_own" on public.gallery_entries;
create policy "gallery_entries_update_own"
  on public.gallery_entries
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Owners can hard-delete their own rows when they want everything gone.
drop policy if exists "gallery_entries_delete_own" on public.gallery_entries;
create policy "gallery_entries_delete_own"
  on public.gallery_entries
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- =========================================================================
-- Rate limit: 5 publishes per user per rolling day
-- =========================================================================
create or replace function public.enforce_gallery_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
  from public.gallery_entries
  where user_id = new.user_id
    and created_at > now() - interval '1 day';

  if recent_count >= 5 then
    raise exception 'rate_limit_exceeded: max 5 gallery publishes per day';
  end if;

  return new;
end;
$$;

drop trigger if exists gallery_rate_limit_trigger on public.gallery_entries;
create trigger gallery_rate_limit_trigger
  before insert on public.gallery_entries
  for each row execute function public.enforce_gallery_rate_limit();

-- =========================================================================
-- Public gallery storage bucket
-- =========================================================================
-- Path convention: {user_id}/{entry_id}.{ext}
-- The bucket is PUBLIC — the whole point of the gallery is that anyone
-- can view the image without authenticating.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gallery',
  'gallery',
  true,
  15 * 1024 * 1024, -- 15 MB max per file
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public read is implicit via bucket.public = true. We still need RLS on
-- storage.objects for the write paths so only owners can upload or delete.

drop policy if exists "gallery_insert_own" on storage.objects;
create policy "gallery_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'gallery'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "gallery_update_own" on storage.objects;
create policy "gallery_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'gallery'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'gallery'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "gallery_delete_own" on storage.objects;
create policy "gallery_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'gallery'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Anon SELECT on the `gallery` bucket works via `public = true`, so no
-- explicit anon select policy is required here.
