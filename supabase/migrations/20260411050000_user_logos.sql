-- ==========================================================================
-- User logos — personal logo library saved to the user's account
-- ==========================================================================
--
-- When a user uploads a logo via the LogoPicker's Upload tab, we
-- persist it so they can reuse the same logo across posters without
-- re-uploading the file each time. This migration provisions both
-- the metadata table (`public.user_logos`) and the private storage
-- bucket (`user-logos`) the picker reads from.
--
-- Shape:
--   public.user_logos
--     id           uuid primary key
--     user_id      uuid references auth.users(id) on delete cascade
--     name         text — user-chosen label (e.g. "MIT Biology lab")
--     storage_path text — path inside the 'user-logos' bucket
--     created_at   timestamptz default now()
--
-- RLS: each user can only see / modify their own rows. Same pattern
-- as public.posters.
--
-- Storage bucket: `user-logos`, private. A storage-level RLS policy
-- ensures users can only read and write files under their own
-- `{user_id}/...` prefix. Public access is disallowed; logos are
-- served to the frontend via signed URLs generated at fetch time.
--
-- Per-user cap: 25 logos, mirroring the posters limit. This sits
-- well above legitimate usage (most researchers will have 1–3 lab
-- or institution logos) while capping abuse.

create table if not exists public.user_logos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists user_logos_user_id_idx
  on public.user_logos (user_id, created_at desc);

alter table public.user_logos enable row level security;

drop policy if exists "Users can read own logos" on public.user_logos;
create policy "Users can read own logos"
  on public.user_logos for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own logos" on public.user_logos;
create policy "Users can insert own logos"
  on public.user_logos for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own logos" on public.user_logos;
create policy "Users can update own logos"
  on public.user_logos for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own logos" on public.user_logos;
create policy "Users can delete own logos"
  on public.user_logos for delete
  using (auth.uid() = user_id);

-- Per-user cap trigger — 25 logos max per user.
create or replace function public.check_user_logo_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from public.user_logos
    where user_id = new.user_id;
  if v_count >= 25 then
    raise exception
      'Logo library limit reached (25). Delete old logos before uploading more.'
      using errcode = 'P0001',
            hint = 'Visit your profile or the logo picker to remove unused logos.';
  end if;
  return new;
end;
$$;

drop trigger if exists user_logos_rate_limit on public.user_logos;
create trigger user_logos_rate_limit
  before insert on public.user_logos
  for each row
  execute function public.check_user_logo_limit();

-- Storage bucket — private, user-scoped access via RLS.
insert into storage.buckets (id, name, public)
  values ('user-logos', 'user-logos', false)
  on conflict (id) do nothing;

-- Storage RLS: users can only read and write files under their own
-- `{user_id}/...` prefix. The first path segment is the user id,
-- enforced by the insert policy and checked by the select policy.
drop policy if exists "Users can read own logo files" on storage.objects;
create policy "Users can read own logo files"
  on storage.objects for select
  using (
    bucket_id = 'user-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can upload own logo files" on storage.objects;
create policy "Users can upload own logo files"
  on storage.objects for insert
  with check (
    bucket_id = 'user-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete own logo files" on storage.objects;
create policy "Users can delete own logo files"
  on storage.objects for delete
  using (
    bucket_id = 'user-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

comment on table public.user_logos is
  'Personal logo library — users upload institution/lab logos once and reuse across posters.';
