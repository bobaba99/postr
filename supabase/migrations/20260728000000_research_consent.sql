-- Postr · research_consent_at — opt-in consent to product-research email
--
-- Adds a dedicated consent column (not a JSONB flag) so consent has an
-- audit timestamp and is directly queryable — the same pattern as
-- cookie_consent_at (20260408000000_users.sql:17). null = no consent.
--
-- The legal basis for emailing users about product research / interviews
-- is CONSENT (GDPR Art. 6(1)(a)), opt-in and withdrawable — see the
-- Privacy policy's processing table. This column is what makes that
-- clause truthful: outreach queries select only rows where it is set.
--
-- Unlike `plan` (webhook-only), this is user-owned state: the existing
-- users_update_own policy already lets the owner set it, which is
-- correct — the user is the one giving and withdrawing consent.

alter table public.users
  add column if not exists research_consent_at timestamptz;

comment on column public.users.research_consent_at is
  'When the user opted in to product-research email. null = no consent. '
  'Legal basis: consent (GDPR Art. 6(1)(a)); withdrawable by setting to null.';
