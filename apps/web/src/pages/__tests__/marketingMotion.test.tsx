/**
 * Landing + About: motion must never cost visibility.
 *
 * Both pages are prerendered and SEO-load-bearing, and both reveal
 * content by hiding it and tweening it back. That trade is only
 * acceptable while the tween is guaranteed to run. These tests pin the
 * two cases where it is not:
 *
 *  1. Hidden tab — requestAnimationFrame never fires, so a tween would
 *     sit on its hidden first frame forever. Observed in review as a
 *     near-blank landing page.
 *  2. prefers-reduced-motion — the user asked for no movement, and the
 *     content must still be fully there.
 *
 * jsdom does not run GSAP's ticker at all, which makes it a faithful
 * stand-in for case 1: if a page hid content without checking, these
 * tests would catch it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const authSpies = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { auth: authSpies } }));

import About from '../About';
import Landing from '../Landing';

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
}

/**
 * jsdom's matchMedia always reports "no match", which would silently
 * make every media-gated branch look correct. Driving it explicitly
 * means the reduced-motion test actually exercises the reduced path.
 */
function mockMatchMedia(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce')
        ? reduced
        : query.includes('prefers-reduced-motion: no-preference')
          ? !reduced
          : true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

/** Inline opacity of 0 is the specific "hidden and stranded" state. */
function isStranded(el: HTMLElement | null): boolean {
  return el?.style.opacity === '0';
}

afterEach(() => {
  setDocumentHidden(false);
  vi.clearAllMocks();
});

describe('Landing motion safety', () => {
  it('keeps hero copy visible when the tab is hidden', () => {
    setDocumentHidden(true);
    mockMatchMedia(false);

    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    // The headline is the LCP element; if any regression re-introduces
    // an unguarded hide, this is where it shows up first.
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeTruthy();
    expect(isStranded(heading)).toBe(false);

    // Every feature/tool card must be readable too, not just present.
    document
      .querySelectorAll<HTMLElement>('[data-postr-reveal]')
      .forEach((card) => expect(isStranded(card)).toBe(false));
  });

  it('keeps hero copy visible under prefers-reduced-motion', () => {
    setDocumentHidden(false);
    mockMatchMedia(true);

    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    const heading = screen.getByRole('heading', { level: 1 });
    expect(isStranded(heading)).toBe(false);
    document
      .querySelectorAll<HTMLElement>('[data-postr-hero-item]')
      .forEach((item) => expect(isStranded(item)).toBe(false));
  });
});

describe('About motion safety', () => {
  it('keeps every milestone card visible when the tab is hidden', () => {
    setDocumentHidden(true);
    mockMatchMedia(false);

    render(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    );

    const cards = document.querySelectorAll<HTMLElement>(
      '[data-postr-milestone-card]',
    );
    // Guards against the selector silently matching nothing, which
    // would make the assertion below vacuously pass.
    expect(cards.length).toBeGreaterThan(0);
    cards.forEach((card) => expect(isStranded(card)).toBe(false));
  });

  it('keeps milestone cards visible under prefers-reduced-motion', () => {
    setDocumentHidden(false);
    mockMatchMedia(true);

    render(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    );

    document
      .querySelectorAll<HTMLElement>('[data-postr-milestone-card]')
      .forEach((card) => expect(isStranded(card)).toBe(false));
  });
});
