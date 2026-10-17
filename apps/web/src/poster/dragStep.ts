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
import type { Block } from '@postr/shared';
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

/**
 * A move, resize or rotate drag's undo step (`useBlockDrag`): the blocks as
 * they are at release (`now`), each with its place, size and rotation from
 * pointerdown (`before`), the only fields such a drag changes. Not the list
 * captured at pointerdown: a change made silently while the pointer was down
 * stays out of the drag's step (record 35, review round 3, R3-3's sibling: a
 * pasted image's own file landing mid-drag was put back to its source by the
 * drag's ⌘Z, MEASURED). A block not in `before` is left as it is.
 */
export function atPreDragGeometry(now: readonly Block[], before: readonly Block[]): Block[] {
  const pre = new Map(before.map((b) => [b.id, b]));
  return now.map((b) => {
    const p = pre.get(b.id);
    if (!p || (p.x === b.x && p.y === b.y && p.w === b.w && p.h === b.h && p.rotation === b.rotation)) return b;
    const { rotation: _rotation, ...rest } = b;
    return { ...rest, x: p.x, y: p.y, w: p.w, h: p.h, ...(p.rotation !== undefined ? { rotation: p.rotation } : {}) };
  });
}
