# Wire CVD-tested series palettes into charts

**Date:** 2026-07-29
**Status:** Design — approved sections, pending spec review
**Origin:** Split from the 2026-07-29 bug-fix session where the palette *data* landed (commit `d873d2a`) but wiring was deferred. Tracked by memory `project_chart_palette_wiring_gap`.

## Problem

`apps/web/src/charts/seriesPalettes.ts` holds CVD-tested multi-colour science palettes (sizes 2/3/4/6/8, verbatim hexes from Simplified Science Publishing). They are **data only** — nothing imports them except their own test. Charts derive series colours from the poster **theme** palette's slots (`accent`, `accent2`, `primary`, `muted`) via `chartColors.ts::seriesColors`, cycling ~2 base colours with a white-mix. A six-series chart therefore reads as two hues at three brightnesses, when a tested six-colour set is sitting unused.

**Goal:** let a user pick a real multi-colour science palette (3/4/6/8) for a specific chart and have the chart render with it, across every surface (canvas, ladder preview, SVG/PNG download, PPTX/PDF export).

## Correction to the original framing

The task brief assumed the "2-dot swatch PALETTE picker" in `pages/ChartChooser.tsx` is a *series*-palette picker to be replaced. It is not — it is the **poster-theme switcher** on the standalone `/chart-chooser` page (which has no poster to inherit from, so it offers the 8 curated *poster* palettes, each shown as accent+accent2 dots). It swaps the whole `Palette` object; charts re-derive from it. **There is no series-palette picker anywhere today.** This work adds net-new UI; it does not modify that theme switcher.

## The invariant tension and the decision

`ChartSpec` (`packages/shared/src/types/poster.ts`) deliberately stores palette **slot names**, not hex, so "restyle the poster → restyle every chart" holds. Fixed-hex science palettes conflict with that link.

**Decision (Approach A — override, opt-in):** add an optional `seriesPaletteId?: string` to `ChartSpec`.

- **Unset (the default, and every existing chart):** unchanged — categorical fills resolve from `paletteSlots` against the poster palette. Poster restyle still restyles the chart. The invariant is fully preserved as the default.
- **Set:** the categorical series fills come from `findSeriesPalette(id).colors` instead of the slots. That chart is now deliberately pinned to a tested set and is immune to poster restyle *for its series fills only*. This is a per-chart, user-initiated opt-out, exactly what the `ChartSpec` doc-comment and the wiring-gap memory anticipated.
- **Stale id (`findSeriesPalette` returns `null`):** fall back to slot-based `seriesColors`, visibly — the chart still draws in the poster theme rather than crashing or silently substituting. `findSeriesPalette` already returns `null` (not a silent fallback) precisely so this is detectable.

Rejected: **B (snapshot hexes onto the spec)** loses the named-palette relationship and any future correction to a palette; **C (replace slots entirely)** drops the restyle invariant for all charts and breaks existing ones.

### Scope decisions (confirmed with the user)

1. **Categorical-only override.** `seriesPaletteId` recolours only categorical series fills (bar / line / scatter with a `series` encoding). The heatmap sequential ramp and the Likert diverging ramp keep resolving from poster slots (`sequentialRamp` / `divergingRamp` unchanged), so those forms still restyle with the poster. The picker only appears for charts that actually have a categorical series. This is the smallest change that delivers the visible win and avoids N-stop interpolation from a fixed set.
2. **Picker lives on inserted charts in the editor**, persisting into `ChartSpec` inside `posters.data` (JSONB, optional field → no migration). Not added to the ladder preview (whose panel specs are recomputed fresh each render, so a choice there would need separate state plumbing and would not persist onto a saved poster chart anyway).

## Architecture

The colour resolution is already centralized — one wiring point covers every surface:

```
ChartSpec + Palette
  └─ buildPlotOptions()            ← plotOptions.ts, THE single resolution point
       ├─ seriesColors(...)        ← categorical fills   ← ONLY this branch changes
       ├─ sequentialRamp(...)      ← heatmap             (unchanged)
       └─ divergingRamp(...)       ← Likert              (unchanged)
  → renderChart() → { ChartBlock (canvas), ChartPreview (ladder),
                      download.ts (SVG/PNG/zip), PPTX/PDF export }
```

Because every surface funnels through `buildPlotOptions`, wiring the override there means the canvas, previews, downloads, and exports all inherit it with no per-surface work.

### Units of change

1. **`packages/shared/src/types/poster.ts` — `ChartSpec`**
   Add `seriesPaletteId?: string`. Doc-comment states: optional; when set, overrides slot-based colouring for categorical series fills only; resolved via `findSeriesPalette`; a stale id falls back to slots. Optional (not `| null`) so every chart created before this field remains valid — same reasoning as the existing `paletteSlots` note.

2. **`apps/web/src/charts/chartColors.ts` — new resolver**
   Add a small pure function that, given `(seriesPaletteId | undefined, count, slots, palette)`, returns the categorical colour array:
   - `seriesPaletteId` set and `findSeriesPalette` non-null → take the palette's colours, truncated to `count`; if `count` exceeds the set, cycle with the same white-mix `seriesColors` uses for over-length (so behaviour past the tested size degrades identically to today).
   - otherwise → today's `seriesColors(count, slots, palette)`.
   Keeps `chartColors.ts` the single home for "slot/hex → concrete colours" and keeps `buildPlotOptions` a thin caller. `seriesColors` stays exported and unchanged (still used by the fallback and by any caller not passing an id).

3. **`apps/web/src/charts/plotOptions.ts` — `buildPlotOptions`**
   The one categorical call site (`const colors = seriesColors(...)`, ~line 140) switches to the new resolver, passing `spec.seriesPaletteId`. Nothing else in the file changes — ramps stay slot-based.

4. **`apps/web/src/charts/ChartPalettePicker.tsx` — new component**
   Given `(spec, onChange)`, renders:
   - a **"Match poster theme"** option (clears `seriesPaletteId` → back to slots), shown selected when the id is unset;
   - one swatch button per palette from `seriesPalettesFor(seriesCount)`, each rendering the palette's actual colours as a small multi-swatch strip (not 2 dots), labelled by `palette.name`, `aria-pressed` on the active one;
   - if the current `seriesPaletteId` is set but stale (`findSeriesPalette` → null), a visible "This chart's saved palette is no longer available — showing the poster theme" note, with the theme option selected.
   `seriesCount` = distinct values of the `series` encoding in the spec's rows. `distinctStrings` in `plotOptions.ts` already computes exactly this; promote it to a tiny exported helper (e.g. `distinctSeries(spec)`) so the picker and `buildPlotOptions` share one definition rather than drifting. Touch targets ≥44px; selected state survives greyscale (border weight + colour, per the existing PreviewStep convention). Motion via the existing `--ease-*`/`--dur-*` tokens if any transition is added.

5. **`apps/web/src/poster/sidebar/FigureTab.tsx` + `PosterEditor.tsx` — mount**
   FigureTab gains an optional `selectedChartBlock: Block | null` prop and an `onUpdateChartSpec: (id, spec) => void` prop. When a chart block is selected, FigureTab renders a **"Chart colours"** section (above or in place of the make/check modes — it only shows for chart selection) hosting `ChartPalettePicker`. `PosterEditor` passes `selectedBlock` when its type is `chart`, and wires `onUpdateChartSpec` to the existing `updateBlock(id, { chartSpec })` primitive (line ~1644). This mirrors how `ReadabilityPanel` appears for a selected image block — no new inspector framework.

6. **`apps/web/src/charts/seriesPalettes.ts` — additional palettes**
   Add **Okabe-Ito** (8-colour) and **Paul Tol** qualitative sets (bright / muted), using **exact hexes from primary sources** (Okabe & Ito's original, Paul Tol's technical note). Each must pass the file's existing invariants enforced by `seriesPalettes.test.ts`: luminance spread > 0.15, no repeated colour, unique kebab id, lowercase 6-digit hex, and monotonic luminance for any set labelled sequential/grayscale. **Verify every hex against its source before adding; if a set fails the > 0.15 mono-separation test, drop it rather than editing a hex** — the file forbids inventing colours. These slot into `SERIES_PALETTES_8` / a new qualitative grouping and flow into `seriesPalettesFor` automatically.

## Data flow (worked example)

1. User selects a six-series bar chart on the canvas → FigureTab shows "Chart colours" with `seriesPalettesFor(6)` (exact-6 sets first: Contrasting six, Okabe-Ito, …).
2. User clicks "Contrasting six" → `onUpdateChartSpec(block.id, { ...spec, seriesPaletteId: 'qualitative-6' })` → `updateBlock` writes it into `posters.data` (autosaved like any block edit).
3. `ChartBlock` re-renders (its `useEffect` already depends on `spec`) → `buildPlotOptions` sees the id → resolver returns the tested six colours → chart, legend, and every export use them.
4. User later restyles the poster theme → this chart's *series fills* stay the tested set (deliberate); its axis/text still follow the theme. Other charts (no id) restyle as before.
5. Hypothetically a palette id is removed from `seriesPalettes.ts` in a future release → old posters referencing it draw in the poster theme and show the "no longer available" note in the picker. No crash, no silent wrong colours.

## Error handling

- **Stale / unknown id:** `findSeriesPalette` → null → slot fallback + visible picker note. Covered by a unit test.
- **Series count exceeds the chosen set:** cycle-with-white-mix, identical to today's over-length behaviour, so a palette narrower than the series count is a graceful degrade, not a gap.
- **Spec size cap:** `seriesPaletteId` is a short string; the existing `CHART_MAX_SPEC_BYTES` check in `buildSpec` still applies to any spec that carries it.
- **User-facing failures** stay generic per `feedback_user_facing_errors` — the picker note is informational, not an error dump.

## Testing

- **`chartColors` resolver (new):** override returns the palette's colours; unset returns slot colours; stale id falls back to slots; over-length cycles. Pure, synchronous — table-driven.
- **`plotOptions`:** a spec with `seriesPaletteId` produces the expected categorical `range`; a spec without it is byte-identical to current output (regression guard for the invariant); heatmap/Likert ramps unchanged whether or not an id is present.
- **`seriesPalettes.test.ts`:** existing invariants automatically cover the new palettes (spread, dupes, ids, monotonicity). Add an explicit assertion that Okabe-Ito has 8 colours and that the new ids are present, so an accidental deletion is caught.
- **Component:** light test that the picker renders the theme option + N palette buttons for a given series count, calls `onChange` with the id on click and with `undefined` on "Match poster theme", and shows the stale-id note.
- Coverage target ≥ 80% per repo rule.

## Docs to update (graph-driven review)

- `docs/feature-graph.md` — chart section (§6.10 / the charts slice): note the new `ChartPalettePicker`, the `seriesPaletteId` field, and the Figure-tab "Chart colours" surface, so the doc does not drift from code.
- `docs/manual-test-flows.md` — add/adjust a flow only if the pick-a-palette path introduces a new manual scenario worth listing (likely a short "pick a science palette on a chart, restyle poster, confirm fills stay" check).
- Memory `project_chart_palette_wiring_gap` — mark wired once shipped.

## Out of scope (YAGNI)

- Overriding heatmap / Likert ramps with science palettes (deferred; categorical-only ships the win).
- A series-palette picker in the ladder / standalone chart-chooser (no persistence target there).
- Any change to the poster-theme switcher on `/chart-chooser`.
- Auto-suggesting a science palette (the recommender stays slot-based; the user opts in).
