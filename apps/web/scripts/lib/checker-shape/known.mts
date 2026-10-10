/**
 * The shape harness's known failures (checker-shape-check.mts, fix 13):
 * reported, not counted. Each is keyed by script AND print size
 * (`<id>@<size>` for the shape check, `<id>@layout@<size>` for the grid) and
 * lists the defects it is known for, each with the figure it had. The list
 * is set for the fix's seventh shape (fix13-wt, readability.ts 426feb348346,
 * matplotlib 3.10.8) by harness v6.2: every entry was flagged there first
 * (v6.1 set it for the sixth, 8e240bb4c67c).
 *
 * Fix 13b (docs/fixes/13b-checker-sizes.md) replaced the helper with plain
 * edits (readabilityPyFix.ts) and runs this harness with --no-same-process
 * (several scripts in one Python is out of scope by the owner's rule of
 * 2026-10-07). On its shape the entries b10 (the helper's block no longer
 * goes at the top) and f03 at 6 × 4.5 in (font.size after the figure is now
 * read in order) no longer fire and are off; the entries keyed OUT_OF_SCOPE
 * are the scripts the owner's design leaves out (several figures, a size
 * set in a function called later, rc_context's scope), recorded with the
 * figures this harness measured on the 13b shape. Every --layout entry is
 * 13b's: part 1's (the replay of the script's layout at the save, the
 * helper's raised text in panels placed after the layout) went with the
 * helper, and the layout grid was flagged again on the 13b shape.
 *
 * Review round 1 of fix 13b: layout_truth.py judges text against the image
 * each save writes and adds cut_in2 (every text). The three entries whose
 * clip already counted the same text gained a cut_in2 tag at the same
 * figure (f06, f17, k32); k11 (a jointplot, its g.savefig a crop the fit
 * block now keeps) lost its stale-clip tags: its clip is 0 at both sizes.
 *
 * Review round 2 of fix 13b: f01 (a loop over two figures, font.size set
 * from the loop's variable) came off at both sizes: font.size is now a size
 * the check cannot read, which the script no longer pins at the default it
 * assumed (P13B-R2-03), so the second figure's 24 pt text is no longer
 * lowered (the harness flagged both entries stale: none of their tags fired).
 *
 * A defect is KNOWN only when an entry of its script and size matches its
 * tag and it is no more than KNOWN_CEILING times its recorded figure; a
 * known failure that gets worse than that is a DEFECT (KNOWN WORSE). Any
 * other defect of the same script counts.
 *
 * Staleness is judged per TAG (v6.2; v6.1 judged it per entry, so a KNOWN
 * WORSE entry also printed STALE KNOWN, and an entry losing one of several
 * tags went unreported: the independent check of v6.1, finding 4). A tag
 * FIRES when a defect of its script and size matches it, known or worse.
 * An entry none of whose tags fires is STALE KNOWN; a tag that does not fire
 * in an entry where another does is STALE TAG. Both fail the run, so the
 * list cannot go stale.
 */

/** One defect a judgement found. `value` is its magnitude when it has one. */
export type Found = { judgement: string; tag: string; value?: number; text: string };

type KnownTag = { match: RegExp; figure: number | null };
export type Known = { why: string; tags: KnownTag[] };

export const KNOWN_CEILING = 1.5;

const F32 = 'at 4 × 3 in the needed sizes (29 and 23 pt on its 6.4 × 3.2 in canvas) and a legend placed outside leave constrained layout no room: a legend made at the raised size scales its handles and padding with its text, so the layout gives up and warns (section 10)';
const LEGEND_TITLE = 'the fix sets legend titles with legend text (record 13b, section 10); the ideal control keeps the script\'s legend title size, and at this size the raised title takes the room the panels need';
/**
 * Fix 13b's layout grid (record 13b, section 10), every figure measured by
 * this harness on the 13b shape (--no-same-process --layout).
 */
const STALE_PLAIN = 'the script changes its figure after its own tight_layout (a colorbar, a twin axis, a resize, a title per frame), so its layout is stale in the original too. The plain edits set each size where the code sets it, so the fixed script measures the same as the ideal control in each of the 26 stale tags outside the seaborn grids the fix sets to the print size; only the fresh control, which runs the layout again before every save, does better, and that is a layout call the script does not make (part 1 replayed it at the save: machinery the owner\'s design of 2026-10-07 removed)';
const GRID_FIT = 'a seaborn grid, whose size the code does not give, is set to the print size (the owner\'s design) and laid out again for it; at this size the needed sizes of the facet titles, labels, legend and a raised suptitle do not all fit. The controls keep the grid\'s own size (larger than the print size), so their text, at the same point sizes, prints smaller than needed; the stale rule flags the same text';
const SUPTITLE = 'the suptitle is a plot title and raised (the owner\'s rule of 2026-10-07): at the needed 29 pt it reaches into the room subplots_adjust(top=0.92) left for it at its own size (0.342 in² of text under it); the ideal control keeps a suptitle at the script\'s size';
const GRID_LEGEND = 'at 4 × 3 in a legend 2.942 in wide at 14 pt (its title is long) leaves 0.96 in for two facets: tight_layout gives up and warns, and the legend covers the plots (figleg 2.484 in²). A legend that does not fit beside the plots at the print size is an owner question (record 13b, section 10)';
const RAISED_FIRST = 'sizes the code does not set are set before the figure is made (the owner\'s design), so the fixed script measures the same as the raised-first control (clip 0.062, cross 0.065 in²); the ideal control raises them where matplotlib reads them';
const OUT_OF_SCOPE_AFTER = 'out of scope (owner, 2026-10-07): style.context\'s and rc_context\'s scope. The figure the script leaves open, drawn again after the with-block has ended, keeps its 23 pt tick labels, while the tick locator reads the restored default size to decide how many fit (11 at 23 pt), so they overlap; the ideal control raises every read, inside the block or not';
/** Fix 13b: what the owner's design of 2026-10-07 leaves out (record 13b, section 10). */
const OUT_OF_SCOPE_FIGURES = 'out of scope (owner, 2026-10-07): a script that makes several figures; the rule table reads one figure, the last settings by position, and the second figure is sized by settings the first one did not see';
const OUT_OF_SCOPE_FUNCTION = 'out of scope (owner, 2026-10-07): a size set inside a function called later, and two figures; the rule table reads the assignment in the function body where it is written';
const OUT_OF_SCOPE_RC_CONTEXT = 'out of scope (owner, 2026-10-07): rc_context\'s scope; its settings are read from its position on, and the figure made after its with-block ends is sized by matplotlib\'s defaults';

/**
 * Figures: the fixed script's own value of the metric (in² for the grid and
 * the stale rule, the pt a text dropped for LOWERED, the pt it is short of
 * its need for SHORT), measured by this harness on the 13b shape
 * (readabilityPyFix.ts plain edits, matplotlib 3.10.8, seaborn 0.13.2, with
 * --no-same-process; record 13b, section 10, has the run). `null`: a defect
 * with no magnitude (a crash, a warning, a false green).
 */
export const KNOWN: Record<string, Known> = {
  'k35_library_side_figure@6x4.5': {
    why: OUT_OF_SCOPE_FIGURES,
    tags: [{ match: /^SHORT save1:axisText$/, figure: 7 }, { match: /^FALSE GREEN$/, figure: null }, { match: /^SECOND short$/, figure: null }],
  },
  'k35_library_side_figure@4x3': {
    why: OUT_OF_SCOPE_FIGURES, tags: [{ match: /^SHORT save1:axisText$/, figure: 15 }, { match: /^FALSE GREEN$/, figure: null }],
  },
  'f04_rc_relative_string_then_base@6x4.5': {
    why: OUT_OF_SCOPE_FUNCTION,
    tags: [{ match: /^LOWERED save1:plotTitle$/, figure: 14.56 }, { match: /^LOWERED save1:axisText$/, figure: 5 }, { match: /^LOWERED save1:legendText$/, figure: 5 }],
  },
  'f04_rc_relative_string_then_base@4x3': { why: OUT_OF_SCOPE_FUNCTION, tags: [{ match: /^LOWERED save1:plotTitle$/, figure: 5.56 }] },
  'f07_rc_context_small_then_default@6x4.5': {
    why: OUT_OF_SCOPE_RC_CONTEXT,
    tags: [{ match: /^SHORT save1:axisTitle$/, figure: 2 }, { match: /^FALSE GREEN$/, figure: null }, { match: /^SECOND short$/, figure: null }],
  },
  'f07_rc_context_small_then_default@4x3': {
    why: OUT_OF_SCOPE_RC_CONTEXT,
    tags: [{ match: /^SHORT save1:plotTitle$/, figure: 6 }, { match: /^SHORT save1:axisTitle$/, figure: 8 }, { match: /^SHORT save1:axisText$/, figure: 4 },
      { match: /^SHORT save1:legendText$/, figure: 4 }, { match: /^FALSE GREEN$/, figure: null }],
  },
  'f32_constrained_explicit_legend_title@4x3': {
    why: F32, tags: [{ match: /^LAYOUT WARNING UserWarning: constrained_layout not applied/, figure: null }],
  },
  'f06_sns_context_after_subplots@layout@6x4.5': {
    why: RAISED_FIRST,
    tags: [
      { match: /^save0 clip_in2$/, figure: 0.062 },
      { match: /^save0 cut_in2$/, figure: 0.062 },
      { match: /^save0 cross_in2$/, figure: 0.065 },
    ],
  },
  'f10_explicit_tight_then_colorbar@layout@6x4.5': {
    why: STALE_PLAIN,
    tags: [
      { match: /^save0 stale clip_in2$/, figure: 0.347 },
      { match: /^save0 stale cross_in2$/, figure: 0.682 },
    ],
  },
  'f11_explicit_tight_then_twinx@layout@6x4.5': { why: STALE_PLAIN, tags: [{ match: /^save0 stale cross_in2$/, figure: 0.728 }] },
  'f25_resize_after_tight@layout@6x4.5': { why: STALE_PLAIN, tags: [{ match: /^save0 stale clip_in2$/, figure: 0.388 }] },
  'k08_anim_pillow_gif@layout@6x4.5': {
    why: STALE_PLAIN,
    tags: [
      { match: /^save0 stale clip_in2$/, figure: 0.133 },
      { match: /^save1 stale clip_in2$/, figure: 0.133 },
      { match: /^save2 stale clip_in2$/, figure: 0.133 },
      { match: /^save3 stale clip_in2$/, figure: 0.133 },
    ],
  },
  'k20_tight_in_setup_function@layout@6x4.5': {
    why: STALE_PLAIN,
    tags: [
      { match: /^save0 stale clip_in2$/, figure: 0.44 },
      { match: /^save0 stale cross_in2$/, figure: 0.98 },
    ],
  },
  'k24_tight_then_resize@layout@6x4.5': { why: STALE_PLAIN, tags: [{ match: /^save0 stale clip_in2$/, figure: 0.63 }] },
  'k32_catplot_suptitle_adjust@layout@6x4.5': {
    why: GRID_FIT,
    tags: [
      { match: /^save0 cross_in2$/, figure: 0.258 },
      { match: /^save0 stale cross_in2$/, figure: 0.258 },
    ],
  },
  'f10_explicit_tight_then_colorbar@layout@4x3': {
    why: STALE_PLAIN,
    tags: [
      { match: /^save0 stale cross_in2$/, figure: 1.505 },
      { match: /^save0 stale clip_in2$/, figure: 0.746 },
    ],
  },
  'f11_explicit_tight_then_twinx@layout@4x3': { why: STALE_PLAIN, tags: [{ match: /^save0 stale cross_in2$/, figure: 1.9 }] },
  'f17_relplot_long_legend_title@layout@4x3': {
    why: GRID_FIT,
    tags: [
      { match: /^save0 clip_in2$/, figure: 0.119 },
      { match: /^save0 cut_in2$/, figure: 0.119 },
      { match: /^save0 cross_in2$/, figure: 0.136 },
      { match: /^save0 figleg_in2$/, figure: 2.484 },
      { match: /^save0 stale clip_in2$/, figure: 0.119 },
      { match: /^save0 stale cross_in2$/, figure: 0.136 },
    ],
  },
  'f18_catplot_canvas_width@layout@4x3': {
    why: GRID_FIT,
    tags: [
      { match: /^save0 tick_in2$/, figure: 0.0065 },
      { match: /^after fig1 display tick_in2$/, figure: 0.0065 },
      { match: /^after fig1 resave tick_in2$/, figure: 0.0065 },
    ],
  },
  'f20_facetgrid_explicit_labels@layout@4x3': {
    why: GRID_FIT,
    tags: [
      { match: /^save0 cross_in2$/, figure: 0.148 },
      { match: /^save0 stale cross_in2$/, figure: 0.148 },
    ],
  },
  'f25_resize_after_tight@layout@4x3': { why: STALE_PLAIN, tags: [{ match: /^save0 stale clip_in2$/, figure: 0.976 }] },
  'f26_fig_legend_after_tight_adjust@layout@4x3': { why: STALE_PLAIN, tags: [{ match: /^save0 stale cross_in2$/, figure: 0.348 }] },
  'f32_constrained_explicit_legend_title@layout@4x3': { why: LEGEND_TITLE, tags: [{ match: /^save0 cross_in2$/, figure: 1.394 }] },
  'k08_anim_pillow_gif@layout@4x3': {
    why: STALE_PLAIN,
    tags: [
      { match: /^save0 stale clip_in2$/, figure: 0.313 },
      { match: /^save1 stale clip_in2$/, figure: 0.314 },
      { match: /^save2 stale clip_in2$/, figure: 0.314 },
      { match: /^save3 stale clip_in2$/, figure: 0.314 },
    ],
  },
  'k10_relplot_legend_out@layout@4x3': { why: GRID_FIT, tags: [{ match: /^save0 cross_in2$/, figure: 0.257 }, { match: /^save0 stale cross_in2$/, figure: 0.257 }] },
  'k11_jointplot_suptitle_adjust@layout@4x3': {
    why: SUPTITLE,
    tags: [{ match: /^save0 figleg_in2$/, figure: 0.342 }],
  },
  'k13_style_context@layout@4x3': {
    why: OUT_OF_SCOPE_AFTER,
    tags: [
      { match: /^after fig1 display tick_in2$/, figure: 0.0509 },
      { match: /^after fig1 resave tick_in2$/, figure: 0.0509 },
    ],
  },
  'k14_rc_context@layout@4x3': {
    why: OUT_OF_SCOPE_AFTER,
    tags: [
      { match: /^after fig1 display tick_in2$/, figure: 0.0509 },
      { match: /^after fig1 resave tick_in2$/, figure: 0.0509 },
    ],
  },
  'k20_tight_in_setup_function@layout@4x3': {
    why: STALE_PLAIN,
    tags: [
      { match: /^save0 stale clip_in2$/, figure: 1.315 },
      { match: /^save0 stale cross_in2$/, figure: 2.104 },
    ],
  },
  'k24_tight_then_resize@layout@4x3': { why: STALE_PLAIN, tags: [{ match: /^save0 stale clip_in2$/, figure: 1.813 }] },
  'k32_catplot_suptitle_adjust@layout@4x3': {
    why: GRID_FIT,
    tags: [
      { match: /^save0 clip_in2$/, figure: 0.065 },
      { match: /^save0 cut_in2$/, figure: 0.065 },
      { match: /^save0 cross_in2$/, figure: 1.393 },
      { match: /^save0 stale clip_in2$/, figure: 0.065 },
      { match: /^save0 stale cross_in2$/, figure: 1.393 },
    ],
  },
  's09_tight_then_shared_colorbar@layout@4x3': { why: STALE_PLAIN, tags: [{ match: /^save0 stale cross_in2$/, figure: 0.416 }] },
  'f17_relplot_long_legend_title@4x3': {
    why: GRID_LEGEND, tags: [{ match: /^LAYOUT WARNING UserWarning: Tight layout not applied/, figure: null }],
  },
};

/** `fired`: the indexes of the entry's tags that a defect matched, known or worse (v6.2). */
export type Verdict = { known: Found[]; worse: Array<Found & { figure: number }>; other: Found[]; fired: Set<number> };

/** Split what was found for one key into known, known-but-worse, and the rest. */
export function sortFound(key: string, found: Found[]): Verdict {
  const entry = KNOWN[key];
  const verdict: Verdict = { known: [], worse: [], other: [], fired: new Set() };
  for (const f of found) {
    const at = entry ? entry.tags.findIndex((t) => t.match.test(f.tag)) : -1;
    if (at < 0) {
      verdict.other.push(f);
      continue;
    }
    verdict.fired.add(at);
    const tag = entry!.tags[at]!;
    if (tag.figure !== null && f.value !== undefined && f.value > KNOWN_CEILING * tag.figure + 1e-9) verdict.worse.push({ ...f, figure: tag.figure });
    else verdict.known.push(f);
  }
  return verdict;
}
