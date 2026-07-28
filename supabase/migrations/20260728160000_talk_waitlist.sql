-- Postr · paper-to-talk waitlist
--
-- Captures interest in the deferred paper-to-talk feature
-- (docs/plans/2026-07-28-paper-to-talk.md, NOT BUILT). When it ships,
-- this list is who to notify. A signed-in user joins with one row; email
-- is denormalised from their account so the outreach query needs no join.
--
-- Anonymous guests can join too (they're real users from RLS's view), but
-- only rows with an email are contactable — the notify query filters on
-- email IS NOT NULL.

create table if not exists public.talk_waitlist (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  joined_at timestamptz not null default now()
);

comment on table public.talk_waitlist is
  'Interest list for the deferred paper-to-talk feature. One row per '
  'user; email denormalised for the notify query. Owner-managed via RLS.';

alter table public.talk_waitlist enable row level security;

-- A user manages only their own waitlist row.
drop policy if exists "talk_waitlist_select_own" on public.talk_waitlist;
create policy "talk_waitlist_select_own"
  on public.talk_waitlist
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "talk_waitlist_insert_own" on public.talk_waitlist;
create policy "talk_waitlist_insert_own"
  on public.talk_waitlist
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "talk_waitlist_delete_own" on public.talk_waitlist;
create policy "talk_waitlist_delete_own"
  on public.talk_waitlist
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
