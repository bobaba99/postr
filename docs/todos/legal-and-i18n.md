# TODO — legal review & French localization

Raised 2026-07-28. Postr is operated by **Resila Technologies Inc.** (Quebec),
which brings Quebec's *Charter of the French Language* obligations plus general
consumer-law review needs now that paid products are live.

## 1. Legal counsel review (HIGH — before relying on the docs)

The Terms of Service, Privacy Policy, and Cookies Policy were drafted in-house
and are **not yet reviewed by a lawyer**. The draft "pending legal review"
banner has been **removed** from the pages (2026-07-28, at the founder's
request), so nothing on the live site flags this anymore — track it here
instead.

Get qualified counsel to review, with particular attention to:

- **Refund / consumer-law language** (Terms §7.2) — the 14-day term guarantee,
  "no refund once exported", the pack unused-credit refund, and the EU/UK
  right-of-withdrawal waiver captured at checkout. These are the newest and
  highest-risk clauses.
- **Recurring-subscription disclosure** — auto-renewal terms (CA$18.99 every 4
  months), cancellation method, and renewal notices, against California ARL /
  FTC negative-option direction and Quebec/Ontario distance-contract rules.
- **Merchant-of-record framing** — the docs say the payment provider (Stripe
  Managed Payments / Link) is the merchant of record; confirm that's accurately
  stated for tax/refund/dispute responsibility.
- **Quebec CPA distance-contract disclosure** and whether the <CA$50 price
  points change any obligations.

## 2. French legal docs (DONE 2026-07-28 — verify)

French mirror pages for **Terms, Privacy, and Cookies** were translated into
Quebec French with an EN/FR toggle (workflow wboi5fsww). This satisfies the
Charter requirement for the legal documents. **Still to do:** have the French
translations proofread by a francophone / counsel — machine translation of a
legal document is a strong starting point, not a certified translation.

## 3. Spanish legal docs (MEDIUM — future, raised 2026-07-28)

Add **Spanish** versions of Terms, Privacy, and Cookies (same mirror-page +
language-toggle pattern as the French ones: `/terms/es`, `/privacy/es`,
`/cookies/es`, and add "Español" to the EN/FR toggle group). Not a Charter
obligation like French — this is market reach (Spanish-speaking researchers).
Lower legal severity than the French docs, which were the Quebec compliance
requirement. When done, the language toggle on all six existing pages should
grow to EN / FR / ES. Same caveat: have a native/legal Spanish speaker
proofread — machine translation is a starting point, not certified.

## 4. Translate the UI editor to French (MEDIUM — future)

Localize the **product UI itself** (the poster editor and app chrome) into
French — not just the legal docs. This is a larger effort:

- No i18n framework exists yet (verified 2026-07-28 — the app has no
  react-intl / i18next / locale system). Introducing one is the first step.
- Scope: editor toolbars, panels, buttons, tooltips, onboarding, error/toast
  messages, the marketing pages, emails.
- The Charter's strongest requirement is on the *legal/consumer-facing* text
  (done above); full UI localization is good practice and expands the Quebec/
  francophone market but is not the same legal severity — hence lower priority
  than the docs.
- When tackled: pick an i18n approach (keys + fr/en message catalogs), extract
  strings, wire a language switcher that also covers the legal pages' toggle.

## Reference
- Refund policy decisions: `~/.claude/.../memory/project_refund_policy.md`
- Consent (also Quebec/CASL-relevant): `project_signup_consent.md`
