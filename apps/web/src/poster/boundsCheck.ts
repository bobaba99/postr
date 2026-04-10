/**
 * Out-of-bounds detection for poster blocks.
 *
 * Checks whether blocks extend partially or fully outside the poster
 * canvas. Returns a list of warnings with block IDs, severity, and
 * human-readable messages so the UI can render indicators.
 */
import type { Block } from '@postr/shared';

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
export function checkBounds(
  blocks: Block[],
  canvasWidth: number,
  canvasHeight: number,
): OobWarning[] {
  const warnings: OobWarning[] = [];

  for (const b of blocks) {
    const edges: OobWarning['edges'] = [];

    if (b.x < 0) edges.push('left');
    if (b.y < 0) edges.push('top');
    if (b.x + b.w > canvasWidth) edges.push('right');
    if (b.y + b.h > canvasHeight) edges.push('bottom');

    if (edges.length === 0) continue;

    // Full OOB = entirely outside the canvas (no visible area)
    const fullyOutside =
      b.x + b.w <= 0 ||
      b.y + b.h <= 0 ||
      b.x >= canvasWidth ||
      b.y >= canvasHeight;

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
