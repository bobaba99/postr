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

/** The zoom limits of the zoom buttons and a pinch. */
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 10;
/** One click on Zoom in or Zoom out. */
export const ZOOM_STEP = 0.15;

/**
 * A zoom the user asked for (a button step, a pinch), within the limits.
 * The floor is ZOOM_MIN, lowered to the fit or to the zoom on screen when
 * either is below it. A floor above the zoom on screen turned Zoom out and a
 * pinch out into zooming in (fix 03, cause B); with the fit in the floor,
 * Zoom out can always get back to the fit.
 */
export function clampZoom(next: number, current: number, fit: number): number {
  const floor = Math.min(ZOOM_MIN, fit, current);
  const z = Math.min(ZOOM_MAX, Math.max(floor, next));
  // Steps of 0.15 are not exact in binary: k steps in and k out from the fit
  // can end 1e-17 above it, and the next Zoom out then moves nothing you can
  // see (review of fix 03). A zoom that close to the fit is the fit.
  return Math.abs(z - fit) < 1e-9 ? fit : z;
}

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
