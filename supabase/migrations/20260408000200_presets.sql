-- Postr · Task 1.3 · public.presets (custom style presets, manual + scanned)
--
-- See PRD §20 Custom Preset Library and §16 Poster Scan.
-- presets.data shape matches PresetData in @postr/shared.

create table if not exists public.presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  source text not null check (source in ('manual', 'scanned')),
  data jsonb not null,
  thumbnail_path text,
  created_at timestamptz not null default now()
);

create index if not exists presets_user_created_idx
  on public.presets (user_id, created_at desc);

alter table public.presets enable row level security;

drop policy if exists "presets_select_own" on public.presets;
create policy "presets_select_own"
  on public.presets
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "presets_insert_own" on public.presets;
create policy "presets_insert_own"
  on public.presets
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "presets_update_own" on public.presets;
create policy "presets_update_own"
  on public.presets
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "presets_delete_own" on public.presets;
create policy "presets_delete_own"
  on public.presets
  for delete
  to authenticated
  using (auth.uid() = user_id);
