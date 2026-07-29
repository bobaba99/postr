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
