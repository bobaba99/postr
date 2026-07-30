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
    to: '/paper-to-slides',
    label: 'Paper to slides',
    blurb: 'Turn a manuscript into a talk (coming soon)',
  },
  {
    to: '/chart-chooser',
    label: 'Plot picker',
    blurb: 'Find the figure that fits your data',
  },
] as const;

/**
 * The full public nav set, in display order — the tools plus the two
 * Learn pages.
 *
 * Exported and consumed by the dashboard header (pages/Home) and the
 * admin header (pages/AdminGallery) rather than being retyped there.
 * Those two had drifted to listing only About, so a signed-in user lost
 * the standalone tools the moment they left a marketing page. Three
 * hand-maintained copies of the same list is what caused that drift, so
 * the list lives here once.
 */
export const NAV_LINKS = [
  ...TOOL_LINKS.map(({ to, label }) => ({ to, label })),
  { to: '/pricing', label: 'Pricing' },
  { to: '/why-posters', label: 'Why posters' },
  { to: '/about', label: 'About' },
] as const;

/** Shared styling for a top-level nav link, gated until it fits flat. */
export const NAV_LINK_CLASS =
  'hidden text-[14pt] font-normal text-[#8b8f99] no-underline hover:text-[#c8cad0] xl:inline';

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

  // The workspace link's destination and label depend on the session.
  // Signed in → their dashboard; signed out → the editor directly at
  // /p/new, which EnsureSession will recognise and create an anonymous
  // session behind, so a visitor lands in the editor without a signup wall.
  const workspaceLink = signedIn
    ? { to: '/dashboard', label: 'My posters' }
    : { to: '/p/new', label: 'Editor' };

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

      <div className="flex items-center gap-4 sm:gap-5">
        {/*
          The two standalone tools are listed flat rather than folded
          into a Tools dropdown: the header has room at this width, and
          a menu hides the very thing that was invisible before. One
          click instead of two, and both names are readable from the
          page rather than after a hover.

          Below `xl` these move into the overflow menu rather than
          disappearing: every nav item used to be breakpoint-gated, so a
          phone saw a header with nothing in it but the wordmark and a
          sign-in button, and the footer was the only route to any of
          this. Nav that vanishes is not responsive, it is missing.
        */}
        {/*
          The auth-aware workspace link. One link whose destination and
          label flip with the session, so it can't live in the static
          NAV_LINKS array: signed in it points at the dashboard ("My
          posters"); signed out it drops the visitor straight into a
          guest editor ("Editor") via the same one-tap guest entry the
          landing page uses. Rendered only once the auth state has
          resolved so the label never flips under the user mid-read.
        */}
        {ready && (
          <Link to={workspaceLink.to} className={NAV_LINK_CLASS}>
            {workspaceLink.label}
          </Link>
        )}

        {NAV_LINKS.map((link) => (
          <Link key={link.to} to={link.to} className={NAV_LINK_CLASS}>
            {link.label}
          </Link>
        ))}

        <MobileNav
          signedIn={signedIn}
          workspaceLink={ready ? workspaceLink : null}
          onFeedback={() => openFeedback('feature')}
        />

        {signedIn ? (
          <>
            <button
              type="button"
              onClick={() => openFeedback('feature')}
              className="hidden h-10 items-center gap-2 rounded-md border border-[#2a2a3a] bg-[#111118] px-4 text-[14pt] font-normal text-[#c8cad0] hover:border-[#7c6aed] hover:text-[#fff] xl:flex"
              title="Send feedback"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Feedback
            </button>
            <Link
              to="/profile"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#2a2a3a] text-[#8b8f99] hover:border-[#7c6aed] hover:text-[#c8cad0]"
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
            className="rounded-md border border-[#7c6aed] px-5 py-2 text-[14pt] font-semibold text-[#7c6aed] no-underline hover:bg-[#5641b8] hover:text-white transition-colors"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

/**
 * Below-`xl` overflow menu.
 *
 * Every nav item in this header is breakpoint-gated, which once left
 * the header with nothing but the wordmark and a sign-in button — the
 * tools, About, and Feedback were reachable only by scrolling to the
 * footer. This is the phone-sized route to the same set.
 *
 * Hidden at `xl` and up, where the flat row takes over, so the two are
 * never on screen at once.
 *
 * Deliberately NOT the WAI-ARIA menu pattern, for the same reason the
 * old Tools dropdown wasn't: role="menu" promises arrow-key
 * navigation, a roving tabindex, and Home/End. None of that is
 * implemented here, so the honest markup for a list of navigation
 * links is a labelled list of links. Tab moves through them, which is
 * what the roles now claim.
 *
 * Rows are `py-3` (≈44px tall) to clear the WCAG 2.5.5 / iOS touch
 * target floor — the same reason PublicFooter's links carry padding.
 */
function MobileNav({
  signedIn,
  workspaceLink,
  onFeedback,
}: {
  signedIn: boolean;
  /** Auth-aware workspace link (Editor / My posters), or null until
   *  the session has resolved. */
  workspaceLink: { to: string; label: string } | null;
  onFeedback: () => void;
}) {
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

  return (
    <div ref={containerRef} className="relative xl:hidden">
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={open ? panelId : undefined}
        aria-label="Menu"
        className="flex h-11 w-11 items-center justify-center rounded-md border border-[#2a2a3a] bg-[#111118] text-[#c8cad0]"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {open ? (
            <>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </>
          ) : (
            <>
              <path d="M3 12h18" />
              <path d="M3 6h18" />
              <path d="M3 18h18" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <ul
          id={panelId}
          aria-labelledby={triggerId}
          /*
            Anchored to the VIEWPORT, not to the trigger.
            `position: fixed` with a left and right inset, so the panel
            spans the screen minus a 1rem gutter on each side and can
            never run off an edge.

            Right-anchoring it to the trigger (`absolute right-0`) is
            what broke on a phone: the trigger sits inside the header's
            own `px-8` padding, so a 16rem panel hanging leftward from
            it started 29.6px off-screen and clipped the first letter
            of every label. Clamping the WIDTH only moved the problem —
            the panel still began left of zero while wasting ~149px of
            empty viewport to its right, because its right edge was
            pinned to the trigger rather than to the screen.

            The header does not scroll with the page, so `fixed` and
            `absolute` look identical here; `fixed` simply makes the
            containing block the viewport, which is the box that
            actually matters.
          */
          style={{ transformOrigin: 'top right' }}
          className="postr-popover-enter fixed left-4 right-4 top-[4.5rem] z-50 list-none rounded-xl border border-[#2a2a3a] bg-[#111118] p-2 shadow-xl shadow-black/40"
        >
          {/* Workspace link first — the primary destination on a phone,
              above the tools and Learn pages. */}
          {workspaceLink && (
            <li>
              <Link
                to={workspaceLink.to}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-3 text-[14pt] font-medium text-[#c8cad0] no-underline hover:bg-[#1a1a26]"
              >
                {workspaceLink.label}
              </Link>
            </li>
          )}

          {TOOL_LINKS.map((tool) => (
            <li key={tool.to}>
              <Link
                to={tool.to}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-3 no-underline hover:bg-[#1a1a26]"
              >
                <span className="block text-[14pt] font-medium text-[#c8cad0]">
                  {tool.label}
                </span>
                <span className="mt-0.5 block text-[12pt] text-[#8b8f99]">
                  {tool.blurb}
                </span>
              </Link>
            </li>
          ))}

          {/* The Learn pages — the entries NAV_LINKS carries beyond the
              tools, which have their own blurbed rows above. */}
          {NAV_LINKS.filter(
            (link) => !TOOL_LINKS.some((tool) => tool.to === link.to),
          ).map((link) => (
            <li key={link.to}>
              <Link
                to={link.to}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-3 text-[14pt] font-medium text-[#c8cad0] no-underline hover:bg-[#1a1a26]"
              >
                {link.label}
              </Link>
            </li>
          ))}

          {/* Feedback is a button on desktop too — it opens the modal
              rather than navigating. Signed-out visitors don't get it
              in either place. */}
          {signedIn && (
            <li>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onFeedback();
                }}
                className="block w-full cursor-pointer rounded-lg border-0 bg-transparent px-3 py-3 text-left text-[14pt] font-medium text-[#c8cad0] hover:bg-[#1a1a26]"
              >
                Send feedback
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
