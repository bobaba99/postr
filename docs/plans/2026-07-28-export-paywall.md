# Export Paywall — where the free/paid line goes

**Date:** 2026-07-28
**Status:** DECIDED, NOT BUILT. No code exists for this. Documented so the
decision survives the gap between now and implementation.
**Decided by:** Gavin, 2026-07-28.
**Tagging convention:** inherited from `2026-07-27-growth-plan.md` —
`[EVIDENCE]` traceable to a cited source, `[JUDGEMENT]` inference,
`[UNVERIFIED]` asserted but weakly sourced.

---

## 1. The decision

**Free:** PDF / print export, carrying the "Poster made with postr.sh"
acknowledgement. Unlimited editing. The plot picker and figure
readability checker stay outside the meter permanently.

**Paid:** the two *editable* exports — PowerPoint (`.pptx`) and LaTeX
source (`.zip`).

The line is **the file format, not the credit.** A free user gets a
finished, printable, conference-ready poster with no functional
limitation. What they pay for is taking the document somewhere else and
continuing to edit it.

### Why both editable exports, not just PPTX

The initial instinct was PPTX-only. That leaks, and the leak is one
click wide.

`[JUDGEMENT]` `EditableExportButtons.tsx` renders both buttons in the
same panel, and LaTeX is the *stronger* of the two: no 56-inch
PowerPoint ceiling, exact block positions preserved, opens straight in
Overleaf. Gating PPTX while LaTeX sits beside it free means the users
most able to route around the paywall — TeX-literate academics — are
also disproportionately the users with grant money. It paywalls the
weaker artifact and hands the better one away.

Both or neither. Both.

---

## 2. How this squares with the growth plan

`2026-07-27-growth-plan.md` §2 constrains this decision in three ways.
Two are satisfied; one is a **live conflict that needs resolving before
build.**

### ✅ Satisfied: "do not make watermark removal the primary paid benefit"

`[EVIDENCE]` Named in the growth plan as a dead end: it sets the growth
loop directly against revenue, and charging stipend-funded grad students
$19 to delete a logo reads badly to an audience that talks to each
other.

This decision **complies**, and that is the main thing it has going for
it. The paid benefit is a capability (keep editing elsewhere), not the
deletion of a mark. The acknowledgement stays on the free PDF and keeps
doing its distribution job — the November conference-presence mechanism
in Move #1 is untouched, because the artifact that hangs on the board is
the free PDF.

### ✅ Satisfied: "meter the artifact, not the clock"

`[EVIDENCE]` The Frontiers RCT (n=680,588) identified demand saturation
as the offsetting force against free exposure; `[JUDGEMENT]` a poster is
the extreme case — one artifact, one date. Any time-limited trial means
a user who finishes inside the window has permanently zero reason to
pay.

Format-gating is artifact-metering. Nothing here is time-limited.

### ⚠️ CONFLICT: the growth plan's stated free tier is different

The growth plan §2 says:

> **Free = unlimited editing + one full-resolution/print-ready export per
> term. Paid = additional exports + decks.**

That is a **quantity** meter on print-ready exports. This decision is a
**format** meter with unlimited free PDF. They are not the same policy
and cannot both ship.

`[JUDGEMENT]` The format meter is the better of the two, for reasons the
growth plan itself supplies:

- A per-term export *count* punishes the exact behaviour Postr wants.
  Posters get re-exported after every advisor comment. A student who
  exports, gets feedback, fixes a typo, and re-exports has spent their
  free allocation on a typo. That produces resentment in a
  word-of-mouth-dependent audience — the same dissent already recorded
  in the growth plan against over-metering.
- Counting exports requires server-side state per user per term.
  Format-gating requires one boolean. For a solo operator with no
  billing infrastructure, that difference is weeks.
- `[EVIDENCE]` The growth plan's own dissent note: "Meter the second
  export. Never the first. Editing stays free forever because that is
  where time-to-value lives." A format meter never touches the first
  export *or* the tenth, and still leaves a paid tier with standalone
  value.

**Action required:** update `2026-07-27-growth-plan.md` §2 to match, or
explicitly overrule this. Two documents currently disagree about what
the free tier is. `[JUDGEMENT]` Recommend amending the growth plan.

---

## 3. Open risk: is "editable export" worth $19 to this audience?

`[UNVERIFIED]` — and this is the weakest point in the decision.

The paid tier's value story is now "keep editing your poster in
PowerPoint or LaTeX." Reasons to doubt it carries a $19 term on its own:

- A poster is usually finished *in* the tool it was made in. The user
  who wants a PPTX may be a minority, and may want it for a reason
  Postr can't monetise (their PI demands the source file).
- `[EVIDENCE]` The growth plan already budgets the paid tier's value
  against the **manuscript-to-presentation** pipeline and the
  `$4.99/3-decks` add-on. That pipeline is **not built**. Until it is,
  the term tier is being asked to stand on editable exports alone.
- `[JUDGEMENT]` Undergraduate research offices — a targeted segment for
  the spring run — are explicitly flagged in the growth plan as "least
  able to pay $19." They are also the least likely to need a `.tex`
  file.

**This does not invalidate the format split** — the split is the right
*shape* regardless. It means the split alone probably isn't a complete
paid tier, and shipping billing against it now would be testing a
proposition that is missing its main component.

`[JUDGEMENT]` Sequence: build the presentation pipeline, then wire
billing against (editable exports + decks) together. Shipping checkout
against editable-exports-only risks a null result that reads as "nobody
will pay for Postr" when the real finding is "nobody will pay for
`.pptx` alone."

---

## 3b. The trust objection, and why it does not change the sequence

**Objection (Gavin, 2026-07-28):** acquiring early users on a free
editable export and *then* gating it burns trust with exactly the
cohort whose word-of-mouth the whole growth plan depends on.

The concern is legitimate — `[EVIDENCE]` the growth plan's entire
distribution model is campus word-of-mouth in a "tightly-connected
environment," and it already records that over-metering "can generate
active resentment." A visible take-back is the archetypal way to
trigger that.

But the sequencing answer is **grandfather, don't rush the paywall**:

- `[JUDGEMENT]` What actually burns trust is **removing something people
  already rely on**. Grandfathering removes nothing. Every account
  created before the paywall date keeps editable exports permanently.
- `[JUDGEMENT]` The free tier is not degraded by the gate *at all*. A
  free user still gets unlimited editing and an unlimited, print-ready,
  conference-ready PDF. The artifact that hangs on the board never
  changes. This is materially different from a tool that takes away the
  thing you were using.
- `[JUDGEMENT]` Grandfathering is nearly free to implement: Supabase
  already stamps `created_at` on every user. The rule is one date
  comparison, and it can be written down now and honoured later without
  any billing infrastructure existing yet.
- `[JUDGEMENT]` Announced correctly it is a **positive** event, not a
  negative one: "you were here early, you keep this permanently." That
  converts the feared trust-loss moment into a loyalty moment, and gives
  early users a concrete reason to tell people to sign up *now* —
  which is the growth loop, not a cost to it.

**The asymmetry that decides it:** gating-later is recoverable via
grandfathering; gating-now is not recoverable at all. Charging for
editable exports before the presentation pipeline exists produces an
uninterpretable result — no conversions could mean the price is wrong,
the value is thin, or there simply is no traffic yet (the growth plan's
stated starting condition is *zero traffic, no conversion data*). Weeks
of Stripe, schema, and webhook work would buy no signal.

**Therefore:**

1. **Commit to the grandfather rule in writing now** (this document).
   The commitment is what protects trust; the code can come later.
2. State it publicly *when the paid tier launches*, not before —
   `[JUDGEMENT]` pre-announcing a future paywall on a product with no
   paid tier depresses signups for no benefit.
3. `[JUDGEMENT]` If a stronger guarantee is wanted sooner, the cheap
   version is a dated line in the Terms: "accounts created before the
   paid tier launches keep editable exports at no cost." Costs one
   sentence, is enforceable, and pre-empts the objection entirely.

**Grandfather rule (committed 2026-07-28):** every user account created
before the date the paid tier goes live retains PPTX and LaTeX export
permanently at no cost. Implement as a `created_at` comparison against a
single hard-coded launch timestamp.

### 3b.i — Scope the grandfather to the CAPABILITY, not to the whole tier

**Considered and rejected (2026-07-28):** "first 100 users get 2 years
of free subscription."

`[JUDGEMENT]` The account-sharing worry that prompted this question is
**not the real risk**, and at this stage is arguably a benefit:

- Postr's binding constraint is reach, not revenue leakage. A borrowed
  login is another researcher seeing the tool, and their posters carry
  the acknowledgement onto a conference board. `[EVIDENCE]` That is
  Move #1 of the growth plan working, not a loss.
- A shared login almost never represents a lost sale — the marginal
  borrower is a stipend-funded grad student who would not have paid $19
  anyway.
- There is a natural brake: posters are personal research documents and
  an account is a shared drafts list. Self-limiting in a way that
  streaming logins are not.
- Enforcement (device limits, seat detection) costs real engineering and
  buys nothing at 100 users.

**The actual risks are term length and scope**, both of which the
2-year framing gets wrong:

1. `[JUDGEMENT]` **It destroys the pricing signal.** The first 100 users
   are the only cohort available to test $19 against. Granting them free
   access until 2028 means no conversion data until well past user 200.
   The growth plan's stated starting condition is already *no conversion
   data*; this extends that blackout by two years.
2. `[JUDGEMENT]` **It grandfathers the expensive features, not just the
   cheap ones.** "Free subscription" includes the manuscript pipeline
   and deck generation — the LLM-backed features. `[EVIDENCE]` The
   `$4.99/3-decks` add-on exists precisely because decks carry real
   marginal cost. An unlimited 2-year grant to 100 potentially-shared
   accounts is an unbounded inference bill with no ceiling and no way to
   walk it back.

**Decision:** grandfather the **capability**, not the tier.

- **Granted permanently:** PPTX + LaTeX export. Zero marginal cost —
  both writers run in the browser — so this is free to honour forever,
  and *"permanent"* is a stronger loyalty story than *"2 years."*
- **Not granted:** metered LLM-backed features (manuscript pipeline,
  deck generation). These stay priced for everyone.
- `[JUDGEMENT]` If the founding cohort should feel materially special
  beyond that, grant a **fixed** allocation with a hard ceiling — e.g.
  10 deck credits each — rather than unlimited-for-a-duration. Bounded
  cost, same gesture.

---

## 4. What exists today

- `export/attribution.ts` — `shouldAttribute({ paidPlan })` is threaded
  through all five acknowledgement paths (print HTML/CSS, PPTX box, doc
  property, LaTeX block, bib entry, references append).
- **Nothing ever passes `paidPlan: true`.** There is no plan field on
  the user, no Stripe integration, no checkout, no `plan` column.
- The flag is **client-side only**. Anyone with devtools can flip it.
- Both export writers (`export/pptx/writer`, `export/latex/exportLatex`)
  run **in the browser** via dynamic import. There is no server round
  trip to attach an authorisation check to.

That last point is the significant one for implementation.

---

## 5. Implementation sketch (NOT BUILT)

Recorded so the shape is known, not as a work order.

### Enforcement is architectural, not a flag

A client-side `paidPlan` boolean gates the *button*, not the
*capability*. The writers are pure `PosterDoc → bytes` modules shipped
to the browser; a determined user can call them from the console.

`[JUDGEMENT]` Two honest options:

1. **UI gate only, accept bypassability.** Cheap. Correct for launch:
   the population that reverse-engineers a bundle to avoid $19 overlaps
   almost entirely with the population that was never going to pay.
   Document it as a known limitation rather than pretending otherwise.
2. **Move generation server-side.** An authenticated API route that
   verifies the plan and returns bytes. Genuinely unbypassable, but it
   relocates two working writers, adds cold-start latency to Render, and
   means poster content leaves the browser — which currently contradicts
   the "your data never leaves the browser" claim on the plot picker
   page. Check that claim's scope before moving anything.

Start with (1). Move to (2) only if leakage is ever observed, which
requires having customers first.

### Order of work, when it happens

1. `plan` + `plan_expires_at` on the user record; RLS so a user cannot
   write their own plan.
2. Stripe Checkout for the $19 term. `[EVIDENCE]` Growth plan: frame as
   a **term**, never a subscription — it expires without a cancellation
   event.
3. Webhook → set plan on payment; no cancellation flow needed for a
   term.
4. Thread the real plan value into `shouldAttribute` and into
   `EditableExportButtons`.
5. Upgrade prompt on the gated buttons. `[EVIDENCE]` Ungated build,
   account at export — do not require a card, do not paywall upfront.

### Copy constraint

`[EVIDENCE]` Per `feedback_marketing_no_ai_framing` and the growth
plan: name the workflow, not the capability. The upgrade prompt says
what the user gets ("keep editing in PowerPoint or Overleaf"), not what
they're blocked from.

---

## 6. Decision log

| Date | Decision | By |
|------|----------|-----|
| 2026-07-28 | Editable exports (PPTX + LaTeX) paid; PDF free with acknowledgement | Gavin |
| 2026-07-28 | Both editable formats, not PPTX alone — LaTeX is a one-click bypass | Gavin, on recommendation |
| 2026-07-28 | Document only; no code this session | Gavin |
| 2026-07-28 | Pre-paywall accounts grandfathered permanently (answers the trust objection) | Gavin |
| 2026-07-28 | "First 100 users, 2 years free" REJECTED — grandfather the capability, not the tier | on recommendation; **needs Gavin's confirmation** |

---

## 7. Open questions

1. **§2 conflict is unresolved.** `2026-07-27-growth-plan.md` §2 states a
   quantity meter ("one print-ready export per term"); this document
   states a format meter with unlimited free PDF. Amend the growth plan
   or overrule this one. They cannot both ship.
2. **The 2-year/100-user grant was rejected on my recommendation, not
   yet confirmed by Gavin.** If the founding-cohort gesture matters more
   than the pricing signal, that is a legitimate different call — but
   cap the LLM-backed features either way.
3. **Does the paid tier stand on editable exports alone?** (§3) Unresolved
   until the manuscript-to-presentation pipeline ships.
