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
  /**
   * How the user sets THIS element directly, so targeted advice can be
   * made copy-ready. For R it is the ggplot theme selector; for Python
   * the matplotlib call, or null where there is no single clean one.
   */
  selector: string | null;
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
  /**
   * PRIMARY advice: every failing element and the size it needs. Empty
   * when everything passes.
   */
  fontFixes: FontFix[];
  /** Copy-ready targeted snippet for `fontFixes`, or null when empty. */
  fontSnippet: string | null;
  warnings: string[];
}

// ── Constants ────────────────────────────────────────────────────────

const R_DEFAULTS = { baseSize: 11, width: 7, height: 7 };
const PY_DEFAULTS = { baseSize: 10, width: 6.4, height: 4.8 };

const R_ELEMENTS: ElementSpec[] = [
  { name: 'Plot title',   key: 'plotTitle',   relMultiplier: 1.2, minPt: 18, selector: 'plot.title' },
  { name: 'Axis titles',  key: 'axisTitle',   relMultiplier: 1.0, minPt: 18, selector: 'axis.title' },
  { name: 'Tick labels',  key: 'axisText',    relMultiplier: 0.8, minPt: 14, selector: 'axis.text' },
  { name: 'Legend text',  key: 'legendText',  relMultiplier: 0.8, minPt: 14, selector: 'legend.text' },
  { name: 'Legend title', key: 'legendTitle', relMultiplier: 1.0, minPt: 14, selector: 'legend.title' },
  { name: 'Strip text',   key: 'stripText',   relMultiplier: 0.8, minPt: 14, selector: 'strip.text' },
  { name: 'Caption',      key: 'caption',     relMultiplier: 0.67, minPt: 12, selector: 'plot.caption' },
];

const PY_ELEMENTS: ElementSpec[] = [
  // `selector` is the rcParams key rather than a call, because rcParams
  // is the one place that sets every one of these uniformly. The
  // per-Axes calls (ax.set_xlabel(fontsize=), ax.tick_params(labelsize=))
  // only reach the Axes they are called on, which is wrong advice for a
  // figure with subplots — and legend text has no per-Axes setter at all.
  { name: 'Plot title',   key: 'plotTitle',   relMultiplier: 1.2,  minPt: 18, selector: 'axes.titlesize' },
  { name: 'Axis titles',  key: 'axisTitle',   relMultiplier: 1.0,  minPt: 18, selector: 'axes.labelsize' },
  { name: 'Tick labels',  key: 'axisText',    relMultiplier: 0.83, minPt: 14, selector: 'xtick.labelsize' },
  { name: 'Legend text',  key: 'legendText',  relMultiplier: 1.0,  minPt: 14, selector: 'legend.fontsize' },
  // No selector: matplotlib has no rcParams key that moves a caption.
  // `figure.titlesize` moves fig.suptitle, so emitting it would be a
  // line that silently does nothing. It is still listed in the
  // per-element advice — just not in the copyable block.
  { name: 'Caption',      key: 'caption',     relMultiplier: 0.83, minPt: 12, selector: null },
];

const SEABORN_CONTEXTS: Record<string, number> = {
  paper: 1.0, notebook: 1.2, talk: 1.5, poster: 2.0,
};

// ── Comment stripping ────────────────────────────────────────────────

/**
 * Remove `#` comments from R or Python source, leaving string literals
 * untouched.
 *
 * This CANNOT be a regex. `/#.*$/gm` deletes the rest of the line from
 * inside a hex colour — `c("#FF0000", '#00FF00')` in ggplot code, or any
 * Python string containing `#` — taking real arguments with it. So we
 * scan characters and track quote state, including Python triple quotes.
 *
 * Newlines are preserved (a stripped comment leaves its `\n`) so line
 * numbers still line up with what the user sees in the editor.
 *
 * Only the PARSERS see the stripped source; the panel's "full edited
 * code" output rewrites the user's ORIGINAL text, so their comments
 * survive.
 *
 * Known limitation, accepted: a `figsize=` inside a triple-quoted
 * docstring is still read, because that is a string literal and not a
 * comment. Blanking string CONTENTS is not an option — `units = "cm"`
 * and `'font.size'` are both parsed out of string literals.
 */
export function stripComments(code: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]!;

    if (quote) {
      if (quote.length === 3) {
        if (code.startsWith(quote, i)) { out += quote; i += 2; quote = null; continue; }
        out += ch;
        continue;
      }
      if (ch === '\\') { out += ch + (code[i + 1] ?? ''); i++; continue; }
      if (ch === quote) quote = null;
      out += ch;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const triple = ch + ch + ch;
      if (code.startsWith(triple, i)) { quote = triple; out += triple; i += 2; continue; }
      quote = ch;
      out += ch;
      continue;
    }

    if (ch === '#') {
      // Skip to end of line. `i` lands ON the newline, which we emit and
      // let the loop's `i++` step past — consuming it here as well would
      // silently drop the first character of the next line.
      while (i < code.length && code[i] !== '\n') i++;
      out += '\n';
      continue;
    }

    out += ch;
  }
  return out;
}

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
  /**
   * How the "no canvas size in your code" warning names the fallback
   * size. The editor's Check tab passes nothing and gets "figure
   * preview size" (the canvas overlay); the public page names the
   * size the user typed instead. Only read when defaultWidthIn is set.
   */
  defaultSizeLabel?: string;
}

const DEFAULT_SIZE_LABEL = 'figure preview size';

/**
 * Argument text of the first `name(...)` call, with parentheses matched
 * so nested calls are included rather than truncating the match.
 *
 * `/ggsave\s*\([^)]*\)/` cannot do this: it stops at the first `)`,
 * which for `ggsave(filename = file.path("out", "fig.png"), width = 12)`
 * is the one closing `file.path(` — so the real arguments were never
 * seen (FR3). String literals are tracked so a parenthesis inside a
 * filename ("fig (final).png") does not end the call either.
 *
 * Returns null when the call is absent or its parens never balance.
 */
function extractCallArgs(code: string, name: string): string | null {
  const open = new RegExp(`\\b${name}\\s*\\(`, 'g');
  const m = open.exec(code);
  if (!m) return null;

  let depth = 1;
  let quote: string | null = null;
  for (let i = open.lastIndex; i < code.length; i++) {
    const ch = code[i]!;
    if (quote) {
      if (ch === '\\') i++;              // escaped char inside a string
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return code.slice(open.lastIndex, i);
  }
  return null;
}

/**
 * Drop every parenthesised group, so only TOP-LEVEL arguments remain.
 *
 * Without this, `ggsave("f.png", plot = wrap_plots(width = 3), width = 12)`
 * would read the inner `width = 3` as the canvas width, since the
 * per-key regexes take the first match.
 */
function topLevelArgs(args: string): string {
  let out = '';
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i]!;

    if (quote) {
      // Top-level string literals are KEPT: `units = "cm"` is an
      // argument whose value is a string, and dropping it would defeat
      // the very conversion FR4 is about. Strings nested inside another
      // call are dropped along with that call.
      if (depth === 0) out += ch;
      if (ch === '\\') {
        const next = args[++i];
        if (next !== undefined && depth === 0) out += next;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'") { quote = ch; if (depth === 0) out += ch; continue; }
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0) out += ch;
  }
  return out;
}

/** Units ggsave understands. Anything else is reported, not guessed at. */
const KNOWN_UNITS = new Set(['in', 'cm', 'mm', 'px']);

export function parseRCode(code: string, options: ParseOptions = {}): FigureParams {
  const warnings: string[] = [];
  // Everything below reads the comment-free source. A commented-out
  // experiment left beside the live line used to win, because the
  // base_size loop keeps the LAST match in the file (FR6).
  const src = stripComments(code);

  // base_size from theme_*()
  let baseSize = R_DEFAULTS.baseSize;
  // `base_size` need not be the first argument. `(?:[^()]|\([^()]*\))*?`
  // walks the argument list lazily and allows ONE level of nesting, so
  // `theme_bw(base_family = paste0("Hel", "vetica"), base_size = 22)`
  // matches — while still being unable to cross a closing paren, so a
  // loose `base_size = 30` after `theme_void()` is not captured (FR5).
  const themeBase = /theme_\w+\s*\((?:[^()]|\([^()]*\))*?\bbase_size\s*=\s*([\d.]+)/g;
  let m: RegExpExecArray | null;
  let baseSizeParsed = false;
  while ((m = themeBase.exec(src)) !== null) {
    baseSize = parseFloat(m[1]!);
    baseSizeParsed = true;
  }
  if (!src.match(/base_size\s*=/)) {
    warnings.push('No font size found — assuming ggplot2 default base_size = 11pt.');
  } else if (!baseSizeParsed && /base_size\s*=\s*[A-Za-z_.]/.test(src)) {
    // `theme_minimal(base_size = s)` — the value is a name, not a number,
    // so there is nothing to read and the figure was silently scored at
    // the library default. The warning above cannot catch it: `base_size =`
    // IS present, which suppresses it exactly when it is needed. Same
    // suppression shape as FR5.
    warnings.push(
      `base_size is set from a variable, not a number — scoring against the ggplot2 default ${R_DEFAULTS.baseSize}pt instead. Put the real value in to check it.`,
    );
  }

  // In-panel text is NOT a theme element, so nothing in the element table
  // covers it. A figure whose data labels are 2mm scored all-green.
  // ggplot sizes these in MILLIMETRES — `size = 2` is 2 * 72.27/25.4 =
  // 5.7pt — which is also why they are so often accidentally tiny.
  const MM_TO_PT = 72.27 / 25.4;
  const inPanel = src.match(
    /\b(geom_text|geom_label|annotate)\s*\((?:[^()]|\([^()]*\))*?\bsize\s*=\s*([\d.]+)/,
  );
  if (inPanel) {
    const pt = Math.round(parseFloat(inPanel[2]!) * MM_TO_PT * 10) / 10;
    warnings.push(
      `${inPanel[1]!}() sets in-panel text at size ${inPanel[2]!} (${pt}pt — ggplot sizes these in mm). In-panel labels are not theme elements, so they are not in the table below; check them yourself.`,
    );
  }

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
    while ((mm = re.exec(src)) !== null) {
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
  // Both fixes compose: the balanced-paren scanner (FR3) reading the
  // comment-stripped source (FR6), so a commented-out ggsave cannot win
  // and a nested filename call cannot truncate the real one.
  const ggsaveArgs = extractCallArgs(src, 'ggsave');
  if (ggsaveArgs !== null) {
    const g = topLevelArgs(ggsaveArgs);
    const wm = g.match(/width\s*=\s*([\d.]+)/);
    const hm = g.match(/height\s*=\s*([\d.]+)/);
    // Both quote styles: R treats them identically, and accepting only
    // double quotes silently skipped the cm->in conversion (FR4).
    const um = g.match(/units\s*=\s*(["'])(\w+)\1/);
    const dm = g.match(/dpi\s*=\s*([\d.]+)/);
    if (wm) width = parseFloat(wm[1]!);
    if (hm) height = parseFloat(hm[1]!);
    if (um) units = um[2]!;
    if (dm) dpi = parseFloat(dm[1]!);

    // Fail loudly rather than holding a default that reads as a clean
    // result: ggsave is present, so the user believes it was read.
    if (!wm || !hm) {
      warnings.push(
        `Found ggsave() but could not read its width/height — using ${width.toFixed(1)}"×${height.toFixed(1)}" instead. Check the call.`,
      );
    }
    if (um && !KNOWN_UNITS.has(units)) {
      warnings.push(`Unrecognised units = "${units}" in ggsave() — treating the canvas as inches.`);
      units = 'in';
    }

    if (units === 'cm') { width /= 2.54; height /= 2.54; }
    else if (units === 'mm') { width /= 25.4; height /= 25.4; }
    else if (units === 'px') { width /= dpi; height /= dpi; }
  } else if (options.defaultWidthIn !== undefined) {
    warnings.push(
      `No ggsave() found — using ${options.defaultSizeLabel ?? DEFAULT_SIZE_LABEL} ${width.toFixed(1)}"×${height.toFixed(1)}" as the source canvas.`,
    );
  } else {
    warnings.push('No canvas size found — assuming R default 7"×7" (ggsave).');
  }

  // Facets — recorded for reporting, NEVER applied to the canvas.
  //
  // Faceting subdivides the PLOTTING area. It changes neither the
  // figure's physical size nor any font size, so it cannot change how
  // much the figure is scaled when placed in a block. Dividing the
  // canvas by the grid made the scale factor grow with the panel count:
  // adding a single `facet_grid` line to a failing figure doubled its
  // reported print size and flipped it to PASS (FR1). The panel count
  // is kept on FigureParams because it is genuinely useful to report —
  // more panels do mean denser tick labels — but it must not touch
  // `effectiveCanvas*`.
  let facetRows = 1;
  let facetCols = 1;
  const fwrap = src.match(/facet_wrap\s*\([^)]*nrow\s*=\s*(\d+)/);
  const fwrapCols = src.match(/facet_wrap\s*\([^)]*ncol\s*=\s*(\d+)/);
  // `[.\w]+` accepts the `.` in `facet_grid(. ~ cyl)`, a one-sided grid.
  const fgrid = src.match(/facet_grid\s*\(\s*[.\w]+\s*~\s*[.\w]+/);
  if (fwrap) facetRows = parseInt(fwrap[1]!, 10);
  if (fwrapCols) facetCols = parseInt(fwrapCols[1]!, 10);
  if (fgrid && !fwrap && !fwrapCols) {
    // `facet_grid(a ~ b)` does not state its panel count — that comes
    // from the data's factor levels, which we cannot see. Previously
    // this guessed a 2x2 grid and fed the guess into the scale, so the
    // inflation was not merely wrong but arbitrary. Record "faceted,
    // count unknown" as 1x1 instead: it is the only honest value, and
    // now that facets no longer touch the scale, nothing depends on it.
    facetRows = 1;
    facetCols = 1;
  }

  return {
    language: 'r',
    baseSize,
    canvasWidth: width,
    canvasHeight: height,
    // The full canvas. See the facet note above: panel count must not
    // change the scale factor.
    effectiveCanvasWidth: width,
    effectiveCanvasHeight: height,
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
  // See parseRCode: Python is the mirror image of FR6 — its `figsize`
  // match is non-global, so the FIRST occurrence wins and a
  // commented-out draft higher in the script became the canvas.
  const src = stripComments(code);

  let baseSize = PY_DEFAULTS.baseSize;
  let fontScale = 1.0;

  // rcParams — two forms, both common. The dict form
  // `plt.rcParams.update({'font.size': 22})` matched NOTHING, so a 22pt
  // figure was reported as a 10pt disaster and the offered fix was a
  // no-op (PY-1).
  const rcItemRe = /(?:plt|matplotlib)\.rcParams\s*\[\s*['"]font\.size['"]\s*\]\s*=\s*([\d.]+)/g;
  const rcUpdateRe = /(?:plt|matplotlib)\.rcParams\.update\s*\(\s*\{(?:[^{}]|\{[^{}]*\})*?['"]font\.size['"]\s*:\s*([\d.]+)/g;
  // Whichever appears LATER in the source wins. That is source position,
  // not execution order — a size set inside a branch or a function called
  // later would be misordered — but it is strictly better than seeing
  // only one of the two forms, and the alternative is a Python parser.
  let rcBest: { at: number; value: number } | null = null;
  for (const re of [rcItemRe, rcUpdateRe]) {
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(src)) !== null) {
      if (!rcBest || mm.index >= rcBest.at) rcBest = { at: mm.index, value: parseFloat(mm[1]!) };
    }
  }
  const rc = rcBest;
  if (rc) baseSize = rc.value;

  // seaborn set_theme font_scale
  const sns_scale = src.match(/sns\.set_theme\s*\([^)]*font_scale\s*=\s*([\d.]+)/);
  if (sns_scale) fontScale = parseFloat(sns_scale[1]!);

  // seaborn set_context. The context name and `font_scale` MULTIPLY —
  // seaborn applies the scale on top of the context's own factor — but
  // the name used to overwrite any scale already read, so
  // `set_context("poster", font_scale=0.55)` reported 20pt where 11 is
  // right, roughly doubling the figure's apparent size (PY-2).
  const sns_ctx = src.match(/sns\.set_context\s*\(\s*["'](\w+)["']/);
  const sns_ctx_scale = src.match(/sns\.set_context\s*\([^)]*font_scale\s*=\s*([\d.]+)/);
  if (sns_ctx) {
    fontScale = (SEABORN_CONTEXTS[sns_ctx[1]!] ?? 1.0)
      * (sns_ctx_scale ? parseFloat(sns_ctx_scale[1]!) : 1.0);
  }

  baseSize = baseSize * fontScale;

  if (!rc && !sns_scale && !sns_ctx) {
    warnings.push('No font size found — assuming matplotlib default font.size = 10pt.');
  }

  // Per-element overrides
  const overrides: Partial<Record<ElementKey, number>> = {};
  // `[^)]*` could not cross a ')' inside the label TEXT, so
  // `set_xlabel("Time (min)", fontsize=10)` dropped the explicit size —
  // and units in parentheses appear in nearly every real axis label
  // (PY-3). One level of nesting is now allowed before the keyword.
  const ARGS = '(?:[^()]|\\([^()]*\\))*?';
  const argRe = (fn: string, kw: string) =>
    new RegExp(`${fn}\\s*\\(${ARGS}${kw}\\s*=\\s*([\\d.]+)`);
  const xlabel = src.match(argRe('set_xlabel', 'fontsize'));
  const ylabel = src.match(argRe('set_ylabel', 'fontsize'));
  const title = src.match(argRe('set_title', 'fontsize'));
  const ticks = src.match(argRe('tick_params', 'labelsize'));
  const overrideCoversAll: Partial<Record<ElementKey, boolean>> = {};

  // set_xlabel and set_ylabel each cover ONE axis. Taking
  // `(xlabel ?? ylabel)` let whichever appeared first speak for both, so
  // a 20pt x label hid a 6pt y label entirely — the same defect class as
  // FR2 on the R side. Take the smaller, and only claim full coverage
  // when both are set; otherwise the unset axis is still inheriting from
  // font.size and must count against the score.
  const axisTitlePts = [xlabel, ylabel]
    .filter((mm): mm is RegExpMatchArray => mm != null)
    .map((mm) => parseFloat(mm[1]!));
  if (axisTitlePts.length) {
    overrides.axisTitle = Math.min(...axisTitlePts);
    overrideCoversAll.axisTitle = axisTitlePts.length === 2;
  }

  // These two DO cover their element completely: tick_params applies to
  // both axes' tick labels, and there is only one title. Saying so
  // matters — without it they score as partial and get compared against
  // the inherited size, which would report 6.4pt for
  // `rcParams['font.size'] = 8` + `tick_params(labelsize = 20)`.
  if (ticks) {
    overrides.axisText = parseFloat(ticks[1]!);
    overrideCoversAll.axisText = true;
  }
  if (title) {
    overrides.plotTitle = parseFloat(title[1]!);
    overrideCoversAll.plotTitle = true;
  }

  // figsize — same overlay-default override pattern as parseRCode.
  // If the user's Python src doesn't set figsize=(w,h) we prefer
  // the figure-preview overlay's dimensions over matplotlib's
  // 6.4×4.8 built-in so the analyzer and the UI agree on scale.
  let width = options.defaultWidthIn ?? PY_DEFAULTS.width;
  let height = options.defaultHeightIn ?? PY_DEFAULTS.height;
  const figsize = src.match(/figsize\s*=\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
  const pltFig = src.match(/plt\.figure\s*\(\s*figsize\s*=\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
  const fs = figsize ?? pltFig;
  if (fs) {
    width = parseFloat(fs[1]!);
    height = parseFloat(fs[2]!);
  } else if (options.defaultWidthIn !== undefined) {
    warnings.push(
      `No figsize=(w,h) found — using ${options.defaultSizeLabel ?? DEFAULT_SIZE_LABEL} ${width.toFixed(1)}"×${height.toFixed(1)}" as the source canvas.`,
    );
  } else {
    warnings.push('No canvas size found — assuming matplotlib default 6.4"×4.8".');
  }

  // Subplots grid
  let facetRows = 1;
  let facetCols = 1;
  const subplots = src.match(/plt\.subplots\s*\(\s*(\d+)\s*,\s*(\d+)/);
  if (subplots) {
    facetRows = parseInt(subplots[1]!, 10);
    facetCols = parseInt(subplots[2]!, 10);
  }

  return {
    language: 'python',
    baseSize,
    canvasWidth: width,
    canvasHeight: height,
    // The full canvas. See the facet note above: panel count must not
    // change the scale factor.
    effectiveCanvasWidth: width,
    effectiveCanvasHeight: height,
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

  // PRIMARY advice — every failing element, targeted. `ceil` already
  // leaves up to a point of headroom above the floor, so a small change
  // in block size does not immediately re-fail the fix.
  const fontFixes: FontFix[] = specs
    .map((spec) => {
      const el = elements.find((e) => e.name === spec.name)!;
      return {
        name: spec.name,
        selector: spec.selector,
        currentPt: el.sourcePt,
        neededPt: Math.ceil(spec.minPt / scale),
        wasOverridden: overrides[spec.key] !== undefined,
        // A bare selector reaches the element unless the user pinned a
        // single axis: ggplot's later-wins applies between theme() calls,
        // but a parent element never clears a child that was set.
        bareSelectorReaches:
          overrides[spec.key] === undefined || overrideCoversAll[spec.key] === true,
        status: el.status,
      };
    })
    .filter((f) => f.status !== 'pass')
    .map(({ status, ...f }) => f);

  const fontSnippet = fontFixes.length ? buildFontSnippet(language, fontFixes) : null;

  return {
    elements,
    scale,
    suggestedBaseSize,
    copySnippet,
    overrideFixes,
    fontFixes,
    fontSnippet,
    warnings,
  };
}

/**
 * A copy-ready snippet that sets each failing element directly.
 *
 * R emits ONE `theme()` call. ggplot applies theme calls left to right
 * and later ones win, so appending this after an existing `theme(...)`
 * is legal and overrides only the properties named — the user does not
 * have to merge it by hand.
 *
 * Python emits `rcParams.update({...})` rather than per-Axes calls
 * (`ax.set_xlabel(fontsize=)`, `ax.tick_params(labelsize=)`) because
 * those reach only the Axes they are called on, which is wrong advice
 * for a figure with subplots — and legend text has no per-Axes setter at
 * all. rcParams sets every Axes uniformly, which is what the advice
 * means. It must be set BEFORE the figure is created.
 */
function buildFontSnippet(language: 'r' | 'python', fixes: FontFix[]): string | null {
  const usable = fixes.filter((f) => f.selector !== null);
  if (!usable.length) return null;

  if (language === 'r') {
    const args = usable.flatMap((f) => {
      // `axis.text` / `axis.title` have per-axis children. When the user
      // pinned only one of them, a bare parent selector will NOT reach
      // it — ggplot keeps the child's explicit value — so the snippet
      // would grow the passing axis and leave the failing one alone.
      // Name both axes in that case.
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

  // matplotlib splits tick label size across two keys; setting only
  // `xtick.labelsize` would silently leave the y axis at its old size.
  const entries = usable.flatMap((f) =>
    f.selector === 'xtick.labelsize'
      ? [`    'xtick.labelsize': ${f.neededPt}`, `    'ytick.labelsize': ${f.neededPt}`]
      : [`    '${f.selector}': ${f.neededPt}`],
  );
  return `plt.rcParams.update({\n${entries.join(',\n')}\n})`;
}

/**
 * The user's OWN script with the targeted sizes applied — not a fragment
 * they have to splice in themselves.
 *
 * A snippet asks the user to work out where it goes; on a script with an
 * existing `theme()` call and a `ggsave()` at the bottom, that is a real
 * chance to paste it in the wrong place and get no effect. So the copy
 * button hands back runnable code.
 *
 * R: the new `theme()` is inserted immediately after the last
 * `theme_*()` call when there is one — ggplot applies theme calls in
 * order and the last wins, so this overrides exactly the sizes named and
 * nothing else. With no `theme_*()` call it is appended to the end of
 * the plot expression, which is the last non-blank line before
 * `ggsave()`.
 *
 * Python: `rcParams.update({...})` is inserted BEFORE the figure is
 * created, because rcParams is read at figure-creation time — placing it
 * after `plt.subplots()` would silently do nothing.
 *
 * Returns the code unchanged when there is nothing to apply.
 */
export function applyFontFixes(
  code: string,
  language: 'r' | 'python',
  fontSnippet: string | null,
): string {
  if (!fontSnippet) return code;

  if (language === 'r') {
    const themeEnd = lastCallEnd(code, /theme_\w+\s*\(/g);
    if (themeEnd !== null) {
      return code.slice(0, themeEnd) + ' +\n  ' + fontSnippet + code.slice(themeEnd);
    }
    // No theme_*() to hang it off. Attach to the end of the plot
    // expression instead: the last non-blank line before ggsave(), or
    // the end of the script when there is no ggsave().
    const lines = code.split('\n');
    let insertAfter = lines.length - 1;
    const ggsaveAt = lines.findIndex((l) => /\bggsave\s*\(/.test(l));
    if (ggsaveAt > 0) insertAfter = ggsaveAt - 1;
    while (insertAfter > 0 && lines[insertAfter]!.trim() === '') insertAfter--;
    lines[insertAfter] = lines[insertAfter]!.trimEnd() + ' +\n  ' + fontSnippet;
    return lines.join('\n');
  }

  const lines = code.split('\n');
  // rcParams is read when the figure is created, so this must land above
  // it or it is a no-op the user cannot see.
  let at = lines.findIndex((l) => /plt\.(subplots|figure)\s*\(/.test(l));
  if (at === -1) {
    const lastImport = lines.reduce(
      (best, l, i) => (/^\s*(import|from)\s+\w/.test(l) ? i : best),
      -1,
    );
    at = lastImport + 1;
  }
  lines.splice(at, 0, fontSnippet, '');
  return lines.join('\n');
}

/**
 * End index (just past the closing paren) of the LAST call matching
 * `opener`, with parens balanced and string literals respected. Null when
 * there is no such call or its parens never close.
 */
function lastCallEnd(code: string, opener: RegExp): number | null {
  let end: number | null = null;
  let m: RegExpExecArray | null;
  const re = new RegExp(opener.source, 'g');
  while ((m = re.exec(code)) !== null) {
    let depth = 1;
    let quote: string | null = null;
    for (let i = re.lastIndex; i < code.length; i++) {
      const ch = code[i]!;
      if (quote) {
        if (ch === '\\') i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '(') depth++;
      else if (ch === ')' && --depth === 0) { end = i + 1; break; }
    }
  }
  return end;
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
