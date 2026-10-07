/**
 * Fix 12, review round 1 — what the browser says about an edit decides the
 * undo step, not only how the text changed. Engineering record:
 * docs/fixes/12-one-undo-history.md, section 9.
 *
 * A diff of the text before and after cannot tell a typed letter from a
 * colour picked one hex digit later, a one-character paste, or a letter
 * typed in front of a word that starts with the same letter. The browser
 * can: it fires `beforeinput` for typing and deleting (never for a colour
 * input), a `paste` event for a paste, and an input of type historyUndo /
 * historyRedo when its own undo ran. Each finding of the round is tested
 * here where the user enters:
 *   R1-F1  colour picks are not typing: a drag is one step (owner decision 3
 *          keeps non-text grouping);
 *   R1-F2  a paste of one character is a step of its own in a sidebar field
 *          too (the canvas case is undoTextSteps' "a paste of one
 *          character", with the shim firing what the engines fire);
 *   R1-F3  the browser's own undo or redo in a sidebar field is never
 *          stored (owner decision 1), and a key typed before that task's
 *          end-of-task timer still is;
 *   R1-F4  ⌘Y on a layout with no Latin Y; the browser's redo input on a
 *          block; deletions in a sidebar field across pauses;
 *   R1-F5  a punctuation key on the Z key's place (Dvorak) is not undo;
 *   R1-F6  a new word starts where the caret is, whatever follows it.
 *
 * Re-run: npx vitest run src/poster/__tests__/undoInputKinds.test.tsx
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

import { usePosterStore } from '@/stores/posterStore';
import { click } from './editorKit';
import {
  KEYS,
  NoopResizeObserver,
  browserHistoryInField,
  canvasEditor,
  clickToEnd,
  doc,
  focusField,
  installContentEditableShim,
  installExecCommandShim,
  keyInto,
  leave,
  load,
  nextTask,
  openTab,
  pasteInto,
  press,
  q,
  renderEditor,
  selectText,
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
  // Frozen: every edit lands inside the 600 ms burst window unless a test
  // moves the clock, so a step boundary seen here is not a timing accident.
  clock = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  load(undoDoc());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const authorName = () => q<HTMLInputElement>('input[placeholder="Author name"]');
const caption = () => doc().blocks.find((b) => b.id === 'tb1')!.caption ?? '';

/** Type `text` at the end of a sidebar field, one keystroke at a time. */
async function typeAtEnd(field: HTMLInputElement, text: string) {
  for (const ch of text) await keyInto(field, field.value + ch);
}

/** Pick colours in Edit block's colour field, one event per task: no beforeinput (a colour input fires none). */
async function pickColours(values: string[]) {
  await click(q('[data-block-id="b1"]'), 'block b1');
  openTab(/edit block/i);
  const input = q<HTMLInputElement>('input[type="color"]');
  for (const value of values) {
    fireEvent.change(input, { target: { value } });
    await nextTask();
  }
}

describe('R1-F1 — a colour picked is not typing, even one hex digit at a time', () => {
  it('three picks one hex digit apart are one undo step', async () => {
    renderEditor();
    const before = doc().styles.body.color;
    await pickColours(['#112233', '#112234', '#112235']);
    expect(doc().styles.body.color).toBe('#112235');
    await press(document.body, KEYS.undo);
    expect(doc().styles.body.color).toBe(before);
  });

  it('a drag through one colour channel, 30 events, is one undo step', async () => {
    renderEditor();
    const before = doc().styles.body.color;
    await pickColours(Array.from({ length: 30 }, (_, i) => `#3a5f${(i + 1).toString(16).padStart(2, '0')}`));
    expect(doc().styles.body.color).toBe('#3a5f1e');
    await press(document.body, KEYS.undo);
    expect(doc().styles.body.color).toBe(before);
  });
});

describe('R1-F2 — a paste of one character in a sidebar field is a step of its own', () => {
  it('Authors › Author name: typed "Q", pasted "R", typed "S": ⌘Z removes "S", then "R"', async () => {
    renderEditor();
    openTab(/authors/i);
    const name = authorName();
    await focusField(name);
    await typeAtEnd(name, 'Q');
    await pasteInto(name, 'Jane DoeQR', 'R');
    await typeAtEnd(name, 'S');
    await press(name, KEYS.undo);
    expect(doc().authors[0]!.name).toBe('Jane DoeQR');
    await press(name, KEYS.undo);
    expect(doc().authors[0]!.name).toBe('Jane DoeQ');
  });
});

describe('R1-F3 — the browser’s own undo or redo in a sidebar field is never stored', () => {
  it('Authors › Author name: its undo (no beforeinput) leaves the poster and the field as they were', async () => {
    renderEditor();
    openTab(/authors/i);
    const name = authorName();
    await focusField(name);
    await typeAtEnd(name, ' ZQX');
    expect(doc().authors[0]!.name).toBe('Jane Doe ZQX');
    await browserHistoryInField(name, 'Jane Doe ZQ', 'historyUndo');
    expect(doc().authors[0]!.name, 'the store is unchanged').toBe('Jane Doe ZQX');
    expect(state().canRedo, 'no step was added').toBe(false);
    expect(name.value, 'the field shows the poster again').toBe('Jane Doe ZQX');
    // The editor's own ⌘Z then undoes the word, not a stored browser step.
    await press(name, KEYS.undo);
    expect(doc().authors[0]!.name).toBe('Jane Doe ');
  });

  it('a key typed right after it, before the browser’s end-of-task timer ran, is stored', async () => {
    renderEditor();
    openTab(/authors/i);
    const name = authorName();
    await focusField(name);
    await typeAtEnd(name, ' ZQX');
    // Chromium runs a keystroke queued during a long task before that
    // task's timers: the history input and the next key with no timer
    // between them.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(name, 'Jane Doe ZQ');
    name.dispatchEvent(new InputEvent('input', { inputType: 'historyUndo', bubbles: true }));
    fireEvent.keyDown(name, { key: 'Y', code: 'KeyY' });
    name.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'Y', bubbles: true, cancelable: true }));
    fireEvent.change(name, { target: { value: 'Jane Doe ZQXY' } });
    await nextTask();
    expect(doc().authors[0]!.name).toBe('Jane Doe ZQXY');
    expect(name.value).toBe('Jane Doe ZQXY');
  });

  it('Edit block › table caption: the browser’s redo there is not stored either', async () => {
    renderEditor();
    await click(q('[data-block-id="tb1"]'), 'table tb1');
    openTab(/edit block/i);
    const cap = q<HTMLInputElement>('input[placeholder="table description…"]');
    await focusField(cap);
    await typeAtEnd(cap, 'ZQ');
    await browserHistoryInField(cap, 'ZQ again', 'historyRedo');
    expect(caption()).toBe('ZQ');
    expect(cap.value).toBe('ZQ');
  });
});

describe('R1-F4 — keys, the browser’s redo on a block, deletions across pauses', () => {
  it('a layout with no Latin Y there (key "н", code KeyY): ⌘Y redoes', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, 'ZQTYPED');
    await press(ed, KEYS.undo);
    expect(storedText('b1')).toBe(ORIGINAL_B1);
    expect(await press(ed, { key: 'н', code: 'KeyY', metaKey: true })).toBe(true);
    expect(storedText('b1')).toBe(`${ORIGINAL_B1}ZQTYPED`);
  });

  it('the browser’s redo reaching a block as an input event is not stored, and the block is put back', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, 'ZQTYPED');
    await press(ed, KEYS.undo);
    expect(state().canRedo).toBe(true);
    // Firefox with no beforeinput first: the text changes, then the input.
    (ed.lastChild as Text).appendData('ZQTYPED');
    ed.dispatchEvent(new InputEvent('input', { inputType: 'historyRedo', bubbles: true }));
    await nextTask();
    expect(storedText('b1')).toBe(ORIGINAL_B1);
    expect(state().canRedo, 'the editor’s redo survives').toBe(true);
    expect(ed.textContent).toBe(ORIGINAL_B1);
  });

  it('Authors › Author name: backspaces a second apart are one step', async () => {
    renderEditor();
    openTab(/authors/i);
    const name = authorName();
    await focusField(name);
    for (const v of ['Jane Do', 'Jane D', 'Jane ']) {
      clock += 1_000; // past the 600 ms burst window
      await keyInto(name, v, 'deleteContentBackward');
    }
    await press(name, KEYS.undo);
    expect(doc().authors[0]!.name).toBe('Jane Doe');
  });
});

describe('R1-F5 — only a letter that is not Latin falls back to the physical key', () => {
  it('Dvorak: ⌘; (key ";", the physical Z key) is not undo', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, 'ZQTYPED');
    expect(await press(ed, { key: ';', code: 'KeyZ', metaKey: true }), 'the key is the page’s, not cancelled').toBe(false);
    expect(storedText('b1')).toBe(`${ORIGINAL_B1}ZQTYPED`);
  });
});

describe('R1-F6 — a new word starts where the caret is', () => {
  it('a text block: "ZQ p" typed in front of "placeholder": ⌘Z removes "p" alone', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    const at = ORIGINAL_B1.indexOf('placeholder');
    selectText(ed, at, at);
    fireEvent.click(ed); // the click that put the caret there
    await typeText(ed, 'ZQ p');
    expect(storedText('b1')).toBe('Our own words, not a ZQ pplaceholder.');
    await leave();
    await press(document.body, KEYS.undo);
    expect(storedText('b1')).toBe('Our own words, not a ZQ placeholder.');
    await press(document.body, KEYS.undo);
    expect(storedText('b1')).toBe(ORIGINAL_B1);
  });

  it('Authors › Author name: "Q D" typed in front of "Doe": ⌘Z removes "D" alone', async () => {
    renderEditor();
    openTab(/authors/i);
    const name = authorName();
    await focusField(name);
    name.setSelectionRange(5, 5);
    for (const v of ['Jane QDoe', 'Jane Q Doe', 'Jane Q DDoe']) {
      await keyInto(name, v, 'insertText', v === 'Jane QDoe' ? 'Q' : v === 'Jane Q Doe' ? ' ' : 'D');
      const caret = v === 'Jane QDoe' ? 6 : v === 'Jane Q Doe' ? 7 : 8;
      name.setSelectionRange(caret, caret);
    }
    await press(name, KEYS.undo);
    expect(doc().authors[0]!.name).toBe('Jane Q Doe');
  });

  it('a text block: a word selected and typed over is one step, the old word back in one ⌘Z', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    const at = ORIGINAL_B1.indexOf('placeholder');
    selectText(ed, at, at + 'placeholder'.length);
    await typeText(ed, 'pre');
    expect(storedText('b1')).toBe('Our own words, not a pre.');
    await leave();
    await press(document.body, KEYS.undo);
    expect(storedText('b1')).toBe(ORIGINAL_B1);
  });
});
