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
import { resetOnboarding } from '@/components/OnboardingTour';
import { getAllTemplates, saveCustomTemplates } from '@/poster/GuidelinesPanel';
import { PasswordStrength, isPasswordValid } from '@/components/PasswordStrength';
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
        // 1. Delete all posters (client-side, RLS-protected)
        const posters = await listPosters();
        for (const p of posters) {
          await deletePoster(p.id);
        }

        // 2. Delete the auth user via Edge Function (requires service_role)
        // This removes the user from auth.users so the email can be re-used.
        // Falls back gracefully if the function isn't deployed yet.
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            await supabase.functions.invoke('delete-account', {
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
          }
        } catch {
          // Edge function not deployed — sign out only (user remains in auth.users)
        }

        // 3. Clear all local data
        localStorage.removeItem('postr.style-presets');
        localStorage.removeItem('postr.scratch-pad');
        localStorage.removeItem('postr.scratch-note');
        localStorage.removeItem('postr.checklist-templates');
        localStorage.removeItem('postr.profile');
        localStorage.removeItem('postr.onboarding-done');

        // 4. Sign out + redirect
        await supabase.auth.signOut({ scope: 'global' });
        navigate('/auth');
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
          <div className="mb-4 rounded-md border border-[#a6e3a1]/40 bg-[#a6e3a1]/10 px-3 py-2 text-[13px] text-[#a6e3a1]">
            {actionStatus}
          </div>
        )}
        {actionError && (
          <div className="mb-4 rounded-md border border-[#f87171]/40 bg-[#f87171]/10 px-3 py-2 text-[13px] text-[#f87171]">
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

        {/* Link Account / Sign Up */}
        {isAnonymous && (
          <Section title="Create an Account">
            <p className="mb-4 text-[13px] text-[#6b7280] leading-relaxed">
              You're using a guest account. Sign up to preserve your posters across devices
              and prevent data loss if your browser clears storage. All your current work
              will be linked to your new account automatically.
            </p>
            <button onClick={signInWithGoogle} className={`${btnPrimary} w-full flex items-center justify-center gap-3 mb-3`}>
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#fff" fillOpacity="0.7" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#fff" fillOpacity="0.5" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#fff" fillOpacity="0.85" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign up with Google
            </button>
            <div className="flex items-center gap-3 my-3">
              <div className="h-px flex-1 bg-[#2a2a3a]" />
              <span className="text-[13px] text-[#555]">or use email</span>
              <div className="h-px flex-1 bg-[#2a2a3a]" />
            </div>
            <EmailSignUp
              onSuccess={() => {
                setActionStatus('Account created! Your guest data has been linked.');
                setTimeout(() => setActionStatus(null), 5000);
                // Re-fetch user
                supabase.auth.getUser().then(({ data }) => setUser(data.user));
              }}
              onError={(msg) => setActionError(msg)}
            />
          </Section>
        )}

        {/* Profile Details */}
        <Section title="Profile Details">
          <p className="mb-3 text-[13px] text-[#6b7280]">
            Optional — helps identify your posters and auto-fill author info.
          </p>
          <ProfileFields user={user} onStatusMessage={(msg) => {
            setActionStatus(msg);
            setTimeout(() => setActionStatus(null), 3000);
          }} />
        </Section>

        {/* Preferences */}
        <Section title="Preferences">
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm text-[#c8cad0]">Saved style presets</div>
              <div className="text-[13px] text-[#6b7280]">
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
          <div className="flex items-center justify-between py-2 border-t border-[#1f1f2e]">
            <div>
              <div className="text-sm text-[#c8cad0]">Onboarding tour</div>
              <div className="text-[13px] text-[#6b7280]">
                Click-through tutorial of the editor interface
              </div>
            </div>
            <button
              onClick={() => {
                resetOnboarding();
                setActionStatus('Tour reset — it will play next time you open a poster.');
                setTimeout(() => setActionStatus(null), 3000);
              }}
              className={btnSecondary}
            >
              Replay tour
            </button>
          </div>
          <div className="py-2 border-t border-[#1f1f2e]">
            <div className="text-sm text-[#c8cad0] mb-2">Checklist templates</div>
            <div className="text-[13px] text-[#6b7280] mb-3">
              Custom templates you saved from the Scratch Pad. Built-in templates cannot be deleted.
            </div>
            {(() => {
              const templates = getAllTemplates();
              const custom = templates.filter((t) => !t.builtIn);
              return (
                <div className="space-y-2">
                  {templates.map((t) => (
                    <div key={t.name} className="flex items-center justify-between rounded-md border border-[#1f1f2e] bg-[#0a0a12] px-3 py-2">
                      <div>
                        <div className="text-[13px] font-medium text-[#c8cad0]">
                          {t.name}
                          {t.builtIn && <span className="ml-2 text-[13px] text-[#6b7280]">(built-in)</span>}
                        </div>
                        <div className="text-[13px] text-[#6b7280]">{t.items.length} items</div>
                      </div>
                      {!t.builtIn && (
                        <button
                          onClick={() => {
                            const next = custom.filter((c) => c.name !== t.name);
                            saveCustomTemplates(next);
                            setActionStatus(`Deleted template "${t.name}".`);
                            setTimeout(() => setActionStatus(null), 3000);
                          }}
                          className={btnDanger}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
                  {custom.length === 0 && (
                    <div className="text-[13px] text-[#6b7280]">
                      No custom templates yet. Use "Save as..." in the editor's Scratch Pad to create one.
                    </div>
                  )}
                </div>
              );
            })()}
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
      <Link to="/dashboard" className="flex items-center gap-3 text-xl font-semibold tracking-tight text-[#c8cad0] no-underline hover:text-white">
        <svg width="28" height="28" viewBox="0 0 64 64" fill="none">
          <rect width="64" height="64" rx="12" fill="#7c6aed" />
          <path d="M14 14 C32 14, 32 50, 50 50" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.95" />
          <path d="M14 50 C32 50, 32 14, 50 14" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.55" />
          <circle cx="32" cy="32" r="5" fill="white" />
        </svg>
        Postr
      </Link>
      <Link to="/dashboard" className="text-sm text-[#6b7280] no-underline hover:text-[#c8cad0]">
        ← Back to posters
      </Link>
    </header>
  );
}

function Section({ title, children, danger }: { title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <section className="mb-8">
      <h2
        className={`mb-4 text-[13px] font-semibold uppercase tracking-widest ${
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
        <div className="text-[13px] text-[#6b7280] mt-1">{description}</div>
      </div>
      <button onClick={onClick} disabled={disabled} className={btnDanger}>
        {buttonText}
      </button>
    </div>
  );
}

// ── EmailSignUp — inline email/password form for guest → account ───

function EmailSignUp({ onSuccess, onError }: { onSuccess: () => void; onError: (msg: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    // updateUser links the email+password identity to the current anonymous user
    const { error } = await supabase.auth.updateUser({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      onError(error.message);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email address"
        required
        className="w-full rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-4 py-3 text-sm text-[#e2e2e8] outline-none focus:border-[#7c6aed] placeholder:text-[#555]"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Create password"
        required
        minLength={8}
        className="w-full rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-4 py-3 text-sm text-[#e2e2e8] outline-none focus:border-[#7c6aed] placeholder:text-[#555]"
      />
      <PasswordStrength password={password} />
      <button
        type="submit"
        disabled={loading || !email.trim() || !isPasswordValid(password)}
        className="w-full cursor-pointer rounded-lg border border-[#7c6aed] bg-transparent px-4 py-3 text-sm font-semibold text-[#7c6aed] hover:bg-[#7c6aed] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Creating account…' : 'Create account with email'}
      </button>
    </form>
  );
}

// ── ProfileFields — optional metadata (name, institution, etc.) ────

const PROFILE_KEY = 'postr.profile';

interface ProfileData {
  displayName: string;
  institution: string;
  department: string;
  orcid: string;
  website: string;
}

function loadProfile(): ProfileData {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? { ...defaultProfile(), ...JSON.parse(raw) } : defaultProfile();
  } catch {
    return defaultProfile();
  }
}

function defaultProfile(): ProfileData {
  return { displayName: '', institution: '', department: '', orcid: '', website: '' };
}

function ProfileFields({ user, onStatusMessage }: { user: User | null; onStatusMessage: (msg: string) => void }) {
  const [profile, setProfile] = useState<ProfileData>(loadProfile);
  const [dirty, setDirty] = useState(false);

  const update = (field: keyof ProfileData, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const save = () => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    setDirty(false);
    onStatusMessage('Profile saved.');
  };

  const fieldRow = (label: string, field: keyof ProfileData, placeholder: string, hint?: string) => (
    <div className="mb-3">
      <label className="block text-sm text-[#9ca3af] mb-1">{label}</label>
      <input
        value={profile[field]}
        onChange={(e) => update(field, e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-4 py-2.5 text-sm text-[#e2e2e8] outline-none focus:border-[#7c6aed] placeholder:text-[#555]"
      />
      {hint && <div className="text-[13px] text-[#555] mt-1">{hint}</div>}
    </div>
  );

  return (
    <div>
      {fieldRow('Display name', 'displayName', 'e.g. Dr. Maya Chen', 'Used for author auto-fill')}
      {fieldRow('Institution', 'institution', 'e.g. McGill University')}
      {fieldRow('Department', 'department', 'e.g. Department of Psychology')}
      {fieldRow('ORCID', 'orcid', 'e.g. 0000-0002-1234-5678', 'Optional — links to your ORCID profile')}
      {fieldRow('Website / Lab page', 'website', 'e.g. https://lab.example.com')}
      <button
        onClick={save}
        disabled={!dirty}
        className={`mt-2 ${dirty ? 'cursor-pointer rounded-md bg-[#7c6aed] px-4 py-2 text-sm font-medium text-white hover:bg-[#6c5ce7]' : 'cursor-not-allowed rounded-md bg-[#2d6a4f] px-4 py-2 text-sm font-medium text-white opacity-80'}`}
      >
        {dirty ? 'Save profile' : '✓ Saved'}
      </button>
    </div>
  );
}

// ── Button styles (Tailwind classes) ───────────────────────────────

const btnPrimary =
  'cursor-pointer rounded-md bg-[#7c6aed] px-4 py-2 text-sm font-medium text-white hover:bg-[#6c5ce7] disabled:opacity-50 disabled:cursor-not-allowed';

const btnSecondary =
  'cursor-pointer rounded-md border border-[#2a2a3a] bg-[#1a1a26] px-3 py-1.5 text-[13px] text-[#c8cad0] hover:bg-[#1e1e2e] disabled:opacity-50 disabled:cursor-not-allowed';

const btnDanger =
  'cursor-pointer whitespace-nowrap rounded-md border border-[#f87171]/40 bg-transparent px-3 py-1.5 text-[13px] text-[#f87171] hover:bg-[#f87171]/10 disabled:opacity-30 disabled:cursor-not-allowed';
