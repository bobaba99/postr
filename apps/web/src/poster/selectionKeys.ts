/**
 * Select and move like PowerPoint: the keys the editor's selection answers
 * (record docs/fixes/36-select-move.md; the MVP design doc
 * docs/launch/mvp-editor/bounded-designs.md §3.4). PosterEditor installs
 * them; the table's own Delete / Backspace listeners use the same key rule.
 *
 * K0, the key rule, comes first: while the focus is in a text field — an
 * INPUT, a TEXTAREA, a SELECT (a menu) or editable text, `isEditing`, the
 * one test canvas paste uses too — every key is the field's: Delete, the
 * arrows, ⌘D, ⌘A, ⌘C/X/V and Esc's deselect do nothing to blocks. The
 * guard used to leave SELECT out, so Backspace on a focused menu deleted
 * the selected block (OF-11, plan item 22).
 *
 * Then, with the focus anywhere else:
 *   Esc (K1)            in editable text: leave the text and keep its block
 *                       selected; otherwise deselect. Something open that
 *                       answers Esc takes it first: a dialog, or an element
 *                       marked `data-postr-takes-escape` (the slash menu,
 *                       the block menu, the table's menu, crop).
 *   ⌘A / Ctrl+A (K2)    select every block but the locked credit mark.
 *   Arrow (K3)          move the selection ½ in, one grid step (not
 *                       snapped: a block on the grid stays on it).
 *   ⌘ + arrow on a Mac, Ctrl + arrow elsewhere
 *                       move it 0.1 in. Windows: Ctrl + arrow is
 *                       PowerPoint's finer nudge (Microsoft's "Nudging"
 *                       post). Mac: Microsoft's PowerPoint for Mac list
 *                       gives "Arrow keys or ⌘+Arrow keys" to move an object
 *                       and no step size; that ⌘ is the finer step is taken
 *                       from the Windows rule (record 36 §2). Any other modifier with
 *                       an arrow does nothing to blocks: Shift and Alt +
 *                       arrow resize and rotate in PowerPoint, which Postr
 *                       leaves out, and Alt + Left is the browser's Back on
 *                       Windows.
 *   Delete / Backspace  remove the selection (unchanged).
 *   ⌘D / Ctrl+D         duplicate one block (unchanged).
 *
 * Out of scope (§3.4): Tab through blocks, a selection pane, Group and
 * Ungroup, resizing or rotating from the keyboard, typed size and position
 * fields, ⌘D on several blocks.
 */
import { useEffect, useRef } from 'react';
import { SNAP_GRID } from './constants';
import { isEditing } from './canvasPaste';
import { dialogOpen } from './editorHistory';

export type SelectionKey =
  | { kind: 'delete' }
  | { kind: 'duplicate' }
  | { kind: 'selectAll' }
  | { kind: 'nudge'; dx: number; dy: number }
  /** An arrow chord that is not a nudge: nothing happens, and the browser's own use of it is cancelled while a block is selected (R36-2). */
  | { kind: 'arrowIgnored' };

type KeyFields = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>;

/** A Mac, an iPhone or an iPad: ⌘ is the fine nudge's key there. */
export const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** An arrow's step in units of 1/10 in: one grid step (½ in), and the fine nudge (0.1 in). */
export const NUDGE = SNAP_GRID;
export const FINE_NUDGE = 1;

const ARROWS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * Whether the key is the letter A: matched without case, and by its
 * physical key only where the layout types a letter that is not Latin
 * there (a Cyrillic or Greek layout), as the undo and print keys are.
 */
function isLetterA(e: KeyFields): boolean {
  const k = typeof e.key === 'string' ? e.key.toLowerCase() : '';
  if (/^[a-z]$/.test(k)) return k === 'a';
  return /^\p{L}$/u.test(k) && e.code === 'KeyA';
}

/**
 * What a key does to the selection when the focus is not in a text field,
 * or null when it does nothing to blocks. Esc is not here: `useSelectionEscape`.
 */
export function selectionKeyAction(e: KeyFields, mac: boolean): SelectionKey | null {
  if (e.key === 'Delete' || e.key === 'Backspace') return { kind: 'delete' };
  const command = e.metaKey || e.ctrlKey;
  if (command && (e.key === 'd' || e.key === 'D')) return { kind: 'duplicate' };
  if (command && !e.altKey && !e.shiftKey && isLetterA(e)) return { kind: 'selectAll' };
  const dir = ARROWS[e.key];
  if (!dir) return null;
  const plain = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
  const fine = !e.altKey && !e.shiftKey && (mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey);
  const step = plain ? NUDGE : fine ? FINE_NUDGE : 0;
  return step ? { kind: 'nudge', dx: dir[0] * step, dy: dir[1] * step } : { kind: 'arrowIgnored' };
}

/** Marks an open element that answers Esc itself (a menu, crop): Esc then neither leaves the text nor deselects. */
export const TAKES_ESCAPE_ATTR = 'data-postr-takes-escape';

/** Something open answers Esc first: a dialog, or an element marked `data-postr-takes-escape`. */
export function escapeTakenFirst(root: ParentNode = document): boolean {
  return dialogOpen() || root.querySelector(`[${TAKES_ESCAPE_ATTR}]`) !== null;
}

/** What Esc does from the focused element: leave editable text, leave a field to itself, or deselect. */
export function escapeAction(focus: Element | null): 'leave-text' | 'field' | 'deselect' {
  if (focus instanceof HTMLElement && focus.isContentEditable) return 'leave-text';
  return isEditing(focus) ? 'field' : 'deselect';
}

export interface SelectionEscapeHandlers {
  /** The text was left; `blockId` is the sheet's block it was in (null for a sidebar field). */
  leaveText: (blockId: string | null) => void;
  deselect: () => void;
}

/**
 * Installs Esc (K1) on the window, in the capture phase: there it runs
 * before anything open handles the key and closes, so "something open takes
 * Esc first" reads the page as the user saw it when pressing. Inside an
 * input method's composition Esc is the composition's.
 */
export function useSelectionEscape(enabled: boolean, handlers: SelectionEscapeHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return;
      if (escapeTakenFirst()) return;
      const focus = document.activeElement;
      const action = escapeAction(focus);
      if (action === 'field') return;
      if (action === 'deselect') {
        ref.current.deselect();
        return;
      }
      const host = focus as HTMLElement;
      const blockId = host.closest('#poster-canvas [data-block-id]')?.getAttribute('data-block-id') ?? null;
      host.blur();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && host.contains(sel.anchorNode)) sel.removeAllRanges();
      ref.current.leaveText(blockId);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled]);
}
