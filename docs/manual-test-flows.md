# Postr — Manual Admin Testing Flow Map

Walk-through checklist for the **admin surfaces** (payment, sign-up, delete account, download data). Editor is already tested — not covered here. Priority order leads with the **nested payment + sign-up** journeys.

> **Route legend:** `/auth`, `/pricing`, `/p/:posterId` (editor), `/profile`, `/billing/success`, `/billing/cancel` — and, since fix 26, their French twins `/auth/fr`, `/pricing/fr`, `/billing/success/fr`, `/billing/cancel/fr` (the editor and `/profile` are English only).
> **All copy in quotes is verbatim from the code** — if what you see on screen differs, that's a finding.

> **Deactivated features (2026-09-10) — scenarios touching them are DORMANT, do not hunt for them.** The manuscript pipelines (`/paper-to-poster`, `/paper-to-slides` + aliases), the Presentation Checker (`/presentation-checker`, the editor **review** tab), the paper-to-talk waitlist callout on `/pricing` and the standalone plot picker page (`/chart-chooser` + alias `/plot-picker`) are switched off, not deleted (`apps/web/src/routes.tsx` header). What to expect instead:
> - `/paper-to-poster`, `/paper-to-slides`, `/presentation-checker`, `/manuscript-to-poster`, `/paper-to-present`, `/paper-to-presentation`, `/chart-chooser`, `/plot-picker` → all land on the landing page (`/`); no header/footer/landing/dashboard link to any of them; `X-Robots-Tag: noindex` on the four canonical paths; none in `/sitemap-static.xml`.
> - **No standalone tools anywhere in the nav.** Header (flat row and the phone menu) = Editor / My posters · Pricing · Why posters · About; footer Product column = Home · Pricing; the landing page has no "Tools you can use on their own" section. The chart ladder is still live **inside the editor** (Figure tab → Make mode → "Insert selected figures") — test it there, not at a URL.
> - `/auth?plan=review_pack` and `/auth?plan=review_addon` → the plain auth page (no paid-intent banner). The **review-SKU checkout scenarios are dormant**: `POST /billing/create-checkout {sku:'review_pack'|'review_addon'}` returns `400 invalid_sku` while `FEATURE_REVIEW` is unset, regardless of the Stripe price env.
> - Editor sidebar rail: layout · style · authors · insert · edit block · references · figure · issues · versions · export — **no "review" tab, and no "comments" tab since 2026-09-30** (below). Dashboard: no "Import manuscript" link under "+ New poster". `/pricing`: no "Paper-to-talk is next" / "Join the waitlist" card.
> - **Sharing and comments, deactivated 2026-09-30** (fix 23; `SHARING_ENABLED` in `apps/web/src/config/features.ts`): `/s/<slug>` lands on `/`; the editor offers no way into comments — no comments tab, and no "Comment on selection" (💬) in the text toolbar when you select text — so no "Copy share link" and no comment mode. The editor opens only your own posters: `/p/<another user's poster id>` shows "Poster not found", and signing out or in to another account (here or in another tab) while a poster is open closes it: a guest's poster says the guest session has ended, an account's says "This poster is in another account"; both offer "Download a copy" and My posters, and Sign in only for an account's poster while a guest or no one is signed in.
> - **The workspace rulers, hidden 2026-09-30** (`RULERS_ENABLED` in `apps/web/src/config/features.ts`): no ruler bars along the canvas's top and left edges, and no "Show ruler" checkbox in the Layout tab ("Show grid" stays).
> - **The LaTeX export, hidden 2026-10-06** (fix 25; `LATEX_EXPORT_ENABLED` in `apps/web/src/config/features.ts`): the Export tab's "✎ Editable formats" has the PowerPoint button only, for every plan (guest, free, pack, term); no page outside the legal pages names LaTeX or Overleaf (landing, About, /pricing, the paywall, /auth, /billing/success, the profile, the crawler copy). Scenarios below that click "⌨ LaTeX source (.zip)" are dormant. The writer is kept; before it returns: `docs/stress-test/PLAN.md`, "LaTeX export: before it is switched back on".
> - **Every price shown says tax is extra (2026-10-06, fix 25):** Stripe prices are before tax. /pricing prints "+ applicable taxes" under CA$18.99 and CA$9.99; the paywall reads "the term at CA$18.99 + applicable taxes … a 3-export pack at CA$9.99 + applicable taxes"; `/auth?plan=` labels read "Term · CA$18.99 every 4 months + applicable taxes" (the period before the tax note: "+ applicable taxes / 4 months" read as taxes per 4 months; review round 1, B-R1-03) and "Export pack · CA$9.99 + applicable taxes"; the profile's free plan reads "From an export pack, CA$9.99 + applicable taxes."; the account-deletion line names no price. Stripe Checkout itself shows the tax it adds (not in our code).
> - **The public pages in French (2026-10-06, fix 26; `docs/fixes/26-french-public-pages.md`):** every public page has a French twin at its path + `/fr` — `/fr`, `/about/fr`, `/why-posters/fr`, `/pricing/fr`, `/tools/figure-readability/fr`, `/auth/fr` (query kept: `/auth/fr?plan=term`), `/billing/success/fr`, `/billing/cancel/fr`, and the legal pages' existing `/privacy/fr`, `/cookies/fr`, `/terms/fr`; an unknown address ending in `/fr` gets the French 404. What to check by hand: the header's flat row (1440 px) and the phone menu end with « Français » on an English page and "English" on a French one; the footer shows it beside the copyright line (`/auth` in its legal footer, the billing pages and the 404 under their links); clicking it keeps you on the same page and keeps `?plan=`; nothing switches language by itself (no browser-language redirect); a French page's links lead to French pages, except the editor (`/p/new`), My posters and Profile, which are English. `/pricing/fr` prints « 18,99 $ CA » « tous les 4 mois » with « + taxes applicables » under it and « 9,99 $ CA » « achat unique · 3 exportations » « + taxes applicables »; `/auth/fr?plan=term` reads « Forfait à terme · 18,99 $ CA tous les 4 mois + taxes applicables ». A purchase from `/auth/fr?plan=…` asks the API for a French Checkout (`lang: 'fr'` → Stripe `locale: 'fr-CA'`) and returns to `/billing/success/fr` or `/billing/cancel/fr`; a French e-mail sign-up's confirmation link comes back to `/auth/fr` (with `?plan=` when one is being bought), and a French Google sign-in comes back to `/auth/fr?plan=…` when a plan is being bought, to `/dashboard` otherwise (owner: allow `/auth/fr` in Supabase's Redirect URLs first). The plot checker on `/tools/figure-readability/fr` answers in French (Check is « ▶ Vérifier », the table « Élément / Source / Impression / Min. », the engine's warnings in French with « 10,0 po × 7,0 po »); the editor's Check tab stays English. Still English on a French page: the feedback form.
> - **⚠ Pre-deploy DB check (needs the Supabase + Stripe dashboards):** before this ships, query prod for `users` rows with `review_credits > 0` or `review_addon = true` (they lose the UI to spend what they bought — refund manually via Stripe per `billing.ts` D8 and tell them) and for rows in `talk_waitlist` (they are expecting a launch email). Archive the review products/prices in Stripe; leave `STRIPE_PRICE_REVIEW_PACK` / `STRIPE_PRICE_REVIEW_ADDON` / `FEATURE_MANUSCRIPT` / `FEATURE_REVIEW` unset in Render. Existing add-on subscriptions keep reconciling through the webhook (fulfilment is not gated).

---

## STEP 0 — Playwright human-perception audit (do this FIRST, before hand-testing)

Before walking the scenarios below, drive every admin screen with Playwright and **read each page as a real human would** — not to check logic, but to catch the things a code trace can't see. Run the dev server (`npm run dev --workspace=apps/web`, port 5173) and audit each route at a real desktop viewport (1440×900), then narrow (1024, 768) and mobile (375).

**What to look for (perception, not logic):**
- [ ] **Text cut-off / truncation / overflow** — clipped headings, `…` where the full string should show, copy running past its container, horizontal scrollbars that shouldn't exist. (Watch the long verbatim strings: the paywall body, the guest-note, the delete-account confirm message, the GDPR helper — they're the most likely to clip.)
- [ ] **Over-aggressive auto-scrolling / scroll-jacking** — page jumping on load, focus-stealing that scrolls you away, the view snapping somewhere unexpected after an action (e.g. after opening the paywall, submitting the auth form, or a toast firing).
- [ ] **Copy that doesn't make sense on screen** — a label that reads fine in code but is confusing in context, a button whose text doesn't match what it does, state copy that contradicts what the user sees (e.g. the delete-account "a new guest account will be created" line — §18 copy bug — read it as a user and confirm it misleads).
- [ ] **Layout breakage** — overlap, cramped/invisible elements, misaligned banners, a modal that doesn't fit, disabled buttons with no visible "why".
- [ ] **Transition/animation feel** — jank, content flashing at opacity 0, a spinner that never resolves, motion that fights the reader (cross-ref the motion-system standards).
- [ ] **Console errors/warnings on each route** — capture them; a red console on a payment or auth screen is a finding.

**Routes to sweep** (both signed-out and signed-in where relevant): `/auth`, `/auth?plan=term`, `/auth?plan=pack`, `/auth?guest=1`, `/pricing`, `/profile` (guest + permanent + paid), `/billing/success`, `/billing/cancel`, the in-editor Export tab paywall, and the delete-account confirm modal.

**How (two engines — run BOTH):**
1. **Playwright** for driving flows a human walks (navigate, click, fill, go back, scroll): `browser_navigate` → `browser_snapshot` (structure + text) → `browser_take_screenshot` (see it as a human) → `browser_console_messages` (errors) → `browser_resize` for each breakpoint.
2. **UIMax MCP** (`mcp__uimax__*`, installed) for the structured design-system / heuristic / perf / a11y audit — see the tool-mapping subsection below.

Log every issue with route + screenshot + which of the categories above, from whichever engine surfaced it.

> Rationale: the scenarios below verify *behavior*; this step verifies *what a human actually perceives*. A flow can pass every logic check and still be broken for a real user because a line is clipped or the page scroll-jacks. Do this pass first so you're not distracted by cosmetics while testing behavior.

### ★ Known issues to reproduce (Gavin-reported, 2026-07-29) — confirm & locate each

These were noticed by a real human using the app. Treat them as **regressions to reproduce and pin down** (route + component + repro steps + screenshot), not hypotheticals. They matter a lot to real users:

- [ ] **Table/figure titles stripped on parse → can't tell items apart when selecting.** Some import/parse path removes the **title/caption** from tables and figures, so when the user later has to *select* one (in a picker/list/dropdown), the options are unlabeled and indistinguishable. Find where parsing drops the title, and every selection UI that then shows untitled items. *(Likely in the import / manuscript / figure pipeline — verify which.)*
- [ ] **No "go back" / "change my options" affordance.** A flow (import, ~~paper-to-poster interview~~ *(hidden as of 2026-09-10 — skip)*, checkout, plan pick, or a multi-step modal) has **no way back** to revise an earlier choice — the user is stuck going forward or starting over. Identify every multi-step flow missing a back/edit control.
- [ ] **Scroll jumps too far when returning to change options.** When the user goes **back** to edit an earlier option, the page **scrolls too far** (overshoots the section they wanted, or resets to top/bottom) — they lose their place. This is the scroll-jacking category, specifically on the *back/edit* path. Reproduce and note which flow + what the scroll should have done.
- [ ] **Too wordy / verbose in places.** Certain sections have **too much copy** — walls of text where a human wants a scannable line. Flag the specific sections (candidates: paywall body, GDPR helper, delete-account confirm, legal callouts, interview prompts) with a "tighten this" note.
- [ ] **Too many fine-prints.** Excessive small-print / caveats / disclaimers stacking up and adding cognitive load. Flag where fine-print piles up and which lines could be cut, merged, or moved behind a "details" affordance.

> When running the audit, capture each of the above with: exact route, the component/file responsible, a screenshot showing the problem, and a one-line "what a human expected instead."

### Auditor rubric for the vision / screenshot passes (use verbatim)

When analyzing the Playwright screenshots, apply the following auditor prompt. Capture screenshots across viewports (mobile 375 / tablet 768 / desktop 1440) **and** interaction states (default, hover, focus) so dimension 4 has something to compare. Emit findings in the JSON schema at the end; then translate each into a doc finding (route + component/file + screenshot ref).

```
# Role and Objective
You are an expert UI/UX Auditor specializing in heuristic evaluations and design system integrity. Your objective is to analyze screenshots provided by a Playwright automated testing suite and identify structural, semantic, and spatial regressions typically introduced by generative "vibe-coded" UI implementations.

# Inputs Provided
1. `Screenshots`: Visual captures of the UI across various viewports (mobile, tablet, desktop) and interaction states (default, hover, focus).
2. `Context`: The intended function of the screen or component being evaluated.

# Evaluation Protocol
Analyze the provided screenshots strictly against the following four heuristic dimensions:

## 1. Typographic Volatility & Spatial Drift
Examine the interface for dynamic content scaling failures.
*   **Target Identifiers:** Text truncation without deliberate ellipses (`...`), text overlapping with neighboring containers, line-height clipping (descenders/ascenders cut off), and inconsistent margins/padding that violate an underlying 8pt spatial grid.
*   **Action:** Flag any bounding box where text exceeds its intended container or where spatial rhythm is mathematically inconsistent.

## 2. Semantic Exhaustion (Over-Decoration)
Evaluate the signal-to-noise ratio of the visual elements.
*   **Target Identifiers:** Extraneous status dots that do not map to actionable states, icons used purely for aesthetic padding rather than semiotic meaning, excessive drop shadows, or high-chroma glows that distract from data comprehension.
*   **Action:** Flag elements that consume high visual weight but provide zero semantic utility or interactive value.

## 3. Collapse of Visual Hierarchy
Assess the interface's "color budget" and cognitive load.
*   **Target Identifiers:** Multiple primary action buttons (e.g., solid, high-contrast fills) competing within the same viewport, lack of focal contrast, or secondary metadata formatted with the same typographic weight as primary headers.
*   **Action:** Identify viewports where the primary user objective is visually indistinguishable from secondary or tertiary actions.

## 4. Kinesthetic and Temporal Deficits (If multi-state screenshots are provided)
Compare the `default` screenshot against `hover` or `active` screenshots.
*   **Target Identifiers:** Missing feedback states (no visual change on hover/focus), inaccessible contrast changes, or structural shifts (e.g., adding a border on hover that causes the surrounding layout to jump).
*   **Action:** Flag interactive nodes that fail to provide immediate, accessible visual feedback during state changes.

# Output Format
Output a structured JSON array of identified violations. For each violation, provide:
{
  "violation_type": "[Typographic | Semantic | Hierarchy | Kinesthetic]",
  "severity": "[High | Medium | Low]",
  "description": "Graduate-level, concise explanation of the architectural failure.",
  "visual_location": "Describe the spatial location or the specific element text/icon to map back to Playwright.",
  "remediation_recommendation": "The CSS or DOM structural fix required."
}
```

> The two rubrics are complementary: the **★ Known-issues + perception checklist** above is the human-narrative pass (does this make sense to a person, does it scroll-jack, is it too wordy); this **auditor rubric** is the structural/design-system pass (typography, over-decoration, hierarchy, state feedback). Run both against the same screenshot set.

### UIMax MCP passes (installed — run alongside Playwright)

Use UIMax (`mcp__uimax__*`) as the **structured, tool-backed** counterpart to the manual vision pass. Where the auditor rubric above is *judgment on screenshots*, UIMax gives *measured* results (Lighthouse scores, axe a11y violations, responsive diffs, budget checks). Run both; reconcile findings.

Suggested UIMax run per route (map to the audit dimensions):

| Audit need | UIMax tool(s) | Notes |
|---|---|---|
| One-shot heuristic + design-system review | `review_ui`, `quick_review`, `crawl_and_review` | `crawl_and_review` to sweep multiple admin routes in one go; `review_ui` for a single deep pass. This is UIMax's version of the auditor rubric — cross-check against the vision-pass JSON. |
| Multi-viewport capture (mobile/tablet/desktop) | `responsive_screenshots` | Feeds BOTH the vision rubric and dimension 1 (Typographic Volatility & Spatial Drift). One call → the whole breakpoint set. |
| Hover/focus/active state feedback (dimension 4) | `screenshot` at each state + `compare_screenshots` / `semantic_compare` | This is how dimension 4 (Kinesthetic Deficits) gets real before/after evidence instead of eyeballing. |
| Accessibility (contrast, roles, focus order) | `accessibility_audit` | Covers the a11y half of dimensions 3 & 4 (focal contrast, accessible state changes) with axe-style violations. |
| Text cut-off / overflow / layout drift | `review_ui` + `get_element` | `get_element` to read the actual bounding box / computed style behind a suspected clip (ties to the ★ title-stripping and truncation issues). |
| Console + network + runtime errors per route | `capture_console`, `capture_errors`, `capture_network` | A red console/network failure on a payment or auth screen is a finding — pairs with Playwright's `browser_console_messages`. |
| Performance / LCP / perceived speed | `lighthouse_audit`, `performance_audit`, `lcp_optimization`, `check_budgets` | Perceived-speed problems (spinner that never resolves, slow paint) show up here; `check_budgets` if perf budgets are defined. |
| Dark mode parity | `check_dark_mode` | Postr is theme-aware; verify admin screens don't break in dark. |
| Regression over time | `save_baseline` → `compare_to_baseline`, `review_diff` | Snapshot the admin screens now; on later runs diff against baseline to catch new drift. |
| Report out | `export_report`, `get_review_history`, `get_review_stats` | Export the consolidated UIMax findings to attach alongside this doc's checklist. |

> Reconciliation rule: a finding confirmed by **both** the vision rubric and a UIMax measurement (e.g. "hierarchy collapse" + a failed contrast check) is high-confidence; a vision-only or UIMax-only finding gets verified against source before it's treated as real (same discipline as the code-trace findings).

---

## 0. Test accounts to prepare (set up once)

| # | Account state | How to create | Use it for |
|---|---|---|---|
| A | **Guest (anonymous)** | `/auth` → "Start creating — no account needed" (or `/auth?guest=1`) | Guest→paywall nesting, guest delete, guest data-export |
| B | **Email, unconfirmed** | `/auth` signup with a fresh email, **do NOT click the confirm link** | Confirmation-pending trap, resume-checkout-after-confirm |
| C | **Permanent email (confirmed)** | Signup + click confirm link | Happy-path buy, delete, export |
| D | **Google account** | `/auth` → "Continue with Google" | OAuth checkout round-trip, guest→Google conversion |
| E | **Permanent free** (0 credits, no term) | Any of C/D with plan='free' | Paywall shown, forced-signup branch |
| F | **Paid — active term** | C/D that completed a `term` checkout in Stripe sandbox | Unlocked exports, renewal, cancel, revoke, **delete-with-live-sub** |
| G | **Paid — export pack** (credits>0) | C/D that completed a `pack` checkout | Credit consume, credit hint, idempotency |

**Before deleting or buying anything, write down the `user_id` (Supabase Auth) and poster IDs** — you can't query them after deletion. Keep the Stripe sandbox dashboard + link.com open in another tab.

---

## ⚠ Can't fully test from the app UI (needs Stripe sandbox / link.com / Supabase)

These steps have **no Postr UI** — don't waste time clicking for them. Drive them from the Stripe sandbox dashboard, link.com, or by querying Supabase directly.

- [ ] **Hosted checkout page** (card entry, Link account, tax) — Stripe/link.com UI, use a Stripe **test card**.
- [ ] **Plan grant** — happens ONLY via the `checkout.session.completed` **webhook** → `fulfillCheckout`. The green success page never provisions. If the webhook can't reach your API, the flow silently fails at grant with a green success screen.
- [ ] **`client_reference_id` binding** — verify in the created Stripe session that it maps back to the Supabase `user_id`.
- [ ] **Subscription renewal** (`invoice.paid`, every 4 mo) — **no in-app UI**. Fast-forward the subscription clock in Stripe sandbox; check `users.plan_expires_at` advanced.
- [ ] **Cancel subscription** — Postr has **no native cancel**. "Manage subscription at Link ↗" opens `https://link.com` **root** (not a customer deep link). All cancel actions happen off-app on link.com.
- [ ] **Revocation / past_due / terminal** — force a failed test card on renewal in Stripe sandbox; watch `customer.subscription.updated`/`.deleted` hit the webhook.
- [ ] **Async payment methods** (bank debit) — `checkout.session.completed` can arrive **unpaid**; grant defers to `async_payment_succeeded`. Only observable via Stripe events.
- [ ] **Webhook idempotency** — replay/duplicate a delivery in Stripe sandbox; confirm credits are NOT double-granted (pack path only).
- [ ] **Google consent screen** — external Google UI, not automatable; a manual click.
- [x] ~~**Stripe orphan on account-delete**~~ — **FIXED 2026-09-11 (P0-3)**: `POST /account/delete` cancels every live sub + deletes the customer before the auth delete (`apps/api/src/account.ts`). Sandbox check now: delete Account F, confirm the sub is `canceled` and NO invoice on clock advance; the later `customer.subscription.deleted` webhook answers 200 (acknowledged via `account_deletions`), not 500.
- [ ] **`plan`/`plan_expires_at`/`subscription_status`/`stripe_*` columns** — client can't write these (guard trigger). Query Supabase directly to verify grants.
- [ ] **Supabase Auth Site URL / Redirect URLs** — confirmation-link + OAuth-return destinations depend on these. Recurring post-deploy miss. Verify `https://www.postr.sh` is set. Redirect URLs must include `{origin}/auth` and `{origin}/dashboard`.

---

# PART 1 — NESTED PAYMENT + SIGN-UP (priority)

The account-first checkout is the highest-risk surface. Each scenario below is a full journey; run every branch.

## 1. Account-first checkout — the master nested flow

**Goal:** A paid plan must NEVER land in a guest session; picking a plan while not-permanent forces real account creation, then resumes checkout.

### 1a. Permanent user picks a plan (fast path, no signup needed)

- **Set up:** Account **C or D** (permanent, `is_anonymous=false`), signed in.
- [ ] Go to `/pricing`, click "Get the term" → lands on `/auth?plan=term`.
- [ ] Mount effect detects permanent session + plan → **skips the form entirely** and shows "Continuing to secure checkout…" then full-page redirect to Stripe. **No form appears.**
- [ ] Repeat with `?plan=pack`.
- **Edge:** double-render / StrictMode — confirm only **one** Stripe session is minted (ref-guarded).
- **✓ verify:**
  - [ ] `sessionStorage['postr.checkoutIntent']` cleared on successful start.
  - [ ] Exactly one Stripe checkout session created (Stripe dashboard / network tab).
  - [ ] Banner never showed a guest card.

### 1b. GUEST picks a paid plan → forced signup (EMAIL, confirmation-pending) → resume — **CRITICAL**

- **Set up:** Account **A** (guest), a poster open.
- [ ] In editor Export tab, guest sees note: **"You're working as a guest — you'll create a free account (or sign in with Google) first, so your purchase and posters stay yours across devices."**
- [ ] Click "Get the term". It does **NOT** call the API (a guest would 403). It stashes intent and navigates to `/auth?plan=term`.
- [ ] On `/auth?plan=term`: **guest card is GONE**, replaced by banner **"Term · CA$18.99 every 4 months + applicable taxes"** + **"Create your account below to continue to secure checkout."** Mode defaults to **signup**.
- [ ] `?guest=1` auto-guest is suppressed while a plan is present (verify by loading `/auth?guest=1&plan=term` — no guest is minted, form shows).
- [ ] Enter email + password (must pass all 5 rules). Submit label reads **"Create account & continue"**.
- [ ] With email confirmation ON: signup returns no session → banner **"Check your email to confirm your account, then come back to continue to checkout."** No checkout starts yet.
- [ ] Open the confirmation email, click the link, return signed-in → mount effect resumes → "Continuing to secure checkout…" → Stripe redirect.
- **Edges to try:**
  - [ ] Weak password → submit stays disabled, no signUp call.
  - [ ] Email already registered → raw Supabase error banner (e.g. "User already registered"); switch to Sign in.
  - [ ] `createCheckout` fails after confirm-return → banner **"We couldn't start checkout. Please try again."**, retry allowed.
  - [ ] Confirmation email never clicked → intent sits in `sessionStorage`; checkout only fires with a real permanent session.
- **✓ verify:**
  - [ ] `sessionStorage['postr.checkoutIntent']==='term'` after the guest click, before checkout.
  - [ ] Exactly ONE Stripe session after confirm-return.
  - [ ] **⚠ DATA-CONTINUITY (must confirm):** After the guest completes signup this way, are the guest's **prior posters linked to the new account, or orphaned?** `/auth` uses `supabase.auth.signUp` (a fresh user), **NOT** the in-place `updateUser` that Profile uses. Per project memory the paywall is supposed to convert **in place**. If posters vanish, that's a MAJOR finding.

### 1c. GUEST/signed-out picks a plan → GOOGLE OAuth round-trip

- **Set up:** Account **A** (guest) or signed-out, at `/pricing` or the in-editor paywall.
- [ ] Click "Get the term" → `/auth?plan=term`.
- [ ] Click "Continue with Google". Intent is **stashed FIRST**, then `signInWithOAuth` with `redirectTo = {origin}/auth?plan=term` (returns to `/auth`, **not** `/dashboard`).
- [ ] Approve on Google → returns to `/auth?plan=term` with a session → checkout resumes → Stripe.
- **Edges:**
  - [ ] Query string dropped on return → `resolveCheckoutPlan` falls back to the sessionStorage stash; checkout still resumes.
  - [ ] Cancel at Google → returns with no session → normal `/auth` form, no checkout, no dedicated error copy.
  - [ ] Private-mode (sessionStorage unavailable) → stash no-ops; relies entirely on the `?plan=` URL surviving.
  - [ ] Redirect URL not allow-listed in Supabase → session not established → checkout never resumes (**recurring config miss**).
- **✓ verify:**
  - [ ] `sessionStorage['postr.checkoutIntent']` set before the Google redirect.
  - [ ] One Stripe session minted on return.

### 1d. Confirmation-pending resume WITHOUT plan (plain signup)

- **Set up:** Account **B** flow, no `?plan=`.
- [ ] Signup returns no session → green banner **"Check your email to confirm your account."** User is **NOT** signed in and stays on `/auth`.
- **✓ verify:**
  - [ ] `auth.users` row exists, `email_confirmed_at` NULL, no active session.
  - [ ] No `navigate('/dashboard')` happened at signup time.
  - [ ] After clicking the email link, where you land depends on Supabase **Site URL** (no `emailRedirectTo` in code) — confirm it's correct.

---

# PART 2 — SIGN-UP & AUTH (non-nested)

## 2. Guest sign-in

**Goal:** One click starts a guest session, exactly one anon user is minted.

- **Set up:** Signed-out browser, `/auth` with **no** `?plan=`.
- [ ] Guest card renders. Button: **"Start creating — no account needed"**. Helper: **"Jump straight into the editor as a guest. Your work saves in this browser. Link an account anytime to sync across devices."**
- [ ] Click → button flips to **"Loading…"** → lands on `/dashboard`, Home shows **"My posters"**.
- **Also test `/auth?guest=1`** (Landing "Try as guest"): auto-triggers guest on mount, no click.
- **Edges:**
  - [ ] Already-signed-in guest hits `/auth?guest=1` → redirected to `/dashboard`, **no second guest** (the "second guest" regression — verify only ONE anon row).
  - [ ] Anonymous sign-in disabled server-side → **raw** error banner (note: violates generic-error rule).
- **✓ verify:**
  - [ ] Exactly one `auth.users` row, `is_anonymous=true`.
  - [ ] `public.users` row + one "Untitled Poster" auto-created.
  - [ ] `localStorage` has `sb-<ref>-auth-token`.

## 3. Email sign-up (fresh, no plan) — confirmation trap

- **Set up:** Account **B**.
- [ ] Toggle to signup via "Sign up" link. Header **"Or create an account"**, placeholder **"Create password"**, PasswordStrength meter appears.
- [ ] Submit disabled until password passes **all 5 rules**: ≥8 chars, uppercase, lowercase, number, symbol.
- [ ] Submit "Create account" → green banner **"Check your email to confirm your account."**
- **Trap:** user stays on `/auth`, **not signed in** until the email link is clicked.
- **✓ verify:** `email_confirmed_at` NULL, no session, no dashboard redirect.

## 4. Email sign-in (returning)

- **Set up:** Account **C**, signed out.
- [ ] Default mode "Sign in", sub-copy **"Access your posters from any device."** No strength meter.
- [ ] Enter creds → "Sign in" → `/dashboard`.
- **Edges:** wrong password → raw "Invalid login credentials"; unconfirmed email → raw "Email not confirmed"; empty fields → nothing happens.
- **✓ verify:** token in localStorage, `is_anonymous=false`.

## 5. Forgot / reset password — **UNVERIFIED, no in-app completion**

- **Set up:** `/auth` signin mode, email typed.
- [ ] "Forgot password?" only shows in signin mode. Empty email → **"Enter your email address first."**
- [ ] With email → link replaced by green **"Password reset email sent to {email}."**
- **⚠ Finding to note:** `resetPasswordForEmail` passes **no `redirectTo`**, and there's **NO in-app "set new password" screen**. Completing a reset depends entirely on Supabase's hosted flow + Site URL. You **cannot finish a reset inside Postr's UI** — verify the hosted flow works or flag as a gap.

## 6. Google OAuth sign-in (no plan)

- **Set up:** Account **D**, signed out.
- [ ] "Continue with Google" → `redirectTo = {origin}/dashboard` → land on `/dashboard`.
- **Edges:** cancel at Google → bounced back, AuthGuard sends to `/auth`, no error copy. Full-page redirect (popup-blockers don't apply).
- **✓ verify:** Google identity row, `is_anonymous=false`. Redirect URL must be allow-listed in Supabase.

## 7. Guest → permanent conversion on **/profile** (Google, instant)

- **Set up:** Account **A** (guest) on `/profile`.
- [ ] The "Create an Account" section shows **only** for guests. Copy: **"You're using a guest account. Sign up to preserve your posters across devices… All your current work will be linked to your new account automatically."**
- [ ] "Sign up with Google" → `redirectTo = {origin}/profile` → returns converted in place.
- **⚠ CRITICAL:** code uses `signInWithOAuth`, **NOT** `linkIdentity` — relies on Supabase **auto same-email linking**. If Manual Linking is **disabled** or emails differ, the guest data is **ORPHANED** (a new user is created). **Verify Manual Linking is ON in Supabase Auth before trusting this.**
- **✓ verify:** `is_anonymous=false`, email set, all prior posters still listed, no orphaned second anon user, "Create an Account" section gone.

## 8. Guest → permanent conversion on **/profile** (Email, confirmation) — optimistic-toast trap

- **Set up:** Account **A** (guest) on `/profile`.
- [ ] Inline EmailSignUp under "or use email". Uses `updateUser` (in-place upgrade), not signUp.
- [ ] Success → green toast **"Account created! Your guest data has been linked."** (5s).
- **Trap:** `updateUser` with a new email needs confirmation → user **stays anonymous** (`is_anonymous` still true) until the emailed link is clicked. **The toast is optimistic and lies about completion.**
- **✓ verify:** `is_anonymous` STILL true + `email_confirmed_at` NULL until confirmation; posters intact; only after clicking does `is_anonymous` flip.

## 9. AuthGuard gate + session lifecycle

- **Set up:** Signed-out browser.
- [ ] Hit `/dashboard`, `/profile`, `/admin/gallery` → pulsing **"Loading…"** → redirect to `/auth`.
- [ ] Hit `/p/:id` → **no** redirect to `/auth`. The editor route is guarded by `EnsureSession`, not AuthGuard (`apps/web/src/routes.tsx`): pulsing **"Preparing your editor…"**, then a new guest session and the editor. This predates fix 23 (commit e6a932a, 2026-07-29). Since fix 23 the editor opens only your own posters, so another user's poster id shows "Poster not found".
- [ ] Signed-in → page renders after brief "Loading…".
- [ ] Sign out on a guarded page → bounced to `/auth`. (Not on `/p/:id`: there the poster closes, see §10.)
- **⚠ Findings to note:**
  - [ ] AuthGuard uses **plain `getSession()`, no self-heal** — a stale/invalid cached JWT **passes** and renders children (the stale token only surfaces on the first real API call). Contradicts feature-graph §7's claim that `ensureSession` heals the guard. **Code wins — flag the doc.**
  - [ ] `getSession()` has **no `.catch`/timeout** — a network failure can strand the user on "Loading…" forever.

## 10. Session lost in the editor (the poster closes; the session-expired modal never appears)

- **Set up:** Signed-in, editor open; revoke the refresh token (or let it expire).
- [ ] **Expected since fix 23:** on `SIGNED_OUT`, `EnsureSession` gives the tab a new guest session at once, and the editor closes the poster to the account-changed page. The editor does **not** stay open on a dead session.
  - An account's poster: **"This poster is in another account"**, with "Download a copy", "Sign in" (offered because a guest is now signed in) and "My posters".
  - A guest's poster: **"This guest poster was closed"**, with "Download a copy" and "My posters", no "Sign in".
  - Evidence: TESTED by `EditorOwnership.test.tsx`, 'a lost session replaced by a new guest closes it' (it passed in the fix 23 docs audit, S9D-7). Record 23 §9, "G3's rerun on the fix", row a2 ('refresh fails in the editor's tab'): closed, the same page, 3 of 3 (MEASURED by the lead with G3's script; not re-run for this doc).
- [ ] The 🔒 **"Your session has expired"** modal currently **never appears**. Its callback reads a stale `hadSession` (`SessionExpiredModal.tsx:52`, INSPECTED); record 23 §5, G3: 0 of 5 sign-out runs showed it, on main before the fix (fix 23 did not change `SessionExpiredModal.tsx`). This is pre-existing and on the Later list (record 23 §10). Its buttons, "Reload and sign in again" and "Dismiss (save text first)", cannot be reached until it is fixed. If the modal does appear, note it.
- **Edge:** fresh unauthenticated load does NOT show the modal (no false positive).
- **Note:** the modal, once it works, does NOT re-auth or preserve edits — warn-only. "Download a copy" on the closed page saves the version that was in memory.

---

# PART 3 — PAYMENT & SUBSCRIPTION

> Grant always happens via **webhook**, never the success page. See the ⚠ callout for everything that needs the Stripe sandbox.

## 11. Buy the TERM (recurring 4-mo sub) — signed-in permanent

- **Set up:** Account **E** (permanent free, 0 credits), poster open. API env must have `STRIPE_SECRET_KEY`, `STRIPE_PRICE_TERM`, `STRIPE_WEBHOOK_SECRET`, `APP_ORIGIN`, service_role; `VITE_API_BASE_URL` non-empty.
- [ ] Editor → Sidebar **Export** tab → "✎ Editable formats". Paywall heading **"Keep editing in PowerPoint"**, body **"Your PDF export is free. Unlock clean PowerPoint export with the term at CA$18.99 + applicable taxes (renews every 4 months, cancel anytime), or a 3-export pack at CA$9.99 + applicable taxes (its credits never expire)."** The PowerPoint button disabled; no LaTeX button (fix 25).
- [ ] **Refund rule visible BEFORE purchase (owner rule, 2026-09-11 — wording `data/refundCopy.ts`, must match Terms §7.2 + Profile):** (1) the paywall shows, directly above the buy buttons, **"Term: full refund within 14 days of a charge if you haven’t taken a paid export. Pack: full refund until your first export, none after — even in part."**; (2) `/pricing` term card shows **"Full refund within 14 days of a charge if you haven’t taken a paid export."** right under "Get the term" (kept even when the CTA is swapped for the active-term notice), and the fine print under the grid — **"A term is refundable in full within 14 days of a charge, a pack until its first export; taking a paid export ends either refund. Full details in the refund terms."** — links **refund terms** → `/terms#refunds`; (3) `/auth?plan=term` banner shows the same term line under **"Term · CA$18.99 every 4 months + applicable taxes"**. ⚠ The Stripe-hosted page shows NO refund text: `custom_text` is rejected together with Managed Payments (sandbox 2026-09-11, `StripeInvalidRequestError`: "You cannot use custom_text with Managed Payments.") — do not look for it there.
- [ ] Click "Get the term" → full-page redirect to Stripe hosted checkout. Pay with a **test card**.
- [ ] Return to `/billing/success` → check icon + **"You're all set"**. Page polls (`refreshSession` at 2.5s, "waited" at 6s).
- [ ] Once the webhook lands + refresh fires → copy switches to **"Your term is active. Editable PowerPoint exports are unlocked — no watermark."**
- [ ] "Back to your posters" → `/dashboard`; return to Export tab: paywall gone, PowerPoint enabled.
- **Edges:**
  - [ ] Webhook lands after page load → **"Payment received — finalizing your account. This takes just a moment."** then after 6s **"Payment received. Your access will appear shortly — head back in and it'll be ready."** (expected latency).
  - [ ] Misconfigured API → generic **"Something went wrong. Try again, or use Send Feedback…"** alert.
  - [ ] `VITE_API_BASE_URL` empty → same generic alert (throws before network).
  - [ ] Rate limit (>10/window, >40/day) → 429 → generic alert (no dedicated copy).
  - [ ] **⚠ webhook secret wrong** → 400 invalid_signature → **no grant ever**, success page stalls forever on "access will appear shortly".
  - [ ] **Already a term holder (P0-2, 2026-09-11):** `/pricing` and the paywall hide "Get the term" and `/auth?plan=term` skips checkout when `usePlan().hasActiveTerm`. Force it anyway (stale tab) → `POST /billing/create-checkout` → **409 `already_subscribed`** (`billing/subscriptionGuard.ts hasActiveTerm`) → the client re-reads the plan and shows **"You already have an active term — PowerPoint export is unlocked…"** ONLY if the fresh row agrees; if the row disagrees (stuck `subscription_status` past a lapsed expiry) the guard does not fire at all — such a row is sold a new term and logged `[billing] subscription_status … stuck`.
  - [ ] **Customer reuse:** a repeat buyer's session is created with `customer: <stored stripe_customer_id>` (no `customer_email`) — one Stripe customer per account (`users_stripe_customer_id_unique_idx`).
- **✓ verify (query Supabase):**
  - [ ] `plan='term'`, `plan_expires_at` ~4 months out, `subscription_status='active'`, `stripe_subscription_id` + `stripe_customer_id` set.
  - [ ] Landed on `/billing/success` (not `/cancel`).
  - [ ] `[data-postr-export-pptx].disabled === false`, upgrade panel absent.
  - [ ] A PowerPoint export now has **no watermark**.
  - [ ] `billing_fulfilled_sessions` NOT written for term (pack-only).
- **⚠ Basil breaking change:** period end reads `items.data[0].current_period_end`; if absent it **throws → 500 → retry**. Verify the pinned `2026-02-25.preview` API version returns item-level period end in sandbox.

## 12. Buy the PACK (one-time, 3 credits) — signed-in permanent

- **Set up:** Account **E**, `STRIPE_PRICE_PACK` set.
- [ ] Same paywall → "Get the pack" → Stripe (mode `payment`, no subscription) → pay.
- [ ] **Refund rule visible BEFORE purchase (2026-09-11):** paywall line as §11; `/pricing` pack card shows **"Full refund until your first export. No refund after, even in part."** right under "Get the pack"; `/auth?plan=pack` banner shows the same pack line under **"Export pack · CA$9.99 + applicable taxes"**; `/pricing` crawler copy (`seo/routes.json`) carries the rule too. Stripe page: none (see §11).
- [ ] `/billing/success` → once credits show: **"Your export pack is ready — 3 exports to use whenever. Credits never expire."**
- [ ] Editor hint: **"3 exports left in your pack — each PowerPoint export uses one. Credits never expire."**
- **Edges (Stripe sandbox):**
  - [ ] **Replay the event** → idempotent, credits NOT double-granted (`billing_fulfilled_sessions` unique key).
  - [ ] Unpaid async completion → no grant until `async_payment_succeeded`.
  - [ ] `grant_export_credits` RPC error → 500 → Stripe retries.
- **✓ verify:** `export_credits=3`, `plan` **still 'free'**, `plan_expires_at` unchanged, `stripe_customer_id` set, one `billing_fulfilled_sessions` row.
- **Self-serve pack refund (owner's rule, 2026-09-11 — no refund after ANY paid export, both SKUs):** on `/profile` with credits > 0 → "Refund export pack" → `POST /billing/refund {kind:'pack'}` → eligible ONLY while `export_credits` still covers every credit the account's unrefunded packs granted (one pack: `export_credits = 3`; `billing/packRefund.ts packRefundEligible`) → **full** refund of the MOST RECENT unrefunded pack's PaymentIntent (`refunds.create({ payment_intent })`, no `amount` — the whole charge, key `pack-refund:{session_id}`) → ledger row `kind='pack', credits_revoked=3, session_id` → `revoke_export_credits(3)` → response `{ ok, amount_cents: 999, subscription_cancelled: false }`.
  - [ ] Copy under the button: **"A pack is refundable in full (CA$9.99) only if you haven't taken a paid export. Refunding removes its 3 credits from your account."**
  - [ ] Success: **"Refunded CA$9.99. It may take a few days to appear."**, then the balance re-reads to 0 and the button disappears.
  - [ ] Two untouched packs (6 credits) → first click refunds the NEWEST pack only (3 credits left), second click refunds the older one. A pack already in `billing_refunds` is skipped.
  - [ ] Double click → idempotent (same session key → same refund id; one ledger row, one revoke).
  - [ ] After ANY consumed credit (§13) → **409 `already_used`** → **"This pack isn't refundable once you've taken a paid export — not even in part."**; no Stripe call, no ledger row, balance untouched. There is NO per-credit proration any more (was CA$3.33 per unused credit before 2026-09-11 — abusable: export once, refund the rest).

## 13. Consume a credit (pack holder)

- **Set up:** Account **G** (credits>0, no term), poster open, PPTX within size limits.
- [ ] No paywall; credit hint visible. Click "PowerPoint (.pptx)" → file downloads → button shows **"✓ Saved"**.
- [ ] After the file is produced, `POST /billing/consume-credit` fires (term holders skip this).
- **Edges:**
  - [ ] consume-credit fails (network/500/409) → **swallowed**, logged only, export NOT marked failed — user may keep a credit they used (revenue leak, accepted).
  - [ ] Two concurrent exports racing to 0 → atomic RPC prevents negative; second gets 409 no_credit but file still downloaded.
  - [ ] Export job throws → alert, credit NOT spent.
- **✓ verify:** `export_credits` −1 per successful export; failed export doesn't decrement; term holders never call consume-credit; exported file has no watermark.
- [ ] **Refund now refused (2026-09-11):** `/profile` → "Refund export pack" → 409 `already_used` (§12) — one consumed credit voids the whole pack's refund.

## 14. Cancel checkout (`/billing/cancel`)

- **Set up:** Reach Stripe hosted checkout via any flow, then back out.
- [ ] Redirect to `/billing/cancel` → **"Checkout cancelled"** + **"No charge was made. Your poster is exactly as you left it — you can keep editing for free, or pick up checkout again anytime."**
- [ ] "Back to editing" → `window.history.back()`; "See plans" → `/pricing`.
- **✓ verify:** users row unchanged (`plan='free'`, credits unchanged, no `stripe_subscription_id`, no fulfilled-session row), paywall still shows, no Stripe charge. If account-first, the **account still exists** (no longer a guest) even though payment was cancelled — expected.

## 15. Renewal — ⚠ webhook only, no app UI

- **Set up:** Account **F** (active term). Fast-forward the sub clock in Stripe sandbox.
- **✓ verify (Supabase only):** `invoice.paid` → `plan_expires_at` advanced (forward-only), `subscription_status='active'`. Redelivered/stale event = safe no-op (never retreats). **No app artifact.**
- **Basil note (2026-09-11):** the handler reads the subscription id from `invoice.parent.subscription_details.subscription` (`billing/invoicePayments.ts subscriptionIdFromInvoice`, legacy top-level `subscription` as fallback) — on the pinned `2026-02-25.preview` version the legacy field is ABSENT, so before this fix renewals silently returned early.

## 16. Cancel subscription — ⚠ done at link.com, not in Postr

- **Set up:** Account **F** on `/profile`.
- [ ] "Subscription" section shows (because `hasActiveTerm`). Copy: **"Your term is active — PowerPoint export is unlocked, no watermark."** + **"The term renews every 4 months. Manage it — update your card, see receipts, or cancel — at Link, which handles billing for Postr."**
- [ ] "Manage subscription at Link ↗" → opens `https://link.com` in a new tab. **No in-app cancel.**
- **⚠ UNVERIFIED:** the link goes to link.com **root**, not a customer-specific portal deep link. Confirm a real customer can actually find + cancel THIS sub from link.com's root.
- **After cancel-at-period-end (Stripe sandbox):**
  - [ ] `customer.subscription.updated` (cancel_at_period_end, still 'active') → access **retained** to period end, `subscription_status` stays 'active'.
  - [ ] At period end `customer.subscription.deleted` → `plan='free'`, `plan_expires_at=now()`, `subscription_status='canceled'`; paywall returns; Subscription section disappears.
- **past_due variant:** inline warning **"There's a payment issue on your latest renewal — update your card at Link to keep your term."**
- **Self-serve term refund (P0-1 + H-10, 2026-09-11):** "Request refund" within 14 days and before any paid export → `POST /billing/refund {kind:'term'}` → Stripe refund of the latest invoice's PaymentIntent (resolved Basil-style via `latest_invoice.payments` / `invoicePayments.list`) → **the subscription is cancelled immediately** (`subscriptions.cancel`, `prorate:false`) → row `plan='free', plan_expires_at=now(), subscription_status='canceled'` (sub id kept) → response `{ ok, amount_cents, subscription_cancelled: true }`.
  - [ ] Panel copy: **"Refunded CA$18.99 — it may take a few days to appear. Your term has been cancelled, so its unlimited PowerPoint exports have ended."**, then the panel re-reads the plan and drops to the FREE state (no second "Request refund" button).
  - [ ] Double click → idempotent (same refund id, cancel once). A later `customer.subscription.updated` "active" for that sub id does **not** re-grant (`termAdvanceDecision` → `skip_terminal`, logged).
  - [ ] Eligibility 409s map to copy: `window_expired`, `already_used` (term AND pack — kind-specific wording), `no_pack_purchase`; anything else → generic. (`no_unused_credits` is no longer emitted — a consumed credit is `already_used`.)

## 17. Revocation / past_due / terminal — ⚠ webhook only

- **Set up:** Account **F**; force a failed renewal card in Stripe sandbox.
- **✓ verify:**
  - [ ] `past_due` → access KEPT (past_due is in TERM_ACTIVE_STATUSES), `plan` still 'term', expiry future, Profile shows the yellow warning. **No revoke on first past_due.**
  - [ ] Terminal (unpaid/canceled/incomplete_expired) → `plan='free'`, `plan_expires_at=now()`, `subscription_status` terminal → paywall returns.
  - [ ] Natural lapse without a terminal webhook → `usePlan` still expires access client-side once `plan_expires_at` passes (the only non-webhook safety net).
  - [ ] **`unpaid` is recoverable (2026-09-11 review fix):** after `unpaid` revokes access, pay the open invoice from the hosted invoice page → Stripe reports the SAME sub `active` → `plan='term'` again with the new period end. (`canceled` / `incomplete_expired` remain irreversible: a late "active" for them is refused and logged.)
  - [ ] **Stale terminal event for an OLD sub id** (buy → cancel → buy again, then redeliver the old `.deleted`) → the NEW term is untouched (revoke is scoped to `stripe_subscription_id = event sub id`).
  - [ ] **Deleted account (P0-3):** after §18 the `customer.subscription.deleted` for the cancelled sub resolves the deleted uuid from sub metadata → `account_deletions` row found → **200, no write, one operator log line**. Delete that audit row by hand and redeliver → **500 `fulfillment_failed`** + `UserRowMissingError` log (a genuine orphan is never silent).
  - [ ] **External refund (H-11, Stripe dashboard / Link):** full CA$18.99 refund → `refund.created`/`refund.updated`/`charge.refunded` → sub cancelled + `plan='free'` exactly like the button (ledger dedups whichever event lands first). **Partial** refund (e.g. CA$5.00) → NOTHING revoked, sub NOT cancelled, log `partial_term_refund`, not ledgered (a later full refund still applies). Refund of a pack payment → credits revoked in proportion to what Stripe returned (full CA$9.99 → 3; an operator's partial dashboard refund → `round(amount ÷ CA$3.33)`, capped at 3 — `constants.ts packCreditsForRefundAmount`) via `billing_fulfilled_sessions`; external refunds are reconciled, never gated by the no-export rule. Unattributable → logged, nothing revoked. **Dashboard prerequisite:** the webhook endpoint must have `refund.created` + `refund.updated` enabled (unverified from code).

---

# PART 4 — DELETE ACCOUNT (/profile → Danger Zone)

## 18. Delete PERMANENT account (happy path) — ✅ Stripe orphan FIXED (2026-09-11, P0-3)

- **Set up:** Account **C or D** (and **F** for the paid case), laptop viewport, ≥1 poster with a thumbnail, ≥1 uploaded logo (+ ideally a gallery entry and a feedback row to test the differential cascade). **Note `user_id`, poster IDs, and — for F — the Stripe `cus_…` / `sub_…` ids first.**
- **Mechanism (changed):** deletion no longer calls the `delete_own_account` RPC from the browser. Profile's Danger Zone calls **`POST /account/delete`** (`apps/web/src/data/account.ts` → `apps/api/src/account.ts`), which runs with the service role, in this order, with the irreversible step LAST:
  1. read `stripe_customer_id` / `stripe_subscription_id` / `review_addon_subscription_id` from `public.users`;
  2. **Stripe:** `subscriptions.list({customer, status:'all'})` → `subscriptions.cancel(id, {prorate:false})` on every non-terminal sub (term AND review add-on) → `customers.del(customer)`;
  3. **Storage:** remove every object under `poster-assets/{uid}/…` (figures, `thumbnail.jpg`, `review-capture.jpg`, `review-temp/…`), `user-logos/{uid}/…`, `gallery/{uid}/…`;
  4. **audit row** in `public.account_deletions` (service_role-only table: customer id, cancelled sub ids, objects removed);
  5. `auth.admin.deleteUser(uid)` → FK cascade.
  The RPC still exists but `EXECUTE` is revoked from `anon`/`authenticated` (migration `20260911000000_account_delete_hardening.sql`), so the client cannot bypass the wind-down. The old `supabase/functions/delete-account` edge function is deleted (it was unreferenced).
- [ ] `/profile` → red **"Danger Zone"** → "Delete account" DangerAction → ConfirmModal with typed confirmation **"I confirm the deletion of my account"** (button disabled until exact, case-insensitive, trimmed match).
- [ ] With an **active term** (Account F) the modal must state that deleting **also cancels the term** ("This also cancels your term and any add-on immediately."; no price since fix 25) (client-side line keyed on `usePlan().hasActiveTerm`).
- [ ] Confirm → toast **"Deleting account…"** → `POST /account/delete` → 200 `{ ok, cancelledSubscriptions, deletedCustomer }` → browser storage cleared: every key named `postr.…` or `postr-…` in localStorage and in sessionStorage (record 24 and its review round 1: the presets, palettes, notes, profile, tour and colour-blind preference, this account's `postr.welcome-seeded:<id>`, the two-tab markers, the plot scripts of plan item 7, and the tab's entries such as `postr.tab-id`, `postr.checkoutIntent`, `postr.autoArrangeOnLoad` and the plot checker page's script); devtools › Application › Local Storage and Session Storage show no `postr` entry left, except another account's `postr.welcome-seeded:` marker if this browser holds one → global sign-out → `/auth`. **No client-side poster deletion first** (`profile/accountDeletion.ts`, 2026-09-11 review fix): the server removes storage and the auth cascade removes the posters, so on ANY API failure the copy "Nothing was removed" is literally true — verify by making the API fail (invalid Stripe key) and confirming every poster is still on the dashboard afterwards.
- **Edges (every failure leaves the account intact — retry is safe, 3/hour rate limit):**
  - [ ] Wrong/partial phrase → button stays greyed, no error string.
  - [ ] Stripe refuses a cancel → **502 `cancel_failed`**; customer NOT deleted, storage untouched, user still signed in, generic error shown ("Something went wrong…"), no raw Stripe text.
  - [ ] Subs cancelled but `customers.del` fails → **502 `customer_delete_failed`** — billing has already stopped (the explicit cancels ran first); retry finishes the job (an already-deleted customer is treated as done).
  - [ ] Storage list/remove fails → **500 `storage_cleanup_failed`**; Stripe already wound down; retry.
  - [ ] Audit insert or `deleteUser` fails → **500 `delete_failed`**; retry.
  - [ ] Guest (anonymous) session → allowed, no Stripe calls (see §19).
  - [ ] Simulate in sandbox: temporarily point `STRIPE_SECRET_KEY` at an invalid key → expect `cancel_failed` and the account still present in `auth.users`.
  - [ ] `SIGNED_OUT` race → both the explicit navigate and AuthGuard's listener target `/auth`.
  - [ ] SessionExpiredModal may briefly flash the 🔒 dialog over `/auth` on an intentional delete — confusing artifact; note if you see it.
- **✓ verify:**
  - [ ] **Stripe sandbox (Account F):** every sub on the customer is `status = canceled` (immediately, no proration), the customer shows **Deleted**, no further invoices when the test clock advances; the later `customer.subscription.deleted` webhook resolves the deleted uuid, finds the `account_deletions` row and answers **200 with no write** (one `[billing] … was deleted via POST /account/delete` log line) — it must NOT 500-loop for 3 days, and it must NOT silently 200 when no audit row exists (`billing/termRow.ts`; §17).
  - [ ] `public.account_deletions` has one row: `user_id`, `stripe_customer_id`, `cancelled_subscription_ids` (term + add-on ids), `storage_objects_removed` ≥ thumbnails + logos uploaded.
  - [ ] Storage: `poster-assets/{uid}/`, `user-logos/{uid}/`, `gallery/{uid}/` are EMPTY immediately after (no longer "orphan until the cron").
  - [ ] `auth.users` + `public.users` rows GONE; posters/presets/assets/library/user_logos/gallery_entries/poster_comments/poster_versions/talk_waitlist/billing_fulfilled_sessions cascade GONE.
  - [ ] **`feedback` rows SURVIVE with `user_id=NULL`** (SET NULL, not cascade) — differential contract.
  - [ ] localStorage cleared: `postr.style-presets`, `postr.scratch-pad`, `postr.scratch-note`, `postr.checklist-templates`, `postr.profile`, `postr.onboarding-done`, `postr.custom-palettes`, `postr.cb-random-pref`, `postr.welcome-seeded:<this account's id>`, every `postr.active-editor.*` and `postr.figure-script.*` (record 24). Seed a second account's `postr.welcome-seeded:<other id>` first: it must stay.
  - [ ] Land on `/auth` sign-in screen (**no auto-guest** — bare `/auth`, not `?guest=1`).
  - [ ] Email is re-usable — sign up again with it succeeds.
  - [ ] Browser console: `supabase.rpc('delete_own_account')` from a signed-in session now fails with **function does not exist (42883)** — the RPC was dropped, not revoked, because a revoked-function call by a browser role segfaults supabase/postgres 17.6.1.106 (reproduced 2026-09-11); pgTAP `supabase/tests/account_deletions_test.sql` pins this.
- **✅ RESOLVED — Stripe orphan (was HIGH):** the delete path now cancels every live subscription and deletes the Stripe customer BEFORE the auth delete, and refuses to delete the account if Stripe fails. Unit-tested in `apps/api/src/__tests__/account.test.ts` (order, each failure code, guest path). Still to confirm by hand: `subscriptions.cancel` / `customers.del` work from the platform key under Managed Payments (sandbox item 18 of the audit's dashboard checklist).
- **⚠ Doc/code disagreements still open (client-side, not this route):**
  - UI copy promises "a new guest account will be created" but code goes to **bare `/auth`** (no `?guest=1`), which does **not** auto-mint a guest → user lands on sign-in. **Copy bug.**

## 19. Delete GUEST account

- **Set up:** Account **A** (guest), ≥1 poster. Profile shows **"📧 Guest (no email linked yet)"**. Note `user_id` + poster IDs.
- [ ] Same Danger Zone flow — **identical** UI, same typed-confirmation "I confirm the deletion of my account".
- [ ] Confirm → anon `auth.users` row deleted + cascades → sign-out → `/auth`.
- **Note:** no billing, so **no Stripe orphan** — this is the safe case.
- **✓ verify:** guest `auth.users` (is_anonymous=true) + posters GONE; land on `/auth` **without** auto-guest (need to click "Start creating…" for a fresh guest); poster IDs no longer resolve.

## 20. Delete-all-posters (sibling action — NOT account delete)

- **Set up:** Any signed-in user with ≥1 poster (button disabled at 0).
- [ ] Danger Zone → "Delete all posters". Description **"Permanently delete all {n} poster(s). This cannot be undone."** ConfirmModal **has NO typed-confirmation** — one click on "Delete all" after opening.
- [ ] Confirm → toast "Deleting posters…" → "Deleted {n} poster(s)." **Stays on /profile, still signed in.**
- **✓ verify:** poster rows GONE; `auth.users` UNTOUCHED; still signed in; posterCount → 0; button greys out. Do NOT conflate with account deletion — this keeps account/session/billing/localStorage, except each deleted poster's kept plot script (`postr.figure-script.<poster id>`, removed by `deletePoster` since plan item 7; the dashboard's single-poster Delete does the same).

---

# PART 5 — DOWNLOAD / EXPORT MY DATA

## 21. GDPR "Download my data (JSON)" — legal-promise-coupled

- **Set up:** Any session (A/C/D). Pre-create ≥1 poster + **one feedback submission** + one gallery entry so the blob is non-trivial.
- [ ] `/profile` → "Your data" section. Helper: **"Download everything Postr has stored for your account as a single JSON file — your posters (with full contents), gallery submissions, feedback you've sent, and your profile. Useful for backups, or to comply with GDPR Art. 15 / 20 right-of-access requests."**
- [ ] Click **"↓ Download my data (JSON)"** → button → **"Preparing…"** → downloads `postr-export-<ISO-timestamp>.json` → transient **"Data export downloaded."** (4s).
- **Edges:**
  - [ ] **Run export AFTER submitting feedback** (regression: pre-2026-06-10 this threw "column f.message does not exist" — a silent GDPR failure). Confirm the fix holds.
  - [ ] Guest export succeeds (`user.is_anonymous:true`, not wrongly blocked).
  - [ ] RPC/network fail → **"Export failed. Please try again or contact support."**
- **✓ verify:** file downloads + parses; keys `export_version`, `exported_at`, `user`, `posters`, `gallery_entries`, `feedback`; `posters[]` includes full `data` JSONB; `feedback[]` has kind/title/body/page_url (moderation `status` omitted).
- **⚠ Note:** Privacy Policy points users to the Profile buttons for portability — **this RPC is the legal-promise mechanism**; breaking it silently breaks a stated legal promise. Also: prod still grants `export_my_data`/`delete_own_account` to **anon** (bodies self-guard so not exploitable, but the revoke-from-anon migration is **un-deployed** — flag for the DB owner).

## 22. Free PDF export (ungated) — ⚠ watermark seam

- **Set up:** Any session, poster open. Allow popups.
- [ ] Export tab → "Save as PDF" → "⎙ Save PDF" (or Preview "Print / Save PDF"). Read the "🖨️ Browser Print dialog steps".
- [ ] New print tab opens sized to the poster (grid/ruler stripped), auto-opens the print dialog after fonts load. Save as PDF.
- **Edges:**
  - [ ] Popup blocked → blocking **`alert()`**: **"Popup blocked. Please allow popups for this site to use "Save PDF", or press Ctrl/⌘+P directly from the editor as a fallback."**
  - [ ] Fonts fail to load → dialog may not auto-trigger; use the manual print button.
- **✓ verify:** print tab renders without overlays; the **bottom-margin colophon appears for EVERYONE** (see seam) — a **small muted Postr logo (PNG) + the `ACKNOWLEDGEMENT_TEXT` credit**, in the margin band, never overlapping poster content. (Logo added 2026-08-06; PNG rather than inline SVG for reliable PDF-engine rendering.)
- **⚠ changed 2026-09-13:** the colophon is now anchored **bottom-RIGHT** (was bottom-left) and every dimension is a **quarter** of its former size — `font-size` 7→1.75 px, mark 9→2.25 px. The old 7 px printed at **50.4 pt**, not the "~7 pt" its docstring claimed, because `printDocument.ts` applies `zoom: 96/PX = 9.6` to the whole print root. It now prints at ≈12.6 pt. Copy is whatever `ACKNOWLEDGEMENT_TEXT` holds (`export/attribution.ts`) — do not hardcode it here.
- **⚠ format inconsistency, OPEN:** only the PDF/print colophon was resized and moved. The **PPTX** box (11 pt, bottom-left) and **LaTeX** footer (9 pt, bottom-left) are unchanged, so the credit now differs across formats. Owner decision pending — see `docs/stress-test/TRIAGE.md`.
- **⚠ SEAM / intent disagreement:** the editor PDF hardcodes `attribution: {}`, so `shouldAttribute()` is always true → **the PDF ALWAYS carries the watermark, even for a paid term/credit user.** Unlike PPTX/LaTeX, the PDF path is NOT wired to `usePlan`. **Buying the term does NOT drop the PDF watermark.** Confirm whether that's intended.

## 23. Paid editable export — PPTX (entitled; the LaTeX export is hidden, fix 25)

- **Set up:** Account **F** (term) or **G** (credits). PPTX ≤112 in/side.
- [ ] Export tab: paywall card **hidden** (canExport true), the PowerPoint button enabled, **no LaTeX button**. Pack holders see the credit hint.
- [ ] "▤ PowerPoint (.pptx)" → busy **"Building slides…"** → downloads `{title}.pptx` → **"✓ Saved"**. (Dormant while `LATEX_EXPORT_ENABLED` is off: "⌨ LaTeX source (.zip)" → **"Writing LaTeX…"** → `{title}-latex.zip`.)
- **Edges:**
  - [ ] PPTX 56–112 in → yellow half-size note, export runs at half scale ("print at 200%").
  - [ ] PPTX >112 in → **button disabled**, red note ending **"Save a PDF instead."** (no LaTeX, fix 25).
  - [ ] PPTX 56–112 in → the yellow note ends at "The note is also written inside the file." (its "use LaTeX below" sentence is behind the switch).
  - [ ] Export throws → **"Something went wrong. Try again, or use Send Feedback…"**
- **✓ verify:** files download + open in PowerPoint/Overleaf; **no Postr mark of any kind** — (a) no bottom-edge colophon text box / muted logo (PPTX) and no margin-band `textblock` colophon (LaTeX); (b) **the seeded logo mark (`ACK_BLOCK_ID`, the locked `logo` block on the canvas) is NOT in the file**: PPTX has no picture shape for it (count `<p:pic>` in `ppt/slides/slide1.xml` = the poster's own images only), LaTeX zip has no `figures/logo-N.*` for it and no `\includegraphics` of it (the user's OWN logo blocks still export); (c) the credit does not appear in the references list / `references.bib`. Only the `%%` header comment (LaTeX) and the `Company` doc property (PPTX) remain — metadata, not a visible mark. Enforced by `export/stripAckBlock.ts`, applied at the top of `exportPosterPptx`, `exportPosterLatex` and `buildLatexDocument` when `!shouldAttribute(attribution)` (pinned by `export/__tests__/ackExports.test.ts` "PAID:" cases). Credit user's `export_credits` −1 (term user: no consume call).
- **History:** before 2026-09-11 (audit H-3) only the colophon honoured `paidPlan`; the seeded logo block was still written as an ordinary picture / `figures/logo-1` in paid files, so this line's "no watermark" was false. The canvas itself still shows the locked mark to everyone — that is by design (same editor for all plans); the strip happens at export time only. PDF (§22) is unchanged: it never had the seam wired.
- **⚠ Client-side enforcement:** paywall is UI-only by design; a devtools user who flips `canExport` gets a clean export without paying (accepted launch posture).

## 24. Paywall-blocked export → forced signup → resume (nested — cross-ref §1b/1c)

- **Set up:** Account **A** (guest) or **E** (free), poster open, `canExport=false`.
- [ ] Export tab shows the upgrade card; PowerPoint **disabled** (clicking no-ops), no LaTeX button. Guest sees the "working as a guest" note.
- [ ] "Get the term"/"Get the pack" → guest branch stashes intent + `navigate('/auth?plan=…')`; free-permanent branch calls `createCheckout` directly → Stripe.
- **This is the same journey as §1b (email) / §1c (Google)** — run those branches there.
- **✓ verify:** guest routes to `/auth?plan=…` (not Stripe directly), stash set; free PDF and `.postr` remain available to the locked user; after webhook grant the Export tab unlocks on `usePlan` re-read. If webhook delayed/failed, **user pays but export stays locked, no in-app retry.**

## 25. Free `.postr` backup + Staples kiosk (both ungated)

- **Set up:** Any session, poster open.
- [ ] "📦 Save as .postr" → **"Packing…"** → downloads `{name}.postr` → **"✓ Saved"**. Helper: **"Lossless backup that bundles the poster JSON + every image. Re-import from the dashboard "+ New poster ▾" menu to restore."**
- [ ] "🏪 Email to Staples kiosk" → opens StaplesPrintModal (8-digit release-code flow; reuses the free PDF print window → inherits the popup-blocked alert).
- **✓ verify:** `.postr` round-trips (re-import via "+ New poster ▾" restores poster + images); **neither shows any paywall** (free regardless of plan); guest can back up + re-import.
- **Note:** StaplesPrintModal internal copy (email address, exact wording) was **not read line-by-line** in the trace — treat as UNVERIFIED beyond the sidebar helper; the Staples PDF is the same always-watermarked editor PDF.

---

# PART 6 — DRAFTS THAT OUTLIVE THE SIDEBAR TAB (plan item 7)

## 26. The plot checker keeps the script; the paste boxes keep their text

Record `docs/fixes/07-figure-script-kept.md`; browser instrument `apps/web/scripts/figure-script-check.mjs` (its claims are the checks below).

- **Set up:** a guest at `/p/new`. FIGURE → "Check a figure" → drag the gray preview's corner → "Python" → paste a matplotlib script → ▶ Check (the table and "Copy edited code" show).
- [ ] Every other rail tab and back to FIGURE: the script, Python and the same table (L1).
- [ ] Click a title, heading, text, table, authors or references block (the sidebar moves to that block's tab), then FIGURE: the same (L2). An image block keeps the Figure tab up, as before.
- [ ] Reload: the script, Python and the table (re-run at the size it was checked at; the gray preview itself is back at 10 × 7, by design, see record 07 §10, and a yellow line above the table says "This result is for 6.5" × 4.5", not the size above. Click Check to update it.") (L3, K5). Drag the preview after a Check: the table stays and the same line names the size it is for (K5). "Back to My Posters" → the poster's card (L7), and another poster by URL then back (L4): the same. FIGURE opens on Check when the poster has a script.
- [ ] Duplicate → "Open copy": the copy's checker is empty; Back to the original shows its script (L6).
- [ ] Select an image (Check comes up without a click), paste a script, click empty canvas: it stays on Check with the script on screen (K3). Do the same but press ▶ Check on the image first: after the click on empty canvas the table is hidden and the line reads "The last result is for an image block at 14.9" × 14.8". Click Check to check the size above."; reload: the same; select the image: its table is back once the poster has been saved (K4; on a poster never edited, the blocks get new ids on reload, so the table does not come back). A check made on the preview is hidden the same way while an image is selected, and on a second image a check made on the first is hidden. With no script (or only blank lines), the same click goes back to Make, as before. With a kept script, a click on "Make a figure", or Insert › Chart, shows Make: an explicit pick wins.
- [ ] Edit the script and ▶ Check again: the table and "Copy edited code" follow the edit. Pick the other language and ▶ Check: that language's table.
- [ ] With a table on screen, replace the script with plain notes (or base R `plot(...)` with R picked) and ▶ Check: the answer says it could not tell R from Python (or names base R graphics as not supported), and the old table stays, marked "Out of date". Change tab and come back, then reload: the same table, still marked out of date, and the answer is not said again (the line beside Check says what it reads). Fix 15 merged with 07.
- [ ] Empty the code box and reload: empty (nothing stored). devtools › Local Storage: one `postr.figure-script.<poster id>` per poster with a script; at most 10. A very long script (over 50,000 characters as stored) is not stored: it survives tab changes but not a reload. A long one that fits (about 500 lines), checked, then edited by one character: still stored, and a reload brings back the edit and the table (L8).
- [ ] Dashboard › a poster's Delete › Delete: its `postr.figure-script.<poster id>` is gone, the others stay; a delete that fails (offline) brings the card back and keeps the script.
- [ ] Authors "Paste author list", References paste box and Manual Entry, Make a figure's "Paste your table" and its answered steps, Layout's poster name (unsaved), Versions' name: type, click a text block, come back — the text is still there (S1–S7). Reload: they start empty (memory only, nothing in browser storage). Click "Parse with AI" and click a block before it answers: on return it still says "Parsing…" and cannot be clicked again; the authors are added once.
- [ ] `/tools/figure-readability`: type 6 × 4.5, R, a script, Check → reload: all of it and the table (L5). Open the page in a NEW tab: empty, 10 × 7 (P1, the shared-computer rule). Close the tab: sessionStorage `postr.figure-script-page` / `postr.figure-size-page` gone. Not measured: a browser's "reopen closed tab" (⌘⇧T) or session restore may bring that sessionStorage back (record 07 §10).
- **Not kept (by design or Later):** the image "Scan image" results (lost on a tab change, and a second image still shows the first one's rows: the FR8 family); the figures chosen in Make's last step; the editor's gray preview size across a reload.

---

# PART 7 — PRIVACY CONTROLS AND THE LEGAL PAGES (record 24)

## 27. Global Privacy Control, the analytics address, the feedback log, the legal pages

Record `docs/fixes/24-legal-canada-law25.md`; browser instrument `apps/web/scripts/analytics-privacy-check.mjs` (claims G1, R1, B1, T1; `--live https://www.postr.sh` reads the deployed site, read-only: L1, L2); the owner's internal file `docs/legal/quebec-law-25.md`.

- [ ] **GPC on:** Firefox → Settings → Privacy & Security → "Tell websites not to sell or share my data" (Global Privacy Control) ON, or Brave / DuckDuckGo. Open `/`, `/pricing` and the editor: devtools › Network shows **no** request to `/_vercel/insights/` and `window.va` is undefined (G1). Turn GPC off and reload: one `script.js` and one `view` request per page view.
- [ ] **What a page view sends (production):** devtools › Network › `view` request payload: `o` is the page address with no query string, and for an editor page `https://www.postr.sh/p/[redacted]` (R1), also when the address is typed as `/P/<id>`, which opens the same editor (review round 1); `r` appears only on the first page view when you arrived from another site. The request's Referer header is `https://www.postr.sh/` only, never `/p/<id>` (B1, `Referrer-Policy: strict-origin` from `vercel.json`). Application › Storage: no Vercel entry, no cookie.
- [ ] **Feedback log opt-in:** make an import or a Copy a design fail (e.g. an image the reader cannot use) → "Send feedback": "Attach {file}" is ticked, **"Include console log" is unticked**; send → the `feedback` row's body has no `--- CONSOLE LOG` section. Tick it and send → it does.
- [ ] **Terms line on `/auth`:** on the page as it opens (sign-in mode), then after "Sign up", and on `/auth?plan=term`: one line right under "Continue with Google", above "or use email", in the first view, says "By continuing, you agree to the Terms of Service" and that the Privacy Policy explains how information is handled (not that the user agrees to it), and links Terms of Service, Privacy Policy, Conditions d’utilisation and Politique de confidentialité (T1; review round 2: it used to appear only in sign-up mode, under the email form, while "Continue with Google" creates an account in either mode).
- [ ] **Legal pages:** `/privacy`, `/cookies`, `/terms` and their `/fr` twins: the Privacy Officer box names a role of Resila Technologies Inc. (no person, no President); Vercel, Render and Supabase head the recipients table; the rights table says how to use each right today; the Terms say prices are before tax, cancellation takes effect at the end of the paid period (unused term: full refund within 14 days, ends at once), PowerPoint only, and keep a Quebec consumer's own court. Since review round 2: Privacy §8 does not list page counting as a private default and says it is on by default; Privacy §6 and Cookies §4 say Vercel may record an approximate location, device type, operating system and browser; Privacy §15 names Canada's adequacy and offers to say which safeguard covers a provider; on the Terms, a bold line "The following clause does not apply to consumers in Quebec…" comes right before §5.5, §10, §11 and the "Continued use…" sentence of §13; the French pages read « Juridique », « 18,99 $ CA », « lot d’exportation ». `pages/__tests__/legalPagesContent.test.tsx` checks the same list.
- [ ] **After a deploy (once):** from `apps/web`, `node scripts/analytics-privacy-check.mjs --live https://www.postr.sh` exits 0: with GPC on, no analytics script, queue or page view (L1); every page view's Referer is the origin only (L2); every document has `Referrer-Policy: strict-origin`. Before this branch deployed it exited 1 (L1 8 of 8, L2 6 of 6; record 24, section 9).

# PART 8 — A SELECTED BLOCK'S CONTROLS (plan item 19)

## 28. The controls are one size on screen at every zoom

Record `docs/fixes/19-controls-one-size.md`; browser instrument `apps/web/scripts/control-size-check.mjs` (its claims are the checks below, in Chromium, Firefox and WebKit).

- **Set up:** a guest at `/p/new` (the 3-column template). Click the title.
- [ ] FIT, then Zoom out until it stops (20%), then Zoom in until it stops (1000%), and a pinch: the square handles (8 px, in a 24 px area you can grab), the round move and delete buttons (20 px circles in 24 px areas), the type label and the rotate control below the block stay the same size on screen, and crisp, at every zoom (S, Sw, Sp).
- [ ] Each control a user grabs is at least 24 px at the 1280 × 800 fit, at 100% and at the 2560 × 1440 fit (T-fit); none sticks out of the canvas or lies under the zoom bar while the whole poster shows (R); selecting a block at the fit adds no scrolling (Ov); an unrotated block's own controls never overlap (Oc).
- [ ] A block small on screen (Q2): under 72 px along an edge, no handle in the middle of that edge; under 24 px tall (the title at 100%), only the bottom row of handles; under 24 px on both axes (a logo at 20%), only the bottom-right handle and the move button; under 120 px wide, no type label (Cm).
- [ ] A handle row wider than its block (review F3): insert a 3 in image and a 3 × 2 in logo and select each at FIT on a 1280 × 800 window, at 100% and at FIT on 2560 × 1440: move, replace, crop, delete and the rotate control all show, though the row (108 px) is wider than the block (Fr). Zoom out under 35% with a block narrower than its row selected (a wide, thin logo, or the template's image at 30%): only the move button shows, and no rotate control; at 35% the row comes back. With only the move button showing, press Delete (or Backspace), or right-click the logo › Delete: it goes (Cm; the keys and the menu: `controlsOneSize.test.tsx`).
- [ ] Zoom out until it stops (20%) with the template's image selected, then click each other block at its centre; again at 35%: no click deletes the image, opens the file picker or turns crop mode on (Fd). Some clicks still select nothing, where a handle, the move button or the rotate control lies on that block's centre (Ns, information).
- [ ] A wide logo (15 × 2 in, so its whole row fits) at the bottom edge of a portrait poster (36 × 48 or 24 × 36), at FIT: its rotate control is the last button of the row above it, not under the zoom bar. Zoom in, scroll so a selected block's bottom is near the canvas's bottom: the rotate control moves into the row; scroll back: it goes below again. Make the window narrower at a manual zoom so the zoom bar moves under it: it moves into the row (Rr).
- [ ] Turn a block half a turn (drag its rotate control round it until it snaps at 180°): the handle row sits upright under it, clear of its handles, and the rotate control above it; at 100%, click each handle's square: the block stays where it is and the same size (Or, Pl-rot, Or-click). At other turns (10°, ±90°, ±135°, ±170°) the upright row can lie on one handle, as on main (the Later list).
- [ ] A table: click it; its row and column strips (left of and above it) and the column-border grips are one size on screen; click elsewhere: the strips are as before (8 sheet units).
- [ ] An image › Crop: the four edge handles and the ✕ ↺ ✓ bar stay one size as you zoom, in every frame while the zoom changes (no pulse after a Zoom in click or a pinch; St).
- [ ] Shift + click a second block: the group's dashed outline (1.5 px) and its handles stay one size; a group small on screen draws fewer handles, by the same rule.
- **Not changed (the Later list, PLAN.md):** a group's members still draw their own controls under its frame (Q5); the crop bar lies on the rotate control (Q6); table strips show on an unselected table and sit under its handles, and on rows under 24 px they are too short to grab comfortably (Q7); the group frame sits below text blocks by their stored height (Q8a); the format toolbar stays behind after a pinch (Q8b); the zoom bar's own buttons are under 24 px (Q9); 44 px sizes for touch; a selected block's own border and the crop frame still grow with the zoom; Save PDF with a block selected prints its controls (on main too); zoomed far out (20–35%), a selected block's handles, move button or rotate control can still lie on another block's centre, so a click there reaches the control and selects nothing (review F3's remainder; no longer Delete, Replace or Crop: Fd); under 35% replace and crop need the image wider on screen than its row, and the Figure tab's crop hint names the ✂︎ button even where it is not drawn.

# PART 9 — ONE UNDO HISTORY (plan item 12)

## 29. Undo and redo work the same from every field of the poster

Record `docs/fixes/12-one-undo-history.md`; browser instrument `apps/web/scripts/undo-history-check.mjs` (its claims are named after each check). Do it in Chrome, Firefox and Safari, with a real keyboard: what each OS sends for ⌘⇧Z and Ctrl+Shift+Z, the real Edit menu and the right-click menu were not driven by the harness.

- **Set up:** any poster in the editor.
- [ ] Type two words at the end of a text block, " hello world", without pausing. ⌘Z with the caret still in the block: only "world" goes, the toast says "Undo", and the caret sits where "world" was. ⌘Z again: "hello " goes. ⌘⇧Z: "hello " comes back and is selected; ⌘Y (Ctrl+Y) redoes "world" (W1, U1, U2, K1).
- [ ] The same after clicking the empty canvas: the same steps, and the block gets the caret back (U3–U5, K1). Type, pause a few seconds in the middle of a word, finish it: one ⌘Z removes the whole word (W2).
- [ ] Enter, a paste, cutting or deleting a selection, and the toolbar's B are each one step of their own; the word typed after one is undone on its own (F-*). After Enter and typing, the new line stays on its own line on screen (W3; note: the line break is not saved, see the record's §10 and the plan's Later list).
- [ ] Style › Font, then click into a text block and ⌘Z: the font change is undone (U6). Delete an image with Backspace, click into a text block, ⌘Z: the image comes back (E7). Type in block A, click into block B, ⌘Z: A's typing goes and A gets the caret (U8, K2).
- [ ] From Authors › Author name, Edit block › Font size (type 60), the Content box, the caption field, the caption-spacing slider and a select: ⌘Z there undoes the poster's last step (the field's own change when it was the last), never the browser's per-field undo (U9, bsf, E1, E17, E2). In the Content box the caret stays in the box.
- [ ] Type in a table cell: the letters keep their order ("abc" stays "abc"); one ⌘Z removes the word; 55 characters in a cell do not push an earlier change out of the history (U12r, U12, U12e).
- [ ] The Figure tab's code box, Layout › Poster name, Versions' name, the Authors and References paste boxes, References' Manual Entry, the style preset name and the guidelines' notes keep the browser's own undo for their own text, and ⌘Z there never changes the poster (in Chrome and Safari, pressing ⌘Z on past the field's own steps does nothing) (E4, N1).
- [ ] With the size dialog open (Layout width ↑ Enter), in Copy a design, in the palette designer, or in Preview: ⌘Z changes nothing on the poster and the focus stays in the dialog; a text field in a dialog keeps its own undo (E15, E14).
- [ ] The Undo and Redo buttons at the left of the editor's top bar (a strip across the whole window, above the sidebar and the poster): both greyed on a freshly opened poster; Undo enabled after an edit; each does what the keys do. Nothing of the poster is ever under them: select a logo in the sheet's top-left corner at Fit, on a square poster (48 × 48) and on a wide one (48 × 30) with the sidebar hidden, and check its move button is clear (B4). At 1280 px wide, with both side panels open in a 900 px window, and on a phone (the "not optimised for phones" strip at the bottom), the bar shows both buttons whole (B4o). Keyboard: they come first in the page, so Shift+Tab from the poster reaches them (Safari: Option+Shift+Tab, or turn on "Press Tab to highlight each item"); on a poster with a table forward Tab from the poster stops in the table's last cell (an older defect, the plan's Later list) (B1, B1t). Enter or Space presses them and the focus stays on the button: pressing again undoes (or redoes) again and never types into the poster (B2). A click with the mouse puts the caret back in the text the step changed. With the sidebar hidden they sit right of its Show button, which is in the bar too.
- [ ] Type two words in a text block, click the empty canvas, Shift+Tab to Undo and press Enter: no block shows as selected. Again without the click (the block stays selected, as for a keyboard-only user): in both cases press each of ←, →, ↑, ↓, Backspace, Delete and ⌘D (Ctrl+D) on Undo: nothing on the poster moves, goes or is copied, Redo stays enabled and the focus stays on Undo; the same on Redo. Select a table column by its handle (or drag across cells), Shift+Tab to Undo, Backspace: the column (the cells' text) stays (B3, B3k, B3r, B3s, B3t). Control: with a block selected and the focus off the buttons, the arrows still nudge it. Nudge a selected block twice, click Undo with the mouse, press →: in Chrome and Firefox the click leaves the focus on Undo (while there is still something to undo), so the arrow does nothing until the poster is clicked; in Safari it nudges the block (record 12 §10, the merge review's finding 7).
- [ ] Every drag is one step: crop an image by dragging an edge back and forth for a while, Apply, then one ⌘Z removes the whole crop and the next ⌘Z undoes what came before it (G1, G2); drag a selected table's column border, then one ⌘Z (G3); drag Edit block › Caption spacing, and Line spacing holding still midway, then one ⌘Z each (G4, G5). Moving, resizing and turning a block were one step already.
- [ ] With nothing to undo, ⌘Z shows nothing (U16). 60 arrow-key nudges are all undone by 60 ⌘Z (U17, 100 steps).
- [ ] Versions › Restore › Restore, then ⌘Z: the poster as it was before the restore, and the edits before that are still undoable; ⌘⇧Z restores the version again (V1).
- [ ] The selection toolbar (and its copy above the Content box) has no A+/A− and no alignment buttons; text size is Edit block › Font, heading alignment is Style › Headings (TB).
- [ ] Select a text block, Edit block › colour: drag around the picker, close it, ⌘Z: the colour from before the drag comes back in one press (W4; the harness fires the picker's events, a real drag is this check).
- [ ] Type " ZQAB" in a text block, select "B" (Shift+←), ⌘C, ⌘↓, ⌘V, type "CD": ⌘Z removes "CD", the next ⌘Z the pasted "B" (W5). The same in Authors › Author name: one pasted character is a step of its own.
- [ ] Put the caret in front of a word and type a new word that starts with the same letter, with a space after it (e.g. "a " in front of "about"): ⌘Z removes the new word alone (W6).
- [ ] With the caret in Authors › Author name after typing, use the browser's own Edit › Undo (menu bar, or right-click › Undo): the poster's history undoes, or nothing changes; the field and the poster never disagree, and ⌘Z afterwards never brings text back (E5i, with the real menus the harness does not drive).
- [ ] On a Dvorak layout, ⌘ with the key that types ";" (where QWERTY has Z) does not undo, and ⌘ with the key that types "z" does; on a Cyrillic layout ⌘Я and ⌘Н (the Z and Y keys) undo and redo.
- [ ] With an input method (Japanese, Chinese, Korean), a dead key (Mac: Option+E, then e) and a phone's keyboard, in a text block, a table cell and Authors › Author name: type a few words; each ⌘Z removes one whole word, never showing letters or kana that were on the way ("にほんg"); in Chinese each composed word is one step; 12 words do not push an earlier change out of the history. Firefox and Safari by hand: the harness drives Chromium's own IME only (I1–I7). Cancel a composition with Escape: the text is as before; note that the next ⌘Z then shows "Undo" and changes nothing, and a redo held before is gone (record 12 §10).
- [ ] On a Mac, Ctrl+Y redoes (owner decision 1), so the system's Ctrl+K / Ctrl+Y (kill to the end of the line, then yank it back) no longer brings the text back in a text block; ⌘Z undoes the kill (an owner question, record 12 §10).
- [ ] Select a word in a text block and drag it to another place in the same block, then ⌘Z once: note whether the word goes back where it was, or is missing from both places until a second ⌘Z (the harness cannot drive a native text drag; the second case would be two steps, the plan's Later list).


# PART 10 — AUTO-ARRANGE AND THE POSTER'S NUMBERS (record 28)

## 30. Auto-Arrange lays the body out in columns; numbers follow the reading order

Record `docs/fixes/28-auto-arrange.md`; browser instrument `apps/web/scripts/auto-arrange-check.mjs` (its gates G1–G13 are named after each check; Chromium, Firefox and WebKit). The function is the owner-approved prototype's (`docs/fixes/28-auto-arrange-lab.html`, open it in a browser to compare), with its widths then refined in 0.05 in steps (record 28 §9, review finding B-R3).

- **Set up:** a guest at `/p/new` (the 3-column template). Type a few sentences into each text block.
- [ ] Layout › Auto-Arrange: the poster keeps its three columns; the blocks keep their order down each column, then the next (a block may move to the next or previous column); column widths may differ; the title and authors do not move; no text changes size (G1, G2). Nothing overlaps (G3).
- [ ] The section numbers and "Figure N." / "Table N." are the same before and after (G4). One Undo (top bar, or ⌘Z) puts every block back (G5). Pressing Auto-Arrange again moves nothing, and adds no undo step: after it, one Undo goes back to the poster before the first press (G7).
- [ ] Drag the authors block to the foot of the sheet, then Auto-Arrange: the authors block stays there, the columns start 0.6 in under the title and end at least 0.6 in above the authors block (G13; review finding B-R1: the body used to be laid out under the authors block, off the sheet).
- [ ] Drag one text block about 5 in to the right (part of the way across its column), then Auto-Arrange: the poster still has three columns (G12; B-R2: it used to come back with four).
- [ ] The click feels immediate: under 300 ms to the new layout on the largest template (G6; MEASURED: the largest template 138 ms in WebKit, any poster at most 183 ms; four columns on a 72 × 48 sheet take 0.5 to 0.7 s, on the Later list).
- [ ] Paste long text into every text block (or use a 48 × 24 sheet), Auto-Arrange: the layout runs past the bottom margin; Issues › "Past the bottom margin" gives the area in in², and it shrinks as you shorten text or make a figure smaller, and goes when it fits (G9).
- [ ] Drag a heading to the top of another column: it takes its number from where it now sits, and the headings after it renumber. Select a heading, ⌘D, and drag the copy to the top of column 1: the copy is section 1 (a copy used to take the last number wherever it sat). Right-click a figure › Bring Forward or Send Back: no number changes. Put two figures in columns 1 and 2, the one in column 1 lower: it is still Figure 1.
- [ ] Export › Preview poster: every figure and table shows its "Figure N." / "Table N." and caption, the same as the canvas (G10). Save as PowerPoint (paid): the same numbers.
- [ ] On the welcome poster: Issues already lists about 26 in² past the bottom margin before any press (the seed as shipped; B-R6). Auto-Arrange gives three columns and lowers it to about 24 in² (24.4 / 24.6 / 23.8 in Chromium / Firefox / WebKit, MEASURED); the credit mark is not covered.
- [ ] After Auto-Arrange, drag a block of the last column straight down: note how far it moves sideways out of line with its column (up to 0.25 in; review finding B-R4, Later).
- **Not changed (record 28 §10, the plan's Later list):** a heading can end a column with its text at the top of the next one; a wide figure or band becomes one column wide (no spanning); on a crowded poster of figures a column can be left empty (the drawn poster then shows one column fewer); Auto-Arrange never adds or removes a column itself; a figure never shrinks; logos below the header stay where they are; four columns on a large sheet take 0.5 to 0.7 s.
---

## Quick findings summary (things the trace flagged as broken/unverified/contradictory)

**Fixed 2026-09-11 (lifecycle audit `docs/plans/2026-09-10-lifecycle-evaluation.md`, branch `claude/core-features-mvp-lifecycle-66ddcd`):**

- [x] **P0-1 term refund never cancelled the sub** — `apps/api/src/billing.ts` refundTerm + `billing/termCancel.ts` + `billing/refundLedger.ts`; client `profile/SubscriptionPanel.tsx`, `data/billing.ts requestRefund`. §16.
- [x] **P0-2 duplicate term / user-id-scoped revoke** — `billing/subscriptionGuard.ts` (`hasActiveTerm`, `termAdvanceDecision`, `canRevokeTerm`) wired in `billing.ts` create-checkout (409) + `handleSubscriptionChange` / `advanceTermAccess`; client `data/billing.ts AlreadySubscribedError`, `pages/Auth.tsx`, `poster/sidebar/EditableExportButtons.tsx`, `components/PricingSection.tsx`. §11, §17.
- [x] **P0-3 account delete orphaned the sub** — `apps/api/src/account.ts` + `storageCleanup.ts` + `billing/termRow.ts`; migration `20260911000000_account_delete_hardening.sql`; client `data/account.ts`, `profile/accountDeletion.ts`; pgTAP `account_deletions_test.sql`, `delete_own_account_test.sql`, `rpc_definitions_test.sql`. §18.
- [x] **P0-4 Profile Google sign-up orphaned guest posters** — `profile/GuestConversionCard.tsx` via `lib/convertGuest.ts` (`linkIdentity`); test `pages/__tests__/Profile.guestConversion.test.tsx`. §7. **Owner:** Supabase Auth → "Allow manual linking" must be ON in prod.
- [x] **H-3 logo in paid exports** — `export/stripAckBlock.ts` used by `export/pptx/writer.ts` + `export/latex/exportLatex.ts`; test `export/__tests__/ackExports.test.ts`. §23.
- [x] **H-6 Profile email conversion false success** — `profile/GuestConversionCard.tsx` (`convertGuestWithEmail`, "Check your inbox", resend). §8.
- [x] **H-8 stale credit balance** — `hooks/usePlan.ts` `refresh()` / `applyCredits()`; `data/billing.ts consumeExportCredit` + `NoExportCreditError`; `EditableExportButtons.tsx`. §13.
- [x] **H-10 refund expand on a removed field** — `billing/invoicePayments.ts` (`latest_invoice.payments` + `invoicePayments.list`; the 5-level expand is refused by the API, sandbox-verified). §16.
- [x] **H-11 charge.refunded dead on Basil** — `billing/refundReconcile.ts` (`charge.refunded` + `refund.created` + `refund.updated`; partial term refunds revoke nothing). §17. **Owner:** enable `refund.created` + `refund.updated` on the webhook endpoint.

**Still open:**

- [ ] **§1b data continuity** — `/auth` uses `signUp` not in-place `updateUser`; guest posters may be orphaned on paid conversion. **HIGH.**
- [x] ~~**§18 Stripe orphan** — deleting an account with an active term keeps billing the user; no warning.~~ **FIXED 2026-09-11 (P0-3, above).**
- [ ] **§18 copy bug** — "a new guest account will be created" is false (lands on bare `/auth`).
- [x] ~~**§18 RPC swallow** — `delete_own_account` failure leaves orphaned auth row silently.~~ **FIXED 2026-09-11**: the RPC is no longer callable from the browser; `POST /account/delete` surfaces every failure (generic copy) and leaves the account intact.
- [ ] **§22 PDF watermark** — always applied, even for paid users (PDF not wired to `usePlan`).
- [ ] **§5 password reset** — no `redirectTo`, no in-app set-new-password screen; can't complete in Postr's UI.
- [ ] **§7 Google conversion** — depends on Manual Linking being ON; else orphans guest data.
- [ ] **§9 AuthGuard** — no stale-JWT self-heal + no getSession error handling; doc's `ensureSession`-in-guard claim is wrong.
- [ ] **§21 GDPR** — legal-promise-coupled; anon grant still un-hardened in prod.
- [ ] **§16 cancel** — link.com root, not a customer portal deep link; unverified a user can actually cancel.
- [ ] **Errors** — several auth flows show **raw Supabase error strings** (violates the generic-error convention).
