# Figure Readability Checker — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users paste R or Python plotting code into the sidebar, parse canvas size + font parameters, and show per-element readability verdicts with copy-ready fix suggestions — all computed against the selected image block's physical dimensions on the poster.

**Architecture:** Pure client-side. Two regex-based parsers (R/ggplot2, Python/matplotlib) extract canvas dimensions and font sizes from pasted code. A readability engine applies the formula `effective_pt = (source_pt / canvas_height_in) × block_height_in` for each text element, compares against conference poster minimums, and renders a diagnostic table in a new sidebar panel. The panel also back-calculates the minimum source `base_size` and offers a one-click copy snippet.

**Tech Stack:** React (existing Sidebar component), Vitest for tests, no external dependencies.

---

## Coordinate System Reference

- `PX = 10` — 1 poster unit = 1/10 inch (`apps/web/src/poster/constants.ts:15`)
- `POINTS_PER_UNIT = 7.2` — 72pt / 10 units (`constants.ts:33`)
- Block dimensions `b.w`, `b.h` are in poster units → inches = `units / PX`
- `POSTER_SIZES` values (`w`, `h`) are already in inches (`constants.ts:65`)

## Readability Formula

```
effective_pt = (source_font_pt / canvas_height_in) × block_height_in
```

Where:
- `source_font_pt` — the font size in the plotting code (ggplot base_size, matplotlib font.size, etc.)
- `canvas_height_in` — the figure export height from `ggsave(height=...)` or `figsize=(w, h)`
- `block_height_in` — the image block's height on the poster = `block.h / PX`

DPI cancels out (same in numerator and denominator). The formula reduces to a simple ratio.

## Minimum Thresholds (conference poster standards)

| Element | Min pt | Source |
|---------|--------|--------|
| Axis titles | 18 | APA poster guidelines |
| Tick/axis labels | 14 | NYU / Better Posters |
| Legend text | 14 | NYU / Better Posters |
| Annotations / captions | 12 | Lower bound for readability |
| Plot title | 18 | Match section headings |

## R/ggplot2 Defaults (when parameter is missing)

| Parameter | Default | Derivation |
|-----------|---------|------------|
| `base_size` | 11 | `theme_gray()` default |
| axis.text | `base_size * 0.8` | `rel(0.8)` |
| axis.title | `base_size * 1.0` | `rel(1.0)` |
| legend.text | `base_size * 0.8` | `rel(0.8)` |
| legend.title | `base_size * 1.0` | `rel(1.0)` |
| plot.title | `base_size * 1.2` | `rel(1.2)` |
| strip.text (facets) | `base_size * 0.8` | `rel(0.8)` |
| `ggsave` width | 7 | ggplot2 default (inches) |
| `ggsave` height | 7 | ggplot2 default (inches) |

## Python/matplotlib Defaults (when parameter is missing)

| Parameter | Default | Derivation |
|-----------|---------|------------|
| `font.size` | 10 | `matplotlib.rcParams` default |
| `axes.titlesize` | `font.size * 1.0` | "medium" = 1.0× |
| `axes.labelsize` | `font.size * 1.0` | "medium" |
| `xtick.labelsize` | `font.size * 0.83` | "small" |
| `legend.fontsize` | `font.size * 1.0` | "medium" |
| `figure.titlesize` | `font.size * 1.2` | "large" |
| `figsize` | (6.4, 4.8) | matplotlib default |
| seaborn `font_scale` | 1.0 | multiplier on all sizes |
| seaborn contexts | paper=1.0, notebook=1.2, talk=1.5, poster=2.0 | multiplier |

## Edge Cases

- `ggsave(units = "cm")` → divide by 2.54
- `ggsave(units = "mm")` → divide by 25.4
- `ggsave(units = "px")` → divide by dpi (default 300)
- `rel(1.2)` in `element_text(size = rel(1.2))` → multiplier, not absolute
- Multiple `+ theme()` calls → later wins (ggplot2 cascade)
- `facet_wrap(~var, nrow = 2)` → halves effective canvas height
- `plt.subplots(nrows=3, ncols=2)` → effective area = figsize / grid
- Aspect ratio mismatch → use the constraining dimension (object-fit logic)
- Block resized after code paste → recompute reactively

---

## Task 1: Readability Engine — Pure Functions

**Files:**
- Create: `apps/web/src/poster/readability.ts`
- Create: `apps/web/src/poster/__tests__/readability.test.ts`

### Step 1: Write the failing tests

```typescript
// apps/web/src/poster/__tests__/readability.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseRCode,
  parsePythonCode,
  computeReadability,
  type FigureParams,
  type ReadabilityResult,
} from '../readability';

describe('parseRCode', () => {
  it('extracts base_size from theme_minimal(base_size = 24)', () => {
    const code = `ggplot(df, aes(x, y)) + geom_point() + theme_minimal(base_size = 24)`;
    const p = parseRCode(code);
    expect(p.baseSize).toBe(24);
  });

  it('extracts ggsave dimensions in inches', () => {
    const code = `ggsave("fig.png", width = 10, height = 7, units = "in")`;
    const p = parseRCode(code);
    expect(p.canvasWidth).toBe(10);
    expect(p.canvasHeight).toBe(7);
  });

  it('converts cm units to inches', () => {
    const code = `ggsave("fig.png", width = 25.4, height = 17.78, units = "cm")`;
    const p = parseRCode(code);
    expect(p.canvasWidth).toBeCloseTo(10, 1);
    expect(p.canvasHeight).toBeCloseTo(7, 1);
  });

  it('converts mm units to inches', () => {
    const code = `ggsave("fig.png", width = 254, height = 177.8, units = "mm")`;
    const p = parseRCode(code);
    expect(p.canvasWidth).toBeCloseTo(10, 1);
    expect(p.canvasHeight).toBeCloseTo(7, 1);
  });

  it('handles px units with dpi', () => {
    const code = `ggsave("fig.png", width = 3000, height = 2100, units = "px", dpi = 300)`;
    const p = parseRCode(code);
    expect(p.canvasWidth).toBe(10);
    expect(p.canvasHeight).toBe(7);
  });

  it('uses defaults when base_size missing', () => {
    const code = `ggplot(df, aes(x, y)) + geom_point()`;
    const p = parseRCode(code);
    expect(p.baseSize).toBe(11);
    expect(p.warnings).toContain('No font size found');
  });

  it('uses defaults when ggsave missing', () => {
    const code = `ggplot(df, aes(x, y)) + geom_point()`;
    const p = parseRCode(code);
    expect(p.canvasWidth).toBe(7);
    expect(p.canvasHeight).toBe(7);
    expect(p.warnings).toContain('No canvas size found');
  });

  it('extracts individual element overrides', () => {
    const code = `
      ggplot(df, aes(x, y)) + geom_point() +
      theme_minimal(base_size = 14) +
      theme(axis.text = element_text(size = 18),
            plot.title = element_text(size = 28))
    `;
    const p = parseRCode(code);
    expect(p.baseSize).toBe(14);
    expect(p.overrides.axisText).toBe(18);
    expect(p.overrides.plotTitle).toBe(28);
  });

  it('handles rel() as a multiplier', () => {
    const code = `
      theme_minimal(base_size = 20) +
      theme(axis.text = element_text(size = rel(0.6)))
    `;
    const p = parseRCode(code);
    expect(p.overrides.axisText).toBeCloseTo(12, 1);
  });

  it('later theme() overrides earlier', () => {
    const code = `
      theme(axis.text = element_text(size = 10)) +
      theme(axis.text = element_text(size = 20))
    `;
    const p = parseRCode(code);
    expect(p.overrides.axisText).toBe(20);
  });

  it('detects facet_wrap and adjusts canvas', () => {
    const code = `
      ggplot(df, aes(x, y)) + geom_point() +
      facet_wrap(~group, nrow = 2) +
      ggsave("fig.png", width = 10, height = 8)
    `;
    const p = parseRCode(code);
    expect(p.facetRows).toBe(2);
    expect(p.effectiveCanvasHeight).toBe(4);
  });
});

describe('parsePythonCode', () => {
  it('extracts figsize', () => {
    const code = `fig, ax = plt.subplots(figsize=(10, 7))`;
    const p = parsePythonCode(code);
    expect(p.canvasWidth).toBe(10);
    expect(p.canvasHeight).toBe(7);
  });

  it('extracts rcParams font.size', () => {
    const code = `plt.rcParams['font.size'] = 18`;
    const p = parsePythonCode(code);
    expect(p.baseSize).toBe(18);
  });

  it('extracts matplotlib.rcParams variant', () => {
    const code = `matplotlib.rcParams['font.size'] = 14`;
    const p = parsePythonCode(code);
    expect(p.baseSize).toBe(14);
  });

  it('extracts seaborn set_theme font_scale', () => {
    const code = `sns.set_theme(font_scale=1.5)`;
    const p = parsePythonCode(code);
    expect(p.baseSize).toBe(15); // 10 * 1.5
  });

  it('extracts seaborn set_context', () => {
    const code = `sns.set_context("poster")`;
    const p = parsePythonCode(code);
    expect(p.baseSize).toBe(20); // 10 * 2.0
  });

  it('extracts per-element overrides', () => {
    const code = `
      ax.set_xlabel("X", fontsize=14)
      ax.set_ylabel("Y", fontsize=14)
      ax.tick_params(labelsize=10)
      ax.set_title("Title", fontsize=20)
    `;
    const p = parsePythonCode(code);
    expect(p.overrides.axisTitle).toBe(14);
    expect(p.overrides.axisText).toBe(10);
    expect(p.overrides.plotTitle).toBe(20);
  });

  it('detects subplots grid and adjusts canvas', () => {
    const code = `fig, axes = plt.subplots(2, 3, figsize=(12, 8))`;
    const p = parsePythonCode(code);
    expect(p.facetRows).toBe(2);
    expect(p.facetCols).toBe(3);
    expect(p.effectiveCanvasHeight).toBe(4);
    expect(p.effectiveCanvasWidth).toBe(4);
  });

  it('uses defaults when figsize missing', () => {
    const code = `plt.plot(x, y)`;
    const p = parsePythonCode(code);
    expect(p.canvasWidth).toBeCloseTo(6.4, 1);
    expect(p.canvasHeight).toBeCloseTo(4.8, 1);
    expect(p.warnings).toContain('No canvas size found');
  });
});

describe('computeReadability', () => {
  it('computes effective pt for each element', () => {
    const params: FigureParams = {
      language: 'r',
      baseSize: 11,
      canvasWidth: 7,
      canvasHeight: 7,
      effectiveCanvasWidth: 7,
      effectiveCanvasHeight: 7,
      overrides: {},
      facetRows: 1,
      facetCols: 1,
      warnings: [],
    };
    const blockHeightIn = 10; // 100 poster units / 10
    const result = computeReadability(params, blockHeightIn, blockHeightIn);
    // effective = (11 / 7) × 10 = 15.7pt for axis title (1.0 rel)
    expect(result.elements.find(e => e.name === 'Axis titles')!.effectivePt).toBeCloseTo(15.7, 0);
    // axis text = base * 0.8 = 8.8pt source → effective = (8.8 / 7) * 10 = 12.6pt
    expect(result.elements.find(e => e.name === 'Tick labels')!.effectivePt).toBeCloseTo(12.6, 0);
  });

  it('marks elements below threshold as failing', () => {
    const params: FigureParams = {
      language: 'r',
      baseSize: 8,
      canvasWidth: 10,
      canvasHeight: 10,
      effectiveCanvasWidth: 10,
      effectiveCanvasHeight: 10,
      overrides: {},
      facetRows: 1,
      facetCols: 1,
      warnings: [],
    };
    const result = computeReadability(params, 8, 8);
    // axis text = 8 * 0.8 = 6.4 source → effective = (6.4 / 10) * 8 = 5.1pt
    const tickLabels = result.elements.find(e => e.name === 'Tick labels')!;
    expect(tickLabels.effectivePt).toBeCloseTo(5.1, 0);
    expect(tickLabels.status).toBe('fail');
  });

  it('computes suggested base_size for all elements to pass', () => {
    const params: FigureParams = {
      language: 'r',
      baseSize: 11,
      canvasWidth: 7,
      canvasHeight: 7,
      effectiveCanvasWidth: 7,
      effectiveCanvasHeight: 7,
      overrides: {},
      facetRows: 1,
      facetCols: 1,
      warnings: [],
    };
    const result = computeReadability(params, 10, 10);
    // The tightest constraint is tick labels: min 14pt, rel 0.8
    // Need: base * 0.8 * (10/7) >= 14 → base >= 14 * 7 / (0.8 * 10) = 12.25 → 13
    expect(result.suggestedBaseSize).toBeGreaterThanOrEqual(13);
  });

  it('uses overrides when present instead of rel() defaults', () => {
    const params: FigureParams = {
      language: 'r',
      baseSize: 11,
      canvasWidth: 7,
      canvasHeight: 7,
      effectiveCanvasWidth: 7,
      effectiveCanvasHeight: 7,
      overrides: { axisText: 20 },
      facetRows: 1,
      facetCols: 1,
      warnings: [],
    };
    const result = computeReadability(params, 10, 10);
    const ticks = result.elements.find(e => e.name === 'Tick labels')!;
    // 20pt override → effective = (20/7)*10 = 28.6pt — passes easily
    expect(ticks.effectivePt).toBeCloseTo(28.6, 0);
    expect(ticks.status).toBe('pass');
  });

  it('handles aspect-ratio mismatch using constraining dimension', () => {
    const params: FigureParams = {
      language: 'python',
      baseSize: 10,
      canvasWidth: 12,
      canvasHeight: 4,
      effectiveCanvasWidth: 12,
      effectiveCanvasHeight: 4,
      overrides: {},
      facetRows: 1,
      facetCols: 1,
      warnings: [],
    };
    // Block is 15" wide × 5" tall. Canvas is 12×4.
    // Scale by min(15/12, 5/4) = min(1.25, 1.25) = 1.25
    // Effective height used = canvasHeight * scale = 4 * 1.25 = 5
    // axis title = 10pt → (10/4)*5 = 12.5pt — but that's wrong
    // Correct: effective = source_pt * (blockH / canvasH) when height constrains
    // But if width constrains: effective = source_pt * (blockW / canvasW)
    // Use min scale: scale = min(blockW/canvasW, blockH/canvasH)
    // effective = source_pt * scale
    const result = computeReadability(params, 5, 15);
    const scale = Math.min(15 / 12, 5 / 4); // 1.25
    expect(result.elements.find(e => e.name === 'Axis titles')!.effectivePt).toBeCloseTo(10 * scale, 0);
  });
});
```

### Step 2: Run tests to verify they fail

```bash
cd apps/web && npx vitest run src/poster/__tests__/readability.test.ts
```
Expected: FAIL — module `../readability` not found.

### Step 3: Implement the readability engine

```typescript
// apps/web/src/poster/readability.ts

/**
 * Figure readability engine.
 *
 * Parses R (ggplot2) or Python (matplotlib/seaborn) plotting code to
 * extract canvas dimensions and font sizes, then computes the effective
 * print size each text element will render at on the poster, given the
 * image block's physical dimensions.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface FigureParams {
  language: 'r' | 'python';
  baseSize: number;
  canvasWidth: number;        // inches
  canvasHeight: number;       // inches
  effectiveCanvasWidth: number;  // after facet/subplot division
  effectiveCanvasHeight: number;
  overrides: Partial<Record<ElementKey, number>>;
  facetRows: number;
  facetCols: number;
  warnings: string[];
}

type ElementKey = 'axisTitle' | 'axisText' | 'legendText' | 'legendTitle' | 'plotTitle' | 'stripText' | 'caption';

interface ElementSpec {
  name: string;
  key: ElementKey;
  relMultiplier: number;   // relative to base_size
  minPt: number;           // minimum for readability
}

export interface ReadabilityElement {
  name: string;
  sourcePt: number;
  effectivePt: number;
  minPt: number;
  status: 'pass' | 'warn' | 'fail';
}

export interface ReadabilityResult {
  elements: ReadabilityElement[];
  scale: number;
  suggestedBaseSize: number;
  copySnippet: string;
  warnings: string[];
}

// ── Constants ────────────────────────────────────────────────────────

const R_DEFAULTS = { baseSize: 11, width: 7, height: 7 };
const PY_DEFAULTS = { baseSize: 10, width: 6.4, height: 4.8 };

const R_ELEMENTS: ElementSpec[] = [
  { name: 'Plot title',   key: 'plotTitle',   relMultiplier: 1.2, minPt: 18 },
  { name: 'Axis titles',  key: 'axisTitle',   relMultiplier: 1.0, minPt: 18 },
  { name: 'Tick labels',  key: 'axisText',    relMultiplier: 0.8, minPt: 14 },
  { name: 'Legend text',  key: 'legendText',  relMultiplier: 0.8, minPt: 14 },
  { name: 'Legend title', key: 'legendTitle', relMultiplier: 1.0, minPt: 14 },
  { name: 'Strip text',   key: 'stripText',   relMultiplier: 0.8, minPt: 14 },
  { name: 'Caption',      key: 'caption',     relMultiplier: 0.67, minPt: 12 },
];

const PY_ELEMENTS: ElementSpec[] = [
  { name: 'Plot title',   key: 'plotTitle',   relMultiplier: 1.2, minPt: 18 },
  { name: 'Axis titles',  key: 'axisTitle',   relMultiplier: 1.0, minPt: 18 },
  { name: 'Tick labels',  key: 'axisText',    relMultiplier: 0.83, minPt: 14 },
  { name: 'Legend text',  key: 'legendText',  relMultiplier: 1.0, minPt: 14 },
  { name: 'Caption',      key: 'caption',     relMultiplier: 0.83, minPt: 12 },
];

const SEABORN_CONTEXTS: Record<string, number> = {
  paper: 1.0, notebook: 1.2, talk: 1.5, poster: 2.0,
};

// ── R Parser ─────────────────────────────────────────────────────────

export function parseRCode(code: string): FigureParams {
  const warnings: string[] = [];

  // base_size from theme_*()
  let baseSize = R_DEFAULTS.baseSize;
  const themeBase = /theme_\w+\s*\(\s*base_size\s*=\s*([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = themeBase.exec(code)) !== null) baseSize = parseFloat(m[1]!);
  if (!code.match(/base_size\s*=/)) warnings.push('No font size found — assuming ggplot2 default base_size = 11pt.');

  // Per-element overrides from theme()
  const overrides: Partial<Record<ElementKey, number>> = {};
  const elementMap: [string, ElementKey, number][] = [
    ['axis\\.text',    'axisText',    0.8],
    ['axis\\.title',   'axisTitle',   1.0],
    ['legend\\.text',  'legendText',  0.8],
    ['legend\\.title', 'legendTitle', 1.0],
    ['plot\\.title',   'plotTitle',   1.2],
    ['strip\\.text',   'stripText',  0.8],
    ['plot\\.caption', 'caption',     0.67],
  ];
  for (const [pat, key, rel] of elementMap) {
    const re = new RegExp(`${pat}\\s*=\\s*element_text\\s*\\([^)]*size\\s*=\\s*(rel\\s*\\(\\s*[\\d.]+\\s*\\)|[\\d.]+)`, 'g');
    let last: RegExpExecArray | null = null;
    while ((m = re.exec(code)) !== null) last = m;
    if (last) {
      const raw = last[1]!.trim();
      if (raw.startsWith('rel')) {
        const relVal = parseFloat(raw.match(/[\d.]+/)![0]!);
        overrides[key] = baseSize * relVal;
      } else {
        overrides[key] = parseFloat(raw);
      }
    }
  }

  // Canvas from ggsave()
  let width = R_DEFAULTS.width;
  let height = R_DEFAULTS.height;
  let units = 'in';
  let dpi = 300;
  const ggsave = code.match(/ggsave\s*\([^)]*\)/s);
  if (ggsave) {
    const g = ggsave[0];
    const wm = g.match(/width\s*=\s*([\d.]+)/);
    const hm = g.match(/height\s*=\s*([\d.]+)/);
    const um = g.match(/units\s*=\s*"(\w+)"/);
    const dm = g.match(/dpi\s*=\s*([\d.]+)/);
    if (wm) width = parseFloat(wm[1]!);
    if (hm) height = parseFloat(hm[1]!);
    if (um) units = um[1]!;
    if (dm) dpi = parseFloat(dm[1]!);
    if (units === 'cm') { width /= 2.54; height /= 2.54; }
    else if (units === 'mm') { width /= 25.4; height /= 25.4; }
    else if (units === 'px') { width /= dpi; height /= dpi; }
  } else {
    warnings.push('No canvas size found — assuming R default 7"×7" (ggsave).');
  }

  // Facets
  let facetRows = 1;
  let facetCols = 1;
  const fwrap = code.match(/facet_wrap\s*\([^)]*nrow\s*=\s*(\d+)/);
  const fwrapCols = code.match(/facet_wrap\s*\([^)]*ncol\s*=\s*(\d+)/);
  const fgrid = code.match(/facet_grid\s*\(\s*(\w+)\s*~\s*(\w+)/);
  if (fwrap) facetRows = parseInt(fwrap[1]!, 10);
  if (fwrapCols) facetCols = parseInt(fwrapCols[1]!, 10);
  if (fgrid) { facetRows = 2; facetCols = 2; } // conservative estimate

  return {
    language: 'r',
    baseSize,
    canvasWidth: width,
    canvasHeight: height,
    effectiveCanvasWidth: width / facetCols,
    effectiveCanvasHeight: height / facetRows,
    overrides,
    facetRows,
    facetCols,
    warnings,
  };
}

// ── Python Parser ────────────────────────────────────────────────────

export function parsePythonCode(code: string): FigureParams {
  const warnings: string[] = [];

  let baseSize = PY_DEFAULTS.baseSize;
  let fontScale = 1.0;

  // rcParams
  const rc = code.match(/(?:plt|matplotlib)\.rcParams\s*\[\s*['"]font\.size['"]\s*\]\s*=\s*([\d.]+)/);
  if (rc) baseSize = parseFloat(rc[1]!);

  // seaborn set_theme font_scale
  const sns_scale = code.match(/sns\.set_theme\s*\([^)]*font_scale\s*=\s*([\d.]+)/);
  if (sns_scale) fontScale = parseFloat(sns_scale[1]!);

  // seaborn set_context
  const sns_ctx = code.match(/sns\.set_context\s*\(\s*["'](\w+)["']/);
  if (sns_ctx) {
    fontScale = SEABORN_CONTEXTS[sns_ctx[1]!] ?? 1.0;
  }

  baseSize = baseSize * fontScale;

  if (!rc && !sns_scale && !sns_ctx) {
    warnings.push('No font size found — assuming matplotlib default font.size = 10pt.');
  }

  // Per-element overrides
  const overrides: Partial<Record<ElementKey, number>> = {};
  const xlabel = code.match(/set_xlabel\s*\([^)]*fontsize\s*=\s*([\d.]+)/);
  const ylabel = code.match(/set_ylabel\s*\([^)]*fontsize\s*=\s*([\d.]+)/);
  const title = code.match(/set_title\s*\([^)]*fontsize\s*=\s*([\d.]+)/);
  const ticks = code.match(/tick_params\s*\([^)]*labelsize\s*=\s*([\d.]+)/);
  if (xlabel || ylabel) overrides.axisTitle = parseFloat((xlabel ?? ylabel)![1]!);
  if (ticks) overrides.axisText = parseFloat(ticks[1]!);
  if (title) overrides.plotTitle = parseFloat(title[1]!);

  // figsize
  let width = PY_DEFAULTS.width;
  let height = PY_DEFAULTS.height;
  const figsize = code.match(/figsize\s*=\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
  const pltFig = code.match(/plt\.figure\s*\(\s*figsize\s*=\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
  const fs = figsize ?? pltFig;
  if (fs) {
    width = parseFloat(fs[1]!);
    height = parseFloat(fs[2]!);
  } else {
    warnings.push('No canvas size found — assuming matplotlib default 6.4"×4.8".');
  }

  // Subplots grid
  let facetRows = 1;
  let facetCols = 1;
  const subplots = code.match(/plt\.subplots\s*\(\s*(\d+)\s*,\s*(\d+)/);
  if (subplots) {
    facetRows = parseInt(subplots[1]!, 10);
    facetCols = parseInt(subplots[2]!, 10);
  }

  return {
    language: 'python',
    baseSize,
    canvasWidth: width,
    canvasHeight: height,
    effectiveCanvasWidth: width / facetCols,
    effectiveCanvasHeight: height / facetRows,
    overrides,
    facetRows,
    facetCols,
    warnings,
  };
}

// ── Readability Computation ──────────────────────────────────────────

export function computeReadability(
  params: FigureParams,
  blockHeightIn: number,
  blockWidthIn: number,
): ReadabilityResult {
  const { effectiveCanvasWidth, effectiveCanvasHeight, baseSize, overrides, language, warnings } = params;

  // Scale = how much the figure scales up when placed in the block.
  // Use the constraining dimension (like object-fit: contain).
  const scale = Math.min(
    blockWidthIn / effectiveCanvasWidth,
    blockHeightIn / effectiveCanvasHeight,
  );

  const specs = language === 'r' ? R_ELEMENTS : PY_ELEMENTS;

  const elements: ReadabilityElement[] = specs.map((spec) => {
    const sourcePt = overrides[spec.key] ?? baseSize * spec.relMultiplier;
    const effectivePt = sourcePt * scale;
    const status: 'pass' | 'warn' | 'fail' =
      effectivePt >= spec.minPt ? 'pass' :
      effectivePt >= spec.minPt * 0.85 ? 'warn' : 'fail';
    return {
      name: spec.name,
      sourcePt: Math.round(sourcePt * 10) / 10,
      effectivePt: Math.round(effectivePt * 10) / 10,
      minPt: spec.minPt,
      status,
    };
  });

  // Back-calculate suggested base_size: the smallest base that makes
  // every element pass. For each element: base * rel * scale >= min
  // → base >= min / (rel * scale). Take the max across all.
  const suggestedBaseSize = Math.ceil(
    Math.max(...specs.map((spec) => {
      // Skip elements with explicit overrides — they don't depend on base
      if (overrides[spec.key] !== undefined) return 0;
      return spec.minPt / (spec.relMultiplier * scale);
    }))
  );

  const copySnippet = language === 'r'
    ? `theme_minimal(base_size = ${suggestedBaseSize})`
    : `plt.rcParams['font.size'] = ${suggestedBaseSize}`;

  return { elements, scale, suggestedBaseSize, copySnippet, warnings };
}
```

### Step 4: Run tests to verify they pass

```bash
cd apps/web && npx vitest run src/poster/__tests__/readability.test.ts
```
Expected: ALL PASS

### Step 5: Commit

```bash
git add apps/web/src/poster/readability.ts apps/web/src/poster/__tests__/readability.test.ts
git commit -m "feat(web): figure readability engine — R + Python parsers with readability math"
```

---

## Task 2: ReadabilityPanel UI Component

**Files:**
- Create: `apps/web/src/poster/ReadabilityPanel.tsx`
- Modify: `apps/web/src/poster/Sidebar.tsx:50` (add tab type)
- Modify: `apps/web/src/poster/Sidebar.tsx:329` (add tab button)
- Modify: `apps/web/src/poster/Sidebar.tsx:344-408` (add tab content)

### Step 1: Create the ReadabilityPanel component

```tsx
// apps/web/src/poster/ReadabilityPanel.tsx
import { useState, useMemo, type CSSProperties } from 'react';
import type { Block } from '@postr/shared';
import { PX } from './constants';
import {
  parseRCode,
  parsePythonCode,
  computeReadability,
  type ReadabilityResult,
} from './readability';

interface Props {
  selectedBlock: Block | null;
}

const panelStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12,
};
const textareaStyle: CSSProperties = {
  width: '100%', minHeight: 120, fontFamily: 'monospace', fontSize: 11,
  background: '#1e1e2e', color: '#cdd6f4', border: '1px solid #45475a',
  borderRadius: 4, padding: 8, resize: 'vertical',
};
const labelStyle: CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' as const,
  letterSpacing: 1,
};
const copyBtnStyle: CSSProperties = {
  cursor: 'pointer', background: '#313244', color: '#cdd6f4',
  border: '1px solid #45475a', borderRadius: 4, padding: '4px 10px',
  fontSize: 11, fontFamily: 'monospace',
};

export function ReadabilityPanel({ selectedBlock }: Props) {
  const [code, setCode] = useState('');
  const [lang, setLang] = useState<'auto' | 'r' | 'python'>('auto');

  const detectedLang = useMemo(() => {
    if (lang !== 'auto') return lang;
    if (/ggplot|geom_|theme_|ggsave|aes\s*\(/.test(code)) return 'r';
    if (/plt\.|matplotlib|seaborn|sns\.|figsize|subplots/.test(code)) return 'python';
    return null;
  }, [code, lang]);

  const result: ReadabilityResult | null = useMemo(() => {
    if (!code.trim() || !detectedLang || !selectedBlock) return null;
    const params = detectedLang === 'r' ? parseRCode(code) : parsePythonCode(code);
    const blockWidthIn = selectedBlock.w / PX;
    const blockHeightIn = selectedBlock.h / PX;
    return computeReadability(params, blockHeightIn, blockWidthIn);
  }, [code, detectedLang, selectedBlock]);

  if (!selectedBlock || selectedBlock.type !== 'image') {
    return (
      <div style={panelStyle}>
        <div style={labelStyle}>Figure Readability</div>
        <p style={{ color: '#6b7280', fontSize: 11 }}>
          Select an image block on the canvas, then paste your R or Python
          plotting code here to check whether text in your figure will be
          readable at print size.
        </p>
      </div>
    );
  }

  const blockWidthIn = (selectedBlock.w / PX).toFixed(1);
  const blockHeightIn = (selectedBlock.h / PX).toFixed(1);

  return (
    <div style={panelStyle}>
      <div style={labelStyle}>Figure Readability</div>
      <div style={{ fontSize: 10, color: '#6b7280' }}>
        Block: {blockWidthIn}" x {blockHeightIn}"
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {(['auto', 'r', 'python'] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            style={{
              ...copyBtnStyle,
              background: lang === l ? '#45475a' : '#313244',
              fontFamily: 'system-ui',
              textTransform: 'capitalize',
            }}
          >
            {l === 'auto' ? 'Auto' : l === 'r' ? 'R' : 'Python'}
          </button>
        ))}
      </div>

      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Paste your R or Python plotting code here..."
        style={textareaStyle}
      />

      {detectedLang && (
        <div style={{ fontSize: 10, color: '#89b4fa' }}>
          Detected: {detectedLang === 'r' ? 'R / ggplot2' : 'Python / matplotlib'}
        </div>
      )}

      {result && (
        <>
          {result.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 10, color: '#f9e2af', display: 'flex', gap: 4 }}>
              <span>&#9888;</span> {w}
            </div>
          ))}

          <div style={{ fontSize: 10, color: '#6b7280' }}>
            Scale factor: {result.scale.toFixed(2)}x
          </div>

          <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #45475a', color: '#9ca3af' }}>
                <th style={{ textAlign: 'left', padding: '3px 0' }}>Element</th>
                <th style={{ textAlign: 'right', padding: '3px 4px' }}>Source</th>
                <th style={{ textAlign: 'right', padding: '3px 4px' }}>Print</th>
                <th style={{ textAlign: 'right', padding: '3px 4px' }}>Min</th>
                <th style={{ textAlign: 'center', padding: '3px 0', width: 20 }}></th>
              </tr>
            </thead>
            <tbody>
              {result.elements.map((el) => (
                <tr key={el.name} style={{ borderBottom: '1px solid #313244' }}>
                  <td style={{ padding: '3px 0', color: '#cdd6f4' }}>{el.name}</td>
                  <td style={{ textAlign: 'right', padding: '3px 4px', color: '#bac2de' }}>{el.sourcePt}pt</td>
                  <td style={{
                    textAlign: 'right', padding: '3px 4px',
                    color: el.status === 'pass' ? '#a6e3a1' : el.status === 'warn' ? '#f9e2af' : '#f38ba8',
                    fontWeight: 600,
                  }}>
                    {el.effectivePt}pt
                  </td>
                  <td style={{ textAlign: 'right', padding: '3px 4px', color: '#6b7280' }}>{el.minPt}pt</td>
                  <td style={{ textAlign: 'center', padding: '3px 0' }}>
                    {el.status === 'pass' ? '✓' : el.status === 'warn' ? '⚠' : '✗'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {result.elements.some((e) => e.status !== 'pass') && (
            <div style={{ background: '#313244', borderRadius: 4, padding: 8 }}>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>
                Suggested minimum:
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <code style={{ flex: 1, fontSize: 11, color: '#a6e3a1', fontFamily: 'monospace' }}>
                  {result.copySnippet}
                </code>
                <button
                  style={copyBtnStyle}
                  onClick={() => navigator.clipboard.writeText(result.copySnippet)}
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

### Step 2: Wire ReadabilityPanel into the Sidebar

In `apps/web/src/poster/Sidebar.tsx`:

**Line 50** — add `'figure'` to the SidebarTab union:
```typescript
export type SidebarTab = 'layout' | 'authors' | 'refs' | 'style' | 'edit' | 'insert' | 'figure';
```

**Line ~329** — add `'figure'` to the tab array (the one that renders tab buttons).

**After line ~408** — add:
```tsx
{tab === 'figure' && (
  <ReadabilityPanel selectedBlock={props.selectedBlock} />
)}
```

Add the import at the top of Sidebar.tsx:
```typescript
import { ReadabilityPanel } from './ReadabilityPanel';
```

### Step 3: Run typecheck + tests

```bash
cd apps/web && npx tsc -b && npx vitest run
```
Expected: ALL PASS, tsc clean.

### Step 4: Commit

```bash
git add apps/web/src/poster/ReadabilityPanel.tsx apps/web/src/poster/Sidebar.tsx
git commit -m "feat(web): ReadabilityPanel UI — paste code, see per-element readability verdicts"
```

---

## Task 3: PRD doc — add OCR-based readability (Phase 2)

**Files:**
- Create: `docs/plans/2026-04-10-figure-readability-ocr-phase2.md`

### Step 1: Write the Phase 2 PRD

```markdown
# Figure Readability — Phase 2: OCR-Based Analysis

## Motivation

Not all users have their plotting code handy. Phase 2 adds an image-only
path: when the user uploads a figure without pasting code, Postr runs OCR
on the image to detect text regions, measures their pixel heights, and
computes effective print sizes using the same formula as Phase 1.

## Approach

Two options, user-configurable:

1. **Local Ollama** — `llava` or `moondream` model via localhost:11434.
   Free, private, no API key. Ask the model to return bounding boxes +
   text content for all text in the image. Parse the JSON response to
   get pixel heights.

2. **Claude Vision** — send the base64 image to Claude with a structured
   prompt asking for text region detection. Higher accuracy, requires
   API key.

## Formula (same as Phase 1)

```
text_height_inches = (text_height_px / image_height_px) × block_height_inches
effective_pt = text_height_inches × 72
```

## UI Flow

1. User uploads an image to an image block (existing flow).
2. If no code is pasted in the Figure tab, show a "Scan Image" button.
3. On click, send the base64 image to the selected OCR backend.
4. Parse the response for text bounding boxes.
5. Compute effective pt for each detected text region.
6. Show the same diagnostic table as Phase 1, but with detected regions
   instead of ggplot element names.

## Architecture

- New file: `apps/web/src/poster/ocrReadability.ts`
- Ollama client: POST to `http://localhost:11434/api/generate` with
  model=llava, prompt="List all text in this image with bounding boxes
  as JSON: [{text, x, y, width, height}]", image as base64.
- Claude client: use Anthropic SDK with vision, structured output.
- User preference stored in localStorage: `postr.ocr-backend`.

## Out of Scope for Phase 2

- Real-time OCR (too slow for live editing)
- Font identification (which font family is used in the figure)
- Color contrast analysis
```

### Step 2: Commit

```bash
git add docs/plans/
git commit -m "docs: Phase 2 PRD — OCR-based figure readability analysis"
```

---

Plan complete and saved to `docs/plans/2026-04-10-figure-readability-checker.md`. Two execution options:

**1. Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

Which approach?