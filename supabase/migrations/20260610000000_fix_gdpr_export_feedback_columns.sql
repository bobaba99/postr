-- ==========================================================================
-- Fix `export_my_data()` — feedback columns never existed
-- ==========================================================================
--
-- 20260411040000_gdpr_export.sql built the feedback section of the export
-- from `f.message` and `f.page`, but `public.feedback`
-- (20260410020000_feedback.sql) has no such columns — its real columns are
-- kind / title / body / page_url (+ user_agent, status, created_at).
-- PL/pgSQL bodies are only syntax-checked at CREATE time, so the broken
-- function applied cleanly and "Download my data" failed at runtime with
-- `column f.message does not exist` for any user who had ever submitted
-- feedback — a GDPR Art. 15 / 20 failure.
--
-- This re-creates the function with the real column names. `status` stays
-- excluded (moderation state). Everything else — security definer, pinned
-- search_path, auth.uid() filtering, export shape — is unchanged.

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
        'title', f.title,
        'body', f.body,
        'page_url', f.page_url
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

-- `create or replace` keeps the function OID, so the existing grant
-- survives — restated here so this migration stands on its own.
grant execute on function public.export_my_data() to authenticated;
