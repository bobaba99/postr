/**
 * Out-of-bounds detection for poster blocks.
 *
 * Checks whether blocks extend partially or fully outside the poster
 * canvas. Returns a list of warnings with block IDs, severity, and
 * human-readable messages so the UI can render indicators.
 */
import type { Block } from '@postr/shared';
import { effectiveTop } from './blockGeometry';

export type OobSeverity = 'partial' | 'full';

export interface OobWarning {
  blockId: string;
  blockType: string;
  severity: OobSeverity;
  message: string;
  /** Which edges are out of bounds */
  edges: Array<'left' | 'right' | 'top' | 'bottom'>;
}

/**
 * Check all blocks against the canvas bounds.
 *
 * @param blocks - Array of poster blocks
 * @param canvasWidth - Canvas width in poster units
 * @param canvasHeight - Canvas height in poster units
 * @returns Array of warnings for blocks that are out of bounds
 */
/**
 * Rendered heights by block id, when the caller has them.
 *
 * Text-like blocks render `height: auto` and their stored `b.h` never
 * updates — since d54b70e it is not in their layout at all. So a block
 * grown clear off the canvas produced ZERO warnings here: this is the
 * ISSUES panel's only geometry check, and it was blind to exactly the
 * blocks most likely to need it. Measured drift on a real render: stored
 * 100, rendered 185.44.
 *
 * Optional because two callers have no DOM to measure from — the store's
 * `ensureAckBlock` and the .postr import both run before a canvas
 * exists. They keep the stored-height behaviour, which is the honest
 * best available there.
 */
export type MeasuredHeights = ReadonlyMap<string, number>;

/** Rendered height when known, else the stored one. */
function effectiveH(b: Block, measured?: MeasuredHeights): number {
  return measured?.get(b.id) ?? b.h;
}

/**
 * Where the block is actually PAINTED, vertically.
 *
 * `blocks.tsx` shifts every NON-title block down by `titleOverflowPx`
 * when the title has grown past its stored height (`effectiveTop`,
 * blocks.tsx:1833) — the body moves with the title rather than being
 * covered by it. These checks read `b.y` and so measured half the
 * rendered rect: the right height at the wrong top.
 *
 * The visible symptom was a false collision between a grown title and
 * the block below it, reported on a poster where nothing overlaps —
 * exactly the kind of wrong-but-confident warning that teaches users to
 * ignore the ISSUES panel.
 *
 * Defaults to 0, so a caller that does not know about the shift gets
 * the previous behaviour unchanged.
 */
// Re-exported from blockGeometry so the renderer and the checks cannot
// drift apart — see that file for why this is not defined twice.

export function checkBounds(
  blocks: Block[],
  canvasWidth: number,
  canvasHeight: number,
  measured?: MeasuredHeights,
  titleOverflow = 0,
): OobWarning[] {
  const warnings: OobWarning[] = [];

  for (const b of blocks) {
    const edges: OobWarning['edges'] = [];
    const top = effectiveTop(b, titleOverflow);
    const h = effectiveH(b, measured);

    if (b.x < 0) edges.push('left');
    if (top < 0) edges.push('top');
    if (b.x + b.w > canvasWidth) edges.push('right');
    if (top + h > canvasHeight) edges.push('bottom');

    if (edges.length === 0) continue;

    // Full OOB = entirely outside the canvas (no visible area).
    // This read the STORED height while the edge test above read the
    // measured one, so a block grown past the top edge with 50 units
    // still on the sheet was reported as "completely outside — it won't
    // appear in print", which the user can see is false.
    const fullyOutside =
      b.x + b.w <= 0 ||
      top + h <= 0 ||
      b.x >= canvasWidth ||
      top >= canvasHeight;

    warnings.push({
      blockId: b.id,
      blockType: b.type,
      severity: fullyOutside ? 'full' : 'partial',
      message: fullyOutside
        ? `${b.type} block is completely outside the poster — it won't appear in print.`
        : `${b.type} block extends past the ${edges.join(' and ')} edge${edges.length > 1 ? 's' : ''} — content may be cut off in print.`,
      edges,
    });
  }

  return warnings;
}

/**
 * Blocks that overlap each other.
 *
 * Pure geometry, but over the RENDERED height where one is known —
 * without that this finds nothing in F8's own repro, because pasting
 * text does not change the stored height. That is the trap: the obvious
 * implementation reads `b.h`, passes its own tests, ships, and still
 * reports "clean" on the poster from the bug report.
 *
 * `tolerance` absorbs the 1-2 unit kisses `snap` produces at shared
 * edges, which print fine and would otherwise bury the real collisions
 * in noise.
 *
 * Each unordered pair is reported at most once.
 */
export interface CollisionWarning {
  aId: string;
  bId: string;
  aType: string;
  bType: string;
  /** Area of the intersection, in square poster units. */
  overlapArea: number;
  message: string;
}

export function checkCollisions(
  blocks: Block[],
  measured?: MeasuredHeights,
  titleOverflow = 0,
  tolerance = 2,
): CollisionWarning[] {
  const out: CollisionWarning[] = [];

  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i]!;
      const b = blocks[j]!;
      const ah = effectiveH(a, measured);
      const bh = effectiveH(b, measured);
      const at = effectiveTop(a, titleOverflow);
      const bt = effectiveTop(b, titleOverflow);

      const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const dy = Math.min(at + ah, bt + bh) - Math.max(at, bt);
      if (dx <= tolerance || dy <= tolerance) continue;

      out.push({
        aId: a.id,
        bId: b.id,
        aType: a.type,
        bType: b.type,
        overlapArea: Math.round(dx * dy),
        message: `${a.type} overlaps ${b.type} — they will print on top of each other.`,
      });
    }
  }

  return out;
}
