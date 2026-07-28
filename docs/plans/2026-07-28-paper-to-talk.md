# Sequence 2 — Paper-to-talk: the trial funnel & paywall seam

**Date:** 2026-07-28
**Status:** PLANNED, NOT BUILT. Read-and-approve before any code.
**Owner:** Gavin. Decisions captured 2026-07-28.
**Depends on:** Sequence 1 (`2026-07-28-payment-and-paywall.md`) — the
`plan` backing and Stripe webhook must exist first, because export is
where payment lands.
**Builds on, does not replace:** `2026-07-27-manuscript-to-presentation.md`
(the narrative standard, the ABT structure, the pipeline design) and
`2026-07-27-manuscript-pipeline.md`. This doc is the **monetisation &
funnel layer** over that feature, not a re-spec of the pipeline.

---

## 0. The one-paragraph version

Paper-to-talk turns a manuscript into a narrative slide deck. It is the
second paid artifact, gated by Sequence 1's paywall — but with a
**trial funnel of its own**, because a deck, unlike a poster, has no
free usable output. The user **generates the first deck free** and sees
it. That first output is the **unmodified pipeline version** — honestly
labelled as raw. The upsell is a **polished version**. Payment is
charged **only at export**, in any format, and the whole thing is framed
plainly as a **free trial until export**.

---

## 1. Why a trial funnel here, and not for posters

A poster's free path ends in a usable artifact (the watermarked PDF that
hangs on a board). A **deck's free path cannot** — a slide deck you can
generate but not export or present is not usable, so "watermarked PDF
free" does not transfer. The value has to be *shown* before it is
charged, or no one converts on a thing they've never seen.

So the deck's free tier is **the demonstration itself**:

> **Generate + preview is free. Export (any format) is paid. It is a
> free trial until you export.** — decided, Gavin 2026-07-28.

This is the standard try-before-you-buy shape, adapted to the constraint
that the deck is the paid artifact.

---

## 2. The funnel, step by step

1. **Generate the first deck — free.** The user runs the pipeline on
   their manuscript and gets a real, complete deck. No card, no account
   wall before this (ungated build, account at export — same rule as
   posters, Sequence 1 §4.6).

2. **Show it as the *unmodified* version — labelled honestly.** The
   first output is the raw pipeline result. It is presented as such:
   *"This is the unmodified draft straight from your manuscript."* No
   pretending it is the finished product. `[JUDGEMENT]` Honesty here is
   the conversion lever, not against it: the raw deck is good enough to
   prove the pipeline works and rough enough that the polished version
   is an obvious want.

3. **Offer the polished version as the upsell.** A second pass —
   tighter narrative, cleaner layout, the "silver platter" finish the
   manuscript-to-presentation doc's narrative standard describes. This
   is what the payment buys, alongside the ability to export at all.
   *(What exactly "polished" does — a second LLM pass, a design pass, or
   both — is a Sequence-2 build decision; see §5.)*

4. **Preview freely, export at the wall.** The user can look at both the
   raw and (a preview of) the polished deck. The paywall is **only at
   export** — the moment they want the file, in any format, is the
   moment payment is asked. Framed as: *"Your talk is ready — unlock
   export."*

5. **Payment resolves via Sequence 1.** Export is unlocked by an active
   term, or a deck-pack credit is spent (§3). Then every export format
   is available.

---

## 3. The paywall seam — reuse Sequence 1, one difference

- **Same plan backing.** Export unlocks when `plan='term'` (active) OR a
  `deck_credits` balance exists to spend. No new payment plumbing —
  Sequence 1 owns Stripe, the webhook, and the plan columns.
- **The one difference from posters: no free export format at all.** A
  poster gives a watermarked PDF for free; a talk gives *nothing*
  downloadable for free. Every export — PDF, PPTX, Keynote, whatever
  Sequence 2 ships — is behind the wall. The free tier is generation +
  on-screen preview only.
- **Credit accounting:** a deck-pack credit is spent **on export, not on
  generation** — generation is the free trial and must stay free, or the
  trial is not a trial. The $4.99 pack = 3 deck *exports*, not 3
  generations.

---

## 4. Cost & metering — reconciled with the founding model

- Generation calls the LLM (the pipeline's one costed step,
  `gpt-5.6-terra`, `CONDENSER_MAX_TOKENS = 4096`). **A free trial means
  the first generation's LLM cost is eaten by Postr.** That is a real,
  if small, line item — modelled in
  `experiments/founding-cohort-cost-model.mjs` (typical run ~$0.015).
- **Abuse bound:** because generation is free, the meter that protects
  against unbounded generation is the same 10-outputs/month founding
  ceiling and, post-launch, the general rate limit — but note the
  *trial* generation is free to everyone, not just the founding cohort,
  so a per-user generation rate limit is needed independent of plan.
  `[JUDGEMENT]` One free full generation per manuscript, cheap
  re-previews, and a daily generation cap is the shape; tune against the
  cost model.
- A talk **export** counts as one of the founding cohort's 10 monthly
  combined outputs (Sequence 1 §6) — the pool is exports + talk exports
  together, decided 2026-07-28.

---

## 5. Build order (after Sequence 1)

Nothing here is built. The narrative pipeline design is already in
`2026-07-27-manuscript-to-presentation.md`; this is the funnel/paywall
work on top.

1. **Generation endpoint + free-trial gate** — one free full generation,
   rate-limited per user regardless of plan.
2. **Raw-vs-polished** — decide and build what "polished" is (second LLM
   pass? design/template pass? both?). Open question §6.
3. **Preview UI** — show raw and a preview of polished; both free to
   view.
4. **Export paywall** — wire deck export to Sequence 1's plan/credits
   check; spend a credit or require an active term; every format gated.
5. **Pricing surface** — the deck rows already exist in the home-page
   table (Sequence 1 §5); make sure "generate free, export paid" reads
   clearly there.

---

## 6. Open questions

1. **What is "polished"?** A second LLM narrative pass, a design/layout
   pass, or both? This defines the upsell's value and its marginal cost.
   Biggest open decision in this sequence.
2. **Export formats for talks** — PPTX + PDF at minimum; Beamer/LaTeX?
   Keynote? The editable-exports plan (`2026-07-27-editable-exports.md`)
   already scopes Beamer + PPTX for `SlideDeck`; align with it.
3. **Trial generosity** — exactly one free generation per manuscript, or
   per user per day? Tune against the cost model so free-trial LLM spend
   stays a rounding error.
4. **Does the polished version itself cost a credit to *preview*, or
   only to export?** Recommend preview-free, export-paid, to keep one
   clean paywall line ("export is the wall").
