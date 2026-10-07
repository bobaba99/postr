/**
 * Fix 12 (one undo history), after the merge with main: every drag is ONE
 * undo step, from pointerdown to pointerup, as a move, resize or rotate
 * drag already was (PowerPoint; the lead's decision 1 on the merge review's
 * F1). Engineering record: docs/fixes/12-one-undo-history.md, section 11.
 *
 * F1 (MEASURED by the merge review in Chromium, Firefox and WebKit): a
 * crop-edge drag and a table column-width drag were one step per pointer
 * move, so 12 moves took 12 Undo presses and one crop gesture of about 330
 * moves pushed every earlier edit out of the 100-step history. The
 * caption-spacing slider was one step per value (R2-I1), and the line
 * spacing slider split a drag at a pause of 600 ms. Entered where the user
 * enters: a click on the block, the Crop button, a pointer pressed on the
 * crop edge, the column's grip or the slider, moved and released on the
 * window; then ⌘Z or the Undo button.
 *
 * jsdom has no layout: the crop frame and the table report a box of their
 * own (`boxOf`), as a browser would, so each move changes the value (with
 * the zero box jsdom reports, every move clamps to the same crop and the
 * defect would not show).
 *
 * Re-run: npx vitest run src/poster/__tests__/undoDragSteps.test.tsx
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { Block, PosterDoc } from '@postr/shared';

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

import { usePosterStore } from '@/stores/posterStore';
import { NoopResizeObserver, click, doc, load, makeDoc, nextTask, openTab, renderEditor } from './editorKit';
import { KEYS, clickWithPointer, press } from './undoKit';

/** A 2 × 2 PNG, so the image shows a picture and offers Crop. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4AWP4z8DwHwyBAMQgYGBgAAB1SQX7nHNiaQAAAABJRU5ErkJggg==';

/** The default poster plus an image and a 4 × 3 table. */
function fixture(): PosterDoc {
  const d = makeDoc(48, 36);
  const base = d.blocks[2]!;
  const extra: Block[] = [
    { ...base, id: 'im1', type: 'image', x: 250, y: 240, w: 120, h: 80, content: '', imageSrc: PNG, imageFit: 'contain' },
    {
      ...base, id: 'tb1', type: 'table', x: 20, y: 240, w: 210, h: 60, content: '',
      tableData: {
        rows: 4, cols: 3,
        cells: ['Measure', 'M (SD)', 'p', 'DV 1', '4.2 (0.8)', '< .01', 'DV 2', '3.1 (1.1)', '.03', 'DV 3', '2.8 (0.6)', '.12'],
        colWidths: null, borderPreset: 'apa',
      },
    } as Block,
  ];
  return { ...d, blocks: [...d.blocks, ...extra] } as PosterDoc;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const state = () => usePosterStore.getState();
const block = (id: string) => doc().blocks.find((b) => b.id === id)!;
const onSheet = (id: string) => document.querySelector<HTMLElement>(`#poster-canvas [data-block-id="${id}"]`)!;

/** The box a browser would report for `el` (jsdom reports zeros). */
function boxOf(el: Element, width: number, height: number) {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON() {} }) as DOMRect,
  });
}

function pointer(target: EventTarget, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', x: number, button = 0) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button, clientX: x, clientY: 50 }));
}

/**
 * A drag as the browser delivers it: pointerdown on `grip`, `moves` pointer
 * moves on the window `dx` px apart, each its own task, and pointerup there
 * (or `end`). `holdAt` pauses that long after that many moves (a hand held
 * still mid-drag).
 */
async function drag(
  grip: Element,
  moves: number,
  dx: number,
  opts: { end?: 'pointerup' | 'pointercancel' | 'blur' | 'contextmenu'; holdAt?: number; holdMs?: number } = {},
) {
  pointer(grip, 'pointerdown', 100);
  await nextTask();
  for (let i = 1; i <= moves; i += 1) {
    pointer(window, 'pointermove', 100 + dx * i);
    await nextTask();
    if (opts.holdAt === i) await new Promise((r) => setTimeout(r, opts.holdMs ?? 0));
  }
  const end = opts.end ?? 'pointerup';
  if (end === 'blur') window.dispatchEvent(new Event('blur'));
  else if (end === 'contextmenu') window.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  else pointer(window, end, 100 + dx * moves);
  await nextTask();
}

/** ⌘Z until `done()` holds or the history runs out; how many presses. */
async function undoUntil(done: () => boolean, cap = 150): Promise<number | null> {
  for (let i = 1; i <= cap; i += 1) {
    if (!state().canUndo) return null;
    await press(document.body, KEYS.undo);
    if (done()) return i;
  }
  return null;
}

async function selectBlock(id: string) {
  fireEvent.click(onSheet(id));
  await nextTask();
}

/** The image selected, crop mode entered, and its frame given a 120 × 80 px box. */
async function enterCrop() {
  await selectBlock('im1');
  await click(onSheet('im1').querySelector('button[title="Crop image"]'), 'Crop image');
  const edge = onSheet('im1').querySelector('[aria-label="crop right edge"]');
  expect(edge, 'precondition: crop mode shows its edges').not.toBeNull();
  boxOf(edge!.parentElement!, 120, 80);
  return edge!;
}

async function nudge(id: string) {
  await press(document.body, { key: 'ArrowRight', shiftKey: true });
  expect(block(id).x, 'precondition: the nudge moved the block').not.toBe(fixture().blocks.find((b) => b.id === id)!.x);
}

describe('a drag is one undo step, from pointerdown to pointerup', () => {
  it('G1 — 12 moves of a crop edge undo in one press of ⌘Z, and one press of Redo brings them back', async () => {
    load(fixture());
    renderEditor();
    const edge = await enterCrop();
    await drag(edge, 12, -1);
    const cropped = block('im1').crop;
    expect(cropped?.right, 'the drag cropped the right edge').toBeGreaterThan(9);
    expect(await undoUntil(() => !block('im1').crop), 'presses to undo the drag').toBe(1);
    await clickWithPointer(screen.getByRole('button', { name: 'Redo' }));
    expect(block('im1').crop, 'one Redo brings the whole drag back').toEqual(cropped);
  });

  it('G2 — one long crop gesture (150 moves) leaves the nudge made before it undoable', async () => {
    load(fixture());
    renderEditor();
    await selectBlock('im1');
    await nudge('im1');
    const edge = await enterCrop();
    await drag(edge, 150, -0.5);
    expect(block('im1').crop?.right, 'precondition: cropped').toBeGreaterThan(30);
    await press(document.body, KEYS.undo);
    expect(block('im1').crop, 'the first ⌘Z undoes the whole crop').toBeUndefined();
    await press(document.body, KEYS.undo);
    expect(block('im1').x, 'the second ⌘Z undoes the nudge').toBe(250);
  });

  it('G1b — two drags of a crop edge are two steps', async () => {
    load(fixture());
    renderEditor();
    const edge = await enterCrop();
    await drag(edge, 6, -1);
    const first = block('im1').crop;
    await drag(edge, 6, -1);
    await press(document.body, KEYS.undo);
    expect(block('im1').crop, 'the first ⌘Z leaves the first drag').toEqual(first);
  });

  // Passes on 5af43b8 too, by design: it guards the end of a drag's step
  // (a step that never ended would swallow the nudge).
  it('G1e — after a crop drag, a nudge is a step of its own, however the drag ended', async () => {
    for (const end of ['pointerup', 'pointercancel', 'blur', 'contextmenu'] as const) {
      load(fixture());
      const { unmount } = renderEditor();
      const edge = await enterCrop();
      await drag(edge, 6, -1, { end });
      const cropped = block('im1').crop;
      // Enter applies the crop and leaves crop mode (Escape would cancel it).
      await press(document.body, { key: 'Enter' });
      await selectBlock('im1');
      await nudge('im1');
      await press(document.body, KEYS.undo);
      expect([end, block('im1').x, block('im1').crop], 'one ⌘Z undoes the nudge alone').toEqual([end, 250, cropped]);
      unmount();
    }
  });

  it('G3 — 12 moves of a table column’s width grip undo in one press', async () => {
    load(fixture());
    renderEditor();
    await selectBlock('tb1');
    const grip = onSheet('tb1').querySelector('[title="Drag to resize column"]');
    expect(grip, 'precondition: the grip').not.toBeNull();
    boxOf(onSheet('tb1').querySelector('table')!, 300, 60);
    await drag(grip!, 12, 2);
    expect(block('tb1').tableData?.colWidths, 'the drag set the widths').not.toBeNull();
    expect(await undoUntil(() => block('tb1').tableData?.colWidths == null), 'presses to undo the drag').toBe(1);
  });

  it('G4 — a drag of the caption-spacing slider through 12 values undoes in one press (R2-I1)', async () => {
    load(fixture());
    renderEditor();
    await selectBlock('im1');
    openTab(/edit block/i);
    await nextTask();
    const slider = document.querySelector<HTMLInputElement>('input[type="range"][max="24"]');
    expect(slider, 'precondition: Edit block › Caption spacing').not.toBeNull();
    pointer(slider!, 'pointerdown', 100);
    for (let v = 1; v <= 12; v += 1) {
      fireEvent.change(slider!, { target: { value: String(v) } });
      await nextTask();
    }
    pointer(window, 'pointerup', 100);
    await nextTask();
    expect(block('im1').captionGap, 'the drag reached 12 px').toBe(12);
    expect(await undoUntil(() => !block('im1').captionGap), 'presses to undo the drag').toBe(1);
  });

  it('G5 — a line-spacing slider drag held still for 0.7 s midway undoes in one press', async () => {
    load(fixture());
    renderEditor();
    await selectBlock('b1');
    openTab(/edit block/i);
    await nextTask();
    const slider = document.querySelector<HTMLInputElement>('input[type="range"][max="3"]');
    expect(slider, 'precondition: Edit block › Line spacing').not.toBeNull();
    const before = doc().styles.body.lineHeight;
    pointer(slider!, 'pointerdown', 100);
    for (const v of ['1.45', '1.5', 'hold', '1.55', '1.6']) {
      if (v === 'hold') await new Promise((r) => setTimeout(r, 700));
      else {
        fireEvent.change(slider!, { target: { value: v } });
        await nextTask();
      }
    }
    pointer(window, 'pointerup', 100);
    await nextTask();
    expect(doc().styles.body.lineHeight, 'the drag reached 1.6').toBe(1.6);
    expect(await undoUntil(() => doc().styles.body.lineHeight === before), 'presses to undo the drag').toBe(1);
  });

  // Firefox delivers a slider's first value at pointerdown and moves the
  // focus to the slider after it (MEASURED, fix12-mf/slider-events.mjs):
  // the focus leaving the text and entering the slider each ended the step,
  // so the drag was two steps there (G5 in the browser, 2 presses).
  it('G5f — the slider taking the focus after its first value (Firefox’s order) does not split the drag', async () => {
    load(fixture());
    renderEditor();
    await selectBlock('b1');
    openTab(/edit block/i);
    await nextTask();
    const slider = document.querySelector<HTMLInputElement>('input[type="range"][max="3"]')!;
    const text = onSheet('b1').querySelector<HTMLElement>('[contenteditable]');
    text?.focus();
    const before = doc().styles.body.lineHeight;
    pointer(slider, 'pointerdown', 100);
    fireEvent.change(slider, { target: { value: '1.45' } });
    await nextTask();
    slider.focus();
    await nextTask();
    for (const v of ['1.5', '1.55', '1.6']) {
      fireEvent.change(slider, { target: { value: v } });
      await nextTask();
    }
    pointer(window, 'pointerup', 100);
    await nextTask();
    expect(document.activeElement, 'precondition: the slider took the focus').toBe(slider);
    expect(await undoUntil(() => doc().styles.body.lineHeight === before), 'presses to undo the drag').toBe(1);
  });

  // A secondary press opens the context menu, and its pointerup may never
  // reach the page: a step held from it would swallow the edits after it.
  it('G6 — a right press on a slider holds no step: two nudges after it are two steps', async () => {
    load(fixture());
    renderEditor();
    await selectBlock('im1');
    openTab(/edit block/i);
    await nextTask();
    const slider = document.querySelector<HTMLInputElement>('input[type="range"][max="24"]')!;
    pointer(slider, 'pointerdown', 100, 2);
    await nextTask();
    await selectBlock('im1');
    await nudge('im1');
    await press(document.body, { key: 'ArrowRight', shiftKey: true });
    const x2 = block('im1').x;
    await press(document.body, KEYS.undo);
    expect([block('im1').x !== x2, block('im1').x !== 250], 'one ⌘Z undoes the second nudge alone').toEqual([true, true]);
  });

  // A menu the page shows itself (the image block's own, which cancels the
  // event: a long press on a touch screen, Ctrl+click on a Mac) leaves the
  // press going and its release still comes: the drag stays one step.
  it('G7 — a context menu the page cancels mid-drag does not end the crop drag’s step', async () => {
    load(fixture());
    renderEditor();
    const edge = await enterCrop();
    pointer(edge, 'pointerdown', 100);
    await nextTask();
    for (let i = 1; i <= 6; i += 1) {
      if (i === 4) {
        const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 50 });
        edge.dispatchEvent(menu);
        expect(menu.defaultPrevented, 'precondition: the block shows its own menu').toBe(true);
        await nextTask();
      }
      pointer(window, 'pointermove', 100 - i);
      await nextTask();
    }
    pointer(window, 'pointerup', 94);
    await nextTask();
    expect(await undoUntil(() => !block('im1').crop), 'presses to undo the drag').toBe(1);
  });

  it('control: a move drag was already one step, and still is', async () => {
    load(fixture());
    renderEditor();
    await selectBlock('im1');
    const move = onSheet('im1').querySelector('button[title^="Drag to move"]');
    expect(move, 'precondition: the move button').not.toBeNull();
    await drag(move!, 12, 3);
    expect(block('im1').x, 'the drag moved the image').not.toBe(250);
    expect(await undoUntil(() => block('im1').x === 250), 'presses to undo the drag').toBe(1);
  });
});
