/**
 * Locked-block enforcement — the single guard every delete path runs
 * a candidate set through before it writes back to the store.
 *
 * ── Why a shared module and not a check per call site ────────────
 * `Block.locked` (packages/shared) is a marker, not a mechanism:
 * TypeScript cannot stop `blocks.filter()`. Enforcement therefore has
 * to live at the call sites — and there are six of them (keyboard
 * handler, block-frame delete button, context menu, sidebar control,
 * multi-select batch, store `removeBlock`). Six hand-written
 * `if (b.locked)` checks is six chances to miss one, and the one that
 * gets missed is the one a user finds.
 *
 * So the guard is written once here and imported everywhere. Adding a
 * seventh delete path and forgetting to call `filterDeletable` is
 * still possible, but the test suite has one case per path, so a new
 * path without a test is visible in review.
 *
 * ── Refusal, not silence ─────────────────────────────────────────
 * A delete that quietly does nothing reads as a bug. Every refusal
 * returns `refusalMessage` so the caller can surface it in the same
 * toast the rest of the editor uses. The copy is plain and states the
 * bargain — it does not lecture, and it does not advertise a tier
 * that does not exist.
 */
import type { Block } from '@postr/shared';

/**
 * Refusal copy, in the house voice. States the exchange in one line
 * and stops. Deliberately NOT "you can't do that" (scolding) and NOT
 * "upgrade to remove" (there is no paid tier to upgrade to).
 */
export const LOCKED_BLOCK_REFUSAL = 'Postr is free — this credit stays on the poster.';

/** True when a block refuses deletion. */
export function isLocked(block: Pick<Block, 'locked'>): boolean {
  return block.locked === true;
}

export interface DeletionOutcome {
  /** The blocks that survive — locked blocks are always retained. */
  blocks: Block[];
  /** True when at least one locked block was spared. */
  refused: boolean;
  /** Toast copy when `refused`, else null. */
  refusalMessage: string | null;
  /** Ids actually removed. Empty when everything requested was locked. */
  removedIds: string[];
}

/**
 * Apply a deletion request to `blocks`, sparing every locked block.
 *
 * Pure: returns a new array and never mutates the input. Block order
 * among survivors is preserved, which matters because array order is
 * the paint order (see PosterEditor's `reorderBlock`).
 *
 * @param blocks the current block list
 * @param ids the ids the user asked to delete
 */
export function filterDeletable(
  blocks: readonly Block[],
  ids: Iterable<string>,
): DeletionOutcome {
  const requested = new Set(ids);
  const removedIds: string[] = [];
  let refused = false;

  const survivors = blocks.filter((b) => {
    if (!requested.has(b.id)) return true;
    if (isLocked(b)) {
      refused = true;
      return true;
    }
    removedIds.push(b.id);
    return false;
  });

  return {
    blocks: survivors,
    refused,
    refusalMessage: refused ? LOCKED_BLOCK_REFUSAL : null,
    removedIds,
  };
}

/**
 * Guard for whole-list replacements — `setBlocks(next)` where `next`
 * came from somewhere other than an explicit delete (a clear-all, a
 * template swap, an auto-layout result, an undo/redo restore).
 *
 * Any locked block present in `previous` but missing from `next` is
 * re-appended, preserving its exact geometry. This is what stops undo
 * from restoring a pre-acknowledgement state: the guard runs on the
 * doc the store is about to adopt, not on the user's intent.
 *
 * Locked blocks that ARE present in `next` are left exactly as `next`
 * has them — that is how a locked block stays movable, resizable and
 * restyleable while refusing to disappear.
 */
export function preserveLocked(
  previous: readonly Block[],
  next: readonly Block[],
): Block[] {
  const nextIds = new Set(next.map((b) => b.id));
  const missing = previous.filter((b) => isLocked(b) && !nextIds.has(b.id));
  if (missing.length === 0) return [...next];
  return [...next, ...missing];
}
