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
 *   - Linked accounts (convert anonymous → Google/email, in place —
 *     profile/GuestConversionCard)
 *   - Data management (export all, delete all posters, delete account —
 *     deletion goes through the API so billing is wound down first,
 *     profile/accountDeletion)
 *   - Style presets management (clear saved presets)
 *
 * The cards live in src/profile/* — this file owns page state and the
 * layout; keeping it under the file-size ceiling is why they are split.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { supabase } from '@/lib/supabase';
import { getConsent, writeConsent } from '@/data/consent';
import { listPosters, deletePoster } from '@/data/posters';
import { ConfirmModal } from '@/components/ConfirmModal';
import { resetOnboarding } from '@/components/OnboardingTour';
import { getAllTemplates, saveCustomTemplates } from '@/poster/GuidelinesPanel';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { listMyFeedback, type FeedbackRow } from '@/data/feedback';
import { usePublishFlowStore } from '@/stores/publishFlowStore';
import { PublicFooter } from '@/components/PublicFooter';
import { PresetEditModal } from '@/components/PresetEditModal';
import {
  listMyGallery,
  retractGalleryEntry,
  type GalleryEntryWithUrls,
} from '@/data/gallery';
import { GALLERY_PUBLIC_ENABLED } from '@/config/features';
import type { User } from '@supabase/supabase-js';
import { APP_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';
import { usePlan } from '@/hooks/usePlan';
import { ProfileHeader, Section } from '@/profile/ProfileChrome';
import { AccountCelebrationCard } from '@/profile/AccountCelebrationCard';
import { GuestConversionCard } from '@/profile/GuestConversionCard';
import { ProfileFields } from '@/profile/ProfileFields';
import { SubscriptionPanel } from '@/profile/SubscriptionPanel';
import { GallerySubmissionRow, FeedbackHistoryRow } from '@/profile/HistoryRows';
import {
  DangerZone,
  DELETE_ACCOUNT_PHRASE,
  deleteAccountConfirmMessage,
} from '@/profile/DangerZone';
import { runAccountDeletion } from '@/profile/accountDeletion';
import { btnSecondary, btnDanger } from '@/profile/styles';

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
      // Posters → API (cancels billing, deletes the auth user) → sign out.
      // On failure the user stays signed in with local data intact and
      // sees a generic message (the detail is logged for the operator).
      const outcome = await runAccountDeletion();
      if (!outcome.ok) {
        setActionError(
          'Something went wrong deleting your account. Nothing was removed — please try again or send feedback.',
        );
        setActionStatus(null);
        return;
      }
      navigate('/auth');
    }
  }, [confirmAction, navigate, handleRetractConfirmed]);

  const refreshUser = useCallback(() => {
    void supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen w-screen bg-[#0a0a12] text-[#c8cad0]">
        <ProfileHeader />
        <div className="mx-auto max-w-2xl px-8 py-12">
          <p className="text-[14pt] text-[#8b8f99]">Loading…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen w-screen flex-col bg-[#0a0a12] text-[#c8cad0]">
      <ProfileHeader />

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

        {/* Link Account / Sign Up — shown only to guests. Converts IN PLACE
            (linkIdentity / updateUser) so the guest's posters carry over. */}
        {isAnonymous && (
          <GuestConversionCard
            user={user}
            onConverted={refreshUser}
            onError={(msg) => setActionError(msg)}
          />
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

        {/* Danger Zone — deletion runs through the API so a live term is
            cancelled first (P0-3); the row says so when one is active. */}
        <DangerZone
          posterCount={posterCount}
          hasActiveTerm={plan.hasActiveTerm}
          onDeletePosters={() => setConfirmAction('deletePosters')}
          onDeleteAccount={() => setConfirmAction('deleteAccount')}
        />
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
        message={confirmModalMessage(confirmAction, posterCount, plan.hasActiveTerm)}
        confirmLabel={confirmModalLabel(confirmAction)}
        danger
        typedConfirmation={confirmAction === 'deleteAccount' ? DELETE_ACCOUNT_PHRASE : undefined}
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

function confirmModalMessage(
  action: ConfirmAction,
  posterCount: number,
  hasActiveTerm: boolean,
): string {
  if (action && typeof action === 'object' && action.kind === 'retractGalleryEntry') {
    return `Remove "${action.entry.title}" from the public gallery? The entry row and stored image will be deleted. Third parties may still have cached copies.`;
  }
  if (action === 'deleteAccount') return deleteAccountConfirmMessage(hasActiveTerm);
  return `Permanently delete all ${posterCount} poster(s)? This cannot be undone.`;
}

function confirmModalLabel(action: ConfirmAction): string {
  if (action && typeof action === 'object' && action.kind === 'retractGalleryEntry') {
    return 'Retract';
  }
  if (action === 'deleteAccount') return 'Delete my account';
  return 'Delete all';
}
