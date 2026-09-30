/**
 * Fix 02, cause A — an area comment dragged over the sheet is stored in the
 * poster's own inches (moved here from sheetConsumers.test.tsx by fix 23).
 *
 * Comments are deactivated with sharing (config/features.ts, fix 23) but
 * kept on disk, so this file, and only this file, turns the switch on: the
 * rest of the editor's tests run the configuration that ships.
 *
 * Re-run: npx vitest run src/poster/__tests__/areaCommentSheet.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';

vi.mock('@/config/features', async (orig) => ({
  ...(await orig<typeof import('@/config/features')>()),
  SHARING_ENABLED: true,
}));
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

import { NoopResizeObserver, click, load, makeDoc, nextTask, openTab, q, renderEditor } from './editorKit';

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

describe('A — area comments use the poster\'s own sheet (30×40 = 300×400 units)', () => {
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
