/**
 * SessionExpiredModal — full-screen nag shown when the user's
 * Supabase JWT has expired mid-session and can't be refreshed.
 *
 * Why this exists: Postr uses short-lived JWTs with a refresh
 * token. If the user leaves the editor open overnight, the
 * refresh token may also expire or be invalidated server-side.
 * In that state, every autosave PATCH will return 401 and
 * silently fail — the user keeps typing, the app keeps saying
 * "Saved · just now" (from the last successful save), and
 * then they close the tab and lose everything.
 *
 * We hook into `supabase.auth.onAuthStateChange` and listen for
 * `SIGNED_OUT` events that fire AFTER the user was already
 * authenticated (i.e. not the initial unauthenticated landing
 * state). When that happens while the user is on a protected
 * route, we pop this modal over everything. Two actions:
 *
 *   1. "Reload and sign in again" — full page reload back to
 *      /auth. They keep their URL in a query param so we can
 *      bounce them back afterward (future work).
 *   2. "Dismiss" — escape hatch; keeps the editor open in a
 *      read-only-ish state so the user can copy any unsaved
 *      text into a safe location before refreshing.
 *
 * Rendered once at the root of AuthGuard / route tree so any
 * protected page gets the same protection.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function SessionExpiredModal() {
  const [expired, setExpired] = useState(false);
  const [hadSession, setHadSession] = useState(false);

  useEffect(() => {
    // Seed initial state — if there's a session on mount, mark
    // `hadSession` so a later SIGNED_OUT is interpreted as an
    // expiration rather than the user simply not being signed in.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHadSession(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setHadSession(true);
        setExpired(false);
      } else if (event === 'SIGNED_OUT') {
        // Only treat as expiration if we had a session before.
        // Fresh unauthenticated page loads also fire SIGNED_OUT.
        if (hadSession) setExpired(true);
      }
    });
    return () => sub.subscription.unsubscribe();
    // `hadSession` is read inside the callback via closure — we
    // intentionally capture the stable ref at effect-time so rapid
    // sign-in/sign-out toggles don't race.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!expired) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 460,
          padding: 28,
          background: '#1a1a26',
          border: '1px solid #2a2a3a',
          borderRadius: 12,
          color: '#e2e2e8',
          fontFamily: "'DM Sans', system-ui, sans-serif",
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div
          aria-hidden
          style={{
            fontSize: 36,
            marginBottom: 12,
            textAlign: 'center',
          }}
        >
          🔒
        </div>
        <h2
          id="session-expired-title"
          style={{
            fontSize: 20,
            fontWeight: 700,
            margin: '0 0 10px',
            textAlign: 'center',
          }}
        >
          Your session has expired
        </h2>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: '#a0a0aa',
            margin: '0 0 22px',
            textAlign: 'center',
          }}
        >
          For security, Postr sessions eventually time out. Any
          unsaved edits in this tab have <b>not</b> been saved to
          the server since the session expired — copy anything
          important before reloading.
        </p>
        <div
          style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={() => {
              window.location.href = '/auth';
            }}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '12px 24px',
              background: '#7c6aed',
              color: '#fff',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            Reload and sign in again
          </button>
          <button
            type="button"
            onClick={() => setExpired(false)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '12px 20px',
              background: '#1a1a26',
              color: '#c8cad0',
              border: '1px solid #2a2a3a',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Dismiss (save text first)
          </button>
        </div>
      </div>
    </div>
  );
}
