# Sequence 1 — Payment provider & the export paywall

**Date:** 2026-07-28
**Status:** PLANNED, NOT BUILT. Read-and-approve before any code.
**Owner:** Gavin. Decisions here captured 2026-07-28; where it says
"decided", do not relitigate.
**Depends on:** nothing. This is the critical path — it ships first.
**Paired with:** `2026-07-28-paper-to-talk.md` (Sequence 2), which adds
the second paid artifact behind the same paywall.

Supersedes the framing in `2026-07-28-export-paywall.md`, which assumed
the paywall waits until ~100 users. It does not. See §1.

---

## 0. The one-paragraph version

Everyone pays from launch. The point is to learn **whether this
audience pays at all** — a question no amount of modelling answers, and
which a deferred paywall answers never. Editing and a watermarked PDF
stay free forever; a **$19 / 4-month term** (or a **$4.99 / 3-decks
pack**) unlocks the clean editable exports (PPTX + LaTeX) and, once
Sequence 2 ships, paper-to-talk export. The free/paid line goes on the
home page as a comparison table so no one meets the wall at export time.
The founding-cohort benefit is **not dropped — it is deferred**: the
grandfather logic is designed now and granted retroactively at a
threshold Gavin sets later (§6).

---

## 1. What changed from the earlier paywall doc, and why

`2026-07-28-export-paywall.md` reasoned: don't gate until ~100 users,
because gating against zero traffic produces an uninterpretable null.
That logic is sound **for revenue optimisation** and wrong **for
learning**. Gavin's decision (2026-07-28):

> "it's important to see if people pay for this ... everyone all be
> paying now, then when I reach the threshold, I'll deliver this as
> benefits to them."

The reframing: the first cohort is not a revenue cohort, it is a
**willingness-to-pay probe**. A paywall that no one converts on is a
*result*, not a failure — it says the audience won't pay, which is the
single most important thing to know before building more. Deferring the
paywall defers that finding indefinitely.

The founding generosity is preserved by making it **retroactive** rather
than **upfront** (§6), which costs nothing to promise now and removes
the "gating against zero traffic" objection entirely — because everyone
is gated, so there is always a clean signal.

---

## 2. The model, stated exactly

The canonical free/paid split. This table is also the home-page table
(§5), so it is written to be shown, not just referenced.

|                                   | **Free** | **Term — $19 / 4 mo** | **Deck pack — $4.99 / 3** |
|-----------------------------------|:--------:|:---------------------:|:-------------------------:|
| Editing, all tools, unlimited     |    ✓     |          ✓            |             —             |
| Poster **PDF** export             | ✓ *(watermark)* |   ✓ *(clean)*  |             —             |
| Poster **PPTX / LaTeX** export    |    —     |          ✓            |             —             |
| Paper → poster                    |    ✓     |          ✓            |             —             |
| Paper → talk: **generate + preview** | ✓ *(free trial)* |    ✓       |             ✓             |
| Paper → talk: **export** (any format) | —    |          ✓            |          ✓ (×3)           |

**Read the asymmetry deliberately** — it is decided, not an oversight:

- A **poster has a free usable output**: the watermarked PDF is
  conference-ready and hangs on a board. What you pay for is taking it
  *elsewhere to keep editing* (PPTX/LaTeX).
- A **presentation has no free export**. Generation and preview are the
  free trial; every export format is paid, including PDF. The deck is
  the paid artifact. (Full trial mechanics in Sequence 2.)

**Always free, never metered, stated plainly:** editing, every tool
(plot picker, readability checker, paper-to-poster), and the watermarked
poster PDF. The watermark is the "made with postr.sh" acknowledgement —
framed as acknowledgement, not a nag (Gavin: users got a free service,
the mark is the least they can do), and it is also the growth loop
(every free poster on a board carries the name).

---

## 3. Enforcement — where the gate actually lives

`export/attribution.ts` already threads `shouldAttribute({ paidPlan })`
through all five acknowledgement paths, but **nothing ever sets
`paidPlan: true`** — it is a client-side flag with no backing. The work
is to give it a real, server-trustworthy backing.

**Two seams, deliberately different in strength:**

1. **The watermark on the free PDF** is a client-side render decision.
   It does not need to be unbypassable — a user who strips it via
   devtools is exactly the user who would never have paid, and the file
   they produce still says postr.sh in its metadata. UI-gate is correct
   here. *(Matches the earlier doc's "accept bypassability at launch".)*

2. **The editable/deck exports** are the actual product being sold. The
   writers currently run **in the browser** (`export/pptx/writer`,
   `export/latex/exportLatex` via dynamic import), so a client-only gate
   is bypassable from the console. Decision needed (§3.1).

### 3.1 — UI-gate now, server-gate when there is something to protect

`[JUDGEMENT]` Ship the **UI gate first**, documented as bypassable, and
move generation server-side only if leakage is ever observed — which
requires having paying customers to leak from. Rationale unchanged from
the earlier doc: the population that reverse-engineers a bundle to avoid
$19 overlaps almost entirely with the population that never pays. Moving
the writers server-side also relocates working code, adds Render
cold-start latency, and means poster content leaves the browser — which
contradicts the "your data never leaves the browser" claim on the plot
picker page. **Do not pay that cost before there is a customer to
justify it.**

The gate at launch is therefore: **the paid buttons check a real
server-verified `plan`, and the upgrade prompt replaces them when the
plan is absent.** The writer still runs client-side; the *button* is
what the plan gates. Honest, cheap, and correct for a willingness-to-pay
probe.

---

## 4. Build order

Nothing here is built. This is the sequence when it is.

> **Already shipped (2026-07-28), out of band:** the product-research
> email consent. `research_consent_at timestamptz` on `public.users`
> (migration `20260728000000_research_consent.sql`), a self-managed
> toggle in Profile → Preferences, and the matching Privacy-policy clause
> (legal basis: consent, Art. 6(1)(a)). This is Gavin's "email users for
> product research" requirement. It is user-owned state — the owner's own
> RLS policy writes it — so it is unlike `plan` below, which is
> webhook-only. Outreach itself (the email send) is a separate,
> unbuilt feature: the query selects only rows where the column is set.

### 4.1 — Data: the plan lives on the user, server-owned

- Add to `public.users`: `plan text`, `plan_expires_at timestamptz`,
  `stripe_customer_id text`. `plan` is null/`'free'` by default.
- **RLS: the user must NOT be able to write their own plan.** The
  existing `users_update_own` policy allows self-update of the whole
  row. Split it: keep self-update for `display_name` etc., but exclude
  `plan` / `plan_expires_at` / `stripe_customer_id` from what an
  authenticated user may set (column-level, or a trigger that rejects
  changes to those columns unless the caller is `service_role`). The
  webhook (service_role) is the only writer of `plan`.
- `created_at` already exists — no migration needed for grandfathering
  (§6).

### 4.2 — Deck-pack credits (for the $4.99 pack)

- The term is a boolean-ish state (`plan='term'` until
  `plan_expires_at`). The **pack is a consumable count** and needs its
  own ledger: `deck_credits int not null default 0` on `users`, or a
  `credit_ledger` table if per-purchase audit matters. Decision: start
  with a single column; move to a ledger only if refunds/disputes need
  per-transaction history.
- Decrement on a successful paid deck export; never on generation
  (generation is the free trial).

### 4.3 — Payment provider: a Merchant of Record (Polar), NOT plain Stripe

**DECIDED (2026-07-28, on research): Polar.** Postr sells worldwide to
tax-messy jurisdictions (EU VAT etc.) as a solo Canadian founder — so it
needs a **Merchant of Record** that becomes the legal seller and
files+remits tax, not a plain gateway. Plain Stripe is NOT an MoR and
would leave the founder personally liable for EU VAT / US sales tax
everywhere. Full comparison: `2026-07-28-pricing-and-market-strategy.md`
and `experiments/payment-providers.html`.

Why Polar over the alternatives (all real 2026 pricing):
- **Polar (Starter, free tier): 5% + $0.50, +1.5% intl.** Full MoR,
  first-class one-time payments, clean webhook DX for Supabase+Express.
  Nets ~$17.54 on the $18.99 term, ~$8.99 on the $9.99 pack.
- **NOT Stripe Managed Payments** — it *is* an MoR but a markup model
  (3.5% MoR **on top of** 2.9%+$0.30 = ~6.4%+$0.30 domestic, ~8.5–11%
  intl). Lemon Squeezy (Stripe-owned) now steers new signups to it. The
  premium over Polar is ~$75–120/yr at 500 sales, ~$210–330/yr at 1,400
  — small, but no reason to pay it, and Polar is *cheaper on
  international* (9.1% vs ~11%), which matters for worldwide buyers.
- **NOT Paddle** — its published rule "products under $10 → contact sales"
  disqualifies the $9.99 pack.
- Classic Lemon Squeezy (5%+$0.50) still works if Polar's maturity is a
  concern; Dodo Payments (4%+$0.40, 220+ countries) is the widest-reach
  fallback. Do a due-diligence pass on Polar's uptime before committing
  production revenue.

The mechanics are provider-agnostic and unchanged by the choice:
- **Not a subscription** — the $18.99 is a **term**, a one-time payment
  that sets `plan_expires_at = now() + 4 months`. No recurring billing,
  no cancellation, no dunning. (Growth-plan §2: frame as a term — it
  expires without a cancellation event.)
- The pack is a second one-time SKU that adds 3 to `deck_credits`.
- `apps/api` already has an auth'd service with a cron-secret pattern —
  the **provider webhook lives there** (`apps/api/src/`), signature-
  verified, writing `plan` with `service_role`. No new service.

### 4.4 — Webhook → plan

- On a completed-checkout webhook → look up the user (by the provider's
  customer id or a `client_reference_id` set at checkout creation), set
  `plan='term'` + `plan_expires_at`, or increment `deck_credits`, per the
  SKU.
- Idempotent on the provider's event id (a webhook can fire twice).
- No cancellation handler needed for the term. A refund handler is
  optional at launch.

### 4.5 — Thread the real plan into the client

- A `usePlan()` hook reads the server plan (via an authed fetch or a
  Supabase select constrained by RLS to the user's own row).
- Feed it into `shouldAttribute` (removes the watermark for paid) and
  into `EditableExportButtons` (unlocks PPTX/LaTeX).
- Expired term (`plan_expires_at < now()`) reads as free again. Posters
  created *inside* an active term keep clean export permanently — the
  by-`created_at` rule from the earlier doc still applies and needs a
  per-poster check, not just a per-user one. **Carry that rule forward.**

### 4.6 — The upgrade prompt

- Ungated build, account at export — do NOT require a card upfront, do
  NOT paywall the editor. (Growth-plan: ungated freemium beats
  card-required on funnel.)
- The prompt on a gated button says what the user *gets* ("keep editing
  in PowerPoint or Overleaf", "download your talk"), never what they are
  blocked from. (Per `feedback_marketing_no_ai_framing` and the growth
  plan: name the workflow, not the capability.)

---

## 5. The home-page pricing table

**Decision (Gavin): a comparison table on the landing page**, in the
familiar SaaS "compare our plans" shape, so the free/paid line is
visible before anyone invests effort and export is never a surprise.

- Three columns: **Free / Term ($19·4mo) / Deck pack ($4.99·3)** — the
  table in §2 is the content.
- Placement: a dedicated pricing section on the landing page (not only a
  hero line). It must state, unmissably: **"Editing and PDF export are
  always free — with a small 'made with postr.sh' watermark. Exporting
  to PowerPoint or LaTeX, and downloading a generated talk, are paid."**
- Copy constraint: name the workflow, not the capability; no AI framing
  anywhere (`feedback_marketing_no_ai_framing`). Verify every claim in
  the table against what the code actually does before it ships.
- This is also where the deck pack becomes discoverable as the light
  entry point next to the term.

---

## 6. The deferred founding benefit — designed now, granted later

**Decided: everyone pays from launch; the founding cohort is rewarded
retroactively at a threshold.**

- The benefit (from the founding-cohort model, revised 2026-07-28):
  **10 combined outputs per month — clean exports + talk exports pooled
  — free, for 2 years; $1 per output over 10.** Modelled in
  `experiments/founding-cohort-cost-model.mjs`: even the absurd worst
  case is ~$150/month, realistic scenarios cost cents.
- **Mechanism, zero new schema:** `public.users.created_at` already
  stamps every account. The rule is one date comparison against a
  threshold timestamp Gavin fixes when the user count justifies it.
  Everyone with `created_at < THRESHOLD_TS` is granted the founding
  entitlement retroactively.
- **Why retroactive beats upfront:** it removes the "gating against zero
  traffic" objection (everyone is gated, so the willingness-to-pay
  signal is always clean), and it converts the founding grant from a
  *cost taken on faith* into a *reward given once the base is proven*.
  Announced correctly it is a loyalty event ("you were here early —
  here's two years on us"), not a giveaway.
- **Open decision (Gavin to set):** the threshold — a user count (e.g.
  100) or a date. Left open here deliberately; the code reads a single
  configurable timestamp so the number can be decided without a
  redeploy of logic.

---

## 7. What this sequence must answer

The success metric is **not revenue**. It is a single boolean with a
number attached: **do paying users exist in this audience, and at what
rate?** Report it as **paying-users-per-signup**, never trial-to-paid %
(growth-plan metric discipline). A low number is a valid, valuable
result — it redirects the whole roadmap.

---

## 8. Open questions

1. **Threshold for the founding grant** — count or date? (§6) Gavin's
   call, deliberately unset.
2. **Pack ledger vs single column** (§4.2) — start simple, upgrade only
   if disputes need per-transaction history.
3. **Per-poster vs per-user clean-export entitlement** after term
   expiry (§4.5) — the by-`created_at` rule from the earlier doc says
   per-poster-permanent; confirm that survives into implementation.
4. **Semester/term definition in code** — is the 4-month term a fixed
   window from purchase, or a calendar reset? A fixed window from
   purchase is simpler and avoids a cliff; recommend that.
