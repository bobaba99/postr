# Series Palette Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user pin a specific chart to a CVD-tested science palette (Simplified Science, Okabe-Ito, Paul Tol) via a per-chart picker, overriding poster-theme colouring for that chart's categorical series fills only.

**Architecture:** Add an optional `seriesPaletteId?: string` to `ChartSpec`. Colour resolution stays centralized in `buildPlotOptions`; a new pure helper in `chartColors.ts` returns the categorical colour array — from the fixed palette when the id resolves, else from poster slots (also the fallback for a stale id). A new `ChartPalettePicker` renders multi-colour swatches for the chart's series count and persists the choice into `posters.data` JSONB via the existing `updateBlock` primitive. Heatmap/Likert ramps are untouched.

**Tech Stack:** TypeScript, React, Observable Plot (injected/lazy), Vitest, npm workspaces (`@postr/shared`, `apps/web`).

## Global Constraints

- **Test runner:** `cd apps/web && npx vitest run <path>` (repo script is `vitest run`). Coverage target ≥ 80%.
- **Palette hexes are sacred:** `seriesPalettes.ts` forbids inventing or editing hexes. Only add whole tested sets with verbatim source hexes. Any set failing the file's invariants (luminance spread > 0.15, no repeated colour, unique kebab id, lowercase 6-digit hex, monotonic luminance for sequential/grayscale) must be DROPPED, never edited.
- **Immutability:** never mutate objects; spread into new ones (repo coding-style rule).
- **User-facing errors stay generic** ("Something went wrong"); the picker's stale-id note is informational, not an error dump.
- **Motion:** use the existing `--ease-*` / `--dur-*` tokens for any transition; respect `prefers-reduced-motion`.
- **The invariant:** charts WITHOUT `seriesPaletteId` must render byte-identically to today (poster restyle → chart restyle). This is a regression guard, not a nicety.
- **Marketing copy:** never mention "AI"; the picker is plain colour tooling.
- **Commit style:** conventional commits (`feat:`, `test:`, `docs:`), one per task. Attribution disabled globally.
- **British spelling** in user-facing copy where the app already uses it ("colours").

## Confirmed source hexes (verbatim, cross-confirmed from khroma / CUD / tueplots)

- **Okabe-Ito** (8): `#000000 #e69f00 #56b4e9 #009e73 #f0e442 #0072b2 #d55e00 #cc79a7`
- **Tol bright** (7): `#4477aa #ee6677 #228833 #ccbb44 #66ccee #aa3377 #bbbbbb`
- **Tol high-contrast** (3): `#004488 #ddaa33 #bb5566`
- **Tol muted** (9): `#332288 #88ccee #44aa99 #117733 #999933 #ddcc77 #cc6677 #882255 #aa4499`

The luminance-spread invariant is verified programmatically in Task 4 before any set is committed.

## File Structure

- `packages/shared/src/types/poster.ts` — add `seriesPaletteId?` to `ChartSpec` (Task 1).
- `apps/web/src/charts/chartColors.ts` — add `resolveSeriesColors(...)` (Task 2).
- `apps/web/src/charts/plotOptions.ts` — swap the one categorical call site; export `distinctSeries(spec)` helper (Task 2/3).
- `apps/web/src/charts/__tests__/chartColors.test.ts` — NEW, resolver unit tests (Task 2).
- `apps/web/src/charts/__tests__/plotOptions.test.ts` — extend for override + invariant regression (Task 3).
- `apps/web/src/charts/seriesPalettes.ts` — add Okabe-Ito + Tol sets (Task 4).
- `apps/web/src/charts/__tests__/seriesPalettes.test.ts` — assert new ids/sizes present (Task 4).
- `apps/web/src/charts/ChartPalettePicker.tsx` — NEW picker component (Task 5).
- `apps/web/src/charts/__tests__/ChartPalettePicker.test.tsx` — NEW component test (Task 5).
- `apps/web/src/poster/sidebar/FigureTab.tsx` — add "Chart colours" section for a selected chart (Task 6).
- `apps/web/src/poster/Sidebar.tsx` — thread `selectedChartBlock` + `onUpdateChartSpec` to FigureTab (Task 6).
- `apps/web/src/poster/PosterEditor.tsx` — pass the selected chart block + wire `onUpdateChartSpec` to `updateBlock` (Task 6).
- `docs/feature-graph.md`, `docs/manual-test-flows.md` — doc sync (Task 7).

---

### Task 1: Add `seriesPaletteId` to ChartSpec

**Files:**
- Modify: `packages/shared/src/types/poster.ts:131-156` (the `ChartSpec` interface)

**Interfaces:**
- Produces: `ChartSpec.seriesPaletteId?: string`

- [ ] **Step 1: Add the field with a doc-comment**

In `packages/shared/src/types/poster.ts`, inside `interface ChartSpec`, immediately after the `paletteSlots: string[];` field (line 152), add:

```typescript
  /**
   * Optional override: when set, the chart's CATEGORICAL series fills
   * come from the fixed CVD-tested science palette with this id
   * (see charts/seriesPalettes.ts) instead of from `paletteSlots`.
   * That chart is then pinned to the tested set and is immune to
   * poster restyle for its series fills — a deliberate, per-chart
   * opt-out of the "restyle poster → restyle charts" invariant.
   *
   * Sequential (heatmap) and diverging (Likert) ramps ignore this and
   * always follow `paletteSlots`. Unset (the default, and every chart
   * created before this field) = full slot-based colouring. A stale id
   * (palette no longer in the file) falls back to slots, visibly.
   *
   * Optional (not `| null`) so pre-existing specs stay valid without a
   * migration — same reasoning as `paletteSlots`.
   */
  seriesPaletteId?: string;
```

- [ ] **Step 2: Verify the package type-checks and re-exports**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: PASS (no errors). `ChartSpec` is already exported via `@postr/shared`; no barrel change needed.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/poster.ts
git commit -m "feat(charts): add optional seriesPaletteId to ChartSpec"
```

---

### Task 2: `resolveSeriesColors` resolver in chartColors.ts

**Files:**
- Modify: `apps/web/src/charts/chartColors.ts` (add one exported function; keep `seriesColors` unchanged)
- Test: `apps/web/src/charts/__tests__/chartColors.test.ts` (NEW)

**Interfaces:**
- Consumes: `findSeriesPalette(id)` from `./seriesPalettes`, `seriesColors(count, slots, palette)` and `mixHex` from `./chartColors`.
- Produces: `resolveSeriesColors(seriesPaletteId: string | undefined, count: number, slots: string[], palette: Palette): string[]` — length always `count`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/charts/__tests__/chartColors.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { Palette } from '@postr/shared';
import { resolveSeriesColors } from '../chartColors';
import { findSeriesPalette } from '../seriesPalettes';

const palette: Palette = {
  bg: '#ffffff',
  primary: '#1f2a44',
  accent: '#2f6f8f',
  accent2: '#b0533a',
  muted: '#6b7280',
  headerBg: '#1f2a44',
  headerFg: '#ffffff',
};
const slots = ['accent', 'accent2', 'primary', 'muted'];

describe('resolveSeriesColors', () => {
  it('uses poster slots when no palette id is given', () => {
    const out = resolveSeriesColors(undefined, 2, slots, palette);
    expect(out[0]).toBe('#2f6f8f'); // accent
    expect(out[1]).toBe('#b0533a'); // accent2
  });

  it('uses the fixed science palette when the id resolves', () => {
    const p = findSeriesPalette('qualitative-6')!;
    const out = resolveSeriesColors('qualitative-6', 6, slots, palette);
    expect(out).toEqual([...p.colors]);
  });

  it('truncates a wider palette to the series count', () => {
    const p = findSeriesPalette('qualitative-6')!;
    const out = resolveSeriesColors('qualitative-6', 3, slots, palette);
    expect(out).toEqual(p.colors.slice(0, 3));
  });

  it('falls back to slots for a stale/unknown id', () => {
    const out = resolveSeriesColors('no-such-palette', 2, slots, palette);
    expect(out).toEqual(resolveSeriesColors(undefined, 2, slots, palette));
  });

  it('cycles with a white-mix when the series count exceeds the set', () => {
    // A 3-colour palette drawn for 4 series: 4th repeats colour 0,
    // lightened, never an exact duplicate of colour 0.
    const p = findSeriesPalette('blue-orange-gray')!; // 3 colours
    const out = resolveSeriesColors('blue-orange-gray', 4, slots, palette);
    expect(out).toHaveLength(4);
    expect(out.slice(0, 3)).toEqual([...p.colors]);
    expect(out[3]).not.toBe(out[0]);
  });

  it('always returns exactly `count` colours', () => {
    expect(resolveSeriesColors('qualitative-6', 1, slots, palette)).toHaveLength(1);
    expect(resolveSeriesColors(undefined, 5, slots, palette)).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run src/charts/__tests__/chartColors.test.ts`
Expected: FAIL — `resolveSeriesColors is not a function` / not exported.

- [ ] **Step 3: Implement `resolveSeriesColors`**

In `apps/web/src/charts/chartColors.ts`, add the import at the top (after the existing `import type { Palette }` line):

```typescript
import { findSeriesPalette } from './seriesPalettes';
```

Then add this exported function (place it directly after `seriesColors`):

```typescript
/**
 * Categorical series colours for a chart, honouring an optional fixed
 * science palette. With `seriesPaletteId` set and resolvable, the
 * palette's colours are used (truncated to `count`, or cycled with the
 * same white-mix `seriesColors` uses once the set is exhausted). With
 * it unset or stale (`findSeriesPalette` → null), falls back to
 * slot-based colouring so a removed palette degrades to the poster
 * theme rather than a crash. Always returns exactly `count` colours.
 */
export function resolveSeriesColors(
  seriesPaletteId: string | undefined,
  count: number,
  slots: string[],
  palette: Palette,
): string[] {
  const fixed = seriesPaletteId ? findSeriesPalette(seriesPaletteId) : null;
  if (!fixed) return seriesColors(count, slots, palette);
  const base = fixed.colors;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const color = base[i % base.length] ?? palette.accent;
    const lap = Math.floor(i / base.length);
    out.push(lap === 0 ? color : mixHex(color, '#ffffff', Math.min(0.7, lap * 0.4)));
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run src/charts/__tests__/chartColors.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/charts/chartColors.ts apps/web/src/charts/__tests__/chartColors.test.ts
git commit -m "feat(charts): resolveSeriesColors honours a fixed science palette with slot fallback"
```

---

### Task 3: Wire the resolver into `buildPlotOptions` + regression guard

**Files:**
- Modify: `apps/web/src/charts/plotOptions.ts:139-141` (categorical colour call site) and the `distinctStrings` helper (promote to exported `distinctSeries`)
- Test: `apps/web/src/charts/__tests__/plotOptions.test.ts` (extend)

**Interfaces:**
- Consumes: `resolveSeriesColors` from `./chartColors`.
- Produces: `distinctSeries(spec: ChartSpec): string[]` exported from `./plotOptions` (distinct values of the `series` encoding, in first-seen order) — Task 5 (the picker) consumes it for the swatch count.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/charts/__tests__/plotOptions.test.ts` (inside the existing `describe('buildPlotOptions', ...)` or a new `describe`):

```typescript
import { resolveSeriesColors } from '../chartColors';
import { distinctSeries } from '../plotOptions';
import { findSeriesPalette } from '../seriesPalettes';

describe('seriesPaletteId override', () => {
  it('colours grouped bars from the fixed palette when set', () => {
    const spec = specFor('two-category');
    const withId = { ...spec, seriesPaletteId: 'qualitative-6' };
    const { plot } = recordingPlot();
    const build = buildPlotOptions(withId, theme, plot);
    const range = (build.options['color'] as { range: string[] }).range;
    const expected = resolveSeriesColors(
      'qualitative-6', range.length, withId.paletteSlots, palette,
    );
    expect(range).toEqual(expected);
    // And it differs from the slot-based colouring (proves override took effect).
    const slotColors = resolveSeriesColors(undefined, range.length, spec.paletteSlots, palette);
    expect(range).not.toEqual(slotColors);
  });

  it('is byte-identical to today when no id is set (invariant guard)', () => {
    const spec = specFor('two-category');
    const { plot } = recordingPlot();
    const build = buildPlotOptions(spec, theme, plot);
    const range = (build.options['color'] as { range: string[] }).range;
    expect(range).toEqual(
      resolveSeriesColors(undefined, range.length, spec.paletteSlots, palette),
    );
  });

  it('leaves the Likert diverging ramp on poster slots even with an id set', () => {
    const spec = { ...specFor('likert'), seriesPaletteId: 'qualitative-6' };
    const { plot } = recordingPlot();
    const build = buildPlotOptions(spec, theme, plot);
    // Likert range must NOT equal the science palette — it stays slot-derived.
    const range = (build.options['color'] as { range: string[] }).range;
    const science = findSeriesPalette('qualitative-6')!.colors;
    expect(range).not.toEqual([...science].slice(0, range.length));
  });

  it('distinctSeries lists the series values in first-seen order', () => {
    const spec = specFor('two-category');
    const series = distinctSeries(spec);
    expect(series.length).toBeGreaterThanOrEqual(2);
    expect(new Set(series).size).toBe(series.length);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && npx vitest run src/charts/__tests__/plotOptions.test.ts`
Expected: FAIL — `distinctSeries` not exported; override test sees slot colours (not yet wired).

- [ ] **Step 3: Export `distinctSeries` and use it**

In `apps/web/src/charts/plotOptions.ts`, the existing internal `distinctStrings(data, field)` operates on already-materialized `DataRow[]`. Add a spec-level export near it (it must re-derive rows the same way `toObjects` does). Add after the `distinctStrings` function:

```typescript
/**
 * Distinct values of a spec's `series` encoding, first-seen order.
 * Shared by the palette picker (swatch count) and buildPlotOptions so
 * the two never disagree on how many series a chart has.
 */
export function distinctSeries(spec: ChartSpec): string[] {
  return distinctStrings(toObjects(spec), spec.encoding.series);
}
```

- [ ] **Step 4: Swap the categorical colour call site**

In `apps/web/src/charts/plotOptions.ts`, replace line ~140:

```typescript
  const colors = seriesColors(Math.max(1, seriesValues.length), spec.paletteSlots, palette);
```

with:

```typescript
  const colors = resolveSeriesColors(
    spec.seriesPaletteId,
    Math.max(1, seriesValues.length),
    spec.paletteSlots,
    palette,
  );
```

Update the import block (lines 21-27) to add `resolveSeriesColors`:

```typescript
import {
  divergingRamp,
  mixHex,
  resolveSeriesColors,
  resolveSlot,
  sequentialRamp,
  seriesColors,
} from './chartColors';
```

Leave `seriesColors` in the import — it may still be referenced; if the linter flags it as unused after this change, remove it from the import list then. Do NOT touch the `sequentialRamp` (heatmap, lines ~326/331) or `divergingRamp` (Likert, line ~310) call sites.

- [ ] **Step 5: Run to verify pass**

Run: `cd apps/web && npx vitest run src/charts/__tests__/plotOptions.test.ts`
Expected: PASS (existing tests + 4 new).

- [ ] **Step 6: Full charts suite green**

Run: `cd apps/web && npx vitest run src/charts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/charts/plotOptions.ts apps/web/src/charts/__tests__/plotOptions.test.ts
git commit -m "feat(charts): buildPlotOptions honours seriesPaletteId for categorical fills"
```

---

### Task 4: Add Okabe-Ito + Paul Tol palettes

**Files:**
- Modify: `apps/web/src/charts/seriesPalettes.ts` (add sets; update the header comment's size list and the `SERIES_PALETTES` aggregate)
- Test: `apps/web/src/charts/__tests__/seriesPalettes.test.ts` (add id/size presence assertions)

**Interfaces:**
- Produces: new palette ids `okabe-ito`, `tol-bright`, `tol-muted`, `tol-high-contrast` (each surviving the invariant check) available from `SERIES_PALETTES` / `seriesPalettesFor`.

- [ ] **Step 1: Write a temporary invariant-check script to confirm each set passes BEFORE adding**

Create `apps/web/src/charts/__tests__/_paletteCandidates.test.ts` (temporary — deleted in Step 6):

```typescript
import { describe, expect, it } from 'vitest';

function luminance(hex: string): number {
  const v = parseInt(hex.slice(1), 16);
  const ch = [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}
const spread = (cs: string[]) => Math.max(...cs.map(luminance)) - Math.min(...cs.map(luminance));

const CANDIDATES: Record<string, string[]> = {
  'okabe-ito': ['#000000', '#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7'],
  'tol-bright': ['#4477aa', '#ee6677', '#228833', '#ccbb44', '#66ccee', '#aa3377', '#bbbbbb'],
  'tol-high-contrast': ['#004488', '#ddaa33', '#bb5566'],
  'tol-muted': ['#332288', '#88ccee', '#44aa99', '#117733', '#999933', '#ddcc77', '#cc6677', '#882255', '#aa4499'],
};

describe('candidate palettes clear the file invariants', () => {
  for (const [id, cs] of Object.entries(CANDIDATES)) {
    it(`${id}: spread > 0.15, no dupes, lowercase hex`, () => {
      expect(spread(cs), `${id} spread ${spread(cs).toFixed(3)}`).toBeGreaterThan(0.15);
      expect(new Set(cs).size).toBe(cs.length);
      for (const c of cs) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    });
  }
});
```

- [ ] **Step 2: Run it — record which sets pass**

Run: `cd apps/web && npx vitest run src/charts/__tests__/_paletteCandidates.test.ts`
Expected: All four PASS (Okabe-Ito spread ≈ 0.87 incl. black; Tol bright/muted/high-contrast all span a real luminance range). **If any fails, DROP that set** — do not add it and do not edit its hexes.

- [ ] **Step 3: Add the passing sets to `seriesPalettes.ts`**

All four are `qualitative` (colourblind-safe categorical sets; none is an ordered ramp, so `qualitative` is correct and won't trip the monotonic-luminance test). Add a new exported group after `SERIES_PALETTES_6`:

```typescript
/**
 * Named colourblind-safe qualitative sets from outside Simplified
 * Science Publishing — Okabe & Ito's Color Universal Design palette and
 * Paul Tol's schemes (SRON technical note). Verbatim source hexes; each
 * clears the same greyscale-separation test as the sets above.
 */
export const SERIES_PALETTES_NAMED: readonly SeriesPalette[] = [
  {
    id: 'okabe-ito',
    name: 'Okabe–Ito',
    kind: 'qualitative',
    colors: ['#000000', '#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7'],
    note: 'The standard eight-colour CVD-safe set for scientific figures.',
  },
  {
    id: 'tol-bright',
    name: 'Tol bright',
    kind: 'qualitative',
    colors: ['#4477aa', '#ee6677', '#228833', '#ccbb44', '#66ccee', '#aa3377', '#bbbbbb'],
    note: 'Paul Tol’s bright scheme — seven well-separated hues.',
  },
  {
    id: 'tol-muted',
    name: 'Tol muted',
    kind: 'qualitative',
    colors: ['#332288', '#88ccee', '#44aa99', '#117733', '#999933', '#ddcc77', '#cc6677', '#882255', '#aa4499'],
    note: 'Nine muted hues for many categories; softer than bright.',
  },
  {
    id: 'tol-high-contrast',
    name: 'Tol high-contrast',
    kind: 'qualitative',
    colors: ['#004488', '#ddaa33', '#bb5566'],
    note: 'Three maximally distinct colours, also mono-safe.',
  },
];
```

Then extend the aggregate:

```typescript
/** Every series palette, all sizes. */
export const SERIES_PALETTES: readonly SeriesPalette[] = [
  ...SERIES_PALETTES_3,
  ...SERIES_PALETTES_6,
  ...SERIES_PALETTES_NAMED,
];
```

Update the header comment (lines ~26-32): change the "Sizes are 3 and 6…" paragraph to note that named qualitative sets (Okabe-Ito 8, Tol 3/7/9) are now included alongside the 3- and 6-colour Simplified Science sets. Keep the "DO NOT improve individual hexes" paragraph verbatim.

- [ ] **Step 4: Add presence assertions to the real test**

Append to `apps/web/src/charts/__tests__/seriesPalettes.test.ts` (inside `describe('series palettes', ...)`):

```typescript
  it('includes the named CVD-safe sets at their published sizes', () => {
    expect(findSeriesPalette('okabe-ito')?.colors).toHaveLength(8);
    expect(findSeriesPalette('tol-bright')?.colors).toHaveLength(7);
    expect(findSeriesPalette('tol-muted')?.colors).toHaveLength(9);
    expect(findSeriesPalette('tol-high-contrast')?.colors).toHaveLength(3);
  });
```

(The existing invariant tests — spread, dupes, ids, hex, monotonicity — already run over `SERIES_PALETTES`, so they now cover the new sets automatically.)

- [ ] **Step 5: Run the real palette test**

Run: `cd apps/web && npx vitest run src/charts/__tests__/seriesPalettes.test.ts`
Expected: PASS (all invariants hold for the new sets + the presence assertion).

- [ ] **Step 6: Delete the temporary candidate script**

```bash
rm apps/web/src/charts/__tests__/_paletteCandidates.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/charts/seriesPalettes.ts apps/web/src/charts/__tests__/seriesPalettes.test.ts
git commit -m "feat(charts): add Okabe-Ito and Paul Tol CVD-safe series palettes"
```

---

### Task 5: ChartPalettePicker component

**Files:**
- Create: `apps/web/src/charts/ChartPalettePicker.tsx`
- Test: `apps/web/src/charts/__tests__/ChartPalettePicker.test.tsx` (NEW)

**Interfaces:**
- Consumes: `seriesPalettesFor(count)`, `findSeriesPalette(id)` from `./seriesPalettes`; `distinctSeries(spec)` from `./plotOptions`; `ChartSpec` from `@postr/shared`.
- Produces: `ChartPalettePicker({ spec, onChange }: { spec: ChartSpec; onChange: (seriesPaletteId: string | undefined) => void })` — a default React export (named export `ChartPalettePicker`).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/charts/__tests__/ChartPalettePicker.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ChartSpec } from '@postr/shared';
import { ChartPalettePicker } from '../ChartPalettePicker';

function specWithSeries(n: number, seriesPaletteId?: string): ChartSpec {
  const rows = Array.from({ length: n }, (_, i) => [`Group ${i}`, i + 1]);
  return {
    version: 1,
    form: 'bar',
    data: {
      columns: [
        { name: 'grp', kind: 'category' },
        { name: 'val', kind: 'number' },
      ],
      rows,
    },
    encoding: { x: 'grp', y: 'val', series: 'grp' },
    options: { legend: true, sort: 'none', horizontal: false, directLabel: 'auto' },
    paletteSlots: ['accent', 'accent2'],
    ...(seriesPaletteId ? { seriesPaletteId } : {}),
  } as ChartSpec;
}

describe('ChartPalettePicker', () => {
  it('renders the "Poster theme (default)" reset option, selected when no id', () => {
    render(<ChartPalettePicker spec={specWithSeries(3)} onChange={() => {}} />);
    const reset = screen.getByRole('button', { name: /poster theme \(default\)/i });
    expect(reset.getAttribute('aria-pressed')).toBe('true');
  });

  it('offers exact-size palettes for the series count', () => {
    render(<ChartPalettePicker spec={specWithSeries(3)} onChange={() => {}} />);
    // A known 3-colour Simplified Science set should be present.
    expect(screen.getByRole('button', { name: /blue . orange . gray/i })).toBeTruthy();
  });

  it('calls onChange with the id when a palette is picked', () => {
    const onChange = vi.fn();
    render(<ChartPalettePicker spec={specWithSeries(6)} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /contrasting six/i }));
    expect(onChange).toHaveBeenCalledWith('qualitative-6');
  });

  it('calls onChange with undefined when the reset option is picked', () => {
    const onChange = vi.fn();
    render(<ChartPalettePicker spec={specWithSeries(6, 'qualitative-6')} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /poster theme \(default\)/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('shows a stale-id note and selects the reset option', () => {
    render(<ChartPalettePicker spec={specWithSeries(6, 'no-such-palette')} onChange={() => {}} />);
    expect(screen.getByText(/no longer available/i)).toBeTruthy();
    const reset = screen.getByRole('button', { name: /poster theme \(default\)/i });
    expect(reset.getAttribute('aria-pressed')).toBe('true');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && npx vitest run src/charts/__tests__/ChartPalettePicker.test.tsx`
Expected: FAIL — module/component not found.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/charts/ChartPalettePicker.tsx`:

```tsx
/**
 * ChartPalettePicker — pin one chart to a fixed CVD-tested science
 * palette, or hand it back to the poster theme.
 *
 * The first option ("Poster theme (default)") clears the override so
 * the chart's series fills follow the poster palette again — the
 * default state, selected whenever `spec.seriesPaletteId` is unset or
 * stale. Every other option is a tested palette from
 * `seriesPalettesFor(seriesCount)`, drawn as its actual colours so the
 * user picks by eye, not by name.
 *
 * Selection survives greyscale (border weight + colour, not colour
 * alone) so the picker reads on a mono screenshot.
 */
import type { CSSProperties } from 'react';
import type { ChartSpec, SeriesPalette } from '@postr/shared';
import { distinctSeries } from './plotOptions';
import { findSeriesPalette, seriesPalettesFor } from './seriesPalettes';

interface ChartPalettePickerProps {
  spec: ChartSpec;
  onChange: (seriesPaletteId: string | undefined) => void;
}

const optionStyle = (active: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  minHeight: 44,
  padding: '6px 10px',
  borderRadius: 8,
  border: `2px solid ${active ? '#7c6aed' : '#2a2a3a'}`,
  background: active ? 'rgba(124,106,237,0.12)' : '#14141f',
  color: '#c8cad0',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'border-color var(--dur-2, 150ms) var(--ease-out, ease), background var(--dur-2, 150ms) var(--ease-out, ease)',
});

function Swatches({ colors }: { colors: readonly string[] }) {
  return (
    <span aria-hidden="true" style={{ display: 'inline-flex', flexShrink: 0 }}>
      {colors.map((c, i) => (
        <span
          key={`${c}-${i}`}
          style={{
            width: 14,
            height: 14,
            background: c,
            border: '1px solid rgba(0,0,0,0.15)',
            marginLeft: i === 0 ? 0 : -1,
          }}
        />
      ))}
    </span>
  );
}

export function ChartPalettePicker({ spec, onChange }: ChartPalettePickerProps) {
  const seriesCount = Math.max(1, distinctSeries(spec).length);
  const currentId = spec.seriesPaletteId;
  const resolved: SeriesPalette | null = currentId ? findSeriesPalette(currentId) : null;
  const isStale = Boolean(currentId) && resolved === null;
  const themeActive = !currentId || isStale;
  const options = seriesPalettesFor(seriesCount);

  return (
    <div>
      <span
        style={{
          display: 'block',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#9ca3af',
          marginBottom: 8,
        }}
      >
        Chart colours
      </span>

      {isStale && (
        <p role="note" style={{ margin: '0 0 8px', fontSize: 12.5, lineHeight: 1.5, color: '#e8b4c0' }}>
          This chart&rsquo;s saved palette is no longer available &mdash; showing the poster theme.
        </p>
      )}

      <div role="group" aria-label="Chart colour palette" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          type="button"
          aria-pressed={themeActive}
          onClick={() => onChange(undefined)}
          style={optionStyle(themeActive)}
        >
          <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: '50%', background: 'linear-gradient(135deg,#2f6f8f,#b0533a)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Poster theme (default)</span>
        </button>

        {options.map((p) => {
          const active = p.id === currentId;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(p.id)}
              title={p.note}
              style={optionStyle(active)}
            >
              <Swatches colors={p.colors} />
              <span style={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>{p.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

Note: `SeriesPalette` must be importable from `@postr/shared`. It is currently declared in `apps/web/src/charts/seriesPalettes.ts`. If `@postr/shared` does not re-export it, change the import to `import type { SeriesPalette } from './seriesPalettes';` and `import type { ChartSpec } from '@postr/shared';` as two separate imports. Verify with the type-check in Step 4 and adjust.

- [ ] **Step 4: Run to verify pass + type-check**

Run: `cd apps/web && npx vitest run src/charts/__tests__/ChartPalettePicker.test.tsx`
Expected: PASS (5 tests).
Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS. If `SeriesPalette` import errored, switch it to the local `./seriesPalettes` import as noted and re-run.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/charts/ChartPalettePicker.tsx apps/web/src/charts/__tests__/ChartPalettePicker.test.tsx
git commit -m "feat(charts): ChartPalettePicker for per-chart science-palette selection"
```

---

### Task 6: Mount the picker in the Figure tab

**Files:**
- Modify: `apps/web/src/poster/sidebar/FigureTab.tsx` (add props + a "Chart colours" section shown for a selected chart block)
- Modify: `apps/web/src/poster/Sidebar.tsx:743-758` (pass the new props through)
- Modify: `apps/web/src/poster/PosterEditor.tsx:2332-2405` (supply `selectedChartBlock` + `onUpdateChartSpec`)

**Interfaces:**
- Consumes: `ChartPalettePicker` (Task 5); `updateBlock(id, patch)` (PosterEditor:1644); `selectedBlock` (PosterEditor:1441).
- Produces: FigureTab prop `selectedChartBlock: Block | null`, `onUpdateChartSpec: (blockId: string, spec: ChartSpec) => void`.

- [ ] **Step 1: Add the section to FigureTab**

In `apps/web/src/poster/sidebar/FigureTab.tsx`:

Add to the imports:

```typescript
import { ChartPalettePicker } from '@/charts/ChartPalettePicker';
```

Extend `FigureTabProps` (after `onInsertChart`):

```typescript
  /** Selected chart block, if any — enables the per-chart palette picker. */
  selectedChartBlock: Block | null;
  onUpdateChartSpec: (blockId: string, spec: ChartSpec) => void;
```

Add both to the destructured params. Then, inside the `mode === 'make'` panel `<div style={{ paddingTop: 14 }}>`, ABOVE the `<ChartChooser ... />`, insert:

```tsx
          {selectedChartBlock?.chartSpec && (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                background: '#0f0f17',
                border: '1px solid #2a2a3a',
                borderRadius: 8,
              }}
            >
              <ChartPalettePicker
                spec={selectedChartBlock.chartSpec}
                onChange={(seriesPaletteId) =>
                  onUpdateChartSpec(selectedChartBlock.id, {
                    ...selectedChartBlock.chartSpec!,
                    ...(seriesPaletteId ? { seriesPaletteId } : {}),
                    // Clearing: drop the key entirely so the spec matches
                    // a never-overridden chart (and stays byte-identical).
                    ...(seriesPaletteId ? {} : { seriesPaletteId: undefined }),
                  })
                }
              />
            </div>
          )}
```

Note on the clear path: spreading `seriesPaletteId: undefined` sets the property to `undefined`; `JSON.stringify` (autosave) omits `undefined` values, so the persisted JSONB has no `seriesPaletteId` key — identical to a chart that never had one. Confirm in Step 5's manual check.

- [ ] **Step 2: Thread props through Sidebar**

In `apps/web/src/poster/Sidebar.tsx`, add to the props interface (near line 200, after `onInsertChart`):

```typescript
  onUpdateChartSpec: (blockId: string, spec: ChartSpec) => void;
```

(`selectedBlock` is already a Sidebar prop — reuse it; no new selected-block prop needed.) Then in the `<FigureTab ... />` block (lines 744-757), add:

```tsx
            selectedChartBlock={
              props.selectedBlock && props.selectedBlock.type === 'chart'
                ? props.selectedBlock
                : null
            }
            onUpdateChartSpec={props.onUpdateChartSpec}
```

Ensure `ChartSpec` is imported in Sidebar.tsx (it already imports from `@postr/shared` for `onInsertChart`; confirm `ChartSpec` is in that import list, add if missing).

- [ ] **Step 3: Supply the handler from PosterEditor**

In `apps/web/src/poster/PosterEditor.tsx`, within the `<Sidebar ... />` props (around line 2405, next to `onInsertChart={insertChartBlock}`), add:

```tsx
        onUpdateChartSpec={(blockId, spec) => updateBlock(blockId, { chartSpec: spec })}
```

`updateBlock` (line 1644) already does an immutable map-replace and routes through the store's autosave. No other change.

- [ ] **Step 4: Type-check and run the poster + charts suites**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS.
Run: `cd apps/web && npx vitest run src/charts src/poster`
Expected: PASS (no regressions).

- [ ] **Step 5: Manual smoke via the browser preview**

Start the dev server (preview_start with the web app's launch config), open a poster, insert a grouped-bar chart, select it, switch to the Figure ("Check") tab, and confirm:
- the "Chart colours" section appears with "Poster theme (default)" selected;
- picking "Okabe–Ito" recolours the chart on canvas;
- restyling the poster palette leaves this chart's series fills on Okabe–Ito;
- picking "Poster theme (default)" returns it to theme colours and (via autosave) the saved spec has no `seriesPaletteId`.
Capture a screenshot for the user. If the dev server isn't previewable in this environment, note that and rely on the unit tests + type-check.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/poster/sidebar/FigureTab.tsx apps/web/src/poster/Sidebar.tsx apps/web/src/poster/PosterEditor.tsx
git commit -m "feat(charts): per-chart palette picker in the Figure tab, persisted to the chart spec"
```

---

### Task 7: Code review, docs sync, memory update

**Files:**
- Modify: `docs/feature-graph.md` (charts slice §6.10)
- Modify: `docs/manual-test-flows.md` (add a palette-override flow if warranted)
- Modify: `/Users/zihaogeng/.claude/projects/-Users-zihaogeng-development-postr/memory/project_chart_palette_wiring_gap.md` (mark wired)

**Interfaces:** none (docs/review only).

- [ ] **Step 1: Run the full app test suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS. Also `cd packages/shared && npx tsc --noEmit` PASS.

- [ ] **Step 2: Code review**

Dispatch the code-reviewer agent (or `superpowers:requesting-code-review`) over the diff `git diff main...HEAD`. Address CRITICAL/HIGH inline; note MEDIUM. Re-run tests after any fix.

- [ ] **Step 3: Update feature-graph.md**

In the charts section of `docs/feature-graph.md`, add bullets noting: the new `ChartPalettePicker` component; `ChartSpec.seriesPaletteId` (optional override, categorical-only, slot fallback on stale id); the Figure-tab "Chart colours" surface; and that `seriesPalettes.ts` now includes Okabe-Ito + Tol sets. Keep the doc's existing bullet style.

- [ ] **Step 4: Update manual-test-flows.md**

Add one flow: "Pick a science palette on a chart → restyle the poster → confirm the chart's series fills stay fixed while a non-overridden chart restyles; clear back to Poster theme and confirm the saved spec drops seriesPaletteId." Only if it isn't already implied by an existing chart flow.

- [ ] **Step 5: Update the memory note**

In `project_chart_palette_wiring_gap.md`, change the status line to record that wiring shipped on 2026-07-29 (optional `seriesPaletteId`, categorical-only, picker in Figure tab, Okabe-Ito + Tol added), and keep the invariant notes.

- [ ] **Step 6: Commit**

```bash
git add docs/feature-graph.md docs/manual-test-flows.md
git commit -m "docs(charts): document series-palette wiring and new CVD palettes"
```

(The memory file lives outside the repo; save it separately, not in this commit.)

---

## Self-Review

**Spec coverage:**
- Invariant decision (optional `seriesPaletteId`, override, slot fallback) → Tasks 1, 2, 3. ✓
- Categorical-only (ramps untouched) → Task 3 Step 4 + the Likert regression test in Task 3 Step 1. ✓
- Stale-id visible fallback → Task 2 (resolver) + Task 5 (picker note). ✓
- Picker on inserted charts, persisted to `posters.data` → Tasks 5, 6. ✓
- "Poster theme (default)" reset label → Task 5 component + test. ✓
- Add all confirmed sets (Okabe-Ito + Tol), gated by invariant → Task 4. ✓
- Every surface inherits (canvas/preview/download/export via `buildPlotOptions`) → Task 3 (single wiring point; no per-surface task needed). ✓
- Docs/memory sync (graph-driven review rule) → Task 7. ✓
- Tests ≥ 80% → each task is TDD; resolver/override/picker/palettes all covered. ✓

**Placeholder scan:** No TBD/TODO; every code step has literal code; the one conditional ("if `SeriesPalette` isn't re-exported, use the local import") gives the exact fallback. ✓

**Type consistency:** `resolveSeriesColors(seriesPaletteId, count, slots, palette)` — same signature in Task 2 (def), Task 3 (call), and the picker's mental model. `distinctSeries(spec)` — defined Task 3, consumed Task 5. `onUpdateChartSpec(blockId, spec)` — same shape in FigureTab, Sidebar, PosterEditor (Task 6). Palette ids (`okabe-ito`, `tol-bright`, `tol-muted`, `tol-high-contrast`, `qualitative-6`, `blue-orange-gray`) match between Task 4 and the tests in Tasks 2/3/5. ✓
