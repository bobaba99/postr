/**
 * The switch that hides the workspace rulers (RULERS_ENABLED,
 * config/features.ts). The owner hid them on 2026-09-30, when their marks
 * were off the sheet by up to 30 in, and showed them again on 2026-10-16
 * with fix 04 (docs/fixes/04-rulers-match-sheet.md). This file turns the
 * switch off and checks what it hides: the editor draws no ruler and
 * offers no "Show ruler" control. The rulers as shipped are
 * src/poster/__tests__/rulers.test.tsx.
 *
 * The grid and its toggle are hidden too since record 29
 * (ADJUSTMENTS_ENABLED): this file turns them back on, so the overlays
 * section the ruler toggle would join is drawn and its absence there means
 * something.
 *
 * Re-run: npx vitest run src/poster/__tests__/rulersHidden.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Record 29 hid the grid toggle (the overlays section this file reads) (config/features.ts ADJUSTMENTS_ENABLED);
// this file tests that kept code, so it turns the switch on. The shipped
// configuration is src/poster/__tests__/mvpHidden.test.tsx.
// And it turns the rulers' switch off, which is what it tests.
vi.mock('@/config/features', async (orig) => ({
  ...(await orig<typeof import('@/config/features')>()),
  ADJUSTMENTS_ENABLED: true,
  RULERS_ENABLED: false,
}));
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

describe('with RULERS_ENABLED off, the workspace rulers are hidden', () => {
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
