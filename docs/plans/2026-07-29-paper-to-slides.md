# Paper-to-Slides — consolidated spec

**Status:** PLANNED, NOT BUILT. Read-and-approve before any code.
**Owner:** Gavin. Decisions captured 2026-07-29.
**Slug:** `/paper-to-slides` (canonical). `/paper-to-present`, `/paper-to-presentation`
308-redirect here when this ships.

> This doc **merges and supersedes** `2026-07-27-manuscript-to-presentation.md`
> and `2026-07-28-paper-to-talk.md` (both deleted; pointers left behind). It is
> the single source of truth for the talk feature. It **builds on, does not
> replace,** `2026-07-27-manuscript-pipeline.md` (the shared engine that also
> feeds `/paper-to-poster`) and `2026-07-27-editable-exports.md` (the PPTX
> writer). Pricing is governed by `2026-07-28-pricing-and-market-strategy.md`
> and `2026-07-28-payment-and-paywall.md`.

---

## 0. Thesis

Paper-to-slides turns a manuscript into an **ordered, editable slide deck** built
on a fixed scientific narrative arc. It is the deck sibling of `/paper-to-poster`:
same ingest, same pipeline engine, a different output shape.

**A poster is not a compressed paper. A talk is not a narrated poster. They are
three genres.** The talk *expands* findings — one finding per slide — where the
poster compresses them into one region. A pipeline that emits the same content
for both is doing it wrong. The named failure mode is **genre collapse**, guarded
by a test asserting one finding per slide.

The narrative standard (fixed, not negotiable — it is scientific research, there
is no alternative framing): **most important result first → build the
introduction gap and tension → how the current study resolves it → methods and
charts as fill-ins.** This is the ABT arc (And / But / Therefore; Olson) with
Assertion-Evidence headlines (Alley). Evidence supports that a clear arc aids
**comprehension and retention** — it must NOT be sold as a citation- or
career-boost guarantee (Boyd et al. found no link between story structure and
popularity). This constrains product copy as much as the prompt.

---

## 1. Product scope

- **Input → output:** a manuscript (pasted text or `.docx`; PDF secondary) → a
  multi-slide **editable** `.pptx` deck, plus a free PDF via the print flow.
- **Fixed skeleton:** title slide always first, references always last. Both are
  **excluded from the speaking-time budget** — a 10-minute talk is ~10 content
  slides *plus* these two.
- **Slide count is computed, not asked as a number:** the "1 minute per slide"
  rule off the existing Q6 duration question.
- **Editability is a hard requirement:** every slide is a real PowerPoint text
  box. Image-based slides are forbidden — they contradict the whole point.
- **Hard word gate — ≤30 words per slide** (strict ceiling, enforced
  deterministically *after* the LLM condense, same "cut, don't shrink" rule).
  Posters stay flexible on word count but the prompt still pushes hard for
  conciseness. The gate prevents the wordy-slide failure (slides that compete
  with the speaker and win — Ameen 2026, Gelernter 2017).
- **Privacy reassurance (both features):** a persistent, quiet line —
  *"Your manuscript is never stored on our servers, and is never used to train
  AI."* Verified true: no Supabase insert/upsert/storage write of manuscript
  content exists anywhere in `apps/api` or `apps/web/src/manuscript`. The
  manuscript lives in browser memory and transits the LLM provider in-flight
  only. State it precisely — "never stored," not "never seen."

---

## 2. The wizard — one surface, target ≤8 turns

Everything happens in the one chat shell (no workspace switch). The turn budget:
constraints → star-finding → figures/tables → narrative → tweaks → export.

**Turn 1 — Constraints (minimal, not comprehensive).** Upload the paper; ask
talk **duration** and **format**. That is enough to start. **Prominent tip
callout up front, before any effort is invested:** *"PDF export is free.
PowerPoint (.pptx) export is paid."* Plus the privacy line (§1).

**Turn 2 — Star-finding selection.** An **LLM call extracts the results and
findings** (extraction is LLM-driven, not deterministic — we cannot assume every
author writes cleanly). The findings are shown as **ranked cards**; the user
picks the single most important one to structure the talk around. This is the
core the whole arc is built from.

**Turn 3 — Figures / tables.** The **existing plot-picker is docked as a menu
item** in the chat (`manuscript/ui/ChartPanel.tsx`, `charts/ladder/ChartChooser.tsx`,
`charts/recommend.ts`) so the user resolves a plot/table presentation decision
without leaving the flow. One chart per ranked result slide; figures preferred
over tables per the existing Q2.

**Turn 4 — Narrative branch (user chooses).**
- **Auto:** the LLM detects the **gap** and the **study's significance** from the
  text, **shows both back to the user to confirm or edit**, then — once confirmed
  — synthesizes the fixed arc (core finding → gap/tension → resolution → methods
  and charts as fill-ins).
- **Own:** the chat asks two questions — *"What is the gap?"* and *"How does this
  study close it?"* — and builds a streamlined narrative from the answers.

**Turns 5–7 — Visuals & speaker notes (this is also the polish step).** A short
question set turns the arc into slide **visuals** (the limited on-slide text) and
**speaker notes**. **Speaker notes are verbatim from the paper + the user's
answers, each carrying provenance** — e.g. *"Intro, ¶1, the sentence starting
'Prior work has shown…'."* Provenance is the anti-hallucination lever, made
user-visible. Result: minimal on-slide text plus rich, sourced notes.

This step also takes the **vibe prompt** that drives the (free) design pass: a
single **optional** field — *"Describe the vibe, or leave blank to follow your
narrative."* Blank = the theme is derived from the paper/narrative automatically.
Offer **two short recommended prompts** as tappable suggestions (e.g. *"Clean and
minimal, lots of whitespace"* / *"Confident and bold, strong headline emphasis"*).

**Turn 8 — Tweaks → export.**

---

## 3. Architecture — reuse, do not fork (documented)

The pipeline is shared with the poster. This reuse is **deliberate and
documented here** so that a future change to shared code is made with the
knowledge that both features depend on it.

| Stage | Module | Change for the talk |
|---|---|---|
| Ingest (paste/`.docx`) | `manuscript/docxIngest.ts`, `parseManuscriptText.ts` | none |
| Document model (IR) | `manuscript/buildDocumentModel.ts` | none |
| Section mapping | `manuscript/mapper.ts` | none |
| **Extraction** | `manuscript/coreRelevance.ts` | **approach decided by experiment (see §3.1)** |
| Interviewer | `manuscript/interviewer.ts` | shared question set, output-type branch |
| Budgets | `manuscript/rubric.ts` | slide budgets + the ≤30-word slide gate |
| Condense | `apps/api/src/narrative/*` | same call, slide-shaped roles |
| Build deck | **new** `manuscript/buildDeck.ts` | slide arc + title/reference slides |
| Emit PPTX | `export/pptx/*` | **multi-slide** (exporter is single-slide today) |

**New work:** `buildDeck.ts`; multi-slide PPTX emission; the LLM star-finding
extraction + ranked cards; the two-branch narrative chat; the independent slide
viewer (§5); the design pass (§4.2).

### 3.1 Documented divergences from the shipped pipeline

These are the traps a future editor must know about. Record them in the code
(reuse-ledger comment) as well as here.

1. **Extraction approach is DECIDED BY EXPERIMENT — do not build it until the
   experiment picks a winner.** The talk needs *ranked findings with a verbatim
   quote each* for the star-finding cards. Two candidate approaches:
   - **(A) Upgrade the deterministic engine** (`coreRelevance.ts`) with stronger
     signals — semantic relatedness, semantic/word-content frequency,
     informational density — so it extracts and ranks findings well without an
     LLM. Keeps the poster path deterministic, zero added cost/latency.
     `coreRelevance` stays the structure decider regardless.
   - **(B) Add an LLM extraction layer** (server-side, `apps/api`) that reads the
     results text and returns ranked findings, each with a mandatory verbatim
     `sourceQuote` (fidelity gate). Survives badly-written papers better, but adds
     cost/latency/hallucination surface.
   **The experiment (§4 Phase 0) runs BEFORE any implementation** and scores both
   arms on three axes: (1) **ranking agreement** with a human gold set (star
   finding + top-3 on N real papers), (2) **fidelity** — every claimed finding is
   supported by a verbatim span actually in the paper, none invented or
   misattributed, and (3) **robustness on badly-written papers** (≥2 deliberately
   poorly-structured manuscripts). Whichever wins is what gets built; if the
   deterministic upgrade wins, `/paper-to-poster` gains nothing risky at all.
   IMPORTANT: this reverses the earlier "refactor to LLM" assumption — that was
   never validated, and the experiment exists precisely to validate it.
2. **Poster PPTX loses its 5 empty layout slides.** Those layout slides
   (`export/pptx/templateSlides.ts`: three-col, two-col, billboard, sidebar,
   blank + explainer) are **presentation scaffolding** — they exist so a user can
   duplicate an empty styled slide in PowerPoint. Postr has **no slide editor**,
   so on a *poster* they are noise. The poster `.pptx` becomes just the poster
   canvas (slide 1). **The talk export keeps these layout slides — it needs them.**
   Touches `export/pptx/templateSlides.ts`, `masters.ts`, and the importer
   contract in `import/pptx/parsePptx.ts` (which subtracts `TEMPLATE_SLIDE_PREFIX`
   slides before warning).

### 3.2 Deterministic-first everywhere except the two named LLM steps

No LLM decides *structure*. The slide arc, word budgets, the ≤30-word gate,
citation formatting, slide-count derivation, and theme application are all
deterministic. The LLM does exactly two things: (a) extract + rank findings
(§2 turn 2, §3.1), and (b) condense mapped roles to their word budgets and
detect/synthesize the narrative (§2 turn 4). Model: `gpt-5.6-terra`, one place
(`apps/api/src/narrative/config.ts`), provider-agnostic interface, forced
tool-use JSON. Prompt-cache ordering fix already landed (panels-then-emphasis,
~91% cacheable prefix).

---

## 4. Phasing

### Phase 0 — Mockup + experiments (this stage, before any build)
- **UX/UI mockup of the full wizard + the slide viewer** — the primary artifact
  to align on before writing pipeline code.
- **Two experiments, run in parallel with the mockup:**
  1. **GPT-image PPTX-generation test.** Today Gavin's manual flow is
     GPT-beautify → hand to Claude → PPTX. Hypothesis: GPT can now do
     beautify → PPTX in one step reasonably well. Test it. **Inputs = real
     papers fetched via Consensus MCP.** Deliverable: a go/no-go on the
     one-step path and which surface produces the cleanest editable PPTX.
  2. **Design-terms crosswalk.** Crawl **real prompts people use when doing UI
     design with an LLM** (for ecological validity) → build a map between
     professional design vocabulary and the words users actually type. Feeds the
     slide viewer's edit-request handling so casual phrasing lands as good edits.

### Phase 1 — Correct & complete, black-and-white (no design model)
The full wizard + a **text-only editable deck**. Black text, white background,
one clean typeface, generous margins, no colour/imagery/theme. It must be
**correct and complete before it is pretty.** Deliverables: `buildDeck.ts`,
multi-slide PPTX emission, title + reference slides, the ≤30-word gate wired to
real budgets, duration→slide-count, PDF via the print flow. Acceptance: a
12-page manuscript → `.pptx` opening in PowerPoint / Keynote / Google Slides /
LibreOffice, every slide inside its word budget, correct citations, **no invented
content**. **No design model at all in this phase.**

### Phase 2 — The design pass (FREE to everyone; not the paywall)
**The polish is free.** Both the free PDF and the paid `.pptx` go through the
full beautification — theme, icons, palettes, graphics. Polish is **never** what
the user pays for (see §6). This must be stated plainly in the UI so there is no
surprise at export.

Research-theme-aware beautification, applied **deterministically** so every slide
stays editable. **LLM output first**, seeded with reference palettes
([Simplified Science Publishing](https://www.simplifiedsciencepublishing.com/resources/best-color-palettes-for-scientific-figures-and-data-visualizations)).
Deliverables:
- **Theme applied to every slide** — a research-topic-aware palette + type scale +
  layout rules + accent treatment. One design call per *deck*, not per slide.
- **An icon-library slide** — ~8–12 topic-relevant icons the user can
  duplicate / substitute / swap after exporting to PPTX.
- **A 4-palette slide** — four curated palettes matched to the paper's theme, for
  the user to pick or swap in PowerPoint.
- **Prompt targets conference-tolerable devices only:** creative ways to present
  lists, quotes, progress bars, text shading, abstract shape combinations as a
  background, and the like. **No attention-grabbing animation. Nothing slow to
  interpret.** Academics do not want distraction (real negative feedback came
  from inserting two meme photos). Keep it clean. A single decorative asset on
  the *title* slide is acceptable; never on content slides.
- **Design surface: GPT-image for now** (fallback and current committed path;
  Claude Design MCP is headless-unavailable in a server request path — a Phase-2
  spike may revisit it only if headless access is confirmed).

---

## 5. The slide viewer (independent)

A **standalone** viewer — **not** wired into the poster editor. When the first
design output lands, the user reviews slides and **comments / circles where fixes
are needed.** Guidance in the UI **steers users toward bigger design decisions,
not pixel-perfect edits** (pixel-chasing an LLM design pass wastes turns). The
design-terms crosswalk (§4 experiment 2) is what makes casual edit requests land
as competent design changes.

---

## 6. Monetization

**The polish is FREE. You never pay for beauty — only for the editable file.**
This is non-negotiable and must be written out plainly in the export UI so there
is zero surprise.

- **Everything is free up to and including the polished deck:** extraction,
  narrative, preview, the vibe prompt, and the **full design pass** (theme, icons,
  palettes, graphics). Both output formats go through the *same* polish.
- **The ONLY difference between free and paid is the file you take out:**
  | | Free — **PDF** | Paid — **PowerPoint (.pptx)** |
  |---|---|---|
  | Polished/beautified deck | ✅ full | ✅ full (identical) |
  | Editable in PowerPoint | — (final-form) | ✅ real text boxes |
  | Empty layout slides to duplicate | — | ✅ 5 styled layouts |
  | Icon-library slide | shown in-deck | ✅ + as duplicable slide |
  | 4-palette slide | shown in-deck | ✅ + as duplicable slide |
  | "Made by Postr.sh" mark | ✅ on the ack slide | — none |
- So the user pays purely for **editability + the PowerPoint scaffolding +
  no watermark** — never for the design. Say this explicitly at the export step.
- **PDF watermark:** on the acknowledgement slide only — **PNG, never SVG**
  (pptxgenjs and the raster path are image-only; SVG throws). **One unified mark
  everywhere: the icon + "Made by Postr.sh."** It **never blocks real content.**
  (Today `export/ackMark.ts` emits SVG; the PDF/print ack path must move to a
  pre-rasterized PNG of icon + wordmark, the same asset the PPTX path rasterizes.)
- **No LaTeX / Beamer** — dropped.
- **Pricing (canonical):** **$18.99 CAD / 4-month term** (unlimited talk export)
  **OR $9.99 CAD / 3-export pack** (credit spent at *export*, not generation).
  Bill a rolling 4 months from purchase, never an academic calendar.
- **Abuse bound:** because generation is free to everyone, a **per-user
  generation rate limit** is required, independent of plan (~$0.015 LLM cost per
  run; one free full generation per manuscript + a daily cap is the shape).

---

## 7. Discoverability & entry points

- **Nav bar + sitemap:** add **both** `/paper-to-poster` and `/paper-to-slides`
  to `components/PublicHeader.tsx` (and `PublicFooter.tsx` where tools are
  listed), and to `apps/web/src/seo/routes.json` (+ generated sitemaps).
- **New-poster flow:** when a user creates a new poster, add an **"Import
  manuscript" button** (near `NewPosterButton.tsx` / `ImportPosterModal.tsx`)
  that links into `/paper-to-poster`, carrying the **privacy notice** (no
  storage, no AI training).
- **`/paper-to-slides` stays a standalone feature** for now — not embedded in the
  poster editor; the slide viewer is likewise independent.
- **The SEO prize (separate, high-value):** `how many slides for 10 minute
  presentation` — 480/mo, KD 0, $12.51 CPC — the product computes the answer
  directly. Build a free no-auth `/slides-for-a-talk` calculator (duration →
  slide count + per-section breakdown from the same rubric) that works day one,
  then one honest link to the paid generator. `/paper-to-poster` **remains the
  canonical standalone**; presentation does not take over its ranking.

---

## 8. Open questions

1. **Extraction-refactor timing.** Ship the poster-path LLM-extraction refactor
   (§3.1) as its own hardening task *before* Phase 1 (recommended), or inside the
   feature? It destabilizes a live feature, which is the argument for doing it
   first and separately.
2. **What "polished" precisely is** — the design pass is decided as theme +
   icon slide + 4-palette slide; the exact prompt and the GPT-image-vs-two-step
   question is resolved by Phase 0 experiment 1.
3. **Journal club — a future selling point, not MVP.** Presenting *someone
   else's* paper is a distinct, valuable mode (the interviewer's "your findings"
   framing is wrong for it, so it needs its own framing — "the paper you're
   presenting," a critique/discussion arc rather than a contribution arc). It is
   **out of scope for the MVP** but explicitly flagged here as a **planned second
   selling point** to build after the core paper-to-slides ships. Do not delete
   this — it is a deliberate roadmap item.
4. **`/poster-to-talk`** — accept a foreign poster PDF, or only `.postr`? (Widens
   the funnel but quality drops. Deferred; `/paper-to-slides` is the v1 surface.)

---

## 9. Marketing / copy constraints

- **No AI framing** — name the workflow, never the capability
  (`feedback_marketing_no_ai_framing`). Every printed claim verified against what
  the code does first.
- **No overclaiming** — do not imply a finished, submittable talk; it is a
  structured first draft with the word budgets and fidelity already enforced.
- **Narrative claim stays narrow** — "a clear arc aids comprehension and
  retention," never a citation/career guarantee (§0 caveat).
