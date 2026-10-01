/**
 * The shape harness's known failures (checker-shape-check.mts, fix 13):
 * reported, not counted. Each is keyed by script AND print size
 * (`<id>@<size>` for the shape check, `<id>@layout@<size>` for the grid) and
 * lists the defects it is known for, each with the figure it had. The list
 * is set for the fix's seventh shape (fix13-wt, readability.ts 426feb348346,
 * matplotlib 3.10.8) by harness v6.2: every entry was flagged there first
 * (v6.1 set it for the sixth, 8e240bb4c67c).
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

const R2_08 = 'R2-08, part 2: a module docstring written as an expression statement';
const R4_09 = 'the fix raises every figure the script saves, a diagnostics sheet kept at its own small size too (round 4, R4-09)';
const K48 = 'text the script sized itself, raised at the save in a panel the script placed after its layout: the layout is not run again, so the placement holds and the text clips';
const F03 = 'font.size changed after the figure is made and before its text: the text is born at the size Postr set, not the bigger one the script set (round 5, R5-01, section 10)';
const F32 = 'at 4 × 3 in the needed sizes (29 and 23 pt on its 6.4 × 3.2 in canvas) and a legend placed outside leave constrained layout no room: a legend made at the raised size scales its handles and padding with its text, so the layout gives up and warns (section 10)';
const F24 = 'text the script sized itself, raised at the save in spacing the script fixed on the gridspec after its layout';
const K24 = 'the needed sizes (41 and 32 pt on its 9 x 3 in canvas) do not fit three panels in a row; the replay of the stale layout brings the clipped text in (clipped 0 against the ideal\'s 1.813 in²), where it crosses';
const G13_S09 = 'a colorbar shared by several Axes after tight_layout moves them off their grid places, so the layout is not run again (a replay would put the panels back over the colorbar); text the script sized itself, raised at the save, crosses and clips (round 6, R6P-05 and R6M-06)';
const A01_A02 = 'a hand-placed Axes positioned from a grid panel stays where the script put it when the replay moves the panel (round 6, R6C-03, record section 10): the trade-off against clipped text';
const ONE_PASS = 'tight_layout makes one pass, and where it ends depends on where it starts: the fix replays the script\'s own layout once, from the layout the script made at its own explicit sizes (raised only at the save), and a fresh layout starts from one made at the needed sizes. From the same start the two are identical (22 of 22), and neither is settled: a second pass gives f10 0.638 against 0.599 and f26 0.273 against 0.274 (round 7\'s probe and skeptic, record section 10)';
const LEGEND_TITLE = 'legend titles are raised with legend text (an owner call, record section 10): at this size the raised title takes the room the panels need';

/**
 * Figures: the fixed script's own value of the metric (in² for the grid and
 * the stale rule, in for the moved rule, the pt a text dropped for LOWERED),
 * as measured by harness v6.1 on fix13-wt (fix13-out/harness-v6-1/logs) and
 * re-measured by v6.2 on its round 7 shape (fix13-out/harness-v6-2/logs,
 * the same figures); the six entries that came
 * from fix13-frozen-c11 (b10, f03, f32's warning, k35, k48 and f24 at
 * 6 × 4.5 in) measure the same there. `null`: a defect with no magnitude (a
 * crash, a warning). v6.1 took f15 and f30 at 6 × 4.5 in off (the ideal
 * clips the same: the cost of the sizes, not of the fix). v6.2, on the round
 * 7 shape (fix13-wt, readability.ts 426feb348346): f17 at 4 × 3 in off (the
 * round 7 change took its figure legend from 0.304 to 0.104 in², below the
 * ideal's 0.142); k24 at 4 × 3 in loses its stale tag (the fresh-layout
 * control crosses the same 1.136 in²); a01 and a02 at both sizes added (the
 * relative rule of v6.2 flags them; v6.1's absolute rule could not). f10
 * and f26 at 4 × 3 in added after round 7's probe and its skeptic found their
 * stale flags to be tight_layout's one pass from another start, not a fault
 * of the replay.
 */
export const KNOWN: Record<string, Known> = {
  'b10_docstring_expression@6x4.5': { why: R2_08, tags: [{ match: /^CRASH IndentationError$/, figure: null }] },
  'b10_docstring_expression@4x3': { why: R2_08, tags: [{ match: /^CRASH IndentationError$/, figure: null }] },
  'f03_fontsize_inside_one_fig@6x4.5': {
    why: F03,
    tags: [{ match: /^LOWERED save0:plotTitle$/, figure: 6.4 }, { match: /^LOWERED save0:legendText$/, figure: 7 }],
  },
  'f32_constrained_explicit_legend_title@4x3': {
    why: F32, tags: [{ match: /^LAYOUT WARNING UserWarning: constrained_layout not applied/, figure: null }],
  },
  'k35_library_side_figure@layout@6x4.5': { why: R4_09, tags: [{ match: /^save1 clip_in2$/, figure: 0.897 }] },
  'k35_library_side_figure@layout@4x3': {
    why: R4_09, tags: [{ match: /^save1 clip_in2$/, figure: 2.183 }, { match: /^save1 cross_in2$/, figure: 0.575 }],
  },
  'k48_explicit_tight_then_set_position@layout@6x4.5': { why: K48, tags: [{ match: /^save0 clip_in2$/, figure: 0.183 }] },
  'k48_explicit_tight_then_set_position@layout@4x3': { why: K48, tags: [{ match: /^save0 clip_in2$/, figure: 0.985 }] },
  'f24_gridspec_update_after_tight@layout@6x4.5': {
    why: F24, tags: [{ match: /^save0 clip_in2$/, figure: 0.328 }, { match: /^save0 cross_in2$/, figure: 1.194 }],
  },
  'f24_gridspec_update_after_tight@layout@4x3': {
    why: F24, tags: [{ match: /^save0 clip_in2$/, figure: 2.193 }, { match: /^save0 cross_in2$/, figure: 3.174 }],
  },
  // k24: the grid only (v6.2: the fresh-layout control crosses the same
  // 1.136 in², so the stale rule passes it). g13, s09: the grid and the stale
  // rule find the same clipping and crossing: one entry, both tags.
  'k24_tight_then_resize@layout@4x3': { why: K24, tags: [{ match: /^save0 cross_in2$/, figure: 1.136 }] },
  'g13_colorbar_ax_list_after_tight_explicit@layout@6x4.5': {
    why: G13_S09, tags: [{ match: /^save0 cross_in2$/, figure: 0.1 }, { match: /^save0 stale cross_in2$/, figure: 0.1 }],
  },
  'g13_colorbar_ax_list_after_tight_explicit@layout@4x3': {
    why: G13_S09,
    tags: [{ match: /^save0 clip_in2$/, figure: 0.677 }, { match: /^save0 cross_in2$/, figure: 0.33 },
      { match: /^save0 stale clip_in2$/, figure: 0.677 }, { match: /^save0 stale cross_in2$/, figure: 0.33 }],
  },
  's09_tight_then_shared_colorbar@layout@6x4.5': {
    why: G13_S09,
    tags: [{ match: /^save0 clip_in2$/, figure: 0.716 }, { match: /^save0 cross_in2$/, figure: 0.421 },
      { match: /^save0 stale clip_in2$/, figure: 0.716 }, { match: /^save0 stale cross_in2$/, figure: 0.421 }],
  },
  's09_tight_then_shared_colorbar@layout@4x3': {
    why: G13_S09,
    tags: [{ match: /^save0 clip_in2$/, figure: 3.186 }, { match: /^save0 cross_in2$/, figure: 1.297 },
      { match: /^save0 stale clip_in2$/, figure: 3.186 }, { match: /^save0 stale cross_in2$/, figure: 1.297 }],
  },
  // v6.2's relative rule: the cax (a01) and the zoom inset (a02) placed from
  // their panel's position, left where the script put them when the replay
  // moves the panel; figures in inches, the nearer of original and ideal.
  'a01_cax_from_pos@layout@6x4.5': { why: A01_A02, tags: [{ match: /^save0 moved$/, figure: 0.28 }] },
  'a01_cax_from_pos@layout@4x3': { why: A01_A02, tags: [{ match: /^save0 moved$/, figure: 0.51 }] },
  'a02_inset_from_pos@layout@6x4.5': { why: A01_A02, tags: [{ match: /^save0 moved$/, figure: 0.25 }] },
  'a02_inset_from_pos@layout@4x3': { why: A01_A02, tags: [{ match: /^save0 moved$/, figure: 0.222 }] },
  // The stale rule's fresh control, one pass from another start (round 7's probe).
  'f10_explicit_tight_then_colorbar@layout@4x3': { why: ONE_PASS, tags: [{ match: /^save0 stale cross_in2$/, figure: 1.131 }] },
  'f26_fig_legend_after_tight_adjust@layout@4x3': { why: ONE_PASS, tags: [{ match: /^save0 stale cross_in2$/, figure: 0.329 }] },
  // Red since v6.1's ideal raises listed classes only (a legend title is not one).
  'f32_constrained_explicit_legend_title@layout@4x3': { why: LEGEND_TITLE, tags: [{ match: /^save0 cross_in2$/, figure: 1.394 }] },
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
