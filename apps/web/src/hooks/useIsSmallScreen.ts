/**
 * `useIsSmallScreen` — true below Tailwind's `sm` breakpoint (640px).
 *
 * Exists so phone-only layout branches are driven by a real media
 * query rather than a one-shot `window.innerWidth` read: a viewport
 * that crosses the breakpoint (rotation, a resized desktop window)
 * must re-render the branch, and `matchMedia` is the only source that
 * fires on that transition.
 *
 * Returns `false` during SSR/prerender and under jsdom without a
 * `matchMedia` implementation, so the desktop layout is always the
 * default and the small-screen path is strictly additive.
 */
import { useEffect, useState } from 'react';

/** Tailwind `sm` is min-width 640px, so "small" is everything under it. */
export const SMALL_SCREEN_QUERY = '(max-width: 639px)';

const matches = (query: string): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(query).matches;
};

export function useIsSmallScreen(query: string = SMALL_SCREEN_QUERY): boolean {
  const [small, setSmall] = useState(() => matches(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(query);
    // Read once on mount too: the state initialiser ran before this
    // effect, and the viewport can change in between (hydration,
    // devtools opening) without firing a change event.
    setSmall(mql.matches);

    const onChange = (e: MediaQueryListEvent) => setSmall(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return small;
}
