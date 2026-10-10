/**
 * stripEditorChrome — take the editor's own marks out of a copy of the
 * sheet before it leaves the editor, so the copy looks like the poster,
 * not the live edit surface.
 *
 * Shared by the thumbnail capture (data/thumbnails.ts) and "⎙ Save PDF"
 * (PosterEditor's printPoster). The print path used to strip only the
 * grid and ruler overlays, so a selected block (and a block just inserted
 * is selected; clicking the Export tab does not deselect it) printed with
 * its resize handles, its handle row and its accent border (fix 13c review
 * finding Q-R5).
 *
 * A selected or out-of-bounds frame's 1.5 px border goes back to the
 * unselected 1 px transparent one. Not only for its colour: Chromium draws
 * a border whole device pixels wide, so on a 1x screen the editor draws
 * that 1.5 px border 1 px wide, and a chart in the frame is drawn for the
 * box that leaves; the print document, when it zoomed the sheet 9.6 times,
 * drew it 14 device px wide, 1.458 units, and the chart printed 0.94 %
 * smaller than drawn (a 14 pt minimum at 13.87 pt; the review's Q-R5 side
 * effect and Q-R7, measured by the scratch probe sel and the harness's
 * selected and ui-paste scenarios). Reset to 1 px, the frame prints as the
 * unselected editor draws it. Since record 30 the print function clears the
 * selection before it copies the sheet, and the print lays the sheet out at
 * its natural size and scales it (a transform, not zoom), so the reset
 * matters for an out-of-bounds frame's border and as a guard.
 *
 * Selectors mirror the data attributes set by:
 *   - resizeHandles.tsx → [data-postr-resize-handle]
 *   - blocks.tsx top handle row, GroupFrame, SelectionRect, CropOverlay,
 *     FigureSizeOverlay → [data-postr-selection-ui]
 *   - the grid / ruler overlays → [data-postr-overlay]
 *   - a block's own editing controls, inside its content: the table's row
 *     and column strips, column grips, hover "+" bars and active-cell
 *     bands (blocks.tsx TableBlock) → [data-postr-editor-ui]. ⌘P copies
 *     the sheet with the pointer still where it was: a resting pointer's
 *     "Add column" bar printed as a 0.3 in accent bar along the table, a
 *     hovered strip as a tinted band beside it (record 30's review round 2,
 *     R2-F1). Its own marker, not data-postr-selection-ui: index.css and the
 *     control harnesses read that one as the selection's controls.
 */
export function stripEditorChrome(clone: HTMLElement): void {
  clone
    .querySelectorAll('[data-postr-resize-handle], [data-postr-selection-ui], [data-postr-overlay], [data-postr-editor-ui]')
    .forEach((el) => el.remove());

  // The frames are tagged data-postr-selected and data-postr-oob, so the
  // selection and the bounds check are not re-derived from React state.
  clone.querySelectorAll<HTMLElement>('[data-postr-selected="true"], [data-postr-oob="true"]').forEach((el) => {
    el.style.border = '1px solid transparent';
  });
}
