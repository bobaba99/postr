/**
 * Fix 03 (plan item 3), cause B — the zoom controls must never zoom the
 * wrong way. Engineering record: docs/fixes/03-fit-whole-sheet.md.
 *
 *   H2  Zoom out stops at 0.3 even when the fit is smaller, so it zooms in.
 *   H3  A pinch stops at 0.2 even when the fit is smaller, so it zooms in.
 *
 * Driven the way a user drives them: a click on the button, a Ctrl + wheel
 * event on the canvas (what a trackpad pinch sends).
 *
 * Re-run: npx vitest run src/poster/__tests__/zoomFloors.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

import { NoopResizeObserver, click, load, makeDoc, nextTask, q, renderEditor } from './editorKit';
import { stubScreen, zoomNow } from './workspaceKit';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});

/**
 * A button found once before many clicks is still the one on the page. If
 * it were re-created, the clicks went to a detached copy: say so, before
 * the zoom value would blame the zoom (step 9 review, CR2-CIT-01).
 */
function expectSameButton(button: HTMLElement, name: string) {
  expect(button.isConnected, `the ${name} button found before the clicks is still on the page`).toBe(true);
  expect(screen.getByRole('button', { name }), `${name} is the same button throughout`).toBe(button);
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('H2, H3 — the zoom controls never zoom the wrong way', () => {
  // 200 px of workspace for a 100 × 72 in poster: a fit far below 0.2.
  const smallFit = () => {
    stubScreen({ width: 200, height: 700 });
    load({ ...makeDoc(100, 72) } as PosterDoc);
    renderEditor();
    return zoomNow();
  };

  it('below the 0.3 step floor, Zoom out does not make the poster bigger', async () => {
    const fit = smallFit();
    expect(fit, 'precondition: a fit below 0.3').toBeLessThan(0.3);
    await click(screen.getByRole('button', { name: 'Zoom out' }), 'Zoom out');
    expect(zoomNow()).toBeLessThanOrEqual(fit + 1e-9);
  });

  it('below the 0.2 pinch floor, a pinch out does not make the poster bigger', async () => {
    const fit = smallFit();
    expect(fit, 'precondition: a fit below 0.2').toBeLessThan(0.2);
    fireEvent.wheel(q('[data-postr-canvas-outer]'), { ctrlKey: true, deltaY: 60, clientX: 100, clientY: 100 });
    await nextTask();
    expect(zoomNow()).toBeLessThanOrEqual(fit + 1e-9);
  });

  it('Zoom in then Zoom out returns to the fit, and stays below every floor after the window grows', async () => {
    const fit = smallFit();
    await click(screen.getByRole('button', { name: 'Zoom in' }), 'Zoom in');
    await click(screen.getByRole('button', { name: 'Zoom out' }), 'Zoom out');
    const chosen = zoomNow();
    expect(chosen, 'back to the fit').toBeLessThanOrEqual(fit + 1e-9);
    // Widen the window: the fit grows past the zoom the user chose, which
    // is now below every floor.
    vi.restoreAllMocks();
    stubScreen({ width: 1060, height: 700 });
    fireEvent(window, new Event('resize'));
    await nextTask();
    expect(zoomNow(), 'the manual zoom is kept').toBeCloseTo(chosen, 6);
    await click(screen.getByRole('button', { name: 'Zoom out' }), 'Zoom out');
    expect(zoomNow()).toBeLessThanOrEqual(chosen + 1e-9);
  });

  it('a Zoom out that cannot go lower leaves the poster fitted: it still refits when the window changes', async () => {
    const fit = smallFit();
    await click(screen.getByRole('button', { name: 'Zoom out' }), 'Zoom out');
    expect(zoomNow(), 'nothing moved').toBeCloseTo(fit, 6);
    vi.restoreAllMocks();
    stubScreen({ width: 1060, height: 700 });
    fireEvent(window, new Event('resize'));
    await nextTask();
    expect(zoomNow(), 'refitted to the bigger canvas').toBeGreaterThan(fit * 2);
  });

  it('a pinch out from just above 0.2 carries on down toward a smaller fit', async () => {
    const fit = smallFit();
    await click(screen.getByRole('button', { name: 'Zoom in' }), 'Zoom in');
    expect(zoomNow(), 'precondition: above 0.2').toBeGreaterThan(0.2);
    fireEvent.wheel(q('[data-postr-canvas-outer]'), { ctrlKey: true, deltaY: 120, clientX: 100, clientY: 100 });
    await nextTask();
    expect(zoomNow()).toBeLessThan(0.2);
    expect(zoomNow()).toBeGreaterThanOrEqual(fit - 1e-9);
  });

  it('five steps in and five out land exactly on the fit, so the next Zoom out is not a dead click', async () => {
    // Found by the independent review (R4, record section 9): 0.15 steps are
    // not exact in binary, so the round trip ended 1e-17 above the fit
    // (0.0566666666666667 against 0.056666666666666664). The drift happens
    // for some fits only: a 143 px canvas (fit 0.060833333333333336) drifts
    // to 0.06083333333333335 under the old clamp, found by simulating it.
    stubScreen({ width: 143, height: 700 });
    load({ ...makeDoc(120, 72) } as PosterDoc);
    renderEditor();
    const fit = zoomNow();
    expect(fit, 'precondition: a fit below 0.2').toBeLessThan(0.2);
    // Each button is found once (see the ceiling test below for why and
    // for what that gives up: here, that exactly one accessible Zoom out
    // exists at every zoom on the way, now checked once at the end).
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
    for (let i = 0; i < 5; i += 1) await click(zoomIn, 'Zoom in');
    for (let i = 0; i < 5; i += 1) await click(zoomOut, 'Zoom out');
    expectSameButton(zoomIn, 'Zoom in');
    expectSameButton(zoomOut, 'Zoom out');
    expect(Object.is(zoomNow(), fit), `${zoomNow()} against the fit ${fit}`).toBe(true);
  });

  it('Zoom in stops at the 10× ceiling', async () => {
    // Found by the independent review (R8, record section 9): this was listed
    // as a blind spot because reaching 10× takes many clicks, but clicks are
    // cheap in jsdom: 80 clicks of 0.15 pass 10× from this fit.
    stubScreen({ width: 1060, height: 520 });
    load(makeDoc(48, 36));
    renderEditor();
    // The button is found once. A role query walks the whole editor (about
    // 28 ms), and 80 of them made this test time out on CI's slower runners
    // (5170 ms); the timed-out loop kept running, and its next fresh query
    // found and clicked the following test's button. Clicking one element
    // means a timed-out loop clicks a button no longer on the page. What
    // this gives up: a check, at every zoom on the way, that exactly one
    // accessible button has this name; it is now checked once, at the end
    // (step 9 reviews CR2-CIT-02 and R2-CIT-01).
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    for (let i = 0; i < 80; i += 1) await click(zoomIn, 'Zoom in');
    expectSameButton(zoomIn, 'Zoom in');
    expect(zoomNow()).toBe(10);
  });

  it('control: above the floors, Zoom out and a pinch out both zoom out', async () => {
    stubScreen({ width: 1060, height: 520 });
    load(makeDoc(48, 36));
    renderEditor();
    const fit = zoomNow();
    await click(screen.getByRole('button', { name: 'Zoom out' }), 'Zoom out');
    const afterButton = zoomNow();
    expect(afterButton).toBeLessThan(fit);
    fireEvent.wheel(q('[data-postr-canvas-outer]'), { ctrlKey: true, deltaY: 60, clientX: 100, clientY: 100 });
    await nextTask();
    expect(zoomNow()).toBeLessThan(afterButton);
  });
});
