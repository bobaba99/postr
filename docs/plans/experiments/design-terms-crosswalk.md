# Experiment — Design-terms crosswalk (Phase 3 gate)

**Status:** DESIGNED. Feeds the Phase 3 slide-viewer edit-request handling.
**Owner:** Gavin. Designed 2026-07-29.
**Decides:** spec `2026-07-29-paper-to-slides.md` §5 — how the standalone slide
viewer translates a user's casual edit request into a competent design change.

> **Why.** In Phase 3 the user reviews the design-pass output and asks for
> changes in plain language ("make it breathe", "too busy", "calmer"). The
> viewer must map that to real design operations (more whitespace, larger
> margins, a calmer type scale). A crosswalk between **professional design
> vocabulary** and **the words users actually type** is what makes casual
> phrasing land. The spec asks for *ecological validity* — real prompts, not
> invented ones.

---

## What it produces

A **crosswalk table**: `{ userPhrase (or intent cluster) → design operations }`,
where operations are concrete, code-applicable changes to the theme/layout
(whitespace, margins, type scale, palette temperature, density, alignment,
accent strength, etc.). Plus a set of **intent clusters** (the recurring things
users ask for) ranked by frequency in the sample.

---

## Sources (curated + reachable — the honest constraint)

I cannot crawl arbitrary sites freely. The sample is assembled from sources I can
legitimately reach, with the sampling limits stated up front:

1. **Web search** for real design-edit phrasing — public prompt galleries,
   design-tool documentation (Canva/Figma/Gamma/Beautiful.ai help + community
   examples), design-feedback vocabularies, and forum/Reddit threads where people
   describe wanted changes to AI-generated slides/designs.
2. **Design-critique vocabularies** — established sources on giving design
   feedback (the professional side of the map).
3. Each collected phrase is tagged with its source, so the sample's provenance
   (and its bias — docs skew more "designed" than a real novice's words) is
   visible in the output.

**Explicitly NOT claimed:** this is not a representative crawl of what *Postr's
future users* will type. It is a v1 ecological-ish sample to seed the crosswalk,
to be validated against real Postr slide-viewer edit requests once Phase 3 ships
and collects them.

---

## Method

1. Collect ~40–80 real design-edit phrases across the reachable sources.
2. Cluster them into recurring **intents** (e.g. "more whitespace / less
   cramped", "calmer / less busy", "more professional / less playful", "bigger
   emphasis on the headline", "warmer/cooler", "more consistent").
3. For each intent, define the **design operations** it maps to — concrete,
   parameterizable against the theme model Phase 2 produces (palette, type scale,
   margins, density, accent).
4. Note the phrases that are **ambiguous or under-specified** (where the viewer
   should ask a clarifying question rather than guess) — the spec's "steer to
   design decisions, not pixel edits" rule lives here.

---

## Deliverable

`docs/plans/experiments/design-terms/crosswalk.md` — the table + intent clusters
+ ambiguity notes + a provenance list. This becomes the seed for the Phase 3
viewer's edit-interpretation layer (whether that's a lookup, a prompt few-shot,
or both is a Phase 3 build decision informed by this).

---

## Decision this informs (not a pass/fail experiment)

Unlike the extraction and design-pass experiments, this one has no winning arm —
it produces a reusable artifact. The "result" is: is the crosswalk rich enough to
handle the common intents, and which intents are ambiguous enough to require a
clarifying-question flow? That shapes the Phase 3 viewer design.
