/**
 * The workspace rulers are hidden (owner decision 2026-09-30: hide them
 * entirely and come back to them later). On main their marks were off the
 * sheet by up to 30 in; the fix in progress is parked on the branch
 * editor/rulers-match-sheet (docs/fixes/04-rulers-match-sheet.md there).
 *
 * The editor draws no ruler and offers no "Show ruler" control. The grid
 * stays.
 *
 * Re-run: npx vitest run src/poster/__tests__/rulersHidden.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';

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

import { NoopResizeObserver, load, makeDoc, nextTask, openTab, renderEditor } from './editorKit';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A ruler's inch labels: `0"`, `5"`, `-5"` and so on. */
const inchLabels = () => [...document.querySelectorAll('span')]
  .filter((sp) => /^-?\d+"$/.test(sp.textContent?.trim() ?? ''));

describe('the workspace rulers are hidden', () => {
  it('the editor draws no ruler', async () => {
    // jsdom lays nothing out: give every box a size, or a ruler would draw
    // no marks and the test could not see it.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(800);
    load(makeDoc(48, 36));
    renderEditor();
    await nextTask();
    expect(document.getElementById('poster-canvas'), 'precondition: the sheet is drawn').not.toBeNull();
    expect(inchLabels().map((sp) => sp.textContent)).toEqual([]);
  });

  it('the layout tab offers the grid but no ruler', async () => {
    load(makeDoc(48, 36));
    renderEditor();
    await nextTask();
    await act(async () => { openTab(/layout/i); });
    expect(screen.getByLabelText(/show grid/i), 'precondition: the grid toggle is drawn').toBeTruthy();
    expect(screen.queryByLabelText(/show ruler/i)).toBeNull();
  });
});
