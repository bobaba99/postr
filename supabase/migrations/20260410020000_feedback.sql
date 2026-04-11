-- User-submitted feedback: bug reports, feature requests, general notes.
-- Readable only by the submitter (via RLS) + the project owner (via service role
-- in Supabase Studio). Admins triage directly from the dashboard.

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('bug', 'feature', 'other')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 4000),
  page_url text check (page_url is null or char_length(page_url) <= 500),
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  status text not null default 'new'
    check (status in ('new', 'triaged', 'in_progress', 'done', 'wontfix')),
  created_at timestamptz not null default now()
);

create index feedback_user_id_idx on public.feedback(user_id);
create index feedback_status_idx on public.feedback(status);
create index feedback_created_at_idx on public.feedback(created_at desc);

alter table public.feedback enable row level security;

-- Authenticated users (including anonymous sessions) can submit feedback
-- tied to their own user_id. This lets us still capture feedback from
-- first-time visitors before they convert to a permanent account.
drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own"
  on public.feedback
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Users can read their own submissions (shows in Profile page).
drop policy if exists "feedback_select_own" on public.feedback;
create policy "feedback_select_own"
  on public.feedback
  for select
  to authenticated
  using (auth.uid() = user_id);

-- No user-level update/delete. Triage happens in Studio via service role.

-- Cheap spam defense: max 10 submissions per user per rolling day.
-- Running this in a BEFORE INSERT trigger instead of an RPC keeps the
-- client path (insert .from('feedback')) simple.
create or replace function public.enforce_feedback_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
  from public.feedback
  where user_id = new.user_id
    and created_at > now() - interval '1 day';

  if recent_count >= 10 then
    raise exception 'rate_limit_exceeded: max 10 feedback submissions per day';
  end if;

  return new;
end;
$$;

drop trigger if exists feedback_rate_limit_trigger on public.feedback;
create trigger feedback_rate_limit_trigger
  before insert on public.feedback
  for each row execute function public.enforce_feedback_rate_limit();
