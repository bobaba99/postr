/**
 * Fix 12 (one undo history) with fix 19 (a selected block's controls one
 * size at every zoom), as they meet after main merged into fix 12. Records:
 * docs/fixes/12-one-undo-history.md, docs/fixes/19-controls-one-size.md.
 *
 * Entered where a user enters: a click on a block, the ZoomBar, a button of
 * the handle row, a table's strip, the Undo / Redo buttons, a key on the
 * focused element. Claims:
 *
 *   M1  the handle row's Delete button (fix 19 draws it 24 px at every
 *       zoom), then the Undo button: the block is back; Redo removes it
 *       again
 *   M2  zoomed far out, where fix 19 draws only the move button, the Delete
 *       key removes the block and ⌘Z brings it back
 *   M3  there, keys pressed on the focused Undo button (Delete, Backspace,
 *       an arrow) do not reach the selected block (fix 12 review R3-F1)
 *   M4  a selected table: its column strip (fix 19's 24 px hit area), then
 *       a cell (fix 12's cell editor), a word typed there, and Undo: the
 *       word goes, the table keeps its three columns and stays on the sheet
 *
 * The keys pressed on Undo against a table's selected column (fix 12 R3-F1)
 * are undoButtonKeys.test.tsx's. Not claimed here: Backspace or Delete from
 * the page with a column selected removes the whole table block, not the
 * column, on main and on fix 12 alike (TESTED while writing this file; the
 * editor's own Delete handler acts on the selected block, item 22's family).
 * Where the controls sit against the Undo / Redo buttons needs layout: no
 * test here reads it.
 *
 * Re-run: npx vitest run src/poster/__tests__/undoWithControls.test.tsx
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The floor takes many ZoomBar clicks: give it room on a loaded machine.
vi.setConfig({ testTimeout: 30_000 });
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

import { NoopResizeObserver, click, doc, load, makeDoc, nextTask, q, renderEditor } from './editorKit';
import { stubScreen, zoomNow } from './workspaceKit';
import {
  KEYS,
  cellEditor,
  clickToEnd,
  clickWithPointer,
  installContentEditableShim,
  installExecCommandShim,
  press,
  selectedBlocks,
  storedCell,
  typeText,
} from './undoKit';

/** A 2 × 2 PNG, so the logo shows a picture (an empty one opens the file picker). */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4AWP4z8DwHwyBAMQgYGBgAAB1SQX7nHNiaQAAAABJRU5ErkJggg==';

/** The default poster plus a logo and a 4 × 3 table. `logoW` 150 makes the logo wide and thin. */
function fixture(logoW = 30): PosterDoc {
  const d = makeDoc(48, 36);
  const base = d.blocks[2]!;
  const extra: Block[] = [
    { ...base, id: 'lg1', type: 'logo', x: 330, y: 300, w: logoW, h: 20, content: '', imageSrc: PNG, imageFit: 'contain' },
    {
      ...base, id: 'tb1', type: 'table', x: 120, y: 240, w: 150, h: 60, content: '',
      tableData: {
        rows: 4, cols: 3,
        cells: ['Measure', 'M (SD)', 'p', 'DV 1', '4.2 (0.8)', '< .01', 'DV 2', '3.1 (1.1)', '.03', 'DV 3', '2.8 (0.6)', '.12'],
        colWidths: null, borderPreset: 'apa',
      },
    } as Block,
  ];
  return { ...d, blocks: [...d.blocks, ...extra] } as PosterDoc;
}

// jsdom has no isContentEditable and no execCommand; the cell editor needs both (undoKit).
let unshims: Array<() => void> = [];
beforeAll(() => {
  unshims = [installContentEditableShim(), installExecCommandShim()];
});
afterAll(() => unshims.forEach((u) => u()));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A 1000 × 640 px canvas: the 48 × 36 in sheet fits at 512 / 360 = 1.42. */
function openEditor(d: PosterDoc) {
  stubScreen({ width: 1000, height: 640 });
  load(d);
  renderEditor();
}

const onSheet = (id: string) => document.querySelector(`#poster-canvas [data-block-id="${id}"]`);
const undoButton = () => screen.getByRole('button', { name: 'Undo' });
const redoButton = () => screen.getByRole('button', { name: 'Redo' });

async function selectBlock(id: string) {
  fireEvent.click(onSheet(id)!);
  await nextTask();
}

/** The handle row's buttons above a block, by the first word of their titles. */
function rowOf(id: string): string[] {
  const move = onSheet(id)!.querySelector('button[title^="Drag to move"]');
  return move ? [...move.parentElement!.querySelectorAll('button')].map((b) => (b.getAttribute('title') ?? '').split(' ')[0]!) : [];
}

async function zoomOutToTheFloor() {
  for (let i = 0; i < 100; i++) {
    const before = zoomNow();
    await click(screen.getByRole('button', { name: 'Zoom out' }), 'Zoom out');
    if (Math.abs(zoomNow() - before) < 1e-9) return;
  }
  throw new Error('Zoom out never stopped');
}

describe('the one history behind the one-size controls', () => {
  it('M1 — the handle row’s Delete, then Undo: the block is back; Redo removes it again', async () => {
    openEditor(fixture());
    await selectBlock('lg1');
    expect(rowOf('lg1'), 'precondition: the row is whole at the fit').toEqual(['Drag', 'Replace', 'Crop', 'Delete']);
    await clickWithPointer(onSheet('lg1')!.querySelector<HTMLElement>('button[title="Delete block"]')!);
    expect(onSheet('lg1'), 'deleted from its row').toBeNull();
    await clickWithPointer(undoButton());
    expect(onSheet('lg1'), 'back after Undo').not.toBeNull();
    await clickWithPointer(redoButton());
    expect(onSheet('lg1'), 'gone again after Redo').toBeNull();
  });

  it('M2 — zoomed far out with only the move button, Delete then ⌘Z: the logo is back', async () => {
    openEditor(fixture(150));
    await selectBlock('lg1');
    await zoomOutToTheFloor();
    expect(rowOf('lg1'), 'precondition: no delete button').toEqual(['Drag']);
    fireEvent.keyDown(window, { key: 'Delete' });
    await nextTask();
    expect(onSheet('lg1'), 'deleted by the key').toBeNull();
    await press(document.body, KEYS.undo);
    expect(onSheet('lg1'), 'back after ⌘Z').not.toBeNull();
  });

  it('M3 — there, Delete, Backspace and an arrow pressed on the focused Undo button leave the selected logo', async () => {
    openEditor(fixture(150));
    await selectBlock('lg1');
    await zoomOutToTheFloor();
    expect(rowOf('lg1'), 'precondition: no delete button').toEqual(['Drag']);
    // A step to undo, so the button is enabled: one nudge.
    await press(document.body, { key: 'ArrowRight', shiftKey: true });
    const at = () => doc().blocks.find((b) => b.id === 'lg1');
    const x1 = at()!.x;
    expect(selectedBlocks(), 'precondition: the logo is selected').toEqual(['lg1']);
    const undo = undoButton();
    undo.focus();
    for (const key of ['Delete', 'Backspace', 'ArrowRight']) await press(undo, { key });
    expect(onSheet('lg1'), 'not deleted from the button').not.toBeNull();
    expect(at()!.x, 'not moved from the button').toBe(x1);
  });

  it('M4 — a selected table’s column strip, then a word typed in a cell, then Undo: the word goes, the table stays whole', async () => {
    openEditor(fixture());
    await selectBlock('tb1');
    await click(onSheet('tb1')!.querySelector('[aria-label="Select column 2"]'), 'Select column 2');
    const cell = cellEditor('tb1', 4);
    expect(cell.textContent, 'precondition: the cell under "M (SD)"').toBe('4.2 (0.8)');
    await clickToEnd(cell);
    await typeText(cell, ' ZQW');
    expect(storedCell('tb1', 4), 'typed in the cell').toBe('4.2 (0.8) ZQW');
    await clickWithPointer(undoButton());
    const table = () => doc().blocks.find((b) => b.id === 'tb1')?.tableData;
    expect([storedCell('tb1', 4), table()?.cols], 'the word undone, three columns').toEqual(['4.2 (0.8) ', 3]);
    expect(onSheet('tb1'), 'the table is still on the sheet').not.toBeNull();
  });
});
