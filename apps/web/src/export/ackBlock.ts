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
import { placeAckMark } from '@/poster/ackPlacement';
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
