/**
 * AuthBootstrap — gates child rendering on a ready Supabase session.
 *
 * Wraps the entire <App /> tree. On first mount it calls ensureSession()
 * (anonymous-first), then renders children. While the session is being
 * established, it shows a minimal full-screen loading state. Errors
 * surface as a retry-able full-screen message rather than a white page.
 *
 * Friction principle (PRD §17): the user never sees a sign-up wall.
 * Anonymous session is created silently in the background.
 */
import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { ensureSession } from '@/lib/auth';

type Status =
  | { kind: 'loading' }
  | { kind: 'ready'; session: Session }
  | { kind: 'error'; message: string };

interface AuthBootstrapProps {
  children: ReactNode;
}

export function AuthBootstrap({ children }: AuthBootstrapProps) {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    ensureSession(supabase)
      .then((session) => {
        if (cancelled) return;
        if (!session) {
          setStatus({ kind: 'error', message: 'No session returned by Supabase' });
          return;
        }
        setStatus({ kind: 'ready', session });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Unknown auth error';
        setStatus({ kind: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (status.kind === 'loading') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
        <div className="animate-pulse text-sm tracking-wide">Loading…</div>
      </div>
    );
  }

  if (status.kind === 'error') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
        <div className="max-w-md space-y-3 text-center">
          <p className="text-base font-medium">Couldn’t start your session</p>
          <p className="text-xs text-[#888]">{status.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-[#2a2a3a] bg-[#1a1a26] px-4 py-2 text-sm hover:border-[#7c6aed]"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
