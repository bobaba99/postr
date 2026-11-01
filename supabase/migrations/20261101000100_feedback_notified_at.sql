-- ==========================================================================
-- Feedback: remember which rows the owner has been emailed about
-- ==========================================================================
--
-- The feedback digest (POST /cron/feedback-digest, apps/api/src/
-- feedbackDigest.ts, run daily by .github/workflows/cron-feedback-digest.yml)
-- emails the owner every row whose `notified_at` is null, then stamps those
-- rows. A failed send stamps nothing, so the next run retries them.
--
-- Only the service role writes this column: there is still no user-level
-- update policy on public.feedback. Users can read it on their own rows
-- (feedback_select_own selects every column); it tells them nothing beyond
-- "the owner was told".
--
-- Rows filed before this migration start as null, so the first digest
-- includes them.

alter table public.feedback
  add column if not exists notified_at timestamptz;

comment on column public.feedback.notified_at is
  'When the owner was emailed about this row by the feedback digest cron. Null = not yet.';

-- The digest reads only the un-notified rows, oldest first.
create index if not exists feedback_unnotified_idx
  on public.feedback (created_at)
  where notified_at is null;
