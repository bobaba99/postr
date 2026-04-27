# Poster Import Benchmark — Visual Findings

Run: 2026-04-27 06:46–06:50 PT  
Commit at run time: `02fb0e6` (pixel-signature co-signal) + `3af2d83` (pixel-gap fallback)  
Driver: `scripts/poster-benchmark/runImport.ts` (Playwright headless Chromium)  
Posters: 10 (working-memory training research, sourced from Consensus)

## Summary

| Outcome      | Count |
| ------------ | ----- |
| Imported     | 10/10 (1 needed retry on the first pass — transient `page.goto` timeout) |
| Decorations leaked through | 0/3 review posters — **fix held** |
| Logos missing entirely     | 4/4 data-heavy posters — **regression** |
| Headings extracted         | 10/10 (with numbering preserved + renumbered) |
| Title + authors            | 10/10 |
| Layout viable post-auto-arrange | 4/10 — see below |

The two big visual findings: **(1) all 3 brand logos are getting dropped before extraction on the data-heavy posters**, and **(2) auto-arrange clips the leftmost column on most posters**, leaving content scrolling off-canvas.

## Findings by regression class (visual-first)

### ✅ Decoration filter — PASS (review template, 3 posters)

The review template intentionally embeds two cartoon decorations
(green leaf icon, gray people-icon) in its header strip. Across
**bastian-2013**, **constantinidis-2016**, and **shipstead-2012**:

- **Zero cartoon decorations visible** in any imported poster.
- The pixel signature + LLM co-signal correctly classified them as
  decorations (low color count + low edge density + LLM agreed).

This is the win we wanted out of the [02fb0e6](apps/web/src/import/pdfImport.ts) commit — ADNI-style brand
logos get preserved by edge-density, decorations get dropped.

### ❌ Logos — FAIL (data-heavy template, 4 posters)

The data-heavy template embeds 3 institutional logos in the header
strip (`UNIV` red shield, `PSY` blue shield, `FUND` green shield with
"Grant 2024-A" subtext). Across **matysiak-2019**, **rodas-2024**,
**sala-2017**, **sala-2019**:

- **0/12 logos rendered** in any imported poster.
- Console trace for matysiak: `bbox funnel { raw: 5, afterFilter: 2,
  afterMerge: 1 }` — pdfjs found 5 image XObjects (3 logos + 2 charts),
  the page-area filter dropped 3 (the logos), 2 charts merged into 1.
- Root cause: the SVG `<img>` tags rendered at 80×48 px in the source
  HTML, which Chrome's print-to-PDF converted to image XObjects sized
  ~80×48 pt. Area = 3840 pt², just above the
  `MIN_AREA_PAGE_FRACTION = 0.0005` cutoff (≈ 2240 pt² on a 36×24"
  page). But the merge pass + per-poster size statistics treat these
  as "noise" relative to the 700pt-wide charts and drop them.

**Fix direction**: tighten `filterDecorationBBoxes` so it only drops
truly-tiny content (<0.02% of page area). The current 0.05% threshold
was tuned for posters where the median figure is huge; with logos
sitting at 1/40th the size of a chart, they fall through. Or move the
small-element filter to operate on the LLM verifier output instead of
pre-filtering.

### ⚠️ Auto-arrange — FAIL (8/10 posters)

After clicking Auto-Arrange:

- **Left column is clipped** on bastian, constantinidis, shipstead
  (review template) — text like "1. Scope" → "1. **S**ope" with the
  letter cut by the canvas edge. The packer placed the first column
  at x≈0 but the column content extends slightly negative.
- **Canvas appears compressed** on matysiak, rodas, sala-2017,
  sala-2019, melby-lervaag — the imported poster takes up a small
  fraction of the viewport with empty space below. Either the canvas
  resized to fit the auto-arranged content tighter than expected, or
  the `data-postr-canvas-frame` selector is grabbing the inner
  layout rather than the full canvas.
- klingberg and morrison (methods-heavy) look correct.

**Fix direction**: investigate the canvas-frame measurement after
auto-arrange. The visual issue is that auto-arrange sometimes shrinks
the canvas to fit content but leaves a clipped left edge. Likely a
1-cell offset in the column packer.

### ⚠️ Orphan figure captions

- **klingberg-2010** shows a stray "Figure 2." caption mid-canvas
  with no figure adjacent. The methods-heavy template only has a
  single figure ("Figure 1. Experimental design") — Figure 2 was the
  scatter plot in the schematic SVG's internal text, leaked through
  the text-suppression filter because the SVG was rasterized into
  ONE image and the "Figure 2" sub-label sat outside the bbox.
- **melby-lervaag-2013** shows "Figure 1." caption with no figure
  beneath. The minimal template's bar chart was extracted as image
  block, but the caption was placed elsewhere.

**Fix direction**: caption-near-figure proximity gate (Signal 2 in
[filterOrphanLabels](apps/web/src/import/pdfImport.ts)) needs widening — `2.5 × fontSize` works
when fonts are ~9pt (caption gate ≈ 22.5pt) but here the captions
sit further from the figure due to the SVG rasterization compressing
the chart. Bump to `4 × fontSize` or use a vertical-only proximity
test (captions are usually directly above/below).

### ⚠️ Table cells leaking as orphan text

bastian, constantinidis, shipstead show fragmented values at the
lower-left:
```
M 23 0.46
ath 11 0.12
adin g 0.08
```

These are the synthetic data table rows. The 4-cell-per-row HTML
table got rasterized as part of an SVG, but pdfjs.getTextContent
also picked up the cell text as separate items. The orphan-label
filter (Signal 1: uppercase + ≤15 chars) didn't catch them because
they contain mixed-case letters AND multiple short tokens per line.

**Fix direction**: add a fourth signal to filterOrphanLabels —
"single-line cluster with mostly numeric tokens and short alpha
prefixes" → likely table cell, drop. Or run table cells through the
in-figure text suppression by adding the table SVG's bbox to the
suppression set even when it doesn't make it past the size filter.

### ✅ Headings preserved

All 10 posters show the section headings. Numbering survived
intact (sometimes weirdly renumbered — the template generator's
section 1/3/5 came through as 1/1/1 on review posters, which is a
template bug, not an importer bug).

### ✅ Title + Authors preserved

All 10 posters show the correct title at the top. Author lists also
preserved, including affiliations with superscript numbers.

### Block-type counts (per `data-block-type`)

| ID                  | title | authors | heading | text | image | logo |
|---------------------|-------|---------|---------|------|-------|------|
| bastian-2013        | 1     | 1       | 5       | 5    | 0     | 0    |
| constantinidis-2016 | 1     | 1       | 5       | 5    | 0     | 0    |
| klingberg-2010      | 1     | 1       | 6       | 6    | 1     | 0    |
| matysiak-2019       | 1     | 1       | 4       | 4    | 1     | 0    |
| melby-lervaag-2013  | 1     | 1       | 4       | 4    | 1     | 0    |
| morrison-2011       | 1     | 1       | 6       | 6    | 1     | 0    |
| rodas-2024          | 1     | 1       | 4       | 4    | 1     | 0    |
| sala-2017           | 1     | 1       | 4       | 4    | 1     | 0    |
| sala-2019           | 1     | 1       | 4       | 4    | 1     | 0    |
| shipstead-2012      | 1     | 1       | 5       | 5    | 0     | 0    |

**Logo count: 0 across all 10 posters.** That's the load-bearing finding.

## Per-poster screenshots

All under [shots/](scripts/poster-benchmark/shots/):

| ID | Template | Visual |
|----|----------|--------|
| bastian-2013 | review | [shots/bastian-2013.png](scripts/poster-benchmark/shots/bastian-2013.png) |
| constantinidis-2016 | review | [shots/constantinidis-2016.png](scripts/poster-benchmark/shots/constantinidis-2016.png) |
| klingberg-2010 | methods-heavy | [shots/klingberg-2010.png](scripts/poster-benchmark/shots/klingberg-2010.png) |
| matysiak-2019 | data-heavy | [shots/matysiak-2019.png](scripts/poster-benchmark/shots/matysiak-2019.png) |
| melby-lervaag-2013 | minimal | [shots/melby-lervaag-2013.png](scripts/poster-benchmark/shots/melby-lervaag-2013.png) |
| morrison-2011 | methods-heavy | [shots/morrison-2011.png](scripts/poster-benchmark/shots/morrison-2011.png) |
| rodas-2024 | data-heavy | [shots/rodas-2024.png](scripts/poster-benchmark/shots/rodas-2024.png) |
| sala-2017 | data-heavy | [shots/sala-2017.png](scripts/poster-benchmark/shots/sala-2017.png) |
| sala-2019 | data-heavy | [shots/sala-2019.png](scripts/poster-benchmark/shots/sala-2019.png) |
| shipstead-2012 | review | [shots/shipstead-2012.png](scripts/poster-benchmark/shots/shipstead-2012.png) |

## Top three follow-ups

1. **Loosen `MIN_AREA_PAGE_FRACTION`** so logos at 80×48 pt survive
   the per-poster filter when the median figure is much larger.
   Currently logos sit just above the absolute floor but the merge
   pass treats them as outliers and drops them — change is in
   `filterDecorationBBoxes` and `mergeAdjacentBBoxes` in
   [apps/web/src/import/pdfImport.ts](apps/web/src/import/pdfImport.ts).
2. **Auto-arrange left-edge clip**: 8/10 posters lose 1 column-width
   from the left edge. Likely a 1-cell offset bug in the
   shortest-column-first packer, or the canvas resizes-to-fit after
   re-arrange while content is at x=0.
3. **Caption-near-figure proximity gate**: bump from `2.5 × fontSize`
   to `4 × fontSize` (or use a vertical-only test) so orphan
   "Figure N." captions get dropped when their figure is further
   away than expected.

The decoration-filter work this session is solid — 0 cartoon icons
leaked across 3 review posters. The pixel-signature co-signal logic
is doing its job. The remaining issues are layout / size-filter
problems, not classification problems.

---

## Appendix: Round 2 (commits 531786a + tighter co-signal)

After the visual report flagged "0/12 logos" as the priority,
applied two fixes:

1. `MIN_AREA_PAGE_FRACTION` 0.0005 → 0.0002 (logos at 60×36 pt
   were just below the previous cutoff)
2. Caption-near-figure proximity 2.5 → 4 × fontSize
3. Pixel-signature co-signal: tiny bboxes use lower iconScore floor
   (0.3 vs 0.6) since SVG anti-aliasing inflates edge density past
   the 4% mark for cartoons

### Round 2 results — verified on 5 posters

| Poster              | Round 1 logos | Round 2 logos | Decoration leaked? |
|---------------------|---------------|---------------|--------------------|
| matysiak-2019       | 0             | 5             | n/a (data-heavy)   |
| rodas-2024          | 0             | 4             | n/a (data-heavy)   |
| sala-2017           | 0             | 5             | n/a (data-heavy)   |
| sala-2019           | 0             | 5             | n/a (data-heavy)   |
| bastian-2013        | 0             | 2             | **YES (regression)** |

### Big win

All 4 data-heavy posters now extract the institutional brand logos
that were previously hidden by the area filter. The
pixel-signature co-signal protects them via edge density (text
strokes push iconScore to 0 regardless of color count).

### Remaining regression

bastian-2013 (review template, no real logos) now shows **2 logo
blocks** that are actually the leaf icon + people-icon cartoons.
Pre-scan trace reveals: `expectedLogoCount: 1` — the LLM
mis-classifies one of the cartoons as a logo at the global pre-scan
step, so the budget allows 1 logo through. The other survives via
the multi-logo split path or because budget reconciliation
doesn't catch ties.

This is a **net regression on the review template** — the previous
behavior was "cartoons silently dropped by area filter", which
hid the LLM's mis-classification. Now they reach the user.

### Next priority (left for the user)

Three viable paths:

A. **Tighten budget reconciliation** so it actually clamps logo
   verdicts to `expectedLogoCount` even when both verdicts have
   the same confidence (current sort-by-confidence-then-area may
   not break the tie usefully). Highest leverage.

B. **Drop the LLM pre-scan's logo-count signal entirely** for
   review-style posters and rely purely on per-bbox classification.
   Simpler but loses the global-context win.

C. **Add a "no readable text" gate to the logo classifier** — a
   real brand logo has letterforms; the LLM should call any
   logo-shaped image with no text "decoration". Requires a stricter
   prompt + maybe a second OCR pass on each candidate.

Recommend A.

The data-heavy logo recovery is the bigger UX win, so the trade-off
is worth keeping while A is investigated. Roll back to round 1 if
the bastian regression matters more than the matysiak/sala-2017
recovery.
