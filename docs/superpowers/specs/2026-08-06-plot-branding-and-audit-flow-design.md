# Design — Plot branding, logo refresh, code export, and per-page audit flow

Date: 2026-08-06
Owner: Gavin
Status: Draft for review

Four independent workstreams, brainstormed together because they were raised
together. Each is separately shippable and should land as its own commit (per
the per-TODO-commit rule). They can share one branch and one PR.

---

## 1. Postr logo — one canonical geometry + a comprehensive asset library

### Problem

The brand mark's crossing-curve geometry is **copy-pasted** across at least
seven places, all using the same paths (`M14 14 C32 14, 32 50, 50 50` …):
`brand/icon-square.svg`, `brand/icon-rounded.svg`, `public/favicon.svg`,
`PublicHeader.tsx`, `export/ackMark.ts`, and inline again in
`scripts/rasterize-brand.mjs`. Three defects:

1. **The artwork is a rectangle, not a square.** The curves span x: 14→50 (36
   units) but a smaller y-extent — the drawn shape doesn't fill its square frame
   squarely.
2. **Sizes drift.** Hand-tuned small copies cross at a different relative height
   than the large ones, so the mark looks like a different logo at different sizes.
3. **No usable library.** There's no white-bg / purple-bg / transparent /
   monochrome variant set, and PNGs exist only for favicons/PWA/OG — nothing an
   export pipeline can drop in when SVG breaks a PDF.

### Decision A — the canonical geometry (approved via visual companion)

The two curves occupy a **true 40×40 square drawing area, centered in the 64×64
viewBox** (x: 12→52, y: 12→52), symmetric:

```
curve 1 (rising, strong purple #7c6aed):  M12 52 C30 52, 34 12, 52 12
curve 2 (falling, light purple #b9a9ff):  M12 12 C30 12, 34 52, 52 52
dot (intersection, #7c6aed):              cx=32 cy=32 r=4.5
strokes: width 5.5, round caps
```

**Single source of truth.** The path data is defined **once** in a tiny module
(`apps/web/brand/mark.geometry.ts` — exports the path `d` strings and colours),
imported by everything that draws the mark:
- The app `<symbol id="postr-mark">` (rendered once, reused via `<use>`).
- `export/ackMark.ts` (geometry only — stays grey, see constraint).
- `scripts/rasterize-brand.mjs` (reads the same strings instead of inlining).
- The SVG asset files are **generated from it** by the library builder, not
  hand-edited (see Decision B), so they can never drift again.

For self-contained exports (standalone SVG downloads, PDF pipelines) the paths
are inlined as `<path>` elements, not a `<use>` reference.

### Decision B — the asset library (new, per 2026-08-06 request)

A generated set under **`apps/web/brand/library/`**, produced by extending
`scripts/rasterize-brand.mjs` (already Playwright-based → gives us PNG for free).
"Use SVG and PNG wherever possible" — every variant ships in **both** formats so
a consumer that hits an SVG-in-PDF problem can fall back to PNG.

**Variants** (background × treatment):
- `transparent` — mark only, no field (default for overlaying).
- `white-bg` — mark on a white rounded tile.
- `purple-bg` — white mark on a `#7c6aed` rounded tile (the app-icon look).
- `mono-dark` — single-colour `#1c1b1a` mark (for light docs / grayscale print).
- `mono-light` — single-colour white mark (for dark backgrounds).

Also the **lockup** (mark + "Postr" wordmark) in transparent / white-bg /
purple-bg, since posters, decks, and the OG card all need it.

**Formats & sizes:**
- **SVG**: one crisp vector per variant + lockup (size-independent).
- **PNG**: rasterized at a documented ladder — `32, 64, 128, 256, 512, 1024` for
  marks; `2×` wide renders for lockups — at `deviceScaleFactor` giving true
  resolution (the script already does exact-viewport screenshots).
- Filenames: `postr-mark--<variant>@<size>.png`, `postr-mark--<variant>.svg`,
  `postr-lockup--<variant>.svg/.png`. A generated `README.md` (or small
  `index.json`) in the folder documents which asset to use where — the
  "comprehensive library" index.

The existing favicon / PWA / apple-touch / OG outputs stay where they are
(consumed by the manifest and `routes.json`); they're regenerated from the same
geometry in the same run, so nothing regresses.

**Build boundary (unchanged principle):** the library builder is a **manual dev
script**, NOT part of `npm run build` — the build must never depend on a headless
browser. Assets are committed. Re-run on brand change only. Document the command
in the brand README.

### Hard constraint — do NOT colour `ackMark.ts`

`ackMark.ts` deliberately renders the mark **monochrome and muted** (`#6b7280`,
no purple fill) for posters/slides, per the frozen acknowledgement decision
(attribution.ts module note, Gavin 2026-07-27): a saturated purple square beside
real university crests reads as a "vendor sticker," which the acknowledgement
framing exists to avoid. This workstream updates its **path geometry** to the new
square curves (via the shared geometry module) but keeps it grey. The coloured
library variants are for marketing / app-icon / plot-credit use, NOT for the
poster/slide acknowledgement.

### Testing

- Unit: `mark.geometry.ts` exports the expected path strings & colours (a golden
  guard, so an accidental geometry edit fails a test).
- Visual: render the `<symbol>` at 72/40/24/15/13px; confirm the dot stays
  centered and curves cross at the same relative point (no drift).
- DOM/snapshot test that `ackMark` output still uses `#6b7280` (guards the
  no-colour constraint).
- Library builder: after a run, assert every declared variant×format×size file
  exists and is non-empty (a manifest check), so a partial generation is caught.

---

## 2. Plot-picker credit — quiet branded byline on chart-chooser exports

### Scope decision (approved 2026-08-06, Option 2)

- **Plots**: add a credit (net-new — chart-chooser exports carry no
  acknowledgement today).
- **Posters / slides**: keep the existing understated text credit from
  `attribution.ts`; only standardize wording toward "made by postr.sh" if it
  reads naturally. **No coloured band, no logo** on posters/slides — the frozen
  anti-vendor-mark decision stands for wall-facing artifacts.

### Decision — the mark (approved via visual companion)

Variant **A**, refined:

- **"made by postr.sh"** + the square logo (workstream-1 geometry, at ~13px box).
- **White background, purple ink** (`#7c6aed`), **no coloured band**.
- **Flush right**, **minimal readable font size (11px)**, **zero padding/margin**
  — deliberately low visual attention.
- Sits in **added canvas below the x-axis title**; the plot area (width, height,
  bars, ticks, labels) is never touched, so data readability cannot regress.

### Where it lives — the download seam, NOT the shared renderer

Critical: `renderChart()` is shared — it also renders charts **inserted into
posters**, which already get their acknowledgement via `attribution.ts`. Adding
the credit inside `renderChart` would double-mark posters.

Therefore the credit is added in **`apps/web/src/charts/download.ts`**, in
`chartToSvgString()` — the single function every chart-chooser export path
(`downloadChartSvg`, `downloadChartPng` → `chartToPngBlob`, `downloadChartsZip`)
already funnels through. One insertion point covers SVG, PNG (rasterized), and
the ZIP bundle, and on-screen previews (which use `renderChart` directly) stay
clean, matching the current preview behavior.

Implementation shape: after the white background rect is inserted, grow the SVG
height by the credit-band amount and append a `<text>` + `<use href="#...">`
(or inline `<g>` of the paths, since a standalone exported SVG can't rely on a
document-level `<symbol>` — see note) pinned bottom-right. Extend the `viewBox`
height so the credit is inside the exported bounds.

- **Standalone SVG note:** exported SVGs are self-contained, so the logo must be
  **inlined as `<path>` elements** inside the exported document, not a `<use>`
  referencing an external/symbol. The path data is imported from the shared
  `brand/mark.geometry.ts` (workstream 1), so the plot credit, the app `<symbol>`,
  and the library assets are provably the same mark.

### Suppression seam

Reuse the existing `shouldAttribute()` predicate from `attribution.ts` so the
plot credit shares one on/off switch with every other export. Defaults to on
(free tier). No new billing surface.

### Testing

- `chartToSvgString` output contains the credit text + logo paths, bottom-right,
  outside the original plot height (assert the height grew, not the plot geometry).
- PNG blob is produced without error at the new height.
- ZIP entries each carry the credit.
- `shouldAttribute({paidPlan:true})` suppresses it.

---

## 3. Plot-picker code export — R + Python, free, no watermark

### Goal

The chart chooser outputs **image (PNG/SVG)** *and* **code (R + Python)**, all
free. Code carries **no watermark** — but must give users enough to (a) link
their own data and (b) customize padding, spacing, and text labels.

### Decisions (approved 2026-08-06)

- **Languages**: R (ggplot2) and Python (matplotlib), matching the memory note
  on standalone chart tools.
- **Data mode — user chooses** (a toggle in the export UI):
  - **"My data"** — the user's actual pasted rows embedded inline as a data frame
    (`data.frame(...)` / `pd.DataFrame({...})`).
  - **"Sample data"** — bogus values with the **same columns/shape/types**, for
    privacy (matches "your data never leaves the browser"). Column names are
    real; values are synthetic.
  - Both modes also emit a **commented-out CSV loader**
    (`# df <- read.csv("your-data.csv")` / `# df = pd.read_csv("your-data.csv")`)
    so swapping to a real file is one uncomment.
- **Delivery — both copy and download** for each language, alongside the existing
  Download SVG/PNG actions: **Copy R**, **Copy Python**, **Download .R**,
  **Download .py** (naming consistent with the SVG/PNG filenames).
- **Heavily commented**, with explicit **fine-tune knobs near the top**:
  - **Padding / margins** — named variables with sensible defaults and a comment
    explaining units (e.g. `plot.margin = margin(t, r, b, l)` in ggplot;
    `fig.subplots_adjust(...)` / `plt.margins(...)` in matplotlib).
  - **Spacing** — bar width / group gap / point size as named variables.
  - **Text labels** — title, axis labels, legend title, tick label size as
    variables at the top, not buried in the plot call.
- **Pure client-side generation** from `ChartSpec` — no server (matches the
  no-data-leaves-browser stance). Generation is a pure function
  `chartSpecToR(spec, {dataMode})` / `chartSpecToPython(spec, {dataMode})`.

### Architecture

- New module(s): `apps/web/src/charts/codegen/` with `toR.ts`, `toPython.ts`,
  and a shared `sampleData.ts` helper (reuse the existing
  `apps/web/src/charts/sampleData.ts` if it fits) that derives same-shape bogus
  data from `ChartColumnDef[]`.
- Each generator is a **pure `ChartSpec → string`** function (with a `dataMode`
  option) — trivially unit-testable, no DOM, no Plot dependency.
- The page component (`pages/ChartChooser.tsx`) gains the copy/download actions
  and the data-mode toggle, mirroring the existing `download()` handler pattern.
- **Form coverage**: map each `ChartForm` to its ggplot `geom_*` / matplotlib
  call. Start with the forms the picker actually emits; for any form without a
  faithful 1:1 mapping, emit the closest geom **and a comment** flagging the
  approximation rather than silently producing a wrong chart (honest degrade,
  matching the codebase's graceful-degrade convention).

### Testing

- Golden-string tests per form × language: generated code contains the right
  geom/plot call, the data frame, the commented CSV line, and the named
  padding/spacing/label variables.
- Sample-data mode: column names match the spec; values are synthetic (not the
  user's).
- (Optional, if cheap) a smoke test that generated R/Python is syntactically
  parseable — deferred unless an R/Python toolchain is already in CI.

---

## 4. Per-page auto-save auditing flow — fragmentize the text audit

### Problem

The text-audit page (`scripts/text-audit/scrape.mts` → `docs/text-audit/index.html`)
stores **all** edits in a single `localStorage` key (`postr-text-audit-v1`). The
only off-browser backup is an **all-or-nothing "Download JSON"** button. An
interruption, a browser switch, or a `localStorage` wipe loses everything. Gavin
has finished auditing `/` (home) and wants to work **one page at a time** with
each finished page safe on disk.

### Decisions (approved 2026-08-06)

- **Auto-save to a real disk folder** via the **File System Access API**
  (`showDirectoryPicker`). Strongest protection against local data loss.
- **One file per page**, auto-written live as you edit that page
  (`home.json`, `pricing.json`, …). Finished pages are isolated files; a bad
  write to one can't corrupt the others.
- **Non-Chromium fallback**: on browsers without the API (Firefox/Safari), fall
  back to the current manual per-audit **Download JSON** button. Detect and show
  which mode is active.
- **localStorage stays as a secondary mirror** (source of truth = the folder), so
  global search/counts still work and nothing regresses. (Sensible default — say
  the word if you'd rather drop localStorage entirely.)

### Flow

1. A **"Choose audit folder"** button calls `showDirectoryPicker()` once per
   session; the granted `FileSystemDirectoryHandle` is held in memory (and, where
   supported, persisted via IndexedDB so a reload can re-request the same folder
   without re-picking — nice-to-have, not required).
2. On each edit, debounce (~300–500ms) then write **only the current page's**
   file: `{ route, generated, items:[{n, where, tag, original, edit}] }`.
3. Each page section shows its own **save status** ("saved to home.json ✓" /
   "unsaved — pick a folder"), so it's obvious per page what's persisted.
4. A per-page **"Copy this page's audit for LLM"** button (in addition to the
   existing global copy) — so a finished page is instantly a paste-ready refactor
   prompt without waiting for the whole audit.
5. On (re)load with a folder granted, **read existing per-page files back in** and
   merge into the table, so an interrupted session resumes exactly where it left
   off.

### Architecture

- All changes are inside the generated HTML's inline `<script>` in
  `scripts/text-audit/scrape.mts` (the tool is a single self-contained file by
  design — keep it that way). No app/runtime code is touched.
- Keep the existing global Copy / Download JSON / Clear controls; **add** the
  folder + per-page controls beside them.
- Guard all File System Access calls behind a capability check; degrade to
  manual download when absent.
- The tool output stays **gitignored** (`docs/text-audit/`); only
  `scrape.mts` + `README.md` are committed. Update the README to document the
  new per-page auto-save flow and the browser requirement.

### Testing

- This is a browser-only script with no unit harness. Verification is manual +
  via the preview browser: pick a folder, edit a field, confirm the per-page file
  appears and updates; reload and confirm edits reload from disk; confirm the
  Firefox/Safari path shows the manual fallback. Document the manual steps in the
  README.

---

## Cross-cutting: docs + graph before merge

Per the graph-driven-review rule and the per-PR-docs rule: before the PR merges,
update the feature-graph / manual-test-flows docs and the code-review-graph to
reflect the new plot credit, code export, logo asset, and audit-tool flow, so the
index docs never drift from code.

## Out of scope (explicitly)

- Reversing the poster/slide acknowledgement to a branded band (Gavin chose
  Option 2; the freeze stands for wall-facing artifacts).
- PDF export for the chart chooser (already deferred in the v1 plan).
- Any billing/paid-tier UI (the suppression seam already exists, unused).
- The home-page copy edits in the audit paste (many are "remove / rethink"
  notes-to-self, not apply-ready — a separate content pass Gavin will drive).
