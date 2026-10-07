/**
 * Fix 12 — ONE undo history for everything that edits the poster (plan item
 * 12, FINDINGS F2). Engineering record: docs/fixes/12-one-undo-history.md.
 *
 * The owner's decisions of 2026-10-06 set what these tests ask:
 *   1  ⌘Z / Ctrl+Z undo and ⌘⇧Z / Ctrl+Shift+Z / ⌘Y / Ctrl+Y redo through
 *      the editor's history wherever the focus is in something that edits
 *      the poster: a canvas text block, a table cell, the Content box, a
 *      number field, a slider, a select, the caption, the authors fields.
 *      The browser's own undo never runs on the poster.
 *   2  The code box, the poster name, dialogs and the preview keep the
 *      browser's own undo for their own field, and never change the poster.
 *   5  Undo and Redo buttons, disabled when there is nothing to do.
 *   6  Restoring a version is one undoable step.
 *   7  Nothing is shown when there is nothing to undo or redo.
 *   10 The history holds 100 steps.
 *
 * Every test enters where the user enters: a key pressed on the element that
 * has focus (the keydown's target), typing at the caret, a click. jsdom has
 * no `isContentEditable`, so the browser's value is shimmed (undoKit): the
 * main branch's handler skips text fields by that property, and without the
 * shim a test of "⌘Z in a text block" passes on main (the item 12
 * reproducer measured exactly that). What a browser does for an uncancelled
 * key (its own undo) is not modelled; `press` reports whether the page
 * cancelled the key, which is what stops it.
 *
 * Re-run: npx vitest run src/poster/__tests__/oneUndoHistory.test.tsx
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { PosterDoc } from '@postr/shared';

const authSpies = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));
const versions = vi.hoisted(() => ({ snapshot: null as unknown }));

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
// The About page's scroll reveals (GSAP) do not run in jsdom; its copy does.
vi.mock('@/motion/timelines/aboutRoadtrip', () => ({
  aboutRoadtrip: vi.fn(() => ({ revert: vi.fn() })),
}));
vi.mock('@/data/posterVersions', async (orig) => ({
  ...(await orig<typeof import('@/data/posterVersions')>()),
  listVersions: vi.fn(async () => [
    { id: 'v1', poster_id: 'fixture-1', name: 'Before the deadline', created_at: '2026-09-01T12:00:00Z' },
  ]),
  loadVersion: vi.fn(async () => versions.snapshot),
  saveVersion: vi.fn(async () => undefined),
}));

import { UNDO_HISTORY_LIMIT, usePosterStore } from '@/stores/posterStore';
import { ACK_BLOCK_ID } from '@/export/ackBlock';
import About from '@/pages/About';
import { PosterEditor } from '../PosterEditor';
import { choosePreset, click, confirmButton, dialog } from './editorKit';
import {
  KEYS,
  NoopResizeObserver,
  browserHistoryInput,
  canvasEditor,
  cellEditor,
  clickToEnd,
  clickWithPointer,
  contentBox,
  doc,
  installContentEditableShim,
  installExecCommandShim,
  leave,
  load,
  nextTask,
  openTab,
  press,
  pressButtonByKey,
  q,
  renderEditor,
  selectText,
  selectionIn,
  storedText,
  toasts,
  typeText,
  undoDoc,
} from './undoKit';

const state = () => usePosterStore.getState();
const ORIGINAL_B1 = 'Our own words, not a placeholder.';

let unshims: Array<() => void> = [];
beforeAll(() => {
  // The editing shim also gives a Range a (zero) rectangle: the editor sets
  // the selection after an undo, and jsdom then fires selectionchange,
  // whose toolbar handler asks for one.
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

/** Select a block the way a user does: a click on its frame. */
async function selectBlock(id: string) {
  await click(q(`[data-block-id="${id}"]`), `block ${id}`);
}

/** Type " ZQTYPED" at the end of text block b1, then leave the block. */
async function typeInB1AndLeave() {
  const ed = canvasEditor('b1');
  await clickToEnd(ed);
  await typeText(ed, ' ZQTYPED');
  await leave();
}

/** Style › Font to the next font in the list (one step). */
async function changeFont() {
  openTab(/style/i);
  const font = state().doc!.fontFamily;
  const select = Array.from(document.querySelectorAll('select')).find((s) =>
    Array.from(s.options).some((o) => o.value === font),
  ) as HTMLSelectElement;
  const other = Array.from(select.options).find((o) => o.value && o.value !== font)!;
  fireEvent.change(select, { target: { value: other.value } });
  await nextTask();
  return { from: font, to: other.value };
}

describe('1 — ⌘Z with the caret in a text block goes to the one history', () => {
  it('undoes the typing through the editor, and the focused block shows the result', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQTYPED');
    const cancelled = await press(ed, KEYS.undo);
    expect(cancelled, 'the keydown is cancelled, so the browser’s own undo never runs').toBe(true);
    expect(storedText('b1')).not.toContain('ZQTYPED');
    expect(state().canRedo, 'the editor holds the redo').toBe(true);
    expect(ed.textContent, 'the focused block shows what the poster now holds').toBe(storedText('b1'));
  });

  it.each([
    ['⌘⇧Z (key "z")', KEYS.redo],
    ['⌘⇧Z (key "Z")', KEYS.redoUpper],
    ['⌘Y', KEYS.redoY],
    ['Ctrl+Y', KEYS.ctrlRedoY],
    ['Ctrl+Shift+Z (key "Z")', KEYS.ctrlRedoUpper],
  ])('%s in the block redoes it', async (_label, redoKey) => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, 'ZQTYPED');
    await press(ed, KEYS.undo);
    expect(storedText('b1')).toBe(ORIGINAL_B1);
    const cancelled = await press(ed, redoKey);
    expect(cancelled).toBe(true);
    expect(storedText('b1')).toBe(`${ORIGINAL_B1}ZQTYPED`);
    expect(ed.textContent).toBe(`${ORIGINAL_B1}ZQTYPED`);
  });

  it('Ctrl+Z in the block undoes it (Windows, and Ctrl on a Mac)', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, 'ZQTYPED');
    expect(await press(ed, KEYS.ctrlUndo)).toBe(true);
    expect(storedText('b1')).toBe(ORIGINAL_B1);
  });

  it('a layout with no Latin Z there (key "я", code KeyZ): ⌘Z still undoes', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, 'ZQTYPED');
    expect(await press(ed, { key: 'я', code: 'KeyZ', metaKey: true })).toBe(true);
    expect(storedText('b1')).toBe(ORIGINAL_B1);
  });

  it('AZERTY: ⌘⇧ and the Z key (key "Z", code KeyW) redoes', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, 'ZQTYPED');
    await press(ed, KEYS.undo);
    expect(await press(ed, { key: 'Z', code: 'KeyW', metaKey: true, shiftKey: true })).toBe(true);
    expect(storedText('b1')).toBe(`${ORIGINAL_B1}ZQTYPED`);
  });

  it('AltGr+Z (Ctrl+Alt+Z, a character on some layouts) is not undo', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, 'ZQTYPED');
    expect(await press(ed, { key: 'z', code: 'KeyZ', ctrlKey: true, altKey: true })).toBe(false);
    expect(storedText('b1')).toBe(`${ORIGINAL_B1}ZQTYPED`);
  });

  it('a Style › Font change made earlier is undone by ⌘Z pressed in a text block', async () => {
    renderEditor();
    const { from } = await changeFont();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await press(ed, KEYS.undo);
    expect(state().doc!.fontFamily).toBe(from);
  });

  it('a block deleted with Backspace comes back with ⌘Z pressed in a text block', async () => {
    renderEditor();
    await selectBlock('im1');
    fireEvent.keyDown(document.body, { key: 'Backspace' });
    await nextTask();
    expect(doc().blocks.some((b) => b.id === 'im1'), 'the image was deleted').toBe(false);
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await press(ed, KEYS.undo);
    expect(doc().blocks.some((b) => b.id === 'im1')).toBe(true);
  });
});

describe('1 — the same from the sidebar fields that edit the poster', () => {
  it('Authors › Author name: ⌘Z there undoes the canvas typing', async () => {
    renderEditor();
    await typeInB1AndLeave();
    openTab(/authors/i);
    const name = q<HTMLInputElement>('input[placeholder="Author name"]');
    name.focus();
    expect(await press(name, KEYS.undo)).toBe(true);
    expect(storedText('b1')).not.toContain('ZQTYPED');
    expect(name.value, 'the field itself is untouched').toBe('Jane Doe');
  });

  it('Edit block › Font size: ⌘Z in the field returns the size typed there', async () => {
    renderEditor();
    await selectBlock('b1');
    openTab(/edit block/i);
    const size = q<HTMLInputElement>('input[title="Font size (points)"]');
    const before = doc().styles.body.size;
    size.focus();
    fireEvent.change(size, { target: { value: '6' } });
    fireEvent.change(size, { target: { value: '60' } });
    await nextTask();
    expect(doc().styles.body.size).not.toBe(before);
    expect(await press(size, KEYS.undo)).toBe(true);
    expect(doc().styles.body.size).toBe(before);
  });

  it('the Content box: ⌘Z there undoes the typing and the box shows it', async () => {
    renderEditor();
    await selectBlock('b1');
    openTab(/edit block/i);
    const box = contentBox();
    await clickToEnd(box);
    await typeText(box, 'ZQSB');
    expect(storedText('b1')).toContain('ZQSB');
    expect(await press(box, KEYS.undo)).toBe(true);
    expect(storedText('b1')).toBe(ORIGINAL_B1);
    expect(box.textContent).toBe(ORIGINAL_B1);
  });

  it('the caption spacing slider: ⌘Z on it undoes its own last change, not the canvas typing', async () => {
    renderEditor();
    await typeInB1AndLeave();
    await selectBlock('tb1');
    openTab(/edit block/i);
    const slider = q<HTMLInputElement>('input[type="range"]');
    slider.focus();
    for (const v of ['1', '2', '3']) {
      fireEvent.change(slider, { target: { value: v } });
      await nextTask();
    }
    expect(doc().blocks.find((b) => b.id === 'tb1')!.captionGap).toBe(3);
    expect(await press(slider, KEYS.undo)).toBe(true);
    expect(doc().blocks.find((b) => b.id === 'tb1')!.captionGap).toBe(2);
    expect(storedText('b1'), 'the canvas typing stays').toContain('ZQTYPED');
  });

  it('control: on a <select>, ⌘Z reverts the change (as on main)', async () => {
    renderEditor();
    await selectBlock('b1');
    openTab(/edit block/i);
    const weight = Array.from(document.querySelectorAll('select')).find((s) =>
      Array.from(s.options).some((o) => o.value === '700'),
    )!;
    const before = doc().styles.body.weight;
    fireEvent.change(weight, { target: { value: '700' } });
    await nextTask();
    weight.focus();
    await press(weight, KEYS.undo);
    expect(doc().styles.body.weight).toBe(before);
  });
});

describe('2 — fields that keep their own undo never change the poster', () => {
  async function openCodeBox() {
    openTab(/figure/i);
    await click(screen.getByRole('button', { name: /check a figure/i }), 'Check a figure');
    return q<HTMLTextAreaElement>('textarea[aria-label="Your R or Python plotting code"]');
  }

  it('the Figure tab’s code box: ⌘Z is left to the browser for the box, and the poster is unchanged', async () => {
    renderEditor();
    await typeInB1AndLeave();
    const box = await openCodeBox();
    box.focus();
    expect(await press(box, KEYS.undo), 'the box’s own undo is not cancelled').toBe(false);
    expect(storedText('b1')).toContain('ZQTYPED');
    expect(state().canRedo).toBe(false);
  });

  it('the code box: a browser undo that spills from it to a canvas block is cancelled', async () => {
    renderEditor();
    await typeInB1AndLeave();
    const box = await openCodeBox();
    box.focus();
    // One user action: the keydown in the box, then (Chromium and WebKit)
    // the browser's per-document history aims its next step at the canvas.
    fireEvent.keyDown(box, KEYS.undo);
    const cancelled = browserHistoryInput(canvasEditor('b1'), 'historyUndo');
    await nextTask();
    expect(cancelled).toBe(true);
    expect(storedText('b1')).toContain('ZQTYPED');
  });

  it('the code box: the Edit menu’s Undo spilling to a canvas block is cancelled, not run by the editor', async () => {
    renderEditor();
    await typeInB1AndLeave();
    const box = await openCodeBox();
    box.focus();
    expect(browserHistoryInput(canvasEditor('b1'), 'historyUndo')).toBe(true);
    await nextTask();
    expect(storedText('b1')).toContain('ZQTYPED');
    expect(state().canRedo).toBe(false);
  });

  it('the code box: the Edit menu’s Undo there (no key press) is the box’s own', async () => {
    renderEditor();
    await typeInB1AndLeave();
    const box = await openCodeBox();
    box.focus();
    expect(browserHistoryInput(box, 'historyUndo')).toBe(false);
    await nextTask();
    expect(storedText('b1')).toContain('ZQTYPED');
  });

  it('⌘Z in a block and the browser’s own history input of the same press undo ONE step', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQONE ZQTWO');
    fireEvent.keyDown(ed, KEYS.undo);
    expect(browserHistoryInput(ed, 'historyUndo'), 'cancelled, not run again').toBe(true);
    await nextTask();
    expect(storedText('b1')).toBe(`${ORIGINAL_B1} ZQONE `);
  });

  it('the Edit menu’s Undo in a later task, after a ⌘Z, still goes to the history', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQONE ZQTWO');
    await press(ed, KEYS.undo);
    expect(browserHistoryInput(ed, 'historyUndo')).toBe(true);
    await nextTask();
    expect(storedText('b1')).toBe(`${ORIGINAL_B1} `);
  });

  it('Layout › Poster name: ⌘Z is left to the browser for the field, and the poster is unchanged', async () => {
    renderEditor();
    await typeInB1AndLeave();
    openTab(/layout/i);
    const name = q<HTMLInputElement>('input[aria-label="Poster name"]');
    name.focus();
    expect(await press(name, KEYS.undo)).toBe(false);
    expect(storedText('b1')).toContain('ZQTYPED');
  });

  it('the Edit menu’s Undo with the caret in a text block goes to the one history', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, 'ZQTYPED');
    // No keydown: the browser's menu fires its history input at the block.
    expect(browserHistoryInput(ed, 'historyUndo'), 'the browser’s undo is cancelled').toBe(true);
    await nextTask();
    expect(storedText('b1'), 'and the editor undid instead').toBe(ORIGINAL_B1);
    expect(browserHistoryInput(ed, 'historyRedo')).toBe(true);
    await nextTask();
    expect(storedText('b1')).toBe(`${ORIGINAL_B1}ZQTYPED`);
  });

  it('a browser undo that reaches a block as an input event is not stored, and the block is put back', async () => {
    renderEditor();
    await typeInB1AndLeave();
    fireEvent.keyDown(document.body, KEYS.undo);
    await nextTask();
    const undone = storedText('b1');
    expect(state().canRedo).toBe(true);
    // Firefox with focus on the page applies its undo with no beforeinput:
    // the block's text changes and an input of type historyUndo follows.
    const ed = canvasEditor('b1');
    ed.focus();
    selectText(ed, 3, 3);
    // The browser's undo removes text after the caret (the caret stays at 3).
    (ed.firstChild as Text).deleteData(13, 7);
    ed.dispatchEvent(new InputEvent('input', { inputType: 'historyUndo', bubbles: true }));
    await nextTask();
    expect(storedText('b1'), 'the store is unchanged').toBe(undone);
    expect(state().canRedo, 'the editor’s redo survives').toBe(true);
    expect(ed.textContent, 'the block shows the poster again').toBe(undone);
    expect(selectionIn(ed), 'the caret stays where it was').toEqual({ start: 3, end: 3, text: '' });
  });

  it('a browser undo that reaches a table cell as an input event is not stored either', async () => {
    renderEditor();
    const cell = cellEditor('tb1', 3);
    await clickToEnd(cell);
    await typeText(cell, 'ZQ');
    await leave();
    cell.focus();
    (cell.firstChild as Text).data = '4';
    cell.dispatchEvent(new InputEvent('input', { inputType: 'historyUndo', bubbles: true }));
    await nextTask();
    expect(cell.textContent).toBe('4.2ZQ');
    expect(doc().blocks.find((b) => b.id === 'tb1')!.tableData!.cells[3]).toBe('4.2ZQ');
  });
});

describe('2 — the other drafts keep their own undo too', () => {
  const OWN: Array<{ name: string; open: () => Promise<void>; field: () => HTMLElement }> = [
    { name: 'Versions › version name', open: async () => openTab(/versions/i), field: () => q('input[aria-label="Version name (optional)"]') },
    { name: 'Authors › paste box', open: async () => openTab(/authors/i), field: () => q('textarea[placeholder^="John Smith"]') },
    { name: 'References › paste box', open: async () => openTab(/references/i), field: () => q('textarea[placeholder^="Smith, J. (2023)"]') },
    { name: 'References › manual entry', open: async () => openTab(/references/i), field: () => q('input[placeholder="Title"]') },
    { name: 'Style › preset name', open: async () => openTab(/style/i), field: () => q('input[placeholder="e.g. Smith Lab Green"]') },
    {
      name: 'Guidelines › notes',
      open: async () => {
        // The panel starts open at jsdom's window size; closed, its Show
        // button opens it.
        const show = screen.queryByTitle('Show poster guidelines');
        if (show) await click(show, 'Show poster guidelines');
        await click(screen.getByRole('button', { name: /scratch pad/i }), 'Scratch Pad');
      },
      field: () => q('textarea[placeholder^="Reminders"]'),
    },
  ];

  it.each(OWN)('$name: ⌘Z there is left to the browser, and the poster is unchanged', async ({ open, field }) => {
    renderEditor();
    await typeInB1AndLeave();
    await open();
    const f = field();
    f.focus();
    expect(await press(f, KEYS.undo)).toBe(false);
    expect(storedText('b1')).toContain('ZQTYPED');
    expect(state().canRedo).toBe(false);
  });
});

describe('2 — with a dialog or the preview open, ⌘Z never edits the poster', () => {
  it('a dialog: ⌘Z on its button is cancelled and the poster is unchanged', async () => {
    renderEditor();
    await typeInB1AndLeave();
    openTab(/layout/i);
    await choosePreset('36×48');
    const box = dialog(/Change poster to 36 × 48 in/);
    expect(box, 'the size dialog is open').not.toBeNull();
    const cancel = Array.from(box!.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === 'Cancel')!;
    cancel.focus();
    expect(await press(cancel, KEYS.undo)).toBe(true);
    expect(storedText('b1')).toContain('ZQTYPED');
    expect(dialog(/Change poster to 36 × 48 in/), 'the dialog is still asking').not.toBeNull();
    // Answered: the dialog fades out (140 ms) and no longer holds ⌘Z.
    fireEvent.click(cancel);
    await nextTask();
    expect(document.querySelector('[data-postr-modal-content][data-state="closing"]'), 'still fading out').not.toBeNull();
    await press(document.body, KEYS.undo);
    expect(storedText('b1')).not.toContain('ZQTYPED');
  });

  it('a dialog: the Edit menu’s Undo (no key press) does not edit the poster behind it', async () => {
    renderEditor();
    await typeInB1AndLeave();
    openTab(/layout/i);
    await choosePreset('36×48');
    const box = dialog(/Change poster to 36 × 48 in/)!;
    Array.from(box.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === 'Cancel')!.focus();
    expect(browserHistoryInput(canvasEditor('b1'), 'historyUndo')).toBe(true);
    await nextTask();
    expect(storedText('b1')).toContain('ZQTYPED');
  });

  it('a dialog without aria-modal (Copy a design): ⌘Z in it is cancelled and the poster is unchanged', async () => {
    renderEditor();
    await typeInB1AndLeave();
    openTab(/style/i);
    await click(screen.getByRole('button', { name: /copy a design/i }), 'Copy a design');
    const modal = q<HTMLElement>('[role="dialog"][aria-label="Copy a design"]');
    expect(modal.getAttribute('aria-modal')).toBeNull();
    const btn = modal.querySelector('button')!;
    btn.focus();
    expect(await press(btn, KEYS.undo)).toBe(true);
    expect(storedText('b1')).toContain('ZQTYPED');
  });

  it('the palette designer is a dialog: ⌘Z on its buttons does nothing to the poster, its name field keeps its own undo', async () => {
    renderEditor();
    await typeInB1AndLeave();
    openTab(/style/i);
    await click(screen.getByRole('button', { name: /create custom palette/i }), 'Create custom palette');
    const modal = q<HTMLElement>('[role="dialog"][aria-label="Create custom palette"]');
    const name = modal.querySelector<HTMLInputElement>('input[placeholder^="Palette name"]')!;
    name.focus();
    expect(await press(name, KEYS.undo), 'its text field: the browser’s own undo').toBe(false);
    const btn = modal.querySelector('button')!;
    btn.focus();
    expect(await press(btn, KEYS.undo), 'a button in it: cancelled').toBe(true);
    expect(storedText('b1')).toContain('ZQTYPED');
  });

  it('the preview: ⌘Z is cancelled and the poster is unchanged', async () => {
    renderEditor();
    await typeInB1AndLeave();
    openTab(/export/i);
    await click(screen.getByRole('button', { name: /preview poster/i }), 'Preview poster');
    expect(document.querySelector('[data-postr-preview]')).not.toBeNull();
    expect(await press(document.body, KEYS.undo)).toBe(true);
    expect(storedText('b1')).toContain('ZQTYPED');
    expect(state().canRedo).toBe(false);
  });
});

describe('5, 7, 10 — buttons, nothing shown on an empty history, 100 steps', () => {
  it('Undo and Redo buttons: named, disabled with nothing to do, and they undo and redo', async () => {
    renderEditor();
    const undoBtn = screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
    const redoBtn = screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement;
    expect(undoBtn.tabIndex, 'reachable by Tab').not.toBe(-1);
    expect([undoBtn.disabled, redoBtn.disabled]).toEqual([true, true]);
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, 'ZQTYPED');
    await leave();
    expect([undoBtn.disabled, redoBtn.disabled]).toEqual([false, true]);
    await click(undoBtn, 'Undo');
    expect(storedText('b1')).toBe(ORIGINAL_B1);
    expect([undoBtn.disabled, redoBtn.disabled]).toEqual([true, false]);
    await click(redoBtn, 'Redo');
    expect(storedText('b1')).toBe(`${ORIGINAL_B1}ZQTYPED`);
    expect([undoBtn.disabled, redoBtn.disabled]).toEqual([false, true]);
  });

  // Review round 2, R2-F2: a press from the keyboard used to move the focus
  // into the poster text (decision 4), so pressing Enter or Space again — a
  // natural repeat — typed into the poster: a line break that wiped the
  // redo, or the restored word replaced (MEASURED by the reviewer in four
  // browsers). A keyboard press leaves the focus on the button.
  it('Undo pressed from the keyboard keeps the focus on the button, so pressing it again undoes again', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQAA ZQBB');
    await leave();
    const undoBtn = screen.getByRole('button', { name: 'Undo' });
    await pressButtonByKey(undoBtn, 'Enter');
    expect(storedText('b1')).toBe(`${ORIGINAL_B1} ZQAA `);
    expect(document.activeElement, 'the focus stays on Undo').toBe(undoBtn);
    expect(selectionIn(ed), 'nothing selected in the text').toBeNull();
    await pressButtonByKey(undoBtn, ' ');
    expect(storedText('b1')).toBe(`${ORIGINAL_B1} `);
    expect(document.activeElement).toBe(undoBtn);
    expect(state().canRedo, 'the redo is kept').toBe(true);
  });

  it('Redo pressed from the keyboard keeps the focus on the button, and the redone word is not selected', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQAA ZQBB');
    await leave();
    await press(document.body, KEYS.undo);
    await press(document.body, KEYS.undo);
    const redoBtn = screen.getByRole('button', { name: 'Redo' });
    await pressButtonByKey(redoBtn, 'Enter');
    expect(storedText('b1')).toBe(`${ORIGINAL_B1} ZQAA `);
    expect(document.activeElement, 'the focus stays on Redo').toBe(redoBtn);
    expect(selectionIn(ed)).toBeNull();
    await pressButtonByKey(redoBtn, 'Enter');
    expect(storedText('b1')).toBe(`${ORIGINAL_B1} ZQAA ZQBB`);
  });

  it('control: Undo clicked with the mouse puts the caret back where the word was (decision 4)', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' ZQAA ZQBB');
    await leave();
    await clickWithPointer(screen.getByRole('button', { name: 'Undo' }));
    expect(storedText('b1')).toBe(`${ORIGINAL_B1} ZQAA `);
    expect(document.activeElement, 'the block has the focus').toBe(ed);
    const at = `${ORIGINAL_B1} ZQAA `.length;
    expect(selectionIn(ed)).toMatchObject({ start: at, end: at });
  });

  it('with the sidebar hidden, the buttons move clear of its Show button', async () => {
    renderEditor();
    const group = q<HTMLElement>('[data-postr-history-buttons]');
    expect(group.style.left).toBe('12px');
    fireEvent.keyDown(document.body, { key: '/', metaKey: true });
    await nextTask();
    expect(q<HTMLElement>('[data-postr-history-buttons]').style.left).toBe('64px');
  });

  it('a read-only viewer gets no Undo or Redo buttons', async () => {
    render(
      <MemoryRouter initialEntries={['/p/fixture']}>
        <PosterEditor readOnly />
      </MemoryRouter>,
    );
    await nextTask();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('with nothing to undo or redo, ⌘Z and ⌘⇧Z show nothing', async () => {
    renderEditor();
    await press(document.body, KEYS.undo);
    expect(toasts()).toBe(0);
    await press(document.body, KEYS.redo);
    expect(toasts()).toBe(0);
  });

  it('control: an undo that did something still says so', async () => {
    renderEditor();
    await typeInB1AndLeave();
    await press(document.body, KEYS.undo);
    expect(toasts()).toBe(1);
  });

  it('the history holds 100 steps: 60 nudges are all undone', async () => {
    renderEditor();
    await selectBlock('b2');
    const x0 = doc().blocks.find((b) => b.id === 'b2')!.x;
    for (let i = 0; i < 60; i += 1) {
      fireEvent.keyDown(document.body, { key: 'ArrowRight', shiftKey: true });
      await nextTask();
    }
    expect(doc().blocks.find((b) => b.id === 'b2')!.x).toBe(x0 + 60);
    for (let i = 0; i < 60; i += 1) await press(document.body, KEYS.undo);
    expect(doc().blocks.find((b) => b.id === 'b2')!.x).toBe(x0);
  });
});

describe('10 — the About page states the history the editor keeps', () => {
  // Read where a visitor reads it: the page rendered at its English and its
  // French address (fix 26 moved the copy to i18n/about.ts; the merge of
  // main into fix 12 carried the number into both languages).
  it.each([
    ['/about', `Undo and redo up to ${UNDO_HISTORY_LIMIT} steps.`],
    ['/about/fr', `Annulez et rétablissez jusqu’à ${UNDO_HISTORY_LIMIT}\u00a0étapes.`],
  ])('%s says "up to N steps", N the store’s limit', (path, sentence) => {
    expect(UNDO_HISTORY_LIMIT).toBe(100);
    const page = render(
      <MemoryRouter initialEntries={[path]}>
        <About />
      </MemoryRouter>,
    );
    expect(page.container.textContent).toContain(sentence);
    page.unmount();
  });
});

describe('6 — restoring a version is one undoable step', () => {
  function snapshotDoc(): PosterDoc {
    const d = undoDoc();
    return { ...d, blocks: d.blocks.map((b) => (b.id === 'b1' ? { ...b, content: 'ZQVERSION text from the snapshot.' } : b)) };
  }
  async function restore() {
    openTab(/versions/i);
    await click(await screen.findByRole('button', { name: 'Restore' }), 'Restore');
    const box = dialog(/restore this version/i);
    await click(box && confirmButton(box), 'confirm restore');
    await waitFor(() => expect(screen.queryByText('Version restored')).not.toBeNull());
  }

  it('⌘Z after a restore returns to the poster as it was, and ⌘⇧Z restores it again', async () => {
    versions.snapshot = snapshotDoc();
    renderEditor();
    await typeInB1AndLeave();
    await restore();
    expect(storedText('b1')).toBe('ZQVERSION text from the snapshot.');
    await press(document.body, KEYS.undo);
    expect(storedText('b1'), 'back to before the restore').toContain('ZQTYPED');
    await press(document.body, KEYS.redo);
    expect(storedText('b1')).toBe('ZQVERSION text from the snapshot.');
  });

  it('the earlier history is still there under the restore', async () => {
    renderEditor();
    const { from, to } = await changeFont();
    // The snapshot has the font the change picked, so only the history can
    // bring the first font back.
    versions.snapshot = { ...snapshotDoc(), fontFamily: to };
    await restore();
    await press(document.body, KEYS.undo); // the restore
    await press(document.body, KEYS.undo); // the font change
    expect(doc().fontFamily).toBe(from);
  });

  it('restoring a version that is already the poster on screen adds no step', async () => {
    versions.snapshot = undoDoc();
    renderEditor();
    await restore();
    expect(state().canUndo).toBe(false);
  });

  it('a snapshot without the credit mark keeps the poster’s mark (a locked block)', async () => {
    versions.snapshot = snapshotDoc(); // no mark in it
    load(undoDoc(), { seedAcknowledgement: true });
    const mark = doc().blocks.find((b) => b.id === ACK_BLOCK_ID);
    expect(mark, 'the fixture has room for the mark').toBeDefined();
    renderEditor();
    await restore();
    expect(doc().blocks.some((b) => b.id === ACK_BLOCK_ID)).toBe(true);
  });
});
