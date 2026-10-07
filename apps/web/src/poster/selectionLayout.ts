/**
 * The sizes and rules of a selected block's controls (plan item 19, record
 * docs/fixes/19-controls-one-size.md).
 *
 * Every control is drawn inside the sheet (`#poster-canvas`), which is
 * zoomed with `transform: scale(zoom)`, so a length written in px there is
 * that many sheet units and shows `px × zoom` on screen: the controls were
 * 2 px at the 20 % floor and 100 px at the 10× ceiling. The sheet now sets
 * `--postr-zoom` next to its transform, and the controls undo it:
 *   - where a control sits (its offset from the block's edge) is a length
 *     in the sheet, divided by the zoom: `ctl()`;
 *   - what a control draws is laid out in plain px inside a box that the
 *     same factor scales back (`UNZOOM`, or `UNZOOM_X`/`UNZOOM_Y` for a
 *     strip whose length follows the block), so it is painted on the
 *     screen's own pixel grid. Lengths divided by the zoom are laid out on
 *     the sheet's grid instead, and a browser rounds a painted edge to a
 *     whole sheet pixel, which the zoom enlarges: at the 2560 × 1440 fit
 *     (3.39×) such circles were drawn as uneven rounds in Chromium and
 *     rounded squares in WebKit, and at 10× as pills (record 19, §8).
 * The controls stay inside their block, so a rotation still carries them,
 * and no transform goes on a button the stylesheet animates (index.css's
 * hover and press rules): the boxes that scale hold the buttons.
 *
 * The sizes are the owner's (2026-10-06, Q1): every control a user grabs
 * has a 24 × 24 px hit area (WCAG 2.5.8), with smaller marks inside it. A
 * block small on screen draws fewer controls (Q2), a handle row wider than
 * its block only its move button when zoomed far out (the lead's rule for
 * review finding F3), and the rotate control moves into the handle row above the block when
 * below it there is no room (Q3). Pure functions: the component reads the
 * screen (`selectionRoom.ts`).
 */
import type { ResizeHandle } from './resizeHandles';

/** A length in the zoomed sheet that is `px` CSS px on screen (an offset from a block's edge). */
export const ctl = (px: number): string => `calc(${px}px / var(--postr-zoom, 1))`;

/** Scales a box drawn in CSS px back to screen size inside the zoomed sheet. */
export const UNZOOM = 'scale(calc(1 / var(--postr-zoom, 1)))';
/** The same along one axis: a strip whose length follows the block. */
export const UNZOOM_X = 'scaleX(calc(1 / var(--postr-zoom, 1)))';
export const UNZOOM_Y = 'scaleY(calc(1 / var(--postr-zoom, 1)))';

/** The hit area of every control a user grabs, in CSS px (Q1, WCAG 2.5.8). */
export const HIT = 24;
/** A resize handle's visible square inside its hit area. */
export const HANDLE_MARK = 8;
/** A round button's visible circle inside its hit area. */
export const BUTTON_MARK = 20;
/** Between a resize handle's reach (half a hit area past the edge) and a button's hit area. */
export const CONTROL_GAP = 2;
/** Between the items of the handle row. */
export const ROW_GAP = 4;
/**
 * The handle row's hit areas end this far above the block, and the rotate
 * control's start this far below it: clear of the resize handles' reach.
 */
export const ROW_LIFT = HIT / 2 + CONTROL_GAP;
export const ROTATE_GAP = HIT / 2 + CONTROL_GAP;

/** Under this many px on an axis, the edge handles along it go (three hit areas). */
export const EDGE_HANDLES_MIN = 3 * HIT;
/** Under this many px on an axis, its corners overlap: one hit area. */
export const CORNERS_MIN = HIT;
/** The type label shows from this width (and where the handle row has room for it). */
export const LABEL_MIN = 120;
/**
 * Under this zoom (the overview range) a handle row wider than its block is
 * cut to its move button (review F3). Measured, record 19 section 9: with
 * the whole row drawn, a click at another block's centre deleted the
 * selected image at 0.2, 0.25 and 0.3, and nothing from 0.35 to 1 (three
 * engines; `control-size-check.mjs`, claim Fz).
 */
export const OVERVIEW_ZOOM = 0.35;

const ALL: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CORNERS: readonly ResizeHandle[] = ['nw', 'ne', 'se', 'sw'];

/**
 * The handle row's width on screen with its own controls side by side: the
 * move button, the type label (`labelPx` wide; null: without it), delete,
 * and an image's or logo's replace and crop. The rotate control is not
 * counted: it joins the row only when below the block has no room (Q3), as
 * its last button, and then the others stay within the block's width.
 */
export function handleRowWidth({ labelPx, imageButtons }: { labelPx: number | null; imageButtons: boolean }): number {
  const buttons = imageButtons ? 3 : 1;
  return HIT + (labelPx === null ? 0 : ROW_GAP + labelPx) + buttons * (ROW_GAP + HIT);
}

export interface BlockControls {
  /** The resize handles to draw. */
  handles: ResizeHandle[];
  /** The type label in the handle row. */
  label: boolean;
  /** The delete button, and an image's or logo's replace and crop buttons. */
  buttons: boolean;
  /** The rotate control. */
  rotate: boolean;
}

/**
 * Which controls a block draws for its size on screen (`wPx` × `hPx`, the
 * rendered size times the zoom). The owner's rule (Q2): no edge handles
 * along an axis under 72 px; under 24 px on both, only the bottom-right
 * corner and the move button; the type label from 120 px wide. One axis
 * under 24 px is not in the owner's rule: there a corner's hit area meets
 * the one across the block, so the near row (or column) goes and the
 * bottom (or right) one stays, with the bottom-right corner, as when both
 * are small. The move button always shows.
 *
 * A handle row wider than the block, zoomed far out (the lead's rule for
 * review finding F3, record 19): there the row reached over the neighbouring
 * blocks, and a click meant for one could delete, replace or crop this one.
 * Where the row's buttons (`handleRowWidth` without the label) are wider
 * than `wPx` and `zoom` is under OVERVIEW_ZOOM, the row draws only the move
 * button (and the label, by its own rule): no delete, replace or crop button
 * and no rotate control. Delete stays on the Delete and Backspace keys and
 * the right-click menu of the blocks that have one; zooming in brings the
 * row back. At editing zooms the row is whole, however narrow the block (a
 * 3 in image at a fit keeps Replace and Crop). Where the buttons are drawn,
 * the label shows only if the row has room for it too (not in the lead's
 * rule, added here): counted
 * against the buttons instead, the label (from 120 px wide) would hide
 * them again on an image zooming in, from 120 px to the width of its row
 * with the label (164 px for "image"). `row.labelPx` is the label's width
 * as last drawn. Without
 * `row` (a group's frame, which draws handles only), no row rule.
 */
export function blockControls({ wPx, hPx, cornersOnly = false, row, zoom = 1 }: {
  wPx: number;
  hPx: number;
  cornersOnly?: boolean;
  /** The sheet's zoom: the row is cut only under OVERVIEW_ZOOM. */
  zoom?: number;
  /** The handle row's parts that vary: the label's width on screen (when it shows), and replace and crop (images and logos). */
  row?: { labelPx: number; imageButtons: boolean };
}): BlockControls {
  if (wPx < CORNERS_MIN && hPx < CORNERS_MIN) {
    return { handles: ['se'], label: false, buttons: false, rotate: false };
  }
  const drop = new Set<ResizeHandle>();
  if (wPx < EDGE_HANDLES_MIN) drop.add('n').add('s');
  if (hPx < EDGE_HANDLES_MIN) drop.add('e').add('w');
  if (hPx < CORNERS_MIN) drop.add('nw').add('n').add('ne');
  if (wPx < CORNERS_MIN) drop.add('nw').add('w').add('sw');
  const handles = (cornersOnly ? CORNERS : ALL).filter((h) => !drop.has(h));
  const labelByRule = wPx >= LABEL_MIN;
  if (!row) return { handles, label: labelByRule, buttons: true, rotate: true };
  const buttonsFit = handleRowWidth({ labelPx: null, imageButtons: row.imageButtons }) <= wPx;
  const cut = !buttonsFit && zoom < OVERVIEW_ZOOM;
  const labelFits = cut || handleRowWidth({ labelPx: row.labelPx, imageButtons: row.imageButtons }) <= wPx;
  return { handles, label: labelByRule && labelFits, buttons: !cut, rotate: !cut };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Whether the rotate control fits below the block (Q3): its hit area, where
 * it would sit (centred, `ROTATE_GAP` px below the block's bottom edge, the
 * block turned by `rotationDeg` about its centre), is inside the visible
 * canvas (`view`, within half a pixel) and meets none of the `obstacles`
 * (the ZoomBar). All in screen px. A canvas with no size yet (before
 * layout) leaves the control below.
 */
export function rotateFitsBelow({
  centre, halfH, rotationDeg, view, obstacles,
}: { centre: { x: number; y: number }; halfH: number; rotationDeg: number; view: Rect; obstacles: Rect[] }): boolean {
  if (!(view.w > 0 && view.h > 0)) return true;
  const d = halfH + ROTATE_GAP + HIT / 2;
  const t = (rotationDeg * Math.PI) / 180;
  const cx = centre.x - d * Math.sin(t);
  const cy = centre.y + d * Math.cos(t);
  const box = { x: cx - HIT / 2, y: cy - HIT / 2, w: HIT, h: HIT };
  const inside =
    box.x >= view.x - 0.5 && box.y >= view.y - 0.5 && box.x + box.w <= view.x + view.w + 0.5 && box.y + box.h <= view.y + view.h + 0.5;
  const meets = (o: Rect) => Math.min(box.x + box.w, o.x + o.w) > Math.max(box.x, o.x) && Math.min(box.y + box.h, o.y + o.h) > Math.max(box.y, o.y);
  return inside && !obstacles.some(meets);
}
