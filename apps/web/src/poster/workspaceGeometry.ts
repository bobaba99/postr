/**
 * The editor workspace's geometry: the gutter around the poster sheet and
 * the fitted zoom. The fit, the workarea's padding and the rulers all read
 * it from here. They used to hold three copies of the gutter, which drifted
 * apart (60 px in the fit against 96 in the padding), so "Fit" left the
 * sheet's far edge 36 px out of view (docs/fixes/03-fit-whole-sheet.md).
 */

/**
 * Gutter on each side of the sheet in the desktop workspace, in CSS px.
 * Owner decision (docs/stress-test/PLAN.md, accepted assumptions).
 */
export const WORKSPACE_GUTTER = 64;

/**
 * Gutter on each side on the phone share view: nothing there has handles,
 * and a 375 px screen needs the pixels.
 */
export const PHONE_GUTTER = 8;

/** Fit never enlarges past this: a guard for a tiny poster on a big screen. */
const FIT_MAX = 5;

/**
 * The gutter for a canvas `canvasPx` long: the full gutter, but never more
 * than a quarter of the canvas, so a canvas narrower than two gutters still
 * shows the whole sheet.
 */
export function gutterFor(canvasPx: number, gutter: number): number {
  return Math.min(gutter, Math.floor(canvasPx / 4));
}

export interface SheetFit {
  zoom: number;
  gutterX: number;
  gutterY: number;
}

/**
 * The largest zoom at which a `sheetW` × `sheetH` sheet (poster units) plus
 * its gutter on every side fits a canvas of `box` CSS px, and the gutter
 * that goes with it. The canvas is taken in whole pixels (rounded down), so
 * at a fractional device pixel ratio the sheet and its gutter never add up
 * to more than the canvas the browser reports. Null when the canvas has not
 * been laid out yet: the caller keeps the fit it has.
 */
export function fitSheet(
  box: { width: number; height: number },
  sheetW: number,
  sheetH: number,
  gutter: number,
): SheetFit | null {
  const w = Math.floor(box.width);
  const h = Math.floor(box.height);
  if (!(w > 0 && h > 0 && sheetW > 0 && sheetH > 0)) return null;
  const gutterX = gutterFor(w, gutter);
  const gutterY = gutterFor(h, gutter);
  const zoom = Math.min((w - 2 * gutterX) / sheetW, (h - 2 * gutterY) / sheetH, FIT_MAX);
  return { zoom, gutterX, gutterY };
}
