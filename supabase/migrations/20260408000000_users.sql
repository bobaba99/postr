-- Postr · Task 1.1 · public.users + handle_new_user trigger
--
-- Creates the profile table (1:1 with auth.users) and a trigger that
-- auto-creates a profile row whenever a new auth user is inserted.
--
-- Posters table does not exist yet — a later migration (1.2) will
-- extend handle_new_user() to also insert an Untitled Poster.

-- =========================================================================
-- Table
-- =========================================================================
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  email text,
  is_anonymous boolean not null default true,
  cookie_consent_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.users is
  'Profile row 1:1 with auth.users. Auto-populated by handle_new_user() trigger.';

-- =========================================================================
-- Row Level Security
-- =========================================================================
alter table public.users enable row level security;

-- Owners can read their own profile
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
  on public.users
  for select
  to authenticated
  using (auth.uid() = id);

-- Owners can update their own profile
drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Owners can delete their own profile (cascades from auth.users anyway,
-- but explicit policy makes intent clear)
drop policy if exists "users_delete_own" on public.users;
create policy "users_delete_own"
  on public.users
  for delete
  to authenticated
  using (auth.uid() = id);

-- No explicit insert policy: rows are created exclusively by the
-- handle_new_user() trigger (running with definer privileges).

-- =========================================================================
-- handle_new_user() trigger
-- =========================================================================
-- security definer so it can bypass RLS when inserting into public.users
-- search_path pinned to defeat search_path-based privilege escalation.
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

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates a public.users profile row whenever a new auth.users row is inserted. Extended in a later migration to also spawn an Untitled Poster.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
