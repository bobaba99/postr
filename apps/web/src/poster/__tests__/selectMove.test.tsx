/**
 * Record 36 — select and move like PowerPoint (docs/fixes/36-select-move.md;
 * the MVP design doc bounded-designs.md §3.4). Each rule is tested where the
 * user enters: a key pressed on the focused element, a click on a block's
 * frame, a drag on the group frame; then ⌘Z / ⌘⇧Z.
 *
 *   K0  focus in a text field (INPUT, TEXTAREA, SELECT, editable text): the
 *       keys are the field's (OF-11: a focused menu passed Backspace to the
 *       selected block, and the table's range listener cleared its cells)
 *   K1  Esc in text leaves the text, the block kept selected; otherwise it
 *       deselects; a dialog takes Esc first
 *   K2  ⌘A outside text selects every block but the credit mark
 *   K3  an arrow ½ in; the fine nudge (⌘ on a Mac, Ctrl elsewhere) 0.1 in;
 *       any other modifier with an arrow does nothing to blocks
 *   K4  a group move or resize is one undo step; Redo re-applies it (OF-06)
 *
 * jsdom has no layout and no navigator.platform of a Mac: the fine key here
 * is the one `MAC` picks (Ctrl in jsdom); `selectionKeyAction` is also read
 * directly for the Mac's mapping. The browser instrument is
 * scripts/undo-history-check.mjs --only SM (lib/selectMoveScenarios.mjs).
 *
 * Re-run: npx vitest run src/poster/__tests__/selectMove.test.tsx
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('@/motion/timelines/editorEntrance', () => ({ editorEntrance: vi.fn() }));
vi.mock('@/motion/timelines/blockSelection', () => ({ blockSelection: vi.fn() }));

import { ACK_BLOCK_ID } from '@/export/ackBlock';
import { usePosterStore } from '@/stores/posterStore';
import { MAC, selectionKeyAction } from '../selectionKeys';
import { findButton } from './editorKit';
import {
  KEYS,
  NoopResizeObserver,
  canvasEditor,
  cellEditor,
  clickToEnd,
  doc,
  installContentEditableShim,
  installExecCommandShim,
  load,
  nextTask,
  openTab,
  press,
  q,
  renderEditor,
  selectedBlocks,
  typeText,
  undoDoc,
} from './undoKit';

/** The fine nudge's key on this platform, and the other platform's (which must do nothing). */
const FINE = MAC ? { metaKey: true } : { ctrlKey: true };
const OTHER = MAC ? { ctrlKey: true } : { metaKey: true };

const at = (id: string) => doc().blocks.find((b) => b.id === id);
const places = () => doc().blocks.map((b) => `${b.id}@${b.x},${b.y} ${b.w}×${b.h}`).join(' ');
const cells = () => at('tb1')?.tableData?.cells.join('|') ?? 'the table removed';

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

/** A click on a block's frame (not its text): selects it; with Shift, adds it. */
async function clickFrame(id: string, shiftKey = false) {
  fireEvent.click(q(`#poster-canvas [data-block-id="${id}"]`), { shiftKey });
  await nextTask();
}

/** The Style tab's font menu, focused as a click or Tab leaves it. */
async function focusFontMenu(): Promise<HTMLSelectElement> {
  openTab(/style/i);
  await nextTask();
  const menu = Array.from(document.querySelectorAll('select')).find((s) =>
    Array.from(s.options).some((o) => o.value === 'Source Sans 3'),
  );
  if (!menu) throw new Error('no font menu on the Style tab');
  menu.focus();
  return menu;
}

/** jsdom has no PointerEvent; the handlers read only a mouse event's fields. */
function pointer(target: EventTarget, type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
}

/** The frame two or more selected blocks draw (GroupFrame): chrome outside every block, with resize handles. */
function groupFrame(): HTMLElement {
  const frame = Array.from(document.querySelectorAll<HTMLElement>('#poster-canvas [data-postr-selection-ui]')).find(
    (el) => !el.closest('[data-block-id]') && el.querySelector('[data-postr-resize-handle]'),
  );
  if (!frame) throw new Error('no group frame');
  return frame;
}

/** A drag as a browser delivers it: pointerdown on `grip`, 12 moves on the window, each its own task, pointerup. */
async function drag(grip: Element, dx: number, dy: number) {
  pointer(grip, 'pointerdown', 100, 100);
  await nextTask();
  for (let i = 1; i <= 12; i += 1) {
    pointer(window, 'pointermove', 100 + dx * i, 100 + dy * i);
    await nextTask();
  }
  pointer(window, 'pointerup', 100 + dx * 12, 100 + dy * 12);
  await nextTask();
}

/** A drag that goes out 6 moves of (dx, dy) and comes back the same way, released where it was pressed. */
async function dragOutAndBack(grip: Element, dx: number, dy: number) {
  pointer(grip, 'pointerdown', 100, 100);
  await nextTask();
  for (const i of [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 0]) {
    pointer(window, 'pointermove', 100 + dx * i, 100 + dy * i);
    await nextTask();
  }
  pointer(window, 'pointerup', 100, 100);
  await nextTask();
}

describe('K0 — keys pressed in a text field are the field’s', () => {
  it('Backspace, Delete, the arrows, ⌘D, ⌘A and Esc on a focused menu leave the selected block alone (OF-11)', async () => {
    renderEditor();
    await clickFrame('b2');
    expect(selectedBlocks(), 'precondition: b2 selected').toEqual(['b2']);
    const menu = await focusFontMenu();
    const before = places();
    const keys: KeyboardEventInit[] = [
      { key: 'Backspace' }, { key: 'Delete' }, { key: 'ArrowRight' }, { key: 'ArrowDown' }, { key: 'ArrowLeft', ...FINE },
      { key: 'd', metaKey: true }, { key: 'd', ctrlKey: true }, { key: 'a', metaKey: true }, { key: 'a', ctrlKey: true }, { key: 'Escape' },
    ];
    for (const init of keys) await press(menu, init);
    expect(places(), 'no block removed, moved or copied').toBe(before);
    expect(selectedBlocks(), 'the selection kept').toEqual(['b2']);
  });

  it('Backspace and Delete on a focused menu leave a range of table cells the user dragged across', async () => {
    renderEditor();
    fireEvent.mouseDown(cellEditor('tb1', 0).closest('td')!, { button: 0 });
    fireEvent.mouseEnter(cellEditor('tb1', 1).closest('td')!);
    fireEvent.mouseUp(document);
    await nextTask();
    const before = cells();
    const menu = await focusFontMenu();
    for (const key of ['Backspace', 'Delete']) await press(menu, { key });
    expect(cells()).toBe(before);
  });

  it('control: an arrow with the focus on the page still nudges the selected block', async () => {
    renderEditor();
    await clickFrame('b2');
    const x0 = at('b2')!.x;
    await press(document.body, { key: 'ArrowRight' });
    expect(at('b2')!.x).toBe(x0 + 5);
  });
});

describe('K1 — Esc', () => {
  it('in a text block: leaves the text, the block stays selected, and Delete then removes the block', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    expect(selectedBlocks(), 'precondition: b1 selected').toEqual(['b1']);
    const text = at('b1')!.content;
    await press(ed, { key: 'Escape' });
    expect(ed.contains(document.activeElement), 'the caret left the text').toBe(false);
    expect(selectedBlocks()).toEqual(['b1']);
    expect(at('b1')!.content).toBe(text);
    await press(document.body, { key: 'Delete' });
    expect(at('b1')).toBeUndefined();
  });

  it('in a table cell: leaves the cell, the table stays selected', async () => {
    renderEditor();
    const cell = cellEditor('tb1', 0);
    await clickToEnd(cell);
    await press(cell, { key: 'Escape' });
    expect(cell.contains(document.activeElement)).toBe(false);
    expect(selectedBlocks()).toEqual(['tb1']);
  });

  it('outside text: deselects one block, and a group', async () => {
    renderEditor();
    await clickFrame('b2');
    await press(document.body, { key: 'Escape' });
    expect(selectedBlocks()).toEqual([]);
    await clickFrame('b2');
    await clickFrame('tb1', true);
    expect(selectedBlocks().sort(), 'precondition: two selected').toEqual(['b2', 'tb1']);
    await press(document.body, { key: 'Escape' });
    expect(selectedBlocks()).toEqual([]);
  });

  it('in text reached without a click (Tab): leaves the text and selects its block', async () => {
    renderEditor();
    await clickFrame('b2');
    const ed = canvasEditor('b1');
    ed.focus();
    await nextTask();
    await press(ed, { key: 'Escape' });
    expect(ed.contains(document.activeElement)).toBe(false);
    expect(selectedBlocks()).toEqual(['b1']);
  });

  it('inside an input method’s composition, Esc is the composition’s: the caret stays', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await press(ed, { key: 'Escape', isComposing: true });
    expect(document.activeElement).toBe(ed);
  });

  it('the slash menu takes Esc first: it closes, the caret stays in the text', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await typeText(ed, ' /al');
    const menu = () => document.querySelector('[role="listbox"]');
    expect(menu(), 'precondition: the slash menu is open').not.toBeNull();
    await press(ed, { key: 'Escape' });
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(ed);
    expect(selectedBlocks()).toEqual(['b1']);
  });

  it('an open block menu takes Esc: the block is not deselected under it', async () => {
    renderEditor();
    fireEvent.contextMenu(q('#poster-canvas [data-block-id="im1"]'));
    await nextTask();
    expect(screen.queryByRole('button', { name: /Bring Forward/ }), 'precondition: the block menu is open').not.toBeNull();
    expect(selectedBlocks()).toEqual(['im1']);
    await press(document.body, { key: 'Escape' });
    expect(selectedBlocks()).toEqual(['im1']);
  });

  it('a dialog takes Esc first: it closes, the selection stays', async () => {
    renderEditor();
    await clickFrame('b2');
    openTab(/layout/i);
    await nextTask();
    const template = findButton('3-Column Classic') ?? screen.getAllByRole('button').find((b) => /3-Column Classic/.test(b.textContent ?? ''));
    fireEvent.click(template!);
    await nextTask();
    const dialog = () => document.querySelector('[role="dialog"][aria-modal="true"]:not([data-state="closing"])');
    expect(dialog(), 'precondition: the template dialog is open').not.toBeNull();
    await press(document.activeElement ?? document.body, { key: 'Escape' });
    expect(selectedBlocks()).toEqual(['b2']);
  });
});

describe('K2 — ⌘A / Ctrl+A', () => {
  it('outside text: selects every block but the credit mark, from nothing selected and from one block', async () => {
    load(undoDoc(), { seedAcknowledgement: true });
    renderEditor();
    expect(at(ACK_BLOCK_ID), 'precondition: the credit mark is on the poster').toBeDefined();
    const want = doc().blocks.filter((b) => b.id !== ACK_BLOCK_ID).map((b) => b.id).sort();
    await press(document.body, { key: 'a', metaKey: true });
    expect(selectedBlocks().sort()).toEqual(want);
    await clickFrame('b2');
    await press(document.body, { key: 'a', ctrlKey: true });
    expect(selectedBlocks().sort()).toEqual(want);
  });

  it('inside text: the text’s own select-all; the blocks are left as they are', async () => {
    renderEditor();
    const ed = canvasEditor('b1');
    await clickToEnd(ed);
    await press(ed, { key: 'a', metaKey: true });
    expect(selectedBlocks()).toEqual(['b1']);
  });
});

describe('K3 — arrows', () => {
  it('an arrow moves ½ in, the fine key + arrow 0.1 in, and every other modifier with an arrow nothing', async () => {
    renderEditor();
    await clickFrame('b2');
    const pos = (): [number, number] => [at('b2')!.x, at('b2')!.y];
    const [x0, y0] = pos();
    await press(document.body, { key: 'ArrowRight' });
    await press(document.body, { key: 'ArrowDown' });
    expect(pos(), 'one grid step each').toEqual([x0 + 5, y0 + 5]);
    await press(document.body, { key: 'ArrowRight', ...FINE });
    await press(document.body, { key: 'ArrowDown', ...FINE });
    expect(pos(), 'the fine nudge, 0.1 in').toEqual([x0 + 6, y0 + 6]);
    for (const mods of [{ shiftKey: true }, { altKey: true }, { shiftKey: true, ...FINE }, { altKey: true, ...FINE }, OTHER, { ...FINE, ...OTHER }]) {
      await press(document.body, { key: 'ArrowRight', ...mods });
      await press(document.body, { key: 'ArrowDown', ...mods });
    }
    expect(pos(), 'no other modifier moves the block').toEqual([x0 + 6, y0 + 6]);
  });

  // R36-2 (the lead's decision at merge): while a block is selected, an arrow
  // chord that is not a nudge does nothing at all — cancelled, as main
  // cancelled every arrow then — so Alt + ← (Back on Windows and Linux) or
  // the other platform's key + ← cannot take the user out of the editor.
  it('with a block selected, an arrow chord that is not a nudge is cancelled and moves nothing; with nothing selected it is the browser’s', async () => {
    renderEditor();
    await clickFrame('b2');
    const pos = (): [number, number] => [at('b2')!.x, at('b2')!.y];
    const start = pos();
    for (const mods of [{ altKey: true }, { shiftKey: true }, OTHER, { altKey: true, ...FINE }]) {
      expect(await press(document.body, { key: 'ArrowLeft', ...mods }), `cancelled: ${JSON.stringify(mods)}`).toBe(true);
    }
    expect(pos(), 'nothing moved').toEqual(start);
    await press(document.body, { key: 'Escape' });
    expect(await press(document.body, { key: 'ArrowLeft', altKey: true }), 'nothing selected: the browser’s').toBe(false);
  });

  // R36-1's sibling (the same cause): an arrow that cannot move the block
  // (it is at the sheet's edge) changed nothing and still added a step.
  it('an arrow at the sheet’s edge moves nothing and adds no step: one ⌘Z undoes the last move', async () => {
    renderEditor();
    await clickFrame('b1');
    expect(at('b1')!.x, 'precondition: b1 starts 2 in from the left edge').toBe(20);
    for (let i = 0; i < 4; i += 1) await press(document.body, { key: 'ArrowLeft' });
    expect(at('b1')!.x, 'precondition: at the edge').toBe(0);
    await press(document.body, { key: 'ArrowLeft' });
    expect(at('b1')!.x).toBe(0);
    await press(document.body, KEYS.undo);
    expect(at('b1')!.x).toBe(5);
  });

  it('the fine key is ⌘ on a Mac and Ctrl elsewhere (PowerPoint’s own on each platform)', () => {
    const arrow = (mods: Partial<KeyboardEvent>) => ({ key: 'ArrowLeft', code: 'ArrowLeft', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods });
    expect(selectionKeyAction(arrow({ metaKey: true }), true)).toEqual({ kind: 'nudge', dx: -1, dy: 0 });
    expect(selectionKeyAction(arrow({ ctrlKey: true }), true)).toEqual({ kind: 'arrowIgnored' });
    expect(selectionKeyAction(arrow({ ctrlKey: true }), false)).toEqual({ kind: 'nudge', dx: -1, dy: 0 });
    expect(selectionKeyAction(arrow({ metaKey: true }), false)).toEqual({ kind: 'arrowIgnored' });
    expect(selectionKeyAction(arrow({}), true)).toEqual({ kind: 'nudge', dx: -5, dy: 0 });
  });
});

describe('K4 — a group move or resize is one undo step (OF-06)', () => {
  async function selectTwo() {
    renderEditor();
    await clickFrame('b2');
    await clickFrame('tb1', true);
    expect(selectedBlocks().sort(), 'precondition: two selected').toEqual(['b2', 'tb1']);
  }
  const pair = () => ['b2', 'tb1'].map((id) => at(id)!).map((b) => `${b.id}@${b.x},${b.y} ${b.w}×${b.h}`).join(' ');

  it('a drag of the group frame: one ⌘Z puts every block back, one ⌘⇧Z moves them again', async () => {
    await selectTwo();
    const before = places();
    await drag(groupFrame(), 15, 10);
    const moved = pair();
    expect(places(), 'precondition: the drag moved the group').not.toBe(before);
    await press(document.body, KEYS.undo);
    expect(places()).toBe(before);
    await press(document.body, KEYS.redo);
    expect(pair()).toBe(moved);
  });

  // The merge of records 35 and 36 (the lead's check): a change made silently
  // while the group is dragged — record 35's pasted copy getting its own file
  // when storage's copy lands — must survive the drag's ⌘Z, as it does for a
  // single block's drag (record 35, R3-3's sibling, `atPreDragGeometry`).
  it('a group drag’s ⌘Z puts the places back and keeps a change made silently during the drag', async () => {
    await selectTwo();
    const before = places();
    const grip = groupFrame();
    pointer(grip, 'pointerdown', 100, 100);
    await nextTask();
    for (let i = 1; i <= 6; i += 1) {
      pointer(window, 'pointermove', 100 + 15 * i, 100 + 10 * i);
      await nextTask();
    }
    const state = usePosterStore.getState();
    state.setBlocksSilent(state.doc!.blocks.map((b) => (b.id === 'b2' ? { ...b, imageSrc: 'storage://u/p/b2-settled.png' } : b)));
    for (let i = 7; i <= 12; i += 1) {
      pointer(window, 'pointermove', 100 + 15 * i, 100 + 10 * i);
      await nextTask();
    }
    pointer(window, 'pointerup', 100 + 15 * 12, 100 + 10 * 12);
    await nextTask();
    expect(places(), 'precondition: the drag moved the group').not.toBe(before);
    await press(document.body, KEYS.undo);
    expect(places(), 'the places are back').toBe(before);
    expect(at('b2')!.imageSrc, 'the file that landed during the drag is kept').toBe('storage://u/p/b2-settled.png');
  });

  // Review round 1, R36-1: a drag that ends where it started changed nothing
  // and still added a step, so the next ⌘Z showed nothing. The store's
  // setBlocks now drops a write that changes nothing, as updateBlock,
  // patchDoc and removeBlock already did (fix 12, U10).
  it('a group drag that ends where it started adds no step: one ⌘Z then undoes the drag before it', async () => {
    await selectTwo();
    const before = places();
    await drag(groupFrame(), 15, 10);
    const moved = places();
    expect(moved, 'precondition: the first drag moved the group').not.toBe(before);
    await dragOutAndBack(groupFrame(), 15, 10);
    expect(places(), 'precondition: the second drag changed nothing').toBe(moved);
    await press(document.body, KEYS.undo);
    expect(places()).toBe(before);
  });

  it('a drag of one block that ends where it started adds no step either', async () => {
    renderEditor();
    await clickFrame('b2');
    const frame = q('#poster-canvas [data-block-id="b2"]');
    const before = places();
    await drag(frame, 15, 10);
    const moved = places();
    expect(moved, 'precondition: the first drag moved b2').not.toBe(before);
    await dragOutAndBack(q('#poster-canvas [data-block-id="b2"]'), 15, 10);
    expect(places(), 'precondition: the second drag changed nothing').toBe(moved);
    await press(document.body, KEYS.undo);
    expect(places()).toBe(before);
  });

  it('a drag of the group’s corner handle: one ⌘Z puts every block’s place and size back, one ⌘⇧Z resizes them again', async () => {
    await selectTwo();
    const before = places();
    const handle = groupFrame().querySelector('[data-postr-resize-handle="se"]') ?? groupFrame().querySelector('[data-postr-resize-handle]');
    await drag(handle!, 15, 10);
    const resized = pair();
    expect(places(), 'precondition: the drag resized the group').not.toBe(before);
    await press(document.body, KEYS.undo);
    expect(places()).toBe(before);
    await press(document.body, KEYS.redo);
    expect(pair()).toBe(resized);
  });

  // The merge of records 35 and 36, the resize half: each step of the group
  // resize used to rebuild the poster from the drag's start, so a change that
  // landed during it was lost even before the release.
  it('a group resize keeps a change made silently during it, through the resize and its ⌘Z', async () => {
    await selectTwo();
    const before = places();
    const handle = groupFrame().querySelector('[data-postr-resize-handle="se"]') ?? groupFrame().querySelector('[data-postr-resize-handle]');
    pointer(handle!, 'pointerdown', 100, 100);
    await nextTask();
    for (let i = 1; i <= 6; i += 1) {
      pointer(window, 'pointermove', 100 + 15 * i, 100 + 10 * i);
      await nextTask();
    }
    const state = usePosterStore.getState();
    state.setBlocksSilent(state.doc!.blocks.map((b) => (b.id === 'b2' ? { ...b, imageSrc: 'storage://u/p/b2-landed.png' } : b)));
    for (let i = 7; i <= 12; i += 1) {
      pointer(window, 'pointermove', 100 + 15 * i, 100 + 10 * i);
      await nextTask();
    }
    expect(at('b2')!.imageSrc, 'kept through the rest of the resize').toBe('storage://u/p/b2-landed.png');
    pointer(window, 'pointerup', 100 + 15 * 12, 100 + 10 * 12);
    await nextTask();
    await press(document.body, KEYS.undo);
    expect(places(), 'the places and sizes are back').toBe(before);
    expect(at('b2')!.imageSrc, 'and the change is kept').toBe('storage://u/p/b2-landed.png');
  });
});
