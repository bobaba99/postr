# Experiment — Design-pass architecture (Phase 2 gate)

**Status:** DESIGNED. Runs before Phase 2 (design pass) implementation.
**Owner:** Gavin. Designed 2026-07-29.
**Decides:** spec `2026-07-29-paper-to-slides.md` §4 Phase 2 — which design
architecture we build for the (free) beautification pass.

> **Why this runs first.** Phase 2 makes the plain Phase-1 deck beautiful. The
> spec *prefers* a deterministic theme (palette + type scale + layout rules
> applied in code, so every slide stays an editable text box) over image-based
> slides (which are not editable — contradicting the whole editable-export
> point). But Gavin's manual flow today is GPT-beautify → hand to Claude → PPTX,
> and the open question is whether GPT can do beautify→PPTX in one step well
> enough to skip the two-step. This experiment measures the candidate surfaces
> so Phase 2 builds the right one, not the first one tried.

---

## The three candidate architectures (arms)

- **Arm T — Deterministic theme (spec's preferred).** An LLM (text, not image)
  reads the paper's topic + the deck and returns a small structured **theme**:
  `{ palette: string[], typeScale, layoutRules, accentTreatment }`. Applied in
  code to the existing editable slides. No image model. Output is fully editable
  PPTX. Cheapest, safest, but bounded by what a code-applied theme can express.
- **Arm I — Generated imagery (decorative only).** Arm T's theme PLUS a
  `gpt-image` call for the *genuinely decorative* assets the spec permits — a
  single title-slide background, abstract shapes — never text, never content
  slides. Tests whether generated imagery adds real polish without breaking
  editability or violating the "no distraction" rule.
- **Arm P — One-step GPT→PPTX.** Give GPT the deck + a beautify instruction and
  ask it to emit a styled deck (via a structured/tool format the PPTX writer
  consumes, or an image-of-slides it renders). Tests Gavin's hypothesis that the
  GPT→Claude two-step collapses to one step. HIGH RISK to editability — measure
  whether the output is real editable text boxes or rasterized slides.

---

## What we measure (four axes)

1. **Editability (hard gate).** After the design pass, is every content slide
   still a real, editable PowerPoint text box? Open the emitted `.pptx`, confirm
   text is selectable/editable, not an image. **An arm that produces
   non-editable content slides is DISQUALIFIED** — it breaks the paid tier's
   entire value (§6). Title-slide decoration may be an image; content may not.
2. **Cleanliness / conference-appropriateness (Gavin judges).** Does it read as
   a clean academic talk, or as a distracting "AI deck"? The spec's hard rule:
   creative-but-calm devices (list layouts, quotes, progress bars, shading,
   abstract background shapes) — NO attention-grabbing animation, nothing slow to
   interpret, no meme-energy imagery (real negative feedback). Score 1–5.
3. **Research-topic fit.** Does the palette/imagery match the paper's field
   (e.g. a cognition study vs a genomics study should not get the same look)?
   Seed against the vetted [Simplified Science Publishing palettes](https://www.simplifiedsciencepublishing.com/resources/best-color-palettes-for-scientific-figures-and-data-visualizations).
   Score 1–5.
4. **Cost + latency per deck** (recorded, weighed against quality — a decisive
   factor here since polish is FREE to all users, so its marginal cost is a real
   line item, unlike extraction).

---

## Inputs

- **3 Phase-1 decks** from the fixture set, chosen for topic spread: one social
  science (SS1 — social media/well-being), one biology (BIO2 — CRISPR), one with
  numbers-heavy results (BIO4 — fasting/lifespan). Use the real generated decks
  from `.scratch`/the deck generator.
- **The design surface:** `gpt-image-*` (verified available 2026-07-29) for the
  image arms; a text model (`gpt-5.6-terra` or better) for theme generation.
  Claude Design MCP is headless-unavailable in a server path — out of scope
  unless a spike confirms headless access.

---

## Harness (built as part of the experiment)

Location: `docs/plans/experiments/design-pass/` (scripts + outputs, out of the
app). Per arm, per deck: generate the design output, write the resulting `.pptx`
(or theme JSON + a rendered preview), and record cost/latency. A `score.md`
collects the four axes; editability is auto-checked (unzip the pptx, assert
content slides carry `<a:t>` text runs, not just `<p:pic>` images). Cleanliness +
fit are Gavin's 1–5 judgement on rendered previews.

---

## Decision rule

Pick the arm that (1) **passes the editability gate** (content slides editable),
(2) scores highest on cleanliness + topic-fit, and (3) is cheap enough to run
free on every deck. On a tie, prefer **Arm T** (deterministic theme) — it is the
cheapest, most robust, and keeps the whole deck editable by construction, which
is the spec's stated preference. Record the decision + the sample `.pptx` files
back into spec §4 Phase 2.

**Expected finding (hypothesis, to be confirmed):** Arm T carries most of the
value; Arm I adds a little on the title slide; Arm P likely fails the editability
gate (image-of-slides) or is inconsistent. But that is exactly what the
experiment exists to verify, not assume.

---

## Results (run 2026-07-29) + Gavin's reframing — arms COMPOSE, not compete

First run outcomes (all costs per deck; note costs differ by work done):
- **Arm T** — theme via `gpt-5.6-terra`, **~$0.007/deck**. Themes vary
  meaningfully by field (SS1 slate-blue / BIO2 teal-navy / BIO4 sage). Editable
  by construction. Clean. **PASSES.**
- **Arm I** — Arm T + one `gpt-image-1` title background, **~$0.19/image**.
  Output is clean and abstract but arguably marginal over a solid fill. Editable
  (image is title-only). **PASSES** (design approved by Gavin).
- **Arm P** — one-step GPT → styled deck. Constrained to STRUCTURED output (not
  image-of-slides) it stayed **editable**, **~$0.016/deck**, and produced real,
  coordinated devices (3-stage progress bar = the talk arc, quote block, stat
  emphasis + method callout). Rendered for review. **Editability PASSES; design
  cleanliness pending Gavin's look at the render.**

**Gavin's reframing (2026-07-29) — long-term architecture, NOT a build-now
decision:** these are not rival arms. They **compose**:
- **Arm I** supplies the visual *structure* (abstract shape backgrounds, solid
  color regions).
- **Arm T** supplies the *parameter layer* — its field palette can **recolor
  Arm I's solid fills**, so an I background is not a frozen PNG but a
  recolorable layout. Same structure, different vibe per paper (or per user
  edit).
- This turns the design pass from one-shot generation into a **controllable
  system**, and is the natural hook for the Phase-3 "make it warmer / calmer"
  edit requests (the design-terms crosswalk feeds this).
- **Arm P** is the still-open one — Gavin needs to judge its rendered design
  before its role is settled.

So the revised direction: **Arm T as the parameter layer + Arm I structure it
recolors**, with Arm P evaluated as a possible richer generator once its render
is judged. Build Arm T first (cheapest, safest, and the parameter layer
everything else hangs off), then layer I's recolorable structure. This is
feature planning captured for later — not a commitment to build now.

---

## DECISION (LOCKED, Gavin 2026-07-29)

**Phase 2 current scope = Arm T + Arm P. Arm I deferred to a future design
feature.**

- **Arm T** — the field-aware theme / **parameter layer** (palette + type scale +
  layout rules), applied deterministically. ~$0.007/deck.
- **Arm P** — the **one-step structured styled deck** (GPT emits per-slide styled
  layout as data, not an image). Rendered and judged **good** by Gavin, and
  **cheaper in practice right now** than the two-step. Stays fully editable. The
  primary design generator for Phase 2.
- **Arm I** (generated decorative imagery + the T-recolors-I composability) —
  **SAVED for a future design feature**, out of current Phase-2 scope. The
  reframing above is preserved as the roadmap for that later feature.

Rationale: T + P together give a clean, editable, field-appropriate, cheap
design pass with no image-generation dependency or cost. I's imagery is a
nice-to-have that can layer on later (its structure is recolorable by T when it
lands). Record this in spec §4 Phase 2 when Phase 2 is planned/built.

Editability gate: PASSED by both T and P (content stays real text). Cost is not
a decider here beyond "cheap enough to run free," which T+P clear easily.
