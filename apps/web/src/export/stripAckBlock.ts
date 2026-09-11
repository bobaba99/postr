/**
 * Paid-export pre-step: remove the seeded acknowledgement mark.
 *
 * `ensureAckBlock` seeds the mark (`ACK_BLOCK_ID`, a locked `logo`
 * block) into every doc the editor opens, regardless of plan — the
 * canvas is the same for everyone and the block is locked so it cannot
 * be pre-deleted. The editable exporters then walk `doc.blocks` and
 * write every logo through their ordinary image path, so without this
 * step a paid PPTX/LaTeX export still carried the Postr logo picture
 * while only the colophon honoured `paidPlan` (audit H-3).
 *
 * This is the ONE place that decision is made for the block, so both
 * writers (and any future one) consult the same predicate the colophon
 * uses — `shouldAttribute` — rather than each re-deriving it.
 *
 * Pure and conservative: on the free plan, or when the doc carries no
 * mark, the SAME object is returned so nothing downstream churns; on a
 * paid plan a NEW doc is returned with only that block removed. The
 * user's own logo blocks are never touched — identity is by id.
 */
import type { PosterDoc } from '@postr/shared';
import { ACK_BLOCK_ID, hasAckBlock } from './ackBlock';
import { shouldAttribute, type AttributionOptions } from './attribution';

export function stripAckBlock(doc: PosterDoc, options: AttributionOptions = {}): PosterDoc {
  if (shouldAttribute(options)) return doc;
  if (!hasAckBlock(doc)) return doc;
  return { ...doc, blocks: doc.blocks.filter((b) => b.id !== ACK_BLOCK_ID) };
}
