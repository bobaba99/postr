/**
 * Fix 04 (plan item 4) — the rulers' inch marks sit on the poster's inches.
 * Engineering record: docs/fixes/04-rulers-match-sheet.md.
 *
 *   A (H1, H2)  The marks leave out the workarea's centring of the sheet and
 *               the ruler bars' 24 px inset.
 *   B           After a resize that leaves the zoom unchanged (a fit capped
 *               at 5×, or a new poster height at a width-limited fit), the
 *               rulers stop part of the way along, or keep the old position.
 *   C           A reading taken when the canvas resizes or scrolls reached
 *               the page only in a later task, after the browser had painted
 *               the frame, so the rulers showed the old position for a frame
 *               or two (leaving Preview, a size change, closing the guides
 *               panel, hiding the sidebar, a pinch step; the first step 10
 *               review and its G1 measurement). A browser paints after a resize
 *               observer's callbacks and scroll events, so a reading on the
 *               page when they return is on the frame; the tests below fire
 *               them outside React's act(), which would otherwise flush the
 *               update before returning. The reading moves the marks'
 *               layers by layout, at whole device pixels (the second step 10
 *               review, R3-F1; the follow-up review, CG-1).
 *
 * jsdom has no layout, so the test reports what a browser would at rest. The
 * canvas is `box` wide and tall. The sheet is its own size at the current
 * zoom, laid out as the workarea lays it out (centred when it and its padding
 * fit, one padding in from the scroll origin when they do not), less the
 * canvas's scroll; the sheet, its frame and the frame's holder share that
 * corner, as they do in a browser at rest, so the test does not care which of
 * the three the rulers read. Each ruler bar sits where its own style puts it
 * (the top bar 24 px in from the left, the left bar 24 px down). A resize is
 * reported only to the observers watching the element that resized. The test
 * reads where each ruler draws a mark on screen (its bar's position plus the
 * mark's offset in the bar) against where that inch of the sheet is. The real
 * geometry, in three browsers, is `scripts/ruler-check.mjs`.
 *
 * Re-run: npx vitest run src/poster/__tests__/rulers.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';

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
// Counts the editor's renders: it calls useAutosave once on each.
const editorRenders = vi.hoisted(() => ({ n: 0 }));
vi.mock('@/hooks/useAutosave', async (orig) => {
  const real = await orig<typeof import('@/hooks/useAutosave')>();
  return {
    ...real,
    useAutosave: (...args: Parameters<typeof real.useAutosave>) => {
      editorRenders.n += 1;
      return real.useAutosave(...args);
    },
  };
});

import {
  PX, click, confirmButton, dialog, heightField, load, makeDoc, nextTask, openTab, pressEnter, q, renderEditor, typeKeystrokes,
} from './editorKit';
import { workareaPadding, zoomNow } from './workspaceKit';

type Rect = { left: number; top: number; width: number; height: number };
const rectOf = ({ left, top, width, height }: Rect) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect;

/**
 * A ResizeObserver that reports a resize, when the test says an element was
 * resized, to the observers watching that element (and only those).
 */
class FiringResizeObserver {
  static all: FiringResizeObserver[] = [];
  private targets = new Set<Element>();
  constructor(private cb: ResizeObserverCallback) {
    FiringResizeObserver.all.push(this);
  }
  observe(el: Element) {
    this.targets.add(el);
  }
  unobserve(el: Element) {
    this.targets.delete(el);
  }
  disconnect() {
    this.targets.clear();
  }
  static resized(...els: Element[]) {
    for (const o of FiringResizeObserver.all) {
      const entries = els.filter((el) => o.targets.has(el)).map((target) => ({ target }) as ResizeObserverEntry);
      if (entries.length) o.cb(entries, o as unknown as ResizeObserver);
    }
  }
}

const isOuter = (el: Element) => el.hasAttribute('data-postr-canvas-outer');
/** The sheet, its frame, and the frame's holder: at rest, one top-left corner. */
const isSheetBox = (el: Element) =>
  el.id === 'poster-canvas' ||
  el.hasAttribute('data-postr-canvas-frame') ||
  !!el.firstElementChild?.hasAttribute('data-postr-canvas-frame');
/** A ruler bar, told apart by the style a browser lays it out from. */
const barOf = (el: Element) => {
  const st = (el as HTMLElement).style;
  if (!st || st.position !== 'absolute' || st.overflow !== 'hidden') return null;
  if (st.height === '24px' && st.left === '24px') return 'top';
  if (st.width === '24px' && st.top === '24px') return 'left';
  return null;
};

/**
 * What a browser reports for a `box.width` × `box.height` canvas; with
 * `box.hidden` (the editor under display: none, as in Preview), every box
 * is 0 × 0 at 0, 0. `box.scrollbar` is the width of scrollbars that take
 * space (Windows, Linux, macOS set to always show them): the canvas's
 * client box is that much narrower and shorter than its border box, and
 * the ruler bars run over them. `box.workareaShrink` lays the workarea out
 * that much narrower than the canvas, which moves the centred sheet with no
 * change to the canvas's box or the sheet's frame (WebKit, for a frame,
 * while a scrollbar comes and goes). `box.float32` reports every box at
 * single precision, as Chromium's DOMRect does (its values come from floats:
 * a sheet laid out at exactly 553.5 device px at a ratio of 2.2 reads back as
 * 553.4999845; the review of the port's correction, record 04 section 11.9).
 */
function stubLayout(box: { width: number; height: number; hidden?: boolean; scrollbar?: number; workareaShrink?: number; float32?: boolean }) {
  const sheet = (): Rect => {
    const z = zoomNow();
    const el = q<HTMLElement>('#poster-canvas');
    const width = parseFloat(el.style.width) * z;
    const height = parseFloat(el.style.height) * z;
    const pad = workareaPadding();
    const o = q<HTMLElement>('[data-postr-canvas-outer]');
    return {
      left: Math.max(pad.left, (box.width - (box.workareaShrink ?? 0) - width) / 2) - (o?.scrollLeft ?? 0),
      top: Math.max(pad.top, (box.height - height) / 2) - (o?.scrollTop ?? 0),
      width, height,
    };
  };
  const real = Element.prototype.getBoundingClientRect;
  const f = (r: Rect): Rect => (box.float32
    ? { left: Math.fround(r.left), top: Math.fround(r.top), width: Math.fround(r.width), height: Math.fround(r.height) }
    : r);
  const rect = (r: Rect) => rectOf(f(r));
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (box.hidden) return rect({ left: 0, top: 0, width: 0, height: 0 });
    if (isOuter(this)) return rect({ left: 0, top: 0, width: box.width, height: box.height });
    if (isSheetBox(this)) return rect(sheet());
    const bar = barOf(this);
    if (bar === 'top') return rect({ left: 24, top: 0, width: box.width - 24, height: 24 });
    if (bar === 'left') return rect({ left: 0, top: 24, width: 24, height: box.height - 24 });
    return real.call(this);
  });
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
    return isOuter(this) ? box.width - (box.scrollbar ?? 0) : 0;
  });
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) {
    return isOuter(this) ? box.height - (box.scrollbar ?? 0) : 0;
  });
  // The canvas scrolls over the sheet and its padding, or its own box when
  // they fit inside it.
  const content = () => {
    const z = zoomNow();
    const el = q<HTMLElement>('#poster-canvas');
    const pad = workareaPadding();
    return {
      width: Math.max(box.width, parseFloat(el.style.width) * z + pad.left + pad.right),
      height: Math.max(box.height, parseFloat(el.style.height) * z + pad.top + pad.bottom),
    };
  };
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
    return isOuter(this) && !box.hidden ? content().width : 0;
  });
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function (this: Element) {
    return isOuter(this) && !box.hidden ? content().height : 0;
  });
  return { sheet };
}

/**
 * Where an element sits along one axis in its parent, as a browser places
 * it: its `left` (or `top`) plus any `translateX` (or `translateY`), in px.
 * The rulers place their layers by layout, and the effective offset is read
 * whichever way they do it (the follow-up review, CG-4: a test that read the
 * transform's text could not see a layer placed otherwise).
 */
const offsetOf = (el: HTMLElement, vertical: boolean) => {
  const m = el.style.transform.match(vertical ? /translateY\((-?[\d.e+-]+)px\)/ : /translateX\((-?[\d.e+-]+)px\)/);
  return (parseFloat(vertical ? el.style.top : el.style.left) || 0) + (m ? parseFloat(m[1]!) : 0);
};

/**
 * A ruler: its bar (found through its own inch labels) and where it draws
 * inch `n` on screen. The labels are read afresh on every call: a mark that
 * scrolls off its bar is removed from the page. A mark is drawn where a
 * browser lays it out: its bar's edge, plus the offset and any translate of
 * the mark and of every element between it and the bar.
 */
function ruler(vertical: boolean) {
  const labelsNow = () => [...document.querySelectorAll('span')].filter(
    (sp) => /^-?\d+"$/.test(sp.textContent?.trim() ?? '') && (sp.style.writingMode === 'vertical-lr') === vertical,
  );
  const barAbove = (el: Element | null) => {
    let e = el;
    while (e && !barOf(e)) e = e.parentElement;
    return e as HTMLElement | null;
  };
  const bar = barAbove(labelsNow()[0] ?? null);
  const onScreen = (mark: HTMLElement) => {
    const b = bar!.getBoundingClientRect();
    let along = 0;
    for (let e: HTMLElement | null = mark; e && e !== bar; e = e.parentElement) {
      along += offsetOf(e, vertical);
    }
    return (vertical ? b.top : b.left) + along;
  };
  const markOnScreen = (inch: number) => {
    const mark = labelsNow().find((sp) => sp.textContent?.trim() === `${inch}"`)?.parentElement;
    return bar && mark ? onScreen(mark) : null;
  };
  /** The last mark on the bar (marks past its end are clipped), and where the bar ends. */
  const far = () => {
    const b = bar!.getBoundingClientRect();
    const barEnd = vertical ? b.bottom : b.right;
    const marks = [...(labelsNow()[0]!.parentElement!.parentElement!.children)] as HTMLElement[];
    const onBar = marks.map(onScreen).filter((p) => p <= barEnd);
    return { lastMark: Math.max(...onBar), barEnd };
  };
  /** The first mark on the bar, and where the bar starts. */
  const near = () => {
    const b = bar!.getBoundingClientRect();
    const barStart = vertical ? b.top : b.left;
    const marks = [...(labelsNow()[0]!.parentElement!.parentElement!.children)] as HTMLElement[];
    const onBar = marks.map(onScreen).filter((p) => p >= barStart);
    return { firstMark: Math.min(...onBar), barStart };
  };
  return { bar, markOnScreen, far, near };
}

const canvas = () => q<HTMLElement>('[data-postr-canvas-outer]');
const frame = () => q<HTMLElement>('[data-postr-canvas-frame]');

/** Open a `w` × `h` in poster in a `box` canvas, as fitted. */
async function open(box: { width: number; height: number; scrollbar?: number; float32?: boolean }, poster = { w: 48, h: 36 }) {
  const layout = stubLayout(box);
  load(makeDoc(poster.w, poster.h));
  renderEditor();
  await nextTask();
  const top = ruler(false);
  const left = ruler(true);
  expect(top.bar, 'precondition: the top ruler is drawn').not.toBeNull();
  expect(left.bar, 'precondition: the left ruler is drawn').not.toBeNull();
  return { layout, perInch: PX * zoomNow(), top, left };
}

beforeEach(() => {
  FiringResizeObserver.all = [];
  vi.stubGlobal('ResizeObserver', FiringResizeObserver);
  // No animation frames: every reading the test sees must come from an
  // event the page reacted to (a render, a scroll, a resize), never from a
  // frame that happened to run (the rulers once re-read on animation
  // frames, and a test passed on a frame alone).
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// As shipped (RULERS_ENABLED on since 2026-10-16, the owner's "start them
// now"): the editor opens with the rulers drawn and the Layout tab's "Show
// ruler" checked, and the toggle hides and shows them. Whether the toggle
// is remembered across a reload is the browser's (ruler-check.mjs
// --exports: it is not).
describe('the rulers as shipped', () => {
  it('the editor opens with the rulers drawn and Show ruler on; the toggle hides and shows them', async () => {
    await open({ width: 1000, height: 800 });
    openTab(/layout/i);
    const rulerBox = () => [...document.querySelectorAll('label')]
      .find((l) => l.textContent?.trim() === 'Show ruler')?.querySelector('input') as HTMLInputElement | undefined;
    expect(rulerBox(), 'the Layout tab offers Show ruler').toBeTruthy();
    expect(rulerBox()!.checked, 'Show ruler is on as the editor opens').toBe(true);
    await click(rulerBox()!, 'hide the rulers');
    expect(ruler(false).bar, 'the top ruler is gone').toBeNull();
    expect(ruler(true).bar, 'the left ruler is gone').toBeNull();
    await click(rulerBox()!, 'show the rulers');
    expect(ruler(false).bar, 'the top ruler is back').not.toBeNull();
    expect(ruler(true).bar, 'the left ruler is back').not.toBeNull();
    await act(async () => { await nextTask(); });
  });
});

describe('A (H1, H2) — the rulers\' marks sit on the sheet\'s inches', () => {
  const box = { width: 1000, height: 800 };

  it('the top ruler\'s 0" and 5" marks sit on the sheet\'s left edge and its fifth inch', async () => {
    const { layout, perInch, top } = await open(box);
    expect(top.markOnScreen(0)).toBeCloseTo(layout.sheet().left, 1);
    expect(top.markOnScreen(5)).toBeCloseTo(layout.sheet().left + 5 * perInch, 1);
  });

  it('the left ruler\'s 0" and 5" marks sit on the sheet\'s top edge and its fifth inch', async () => {
    const { layout, perInch, left } = await open(box);
    expect(left.markOnScreen(0)).toBeCloseTo(layout.sheet().top, 1);
    expect(left.markOnScreen(5)).toBeCloseTo(layout.sheet().top + 5 * perInch, 1);
  });

  it('after a scroll moves the sheet, the marks follow it', async () => {
    const { layout, top, left } = await open(box);
    // Zoomed in far enough that the canvas can scroll both ways.
    for (let i = 0; i < 4; i += 1) await click(screen.getByRole('button', { name: 'Zoom in' }), 'Zoom in');
    const perInch = PX * zoomNow();
    expect(layout.sheet().width, 'precondition: the sheet is wider than the canvas').toBeGreaterThan(box.width);
    const o = canvas();
    o.scrollLeft = 100;
    o.scrollTop = 40;
    expect([o.scrollLeft, o.scrollTop], 'precondition: jsdom keeps the scroll').toEqual([100, 40]);
    fireEvent.scroll(o);
    await nextTask();
    // The sheet's corner is now under the rulers' corner, so read its 10".
    expect(top.markOnScreen(10)).toBeCloseTo(layout.sheet().left + 10 * perInch, 1);
    expect(left.markOnScreen(10)).toBeCloseTo(layout.sheet().top + 10 * perInch, 1);
  });

  it('control: the marks are one poster inch apart (the scale was never wrong)', async () => {
    const { perInch, top, left } = await open(box);
    expect(top.markOnScreen(10)! - top.markOnScreen(5)!).toBeCloseTo(5 * perInch, 1);
    expect(left.markOnScreen(10)! - left.markOnScreen(5)!).toBeCloseTo(5 * perInch, 1);
  });

  it('after the canvas narrows below four gutters at a manual zoom, the marks follow the smaller gutter', async () => {
    // The gutter shrinks with a canvas under 256 px (workspaceGeometry.ts),
    // and a manual zoom does not change with the canvas. Here the resize
    // reaches the observers in one step with no window 'resize' event, so
    // the zoom hook commits the new gutter after the rulers' own resize
    // reading and only the gutter trigger re-reads. In Chromium no user
    // entry was found where that order holds at rest: a window resize
    // commits the gutter during its 'resize' event, first (the step 9
    // review's round 2, CR9R2-04-01, 3 entries tried). This guards the code path.
    const narrowing = { width: 1000, height: 800 };
    const { layout, top } = await open(narrowing);
    await click(screen.getByRole('button', { name: 'Zoom in' }), 'Zoom in');
    const zoom = zoomNow();
    const before = workareaPadding().left;
    Object.assign(narrowing, { width: 240 });
    await act(async () => {
      FiringResizeObserver.resized(canvas());
      await nextTask();
    });
    expect(zoomNow(), 'precondition: the manual zoom is kept').toBe(zoom);
    expect(workareaPadding().left, 'precondition: the gutter shrank').toBeLessThan(before);
    const perInch = PX * zoom;
    const firstOnBar = Math.ceil((24 - layout.sheet().left) / perInch);
    expect(top.markOnScreen(firstOnBar + (5 - (firstOnBar % 5)) % 5)).toBeCloseTo(
      layout.sheet().left + (firstOnBar + (5 - (firstOnBar % 5)) % 5) * perInch, 1);
  });
});

// The second step 10 review, R3-F1: the marks' layers were moved by a
// fractional translate, which a browser does not snap to the pixel grid as it
// snaps layout, so each 1 px tick was painted smeared over two device pixels
// (Chromium and WebKit; main's layout-placed ticks were crisp). The layers are
// now placed by layout at whole device pixels; that a translate rounded the
// same way still paints differently is beyond jsdom (the spec's
// transform-placed; scripts/ruler-paint-check.mjs).
describe('C — the marks\' layers sit on whole device pixels', () => {
  /** Each ruler's layer of marks (found through an inch label), and whether it is the left ruler's. */
  const layers = () => [false, true].map((vertical) => [[...document.querySelectorAll('span')]
    .find((sp) => /^-?\d+"$/.test(sp.textContent?.trim() ?? '') && (sp.style.writingMode === 'vertical-lr') === vertical)
    ?.parentElement?.parentElement as HTMLElement, vertical] as const);
  /** How far each layer sits off the device pixel grid at `dpr`, in device px. */
  const offGrid = (dpr: number) => layers().map(([layer, vertical]) => {
    const v = offsetOf(layer, vertical) * dpr;
    return Math.abs(v - Math.round(v));
  });

  // The follow-up review, R1G-F2: the sheet sat at a whole pixel on one axis
  // and at a fraction of .125 on the other, so a layer that lost its rounding,
  // or rounded down, went unseen. Here both axes sit at a fraction, neither a
  // half: .3 rounds down and .7 up.
  it.each([1, 1.25, 1.5, 2])('at a device pixel ratio of %s, a sheet at .3 and .7 of a pixel puts both rulers\' layers on the nearest whole device pixel', async (dpr) => {
    vi.stubGlobal('devicePixelRatio', dpr);
    const { layout, top, left } = await open({ width: 1000.6, height: 801.4 }, { w: 10, h: 10 });
    const s = layout.sheet();
    expect([+(s.left % 1).toFixed(3), +(s.top % 1).toFixed(3)], 'precondition: both axes at a fraction of a pixel, neither a half').toEqual([0.3, 0.7]);
    expect(offGrid(dpr).every((d) => d < 1e-6), `the layers' offsets × ${dpr}: ${layers().map(([l, v]) => offsetOf(l, v) * dpr).join(', ')}`).toBe(true);
    expect(Math.abs(top.markOnScreen(0)! - s.left)).toBeLessThanOrEqual(0.5 / dpr + 1e-6);
    expect(Math.abs(left.markOnScreen(0)! - s.top)).toBeLessThanOrEqual(0.5 / dpr + 1e-6);
  });

  // The review of the port, R1-F1: at a browser zoom (Chrome's 90 % and
  // 110 %, on a display of ratio 1 or 2) the bars themselves sit at a
  // fraction of a device pixel (24 px is 21.6 device px at 0.9). A layer
  // rounded against its bar was then off the screen's device grid, and the
  // browser, which snaps a box's place on the screen when it paints, moved
  // it a second time: the painted 0" a device pixel off the sheet's painted
  // edge (scripts/ruler-paint-check.mjs, chromium@0.9 and the other three).
  // The 0" goes on the screen's whole device pixel nearest the sheet's edge,
  // the one the browser paints that edge on.
  it.each([0.9, 1.1, 1.8, 2.2, 0.67])('at a ratio of %s (a browser zoom), with the bars off the device grid, both 0" marks sit on the screen\'s device pixel nearest the sheet\'s edge', async (dpr) => {
    vi.stubGlobal('devicePixelRatio', dpr);
    const { layout, top, left } = await open({ width: 1000.6, height: 801.4 }, { w: 10, h: 10 });
    const s = layout.sheet();
    const offScreenGrid = (v: number) => Math.abs(v * dpr - Math.round(v * dpr));
    const bars = [top.bar!.getBoundingClientRect().left, left.bar!.getBoundingClientRect().top];
    expect(bars.map((v) => offScreenGrid(v) > 0.05), `precondition: both bars sit off the device grid (${bars.map((v) => v * dpr).join(', ')} device px)`).toEqual([true, true]);
    const zero = [top.markOnScreen(0)!, left.markOnScreen(0)!];
    expect(zero.map((v) => offScreenGrid(v) < 1e-6), `the 0" marks at ${zero.map((v) => v * dpr).join(', ')} device px`).toEqual([true, true]);
    expect(zero.map((v) => Math.round(v * dpr)), 'the device pixels the sheet\'s edges are painted on').toEqual([Math.round(s.left * dpr), Math.round(s.top * dpr)]);
  });

  // The correction of the review of the port (record 04 section 11.9): a
  // sheet laid out at exactly half a device pixel (a centring often lands
  // there) is painted on the device pixel after it, as a browser rounds a
  // half up; but Chromium reports boxes at single precision, so at a ratio of
  // 2.2 the reading came back a hair below the half (553.4999845 for 553.5),
  // the 0" was rounded down, and it was painted a device pixel before the
  // sheet's edge (scripts/ruler-paint-check.mjs, chromium@2.2: 3 of 30
  // layouts). A reading within 1/128 of a device pixel of a half rounds up.
  it.each([[2.2, 'top'], [2.2, 'left'], [1.1, 'top'], [0.9, 'left']] as const)('at a ratio of %s, a sheet at exactly half a device pixel on the %s ruler\'s axis, read back at single precision, has its 0" on the device pixel after the half', async (ratio, axis) => {
    const dpr = Math.fround(ratio);
    vi.stubGlobal('devicePixelRatio', dpr);
    const { layout, top, left } = await open({ width: 1000, height: 800, float32: true });
    for (let i = 0; i < 4; i += 1) await click(screen.getByRole('button', { name: 'Zoom in' }), 'Zoom in');
    const vertical = axis === 'left';
    const pad = vertical ? workareaPadding().top : workareaPadding().left;
    expect(vertical ? layout.sheet().height : layout.sheet().width, 'precondition: the sheet is larger than the canvas, so it scrolls').toBeGreaterThan(vertical ? 800 : 1000);
    // Scrolled so that the sheet's edge is at k + 0.5 device px, for the
    // first k whose single-precision reading lands below the half (the case
    // the browser showed), the edge between the bar and the padding's end.
    const o = canvas();
    const edge = () => Math.fround(vertical ? layout.sheet().top : layout.sheet().left);
    const last = Math.floor(pad * dpr) - 1;
    let k = Math.ceil(30 * dpr);
    for (; k <= last; k += 1) {
      const scroll = pad - (k + 0.5) / dpr;
      if (vertical) o.scrollTop = scroll; else o.scrollLeft = scroll;
      const d = edge() * dpr;
      if (d < k + 0.5 && d > k + 0.5 - 1e-3) break;
    }
    expect(k, 'precondition: a half read back a hair below it').toBeLessThanOrEqual(last);
    fireEvent.scroll(o);
    await nextTask();
    const zero = (vertical ? left : top).markOnScreen(0)! * dpr;
    expect(Math.abs(zero - Math.round(zero)), `the 0" at ${zero} device px is on the device grid`).toBeLessThan(1e-3);
    expect(Math.round(zero), `the sheet's edge at ${k} + 0.5 device px (read as ${edge() * dpr})`).toBe(k + 1);
  });

  // The follow-up review, R2P-F1: the ratio changes with nothing resizing or
  // scrolling (the window moved to a display of another density), and the
  // layers stayed on the old grid, a whole ruler smeared (main's ticks,
  // placed by layout, stayed crisp).
  it.each([[2, 1, 802], [1.5, 2, 801], [1.25, 1, 801]])('a device pixel ratio that changes from %s to %s with nothing resizing puts the marks on the new grid (a box %s px high)', async (from, to, height) => {
    // Only a query on the resolution matches, and only its listeners hear the
    // change: the editor's other queries (the phone layout) keep jsdom's answer.
    const listeners = new Set<(e: { matches: boolean; media: string }) => void>();
    vi.stubGlobal('matchMedia', (query: string) => {
      const ours = /resolution/.test(query);
      return {
        matches: ours, media: query, onchange: null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: (_type: string, fn: (e: { matches: boolean; media: string }) => void) => { if (ours) listeners.add(fn); },
        removeEventListener: (_type: string, fn: (e: { matches: boolean; media: string }) => void) => { listeners.delete(fn); },
        dispatchEvent: () => false,
      };
    });
    vi.stubGlobal('devicePixelRatio', from);
    await open({ width: 1001, height });
    expect(Math.max(...offGrid(to)), 'precondition: a layer placed for the old ratio is off the new grid').toBeGreaterThan(0.1);
    vi.stubGlobal('devicePixelRatio', to);
    act(() => { for (const fn of [...listeners]) fn({ matches: false, media: '' }); });
    expect(offGrid(to).every((d) => d < 1e-6), `the layers' offsets × ${to}: ${layers().map(([l, v]) => offsetOf(l, v) * to).join(', ')}`).toBe(true);
  });
});

describe('B — a resize that leaves the zoom unchanged', () => {
  // A 10 × 10 in poster: the fit is capped at 5× in either canvas, so the
  // zoom does not change when the canvas grows, and nothing re-renders.
  const small = { w: 10, h: 10 };

  it('the marks stay on the sheet and run the whole length of each bar', async () => {
    const box = { width: 1000, height: 800 };
    const { layout, perInch, top, left } = await open(box, small);
    const zoom = zoomNow();
    expect(zoom, 'precondition: the fit is capped').toBe(5);
    Object.assign(box, { width: 1440, height: 1080 });
    await act(async () => {
      FiringResizeObserver.resized(canvas());
      fireEvent(window, new Event('resize'));
      await nextTask();
    });
    expect(zoomNow(), 'precondition: the zoom did not change').toBe(zoom);
    expect(top.markOnScreen(0)).toBeCloseTo(layout.sheet().left, 1);
    expect(left.markOnScreen(0)).toBeCloseTo(layout.sheet().top, 1);
    for (const r of [top, left]) {
      const { lastMark, barEnd } = r.far();
      expect(barEnd - lastMark, 'no stretch of the bar without a mark').toBeLessThanOrEqual(perInch);
    }
  });

  it('after a new poster height at a width-limited fit, the marks move to the re-centred sheet', async () => {
    // 48 × 36 in a 1000 × 800 canvas is fitted by its width; at 48 × 30 the
    // fit is the same, so only the sheet's frame resizes: the sheet moves
    // down, and nothing else the rulers are told about changes.
    const box = { width: 1000, height: 800 };
    const { layout, left } = await open(box);
    const zoom = zoomNow();
    openTab(/layout/i);
    await typeKeystrokes(heightField(), ['3', '30']);
    await pressEnter(heightField());
    const ask = dialog(/Change poster to 48 × 30 in/);
    expect(ask, 'precondition: the size change asks first').not.toBeNull();
    await click(confirmButton(ask!), 'confirm');
    expect(zoomNow(), 'precondition: the fit did not change').toBe(zoom);
    await act(async () => {
      FiringResizeObserver.resized(frame());
      await nextTask();
    });
    // Within half a pixel: the re-centred sheet sits at a half pixel, and the
    // marks go on whole device pixels (the second step 10 review, R3-F1).
    expect(Math.abs(left.markOnScreen(0)! - layout.sheet().top)).toBeLessThanOrEqual(0.5);
  });

});

describe('C — a reading is on the rulers before the frame is painted', () => {
  // A 10 × 10 in poster, as in B: the fit is capped at 5×, so a resize
  // changes nothing but the sheet's place.
  const small = { w: 10, h: 10 };

  it('a canvas resize is on the rulers when the resize observer returns', async () => {
    const box = { width: 1000, height: 800 };
    const { layout, top } = await open(box, small);
    Object.assign(box, { width: 1440 });
    // Outside act(): what the page has when the observer returns is what the browser paints.
    FiringResizeObserver.resized(canvas());
    expect(top.markOnScreen(0)).toBeCloseTo(layout.sheet().left, 1);
    await act(async () => { await nextTask(); });
  });

  it('a scroll is on the rulers when the scroll event returns', async () => {
    const box = { width: 1000, height: 800 };
    const { layout, top } = await open(box);
    for (let i = 0; i < 4; i += 1) await click(screen.getByRole('button', { name: 'Zoom in' }), 'Zoom in');
    const perInch = PX * zoomNow();
    const o = canvas();
    o.scrollLeft = 100;
    // Outside act(), as a browser dispatches it before painting.
    o.dispatchEvent(new Event('scroll'));
    expect(top.markOnScreen(10)).toBeCloseTo(layout.sheet().left + 10 * perInch, 1);
    await act(async () => { await nextTask(); });
  });

  // The rulers render marks across the scrollable content and a margin past
  // the bars, and choose them again when the content changes or a scroll
  // leaves them.
  it('after a scroll longer than a bar, and a zoom out, the marks still cover the bar', async () => {
    const box = { width: 1000, height: 800 };
    const { layout, top } = await open(box);
    for (let i = 0; i < 8; i += 1) await click(screen.getByRole('button', { name: 'Zoom in' }), 'Zoom in');
    const o = canvas();
    const check = (what: string) => {
      const perInch = PX * zoomNow();
      const sheetLeft = layout.sheet().left;
      // The first labelled inch (every fifth) on the bar, and the bar's far end.
      const first = Math.ceil((24 - sheetLeft) / perInch / 5) * 5;
      expect(top.markOnScreen(first), `${what}: inch ${first}`).toBeCloseTo(sheetLeft + first * perInch, 1);
      const { lastMark, barEnd } = top.far();
      expect(barEnd - lastMark, `${what}: marks reach the bar's end`).toBeLessThanOrEqual(perInch);
    };
    o.scrollLeft = 2.5 * box.width;
    await act(async () => { o.dispatchEvent(new Event('scroll')); await nextTask(); });
    check('a scroll of 2.5 bars');
    for (let i = 0; i < 8; i += 1) await click(screen.getByRole('button', { name: 'Zoom out' }), 'Zoom out');
    await act(async () => { await nextTask(); });
    check('eight steps out');
  });

  // Preview hides the editor (display: none) and the rulers stay mounted:
  // their bars have no size, and a reading taken then, adopted, left the
  // rulers blank for a frame or two on the way back when the sheet's 0" was
  // off the bars (zoomed in and scrolled; ruler-check --frames).
  it('back from a hidden editor, zoomed in and scrolled, the marks are on the bars when the observer returns', async () => {
    const box: { width: number; height: number; hidden?: boolean } = { width: 1000, height: 800 };
    const { layout, top } = await open(box);
    for (let i = 0; i < 6; i += 1) await click(screen.getByRole('button', { name: 'Zoom in' }), 'Zoom in');
    const o = canvas();
    o.scrollLeft = 900;
    await act(async () => { o.dispatchEvent(new Event('scroll')); await nextTask(); });
    // Hidden: everything measures 0.
    Object.assign(box, { hidden: true });
    await act(async () => { FiringResizeObserver.resized(canvas()); await nextTask(); });
    // An update of the editor is waiting (its scroll listener ran) when the
    // editor is shown again; outside act(), as a browser paints after the
    // observer. Adopting the hidden reading made the rulers render at once
    // on the way back, and that render took the editor's with it.
    canvas().dispatchEvent(new Event('scroll'));
    Object.assign(box, { hidden: false });
    const before = editorRenders.n;
    FiringResizeObserver.resized(canvas());
    expect(editorRenders.n - before, 'editor renders inside the observer').toBe(0);
    const perInch = PX * zoomNow();
    const sheetLeft = layout.sheet().left;
    const first = Math.ceil((24 - sheetLeft) / perInch / 5) * 5;
    expect(sheetLeft, 'precondition: the sheet\'s 0" is off the bar').toBeLessThan(24);
    expect(top.markOnScreen(first), `inch ${first}`).toBeCloseTo(sheetLeft + first * perInch, 1);
    await act(async () => { await nextTask(); });
  });

  // The step 9-D review, D-03: marks a bar's length past each end made the
  // rulers three times main's marks at the zoom floor, and each zoom or pinch
  // step there rendered them all.
  it('at the zoom floor, the marks off the bars are at most one and a half times those on them', async () => {
    const box = { width: 1000, height: 800 };
    const { top } = await open(box);
    // Found once: a role query walks the whole editor, and twenty of them
    // took this test near the 5 s timeout under load (the follow-up review,
    // R3G-06; the same cause as main's 60ca7b3).
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
    for (let i = 0; i < 20; i += 1) await click(zoomOut, 'Zoom out');
    await act(async () => { await nextTask(); });
    const b = top.bar!.getBoundingClientRect();
    const marks = [...(top.bar!.querySelector('span')!.parentElement!.parentElement!.children)] as HTMLElement[];
    const perInch = PX * zoomNow();
    const onBar = Math.floor(b.width / perInch) + 1;
    expect(marks.length - onBar).toBeLessThanOrEqual(1.5 * onBar);
  });

  // The step 9-D review, D-01: a canvas that grows by more than the marks'
  // margin at an unchanged zoom left the far ends of the bars without marks
  // for a frame or two, until the rulers rendered at ordinary priority.
  it('a canvas that grows far at an unchanged zoom has marks to the far ends of its bars when the observer returns', async () => {
    const box = { width: 1000, height: 800 };
    const { top, left } = await open(box, small);
    const zoom = zoomNow();
    // More than twice the bars' length at once (a window resized on a large screen).
    Object.assign(box, { width: 5000, height: 4000 });
    FiringResizeObserver.resized(canvas());
    expect(zoomNow(), 'precondition: the zoom did not change').toBe(zoom);
    const perInch = PX * zoom;
    for (const r of [top, left]) {
      const { lastMark, barEnd } = r.far();
      expect(barEnd - lastMark, 'no stretch at the far end without a mark').toBeLessThanOrEqual(perInch);
      // The sheet re-centres far past where its marks began (the second step
      // 10 review, R1-F5: nothing tested the bars' start end).
      const { firstMark, barStart } = r.near();
      expect(firstMark - barStart, 'no stretch at the start without a mark').toBeLessThanOrEqual(perInch);
    }
    await act(async () => { await nextTask(); });
  });

  it('a canvas that grows far in height alone has marks to both ends of the left ruler when the observer returns', async () => {
    // The second step 10 review, R1-F5: with both bars growing, the top ruler alone
    // sent the marks to be chosen again, so the left ruler's check was
    // never needed by any test.
    const box = { width: 1000, height: 800 };
    const { left } = await open(box, small);
    const zoom = zoomNow();
    Object.assign(box, { height: 4000 });
    FiringResizeObserver.resized(canvas());
    expect(zoomNow(), 'precondition: the zoom did not change').toBe(zoom);
    const perInch = PX * zoom;
    const { lastMark, barEnd } = left.far();
    expect(barEnd - lastMark, 'no stretch at the far end without a mark').toBeLessThanOrEqual(perInch);
    const { firstMark, barStart } = left.near();
    expect(firstMark - barStart, 'no stretch at the start without a mark').toBeLessThanOrEqual(perInch);
    await act(async () => { await nextTask(); });
  });

  // The follow-up review, R1G-F3: the test above leaves both ends of the left
  // bar past the marks at once, so neither half of the left ruler's check was
  // needed on its own. A new poster height at an unchanged, capped zoom in a
  // tall canvas moves the sheet by more than the marks' margin while the bar
  // stays put: taller leaves only the bar's far end without marks, shorter
  // only its start.
  it.each([
    ['taller, only the far end', 10, '4', '40'],
    ['shorter, only the start', 40, '1', '10'],
  ])('a new poster height, %s left uncovered, has marks to both ends of the left ruler when the frame\'s observer returns', async (_which, h0, k1, k2) => {
    const { left } = await open({ width: 1000, height: 4000 }, { w: 10, h: h0 });
    const zoom = zoomNow();
    openTab(/layout/i);
    await typeKeystrokes(heightField(), [k1, k2]);
    await pressEnter(heightField());
    const ask = dialog(new RegExp(`Change poster to 10 × ${k2} in`));
    expect(ask, 'precondition: the size change asks first').not.toBeNull();
    await click(confirmButton(ask!), 'confirm');
    expect(zoomNow(), 'precondition: the zoom did not change').toBe(zoom);
    // Outside act(): what the page has when the frame's observer returns.
    FiringResizeObserver.resized(frame());
    const perInch = PX * zoom;
    const { lastMark, barEnd } = left.far();
    expect(barEnd - lastMark, 'no stretch at the far end without a mark').toBeLessThanOrEqual(perInch);
    const { firstMark, barStart } = left.near();
    expect(firstMark - barStart, 'no stretch at the start without a mark').toBeLessThanOrEqual(perInch);
    await act(async () => { await nextTask(); });
  });

  // The step 9 review of cause C, S9C-02: the rulers put their reading on the
  // page by flushing their own state synchronously, and React's flush also
  // rendered any update of the editor already waiting, inside the event. The
  // editor's own scroll listener queues one when it runs before the rulers',
  // as it does once the rulers are hidden and shown again: every scroll then
  // rendered the whole editor before the browser could paint (and a size
  // change's refit, inside the resize observer).
  it('a scroll renders none of the editor inside the event, after the rulers are hidden and shown', async () => {
    const box = { width: 1000, height: 800 };
    const { layout, top } = await open(box);
    openTab(/layout/i);
    // By its label: a role query over the whole editor ran past its time
    // limit when the full suite ran in parallel.
    const rulerBox = () => [...document.querySelectorAll('label')]
      .find((l) => l.textContent?.trim() === 'Show ruler')?.querySelector('input') as HTMLInputElement;
    expect(rulerBox(), 'precondition: the Layout tab offers Show ruler').toBeTruthy();
    await click(rulerBox(), 'hide the rulers');
    await click(rulerBox(), 'show the rulers');
    // Zoomed in after the rulers came back: the content they reach across
    // grows, and the marks must be chosen for it before a long scroll.
    for (let i = 0; i < 12; i += 1) await click(screen.getByRole('button', { name: 'Zoom in' }), 'Zoom in');
    await act(async () => { await nextTask(); });
    const perInch = PX * zoomNow();
    const o = canvas();
    // Two small steps, then to the end of the content: past the marks' margin.
    const toEnd = o.scrollWidth - o.clientWidth - 60;
    expect(toEnd, 'precondition: the last scroll is longer than the margin').toBeGreaterThan(600);
    const inside: number[] = [];
    for (const step of [30, 30, toEnd]) {
      const before = editorRenders.n;
      o.scrollLeft += step;
      o.dispatchEvent(new Event('scroll'));
      inside.push(editorRenders.n - before);
      expect(ruler(false).markOnScreen(10), 'the rulers still follow').toBeCloseTo(layout.sheet().left + 10 * perInch, 1);
      await act(async () => { await nextTask(); });
    }
    expect(inside, 'editor renders inside each scroll event').toEqual([0, 0, 0]);
    expect(top.bar).not.toBeNull();
  });

  // The step 9-E review, E-01: with scrollbars that take space, the bars run
  // over them, past the content's client box; the marks' reach was measured
  // from the client box, so every scroll to the far end took the rulers'
  // synchronous path and rendered the editor inside the scroll event.
  it('with scrollbars that take space, a scroll to the far end renders none of the editor inside the event', async () => {
    const box = { width: 1000, height: 800, scrollbar: 10 };
    const { layout } = await open(box);
    openTab(/layout/i);
    const rulerBox = () => [...document.querySelectorAll('label')]
      .find((l) => l.textContent?.trim() === 'Show ruler')?.querySelector('input') as HTMLInputElement;
    await click(rulerBox(), 'hide the rulers');
    await click(rulerBox(), 'show the rulers');
    for (let i = 0; i < 12; i += 1) await click(screen.getByRole('button', { name: 'Zoom in' }), 'Zoom in');
    await act(async () => { await nextTask(); });
    const perInch = PX * zoomNow();
    const o = canvas();
    const inside: number[] = [];
    for (const [x, y] of [[30, 0], [o.scrollWidth - o.clientWidth, o.scrollHeight - o.clientHeight]]) {
      const before = editorRenders.n;
      o.scrollLeft = x!;
      o.scrollTop = y!;
      o.dispatchEvent(new Event('scroll'));
      inside.push(editorRenders.n - before);
      expect(ruler(false).markOnScreen(10) ?? layout.sheet().left + 10 * perInch, 'the rulers still follow')
        .toBeCloseTo(layout.sheet().left + 10 * perInch, 1);
      await act(async () => { await nextTask(); });
    }
    expect(inside, 'editor renders inside each scroll event').toEqual([0, 0]);
    for (const r of [ruler(false), ruler(true)]) {
      const { lastMark, barEnd } = r.far();
      expect(barEnd - lastMark, 'the far end of each bar has its marks').toBeLessThanOrEqual(perInch);
    }
  });

  // The step 9-F review, F-03: zoomed in, the canvas's content is wider
  // than its box, and hiding the sidebar makes the box wider than the
  // content, which then centres: the bars' ends move past it by more than
  // 300 px in one step (a margin of 300 took the synchronous path on every
  // such input in the browser; 600 on none).
  it.each([['the middle', 0.5], ['the far end', 1]])(
    'zoomed in and scrolled to %s, a canvas widened by the sidebar\'s width renders nothing inside the observer',
    async (_where, at) => {
      const box = { width: 1000, height: 800 };
      const { top } = await open(box);
      for (let i = 0; i < 6; i += 1) await click(screen.getByRole('button', { name: 'Zoom in' }), 'Zoom in');
      await act(async () => { await nextTask(); });
      const o = canvas();
      o.scrollLeft = (o.scrollWidth - o.clientWidth) * at;
      o.dispatchEvent(new Event('scroll'));
      await act(async () => { await nextTask(); });
      const marks = () => [...top.bar!.querySelectorAll('span')].map((sp) => sp.textContent).join(',');
      const before = marks();
      Object.assign(box, { width: 1000 + 484 });
      o.scrollLeft = Math.min(o.scrollLeft, o.scrollWidth - o.clientWidth);
      FiringResizeObserver.resized(canvas());
      expect(marks(), 'no render inside the observer').toBe(before);
      await act(async () => { await nextTask(); });
    },
  );

  // The step 9-F review, F-01: with scrollbars that take space, WebKit laid
  // the workarea out narrower for a frame while a scrollbar came and went,
  // then moved the centred sheet back without resizing the canvas or the
  // sheet's frame: no observer the rulers had fired, and they stayed 5 px off.
  it('a sheet moved by the workarea alone is followed when the workarea\'s observer returns', async () => {
    const box: { width: number; height: number; workareaShrink?: number } = { width: 1000, height: 800 };
    const { layout } = await open(box);
    // Below the fit, the sheet is centred in the workarea.
    for (let i = 0; i < 3; i += 1) await click(screen.getByRole('button', { name: 'Zoom out' }), 'Zoom out');
    await act(async () => { await nextTask(); });
    const perInch = PX * zoomNow();
    const at = layout.sheet().left;
    Object.assign(box, { workareaShrink: 10 });
    expect(layout.sheet().left, 'precondition: the narrower workarea moves the sheet').toBeCloseTo(at - 5, 1);
    FiringResizeObserver.resized(canvas());
    await act(async () => { await nextTask(); });
    Object.assign(box, { workareaShrink: 0 });
    FiringResizeObserver.resized(q<HTMLElement>('[data-postr-canvas-workarea]'));
    expect(ruler(false).markOnScreen(10), 'the top ruler\'s 10" mark').toBeCloseTo(layout.sheet().left + 10 * perInch, 1);
    await act(async () => { await nextTask(); });
  });

  // The second step 10 review, R1-F5: a canvas that grows moves the sheet and the
  // bars' far ends together, so the far-end check alone sent the marks to be
  // chosen again. Here the workarea moves the sheet far, and only the bars'
  // start is left without marks.
  it('a sheet the workarea moves far to the right has marks back to the bars\' start when its observer returns', async () => {
    const box: { width: number; height: number; workareaShrink?: number } = { width: 1000, height: 800 };
    const { layout } = await open(box, { w: 10, h: 10 });
    const perInch = PX * zoomNow();
    const at = layout.sheet().left;
    Object.assign(box, { workareaShrink: -3000 });
    expect(layout.sheet().left - at, 'precondition: the sheet moves past the marks\' margin').toBeGreaterThan(1200);
    FiringResizeObserver.resized(q<HTMLElement>('[data-postr-canvas-workarea]'));
    const { firstMark, barStart } = ruler(false).near();
    expect(firstMark - barStart, 'no stretch at the start without a mark').toBeLessThanOrEqual(perInch);
    await act(async () => { await nextTask(); });
  });

  // The step 9-E review, E-04: the marks' margin had a bound from above
  // only. Below the zoom that fits, the content is the canvas's own box, and
  // hiding the sidebar (484 px) or closing the guides panel moves the far
  // end of the bars past it: covered by the margin, the marks follow at
  // ordinary priority, with no render inside the resize observer.
  it('below the fit, a canvas widened by the sidebar\'s width keeps its marks and renders nothing inside the observer', async () => {
    const box = { width: 1000, height: 800 };
    const { top } = await open(box);
    for (let i = 0; i < 3; i += 1) await click(screen.getByRole('button', { name: 'Zoom out' }), 'Zoom out');
    await act(async () => { await nextTask(); });
    const marks = () => [...top.bar!.querySelectorAll('span')].map((sp) => sp.textContent).join(',');
    const before = marks();
    Object.assign(box, { width: 1000 + 484 });
    FiringResizeObserver.resized(canvas());
    expect(marks(), 'no render inside the observer').toBe(before);
    const { lastMark, barEnd } = ruler(false).far();
    expect(barEnd - lastMark, 'the widened bar has its marks').toBeLessThanOrEqual(PX * zoomNow());
    await act(async () => { await nextTask(); });
  });
});
