/**
 * Shared helpers for the fix 12 tests (one undo history; record
 * docs/fixes/12-one-undo-history.md). Pure DOM helpers only: each test file
 * keeps its own vi.mock calls, because vitest hoists a mock only within the
 * file that declares it.
 *
 * Everything here models what a BROWSER does when the user acts, so the
 * tests enter where the user enters (a key press on the focused element, a
 * click, typing at the caret) and never call the store:
 *
 * - jsdom 25 has no `isContentEditable` (it is undefined), so a handler
 *   that asks whether the key landed in text always hears "no". A naive
 *   test of "⌘Z in a text block" passed on main for that reason alone
 *   (MEASURED by the item 12 reproducer). `installContentEditableShim`
 *   gives elements the property the way browsers compute it.
 * - Typing goes to the CARET, as in a browser: each character is inserted
 *   where the selection is, with `beforeinput` and `input` events carrying
 *   `inputType: 'insertText'`. If the app rewrites the element under the
 *   caret, the caret moves to where the DOM puts it (the start), which is
 *   how a cell that re-renders on every keystroke types backwards.
 * - jsdom has no `execCommand`. `installExecCommandShim` performs the few
 *   commands the format toolbar and the paste handler use, on the
 *   selection, and fires the `input` event a browser fires for each, with
 *   the `inputType` the engines give it: for `insertHTML` (the editor's
 *   paste) that is '' in Chromium and Firefox and 'insertText' in WebKit,
 *   never 'insertFromPaste' (MEASURED by the fix 12 review, round 1, with
 *   each engine's own clipboard). An earlier version of this shim said
 *   'insertFromPaste', and a test then passed on code that missed every
 *   real one-character paste.
 * - A sidebar <input> or <textarea> gets the browser's `beforeinput` before
 *   each change (`keyInto`), with the field's selection as it stands, as
 *   every engine fires it for typing, deleting and pasting there. A colour
 *   input fires none (`fireEvent.change` alone).
 */
import { fireEvent } from '@testing-library/react';
import type { Block, PosterDoc } from '@postr/shared';
import { makeDoc, nextTask } from './editorKit';
import { usePosterStore } from '@/stores/posterStore';

export { NAME, NoopResizeObserver, doc, load, nextTask, openTab, q, renderEditor } from './editorKit';

/** The fix 12 fixture: editorKit's poster plus a 3 × 2 table and an image. */
export function undoDoc(): PosterDoc {
  const base = makeDoc();
  const blocks: Block[] = [
    ...base.blocks,
    {
      id: 'tb1', type: 'table', x: 250, y: 240, w: 210, h: 80, content: '', imageSrc: null, imageFit: 'contain',
      tableData: { rows: 3, cols: 2, cells: ['Group', 'Mean', 'DV 1', '4.2', 'DV 2', '3.9'], colWidths: null, borderPreset: 'apa' },
    },
    { id: 'im1', type: 'image', x: 20, y: 240, w: 210, h: 80, content: '', imageSrc: null, imageFit: 'contain', tableData: null },
  ];
  return { ...base, blocks };
}

/** Browsers compute `isContentEditable` from the nearest contenteditable attribute. */
export function installContentEditableShim(): () => void {
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  const had = Object.getOwnPropertyDescriptor(proto, 'isContentEditable');
  Object.defineProperty(proto, 'isContentEditable', {
    configurable: true,
    get(this: HTMLElement) {
      for (let el: HTMLElement | null = this; el; el = el.parentElement) {
        const v = el.getAttribute('contenteditable');
        if (v === '' || v === 'true' || v === 'plaintext-only') return true;
        if (v === 'false') return false;
      }
      return false;
    },
  });
  return () => {
    if (had) Object.defineProperty(proto, 'isContentEditable', had);
    else delete proto.isContentEditable;
  };
}

/** Fire the input event a browser fires after it changed an editing host. */
function fireInput(host: HTMLElement, inputType: string, data: string | null = null) {
  host.dispatchEvent(new InputEvent('input', { inputType, data, bubbles: true }));
}

/** Where the caret is: the editing host that holds the selection. */
function hostOfSelection(): HTMLElement | null {
  const sel = window.getSelection();
  const node = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).startContainer : null;
  const el = node ? (node.nodeType === 1 ? (node as Element) : node.parentElement) : null;
  return el?.closest<HTMLElement>('[contenteditable="true"],[contenteditable=""]') ?? null;
}

/**
 * The few `execCommand`s the editor uses, done to the selection the way a
 * browser does them, each followed by the browser's `input` event; and a
 * (zero) layout rectangle for a Range, which jsdom lacks.
 */
export function installExecCommandShim(): () => void {
  const had = (document as unknown as { execCommand?: unknown }).execCommand;
  (document as unknown as { execCommand: (c: string, u?: boolean, v?: string) => boolean }).execCommand = (cmd, _u, value) => {
    const sel = window.getSelection();
    const host = hostOfSelection();
    if (!sel || sel.rangeCount === 0 || !host) return false;
    const range = sel.getRangeAt(0);
    if (cmd === 'bold' && !range.collapsed) {
      const b = document.createElement('b');
      b.append(range.extractContents());
      range.insertNode(b);
      range.selectNodeContents(b);
      sel.removeAllRanges();
      sel.addRange(range);
      fireInput(host, 'formatBold');
      return true;
    }
    if (cmd === 'insertHTML' || cmd === 'insertText') {
      range.deleteContents();
      const tpl = document.createElement('template');
      if (cmd === 'insertHTML') tpl.innerHTML = value ?? '';
      else tpl.content.append(document.createTextNode(value ?? ''));
      const last = tpl.content.lastChild;
      range.insertNode(tpl.content);
      if (last) range.setStartAfter(last);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      // Chromium's and Firefox's inputType for execCommand('insertHTML').
      fireInput(host, cmd === 'insertHTML' ? '' : 'insertText', cmd === 'insertText' ? value ?? null : null);
      return true;
    }
    return false;
  };
  (document as unknown as { queryCommandState: () => boolean }).queryCommandState = () => false;
  // jsdom's Range has no layout rectangle; the selection toolbar asks for one.
  const rangeProto = Range.prototype as unknown as { getBoundingClientRect?: () => DOMRect };
  const hadRect = rangeProto.getBoundingClientRect;
  rangeProto.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
  return () => {
    (document as unknown as { execCommand?: unknown }).execCommand = had;
    rangeProto.getBoundingClientRect = hadRect;
  };
}

export const canvasEditor = (id: string) =>
  document.querySelector<HTMLElement>(`#poster-canvas [data-block-id="${id}"] [contenteditable]`)!;
/** A table cell's editor on the canvas, by its index in the row-major cell list. */
export const cellEditor = (id: string, index: number) =>
  document.querySelectorAll<HTMLElement>(`#poster-canvas [data-block-id="${id}"] td [contenteditable]`)[index]!;
/** The Edit block tab's Content box (the one contenteditable outside the canvas). */
export const contentBox = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[contenteditable]')).find((el) => !el.closest('#poster-canvas'))!;

/** Plain text of a stored block's content, as the user reads it. */
export const storedText = (id: string) => {
  const d = document.createElement('div');
  d.innerHTML = usePosterStore.getState().doc!.blocks.find((b) => b.id === id)!.content;
  return d.textContent ?? '';
};
export const storedCell = (id: string, index: number) => {
  const d = document.createElement('div');
  d.innerHTML = usePosterStore.getState().doc!.blocks.find((b) => b.id === id)!.tableData!.cells[index] ?? '';
  return d.textContent ?? '';
};

/** Put a collapsed caret at the end of `el`, as a click after its last word does. */
export function caretAtEnd(el: HTMLElement) {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(r);
}

/** The DOM position `offset` characters into `el`'s text. */
function point(el: HTMLElement, offset: number): [Node, number] {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let left = offset;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (left <= n.data.length) return [n, left];
    left -= n.data.length;
  }
  return [el, el.childNodes.length];
}

/** Select characters [start, end) of `el`'s text, as a drag or Shift+arrows does. */
export function selectText(el: HTMLElement, start: number, end: number) {
  const r = document.createRange();
  r.setStart(...point(el, start));
  r.setEnd(...point(el, end));
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(r);
}

/** Where the caret or selection is, in characters of `el`'s text; null when it is elsewhere. */
export function selectionIn(el: HTMLElement): { start: number; end: number; text: string } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  const start = pre.toString().length;
  return { start, end: start + r.toString().length, text: r.toString() };
}

/** The caret is a collapsed selection at the end of `el`'s text. */
function caretAtEndOf(el: HTMLElement): boolean {
  const at = selectionIn(el);
  return !!at && at.start === at.end && at.end === (el.textContent ?? '').length;
}

/**
 * Click into `el` after its last word. In jsdom a click on a block that is
 * not selected selects it, and the re-render then re-inserts the block's
 * node, which drops the focus (a browser keeps it: one click leaves the
 * caret in the block in Chromium, Firefox and WebKit, MEASURED with the
 * fix 12 probe). When that happens is the scheduler's, later under load,
 * so the caret is put back until it has held at the end for 30 ms.
 */
export async function clickToEnd(el: HTMLElement) {
  fireEvent.click(el);
  let held = 0;
  for (let tries = 0; tries < 100 && held < 3; tries += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    if (document.activeElement === el && caretAtEndOf(el)) {
      held += 1;
    } else {
      held = 0;
      el.focus();
      caretAtEnd(el);
    }
  }
  if (held < 3) throw new Error('the click did not put the caret in the editor');
}

/**
 * Type `text` at the caret, one character per task, as a browser delivers
 * keystrokes: `beforeinput`, the change, `input`. A caret outside the
 * element is put at its end first (the click that started the typing).
 */
export async function typeText(el: HTMLElement, text: string) {
  if (document.activeElement !== el) el.focus();
  for (const ch of text) {
    const sel = window.getSelection()!;
    if (sel.rangeCount === 0 || !el.contains(sel.getRangeAt(0).startContainer)) caretAtEnd(el);
    const ok = el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: ch, bubbles: true, cancelable: true }));
    if (ok) {
      const r = window.getSelection()!.getRangeAt(0);
      r.deleteContents();
      const t = document.createTextNode(ch);
      r.insertNode(t);
      r.setStartAfter(t);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      fireInput(el, 'insertText', ch);
    }
    await nextTask();
  }
}

/** Enter in a multi-line block: the browser inserts a line break at the caret. */
export async function pressEnterIn(el: HTMLElement) {
  const ok = el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true }));
  if (ok) {
    const sel = window.getSelection()!;
    const r = sel.getRangeAt(0);
    const br = document.createElement('br');
    r.insertNode(br);
    r.setStartAfter(br);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    fireInput(el, 'insertParagraph');
  }
  await nextTask();
}

/** Backspace over the current selection (a whole word selected first). */
export async function deleteSelection(el: HTMLElement) {
  const ok = el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
  if (ok) {
    window.getSelection()!.getRangeAt(0).deleteContents();
    fireInput(el, 'deleteContentBackward');
  }
  await nextTask();
}

/**
 * Backspace with a collapsed caret: the browser's beforeinput sees the
 * caret, then the character before it goes.
 */
export async function backspace(el: HTMLElement) {
  const at = selectionIn(el);
  if (!at || at.start === 0) throw new Error('backspace needs a caret after some text');
  const ok = el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
  if (ok) {
    selectText(el, at.start - 1, at.start);
    window.getSelection()!.getRangeAt(0).deleteContents();
    fireInput(el, 'deleteContentBackward');
  }
  await nextTask();
}

/**
 * ⌘X on the selection in an editing host: the browser's `cut` event, then
 * its beforeinput and input of type deleteByCut around the deletion.
 */
export async function cutSelection(el: HTMLElement) {
  fireEvent.cut(el);
  const ok = el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteByCut', bubbles: true, cancelable: true }));
  if (ok) {
    window.getSelection()!.getRangeAt(0).deleteContents();
    fireInput(el, 'deleteByCut');
  }
  await nextTask();
}

/**
 * Text dragged in and dropped at the caret: the browser's beforeinput and
 * input of type insertFromDrop around the insertion. (The `drop` event
 * itself is not fired: the editor does not use it for text.)
 */
export async function dropText(el: HTMLElement, text: string) {
  const ok = el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertFromDrop', bubbles: true, cancelable: true }));
  if (ok) {
    const sel = window.getSelection()!;
    const r = sel.getRangeAt(0);
    const t = document.createTextNode(text);
    r.insertNode(t);
    r.setStartAfter(t);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    fireInput(el, 'insertFromDrop');
  }
  await nextTask();
}

/**
 * Click into a sidebar field. Right after a tab opens, jsdom drops the
 * focus within a task (the field stays in the document); a browser keeps
 * the focus the user's click gave. So the focus is put back until it has
 * held for 30 ms, as `clickToEnd` does for an editing host.
 */
export async function focusField(field: HTMLElement) {
  let held = 0;
  for (let tries = 0; tries < 100 && held < 3; tries += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    if (document.activeElement === field) held += 1;
    else {
      held = 0;
      field.focus();
    }
  }
  if (held < 3) throw new Error('the field did not keep the focus');
}

/**
 * One keystroke in a sidebar <input> or <textarea>, as a browser delivers
 * it: `beforeinput` with the field's selection as it stands (typing
 * `inputType: 'insertText'` with the character, or a deletion), then the
 * change. Leaves the caret at the end of the new value, where jsdom puts it.
 * The field must have the focus (`focusField`): focusing it here would end
 * the undo step by itself, and a test could pass for that reason alone.
 */
export async function keyInto(
  field: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  inputType: 'insertText' | 'deleteContentBackward' | 'insertFromPaste' = 'insertText',
  data: string | null = inputType === 'insertText' ? value.slice(-1) : null,
) {
  if (document.activeElement !== field) throw new Error('keyInto: the field does not have the focus');
  const ok = field.dispatchEvent(new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true }));
  if (ok) fireEvent.change(field, { target: { value } });
  await nextTask();
}

/** ⌘V in a sidebar field: the `paste` event, then the browser's insertFromPaste giving `value`. */
export async function pasteInto(field: HTMLInputElement | HTMLTextAreaElement, value: string, text: string) {
  if (fireEvent.paste(field, { clipboardData: { getData: (t: string) => (t === 'text/plain' ? text : '') } })) {
    await keyInto(field, value, 'insertFromPaste', text);
  }
}

/**
 * The browser's own undo or redo applied to a sidebar field with no
 * `beforeinput` first (Chromium's and Firefox's `execCommand('undo')`,
 * MEASURED by the fix 12 review, round 1): the field's value changes, then
 * an input of that type. The value is set past React, as the browser does.
 */
export async function browserHistoryInField(field: HTMLInputElement | HTMLTextAreaElement, value: string, type: 'historyUndo' | 'historyRedo') {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(field, value);
  field.dispatchEvent(new InputEvent('input', { inputType: type, bubbles: true }));
  await nextTask();
}

function fireComposition(target: Element, type: 'compositionstart' | 'compositionupdate' | 'compositionend', data: string) {
  target.dispatchEvent(new CompositionEvent(type, { data, bubbles: true }));
}

function fireComposing(target: Element, type: 'beforeinput' | 'input', inputType: string, data: string | null) {
  target.dispatchEvent(new InputEvent(type, { inputType, data, isComposing: true, bubbles: true, cancelable: false }));
}

export interface ComposeOptions {
  /**
   * End as the Input Events Level 2 draft does (WebKit): the composed text
   * removed with deleteCompositionText, the commit inserted with
   * insertFromComposition. UNVERIFIED in WebKit itself: Playwright drives
   * no IME there.
   */
  level2?: boolean;
  /** A key released between updates (an IME's candidate list read by arrow keys): keyup with `isComposing`. */
  keyUpBetween?: string;
}

/**
 * One composition (an IME, a dead key, a phone keyboard composing a word)
 * at the caret of an editing host, as Chromium delivers it (MEASURED by the
 * fix 12 review, round 2, through Chromium's own IME pipeline, and by the
 * harness's I* scenarios): compositionstart; per update, compositionupdate,
 * then `beforeinput` of type insertCompositionText with the selection over
 * the text composed so far (a caret for the first), the replacement, and
 * `input`; the commit is one more update of that type, then compositionend.
 * Each update is its own task.
 */
export async function composeIn(el: HTMLElement, updates: string[], commit: string, opts: ComposeOptions = {}) {
  if (document.activeElement !== el) el.focus();
  const sel = window.getSelection()!;
  if (sel.rangeCount === 0 || !el.contains(sel.getRangeAt(0).startContainer)) caretAtEnd(el);
  const at = selectionIn(el)!;
  // Composed over a selection: the first update replaces it.
  const start = at.start;
  let prevLen = at.end - at.start;
  const replace = (text: string) => {
    window.getSelection()!.getRangeAt(0).deleteContents();
    const r = window.getSelection()!.getRangeAt(0);
    const t = document.createTextNode(text);
    r.insertNode(t);
    r.setStartAfter(t);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  };
  fireComposition(el, 'compositionstart', '');
  await nextTask();
  const step = async (text: string) => {
    fireComposition(el, 'compositionupdate', text);
    selectText(el, start, start + prevLen);
    fireComposing(el, 'beforeinput', 'insertCompositionText', text);
    replace(text);
    fireComposing(el, 'input', 'insertCompositionText', text);
    prevLen = text.length;
    await nextTask();
    if (opts.keyUpBetween) {
      fireEvent.keyUp(el, { key: opts.keyUpBetween, isComposing: true });
      await nextTask();
    }
  };
  for (const u of updates) await step(u);
  if (opts.level2) {
    selectText(el, start, start + prevLen);
    fireComposing(el, 'beforeinput', 'deleteCompositionText', null);
    window.getSelection()!.getRangeAt(0).deleteContents();
    fireComposing(el, 'input', 'deleteCompositionText', null);
    selectText(el, start, start);
    fireComposing(el, 'beforeinput', 'insertFromComposition', commit);
    replace(commit);
    fireComposing(el, 'input', 'insertFromComposition', commit);
  } else {
    fireComposition(el, 'compositionupdate', commit);
    selectText(el, start, start + prevLen);
    fireComposing(el, 'beforeinput', 'insertCompositionText', commit);
    replace(commit);
    fireComposing(el, 'input', 'insertCompositionText', commit);
  }
  fireComposition(el, 'compositionend', commit);
  await nextTask();
}

/**
 * The same composition in a sidebar <input> or <textarea> (an author's
 * name), at the field's selection (a caret, or a selection the first
 * update replaces): the field's selection covers the text composed so far
 * at each `beforeinput`, then the value changes. The field must have the
 * focus.
 */
export async function composeInField(field: HTMLInputElement | HTMLTextAreaElement, updates: string[], commit: string) {
  if (document.activeElement !== field) throw new Error('composeInField: the field does not have the focus');
  const start = field.selectionStart ?? field.value.length;
  let prevLen = (field.selectionEnd ?? start) - start;
  fireComposition(field, 'compositionstart', '');
  await nextTask();
  for (const text of [...updates, commit]) {
    fireComposition(field, 'compositionupdate', text);
    field.setSelectionRange(start, start + prevLen);
    fireComposing(field, 'beforeinput', 'insertCompositionText', text);
    const v = field.value;
    fireEvent.change(field, { target: { value: v.slice(0, start) + text + v.slice(start + prevLen) } });
    prevLen = text.length;
    await nextTask();
  }
  fireComposition(field, 'compositionend', commit);
  await nextTask();
}

/** Japanese "にほんご" composed from romaji, committed as 日本語 (the review's sequence). */
export const JAPANESE: [string[], string] = [['n', 'に', 'にh', 'にほ', 'にほn', 'にほん', 'にほんg', 'にほんご'], '日本語'];

/** Leave the field (a click on the empty workspace blurs it). */
export async function leave() {
  (document.activeElement as HTMLElement | null)?.blur?.();
  await nextTask();
}

/**
 * A click on the empty workspace around the sheet, which also deselects
 * every block (the canvas's pointerdown, then the window's pointerup).
 * jsdom has no PointerEvent; the handlers read only a mouse event's fields.
 */
export async function clickEmptyWorkspace() {
  (document.activeElement as HTMLElement | null)?.blur?.();
  const outer = document.querySelector('[data-postr-canvas-outer]')!;
  outer.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 5, clientY: 5 }));
  window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 5, clientY: 5 }));
  await nextTask();
}

/** The blocks marked selected on the canvas. */
export const selectedBlocks = () =>
  [...new Set(Array.from(document.querySelectorAll('[data-postr-selected="true"]')).map((e) => e.getAttribute('data-block-id')))];

export const KEYS = {
  undo: { key: 'z', code: 'KeyZ', metaKey: true },
  redo: { key: 'z', code: 'KeyZ', metaKey: true, shiftKey: true },
  redoUpper: { key: 'Z', code: 'KeyZ', metaKey: true, shiftKey: true },
  redoY: { key: 'y', code: 'KeyY', metaKey: true },
  ctrlUndo: { key: 'z', code: 'KeyZ', ctrlKey: true },
  ctrlRedoUpper: { key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true },
  ctrlRedoY: { key: 'y', code: 'KeyY', ctrlKey: true },
} as const;

/**
 * Press a shortcut with focus on `target` (the focused element receives
 * the keydown). Returns whether the page cancelled the key, which is what
 * keeps the browser's own undo from running.
 */
export async function press(target: Element, init: KeyboardEventInit): Promise<boolean> {
  const notCancelled = fireEvent.keyDown(target, init);
  await nextTask();
  return !notCancelled;
}

/** The browser's own undo or redo arriving at `target` (the Edit menu, or a spill from another field). */
export function browserHistoryInput(target: Element, type: 'historyUndo' | 'historyRedo'): boolean {
  const ev = new InputEvent('beforeinput', { inputType: type, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  return ev.defaultPrevented;
}

/**
 * A button pressed from the keyboard, as a browser delivers it: the key
 * goes to the focused button, and the click it causes has a click count
 * (`detail`) of 0 (Enter clicks on keydown, Space on keyup). Assistive
 * technology's activation also clicks with 0.
 */
export async function pressButtonByKey(button: HTMLElement, key: 'Enter' | ' ' = 'Enter') {
  button.focus();
  fireEvent.keyDown(button, { key });
  if (key === 'Enter') fireEvent.click(button, { detail: 0 });
  fireEvent.keyUp(button, { key });
  if (key === ' ') fireEvent.click(button, { detail: 0 });
  await nextTask();
}

/** A button clicked with the mouse: focused at mousedown (Chromium, Firefox), then a click with a count of 1. */
export async function clickWithPointer(button: HTMLElement) {
  fireEvent.mouseDown(button, { detail: 1 });
  button.focus();
  fireEvent.mouseUp(button, { detail: 1 });
  fireEvent.click(button, { detail: 1 });
  await nextTask();
}

/** "Undo" / "Redo" toasts currently on screen. */
export const toasts = () =>
  Array.from(document.querySelectorAll('div')).filter(
    (d) => d.children.length === 0 && (d.textContent === 'Undo' || d.textContent === 'Redo'),
  ).length;
