-- ==========================================================================
-- GDPR data export — `export_my_data()` RPC
-- ==========================================================================
--
-- Returns the full set of personal data Postr holds for the
-- currently-authenticated user, as a single JSON document. Satisfies
-- GDPR Art. 15 (Right of access) and Art. 20 (Right to data portability)
-- for the parts of Postr that can be machine-exported — anything in
-- `public.posters` and the user's auth profile metadata.
--
-- The RPC is `security definer` so it can read rows across tables
-- without requiring the caller to have explicit SELECT grants on each.
-- It filters every query by `auth.uid()` so a user can only ever
-- retrieve their own data.
--
-- Shape:
-- {
--   "export_version": 1,
--   "exported_at": "2026-04-11T12:34:56Z",
--   "user": { "id", "email", "created_at", "is_anonymous" },
--   "posters": [ { full poster row incl. data JSONB } ],
--   "gallery_entries": [ { published gallery entries for this user } ],
--   "feedback": [ { feedback rows filed by this user } ]
-- }
--
-- Called from the Profile page as a button labeled "Download my data".

create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user jsonb;
  v_posters jsonb;
  v_gallery jsonb;
  v_feedback jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated'
      using errcode = 'P0001';
  end if;

  -- Auth profile snapshot
  select jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'created_at', u.created_at,
    'is_anonymous', coalesce(u.is_anonymous, false),
    'last_sign_in_at', u.last_sign_in_at
  )
    into v_user
    from auth.users u
    where u.id = v_user_id;

  -- Posters owned by the user — full row including the data JSONB
  -- blob so users get a portable snapshot they can re-import later.
  select coalesce(jsonb_agg(to_jsonb(p.*)), '[]'::jsonb)
    into v_posters
    from public.posters p
    where p.user_id = v_user_id;

  -- Public gallery entries the user has published. May be empty.
  select coalesce(jsonb_agg(to_jsonb(g.*)), '[]'::jsonb)
    into v_gallery
    from public.gallery_entries g
    where g.user_id = v_user_id;

  -- Feedback the user has submitted. Avoids exposing moderation state.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', f.id,
        'created_at', f.created_at,
        'kind', f.kind,
        'message', f.message,
        'page', f.page
      )
    ),
    '[]'::jsonb
  )
    into v_feedback
    from public.feedback f
    where f.user_id = v_user_id;

  return jsonb_build_object(
    'export_version', 1,
    'exported_at', now(),
    'user', v_user,
    'posters', v_posters,
    'gallery_entries', v_gallery,
    'feedback', v_feedback
  );
end;
$$;

comment on function public.export_my_data() is
  'GDPR Art. 15 / 20 data export. Returns everything public.posters, public.gallery_entries, public.feedback, and auth.users hold for the calling user.';

grant execute on function public.export_my_data() to authenticated;
