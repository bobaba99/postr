/**
 * Fix 12, review round 3 — keys pressed on the Undo and Redo buttons are the
 * buttons'. Engineering record: docs/fixes/12-one-undo-history.md, section 9.
 *
 * R3-F1: a press from the keyboard kept the focus on the button (round 2,
 * R2-F2) but still selected the block it changed, and the editor's delete /
 * nudge / duplicate keys act on the selection from any control that is not
 * a text field. So the next arrow moved the block, Backspace or Delete
 * removed it, ⌘D copied it, and the redo was lost (MEASURED by the reviewer
 * in Chromium, Firefox and WebKit). A keyboard-only user, who cannot click
 * away, reaches the buttons with the block still selected from typing in
 * it. Two changes, each tested here where the user enters (a key on the
 * focused button, a click): the keyboard press selects nothing, and keys
 * pressed on the buttons never reach the poster, the table's own Delete /
 * Backspace listeners included (a sibling found while answering).
 *
 * Re-run: npx vitest run src/poster/__tests__/undoButtonKeys.test.tsx
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// Record 29 hid the table's column strips (config/features.ts ADJUSTMENTS_ENABLED);
// this file tests that kept code, so it turns the switch on. The shipped
// configuration is src/poster/__tests__/mvpHidden.test.tsx.
vi.mock('@/config/features', async (orig) => ({
  ...(await orig<typeof import('@/config/features')>()),
  ADJUSTMENTS_ENABLED: true,
}));
import { fireEvent, screen } from '@testing-library/react';

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
  NoopResizeObserver,
  canvasEditor,
  cellEditor,
  clickEmptyWorkspace,
  clickToEnd,
  doc,
  installContentEditableShim,
  installExecCommandShim,
  leave,
  load,
  nextTask,
  press,
  pressButtonByKey,
  q,
  renderEditor,
  selectedBlocks,
  storedText,
  typeText,
  undoDoc,
} from './undoKit';

const state = () => usePosterStore.getState();
const ORIGINAL_B1 = 'Our own words, not a placeholder.';
const KEYS_ON_A_BUTTON = [{ key: 'ArrowRight' }, { key: 'ArrowDown' }, { key: 'Backspace' }, { key: 'Delete' }, { key: 'd', metaKey: true }];
const places = () => doc().blocks.map((b) => `${b.id}@${b.x},${b.y}`).join(' ');

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

/** " ZQAA ZQBB" typed at the end of text block b1. */
async function typeTwoWordsInB1() {
  const ed = canvasEditor('b1');
  await clickToEnd(ed);
  await typeText(ed, ' ZQAA ZQBB');
}

describe('R3-F1 — keys pressed on Undo or Redo are the buttons’', () => {
  it('keys pressed on Undo or Redo never reach a selected block, and the redo is kept', async () => {
    renderEditor();
    await typeTwoWordsInB1();
    // A keyboard-only user Tabs on from the text: b1 stays selected.
    await leave();
    expect(selectedBlocks(), 'b1 selected when the buttons get the keys').toEqual(['b1']);
    const undoBtn = screen.getByRole('button', { name: 'Undo' });
    await pressButtonByKey(undoBtn, 'Enter');
    const before = places();
    for (const init of KEYS_ON_A_BUTTON) await press(undoBtn, init);
    expect(places(), 'no block moved, removed or copied').toBe(before);
    expect([storedText('b1'), state().canRedo]).toEqual([`${ORIGINAL_B1} ZQAA `, true]);
    expect(document.activeElement).toBe(undoBtn);
    await pressButtonByKey(undoBtn, 'Enter');
    const redoBtn = screen.getByRole('button', { name: 'Redo' });
    await pressButtonByKey(redoBtn, 'Enter');
    for (const init of KEYS_ON_A_BUTTON) await press(redoBtn, init);
    expect(places()).toBe(before);
    expect([storedText('b1'), state().canRedo]).toEqual([`${ORIGINAL_B1} ZQAA `, true]);
  });

  it('a keyboard press of Undo selects no block, so a control further on does not pass an arrow to one', async () => {
    renderEditor();
    await typeTwoWordsInB1();
    await clickEmptyWorkspace();
    expect(selectedBlocks()).toEqual([]);
    await pressButtonByKey(screen.getByRole('button', { name: 'Undo' }), 'Enter');
    expect(selectedBlocks(), 'the focus stayed on Undo, so the selection did too').toEqual([]);
    // Two Tabs on from Undo, past Redo, the browser reaches Zoom out (harness B3s).
    const zoomOut = screen.getByRole('button', { name: /zoom out/i });
    zoomOut.focus();
    const before = places();
    await press(zoomOut, { key: 'ArrowRight' });
    expect(places()).toBe(before);
    expect(state().canRedo).toBe(true);
  });

  // A sibling found while answering R3-F1: the table's own Delete /
  // Backspace listeners (a whole row or column, a range of cells) had the
  // same text-field-only guard.
  it('Backspace or Delete on Undo leaves a table column or a range of cells the user selected', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQTYPED');
    await leave();
    await click(q('[data-block-id="tb1"]'), 'block tb1');
    await click(screen.getByRole('button', { name: 'Select column 1' }), 'Select column 1');
    const undoBtn = screen.getByRole('button', { name: 'Undo' });
    undoBtn.focus();
    for (const key of ['Backspace', 'Delete']) await press(undoBtn, { key });
    const table = () => doc().blocks.find((b) => b.id === 'tb1')?.tableData;
    expect(table()?.cols, 'the table and its column are still there').toBe(2);
    fireEvent.mouseDown(cellEditor('tb1', 0).closest('td')!, { button: 0 });
    fireEvent.mouseEnter(cellEditor('tb1', 1).closest('td')!);
    fireEvent.mouseUp(document);
    await nextTask();
    undoBtn.focus();
    for (const key of ['Backspace', 'Delete']) await press(undoBtn, { key });
    expect(table()?.cells.slice(0, 2), 'the range keeps its text').toEqual(['Group', 'Mean']);
    expect(storedText('b1')).toBe(`${ORIGINAL_B1} ZQTYPED`);
  });

  it('control: with the focus off the buttons, an arrow still nudges the selected block', async () => {
    renderEditor();
    await click(q('[data-block-id="im1"]'), 'block im1');
    const x0 = doc().blocks.find((b) => b.id === 'im1')!.x;
    await press(document.body, { key: 'ArrowRight', shiftKey: true });
    expect(doc().blocks.find((b) => b.id === 'im1')!.x).toBe(x0 + 1);
  });
});
