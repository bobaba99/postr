/**
 * Auto-Arrange (Layout tab): lay the poster's body out in columns, in its
 * reading order, with as little as possible past the bottom margin. The
 * owner approved this function on a prototype (docs/fixes/28-auto-arrange-lab.html;
 * record docs/fixes/28-auto-arrange.md): "uneven widths are okay, as long as
 * we find the minimal area overflow ... even a bit overflow is also okay,
 * they can manually adjust later".
 *
 * | Step | Rule |
 * |------|------|
 * | Fixed | The sheet, its 1 in margins, 0.6 in gaps, every font size, the reading order (readingOrder.ts), and the title, authors and logo blocks: they stay where they are. |
 * | Header | The title and the authors block when their top edge is in the top half of the sheet, and logos that start above the header's bottom. The body starts 0.6 in under it. |
 * | Footer | A title or authors block whose top edge is in the bottom half of the sheet (authors and affiliations along the foot): the body ends 0.6 in above it, not at the bottom margin. |
 * | Columns | k = the poster's columns now (left edges within 3 in, readingOrder.ts), but a column of one block that starts inside the column to its left (left of every block's right edge there: a block dragged part-way across) counts in that column (`posterColumns`). The number of columns does not change, unless the search leaves one empty. |
 * | Chosen | Where the reading order is cut into k consecutive columns (a block may move to the next or previous column, never out of order) and each column's width, on the grid and then refined in 0.05 in steps (arrangeColumns.ts). |
 * | Blocks | Every block takes its column's width. Its height is measured at that width (arrangeMeasure.ts): text wraps at its fixed size, a table wraps its cells, a figure keeps its shape exactly (its image area is not rounded) and its caption wraps. Blocks stack 0.6 in apart from 0.6 in under the header, so a second press measures the same heights and finds the same layout. |
 * | Overflow | When even the best layout runs past the bottom of the body, it is kept, and Issues says how many in² are past the bottom margin (`pastMarginArea`); a column running into a footer shows as overlapping blocks. |
 * | Logos below the header | Not arranged: they stay. The credit mark (a logo) moves to the nearest free spot (ackPlacement.ts) only when an arranged block now covers it; with none free, it stays. |
 * | Undo | One step (the caller's one `setBlocks`). No block moving further than 0.1 units (0.01 in): no step (`changesLayout`). |
 *
 * Out of scope (record 28 §10): shrinking or cropping a figure, a figure
 * spanning columns or narrower than its column (a wide band becomes one
 * column wide), changing the number of columns, keeping a heading with the
 * block under it, rotated blocks, logos inside the body.
 *
 * Pure: the caller measures (`drawnHeight`, `measure`, `lineMin`,
 * `tableMin`); this returns a new block list and never mutates.
 */
import type { Block } from '@postr/shared';
import { M, GAP, PX } from './constants';
import { effectiveTop } from './blockGeometry';
import { columnIndex, isHeaderBlock, readingOrder } from './readingOrder';
import { planColumns, refineColumns, refineWidths, widthsToMeasure, type ColumnPlan } from './arrangeColumns';
import { placeAckMark } from './ackPlacement';
import { ACK_BLOCK_ID } from '@/export/ackBlock';

/** The figure kinds: their image area keeps its shape at any width. */
export function keepsShape(b: Block): boolean {
  return b.type === 'image' || b.type === 'chart';
}

/** A figure's image area at width `w` (units): its stored shape. */
export function shapeHeight(b: Block, w: number): number {
  return b.w > 0 ? (w * b.h) / b.w : b.h;
}

export interface ArrangeInput {
  blocks: readonly Block[];
  /** Sheet size in poster units. */
  canvasWidth: number;
  canvasHeight: number;
  /** How far a grown title pushes every other block down (blockGeometry.ts). */
  titleOverflow: number;
  /** A block's height as drawn now (units). */
  drawnHeight: (b: Block) => number;
  /** Heights in inches of `body[i]` at a width in inches; `widthsIn` are measured up front. */
  measure: (body: readonly Block[], widthsIn: readonly number[]) => (i: number, wIn: number) => number;
  /** The width a body line holds 40 characters at (units). */
  lineMin: number;
  /** A table's minimum width (units). */
  tableMin: (b: Block) => number;
}

export interface ArrangeResult {
  /** The poster's blocks in their array order, the body moved. */
  blocks: Block[];
  plan: ColumnPlan | null;
  /** Area past the bottom margin, in in² (the plan's O). */
  pastMargin: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A title or authors block whose top edge is in the top half of the sheet: the header. */
const inHeader = (b: Block, canvasHeight: number, titleOverflow: number) =>
  (b.type === 'title' || b.type === 'authors') && effectiveTop(b, titleOverflow) < canvasHeight / 2;
/** A title or authors block whose top edge is in the bottom half: along the foot. */
const inFooter = (b: Block, canvasHeight: number, titleOverflow: number) =>
  (b.type === 'title' || b.type === 'authors') && effectiveTop(b, titleOverflow) >= canvasHeight / 2;

/** The header's drawn bottom (units): its title and authors, and logos starting above it. */
export function headerBottom(
  blocks: readonly Block[],
  titleOverflow: number,
  drawnHeight: (b: Block) => number,
  canvasHeight: number,
): number {
  const text = blocks.filter((b) => inHeader(b, canvasHeight, titleOverflow));
  if (text.length === 0) return M - GAP;
  let bottom = Math.max(...text.map((b) => effectiveTop(b, titleOverflow) + drawnHeight(b)));
  const logos = blocks.filter((b) => b.type === 'logo').sort((a, b) => a.y - b.y);
  for (const b of logos) {
    const top = effectiveTop(b, titleOverflow);
    if (top < bottom) bottom = Math.max(bottom, top + drawnHeight(b));
  }
  return bottom;
}

/** Where the body ends (units): the bottom margin, or 0.6 in above a title or authors block along the foot. */
export function bodyBottom(blocks: readonly Block[], canvasHeight: number, titleOverflow: number): number {
  const foot = blocks.filter((b) => inFooter(b, canvasHeight, titleOverflow));
  return Math.min(canvasHeight - M, ...foot.map((b) => effectiveTop(b, titleOverflow) - GAP));
}

/**
 * Auto-Arrange's column for each body block: readingOrder.ts's columns, but
 * a column of one block that starts inside the column to its left (left of
 * the right edge of every block there) counts in that column. A block
 * dragged part-way across its column (record 28 §9, review finding B-R2:
 * one dragged 5 in made a 3-column poster come back with 4) never adds one.
 */
export function posterColumns(body: readonly Block[]): Map<string, number> {
  const raw = columnIndex(body);
  const n = raw.size === 0 ? 0 : Math.max(...raw.values()) + 1;
  const members = Array.from({ length: n }, (_, c) => body.filter((b) => raw.get(b.id) === c));
  const eff: number[] = [];
  for (let c = 0; c < n; c += 1) {
    const lone = members[c]!.length === 1 ? members[c]![0]! : null;
    const inside = c > 0 && lone !== null && members[c - 1]!.every((o) => lone.x < o.x + o.w);
    eff.push(c === 0 ? 0 : inside ? eff[c - 1]! : eff[c - 1]! + 1);
  }
  return new Map(body.map((b) => [b.id, eff[raw.get(b.id)!]!]));
}

/** 0.01 in: a press that moves no block further than this changes nothing (no undo step). */
export const STILL = 0.1;

/** Does `after` move any block of `before` (same order) further than STILL? */
export function changesLayout(before: readonly Block[], after: readonly Block[]): boolean {
  if (before.length !== after.length) return true;
  const far = (a: number, b: number) => Math.abs(a - b) > STILL;
  return after.some((b, i) => {
    const was = before[i]!;
    return b.id !== was.id || far(b.x, was.x) || far(b.y, was.y) || far(b.w, was.w) || far(b.h, was.h);
  });
}

export function autoArrange(input: ArrangeInput): ArrangeResult {
  const { blocks, canvasWidth: W, canvasHeight: H, titleOverflow } = input;
  const body = readingOrder(blocks, W);
  if (body.length === 0) return { blocks: [...blocks], plan: null, pastMargin: 0 };

  const col = posterColumns(body);
  const k = Math.max(...col.values()) + 1;
  const top = headerBottom(blocks, titleOverflow, input.drawnHeight, H) + GAP;
  const bottom = bodyBottom(blocks, H, titleOverflow);
  const tables = body.filter((b) => b.type === 'table').map((b) => input.tableMin(b));
  const search = {
    n: body.length,
    k,
    bodyWidth: (W - 2 * M - (k - 1) * GAP) / PX,
    bodyHeight: (bottom - top) / PX,
    lineMin: input.lineMin / PX,
    tableMin: Math.max(0, ...tables) / PX,
    wasIn: body.map((b) => col.get(b.id)!),
  };
  // The grid (the prototype's search), then the refinement: its widths are
  // measured in a second pass, once the grid's choice is known.
  const onGrid = input.measure(body, widthsToMeasure(search));
  const grid = planColumns({ ...search, heightAt: onGrid });
  const known = new Set(widthsToMeasure(search).map((w) => w.toFixed(3)));
  const more = refineWidths(search, grid).filter((w) => !known.has(w.toFixed(3)));
  const refined = more.length > 0 ? input.measure(body, more) : null;
  const heightAt = (i: number, w: number) => (refined && !known.has(w.toFixed(3)) ? refined : onGrid)(i, w);
  const plan = refineColumns({ ...search, heightAt }, grid);

  const placed = new Map<string, Block>();
  const drawn = new Map<string, { y: number; h: number }>();
  let x = M;
  for (const c of plan.cols) {
    const w = c.w * PX;
    let y = top;
    for (const i of c.idx) {
      const b = body[i]!;
      const h = heightAt(i, c.w) * PX;
      // A figure keeps its shape exactly: its image area at the width it is
      // stored at (to 0.01 units), not rounded. Rounded, its shape changed by
      // up to 0.005 units in its height, a second press measured it a hair
      // different at other widths, and on a poster with three figures that
      // was enough to pick other widths (record 28 §9, review finding B-R7).
      const stored = keepsShape(b) ? shapeHeight(b, r2(w)) : r2(h);
      // Stored y is the drawn y less the grown title's push (effectiveTop).
      const shift = effectiveTop(b, titleOverflow) - b.y;
      placed.set(b.id, { ...b, x: r2(x), y: r2(y - shift), w: r2(w), h: stored });
      drawn.set(b.id, { y, h });
      y += h + GAP;
    }
    x += w + GAP;
  }
  const moved = blocks.map((b) => placed.get(b.id) ?? b);
  return { blocks: freeCreditMark(moved, drawn, input), plan, pastMargin: plan.O };
}

/** The credit mark, moved to the nearest free spot if a block now covers it. */
function freeCreditMark(
  blocks: Block[],
  arranged: ReadonlyMap<string, { y: number; h: number }>,
  input: ArrangeInput,
): Block[] {
  const mark = blocks.find((b) => b.id === ACK_BLOCK_ID);
  if (!mark) return blocks;
  // Everything as drawn: arranged blocks where they will be, the rest now.
  const asDrawn = (b: Block): Block => {
    const a = arranged.get(b.id);
    return a ? { ...b, y: a.y, h: a.h } : { ...b, y: effectiveTop(b, input.titleOverflow), h: input.drawnHeight(b) };
  };
  const others = blocks.filter((b) => b.id !== ACK_BLOCK_ID).map(asDrawn);
  const m = asDrawn(mark);
  const covered = others.some(
    (o) => arranged.has(o.id) && o.x < m.x + m.w && m.x < o.x + o.w && o.y < m.y + m.h && m.y < o.y + o.h,
  );
  if (!covered) return blocks;
  const spot = placeAckMark(others, input.canvasWidth, input.canvasHeight);
  if (!spot) return blocks;
  const shift = effectiveTop(mark, input.titleOverflow) - mark.y;
  return blocks.map((b) => (b.id === ACK_BLOCK_ID ? { ...b, x: spot.x, y: spot.y - shift, w: spot.w, h: spot.h } : b));
}

/**
 * Area (in²) of the columns past the bottom margin, as drawn: per column
 * (readingOrder.ts), the widest block reaching past the margin times how far
 * the lowest block reaches. Right after Auto-Arrange it is the plan's O.
 */
export function pastMarginArea(
  blocks: readonly Block[],
  canvasHeight: number,
  titleOverflow: number,
  drawnHeight: (b: Block) => number,
): number {
  const body = blocks.filter((b) => !isHeaderBlock(b));
  const col = columnIndex(body);
  const line = canvasHeight - M;
  const low = new Map<number, { w: number; bottom: number }>();
  for (const b of body) {
    const bottom = effectiveTop(b, titleOverflow) + drawnHeight(b);
    if (bottom <= line) continue;
    const c = col.get(b.id)!;
    const cur = low.get(c);
    low.set(c, { w: Math.max(cur?.w ?? 0, b.w), bottom: Math.max(cur?.bottom ?? 0, bottom) });
  }
  let area = 0;
  for (const { w, bottom } of low.values()) area += w * (bottom - line);
  return area / (PX * PX);
}
