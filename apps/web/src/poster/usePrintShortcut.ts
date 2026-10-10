/**
 * ⌘P on a Mac, Ctrl+P elsewhere: the editor's print shortcut, as in
 * PowerPoint (File › Print). It calls the editor's one print function, the
 * same as Save PDF (the MVP design doc §3.10; record
 * docs/fixes/30-one-print-path.md). Before, the editor had no handler, so
 * the browser printed the editor page itself, sidebar and all.
 *
 * Rules:
 *   - The key is matched without case, and by its physical key only when
 *     the layout types a letter that is not Latin there (a Cyrillic or Greek
 *     layout), as the undo keys are (editorHistory.ts).
 *   - No Shift and no Alt: ⌥⌘P and ⇧⌘P are the browser's own.
 *   - On a Mac only ⌘P: Ctrl+P there moves the caret up a line in text
 *     (the system's text keys), as Ctrl+Y yanks.
 *   - It works with the caret in a block's text and in Preview (Preview's
 *     Print / Save PDF does the same).
 *   - With a dialog open (other than Preview), or inside an input method's
 *     composition, the key does nothing, and the browser's print is still
 *     kept from printing the editor (record 30's review round 2, R2-F3:
 *     during a composition the default was left to run; Chromium delivers
 *     the key there with isComposing set).
 *   - A held key prints once.
 */
import { useEffect, useRef } from 'react';

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

type KeyFields = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>;

/** Whether a key press is the print shortcut on this kind of system. */
export function isPrintShortcut(e: KeyFields, mac: boolean): boolean {
  if (e.altKey || e.shiftKey) return false;
  if (mac ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey) return false;
  const k = typeof e.key === 'string' ? e.key.toLowerCase() : '';
  if (/^[a-z]$/.test(k)) return k === 'p';
  return /^\p{L}$/u.test(k) && e.code === 'KeyP';
}

/** A dialog other than Preview is open (one that is closing has been answered). */
function otherDialogOpen(): boolean {
  return Array.from(
    document.querySelectorAll('[role="dialog"][aria-modal="true"]:not([data-postr-preview]), [data-postr-modal-content]'),
  ).some((d) => d.getAttribute('data-state') !== 'closing');
}

/** Installs ⌘P / Ctrl+P on the window (capture), calling `onPrint`. */
export function usePrintShortcut(onPrint: () => void): void {
  const ref = useRef(onPrint);
  ref.current = onPrint;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isPrintShortcut(e, MAC)) return;
      e.preventDefault();
      if (e.isComposing || e.repeat || otherDialogOpen()) return;
      ref.current();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
}
