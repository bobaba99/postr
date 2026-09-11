/**
 * `MobileNotice` — the phone-width banner that tells a visitor Postr is
 * built for a computer. It must:
 *
 * - stay OUT of the tree on wide viewports and wherever `matchMedia`
 *   is missing (prerender / jsdom), so the desktop experience is the
 *   untouched default;
 * - appear only below the phone breakpoint, name a computer as the
 *   fix, and be dismissible from a real button;
 * - remember the dismissal for the rest of the session so it never
 *   nags on every route change;
 * - survive a throwing `sessionStorage` (private mode, blocked site
 *   data) without crashing the app shell it is mounted in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  MobileNotice,
  MOBILE_NOTICE_QUERY,
  MOBILE_NOTICE_STORAGE_KEY,
} from '../MobileNotice';

type Listener = (e: MediaQueryListEvent) => void;

function stubMatchMedia(matchesFor: (query: string) => boolean) {
  const listeners = new Set<Listener>();
  const original = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: matchesFor(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_type: string, fn: Listener) => listeners.add(fn),
      removeEventListener: (_type: string, fn: Listener) => listeners.delete(fn),
      dispatchEvent: () => false,
    }),
  });
  return () =>
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: original,
    });
}

describe('MobileNotice', () => {
  let restore: (() => void) | null = null;

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    restore?.();
    restore = null;
    vi.restoreAllMocks();
  });

  it('renders nothing when matchMedia is unavailable (prerender / jsdom default)', () => {
    const { container } = render(<MobileNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on a wide viewport', () => {
    restore = stubMatchMedia(() => false);
    const { container } = render(<MobileNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it('tells a phone-width visitor to use a computer, and only on the phone query', () => {
    restore = stubMatchMedia((q) => q === MOBILE_NOTICE_QUERY);
    render(<MobileNotice />);
    const region = screen.getByRole('region', { name: /not optimi[sz]ed for phones/i });
    expect(region).toHaveTextContent(/computer/i);
    expect(region).toHaveTextContent(/not optimi[sz]ed for phones/i);
  });

  it('dismisses from a real button and remembers it for the session', () => {
    restore = stubMatchMedia(() => true);
    const { unmount } = render(<MobileNotice />);
    const close = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(close);
    expect(screen.queryByRole('region')).toBeNull();
    expect(sessionStorage.getItem(MOBILE_NOTICE_STORAGE_KEY)).toBe('1');

    unmount();
    render(<MobileNotice />);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('keeps the dismiss control at a 44px touch target', () => {
    restore = stubMatchMedia(() => true);
    render(<MobileNotice />);
    const close = screen.getByRole('button', { name: /dismiss/i });
    expect(close.className).toMatch(/\bh-11\b/);
    expect(close.className).toMatch(/\bw-11\b/);
  });

  it('does not crash when sessionStorage throws', () => {
    restore = stubMatchMedia(() => true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<MobileNotice />);
    const close = screen.getByRole('button', { name: /dismiss/i });
    expect(() => fireEvent.click(close)).not.toThrow();
    expect(screen.queryByRole('region')).toBeNull();
  });
});
