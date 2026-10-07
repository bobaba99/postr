/**
 * Keeps a contenteditable field (a text block's editor, a table cell) in
 * step with the store, for the editor's one undo history (fix 12, record
 * docs/fixes/12-one-undo-history.md). Used by RichTextEditor and
 * TableCellEditor.
 *
 * - The field shows the store's value. Its own typing is committed and not
 *   written back (the DOM is already right, and a rewrite would move the
 *   caret: a table cell rewritten on every keystroke typed backwards, "abc"
 *   became "cba"). Any OTHER change to the value — an undo or redo, the
 *   same block typed in elsewhere — is written into the field, focused or
 *   not, keeping the caret where it was; before, a focused field kept its
 *   stale text and the next keystroke wrote it back over the undo.
 * - After an undo or redo of this field, the field takes the focus and the
 *   restored text is selected (the caret alone where text was removed)
 *   when `editorHistory.runHistory` asked for it (owner decision 4).
 * - An input of type historyUndo / historyRedo is the browser's own
 *   history, which never edits the poster: it is not committed, and the
 *   field is put back to the store's value.
 * - Moving the caret (a click, an arrow key) ends the typing step. Where
 *   else a step ends (owner decision 3: words, a paste, a cut, Enter, a
 *   format change, a deleted selection) the store decides, from the text
 *   and from what the browser said about the edit (historySteps.ts,
 *   stores/inputHint.ts). This file used to read the input event's type
 *   for a paste, which the engines do not report for the editor's own
 *   paste (fix 12 review R1-F2).
 */
import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { breakUndoCoalescing } from '@/stores/posterStore';
import { takeHistoryFocus, type EditorSurface } from './editorHistory';

/** Characters [start, end) of `el`'s text that the selection covers, or null when it is elsewhere. */
function selectionOffsets(el: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  const start = pre.toString().length;
  return { start, end: start + r.toString().length };
}

/** The DOM position `offset` characters into `el`'s text (clamped to its end). */
function domPoint(el: HTMLElement, offset: number): [Node, number] {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let left = Math.max(0, offset);
  let last: Text | null = null;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (left <= n.data.length) return [n, left];
    left -= n.data.length;
    last = n;
  }
  return last ? [last, last.data.length] : [el, el.childNodes.length];
}

/** Select characters [start, end) of `el`'s text. */
function selectOffsets(el: HTMLElement, start: number, end: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  r.setStart(...domPoint(el, start));
  r.setEnd(...domPoint(el, Math.max(start, end)));
  sel.removeAllRanges();
  sel.addRange(r);
}

/** Each character of `root`'s text, with the markup around it (tags and styles up to `root`). */
function characters(root: Node): { text: string; marks: string[] } {
  let text = '';
  const marks: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    let mark = '';
    for (let el = n.parentElement; el && el !== root; el = el.parentElement) {
      mark += `<${el.tagName}${el.getAttribute('style') ?? ''}>`;
    }
    text += n.data;
    for (let i = 0; i < n.data.length; i += 1) marks.push(mark);
  }
  return { text, marks };
}

/**
 * What an undo or redo changed in a field, in characters of its new text:
 * the text that differs (common start and end skipped), or, when the text
 * is the same, the characters whose formatting changed (bold undone: the
 * word that was bold). An empty range is a caret where text went.
 */
export function changedRange(before: Node, after: Node): { start: number; end: number } {
  const a = characters(before);
  const b = characters(after);
  if (a.text !== b.text) {
    let p = 0;
    const max = Math.min(a.text.length, b.text.length);
    while (p < max && a.text[p] === b.text[p]) p += 1;
    let s = 0;
    while (s < max - p && a.text[a.text.length - 1 - s] === b.text[b.text.length - 1 - s]) s += 1;
    return { start: p, end: b.text.length - s };
  }
  const differs = (i: number) => a.marks[i] !== b.marks[i];
  let start = 0;
  while (start < b.text.length && !differs(start)) start += 1;
  if (start === b.text.length) return { start, end: start };
  let end = b.text.length;
  while (end > start && !differs(end - 1)) end -= 1;
  return { start, end };
}

const CARET_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

export interface EditableHistoryOptions {
  ref: RefObject<HTMLElement | null>;
  /** The field's value in the store. */
  value: string;
  /** The markup the field shows for a value. */
  toHtml: (value: string) => string;
  /** The field's history key (`content:<id>`, `cell:<id>:<i>`), when it is part of the poster. */
  historyKey?: string;
  surface: EditorSurface;
}

export function useEditableHistory({ ref, value, toHtml, historyKey, surface }: EditableHistoryOptions) {
  /** The value the field's DOM shows: the last one written into it or committed from it. */
  const shown = useRef<string | null>(null);
  const latest = useRef({ value, toHtml });
  latest.current = { value, toHtml };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || shown.current === value) return;
    const focused = document.activeElement === el;
    const caret = focused ? selectionOffsets(el) : null;
    const old = el.cloneNode(true);
    const html = toHtml(value);
    if (el.innerHTML !== html) el.innerHTML = html;
    shown.current = value;
    if (takeHistoryFocus(historyKey, surface)) {
      if (document.activeElement !== el) el.focus();
      const changed = changedRange(old, el);
      selectOffsets(el, changed.start, changed.end);
    } else if (caret) {
      selectOffsets(el, caret.start, caret.end);
    }
    // `toHtml` is a pure mapping; only a new value is a reason to write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  /**
   * Commit an input: `read` returns the value to store from the DOM. The
   * browser's own undo or redo is refused and the field put back.
   */
  const commitInput = useCallback(
    (event: Event, read: () => string, store: (v: string) => void) => {
      const el = ref.current;
      if (!el) return;
      const type = (event as InputEvent).inputType;
      if (type === 'historyUndo' || type === 'historyRedo') {
        const caret = selectionOffsets(el);
        el.innerHTML = latest.current.toHtml(latest.current.value);
        shown.current = latest.current.value;
        if (caret) selectOffsets(el, caret.start, caret.end);
        return;
      }
      const v = read();
      shown.current = v;
      store(v);
    },
    [ref],
  );

  /**
   * Commit the field after a change the editor made itself (a symbol, a
   * paste: their execCommand already fired the input that set the step).
   */
  const commitValue = useCallback((v: string, store: (v: string) => void) => {
    shown.current = v;
    store(v);
  }, []);

  /**
   * The caret moved by key or click: the typing that follows is a new step.
   * Not a key released inside a composition (an input method's candidate
   * list read with the arrow keys): that composition is one step.
   */
  const onCaretKey = useCallback((e: { key: string; nativeEvent?: { isComposing?: boolean } }) => {
    if (CARET_KEYS.has(e.key) && e.nativeEvent?.isComposing !== true) breakUndoCoalescing();
  }, []);

  return { commitInput, commitValue, onCaretKey, onCaretClick: breakUndoCoalescing };
}
