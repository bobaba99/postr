/**
 * Fix 02, cause A (re-check RA1) — a document that enters the editor with an
 * unusable size gets ONE real size, whichever door it comes through.
 *
 * Opening a poster was repaired, but restoring a version (and the share page,
 * and importing) put the snapshot into the store as saved: the sheet was
 * drawn at the 48 in default while Save PDF, the PPTX note and the saved data
 * used the raw 1189 in, so one poster had three sizes. The repair now sits in
 * the store's `setPoster`, which every one of those doors calls.
 *
 * Entered the way a user restores: Versions tab → Restore → confirm.
 * Engineering record: docs/fixes/02-poster-size.md.
 * Re-run: npx vitest run src/poster/__tests__/restoreSheetSize.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
vi.mock('@/data/posterVersions', async (orig) => ({
  ...(await orig<typeof import('@/data/posterVersions')>()),
  listVersions: vi.fn(async () => [
    { id: 'v1', poster_id: 'fixture-1', name: 'Before the deadline', created_at: '2026-09-01T12:00:00Z' },
  ]),
  loadVersion: vi.fn(async () => versions.snapshot),
  saveVersion: vi.fn(async () => undefined),
}));

import {
  NoopResizeObserver,
  choosePreset,
  click,
  confirmButton,
  dialog,
  doc,
  expectMovedProportionally,
  load,
  makeDoc,
  openTab,
  q,
  renderEditor,
  userBlocks,
} from './editorKit';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Restore `snapshot` over a poster that is currently 36 × 24. */
async function restoreSnapshot(snapshot: unknown) {
  versions.snapshot = snapshot;
  load(makeDoc(36, 24));
  renderEditor();
  openTab(/versions/i);
  await click(await screen.findByRole('button', { name: 'Restore' }), 'Restore');
  const box = dialog(/restore this version/i);
  await click(box && confirmButton(box), 'confirm restore');
  await waitFor(() => expect(screen.queryByText('Version restored')).not.toBeNull());
}

describe('A — a restored version with an unusable size gets one real size', () => {
  it('control: a 36×24 snapshot is restored at 36×24', async () => {
    await restoreSnapshot(makeDoc(36, 24));
    expect([doc().widthIn, doc().heightIn]).toEqual([36, 24]);
    expect(q<HTMLElement>('#poster-canvas').style.width).toBe('360px');
  });

  it.each([
    ['1189 (the A0 height in mm, typed into inches)', 1189],
    ['missing', undefined],
    ['a numeric string', '30'],
  ])('a snapshot whose width is %s is drawn, printed and saved at one size', async (_label, w) => {
    await restoreSnapshot({ ...makeDoc(48, 40), widthIn: w } as unknown as PosterDoc);
    // An unusable width falls back to the poster's own current width (36),
    // not to the 48 in default (final review, RF-4).
    const expected = w === '30' ? 30 : 36;
    // The store's doc is what Save PDF, the PPTX note and autosave read.
    expect(doc().widthIn).toBe(expected);
    expect(q<HTMLElement>('#poster-canvas').style.width).toBe(`${expected * 10}px`);
  });
});

describe('A — a restored version with no usable height takes the poster\'s current height', () => {
  it('height missing: the poster\'s own 24 in, not the 36 in default', async () => {
    await restoreSnapshot({ ...makeDoc(48, 40), heightIn: undefined } as unknown as PosterDoc);
    expect([doc().widthIn, doc().heightIn]).toEqual([48, 24]);
  });
});

describe('B — a size change after restoring such a version moves from the size drawn', () => {
  // Re-check of fix 02, BG-3, measured before the store repair: the change
  // scaled from the snapshot's raw size, so blocks stayed put (missing, 0,
  // text) or shrank to 3% (1200 in), while the sheet was drawn at 48 × 36.
  it.each([
    ['missing', undefined],
    ['zero', 0],
    ['1200 in', 1200],
  ])('width %s: every block moves in proportion from the size drawn', async (_label, w) => {
    await restoreSnapshot({ ...makeDoc(48, 36), widthIn: w } as unknown as PosterDoc);
    const before = userBlocks();
    const drawn: [number, number] = [doc().widthIn, doc().heightIn];
    expect(q<HTMLElement>('#poster-canvas').style.width, 'the size drawn').toBe(`${drawn[0] * 10}px`);
    openTab(/layout/i);
    await choosePreset('36×48');
    await click(confirmButton(dialog(/Change poster to 36 × 48 in/)!), 'confirm');
    expectMovedProportionally(before, drawn, [36, 48]);
  });
});
