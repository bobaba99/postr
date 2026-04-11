/**
 * /debug — lightweight session + environment inspector.
 *
 * Reachable by typing /debug into the URL bar. Not linked from
 * anywhere in the nav so it doesn't clutter the UI. Useful when
 * debugging auth-state issues like the "guest → click Gallery →
 * profile turns into Sign in" report from the 2026-04-11 audit.
 *
 * Public — no AuthGuard — so you can hit it without a session too.
 * Shows:
 *   - Supabase session status (user id, email, is_anonymous, jwt exp)
 *   - Live auth events (onAuthStateChange stream)
 *   - Current route, user-agent, viewport
 *   - localStorage sb-* keys
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

interface AuthEvent {
  at: string;
  event: string;
  userId: string | null;
  isAnon: boolean | null;
}

export default function Debug() {
  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<AuthEvent[]>([]);
  const [now, setNow] = useState(new Date().toISOString());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        setSession(s);
        setEvents((prev) => [
          {
            at: new Date().toISOString(),
            event,
            userId: s?.user?.id ?? null,
            isAnon: s?.user?.is_anonymous ?? null,
          },
          ...prev,
        ].slice(0, 20));
      },
    );

    const tick = setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => {
      subscription.unsubscribe();
      clearInterval(tick);
    };
  }, []);

  const user = session?.user;
  const sbKeys = Object.keys(localStorage).filter((k) => k.startsWith('sb-'));

  return (
    <main className="min-h-screen w-screen bg-[#0a0a12] px-8 py-12 text-[#c8cad0]">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Debug</h1>
          <Link to="/" className="text-[12px] text-[#6b7280] no-underline hover:text-[#c8cad0]">
            ← Home
          </Link>
        </div>

        <Section title="Session">
          <Row k="signed in" v={user ? 'YES' : 'no'} good={!!user} />
          <Row k="user id" v={user?.id ?? '—'} mono />
          <Row k="is anonymous" v={String(user?.is_anonymous ?? '—')} />
          <Row k="email" v={user?.email ?? '—'} />
          <Row k="access token (first 24)" v={session?.access_token?.slice(0, 24) ?? '—'} mono />
          <Row
            k="expires at"
            v={
              session?.expires_at
                ? new Date(session.expires_at * 1000).toISOString()
                : '—'
            }
            mono
          />
          <Row k="now (live)" v={now} mono />
        </Section>

        <Section title="Browser">
          <Row k="route" v={window.location.pathname} mono />
          <Row k="viewport" v={`${window.innerWidth} × ${window.innerHeight}`} />
          <Row k="user-agent" v={navigator.userAgent} mono />
        </Section>

        <Section title="localStorage (sb-*)">
          {sbKeys.length === 0 ? (
            <Row k="(no keys)" v="" />
          ) : (
            sbKeys.map((k) => <Row key={k} k={k} v="" mono />)
          )}
        </Section>

        <Section title="Auth events (live)">
          {events.length === 0 ? (
            <Row k="(no events yet)" v="" />
          ) : (
            events.map((e, i) => (
              <Row
                key={i}
                k={`${e.at.slice(11, 19)}  ${e.event}`}
                v={e.userId ? `${e.userId.slice(0, 8)}…${e.isAnon ? ' anon' : ''}` : '—'}
                mono
              />
            ))
          )}
        </Section>

        <div className="mt-8 rounded-md border border-[#1f1f2e] bg-[#111118] p-4 text-[12px] text-[#6b7280]">
          <p className="mb-2">Manual ops:</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                setSession(null);
              }}
              className="rounded border border-[#2a2a3a] bg-[#1a1a26] px-3 py-1.5 text-[#f87171] hover:border-[#f87171]"
            >
              supabase.auth.signOut()
            </button>
            <button
              type="button"
              onClick={() => {
                localStorage.clear();
                sessionStorage.clear();
                window.location.reload();
              }}
              className="rounded border border-[#2a2a3a] bg-[#1a1a26] px-3 py-1.5 text-[#f87171] hover:border-[#f87171]"
            >
              localStorage.clear() + reload
            </button>
          </div>
          <p className="mt-3 text-[11px] text-[#555]">
            This page is unlinked — reach it by typing <code className="text-[#7c6aed]">/debug</code>{' '}
            in the URL bar.
          </p>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#7c6aed]">
        {title}
      </h2>
      <div className="overflow-hidden rounded-md border border-[#1f1f2e] bg-[#111118]">
        {children}
      </div>
    </div>
  );
}

function Row({
  k,
  v,
  mono,
  good,
}: {
  k: string;
  v: string;
  mono?: boolean;
  good?: boolean;
}) {
  return (
    <div className="flex items-start gap-4 border-b border-[#1f1f2e] px-4 py-2 text-[13px] last:border-b-0">
      <span className="w-48 shrink-0 text-[#6b7280]">{k}</span>
      <span
        className={`flex-1 break-all ${mono ? 'font-mono text-[12px]' : ''} ${
          good ? 'text-[#a6e3a1]' : 'text-[#c8cad0]'
        }`}
      >
        {v}
      </span>
    </div>
  );
}
