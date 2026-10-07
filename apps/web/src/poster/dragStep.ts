/**
 * One drag, one undo step (PowerPoint): call `holdDragStep` from the
 * pointerdown of a control that edits the poster on every pointer move — a
 * crop edge, a table column's width grip, a slider — and every edit until
 * the pointer is released is one step. The live preview during the drag is
 * unchanged; only the history groups it. A move, resize or rotate drag gets
 * the same result its own way (`useBlockDrag`: silent updates, one commit
 * on release).
 *
 * Record: docs/fixes/12-one-undo-history.md, section 11 (the merge review's
 * F1: a crop drag was one step per pointer move).
 */
import { beginDragStep, endDragStep } from '@/stores/posterStore';

/**
 * Hold one undo step until the pointer is released or cancelled, the
 * browser's context menu opens, or the window loses the focus (a release
 * outside it, or under the menu, may never arrive). A menu the page shows
 * instead (it cancels the event: the image block's own, on a long press or
 * Ctrl+click) leaves the press going, and its release still comes. A
 * secondary press holds nothing: no drag follows it, and its release may
 * never reach the page.
 */
export function holdDragStep(e?: { button?: number }): void {
  if (e?.button !== undefined && e.button !== 0) return;
  beginDragStep();
  const end = () => {
    window.removeEventListener('pointerup', end, true);
    window.removeEventListener('pointercancel', end, true);
    window.removeEventListener('contextmenu', onMenu, true);
    window.removeEventListener('blur', end);
    endDragStep();
  };
  // Seen first (capture), decided after every handler ran: a handler of
  // the page may cancel it, and stop it from reaching the window after.
  const onMenu = (ev: Event) => {
    setTimeout(() => {
      if (!ev.defaultPrevented) end();
    }, 0);
  };
  window.addEventListener('pointerup', end, true);
  window.addEventListener('pointercancel', end, true);
  window.addEventListener('contextmenu', onMenu, true);
  window.addEventListener('blur', end);
}
