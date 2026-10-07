# Quebec Law 25 — Resila's internal file for Postr

> **This is not legal advice.** It was drafted by an engineering assistant
> from the code, for the owner of Resila Technologies Inc. It maps what
> Quebec's *Act respecting the protection of personal information in the
> private sector* (CQLR c. P-39.1, as amended by Law 25) and PIPEDA ask of a
> business onto what Postr does today, with file references, so the owner
> can check it, sign what needs signing, and decide what to take to counsel.
> Section numbers are the Act's; their reading here has not been reviewed by
> a lawyer.

Written 2026-10-06 for record 24 (`docs/fixes/24-legal-canada-law25.md`),
from the owner's decisions of that day. Every "what the code does" statement
below was read from the tree at that date (paths from the repo root; `web/`
is `apps/web/src/`, `api/` is `apps/api/src/`). When the code changes, this
file, `web/pages/Privacy.tsx` and `web/pages/PrivacyFr.tsx` change together.

## 1. What is published, and where

The published policy is the Privacy Policy, English at `/privacy`
(`web/pages/Privacy.tsx`) and French at `/privacy/fr`
(`web/pages/PrivacyFr.tsx`), sentence for sentence. The Cookies Policy
(`/cookies`, `/cookies/fr`) lists browser storage. The Terms (`/terms`,
`/terms/fr`) hold the contract. `web/pages/__tests__/legalPagesContent.test.tsx`
fails if any element below disappears from either language.

| Law 25 asks | Section | Published at |
|---|---|---|
| Title and contact of the person in charge of the protection of personal information | s. 3.1 | Privacy §1 (callout): "Person in charge of the protection of personal information (Privacy Officer), Resila Technologies Inc.", support@resila.ai; FR « Responsable de la protection des renseignements personnels, Resila Technologies Inc. » |
| Governance policies and practices: roles and responsibilities over the information's life cycle, retention and destruction, complaint handling | s. 3.2 | Privacy §11 (roles, life cycle, complaints), §9 (retention and destruction) |
| Collection by technological means: what, why, by what means | s. 8, 8.2 | Privacy §2 (table: when, what, how, needed or not), §3 (purposes) |
| Rights of access and rectification; the right to withdraw consent | s. 8, 8.2 | Privacy §10 (table: right, meaning, how to use it in Postr today) |
| The third parties, or categories, the information is communicated to | s. 8, 8.2 | Privacy §4 (Vercel, Render, Supabase first; then Anthropic, Stripe, Google, Wikimedia Foundation) |
| That it may be communicated outside Quebec | s. 8, 8.2 | Privacy §5 ("United States or other countries") |
| Technology that identifies, locates or profiles, and how to turn it on | s. 8.1 | Privacy §7: none, apart from the approximate location Vercel derives from each page view for page counting (§6), which Global Privacy Control turns off (record 24 review round 2; whether that location is "locating" in the Act's sense, and so must be off by default, is for counsel: section 7) |
| Decisions based exclusively on automated processing | s. 12.1 | Privacy §7: the self-serve refund button is the one; a person reviews on request by email |
| Privacy by default | s. 9.1 | Privacy §8 (five defaults; then the two things that do not start at the most private choice: page counting, on by default and off under GPC, and the feedback form's attachment box) |
| Deletion, and de-indexation / ceasing dissemination | s. 28, 28.1 | Privacy §10 (rows "Deletion" and "De-indexation") |
| Portability in a structured, commonly used technological format | s. 27 | Privacy §10 (row "Portability": "Download my data" JSON, "Save as .postr", the rest by email) |
| Reply within 30 days | s. 32 | Privacy §10 intro, §11 complaints |
| Complaint to the Commission d'accès à l'information (CAI); in Canada, the OPC | s. 42 ff.; PIPEDA | Privacy §10 (row "Complaint"), §11 |
| Confidentiality incidents | s. 3.5–3.8 | Privacy §12 (the register and the notice rule) |

Outside Law 25, for the EU/UK section: GDPR art. 13(1)(f) (whether an
adequacy decision covers a transfer, or the safeguard and how to get a copy)
is Privacy §15: the European Commission (Decision 2002/2/EC) and the UK
recognise Canada as adequate for organizations subject to PIPEDA; for the
United States, adequacy covers only companies certified under the EU-U.S.
Data Privacy Framework (UK Extension for the UK); the page claims no
safeguard for any provider and offers to say which applies, with a copy, on
request (section 3.3). Art. 20(2) (sent directly to another organization) is
in §15 too; the Canadian portability row (§10) promises what s. 27 gives: to
the person, or to a person or body the law authorizes to collect it.
## 2. The person in charge (s. 3.1)

**Published:** the role only — "Person in charge of the protection of
personal information (Privacy Officer), Resila Technologies Inc." — reached
at support@resila.ai. No personal name and no "President" appear in any
legal page (owner, 2026-10-06: "the entity would be Resila, not me
personally"; the test "names no President" checks all six pages).

**Who holds it inside Resila.** Section 3.1 makes the person with the
highest authority within the enterprise the person in charge by default,
and lets that person delegate the function, in whole or in part, in
writing, to anyone. So today the function sits with whoever holds the
highest authority at Resila Technologies Inc., unless a written delegation
says otherwise.

**Owner to-do (one line, keep it in the minute book):** either nothing
(the default is fine), or a dated, signed delegation such as:

> "As the person with the highest authority within Resila Technologies Inc.,
> I delegate in writing, under s. 3.1 of the Act respecting the protection
> of personal information in the private sector, the function of person in
> charge of the protection of personal information to ____________, effective
> ____________. Signed ____________."

Whoever holds it must be able to read support@resila.ai and answer within
30 days (section 6 below).

## 3. Privacy impact assessment: communicating personal information outside Quebec (s. 17)

Section 17 asks for an assessment before personal information is
communicated outside Quebec, considering the sensitivity of the information,
the purposes, the protection measures (including contractual ones) and the
legal framework of the place it goes to; the communication may go ahead if
the information will receive adequate protection, and it must be governed by
a written agreement that takes the assessment into account. This is the
assessment filled from the code. **The owner reviews it, decides, and dates
and signs the conclusion at the end.** Regions, signed data-processing
agreements and standard contractual clauses were not checked (owner,
2026-10-06: dropped), so the "where" column says "United States or other
countries" and the agreements are each provider's own online terms.

### 3.1 The providers, as the code reaches them

The legal-entity names below are as each provider commonly publishes them; they were not checked against the terms Resila accepted (owner to-do, section 3.3). The published policy names the providers without them.

| Provider | Role | What it receives (from the code) | When | Where | Protections in the code |
|---|---|---|---|---|---|
| **Vercel Inc.** | Hosts the website; Web Analytics | Every page request: IP address, user agent, page address (path, which for an editor page is `/p/<poster id>`). Page counting: `o` (address with ids replaced and query dropped), `sv`, `sdkn`, `sdkv`, `ts`, and `r` (the referring site) only on the first page view and only from another host (MEASURED on www.postr.sh, record 24 §4). What Vercel may store with each page view, per its documentation (vercel.com/docs/analytics/privacy-policy, "Data point information", read 2026-10-06; INSPECTED, not measured for postr.sh): a geolocation (country, region, city; the page does not say how it is obtained, presumably from the IP address), the device OS and version, the browser and version, the device type; visitors are told apart by a hash of the request discarded after 24 hours, and data points are "not tied to … any individual … or IP address" (Privacy §6 says so). The Referer of the counting request is the origin only (`apps/web/vercel.json` Referrer-Policy `strict-origin`). An edge function `apps/web/api/shell/share.ts` exists but `/s/:slug` is rewritten to `/` while sharing is off, so no user reaches it. | Every visit; counting unless the browser sends GPC | United States or other countries | `web/App.tsx:39-41` (not mounted under GPC, `web/analytics/globalPrivacyControl.ts`); `web/analytics/redactUrl.ts` (ids and query removed); `apps/web/vercel.json` (Referrer-Policy) |
| **Render Services, Inc.** | Runs the API (`apps/api`) | Each API request: IP address, user agent, bearer token (→ account id), body. Bodies: pasted author lists (≤ 4,096 chars) and reference lists (≤ 32,768 chars) (`api/import.ts:50,57`); signed URLs of images in Supabase Storage, whose bytes the API fetches and forwards to Anthropic (`api/import.ts` `/api/import/extract`); checkout, refund and export-marking calls (`api/billing.ts`); account deletion (`api/account.ts`); UI error reports (`api/diagnostics.ts`: error name, message ≤ 300 chars, where, poster id, app version). Logs (stdout, kept by Render): one line per request with method, path, status, duration, account id (`api/requestLog.ts:75-87`); diagnostics lines with account id and poster id (`api/diagnostics.ts:314`); for an image/PDF import without a text layer, up to 200 characters of the extracted text (`api/import.ts:582-585`) | Each use of import, paste, billing, deletion; error reports from the editor | United States or other countries | Auth on every route (`api/auth.ts`), rate limits (`api/rateLimit.ts`), SSRF guard to the project's storage host (`api/imageUrlGuard.ts`), logger keeps explicit fields only, strings ≤ 300 chars (`api/logger.ts`) |
| **Supabase, Inc.** | Database, sign-in, file storage; sends the account emails | Everything stored with the account: `auth.users` (email, password hash, Google profile metadata for Google sign-in, sign-in times); tables `users` (plan, credits, Stripe ids, `research_consent_at`, `marketing_consent_at`, `first_paid_export_at`), `posters`, `poster_versions`, `user_logos`, `feedback` (title; body, which keeps an attached file's storage path `storage://<uid>/feedback/…` and an opted-in console log; page URL; user agent), `billing_fulfilled_sessions`, `billing_refunds`, `account_deletions`, and dormant tables of hidden features (`gallery_entries`, `poster_comments`, `talk_waitlist`, `poster_reviews`); buckets `poster-assets/{uid}/…` (figures, thumbnails, temporary import images, feedback attachments), `user-logos/{uid}/…`, `gallery/{uid}/…` (`supabase/migrations/*`, `api/storageCleanup.ts`). Emails: sign-up confirmation, recovery link, email change (`web/pages/Auth.tsx:302,359`; `web/profile/GuestConversionCard.tsx`) | Every editor and account use | United States or other countries | Row-level security enabled on all 18 tables (MEASURED: 18 of 18 migrations' tables run `enable row level security`); the service key only on the API (`api/supabaseAdmin.ts`); the browser holds the publishable key (`web/lib/supabase.ts:20`) |
| **Anthropic, PBC** | Language model (Claude) | Through the API only: page or region images of an imported PDF/image, an image of a poster for Copy a design, a selected image block for "Scan image", pasted author or reference text (`api/import.ts` model calls at `:914,975,1016,1058,1099,1152,1208`; `api/extractStyle.ts:220`). Never the R/Python code of the plot checker (runs in the browser) | Only when the user starts one of the four features | United States or other countries | The image is re-fetched by the API from private storage (the model never gets a storage URL); temporary import images deleted when the step ends (`web/import/imageImport.ts`, `web/import/styleImport.ts:213`); rate limits per user (`api/import.ts`) |
| **Stripe, Inc.** (and affiliates; payments go through its merchant-of-record service, Managed Payments; which entity is the seller was not checked: the code's comments say Stripe in some places and Link in others, PLAN.md Later) | Payments, subscriptions, tax | From the API at checkout: `client_reference_id` and `metadata.user_id` (account id), and the email (`customer_email`) when no Stripe customer exists yet (`api/billing.ts:324-347`); refunds and cancellations by id; at account deletion, cancellation of live subscriptions and deletion of the customer (`api/account.ts`). Card and billing details: entered on Stripe's own pages | Only when buying, refunding, cancelling or deleting an account with billing | United States or other countries | No card data touches Postr; webhook signature verified (`api/billing.ts` `/billing/webhook`) |
| **Google LLC** | Google sign-in (via Supabase), Google Fonts, favicon service | Sign-in: what the user agrees to share on Google's pages (Supabase receives it). Fonts: IP address and user agent when the editor loads a font family (`web/poster/fontLoader.ts:29`, `web/poster/PosterEditor.tsx` preconnect; Copy a design's preview, `web/components/CopyDesignModal.tsx`); the request's Referer is the origin only. Favicons: IP and user agent when the logo picker shows preset icons (`web/poster/logoPresets.ts:182`) | Sign-in by choice; fonts on every editor open; icons when the logo picker opens | United States or other countries | Public pages load no Google font (MEASURED on www.postr.sh: 0 Google links on /, /pricing, /about) |
| **Wikimedia Foundation** | University logos | IP address and user agent when a logo preset is picked (`web/poster/logoPresets.ts:197,225,266`) | Only when a preset is picked | United States or other countries | — |
| *OpenAI* (not a recipient today) | Language model for the hidden manuscript features | Nothing: `createNarrativeRouter` is mounted only when `FEATURE_MANUSCRIPT` is on (`api/app.ts`, `api/features.ts`), and the UI is gone (`web/routes.tsx`) | — | — | If the flag is ever turned on, add OpenAI to Privacy §4 and to this table first |
| *GitHub Actions* (not a recipient of personal data) | Runs the weekly guest clean-up | Sends the cron secret; receives counts only (`scanned`, `staleGuests`, `deleted`, `failed`) (`api/cron.ts`, `.github/workflows/cron-cleanup-guests.yml`) | Sundays 03:00 UTC | — | — |

Also reached, by the user's own action and with nothing sent until they act:
the Staples print helper opens a mail draft in Gmail, Outlook.com or Yahoo
Mail (`web/components/StaplesPrintModal.tsx:71-73`); "Manage subscription"
opens Stripe's portal or link.com (`web/data/billing.ts:139`).

### 3.2 Sensitivity, purposes, proportionality

- **Sensitivity.** Postr does not ask for sensitive information. Posters
  are research content the user writes; they can contain names of
  co-authors and institutions, and whatever a user types. Account data is an
  email address, optional consents, billing state. The profile details
  (name, institution, ORCID, website) never leave the browser
  (`web/profile/ProfileFields.tsx`, localStorage `postr.profile`).
- **Purposes.** Hosting and running the service (Vercel, Render, Supabase),
  the four language-model features the user starts (Anthropic), payment
  (Stripe), fonts and logos (Google, Wikimedia), page counting (Vercel, not
  under GPC). Each matches a purpose published in Privacy §3.
- **Proportionality.** Identifiers are removed from analytics addresses and
  Referers; the console log in feedback is opt-in; no analytics under GPC;
  the plot checker runs in the browser; temporary import images are deleted.
  Page counting is on by default, and Vercel may record an approximate
  location (to the city) with each page view; Postr uses it only for page
  totals (Privacy §7). Making counting opt-in would remove that location for
  everyone who does not agree (section 7).

### 3.3 Legal framework of the destination

United States: no general federal privacy law equivalent to Law 25;
providers are subject to US law, and US authorities can compel access to
data they hold (for example under the CLOUD Act or FISA s. 702). Several of
these providers publish their own data-processing terms and transfer
safeguards; whether Resila has accepted or signed them was not checked
(owner, 2026-10-06: dropped). **Owner to-do:** confirm each provider's
online terms (data processing addendum or equivalent) are accepted for the
account Postr runs on, and keep a copy or the date. For EU and UK users,
Privacy §15 promises to say, on request, whether an adequacy decision or
another safeguard covers a provider and to send a copy: to answer, check
each provider on the Data Privacy Framework list (dataprivacyframework.gov)
and keep its data-processing addendum (which usually carries the standard
contractual clauses). Which providers are certified was not checked.

### 3.4 Conclusion (owner to complete)

> Having considered the above, Resila Technologies Inc. concludes that the
> information communicated to these providers ☐ will / ☐ will not receive
> adequate protection, in particular given ____________________________.
> Measures taken or to take: ____________________________.
> Date: __________  Person in charge: __________ (signature)

Redo this assessment before adding a provider or a new kind of data (the
policy's governance paragraph, Privacy §11, promises that check).

## 4. Confidentiality incidents (s. 3.5–3.8; PIPEDA s. 10.1)

**What counts:** access, use or communication of personal information not
authorized by law, its loss, or any other breach of its protection.

**Rule.** On learning of one: take reasonable measures to reduce the risk of
injury and prevent new incidents; record it in the register; if it presents
a **risk of serious injury** (consider the sensitivity, the anticipated
consequences of its use, the likelihood of misuse), notify the CAI promptly
(its prescribed form) and the people affected, and any person or body that
could reduce the risk. Under PIPEDA, report a breach of security safeguards
with a real risk of significant harm to the OPC and notify the individuals,
and keep a record of every breach for 24 months.

**Register (keep it, even empty; one row per incident, kept at least five
years after the date or period the organization became aware of it under
the regulation, and 24 months minimum under PIPEDA).**

| # | Date or period of the incident | Date Resila learned of it | Description of the information involved (or why it cannot be described) | Circumstances | Number of people affected (or estimate) | Risk-of-serious-injury assessment (criteria, conclusion) | Notice to the CAI (date) | Notice to the people (date, how) | Notice to the OPC (date) | Measures taken |
|---|---|---|---|---|---|---|---|---|---|---|
| — | | | | | | | | | | |

Where incidents would surface in Postr: Supabase (auth or storage access
logs, row-level security), Render logs (`api/requestLog.ts`), Stripe
(webhooks, disputes), a report to support@resila.ai.

## 5. Retention and destruction, as the code does it

| Information | What the code does | File |
|---|---|---|
| Posters and saved versions | Deleted when the poster or the account is deleted (versions cascade) | `web/data/posters.ts:460`; `supabase/migrations/20260702000000_poster_versions.sql` |
| Images uploaded to a poster, preview images | Not deleted with the poster; deleted with the account | `api/storageCleanup.ts` (called by `api/account.ts`) |
| Logo library | Deleted with the logo or the account | `web/data/userLogos.ts:169`; `api/storageCleanup.ts` |
| Temporary import / Copy a design images | Deleted by the app when the step ends; a failed delete leaves them until account deletion | `web/import/imageImport.ts:365…596`; `web/import/styleImport.ts:213` |
| Guest accounts | Weekly job (Sundays 03:00 UTC) deletes anonymous accounts 14 days after the last sign-in (so 14–21 days); it does not delete their files (948 of 961 poster files belonged to deleted users at the claims audit: the audit agent's figure, UNVERIFIED here; queued) | `api/cron.ts`; `.github/workflows/cron-cleanup-guests.yml` |
| Feedback | Kept; `user_id` set null when the account is deleted; an attachment is deleted with the account (it is under `poster-assets/{uid}/feedback/`), but the report's text keeps its storage path, `storage://<uid>/feedback/…`, so the account id stays in a report that had a file (MEASURED from the feedback form, `web/pages/__tests__/privacyFeedbackRetention.test.tsx`; record 24 review round 1); Privacy §9 says so | `supabase/migrations/20260410020000_feedback.sql:7`; `web/data/feedback.ts:119,161` |
| Account-deletion record | Account id, deletion time, Stripe customer id, cancelled subscription ids, number of files removed; no end date | `supabase/migrations/20260911000000_account_delete_hardening.sql:41-50` |
| API logs | Render's retention; no shorter period set | `api/logger.ts` (stdout) |
| Browser entries | As the Cookies Policy lists; account deletion clears every Postr entry (keys `postr.…` and `postr-…`, in localStorage and sessionStorage) in the browser that deletes, except another account's welcome-poster marker (record 24 and its review round 1; `web/pages/__tests__/Profile.dangerZone.test.tsx` seeds every key in the inventory) | `web/profile/accountDeletion.ts` |

Destruction is deletion from the database and storage; the providers'
backups and logs expire on their own schedules. Queued (PLAN.md, "Queued by
the claims audit"): clean-up jobs for feedback, audit rows and orphan
files, which would let the policy state periods.

## 6. Requests: the 30-day procedure (s. 30–35 for access and rectification; s. 27, 28, 28.1; s. 32)

1. **Receive.** At support@resila.ai. Note the date received: the 30 days
   run from it.
2. **Identify.** The request comes from the account's email address, or, for
   a guest (no email), quotes the account id from "Download my data". If in
   doubt, ask for something only the person has (the email address can
   receive a confirmation; a guest can sign in and run "Download my data"
   again). Do not send information to an address not on the account.
3. **Find the data.** Supabase: `auth.users`, `public.users`, `posters`,
   `poster_versions`, `user_logos`, `feedback` (by `user_id`), the
   `billing_*` tables, storage under `{uid}/` in the three buckets; Stripe by
   customer id; Render logs by account id (as retained). The browser-only
   data (profile details, presets, scripts) is not on our servers.
4. **Answer in writing within 30 days.**
   - Access / portability: send the JSON of the rows and a list or archive
     of the files, in a structured, commonly used format (JSON, the original
     image files); "Download my data" covers account, posters, feedback.
   - Rectification: correct the row (an email change goes through Supabase
     Auth's email-change flow).
   - Deletion: the user can delete the account themselves (Profile → Danger
     Zone); on request, run the same `POST /account/delete` path, or delete
     the specific rows/files.
   - De-indexation / stop dissemination: nothing is published today; for a
     former gallery entry, retract it (Profile) or delete the row and files.
   - Withdrawal of consent: clear `research_consent_at` /
     `marketing_consent_at`.
   - Automated decision (the refund button): explain the rule (Terms §7.2)
     and the records it read (`first_paid_export_at`, the invoice date, the
     credit counts), and review by hand.
5. **Refusal** must be in writing, give the reasons and the provision relied
   on, and tell the person they can apply to the CAI within 30 days of the
   refusal. Silence after 30 days counts as a refusal.
6. **Fees:** the policy says using the rights is free.
7. **Complaints** follow the same intake, an acknowledgement, and a written
   answer within 30 days; then the CAI or the OPC.

## 7. Owner to-dos

- [ ] Decide who holds the person-in-charge function (s. 3.1): the default,
      or the one-line written delegation in section 2.
- [ ] Make sure the holder reads support@resila.ai (the published address)
      and can answer within 30 days.
- [ ] Review and sign the assessment's conclusion (section 3.4); confirm each
      provider's online data-processing terms are accepted (section 3.3).
- [ ] Keep the incident register (section 4), even empty.
- [ ] Decide the queued retention clean-ups (feedback, audit rows, orphan
      files of deleted guests) and the extended "Download my data" (PLAN.md).
- [ ] Decide whether the feedback form's "Attach {file}" box should also
      start unticked (s. 9.1 reading; it is ticked because the report is about
      that file; record 24 §10).
- [ ] Decide the refund button (s. 12.1): Privacy §7 calls it the one
      decision made only by automated processing, with review by a person on
      request; its refusal messages (Profile, stream B) do not yet say the
      answer was automatic or offer that review. Either add that line to the
      messages, or decide it is not such a decision and drop it from Privacy
      §7 and §10 (record 24 §9, A-R1-05; PLAN.md Later).
- [ ] Check which entity is the merchant of record on a buyer's receipt
      (Stripe or Link); the pages name only Stripe's merchant-of-record
      service (record 24 §9, A-R1-07).
- [ ] Add the Terms line (English and French) where accounts are also
      created: the editor's "Create account" and Profile's guest conversion
      (record 24 §9, A-R1-08).
- [ ] Decide whether page counting stays on by default (Privacy §6–§8 now
      say it is, and that Vercel may record an approximate location, device
      type, operating system and browser, per Vercel's documentation; record
      24 review round 2), or becomes opt-in (a choice before Vercel Web
      Analytics loads). Counsel's reading of s. 8.1 and s. 9.1 decides
      whether opt-in is required.
- [ ] Be ready to answer an EU or UK request about transfer safeguards
      (Privacy §15; section 3.3).
- [ ] Have counsel review: the Terms' amendment clause for Quebec consumers
      (Consumer Protection Act s. 11.2), the legal bases chosen for the
      GDPR section, the 16+ age rule, the sign-up line and Terms §1 (the user
      agrees to the Terms; the Privacy Policy is presented as information,
      not agreed to, since record 24's review round 1), and this file. Since
      review round 2: the bold Consumer Protection Act s. 19.1 statement now
      before Terms §5.5, §10, §11 and §13's "continued use" sentence (its
      wording, "to the extent", and whether §4's suspension "at our sole
      discretion" and §9's "change or discontinue at any time" need it too);
      whether Vercel's approximate location is "locating" under s. 8.1; and
      the Canadian adequacy sentence in Privacy §15.
- [ ] If `FEATURE_MANUSCRIPT` or `FEATURE_REVIEW` is ever turned on, add
      OpenAI (manuscript) and the review data flows to Privacy §4 and to
      section 3 first.
