-- Postr · marketing_consent_at — opt-in consent to product-update / marketing email
--
-- Mirrors research_consent_at (20260728000000_research_consent.sql): a
-- dedicated consent column (not a JSONB flag) so consent carries an audit
-- timestamp and is directly queryable. null = no consent (no DB default,
-- so a fresh account is opted OUT at the column level).
--
-- Legal basis: CONSENT (GDPR Art. 6(1)(a)) — opt-in, withdrawable. For
-- Canadian recipients CASL requires EXPRESS consent (opt-in, sender bears
-- the burden of proof), which is why the signup checkbox is UNCHECKED by
-- default everywhere — a set timestamp is a positive, affirmative opt-in.
--
-- This is user-owned state: the existing users_update_own policy already
-- lets the owner set and clear it (unlike `plan`, which is webhook-only).
-- No guard trigger is needed.

alter table public.users
  add column if not exists marketing_consent_at timestamptz;

comment on column public.users.marketing_consent_at is
  'When the user opted in to product-update / marketing email. null = no consent. '
  'Legal basis: consent (GDPR Art. 6(1)(a)); CASL express consent for CA recipients; '
  'withdrawable by setting to null.';
