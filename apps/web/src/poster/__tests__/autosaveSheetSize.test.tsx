/**
 * Fix 02, cause E — autosave keeps the poster row's width_in/height_in in step
 * with the poster. The dashboard card takes its shape from those columns, and
 * they were never written after the poster was created, so a resized poster's
 * (now correctly shaped) thumbnail was cropped by a card of the old shape.
 * Engineering record: docs/fixes/02-poster-size.md.
 *
 * Re-run: npx vitest run src/poster/__tests__/autosaveSheetSize.test.tsx
 */
import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authSpies = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));
const upsertSpy = vi.hoisted(() => vi.fn(async () => ({})));

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
  upsertPoster: upsertSpy,
}));
vi.mock('@/data/thumbnails', () => ({ captureThumbnail: vi.fn(async () => null) }));

import { NoopResizeObserver, load, makeDoc, openTab, renderEditor, sizeMenu } from './editorKit';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  upsertSpy.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Update = { widthIn?: number; heightIn?: number; data?: { widthIn: number; heightIn: number } };
const saves = () => (upsertSpy.mock.calls as unknown as Array<[string, Update]>).map((c) => c[1]).filter((u) => u.data);

describe('autosave writes the poster\'s size to the row', () => {
  it('after a size change, the save carries the new width and height', async () => {
    // Fake ONLY the timers autosave uses (before anything schedules one), so
    // the user actions below run synchronously and the debounce is advanced.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    load(makeDoc(48, 36));
    renderEditor();
    openTab(/layout/i);
    fireEvent.change(sizeMenu(), { target: { value: '36×48' } });
    // Since cause B the size change asks first; confirm it if it does.
    const open = document.querySelector('[data-postr-modal-content][data-state="open"]');
    if (open) {
      fireEvent.click(Array.from(open.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() !== 'Cancel')!);
    }
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    const last = saves().at(-1);
    expect(last, 'a save ran').toBeDefined();
    expect([last!.data!.widthIn, last!.data!.heightIn], 'the poster in the save').toEqual([36, 48]);
    expect([last!.widthIn, last!.heightIn], 'the row columns in the save').toEqual([36, 48]);
  });
});
