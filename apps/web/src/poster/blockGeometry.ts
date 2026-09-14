/**
 * Where a block actually renders — the ONE definition.
 *
 * This existed twice: once as a local `const` inside `BlockFrame`
 * (`blocks.tsx`, the "B1 fix") and once inside `boundsCheck.ts`. They
 * agreed — swept over 9 block types x 10 y values x 13 overflow values,
 * 1170/1170 identical — but nothing made them agree, and neither was
 * exported, so no test could assert it.
 *
 * The drift that duplication invites is specific and silent: the shift
 * exists to stop a wrapped title colliding with the authors row, so if
 * someone later exempts `'authors'` in the renderer, the checker would
 * keep shifting it and the phantom collision this all fixes comes back —
 * with every test still green, because each copy is self-consistent.
 */
import type { Block } from '@postr/shared';

/**
 * The block's painted top.
 *
 * Every NON-title block shifts down by the title's overflow, so a title
 * that wrapped onto extra lines pushes the body down instead of covering
 * it. `titleOverflow` is in poster units — the same space as `b.y` —
 * because it comes from `offsetHeight`, a pre-transform layout metric,
 * and the canvas applies zoom with a CSS transform that does not affect it.
 *
 * 0 (or omitted) means no shift, which is the state whenever the title
 * fits its stored height.
 */
export function effectiveTop(b: Block, titleOverflow = 0): number {
  return b.type !== 'title' && titleOverflow > 0 ? b.y + titleOverflow : b.y;
}
