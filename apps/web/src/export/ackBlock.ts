/**
 * The acknowledgement block — construction and re-injection.
 *
 * Ties the three pieces together: `ackPlacement` decides WHERE,
 * `ackMark` supplies WHAT, and `Block.locked` makes it stay. This
 * module is the only place a caller needs to touch.
 *
 * ── Why the block is `type: 'logo'` ──────────────────────────────
 * Not a new block type, deliberately. A `logo` block already renders
 * an `imageSrc` at a fixed frame, already exports through every
 * writer's image path, and already clusters with the other logos in
 * `ackPlacement`'s row detection. A bespoke `type: 'ack'` would need
 * a renderer, four export branches and a schema bump, and would gain
 * nothing — the block genuinely IS a logo.
 */
import type { Block, PosterDoc } from '@postr/shared';
import { placeAckMark, type Rect } from '@/poster/ackPlacement';
import { M } from '@/poster/constants';
import { ackMarkDataUri } from './ackMark';
import { shouldAttribute, type AttributionOptions } from './attribution';

/**
 * Fixed id. Identity is by id, not by content, so a user who moves,
 * resizes or restyles the mark still has THE mark — and a bundle that
 * already carries it is recognised without matching on pixels.
 */
export const ACK_BLOCK_ID = '__postr_ack_mark__';

/** True when this doc already carries the acknowledgement mark. */
export function hasAckBlock(doc: Pick<PosterDoc, 'blocks'>): boolean {
  return doc.blocks.some((b) => b.id === ACK_BLOCK_ID);
}

/**
 * Build the acknowledgement block for a poster, or `null` when there
 * is nowhere it can sit without overlapping content or leaving the
 * canvas. A null return is not a failure — the references-line credit
 * carries the acknowledgement on its own in that case.
 *
 * Pure: reads `doc.blocks` and returns a new block. Never mutates,
 * and never returns anything that could change another block.
 */
export function makeAckBlock(
  doc: Pick<PosterDoc, 'blocks' | 'widthIn' | 'heightIn'>,
  pxPerInch = 10,
): Block | null {
  const canvasW = doc.widthIn * pxPerInch;
  const canvasH = doc.heightIn * pxPerInch;
  const placement = placeAckMark(doc.blocks, canvasW, canvasH);
  if (!placement) return null;

  return {
    id: ACK_BLOCK_ID,
    type: 'logo',
    x: placement.x,
    y: placement.y,
    w: placement.w,
    h: placement.h,
    content: '',
    imageSrc: ackMarkDataUri(),
    imageFit: 'contain',
    tableData: null,
    locked: true,
  };
}

/**
 * Return a doc that carries the acknowledgement mark, adding it only
 * when absent.
 *
 * Idempotent: calling it twice, or on a doc that already round-tripped
 * through export and import, produces no second block and no change
 * of any kind — the same doc object's blocks are returned untouched
 * when the mark is already there.
 *
 * Never repositions, resizes or removes an existing block.
 */
export function ensureAckBlock(
  doc: PosterDoc,
  options: AttributionOptions = {},
  pxPerInch = 10,
): PosterDoc {
  if (!shouldAttribute(options)) return doc;
  if (hasAckBlock(doc)) return doc;
  const block = makeAckBlock(doc, pxPerInch);
  if (!block) return doc;
  return { ...doc, blocks: [...doc.blocks, block] };
}

/** Axis-aligned overlap, matching `ackPlacement`'s test. */
function overlaps(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

/**
 * Return a doc whose acknowledgement mark is valid for ITS OWN canvas.
 *
 * ── Why this exists ──────────────────────────────────────────────
 * `Block.locked` preserves the mark's identity across whole-list
 * replacements, and `preserveLocked` restores it verbatim — coordinates
 * included. That is correct while the canvas is fixed, and wrong the
 * moment it is not. A rect is only meaningful in the coordinate space
 * it was computed in: a mark placed at y = 460 on a 36×48 sheet is 112
 * units past the bottom edge of a 24×36 one, and a mark preserved
 * through a template swap can land squarely on top of new content.
 *
 * So every write that changes `widthIn`/`heightIn`, or that replaces
 * the block list wholesale, runs the result through here. The mark is
 * re-placed against the NEW geometry — same block, same id, same
 * locked flag, new rect — rather than restored from a coordinate space
 * that no longer exists.
 *
 * Idempotent and conservative: a mark that is still legal where it sits
 * is returned untouched, so a user who deliberately dragged the mark
 * keeps their position through any change that does not invalidate it.
 * When the new canvas has nowhere legal at all, the mark is dropped and
 * the references-line credit carries the acknowledgement alone — the
 * same degradation `makeAckBlock` already chooses over a bad placement.
 *
 * Pure: returns a new doc, never mutates, and never moves any block
 * other than the acknowledgement mark.
 */
export function replaceAckBlock(doc: PosterDoc, pxPerInch = 10): PosterDoc {
  const existing = doc.blocks.find((b) => b.id === ACK_BLOCK_ID);
  if (!existing) return doc;

  const canvasW = doc.widthIn * pxPerInch;
  const canvasH = doc.heightIn * pxPerInch;
  const others = doc.blocks.filter((b) => b.id !== ACK_BLOCK_ID);

  const stillLegal =
    existing.x >= M &&
    existing.y >= M &&
    existing.x + existing.w <= canvasW - M &&
    existing.y + existing.h <= canvasH - M &&
    !others.some((b) => overlaps(existing, b));
  if (stillLegal) return doc;

  const placement = placeAckMark(others, canvasW, canvasH);
  if (!placement) return { ...doc, blocks: others };

  return {
    ...doc,
    blocks: others.concat({
      ...existing,
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h,
    }),
  };
}
