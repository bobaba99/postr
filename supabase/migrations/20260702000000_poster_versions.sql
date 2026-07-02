-- Poster versions — user-triggered "Save As" checkpoints.
--
-- Each row is a full PosterDoc snapshot taken when the user explicitly
-- saves a version (NOT on autosave). The editor's Versions sidebar tab
-- lists them newest-first and can restore any snapshot; restore first
-- auto-saves the current state as its own version so the action is
-- never destructive.
--
-- The client enforces a soft cap of 20 versions per poster (warning at
-- 15). The trigger below is the server-side backstop at 30 — snapshots
-- embed the full data JSONB (which can carry base64 images), so an
-- unbounded insert path would be a cheap storage-abuse vector.

create table public.poster_versions (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid not null references public.posters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 120),
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index poster_versions_poster_id_idx
  on public.poster_versions(poster_id, created_at desc);

alter table public.poster_versions enable row level security;

-- SELECT: owner only. Versions are private working state — they are
-- never exposed through the public share view, even for public posters.
drop policy if exists "poster_versions_select_own" on public.poster_versions;
create policy "poster_versions_select_own"
  on public.poster_versions
  for select
  to authenticated
  using (user_id = auth.uid());

-- INSERT: the row must be owned by the current session AND the target
-- poster must belong to the same user. The second check keeps a
-- malicious client from attaching version rows to other users' posters
-- (invisible junk, but junk that would still count against their cap).
drop policy if exists "poster_versions_insert_own" on public.poster_versions;
create policy "poster_versions_insert_own"
  on public.poster_versions
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.posters p
      where p.id = poster_versions.poster_id
        and p.user_id = auth.uid()
    )
  );

-- DELETE: owner only.
drop policy if exists "poster_versions_delete_own" on public.poster_versions;
create policy "poster_versions_delete_own"
  on public.poster_versions
  for delete
  to authenticated
  using (user_id = auth.uid());

-- No UPDATE policy on purpose — versions are immutable snapshots.
-- "Rename" (if it ever ships) should be an explicit policy, not a
-- side effect of a permissive default.

-- Server-side backstop for the per-poster version cap. Security
-- definer + pinned search_path per project convention; runs before
-- RLS-filtered visibility would hide other users' rows, but the count
-- is scoped to new.poster_id which insert RLS already proved we own.
create or replace function public.poster_versions_enforce_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  version_count int;
begin
  select count(*) into version_count
  from public.poster_versions
  where poster_id = new.poster_id;

  if version_count >= 30 then
    raise exception 'version limit: max 30 versions per poster'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Default privileges grant EXECUTE to both public and anon — revoke
-- from all three; the trigger machinery doesn't need caller EXECUTE.
revoke execute on function public.poster_versions_enforce_cap()
  from public, anon, authenticated;

drop trigger if exists poster_versions_enforce_cap_trg on public.poster_versions;
create trigger poster_versions_enforce_cap_trg
  before insert on public.poster_versions
  for each row
  execute function public.poster_versions_enforce_cap();
