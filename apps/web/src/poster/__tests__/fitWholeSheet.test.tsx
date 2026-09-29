/**
 * Fix 03 (plan item 3), cause A — "Fit poster to screen" must show the whole
 * sheet. Engineering record: docs/fixes/03-fit-whole-sheet.md. The clipping
 * on screen needs layout and is measured in Chromium by
 * scripts/fit-check.mjs; these tests cover what jsdom can observe: the fit
 * against a stubbed canvas size, and the padding the workarea draws.
 *
 *   H1  Fit reserves a 60 px gutter in total while the workspace pads the
 *       sheet by 96 px on each side, so the fitted sheet plus its padding is
 *       132 px wider (or taller) than the canvas: the far edge scrolls out
 *       of view.
 *   H5  Fit from a scrolled view keeps the scroll, so the sheet's near edge
 *       is cut (found by the confirmers, record section 5).
 *   H6  A canvas narrower than the gutter shows the poster at 100% (useZoom's
 *       "not laid out yet" guard), or clips it (same).
 *
 * Owner decision (docs/stress-test/PLAN.md, accepted assumptions): the poster
 * gutter is 64 px on each side.
 *
 * Re-run: npx vitest run src/poster/__tests__/fitWholeSheet.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

import { MemoryRouter } from 'react-router';
import { render } from '@testing-library/react';
import { PosterEditor } from '../PosterEditor';
import {
  NoopResizeObserver, choosePreset, click, confirmButton, dialog, doc, load, makeDoc, openTab, q, renderEditor,
} from './editorKit';
import { sheetInBox, stubScreen, workareaPadding, zoomNow } from './workspaceKit';

/** The poster gutter, per side (owner decision). */
const GUTTER = 64;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('H1 — the fitted sheet and its padding fit the workspace', () => {
  it.each([
    [1060, 520, 48, 36],
    [1060, 520, 36, 48],
    [476, 700, 48, 36],
    [1600, 520, 30, 60],
  ])('in a %s × %s workspace, a %s × %s in poster fits with room for its padding', (bw, bh, pw, ph) => {
    stubScreen({ width: bw, height: bh });
    load(makeDoc(pw, ph));
    renderEditor();
    const got = sheetInBox(bw, bh, pw, ph);
    expect(got.w, 'width, with padding').toBeLessThanOrEqual(bw + 0.5);
    expect(got.h, 'height, with padding').toBeLessThanOrEqual(bh + 0.5);
    // Fitted, not merely small: the limiting side touches its gutter.
    expect(got.touches).toBe(true);
  });

  it(`the workspace pads the sheet by the poster gutter, ${GUTTER} px`, () => {
    stubScreen({ width: 1060, height: 520 });
    load(makeDoc(48, 36));
    renderEditor();
    expect(workareaPadding()).toEqual({ left: GUTTER, right: GUTTER, top: GUTTER, bottom: GUTTER });
  });
});

describe('H6 — a workspace narrower than the gutter still shows the whole sheet', () => {
  // 900 px wide with both panels open leaves about 96 px of canvas; a
  // window under ~870 px leaves under 60. Neither may fall back to 100%.
  it.each([
    [100, 700],
    [50, 700],
    [700, 40],
  ])('in a %s × %s workspace, a 48 × 36 in poster is fitted, not shown at full size', (bw, bh) => {
    stubScreen({ width: bw, height: bh });
    load(makeDoc(48, 36));
    renderEditor();
    expect(zoomNow(), 'not the 100% fallback').toBeLessThan(1);
    expect(zoomNow(), 'a sheet, not nothing').toBeGreaterThan(0);
    const got = sheetInBox(bw, bh, 48, 36);
    expect(got.fits, `sheet and padding ${got.w.toFixed(1)} × ${got.h.toFixed(1)} in ${bw} × ${bh}`).toBe(true);
    expect(got.touches).toBe(true);
  });

  it('a canvas that loses its size (not laid out) keeps the fit it had', () => {
    stubScreen({ width: 1060, height: 520 });
    load(makeDoc(48, 36));
    renderEditor();
    const fitted = zoomNow();
    expect(fitted, 'precondition: fitted, not 100%').not.toBeCloseTo(1, 3);
    vi.restoreAllMocks();
    stubScreen({ width: 0, height: 0 });
    fireEvent(window, new Event('resize'));
    expect(zoomNow()).toBeCloseTo(fitted, 6);
  });
});

describe('H5 — Fit from a scrolled view starts at the sheet\'s near edge', () => {
  // The canvas scrolled the way a trackpad scrolls it; with nothing off the
  // sheet a fitted canvas has no scroll range, but a block parked off the
  // sheet gives it one, and the kept scroll then cuts the near edge.
  const scrollCanvas = () => {
    const outer = q<HTMLElement>('[data-postr-canvas-outer]');
    outer.scrollLeft = 300;
    outer.scrollTop = 200;
    fireEvent.scroll(outer);
    return outer;
  };

  it.each([
    ['Fit poster to screen'],
    ['Reset zoom to fit'],
  ])('%s returns the canvas to the start of its scroll range', async (name) => {
    stubScreen({ width: 1060, height: 520 });
    load(makeDoc(48, 36));
    renderEditor();
    const outer = scrollCanvas();
    await click(screen.getByRole('button', { name }), name);
    expect([outer.scrollLeft, outer.scrollTop]).toEqual([0, 0]);
  });

  it('so does a new poster size, which refits', async () => {
    stubScreen({ width: 1060, height: 520 });
    load(makeDoc(48, 36));
    renderEditor();
    const outer = scrollCanvas();
    openTab(/layout/i);
    await choosePreset('36×48');
    const box = dialog(/Change poster to/);
    expect(box, 'the size change asks first').not.toBeNull();
    await click(confirmButton(box!), 'confirm');
    expect([doc().widthIn, doc().heightIn], 'precondition: the size changed').toEqual([36, 48]);
    expect([outer.scrollLeft, outer.scrollTop]).toEqual([0, 0]);
  });

  it('control: without Fit, the scroll the user chose stays', async () => {
    stubScreen({ width: 1060, height: 520 });
    load(makeDoc(48, 36));
    renderEditor();
    const outer = scrollCanvas();
    await click(screen.getByRole('button', { name: 'Zoom in' }), 'Zoom in');
    expect([outer.scrollLeft, outer.scrollTop]).toEqual([300, 200]);
  });
});

describe('H1 — Fit goes back to the fitted zoom', () => {
  /** The fit this fix promises: the tighter ratio, less 64 px on each side. */
  const expectedFit = (bw: number, bh: number, wIn: number, hIn: number) =>
    Math.min((bw - 2 * GUTTER) / (wIn * 10), (bh - 2 * GUTTER) / (hIn * 10));
  const zoomInTwice = async () => {
    await click(screen.getByRole('button', { name: 'Zoom in' }), 'Zoom in');
    await click(screen.getByRole('button', { name: 'Zoom in' }), 'Zoom in');
  };

  it.each([
    ['Fit poster to screen'],
    ['Reset zoom to fit'],
  ])('after zooming in, %s returns to the fitted zoom', async (name) => {
    stubScreen({ width: 1060, height: 520 });
    load(makeDoc(48, 36));
    renderEditor();
    await zoomInTwice();
    expect(zoomNow(), 'precondition: zoomed in').toBeGreaterThan(expectedFit(1060, 520, 48, 36) + 0.2);
    await click(screen.getByRole('button', { name }), name);
    expect(zoomNow()).toBeCloseTo(expectedFit(1060, 520, 48, 36), 6);
  });

  it('after zooming in, a new poster size is shown fitted', async () => {
    stubScreen({ width: 1060, height: 520 });
    load(makeDoc(48, 36));
    renderEditor();
    await zoomInTwice();
    openTab(/layout/i);
    await choosePreset('36×48');
    const box = dialog(/Change poster to/);
    expect(box, 'the size change asks first').not.toBeNull();
    await click(confirmButton(box!), 'confirm');
    expect(zoomNow()).toBeCloseTo(expectedFit(1060, 520, 36, 48), 6);
  });
});

describe('the phone share view keeps its own, smaller gutter', () => {
  const renderShare = () =>
    render(
      <MemoryRouter initialEntries={['/s/fixture']}>
        <PosterEditor readOnly />
      </MemoryRouter>,
    );

  it('on a phone, 8 px on each side, and the sheet fills the width', () => {
    stubScreen({ width: 375, height: 600 }, 375);
    load(makeDoc(48, 36));
    renderShare();
    expect(workareaPadding()).toEqual({ left: 8, right: 8, top: 8, bottom: 8 });
    const got = sheetInBox(375, 600, 48, 36);
    expect(got.fits).toBe(true);
    expect(got.touches).toBe(true);
  });

  it('control: the same share page on a desktop uses the desktop gutter', () => {
    stubScreen({ width: 1060, height: 520 }, 1280);
    load(makeDoc(48, 36));
    renderShare();
    expect(workareaPadding()).toEqual({ left: GUTTER, right: GUTTER, top: GUTTER, bottom: GUTTER });
  });
});

describe('the out-of-bounds banner stays in the gutter above a fitted sheet', () => {
  // Found by the independent review (R1, confirmed by a skeptic; record
  // section 9): the banner grew 33 px per warning line and, with the gutter
  // cut from 96 to 64 px, covered up to 93% of a fitted poster's title. Every
  // block is listed in the Issues tab, so the banner keeps to one line.
  it('three blocks past the edge: one line, no per-block lines', () => {
    stubScreen({ width: 1060, height: 520 });
    const d = makeDoc(48, 36);
    load({ ...d, blocks: d.blocks.map((b, i) => (i < 3 ? { ...b, x: 490 } : b)) });
    renderEditor();
    const heading = screen.getByText(/3 blocks outside poster bounds/);
    const banner = heading.parentElement!;
    expect(banner.querySelectorAll('div').length, 'lines under the heading').toBe(0);
    expect(banner.textContent).toMatch(/details in Issues/);
  });
});
