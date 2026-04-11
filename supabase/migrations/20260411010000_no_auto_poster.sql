-- Remove auto-poster creation from handle_new_user().
--
-- Original behavior (20260408000100_posters.sql) was to spawn an
-- "Untitled Poster" for every new auth user so the editor would open
-- straight into a live document. In practice this clutters the
-- dashboard with an empty poster every guest session, and the
-- empty-state Welcome card now shows the same "+ New poster" CTA the
-- onboarding flow needs anyway. Cleaner to start with an empty
-- dashboard and let the user create the first poster on demand.
--
-- This migration restores handle_new_user() to inserting only the
-- public.users row. The pre-existing seeded "Untitled Poster" rows
-- from earlier guest sessions are NOT touched — owners can delete
-- them from the dashboard themselves, and a separate cleanup is
-- not worth a destructive migration.

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
  'Creates a public.users profile row whenever a new auth.users row is inserted. As of 20260411010000, no longer auto-creates a poster — guests start with an empty dashboard.';
