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

    // Listen for auth state changes. SIGNED_OUT covers both explicit
    // sign-out and account deletion (the delete-account edge function
    // signs the user out after deleting, which fires SIGNED_OUT).
    // TOKEN_REFRESHED is a no-op — the session is still valid.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        navigate('/auth', { replace: true });
      }
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
