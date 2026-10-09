/**
 * Figure readability engine.
 *
 * Reads R (ggplot2) or Python (matplotlib/seaborn) plotting code for its
 * canvas and font sizes, then computes the effective print size each text
 * element will render at on the poster, given the image block's physical
 * dimensions.
 *
 * Fix 13b (record docs/fixes/13b-checker-sizes.md, the owner's design of
 * 2026-10-07): the code is read with a bounded, explicit rule table, each
 * match kept with its character position and the last one that applies
 * winning (readabilityPyRules.ts, readabilityPyText.ts and
 * readabilityPyModel.ts for Python; readabilityRModel.ts for R). A size or a
 * canvas the code does not set is shown as the default it assumed, and the
 * script the page hands back sets it explicitly (readabilityPyFix.ts,
 * readabilityRFix.ts). This module keeps the public entry points, the scorer
 * and the language detection.
 */
import { pythonParams } from './readabilityPyModel';
import { rParams } from './readabilityRModel';
import { figureTextStatus } from './figureTextMinimums';
import { maskCodeForRewrite } from './readabilitySource';
import {
  PY_ELEMENTS,
  R_ELEMENTS,
  type ElementKey,
  type FigureParams,
  type ParseOptions,
} from './readabilityTypes';

export { maskCodeForRewrite, maskComments, stripComments } from './readabilitySource';
export type { ElementKey, FigureParams, ParseOptions } from './readabilityTypes';

// ── Types ────────────────────────────────────────────────────────────

export interface ReadabilityElement {
  name: string;
  sourcePt: number;
  effectivePt: number;
  minPt: number;
  status: 'pass' | 'warn' | 'fail';
  /**
   * Fix 13b: the code does not set this size, so the library's default is
   * shown (and the corrected script sets it). The table marks the row.
   */
  assumed: boolean;
  /** Assumed, and left as written by the corrected script (FigureParams.assumedKept). */
  kept: boolean;
  /** Assumed because the code sets it in a way the check cannot read (FigureParams.unread), not left out. */
  unread: boolean;
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

/**
 * A failing element and the size it needs, whether or not the user set
 * it explicitly.
 *
 * This is the PRIMARY advice. Raising `base_size` inflates every text
 * element including the ones already passing, and on a poster the figure
 * block is a fixed size — so text the figure did not need grows into
 * panel space the data did. Targeted sizes cost more characters to paste
 * and less of the plot.
 */
export interface FontFix {
  name: string;
  /** The element's class, which the Python fix raises by name. */
  key: ElementKey;
  /** ggplot theme selector, or matplotlib rcParams key. */
  selector: string | null;
  /** What it renders at today, in pt (source, before scaling). */
  currentPt: number;
  /** What it must be set to so it clears its floor once scaled. */
  neededPt: number;
  /** True when the user already sets this element explicitly. */
  wasOverridden: boolean;
  /**
   * True when a bare selector is enough. False means the user set ONE
   * axis explicitly, so the snippet must name both — in ggplot a later
   * bare `axis.text` does not clear an earlier `axis.text.x`.
   */
  bareSelectorReaches: boolean;
}

export interface ReadabilityResult {
  elements: ReadabilityElement[];
  scale: number;
  /**
   * Fix 13b: the printed scale rests on a canvas the code does not fix (no
   * figure size, a size the check cannot read, a seaborn grid, a cropped
   * save). The scale line is marked, and so is every row's print size.
   */
  canvasAssumed: boolean;
  /**
   * `null` when there is no base_size worth recommending: no failing
   * element follows the script's base (font.size, base_size), so changing
   * it fixes nothing, or the elements that follow a base do not all follow
   * the same setting (fix 13b). Never below the script's own value.
   */
  suggestedBaseSize: number | null;
  /** `null` whenever `suggestedBaseSize` is. */
  copySnippet: string | null;
  /** Per-element advice for failing elements base_size cannot reach. */
  overrideFixes: OverrideFix[];
  /**
   * PRIMARY advice: every failing element and the size it needs. Empty
   * when everything passes.
   */
  fontFixes: FontFix[];
  /** Copy-ready targeted snippet for `fontFixes`, or null when empty. */
  fontSnippet: string | null;
  warnings: string[];
}

// ── Readers ──────────────────────────────────────────────────────────

/** R (ggplot2): the rule table of readabilityRModel.ts. */
export function parseRCode(code: string, options: ParseOptions = {}): FigureParams {
  return rParams(code, options);
}

/** Python (matplotlib, seaborn): the rule table of readabilityPyRules.ts and readabilityPyText.ts. */
export function parsePythonCode(code: string, options: ParseOptions = {}): FigureParams {
  return pythonParams(code, options);
}

// ── Readability Computation ──────────────────────────────────────────

// The warning band is the shared module's (FIGURE_TEXT_WARN_RATIO, fix 13c;
// it was a literal 0.85 here, review Q-R8).
const verdict = figureTextStatus;

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
    // A parser that does not distinguish the two keeps its old behaviour.
    overrideViaBareSelector = overrideCoversAll,
    language,
    warnings,
  } = params;

  // Scale = how much the figure scales up when placed in the block.
  // Use the constraining dimension (like object-fit: contain).
  const scale = Math.min(
    blockWidthIn / effectiveCanvasWidth,
    blockHeightIn / effectiveCanvasHeight,
  );

  // Fix 13b: a row the code does not draw and no setting could raise
  // (Python's caption with no fig.text; an R element_blank()) is left out.
  const specs = (language === 'r' ? R_ELEMENTS : PY_ELEMENTS).filter((s) => !params.hidden?.[s.key]);

  /** The size each class is drawn at: the rule table's, else base × the element's multiplier and `overrides`. */
  const sourceOf = (key: ElementKey, rel: number): number => {
    const read = params.sizes?.[key];
    if (read !== undefined) return read;
    // A partially-overridden element (only `axis.text.x` set, say) still
    // renders its other axis at the inherited size, so the score must
    // take whichever is smaller — otherwise overriding one axis upward
    // would HIDE a failing sibling.
    const inheritedPt = baseSize * rel;
    const explicitPt = overrides[key];
    return explicitPt === undefined ? inheritedPt : overrideCoversAll[key] ? explicitPt : Math.min(explicitPt, inheritedPt);
  };

  const elements: ReadabilityElement[] = specs.map((spec) => {
    const sourcePt = sourceOf(spec.key, spec.relMultiplier);
    const effectivePt = sourcePt * scale;
    return {
      name: spec.name,
      // EXACT for the verdict, rounded for display: rounding first flipped
      // a 13.95 pt warn to a 14 pt pass (FR, 411 flips swept).
      sourcePt: Math.round(sourcePt * 10) / 10,
      effectivePt: Math.round(effectivePt * 10) / 10,
      minPt: spec.minPt,
      status: verdict(effectivePt, spec.minPt),
      assumed: !!params.assumed?.[spec.key],
      // Left as written by the script: always (a value it must not overwrite), or where it passes
      // (since review round 3 only a Python fontdict= the check cannot see into: every other unread
      // size is floored, short or not, P13B-R3-03).
      kept: !!params.assumed?.[spec.key] && (!!params.assumedKept?.[spec.key]
        || (!!params.floorWhenShort?.[spec.key] && verdict(effectivePt, spec.minPt) === 'pass')),
      unread: !!params.assumed?.[spec.key] && !!params.unread?.[spec.key],
    };
  });

  const suggestedBaseSize = baseAdvice(params, specs, elements, scale);
  const copySnippet =
    suggestedBaseSize === null
      ? null
      : language === 'r'
        ? `${params.baseTheme ?? 'theme_grey'}(base_size = ${suggestedBaseSize})`
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
        // One decimal, the precision the whole panel speaks in (D10).
        currentPt: Math.round(overrides[spec.key]! * 10) / 10,
        neededPt: Math.ceil(spec.minPt / scale),
        status: el.status,
      };
    })
    .filter((f) => f.status !== 'pass')
    .map(({ name, currentPt, neededPt }) => ({ name, currentPt, neededPt }));

  // PRIMARY advice — every failing element, targeted. `ceil` already
  // leaves up to a point of headroom above the floor, so a small change
  // in block size does not immediately re-fail the fix.
  const fontFixes: FontFix[] = specs
    .map((spec) => {
      const el = elements.find((e) => e.name === spec.name)!;
      return {
        name: spec.name,
        key: spec.key,
        selector: spec.selector,
        currentPt: el.sourcePt,
        neededPt: Math.ceil(spec.minPt / scale),
        wasOverridden: overrides[spec.key] !== undefined && !params.raisedByFix?.[spec.key],
        // Reachability, NOT coverage. A parent element never clears a
        // child that was explicitly set, so a bare selector reaches only
        // when nothing is pinned or the user pinned the bare selector
        // themselves. Pinning `.x` AND `.y` is complete coverage and
        // still unreachable from the parent.
        bareSelectorReaches:
          overrides[spec.key] === undefined
          || overrideViaBareSelector[spec.key] === true,
        status: el.status,
      };
    })
    .filter((f) => f.status !== 'pass')
    .map(({ status, ...f }) => f);

  const fontSnippet = fontFixes.length ? buildFontSnippet(language, fontFixes) : null;

  return {
    elements,
    scale,
    canvasAssumed: !!params.canvasAssumed,
    suggestedBaseSize,
    copySnippet,
    overrideFixes,
    fontFixes,
    fontSnippet,
    warnings,
  };
}

/**
 * "Or change one number": the smallest base (font.size, base_size) at which
 * every failing element that follows it meets its minimum, never below the
 * script's own base (fix 13b: 19 runs offered a font.size below the one the
 * script sets, and doing it lowered 52 element-runs). Null when no failing
 * element the figure draws follows a base (only sizes set directly fail, a
 * seaborn context sets them, or the row is for text the script never makes:
 * review round 2), so the edit would fix nothing, or when the reader found
 * no single base to edit (R: several plots combined, each with its own).
 *
 * A reader that gives no slopes (a hand-built FigureParams) keeps the
 * earlier rule: every element without a full override follows base_size.
 */
function baseAdvice(
  params: FigureParams,
  specs: typeof R_ELEMENTS,
  elements: ReadabilityElement[],
  scale: number,
): number | null {
  const failing = specs.filter((s) => elements.find((e) => e.name === s.name)!.status !== 'pass');
  if (params.baseSlope) {
    // A scale the code cannot give (a seaborn grid, a cropped save) makes
    // the number untrue: the edited script fixes the canvas instead.
    if (params.ownBase === null || params.ownBase === undefined || params.scaleUnknown) return null;
    // Only text the figure draws (P13B-R2-10: a legend row the script never makes drove
    // "font.size = 13", which changed nothing drawn).
    const follows = failing.filter((s) => (params.baseSlope![s.key] ?? 0) > 0 && !params.undrawn?.[s.key]);
    if (!follows.length) return null;
    const n = Math.ceil(Math.max(...follows.map((s) => s.minPt / (params.baseSlope![s.key]! * scale))) - 1e-9);
    return n > params.ownBase ? n : null;
  }
  const driven = specs.filter((s) => params.overrides[s.key] === undefined || !params.overrideCoversAll?.[s.key]);
  return driven.length ? Math.ceil(Math.max(...driven.map((s) => s.minPt / (s.relMultiplier * scale)))) : null;
}

/**
 * A copy-ready snippet that sets each failing element directly.
 *
 * R emits ONE `theme()` call. ggplot applies theme calls left to right
 * and later ones win, so the fix places it after every theme of the
 * user's (readabilityRFix.ts: in the plot ggsave() saves).
 *
 * Python emits the sizes each listed element needs, by class, as a dict
 * literal (`{'axisTitle': 16, ...}`): the list the script generator
 * (readabilityPyFix.ts) raises in place.
 */
function buildFontSnippet(language: 'r' | 'python', fixes: FontFix[]): string | null {
  if (language === 'python') {
    const need = fixes.map((f) => `'${f.key}': ${f.neededPt}`);
    return need.length ? `{${need.join(', ')}}` : null;
  }
  const usable = fixes.filter((f) => f.selector !== null);
  if (!usable.length) return null;
  const args = usable.flatMap((f) => {
    // `axis.text` / `axis.title` have per-axis children. When the user
    // pinned only one of them, a bare parent selector will NOT reach
    // it — ggplot keeps the child's explicit value — so name both.
    const perAxis = f.selector === 'axis.text' || f.selector === 'axis.title';
    if (perAxis && !f.bareSelectorReaches) {
      return [
        `  ${f.selector}.x = element_text(size = ${f.neededPt})`,
        `  ${f.selector}.y = element_text(size = ${f.neededPt})`,
      ];
    }
    return [`  ${f.selector} = element_text(size = ${f.neededPt})`];
  });
  return `theme(\n${args.join(',\n')}\n)`;
}

/** Bracket depth before each index of masked code (0 outside every bracket). */
function bracketDepths(masked: string): Int32Array {
  const depth = new Int32Array(masked.length + 1);
  let d = 0;
  for (let k = 0; k < masked.length; k += 1) {
    depth[k] = d;
    const ch = masked[k]!;
    if (ch === '(' || ch === '[' || ch === '{') d += 1;
    else if ((ch === ')' || ch === ']' || ch === '}') && d > 0) d -= 1;
  }
  depth[masked.length] = d;
  return depth;
}

// ── Language and plotting-system detection ──────────────────────────

/**
 * The plotting systems the checker can tell apart. It reads two of them —
 * ggplot2 in R, matplotlib in Python (seaborn and pandas' plot methods draw
 * with matplotlib) — and names the rest instead of scoring them as one of
 * those two: their text sizes are set some other way, so a ggplot2 or
 * matplotlib table and edited code would be wrong (fix 15, plan item 15).
 */
export type PlotSystem = 'ggplot2' | 'matplotlib' | 'base' | 'lattice' | 'plotly' | 'plotnine' | 'altair';

export const SUPPORTED_SYSTEMS: readonly PlotSystem[] = ['ggplot2', 'matplotlib'];

export interface PlotCode {
  /** null when nothing in the code tells R from Python (and none was picked). */
  language: 'r' | 'python' | null;
  /** null exactly when `language` is. */
  system: PlotSystem | null;
  /**
   * True when no call in the code named a system and the language's own
   * one was assumed (R → ggplot2, Python → matplotlib), so the label can
   * say "checked as" instead of "detected".
   */
  assumed: boolean;
}

interface Signal {
  name: string;
  re: RegExp;
  w: number;
}

// Every pattern runs on maskCodeForRewrite(code): comments AND string
// contents blanked, delimiters kept. Scored on the raw text, a commented-out
// matplotlib draft outscored the R script carrying it (D9, the held-back
// 9ea9f38), and words inside titles counted: "Effect of import duties" was
// Python's `import`, arrowstyle="<-" was R's assignment (the confirmer of
// item 15, one-token ablations). The parsers keep reading the raw text.

/**
 * ggplot2's grammar: its calls, which are what "ggplot2" means in R.
 * plotnine borrows them in Python (see PLOTNINE_HINTS). A name inside a
 * longer one, a method, or a name that is not called is not the grammar:
 * a wrapper called myggplot(), geopandas' `gdf.geom_type` and
 * `.geom_equals()`, a loop variable called geom_type, a variable called
 * `theme_colors` (round 1 of fix 15's review: `.geom_type` and the loop
 * variable tied a Python snippet with R; the others read one as R).
 */
const GG_GRAMMAR: Signal[] = [
  { name: 'ggplot()', re: /(?<!\w)ggplot\s*\(/, w: 5 },
  { name: 'geom_*()', re: /(?<![\w.$])geom_\w+\s*\(/, w: 5 },
  { name: 'theme_*()', re: /theme_\w+\s*\(/, w: 4 },
  { name: 'ggsave()', re: /ggsave\s*\(/, w: 5 },
  { name: 'aes()', re: /aes\s*\(/, w: 4 },
  { name: 'element_*', re: /element_text|element_blank|element_rect/, w: 4 },
  { name: 'facet_*', re: /facet_wrap|facet_grid/, w: 4 },
  // A ggplot scale is scale_<aesthetic>_<kind>(…). `scale_\w+` also took
  // a variable called scale_factor and matplotlib's autoscale_view() as
  // ggplot (the confirmer: a matplotlib snippet read as R).
  { name: 'scale_*_*()', re: /(?<![\w.])scale_[a-z]+_\w+\s*\(/, w: 2 },
  { name: 'labs()', re: /labs\s*\(/, w: 2 },
  { name: 'qplot()', re: /(?<![\w.])qplot\s*\(/, w: 5 },
];

/**
 * ggplot's grammar written in Python: plotnine. A ggplot() call with
 * plotnine imported is plotnine whatever the rest of the code says, and
 * whatever the user picked (the reproducer: plotnine scripts scored R
 * 16–23 against Python 0–3, 4 of 4). A call, not just the grammar's words:
 * `.save()` is PIL's too, and a seaborn FacetGrid may be called
 * facet_grid. A dot before the call is allowed: `import plotnine as p9`
 * writes `p9.ggplot(`.
 */
const GGPLOT_CALL = /(?<!\w)(?:ggplot|qplot)\s*\(/;
const PLOTNINE_IMPORT = /^[ \t]*(?:from[ \t]+plotnine\b|import[ \t]+plotnine\b)/m;
/**
 * What plotnine code shows that R can write too. With a ggplot() call and
 * nothing in the code R's alone (an R signal, or a line ending in `+`),
 * one of these says the grammar's words are no evidence for R: Python's
 * own signals then decide, and with none the code cannot be placed. R's
 * aes() takes strings for constants, aes(x = "") for a pie and
 * aes(colour = "Observed") for a legend label: round 1 found 6 of 7 such
 * ggplot2 snippets refused as plotnine, and round 2 four more whose chain
 * sat inside print(), ggsave() or a for loop's braces, where no line ends
 * in `+` outside every bracket. Python could write those lines too.
 */
const PLOTNINE_HINTS: RegExp[] = [
  // aes("dose", "response"): plotnine maps columns by name, as strings.
  /(?<!\w)aes\s*\(\s*(?:\w+\s*=\s*)?["']/,
  // theme(axis_text=…): ggplot2's theme elements are dotted (axis.text).
  /(?<!\w)theme\s*\([^)]*\b(?:axis|plot|legend|strip|panel)_\w+\s*=/,
  // p.save(…): a method; ggplot2 saves with ggsave().
  /\.save\s*\(/,
];

/**
 * A line that ends in `+` outside every bracket: how R carries a ggplot
 * chain onto the next line. Python cannot (a syntax error), so plotnine
 * wraps its chains in parentheses.
 */
function endsLineWithPlus(masked: string): boolean {
  const depth = bracketDepths(masked);
  const re = /\+[ \t\r]*$/gm;
  for (let m = re.exec(masked); m; m = re.exec(masked)) {
    if (depth[m.index] === 0) return true;
  }
  return false;
}

// Names checked against seaborn 0.13.2, matplotlib's pyplot and pylab,
// plotly.express and pandas.plotting (round 1 of fix 15's review): of
// base R's and lattice's plotting functions, seaborn has barplot(),
// heatmap() and stripplot(), and pylab and plotly.express histogram().
// Those place nothing on their own; the rest are R's alone.

/** Base R graphics functions no Python plotting library has. */
const BASE_R_ONLY = /(?<![\w.$])(?:matplot|abline|mtext|dotchart|stripchart|mosaicplot|persp|curve|pairs|dev\.off|par)\s*\(/;
/** Base R calls a Python library has too (pylab, seaborn): base graphics only once the code is known to be R. */
const BASE_R_SHARED = /(?<![\w.$])(?:plot|hist|boxplot|barplot|heatmap|lines|points|text|legend|title|axis|pie|image|contour|polygon|arrows|segments)\s*\(/;
/** Lattice functions no Python plotting library has, and library(lattice). */
const LATTICE_ONLY = /(?<![\w.$])(?:xyplot|bwplot|densityplot|dotplot|barchart|levelplot|contourplot|wireframe|cloud|splom|qqmath)\s*\(|(?<![\w.$])(?:library|require)\s*\(\s*lattice\s*\)/;
/** Lattice calls a Python library has too (seaborn's stripplot, pylab's histogram): lattice only once the code is R. */
const LATTICE_SHARED = /(?<![\w.$])(?:histogram|stripplot)\s*\(/;
const PLOTLY_R = /(?<![\w.$])(?:plot_ly|ggplotly)\s*\(/;
const PLOTLY_PY = /^[ \t]*(?:from[ \t]+plotly\b|import[ \t]+plotly\b)|(?<![\w.$])(?:px\.\w+|go\.(?:Figure|Scatter|Bar|Box|Histogram|Heatmap|Pie))\s*\(|\.(?:update_layout|write_image)\s*\(/m;
const ALTAIR = /^[ \t]*import[ \t]+altair\b|(?<![\w.$])alt\.Chart\s*\(|\.mark_(?:point|line|bar|area|circle|square|tick|rect|rule|text|boxplot)\s*\(/m;

const R_SIGNALS: Signal[] = [
  // An assignment starts a statement. Anywhere else `<-` is as likely a
  // Python comparison with a negative number (y<-0.5, the confirmer).
  { name: '<- assignment', re: /(?:^|[;{])[ \t]*[A-Za-z.][\w.$@]*(?:\[[^\]\n]*\])*[ \t]*<<?-/m, w: 3 },
  { name: 'library()', re: /library\s*\(/, w: 3 },
  // A package name is R, but names no plotting system on its own:
  // library(tidyverse) then base hist() is base graphics (round 1).
  { name: 'a ggplot2 package', re: /\b(?:ggplot2|tidyverse|cowplot|patchwork|ggpubr|gridExtra)\b/, w: 4 },
  { name: 'a pipe', re: /%>%|%\+%|\|>/, w: 3 },
  { name: 'c()', re: /\bc\s*\(/, w: 1 },
  // Base R graphics, which the old signals did not see: 17 of the
  // reproducer's 18 nulls scored 0 to 0.
  { name: 'function()', re: /(?<![\w.$])function\s*\(/, w: 3 },
  { name: 'TRUE, FALSE or NULL', re: /\b(?:TRUE|FALSE|NULL)\b/, w: 2 },
  { name: 'df$col', re: /[\w)\]]\$[A-Za-z.]/, w: 3 },
  // A keyword argument cannot have a dot in its name in Python.
  { name: 'a dotted argument name', re: /[(,]\s*[A-Za-z]\w*\.[\w.]+\s*=(?!=)/, w: 4 },
  { name: 'main=, xlab= or ylab=', re: /[(,]\s*(?:main|xlab|ylab)\s*=(?!=)/, w: 2 },
  { name: 'a formula', re: /[\w)]\s*~\s*[\w.(]/, w: 2 },
  { name: 'a graphics device', re: /(?<![\w.$])(?:png|pdf|jpeg|tiff|bmp|svg|cairo_pdf)\s*\(/, w: 3 },
  { name: 'a base graphics function', re: BASE_R_ONLY, w: 4 },
  { name: 'a lattice function', re: LATTICE_ONLY, w: 5 },
  { name: 'plotly for R', re: PLOTLY_R, w: 5 },
];

const PY_SIGNALS: Signal[] = [
  { name: 'plt.', re: /plt\./, w: 5 },
  { name: 'matplotlib', re: /matplotlib/, w: 5 },
  // `import *` only in Python's form: JavaScript writes import * as d3
  // (round 2: a D3 snippet read as Python and got a matplotlib table).
  { name: 'import', re: /import\s+[\w.]|from\s+[\w.]+\s+import\s+\*/, w: 3 },
  { name: 'seaborn', re: /seaborn|sns\./, w: 5 },
  { name: 'figsize=', re: /figsize\s*=/, w: 4 },
  { name: 'subplots()', re: /subplots\s*\(/, w: 4 },
  // Not inside a longer name: `ax\.` matched max.temp (the confirmer).
  { name: 'an Axes method', re: /(?<![\w.$])ax(?:es|s)?(?:\[[^\]\n]*\])*\.\w+/, w: 3 },
  { name: 'rcParams', re: /rcParams/, w: 4 },
  { name: 'set_xlabel and the like', re: /set_xlabel|set_ylabel|set_title/, w: 3 },
  // A method: Julia's Plots.jl has a bare savefig() too.
  { name: '.savefig()', re: /\.savefig\s*\(/, w: 4 },
  { name: 'def or class', re: /def\s+\w+|class\s+\w+/, w: 2 },
  { name: 'fig, ax', re: /fig,\s*ax/, w: 3 },
  { name: 'a notebook magic', re: /^[ \t]*%(?:matplotlib|pylab)\b/m, w: 5 },
  { name: 'True, False or None', re: /\b(?:True|False|None)\b/, w: 2 },
  { name: 'a block opened with a colon', re: /^[ \t]*(?:for|while|if|elif|else|with|try|except|finally)\b[^\n]*:[ \t]*$/m, w: 3 },
  { name: 'plotly', re: PLOTLY_PY, w: 6 },
  { name: 'Altair', re: ALTAIR, w: 6 },
];

/**
 * matplotlib named outright, once the code is known to be Python: pyplot,
 * Axes or seaborn. `subplots(` only as its own name: plotly's
 * make_subplots() was read as matplotlib (round 1).
 */
const MATPLOTLIB = /plt\.|matplotlib|pylab|seaborn|sns\.|figsize\s*=|(?<!\w)subplots\s*\(|rcParams|\.savefig\s*\(|fig,\s*ax|(?<![\w.$])ax(?:es|s)?(?:\[[^\]\n]*\])*\.\w+/;
/**
 * Calls that draw with matplotlib in Python but share their names with
 * other libraries (pandas' plot methods; pylab's bare calls): read only
 * after the unsupported systems, so plotly's px.scatter() stays plotly.
 */
const MATPLOTLIB_SHARED = /\.(?:plot|hist|boxplot|bar|barh|scatter)\s*\(|\.plot\.\w+\s*\(|(?<![\w.$])(?:plot|hist|bar|scatter|boxplot|errorbar|xlabel|ylabel|title|legend|savefig|show|figure|subplot)\s*\(/;

function scoreMasked(masked: string) {
  const fired: string[] = [];
  const total = (signals: Signal[], side: string) =>
    signals.reduce((sum, s) => {
      if (!s.re.test(masked)) return sum;
      fired.push(`${side}+${s.w} ${s.name}`);
      return sum + s.w;
    }, 0);
  const grammar = total(GG_GRAMMAR, 'gg');
  const rOnly = total(R_SIGNALS, 'R');
  const r = grammar + rOnly;
  const py = total(PY_SIGNALS, 'Py');
  const ggCall = GGPLOT_CALL.test(masked);
  const plotnineImport = ggCall && PLOTNINE_IMPORT.test(masked);
  const hinted =
    !plotnineImport && ggCall && rOnly === 0 && !endsLineWithPlus(masked) && PLOTNINE_HINTS.some((re) => re.test(masked));
  if (plotnineImport) fired.push('plotnine');
  if (hinted) fired.push('a plotnine hint');
  // A hint takes the grammar's words out of R's score; nothing R's alone
  // fired, so R has nothing left and Python's own signals decide.
  const forR = hinted ? 0 : r;
  const verdict: 'r' | 'python' | null = plotnineImport
    ? 'python'
    : forR === 0 && py === 0
      ? null
      : forR > py ? 'r' : py > forR ? 'python' : null; // a tie: ask the user to pick
  return { r, py, fired, verdict, grammar: grammar > 0, ggCall, plotnineImport };
}

/**
 * What decided the language, for the harness (scripts/language-detect-
 * check.mjs) and for debugging: the R and Python scores, each signal that
 * fired, and the verdict detectLanguage returns. `r` sums every R-side
 * signal; when 'a plotnine hint' fired, the grammar's part of it did not
 * count toward the verdict.
 */
export function languageSignals(code: string): { r: number; py: number; fired: string[]; verdict: 'r' | 'python' | null } {
  const { r, py, fired, verdict } = scoreMasked(maskCodeForRewrite(code));
  return { r, py, fired, verdict };
}

/**
 * Score-based language detection for R vs Python plotting code.
 * Returns 'r', 'python', or null if ambiguous / no signal.
 */
export function detectLanguage(code: string): 'r' | 'python' | null {
  return scoreMasked(maskCodeForRewrite(code)).verdict;
}

/**
 * The language (detected, or `picked` by the user) and the plotting system
 * the code draws with. A system named by its own calls stays named after a
 * hand pick: picking R on a base graphics plot must not score it as ggplot2
 * (the reproducer: that edit ran and saved a blank figure). A name another
 * system shares, or a hint, names nothing on its own (round 1). A bare
 * `plot(x, y)` names nothing and parses in both languages, so with no pick
 * it has no language.
 */
export function describePlotCode(code: string, picked?: 'r' | 'python'): PlotCode {
  const masked = maskCodeForRewrite(code);
  const scored = scoreMasked(masked);
  const language = picked ?? scored.verdict;
  if (!language) return { language: null, system: null, assumed: false };
  const named = (system: PlotSystem): PlotCode => ({ language, system, assumed: false });
  if (scored.ggCall && (language === 'python' || scored.plotnineImport)) return named('plotnine');
  if (language === 'r' && scored.grammar) return named('ggplot2');
  if (language === 'python' && MATPLOTLIB.test(masked)) return named('matplotlib');
  if (LATTICE_ONLY.test(masked) || (language === 'r' && LATTICE_SHARED.test(masked))) return named('lattice');
  if (PLOTLY_R.test(masked) || PLOTLY_PY.test(masked)) return named('plotly');
  if (ALTAIR.test(masked)) return named('altair');
  if (BASE_R_ONLY.test(masked) || (language === 'r' && BASE_R_SHARED.test(masked))) return named('base');
  if (language === 'python' && MATPLOTLIB_SHARED.test(masked)) return named('matplotlib');
  return { language, system: language === 'r' ? 'ggplot2' : 'matplotlib', assumed: true };
}
