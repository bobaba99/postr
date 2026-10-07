/**
 * Fix 12, review round 2 (R2-F1) — text typed through a composition is one
 * unit of the undo history. Engineering record:
 * docs/fixes/12-one-undo-history.md, sections 7 C and 9.
 *
 * An input method (Japanese, Chinese, Korean), a dead key (´ then e) and a
 * phone keyboard that composes each word show the text being composed in
 * the field and replace it at every update. Each update reached the store
 * as an edit "typed over a selection" (the browser's selection covers the
 * text composed so far), so each was an undo step of its own: ⌘Z then
 * showed text the user never typed ("にほんg"), and about 12 Japanese words
 * pushed older history out of the 100 steps (MEASURED by the reviewer in
 * Chromium and Chrome through Chromium's own IME pipeline).
 *
 * The rule tested here (record section 7 C): every change a composition
 * makes, its commit included, joins one step. A composition starts a new
 * step when the character before it is a space, the start of the field,
 * or a character of a script written without spaces (Han, Hiragana,
 * Katakana, their punctuation), where each composed phrase is a word;
 * after any other letter it continues the word being typed (Korean
 * syllables, an accented letter). Composed over a selection, it starts a
 * new step.
 *
 * Entry is the composition as Chromium delivers it (undoKit `composeIn`),
 * typing at the caret, keys pressed on the focused element; never the
 * store. The clock is frozen, as in undoTextSteps.test.tsx.
 *
 * Re-run: npx vitest run src/poster/__tests__/undoComposition.test.tsx
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
import {
  JAPANESE,
  KEYS,
  NoopResizeObserver,
  canvasEditor,
  cellEditor,
  clickToEnd,
  composeIn,
  composeInField,
  doc,
  focusField,
  installContentEditableShim,
  installExecCommandShim,
  keyInto,
  leave,
  load,
  nextTask,
  openTab,
  press,
  q,
  renderEditor,
  selectText,
  storedCell,
  storedText,
  typeText,
  undoDoc,
} from './undoKit';

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

/** Every text `read` shows after each ⌘Z on the page, until it reads `target` (≤ max presses). */
async function undoWalk(read: () => string, target: string, max = 14): Promise<string[]> {
  const seen: string[] = [];
  for (let n = 1; n <= max; n += 1) {
    await press(document.body, KEYS.undo);
    seen.push(read());
    if (seen[seen.length - 1] === target) break;
  }
  return seen;
}

const b1 = () => storedText('b1');

describe('R2-F1 — a composition is one unit of the undo history', () => {
  it('Japanese after a space: one ⌘Z removes the committed word, never showing the kana composed on the way', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ');
    await composeIn(ed, ...JAPANESE);
    expect(b1()).toBe(`${ORIGINAL_B1} 日本語`);
    await leave();
    expect(await undoWalk(b1, ORIGINAL_B1)).toEqual([`${ORIGINAL_B1} `, ORIGINAL_B1]);
  });

  it('the same with the caret still in the block (⌘Z pressed there)', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ');
    await composeIn(ed, ...JAPANESE);
    expect(await press(ed, KEYS.undo)).toBe(true);
    expect(b1()).toBe(`${ORIGINAL_B1} `);
    expect(ed.textContent, 'on screen').toBe(`${ORIGINAL_B1} `);
  });

  it('Chinese without spaces: each composed word is a step of its own, a pause between them or not', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ');
    await composeIn(ed, ['z', 'zh', 'zho', 'zhon', 'zhong'], '中');
    await composeIn(ed, ['w', 'we', 'wen'], '文');
    clock += 6_000;
    await composeIn(ed, ['h', 'he', 'hen'], '很');
    await leave();
    expect(await undoWalk(b1, ORIGINAL_B1)).toEqual([
      `${ORIGINAL_B1} 中文`,
      `${ORIGINAL_B1} 中`,
      `${ORIGINAL_B1} `,
      ORIGINAL_B1,
    ]);
  });

  it('Korean: syllables composed one after another inside a word are one step', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ');
    await composeIn(ed, ['ㅎ', '하', '한'], '한');
    await composeIn(ed, ['ㄱ', '그', '글'], '글');
    await leave();
    expect(await undoWalk(b1, ORIGINAL_B1)).toEqual([`${ORIGINAL_B1} `, ORIGINAL_B1]);
  });

  it('a dead key (´ then e) inside a typed word joins that word, and the next word typed is a step of its own', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' caf');
    await composeIn(ed, ['´'], 'é');
    await typeText(ed, 's ZQ');
    await leave();
    expect(await undoWalk(b1, ORIGINAL_B1)).toEqual([`${ORIGINAL_B1} cafés `, `${ORIGINAL_B1} `, ORIGINAL_B1]);
  });

  it('a phone keyboard that composes each word: one step per word, as typed on a keyboard', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ');
    await composeIn(ed, ['h', 'he', 'hel', 'hell', 'hello'], 'hello');
    await typeText(ed, ' ');
    await composeIn(ed, ['w', 'wo', 'wor', 'worl', 'world'], 'world');
    await leave();
    expect(await undoWalk(b1, ORIGINAL_B1)).toEqual([`${ORIGINAL_B1} hello `, `${ORIGINAL_B1} `, ORIGINAL_B1]);
  });

  it('composed over a selected word: one ⌘Z brings the word back', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    const at = ORIGINAL_B1.indexOf('placeholder');
    selectText(ed, at, at + 'placeholder'.length);
    await composeIn(ed, ['t', 'te', 'tex'], 'text');
    expect(b1()).toBe('Our own words, not a text.');
    await leave();
    expect(await undoWalk(b1, ORIGINAL_B1)).toEqual([ORIGINAL_B1]);
  });

  it('an arrow key released inside the composition (an IME’s candidate list) does not split it', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ');
    await composeIn(ed, ...JAPANESE, { keyUpBetween: 'ArrowDown' });
    await leave();
    expect(await undoWalk(b1, ORIGINAL_B1)).toEqual([`${ORIGINAL_B1} `, ORIGINAL_B1]);
  });

  it('the commit as the Input Events Level 2 draft sends it (deleteCompositionText, insertFromComposition) is not a paste-like step', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ');
    await composeIn(ed, ...JAPANESE, { level2: true });
    expect(b1()).toBe(`${ORIGINAL_B1} 日本語`);
    await leave();
    expect(await undoWalk(b1, ORIGINAL_B1)).toEqual([`${ORIGINAL_B1} `, ORIGINAL_B1]);
  });

  it('a table cell: one ⌘Z removes the composed word', async () => {
    renderEditor();
    const cell = cellEditor('tb1', 3);
    await clickToEnd(cell);
    await typeText(cell, ' ');
    await composeIn(cell, ['ㅎ', '하', '한'], '한');
    await composeIn(cell, ['ㄱ', '그', '글'], '글');
    expect(storedCell('tb1', 3)).toBe('4.2 한글');
    expect(await press(cell, KEYS.undo)).toBe(true);
    expect(storedCell('tb1', 3)).toBe('4.2 ');
  });

  it('Authors › Author name: one ⌘Z removes the composed word', async () => {
    renderEditor();
    openTab(/authors/i);
    const name = q<HTMLInputElement>('input[placeholder="Author name"]');
    await focusField(name);
    await keyInto(name, 'Jane Doe ');
    await composeInField(name, ...JAPANESE);
    expect(doc().authors[0]!.name).toBe('Jane Doe 日本語');
    await press(name, KEYS.undo);
    expect(doc().authors[0]!.name).toBe('Jane Doe ');
  });

  it('Authors › Author name: composed over a selection inside a word, a step of its own (Shift+arrows in a field do not end a step)', async () => {
    renderEditor();
    openTab(/authors/i);
    const name = q<HTMLInputElement>('input[placeholder="Author name"]');
    await focusField(name);
    for (const v of ['Jane Doe ', 'Jane Doe S', 'Jane Doe Sm', 'Jane Doe Smi', 'Jane Doe Smit', 'Jane Doe Smith']) await keyInto(name, v);
    name.setSelectionRange(12, 14); // "th", selected with Shift+ArrowLeft twice
    await composeInField(name, ['s', 'ss'], 'ss');
    expect(doc().authors[0]!.name).toBe('Jane Doe Smiss');
    await press(name, KEYS.undo);
    expect(doc().authors[0]!.name).toBe('Jane Doe Smith');
  });

  it('a style change, then 12 composed words: the change is still in the history', async () => {
    renderEditor();
    openTab(/style/i);
    const font = doc().fontFamily;
    const select = Array.from(document.querySelectorAll('select')).find((s) =>
      Array.from(s.options).some((o) => o.value === font),
    ) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: Array.from(select.options).find((o) => o.value && o.value !== font)!.value } });
    await nextTask();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    for (let i = 0; i < 12; i += 1) {
      await typeText(ed, ' ');
      await composeIn(ed, ...JAPANESE);
    }
    await leave();
    let n = 0;
    while (doc().fontFamily !== font && n < 30) {
      await press(document.body, KEYS.undo);
      n += 1;
    }
    expect(doc().fontFamily, `${n} ⌘Z`).toBe(font);
    expect(n, 'one step per word, then the font').toBe(14);
  }, 30_000);
});
