# Plot Picker — Design

> **Status:** Draft for review. Implementation plan to follow in `2026-07-23-plot-picker.md` after approval.

**Goal:** Users get the *right* chart for their data with near-zero input — paste or drop what they have (a spreadsheet selection, a CSV, or a screenshot of an existing plot) and pick from 2–3 live, poster-styled previews instead of configuring anything. Uploaded plot images get concrete "restructure it this way" suggestions, and where possible a one-click rebuild as a native, theme-following chart.

**Design principle: pick, don't configure.** Every flow is: *land your stuff on one target → we infer → you tap one of three previews.* Typing is never required; one optional intent question maximum.

---

## 1. What the user experiences

### Entry points

1. **Insert tab → "Chart" card** in `AddBlockPanel` (`apps/web/src/poster/Sidebar.tsx:3958`) — opens the Plot Picker modal. Primary entry.
2. **"Improve this chart"** floating action when an image block is selected (Phase 2) — jumps straight to the critique flow with that image, zero upload.
3. **"Use a table from this poster"** shortcut inside the picker when the poster has table blocks — zero input; the data is already there.

### The picker modal (clone of `LogoPicker.tsx` pattern)

One **smart dropzone** accepts everything; we branch on content type:

| User action | Detected as | Flow |
|---|---|---|
| ⌘V paste from Excel/Sheets | TSV text | → Create flow |
| Drop/browse `.csv` / `.tsv` | Delimited text | → Create flow |
| Drop/browse/paste an image (or PDF page) | Plot screenshot | → Critique flow (Phase 2) |
| Tap a table block chip | Existing `TableData` | → Create flow |

### Create flow ("I have data")

1. Data lands → parse → show a compact preview (first 5 rows) with **inferred column-type chips** (number / category / date). Chips are tappable to correct, but defaults should be right; no correction is required to proceed.
2. Simultaneously show an **intent chip row**, pre-selected by inference: `Compare groups · Trend over time · Distribution · Relationship · Part-to-whole`. This is the *only* question, it's pre-answered, and changing it just re-ranks.
3. Below: **2–3 ranked live previews**, rendered with the user's actual data, already styled with the poster's palette and fonts. Each has a one-line "why": *"Bar chart — you're comparing a number across 6 groups."*
4. Tap a preview → chart block is inserted on the canvas at a sensible size. Done. Median path: **paste → tap → placed** (two interactions).
5. With a chart block selected, the Sidebar **edit tab** shows chart controls: switch among the recommended forms, legend on/off, sort by value/label, horizontal/vertical, direct-label the key series. Options, not requirements.

### Critique flow ("here's my existing plot") — Phase 2

1. Image lands (upload, paste, or the "Improve this chart" action) → one vision call → a **verdict card list**:
   - What it is: *"Grouped bar chart, ~8 series."*
   - Issues, each with a severity and a concrete rearrangement: *"8 colors but the story is one group — highlight it and gray the rest"; "Dual y-axes — split into two stacked panels"; "Legend will print at ~5 pt at this block size — enlarge or direct-label"* (print-size check reuses the existing `measure-text` machinery from the readability checker).
2. *(Phase 3)* When the chart is simple enough to read data off (clear bars/lines/labels), a **"Rebuild with Postr"** button appears: we extract the data, generate a native chart, and show **before/after side-by-side**. Accept → replaces the image block in place (same x/y/w/h) or inserts alongside; the original is never destroyed without an explicit choice.
3. Poster-wide *arrangement* of multiple figures (which plot goes where) is explicitly **out of scope** — that belongs to the future poster-feedback feature.

---

## 2. Approaches considered

**A. Native chart block + deterministic client-side recommender; LLM only for image critique** ← **chosen**
- Create path is instant, free, offline-capable, and infinitely retryable — no rate limits on the 80% case.
- Charts are live objects: they re-render when the poster palette/font changes, stay crisp in print, and remain editable forever.
- Cost: a new `BlockType`, a chart renderer dependency, and a CSV parser.

**B. LLM-everything (upload anything, model picks the chart and emits a spec)**
- Simpler frontend, but every chart costs an API call, adds 2–5 s latency, hits rate limits, and fails offline. Inference the model would do (column types → form) is a deterministic table we can run in microseconds. Rejected: worse for the common case, pays for what's computable.

**C. Render-to-image (chart becomes a frozen `image` block)**
- Zero type-system changes. But charts stop following the poster theme, can't be edited or re-formed later, and rasterize badly in print. Rejected — it recreates the exact problem (dead screenshot plots) this feature exists to fix.

---

## 3. Architecture

### Data model (`packages/shared/src/types/poster.ts`)

- Extend the union: `BlockType = … | 'chart'`.
- Add `chartSpec?: ChartSpec | null` to `Block` (flat-shape convention preserved).

```ts
interface ChartSpec {
  version: 1;
  form: 'bar' | 'bar-grouped' | 'bar-stacked' | 'bar-diverging'
      | 'line' | 'area' | 'scatter' | 'histogram' | 'box' | 'heatmap' | 'dumbbell';
  data: { columns: ColumnDef[]; rows: (string | number | null)[][] };
  encoding: { x?: string; y?: string; series?: string; value?: string };
  options: {
    legend: boolean;
    sort: 'value' | 'label' | 'none';
    horizontal: boolean;
    directLabel: 'auto' | 'none';
  };
  paletteSlots: string[];        // e.g. ['primary','accent','accent2'] — resolved against doc.palette at render time
  title?: string; xLabel?: string; yLabel?: string;
}

interface ColumnDef { name: string; kind: 'number' | 'category' | 'date'; }
```

- **Storage:** inside `posters.data` JSONB like every other block — **no migration**.
- **Size caps (hard):** ≤ 2,000 rows and ≤ 200 KB serialized per chart. Beyond that: offer automatic aggregation (group-by + mean/sum) or decline with guidance. This is a deliberate guard against the base64-in-JSONB performance mistake we've already paid for once.
- **Colors are palette *slots*, not hex.** The renderer resolves slots against `doc.palette` at render time, so restyling the poster restyles every chart. Slot order is fixed per chart (identity is stable — filtering/re-forming never recolors survivors).

### Rendering

- **Dependency: `@observablehq/plot`** (lazy `import()` — loaded only when a picker opens or a chart block first renders; zero cost for posters without charts).
- One wrapper module, `apps/web/src/charts/renderChart.ts`: `(spec: ChartSpec, theme: {palette, fontFamily, sizePt}) → SVGSVGElement`. All Postr styling lives here — poster fonts, print-pt type sizes (axis labels ≥ 14 pt, axis titles ≥ 18 pt at rendered block size, matching the readability checker's thresholds), hairline solid gridlines, thin marks, 2 px gaps between fills, legend for ≥ 2 series, no number-on-every-point.
- The `ChartBlock` renderer in `poster/blocks.tsx` mounts the SVG; SVG scales losslessly through both export paths (`html-to-image` and `window.print`) with no changes to either.

### Recommendation engine (pure functions, no LLM)

`apps/web/src/charts/` — small focused modules per house style:

- `parseData.ts` — TSV/CSV via **`papaparse`** (delimiter sniffing, quoted fields, BOM); `TableData` import path for table blocks.
- `inferColumns.ts` — number/category/date detection + cardinality (locale-aware numerics: `1,5` vs `1.5`).
- `recommend.ts` — the data-shape → job → form table (from the dataviz method):

| Data shape | Inferred job | Ranked forms |
|---|---|---|
| 1 category (≤ ~12 levels) + 1 number | Compare magnitude | bar → horizontal bar (long labels) |
| date/ordered + number | Trend | line → area (single series) |
| date + number + category | Trend, multi-series | multi-line (> 4 series: fold tail to "Other" or emphasize one, gray the rest) |
| 2 numbers | Relationship | scatter → heatmap (if dense) |
| 1 number only | Distribution | histogram → box |
| number + 2 categories | Compare across two dims | grouped bar → stacked bar → heatmap |
| shares summing to a whole | Part-to-whole | stacked bar (pie only if ≤ 5 slices, never ranked first) |
| Likert/agree–disagree | Ordered share | diverging stacked bar |
| before/after per item | Paired change | dumbbell |

- Guardrails baked into ranking, not warnings after the fact: > 8 series → auto-fold tail into "Other" or recommend small multiples; never dual axes (two measures of different scale → two charts); one series → no legend; sequential coloring by default, categorical only when series identity *is* the subject.
- `paletteSafety.ts` — adapt the existing `colorblind.ts` checks to validate the chosen palette-slot sequence per chart (adjacent-pair CVD separation), degrading to fewer slots + direct labels when a poster's custom palette fails.

### Critique API (Phase 2)

- **New mode `critique-plot`** on the existing `createImportRouter` (`apps/api/src/import.ts`) — inherits `requireAuth`, rate limiting, the SSRF guard, the 5 MB fetch cap, and Anthropic forced-tool-use verbatim.
- Input: `imageUrl` (`storage://…`) or base64 (unsaved posters). Output schema:

```ts
{
  chartFamily: string;            // reuses classify-region's vocabulary
  seriesEstimate: number;
  issues: Array<{
    code: IssueCode;              // closed set derived from the dataviz anti-pattern catalog:
                                  // dual-axis | too-many-hues | rainbow-ramp | pie-many-slices |
                                  // value-on-every-point | color-only-encoding | 3d-effect |
                                  // unsorted-bars | axis-not-zeroed | illegible-at-print | …
    severity: 'critical' | 'warn' | 'note';
    message: string;              // what's wrong, plainly
    suggestion: string;           // the concrete rearrangement
  }>;
  extractable: boolean;
  extractedData?: { columns: ColumnDef[]; rows: (string|number|null)[][] };  // only simple bar/line/scatter
}
```

- `illegible-at-print` composes with the existing `measure-text` mode rather than duplicating it.
- Extraction confidence is the model's self-report **plus** a sanity pass client-side (row count, monotonic dates, numeric ranges); the before/after preview is the real safety net — the user compares against their own plot before accepting.

### What we deliberately reuse

Auth/rate-limit/SSRF stack, Supabase Storage upload path (`uploadPosterImage`) for critique images on saved posters, `useModalTransition` + `postr-modal-*` keyframes and motion tokens for the picker, `PALETTES`/`colorblind.ts` for color logic, undo/redo via existing `withUndo` store actions (insert/replace are ordinary block mutations — undoable for free).

---

## 4. Error handling

- **Unparseable file:** show what we saw ("couldn't find a delimiter") with a paste-instead hint; never a raw error (per house rule: generic message + Send Feedback for unexpected failures).
- **Ragged/mixed columns:** coerce what's coercible, mark the column `category`, show the chip so the user can flip it.
- **Too-large data:** explicit choice — aggregate or trim — never silent truncation.
- **Critique call failure/timeout:** "Something went wrong" + Send Feedback; the modal state is preserved so retry is one tap.
- **Rebuild extraction wrong:** side-by-side preview *is* the guard; Accept is the only mutating step and it's undoable.

## 5. Testing

- **Vitest (web):** `parseData` (quoted fields, BOM, sniffing, locale numerics), `inferColumns`, `recommend` ranking table (one test per row + guardrail cases), palette-slot resolution + safety degradation, `ChartSpec → Plot options` mapping. Component tests: picker branch-on-content-type, intent re-ranking, insert wiring.
- **Vitest (api):** `critique-plot` request validation, response schema, issue-code closed-set enforcement (mocked Anthropic).
- **Playwright E2E:** paste TSV → tap preview → chart on canvas → save → reload → chart re-renders from spec.
- **pgTAP:** none — no schema change.

## 6. Phasing

| Phase | Ships | New deps |
|---|---|---|
| **1 — MVP** | `chart` block type + renderer + theming; picker modal (paste TSV, CSV upload, table-block import); inference + ranked previews; insert; edit-tab chart controls | `@observablehq/plot` (lazy), `papaparse` |
| **2 — Critique** | image drop/paste in picker; "Improve this chart" on image blocks; `critique-plot` API mode; verdict cards | — |
| **3 — Rebuild & reach** | rebuild-from-image with before/after; XLSX support; drag-drop/paste onto canvas; auto-aggregation for large files | XLSX reader (evaluate `read-excel-file` vs SheetJS then — bundle-size-sensitive, lazy-loaded either way) |

## 7. Decided defaults (veto if you disagree)

1. **Native `chart` block**, not render-to-image (Approach A over C).
2. **No LLM in the create path** — deterministic inference only; vision AI reserved for the critique path.
3. **Pie charts allowed but never ranked first**, only for part-to-whole with ≤ 5 slices; stacked bar leads.
4. **Poster-level figure arrangement excluded** — routed to the future poster-feedback feature.
5. **Observable Plot** as the renderer, lazy-loaded, wrapped so no Plot API leaks outside `apps/web/src/charts/`.
