/**
 * ackPlacement — where the acknowledgement mark goes on the canvas.
 *
 * The owner's constraint is that the mark must look like it belongs
 * on the poster, not like a sticker applied afterwards. Two rules
 * follow from that, in priority order:
 *
 *   1. CLUSTER. If the poster already carries logo blocks, the mark
 *      joins that row: same size, same vertical centre, one
 *      consistent gap from the nearest edge. A small square sitting
 *      alone in a corner reads as vendor branding; the same square
 *      third in a row of institutional logos reads as one more
 *      affiliation, which is what it is.
 *
 *   2. Only with no logos to join does it fall back to empty space —
 *      preferring the bottom margin band at `x: M`, the column every
 *      template gives its references block, so it still lands in the
 *      band where a reader expects furniture rather than content.
 *
 * ── Invariants, asserted with exact numbers in the tests ─────────
 *   - the returned rect NEVER overlaps any existing block
 *   - the returned rect NEVER leaves the canvas, and never leaves the
 *     `M` print margin — both strategies share one placeability test,
 *     so neither can put the mark in the trim area a large-format
 *     printer cuts off
 *   - NO other block's x/y/w/h changes — this module is pure and
 *     returns only the new rect; it has no access to the block list
 *     to mutate even if it wanted to
 *   - returns null rather than forcing a placement when the poster
 *     is genuinely full, so a crowded poster degrades to the
 *     references-line credit instead of gaining an overlapping square
 *
 * Geometry is deliberately shared with the rest of the poster layer:
 * `M`/`GAP` from constants, `snap` from snap.ts, and the same
 * axis-aligned rect overlap test `boundsCheck`/`findOpenSlot` use.
 * There is no third geometry implementation here.
 */
import type { Block } from '@postr/shared';
import { M, GAP } from './constants';
import { snap } from './snap';

/**
 * Side of the acknowledgement mark in poster units (1 unit = 0.1in),
 * used when there are no logos to match. 12 units = 1.2 inches — the
 * scale of a small institutional logo, well under the 18pt caption
 * floor's visual weight, and large enough that the mark is still
 * legible from reading distance on a printed sheet.
 */
export const ACK_MARK_SIZE = 12;

/** Smallest mark we will shrink to when matching a tiny logo row. */
const MIN_MARK_SIZE = 6;
/** Largest mark we will grow to when matching an oversized logo. */
const MAX_MARK_SIZE = 24;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AckPlacement extends Rect {
  /**
   * How the position was chosen. Exposed for tests and for the
   * editor's "why is this here" affordance — never shown as copy.
   */
  strategy: 'cluster' | 'empty-region';
}

/** Axis-aligned overlap, matching PosterEditor's `findOpenSlot`. */
function overlaps(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

/**
 * Inside the print margin, not merely inside the sheet.
 *
 * Large-format printers routinely trim 0.25–0.5in, so a rect flush to
 * the canvas edge prints clipped or is lost entirely. `M` is the same
 * margin every layout template reserves, so a mark inside it sits in
 * the band a reader already reads as furniture.
 *
 * This is the SINGLE placeability bound — both strategies test against
 * it, so they cannot disagree about what "placeable" means.
 */
function withinMargins(r: Rect, canvasW: number, canvasH: number): boolean {
  return (
    r.x >= M && r.y >= M && r.x + r.w <= canvasW - M && r.y + r.h <= canvasH - M
  );
}

/** A rect is placeable when it is inside the margins and hits nothing. */
function isFree(
  r: Rect,
  blocks: readonly Block[],
  canvasW: number,
  canvasH: number,
): boolean {
  if (!withinMargins(r, canvasW, canvasH)) return false;
  return !blocks.some((b) => overlaps(r, b));
}

/**
 * Snap `value` to the grid, then pull it back inside `[lo, hi]`.
 *
 * `snap` can round a legal coordinate up past the margin (a bottom-band
 * y of 338 snaps to 340, which on a 360-tall canvas overruns the 1-inch
 * foot margin by 2 units). Clamping after snapping keeps the grid
 * alignment where it is legal and gives up the grid, not the margin,
 * where it is not.
 */
function snapWithin(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, snap(value)));
}

/**
 * Clamp a candidate mark size into the range where it still reads as
 * a peer of the logo row rather than a competing element.
 */
function clampMarkSize(size: number): number {
  return Math.max(MIN_MARK_SIZE, Math.min(MAX_MARK_SIZE, Math.round(size)));
}

/**
 * Try to seat the mark alongside an existing logo row.
 *
 * "Row" = the set of logo blocks whose vertical spans overlap the
 * tallest logo's span. Posters put their institutional logos in a
 * band, so vertical overlap is a better grouping signal than exact
 * y equality (a 2-unit misalignment is common and should not split
 * the row).
 *
 * The mark is sized to the row's median logo height (clamped), and
 * vertically centred on the row so it sits on the same optical line.
 * It is offered first to the right of the rightmost logo, then to the
 * left of the leftmost — whichever is free. Gap is `GAP`, the same
 * spacing constant the column packer uses, so the rhythm matches.
 */
function placeByCluster(
  blocks: readonly Block[],
  canvasW: number,
  canvasH: number,
): AckPlacement | null {
  const logos = blocks.filter((b) => b.type === 'logo');
  if (logos.length === 0) return null;

  // Anchor on the largest logo, then take every logo whose vertical
  // span overlaps it — that is the row.
  const anchor = logos.reduce((best, b) => (b.h > best.h ? b : best), logos[0]!);
  const row = logos.filter(
    (b) => b.y < anchor.y + anchor.h && anchor.y < b.y + b.h,
  );

  const heights = row.map((b) => b.h).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] ?? ACK_MARK_SIZE;
  const size = clampMarkSize(median);

  // Optical centre of the row, so the mark's midline matches theirs.
  const rowTop = Math.min(...row.map((b) => b.y));
  const rowBottom = Math.max(...row.map((b) => b.y + b.h));
  const centreY = (rowTop + rowBottom) / 2;
  // A logo row hugging the top or bottom trim would otherwise drag the
  // mark out of the margin band with it. Clamp into the band so the row
  // still yields an in-margin mark instead of falling through to the
  // fallback (which would break the cluster the row exists to form).
  const y = snapWithin(centreY - size / 2, M, canvasH - M - size);

  const rightMost = Math.max(...row.map((b) => b.x + b.w));
  const leftMost = Math.min(...row.map((b) => b.x));

  const candidates: Rect[] = [
    { x: snap(rightMost + GAP), y, w: size, h: size },
    { x: snap(leftMost - GAP - size), y, w: size, h: size },
  ];

  for (const c of candidates) {
    if (isFree(c, blocks, canvasW, canvasH)) {
      return { ...c, strategy: 'cluster' };
    }
  }
  return null;
}

/**
 * Fallback: scan for genuinely empty space on a coarse grid.
 *
 * Candidates are generated in preference order rather than scored,
 * because "preferred" here is a specific owner instruction, not a
 * quality metric:
 *   1. the bottom margin band at `x: M` — the references column,
 *      where a funding line or a logo already lives
 *   2. the rest of the bottom band, left to right
 *   3. anywhere else, scanned bottom-up (a mark low on the poster is
 *      furniture; a mark high on the poster is an intrusion)
 *
 * The scan step is `SNAP_GRID`-aligned via `snap` so the mark lands
 * on the same grid a dragged block would.
 */
function placeByEmptyRegion(
  blocks: readonly Block[],
  canvasW: number,
  canvasH: number,
): AckPlacement | null {
  const size = ACK_MARK_SIZE;
  // Poster too small to host the mark inside its margins at all.
  if (canvasW < size + M * 2 || canvasH < size + M * 2) return null;

  const maxX = canvasW - M - size;
  const maxY = canvasH - M - size;
  const bandY = snapWithin(maxY, M, maxY);

  // 1. The references column in the bottom margin band.
  const preferred: Rect = { x: M, y: bandY, w: size, h: size };
  if (isFree(preferred, blocks, canvasW, canvasH)) {
    return { ...preferred, strategy: 'empty-region' };
  }

  const step = GAP;

  // 2. The rest of the bottom band, left to right.
  // `isFree` now owns the margin bound, so the scans no longer need
  // their own inline `> canvasW - M` guards — they clamp instead, which
  // keeps the last column and the last row reachable rather than
  // skipping them.
  for (let x = M; x <= maxX; x += step) {
    const r: Rect = { x: snapWithin(x, M, maxX), y: bandY, w: size, h: size };
    if (isFree(r, blocks, canvasW, canvasH)) {
      return { ...r, strategy: 'empty-region' };
    }
  }

  // 3. Anywhere else, bottom-up.
  for (let y = maxY; y >= M; y -= step) {
    for (let x = M; x <= maxX; x += step) {
      const r: Rect = {
        x: snapWithin(x, M, maxX),
        y: snapWithin(y, M, maxY),
        w: size,
        h: size,
      };
      if (isFree(r, blocks, canvasW, canvasH)) {
        return { ...r, strategy: 'empty-region' };
      }
    }
  }

  return null;
}

/**
 * Choose the acknowledgement mark's rect for this poster.
 *
 * Pure. Returns `null` when there is nowhere the mark can sit without
 * overlapping content or leaving the canvas — the caller then ships
 * the references-line credit alone rather than damaging the layout.
 *
 * @param blocks every existing block, in poster units
 * @param canvasW canvas width in poster units
 * @param canvasH canvas height in poster units
 */
export function placeAckMark(
  blocks: readonly Block[],
  canvasW: number,
  canvasH: number,
): AckPlacement | null {
  return (
    placeByCluster(blocks, canvasW, canvasH) ??
    placeByEmptyRegion(blocks, canvasW, canvasH)
  );
}
