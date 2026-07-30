# Postr — Manual Admin Testing Flow Map

Walk-through checklist for the **admin and launch-gated surfaces**. Parts 1–6 cover payment, sign-up, account deletion, and data download; Part 7 covers the Presentation Checker direct route and its flag-gated editor Review tab. Priority order leads with the **nested payment + sign-up** journeys.

> **Route legend:** `/auth`, `/pricing`, `/p/:posterId` (editor), `/profile`, `/billing/success`, `/billing/cancel`, `/presentation-checker`.
> **All copy in quotes is verbatim from the code** — if what you see on screen differs, that's a finding.

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
| H | **Presentation review buyer** | C/D with a `review_pack` checkout; repeat with an active `review_addon` | Initial review reservation/refund, weekly quota, duplicate checkout protection |

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
- [ ] **Stripe orphan on account-delete** — delete an account holding an **active sub**, then confirm in Stripe sandbox the subscription **keeps renewing** (see Delete §18 risk).
- [ ] **`plan`/`plan_expires_at`/`subscription_status`/`stripe_*` columns** — client can't write these (guard trigger). Query Supabase directly to verify grants.
- [ ] **Supabase Auth Site URL / Redirect URLs** — confirmation-link + OAuth-return destinations depend on these. Recurring post-deploy miss. Verify `https://www.postr.sh` is set. Redirect URLs must include `{origin}/auth` and `{origin}/dashboard`.
- [ ] **Presentation Checker quality gate** — the frozen corpus manifest currently has no rated items and no freeze timestamp. Do not enable or index the feature until real Gavin ratings, live-provider results, costs, and threshold decisions are recorded.
- [ ] **Review Stripe products** — configure and manually exercise `STRIPE_PRICE_REVIEW_PACK` and `STRIPE_PRICE_REVIEW_ADDON`, including paid/async success, duplicate delivery, stale subscription events, and cancellation.
- [ ] **PPTX review worker** — requires an isolated LibreOffice-capable Render worker plus server `REVIEW_PPTX_ENABLED=true` and client `VITE_ENABLE_REVIEW_PPTX=true`. Keep both false until deploy and smoke tests pass.
- [ ] **Review temporary storage** — verify an object-lifecycle policy removes `poster-assets/{user_id}/review-temp/*`; application rollback is not a substitute for lifecycle cleanup.

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
- [ ] On `/auth?plan=term`: **guest card is GONE**, replaced by banner **"Term · CA$18.99 / 4 months"** + **"Create your account below to continue to secure checkout."** Mode defaults to **signup**.
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
- [ ] Hit `/dashboard`, `/p/:id`, `/profile`, `/admin/gallery` → pulsing **"Loading…"** → redirect to `/auth`.
- [ ] Signed-in → page renders after brief "Loading…".
- [ ] Sign out on a guarded page → bounced to `/auth`.
- **⚠ Findings to note:**
  - [ ] AuthGuard uses **plain `getSession()`, no self-heal** — a stale/invalid cached JWT **passes** and renders children (the stale token only surfaces on the first real API call). Contradicts feature-graph §7's claim that `ensureSession` heals the guard. **Code wins — flag the doc.**
  - [ ] `getSession()` has **no `.catch`/timeout** — a network failure can strand the user on "Loading…" forever.

## 10. Session-expired modal (global self-heal is warn-only)

- **Set up:** Signed-in, editor open; revoke the refresh token (or let it expire).
- [ ] On `SIGNED_OUT` with a prior session → full-screen 🔒 **"Your session has expired"** modal, body warns unsaved edits since expiry were **not** saved.
- [ ] "Reload and sign in again" → full page load to `/auth`. "Dismiss (save text first)" → keeps editor open but **session stays dead** (autosaves keep 401ing silently).
- **Edge:** fresh unauthenticated load does NOT show the modal (no false positive).
- **Note:** this modal does NOT re-auth or preserve edits — warn-only.

---

# PART 3 — PAYMENT & SUBSCRIPTION

> Grant always happens via **webhook**, never the success page. See the ⚠ callout for everything that needs the Stripe sandbox.

## 11. Buy the TERM (recurring 4-mo sub) — signed-in permanent

- **Set up:** Account **E** (permanent free, 0 credits), poster open. API env must have `STRIPE_SECRET_KEY`, `STRIPE_PRICE_TERM`, `STRIPE_WEBHOOK_SECRET`, `APP_ORIGIN`, service_role; `VITE_API_BASE_URL` non-empty.
- [ ] Editor → Sidebar **Export** tab → "✎ Editable formats". Paywall heading **"Keep editing in PowerPoint or Overleaf"**, body **"Your PDF export is free. Unlock clean PowerPoint & LaTeX with the CA$18.99 term (renews every 4 months, cancel anytime), or a CA$9.99 3-export pack whose credits never expire."** Both export buttons disabled.
- [ ] Click "Get the term" → full-page redirect to Stripe hosted checkout. Pay with a **test card**.
- [ ] Return to `/billing/success` → check icon + **"You're all set"**. Page polls (`refreshSession` at 2.5s, "waited" at 6s).
- [ ] Once the webhook lands + refresh fires → copy switches to **"Your term is active. Editable PowerPoint and LaTeX exports are unlocked — no watermark."**
- [ ] "Back to your posters" → `/dashboard`; return to Export tab: paywall gone, PPTX/LaTeX enabled.
- **Edges:**
  - [ ] Webhook lands after page load → **"Payment received — finalizing your account. This takes just a moment."** then after 6s **"Payment received. Your access will appear shortly — head back in and it'll be ready."** (expected latency).
  - [ ] Misconfigured API → generic **"Something went wrong. Try again, or use Send Feedback…"** alert.
  - [ ] `VITE_API_BASE_URL` empty → same generic alert (throws before network).
  - [ ] Rate limit (>10/window, >40/day) → 429 → generic alert (no dedicated copy).
  - [ ] **⚠ webhook secret wrong** → 400 invalid_signature → **no grant ever**, success page stalls forever on "access will appear shortly".
- **✓ verify (query Supabase):**
  - [ ] `plan='term'`, `plan_expires_at` ~4 months out, `subscription_status='active'`, `stripe_subscription_id` + `stripe_customer_id` set.
  - [ ] Landed on `/billing/success` (not `/cancel`).
  - [ ] `[data-postr-export-pptx].disabled === false`, upgrade panel absent.
  - [ ] A PPTX/LaTeX export now has **no watermark**.
  - [ ] `billing_fulfilled_sessions` NOT written for term (pack-only).
- **⚠ Basil breaking change:** period end reads `items.data[0].current_period_end`; if absent it **throws → 500 → retry**. Verify the pinned `2026-02-25.preview` API version returns item-level period end in sandbox.

## 12. Buy the PACK (one-time, 3 credits) — signed-in permanent

- **Set up:** Account **E**, `STRIPE_PRICE_PACK` set.
- [ ] Same paywall → "Get the pack" → Stripe (mode `payment`, no subscription) → pay.
- [ ] `/billing/success` → once credits show: **"Your export pack is ready — 3 exports to use whenever. Credits never expire."**
- [ ] Editor hint: **"3 exports left in your pack — each PowerPoint or LaTeX export uses one. Credits never expire."**
- **Edges (Stripe sandbox):**
  - [ ] **Replay the event** → idempotent, credits NOT double-granted (`billing_fulfilled_sessions` unique key).
  - [ ] Unpaid async completion → no grant until `async_payment_succeeded`.
  - [ ] `grant_export_credits` RPC error → 500 → Stripe retries.
- **✓ verify:** `export_credits=3`, `plan` **still 'free'**, `plan_expires_at` unchanged, `stripe_customer_id` set, one `billing_fulfilled_sessions` row.

## 13. Consume a credit (pack holder)

- **Set up:** Account **G** (credits>0, no term), poster open, PPTX within size limits.
- [ ] No paywall; credit hint visible. Click "PowerPoint (.pptx)" → file downloads → button shows **"✓ Saved"**.
- [ ] After the file is produced, `POST /billing/consume-credit` fires (term holders skip this).
- **Edges:**
  - [ ] consume-credit fails (network/500/409) → **swallowed**, logged only, export NOT marked failed — user may keep a credit they used (revenue leak, accepted).
  - [ ] Two concurrent exports racing to 0 → atomic RPC prevents negative; second gets 409 no_credit but file still downloaded.
  - [ ] Export job throws → alert, credit NOT spent.
- **✓ verify:** `export_credits` −1 per successful export; failed export doesn't decrement; term holders never call consume-credit; exported file has no watermark.

## 14. Cancel checkout (`/billing/cancel`)

- **Set up:** Reach Stripe hosted checkout via any flow, then back out.
- [ ] Redirect to `/billing/cancel` → **"Checkout cancelled"** + **"No charge was made. Your poster is exactly as you left it — you can keep editing for free, or pick up checkout again anytime."**
- [ ] "Back to editing" → `window.history.back()`; "See plans" → `/pricing`.
- **✓ verify:** users row unchanged (`plan='free'`, credits unchanged, no `stripe_subscription_id`, no fulfilled-session row), paywall still shows, no Stripe charge. If account-first, the **account still exists** (no longer a guest) even though payment was cancelled — expected.

## 15. Renewal — ⚠ webhook only, no app UI

- **Set up:** Account **F** (active term). Fast-forward the sub clock in Stripe sandbox.
- **✓ verify (Supabase only):** `invoice.paid` → `plan_expires_at` advanced (forward-only), `subscription_status='active'`. Redelivered/stale event = safe no-op (never retreats). **No app artifact.**

## 16. Cancel subscription — ⚠ done at link.com, not in Postr

- **Set up:** Account **F** on `/profile`.
- [ ] "Subscription" section shows (because `hasActiveTerm`). Copy: **"Your term is active — PowerPoint and LaTeX export are unlocked, no watermark."** + **"The term renews every 4 months. Manage it — update your card, see receipts, or cancel — at Link, which handles billing for Postr."**
- [ ] "Manage subscription at Link ↗" → opens `https://link.com` in a new tab. **No in-app cancel.**
- **⚠ UNVERIFIED:** the link goes to link.com **root**, not a customer-specific portal deep link. Confirm a real customer can actually find + cancel THIS sub from link.com's root.
- **After cancel-at-period-end (Stripe sandbox):**
  - [ ] `customer.subscription.updated` (cancel_at_period_end, still 'active') → access **retained** to period end, `subscription_status` stays 'active'.
  - [ ] At period end `customer.subscription.deleted` → `plan='free'`, `plan_expires_at=now()`, `subscription_status='canceled'`; paywall returns; Subscription section disappears.
- **past_due variant:** inline warning **"There's a payment issue on your latest renewal — update your card at Link to keep your term."**

## 17. Revocation / past_due / terminal — ⚠ webhook only

- **Set up:** Account **F**; force a failed renewal card in Stripe sandbox.
- **✓ verify:**
  - [ ] `past_due` → access KEPT (past_due is in TERM_ACTIVE_STATUSES), `plan` still 'term', expiry future, Profile shows the yellow warning. **No revoke on first past_due.**
  - [ ] Terminal (unpaid/canceled/incomplete_expired) → `plan='free'`, `plan_expires_at=now()`, `subscription_status` terminal → paywall returns.
  - [ ] Natural lapse without a terminal webhook → `usePlan` still expires access client-side once `plan_expires_at` passes (the only non-webhook safety net).

---

# PART 4 — DELETE ACCOUNT (/profile → Danger Zone)

## 18. Delete PERMANENT account (happy path)

- **Set up:** Account **C or D**, laptop viewport, ≥1 poster (+ ideally a gallery entry and a feedback row to test differential cascade). **Note `user_id` + poster IDs first.**
- [ ] `/profile` → red **"Danger Zone"** → "Delete account" DangerAction. Description: **"Permanently delete your account and all associated data. You will be signed out and a new guest account will be created."** *(← this outcome text is WRONG, see risk.)*
- [ ] Click → ConfirmModal, title **"Delete account"**, message **"This will permanently delete your account, all posters, and all preferences. You will be signed out. This action cannot be undone."**, button **"Delete my account"**.
- [ ] Typed-confirmation required: **"Type I confirm the deletion of my account to confirm:"** — button disabled until exact (case-insensitive, trimmed) match; input turns green on match.
- [ ] Type the phrase → confirm → toast **"Deleting account…"** → posters deleted → `delete_own_account` RPC → localStorage cleared → global sign-out → `/auth` (the **sign-in** screen).
- **Edges:**
  - [ ] Wrong/partial phrase → button stays greyed, no error string.
  - [ ] **RPC failure is SWALLOWED** (`console.warn` only) → posters gone but `auth.users`/`public.users` may **survive** — partial-delete / orphaned account, no visible error. **Flag it.**
  - [ ] Network fail in the poster-delete step → error banner, account NOT deleted (RPC never runs), safe to retry.
  - [ ] `SIGNED_OUT` race → both the explicit navigate and AuthGuard's listener target `/auth`.
  - [ ] SessionExpiredModal may briefly flash the 🔒 dialog over `/auth` on an intentional delete — confusing artifact; note if you see it.
- **✓ verify:**
  - [ ] `auth.users` + `public.users` rows GONE; posters/presets/assets/library/user_logos/gallery_entries/poster_comments/poster_versions/talk_waitlist/billing_fulfilled_sessions cascade GONE.
  - [ ] **`feedback` rows SURVIVE with `user_id=NULL`** (SET NULL, not cascade) — differential contract.
  - [ ] Storage objects (thumbnails/uploads) NOT deleted synchronously — orphan until the nightly cron; verify they exist immediately post-delete, then that cron removes them.
  - [ ] 6 localStorage keys cleared: `postr.style-presets`, `postr.scratch-pad`, `postr.scratch-note`, `postr.checklist-templates`, `postr.profile`, `postr.onboarding-done`.
  - [ ] Land on `/auth` sign-in screen (**no auto-guest** — bare `/auth`, not `?guest=1`).
  - [ ] Email is re-usable — sign up again with it succeeds.
- **⚠ HIGH RISK — Stripe orphan:** billing lives as **columns on `public.users`**; deleting cascades them away, but **nothing in the delete path calls Stripe**. A permanent user with an **active term** who deletes **keeps being billed** — the sub is orphaned and Postr has erased the `stripe_subscription_id` needed to reconcile. **No warning shown to a paying user.** Verify in Stripe sandbox: delete Account **F**, confirm the sub keeps renewing.
- **⚠ Doc/code disagreements to flag:**
  - Doc calls this a "delete-account edge function" — real impl is the Postgres RPC `delete_own_account` (no edge function exists).
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
- **✓ verify:** poster rows GONE; `auth.users` UNTOUCHED; still signed in; posterCount → 0; button greys out. Do NOT conflate with account deletion — this keeps account/session/billing/localStorage.

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
- **✓ verify:** print tab renders without overlays; **colophon "Poster made with postr.sh" appears for EVERYONE** (see seam).
- **⚠ SEAM / intent disagreement:** the editor PDF hardcodes `attribution: {}`, so `shouldAttribute()` is always true → **the PDF ALWAYS carries the watermark, even for a paid term/credit user.** Unlike PPTX/LaTeX, the PDF path is NOT wired to `usePlan`. **Buying the term does NOT drop the PDF watermark.** Confirm whether that's intended.

## 23. Paid editable export — PPTX / LaTeX (entitled)

- **Set up:** Account **F** (term) or **G** (credits). PPTX ≤112 in/side.
- [ ] Export tab: paywall card **hidden** (canExport true), both buttons enabled. Pack holders see the credit hint.
- [ ] "▤ PowerPoint (.pptx)" → busy **"Building slides…"** → downloads `{title}.pptx` → **"✓ Saved"**. "⌨ LaTeX source (.zip)" → **"Writing LaTeX…"** → `{title}-latex.zip`.
- **Edges:**
  - [ ] PPTX 56–112 in → yellow half-size note, export runs at half scale ("print at 200%").
  - [ ] PPTX >112 in → **button disabled**, red note, use LaTeX/PDF instead.
  - [ ] Export throws → **"Something went wrong. Try again, or use Send Feedback…"**
- **✓ verify:** files download + open in PowerPoint/Overleaf; **no watermark** (paid seam honored for these two only); credit user's `export_credits` −1 (term user: no consume call).
- **⚠ Client-side enforcement:** paywall is UI-only by design; a devtools user who flips `canExport` gets a clean export without paying (accepted launch posture).

## 24. Paywall-blocked export → forced signup → resume (nested — cross-ref §1b/1c)

- **Set up:** Account **A** (guest) or **E** (free), poster open, `canExport=false`.
- [ ] Export tab shows the upgrade card; PPTX/LaTeX **disabled** (clicking no-ops). Guest sees the "working as a guest" note.
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

## Quick findings summary (things the trace flagged as broken/unverified/contradictory)

- [ ] **§1b data continuity** — `/auth` uses `signUp` not in-place `updateUser`; guest posters may be orphaned on paid conversion. **HIGH.**
- [ ] **§18 Stripe orphan** — deleting an account with an active term keeps billing the user; no warning. **HIGH.**
- [ ] **§18 copy bug** — "a new guest account will be created" is false (lands on bare `/auth`).
- [ ] **§18 RPC swallow** — `delete_own_account` failure leaves orphaned auth row silently.
- [ ] **§22 PDF watermark** — always applied, even for paid users (PDF not wired to `usePlan`).
- [ ] **§5 password reset** — no `redirectTo`, no in-app set-new-password screen; can't complete in Postr's UI.
- [ ] **§7 Google conversion** — depends on Manual Linking being ON; else orphans guest data.
- [ ] **§9 AuthGuard** — no stale-JWT self-heal + no getSession error handling; doc's `ensureSession`-in-guard claim is wrong.
- [ ] **§21 GDPR** — legal-promise-coupled; anon grant still un-hardened in prod.
- [ ] **§16 cancel** — link.com root, not a customer portal deep link; unverified a user can actually cancel.
- [ ] **Errors** — several auth flows show **raw Supabase error strings** (violates the generic-error convention).


---

# PART 6 — PAPER TO SLIDES (`/paper-to-slides`)

The standalone talk flow — sibling of `/paper-to-poster`. One chat-style wizard surface (`SlidesWizard`) around a public shell (`PaperToSlides`). Route `/paper-to-slides` is canonical; `/paper-to-present` and `/paper-to-presentation` **308** here. No auth gate to reach it — public + code-split.

> **All copy in quotes is verbatim from the code.** If what you see differs, that's a finding.
> **Manuscript privacy line** (persistent, under the progress bar): **"Your manuscript is never stored on our servers, and is never used to train AI."**
> **Turn-1 tip** (persistent, under the progress bar): **"PDF export is free. PowerPoint (.pptx) export is paid."**

## ⚠ Can't fully test from the app UI (needs backend / Stripe / a crafted response)

- [ ] **The style pass (Arm P) and theme pass (Arm T)** call server LLM adapters (`styleDeck` / `generateTheme`). You can only observe their **effects** in the UI (styled preview appears, deck re-themes). To force the count-mismatch degradation (§32) you need a doctored style response returning ≠ N slides — not reachable by normal clicking; verify via the e2e harness (`designPassE2e.test.tsx`) or a network intercept.
- [ ] **The PPTX paywall is DISPLAY-ONLY in Phase 1.** The "Export PowerPoint (.pptx)" button just calls `onExportPptx` and downloads — **no Stripe, no card, no account gate** is reached from here. Real payment plumbing is Phase 3. (See §31 ⚠.)

---

## 26. Paste a manuscript → run the 6-step wizard → plain deck (Phase-1 pipeline)

- **Set up:** Fresh load of `/paper-to-slides`, any session (public, no login needed). Have a manuscript with a clear Results section ready to paste.
- [ ] Page shows H1 **"From paper to slides"** + intro **"Paste your manuscript, answer a few short questions, and build an ordered slide deck — one finding per slide, with speaker notes drawn from your paper. Download a free PDF, or an editable PowerPoint."**
- [ ] Left step spine (StepBar) lists 6 steps in order: **Constraints → Star finding → Figures & tables → Narrative → Visuals & notes → Tweaks**. ProgressBar reads **1 / 6 · Constraints**.
- [ ] **Constraints step:** paste into "Paste your manuscript here…" (or "Upload a .docx" → button flips to "Reading…" then fills the paste box). Set **Length** (dropdown, minutes) — helper updates: **"One slide per minute — {n} content slides."** Pick **Format** (PowerPoint / PDF).
- [ ] Click **"Find the key findings"** (disabled while paste box empty). Advances to Star finding; body shows busy line **"Finding the key findings in your results…"**
- [ ] **Star finding step:** ranked finding cards render. Instruction: **"Pick your star finding — it leads the talk. The rest follow in order."** First card is the star by default (`starIndex=0`, "Star" badge).
- [ ] Click **"Build the deck"** → advances to Narrative; SlideViewer renders the built deck below.
- **✓ verify:**
  - [ ] Deck has **title + one slide per finding** in extracted order, star slide leading; per-slide N/30 word-count indicator present; speaker-notes strip shows provenance-tagged notes.
  - [ ] Steps 3–6 (Figures/Narrative/Visuals/Tweaks) each show an honest **STUB note** with the live deck preview still visible below, e.g. Narrative: **"The narrative arc is derived from your paper automatically. Editing the gap and resolution comes next."**; Figures: **"Figure and table selection is coming next."**
- **Edges:**
  - [ ] Extraction throws → generic error surface + **Retry** (never raw error text).
  - [ ] `.docx` read fails → generic inline error under the Upload button.
  - [ ] Editing the paste-box text after a `.docx` upload **invalidates the cached model** — next extraction re-parses the text on screen (verify by uploading, editing, re-extracting).

## 27. Auto design-pass runs on first assembly → deck shows STYLED by default (Phase 2)

- **Set up:** Continue from §26 right after clicking **"Build the deck"**.
- [ ] The moment the plain deck exists, the design pass fires **automatically** (no button): SlideViewer shows busy line **"Styling your deck…"** (italic, live-region).
- [ ] When it resolves, the stage swaps from the plain black-and-white slide to the **themed styled slide** (positioned elements, palette colors). Thumbnail rail + speaker notes keep reading off the **plain** deck (styled model carries no notes) — this is expected.
- **✓ verify:**
  - [ ] Style (Arm P) and theme (Arm T) run **in parallel**, then merge via `applyTheme` — you should NOT wait for two sequential spinners.
  - [ ] Once styled, the **vibe field appears** and the **export buttons enable** (see §29, §30).
- **Edges:**
  - [ ] Design pass fails → **"Something went wrong. Showing your deck unstyled for now."** and the **plain deck stays visible underneath** (never a dead end). Vibe field is **hidden** and export stays disabled (this is the same guard as §32).

## 28. Vibe field — re-theme only (Arm T), structure unchanged

- **Set up:** A styled deck present (§27 succeeded), so the VibeField is visible.
- [ ] VibeField shows input placeholder **"Describe the vibe, or leave blank to follow your narrative"** + 2 tappable suggestions: **"Clean & minimal, lots of whitespace"** and **"Confident & bold, strong headline emphasis"**.
- [ ] Type a custom vibe and press **Enter** → "Styling your deck…" → deck **re-themes** (new palette / theme).
- [ ] Tap a suggestion → it submits immediately (fills + re-themes).
- **✓ verify:**
  - [ ] **Only the theme re-runs** — the styled STRUCTURE (element positions, slide order, slide count, speaker notes) is **unchanged**; only colors/theme shift. Arm P (styleDeck) does NOT re-run — the re-vibe is cheap.
  - [ ] Fast double-submit (type-Enter, then tap a suggestion before the first resolves) → **only the latest wins** (`designPassSeq` guard); no flicker back to a stale theme.
- **Edges:**
  - [ ] Re-vibe fails → design-error line shows, but the **last-good styled deck stays visible** (styledDeck is never cleared on a re-vibe failure).

## 29. Export — FREE PDF (polished, ack mark, NO utility slides)

- **Set up:** Styled deck present; open the **Export** drawer (bottom bar, expands upward). Header shows **"Export"** + slide count.
- [ ] Promise line at top: **"The polish is free. You never pay for beauty — you pay only for the editable file."**
- [ ] **PDF card** (badge **Free**): subtitle **"The full polished deck, print-ready."** Included (✓): "Full polished deck — identical to paid", "Print-ready, final-form pages", **'"Made by Postr.sh" mark on the acknowledgement slide (never over your content)'**. Excluded (—): "Editable in PowerPoint", "Empty layout slides to duplicate".
- [ ] Click **"Download PDF"** → downloads `presentation.pdf`.
- **✓ verify:**
  - [ ] PDF renders the **same polished/styled deck** as the preview.
  - [ ] The **"Made by Postr.sh"** mark appears **on the acknowledgement slide only**, never over content.
  - [ ] PDF has **NO pptx-only utility slides** — no palette slide, no icon-library slide (PDF path never sees them; they're appended straight to the pptx instance).

## 30. Export — PAID PPTX (editable, +palette +icon +5 empty layouts, no watermark)

- **Set up:** Same open drawer as §29.
- [ ] **PowerPoint card** (badge **Paid**): subtitle **"The same polished deck — now yours to edit."** Included (✓): "Same polished deck — identical to the PDF", "Real, editable text boxes", **"5 empty layout slides to duplicate"**, "Icon-library slide, ready to reuse", "4-palette slide, ready to reuse", "No watermark".
- [ ] Price line: **"$18.99 CAD / 4-month term · or $9.99 for 3 exports"**. Account note: **"Account asked only here — no card to preview."**
- [ ] Click **"Export PowerPoint (.pptx)"** → downloads `presentation.pptx`.
- **✓ verify:**
  - [ ] Opens in PowerPoint with **real editable text boxes** (not flattened images).
  - [ ] Deck carries the **8 appended utility/template slides**: palette slide + icon-library slide + 5 empty layout slides (plus the explainer). The icon slide is rasterized SVG→PNG (writer awaits `addIconLibrarySlide` before the single final `pptx.write`).
  - [ ] **No watermark** anywhere in the .pptx.
- **⚠ Phase-1 paywall is DISPLAY-ONLY:** clicking exports the file directly — no Stripe, no card, no account gate is reached here. The real gate is Phase 3. Do NOT treat a successful free download of the .pptx as a payment bug in Phase 1 — it's the accepted posture.

## 31. Graceful degradation — count-mismatched style response → PLAIN everywhere (no "previewed plain, exported styled" mix)

- **Set up:** Force a style response whose slide count **≠** the plain deck's (⚠ needs a doctored response / e2e harness — not reachable by normal clicking).
- [ ] Build a deck (§26), let the design pass return a **mismatched** styled deck (e.g. N−1 styled slides for N plain slides).
- **✓ verify — all three surfaces must AGREE (this is the trust guard, `alignedStyledDeck`):**
  - [ ] **Preview falls back to the PLAIN black-and-white stage** (the styled deck is not shown).
  - [ ] **Vibe field is HIDDEN** (no re-theming a deck the UI doesn't trust).
  - [ ] **Export buttons are DISABLED**; the drawer shows the status line **"Styling your deck — export unlocks once it's done."** (`exportReady=false`).
  - [ ] There is **NEVER a "previewed plain but exported styled" mix** — a count-mismatched styled response can't be exported. Both `handleExportPdf` / `handleExportPptx` early-return on the same `alignedStyledDeck` guard, so this is defense-in-depth on top of the disabled buttons.

## 32. Rebuild — pick a different star → deck B must NOT ship stale styled deck A (the just-fixed guard)

- **Set up:** Build deck **A** with the default star and let its design pass complete (styled preview visible).
- [ ] Go **back to the Star finding step**, pick a **different** star finding, click **"Build the deck"** again → deck **B** builds.
- **✓ verify:**
  - [ ] On rebuild, the prior build's styled state is **reset first** (`setStyledDeck(null)` + `setPalettes([])`) **before** the new plain deck swaps in — so during deck B's in-flight design pass the preview shows **plain B thumbnails**, never A's styled stage laid over B's content.
  - [ ] The **VibeField does not re-theme stale content**, and **export does not ship a mix** of A and B.
  - [ ] After deck B's design pass resolves, only **deck B (new star leading)** is previewed and exported. Confirm the exported PDF/PPTX slide order matches deck B, not A.
- **⚠ Two complementary guards:** `designPassSeq` decides which async RESPONSE wins; the `setStyledDeck(null)` reset decides what's DISPLAYED in the gap before either response lands. Both must hold — regression here is the "stale styled deck A over B" bug this test protects.

## 33. Re-import a styled `.pptx` (with its 8 appended utility/template slides) → NO false "8 slides skipped" warning

- **Set up:** Export a styled `.pptx` from §30 (or any Postr talk/poster export carrying template slides). Re-import it via the dashboard **"+ New poster ▾"** menu (the same re-import path as §25).
- [ ] Import the file.
- **✓ verify:**
  - [ ] Importer recognizes Postr's own appended slides by their `<p:cSld name="Postr template - …">` marker and **subtracts them** before counting skips.
  - [ ] For a clean Postr export (only the poster/first slide is user content + the appended templates), there is **NO "N slides were skipped" warning** — the user never authored those 8 template slides, so warning about them would be a lie.
- **Edges (regression corners):**
  - [ ] The appended-template subtraction is **capped at 8** (`APPENDED_SLIDE_COUNT`) — a deck full of forged/duplicate template names can under-report by at most 8, never claim "nothing skipped" for a real multi-slide deck.
  - [ ] Add **one genuine user slide** to the end of the exported deck, re-import → warning appears reporting exactly **1 slide skipped** (identity travels by name, not position, so pasting your own slide doesn't stop recognizing the templates).
  - [ ] **Rename** one Postr template slide in PowerPoint, re-import → that renamed slide now **counts as skipped content** (adopting it as your own is correct behavior).
  - [ ] Delete the poster/first user slide, keep only templates → importer **refuses** with "Presentation contains no slides." (does not hand you the explainer as content).
- **⚠ Note:** A genuine deck authored in PowerPoint (slides named `Slide 1`…`Slide 7`, or unnamed) warns exactly as before — the fix only suppresses the warning for **Postr's own** appended slides.

---

## Quick findings summary — PART 6 additions

- [ ] **§27/§31 trust guard** — preview, vibe field, and export must all agree via `alignedStyledDeck` (count match). A count-mismatched styled response must fall back to PLAIN on **all three** — never "previewed plain, exported styled".
- [ ] **§30 paywall** — PPTX export is **display-only** in Phase 1 (no Stripe/account gate); real gate is Phase 3. Successful free .pptx download is expected posture, not a bug (yet).
- [ ] **§32 rebuild guard** — `setStyledDeck(null)` reset (display gap) + `designPassSeq` (response race) together prevent stale styled deck A shipping over deck B. Regression-prone.
- [ ] **§33 re-import** — Postr's 8 appended template slides must NOT be reported as skipped; subtraction capped at 8; identity by `<p:cSld name>` marker, not position.
- [ ] **§29 PDF** — free PDF is the full polished deck with the ack-slide mark and **no utility slides**; distinct from the always-watermarked editor PDF in §22 (different pipeline).

---

# PART 7 — PRESENTATION CHECKER (`/presentation-checker`)

The direct QA route is intentionally public, unlinked, and `noindex,nofollow`. Keep `VITE_ENABLE_PRESENTATION_CHECKER=false` in production until every launch gate below passes; setting it true exposes the editor Review tab. PPTX remains a separate two-sided rollout gate.

## 34. Hidden rollout and metadata posture

- [ ] With `VITE_ENABLE_PRESENTATION_CHECKER` unset/false, open an editor: the **Review** tab is absent.
- [ ] Load `/presentation-checker` directly: the checker renders, but no marketing header/footer/editor link leads to it.
- [ ] Inspect the document head: robots is exactly `noindex,nofollow` and no canonical is emitted.
- [ ] Enable only `VITE_ENABLE_PRESENTATION_CHECKER=true`, reload the editor, and confirm Review appears without changing PPTX acceptance.
- [ ] Re-disable the flag after QA. Do not add links or change robots until the frozen-corpus evaluator records GO and production dogfood passes.

## 35. Initial review — PDF, image, and native Postr source

- **Set up:** confirmed account C/D with one review pack credit, plus a native poster the user owns.
- [ ] Upload a valid PDF, PNG, or JPEG. Confirm local preview/preflight completes, temporary pages upload privately, and the initial critique returns overall plus narrative/design/content scores and anchored finding cards.
- [ ] From the editor Review tab, review the native poster capture. Confirm the API accepts only the exact owned `{user_id}/{poster_id}/review-capture.jpg` path.
- [ ] Refresh after completion: the saved history row is present and reopening it reproduces validated scores/findings without rerunning the provider.
- **Edges:** oversize pages, too many pages, wrong MIME, foreign-user storage paths, expired signing, provider timeout, malformed provider JSON, and failed upload/signing each show bounded generic failures; no raw provider/storage error and no partial result row.

## 36. Pack credit reservation, failure refund, and request idempotency

- **Set up:** account H with exactly one review credit; capture the request key from the browser network panel.
- [ ] Start one initial review and confirm the credit is reserved **before** Anthropic work starts.
- [ ] Replay the same request key concurrently and after completion: at most one provider call and one `poster_reviews` row exist; polling/replay does not consume rate-limit work slots or a second credit.
- [ ] Force provider/page-fetch/finalization failure. Confirm the exact reservation is released and the credit is refunded once.
- [ ] Let a claim become stale, then retry with a new claim token. Confirm the stale worker cannot finalize or refund the new worker's reservation.
- [ ] Successful finalization consumes exactly one credit and the saved result can be reopened.

## 37. Review add-on checkout and weekly quota

- [ ] Buy `review_pack`: provision only after a paid or `no_payment_required` fulfillment event; async/unpaid completion grants nothing.
- [ ] Buy `review_addon`: a second checkout attempt while active returns the already-active error and double-clicking the UI mints one checkout session.
- [ ] Replay webhook deliveries and send stale subscription updates/deletions. Confirm credits are not duplicated and an old subscription cannot revoke/overwrite a newer add-on.
- [ ] Consume the configured weekly add-on allowance while one pack credit remains. Confirm the next fresh request falls back to that pack credit and succeeds; replay its request key and confirm the replay consumes neither another pack credit nor another weekly slot.
- [ ] With the weekly allowance exhausted **and zero pack credits**, confirm the next fresh initial review is denied before provider work. Advance beyond the rolling window and confirm add-on access resumes.
- [ ] Cancel/revoke the current add-on in Stripe sandbox and confirm new reviews stop while already saved reviews remain readable.

## 38. Included follow-up and terminal state

- [ ] Open a completed saved review and submit the included follow-up. Confirm one response is persisted on that same review and no pack/add-on credit is consumed.
- [ ] Double-submit/replay the follow-up and force a stale lease: only the current lease can complete; no duplicate provider work becomes a second result.
- [ ] After successful completion the review is terminal/closed and another follow-up is rejected with stable UI copy.
- [ ] Force the follow-up provider call to fail, then retry. Confirm the lease releases and the single included follow-up remains available.

## 39. History reopen and resume after reload

- [ ] Complete uploaded and native-poster reviews, reload the page, and select each history row. Before opening, confirm the row shows its source label or filename, date, stage, and scores. After opening, both must restore validated scores, findings, and follow-up state; the native review retains its poster ID for recapture, while an uploaded review explains that its temporary preview is no longer retained.
- [ ] Reload while a follow-up remains available; reopen the review and submit it successfully.
- [ ] Inject malformed saved JSON in a test/staging row. The UI must reject it through runtime validation with a safe error rather than rendering partial or unsafe fields.
- [ ] Expire an uploaded page signed URL before a retry. The server must re-sign the owned `storagePath` after claiming work instead of relying on the stale client URL.

## 40. PPTX remains “coming next” until isolated-worker GO

- [ ] With both PPTX flags false, the file picker excludes `.pptx`; helper copy says slides/PPTX are coming next and suggests exporting PDF. Direct `.pptx` drop is rejected client-side.
- [ ] With only the client flag true but server flag false, the render endpoint returns `503 pptx_unavailable`; no provider critique runs.
- [ ] Only in an isolated smoke environment, enable both flags and upload a valid deck. Verify archive CRC/inflation/ratio limits, LibreOffice render concurrency, rendered-page dimensions/bytes, private upload paths, and rollback on upload/sign failure.
- [ ] Exercise zip bomb, corrupt CRC, oversized raw/compressed deck, too many/oversized rendered pages, and worker timeout cases. Each must fail closed without leaving a usable partial batch.
- [ ] Restore both flags to false after the smoke. Production rollout still requires the worker deploy record and `review-temp` lifecycle verification.

## Quick findings summary — PART 7 launch blockers

- [ ] Frozen evaluator corpus is empty/unrated; no quality GO exists.
- [ ] No recorded live Anthropic quality/cost run or threshold decision exists.
- [ ] No recorded live Stripe review-price checkout/webhook run exists.
- [ ] No isolated PPTX worker deploy/smoke exists; both PPTX flags stay off.
- [ ] No verified production lifecycle policy for `review-temp` exists.
- [ ] No production dogfood, linking, indexing, or deployment is authorized by this implementation PR.
