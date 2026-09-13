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
  /**
   * Per key: does the explicit override reach EVERY axis? `false` means
   * a sibling axis still inherits from base_size, so the element is only
   * partially overridden — it must still count against the score and
   * still inform the base_size advice.
   *
   * Optional, and its ABSENCE is deliberately the conservative reading:
   * an unset key scores as partially overridden, which takes the smaller
   * of the explicit and inherited sizes. A parser that forgets to set it
   * therefore under-reports a size rather than hiding a failing element,
   * which is the direction this whole finding is about.
   */
  overrideCoversAll?: Partial<Record<ElementKey, boolean>>;
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

/**
 * A failing element whose size is set EXPLICITLY in the user's theme.
 * Changing base_size cannot fix these — the override wins — so each one
 * needs its own number.
 */
export interface OverrideFix {
  name: string;
  /** The size the user's code sets, in pt. */
  currentPt: number;
  /** The size it must be set to in order to clear its floor at this scale. */
  neededPt: number;
}

export interface ReadabilityResult {
  elements: ReadabilityElement[];
  scale: number;
  /**
   * `null` when there is no base_size worth recommending, i.e. every
   * element's size is explicitly overridden so base_size governs
   * nothing. Previously this was `Math.max()` over a list of zeros,
   * which produced 0 and a snippet that would destroy the figure.
   */
  suggestedBaseSize: number | null;
  /** `null` whenever `suggestedBaseSize` is. */
  copySnippet: string | null;
  /** Per-element advice for failing elements base_size cannot reach. */
  overrideFixes: OverrideFix[];
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

/**
 * Optional hint the caller can pass when the user's code doesn't
 * include a `ggsave()` / `plt.savefig()` call: treat THIS size as the
 * canvas default instead of the hardcoded library default (R = 7×7,
 * matplotlib = 6.4×4.8). Used by the Check tab's figure-preview
 * overlay — whatever box the user dragged on the canvas is the size
 * they plan to render at, so parsing should honor it as the default.
 */
export interface ParseOptions {
  defaultWidthIn?: number;
  defaultHeightIn?: number;
}

export function parseRCode(code: string, options: ParseOptions = {}): FigureParams {
  const warnings: string[] = [];

  // base_size from theme_*()
  let baseSize = R_DEFAULTS.baseSize;
  const themeBase = /theme_\w+\s*\(\s*base_size\s*=\s*([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = themeBase.exec(code)) !== null) baseSize = parseFloat(m[1]!);
  if (!code.match(/base_size\s*=/)) warnings.push('No font size found — assuming ggplot2 default base_size = 11pt.');

  // Per-element overrides from theme().
  //
  // Two things the old pattern could not do (FR2):
  //   - `axis.text.x = ...`. The selector was followed immediately by
  //     `\s*=`, which hits `.x` where it needs `=`. Per-axis selectors
  //     are THE standard ggplot idiom (rotated x labels, different y
  //     sizing), so the exact case this tool exists to catch parsed to
  //     nothing and a 7pt label was reported as 16pt PASS.
  //   - `element_text(margin = margin(t = 8), size = 9)`. `[^)]*` cannot
  //     cross the inner call's `)`, so the explicit size was dropped.
  //
  // `overrideCoversAll` tracks WHICH axes an explicit selector reached.
  // A bare `axis.text` covers both; `axis.text.x` alone leaves y
  // inheriting from base_size, and reporting only the overridden axis
  // would swap the old silent wrong PASS for a new one.
  const overrides: Partial<Record<ElementKey, number>> = {};
  const overrideCoversAll: Partial<Record<ElementKey, boolean>> = {};
  const elementMap: [string, ElementKey, boolean][] = [
    ['axis\\.text',    'axisText',    true],
    ['axis\\.title',   'axisTitle',   true],
    ['legend\\.text',  'legendText',  false],
    ['legend\\.title', 'legendTitle', false],
    ['plot\\.title',   'plotTitle',   false],
    ['strip\\.text',   'stripText',   false],
    ['plot\\.caption', 'caption',     false],
  ];
  for (const [pat, key, hasAxes] of elementMap) {
    const re = new RegExp(
      `${pat}(\\.[xy])?\\s*=\\s*element_text\\s*\\((?:[^()]|\\([^()]*\\))*?size\\s*=\\s*(rel\\s*\\(\\s*[\\d.]+\\s*\\)|[\\d.]+)`,
      'g',
    );
    // Last write wins PER SELECTOR (ggplot semantics), then the smallest
    // across selectors: a checker must report the text that fails, not
    // the text that passes.
    const bySelector = new Map<string, number>();
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(code)) !== null) {
      const axis = mm[1] ?? '';
      const raw = mm[2]!.trim();
      bySelector.set(
        axis,
        raw.startsWith('rel')
          ? baseSize * parseFloat(raw.match(/[\d.]+/)![0]!)
          : parseFloat(raw),
      );
    }
    if (bySelector.size === 0) continue;

    overrides[key] = Math.min(...bySelector.values());
    overrideCoversAll[key] =
      !hasAxes || bySelector.has('') || (bySelector.has('.x') && bySelector.has('.y'));
  }

  // Canvas from ggsave() — if missing, fall back to the caller-
  // provided default (e.g. the figure-preview overlay's dimensions
  // from the Check tab) instead of R's built-in 7×7. That way
  // the source size the analyzer scores against matches what the
  // user can SEE on the canvas, rather than a hidden library
  // constant they'd have to guess at.
  let width = options.defaultWidthIn ?? R_DEFAULTS.width;
  let height = options.defaultHeightIn ?? R_DEFAULTS.height;
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
  } else if (options.defaultWidthIn !== undefined) {
    warnings.push(
      `No ggsave() found — using figure preview size ${width.toFixed(1)}"×${height.toFixed(1)}" as the source canvas.`,
    );
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
    overrideCoversAll,
    facetRows,
    facetCols,
    warnings,
  };
}

// ── Python Parser ────────────────────────────────────────────────────

export function parsePythonCode(code: string, options: ParseOptions = {}): FigureParams {
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
  // matplotlib has no per-axis font selector of this shape — set_xlabel
  // and set_ylabel are separate calls, both folded into axisTitle below
  // — so anything parsed here covers the element completely.
  const overrideCoversAll: Partial<Record<ElementKey, boolean>> = {};
  const xlabel = code.match(/set_xlabel\s*\([^)]*fontsize\s*=\s*([\d.]+)/);
  const ylabel = code.match(/set_ylabel\s*\([^)]*fontsize\s*=\s*([\d.]+)/);
  const title = code.match(/set_title\s*\([^)]*fontsize\s*=\s*([\d.]+)/);
  const ticks = code.match(/tick_params\s*\([^)]*labelsize\s*=\s*([\d.]+)/);
  if (xlabel || ylabel) {
    overrides.axisTitle = parseFloat((xlabel ?? ylabel)![1]!);
    overrideCoversAll.axisTitle = true;
  }
  if (ticks) { overrides.axisText = parseFloat(ticks[1]!); overrideCoversAll.axisText = true; }
  if (title) { overrides.plotTitle = parseFloat(title[1]!); overrideCoversAll.plotTitle = true; }

  // figsize — same overlay-default override pattern as parseRCode.
  // If the user's Python code doesn't set figsize=(w,h) we prefer
  // the figure-preview overlay's dimensions over matplotlib's
  // 6.4×4.8 built-in so the analyzer and the UI agree on scale.
  let width = options.defaultWidthIn ?? PY_DEFAULTS.width;
  let height = options.defaultHeightIn ?? PY_DEFAULTS.height;
  const figsize = code.match(/figsize\s*=\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
  const pltFig = code.match(/plt\.figure\s*\(\s*figsize\s*=\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
  const fs = figsize ?? pltFig;
  if (fs) {
    width = parseFloat(fs[1]!);
    height = parseFloat(fs[2]!);
  } else if (options.defaultWidthIn !== undefined) {
    warnings.push(
      `No figsize=(w,h) found — using figure preview size ${width.toFixed(1)}"×${height.toFixed(1)}" as the source canvas.`,
    );
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
    overrideCoversAll,
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
  const {
    effectiveCanvasWidth,
    effectiveCanvasHeight,
    baseSize,
    overrides,
    overrideCoversAll = {},
    language,
    warnings,
  } = params;

  // Scale = how much the figure scales up when placed in the block.
  // Use the constraining dimension (like object-fit: contain).
  const scale = Math.min(
    blockWidthIn / effectiveCanvasWidth,
    blockHeightIn / effectiveCanvasHeight,
  );

  const specs = language === 'r' ? R_ELEMENTS : PY_ELEMENTS;

  const elements: ReadabilityElement[] = specs.map((spec) => {
    // A partially-overridden element (only `axis.text.x` set, say) still
    // renders its other axis at the inherited size, so the score must
    // take whichever is smaller — otherwise overriding one axis upward
    // would HIDE a failing sibling.
    const inheritedPt = baseSize * spec.relMultiplier;
    const explicitPt = overrides[spec.key];
    const sourcePt =
      explicitPt === undefined
        ? inheritedPt
        : overrideCoversAll[spec.key]
          ? explicitPt
          : Math.min(explicitPt, inheritedPt);
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
  // Only elements WITHOUT an explicit override depend on base_size, so
  // only they can inform the recommendation. When none are left, there
  // is no base_size to recommend — `Math.max()` over an all-zero list
  // used to yield 0 and a `base_size = 0` snippet (FR7).
  // Partially-overridden elements still have an axis inheriting from
  // base_size, so they belong in the recommendation; only a FULLY
  // overridden element is independent of it.
  const baseDriven = specs.filter(
    (spec) => overrides[spec.key] === undefined || !overrideCoversAll[spec.key],
  );
  const suggestedBaseSize = baseDriven.length
    ? Math.ceil(
        Math.max(
          ...baseDriven.map((spec) => spec.minPt / (spec.relMultiplier * scale)),
        ),
      )
    : null;

  const copySnippet =
    suggestedBaseSize === null
      ? null
      : language === 'r'
        ? `theme_minimal(base_size = ${suggestedBaseSize})`
        : `plt.rcParams['font.size'] = ${suggestedBaseSize}`;

  // The other half of FR7: dropping overridden rows from the base_size
  // calculation is correct, but dropping them SILENTLY left failing
  // elements with no advice at all. An override wins over base_size, so
  // each one needs its own number.
  const overrideFixes: OverrideFix[] = specs
    .filter((spec) => overrides[spec.key] !== undefined)
    .map((spec) => {
      const el = elements.find((e) => e.name === spec.name)!;
      return {
        name: spec.name,
        currentPt: overrides[spec.key]!,
        neededPt: Math.ceil(spec.minPt / scale),
        status: el.status,
      };
    })
    .filter((f) => f.status !== 'pass')
    .map(({ name, currentPt, neededPt }) => ({ name, currentPt, neededPt }));

  return { elements, scale, suggestedBaseSize, copySnippet, overrideFixes, warnings };
}

// ── Language Detection ──────────────────────────────────────────────

/**
 * Score-based language detection for R vs Python plotting code.
 * Returns 'r', 'python', or null if ambiguous / no signal.
 */
export function detectLanguage(code: string): 'r' | 'python' | null {
  let rScore = 0;
  let pyScore = 0;

  // Strong R signals
  if (/ggplot\s*\(/.test(code)) rScore += 5;
  if (/geom_\w+/.test(code)) rScore += 5;
  if (/theme_\w+/.test(code)) rScore += 4;
  if (/ggsave\s*\(/.test(code)) rScore += 5;
  if (/aes\s*\(/.test(code)) rScore += 4;
  if (/<-/.test(code)) rScore += 3;
  if (/library\s*\(/.test(code)) rScore += 3;
  if (/\b(cowplot|patchwork|ggpubr|gridExtra|lattice)\b/.test(code)) rScore += 4;
  if (/%>%|%\+%|\|>/.test(code)) rScore += 3;
  if (/\bc\s*\(/.test(code)) rScore += 1;
  if (/element_text|element_blank|element_rect/.test(code)) rScore += 4;
  if (/facet_wrap|facet_grid/.test(code)) rScore += 4;
  if (/scale_\w+/.test(code)) rScore += 2;
  if (/labs\s*\(/.test(code)) rScore += 2;

  // Strong Python signals
  if (/plt\./.test(code)) pyScore += 5;
  if (/matplotlib/.test(code)) pyScore += 5;
  if (/import\s+\w+/.test(code)) pyScore += 3;
  if (/seaborn|sns\./.test(code)) pyScore += 5;
  if (/figsize\s*=/.test(code)) pyScore += 4;
  if (/subplots\s*\(/.test(code)) pyScore += 4;
  if (/ax\.\w+/.test(code)) pyScore += 3;
  if (/rcParams/.test(code)) pyScore += 4;
  if (/set_xlabel|set_ylabel|set_title/.test(code)) pyScore += 3;
  if (/savefig\s*\(/.test(code)) pyScore += 4;
  if (/def\s+\w+|class\s+\w+/.test(code)) pyScore += 2;
  if (/fig,\s*ax/.test(code)) pyScore += 3;

  if (rScore === 0 && pyScore === 0) return null;
  if (rScore > pyScore) return 'r';
  if (pyScore > rScore) return 'python';
  return null; // tie — ask user to pick
}
