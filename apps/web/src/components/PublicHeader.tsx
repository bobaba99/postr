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
 *   - no session: Gallery, About, "Sign in" button
 *   - with session: Gallery, About, Feedback button, Profile icon
 *
 * Matches the dashboard header's authenticated chrome so moving from
 * /dashboard to /gallery no longer looks like a regression.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useFeedbackStore } from '@/stores/feedbackStore';
import type { User } from '@supabase/supabase-js';

interface Props {
  /**
   * If true, highlight the "Gallery" link in the nav.
   * Used on /gallery and /gallery/:id pages.
   */
  highlightGallery?: boolean;
}

export function PublicHeader({ highlightGallery = false }: Props) {
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

  // Normalized against the dashboard (Home.tsx) header so moving
  // between public and auth-gated pages doesn't flicker font sizes.
  // Brand: 20px semibold. Nav links: 12px medium. Action button: 12px.
  return (
    <header className="flex items-center justify-between px-8 py-5">
      <Link to="/" className="flex items-center gap-3 no-underline">
        <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
          <rect width="64" height="64" rx="12" fill="#7c6aed" />
          <path d="M14 14 C32 14, 32 50, 50 50" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.95" />
          <path d="M14 50 C32 50, 32 14, 50 14" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.55" />
          <circle cx="32" cy="32" r="5" fill="white" />
        </svg>
        <span className="text-xl font-semibold tracking-tight text-[#c8cad0]">
          Postr
        </span>
      </Link>

      <div className="flex items-center gap-4">
        <Link
          to="/gallery"
          className={`hidden text-[12px] font-medium no-underline sm:inline ${
            highlightGallery
              ? 'text-[#7c6aed] hover:text-white'
              : 'text-[#6b7280] hover:text-[#c8cad0]'
          }`}
        >
          Gallery
        </Link>
        <Link
          to="/about"
          className="hidden text-[12px] font-medium text-[#6b7280] no-underline hover:text-[#c8cad0] sm:inline"
        >
          About
        </Link>

        {signedIn ? (
          <>
            <button
              type="button"
              onClick={() => openFeedback('feature')}
              className="hidden h-8 items-center gap-1.5 rounded-md border border-[#2a2a3a] bg-[#111118] px-3 text-[12px] font-medium text-[#c8cad0] hover:border-[#7c6aed] hover:text-[#fff] sm:flex"
              title="Send feedback"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Feedback
            </button>
            <Link
              to="/profile"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#2a2a3a] text-[#6b7280] hover:border-[#7c6aed] hover:text-[#c8cad0]"
              title="Profile & Settings"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </Link>
          </>
        ) : (
          <Link
            to="/auth"
            className="rounded-md border border-[#7c6aed] px-4 py-1.5 text-[12px] font-semibold text-[#7c6aed] no-underline hover:bg-[#7c6aed] hover:text-white transition-colors"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
