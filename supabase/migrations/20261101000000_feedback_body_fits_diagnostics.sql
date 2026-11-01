-- ==========================================================================
-- Feedback: let a report keep its console log (body limit 4000 → 70000)
-- ==========================================================================
--
-- 20260410020000_feedback.sql capped `body` at 4000 characters, the size of
-- the Details box. But the client (apps/web/src/data/feedback.ts) writes the
-- diagnostics into the same column, after the user's text: the attachment's
-- storage path and, when the user ticks "Include console log", up to the
-- last 60,000 characters of the console. So a bug report sent with its log
-- was refused by this check (23514) and never stored. The user saw "Could
-- not send feedback: new row … violates check constraint
-- feedback_body_check".
--
-- 70000 = 4000 (the user's text) + the attachment section + 60000 (the log)
-- + section headers, with room to spare. The client cuts the body at the
-- same number (FEEDBACK_STORED_BODY_MAX); a web test reads this file and
-- fails if the two drift.
--
-- Spam is still bounded by the 10-a-day trigger (enforce_feedback_rate_limit),
-- so the worst case is 700 KB a day per account.

alter table public.feedback
  drop constraint if exists feedback_body_check;

alter table public.feedback
  add constraint feedback_body_check
  check (char_length(body) between 1 and 70000);
