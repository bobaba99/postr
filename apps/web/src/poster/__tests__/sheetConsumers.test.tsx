/**
 * Fix 02, cause A — every part of the editor that draws or measures the
 * sheet uses the poster's own size. sheetSize.test.tsx covers the canvas,
 * menu, templates, Auto-Arrange, placement, ISSUES and zoom; this file covers
 * the rest: the preview's sheet, the grid, the frame, the drag guides' centre
 * and area comments. Each test uses a 30×40 poster, so a 48×36 sheet at any
 * one of these sites shows up as a wrong number.
 *
 * jsdom has no PointerEvent and no setPointerCapture; both are polyfilled
 * as inert scaffolding, and the app's own handlers do the work.
 *
 * The figure-size check and the overflow growth were first documented as
 * untestable in jsdom; the cause-A re-check showed they are not.
 *
 * Re-run: npx vitest run src/poster/__tests__/sheetConsumers.test.tsx --reporter=verbose
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
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

import { NoopResizeObserver, click, findButton, load, makeDoc, nextTask, openTab, q, renderEditor } from './editorKit';

class InertPointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  vi.stubGlobal('PointerEvent', InertPointerEvent);
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.setPointerCapture = () => {};
  proto.releasePointerCapture = () => {};
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('A — the rest of the editor uses the poster\'s own sheet (30×40 = 300×400 units)', () => {
  it('the preview draws the sheet at 300×400', async () => {
    load(makeDoc(30, 40));
    renderEditor();
    openTab(/export/i);
    await click(findButton('Preview poster'), 'preview');
    // The preview's sheet is the scaled box that is not the editor's canvas.
    const sheet = Array.from(document.querySelectorAll<HTMLElement>('div')).find(
      (d) => d.id !== 'poster-canvas' && d.style.transformOrigin === 'top left' && d.style.transform.startsWith('scale('),
    );
    expect(sheet, 'the preview sheet').toBeDefined();
    expect([sheet!.style.width, sheet!.style.height]).toEqual(['300px', '400px']);
  });

  it('the grid covers 300×400', () => {
    load(makeDoc(30, 40));
    renderEditor();
    const grid = q<SVGSVGElement>('svg[data-postr-overlay="grid"]');
    expect([grid.getAttribute('width'), grid.getAttribute('height')]).toEqual(['300', '400']);
  });

  it('the frame around the sheet is 300×400 at zoom 1', () => {
    load(makeDoc(30, 40));
    renderEditor();
    // jsdom measures nothing, so the fit falls back to zoom 1.
    expect(q<HTMLElement>('#poster-canvas').style.transform).toBe('scale(1)');
    const frame = q<HTMLElement>('[data-postr-canvas-frame]');
    expect([frame.style.width, frame.style.height]).toEqual(['300px', '400px']);
  });

  it('dragging a block to the middle of the sheet lights the centre guide at x = 150', async () => {
    const d = makeDoc(30, 40);
    const base = d.blocks[2]!;
    // One 100-wide block at x 20; its centre reaches 150 after a drag of 80.
    load({ ...d, blocks: [{ ...base, id: 'b1', x: 20, y: 250, w: 100, h: 40 }] } as PosterDoc);
    renderEditor();
    fireEvent.pointerDown(q('[data-block-id="b1"]'), { clientX: 100, clientY: 300, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 140, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 180, clientY: 300, pointerId: 1 });
    await nextTask();
    // The centre accent is the bright (1.2) guide line.
    const accents = Array.from(document.querySelectorAll('line'))
      .filter((l) => l.getAttribute('stroke-width') === '1.2')
      .map((l) => [l.getAttribute('x1'), l.getAttribute('y1'), l.getAttribute('x2'), l.getAttribute('y2')].join(','));
    fireEvent.pointerUp(window, { clientX: 180, clientY: 300, pointerId: 1 });
    expect(accents, 'bright guide lines while dragging').toContain('150,0,150,400');
  });

  it('an area comment dragged over the sheet is stored in the poster\'s inches', async () => {
    load(makeDoc(30, 40));
    renderEditor();
    openTab(/comment/i);
    await nextTask();
    await click(q('button[aria-pressed]'), 'area comment mode');
    const overlay = q<HTMLElement>('[data-postr-overlay="area-comment"]');
    expect(overlay, 'the area-comment overlay').not.toBeNull();
    // What a browser reports for the overlay: the whole 300×400 sheet at zoom 1.
    const real = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.getAttribute('data-postr-overlay') === 'area-comment') {
        return { width: 300, height: 400, top: 0, left: 0, right: 300, bottom: 400, x: 0, y: 0, toJSON() {} } as DOMRect;
      }
      return real.call(this);
    });
    const rects: number[][] = [];
    const onArea = (e: Event) => rects.push((e as CustomEvent<{ rect: number[] }>).detail.rect);
    window.addEventListener('postr:comment-area', onArea);
    fireEvent.pointerDown(overlay, { clientX: 30, clientY: 40, button: 0, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 150, clientY: 200, pointerId: 1 });
    await nextTask();
    fireEvent.pointerUp(overlay, { clientX: 150, clientY: 200, pointerId: 1 });
    await nextTask();
    window.removeEventListener('postr:comment-area', onArea);
    // Dragged from (30,40) to (150,200) units on a 300×400 sheet: 3 in, 4 in, 12 in wide, 16 in tall.
    expect(rects.map((r) => r.map((v) => +v.toFixed(3)))).toEqual([[3, 4, 12, 16]]);
  });
});

describe('A — the vertical centre, the figure-size check and the overflow', () => {
  it('dragging a block to the vertical middle lights the centre guide at y = 200', async () => {
    const d = makeDoc(30, 40);
    const base = d.blocks[2]!;
    // One 40-tall block at y 20; its centre reaches 200 after a drag of 160.
    load({ ...d, blocks: [{ ...base, id: 'b1', x: 20, y: 20, w: 60, h: 40 }] } as PosterDoc);
    renderEditor();
    fireEvent.pointerDown(q('[data-block-id="b1"]'), { clientX: 50, clientY: 40, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 50, clientY: 120, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 50, clientY: 200, pointerId: 1 });
    await nextTask();
    const accents = Array.from(document.querySelectorAll('line'))
      .filter((l) => l.getAttribute('stroke-width') === '1.2')
      .map((l) => [l.getAttribute('x1'), l.getAttribute('y1'), l.getAttribute('x2'), l.getAttribute('y2')].join(','));
    fireEvent.pointerUp(window, { clientX: 50, clientY: 200, pointerId: 1 });
    expect(accents, 'bright guide lines while dragging').toContain('0,200,300,200');
  });

  it("the figure-size check rectangle stays on a 30×40 sheet when dragged and resized", async () => {
    load(makeDoc(30, 40));
    renderEditor();
    openTab(/figure/i);
    await nextTask();
    await click(findButton('Check a figure'), 'Check a figure');
    const rect = () => q<HTMLElement>('[data-postr-figure-size-overlay]');
    const box = () => ['left', 'top', 'width', 'height'].map((k) => parseFloat(rect().style[k as 'left']));
    expect(rect(), 'the check rectangle').not.toBeNull();
    const [, , w0, h0] = box();
    // Drag far past the bottom-right corner: it stops at the sheet's edge.
    fireEvent.pointerDown(rect(), { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
    fireEvent.pointerMove(rect(), { clientX: 5100, clientY: 5100, pointerId: 1 });
    fireEvent.pointerUp(rect(), { clientX: 5100, clientY: 5100, pointerId: 1 });
    await nextTask();
    const [x1, y1] = box();
    expect([x1, y1], 'dragged into the bottom-right corner of 300 × 400').toEqual([300 - w0!, 400 - h0!]);
    // Back to the top-left, then pull the resize handle far out: it fills the sheet.
    fireEvent.pointerDown(rect(), { clientX: 5100, clientY: 5100, button: 0, pointerId: 1 });
    fireEvent.pointerMove(rect(), { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(rect(), { clientX: 0, clientY: 0, pointerId: 1 });
    await nextTask();
    const handle = rect().lastElementChild as HTMLElement;
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, button: 0, pointerId: 2 });
    fireEvent.pointerMove(rect(), { clientX: 5000, clientY: 5000, pointerId: 2 });
    fireEvent.pointerUp(rect(), { clientX: 5000, clientY: 5000, pointerId: 2 });
    await nextTask();
    expect(box(), 'resized to the whole sheet').toEqual([0, 0, 300, 400]);
  });

  it('the frame grows by the text that overflows past the sheet\'s own height', () => {
    // What a browser reports for #poster-canvas: painted 40 units taller than declared.
    class ReportsOverflow {
      constructor(private cb: ResizeObserverCallback) {}
      observe(el: Element) {
        const declared = parseFloat((el as HTMLElement).style.height) || 0;
        this.cb(
          [{ target: el, borderBoxSize: [{ blockSize: declared + 40, inlineSize: 0 }] } as unknown as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ReportsOverflow);
    load(makeDoc(30, 40));
    renderEditor();
    expect(q<HTMLElement>('[data-postr-canvas-frame]').style.height).toBe('440px');
  });
});
