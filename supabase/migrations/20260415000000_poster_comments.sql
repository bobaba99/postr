-- Poster comments — lightweight review threads on a poster, anchored
-- to a block, a text range inside a block, a drag-selected rectangle
-- on the canvas, or the whole document.
--
-- Guest flow: a reviewer opens the public share URL (posters.is_public
-- + share_slug), is prompted once for a display name, and inserts rows
-- using their anonymous Supabase session. The `author_name` column is
-- the display label; `user_id` ties the row back to the anon session so
-- the author (and only the author) can later edit/delete their own comment.

create table public.poster_comments (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid not null references public.posters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 60),
  parent_id uuid references public.poster_comments(id) on delete cascade,

  -- Anchor describes where the comment points:
  --   'doc'   → whole poster (no target)
  --   'block' → anchor.blockId references a Block.id
  --   'text'  → anchor.blockId + anchor.start/end char offsets in plain text
  --   'area'  → anchor.rect = [x, y, w, h] in poster units (1 unit = 0.1")
  -- Kept as jsonb so the client can evolve the shape without a migration.
  anchor_type text not null
    check (anchor_type in ('doc', 'block', 'text', 'area')),
  anchor jsonb not null default '{}'::jsonb,

  body text not null check (char_length(body) between 1 and 4000),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index poster_comments_poster_id_idx
  on public.poster_comments(poster_id, created_at desc);
create index poster_comments_parent_id_idx
  on public.poster_comments(parent_id)
  where parent_id is not null;

alter table public.poster_comments enable row level security;

-- SELECT: anyone authenticated (including anonymous guests) can read
-- comments on a poster that is public. The poster owner always sees
-- their own poster's comments through posters_select_own.
drop policy if exists "poster_comments_select_public" on public.poster_comments;
create policy "poster_comments_select_public"
  on public.poster_comments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.posters p
      where p.id = poster_comments.poster_id
        and (p.is_public = true or p.user_id = auth.uid())
    )
  );

-- INSERT: anyone authenticated can comment on a public poster, OR the
-- owner on their own (not-yet-public) poster. Row must be owned by the
-- current session (user_id = auth.uid()) to prevent impersonation.
drop policy if exists "poster_comments_insert_visible" on public.poster_comments;
create policy "poster_comments_insert_visible"
  on public.poster_comments
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.posters p
      where p.id = poster_comments.poster_id
        and (p.is_public = true or p.user_id = auth.uid())
    )
  );

-- UPDATE: author can edit their own body + mark resolved. Poster owner
-- can also toggle resolved_at on any comment thread on their poster.
drop policy if exists "poster_comments_update_author_or_owner" on public.poster_comments;
create policy "poster_comments_update_author_or_owner"
  on public.poster_comments
  for update
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.posters p
      where p.id = poster_comments.poster_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.posters p
      where p.id = poster_comments.poster_id
        and p.user_id = auth.uid()
    )
  );

-- DELETE: author can remove their own comment; owner can remove any
-- comment on their poster (moderation).
drop policy if exists "poster_comments_delete_author_or_owner" on public.poster_comments;
create policy "poster_comments_delete_author_or_owner"
  on public.poster_comments
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.posters p
      where p.id = poster_comments.poster_id
        and p.user_id = auth.uid()
    )
  );

-- Spam defense: cap comments per user per poster per rolling hour.
-- A drive-by guest can't paste 500 "nice work" comments to DOS the
-- owner's feed. The owner is exempt (comments on their own poster).
create or replace function public.poster_comments_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
  owner_id uuid;
begin
  select user_id into owner_id from public.posters where id = new.poster_id;
  if owner_id = new.user_id then
    return new; -- owner is unlimited on their own poster
  end if;

  select count(*) into recent_count
  from public.poster_comments
  where poster_id = new.poster_id
    and user_id = new.user_id
    and created_at > now() - interval '1 hour';

  if recent_count >= 30 then
    raise exception 'comment rate limit: max 30 per hour per poster'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists poster_comments_rate_limit_trg on public.poster_comments;
create trigger poster_comments_rate_limit_trg
  before insert on public.poster_comments
  for each row
  execute function public.poster_comments_rate_limit();

-- Keep updated_at in sync on edits.
create or replace function public.poster_comments_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists poster_comments_touch_updated_at_trg on public.poster_comments;
create trigger poster_comments_touch_updated_at_trg
  before update on public.poster_comments
  for each row
  execute function public.poster_comments_touch_updated_at();
