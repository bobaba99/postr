-- Gallery moderation — admin allowlist in Supabase + additive RLS.
--
-- The allowlist lives in a dedicated `admin_emails` table so new
-- moderators can be added with a one-row INSERT in Supabase Studio —
-- no code deploy, no env changes. The is_gallery_admin() helper reads
-- the table through SECURITY DEFINER so regular users never see the
-- contents.
--
-- All admin actions on gallery_entries go through additive RLS
-- policies: admins get SELECT on every row (retracted included) and
-- UPDATE on any row. Force-retraction sets retracted_at +
-- retracted_by + retraction_reason, leaving storage files intact so
-- the action is reversible.

-- =========================================================================
-- Admin allowlist table
-- =========================================================================
create table if not exists public.admin_emails (
  email text primary key check (char_length(email) between 3 and 320),
  added_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 200)
);

-- Seed the current developer as the first admin. Follow-up admins go
-- in via Supabase Studio: Table Editor → admin_emails → Insert row.
insert into public.admin_emails (email, note)
values ('gavingengzihao@gmail.com', 'Founding developer')
on conflict (email) do nothing;

-- The table itself never needs to be read by end-users — only by the
-- is_gallery_admin() helper which runs as the table owner. Deny all
-- direct access.
alter table public.admin_emails enable row level security;
-- No policies created → no SELECT/INSERT/UPDATE/DELETE for anon or
-- authenticated. Service role (used in Studio) bypasses RLS.

-- =========================================================================
-- is_gallery_admin(uid) — reads admin_emails through SECURITY DEFINER
-- =========================================================================
create or replace function public.is_gallery_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    join public.admin_emails a on a.email = u.email
    where u.id = uid
  );
$$;

grant execute on function public.is_gallery_admin(uuid) to authenticated;

-- =========================================================================
-- Extra columns on gallery_entries
-- =========================================================================
alter table public.gallery_entries
  add column if not exists retracted_by uuid references auth.users(id) on delete set null,
  add column if not exists retraction_reason text
    check (retraction_reason is null or char_length(retraction_reason) <= 500);

-- =========================================================================
-- Additive RLS policies for admins on gallery_entries
-- =========================================================================
-- These stack on top of the existing owner/public policies from
-- 20260410030000_gallery.sql. Every SELECT is OR'd across all
-- matching policies, so admins keep their baseline rights and gain
-- access to everyone else's rows.

drop policy if exists "gallery_entries_admin_select_all" on public.gallery_entries;
create policy "gallery_entries_admin_select_all"
  on public.gallery_entries
  for select
  to authenticated
  using (public.is_gallery_admin(auth.uid()));

drop policy if exists "gallery_entries_admin_update_all" on public.gallery_entries;
create policy "gallery_entries_admin_update_all"
  on public.gallery_entries
  for update
  to authenticated
  using (public.is_gallery_admin(auth.uid()))
  with check (public.is_gallery_admin(auth.uid()));

-- No admin delete policy — moderation uses soft retraction so the
-- audit trail (who retracted, when, why) survives. Owners can still
-- hard-delete their own rows through the existing owner delete policy.
