/**
 * Record 36 — select and move like PowerPoint, on the controls record 29
 * hid (config/features.ts ADJUSTMENTS_ENABLED and EDITOR_EXTRAS_ENABLED):
 * the table's column strips, its right-click menu, crop, and the Export
 * tab's Staples dialog. The code is kept, so this file turns the switches
 * on; the shipped configuration is selectMove.test.tsx.
 *
 *   K1  the table's menu and crop take Esc first: they close, the block
 *       stays selected
 *   K0  a dialog with the shared modal markup and no aria-modal (the
 *       Staples dialog) holds the selection's keys too: review round 1,
 *       R36-4 — the keys read a narrower test of "a dialog is open"
 *       (PosterEditor's modalDialogOpen) than Esc, undo and ⌘P
 *       (editorHistory.ts dialogOpen); now one test
 *
 * Not here: the table's strip listener with a focused menu (the same guard
 * as its range listener, changed with it). No user path reaches it: a click
 * or a key press on any control outside the table clears the strip
 * selection (blocks.tsx), and selecting the table shows the Edit block tab,
 * which has no menu for a table. Its mutant is a documented blind spot
 * (docs/fixes/36-select-move.mutants.json).
 *
 * Re-run: npx vitest run src/poster/__tests__/selectMoveAdjustments.test.tsx
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/config/features', async (orig) => ({
  ...(await orig<typeof import('@/config/features')>()),
  ADJUSTMENTS_ENABLED: true,
  EDITOR_EXTRAS_ENABLED: true,
}));
import { fireEvent, screen } from '@testing-library/react';
import type { PosterDoc } from '@postr/shared';

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

import { click, findButton, openTab } from './editorKit';
import {
  NoopResizeObserver,
  cellEditor,
  installContentEditableShim,
  installExecCommandShim,
  doc,
  load,
  nextTask,
  press,
  q,
  renderEditor,
  selectedBlocks,
  undoDoc,
} from './undoKit';

/** A 2 × 2 PNG, so the image shows a picture and offers Crop. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4AWP4z8DwHwyBAMQgYGBgAAB1SQX7nHNiaQAAAABJRU5ErkJggg==';

function withPicture(): PosterDoc {
  const d = undoDoc();
  return { ...d, blocks: d.blocks.map((b) => (b.id === 'im1' ? { ...b, imageSrc: PNG } : b)) };
}

let unshims: Array<() => void> = [];
beforeAll(() => {
  unshims = [installContentEditableShim(), installExecCommandShim()];
});
afterAll(() => unshims.forEach((u) => u()));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  load(withPicture());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('K1 — what is open takes Esc first', () => {
  it('the table’s right-click menu closes on Esc, and the table stays selected', async () => {
    renderEditor();
    await click(q('#poster-canvas [data-block-id="tb1"]'), 'block tb1');
    fireEvent.contextMenu(cellEditor('tb1', 0).closest('td')!, { clientX: 40, clientY: 40 });
    await nextTask();
    const menuOpen = () => document.querySelector('[data-postr-takes-escape]') !== null && screen.queryAllByRole('button', { name: /Insert row/ }).length > 0;
    expect(menuOpen(), 'precondition: the table menu is open').toBe(true);
    await press(document.body, { key: 'Escape' });
    expect(menuOpen()).toBe(false);
    expect(selectedBlocks()).toEqual(['tb1']);
  });

  it('crop takes Esc: crop mode ends, and the image stays selected', async () => {
    renderEditor();
    await click(q('#poster-canvas [data-block-id="im1"]'), 'block im1');
    await click(q('#poster-canvas [data-block-id="im1"] button[title="Crop image"]'), 'Crop image');
    const cropping = () => document.querySelector('#poster-canvas [data-block-id="im1"] [aria-label="crop right edge"]') !== null;
    expect(cropping(), 'precondition: crop mode').toBe(true);
    await press(document.body, { key: 'Escape' });
    expect(cropping()).toBe(false);
    expect(selectedBlocks()).toEqual(['im1']);
  });
});

describe('K0 — a dialog holds the selection’s keys', () => {
  it('the Staples dialog (shared modal markup, no aria-modal): Delete, an arrow, ⌘A and ⌘D on its button leave the blocks alone', async () => {
    renderEditor();
    await click(q('#poster-canvas [data-block-id="b2"]'), 'block b2');
    expect(selectedBlocks(), 'precondition: b2 selected').toEqual(['b2']);
    openTab(/export/i);
    await nextTask();
    await click(findButton('Email the PDF to Staples'), 'Export › Email the PDF to Staples');
    const dialog = document.querySelector('[data-postr-modal-content]:not([data-state="closing"])');
    expect(dialog?.textContent ?? '', 'precondition: the Staples dialog is open').toMatch(/Print at Staples/);
    expect(dialog!.closest('[aria-modal="true"]'), 'precondition: the dialog is not marked aria-modal').toBeNull();
    const button = dialog!.querySelector('button')!;
    button.focus();
    const places = () => doc().blocks.map((b) => `${b.id}@${b.x},${b.y}`).join(' ');
    const before = places();
    for (const init of [{ key: 'Delete' }, { key: 'Backspace' }, { key: 'ArrowRight' }, { key: 'a', metaKey: true }, { key: 'd', metaKey: true }]) {
      await press(button, init);
    }
    expect(places(), 'no block removed, moved or copied behind the dialog').toBe(before);
    expect(selectedBlocks()).toEqual(['b2']);
  });
});
