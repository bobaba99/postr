/**
 * The plot checker's shared shapes: what a reader (readabilityPyModel.ts,
 * readabilityRModel.ts) hands to the scorer (readability.ts
 * computeReadability), and the element tables both languages are scored
 * against. Moved out of readability.ts (fix 13b) so the readers, the scorer
 * and the script generators share one copy; readability.ts re-exports the
 * public ones.
 */
import { FIGURE_TEXT_MIN_PT } from './figureTextMinimums';

export type ElementKey = 'axisTitle' | 'axisText' | 'legendText' | 'legendTitle' | 'plotTitle' | 'stripText' | 'caption';

/** One per-axis selector of an R element (axis.text.x), as the fix needs it. */
export interface RChild {
  /** The selector, `axis.text.x`. */
  selector: string;
  /** The size ggplot2 draws it at, in pt. */
  pt: number;
  /** The selector ggplot2 draws it with (axis.text.x.bottom), and whether its size rests on a complete theme that is not ggplot2's. */
  leaf?: string;
  theme?: boolean;
  /** Its size rests on a base_size the check cannot read (P13B-R2-03): the fix sets it with a floor at what ggplot2 draws. */
  unread?: boolean;
}

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
  /**
   * Fix 13b: the size each class is drawn at as the rule table resolves it,
   * in pt (the smallest drawn one). When present the scorer uses it instead
   * of baseSize × the element's multiplier and `overrides`.
   */
  sizes?: Partial<Record<ElementKey, number>>;
  /**
   * Fix 13b: classes whose size the code does not set. The table shows the
   * library's default with a mark, and the generated script sets it.
   */
  assumed?: Partial<Record<ElementKey, boolean>>;
  /**
   * Fix 13b, review round 1: assumed classes the generated script leaves as
   * written, because the code sets them in a way the check cannot read and
   * must not overwrite (Python: a FontProperties or a ** it cannot resolve;
   * R, review round 2: plots a combined figure combines that the check cannot
   * name). The panel says to check those by hand.
   */
  assumedKept?: Partial<Record<ElementKey, boolean>>;
  /**
   * Fix 13b, review round 2: assumed classes the generated script sets only
   * where they fall short and leaves as written where they pass. Since review
   * round 3 (P13B-R3-03: a row left as written where it passed at the size the
   * check assumed printed short under the re-check's ✓) every other size the
   * check cannot read gets a floor, short or not; only a Python fontdict= the
   * check cannot see into is still raised only where it falls short (a plain
   * fontsize= beside it could lower a larger size).
   */
  floorWhenShort?: Partial<Record<ElementKey, boolean>>;
  /**
   * Fix 13b, review round 2 (P13B-R2-03): assumed classes the code DOES set,
   * in a way the check cannot read (a config value, a base_size from a list;
   * since review round 3 also a complete theme that is not ggplot2's): the
   * panel says "Not read from your code", and the generated script raises
   * such a row to at least the size needed, with a floor read when the script
   * runs (never a smaller constant).
   */
  unread?: Partial<Record<ElementKey, boolean>>;
  /**
   * Fix 13b, review round 2 (P13B-R2-10): rows for text the code does not
   * draw (a Python plot title or legend the script never makes). They do not
   * drive the one-number advice.
   */
  undrawn?: Partial<Record<ElementKey, boolean>>;
  /**
   * Fix 13b: the printed scale rests on a canvas the code does not fix (no
   * figure size, a size the check cannot read, a seaborn grid that sizes
   * itself, a save cropped with bbox_inches="tight"). Every row is marked
   * and the generated script fixes the canvas.
   */
  canvasAssumed?: boolean;
  /**
   * Fix 13b: the printed scale cannot be known from the code at all (a
   * seaborn grid that sizes itself, a cropped save, a notebook's display, a
   * size written in a way the check cannot read), as opposed to a canvas the
   * code leaves to a known default. The one-number advice is withheld then:
   * its number would rest on a scale the figure does not print at.
   */
  scaleUnknown?: boolean;
  /**
   * Fix 13b: rows the table leaves out: classes the code does not draw and
   * no setting could raise (Python's caption with no fig.text), or that the
   * code blanks (R's element_blank()), which the fix must never bring back.
   */
  hidden?: Partial<Record<ElementKey, boolean>>;
  /**
   * Fix 13b: points each class is drawn at per point of the base the
   * one-number advice edits (font.size, base_size); 0 or absent for a class
   * that does not follow it (a size set directly, a seaborn context).
   */
  baseSlope?: Partial<Record<ElementKey, number>>;
  /**
   * Fix 13b: the base the one-number advice edits: the script's own
   * font.size or base_size (the library's default when the code sets none),
   * or null when the classes that follow a base do not all follow the same
   * setting, which withholds the advice.
   */
  ownBase?: number | null;
  /** Fix 13b, R: the complete theme the one-number snippet names (theme_bw). */
  baseTheme?: string;
  /**
   * Fix 13b, R: per class with per-axis selectors (axis.text, axis.title,
   * strip.text), the selectors the user pinned or that are drawn, each with
   * its size, so the fix names only those below the size needed and never
   * sets a drawn one lower.
   */
  rChildren?: Partial<Record<ElementKey, RChild[]>>;
  facetRows: number;
  facetCols: number;
  warnings: string[];
}

export interface ElementSpec {
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

export const DEFAULT_SIZE_LABEL = 'figure preview size';

export const R_DEFAULTS = { baseSize: 11, width: 7, height: 7 };
export const PY_DEFAULTS = { baseSize: 10, width: 6.4, height: 4.8 };

// minPt: the canonical minimums for figure text, one set shared with the
// image scan and the inserted charts (figureTextMinimums.ts, fix 13c).
const MIN = FIGURE_TEXT_MIN_PT;

export const R_ELEMENTS: ElementSpec[] = [
  { name: 'Plot title',   key: 'plotTitle',   relMultiplier: 1.2, minPt: MIN.plotTitle,   selector: 'plot.title' },
  { name: 'Axis titles',  key: 'axisTitle',   relMultiplier: 1.0, minPt: MIN.axisTitle,   selector: 'axis.title' },
  { name: 'Tick labels',  key: 'axisText',    relMultiplier: 0.8, minPt: MIN.axisText,    selector: 'axis.text' },
  { name: 'Legend text',  key: 'legendText',  relMultiplier: 0.8, minPt: MIN.legendText,  selector: 'legend.text' },
  { name: 'Legend title', key: 'legendTitle', relMultiplier: 1.0, minPt: MIN.legendTitle, selector: 'legend.title' },
  { name: 'Strip text',   key: 'stripText',   relMultiplier: 0.8, minPt: MIN.stripText,   selector: 'strip.text' },
  // ggplot2's plot.caption is rel(0.8) of title (fix 13b: 0.67 drew 10.05 pt
  // where ggplot2 4.0.3 draws 12 at base_size 15).
  { name: 'Caption',      key: 'caption',     relMultiplier: 0.8, minPt: MIN.caption,     selector: 'plot.caption' },
];

export const PY_ELEMENTS: ElementSpec[] = [
  // `selector` is the rcParams key rather than a call, because rcParams
  // is the one place that sets every one of these uniformly. The
  // per-Axes calls (ax.set_xlabel(fontsize=), ax.tick_params(labelsize=))
  // only reach the Axes they are called on, which is wrong advice for a
  // figure with subplots — and legend text has no per-Axes setter at all.
  { name: 'Plot title',   key: 'plotTitle',   relMultiplier: 1.2,  minPt: MIN.plotTitle,  selector: 'axes.titlesize' },
  { name: 'Axis titles',  key: 'axisTitle',   relMultiplier: 1.0,  minPt: MIN.axisTitle,  selector: 'axes.labelsize' },
  // matplotlib's x/ytick.labelsize is 'medium', 1.0 × font.size (fix 13b;
  // 0.83 under-read every inherited tick label by 17 %).
  { name: 'Tick labels',  key: 'axisText',    relMultiplier: 1.0,  minPt: MIN.axisText,   selector: 'xtick.labelsize' },
  { name: 'Legend text',  key: 'legendText',  relMultiplier: 1.0,  minPt: MIN.legendText, selector: 'legend.fontsize' },
  // No selector: matplotlib has no rcParams key that moves a caption
  // (`figure.titlesize` moves fig.suptitle). A figure text is drawn at
  // font.size, 1.0 × (fix 13b); the fix sets the caption's own fontsize=.
  { name: 'Caption',      key: 'caption',     relMultiplier: 1.0,  minPt: MIN.caption,    selector: null },
];
