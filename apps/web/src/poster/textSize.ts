/**
 * Text size: one control for the whole poster, [A−] Body 36 pt [A+] in the
 * editor's top bar (the MVP design doc,
 * docs/launch/mvp-editor/bounded-designs.md §3.7; record
 * docs/fixes/33-text-size.md). No block stores its own size: a level's size
 * reaches every block of that level, so stepping the four levels steps all
 * the poster's text that follows them.
 *
 * | # | When | Then |
 * |---|---|---|
 * | 1 | Body sizes | 28 · 32 · 36 · 40 · 44 · 48 pt (`BODY_SIZES_PT`); a new poster's body is 36 pt |
 * | 2 | A+ / A− | The body moves to the next size above / below its own. A body between two sizes, or outside them (an older poster, a size typed in the Style tab), goes to the next size above or below it. |
 * | 3 | The other levels | Title, heading and authors are multiplied by the body's ratio (new ÷ old), not rounded, so their proportions stay; weight, italic, line height and colour are left alone |
 * | 4 | The bounds | At 48 pt or more there is no size above (A+ disabled); at 28 pt or less none below (A− disabled) |
 * | 5 | One press | One undo step for the four levels (the caller writes them in one patch) |
 * | 6 | A level set in the Style tab | Its new ratio to the body is the one kept from then on |
 * | 7 | A body that is not a size | 0 (the Style tab's Body field stores it when cleared), or a negative number, null or a string in a stored poster: below every size (row 2), so A+ sets the body to 28 pt and leaves the other levels (there is no ratio to keep); A− does nothing |
 * | 8 | Another level that is not a size | Left as it is by every press (a title of null stays null) |
 *
 * EXACT ROUND TRIPS. A+ then A− must give back every level exactly (=== in
 * the store), and any sequence of presses that returns the body to a size
 * must give back the sizes it had there. Multiplying by new ÷ old does not
 * do that in floating point: (x · 40/36) · 36/40 is often x ± 1 ulp, and no
 * formula on the four sizes alone can always undo a press (A+ maps sizes
 * into a range with fewer representable values, so two starting sizes can
 * land on one; record 33 §6, with the measured rate). So the levels are
 * computed from an anchor, the sizes before the first of a run of presses:
 * at body size p, each level is `anchor level ÷ anchor body × p`, and at
 * the anchor's own body the anchor itself. The sizes at a body are then a
 * function of the anchor and the body alone, so returning to a size returns
 * its sizes exactly. A press starts a new anchor when the poster's sizes
 * are not the anchor's at its body: a size typed in the Style tab (rule 6),
 * another poster, or a reload (the anchor is kept in this tab only).
 */
import type { Styles } from '@postr/shared';
import { ptToUnits, unitsToPt } from './constants';

/** The body sizes A− / A+ step through, in pt. */
export const BODY_SIZES_PT = [28, 32, 36, 40, 44, 48] as const;

/** Two body sizes closer than this (pt) are the same size: float noise, never a size a user sets. */
const SAME_PT = 1e-6;

export type TextSizeStep = 'up' | 'down';

/**
 * A stored level size that is a size: a positive, finite number of units.
 * The Style tab's field stores 0 when it is cleared; a stored poster can
 * hold a negative number, null or a string (rows 7 and 8).
 */
export const isSize = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** The next body size above (`up`) or below (`down`) `pt`, or null at a bound (rules 2 and 4). */
export function nextBodyPt(pt: number, step: TextSizeStep): number | null {
  if (step === 'up') return BODY_SIZES_PT.find((s) => s > pt + SAME_PT) ?? null;
  for (let i = BODY_SIZES_PT.length - 1; i >= 0; i -= 1) if (BODY_SIZES_PT[i]! < pt - SAME_PT) return BODY_SIZES_PT[i]!;
  return null;
}

/**
 * Where one press takes the body, in pt, from its stored size, or null when
 * a press changes nothing (rules 2, 4 and 7). The control's label, titles
 * and disabled state and the press itself all read this one answer.
 */
export function bodyTarget(storedBody: unknown, step: TextSizeStep): number | null {
  if (!isSize(storedBody)) return step === 'up' ? BODY_SIZES_PT[0] : null;
  return nextBodyPt(unitsToPt(storedBody), step);
}

const LEVELS = ['title', 'heading', 'authors', 'body'] as const;
type Sizes = Record<(typeof LEVELS)[number], number>;

const sizesOf = (styles: Styles): Sizes => ({
  title: styles.title.size,
  heading: styles.heading.size,
  authors: styles.authors.size,
  body: styles.body.size,
});

const sameSizes = (a: Sizes, b: Sizes) => LEVELS.every((k) => a[k] === b[k]);

/** The sizes before the first press of the current run (see EXACT ROUND TRIPS). */
let anchor: Sizes | null = null;

/**
 * The levels at body size `pt`, from `from` (rule 3): ratios to `from`'s
 * body, `from` itself at its own body; a level that is not a size is kept
 * as it is (row 8).
 */
function sizesAt(from: Sizes, pt: number): Sizes {
  if (Math.abs(unitsToPt(from.body) - pt) <= SAME_PT) return from;
  const body = ptToUnits(pt);
  const scaled = (v: number) => (isSize(v) ? (v / from.body) * body : v);
  return {
    title: scaled(from.title),
    heading: scaled(from.heading),
    authors: scaled(from.authors),
    body,
  };
}

/** `styles` with the four levels' sizes replaced by `next`; everything else kept (rule 3). */
const withSizes = (styles: Styles, next: Sizes): Styles => ({
  ...styles,
  title: { ...styles.title, size: next.title },
  heading: { ...styles.heading, size: next.heading },
  authors: { ...styles.authors, size: next.authors },
  body: { ...styles.body, size: next.body },
});

/**
 * The styles after one press of A+ (`up`) or A− (`down`), or null when a
 * press changes nothing (the body at the bound in that direction, or A−
 * from a body that is not a size). Only the four sizes change.
 */
export function stepTextSize(styles: Styles, step: TextSizeStep): Styles | null {
  const now = sizesOf(styles);
  const target = bodyTarget(now.body, step);
  if (target === null) return null;
  // Row 7: no ratio to keep (dividing by the body would write Infinity or
  // NaN into the poster), so only the body is set.
  if (!isSize(now.body)) return withSizes(styles, { ...now, body: ptToUnits(target) });
  const pt = unitsToPt(now.body);
  if (!anchor || !sameSizes(sizesAt(anchor, pt), now)) anchor = now;
  return withSizes(styles, sizesAt(anchor, target));
}
