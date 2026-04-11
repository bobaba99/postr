/**
 * AuthGuard — redirects to /auth if no Supabase session exists.
 *
 * Wraps protected routes (dashboard, editor, profile). Shows a
 * loading state while checking the session, then either renders
 * children or redirects to the auth page.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

export function AuthGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate('/auth', { replace: true });
      } else {
        setReady(true);
      }
    });

    // Listen for auth state changes (e.g. sign out, session expiry,
    // account deletion). TOKEN_REFRESHED is a no-op — the session is
    // still valid. SIGNED_OUT and USER_DELETED both mean the user
    // can no longer edit, so redirect to auth.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        navigate('/auth', { replace: true });
      }
      // TOKEN_REFRESHED — session renewed silently, no action needed.
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (!ready) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
        <div className="animate-pulse text-sm tracking-wide">Loading…</div>
      </div>
    );
  }

  return <>{children}</>;
}
