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
import { useNavigate, Link } from 'react-router';
import { supabase } from '@/lib/supabase';
import { getConsent, writeConsent } from '@/data/consent';
import { listPosters, deletePoster } from '@/data/posters';
import { ConfirmModal } from '@/components/ConfirmModal';
import { resetOnboarding } from '@/components/OnboardingTour';
import { getAllTemplates, saveCustomTemplates } from '@/poster/GuidelinesPanel';
import { PasswordStrength, isPasswordValid } from '@/components/PasswordStrength';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { listMyFeedback, type FeedbackRow } from '@/data/feedback';
import { usePublishFlowStore } from '@/stores/publishFlowStore';
import { PublicFooter } from '@/components/PublicFooter';
import { PresetEditModal } from '@/components/PresetEditModal';
import {
  listMyGallery,
  retractGalleryEntry,
  labelForField,
  type GalleryEntryWithUrls,
} from '@/data/gallery';
import { GALLERY_PUBLIC_ENABLED } from '@/config/features';
import type { User } from '@supabase/supabase-js';
import { APP_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';
import { usePlan, type PlanState } from '@/hooks/usePlan';
import { openBillingPortal, requestRefund } from '@/data/billing';

type ConfirmAction =
  | 'deletePosters'
  | 'deleteAccount'
  | { kind: 'retractGalleryEntry'; entry: GalleryEntryWithUrls }
  | null;

export default function Profile() {
  useDocumentMeta(APP_ROUTE_META['/profile'] ?? null);
  const plan = usePlan();

  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [posterCount, setPosterCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [exportingData, setExportingData] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [myFeedback, setMyFeedback] = useState<FeedbackRow[]>([]);
  const openFeedback = useFeedbackStore((s) => s.open);
  const feedbackModalOpen = useFeedbackStore((s) => s.isOpen);
  const [myGallery, setMyGallery] = useState<GalleryEntryWithUrls[]>([]);
  const openUploadFlow = usePublishFlowStore((s) => s.openForUpload);
  const publishStep = usePublishFlowStore((s) => s.step);
  const [researchConsent, setResearchConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [presetCount, setPresetCount] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('postr.style-presets');
      return raw ? (JSON.parse(raw) as unknown[]).length : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      if (data.user) {
        // Reflect the stored consents so the toggles start in the right
        // state. Non-critical: a read failure just leaves them off.
        const consent = await getConsent(data.user.id);
        setResearchConsent(consent.research);
        setMarketingConsent(consent.marketing);
      }
      try {
        const posters = await listPosters();
        setPosterCount(posters.length);
      } catch {
        // Non-critical — show 0
      }
      setLoading(false);
    })();
  }, []);

  // Reload the user's feedback list whenever the modal closes, so a
  // successful submission immediately appears in "Your submissions".
  useEffect(() => {
    if (feedbackModalOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await listMyFeedback();
        if (!cancelled) setMyFeedback(rows);
      } catch {
        // Non-critical — leave the list as-is
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [feedbackModalOpen]);

  // Reload the user's gallery submissions whenever the publish flow
  // closes. Catches both fresh publishes and retracted entries.
  useEffect(() => {
    if (publishStep !== 'closed') return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await listMyGallery();
        if (!cancelled) setMyGallery(rows);
      } catch {
        // Non-critical — leave the list as-is
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publishStep]);

  const handleRetractConfirmed = useCallback(
    async (entry: GalleryEntryWithUrls) => {
      try {
        await retractGalleryEntry(entry);
        setMyGallery((prev) => prev.filter((e) => e.id !== entry.id));
        setActionStatus('Gallery entry retracted.');
        setTimeout(() => setActionStatus(null), 3000);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Retract failed.');
      }
    },
    [],
  );

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

  // Toggle product-research email consent. Writes research_consent_at
  // ONLY when the state actually changes, and only when turning ON does
  // it stamp a fresh timestamp — withdrawing sets it back to null. The
  // owner's own RLS update policy covers this (consent is user-owned,
  // unlike `plan`). Optimistic: flip the UI first, revert on failure.
  const handleResearchConsent = useCallback(
    async (next: boolean) => {
      if (!user || savingConsent) return;
      setSavingConsent(true);
      setResearchConsent(next); // optimistic
      const ok = await writeConsent(user.id, { research: next, marketing: marketingConsent });
      if (!ok) {
        setResearchConsent(!next); // revert
        setActionError('Could not save that preference. Please try again.');
        setTimeout(() => setActionError(null), 3000);
      }
      setSavingConsent(false);
    },
    [user, savingConsent, marketingConsent],
  );

  const handleMarketingConsent = useCallback(
    async (next: boolean) => {
      if (!user || savingConsent) return;
      setSavingConsent(true);
      setMarketingConsent(next); // optimistic
      const ok = await writeConsent(user.id, { research: researchConsent, marketing: next });
      if (!ok) {
        setMarketingConsent(!next); // revert
        setActionError('Could not save that preference. Please try again.');
        setTimeout(() => setActionError(null), 3000);
      }
      setSavingConsent(false);
    },
    [user, savingConsent, researchConsent],
  );

  const handleExportData = useCallback(async () => {
    setExportError(null);
    setExportingData(true);
    try {
      // `export_my_data` is a SECURITY DEFINER RPC that returns the
      // calling user's full data blob. Supabase types don't know
      // about it yet (the generated `Database` type lags migrations)
      // so we use `as never` to bypass the name check — same
      // pattern already used for `delete_own_account` below.
      const { data, error } = await supabase.rpc('export_my_data' as never);
      if (error) throw error;
      // Prompt a download with the returned JSON. Using a Blob +
      // object URL keeps the payload entirely client-side; nothing
      // touches disk until the user confirms the browser dialog.
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      a.download = `postr-export-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setActionStatus('Data export downloaded.');
      setTimeout(() => setActionStatus(null), 4000);
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : 'Export failed. Please try again or contact support.',
      );
    } finally {
      setExportingData(false);
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (!action) return;

    setActionError(null);

    if (typeof action === 'object' && action.kind === 'retractGalleryEntry') {
      await handleRetractConfirmed(action.entry);
      return;
    }

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

        // 2. Delete the auth user via Postgres RPC (security definer)
        // This removes the user from auth.users so the email can be re-used.
        // The function uses auth.uid() so users can only delete themselves.
        const { error: rpcError } = await supabase.rpc('delete_own_account' as never);
        if (rpcError) {
          // Non-fatal — user data is already deleted, just the auth record remains
          console.warn('Could not delete auth user:', rpcError.message);
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
  }, [confirmAction, navigate, handleRetractConfirmed]);

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
          <p className="text-[14pt] text-[#8b8f99]">Loading…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen w-screen flex-col bg-[#0a0a12] text-[#c8cad0]">
      <Header />

      <div className="mx-auto w-full max-w-5xl flex-1 px-8 py-8">
        {actionStatus && (
          <div className="mb-4 rounded-md border border-[#a6e3a1]/40 bg-[#a6e3a1]/10 px-3 py-2 text-[14pt] text-[#a6e3a1]">
            {actionStatus}
          </div>
        )}
        {actionError && (
          <div className="mb-4 rounded-md border border-[#f87171]/40 bg-[#f87171]/10 px-3 py-2 text-[14pt] text-[#f87171]">
            {actionError}
          </div>
        )}

        <h1 className="mb-6 text-2xl font-bold text-white">Profile & settings</h1>

        {/*
          Bento grid — two equal columns, no wide boxes. Collapses to
          a single column on mobile. The Create Account banner (shown
          only to guests) is the one exception and spans the full row.
        */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Account — celebratory stats card */}
        <AccountCelebrationCard
          email={email}
          createdAt={createdAt}
          posterCount={posterCount}
          user={user}
        />

        {/* Link Account / Sign Up — shown only to guests */}
        {isAnonymous && (
          <Section title="Create an Account">
            <p className="mb-4 text-[14pt] text-[#8b8f99] leading-relaxed">
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
              <span className="text-[13px] text-[#8b8f99]">or use email</span>
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
          <p className="mb-3 text-[14pt] text-[#8b8f99] leading-relaxed">
            Optional — helps identify your posters and auto-fill author info.
          </p>
          <ProfileFields user={user} onStatusMessage={(msg) => {
            setActionStatus(msg);
            setTimeout(() => setActionStatus(null), 3000);
          }} />
        </Section>

        {/* Preferences */}
        <Section title="Preferences">
          <div className="flex items-start justify-between py-2 gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[14pt] text-[#c8cad0]">🎨 Saved style presets</div>
              <div className="mt-1 text-[14pt] text-[#8b8f99]">
                {presetCount} preset{presetCount === 1 ? '' : 's'} saved locally.
              </div>
              <div className="mt-1 text-[12pt] text-[#8b8f99]">
                Create new presets from the <strong className="text-[#9ca3af]">Style tab</strong> inside the editor — use the "Save as style preset" row to name your font + palette + typography combo.
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <button
                onClick={() => setPresetModalOpen(true)}
                className={btnSecondary}
                disabled={presetCount === 0}
                title={presetCount === 0 ? 'Save a preset from the editor first' : 'Rename or delete presets'}
              >
                Manage
              </button>
              <button
                onClick={() => {
                  clearPresets();
                  setPresetCount(0);
                }}
                className={btnDanger}
                disabled={presetCount === 0}
              >
                Clear all
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-[#1f1f2e]">
            <div>
              <div className="text-sm text-[#c8cad0]">Onboarding tour</div>
              <div className="text-[13px] text-[#8b8f99]">
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
          {/*
            Only for signed-in accounts with an email. An anonymous guest
            has no address, so the "email you" promise would be false and
            the stamped consent would point at an un-emailable row — the
            outreach query would collect rows it can never contact. Gated
            like the "Create an Account" block above.
          */}
          {!isAnonymous && email && (
            <>
              <div className="flex items-start justify-between gap-3 py-2 border-t border-[#1f1f2e]">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-[#c8cad0]">Product-research emails</div>
                  <div className="text-[13px] text-[#8b8f99]">
                    Let us occasionally email you to invite you to a short
                    interview or survey about Postr. Turn it on or off anytime.
                    It never affects your access.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={researchConsent}
                  aria-busy={savingConsent}
                  aria-label="Product-research emails"
                  disabled={savingConsent}
                  onClick={() => handleResearchConsent(!researchConsent)}
                  className={
                    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ' +
                    (researchConsent ? 'bg-[#5641b8]' : 'bg-[#2a2a3a]')
                  }
                >
                  <span
                    className={
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform ' +
                      (researchConsent ? 'translate-x-6' : 'translate-x-1')
                    }
                  />
                </button>
              </div>
              <div className="flex items-start justify-between gap-3 py-2 border-t border-[#1f1f2e]">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-[#c8cad0]">Product-update emails</div>
                  <div className="text-[13px] text-[#8b8f99]">
                    Occasional emails about new Postr features and updates.
                    Turn it on or off anytime; unsubscribe links are in every
                    email too.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={marketingConsent}
                  aria-busy={savingConsent}
                  aria-label="Product-update emails"
                  disabled={savingConsent}
                  onClick={() => handleMarketingConsent(!marketingConsent)}
                  className={
                    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ' +
                    (marketingConsent ? 'bg-[#5641b8]' : 'bg-[#2a2a3a]')
                  }
                >
                  <span
                    className={
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform ' +
                      (marketingConsent ? 'translate-x-6' : 'translate-x-1')
                    }
                  />
                </button>
              </div>
            </>
          )}
          <div className="py-2 border-t border-[#1f1f2e]">
            <div className="text-sm text-[#c8cad0] mb-2">Checklist templates</div>
            <div className="text-[13px] text-[#8b8f99] mb-3">
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
                          {t.builtIn && <span className="ml-2 text-[13px] text-[#8b8f99]">(built-in)</span>}
                        </div>
                        <div className="text-[13px] text-[#8b8f99]">{t.items.length} items</div>
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
                    <div className="text-[13px] text-[#8b8f99]">
                      No custom templates yet. Use "Save as..." in the editor's Scratch Pad to create one.
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </Section>

        {/* Gallery submissions — while the gallery is offline the section
            only appears for users who still have published entries, so they
            keep the ability to retract. */}
        {(GALLERY_PUBLIC_ENABLED || myGallery.length > 0) && (
        <Section title="Gallery submissions">
          {GALLERY_PUBLIC_ENABLED ? (
            <p className="mb-4 text-[14pt] text-[#8b8f99] leading-relaxed">
              Posters you have published to the{' '}
              <Link to="/gallery" className="text-[#7c6aed] underline">
                public gallery
              </Link>
              . You can retract any entry at any time — it disappears from the
              public listing immediately.
            </p>
          ) : (
            <p className="mb-4 text-[14pt] text-[#8b8f99] leading-relaxed">
              Posters you published while the gallery was open. The gallery is
              currently offline, but you can still retract any entry at any
              time — the entry row and stored image are deleted.
            </p>
          )}
          {GALLERY_PUBLIC_ENABLED && (
            <div className="mb-4 flex gap-2">
              <button onClick={openUploadFlow} className={btnSecondary}>
                Upload external PDF or image
              </button>
            </div>
          )}

          {myGallery.length === 0 ? (
            <div className="rounded-md border border-dashed border-[#2a2a3a] bg-[#0a0a12] p-6 text-center text-[13px] text-[#8b8f99]">
              {GALLERY_PUBLIC_ENABLED ? (
                <>
                  You haven’t published anything yet. Use the{' '}
                  <strong>Publish</strong> button on a poster card, the Publish
                  button in the editor, or the upload button above.
                </>
              ) : (
                // Defensive, not currently reachable: the section above
                // only renders when the flag is on OR the user has
                // entries, so an empty list implies the flag is on. Kept
                // because the copy above names publish buttons that no
                // longer render while the gallery is offline, and this
                // branch is what keeps that honest if the outer
                // condition ever changes.
                <>You haven’t published anything to the gallery.</>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {myGallery.map((entry) => (
                <GallerySubmissionRow
                  key={entry.id}
                  entry={entry}
                  onRetract={() =>
                    setConfirmAction({ kind: 'retractGalleryEntry', entry })
                  }
                />
              ))}
            </div>
          )}
        </Section>
        )}

        {/* Feedback */}
        <Section title="Feedback">
          <p className="mb-4 text-[14pt] text-[#8b8f99] leading-relaxed">
            Found a bug? Have an idea? Send it in — everything lands in the developer's
            queue and shapes what ships next.
          </p>
          <div className="mb-4 flex gap-2">
            <button onClick={() => openFeedback('bug')} className={btnSecondary}>
              Report a bug
            </button>
            <button onClick={() => openFeedback('feature')} className={btnSecondary}>
              Request a feature
            </button>
            <button onClick={() => openFeedback('other')} className={btnSecondary}>
              Other
            </button>
          </div>

          {myFeedback.length > 0 && (
            <>
              <div className="mb-2 mt-6 text-[12px] font-semibold uppercase tracking-widest text-[#8b8f99]">
                Your submissions
              </div>
              <div className="space-y-2">
                {myFeedback.map((row) => (
                  <FeedbackHistoryRow key={row.id} row={row} />
                ))}
              </div>
            </>
          )}
        </Section>

        {/* Subscription / billing — ALWAYS shown (free users see the plan
            state + a path to upgrade). Managed Payments makes Link the
            merchant of record, so management (cancel, update card, receipts)
            happens via the Stripe billing portal, falling back to link.com. */}
        <Section title="Subscription">
          <SubscriptionPanel plan={plan} />
        </Section>

        {/* Data export — GDPR Art. 15 / 20 */}
        <Section title="Your data">
          <div className="space-y-3">
            <p className="text-[14pt] text-[#8b8f99]">
              Download everything Postr has stored for your account as a
              single JSON file — your posters (with full contents),
              gallery submissions, feedback you've sent, and your
              profile. Useful for backups, or to comply with GDPR Art.
              15 / 20 right-of-access requests.
            </p>
            <button
              type="button"
              onClick={handleExportData}
              disabled={exportingData}
              className="rounded-md border border-[#2a2a3a] bg-[#111118] px-4 py-2 text-[14pt] font-medium text-[#c8cad0] hover:border-[#7c6aed] hover:text-[#fff] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportingData ? 'Preparing…' : '↓ Download my data (JSON)'}
            </button>
            {exportError && (
              <div
                role="alert"
                className="rounded-md border border-[#f87171] bg-[#7f1d1d33] p-3 text-[13pt] text-[#fecaca]"
              >
                {exportError}
              </div>
            )}
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
      </div>

      <PresetEditModal
        open={presetModalOpen}
        onClose={() => setPresetModalOpen(false)}
        onChange={setPresetCount}
      />

      <ConfirmModal
        open={confirmAction !== null}
        title={confirmModalTitle(confirmAction)}
        message={confirmModalMessage(confirmAction, posterCount)}
        confirmLabel={confirmModalLabel(confirmAction)}
        danger
        typedConfirmation={confirmAction === 'deleteAccount' ? 'I confirm the deletion of my account' : undefined}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />

      <PublicFooter />
    </main>
  );
}

// ── Shared sub-components ──────────────────────────────────────────

function confirmModalTitle(action: ConfirmAction): string {
  if (action && typeof action === 'object' && action.kind === 'retractGalleryEntry') {
    return 'Retract from gallery';
  }
  if (action === 'deleteAccount') return 'Delete account';
  return 'Delete all posters';
}

function confirmModalMessage(action: ConfirmAction, posterCount: number): string {
  if (action && typeof action === 'object' && action.kind === 'retractGalleryEntry') {
    return `Remove "${action.entry.title}" from the public gallery? The entry row and stored image will be deleted. Third parties may still have cached copies.`;
  }
  if (action === 'deleteAccount') {
    return 'This will permanently delete your account, all posters, and all preferences. You will be signed out. This action cannot be undone.';
  }
  return `Permanently delete all ${posterCount} poster(s)? This cannot be undone.`;
}

function confirmModalLabel(action: ConfirmAction): string {
  if (action && typeof action === 'object' && action.kind === 'retractGalleryEntry') {
    return 'Retract';
  }
  if (action === 'deleteAccount') return 'Delete my account';
  return 'Delete all';
}

function GallerySubmissionRow({
  entry,
  onRetract,
}: {
  entry: GalleryEntryWithUrls;
  onRetract: () => void;
}) {
  const date = new Date(entry.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  // An entry with retracted_at + retracted_by populated was taken
  // down by a moderator. Owner-initiated retraction hard-deletes the
  // row entirely, so we'll never see both cases on the same row.
  const moderatorRetracted =
    entry.retracted_at !== null && entry.retracted_by !== null;

  return (
    <div
      className={`flex items-start gap-3 rounded-md border p-3 ${
        moderatorRetracted
          ? 'border-[#f87171]/30 bg-[#f87171]/5'
          : 'border-[#1f1f2e] bg-[#0a0a12]'
      }`}
    >
      <img
        src={entry.image_url}
        alt={entry.title}
        className={`h-16 w-16 shrink-0 rounded object-cover ${moderatorRetracted ? 'opacity-60' : ''}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded bg-[#1a1a26] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#7c6aed]">
            {labelForField(entry.field)}
          </span>
          {moderatorRetracted && (
            <span className="rounded bg-[#f87171]/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#f87171]">
              Retracted by moderator
            </span>
          )}
          {GALLERY_PUBLIC_ENABLED ? (
            <Link
              to={`/gallery/${entry.id}`}
              className="truncate text-[13px] font-medium text-[#c8cad0] no-underline hover:text-white"
            >
              {entry.title}
            </Link>
          ) : (
            <span className="truncate text-[13px] font-medium text-[#c8cad0]">
              {entry.title}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-[#8b8f99]">
          Published {date}
          {entry.conference && ` · ${entry.conference}`}
          {entry.year && ` · ${entry.year}`}
        </div>
        {moderatorRetracted && entry.retraction_reason && (
          <div className="mt-2 border-l-2 border-[#f87171] bg-[#f87171]/5 px-2 py-1 text-[12px] leading-relaxed text-[#f87171]">
            <strong>Moderator note:</strong> {entry.retraction_reason}
          </div>
        )}
      </div>
      {!moderatorRetracted && (
        <button
          type="button"
          onClick={onRetract}
          className="shrink-0 rounded-md border border-[#2a2a3a] bg-[#1a1a26] px-3 py-1.5 text-[12px] font-medium text-[#f87171] hover:border-[#f87171]"
        >
          Retract
        </button>
      )}
    </div>
  );
}

const FEEDBACK_STATUS_LABEL: Record<FeedbackRow['status'], string> = {
  new: 'Received',
  triaged: 'Triaged',
  in_progress: 'In progress',
  done: 'Shipped',
  wontfix: 'Declined',
};

const FEEDBACK_STATUS_COLOR: Record<FeedbackRow['status'], string> = {
  new: '#8b8f99',
  triaged: '#7c6aed',
  in_progress: '#f59e0b',
  done: '#a6e3a1',
  wontfix: '#8b8f99',
};

function FeedbackHistoryRow({ row }: { row: FeedbackRow }) {
  const date = new Date(row.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const kindLabel = row.kind === 'bug' ? 'Bug' : row.kind === 'feature' ? 'Feature' : 'Other';
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-[#1f1f2e] bg-[#0a0a12] px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded bg-[#1a1a26] px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[#7c6aed]">
            {kindLabel}
          </span>
          <span className="truncate text-[13px] font-medium text-[#c8cad0]">{row.title}</span>
        </div>
        <div className="mt-0.5 text-[11px] text-[#8b8f99]">{date}</div>
      </div>
      <span
        className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium"
        style={{
          color: FEEDBACK_STATUS_COLOR[row.status],
          background: `${FEEDBACK_STATUS_COLOR[row.status]}1a`,
          border: `1px solid ${FEEDBACK_STATUS_COLOR[row.status]}33`,
        }}
      >
        {FEEDBACK_STATUS_LABEL[row.status]}
      </span>
    </div>
  );
}

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
      <Link to="/dashboard" className="text-sm text-[#8b8f99] no-underline hover:text-[#c8cad0]">
        ← Back to posters
      </Link>
    </header>
  );
}

function Section({
  title,
  children,
  danger,
}: {
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section className="flex flex-col">
      <h2
        className={`mb-3 text-[12pt] font-semibold uppercase tracking-widest ${
          danger ? 'text-[#f87171]' : 'text-[#8b8f99]'
        }`}
      >
        {title}
      </h2>
      <div
        className={`flex-1 rounded-xl border ${
          danger ? 'border-[#f87171]/30' : 'border-[#1f1f2e]'
        } bg-[#111118] p-5`}
      >
        {children}
      </div>
    </section>
  );
}

// ── AccountCelebrationCard — exciting stats-style intro card ───────

function AccountCelebrationCard({
  email,
  createdAt,
  posterCount,
  user,
}: {
  email: string | null;
  createdAt: string;
  posterCount: number;
  user: User | null;
}) {
  // Days since the account was created — used for the supporting
  // "crafting for N days" line. Guests usually see 0 or 1.
  const daysActive = (() => {
    if (!user?.created_at) return 0;
    const ms = Date.now() - new Date(user.created_at).getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  })();

  const message = (() => {
    if (posterCount === 0)
      return 'Your canvas is waiting — start your first poster! ✨';
    if (posterCount === 1) return 'Welcome to the club! 🎉';
    if (posterCount <= 3) return "You're getting the hang of it! 🌱";
    if (posterCount <= 7) return "You're on a roll! 🚀";
    if (posterCount <= 15) return 'Power user in training ⚡';
    return 'Certified poster pro 🏆';
  })();

  const label = posterCount === 1 ? 'poster crafted' : 'posters crafted';

  return (
    <section className="flex flex-col">
      <h2 className="mb-3 text-[12pt] font-semibold uppercase tracking-widest text-[#8b8f99]">
        Account
      </h2>
      <div
        className="relative flex-1 overflow-hidden rounded-xl border border-[#7c6aed]/30 bg-gradient-to-br from-[#1a1530] via-[#15131f] to-[#111118] p-6"
      >
        {/* Decorative sparkle blobs in the background */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(124,106,237,0.25) 0%, rgba(124,106,237,0) 70%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(162,89,247,0.18) 0%, rgba(162,89,247,0) 70%)',
          }}
        />

        <div className="relative flex items-baseline gap-3">
          <span
            className="font-bold leading-none text-[#c9bfff]"
            style={{ fontSize: '72px', letterSpacing: '-0.02em' }}
          >
            {posterCount}
          </span>
          <span className="text-[14pt] text-[#c8cad0]">{label}</span>
        </div>

        <div className="relative mt-3 text-[14pt] font-medium text-[#e2e2e8]">
          {message}
        </div>

        <div className="relative mt-5 space-y-1.5 text-[14pt] leading-relaxed text-[#9ca3af]">
          <div>
            <span className="text-[#8b8f99]">📧 </span>
            {email ?? 'Guest (no email linked yet)'}
          </div>
          <div>
            <span className="text-[#8b8f99]">📅 </span>
            Member since {createdAt}
            {daysActive > 0 && (
              <span className="text-[#8b8f99]"> · {daysActive}d</span>
            )}
          </div>
        </div>
      </div>
    </section>
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
        <div className="text-[14pt] font-medium text-[#c8cad0]">{title}</div>
        <div className="text-[14pt] text-[#8b8f99] mt-1">{description}</div>
      </div>
      <button onClick={onClick} disabled={disabled} className={btnDanger}>
        {buttonText}
      </button>
    </div>
  );
}

// ── SubscriptionPanel — plan state + manage/upgrade, always shown ──

function SubscriptionPanel({ plan }: { plan: PlanState }) {
  const [opening, setOpening] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [refundMsg, setRefundMsg] = useState<string | null>(null);

  const handleManage = async () => {
    setOpening(true);
    // Prefer the Stripe portal (deep-links to their own subscription),
    // falling back to link.com — openBillingPortal never rejects.
    const url = await openBillingPortal();
    window.open(url, '_blank', 'noopener,noreferrer');
    setOpening(false);
  };

  // Request a refund. The server decides eligibility; we surface the
  // outcome. A generic message on failure per the house error rule, but the
  // specific 409 reasons are mapped to something actionable.
  const handleRefund = async (kind: 'term' | 'pack') => {
    setRefunding(true);
    setRefundMsg(null);
    try {
      const { amountCents } = await requestRefund(kind);
      setRefundMsg(`Refunded CA$${(amountCents / 100).toFixed(2)}. It may take a few days to appear.`);
    } catch (err) {
      // Map known eligibility reasons; fall back to generic.
      const reason = (err as { body?: { error?: string } })?.body?.error;
      const map: Record<string, string> = {
        window_expired: 'The 14-day refund window has passed. You can cancel anytime to stop renewals.',
        already_used: 'This term isn’t refundable once you’ve taken a paid export.',
        no_unused_credits: 'You have no unused credits to refund.',
        no_pack_purchase: 'No refundable pack purchase found.',
      };
      setRefundMsg(reason && map[reason] ? map[reason] : 'We couldn’t process that refund. Please try again or contact support.');
    } finally {
      setRefunding(false);
    }
  };

  if (plan.loading) {
    return <p className="text-[14pt] text-[#8b8f99]">Loading your plan…</p>;
  }

  if (plan.hasActiveTerm) {
    return (
      <div className="space-y-3">
        <p className="text-[14pt] text-[#c8cad0]">
          Your term is active — PowerPoint and LaTeX export are unlocked, no
          watermark.
          {plan.subscriptionStatus === 'past_due' && (
            <span className="text-[#fbbf24]">
              {' '}There’s a payment issue on your latest renewal — update your
              card to keep your term.
            </span>
          )}
        </p>
        <p className="text-[14pt] text-[#8b8f99]">
          The term renews every 4 months. Manage it — update your card, see
          receipts, or cancel — through Stripe, which handles billing for Postr.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleManage}
            disabled={opening}
            className="rounded-md border border-[#2a2a3a] bg-[#111118] px-4 py-2 text-[14pt] font-medium text-[#c8cad0] hover:border-[#7c6aed] hover:text-[#fff] disabled:opacity-50"
          >
            {opening ? 'Opening…' : 'Manage subscription ↗'}
          </button>
          <button
            type="button"
            onClick={() => handleRefund('term')}
            disabled={refunding}
            className="rounded-md border border-[#2a2a3a] bg-transparent px-4 py-2 text-[14pt] font-medium text-[#9ca3af] hover:border-[#7c6aed] hover:text-[#fff] disabled:opacity-50"
          >
            {refunding ? 'Processing…' : 'Request refund'}
          </button>
        </div>
        <p className="text-[13pt] text-[#8b8f99]">
          Refundable in full within 14 days of your charge if you haven’t
          taken a paid export.
        </p>
        {refundMsg && <p className="text-[13pt] text-[#a3a7b3]">{refundMsg}</p>}
      </div>
    );
  }

  // No active term — the free state. Always show the export-credit balance
  // (0 if they never bought a pack, or the remaining count if they did —
  // credits never expire) and a "Get a subscription" CTA.
  const hasCredits = plan.credits > 0;
  return (
    <div className="space-y-3">
      <p className="text-[14pt] text-[#c8cad0]">
        You’re on the free plan — unlimited editing and print-ready PDF export,
        with a small “made with postr.sh” mark.
      </p>

      {/* Export-credit balance — shown even at 0 so the user always knows
          where they stand. Pack credits never expire. */}
      <div className="rounded-md border border-[#2a2a3a] bg-[#111118] px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[14pt] text-[#c8cad0]">Export credits</span>
          <span className="text-[18pt] font-bold text-[#e2e2e8]">
            {plan.credits}
          </span>
        </div>
        <p className="mt-1 text-[13pt] text-[#8b8f99]">
          {hasCredits
            ? `${plan.credits} PowerPoint or LaTeX export${plan.credits === 1 ? '' : 's'} left — credits never expire.`
            : 'From a $9.99 export pack. Credits never expire once purchased.'}
        </p>
        {hasCredits && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => handleRefund('pack')}
              disabled={refunding}
              className="rounded-md border border-[#2a2a3a] bg-transparent px-3 py-1.5 text-[13pt] font-medium text-[#9ca3af] hover:border-[#7c6aed] hover:text-[#fff] disabled:opacity-50"
            >
              {refunding ? 'Processing…' : `Refund ${plan.credits} unused credit${plan.credits === 1 ? '' : 's'}`}
            </button>
            <p className="mt-1 text-[12pt] text-[#8b8f99]">
              CA$3.33 per unused credit. Refunding removes them from your account.
            </p>
            {refundMsg && <p className="mt-1 text-[13pt] text-[#a3a7b3]">{refundMsg}</p>}
          </div>
        )}
      </div>

      <p className="text-[14pt] text-[#8b8f99]">
        Unlock clean PowerPoint &amp; LaTeX export with the term, or a one-time
        export pack whose credits never expire.
      </p>
      <Link
        to="/pricing"
        className="inline-block rounded-md border border-[#7c6aed] bg-transparent px-4 py-2 text-[14pt] font-semibold text-[#7c6aed] no-underline hover:bg-[#5641b8] hover:text-white"
      >
        Get a subscription
      </Link>
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
        aria-label="Email address"
        required
        className="w-full rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-4 py-3 text-sm text-[#e2e2e8] outline-none focus:border-[#7c6aed] placeholder:text-[#8b8f99]"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Create password"
        aria-label="Create password"
        required
        minLength={8}
        className="w-full rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-4 py-3 text-sm text-[#e2e2e8] outline-none focus:border-[#7c6aed] placeholder:text-[#8b8f99]"
      />
      <PasswordStrength password={password} />
      <button
        type="submit"
        disabled={loading || !email.trim() || !isPasswordValid(password)}
        className="w-full cursor-pointer rounded-lg border border-[#7c6aed] bg-transparent px-4 py-3 text-sm font-semibold text-[#7c6aed] hover:bg-[#5641b8] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
      <label htmlFor={`profile-${field}`} className="block text-sm text-[#9ca3af] mb-1">{label}</label>
      <input
        id={`profile-${field}`}
        value={profile[field]}
        onChange={(e) => update(field, e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-4 py-2.5 text-sm text-[#e2e2e8] outline-none focus:border-[#7c6aed] placeholder:text-[#8b8f99]"
      />
      {hint && <div className="text-[13px] text-[#8b8f99] mt-1">{hint}</div>}
    </div>
  );

  return (
    <div>
      {fieldRow('Display name', 'displayName', 'e.g. Dr. Jane Smith', 'Used for author auto-fill')}
      {fieldRow('Institution', 'institution', 'e.g. Acme State University')}
      {fieldRow('Department', 'department', 'e.g. Department of Psychology')}
      {fieldRow('ORCID', 'orcid', 'e.g. 0000-0002-1234-5678', 'Optional — links to your ORCID profile')}
      {fieldRow('Website / Lab page', 'website', 'e.g. https://lab.example.com')}
      <button
        onClick={save}
        disabled={!dirty}
        className={`mt-2 ${dirty ? 'cursor-pointer rounded-md bg-[#5641b8] px-4 py-2 text-sm font-medium text-white hover:bg-[#4c39a6]' : 'cursor-not-allowed rounded-md bg-[#2d6a4f] px-4 py-2 text-sm font-medium text-white opacity-80'}`}
      >
        {dirty ? 'Save profile' : '✓ Saved'}
      </button>
    </div>
  );
}

// ── Button styles (Tailwind classes) ───────────────────────────────

const btnPrimary =
  'cursor-pointer rounded-md bg-[#5641b8] px-4 py-2 text-sm font-medium text-white hover:bg-[#4c39a6] disabled:opacity-50 disabled:cursor-not-allowed';

const btnSecondary =
  'cursor-pointer rounded-md border border-[#2a2a3a] bg-[#1a1a26] px-3 py-1.5 text-[13px] text-[#c8cad0] hover:bg-[#1e1e2e] disabled:opacity-50 disabled:cursor-not-allowed';

const btnDanger =
  'cursor-pointer whitespace-nowrap rounded-md border border-[#f87171]/40 bg-transparent px-3 py-1.5 text-[13px] text-[#f87171] hover:bg-[#f87171]/10 disabled:opacity-30 disabled:cursor-not-allowed';
