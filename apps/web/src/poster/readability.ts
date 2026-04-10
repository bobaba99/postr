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
