-- Postr · Task 1.3 · institutions_lib + authors_lib + references_lib
--
-- Reusable library entries imported into posters as snapshots.
-- See PRD §21 Reusable Author/Institution/Reference Library.
-- Editing a library entry does NOT retroactively mutate existing posters —
-- the import path copies values into posters.data at import time.

-- =========================================================================
-- institutions_lib
-- =========================================================================
create table if not exists public.institutions_lib (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  dept text,
  location text,
  created_at timestamptz not null default now()
);

create index if not exists institutions_lib_user_idx
  on public.institutions_lib (user_id, name);

alter table public.institutions_lib enable row level security;

drop policy if exists "institutions_lib_select_own" on public.institutions_lib;
create policy "institutions_lib_select_own" on public.institutions_lib
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "institutions_lib_insert_own" on public.institutions_lib;
create policy "institutions_lib_insert_own" on public.institutions_lib
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "institutions_lib_update_own" on public.institutions_lib;
create policy "institutions_lib_update_own" on public.institutions_lib
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "institutions_lib_delete_own" on public.institutions_lib;
create policy "institutions_lib_delete_own" on public.institutions_lib
  for delete to authenticated using (auth.uid() = user_id);

-- =========================================================================
-- authors_lib
-- =========================================================================
create table if not exists public.authors_lib (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  -- Soft FK: array of institutions_lib.id values. Stored as uuid[] so
  -- we can use array operators; not enforced via FK because Postgres
  -- doesn't support array element FKs natively.
  affiliation_lib_ids uuid[] not null default '{}',
  is_corresponding boolean not null default false,
  equal_contrib boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists authors_lib_user_idx
  on public.authors_lib (user_id, name);

alter table public.authors_lib enable row level security;

drop policy if exists "authors_lib_select_own" on public.authors_lib;
create policy "authors_lib_select_own" on public.authors_lib
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "authors_lib_insert_own" on public.authors_lib;
create policy "authors_lib_insert_own" on public.authors_lib
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "authors_lib_update_own" on public.authors_lib;
create policy "authors_lib_update_own" on public.authors_lib
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "authors_lib_delete_own" on public.authors_lib;
create policy "authors_lib_delete_own" on public.authors_lib
  for delete to authenticated using (auth.uid() = user_id);

-- =========================================================================
-- references_lib
-- =========================================================================
create table if not exists public.references_lib (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  authors text[] not null default '{}',
  year text,
  title text,
  journal text,
  doi text,
  created_at timestamptz not null default now()
);

create index if not exists references_lib_user_idx
  on public.references_lib (user_id, created_at desc);

alter table public.references_lib enable row level security;

drop policy if exists "references_lib_select_own" on public.references_lib;
create policy "references_lib_select_own" on public.references_lib
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "references_lib_insert_own" on public.references_lib;
create policy "references_lib_insert_own" on public.references_lib
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "references_lib_update_own" on public.references_lib;
create policy "references_lib_update_own" on public.references_lib
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "references_lib_delete_own" on public.references_lib;
create policy "references_lib_delete_own" on public.references_lib
  for delete to authenticated using (auth.uid() = user_id);
