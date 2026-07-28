/**
 * `useIsSmallScreen` — the gate every phone-only layout branch hangs
 * off, so its failure modes matter more than its happy path:
 *
 * - It must report FALSE when `matchMedia` is missing (SSR/prerender),
 *   because the desktop layout is the safe default and the mobile
 *   branch is strictly additive.
 * - It must TRACK the breakpoint, not sample it once. A phone rotated
 *   to landscape, or a desktop window dragged narrow, crosses 640px
 *   without remounting — a one-shot `innerWidth` read would strand the
 *   UI in the wrong layout.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { SMALL_SCREEN_QUERY, useIsSmallScreen } from '../useIsSmallScreen';

type Listener = (e: MediaQueryListEvent) => void;

/**
 * Installs a controllable `matchMedia`. Returns `setMatches`, which
 * flips the result AND fires `change` the way a real browser does when
 * the viewport crosses the breakpoint.
 */
function stubMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  let matches = initial;

  const original = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_type: string, fn: Listener) => listeners.add(fn),
      removeEventListener: (_type: string, fn: Listener) => listeners.delete(fn),
      dispatchEvent: () => false,
    }),
  });

  return {
    setMatches(next: boolean) {
      matches = next;
      listeners.forEach((fn) => fn({ matches: next } as MediaQueryListEvent));
    },
    /** Listener count — proves the effect cleans up after itself. */
    listenerCount: () => listeners.size,
    restore() {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: original,
      });
    },
  };
}

describe('useIsSmallScreen', () => {
  afterEach(() => vi.restoreAllMocks());

  it('queries the Tailwind sm breakpoint (under 640px)', () => {
    expect(SMALL_SCREEN_QUERY).toBe('(max-width: 639px)');
  });

  it('is false on a wide viewport', () => {
    const mm = stubMatchMedia(false);
    try {
      const { result } = renderHook(() => useIsSmallScreen());
      expect(result.current).toBe(false);
    } finally {
      mm.restore();
    }
  });

  it('is true on a narrow viewport', () => {
    const mm = stubMatchMedia(true);
    try {
      const { result } = renderHook(() => useIsSmallScreen());
      expect(result.current).toBe(true);
    } finally {
      mm.restore();
    }
  });

  it('re-renders when the viewport crosses the breakpoint', () => {
    const mm = stubMatchMedia(false);
    try {
      const { result } = renderHook(() => useIsSmallScreen());
      expect(result.current).toBe(false);

      // Rotate to portrait / drag the window narrow.
      act(() => mm.setMatches(true));
      expect(result.current).toBe(true);

      // And back — the branch must be reversible, not sticky.
      act(() => mm.setMatches(false));
      expect(result.current).toBe(false);
    } finally {
      mm.restore();
    }
  });

  it('unsubscribes on unmount', () => {
    const mm = stubMatchMedia(true);
    try {
      const { unmount } = renderHook(() => useIsSmallScreen());
      expect(mm.listenerCount()).toBe(1);
      unmount();
      expect(mm.listenerCount()).toBe(0);
    } finally {
      mm.restore();
    }
  });

  it('falls back to the desktop layout when matchMedia is unavailable', () => {
    const original = window.matchMedia;
    // Simulates SSR / the prerender pass, where there is no viewport
    // to measure. Reporting "small" there would ship the phone layout
    // to every crawler.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    try {
      const { result } = renderHook(() => useIsSmallScreen());
      expect(result.current).toBe(false);
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: original,
      });
    }
  });
});
