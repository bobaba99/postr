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

/**
 * How close to a sheet edge still counts as on it. Positions are stored to
 * a hundredth of a unit, so a turned block's drawn edge can land half a
 * hundredth past an edge it is flush with (its centre falls on a half
 * hundredth); anything further is past the edge. Upright blocks' edges are
 * whole hundredths, so this changes nothing for them.
 */
export const ON_EDGE = 0.005 + 1e-9;

/**
 * The box a block covers on the sheet as drawn: the renderer turns it by
 * `rotation` degrees about its centre (CSS `rotate`, origin centre).
 *
 * An upright block, or one turned by a multiple of 180°, covers exactly its
 * own box, computed from x and w directly so a flush edge stays exact.
 * Otherwise cosine and sine are snapped to 12 decimals, so a quarter turn is
 * exact: cos 90° is 6e-17 in floating point, which would put a flush label's
 * drawn edge a hair past the sheet.
 */
export function drawnBox(
  x: number,
  y: number,
  w: number,
  h: number,
  rotation?: unknown,
): { left: number; top: number; right: number; bottom: number } {
  const deg = turn(rotation);
  if (deg % 180 === 0) return { left: x, top: y, right: x + w, bottom: y + h };
  const { cos, sin } = axes(deg);
  const c = Math.abs(cos);
  const s = Math.abs(sin);
  const hw = (w * c + h * s) / 2;
  const hh = (w * s + h * c) / 2;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return { left: cx - hw, top: cy - hh, right: cx + hw, bottom: cy + hh };
}

/**
 * A block's rotation in degrees, read the way the canvas draws it: the
 * renderer writes `rotate(${rotation}deg)`, which CSS turns for a number or
 * a numeric string ("30") and ignores for anything else. So a numeric string
 * is its number (round-7 audit, A7-6), and anything else (a damaged row, an
 * unchecked import) is upright; used as stored it made every geometry check
 * NaN (last-round verification F3).
 */
export function turn(rotation: unknown): number {
  const n = typeof rotation === 'string' && rotation.trim() !== '' ? Number(rotation) : rotation;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/** cos and sin of `deg`, snapped to 12 decimals so quarter turns are exact. */
function axes(deg: number): { cos: number; sin: number } {
  const t = (deg * Math.PI) / 180;
  const snap = (v: number) => Math.round(v * 1e12) / 1e12;
  return { cos: snap(Math.cos(t)), sin: snap(Math.sin(t)) };
}

type Rect = { x: number; y: number; w: number; h: number; rotation?: unknown };

/**
 * How deeply two blocks overlap as drawn: the smallest overlap of their
 * outlines along any of their four side directions (the separating-axis
 * test), or 0 or less when some direction separates them. Exact for any
 * rotation; for two upright blocks it is the smaller of the x and y overlaps.
 * Checking the bounding boxes of turned blocks reported blocks inches apart
 * as overlapping (last-round verification F1).
 */
export function drawnOverlap(a: Rect, b: Rect): number {
  // Upright and quarter-turned blocks are drawn as their boxes, and the box
  // overlap is exact; computed from x and x + w it is also the old test, to
  // the last bit (centres gave 2.000000000000057 for an overlap of exactly
  // 2.00, and flipped the tolerance: round-7 audit, R7L-5). For any pair, the
  // boxes' overlap bounds the outlines', so boxes apart are outlines apart:
  // the far pairs of a drag skip the exact test (it was 34 to 134 times
  // slower per call, R7L-4).
  const A = drawnBox(a.x, a.y, a.w, a.h, a.rotation);
  const B = drawnBox(b.x, b.y, b.w, b.h, b.rotation);
  const boxes = Math.min(
    Math.min(A.right, B.right) - Math.max(A.left, B.left),
    Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top),
  );
  if (boxes <= 0 || (turn(a.rotation) % 90 === 0 && turn(b.rotation) % 90 === 0)) return boxes;
  const corners = (r: Rect) => {
    const { cos, sin } = axes(turn(r.rotation));
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const ux = (cos * r.w) / 2;
    const uy = (sin * r.w) / 2;
    const vx = (-sin * r.h) / 2;
    const vy = (cos * r.h) / 2;
    return [
      [cx + ux + vx, cy + uy + vy],
      [cx + ux - vx, cy + uy - vy],
      [cx - ux + vx, cy - uy + vy],
      [cx - ux - vx, cy - uy - vy],
    ] as const;
  };
  const ca = corners(a);
  const cb = corners(b);
  let depth = Infinity;
  for (const r of [a, b]) {
    const { cos, sin } = axes(turn(r.rotation));
    for (const [ax, ay] of [
      [cos, sin],
      [-sin, cos],
    ] as const) {
      const project = (cs: typeof ca) => cs.map(([px, py]) => px * ax + py * ay);
      const pa = project(ca);
      const pb = project(cb);
      depth = Math.min(depth, Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)));
    }
  }
  return depth;
}
