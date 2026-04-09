/**
 * snap() — pulls a coordinate to the nearest grid point if within
 * SNAP_THRESHOLD units, otherwise leaves it alone.
 *
 * Used by the drag/resize handlers so blocks gently align to a
 * half-inch grid as the user moves them. The visual grid (40-unit
 * SVG overlay) is independent — it's purely cosmetic.
 */
import { SNAP_GRID, SNAP_THRESHOLD } from './constants';

export function snap(value: number): number {
  // `+ 0` coerces -0 (from Math.round on small negative inputs) to +0
  // so consumers and tests don't see a sign difference at the origin.
  const nearest = Math.round(value / SNAP_GRID) * SNAP_GRID + 0;
  return Math.abs(value - nearest) < SNAP_THRESHOLD ? nearest : value;
}
