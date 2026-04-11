-- ==========================================================================
-- Poster creation rate limit — abuse protection
-- ==========================================================================
--
-- Anonymous users could previously create an unlimited number of posters,
-- which is a cheap abuse vector: one malicious script could flood the
-- `public.posters` table with tens of thousands of rows in seconds. This
-- migration caps each user at a reasonable upper bound and blocks inserts
-- beyond that via a BEFORE INSERT trigger.
--
-- Limits:
--   * anonymous users: 25 posters
--   * authenticated (verified email) users: 200 posters
--
-- Rationale: a researcher working on a single poster shouldn't need more
-- than a handful of revisions; even a prolific academic preparing multiple
-- papers at once rarely has 200+ active drafts. The cap is high enough to
-- never bite legitimate users, low enough to stop spam cold.
--
-- Message on rejection is surfaced to the client via PostgREST's standard
-- error format (`message` + `code`) so the UI can show a human-readable
-- "You've hit the free-tier limit" toast rather than a generic 500.
--
-- Rollback: DROP TRIGGER + DROP FUNCTION. No data migrations.

create or replace function public.check_poster_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_anon boolean;
  v_count integer;
  v_limit integer;
begin
  -- Determine whether this user is an anonymous guest (handle_new_user
  -- creates both anonymous + email users — we need the auth.users flag
  -- to know which tier applies).
  select coalesce(is_anonymous, false)
    into v_is_anon
    from auth.users
    where id = new.user_id;

  if v_is_anon then
    v_limit := 25;
  else
    v_limit := 200;
  end if;

  select count(*) into v_count
    from public.posters
    where user_id = new.user_id;

  if v_count >= v_limit then
    raise exception
      'Poster limit reached (% of %). Delete unused drafts before creating more.',
      v_count, v_limit
      using errcode = 'P0001',
            hint = 'Postr limits free-tier users to 25 active drafts for anonymous guests and 200 for signed-in users. Clean up old posters from the dashboard.';
  end if;

  return new;
end;
$$;

drop trigger if exists posters_rate_limit on public.posters;
create trigger posters_rate_limit
  before insert on public.posters
  for each row
  execute function public.check_poster_limit();

comment on function public.check_poster_limit() is
  'Enforces per-user poster count caps (25 anonymous, 200 authenticated) as a BEFORE INSERT abuse guard.';
