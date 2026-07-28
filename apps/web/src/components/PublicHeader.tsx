/**
 * Shared public-page header — logo + nav + auth-aware right side.
 *
 * Replaces the ~30 LOC local Header() function that was duplicated
 * across Landing, About, Gallery, GalleryEntry, Privacy, Terms, and
 * Cookies. The old headers were auth-blind and always rendered
 * "Sign in", so a signed-in guest visiting /gallery saw what looked
 * like a sign-out — indistinguishable from the real bug it was
 * masking.
 *
 * This component subscribes to supabase.auth via onAuthStateChange
 * and flips the right side between:
 *   - no session: About, "Sign in" button
 *   - with session: About, Feedback button, Profile icon
 *
 * Matches the dashboard header's authenticated chrome so moving from
 * /dashboard to a public page no longer looks like a regression.
 *
 * The Gallery nav link was removed when the public gallery was
 * deactivated; restore it alongside the /gallery routes if the
 * gallery is switched back on.
 *
 * The "Tools" menu exists because /chart-chooser and /paper-to-poster
 * shipped with nothing linking to them from anywhere in the app — not
 * the header, not the footer, not the landing page. They were only
 * reachable by typing the URL, which is how the owner came to not be
 * able to find them. This menu and the footer/landing entries added
 * alongside it are that fix.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { supabase } from '@/lib/supabase';
import { useFeedbackStore } from '@/stores/feedbackStore';
import type { User } from '@supabase/supabase-js';

/**
 * The standalone tools, in the order they appear everywhere. Both are
 * public, need no account, and are canonical URLs (never the alias
 * spellings) so internal links never bounce through a 308.
 */
const TOOL_LINKS = [
  {
    to: '/paper-to-poster',
    label: 'Paper to poster',
    blurb: 'Turn a manuscript into a poster draft',
  },
  {
    to: '/chart-chooser',
    label: 'Plot picker',
    blurb: 'Find the figure that fits your data',
  },
] as const;

export function PublicHeader() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const openFeedback = useFeedbackStore((s) => s.open);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUser(data.session?.user ?? null);
      setReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (cancelled) return;
        setUser(session?.user ?? null);
      },
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signedIn = ready && user !== null;

  // Minimum font size for nav chrome is 14pt, matching the design
  // plan's readability minimum (docs/plans/2026-04-10-figure-
  // readability-checker.md — "tick labels: min 14pt"). 14pt ≈ 18.67px
  // in CSS. The brand wordmark is bigger (20px/semibold). Buttons and
  // profile icon grow to stay visually balanced with the chunkier
  // links. This header and the dashboard header (Home.tsx) use the
  // same tokens so nav chrome never flickers between pages.
  return (
    <header className="flex items-center justify-between px-8 py-5">
      <Link to="/" className="flex items-center gap-3 no-underline">
        <svg width="36" height="36" viewBox="0 0 64 64" fill="none">
          <rect width="64" height="64" rx="12" fill="#7c6aed" />
          <path d="M14 14 C32 14, 32 50, 50 50" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.95" />
          <path d="M14 50 C32 50, 32 14, 50 14" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.55" />
          <circle cx="32" cy="32" r="5" fill="white" />
        </svg>
        <span className="text-[20pt] font-medium tracking-tight text-[#c8cad0]">
          Postr
        </span>
      </Link>

      <div className="flex items-center gap-5">
        <ToolsMenu />

        <Link
          to="/about"
          className="hidden text-[14pt] font-normal text-[#6b7280] no-underline hover:text-[#c8cad0] sm:inline"
        >
          About
        </Link>

        {signedIn ? (
          <>
            <button
              type="button"
              onClick={() => openFeedback('feature')}
              className="hidden h-10 items-center gap-2 rounded-md border border-[#2a2a3a] bg-[#111118] px-4 text-[14pt] font-normal text-[#c8cad0] hover:border-[#7c6aed] hover:text-[#fff] sm:flex"
              title="Send feedback"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Feedback
            </button>
            <Link
              to="/profile"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#2a2a3a] text-[#6b7280] hover:border-[#7c6aed] hover:text-[#c8cad0]"
              title="Profile & Settings"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </Link>
          </>
        ) : (
          <Link
            to="/auth"
            className="rounded-md border border-[#7c6aed] px-5 py-2 text-[14pt] font-semibold text-[#7c6aed] no-underline hover:bg-[#7c6aed] hover:text-white transition-colors"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

/**
 * "Tools" dropdown listing the standalone tools.
 *
 * Hidden below `sm` to match the sibling nav links (About, Feedback),
 * which all use `sm:` prefixes — a lone dropdown at 320px would crowd
 * the wordmark and the sign-in button off the row. The footer carries
 * the same two links unprefixed, so small screens keep a real path to
 * both tools rather than losing them entirely.
 *
 * Closes on outside pointerdown, on Escape (restoring focus to the
 * trigger), when focus leaves the container entirely, and on
 * navigation. Entrance uses the shared `.postr-popover-enter` class,
 * which is already dropped under prefers-reduced-motion in index.css.
 *
 * Deliberately NOT the WAI-ARIA menu pattern. An earlier version
 * declared role="menu" with role="menuitem" children, which promises a
 * screen-reader user arrow-key navigation, a roving tabindex, and
 * Home/End — none of which were implemented, so the items were only
 * reachable by Tab and the announced affordance was a lie. For a panel
 * of two ordinary navigation links, the honest markup is a labelled
 * list of links: Tab moves through them, which is exactly what the
 * roles now claim. If this ever grows into a real command menu, add
 * the full keyboard model FIRST, then restore the menu roles.
 */
function ToolsMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const triggerId = useId();
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && !containerRef.current?.contains(target)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      // Focus would otherwise land on <body> and the keyboard user
      // would lose their place in the nav.
      triggerRef.current?.focus();
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  /**
   * Keyboard equivalent of the outside-pointerdown dismissal. Without
   * it, Tabbing past the last link leaves the panel open and floating
   * over the nav with focus somewhere else entirely.
   *
   * relatedTarget === null means focus left the document (window blur,
   * devtools, another tab). Closing then would collapse the panel out
   * from under a user who is coming right back, so it is left open.
   *
   * This is onBlur, not onFocusOut: React has no onFocusOut prop, and
   * onBlur is the one that maps to the native *bubbling* focusout —
   * which is what lets a single handler on the container see focus
   * leaving any descendant.
   */
  function onBlur(event: React.FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget as Node | null;
    if (next === null) return;
    if (!containerRef.current?.contains(next)) setOpen(false);
  }

  return (
    <div
      ref={containerRef}
      onBlur={onBlur}
      className="relative hidden sm:block"
    >
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={open ? panelId : undefined}
        className="flex items-center gap-1.5 border-0 bg-transparent p-0 text-[14pt] font-normal text-[#6b7280] hover:text-[#c8cad0]"
      >
        Tools
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="transition-transform duration-fast ease-smooth"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/*
        Anchored to the trigger's RIGHT edge: "Tools" sits near the end
        of the nav row, so a left-anchored 18rem panel spills past the
        viewport (measured ~3px over at 1440px, and worse as the window
        narrows).
      */}
      {open && (
        <ul
          id={panelId}
          aria-labelledby={triggerId}
          style={{ transformOrigin: 'top right' }}
          className="postr-popover-enter absolute right-0 top-full z-50 mt-3 w-72 list-none rounded-xl border border-[#2a2a3a] bg-[#111118] p-2 shadow-xl shadow-black/40"
        >
          {TOOL_LINKS.map((tool) => (
            <li key={tool.to}>
              <Link
                to={tool.to}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 no-underline transition-colors duration-fast ease-smooth hover:bg-[#1a1a26]"
              >
                <span className="block text-[14pt] font-medium text-[#c8cad0]">
                  {tool.label}
                </span>
                <span className="mt-0.5 block text-[12pt] text-[#6b7280]">
                  {tool.blurb}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
