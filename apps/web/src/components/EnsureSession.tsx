/**
 * EnsureSession — the editor's session gate.
 *
 * Unlike AuthGuard (which BOUNCES a session-less visitor to /auth),
 * this CREATES an anonymous session and lets them edit immediately —
 * the no-auth editor entry. For a logged-in user it is a no-op:
 * ensureSession() returns the existing session. On SIGNED_OUT it
 * re-ensures a fresh anonymous session rather than dead-ending, so the
 * editor is never left without a session. Genuinely account-required
 * routes (/dashboard, /profile, /admin) keep AuthGuard.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { ensureSession, resetEnsureSession } from '@/lib/auth';

type State = 'preparing' | 'ready' | 'error';

export function EnsureSession({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>('preparing');

  useEffect(() => {
    let cancelled = false;
    ensureSession(supabase)
      .then(() => {
        if (!cancelled) setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // A wipe (sign-out / account deletion) must not dead-end the
      // editor — re-ensure an anonymous session instead of bouncing.
      if (event === 'SIGNED_OUT') {
        // Clear the cached in-flight promise first — otherwise
        // ensureSession() would just hand back the stale resolved
        // value instead of truly re-bootstrapping a fresh anonymous
        // session.
        resetEnsureSession();
        ensureSession(supabase).catch(() => {
          if (!cancelled) setState('error');
        });
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (state === 'preparing') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
        <div className="animate-pulse text-sm tracking-wide">Preparing your editor…</div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
        <div className="max-w-md space-y-3 text-center">
          <p className="text-base font-medium">Something went wrong</p>
          <p className="text-xs text-[#888]">
            We couldn’t start the editor. Refresh to try again.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
