/**
 * The poster's ONE reading order (docs/launch/mvp-editor/bounded-designs.md
 * §3.5 A; record docs/fixes/28-auto-arrange.md).
 *
 * Heading numbers, "Figure N." and "Table N." and Auto-Arrange all read the
 * poster in this order, in the editor and in every export. Before it there
 * were three: headings followed the `doc.blocks` array (which is also paint
 * order, so Bring Forward renumbered them and a pasted heading took the last
 * number wherever it landed), figures and tables followed top edge then left
 * edge (so a 3-column poster numbered them across the columns), and
 * Auto-Arrange re-sorted the array top-then-left.
 *
 * | Step        | Rule |
 * |-------------|------|
 * | Which blocks | Every block except the title, the authors block and logos (the credit mark is a logo). |
 * | Columns     | Left edges within 3 in of a column's leftmost left edge are that column; columns left to right. |
 * | Wide blocks | A block at least 90 % as wide as the space inside the margins is a band of its own; wide blocks split the poster into bands by top edge. |
 * | Order       | Bands top to bottom; in a band, columns left to right; in a column, top edge first. |
 *
 * After Auto-Arrange there are no wide blocks, so the order is plain
 * column-major: by column, then top to bottom. Paint order (the array) is
 * never read.
 *
 * Pure: reads geometry, never writes it.
 */
import type { Block } from '@postr/shared';
import { M } from './constants';

/** 3 in: blocks whose left edges are this close share a column. */
export const COLUMN_TOLERANCE = 30;
/** A block this share of the width inside the margins, or more, is a band of its own. */
export const WIDE_SHARE = 0.9;

/** Blocks that are not read: the title, the authors block and logos. */
export function isHeaderBlock(b: Block): boolean {
  return b.type === 'title' || b.type === 'authors' || b.type === 'logo';
}

/**
 * Each block's column (0 = leftmost), by left edge: a block starts a new
 * column when its left edge is more than 3 in right of the current column's
 * leftmost edge.
 */
export function columnIndex(blocks: readonly Block[]): Map<string, number> {
  const byX = [...blocks].sort((a, b) => a.x - b.x);
  const out = new Map<string, number>();
  let col = -1;
  let start = -Infinity;
  for (const b of byX) {
    if (b.x - start > COLUMN_TOLERANCE) {
      col += 1;
      start = b.x;
    }
    out.set(b.id, col);
  }
  return out;
}

/** The poster's body blocks in reading order. */
export function readingOrder(blocks: readonly Block[], canvasWidth: number): Block[] {
  const body = blocks.filter((b) => !isHeaderBlock(b));
  const col = columnIndex(body);
  const wideFrom = (canvasWidth - 2 * M) * WIDE_SHARE;
  const isWide = (b: Block) => b.w >= wideFrom;
  const arrayAt = new Map(blocks.map((b, i) => [b.id, i]));
  const wide = body.filter(isWide).sort((a, b) => a.y - b.y || arrayAt.get(a.id)! - arrayAt.get(b.id)!);
  // A block's band: how many wide blocks start at or above its top edge.
  const bandOf = (b: Block) => wide.filter((w) => w.y <= b.y).length;
  const narrow = body.filter((b) => !isWide(b));
  const byColumn = (a: Block, b: Block) =>
    col.get(a.id)! - col.get(b.id)! || a.y - b.y || a.x - b.x || arrayAt.get(a.id)! - arrayAt.get(b.id)!;
  const out: Block[] = [];
  for (let band = 0; band <= wide.length; band += 1) {
    out.push(...narrow.filter((b) => bandOf(b) === band).sort(byColumn));
    if (band < wide.length) out.push(wide[band]!);
  }
  return out;
}

export interface BlockNumbers {
  /** Section number of each heading block, by id. */
  headings: Record<string, number>;
  /** "Figure N." (image and chart blocks) and "Table N." numbers, by id. */
  captions: Record<string, number>;
}

/** Heading, figure and table numbers, all in reading order. */
export function numberBlocks(blocks: readonly Block[], canvasWidth: number): BlockNumbers {
  const headings: Record<string, number> = {};
  const captions: Record<string, number> = {};
  let heading = 0;
  let figure = 0;
  let table = 0;
  for (const b of readingOrder(blocks, canvasWidth)) {
    if (b.type === 'heading') headings[b.id] = ++heading;
    // Charts are figures: they share the "Figure N." sequence with images.
    else if (b.type === 'image' || b.type === 'chart') captions[b.id] = ++figure;
    else if (b.type === 'table') captions[b.id] = ++table;
  }
  return { headings, captions };
}
