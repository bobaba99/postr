# Manuscript → Poster → Presentation, and the Narrative Builder

> **For Claude:** design doc, not yet an implementation plan. Do not start building.
> Requires `docs/plans/2026-07-27-editable-exports.md` (PPTX writer) as a hard dependency
> for the presentation half.

**Goal (Gavin, 2026-07-27):** one source document in, a poster and/or a talk out — and
crucially, **each stage must work as a standalone export.** The user should be able to
upload a manuscript and download a finished poster without ever opening the Postr editor.
Editing in Postr is an *option*, not a step.

**Scope note:** the narrative builder is not a separate feature from this pipeline — it is
its engine. Per `project_narrative_builder_feature`, the design is already specified and
this is a **rubric domain, not a discovery domain**. No user research gate. What follows
encodes the rubric.

---

## 1. The thesis that makes this not-terrible

**A poster is not a compressed paper. A talk is not a narrated poster. They are three genres.**

Almost every automated paper→poster tool fails the same way: it summarises each manuscript
section proportionally and lays the result out in a grid. That reliably produces the exact
poster researchers hate — a wall of text, methods over-represented, the finding buried in
paragraph four. Proportional summarisation is the bug, not the feature.

The rubric therefore has to be **lossy on purpose and asymmetric**. It must delete more
than it keeps, and it must delete *different* things for a poster than for a talk.

Stated as a rule the implementation must honour:

> Every output section has a **hard word budget**. When the source exceeds it, we cut —
> we never shrink the type to fit. Type size is a print-legibility constraint owned by the
> readability checker, and it is not negotiable by the narrative layer.

That single rule is what separates this from the commodity tools.

### On competitors — explicitly deprioritised

Gavin, 2026-07-27: *"don't worry about competition yet."* Build the thing; do not scope
around what Paper2Poster or anyone else ships. This section is kept to one paragraph only
because it names the differentiators that happen to also be *good product decisions*, not
because the competitive position needs defending right now.

The parts worth building well on their own merits: **print correctness** (real physical
sizes), **figure legibility at physical size** (nobody else measures whether axis labels
survive at 3 feet), **author/affiliation structure**, and **conference-spec compliance**.
Every UI string still follows `feedback_marketing_no_ai_framing` — name the workflow, never
the technology.

---

## 2. The narrative rubric

### Poster roles

The five-role spine, in poster reading order:

| # | Role | Sourced from | Budget | Cut rule |
|---|---|---|---|---|
| 1 | **Hook** — why anyone should care | Intro ¶1, abstract ¶1 | ≤ 40 w | Drop entirely if the title already carries it |
| 2 | **Question** — the actual question or hypothesis | Intro final ¶, abstract "we asked/tested" | ≤ 60 w | Never dropped. If absent, flag to the user — a poster without a question is the #1 structural failure |
| 3 | **Methods** — only what's needed to trust the result | Methods | ≤ 80 w | Prefer a diagram/flow figure over prose. Drop instrument model numbers, software versions, ethics IDs |
| 4 | **Key result** — figure-led, 1–3 findings max | Results + best figures | ≤ 150 w | Rank findings by **relevance to the core** (not prominence — see below); keep top 3. Every kept finding must have a figure or a number |
| 5 | **Takeaway** — what changes now | Discussion ¶1, conclusion | ≤ 60 w | Never dropped. **This is the core message (tier 1).** |

**Cut by default** — literature review, limitations, discussion beyond ¶1, full reference
list (trimmed to ≤ 5), acknowledgements, appendices, supplementary anything — but this is
now a scoring **prior**, not a verdict. See §2.6.

Total body budget ≈ **390 words**, against the ~800-word ceiling most conference guidance
implies. The gap is deliberate: figures and whitespace get the rest.

### 2.6 Selection is hierarchical, not a ranked truncation

**Owner requirement, 2026-07-27:** *"for the narrative, it's also hierarchical when picking
things to include in the output, start with the core thing, then everything is included
revolving this core finding and message."*

Implemented in `apps/web/src/manuscript/coreRelevance.ts`, consumed by `mapNarrative()`.

**The core is established first.** The author's Q1 takeaway is primary. Absent that, the
fallback is deterministic — title + top finding + abstract — and `core.source` reports which
was used (`'takeaway'` | `'derived'`) so the UI can say so and the outline can warn that a
derived core is provisional.

**Everything else is scored for relevance to that core**, never for prominence alone:
weighted term overlap (TF-IDF over the manuscript's own sections), shared numbers/statistics,
section-kind priors, prior prominence, and position. Signals are renormalised over those that
can actually fire, so a takeaway containing no digits does not silently compress every score.

| Tier | What | Budget behaviour |
|---|---|---|
| 1 | the core message (the takeaway role) | never cut, first claim on budget |
| 2 | direct evidence for the core | protected |
| 3 | context that makes it interpretable (methods, hook) | squeezed before tier 2 |
| 4 | everything else | cut first |

**Budgets are allocated by tier** (`tieredBudget`), not by fixed per-role numbers.
`POSTER_ROLE_SPECS` remains the shape and the **ceiling** — tiering only ever takes words
away, and only under **scarcity**: at scale 1 (no stated Q6 slot) every role keeps its full
rubric budget, because there is nothing to ration. The squeeze interpolates with slot
tightness rather than arriving as a cliff. A required role can never be starved below
`REQUIRED_ROLE_MIN_WORDS`.

**Two absolute overrides, both favouring the user over the algorithm:**
the Q2 finding ranking wins even against a higher-scoring alternative, and a Q5 pin is never
cut at any score.

**Anti-circularity (load-bearing).** When a takeaway exists, the top-ranked finding is
deliberately *excluded* from the core. Folding it in would let that finding score against a
core built partly out of itself — and since the lead finding is chosen by prominence, that
circularity quietly reinstates prominence as the verdict, which is the whole behaviour this
replaces. Guarded by tests in `__tests__/hierarchy.test.ts`.

Scoring is **fully deterministic** — no LLM, no clock, no RNG. Every score carries which
signals fired and what each contributed, so the outline explains a cut in one short phrase
("little overlap with your main message") rather than showing a number.

This is the mechanism behind **"write backwards"** (Montagnes et al. 2021, see the
manuscript-to-presentation plan §0.1): establishing the core first and building outward from
it is the structural form of starting at the conclusion.

### Talk roles

Same spine, different physics. A poster is read in any order and stands alone; a talk is
strictly sequential and has a presenter to carry the connective tissue.

| Slide | Role | Budget | Notes |
|---|---|---|---|
| 1 | Title | — | Title, authors, affiliations, venue |
| 2 | Hook | ≤ 25 w | Often one image, one sentence |
| 3 | Question | ≤ 20 w | Frequently the only text on the slide |
| 4 | Methods | ≤ 30 w | The diagram earns its place here more than on a poster |
| 5–7 | Key result | ≤ 25 w/slide | **One finding per slide** — this is the main structural difference from the poster, where all three share a column |
| 8 | Takeaway | ≤ 30 w | |
| 9 | Acknowledgements / contact | — | |

The asymmetry is the point: **the poster compresses the three findings into one region; the
talk expands them into three slides.** A pipeline that emits the same content for both is
doing it wrong.

### 2.5 The emphasis questionnaire — this *is* the narrative assistant

Gavin, 2026-07-27: *prompt a questionnaire to ask the user what they want to emphasise with
their poster and talk presentation — basically the narrative assistant here taking shape.*

The rubric in §2 decides **structure**. The questionnaire decides **emphasis** — which of
several defensible framings of the same manuscript to build. That is the part only the
author knows, and asking beats guessing.

**Asked once, answered twice.** Poster and talk get separate answers where they diverge,
because the right emphasis genuinely differs: a poster is skimmed by a stranger at 3 feet, a
talk is narrated to a seated audience.

**Question set as shipped (revised 2026-07-27).** The earlier draft is kept below the
table for provenance.

| # | Question | Options | Feeds |
|---|---|---|---|
| 1 | **What's the one thing someone should remember?** | free text, one sentence, ≤ 25 words | Takeaway role; also the Q5 relevance scoring |
| 2a | **Table or plot?** | A plot · A table, with a one-line reminder that a plot condenses better on a poster | `resultDisplay`; PLOT opens the chart chooser as an inline side panel |
| 2b | **Which result leads?** | the auto-extracted findings, ranked — user picks or keeps the order | Key result promotion (`rankedFindings`, still consumed by prompt.ts) |
| 3 | **Who's reading this poster?** | Specialists in my subfield · General researchers in my field *(sub-text: conference or department talk)* · **Other →** free text | jargon tolerance, how much Methods survives |
| 4 | **What's the poster for?** | Course requirement · One-time presentation · Committee meeting · Lab presentation · Getting feedback · Finding collaborators · Job market | Hook framing |
| 5 | **Which sections are critical?** | **derived and ranked**, pre-selected, user adds/removes | pins content against the budget cutter |
| 6 | **Any limit on the presentation?** | No limit · 5 / 10 / 15 min chips, or type "12 slides" | `requirements`; scales the rubric's word budgets |

### Q2 — result display and the data path

Reframed from "which result matters most" to **how the results should be shown**, because
that is the decision that actually changes the poster. The finding-ranking question survives
as Q2b: `narrative/prompt.ts` consumes `rankedFindings`, so deleting it would silently drop
the author's ordering.

Picking **plot** opens the existing chart chooser (`apps/web/src/charts/ladder/ChartChooser`)
as a **side panel inline in the flow** — imported, never forked — plus a link to the full
`/chart-chooser` page. Data reaches it by two paths, both chosen deliberately:

- **(a) extraction.** `.docx` `<table>` grids are reconstructed at ingest
  (`docxIngest.readTableGrid` → `ManuscriptTableRef.data`) and offered pre-filled, results
  tables first (`tableExtract.ts`). Deterministic parsing — no model call.
- **(b) fallback.** Extraction finding nothing, or the user rejecting the offer, drops
  through to the chooser's own paste / CSV / XLSX ingest. Pasted text always lands here: a
  paste carries captions but no cells.

### Q3 — audience, and why the free text is not classified by a model

Two chips plus **Other**. Typed text is matched against **prepared presets** by a
deterministic keyword search (`audiencePresets.ts`): clinicians, general public,
adolescents, children, undergraduates, policymakers, industry. Matching is word-boundary
based on a normalised string, so "publication" cannot resolve to "public". Only a genuine
miss passes the text through as a custom audience.

This is the governing principle in miniature: **search/match presets first, model never on
the happy path.** Classifying "school nurses" is a keyword table's job, and a wrong guess
quietly changes how much jargon survives.

Every `AudienceOption` and `PurposeOption` MUST have an entry in `AUDIENCE_DESCRIPTIONS` /
`PURPOSE_DESCRIPTIONS` in `narrative/prompt.ts`, and MUST appear in the zod enum in
`narrative.ts`. The maps are `Record<Option, string>` so a missing key is a compile error;
`narrativePrompt.test.ts` covers the runtime half. A missing key would otherwise render the
literal string "undefined" into the owner-audited prompt.

### Q5 — derived, not asked from a cut list

The old Q5 handed the user the cut list and asked what to rescue, which makes the user do
the work of noticing what the cutter was about to destroy. Now `sectionRelevance.ts` scores
every non-spine section against the paper's core (Q1 takeaway ×3, title ×2, findings ×2,
abstract ×1) using term overlap with TF-IDF-ish weighting, the section lexicon's own kind
prior, heading semantics, and position. The ranking is **shown**, the top candidates are
**pre-selected** up to `MAX_PINNED_SECTIONS`, and the user adds or removes.

**Never fully automatic** — Gavin was explicit. The derivation suggests; the user decides.

`sectionRelevance.ts` scores sections for the **interview** (what to pre-select at Q5);
`coreRelevance.ts` (§2.6) scores every candidate for the **mapper** (what tier it lands in
and how much budget it gets). They share `contentTerms()` and the same TF-IDF idea. A Q5 pin
is carried into the mapper as an absolute override, so a pinned section is never cut however
it scores.

### Q6 — one minute per slide

Either side may be stated and the other is derived (`requirements.ts`), with the arithmetic
shown rather than hidden: "10 minutes is about 10 slides, at a minute each." The constraint
feeds `budgetScaleForSlides` in `rubric.ts`, which scales every panel's word budget in
[0.7, 1.0] against a 10-slide reference — a gentle, clamped nudge, because the budgets are
the rubric and a questionnaire answer may adjust them, never rewrite them. A poster stays a
poster at every slot length. The answer is persisted regardless, since the poster-to-deck
path needs it.

<details>
<summary>Original 2026-07-27 draft of the question set (superseded)</summary>

| # | Question | Options | Feeds |
|---|---|---|---|
| 1 | **What's the one thing someone should remember?** | free text, one sentence, ≤ 25 words | Takeaway role; also reorders Key result |
| 2 | **Which result matters most?** | the auto-extracted findings, ranked — user drags or picks | Key result promotion |
| 3 | **Who's the audience?** | Specialists in my subfield · Adjacent researchers · Mixed / general conference · Clinicians | jargon tolerance, how much Methods survives |
| 4 | **What's the poster for?** | Getting feedback · Recruiting collaborators · Job market · Requirement | Hook framing, whether contact/QR is prominent |
| 5 | **Anything you must NOT cut?** | multi-select over detected sections | pins content against the budget cutter |
| 6 | *(talk only)* **How long is your slot?** | 3 / 5 / 10 / 15 min | slide count, findings per slide |

</details>

**Question 1 is load-bearing and must stay free text.** It is the single highest-signal input
in the whole pipeline — it is the author stating their own thesis, which is precisely what
the condenser otherwise has to infer. It is also the question that makes this feel like an
assistant rather than a converter.

**Question 5 exists because the cutter is aggressive by design** (§1). Without a pin
mechanism, a user whose limitations section is mandatory in their field has no recourse but
to give up on the tool. Pinned content is exempt from budget cuts; if pins overflow the
budget, say so plainly and let them choose what gives.

The questionnaire is **entirely deterministic** — it is a form, its answers are structured
data, and it is the only user input the condenser prompt receives beyond the manuscript.

---

## 3. Pipeline

**Ingest priority changed (Gavin, 2026-07-27): expect pasted text or a DOCX upload.** Those
are the two Phase-1 inputs, not PDF. This inverts the earlier draft and it is the right call
for psychology and medical students, who are working from a Word manuscript long before
anything is a typeset PDF — and pasted text needs no parser at all, so it is the cheapest
possible path to a working MVP. PDF stays supported (the importer already exists) but is no
longer the primary case.

```
        ┌──────────── ingest ────────────┐
TEXT ───┤ paste — no parser  ★ primary   │
DOCX ───┤ mammoth (new)      ★ primary   ├──► DocumentModel
PDF ────┤ pdfImport.ts (exists)          │
.tex ───┤ latex parser (new, thin)       │
MD ─────┤ trivial                        │
        └────────────────────────────────┘
                      │
                      ▼
             structure extraction        ── sections, figures+captions, tables,
             (deterministic + LLM)           refs, authors/affils, abstract
                      │
                      ▼
             ┌─── narrative mapper ───┐   ── DETERMINISTIC. section → role,
             │   rubric §2, no LLM    │      ranking, cut rules
             └────────────────────────┘
                      │
                      ▼
             ┌─── condenser (LLM) ────┐   ── per-role, budget-constrained,
             │  forced tool-use JSON  │      one call for all roles
             └────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
      PosterDoc               SlideDeck
    (exists today)            (new type)
          │                       │
     ┌────┴────┐             ┌────┴────┐
     ▼         ▼             ▼         ▼
   PDF      .postr         PPTX      PDF
   PPTX     open in         open in
   LaTeX    Postr           Postr
```

### Where the LLM is and is not

Gavin's framing, 2026-07-27: **"mostly deterministic until the actual narrative."** That is
exactly the split below.

**Deterministic (no LLM):** ingest, section detection, figure/caption pairing, author and
affiliation parsing (`parseAuthors.ts` exists), reference parsing, **role mapping, ranking,
and all cut decisions**, layout, budgets, and the entire emphasis questionnaire (§2.5).

**LLM (one call, forced tool-use):** condensing each mapped role to its word budget under
the user's stated emphasis, and shortening over-long figure captions. That is the narrative
step and nothing else.

This split matters. Structure is a rubric we own and can test; prose compression is
genuinely a language task. Letting the model decide *structure* is how you get a poster with
a 300-word literature review, because that's what the source emphasised.

### Model choice

**Primary: `gpt-5.6`** — Gavin's call, for cost/performance balance.

> ⚠ I cannot verify that model identifier against my own knowledge (training cutoff May
> 2026), so **confirm the exact API model string** against OpenAI's current model list
> before wiring it. If the identifier is wrong the failure is a 404 at request time, which
> is at least loud rather than silent.

**Also required: a cheaper-model bake-off.** Gavin asked for an experiment across cheaper
OpenAI *and* Anthropic models. Structure it as a real eval, not a vibe check:

- **Fixed input set** — 8–12 real manuscripts spanning psychology and medicine (the target fields), including at least two that are badly written, because that is the actual hard case.
- **Graded output**, per role, on: budget adherence (mechanical, free to score), whether the correct finding was promoted, factual faithfulness to the source, and readability at poster length.
- **Score blind** and record cost + latency per document alongside quality.
- **The condenser must be provider-agnostic** — one `condense(roles, emphasis, model)` interface with adapters, so swapping models is config, not a rewrite. Build this from the start; retrofitting it after the fact is what makes bake-offs never happen.

**Prompt ownership:** Gavin will audit the narrative prompt himself later. So keep it in a
single, clearly-marked, well-commented module (`narrative/prompt.ts`) with the rubric's word
budgets injected as data rather than prose — not scattered through the call site, and not
assembled from fragments.

### `DocumentModel` — the intermediate representation

One IR for every input format and every output format. Without it this becomes an N×M
matrix of converters.

```ts
interface DocumentModel {
  version: 1;
  title: string;
  authors: Author[];            // reuse the existing first-class model
  affiliations: Affiliation[];
  abstract: string | null;
  sections: Section[];          // { heading, level, paragraphs[], sourceOrder }
  figures: Figure[];            // { id, imageRef, caption, sourceSection, prominence }
  tables: TableRef[];
  references: Reference[];      // reuse citations.ts
  venue: { name: string; year: number } | null;
}
```

`prominence` on figures is what drives "which figure is the money figure" — derived
deterministically from mention count in Results, position, and size in the source PDF.

---

## 4. Standalone mode — the actual requirement

Three routes, each a complete upload → download loop with **no editor step**:

| Route | In | Out |
|---|---|---|
| `/manuscript-to-poster` | **pasted text or .docx** (PDF/.tex also accepted) | poster PDF, PPTX, LaTeX, `.postr` |
| `/poster-to-talk` | `.postr`, or a poster PDF | PPTX, PDF |
| `/manuscript-to-talk` | **pasted text or .docx** | PPTX, PDF |

### The screen — a chat interface

Gavin, 2026-07-27: **make the standalone mode a chat interface.**

```
┌──────────────────────────────┬───────────────────────┐
│  Paste your manuscript, or   │                       │
│  drop a .docx            [↑] │   [ live preview ]    │
│                              │                       │
│  ▸ Got it — 4,800 words,     │   poster thumbnail    │
│    6 figures, 3 findings.    │   updates as the      │
│                              │   conversation        │
│  What's the one thing        │   progresses          │
│  someone should remember?    │                       │
│  ┌────────────────────────┐  │                       │
│  │                        │  │                       │
│  └────────────────────────┘  │                       │
│                              │                       │
│  [Difference] [Trend] [Both] │   ↓ PDF  ↓ PPTX       │
└──────────────────────────────┴───────────────────────┘
```

**Chat is the shell; the questionnaire is the content.** The §2.5 questions arrive as turns
rather than as a form — same structured answers, same deterministic handling, delivered
conversationally. Answers come from **chips wherever the option set is closed** (audience,
purpose, slot length) and free text only where the question genuinely needs it (Q1, Q5).

This matters for the stated audience: psychology and medical students who are not
tech-savvy. A six-field form reads as work; six short exchanges read as being helped. The
underlying data is identical.

**Non-negotiable: the chat is not a general-purpose agent.** It is a scripted interviewer
with a fixed question list and a live preview. Off-script user input gets a bounded response
("I can help with your poster's structure — shall we keep going?") and returns to the
script. Do not wire an open-ended tool-calling loop here; it multiplies cost and latency
against a flow whose value is that it is predictable.

**The narrative outline stays visible and editable** — it is the checkpoint. The failure mode
of unattended generation is not bad layout (we control layout), it is **the wrong finding
promoted to Key result.** Five editable sentences catch that in ten seconds; a poster
thumbnail does not. In the chat shell this surfaces as an outline card the user can edit
inline before downloading.

### Non-negotiables for unattended output

Because the user may never open the editor, the emitted artifact must be correct on its own:

1. **Every figure passes the readability check** before emission, or is flagged in the UI. Reuse `computeReadability` / the `measure-text` mode. If a figure's axis labels land under the minimum print pt, say so *at download time* — that is the single most valuable thing this pipeline can tell a user, and it is our differentiator.
2. **No overflow, ever.** Budgets are enforced at the condenser; the layout engine additionally hard-clips and reports rather than silently shrinking type.
3. **Authors and affiliations correct**, superscripts in sync. Wrong author order is unrecoverable embarrassment.
4. **Conference spec honoured** when a venue is selected — dimensions and minimum font size from the (corrected) guidelines data.
5. **A visible provenance line** on the outline screen: which manuscript section each role came from, so the user can audit the mapping.

### Auth and rate limiting

Unlike the chart chooser, this path *needs* the API (LLM cost), so it needs auth + rate
limiting. Anonymous-first session is fine — it is one call per document, gated by the
existing `dailyLimit` middleware. Uploads route through the existing import router's
auth/SSRF/size-cap stack; do not build a second one.

---

## 5. Reuse ledger

| Need | Existing asset |
|---|---|
| PDF text + figure extraction | `import/pdfImport.ts`, `clusterText.ts`, `bboxSanitize.ts` |
| Image-only / scanned manuscripts | `import/imageImport.ts` + `/api/import/extract` |
| Blocks from extracted content | `import/synthDoc.ts` |
| Authors / affiliations | `import/parseAuthors.ts`, existing author model |
| References | `poster/citations.ts` |
| Figure legibility gate | `poster/readability.ts`, `measure-text` API mode |
| Conference dimensions + min font | `poster/GuidelinesPanel.tsx` `GUIDELINES` (**fix the SfN/ECNP errors first**) |
| Layout presets | `poster/templates.ts` |
| Auth / rate limit / SSRF / size caps | `apps/api/src/import.ts`, `rateLimit.ts`, `imageUrlGuard.ts` |
| Bundle round-trip | `import/postrFile.ts` |
| PPTX writing | **new** — see the editable-exports plan |

The honest read: **most of the ingest half already exists.** The genuinely new work is the
narrative mapper, the condenser call, `SlideDeck`, the PPTX writer, and three page shells.

---

## 6. Phasing

**Gavin, 2026-07-27: build the MVP now.** Phase 1 below *is* the MVP — scoped so it is
genuinely shippable, not a skeleton.

| Phase | Ships | Depends on |
|---|---|---|
| **1 — MVP** | `DocumentModel` IR; **pasted-text + `.docx` ingest**; deterministic narrative mapper; §2.5 questionnaire delivered through the **chat shell**; single `gpt-5.6` condenser call behind a provider-agnostic interface; editable outline; `/manuscript-to-poster` out as poster **PDF + `.postr`** | — |
| **2** | PPTX out; PDF and `.tex` ingest; cheaper-model bake-off run and a decision recorded | PPTX writer |
| **3** | `SlideDeck` + `/manuscript-to-talk` + `/poster-to-talk`, with talk-specific emphasis answers | Phase 2 |
| **4** | Narrative assistant surfaced *inside* the editor as a sidebar panel, operating on the current `PosterDoc` rather than an upload | Phase 1 |

**Deliberately out of the MVP:** PDF ingest (the importer exists, but pasted text and DOCX
cover the target user and cost nothing to parse), PPTX, the talk half, figure extraction
beyond what DOCX gives us for free, and the model bake-off. Each is real work that does not
change whether the core loop — *manuscript in, correctly-emphasised poster out* — works.

Phase 4 is last on purpose: the in-editor panel is the same engine pointed at an existing
`PosterDoc`, and it is worth strictly less than the standalone path, which is what was
actually asked for.

---

## 7. Risks and open questions

**Risks**
- **Genre collapse.** If the talk output ends up as "the poster, split across slides," the feature has failed. Guard: separate budget tables (§2), and a test asserting one finding per slide.
- **Wrong finding promoted.** Now mitigated at three layers: findings are ranked by relevance to the core rather than raw prominence (§2.6), the Q2 answer overrides that ranking outright, and the editable outline remains the final human check. Not by better prompting.
- **Figure extraction quality** on two-column PDFs with floating figures is the weakest link in the existing importer, and it is load-bearing here.
- **Overclaiming.** Do not ship copy implying a finished, submittable poster. Say what it is: a structured first draft with the legibility already checked.
- **Commoditisation** (§1) — revisit scope if the differentiators erode.

**Resolved 2026-07-27**
- **Checkpoint design** — chat shell with an inline-editable outline card. Not a zero-interaction path; the wrong-finding failure mode needs a human glance.
- **Limitations section** — no longer a global policy call. Questionnaire Q5 ("anything you must NOT cut?") lets the user pin it per-poster, which is better than either default.
- **Competition** — deprioritised per Gavin.
- **Primary ingest** — pasted text and `.docx`, not PDF.
- **Model** — `gpt-5.6` primary, provider-agnostic interface, cheaper-model bake-off in Phase 2.

**Still open for Gavin**
1. **Confirm the `gpt-5.6` API model string.** I cannot verify it against my own knowledge; a wrong identifier fails at request time.
2. **LaTeX ingest** — worth it? Cleanest possible structure extraction (real `\section`, real figure environments), but a new parser. My read: high value, Phase 2+.
3. **Does `/poster-to-talk` accept a poster PDF from another tool,** or only `.postr`? Foreign PDFs widen the funnel and reuse the reverse-import path, but quality drops sharply.
4. **Speaker notes from the offcuts** — generate PPTX notes from the material deleted during condensing? The cut text is close to what a presenter would say aloud. Cheap, and still the best idea in this doc.
5. **Talk emphasis answers** — ask separately from the poster's (my design), or default to reusing the poster answers with an "edit" affordance? Separate is more correct, reuse is less work for the user.
