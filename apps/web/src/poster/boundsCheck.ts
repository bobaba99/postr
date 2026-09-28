/**
 * Out-of-bounds detection for poster blocks.
 *
 * Checks whether blocks extend partially or fully outside the poster
 * canvas. Returns a list of warnings with block IDs, severity, and
 * human-readable messages so the UI can render indicators.
 */
import type { Block } from '@postr/shared';
import { ON_EDGE, drawnBox, drawnOverlap, effectiveTop } from './blockGeometry';

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
    // The box the block covers as drawn. A rotated block is turned about its
    // centre, so its stored box is not where it is printed: a 90° side label
    // drawn inside the sheet was flagged, and one drawn past the edge was
    // not (re-check of fix 02, BG-2).
    const top = effectiveTop(b, titleOverflow);
    const h = effectiveH(b, measured);
    const box = drawnBox(b.x, top, b.w, h, b.rotation);

    // Half a hundredth of tolerance (ON_EDGE): a turned block flush with an
    // edge can be drawn that far past it (final review of fix 02, F7).
    if (box.left < -ON_EDGE) edges.push('left');
    if (box.top < -ON_EDGE) edges.push('top');
    if (box.right > canvasWidth + ON_EDGE) edges.push('right');
    if (box.bottom > canvasHeight + ON_EDGE) edges.push('bottom');

    if (edges.length === 0) continue;

    // Full OOB = entirely outside the canvas (no visible area).
    // This read the STORED height while the edge test above read the
    // measured one, so a block grown past the top edge with 50 units
    // still on the sheet was reported as "completely outside — it won't
    // appear in print", which the user can see is false.
    const fullyOutside =
      box.right <= 0 ||
      box.bottom <= 0 ||
      box.left >= canvasWidth ||
      box.top >= canvasHeight;

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
      // The blocks as drawn (see checkBounds): a turned block is not where
      // its stored box is. Their outlines are compared exactly, at any angle
      // (drawnOverlap); for two upright blocks this is the old x and y test.
      const ra = { x: a.x, y: effectiveTop(a, titleOverflow), w: a.w, h: effectiveH(a, measured), rotation: a.rotation };
      const rb = { x: b.x, y: effectiveTop(b, titleOverflow), w: b.w, h: effectiveH(b, measured), rotation: b.rotation };
      if (!(drawnOverlap(ra, rb) > tolerance)) continue;

      // The area reported is that of the drawn boxes' intersection.
      const A = drawnBox(ra.x, ra.y, ra.w, ra.h, ra.rotation);
      const B = drawnBox(rb.x, rb.y, rb.w, rb.h, rb.rotation);
      const dx = Math.min(A.right, B.right) - Math.max(A.left, B.left);
      const dy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);

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
