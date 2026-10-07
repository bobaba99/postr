/**
 * Figure readability engine.
 *
 * Parses R (ggplot2) or Python (matplotlib/seaborn) plotting code to
 * extract canvas dimensions and font sizes, then computes the effective
 * print size each text element will render at on the poster, given the
 * image block's physical dimensions.
 */

import { FIGURE_TEXT_MIN_PT } from './figureTextMinimums';

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
  /**
   * Per key: did the user's OWN override use the bare selector
   * (`axis.text`, not `axis.text.x`)? This is a different question from
   * `overrideCoversAll` and the two were conflated, which is the bug.
   *
   * Pinning BOTH axes individually gives complete coverage
   * (`overrideCoversAll = true`) while a bare selector still reaches
   * NEITHER of them — ggplot's inheritance keeps an explicitly-set child
   * against a later parent. So advice built on "coverage is complete"
   * emitted `axis.text = element_text(size = 14)` into a theme where
   * `axis.text.x` and `axis.text.y` were already pinned, and changed
   * nothing.
   *
   * Absence is the conservative reading: an unset key means we do not
   * know a bare selector reaches, so the advice names the children
   * explicitly, which is always correct if more verbose.
   */
  overrideViaBareSelector?: Partial<Record<ElementKey, boolean>>;
  /**
   * Classes whose size is what the checker's own fix raised them to, not
   * one the user set (Python). The fix list does not call these "(you set
   * this)".
   */
  raisedByFix?: Partial<Record<ElementKey, boolean>>;
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

// minPt: the canonical minimums for figure text, one set shared with the
// image scan and the inserted charts (figureTextMinimums.ts).
const MIN = FIGURE_TEXT_MIN_PT;

const R_ELEMENTS: ElementSpec[] = [
  { name: 'Plot title',   key: 'plotTitle',   relMultiplier: 1.2, minPt: MIN.plotTitle,   selector: 'plot.title' },
  { name: 'Axis titles',  key: 'axisTitle',   relMultiplier: 1.0, minPt: MIN.axisTitle,   selector: 'axis.title' },
  { name: 'Tick labels',  key: 'axisText',    relMultiplier: 0.8, minPt: MIN.axisText,    selector: 'axis.text' },
  { name: 'Legend text',  key: 'legendText',  relMultiplier: 0.8, minPt: MIN.legendText,  selector: 'legend.text' },
  { name: 'Legend title', key: 'legendTitle', relMultiplier: 1.0, minPt: MIN.legendTitle, selector: 'legend.title' },
  { name: 'Strip text',   key: 'stripText',   relMultiplier: 0.8, minPt: MIN.stripText,   selector: 'strip.text' },
  { name: 'Caption',      key: 'caption',     relMultiplier: 0.67, minPt: MIN.caption,    selector: 'plot.caption' },
];

const PY_ELEMENTS: ElementSpec[] = [
  // `selector` is the rcParams key rather than a call, because rcParams
  // is the one place that sets every one of these uniformly. The
  // per-Axes calls (ax.set_xlabel(fontsize=), ax.tick_params(labelsize=))
  // only reach the Axes they are called on, which is wrong advice for a
  // figure with subplots — and legend text has no per-Axes setter at all.
  { name: 'Plot title',   key: 'plotTitle',   relMultiplier: 1.2,  minPt: MIN.plotTitle,  selector: 'axes.titlesize' },
  { name: 'Axis titles',  key: 'axisTitle',   relMultiplier: 1.0,  minPt: MIN.axisTitle,  selector: 'axes.labelsize' },
  { name: 'Tick labels',  key: 'axisText',    relMultiplier: 0.83, minPt: MIN.axisText,   selector: 'xtick.labelsize' },
  { name: 'Legend text',  key: 'legendText',  relMultiplier: 1.0,  minPt: MIN.legendText, selector: 'legend.fontsize' },
  // No selector: matplotlib has no rcParams key that moves a caption
  // (`figure.titlesize` moves fig.suptitle). The fix raises it all the same:
  // its helper raises the figure's own texts at save (fix 13).
  { name: 'Caption',      key: 'caption',     relMultiplier: 0.83, minPt: MIN.caption,    selector: null },
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
  return scanComments(code, false);
}

/**
 * Same as `stripComments`, but comment characters become SPACES instead
 * of disappearing, so the result is character-for-character the same
 * length as the input and any index found in it is valid in the original.
 *
 * That is what `stripComments` cannot give you: choosing an insertion
 * point in stripped code and applying it to the original lands somewhere
 * else entirely. Insertion points were instead chosen from raw text, so a
 * commented-out `theme_minimal(` attracted the edit and the joining `+`
 * was written inside a `#` comment — valid-looking output that changes
 * nothing when run.
 */
export function maskComments(code: string): string {
  return scanComments(code, true);
}

/**
 * Comments AND string CONTENTS blanked (delimiters kept), same length.
 *
 * For the REWRITER only. The parsers must keep reading inside literals —
 * `units = "cm"` and `'font.size'` are how they work — but a rewriter
 * must never write there. Loosening the value patterns to match arbitrary
 * text turned that distinction from academic into a script that will not
 * parse: `msg <- "set base_size = 30 for posters"` had its closing quote
 * eaten, and the Python equivalent produced an unterminated string.
 */
export function maskCodeForRewrite(code: string): string {
  const noComments = scanComments(code, true);
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < noComments.length; i++) {
    const ch = noComments[i]!;
    if (quote) {
      if (quote.length === 3 && noComments.startsWith(quote, i)) {
        out += quote; i += 2; quote = null; continue;
      }
      if (ch === '\\') { out += '  '; i++; continue; }
      if (ch === quote) { out += ch; quote = null; continue; }
      out += ch === '\n' ? '\n' : ' ';
      continue;
    }
    if (ch === '"' || ch === "'") {
      const triple = ch + ch + ch;
      if (noComments.startsWith(triple, i)) { quote = triple; out += triple; i += 2; continue; }
      quote = ch;
      out += ch;
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Index just past the end of the argument VALUE starting at `from` —
 * the next top-level `,` or the closing `)`, with nesting and quotes
 * respected.
 *
 * A character class cannot do this. `[^,)\n]+` stopped at the first `)`
 * of `if (big) 20 else 9`, leaving `20 else 9` stranded; the call
 * alternative matched only `max(bs, 8)` of `max(bs, 8) * 1.2` and left
 * `* 1.2` behind, so the emitted script RAN and rendered 38.4pt when the
 * check had scored 32. Running and lying is worse than not running.
 */
export function argValueEnd(code: string, from: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < code.length; i++) {
    const ch = code[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) return i;
      depth--;
    } else if (ch === ',' && depth === 0) return i;
    else if (ch === '\n' && depth === 0) return i;
  }
  return code.length;
}

function scanComments(code: string, blank: boolean): string {
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
      const start = i;
      while (i < code.length && code[i] !== '\n') i++;
      if (blank) {
        // Exactly as many characters as were consumed, so offsets hold.
        out += ' '.repeat(i - start);
        if (i < code.length) out += '\n';
      } else {
        out += '\n';
      }
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
  return extractAllCallArgs(code, name)[0] ?? null;
}

/**
 * Every call to `name`, each as its complete argument list.
 *
 * Same balanced, quote-aware scan as `extractCallArgs` — one scanner, so
 * the two cannot drift. Needed because some calls are legitimately
 * repeated: `tick_params` is normally written once per axis, and reading
 * only the first said the second axis was never scoped.
 */
function extractAllCallArgs(code: string, name: string): string[] {
  const open = new RegExp(`\\b${name}\\s*\\(`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = open.exec(code)) !== null) {
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
      else if (ch === ')' && --depth === 0) {
        out.push(code.slice(open.lastIndex, i));
        open.lastIndex = i + 1;           // resume after this call
        break;
      }
    }
    // SKIP an unbalanced call, do not abort the walk. `open.lastIndex` is
    // already past the failed match so `exec` still advances. Aborting
    // here let one `geom_text(` inside a string literal silence every
    // real call after it — the same failure this file already documents
    // as fixed for tick_params, kept alive in the shared helper.
    if (depth !== 0) continue;
  }
  return out;
}

/**
 * `plt.tick_params(...)`, `plt.gca().tick_params(...)` and a bare
 * `tick_params(...)` all act on "the current Axes" — a name we cannot
 * resolve from text. They share this key, and are folded into the single
 * explicit Axes when the script names exactly one.
 */
const ALIAS_AXES = '<current>';

interface TickCall {
  /** Which Axes the call acts on, as written. */
  axesKey: string;
  /** 'x' | 'y' when the receiver itself is an Axis (`ax.xaxis.`), else null. */
  axisFromReceiver: string | null;
  args: string;
}

/**
 * Every tick-size call in the source, with the object it was called on.
 *
 * ONE walk. Receiver and arguments are read at the same call site — a
 * previous version matched them with two separate regexes and zipped by
 * index, which desynchronises whenever one walker sees a call the other
 * skips, silently attributing a scope to the wrong Axes.
 *
 * Covers `set_tick_params` as well as `tick_params`: `Axis.set_tick_params`
 * is a documented matplotlib API and `ax.xaxis.set_tick_params(labelsize=)`
 * is ordinary code. Missing it discarded the user's explicit size and
 * reported an inherited one they had already fixed.
 *
 * An unbalanced call (a `tick_params(` inside a string, say) is SKIPPED,
 * not fatal: aborting the walk there threw away every later call and
 * reported a 6pt label as 19.9pt.
 */
function tickParamsCalls(src: string): TickCall[] {
  const re = /\b(?:set_)?tick_params\s*\(/g;
  const out: TickCall[] = [];
  let m: RegExpExecArray | null;

  while ((m = re.exec(src)) !== null) {
    // Forward: the argument list, balanced and quote-aware.
    let depth = 1;
    let quote: string | null = null;
    let args: string | null = null;
    for (let i = re.lastIndex; i < src.length; i++) {
      const ch = src[i]!;
      if (quote) {
        if (ch === '\\') i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '(') depth++;
      else if (ch === ')' && --depth === 0) {
        args = src.slice(re.lastIndex, i);
        re.lastIndex = i + 1;
        break;
      }
    }
    if (args === null) continue;

    // Backward: the receiver. Word characters and dots, plus whole
    // bracketed groups, so `axes[0].` and `fig.axes[1].` stay intact —
    // those are the idiom that actually produces several Axes, and a
    // scanner that stopped at `]` merged them into one.
    let j = m.index - 1;
    while (j >= 0) {
      const ch = src[j]!;
      if (/[\w.]/.test(ch)) { j--; continue; }
      if (ch === ']' || ch === ')') {
        const open = ch === ']' ? '[' : '(';
        let d = 1;
        j--;
        while (j >= 0 && d > 0) {
          if (src[j] === ch) d++;
          else if (src[j] === open) d--;
          j--;
        }
        continue;
      }
      break;
    }
    const receiver = src.slice(j + 1, m.index);

    // `ax.xaxis.set_tick_params(...)` scopes by the Axis it is called on.
    const axisM = receiver.match(/^(.*?)\.?([xy])axis\.$/);
    const axesText = axisM ? axisM[1]! : receiver;
    const alias = axesText === '' || axesText === 'plt.' || /^plt\.gca\(\)\.$/.test(axesText);

    out.push({
      axesKey: alias ? ALIAS_AXES : axesText,
      axisFromReceiver: axisM ? axisM[2]! : null,
      args,
    });
  }
  return out;
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
    // "base_size", not "font size": a theme() size can be present here.
    warnings.push('No base_size found — assuming ggplot2 default base_size = 11pt.');
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
  /**
   * ggplot2's default label size DERIVES FROM THE THEME, so it moves with
   * `base_size`. Measured in ggplot2 4.0.3 (on R 4.6.0 — an earlier
   * comment here cited 4.6.0 as the ggplot2 version, which was wrong):
   *
   *     base_size 11 ->  3.866 mm = 11 pt
   *     base_size 22 ->  7.732 mm = 22 pt
   *     base_size 40 -> 14.058 mm = 40 pt
   *     base_size  5 ->  1.757 mm =  5 pt
   *
   * Exactly base_size / .pt. A hardcoded 3.88 was right only at the
   * default base of 11: it understated a poster theme by 3.6x, and — the
   * dangerous direction — reported a genuinely unreadable 5 pt label as
   * a comfortable 11 pt.
   */
  const DEFAULT_LABEL_MM = baseSize / MM_TO_PT;

  // The old pattern hand-rolled ONE level of paren nesting, so the
  // commonest way of writing a label —
  // `geom_text(aes(label = paste0("n=", n)), size = 2)` — went unseen:
  // `paste0(` is a second level. It also treated every `annotate()` as
  // text, so `annotate("rect", ..., size = 1)`, where `size` is a border
  // WIDTH, produced a fabricated "in-panel text at 2.8pt".
  //
  // Now the balanced scanner finds each call and `topLevelArgs` reads the
  // size, which also means a `size` mapped inside `aes()` is correctly
  // ignored — that is a scale, not a fixed size.
  const inPanelFindings: Array<{ fn: string; mm: number; explicit: boolean }> = [];
  const TEXT_GEOMS = ['geom_text', 'geom_label', 'geom_text_repel', 'geom_label_repel'];
  // `annotate` and `stat_summary` both dispatch on a geom NAME, so the
  // same guard serves both: stat_summary(geom = "text", ...) draws real
  // in-panel text and was going unseen.
  for (const fn of [...TEXT_GEOMS, 'annotate', 'stat_summary']) {
    for (const args of extractAllCallArgs(src, fn)) {
      const top = topLevelArgs(args);
      if (!TEXT_GEOMS.includes(fn)) {
        // Only the text geoms. For "rect"/"segment"/"pointrange", `size`
        // is a line width in mm and has nothing to do with legibility.
        const geom = top.match(/(?:^\s*|[,(]\s*)(?:geom\s*=\s*)?['"](\w+)['"]/);
        if (!geom || (geom[1] !== 'text' && geom[1] !== 'label')) continue;
      }
      // `(?<![\w.])` so a DOTTED argument name is not read as the font
      // size. `label.size` and `segment.size` are line widths — ggplot2
      // deprecated the former in favour of `linewidth` — and \b matches
      // after the dot, so `geom_label(label.size = 0, size = 6)` was
      // reported as 0pt where it renders at 17.1pt. With the
      // report-the-smallest rule that fabricated zero also MASKED every
      // real label.
      const m = top.match(/(?<![\w.])size\s*=\s*([\d.]+)/);
      // `size.unit` (ggplot2 >= 3.5) says the number is not millimetres.
      const unit = top.match(/(?<![\w.])size\.unit\s*=\s*['"](\w+)['"]/);
      const raw = m ? parseFloat(m[1]!) : DEFAULT_LABEL_MM;
      const mm =
        !m || !unit ? raw
        : unit[1] === 'pt' ? raw / MM_TO_PT
        : unit[1] === 'cm' ? raw * 10
        : unit[1] === 'in' ? raw * 25.4
        : raw;
      inPanelFindings.push({ fn, mm, explicit: m !== null });
    }
  }
  // Deliberately unconditional: the warning's job is to say the table
  // below does NOT cover this text, which is true at any size. Gating it
  // on the readable floor would need the figure's `scale`, which lives in
  // computeReadability — worth moving if this proves noisy in use.
  if (inPanelFindings.length) {
    // Report the smallest: a checker must name the text that fails, not
    // the text that passes.
    const worst = inPanelFindings.reduce((a, b) => (b.mm < a.mm ? b : a));
    const pt = Math.round(worst.mm * MM_TO_PT * 10) / 10;
    const how = worst.explicit
      ? `sets in-panel text at size ${Math.round(worst.mm * 100) / 100}`
      : `draws in-panel text at the theme's default size (base_size ${baseSize})`;
    warnings.push(
      `${worst.fn}() ${how} (${pt}pt — ggplot sizes these in mm). In-panel labels are not theme elements, so they are not in the table below; check them yourself.`,
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
  const overrideViaBareSelector: Partial<Record<ElementKey, boolean>> = {};
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
        // EXACT here. Rounding at parse time fed the scorer a different
        // number from the one ggplot renders: a size of 13.950000000000001
        // against a 14pt floor rounded up to 14 and flipped a genuine
        // `warn` to `pass`, taking its advice row with it. Swept over
        // plausible base/rel/canvas combinations that was 411 status
        // flips, 397 of them in the optimistic direction — a checker
        // reporting text as readable when it is not. The display rounding
        // lives where the number is shown, below.
        raw.startsWith('rel')
          ? baseSize * parseFloat(raw.match(/[\d.]+/)![0]!)
          : parseFloat(raw),
      );
    }
    if (bySelector.size === 0) continue;

    overrides[key] = Math.min(...bySelector.values());
    overrideCoversAll[key] =
      !hasAxes || bySelector.has('') || (bySelector.has('.x') && bySelector.has('.y'));
    // Coverage and reachability are NOT the same. `.x` + `.y` covers
    // everything, but a bare parent cannot override either child.
    //
    // And the question is not "did the user write a bare selector" — it
    // is "is any CHILD explicitly sized". Writing both
    // `axis.text = element_text(size = 18)` and
    // `axis.text.x = element_text(size = 7)` is ordinary ggplot (shrink
    // a rotated x label under a sized parent); a bare selector then
    // still cannot move the x axis, because a parent never clears a
    // child that was set. Verified against ggplot2 4.0.3: the bare
    // advice left axis.text.x at 7pt while moving y to 14pt.
    overrideViaBareSelector[key] =
      !hasAxes || (!bySelector.has('.x') && !bySelector.has('.y'));
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
    overrideViaBareSelector,
    facetRows,
    facetCols,
    warnings,
  };
}

// ── Python Parser ────────────────────────────────────────────────────

/** A number as Python writes one (`8`, `5.6`, `.5`). */
// One reading per number: `\d*\.?\d+` backtracked over long digit runs
// (quadratic; step 9 review round 2, R2-09).
const PY_NUM = '(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
/** A Python name. */
const PY_NAME = '[A-Za-z_]\\w*';
/** One side of a size: a number or a name; nothing that could backtrack. */
const PY_SIDE = `(${PY_NUM}|${PY_NAME})`;
/** A width, height pair in brackets: `(w, h)` or `[w, h]`. */
const PY_PAIR = `[(\\[]\\s*${PY_SIDE}\\s*,\\s*${PY_SIDE}\\s*[)\\]]`;

type PyValue = number | [number, number];

/**
 * The top-level numeric assignments of a script, by name, in source order:
 * `w = 8`, `w, h, dpi = 8, 5.6, 300` (Postr's own generated code) and
 * `size = (8, 6)`. Read from code with strings and comments masked.
 */
function pyAssignments(masked: string): Map<string, Array<{ at: number; value: PyValue }>> {
  const byName = new Map<string, Array<{ at: number; value: PyValue }>>();
  const add = (name: string, at: number, value: PyValue) =>
    byName.set(name, [...(byName.get(name) ?? []), { at, value }]);
  const line = new RegExp(
    `^(${PY_NAME}(?:[ \\t]*,[ \\t]*${PY_NAME})*)[ \\t]*=[ \\t]*[(\\[]?[ \\t]*(${PY_NUM}(?:[ \\t]*,[ \\t]*${PY_NUM})*)[ \\t]*[)\\]]?[ \\t]*$`,
    'gm',
  );
  for (const m of masked.matchAll(line)) {
    const names = m[1]!.split(',').map((n) => n.trim());
    const values = m[2]!.split(',').map((v) => Number(v.trim()));
    if (!values.every(Number.isFinite)) continue;
    if (names.length === values.length) names.forEach((n, k) => add(n, m.index, values[k]!));
    else if (names.length === 1 && values.length === 2) add(names[0]!, m.index, [values[0]!, values[1]!]);
  }
  return byName;
}

/** The value `name` holds at offset `at`: its last assignment before it. */
function pyValueAt(
  names: Map<string, Array<{ at: number; value: PyValue }>>,
  name: string,
  at: number,
): PyValue | null {
  const before = (names.get(name) ?? []).filter((a) => a.at < at);
  return before.length ? before[before.length - 1]!.value : null;
}

/** A width and height from two sides (numbers or names), or one name holding a pair. */
function pySize(
  names: Map<string, Array<{ at: number; value: PyValue }>>,
  at: number,
  sides: Array<string | undefined>,
): { width: number; height: number } | null {
  const [a, b] = sides;
  if (a !== undefined && b === undefined) {
    const pair = pyValueAt(names, a, at);
    return Array.isArray(pair) ? { width: pair[0], height: pair[1] } : null;
  }
  const side = (t: string | undefined): number | null => {
    if (t === undefined) return null;
    if (new RegExp(`^${PY_NUM}$`).test(t)) return Number(t);
    const v = pyValueAt(names, t, at);
    return typeof v === 'number' ? v : null;
  };
  const width = side(a);
  const height = side(b);
  return width !== null && height !== null && width > 0 && height > 0 ? { width, height } : null;
}

/**
 * The canvas matplotlib draws the figure on, or null when the script does
 * not set one (matplotlib's default then applies). set_size_inches wins
 * (its last call); then the figsize the figure is made with (the first:
 * the checker reads one figure); then rcParams['figure.figsize'] or
 * plt.rc('figure', figsize=...) (the last setting). Calls and keywords are
 * found in code with strings masked; the rcParams key, a string, is read
 * with only comments masked.
 */
function pythonCanvas(code: string): { width: number; height: number } | null {
  const masked = maskCodeForRewrite(code);
  const text = maskComments(code);
  const names = pyAssignments(masked);
  const found = (source: string, re: RegExp) =>
    [...source.matchAll(re)].flatMap((m) => {
      const size = pySize(names, m.index, m.slice(1).filter((g) => g !== undefined));
      return size ? [{ at: m.index, size }] : [];
    });

  // set_size_inches(w, h), ((w, h)), (w=..., h=...), (size), with more
  // arguments after or not.
  const resized = found(masked, new RegExp(
    `\\.set_size_inches\\s*\\(\\s*(?:(?:w\\s*=\\s*)?[(\\[]?\\s*${PY_SIDE}\\s*,\\s*(?:h\\s*=\\s*)?${PY_SIDE}\\s*[)\\]]?|(${PY_NAME})\\s*)[,)]`, 'g',
  ));
  if (resized.length) return resized[resized.length - 1]!.size;

  // rc('figure', figsize=...) sets the default, like rcParams: its figsize
  // is not the figure's own.
  const rcCalls = [...text.matchAll(/\brc\s*\(\s*['"]figure['"]\s*,[^()]*/g)].map((m) => [m.index, m.index + m[0].length] as const);
  const inRcCall = (at: number) => rcCalls.some(([from, to]) => at >= from && at < to);
  const made = found(masked, new RegExp(`\\bfigsize\\s*=\\s*(?:${PY_PAIR}|(${PY_NAME})\\b)`, 'g'))
    .filter((f) => !inRcCall(f.at));
  if (made.length) return made[0]!.size;

  const rc = [
    ...found(text, new RegExp(`['"]figure\\.figsize['"]\\s*(?:\\]\\s*=|:)\\s*(?:${PY_PAIR}|${PY_SIDE}\\s*,\\s*${PY_SIDE}|(${PY_NAME})\\b)`, 'g')),
    ...found(masked, new RegExp(`\\bfigsize\\s*=\\s*(?:${PY_PAIR}|(${PY_NAME})\\b)`, 'g')).filter((f) => inRcCall(f.at)),
  ].sort((x, y) => x.at - y.at);
  return rc.length ? rc[rc.length - 1]!.size : null;
}

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
    // "font.size", not "font size": a fontsize= argument can be present.
    warnings.push('No font.size found — assuming matplotlib default font.size = 10pt.');
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

  // tick_params covers both axes ONLY when it is not scoped to one.
  // `ax.tick_params(axis='x', labelsize=20)` leaves the y tick labels
  // inheriting from font.size, and claiming full coverage for it turned
  // a correct fail into a silent PASS — the same defect this parser
  // already fixes for set_xlabel/set_ylabel, one call along.
  //
  // Every call is collected, not just the first: scoping x and y in two
  // separate calls is the normal way to write this, and together they do
  // cover everything.
  // The WHOLE argument list of each call, not a regex that stops at the
  // captured number. A `${ARGS}labelsize=([\\d.]+)` match ends AT the
  // size, so it can only see arguments written BEFORE it — and
  // `tick_params(labelsize=20, axis='x')` then read as unscoped and
  // false-passed exactly like the bug this replaced. Keyword arguments
  // have no required order.
  // Scopes per AXES, from ONE walk. Receiver and arguments are read at
  // the same call site instead of zipped from two regexes, which could
  // desynchronise and attribute a scope to the wrong Axes.
  const tickSizes: number[] = [];
  const scopesByAxes = new Map<string, Set<string>>();
  for (const call of tickParamsCalls(src)) {
    const size = topLevelArgs(call.args).match(/\blabelsize\s*=\s*([\d.]+)/);
    if (!size) continue;
    tickSizes.push(parseFloat(size[1]!));
    const axisArg = topLevelArgs(call.args).match(/\baxis\s*=\s*['"](x|y|both)['"]/);
    // `ax.xaxis.set_tick_params(...)` scopes by the Axis object it is
    // called on; `axis=` only exists on the Axes-level call.
    const scope = call.axisFromReceiver ?? (axisArg ? axisArg[1]! : 'both');
    const set = scopesByAxes.get(call.axesKey) ?? new Set<string>();
    set.add(scope);
    scopesByAxes.set(call.axesKey, set);
  }

  // `plt.` / `plt.gca().` / a bare call all mean "the current Axes". When
  // exactly one explicit Axes is named in the script, those alias calls
  // are that Axes — verified in matplotlib 3.10.8, where
  // `ax.tick_params(axis='x')` + `plt.tick_params(axis='y')` gives 20/20
  // on the same subplot. With two or more explicit receivers the alias is
  // ambiguous, so it stays its own bucket and the answer stays
  // conservative.
  const explicit = [...scopesByAxes.keys()].filter((k) => k !== ALIAS_AXES);
  if (explicit.length === 1 && scopesByAxes.has(ALIAS_AXES)) {
    const target = scopesByAxes.get(explicit[0]!)!;
    for (const sc of scopesByAxes.get(ALIAS_AXES)!) target.add(sc);
    scopesByAxes.delete(ALIAS_AXES);
  }
  if (tickSizes.length) {
    overrides.axisText = Math.min(...tickSizes);
    overrideCoversAll.axisText = [...scopesByAxes.values()].some(
      (scopes) => scopes.has('both') || (scopes.has('x') && scopes.has('y')),
    );
  }
  if (title) {
    overrides.plotTitle = parseFloat(title[1]!);
    overrideCoversAll.plotTitle = true;
  }

  // The canvas, as matplotlib sizes it. Unlike R, where ggsave() with no
  // size uses whatever device is open, matplotlib's rule is fixed: the
  // figure is drawn at rcParams['figure.figsize'] (6.4 × 4.8 in unless the
  // script sets it) or the figsize it was made with, and set_size_inches
  // overrides both. Taking the print size as the canvas when the script
  // had no literal figsize put the scale at 1 against a real 0.86–3.33
  // (fix 13, claim CANVAS, 16 of 16 runs).
  const canvas = pythonCanvas(code);
  const width = canvas?.width ?? PY_DEFAULTS.width;
  const height = canvas?.height ?? PY_DEFAULTS.height;
  if (!canvas) {
    warnings.push('No canvas size found — assuming matplotlib default 6.4"×4.8".');
  }

  // The checker's own fix: `_POSTR_NEED = {'axisTitle': 17}` and each save
  // rewritten to `_postr_raise_text(fig, _POSTR_NEED).savefig(...)` raise
  // every drawn text of each named class to at least that size at the save, so nothing earlier overrides it and it never lowers
  // one. Without reading it the re-check showed the same failures as the
  // first check (fix 13, W1: 42 of 42 runs identical).
  // The smallest text of the class before the raise: a size the user set
  // on one axis only leaves the other axis at the inherited size (step 9
  // review, S9-06: reading the set axis for the class passed 2 rows falsely).
  const raisedByFix: Partial<Record<ElementKey, boolean>> = {};
  for (const [key, pt] of Object.entries(raisedByOwnFix(code))) {
    const spec = PY_ELEMENTS.find((e) => e.key === key);
    if (!spec) continue;
    const k = key as ElementKey;
    const inherited = baseSize * spec.relMultiplier;
    const own = overrides[k];
    const before = own === undefined ? inherited : overrideCoversAll[k] ? own : Math.min(own, inherited);
    if (pt > before) raisedByFix[k] = true;
    overrides[k] = Math.max(before, pt);
    overrideCoversAll[k] = true;
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
    raisedByFix,
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
        // One decimal, the precision the whole panel speaks in. The table
        // above already rounds for display; this row did not, so one
        // element showed '12.1pt' and '12.100000000000001pt' on the same
        // screen (D10).
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
 * Python emits the sizes each listed element needs, by class, as a dict
 * literal (`{'axisTitle': 16, ...}`); applyFontFixes hands it to a helper
 * that raises the drawn text just before the figure is saved. An
 * rcParams block, the earlier form, is overridden by any `fontsize=` in a
 * plotting call, by settings read when the figure or Axes is made, and by
 * seaborn's theme resets, and it could lower text the user had set larger
 * (fix 13: 44 of 129 corrected scripts left a listed element too small,
 * against 4 at save, all of those a separate canvas cause).
 */
function buildFontSnippet(language: 'r' | 'python', fixes: FontFix[]): string | null {
  if (language === 'python') {
    const need = fixes.filter((f) => PY_RAISED.has(f.key)).map((f) => `'${f.key}': ${f.neededPt}`);
    return need.length ? `{${need.join(', ')}}` : null;
  }
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
  return null;
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
 * Python: a helper, `_postr_raise_text`, goes at the top of the script
 * (after a cell magic, a module docstring and `from __future__` imports),
 * and each save and pyplot show is rewritten to go through it
 * (`fig.savefig(` becomes `_postr_raise_text(fig, _POSTR_NEED).savefig(`;
 * with neither, it is called at the end): it raises each drawn text of a
 * listed class to at least its needed size and never lowers one
 * (applyPythonRaise).
 *
 * Returns the code unchanged when there is nothing to apply.
 */
export function applyFontFixes(
  code: string,
  language: 'r' | 'python',
  fontSnippet: string | null,
): string {
  if (!fontSnippet) return code;

  // Every insertion point is located in the MASKED copy — same length as
  // the original, comments blanked — so a commented-out call can never
  // attract the edit and the offsets stay valid in `code` itself.
  const masked = maskComments(code);
  const maskedLines = masked.split('\n');

  if (language === 'r') {
    const themeEnd = lastCallEnd(masked, /theme_\w+\s*\(/g);
    if (themeEnd !== null) {
      return code.slice(0, themeEnd) + ' +\n  ' + fontSnippet + code.slice(themeEnd);
    }
    // No theme_*() to hang it off. Attach to the end of the plot
    // expression instead: the last line carrying CODE before ggsave(), or
    // the end of the script when there is no ggsave().
    const lines = code.split('\n');
    let insertAfter = lines.length - 1;
    const ggsaveAt = maskedLines.findIndex((l) => /\bggsave\s*\(/.test(l));
    if (ggsaveAt > 0) insertAfter = ggsaveAt - 1;
    // A comment-only line masks to blanks, so this skips those too — a
    // `+` appended to one would be dead text inside the comment above it.
    while (insertAfter > 0 && maskedLines[insertAfter]!.trim() === '') insertAfter--;

    // Split the chosen line at the end of its CODE, so a trailing comment
    // stays a comment and the `+` lands in the expression. R is happy with
    // `expr +  # note` followed by the continuation on the next line;
    // `expr  # note +` is just a longer comment.
    const codeEnd = maskedLines[insertAfter]!.trimEnd().length;
    const head = lines[insertAfter]!.slice(0, codeEnd);
    const trailing = lines[insertAfter]!.slice(codeEnd);
    lines[insertAfter] = head + ' +' + trailing + '\n  ' + fontSnippet;
    return lines.join('\n');
  }

  return applyPythonRaise(code, fontSnippet);
}

/** The element classes the Python fix can raise (Strip text is ggplot's). */
const PY_RAISED = new Set<ElementKey>(['plotTitle', 'axisTitle', 'axisText', 'legendText', 'caption']);

/**
 * A figure reaching a file or a notebook without `Figure.savefig`, which the
 * fix wraps. Any `display(` counts: a figure reaches it under any name
 * (`display(f)`, `display(ax.get_figure())`, `display(df, fig)`), so
 * `display(df)` withholds the credit too, a false red kept rather than a
 * false green (round 6, R6C-01; round 5's R5-09 narrowed it and was reversed).
 */
const PY_BYPASSES_SAVEFIG = /\.print_(?:figure|png|pdf|svgz?|e?ps|pgf|jpe?g|tiff?|webp|raw|rgba|to_buffer)\b|\b(?:buffer_rgba|tostring_rgb|tostring_argb)\s*\(|\bdisplay\s*\(/;

const PY_HELPER_BEGIN = '# Postr: raise text that prints too small (begin)';
const PY_HELPER_END = '# Postr: raise text that prints too small (end)';

/**
 * The block the Python fix puts at the top of the script: the sizes each
 * listed class needs, a helper that raises the drawn text of a figure to
 * them, never lowering one, and `_postr_install()`, which wraps matplotlib's
 * `Figure` once so that:
 * - as each figure is made, the sizes rcParams set (titles, axis labels,
 *   tick labels, legends and their titles) are raised, so the text is born at
 *   its size and the script's own layout, and a library's (seaborn's legend
 *   placed outside), is computed with it (round 4, R4-04). What Postr set is
 *   put back to the script's own value before each figure and at the end of
 *   the script, so a size the script sets later (a bigger font.size, a
 *   relative "large") is resolved again, never capped (round 5, R5-01);
 * - as each figure is saved, however the save is written (`fig.savefig`,
 *   `plt.savefig`, `PdfPages.savefig`, a saved reference to the method),
 *   every listed text is raised: sizes the script set itself included. A
 *   figure that reaches a file another way (its canvas's `print_*`) is not;
 *   the re-check withholds its credit there (R4-05).
 *
 * The figure's own layout (its last `tight_layout(...)`, with the script's
 * arguments, and a `subplots_adjust(...)` made after it) is run again when a
 * save grew a text, or when the layout is out of date: the figure resized, or
 * titles, labels or legends added since (R3-02, R5-03). Not when the script
 * moved an Axes off its place in the grid (by hand, or a colorbar shared by
 * several Axes) or changed the layout engine: the replay pushed a hand-placed
 * panel back and crashed after a switch to constrained layout (R4-01, R4-02).
 * A colorbar, a twin Axes, an Axes deleted and added again, or an unpickled
 * figure no longer stop it (R5-02). The record holds step names, not
 * functions, so a figure still pickles (R4-03). The wrap's state lives on the
 * Figure class: running the block again gives it that script's sizes without
 * unwrapping a library that wrapped after it (R4-08, R5-10). A failure is a
 * warning, never a failed save.
 *
 * It imports matplotlib when the block runs, but nothing from pyplot until a
 * figure is saved or shown, so it chooses no backend. Legend titles follow
 * legend text; fig.supxlabel/supylabel count as axis titles; captions
 * (figure texts) are raised; subfigures, inset Axes, minor tick labels and 3D
 * axes count. Six matplotlib names it reads are private (`_pylab_helpers`,
 * `_supxlabel`, `_supylabel`, `_suptitle`, `_left_title`, `_right_title`);
 * the last five through getattr, so a version without them only loses those
 * texts.
 */
function pyHelperBlock(need: string): string {
  return [
    PY_HELPER_BEGIN,
    `_POSTR_NEED = ${need}`,
    '',
    '',
    'def _postr_raise_text(target, need, every=False, end=False):',
    '    """Raise each listed text of a figure about to be saved or shown to at',
    '    least its size in points, never lowering one. The figure\'s own layout is',
    '    run again when a text grew or the layout is out of date, unless the',
    '    script moved an Axes off its place in the grid or changed the layout',
    '    engine. Returns `target` (pyplot for None), or None at `end`: the script',
    '    is over, and rcParams get the script\'s own values back. It never stops a',
    '    save: a failure is a warning, and the figure is saved as the script drew',
    '    it, even under warnings-as-errors."""',
    '    try:',
    '        from matplotlib import _pylab_helpers',
    '        from matplotlib.figure import Figure',
    '        if every:',
    '            figs = [m.canvas.figure for m in _pylab_helpers.Gcf.get_all_fig_managers()]',
    '        elif isinstance(target, Figure):',
    '            figs = [target]',
    '        else:',
    '            import matplotlib.pyplot as plt',
    '            figs = [plt.gcf()] if plt.get_fignums() else []',
    '        grew = []',
    '',
    '        def up(texts, key):',
    '            for t in texts:',
    '                if key in need and t is not None and t.get_text().strip() and t.get_fontsize() < need[key]:',
    '                    t.set_fontsize(need[key])',
    '                    grew.append(t)',
    '',
    '        def parts(fig):',
    '            yield fig',
    '            for sub in getattr(fig, "subfigs", []):',
    '                yield from parts(sub)',
    '',
    '        def in_place(fig):',
    '            for ax in fig.axes:',
    '                spec = ax.get_subplotspec() if hasattr(ax, "get_subplotspec") else None',
    '                if spec is not None and any(abs(a - b) > 1e-6 for a, b in zip(spec.get_position(ax.figure).bounds, ax.get_position(original=True).bounds)):',
    '                    return False',
    '            return True',
    '',
    '        for fig in figs:',
    '            before = len(grew)',
    '            axes, legends = [], []',
    '            for part in parts(fig):',
    '                axes += [ax for ax in part.axes if ax not in axes]',
    '                legends += list(part.legends)',
    '                sup_labels = [getattr(part, "_supxlabel", None), getattr(part, "_supylabel", None)]',
    '                up(sup_labels, "axisTitle")',
    '                own = sup_labels + [getattr(part, "_suptitle", None)]',
    '                up([t for t in part.texts if not any(t is o for o in own)], "caption")',
    '            for ax in axes:',
    '                axes += [child for child in getattr(ax, "child_axes", []) if child not in axes]',
    '            for ax in axes:',
    '                up([ax.title, getattr(ax, "_left_title", None), getattr(ax, "_right_title", None)], "plotTitle")',
    '                named = [(n, a) for n, a in (("x", ax.xaxis), ("y", ax.yaxis), ("z", getattr(ax, "zaxis", None))) if a is not None]',
    '                up([a.label for n, a in named], "axisTitle")',
    '                for name, axis in named:',
    '                    ticks = [t for t in axis.get_ticklabels(which="both") if t.get_text().strip()]',
    '                    if "axisText" in need and ticks and max(t.get_fontsize() for t in ticks) < need["axisText"]:',
    '                        ax.tick_params(axis=name, which="both", labelsize=need["axisText"])',
    '                        grew.append(axis)',
    '                    elif ticks:',
    '                        up(ticks, "axisText")',
    '                    elif "axisText" in need and axis.majorTicks and axis.majorTicks[0].label1.get_fontsize() < need["axisText"]:',
    '                        # Labels hidden (a shared axis): its size still spaces the',
    '                        # shared ticks, so small ones crowded the raised labels (R6M-04).',
    '                        ax.tick_params(axis=name, which="both", labelsize=need["axisText"])',
    '                    if axis.majorTicks:',
    '                        # The size a label was born at from rcParams stays the',
    '                        # axis\'s own once rcParams are given back, or the locator',
    '                        # spaces its ticks for the smaller one (R6M-03).',
    '                        size = axis.majorTicks[0].label1.get_fontsize()',
    '                        for kw in (getattr(axis, "_major_tick_kw", None), getattr(axis, "_minor_tick_kw", None)):',
    '                            if kw is not None and "labelsize" not in kw:',
    '                                kw["labelsize"] = size',
    '                if ax.get_legend() is not None:',
    '                    legends.append(ax.get_legend())',
    '            for legend in legends:',
    '                up(legend.get_texts(), "legendText")',
    '                up([legend.get_title()], "legendText")',
    '            record = getattr(fig, "_postr_layout", None)',
    '            steps = getattr(Figure, "_postr_state", {}).get("steps")',
    '            if record and steps:',
    '                now = _postr_layout_state(fig)',
    '                stale = now["size"] != record["size"] or now["texts"] != record["texts"]',
    '                if (len(grew) > before or stale) and now["engine"] == record["engine"] and in_place(fig):',
    '                    import warnings',
    '                    fig._postr_replaying = True',
    '                    try:',
    '                        with warnings.catch_warnings():',
    '                            # The script\'s own layout skips an inset Axes or one added',
    '                            # after it, or cannot fit the grown text and leaves the',
    '                            # layout as it was; saying so is not the script\'s warning',
    '                            # (round 6: R6M-05, a 3D Axes).',
    '                            warnings.filterwarnings("ignore", message="This figure includes Axes that are not compatible")',
    '                            warnings.filterwarnings("ignore", message="Tight layout not applied")',
    '                            for name, args, kwargs in record["steps"]:',
    '                                steps[name](fig, *args, **kwargs)',
    '                    finally:',
    '                        fig._postr_replaying = False',
    '                    record.update(_postr_layout_state(fig))',
    '    except Exception as error:',
    '        import warnings',
    '        try:',
    '            warnings.warn(f"Postr could not raise the text ({type(error).__name__}: {error}); it keeps its sizes.")',
    '        except Warning:',
    '            pass',
    '    if end:',
    '        # Even when raising the text failed (round 6, R6C-12).',
    '        try:',
    '            from matplotlib.figure import Figure',
    '            _postr_born_at_size({})',
    '            Figure._postr_state["rc"].clear()',
    '        except Exception:',
    '            pass',
    '        return None',
    '    if target is None:',
    '        import matplotlib.pyplot as plt',
    '        return plt',
    '    return target',
    '',
    '',
    'def _postr_born_at_size(need):',
    '    """Raise the sizes rcParams gives listed text to `need`, so a figure made',
    '    now lays its text out at its size, never lowering one. What Postr set is',
    '    put back to the script\'s own value first, so a size the script sets later',
    '    (a relative one, like "large", or a bigger font.size) is resolved again.',
    '    Postr knows its own value by identity, not by equal numbers: a context',
    '    (rc_context, style.context) puts back the very object it saved, and a',
    '    script setting the same number itself makes a new one (round 6, R6C-02)."""',
    '    from matplotlib import rcParams',
    '    from matplotlib.figure import Figure',
    '    from matplotlib.font_manager import FontProperties',
    '    keys = {"plotTitle": ["axes.titlesize"], "axisTitle": ["axes.labelsize"],',
    '            "axisText": ["xtick.labelsize", "ytick.labelsize"],',
    '            "legendText": ["legend.fontsize", "legend.title_fontsize"]}',
    '    mine = Figure._postr_state.setdefault("rc", {})',
    '    for key, names in keys.items():',
    '        for name in names:',
    '            now = dict.__getitem__(rcParams, name)',
    '            for value, theirs in mine.get(name, []):',
    '                if now is value:',
    '                    rcParams[name] = theirs',
    '                    break',
    '            if key in need and FontProperties(size=rcParams[name]).get_size_in_points() < need[key]:',
    '                value = float(need[key])',
    '                mine.setdefault(name, []).append((value, rcParams[name]))',
    '                rcParams[name] = value',
    '',
    '',
    'def _postr_layout_state(fig):',
    '    """The figure\'s layout engine, its size, and how many titles, labels,',
    '    legend texts and figure texts it has."""',
    '    engine = getattr(fig, "get_layout_engine", lambda: None)()',
    '    texts = [t for t in fig.texts]',
    '    for ax in fig.axes:',
    '        texts += [ax.title, ax.xaxis.label, ax.yaxis.label]',
    '        if ax.get_legend() is not None:',
    '            texts += ax.get_legend().get_texts()',
    '    for legend in fig.legends:',
    '        texts += legend.get_texts()',
    '    return {"engine": type(engine).__name__, "size": [round(v, 4) for v in fig.get_size_inches()],',
    '            "texts": sum(1 for t in texts if t.get_text().strip())}',
    '',
    '',
    'def _postr_install():',
    '    """Make every figure raise its listed text: the sizes rcParams set, as',
    '    the figure is made, so the script lays it out with them; every text, as',
    '    it is saved. Record each figure\'s own layout (its last tight_layout and a',
    '    subplots_adjust after it), to run again if a text still grew or the',
    '    layout is out of date. The wrap is made once; running this again (a',
    '    second fixed script in the same Python) gives it this script\'s sizes."""',
    '    from matplotlib.figure import Figure',
    '    state = getattr(Figure, "_postr_state", None)',
    '    if state is None:',
    '        init, save, tight, adjust = Figure.__init__, Figure.savefig, Figure.tight_layout, Figure.subplots_adjust',
    '        state = {"steps": {"tight_layout": tight, "subplots_adjust": adjust}, "rc": {}}',
    '',
    '        def __init__(self, *args, **kwargs):',
    '            try:',
    '                Figure._postr_state["born"](Figure._postr_state["need"])',
    '            except Exception as error:',
    '                import warnings',
    '                try:',
    '                    warnings.warn(f"Postr could not raise the text sizes ({type(error).__name__}: {error}).")',
    '                except Warning:',
    '                    pass',
    '            init(self, *args, **kwargs)',
    '',
    '        def tight_layout(self, *args, **kwargs):',
    '            result = tight(self, *args, **kwargs)',
    '            if not getattr(self, "_postr_replaying", False):',
    '                self._postr_layout = {"steps": [("tight_layout", args, kwargs)], **Figure._postr_state["state"](self)}',
    '            return result',
    '',
    '        def subplots_adjust(self, *args, **kwargs):',
    '            result = adjust(self, *args, **kwargs)',
    '            record = getattr(self, "_postr_layout", None)',
    '            if record and not getattr(self, "_postr_replaying", False):',
    '                # It lays out no text: a text added or changed since the',
    '                # tight_layout still makes the layout out of date (round 7, k11).',
    '                record["steps"].append(("subplots_adjust", args, kwargs))',
    '            return result',
    '',
    '        def savefig(self, *args, **kwargs):',
    '            Figure._postr_state["raise"](self, Figure._postr_state["need"])',
    '            return save(self, *args, **kwargs)',
    '',
    '        Figure._postr_state = state',
    '        Figure.__init__, Figure.savefig, Figure.tight_layout, Figure.subplots_adjust = __init__, savefig, tight_layout, subplots_adjust',
    '    state.update(need=_POSTR_NEED, born=_postr_born_at_size, state=_postr_layout_state)',
    '    state["raise"] = _postr_raise_text',
    '',
    '',
    '_postr_install()',
    PY_HELPER_END,
  ].join('\n');
}

/** Index of the bracket that closes the one opening at `open`, in masked code; -1 if none. */
function closingBracket(masked: string, open: number): number {
  let depth = 0;
  for (let k = open; k < masked.length; k += 1) {
    const ch = masked[k]!;
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) return k;
    }
  }
  return -1;
}

/** Index of the bracket that opens the one closing at `close`, in masked code; -1 if none. */
function openingBracket(masked: string, close: number): number {
  let depth = 0;
  for (let k = close; k >= 0; k -= 1) {
    const ch = masked[k]!;
    if (ch === ')' || ch === ']' || ch === '}') depth += 1;
    else if (ch === '(' || ch === '[' || ch === '{') {
      depth -= 1;
      if (depth === 0) return k;
    }
  }
  return -1;
}

/**
 * Every bracket's partner in masked code, found in one pass: `close[k]` for
 * an opening bracket at `k`, `open[k]` for a closing one; -1 for none. A
 * script of many unclosed calls made a scan per call quadratic (R2-09).
 */
function bracketIndex(masked: string): { close: Int32Array; open: Int32Array } {
  const close = new Int32Array(masked.length).fill(-1);
  const open = new Int32Array(masked.length).fill(-1);
  const stack: number[] = [];
  for (let k = 0; k < masked.length; k += 1) {
    const ch = masked[k]!;
    if (ch === '(' || ch === '[' || ch === '{') stack.push(k);
    else if ((ch === ')' || ch === ']' || ch === '}') && stack.length) {
      const o = stack.pop()!;
      close[o] = k;
      open[k] = o;
    }
  }
  return { close, open };
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

/**
 * The last index at or before `k` that is not space in Python's sense:
 * spaces and tabs, a backslash line continuation, and a line break inside
 * brackets are skipped (`fig \` + newline + `.savefig(`). -1 at the start.
 */
function skipSpaceBack(masked: string, k: number, depth: Int32Array): number {
  let at = k;
  for (;;) {
    while (at >= 0 && /[ \t\r]/.test(masked[at]!)) at -= 1;
    if (at < 0 || masked[at] !== '\n') return at;
    let prev = at - 1;
    if (masked[prev] === '\r') prev -= 1;
    if (masked[prev] === '\\') at = prev - 1;
    else if (depth[at]! > 0) at -= 1;
    else return at;
  }
}

/** Index of the first comma at the top level of the brackets opening at `open` and closing at `close`; -1 if none. */
function firstTopLevelComma(masked: string, open: number, close: number): number {
  let depth = 0;
  for (let k = open + 1; k < close; k += 1) {
    const ch = masked[k]!;
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) return k;
  }
  return -1;
}

/**
 * Where a pyplot receiver of `.show` starts, given the index of its dot: one
 * name or two dotted names (`plt`, `matplotlib.pyplot`), which may run over a
 * line continuation or a line break in brackets. -1 for anything longer, a
 * call or a subscript, none of which is a pyplot alias: walking a whole chain
 * back from every `.show` of `x.show.show…` was quadratic (round 3, R3-07).
 */
function pyplotReceiverStart(masked: string, dot: number, depth: Int32Array): number {
  let k = skipSpaceBack(masked, dot - 1, depth);
  for (let names = 0; names < 2; names += 1) {
    const end = k;
    while (k >= 0 && /\w/.test(masked[k]!)) k -= 1;
    if (k === end || /\d/.test(masked[k + 1]!)) return -1;
    const before = skipSpaceBack(masked, k, depth);
    if (before < 0 || masked[before] !== '.') return k + 1;
    k = skipSpaceBack(masked, before - 1, depth);
  }
  return -1;
}

/**
 * A pyplot show in the script: `plt.show(` on a name bound to
 * matplotlib.pyplot, a bare `show(` imported from it by name, or `plt.show`
 * handed on uncalled (`display = plt.show`; round 3, n20). `from`..`to` is
 * the receiver and its dot (empty for a bare call); `nameEnd` the end of
 * `show`.
 */
interface PyShowSite {
  from: number;
  to: number;
  nameEnd: number;
  receiver: string | null;
  called: boolean;
}

function pyShowSites(source: string, masked: string): PyShowSite[] {
  const depth = bracketDepths(masked);
  const aliases = pyplotAliases(masked);
  // `from matplotlib.pyplot import show`, or `import *` (round 4, R4-07),
  // pylab's too (round 6, R6P-03), unless the script defines or assigns a
  // show of its own anywhere, a method aside (round 5, R5-08; round 6,
  // R6C-04: one inside a function or an `if` was replaced).
  const ownShow = /^[ \t]*(?:def[ \t]+show[ \t]*\((?![ \t]*(?:self|cls)\b)|show[ \t]*=(?!=))/m.test(masked);
  const bareShow = !ownShow
    && /^[ \t]*from[ \t]+(?:matplotlib\.pyplot|matplotlib\.pylab|pylab)[ \t]+import[ \t]+(?:\*|[^\n]*\bshow\b)/m.test(masked);
  const sites: PyShowSite[] = [];
  for (const m of masked.matchAll(/(?<!\bdef[ \t]+)(?<![\w])show\b/g)) {
    const nameEnd = m.index + 4;
    let n = nameEnd;
    while (n < masked.length && /[ \t]/.test(masked[n]!)) n += 1;
    // `plt.show = ...` replaces it: not a show.
    if (masked[n] === '=' && masked[n + 1] !== '=') continue;
    const called = masked[n] === '(';
    const dot = skipSpaceBack(masked, m.index - 1, depth);
    if (dot >= 0 && masked[dot] === '.') {
      const start = pyplotReceiverStart(masked, dot, depth);
      if (start < 0) continue;
      const receiver = source.slice(start, skipSpaceBack(masked, dot - 1, depth) + 1);
      if (!aliases.has(receiver.replace(/\s+/g, ''))) continue;
      // `del plt.show` names the attribute itself.
      if (!called && /\bdel[ \t]+$/.test(masked.slice(Math.max(0, start - 8), start))) continue;
      sites.push({ from: start, to: dot + 1, nameEnd, receiver, called });
    } else if (called && bareShow) {
      sites.push({ from: m.index, to: m.index, nameEnd, receiver: null, called });
    }
  }
  return sites;
}

/**
 * Where an earlier fix's block is, as [first line, last line]: found by its
 * marker comments, and by its `_POSTR_NEED` line and helper def when a
 * marker was edited or deleted (a second fix otherwise read the def as a
 * call and cut it to `def `; step 9 review round 2, R2-03). Null if none.
 */
function earlierBlock(lines: string[], masked: string[]): [number, number] | null {
  const begin = lines.findIndex((l) => l.trim() === PY_HELPER_BEGIN);
  const end = lines.findIndex((l) => l.trim() === PY_HELPER_END);
  const needAt = masked.findIndex((l) => /^_POSTR_NEED\s*=/.test(l));
  const defs = [/^def[ \t]+_postr_raise_text\b/, /^def[ \t]+_postr_install\b/].map((re) => masked.findIndex((l) => re.test(l)));
  const callAt = masked.findIndex((l) => /^_postr_install\s*\(\s*\)/.test(l));
  const starts = [begin, needAt, ...defs, callAt].filter((k) => k >= 0);
  if (!starts.length) return null;
  const from = Math.min(...starts);
  if (end > from) return [from, end];
  let to = Math.max(...starts);
  for (const defAt of defs) {
    if (defAt < 0) continue;
    for (let k = defAt + 1; k < lines.length; k += 1) {
      if (lines[k]!.trim() === '') continue;
      if (!/^[ \t]/.test(lines[k]!)) break;
      to = Math.max(to, k);
    }
  }
  return [from, to];
}

/**
 * Undo an earlier fix: its block, each `_postr_raise_text(x, ...).` back to
 * `x.`, and its call at the end of the script. A show handed on uncalled is
 * left as `(lambda *a, **k: x.show(*a, **k))`, a called show the new fix
 * routes again, back to the same text.
 */
function withoutEarlierFix(code: string): string {
  const lines = code.split('\n');
  const block = earlierBlock(lines, maskCodeForRewrite(code).split('\n'));
  let out = code;
  if (block) {
    let after = block[1] + 1;
    while (after < lines.length && lines[after]!.trim() === '') after += 1;
    out = [...lines.slice(0, block[0]), ...lines.slice(after)].join('\n');
  }
  // The receiver is the first argument: up to the first comma at its own
  // level (`sns.catplot(data=df, x="a")` keeps its commas; R2-02).
  const receiverOf = (masked: string, open: number, close: number) => {
    const comma = firstTopLevelComma(masked, open, close);
    return out.slice(open + 1, comma < 0 ? close : comma).trim();
  };
  // Edits are collected and applied in one pass: one copy of the script per
  // edit was quadratic on a script of many calls (R2-09).
  const apply = (text: string, edits: Array<{ from: number; to: number; text: string }>) => {
    const parts: string[] = [];
    let at = 0;
    for (const e of edits.sort((a, b) => a.from - b.from)) {
      if (e.from < at) continue;
      parts.push(text.slice(at, e.from), e.text);
      at = e.to;
    }
    parts.push(text.slice(at));
    return parts.join('');
  };
  const masked = maskCodeForRewrite(out);
  const brackets = bracketIndex(masked);
  const calls: Array<{ from: number; to: number; text: string }> = [];
  for (const m of masked.matchAll(/(?<![\w.])(?<!\bdef[ \t]+)_postr_raise_text\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const close = brackets.close[open]!;
    // Never closed: not a call of the fix's; left as it is.
    if (close < 0) continue;
    const next = masked.slice(close + 1).search(/\S/);
    const dot = next < 0 ? -1 : close + 1 + next;
    if (dot < 0 || masked[dot] !== '.') {
      // A statement of its own (the call at the end of the script): the call
      // and a `;` after it go, never code or a comment after them on the line.
      const semicolon = masked.slice(close + 1).match(/^[ \t]*;[ \t]*/);
      calls.push({ from: m.index, to: close + 1 + (semicolon?.[0].length ?? 0), text: '' });
      continue;
    }
    const receiver = receiverOf(masked, open, close);
    calls.push({ from: m.index, to: dot + 1, text: receiver === 'None' ? '' : `${receiver}.` });
  }
  return calls.length ? apply(out, calls) : out;
}

/** The line to put the block on: after leading comments, a module docstring and `from __future__` imports. */
function helperLine(code: string): number {
  const lines = code.split('\n');
  const masked = maskCodeForRewrite(code).split('\n');
  const skipBlank = (k: number) => {
    let at = k;
    while (at < lines.length && masked[at]!.trim() === '') at += 1;
    return at;
  };
  let at = skipBlank(0);
  // A notebook cell's `%%` magic must stay its first line (R2-07).
  if (/^%%/.test(lines[at] ?? '')) at = skipBlank(at + 1);
  const doc = lines[at]?.match(/^[rRuUbB]*("""|'''|"|')/);
  if (doc) {
    const rest = lines.slice(at).join('\n');
    const close = rest.indexOf(doc[1]!, doc[0].length);
    if (close >= 0) at = skipBlank(at + rest.slice(0, close).split('\n').length);
  }
  while (at < lines.length && /^from\s+__future__\s+import\b/.test(masked[at]!)) {
    let depth = 0;
    let k = at;
    for (; k < lines.length; k += 1) {
      for (const ch of masked[k]!) depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
      if (depth <= 0 && !/\\\s*$/.test(masked[k]!)) break;
    }
    at = skipBlank(k + 1);
  }
  return at;
}

/** Names the script binds to matplotlib.pyplot. */
function pyplotAliases(masked: string): Set<string> {
  const aliases = new Set(['matplotlib.pyplot']);
  // `import a, matplotlib.pyplot as plt` (R2-06), and after a `;`.
  for (const m of masked.matchAll(/(?:^|;)[ \t]*import[ \t]+([^\n;]+)/gm)) {
    for (const part of m[1]!.split(',')) {
      const a = part.trim().match(/^matplotlib\.pyplot(?:[ \t]+as[ \t]+(\w+))?$/);
      if (a) aliases.add(a[1] ?? 'matplotlib.pyplot');
    }
  }
  // `from matplotlib import pyplot as plt, cm`, also in brackets over several lines (round 3, R3-08).
  for (const m of masked.matchAll(/(?:^|;)[ \t]*from[ \t]+matplotlib[ \t]+import[ \t]+(?:\(([^)]*)\)|([^\n;]+))/gm)) {
    for (const part of (m[1] ?? m[2]!).split(',')) {
      const a = part.trim().match(/^pyplot(?:[ \t]+as[ \t]+(\w+))?$/);
      if (a) aliases.add(a[1] ?? 'pyplot');
    }
  }
  return aliases;
}

/**
 * The Python fix: the helper block at the top of the script, each pyplot
 * `show(` routed through the helper in place (`plt.show(` becomes
 * `_postr_raise_text(plt, _POSTR_NEED, every=True).show(`; a show handed on
 * uncalled becomes a lambda), and a call at the end that raises every open
 * figure. Saves are not edited: the block wraps `Figure.savefig` (rewriting
 * each save in the text broke scripts with attributes of their own named
 * `savefig`; round 3, R3-01). Routing the call in place, rather than adding
 * a statement before it, keeps one-line `for`/`with`/`else:` bodies intact
 * (S9-01). An earlier fix is taken out before this one goes in. `need` is
 * the dict literal buildFontSnippet emits.
 */
function applyPythonRaise(code: string, need: string): string {
  const source = withoutEarlierFix(code);
  const masked = maskCodeForRewrite(source);
  const edits = pyShowSites(source, masked).map((site) => (site.called
    ? { from: site.from, to: site.to, text: `_postr_raise_text(${site.receiver ?? 'None'}, _POSTR_NEED, every=True).` }
    : {
        from: site.from, to: site.nameEnd,
        text: `(lambda *a, **k: _postr_raise_text(${site.receiver}, _POSTR_NEED, every=True).show(*a, **k))`,
      }));
  let out = source;
  for (const e of edits.sort((a, b) => b.from - a.from)) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  // Every open figure at the end (a notebook draws them then), however many
  // saves came before (round 3, R3-03).
  out = `${out.trimEnd()}\n\n_postr_raise_text(None, _POSTR_NEED, every=True, end=True)\n`;

  const lines = out.split('\n');
  const at = helperLine(out);
  lines.splice(at, 0, ...(at > 0 ? [''] : []), pyHelperBlock(need), '', '');
  return lines.join('\n');
}

/**
 * The sizes the checker's own fix raises each class to: its last live
 * `_POSTR_NEED` assignment, read only with the helper and install defs
 * and a live `_postr_install()` call (a copy in a string or a comment is not
 * read; S9-10), no figure reaching a file or a notebook around
 * `Figure.savefig`, and every pyplot show routed.
 */
function raisedByOwnFix(code: string): Record<string, number> {
  const masked = maskCodeForRewrite(code);
  // The assignment Python runs last, and only with the helper defined: two
  // blocks were read by the first, and a deleted def still read (R2-14).
  const assignments = [...masked.matchAll(/^_POSTR_NEED\s*=\s*\{/gm)];
  const at = assignments.length ? assignments[assignments.length - 1]!.index : -1;
  if (at < 0 || !/^def[ \t]+_postr_raise_text\s*\(/m.test(masked)) return {};
  // The saves go through the helper once `_postr_install()` has run. A
  // figure that reaches a file or a notebook another way does not: printed
  // by its canvas, called or handed on (R3-05, R4-05), its pixels read from
  // the canvas, or `display(fig)`. Every pyplot show must be routed.
  if (!/^def[ \t]+_postr_install\s*\(/m.test(masked) || !/^_postr_install\s*\(\s*\)/m.test(masked)) return {};
  if (PY_BYPASSES_SAVEFIG.test(masked)) return {};
  const routed = (site: PyShowSite) => !!site.receiver && /^_postr_raise_text\s*\(/.test(site.receiver.trim());
  if (!pyShowSites(code, masked).every(routed)) return {};
  const open = masked.indexOf('{', at);
  const close = closingBracket(masked, open);
  if (close < 0) return {};
  const raised: Record<string, number> = {};
  for (const entry of code.slice(open + 1, close).matchAll(new RegExp(`['"](\\w+)['"]\\s*:\\s*(${PY_NUM})`, 'g'))) {
    const pt = Number(entry[2]);
    if (Number.isFinite(pt)) raised[entry[1]!] = pt;
  }
  return raised;
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
