-- Postr · Task 1.2 · public.posters + RLS + auto-create on signup
--
-- Creates the main poster document table and extends handle_new_user()
-- so every new auth user gets an Untitled Poster spawned alongside
-- their profile row. This is the foundation of the "zero friction"
-- principle: by the time the editor mounts, a poster row already
-- exists for the anonymous session.
--
-- See PRD §System Architecture > Database Schema and §17 Profiles & Persistence.

-- =========================================================================
-- Table
-- =========================================================================
create table if not exists public.posters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null default 'Untitled Poster',
  width_in numeric not null default 48,
  height_in numeric not null default 36,
  -- Self-contained snapshot: blocks, style, palette, font, institutions,
  -- authors, references. Shape defined by PosterDoc in @postr/shared.
  --
  -- Style sizes are in poster units (1 unit = 1/10 inch = 7.2 points).
  -- These defaults are calibrated to the print-readability guideline:
  --   title 22u ≈ 158pt (guideline: 72–158pt)
  --   heading 8u ≈ 58pt (guideline: 42–56pt)
  --   body 5u ≈ 36pt    (guideline: 24–36pt)
  --   authors 5u ≈ 36pt
  -- Keep these in sync with DEFAULT_STYLES in apps/web/src/poster/constants.ts.
  --
  -- blocks is empty on purpose — the client hydrates it into the 3-col
  -- default template on first load (see Editor.tsx hydrateIfEmpty).
  data jsonb not null default '{
    "version": 1,
    "widthIn": 48,
    "heightIn": 36,
    "blocks": [],
    "fontFamily": "Source Sans 3",
    "palette": {
      "bg": "#FFFFFF",
      "primary": "#1a1a2e",
      "accent": "#0f4c75",
      "accent2": "#3282b8",
      "muted": "#6c757d",
      "headerBg": "#0f4c75",
      "headerFg": "#fff"
    },
    "styles": {
      "title":   {"size": 22, "weight": 800, "italic": false, "lineHeight": 1.15, "color": null, "highlight": null},
      "heading": {"size": 8,  "weight": 700, "italic": false, "lineHeight": 1.3,  "color": null, "highlight": null},
      "authors": {"size": 5,  "weight": 400, "italic": false, "lineHeight": 1.5,  "color": null, "highlight": null},
      "body":    {"size": 5,  "weight": 400, "italic": false, "lineHeight": 1.55, "color": null, "highlight": null}
    },
    "headingStyle": {"border": "bottom", "fill": false, "align": "left"},
    "institutions": [],
    "authors": [],
    "references": []
  }'::jsonb,
  thumbnail_path text,
  share_slug text unique,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.posters is
  'Main poster document. data jsonb is a self-contained snapshot matching PosterDoc.';

create index if not exists posters_user_updated_idx
  on public.posters (user_id, updated_at desc);

create index if not exists posters_share_slug_idx
  on public.posters (share_slug)
  where share_slug is not null;

-- updated_at auto-bump trigger
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists posters_touch_updated_at on public.posters;
create trigger posters_touch_updated_at
  before update on public.posters
  for each row
  execute function public.touch_updated_at();

-- =========================================================================
-- Row Level Security
-- =========================================================================
alter table public.posters enable row level security;

-- Owners get full CRUD
drop policy if exists "posters_select_own" on public.posters;
create policy "posters_select_own"
  on public.posters
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "posters_insert_own" on public.posters;
create policy "posters_insert_own"
  on public.posters
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "posters_update_own" on public.posters;
create policy "posters_update_own"
  on public.posters
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "posters_delete_own" on public.posters;
create policy "posters_delete_own"
  on public.posters
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Public posters: anyone (anon or authenticated) can SELECT when shared.
-- Drives the /s/:slug read-only viewer route — no auth required.
drop policy if exists "posters_select_public" on public.posters;
create policy "posters_select_public"
  on public.posters
  for select
  to anon, authenticated
  using (is_public = true);

-- =========================================================================
-- Extend handle_new_user(): also spawn an Untitled Poster
-- =========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, is_anonymous)
  values (
    new.id,
    new.email,
    coalesce(new.is_anonymous, false)
  )
  on conflict (id) do nothing;

  -- Auto-create the first poster so the editor opens straight into a
  -- live document — no "New Project" dialog (PRD §17).
  insert into public.posters (user_id)
  values (new.id);

  return new;
end;
$$;
