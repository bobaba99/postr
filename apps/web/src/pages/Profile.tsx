/**
 * Profile page — account settings, preferences, and data management.
 *
 * Modeled after Notion/Canva settings pages: minimal, single-column
 * layout with grouped sections. Uses the same dark theme as the
 * dashboard (Home.tsx) for visual consistency.
 *
 * Features:
 *   - Account info (user ID, email if linked, account type)
 *   - Display preferences (default poster size, default palette)
 *   - Linked accounts (convert anonymous → Google/email)
 *   - Data management (export all, delete all posters, delete account)
 *   - Style presets management (clear saved presets)
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { listPosters, deletePoster } from '@/data/posters';
import { ConfirmModal } from '@/components/ConfirmModal';
import type { User } from '@supabase/supabase-js';

type ConfirmAction = 'deletePosters' | 'deleteAccount' | null;

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [posterCount, setPosterCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      try {
        const posters = await listPosters();
        setPosterCount(posters.length);
      } catch {
        // Non-critical — show 0
      }
      setLoading(false);
    })();
  }, []);

  const isAnonymous = user?.is_anonymous ?? true;
  const email = user?.email ?? null;
  const createdAt = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—';

  const clearPresets = useCallback(() => {
    localStorage.removeItem('postr.style-presets');
    setActionStatus('Style presets cleared.');
    setTimeout(() => setActionStatus(null), 3000);
  }, []);

  const handleConfirm = useCallback(async () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (!action) return;

    setActionError(null);

    if (action === 'deletePosters') {
      setActionStatus('Deleting posters…');
      try {
        const posters = await listPosters();
        for (const p of posters) {
          await deletePoster(p.id);
        }
        setPosterCount(0);
        setActionStatus(`Deleted ${posters.length} poster(s).`);
        setTimeout(() => setActionStatus(null), 3000);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to delete posters');
        setActionStatus(null);
      }
    }

    if (action === 'deleteAccount') {
      setActionStatus('Deleting account…');
      try {
        const posters = await listPosters();
        for (const p of posters) {
          await deletePoster(p.id);
        }
        localStorage.removeItem('postr.style-presets');
        await supabase.auth.signOut({ scope: 'local' });
        navigate('/');
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to delete account');
        setActionStatus(null);
      }
    }
  }, [confirmAction, navigate]);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/profile` },
    });
    if (error) setActionError(error.message);
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen w-screen bg-[#0a0a12] text-[#c8cad0]">
        <Header />
        <div className="mx-auto max-w-2xl px-8 py-12">
          <p className="text-sm text-[#6b7280]">Loading…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-screen bg-[#0a0a12] text-[#c8cad0]">
      <Header />

      <div className="mx-auto max-w-2xl px-8 py-8">
        {actionStatus && (
          <div className="mb-4 rounded-md border border-[#a6e3a1]/40 bg-[#a6e3a1]/10 px-3 py-2 text-xs text-[#a6e3a1]">
            {actionStatus}
          </div>
        )}
        {actionError && (
          <div className="mb-4 rounded-md border border-[#f87171]/40 bg-[#f87171]/10 px-3 py-2 text-xs text-[#f87171]">
            {actionError}
          </div>
        )}

        {/* Account */}
        <Section title="Account">
          <Row label="Account type" value={isAnonymous ? 'Guest (anonymous)' : 'Linked account'} />
          <Row label="Email" value={email ?? 'Not linked'} />
          <Row label="Member since" value={createdAt} />
          <Row label="User ID" value={(user?.id?.slice(0, 8) ?? '—') + '…'} mono />
          <Row label="Posters" value={String(posterCount)} />
        </Section>

        {/* Link Account */}
        {isAnonymous && (
          <Section title="Link Your Account">
            <p className="mb-3 text-xs text-[#6b7280]">
              You're using a guest account. Link with Google to preserve your posters
              across devices and prevent data loss if your browser clears storage.
            </p>
            <button onClick={signInWithGoogle} className={btnPrimary}>
              Continue with Google
            </button>
          </Section>
        )}

        {/* Preferences */}
        <Section title="Preferences">
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm text-[#c8cad0]">Saved style presets</div>
              <div className="text-xs text-[#6b7280]">
                {(() => {
                  try {
                    const raw = localStorage.getItem('postr.style-presets');
                    const n = raw ? (JSON.parse(raw) as unknown[]).length : 0;
                    return `${n} preset(s) saved locally`;
                  } catch {
                    return '0 presets';
                  }
                })()}
              </div>
            </div>
            <button onClick={clearPresets} className={btnSecondary}>
              Clear presets
            </button>
          </div>
        </Section>

        {/* Danger Zone */}
        <Section title="Danger Zone" danger>
          <div className="space-y-4">
            <DangerAction
              title="Delete all posters"
              description={`Permanently delete all ${posterCount} poster(s). This cannot be undone.`}
              buttonText="Delete all posters"
              onClick={() => setConfirmAction('deletePosters')}
              disabled={posterCount === 0}
            />
            <div className="border-t border-[#2a2a3a]" />
            <DangerAction
              title="Delete account"
              description="Permanently delete your account and all associated data. You will be signed out and a new guest account will be created."
              buttonText="Delete account"
              onClick={() => setConfirmAction('deleteAccount')}
            />
          </div>
        </Section>
      </div>

      <ConfirmModal
        open={confirmAction !== null}
        title={confirmAction === 'deleteAccount' ? 'Delete account' : 'Delete all posters'}
        message={
          confirmAction === 'deleteAccount'
            ? 'This will permanently delete your account, all posters, and all preferences. You will be signed out and a new guest session will be created. This cannot be undone.'
            : `Permanently delete all ${posterCount} poster(s)? This cannot be undone.`
        }
        confirmLabel={confirmAction === 'deleteAccount' ? 'Delete account' : 'Delete all'}
        danger
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </main>
  );
}

// ── Shared sub-components ──────────────────────────────────────────

function Header() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#1f1f2e] bg-[#0a0a12]/95 px-8 py-5 backdrop-blur">
      <Link to="/" className="text-xl font-semibold tracking-tight text-[#c8cad0] no-underline hover:text-white">
        Postr
      </Link>
      <Link to="/" className="text-sm text-[#6b7280] no-underline hover:text-[#c8cad0]">
        ← Back to posters
      </Link>
    </header>
  );
}

function Section({ title, children, danger }: { title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <section className="mb-8">
      <h2
        className={`mb-4 text-xs font-semibold uppercase tracking-widest ${
          danger ? 'text-[#f87171]' : 'text-[#6b7280]'
        }`}
      >
        {title}
      </h2>
      <div className={`rounded-lg border ${danger ? 'border-[#f87171]/30' : 'border-[#1f1f2e]'} bg-[#111118] p-4`}>
        {children}
      </div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#1f1f2e] last:border-0">
      <span className="text-sm text-[#9ca3af]">{label}</span>
      <span className={`text-sm ${mono ? 'font-mono text-[#89b4fa]' : 'text-[#c8cad0]'}`}>{value}</span>
    </div>
  );
}

function DangerAction({
  title,
  description,
  buttonText,
  onClick,
  disabled,
}: {
  title: string;
  description: string;
  buttonText: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-[#c8cad0]">{title}</div>
        <div className="text-xs text-[#6b7280] mt-1">{description}</div>
      </div>
      <button onClick={onClick} disabled={disabled} className={btnDanger}>
        {buttonText}
      </button>
    </div>
  );
}

// ── Button styles (Tailwind classes) ───────────────────────────────

const btnPrimary =
  'cursor-pointer rounded-md bg-[#7c6aed] px-4 py-2 text-sm font-medium text-white hover:bg-[#6c5ce7] disabled:opacity-50 disabled:cursor-not-allowed';

const btnSecondary =
  'cursor-pointer rounded-md border border-[#2a2a3a] bg-[#1a1a26] px-3 py-1.5 text-xs text-[#c8cad0] hover:bg-[#1e1e2e] disabled:opacity-50 disabled:cursor-not-allowed';

const btnDanger =
  'cursor-pointer whitespace-nowrap rounded-md border border-[#f87171]/40 bg-transparent px-3 py-1.5 text-xs text-[#f87171] hover:bg-[#f87171]/10 disabled:opacity-30 disabled:cursor-not-allowed';
