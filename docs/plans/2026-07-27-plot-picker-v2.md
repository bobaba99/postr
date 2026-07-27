# Plot Picker v2 — Dual Surface

> **Supersedes** the surface/entry-point sections of `2026-07-23-plot-picker-design.md`.
> Everything that doc decided about **data model, renderer, recommendation engine,
> critique API, error handling and phasing still stands unchanged** — do not re-litigate
> `ChartSpec`, Observable Plot, the deterministic recommender, or the 2,000-row cap.
> This doc changes only *where the feature lives* and *how the user is asked*.

**What changed (Gavin, 2026-07-27):**
1. It must live **in the same panel as the figure-readability check** during poster editing — not in a separate Insert-tab modal.
2. It must **also be a standalone feature on its own page**, usable without building a poster.
3. The flow should be an **auto-scrolling questionnaire**.
4. The UI should feel **academic**, not generic SaaS.

---

## 0. The tension, stated up front

The v1 doc's governing principle is **"pick, don't configure — typing is never required; one optional intent question maximum."** A questionnaire is, on its face, the opposite of that. I do not think you want a long form — I think you want the *no-data* path to feel guided rather than blank. So v2 resolves it this way:

**The questionnaire is a fallback that self-destructs, not a gate.**

- If we can infer the answer from data you already gave us, **the question is never rendered.** Not pre-filled and skipped — never shown.
- Each question that *does* render auto-advances to the next on answer.
- The flow short-circuits the instant the recommender has enough to rank. Typical question counts: **0 (data pasted), 1 (data pasted, ambiguous intent), 3–4 (no data at all).**

So the "questionnaire" is really a **progressive disclosure ladder** that most users fall straight through. If you want a mandatory fixed-length form instead, say so — but I'd argue against it, and the v1 doc argues against it harder.

---

## 1. Surface A — in-editor, inside the Figure tab

### Why this tab

The `Figure` tab (`Sidebar.tsx:2840`, rendering `ReadabilityPanel.tsx`) already owns exactly one job: **"is my figure any good?"** It parses R/Python plotting code, computes effective print-point sizes, and scans uploaded images for illegible text. Adding "and if you don't have one yet, make one" completes that job rather than diluting it.

The alternative — a separate Insert-tab modal, as v1 proposed — splits figure work across two places and means a user who discovers their figure is illegible has to leave the panel to fix it properly.

### Restructure: the Figure tab becomes a two-mode workbench

```
┌─ Figure ─────────────────────────────┐
│  ○ Make a figure    ● Check a figure │   ← segmented control, remembers last used
├──────────────────────────────────────┤
│                                      │
│  [ mode content ]                    │
│                                      │
└──────────────────────────────────────┘
```

- **Check a figure** — the entire existing `ReadabilityPanel`, unmoved and unchanged. Default mode when a figure/image block is selected.
- **Make a figure** — the picker. Default mode when nothing is selected or the poster has no figures yet.

Two behaviours make the modes feel like one tool rather than two:

1. **Check → Make handoff.** When the readability scan returns `illegible-at-print` on an *image* block, the verdict card gets a **"Rebuild as a live chart"** action that switches to Make mode carrying that image into the critique flow (v1 doc, Phase 2/3). This is the single most valuable interaction in the feature and it only exists because the two modes share a panel.
2. **Make → Check automatically.** A chart inserted by the picker is *born* with its print-size check already run and passing, because `renderChart.ts` enforces the same `MIN_PT_BY_ROLE` thresholds the checker measures against (`ReadabilityPanel.tsx:856`). Show a small green "Legible at print size" confirmation on insert. Never ship a chart that would fail our own linter.

### Panel constraints this imposes

The sidebar is narrow. The v1 design assumed a modal with room for 2–3 side-by-side previews; in-panel they must **stack vertically**, which is what makes auto-scroll (§3) load-bearing rather than decorative. Preview cards render at panel width, roughly 280–320 px.

---

## 2. Surface B — standalone page

**Route:** `/chart-chooser` (indexable, prerendered).

Not `/plot-picker` — "plot picker" is our internal name. Nobody searches it. `chart chooser` / `which chart should I use` is the actual query space, and this page is the same species as the figure-readability tool page that SEO Phase 4 already plans to build for .edu outreach. Two free tool pages on one domain compound; one does not. Confirm the exact slug against the keyword pre-flight before building — it is deliberately unresolved here.

### What it is

The identical picker component, rendered full-width outside the editor, with three differences:

| | In-editor | Standalone |
|---|---|---|
| Previews | stacked, panel width | 3-up grid, full width |
| Result action | insert chart block into poster | **download SVG / PNG**, or "Start a poster with this" |
| Auth | already signed in | none required — no anonymous session created until they choose to make a poster |
| Theme | poster's palette + fonts | Postr default palette, with a swatch switcher |

**The no-auth property matters and must not be quietly dropped.** A tool page that provisions an anonymous Supabase session on load is a tool page that cannot be recommended in a LibGuide. The picker's create path is pure client-side computation (v1: "instant, free, offline-capable") — it genuinely needs no backend. Keep it that way. The critique path *does* need auth and rate limiting, so on the standalone page image-critique is gated behind "Start a poster to check an existing chart."

### Why it earns its keep

- It is linkable, citable, and has no signup wall — the two properties that make .edu librarians link to a thing.
- It is the honest top-of-funnel for Postr: someone who needed a chart today learns the poster editor exists.
- It reuses 100% of the component; the only new code is a page shell and an SVG/PNG download path we need for exports anyway (see the editable-exports plan).

---

## 3. The auto-scrolling ladder

### Mechanics

One vertically scrolling column of **steps**. Answering a step (a) locks in a compact summary of the answer, (b) reveals the next step, (c) smooth-scrolls it to the top of the viewport.

```
Step 1  Your data          →  [answered: 6 groups × 1 number]   ▸ change
Step 2  What are you showing? → [answered: Comparing groups]    ▸ change
─────────────────────────────────────────────────────────────
Step 3  Pick your figure
        ▸ Fig A   Fig B   Fig C
```

**Motion, per the house system** (`project_motion_system`, Emil Kowalski standards):
- Reveal: `--dur-*` short (≤ 300 ms), `--ease-out-*`. Height via `grid-template-rows: 0fr → 1fr`, the pattern already used for guideline sections (`bd288d7`). No springs — that decision is recorded in `7af934f`.
- Scroll: `scrollIntoView({ behavior: 'smooth', block: 'start' })`, **guarded by `prefers-reduced-motion`** → falls back to `behavior: 'auto'`. Non-negotiable; auto-scroll is a vestibular trigger.
- Answered steps collapse to a one-line summary with a `▸ change` affordance. Re-opening a step invalidates and re-reveals everything below it.

### Focus and accessibility — the part auto-scroll usually gets wrong

Auto-scrolling forms are an accessibility minefield. Rules:
- Move **focus**, not just scroll position, to the newly revealed step's first control. Screen-reader users get nothing from a scroll.
- Newly revealed region is `aria-live="polite"`.
- Collapsed steps use the `inert` attribute, matching the fix already made in `575d17d` for collapsed guideline sections.
- Never auto-scroll on *page load* — only in response to a user answer.
- The whole ladder must be completable by keyboard alone, top to bottom, with no pointer.

### The steps

**The three questions (Gavin, 2026-07-27), in his words:** *what data you are showing · how many variables · what do you want to prioritize with your results.* These replace the abstract "job" taxonomy from the earlier draft — they are what a researcher actually knows about their own data, phrased the way they would say it.

| # | Step | Question as shown | Shown when | Skipped when |
|---|---|---|---|---|
| 1 | **Your data** | Drop a table, paste, or start from scratch | always | never |
| 2 | **What are you showing?** | "What did you measure?" — pick the outcome column | > 1 plausible measure | exactly 1 numeric column |
| 3 | **How many variables?** | "What are you breaking it down by?" — 0, 1, or 2 grouping columns | ambiguous grouping | inference is confident |
| 4 | **What should the figure emphasise?** | "What do you want people to take away?" — Difference between groups · Change over time · Spread / variability · Relationship between two measures · Share of a whole | ≥ 2 forms tie after steps 2–3 | one form wins outright |
| 5 | **Pick your figure** | ranked previews | always | never |

Step 4 is the one that earns its place. Steps 2–3 establish *data shape*, which determines the candidate set; step 4 establishes *rhetorical intent*, which picks among candidates the shape alone cannot separate — the same one-category-plus-one-number table is a bar chart if the point is ranking and a dot plot if the point is spread. It is also the question researchers are worst at answering unprompted, which is precisely why asking it adds value rather than friction.

### Accepted inputs — table, CSV, and Excel

Per Gavin: **table / CSV / Excel upload, to make it as easy as possible.** All three land on the same dropzone in step 1.

| Input | Handling |
|---|---|
| ⌘V paste from Excel / Sheets / Numbers | TSV text, parsed inline |
| `.csv` / `.tsv` | `papaparse`, delimiter sniffing |
| **`.xlsx` / `.xls`** | **Phase 1, not deferred.** Lazy-loaded reader; if >1 sheet, a sheet picker chip row |
| A table block already on the poster | reuse `TableData` directly, zero upload |
| "I don't have data yet" | synthetic path, below |

Moving Excel into Phase 1 is a direct consequence of the target user (§ conference note): psychology and medical students overwhelmingly hand us `.xlsx`, not `.csv`. Shipping without it means the most common real input bounces off the front door. Evaluate `read-excel-file` against SheetJS at build time — bundle-size-sensitive, lazy either way.

### "I don't have data yet" — worked examples generated in code

Gavin: *use code to generate some examples.* This branch renders steps 2–4 unconditionally and feeds the previews from **deterministically generated sample data**, not from a static fixture file:

- A small generator per data shape (`makeGroupedMeans`, `makeTimeSeries`, `makeTwoNumeric`, `makeLikert`, `makePrePost`) producing plausible values with a **fixed seed** — same shape always yields the same numbers, so previews are stable across renders and screenshots don't churn.
- Values must look like real research output: effect sizes that are visible but not cartoonish, believable n, sensible units.
- **Labels must be bogus** per `feedback_sample_names` — John Smith / Jane Doe, Acme State University, Sample Research Institute. Never a real researcher or institution.
- Output is a chart block pre-wired with an editable placeholder table; the user swaps in their numbers later.

Because the recommender is a hardcoded lookup (§ below), these generators double as the recommender's test fixtures — one generator per row of the data-shape table means the ranking logic is exercised end-to-end for free.

### The recommender stays hardcoded

Confirmed by Gavin: **hardcoded recommendation algorithm.** No LLM anywhere in the create path. The data-shape → form mapping in the v1 doc §3 is the spec; implement it as a plain lookup with explicit guardrails, and keep vision AI confined to the Phase 2 critique path.

---

## 4. Academic UI direction

This is the part that should not look like every other charting tool. The organising idea:

> **Present the choice the way a journal presents figures.**

Concretely:

1. **Previews are figure panels, not cards.** Each is labelled **A**, **B**, **C** in the top-left in bold — the exact convention of a multi-panel journal figure. Not "Option 1 / Option 2."
2. **Every preview carries a journal-style caption** in the recommender's voice, and that caption is *real output*, not decoration:
   > **A.** Mean reaction time by condition. Bars show group means; n = 6 conditions.

   On insert, the caption is **seeded into the chart block's title/caption field**. The user gets a caption they'd otherwise have written by hand — that is a genuine time save, not a skin.
3. **The "why" line is methods-voice, not marketing-voice.**
   - ✗ "Great for comparing categories!"
   - ✓ "One categorical variable (6 levels) against one continuous measure — a bar chart maps magnitude to length, which is read more accurately than area or angle."
   The second sentence is the actual perceptual justification and is defensible if a PI asks.
4. **Typography follows the poster surface tokens**, not the UI chrome tokens — previews should read as *print*, sitting on paper-white with serif captions, visually distinct from the dark editor chrome around them. This contrast is the whole effect.
5. **Restraint.** No confetti, no gradients on the chart marks, no rounded bar caps. The dataviz skill's palette and mark specs govern; academic credibility comes from looking like it belongs in a paper.

> **Load the `dataviz` skill before implementing any of §4 or the renderer.** The form heuristic, the color formula and the runnable palette validator are exactly this problem, and `project_plot_picker_feature` already flags it.

---

## 5. What this changes in the v1 plan

| v1 decision | v2 |
|---|---|
| Entry point 1: Insert tab → "Chart" card → modal | **Replaced.** Figure tab → "Make a figure" mode. Keep a secondary Insert-tab entry that switches to that tab (discoverability), but the modal is gone. |
| Entry point 2: "Improve this chart" on image block | **Kept**, now switches Figure tab to Make mode instead of opening a modal. |
| Entry point 3: "Use a table from this poster" | **Kept**, becomes a chip inside Step 1. |
| Previews side-by-side, 2–3 | **Stacked** in panel, **3-up** standalone. |
| "One optional intent question maximum" | **Relaxed** to a self-destructing ladder of ≤ 5 steps, 0 of which render on the fast path. |
| XLSX support in Phase 3 | **Moved to Phase 1** — psych/med students hand us `.xlsx`, so deferring it means the most common real input bounces off the front door. |
| — | **New:** standalone `/chart-chooser` page, no auth. |
| — | **New:** captions are seeded output, not preview chrome. |
| — | **New:** seeded in-code sample-data generators, doubling as recommender test fixtures. |
| Phasing | Unchanged, except the standalone page and XLSX both ship in **Phase 1**. |

## 6. Open questions for Gavin

1. **Slug.** `/chart-chooser` is my proposal; hold until the keyword pre-flight runs (still blocked — OpenSEO's tools need a session restart to become callable).
2. **Standalone-page download formats.** SVG + PNG assumed. PDF too, or is that redundant with the poster export path?
3. **Step 4's option labels.** I phrased the emphasis choices as plain-language outcomes (*Difference between groups*, *Change over time*, …) rather than chart-theory terms. If your users would rather see *Comparison / Trend / Distribution*, say so — but I think the plain phrasing suits non-tech-savvy psych and med students better, which is the stated target.

## 7. Resolved since the first draft

- **§0's tension is settled.** Gavin supplied the three questions directly (*what data · how many variables · what to prioritize*), which is a concrete ladder rather than an open-ended form — so the self-destructing design stands, now with his wording.
- **Recommender is hardcoded.** Confirmed, no LLM in the create path.
- **Excel upload is in scope**, Phase 1.
- **Examples are generated in code**, seeded and deterministic.
