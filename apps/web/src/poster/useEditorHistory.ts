/**
 * Installs the editor's ONE undo history on the page (fix 12; the rules are
 * in editorHistory.ts, the record is docs/fixes/12-one-undo-history.md):
 *
 * - keydown (capture, on window): ⌘Z / ⌘⇧Z / ⌘Y and Ctrl's, routed by
 *   where the focus is. The key is cancelled in every state but a field
 *   that keeps its own undo, so the browser's undo never runs on the
 *   poster. Installed in preview too (it used to be removed there, and
 *   Firefox then undid canvas text unseen behind the overlay). Every key
 *   also starts a new record of what the browser says (stores/inputHint.ts).
 * - beforeinput (capture, on document): the browser's own historyUndo /
 *   historyRedo is cancelled wherever it would change the poster, routed
 *   to the editor when it came from the browser's menu with the focus in
 *   the poster, and allowed only in the field the key was pressed in.
 *   On a common ancestor because Firefox can aim it at another element
 *   than the one it changes (the item 12 confirmer, E2). Any other
 *   beforeinput is noted for the store's step rules: typing or deleting,
 *   over a selection or not, and whether the character before the caret
 *   makes the typed one start a word.
 * - paste (capture, on document): a paste is an undo step of its own. The
 *   paste event says so in every engine; the text editor's own paste runs
 *   execCommand, whose input event says '' or 'insertText' (review R1-F2).
 * - input (capture, on document) of type historyUndo / historyRedo: the
 *   browser applied its own history with no beforeinput to cancel first
 *   (Chromium's and Firefox's execCommand, review R1-F3). Nothing is stored
 *   in that task, and React puts a controlled field back to the poster's
 *   value; the text editors put themselves back (useEditableHistory.ts).
 * - compositionstart (capture, on document): a composition (an input
 *   method, a dead key, a phone keyboard composing a word) is one unit of
 *   the history, its commit included; whether it begins a new step is read
 *   from the caret as it starts (review R2-F1).
 * - focusin: going into a field (another, or the same one again) ends the
 *   current typing step; the text editors also end it as they lose focus.
 */
import { useEffect, useRef } from 'react';
import { breakUndoCoalescing } from '@/stores/posterStore';
import {
  noteBeforeInput,
  noteCompositionStart,
  noteHistoryInput,
  notePaste,
  resetInputHint,
  type CaretContext,
} from '@/stores/inputHint';
import {
  dialogOpen,
  historyInputVerdict,
  historyKeyAction,
  notePress,
  routeHistoryKey,
  type HistoryDirection,
} from './editorHistory';

/**
 * The selection in `target` (a text field, or the editing host holding the
 * document's selection) as a `beforeinput` begins: a caret or a range, and
 * the character before it.
 */
function caretOf(target: EventTarget | null): CaretContext {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    try {
      const start = target.selectionStart ?? 0;
      return { collapsed: start === target.selectionEnd, before: start > 0 ? target.value[start - 1]! : null };
    } catch {
      return { collapsed: true, before: undefined }; // a field without a text selection (a number field in some engines)
    }
  }
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { collapsed: true, before: undefined };
  const r = sel.getRangeAt(0);
  if (!(target instanceof Node) || !target.contains(r.startContainer)) return { collapsed: r.collapsed, before: undefined };
  const pre = document.createRange();
  pre.selectNodeContents(target);
  pre.setEnd(r.startContainer, r.startOffset);
  const text = pre.toString();
  return { collapsed: r.collapsed, before: text.length > 0 ? text[text.length - 1]! : null };
}

export function useEditorHistory({ onRun }: { onRun: (dir: HistoryDirection) => void }) {
  const runRef = useRef(onRun);
  runRef.current = onRun;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      resetInputHint();
      const dir = historyKeyAction(e);
      if (!dir) return;
      const target = e.target instanceof Element ? e.target : null;
      // The preview overlay is a modal dialog too (PosterPreviewOverlay).
      const route = routeHistoryKey(target, dialogOpen());
      notePress(route, target);
      if (route === 'own') return;
      e.preventDefault();
      if (route === 'history') runRef.current(dir);
    };

    const onBeforeInput = (e: InputEvent) => {
      if (e.inputType !== 'historyUndo' && e.inputType !== 'historyRedo') {
        noteBeforeInput(e.inputType, e.data, caretOf(e.target));
        return;
      }
      const verdict = historyInputVerdict(e.target instanceof Element ? e.target : null, dialogOpen());
      if (verdict === 'allow') return;
      e.preventDefault();
      if (verdict === 'route') runRef.current(e.inputType === 'historyUndo' ? 'undo' : 'redo');
    };

    const onInput = (e: Event) => {
      const type = (e as InputEvent).inputType;
      if (type === 'historyUndo' || type === 'historyRedo') noteHistoryInput();
    };

    const onCompositionStart = (e: CompositionEvent) => noteCompositionStart(caretOf(e.target));

    const endStep = () => breakUndoCoalescing();

    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('beforeinput', onBeforeInput, true);
    document.addEventListener('paste', notePaste, true);
    document.addEventListener('input', onInput, true);
    document.addEventListener('compositionstart', onCompositionStart, true);
    document.addEventListener('focusin', endStep, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('beforeinput', onBeforeInput, true);
      document.removeEventListener('paste', notePaste, true);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('compositionstart', onCompositionStart, true);
      document.removeEventListener('focusin', endStep, true);
    };
  }, []);
}
