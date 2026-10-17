/**
 * Record 39 — text editing like PowerPoint (docs/fixes/39-text-editing.md;
 * the MVP design doc bounded-designs.md §3.2 "Text editing rules"). Each
 * rule is tested where the user enters: a click into a text block, typing
 * at the caret, a selection as Shift + arrows leaves it, a mouse press on
 * the format bar's buttons, a key pressed on the focused element; then
 * ⌘Z / ⌘⇧Z. The store is read, never called.
 *
 *   T1  the format bar: B · I · U · x² · x₂ · bullets · numbered · Clear;
 *       x² / x₂ wrap the selection in superscript / subscript, again
 *       removes it, the two exclude each other, each shows its state, one
 *       undo step each
 *   T2  PowerPoint's keys in text: Ctrl + Shift + = superscript, Ctrl + =
 *       subscript (Control on a Mac, ⌘ may be held with it); outside text
 *       they are the browser's
 *   T4  "/" at the start of a word opens the symbol menu (all 65 symbols;
 *       the design doc's 66 was a miscount); in
 *       a word it is a slash; Tab or a click inserts the highlighted entry,
 *       Enter only after an arrow moved it, otherwise Enter is the block's;
 *       Esc closes it
 *
 * jsdom has no layout, no execCommand (undoKit's shim does the few the
 * editor uses) and no selectionchange event (the tests send it where a
 * browser would, after a selection the user made). x² and x₂ do not use
 * execCommand (scriptFormat.ts), so the shim is not in their path.
 * `navigator.platform` is not a Mac's here, so the keys are Ctrl's; the
 * Mac's mapping is read directly in scriptFormat.test.ts (a unit test). The browser
 * instrument is scripts/keep-work-check.mjs --only TE
 * (lib/keepWorkTextEdit.mjs).
 *
 * Re-run: npx vitest run src/poster/__tests__/textEditing.test.tsx
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';

const authSpies = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: authSpies,
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
  },
}));
vi.mock('@/data/posters', async (orig) => ({
  ...(await orig<typeof import('@/data/posters')>()),
  upsertPoster: vi.fn(async () => ({})),
}));
vi.mock('@/data/thumbnails', () => ({ captureThumbnail: vi.fn(async () => null) }));
vi.mock('@/motion/timelines/editorEntrance', () => ({ editorEntrance: vi.fn() }));
vi.mock('@/motion/timelines/blockSelection', () => ({ blockSelection: vi.fn() }));

import type { PosterDoc } from '@postr/shared';
import { SYMBOLS } from '../symbols';
import {
  KEYS,
  NoopResizeObserver,
  backspace,
  canvasEditor,
  clickToEnd,
  doc,
  installContentEditableShim,
  installExecCommandShim,
  load,
  nextTask,
  press,
  q,
  renderEditor,
  selectText,
  typeText,
  undoDoc,
} from './undoKit';

const content = (id: string) => doc().blocks.find((b) => b.id === id)!.content;
const SUP_KEY = { key: '+', code: 'Equal', ctrlKey: true, shiftKey: true };
const SUB_KEY = { key: '=', code: 'Equal', ctrlKey: true };

let unshims: Array<() => void> = [];
beforeAll(() => {
  unshims = [installContentEditableShim(), installExecCommandShim()];
});
afterAll(() => unshims.forEach((u) => u()));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  load(undoDoc());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** A selection the user made (Shift + arrows): the browser then tells the page. */
async function select(el: HTMLElement, start: number, end: number) {
  selectText(el, start, end);
  document.dispatchEvent(new Event('selectionchange'));
  await nextTask();
}

const bar = () => q<HTMLElement>('.postr-format-toolbar-enter');
const barButton = (text: string) => Array.from(bar()?.querySelectorAll('button') ?? []).find((b) => (b.textContent ?? '').trim() === text);

/** A mouse press on the format bar's button (the bar acts on mousedown, keeping the selection). */
async function pressBar(text: string) {
  const b = barButton(text);
  if (!b) throw new Error(`the format bar has no "${text}"`);
  fireEvent.mouseDown(b);
  fireEvent.mouseUp(b);
  fireEvent.click(b);
  await nextTask();
}

/** " ZQH2O" typed at the end of text block b1, and its "2" selected. */
async function typedFormula(): Promise<HTMLElement> {
  renderEditor();
  const ed = canvasEditor('b1');
  await clickToEnd(ed);
  await typeText(ed, ' ZQH2O');
  const at = (ed.textContent ?? '').indexOf('ZQH2O') + 3;
  await select(ed, at, at + 1);
  return ed;
}

describe('T1 — the format bar over selected text', () => {
  it('has B · I · U · x² · x₂ · bullets · numbered · Clear, in that order', async () => {
    await typedFormula();
    expect(bar(), 'the bar shows over the selection').not.toBeNull();
    const texts = Array.from(bar()!.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());
    expect(texts).toEqual(['B', 'I', 'U', 'x²', 'x₂', '•', '1.', 'Clear']);
    // jsdom is not a Mac: Ctrl's keys (a Mac's: scriptFormat.test.ts).
    expect(barButton('x²')!.getAttribute('title')).toBe('Superscript (Ctrl+Shift+=)');
    expect(barButton('x₂')!.getAttribute('title')).toBe('Subscript (Ctrl+=)');
  });

  it('x² wraps the selection in superscript and shows pressed; pressed again it removes it', async () => {
    const ed = await typedFormula();
    await pressBar('x²');
    expect(content('b1')).toMatch(/ZQH<sup>2<\/sup>O$/);
    // No selectionchange: the state is read again after the change itself.
    expect(barButton('x²')!.getAttribute('aria-pressed')).toBe('true');
    expect(barButton('x₂')!.getAttribute('aria-pressed')).toBe('false');
    expect(window.getSelection()!.toString(), 'the same text stays selected').toBe('2');
    await pressBar('x²');
    expect(content('b1')).toMatch(/ZQH2O$/);
    expect(content('b1')).not.toMatch(/<su[bp]/);
    expect(barButton('x²')!.getAttribute('aria-pressed')).toBe('false');
    expect(ed.innerHTML).not.toMatch(/<su[bp]/);
  });

  it('x² then x₂: subscript only, and the bar says so', async () => {
    await typedFormula();
    await pressBar('x²');
    await pressBar('x₂');
    expect(content('b1')).toMatch(/ZQH<sub>2<\/sub>O$/);
    expect(content('b1')).not.toMatch(/<sup/);
    expect(barButton('x₂')!.getAttribute('aria-pressed')).toBe('true');
    expect(barButton('x²')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('one ⌘Z takes the superscript away and keeps the typed word; ⌘⇧Z puts it back', async () => {
    const ed = await typedFormula();
    await pressBar('x²');
    expect(content('b1')).toMatch(/<sup>2<\/sup>/);
    await press(ed, KEYS.undo);
    expect(content('b1')).toMatch(/ZQH2O$/);
    expect(content('b1')).not.toMatch(/<sup/);
    expect(ed.innerHTML).not.toMatch(/<sup/);
    await press(ed, KEYS.redo);
    expect(content('b1')).toMatch(/ZQH<sup>2<\/sup>O$/);
  });

  it('a selection across plain and superscript text is made all superscript, then all plain', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQab');
    const at = (ed.textContent ?? '').indexOf('ZQab') + 2;
    await select(ed, at + 1, at + 2);
    await pressBar('x²');
    expect(content('b1')).toMatch(/ZQa<sup>b<\/sup>$/);
    await select(ed, at, at + 2);
    expect(barButton('x²')!.getAttribute('aria-pressed'), 'half superscript is not superscript').toBe('false');
    await pressBar('x²');
    expect(content('b1')).toMatch(/ZQ<sup>ab<\/sup>$/);
    await pressBar('x²');
    expect(content('b1')).toMatch(/ZQab$/);
  });

  it('the bullets and numbered buttons show whether the selection is in such a list', async () => {
    const d: PosterDoc = undoDoc();
    load({ ...d, blocks: d.blocks.map((b) => (b.id === 'b1' ? { ...b, content: '<ul><li>ZQL1</li></ul>' } : b.id === 'b2' ? { ...b, content: '<ol><li>ZQN1</li></ol>' } : b)) });
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await select(ed, 0, 4);
    expect(barButton('•')!.getAttribute('aria-pressed')).toBe('true');
    expect(barButton('1.')!.getAttribute('aria-pressed')).toBe('false');
    const ed2 = canvasEditor('b2');
    await clickToEnd(ed2);
    await select(ed2, 0, 4);
    expect(barButton('1.')!.getAttribute('aria-pressed')).toBe('true');
    expect(barButton('•')!.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('T2 — PowerPoint\'s superscript and subscript keys, in text only', () => {
  it('Ctrl + Shift + = toggles superscript on the selection and takes the key; Ctrl + = subscript', async () => {
    const ed = await typedFormula();
    expect(await press(ed, SUP_KEY), 'the key is the page\'s in text').toBe(true);
    expect(content('b1')).toMatch(/ZQH<sup>2<\/sup>O$/);
    await press(ed, SUP_KEY);
    expect(content('b1')).toMatch(/ZQH2O$/);
    expect(await press(ed, SUB_KEY)).toBe(true);
    expect(content('b1')).toMatch(/ZQH<sub>2<\/sub>O$/);
    await press(ed, SUP_KEY);
    expect(content('b1')).toMatch(/ZQH<sup>2<\/sup>O$/);
    expect(content('b1')).not.toMatch(/<sub/);
  });

  it('one ⌘Z undoes the key\'s change', async () => {
    const ed = await typedFormula();
    await press(ed, SUP_KEY);
    await press(ed, KEYS.undo);
    expect(content('b1')).toMatch(/ZQH2O$/);
    expect(content('b1')).not.toMatch(/<sup/);
  });

  it('with only a caret the key is taken and changes nothing', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    const before = content('b1');
    expect(await press(ed, SUP_KEY)).toBe(true);
    expect(content('b1')).toBe(before);
  });

  it('Ctrl + the keypad\'s + in text is the browser\'s (its zoom on Windows): not taken, nothing changes (review R1-F3)', async () => {
    await typedFormula();
    const ed = canvasEditor('b1');
    const before = content('b1');
    expect(await press(ed, { key: '+', code: 'NumpadAdd', ctrlKey: true })).toBe(false);
    expect(await press(ed, { key: '+', code: 'NumpadAdd', ctrlKey: true, shiftKey: true })).toBe(false);
    expect(content('b1')).toBe(before);
    expect(ed.innerHTML).not.toMatch(/<su[bp]/);
  });

  it('outside text the keys are the browser\'s: not taken, nothing changes', async () => {
    renderEditor();
    const before = JSON.stringify(doc());
    expect(await press(document.body, SUP_KEY)).toBe(false);
    expect(await press(document.body, SUB_KEY)).toBe(false);
    fireEvent.click(q('#poster-canvas [data-block-id="b1"]'));
    await nextTask();
    expect(await press(document.body, SUP_KEY)).toBe(false);
    expect(JSON.stringify(doc())).toBe(before);
  });

});

describe('T3 — a copy or cut of superscript or subscript text alone keeps it (review R1-F1)', () => {
  /** A clipboard as a browser hands it to the copy, cut and paste events. */
  const clipboard = () => {
    const data: Record<string, string> = {};
    return { data, setData: (t: string, v: string) => { data[t] = v; }, getData: (t: string) => data[t] ?? '', types: [] as string[], files: [] as File[], items: [] as unknown[] };
  };
  /** ⌘C or ⌘X on the focused text: the event the browser fires; whether the page took it (cancelled) and what it wrote. */
  async function copyOrCut(el: HTMLElement, cut: boolean) {
    const clip = clipboard();
    const taken = !(cut ? fireEvent.cut(el, { clipboardData: clip }) : fireEvent.copy(el, { clipboardData: clip }));
    await nextTask();
    return { taken, data: clip.data };
  }
  /** ⌘V of `data` at the end of text block `id`. */
  async function pasteAtEnd(id: string, data: Record<string, string>) {
    const ed = canvasEditor(id);
    await clickToEnd(ed);
    fireEvent.paste(ed, { clipboardData: { getData: (t: string) => data[t] ?? '', types: Object.keys(data), files: [], items: [] } });
    await nextTask();
  }

  it('the superscript "2" alone, copied with ⌘C: the page writes <sup>2</sup>, and ⌘V into another block keeps it', async () => {
    const ed = await typedFormula();
    await pressBar('x²');
    expect(content('b1')).toMatch(/ZQH<sup>2<\/sup>O$/);
    expect(window.getSelection()!.toString()).toBe('2');
    const { taken, data } = await copyOrCut(ed, false);
    expect(taken, 'the copy is the page\'s').toBe(true);
    expect(data['text/html']).toBe('<sup>2</sup>');
    expect(data['text/plain']).toBe('2');
    expect(content('b1'), 'a copy changes nothing').toMatch(/ZQH<sup>2<\/sup>O$/);
    await pasteAtEnd('b2', data);
    expect(content('b2')).toMatch(/<sup>2<\/sup>$/);
  });

  it('subscript inside bold: both are written around the copied text', async () => {
    const d = undoDoc();
    load({ ...d, blocks: d.blocks.map((b) => (b.id === 'b1' ? { ...b, content: 'ZQ<b>C<sub>12</sub></b>X' } : b)) });
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await select(ed, 3, 4);
    const { taken, data } = await copyOrCut(ed, false);
    expect(taken).toBe(true);
    expect(data['text/html']).toBe('<b><sub>1</sub></b>');
  });

  it('a selection that reaches outside the superscript is the browser\'s own copy (it keeps the <sup> there)', async () => {
    const ed = await typedFormula();
    await pressBar('x²');
    const at = (ed.textContent ?? '').indexOf('ZQH2O');
    await select(ed, at + 2, at + 4);
    expect(window.getSelection()!.toString()).toBe('H2');
    const { taken } = await copyOrCut(ed, false);
    expect(taken).toBe(false);
  });

  it('the superscript "2" alone, cut with ⌘X: removed, written to the clipboard, one ⌘Z puts it back', async () => {
    const ed = await typedFormula();
    await pressBar('x²');
    const { taken, data } = await copyOrCut(ed, true);
    expect(taken).toBe(true);
    expect(data['text/html']).toBe('<sup>2</sup>');
    expect(content('b1')).toMatch(/ZQHO$/);
    expect(ed.innerHTML).not.toMatch(/<sup/);
    await press(ed, KEYS.undo);
    expect(content('b1'), 'one step: the cut, not the typed word').toMatch(/ZQH<sup>2<\/sup>O$/);
  });

  it('a cut is a step of its own: a Backspace after it is undone on its own (fix 12\'s rule)', async () => {
    const ed = await typedFormula();
    await pressBar('x²');
    await copyOrCut(ed, true);
    expect(content('b1')).toMatch(/ZQHO$/);
    await backspace(ed);
    expect(content('b1')).toMatch(/ZQO$/);
    await press(ed, KEYS.undo);
    expect(content('b1'), 'the Backspace undone, the cut kept').toMatch(/ZQHO$/);
    await press(ed, KEYS.undo);
    expect(content('b1')).toMatch(/ZQH<sup>2<\/sup>O$/);
  });
});

describe('T4 — the "/" symbol menu', () => {
  const menu = () => q<HTMLElement>('[role="listbox"]');
  const options = () => Array.from(menu()?.querySelectorAll('[role="option"]') ?? []);
  const highlighted = () => options().findIndex((o) => o.getAttribute('aria-selected') === 'true');
  const text = (el: HTMLElement) => el.textContent ?? '';

  /** An arrow key as a browser delivers it: keydown, then keyup; whether the keydown was cancelled. */
  async function arrow(el: HTMLElement, key: 'ArrowDown' | 'ArrowUp') {
    const cancelled = await press(el, { key, code: key });
    fireEvent.keyUp(el, { key, code: key });
    await nextTask();
    return cancelled;
  }

  async function editorEnd(id = 'b1') {
    renderEditor();
    const ed = canvasEditor(id);
    await clickToEnd(ed);
    return ed;
  }

  it('"/" after a space opens the menu with every symbol (65), the first highlighted', async () => {
    // The design doc and the inventory said 66; symbols.ts has 65 (record 39 §4).
    expect(Object.keys(SYMBOLS)).toHaveLength(65);
    const ed = await editorEnd();
    await typeText(ed, ' /');
    expect(menu()).not.toBeNull();
    expect(options()).toHaveLength(65);
    expect(highlighted()).toBe(0);
  });

  it.each([' n/a', ' w/', ' μg/d', ' see Fig. 2/', ' mg/kg'])('"/" inside a word is a slash: "%s" opens no menu, and Enter is the block\'s own', async (word) => {
    const ed = await editorEnd();
    await typeText(ed, word);
    expect(menu()).toBeNull();
    const before = text(ed);
    expect(await press(ed, { key: 'Enter', code: 'Enter' }), 'Enter left to the block').toBe(false);
    expect(text(ed)).toBe(before);
  });

  it('"/" at the start of a line (after a line break) opens the menu', async () => {
    const d = undoDoc();
    load({ ...d, blocks: d.blocks.map((b) => (b.id === 'b1' ? { ...b, content: 'ZQ first line<br>' } : b)) });
    const ed = await editorEnd();
    await typeText(ed, '/al');
    expect(menu()).not.toBeNull();
    expect(options()).toHaveLength(1);
  });

  it('a symbol inserted at the start of a line keeps the line break before it', async () => {
    const d = undoDoc();
    load({ ...d, blocks: d.blocks.map((b) => (b.id === 'b1' ? { ...b, content: 'ZQ first line<br>' } : b)) });
    const ed = await editorEnd();
    await typeText(ed, '/al');
    expect(await press(ed, { key: 'Tab', code: 'Tab' })).toBe(true);
    expect(content('b1')).toBe('ZQ first line<br>α');
  });

  it('"/" at the block\'s start opens the menu', async () => {
    const d = undoDoc();
    load({ ...d, blocks: d.blocks.map((b) => (b.id === 'b1' ? { ...b, content: '' } : b)) });
    const ed = await editorEnd();
    await typeText(ed, '/');
    expect(options()).toHaveLength(65);
  });

  it('Enter with no arrow pressed closes the menu and inserts nothing; the new line is the block\'s', async () => {
    const ed = await editorEnd();
    await typeText(ed, ' /al');
    expect(menu()).not.toBeNull();
    expect(await press(ed, { key: 'Enter', code: 'Enter' }), 'Enter left to the block').toBe(false);
    expect(menu()).toBeNull();
    expect(text(ed)).toMatch(/ \/al$/);
    expect(content('b1')).not.toMatch(/α/);
  });

  it('↓ moves the highlight, and then Enter inserts the highlighted symbol', async () => {
    const ed = await editorEnd();
    await typeText(ed, ' /a');
    expect(options().map((o) => o.textContent)).toEqual(['/alphaα', '/approx≈', '/arrow→']);
    expect(await arrow(ed, 'ArrowDown'), 'the arrow is the menu\'s').toBe(true);
    expect(highlighted()).toBe(1);
    await arrow(ed, 'ArrowUp');
    await arrow(ed, 'ArrowUp');
    expect(highlighted(), '↑ from the first goes round to the last').toBe(2);
    await arrow(ed, 'ArrowDown');
    await arrow(ed, 'ArrowDown');
    expect(highlighted()).toBe(1);
    expect(await press(ed, { key: 'Enter', code: 'Enter' })).toBe(true);
    expect(text(ed)).toMatch(/ ≈$/);
    expect(content('b1')).toMatch(/ ≈$/);
    expect(menu()).toBeNull();
  });

  it('Tab inserts the highlighted symbol: the first, or the one an arrow moved to', async () => {
    const ed = await editorEnd();
    await typeText(ed, ' /al');
    expect(await press(ed, { key: 'Tab', code: 'Tab' })).toBe(true);
    expect(content('b1')).toMatch(/ α$/);
    await typeText(ed, ' /a');
    await arrow(ed, 'ArrowDown');
    await arrow(ed, 'ArrowDown');
    expect(await press(ed, { key: 'Tab', code: 'Tab' })).toBe(true);
    expect(content('b1')).toMatch(/ α →$/);
  });

  it('a click on an entry inserts that symbol', async () => {
    const ed = await editorEnd();
    await typeText(ed, ' /s');
    const sqrt = options().find((o) => o.textContent?.includes('√'))!;
    fireEvent.mouseDown(sqrt);
    await nextTask();
    expect(content('b1')).toMatch(/ √$/);
    void ed;
  });

  it('Esc closes the menu and leaves the text as typed', async () => {
    const ed = await editorEnd();
    await typeText(ed, ' /al');
    expect(await press(ed, { key: 'Escape', code: 'Escape' })).toBe(true);
    expect(menu()).toBeNull();
    expect(text(ed)).toMatch(/ \/al$/);
  });

  it('in a title, Enter with the menu open closes it and does nothing else', async () => {
    const ed = await editorEnd('t1');
    await typeText(ed, ' /al');
    expect(menu()).not.toBeNull();
    expect(await press(ed, { key: 'Enter', code: 'Enter' }), 'a title takes no line break').toBe(true);
    expect(menu()).toBeNull();
    expect(content('t1')).toMatch(/ \/al$/);
  });

  it.each([
    ['the arrow let go first', true],
    ['Shift let go first', false],
  ])('Shift + ↓ with the menu open is the text\'s: the selection it makes closes the menu, and Tab then inserts nothing (%s; review R1-F6)', async (_how, shiftAtKeyUp) => {
    const d = undoDoc();
    load({ ...d, blocks: d.blocks.map((b) => (b.id === 'b1' ? { ...b, content: 'ZQM1<br>ZQM2' } : b)) });
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    selectText(ed, 0, 0);
    await typeText(ed, ' /a');
    expect(menu()).not.toBeNull();
    const down = { key: 'ArrowDown', code: 'ArrowDown', shiftKey: true };
    expect(await press(ed, down), 'Shift + ↓ is left to the text').toBe(false);
    // The browser extends the selection to the next line, then the key comes up.
    selectText(ed, 3, 8);
    document.dispatchEvent(new Event('selectionchange'));
    fireEvent.keyUp(ed, { ...down, shiftKey: shiftAtKeyUp });
    await nextTask();
    expect(menu()).toBeNull();
    expect(await press(ed, { key: 'Tab', code: 'Tab' })).toBe(false);
    expect(content('b1')).not.toMatch(/α/);
  });

  it('near the window\'s bottom the menu opens above the caret, within the window (review R1-F5)', async () => {
    const proto = Range.prototype as unknown as { getBoundingClientRect: () => DOMRect };
    const had = proto.getBoundingClientRect;
    // The caret drawn 60 px above the window's bottom (jsdom has no layout).
    proto.getBoundingClientRect = () => new DOMRect(100, window.innerHeight - 60, 0, 16);
    try {
      const ed = await editorEnd();
      await typeText(ed, ' /');
      const box = menu()!;
      expect(box).not.toBeNull();
      expect(box.style.top).toBe('');
      expect(box.style.bottom).toBe('66px');
      expect(parseFloat(box.style.maxHeight)).toBe(220);
    } finally {
      proto.getBoundingClientRect = had;
    }
  });

  it('letters that name no symbol close the menu: the arrows, Tab and Esc are the text\'s again', async () => {
    const ed = await editorEnd();
    await typeText(ed, ' /zq');
    expect(menu()).toBeNull();
    expect(q('[data-postr-takes-escape]')).toBeNull();
    expect(await arrow(ed, 'ArrowDown'), '↓ moves the caret').toBe(false);
    expect(await press(ed, { key: 'Tab', code: 'Tab' })).toBe(false);
    expect(await press(ed, { key: 'Escape', code: 'Escape' })).toBe(false);
    expect(content('b1')).toMatch(/ \/zq$/);
  });
});
