/**
 * MobileNotice — a slim, dismissible strip shown only on phone-width
 * viewports, on every route, telling the visitor that Postr is built
 * for a computer.
 *
 * Why it exists: the poster editor is a full-canvas desktop tool, and
 * the marketing pages are the first thing a shared link opens — very
 * often on a phone. Rather than let someone judge the product by a
 * cramped canvas, say plainly that the real experience is on a
 * laptop or desktop and let them come back.
 *
 * Behaviour contract (locked by __tests__/MobileNotice.test.tsx):
 *   - renders nothing on wide viewports and wherever `matchMedia` is
 *     unavailable (prerender, jsdom) — the desktop path is untouched;
 *   - shows below Tailwind's `md` breakpoint (phones; tablets in
 *     portrait land just above it and can browse comfortably);
 *   - dismissal is a real button and persists for the session, so the
 *     strip never re-appears on every route change;
 *   - storage failures (private mode, blocked site data) are ignored —
 *     the strip simply shows again next load.
 *
 * It sits along the BOTTOM edge of the viewport rather than the top:
 * a top strip would hide the header (logo, menu, sign-in) until
 * dismissed, and the editor has no document flow to push content into
 * anyway. A fixed bottom strip behaves identically on every page and
 * respects the iOS home-indicator inset.
 */
import { useState } from 'react';
import { useIsSmallScreen } from '@/hooks/useIsSmallScreen';

/** Everything under Tailwind's `md` (768px) — phone widths. */
export const MOBILE_NOTICE_QUERY = '(max-width: 767px)';

/** sessionStorage flag: "1" once the visitor dismissed the strip. */
export const MOBILE_NOTICE_STORAGE_KEY = 'postr.mobile-notice-dismissed';

const readDismissed = (): boolean => {
  try {
    return sessionStorage.getItem(MOBILE_NOTICE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

const writeDismissed = (): void => {
  try {
    sessionStorage.setItem(MOBILE_NOTICE_STORAGE_KEY, '1');
  } catch {
    // Storage blocked — the strip will show again next load, which is
    // the honest fallback.
  }
};

export function MobileNotice() {
  const isPhone = useIsSmallScreen(MOBILE_NOTICE_QUERY);
  const [dismissed, setDismissed] = useState(readDismissed);

  if (!isPhone || dismissed) return null;

  const dismiss = () => {
    writeDismissed();
    setDismissed(true);
  };

  return (
    <aside
      role="region"
      aria-label="Not optimised for phones"
      className="postr-rise-in fixed inset-x-0 bottom-0 z-[60] flex items-start gap-3 border-t border-[#2a2a3a] bg-[#111118]/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-[#c8cad0] shadow-[0_-8px_24px_rgba(0,0,0,0.35)] backdrop-blur"
    >
      <span aria-hidden className="mt-0.5 text-lg leading-none">💻</span>
      <p className="m-0 flex-1 text-[13px] leading-snug">
        <span className="font-semibold text-[#e2e2e8]">Not optimised for phones.</span>{' '}
        Postr is built for a laptop or desktop screen — open this page on a
        computer for the full editor.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[#8b8f99] transition-colors duration-fast ease-smooth hover:bg-[#1a1a26] hover:text-[#e2e2e8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7c6aed]"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </aside>
  );
}
