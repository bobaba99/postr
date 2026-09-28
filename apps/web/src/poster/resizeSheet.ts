/**
 * Moving a poster onto a sheet of another size, keeping every block.
 *
 * Changing the size used to rebuild the poster from the three-column
 * template and keep only locked blocks, so every block the user had written
 * was thrown away (docs/fixes/02-poster-size.md). The owner's decision is
 * that a size change keeps the poster: each block keeps its content and
 * moves to the same position RELATIVE to the sheet.
 */
import type { Block, PosterDoc } from '@postr/shared';
import { ACK_BLOCK_ID, replaceAckBlock } from '@/export/ackBlock';
import { ON_EDGE, drawnBox, turn } from './blockGeometry';
import { PX } from './constants';

/** Two decimals of a poster unit (a thousandth of an inch) is plenty. */
const round = (v: number) => Math.round(v * 100) / 100;

type Box = Pick<Block, 'x' | 'y' | 'w' | 'h'>;

/**
 * An upright block, or one turned by 180° (it covers the same box): its
 * EDGES are scaled and rounded, and the size follows from them. Rounding x
 * and w separately let a block flush with the right edge land 0.01 past the
 * new one, which ISSUES then flagged as cut off. A block that fitted inside
 * the old sheet is kept inside the new one.
 */
function scaleUpright(b: Block, sx: number, sy: number, fromW: number, fromH: number, toW: number, toH: number): Box {
  const x = round(b.x * sx);
  const y = round(b.y * sy);
  let w = round(round((b.x + b.w) * sx) - x);
  let h = round(round((b.y + b.h) * sy) - y);
  if (b.x + b.w <= fromW && x + w > toW) w = round(toW - x);
  if (b.y + b.h <= fromH && y + h > toH) h = round(toH - y);
  return { x, y, w, h };
}

/**
 * A turned block (any angle but a multiple of 180°, where the drawn box is
 * the stored box): its centre moves with the sheet, and each side stretches
 * by a blend of the two factors, weighted by how far that side lies along
 * each axis. The width stretches by sx^cos²θ · sy^sin²θ, the height by the
 * reverse. So a side label turned 90° shows its width down the sheet, and
 * its width scales with the height factor; scaling its box as if upright
 * pushed it past the edge and halved its length on screen.
 *
 * A blend of powers is undone exactly by the reverse change. The earlier
 * rule, the length of the scaled side, was not: a 45° block grew by 17% per
 * side on every landscape↔portrait round trip (re-check of fix 02, BG-1).
 *
 * A block drawn inside the old sheet is kept inside the new one. Rounding
 * can put its drawn edge a hundredth past, so it is moved back.
 */
function scaleTurned(b: Block, sx: number, sy: number, fromW: number, fromH: number, toW: number, toH: number): Box {
  const t = (turn(b.rotation) * Math.PI) / 180;
  const c2 = Math.cos(t) ** 2;
  const s2 = 1 - c2;
  const w = round(b.w * sx ** c2 * sy ** s2);
  const h = round(b.h * sx ** s2 * sy ** c2);
  let x = round((b.x + b.w / 2) * sx - w / 2);
  let y = round((b.y + b.h / 2) * sy - h / 2);
  const was = drawnBox(b.x, b.y, b.w, b.h, b.rotation);
  const now = drawnBox(x, y, w, h, b.rotation);
  if (was.left >= -ON_EDGE && was.right <= fromW + ON_EDGE) x = round(x + backInside(now.left, now.right, toW));
  if (was.top >= -ON_EDGE && was.bottom <= fromH + ON_EDGE) y = round(y + backInside(now.top, now.bottom, toH));
  return { x, y, w, h };
}

/**
 * How far to move a drawn span [lo, hi] so it lies within [0, size], in
 * whole hundredths away from the edge it crosses. 0 when it already fits, or
 * when it is wider than the sheet and cannot.
 */
function backInside(lo: number, hi: number, size: number): number {
  if (hi - lo > size) return 0;
  if (hi > size) return -Math.ceil((hi - size) * 100) / 100;
  if (lo < 0) return Math.ceil(-lo * 100) / 100;
  return 0;
}

/**
 * The poster on a `widthIn` × `heightIn` sheet.
 *
 * - x and w scale with the width, y and h with the height, so a block a
 *   third of the way across stays a third of the way across, and a
 *   three-column layout stays three columns. A turned block keeps its
 *   centre's relative position and stretches along its own sides, in a way
 *   the reverse change undoes exactly.
 * - Nothing else changes: text sizes, caption gaps, table column widths
 *   (percentages) and image crops (percentages) are not sheet geometry.
 *   The ISSUES panel points out any block that no longer fits.
 * - The credit mark keeps its size when it moves: only its position scales.
 *   If that spot is not legal on the new sheet, `replaceAckBlock` places it
 *   again by the same rule as when the poster was opened (which sizes it to
 *   match a row of logos when there is one), or drops it when there is no
 *   room at all.
 *
 * Pure: returns a new doc. A doc with no usable size of its own is moved
 * as if it already had the new size, i.e. its blocks keep their coordinates.
 */
export function moveOntoSheet(doc: PosterDoc, widthIn: number, heightIn: number): PosterDoc {
  const sx = doc.widthIn > 0 ? widthIn / doc.widthIn : 1;
  const sy = doc.heightIn > 0 ? heightIn / doc.heightIn : 1;
  // Sheet sizes in poster units.
  const [fromW, fromH, toW, toH] = [doc.widthIn * PX, doc.heightIn * PX, widthIn * PX, heightIn * PX];
  const blocks = doc.blocks.map((b): Block => {
    if (b.id === ACK_BLOCK_ID) return { ...b, x: round(b.x * sx), y: round(b.y * sy) };
    const box =
      turn(b.rotation) % 180 === 0
        ? scaleUpright(b, sx, sy, fromW, fromH, toW, toH)
        : scaleTurned(b, sx, sy, fromW, fromH, toW, toH);
    return { ...b, ...box };
  });
  return replaceAckBlock({ ...doc, widthIn, heightIn, blocks });
}

/** "36 × 48 in" — the size as the confirmation dialog states it. */
export function formatSheetSize(widthIn: number, heightIn: number): string {
  const inches = (n: number) => String(Math.round(n * 10) / 10);
  return `${inches(widthIn)} × ${inches(heightIn)} in`;
}

/** The custom-size fields accept 10 to 100 inches, as their min/max say. */
export const SHEET_MIN_IN = 10;
export const SHEET_MAX_IN = 100;

/**
 * Parse what the user typed into a width or height field.
 * Returns the size in inches, or null when it is not a usable size.
 */
export function parseSheetInches(typed: string): number | null {
  const n = Number(typed.trim());
  if (!Number.isFinite(n) || n < SHEET_MIN_IN || n > SHEET_MAX_IN) return null;
  return Math.round(n * 10) / 10;
}
