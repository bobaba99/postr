/**
 * Fix 12 — how big one undo step of text is, where the caret goes after an
 * undo, table cells, and the selection toolbar. Engineering record:
 * docs/fixes/12-one-undo-history.md.
 *
 * The owner's decisions of 2026-10-06 tested here:
 *   3  Each typed WORD is its own undo step, as in PowerPoint: a new step
 *      starts with the first non-space character typed after a space. A
 *      step also ends at a format change, a paste, a cut, a deleted
 *      selection and Enter. A pause inside a word does not split it.
 *   4  After an undo or redo of text, that block has the focus and the
 *      restored text is selected (the caret is back where the change was).
 *   8  The selection toolbar keeps every button except text size (A+ A−)
 *      and alignment, which never reached the poster.
 *   9  A table cell keeps the order of the letters typed into it, and its
 *      typing joins the history by word like a text block.
 *
 * Entry is typing at the caret (beforeinput, change, input, as a browser
 * delivers it), clicks, and keys pressed on the focused element; never the
 * store. The clock is frozen so main's 600 ms burst window merges every
 * burst here: main's steps are as large as it can make them, and a test of
 * "one step per word" cannot pass on main by a timing accident.
 *
 * Re-run: npx vitest run src/poster/__tests__/undoTextSteps.test.tsx
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// Record 29 hid the Content box, the Format button and the full format bar (config/features.ts ADJUSTMENTS_ENABLED);
// this file tests that kept code, so it turns the switch on. The shipped
// configuration is src/poster/__tests__/mvpHidden.test.tsx.
vi.mock('@/config/features', async (orig) => ({
  ...(await orig<typeof import('@/config/features')>()),
  ADJUSTMENTS_ENABLED: true,
}));
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

import { usePosterStore } from '@/stores/posterStore';
import { click } from './editorKit';
import {
  KEYS,
  NoopResizeObserver,
  backspace,
  canvasEditor,
  cellEditor,
  clickToEnd,
  contentBox,
  cutSelection,
  deleteSelection,
  doc,
  dropText,
  focusField,
  installContentEditableShim,
  installExecCommandShim,
  keyInto,
  leave,
  load,
  nextTask,
  openTab,
  press,
  pressEnterIn,
  q,
  renderEditor,
  selectText,
  selectionIn,
  storedCell,
  storedText,
  typeText,
  undoDoc,
} from './undoKit';

const state = () => usePosterStore.getState();
const ORIGINAL_B1 = 'Our own words, not a placeholder.';
let clock = 1_000_000;

let unshims: Array<() => void> = [];
beforeAll(() => {
  unshims = [installContentEditableShim(), installExecCommandShim()];
});
afterAll(() => unshims.forEach((u) => u()));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  clock = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  load(undoDoc());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** ⌘Z on the page until the block reads `target`; how many presses (≤ 12), or null. */
async function undosUntil(read: () => string, target: string): Promise<number | null> {
  for (let n = 1; n <= 12; n += 1) {
    await press(document.body, KEYS.undo);
    if (read() === target) return n;
  }
  return null;
}

describe('3 — each typed word is one undo step', () => {
  it('two words typed without a pause: ⌘Z removes the last word, then the first', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQWONE ZQWTWO');
    await leave();
    await press(document.body, KEYS.undo);
    expect(storedText('b1')).toBe(`${ORIGINAL_B1} ZQWONE `);
    await press(document.body, KEYS.undo);
    expect(storedText('b1')).toBe(`${ORIGINAL_B1} `);
    await press(document.body, KEYS.undo);
    expect(storedText('b1')).toBe(ORIGINAL_B1);
  });

  it('a pause inside a word does not split it, longer than both burst windows', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, 'ZQAB');
    clock += 6_000; // past the 600 ms idle and the 5 s cap that other edits keep
    await typeText(ed, 'CD');
    await leave();
    expect(await undosUntil(() => storedText('b1'), ORIGINAL_B1)).toBe(1);
  });

  it('backspacing letter by letter is one step', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQWORD');
    await leave();
    await clickToEnd(ed);
    for (let i = 0; i < 4; i += 1) await backspace(ed);
    await leave();
    expect(storedText('b1')).toBe(`${ORIGINAL_B1} ZQ`);
    await press(document.body, KEYS.undo);
    expect(storedText('b1')).toBe(`${ORIGINAL_B1} ZQWORD`);
  });

  it('typing after backspacing is a step of its own', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQWORD');
    await backspace(ed);
    await backspace(ed);
    await typeText(ed, 'X');
    await leave();
    await press(document.body, KEYS.undo);
    expect(storedText('b1')).toBe(`${ORIGINAL_B1} ZQWO`);
  });

  it('a selection deleted after backspacing is a step of its own', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQWORD');
    await leave();
    await clickToEnd(ed);
    await backspace(ed);
    const end = ed.textContent!.length;
    selectText(ed, end - 1, end);
    await deleteSelection(ed);
    await leave();
    await press(document.body, KEYS.undo);
    expect(storedText('b1'), 'only the deleted selection comes back').toBe(`${ORIGINAL_B1} ZQWOR`);
  });

  it('moving the caret (an arrow key, a click) ends the step', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, 'ZQA');
    const end = ed.textContent!.length;
    selectText(ed, end - 1, end - 1);
    fireEvent.keyUp(ed, { key: 'ArrowLeft' });
    await typeText(ed, 'B');
    fireEvent.click(ed);
    selectText(ed, end + 1, end + 1);
    await typeText(ed, 'C');
    await leave();
    await press(document.body, KEYS.undo);
    expect(storedText('b1'), 'after the click').toBe(`${ORIGINAL_B1}ZQBA`);
    await press(document.body, KEYS.undo);
    expect(storedText('b1'), 'after the arrow key').toBe(`${ORIGINAL_B1}ZQA`);
  });

  const BOUNDARIES: Array<[string, (ed: HTMLElement) => Promise<void>, string]> = [
    ['Enter', (ed) => pressEnterIn(ed), `${ORIGINAL_B1}ZQA`],
    ['a format change (B on the toolbar)', async (ed) => {
      const t = ed.textContent!.length;
      selectText(ed, t - 3, t);
      document.dispatchEvent(new Event('selectionchange'));
      await nextTask();
      const b = q<HTMLButtonElement>('button[title="B"]');
      fireEvent.mouseDown(b);
      await nextTask();
      const sel = window.getSelection()!;
      sel.collapseToEnd();
    }, `${ORIGINAL_B1}ZQA`],
    ['a paste', async (ed) => {
      fireEvent.paste(ed, { clipboardData: { getData: (t: string) => (t === 'text/plain' ? 'ZQP' : '') } });
      await nextTask();
    }, `${ORIGINAL_B1}ZQAZQP`],
    // One character pasted reads like one typed: the paste itself says so.
    ['a paste of one character', async (ed) => {
      fireEvent.paste(ed, { clipboardData: { getData: (t: string) => (t === 'text/plain' ? 'P' : '') } });
      await nextTask();
    }, `${ORIGINAL_B1}ZQAP`],
    ['a deleted selection', async (ed) => {
      const t = ed.textContent!.length;
      selectText(ed, t - 1, t);
      await deleteSelection(ed);
    }, `${ORIGINAL_B1}ZQ`],
    // One character cut reads like a backspace, one dropped like a typed
    // letter: the browser's beforeinput says which (stores/inputHint.ts).
    ['a cut of one character', async (ed) => {
      const t = ed.textContent!.length;
      selectText(ed, t - 1, t);
      await cutSelection(ed);
    }, `${ORIGINAL_B1}ZQ`],
    ['a drop of one character', (ed) => dropText(ed, 'D'), `${ORIGINAL_B1}ZQAD`],
  ];

  it.each(BOUNDARIES)('%s ends the step: the word typed after it is undone on its own', async (_label, act, afterFirstUndo) => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, 'ZQA');
    await act(ed);
    await typeText(ed, 'ZQB');
    await leave();
    await press(document.body, KEYS.undo);
    expect(storedText('b1'), 'the first ⌘Z removes only what was typed after it').toBe(afterFirstUndo);
    expect(await undosUntil(() => storedText('b1'), ORIGINAL_B1), 'then the action, then the first word').toBe(2);
  });

  // The / menu's symbol replaces the typed command with execCommand, which
  // fires no beforeinput: the text alone says one character went in over
  // the command, and that starts a step, as a letter typed over a selection.
  it('a symbol picked from the / menu is a step of its own: ⌘Z brings back what was typed', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' /alph');
    fireEvent.keyDown(ed, { key: 'Tab' });
    await nextTask();
    expect(storedText('b1')).toBe(`${ORIGINAL_B1} α`);
    await typeText(ed, 'Q');
    await leave();
    await press(document.body, KEYS.undo);
    expect(storedText('b1'), 'the symbol and the letter typed after it go together').toBe(`${ORIGINAL_B1} /alph`);
  });

  it('Authors › Author name: typing a name is one step per word', async () => {
    renderEditor();
    openTab(/authors/i);
    const name = q<HTMLInputElement>('input[placeholder="Author name"]');
    await focusField(name);
    name.setSelectionRange(0, name.value.length); // the old name selected, then Backspace
    await keyInto(name, '', 'deleteContentBackward');
    for (const v of ['J', 'Jo', 'Joh', 'John', 'John ', 'John S', 'John Sm']) await keyInto(name, v);
    await press(name, KEYS.undo);
    expect(doc().authors[0]!.name).toBe('John ');
    await press(name, KEYS.undo);
    expect(doc().authors[0]!.name).toBe('');
    await press(name, KEYS.undo);
    expect(doc().authors[0]!.name, 'the cleared name is a step of its own').toBe('Jane Doe');
  });

  it('a word typed over a selected word in a field is a step of its own', async () => {
    renderEditor();
    openTab(/authors/i);
    const name = q<HTMLInputElement>('input[placeholder="Author name"]');
    await focusField(name);
    for (const v of ['Jane Doe ', 'Jane Doe J', 'Jane Doe Jr']) await keyInto(name, v);
    name.setSelectionRange(5, 8); // "Doe"
    await keyInto(name, 'Jane R Jr', 'insertText', 'R');
    await press(name, KEYS.undo);
    expect(doc().authors[0]!.name).toBe('Jane Doe Jr');
  });

  it('leaving a field and coming back ends the step', async () => {
    renderEditor();
    openTab(/authors/i);
    const name = q<HTMLInputElement>('input[placeholder="Author name"]');
    await focusField(name);
    await keyInto(name, 'Jane DoeQ');
    name.blur();
    name.focus();
    await keyInto(name, 'Jane DoeQR');
    await press(name, KEYS.undo);
    expect(doc().authors[0]!.name).toBe('Jane DoeQ');
  });

  it('a table caption: two pastes are two steps', async () => {
    renderEditor();
    await click(q('[data-block-id="tb1"]'), 'table tb1');
    openTab(/edit block/i);
    const cap = q<HTMLInputElement>('input[placeholder="table description…"]');
    cap.focus();
    for (const v of ['Mean scores', 'Mean scores by group']) {
      fireEvent.change(cap, { target: { value: v } });
      await nextTask();
    }
    await press(cap, KEYS.undo);
    expect(doc().blocks.find((b) => b.id === 'tb1')!.caption).toBe('Mean scores');
  });

  it('a table note: Enter is a step of its own', async () => {
    renderEditor();
    await click(q('[data-block-id="tb1"]'), 'table tb1');
    openTab(/edit block/i);
    const note = q<HTMLTextAreaElement>('textarea[placeholder^="*Note.*"]');
    note.focus();
    for (const v of ['a', 'ab', 'ab\n', 'ab\nc']) {
      fireEvent.change(note, { target: { value: v } });
      await nextTask();
    }
    await press(note, KEYS.undo);
    await press(note, KEYS.undo);
    expect(doc().blocks.find((b) => b.id === 'tb1')!.note).toBe('ab');
  });

  it('a table caption: one step per typed word', async () => {
    renderEditor();
    await click(q('[data-block-id="tb1"]'), 'table tb1');
    openTab(/edit block/i);
    const cap = q<HTMLInputElement>('input[placeholder="table description…"]');
    cap.focus();
    for (const v of [' ', ' Z', ' ZQ', ' ZQC', ' ZQCA', ' ZQCAP']) {
      fireEvent.change(cap, { target: { value: v } });
      await nextTask();
    }
    await press(cap, KEYS.undo);
    expect(doc().blocks.find((b) => b.id === 'tb1')!.caption).toBe(' ');
  });

  it('select the whole author name and type another: one ⌘Z brings the old name back', async () => {
    renderEditor();
    openTab(/authors/i);
    const name = q<HTMLInputElement>('input[placeholder="Author name"]');
    await focusField(name);
    name.setSelectionRange(0, name.value.length);
    // The browser's beforeinput comes first, with the selection as it is:
    // "Jane Doe" → "J" alone would read as a deletion.
    for (const v of ['J', 'Jo', 'Joh']) await keyInto(name, v);
    await press(name, KEYS.undo);
    expect(doc().authors[0]!.name).toBe('Jane Doe');
  });
});

describe('9 — table cells', () => {
  it('the letters typed into a cell stay in the order typed', async () => {
    renderEditor();
    const cell = cellEditor('tb1', 3);
    await clickToEnd(cell);
    await typeText(cell, 'abc');
    expect(cell.textContent, 'on screen').toBe('4.2abc');
    expect(storedCell('tb1', 3), 'stored').toBe('4.2abc');
  });

  it('a word typed in a cell is one step, undone with ⌘Z in the cell', async () => {
    renderEditor();
    const cell = cellEditor('tb1', 3);
    await clickToEnd(cell);
    await typeText(cell, 'ZQCELL');
    expect(await press(cell, KEYS.undo)).toBe(true);
    expect(storedCell('tb1', 3)).toBe('4.2');
    expect(cell.textContent).toBe('4.2');
  });

  it('in a cell, moving the caret (an arrow key, a click) ends the step', async () => {
    renderEditor();
    const cell = cellEditor('tb1', 3);
    await clickToEnd(cell);
    await typeText(cell, 'ZQA');
    selectText(cell, 5, 5);
    fireEvent.keyUp(cell, { key: 'ArrowLeft' });
    await typeText(cell, 'B');
    fireEvent.click(cell);
    selectText(cell, 7, 7);
    await typeText(cell, 'C');
    await leave();
    await press(document.body, KEYS.undo);
    expect(storedCell('tb1', 3), 'after the click').toBe('4.2ZQBA');
    await press(document.body, KEYS.undo);
    expect(storedCell('tb1', 3), 'after the arrow key').toBe('4.2ZQA');
  });

  it('55 characters typed in a cell do not push an earlier change out of the history', async () => {
    renderEditor();
    openTab(/style/i);
    const font = doc().fontFamily;
    const select = Array.from(document.querySelectorAll('select')).find((s) =>
      Array.from(s.options).some((o) => o.value === font),
    ) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: Array.from(select.options).find((o) => o.value && o.value !== font)!.value } });
    await nextTask();
    const cell = cellEditor('tb1', 3);
    await clickToEnd(cell);
    await typeText(cell, `ZQ${'x'.repeat(53)}`);
    await leave();
    await press(document.body, KEYS.undo);
    await press(document.body, KEYS.undo);
    expect(doc().fontFamily).toBe(font);
    // 55 keystrokes, a render each: room for a loaded machine.
  }, 20_000);
});

describe('4 — after an undo or redo of text, the caret is back where the change was', () => {
  it.each([
    ['the title', 't1'],
    ['a heading', 'h1'],
    ['a text block', 'b1'],
  ])('undo of typing in %s: it has the focus and the caret sits where the word was', async (_label, id) => {
    renderEditor();
    const ed = canvasEditor(id);
    const before = storedText(id);
    await clickToEnd(ed);
    await typeText(ed, 'ZQTYPED');
    await leave();
    await press(document.body, KEYS.undo);
    expect(storedText(id)).toBe(before);
    expect(document.activeElement, 'focus is back in the block').toBe(ed);
    expect(selectionIn(ed)).toEqual({ start: before.length, end: before.length, text: '' });
  });

  it('redo of typing: the word is back and selected', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, 'ZQTYPED');
    await leave();
    await press(document.body, KEYS.undo);
    await leave();
    await press(document.body, KEYS.redo);
    expect(document.activeElement).toBe(ed);
    expect(selectionIn(ed)?.text).toBe('ZQTYPED');
  });

  it('undo of a deleted word: the word is back and selected', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    const at = ORIGINAL_B1.indexOf('placeholder');
    selectText(ed, at, at + 'placeholder'.length);
    await deleteSelection(ed);
    await leave();
    await press(document.body, KEYS.undo);
    expect(storedText('b1')).toBe(ORIGINAL_B1);
    expect(document.activeElement).toBe(ed);
    expect(selectionIn(ed)?.text).toBe('placeholder');
  });

  it('undo of text in another block moves the focus to that block', async () => {
    renderEditor();
    const a = canvasEditor('b1');
    await clickToEnd(a);
    await typeText(a, 'ZQAAA');
    const b = canvasEditor('b2');
    await clickToEnd(b);
    await press(b, KEYS.undo);
    expect(storedText('b1')).toBe(ORIGINAL_B1);
    expect(document.activeElement).toBe(a);
    expect(q('[data-block-id="b1"]').getAttribute('data-postr-selected'), 'and its block is selected').toBe('true');
  });

  it('in the Content box, the undo stays in the Content box', async () => {
    renderEditor();
    await click(q('[data-block-id="b1"]'), 'block b1');
    openTab(/edit block/i);
    const box = contentBox();
    await clickToEnd(box);
    await typeText(box, 'ZQSB');
    await press(box, KEYS.undo);
    expect(document.activeElement).toBe(box);
    expect(selectionIn(box)).toEqual({ start: ORIGINAL_B1.length, end: ORIGINAL_B1.length, text: '' });
  });

  it('undo in a table cell: the cell has focus and the caret sits where the word was', async () => {
    renderEditor();
    const cell = cellEditor('tb1', 3);
    await clickToEnd(cell);
    await typeText(cell, 'ZQCELL');
    await leave();
    await press(document.body, KEYS.undo);
    expect(document.activeElement).toBe(cell);
    expect(selectionIn(cell)).toEqual({ start: 3, end: 3, text: '' });
  });

  it('undo of a format change: the text it was on is selected again', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    const at = ORIGINAL_B1.indexOf('placeholder');
    selectText(ed, at, at + 'placeholder'.length);
    fireEvent.mouseDown(q<HTMLButtonElement>('button[title="B"]'));
    await nextTask();
    expect(ed.innerHTML).toContain('<b>placeholder</b>');
    await leave();
    await press(document.body, KEYS.undo);
    expect(document.activeElement).toBe(ed);
    expect(selectionIn(ed)?.text).toBe('placeholder');
  });

  it('a focused cell rewritten by the undo of a wider step keeps its caret', async () => {
    load({
      ...undoDoc(),
      blocks: undoDoc().blocks.map((b) =>
        b.id === 'tb1' ? { ...b, tableData: { ...b.tableData!, cells: ['Group', 'Mean', 'M = 4.2', 'p < .05', 'DV 2', '3.9'] } } : b,
      ),
    });
    renderEditor();
    await click(q('[data-block-id="tb1"]'), 'table tb1');
    openTab(/edit block/i);
    const format = Array.from(document.querySelectorAll('button')).find((b) => /Format table/.test(b.textContent ?? ''))!;
    await click(format, 'Format table');
    expect(doc().blocks.find((b) => b.id === 'tb1')!.tableData!.cells[2]).not.toBe('M = 4.2');
    const cell = cellEditor('tb1', 2);
    await clickToEnd(cell);
    selectText(cell, 3, 3);
    await press(cell, KEYS.undo);
    expect(doc().blocks.find((b) => b.id === 'tb1')!.tableData!.cells[2], 'the format is undone').toBe('M = 4.2');
    expect(cell.innerHTML).toBe('M = 4.2');
    expect(document.activeElement).toBe(cell);
    expect(selectionIn(cell)).toEqual({ start: 3, end: 3, text: '' });
  });

  it('control: undo of a change that is not text leaves the caret where it is', async () => {
    renderEditor();
    openTab(/style/i);
    const font = doc().fontFamily;
    const select = Array.from(document.querySelectorAll('select')).find((s) =>
      Array.from(s.options).some((o) => o.value === font),
    ) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: Array.from(select.options).find((o) => o.value && o.value !== font)!.value } });
    await nextTask();
    const ed = canvasEditor('b2');
    await clickToEnd(ed);
    await press(ed, KEYS.undo);
    expect(doc().fontFamily).toBe(font);
    expect(document.activeElement).toBe(ed);
  });
});

describe('the browser’s own events never become edits', () => {
  it('an input that changes nothing adds no step, so the editor’s redo survives', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, 'ZQTYPED');
    await leave();
    await press(document.body, KEYS.undo);
    expect(state().canRedo).toBe(true);
    await clickToEnd(ed);
    ed.dispatchEvent(new InputEvent('input', { inputType: 'insertText', bubbles: true }));
    await nextTask();
    expect(state().canRedo).toBe(true);
  });
});

describe('8 — the selection toolbar keeps every button but text size and alignment', () => {
  const GONE = ['Smaller', 'Larger', '⟸', '≡', '⟹'];
  const KEPT = ['B', 'I', 'U', 'S', '•', '1.', '⇥', '⇤', 'Highlight · Yellow', 'Text · Red', 'Clear formatting'];
  const titles = (root: ParentNode) => Array.from(root.querySelectorAll('button')).map((b) => b.getAttribute('title'));

  it('the docked toolbar in the Edit block tab', async () => {
    renderEditor();
    await click(q('[data-block-id="b1"]'), 'block b1');
    openTab(/edit block/i);
    const box = Array.from(document.querySelectorAll('label')).find((l) => l.textContent === 'Content')!.parentElement!;
    const t = titles(box);
    for (const g of GONE) expect(t, `no "${g}"`).not.toContain(g);
    for (const k of KEPT) expect(t, `"${k}" kept`).toContain(k);
  });

  it('the floating toolbar over a selection on the canvas', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    selectText(ed, 0, 3);
    document.dispatchEvent(new Event('selectionchange'));
    await nextTask();
    const bar = q<HTMLElement>('.postr-format-toolbar-enter');
    expect(bar, 'the toolbar is showing').not.toBeNull();
    const t = titles(bar);
    for (const g of GONE) expect(t, `no "${g}"`).not.toContain(g);
    for (const k of KEPT) expect(t, `"${k}" kept`).toContain(k);
  });
});
