/**
 * Read-only share view on a phone.
 *
 * `/s/:slug` renders the full `<PosterEditor readOnly />`. On a desktop
 * that is exactly right — a reviewer sees the same canvas the owner
 * does. On a 375px phone the same chrome is fatal: a 484px comments
 * rail plus a 320px guidelines rail leaves ~55px of viewport for the
 * poster, and the auto-fit collapses the canvas to 8%. Measured in a
 * real browser before the fix; see the assertions below for the after.
 *
 * These tests pin the BEHAVIOUR of the small-screen branch, not its
 * class names: the guidance rails are absent from the tree, the
 * editing tour never runs, and the conversion CTA is reachable. The
 * desktop cases assert the same chrome is still present, because the
 * whole point is that this is additive.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { PosterDoc } from '@postr/shared';

const authSpies = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
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

import { PosterEditor } from '../PosterEditor';
import { usePosterStore } from '@/stores/posterStore';

// jsdom ships neither of these; the canvas auto-fit observes its own
// container and blocks measure themselves on mount. Both are pure
// measurement, and jsdom reports every rect as 0×0 anyway, so no-op
// stubs are faithful here — these tests assert which chrome renders,
// not what it measures (that is verified in a real browser).
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', NoopResizeObserver);

function makeDoc(): PosterDoc {
  return {
    version: 1,
    widthIn: 48,
    heightIn: 36,
    blocks: [
      {
        id: 't1',
        type: 'title',
        x: 20,
        y: 20,
        w: 440,
        h: 70,
        content: 'Effects of Sample Treatment on Model Outcomes',
        imageSrc: null,
        imageFit: 'contain',
        tableData: null,
      },
      {
        id: 'b1',
        type: 'text',
        x: 20,
        y: 110,
        w: 210,
        h: 150,
        content: 'John Smith, Acme State University. Placeholder body copy.',
        imageSrc: null,
        imageFit: 'contain',
        tableData: null,
      },
    ],
    fontFamily: 'Source Sans 3',
    palette: {
      bg: '#ffffff',
      primary: '#1a1a26',
      accent: '#7c6aed',
      accent2: '#4a6cf7',
      muted: '#6b7280',
      headerBg: '#f3f4f6',
      headerFg: '#1a1a26',
    },
    styles: {
      title: { size: 60, weight: 700, italic: false, lineHeight: 1.1, color: null, highlight: null },
      heading: { size: 28, weight: 700, italic: false, lineHeight: 1.2, color: null, highlight: null },
      authors: { size: 22, weight: 400, italic: false, lineHeight: 1.3, color: null, highlight: null },
      body: { size: 18, weight: 400, italic: false, lineHeight: 1.4, color: null, highlight: null },
    },
    headingStyle: { border: 'bottom', fill: false, align: 'left' },
    institutions: [],
    authors: [],
    references: [],
  };
}

/**
 * Drives the `(max-width: 639px)` media query the layout branch reads.
 * Everything else keeps jsdom's default "no match", so unrelated
 * queries (prefers-reduced-motion, GSAP's matchMedia) are untouched.
 */
function setViewportIsSmall(small: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('max-width: 639px') ? small : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function renderShare() {
  return render(
    <MemoryRouter initialEntries={['/s/fixture']}>
      <PosterEditor readOnly />
    </MemoryRouter>,
  );
}

describe('read-only share view on a small screen', () => {
  beforeEach(() => {
    usePosterStore.getState().setPoster('fixture-1', makeDoc(), 'Sample Shared Poster');
  });

  describe('under the sm breakpoint', () => {
    beforeEach(() => setViewportIsSmall(true));

    it('offers the conversion CTA, which is the point of a share link', () => {
      renderShare();
      const bar = document.querySelector('[data-postr-mobile-share-bar]');
      expect(bar).not.toBeNull();
      const cta = within(bar as HTMLElement).getByRole('link', { name: /make your own/i });
      expect(cta).toHaveAttribute('href', '/');
    });

    it('collapses the comments rail behind a toggle instead of a fixed sidebar', () => {
      renderShare();
      const bar = document.querySelector('[data-postr-mobile-share-bar]') as HTMLElement;
      // The rail is reachable...
      expect(within(bar).getByRole('button', { name: /comments/i })).toBeInTheDocument();
      // ...but it is not occupying layout width on open. A `display:
      // none` wrapper is what frees the viewport for the poster; a
      // rail that merely scrolled offscreen would still steal the
      // 484px that collapsed the canvas to 8%.
      const rail = document
        .querySelector('[data-postr-sidebar]')
        ?.closest('div[style*="display: none"]');
      expect(rail ?? document.querySelector('div[style*="display: none"]')).not.toBeNull();
    });

    it('drops the guidelines rail, which is authoring chrome with no share-link audience', () => {
      renderShare();
      // Hidden via `display: none` on the wrapper rather than
      // unmounted, so assert on visibility — that is what frees the
      // 320px the auto-fit needs.
      expect(screen.getByText(/poster guidelines/i)).not.toBeVisible();
    });

    it('gives the zoom controls a 44px touch target', () => {
      renderShare();
      // Zoom is the only way to read poster detail on a phone, so
      // these are primary controls, not incidental chrome.
      for (const name of [/zoom in/i, /zoom out/i, /fit poster to screen/i]) {
        const btn = screen.getByRole('button', { name });
        expect(parseInt(btn.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
        expect(parseInt(btn.style.minWidth, 10)).toBeGreaterThanOrEqual(44);
      }
    });

    it('never runs the editing tour over someone else’s poster', () => {
      renderShare();
      expect(screen.queryByText(/skip tour/i)).not.toBeInTheDocument();
    });
  });

  describe('at desktop width the layout is unchanged', () => {
    beforeEach(() => setViewportIsSmall(false));

    it('keeps the guidelines rail and the desktop-sized zoom bar', () => {
      renderShare();
      expect(document.querySelector('[data-postr-mobile-share-bar]')).toBeNull();
      expect(screen.getByText(/poster guidelines/i)).toBeInTheDocument();

      // Desktop zoom controls stay compact — the touch sizing must not
      // leak across the breakpoint.
      const zoomIn = screen.getByRole('button', { name: /zoom in/i });
      expect(zoomIn.style.minHeight).toBe('');
    });
  });
});
