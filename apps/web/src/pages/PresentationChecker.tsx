/**
 * /presentation-checker — the Presentation Checker standalone page
 * (spec §1: one unified surface for posters AND talks).
 *
 * Upload a poster PDF, a talk deck (.pptx / .pdf), or an image — or,
 * signed in, pick one of your Postr posters — and get per-dimension
 * scores plus anchored fix cards with a rewritten example for each.
 * One follow-up per review, disclosed up front ("This is your one
 * follow-up — the review closes after it."), then the review closes.
 *
 * The route is registered but deliberately NOT linked from nav (D12) —
 * the SEO record is an `app` (noindex) entry until the Milestone-6
 * launch checklist flips it to a prerendered static record. The record
 * is read defensively (`?? null`) because Task 26 adds it after this
 * page lands.
 *
 * Entitlements are NOT pre-gated here: the server resolves them (D4)
 * and a 402 renders the paywall panel — the client plan read only
 * decides which checkout path a button takes (guest → account-first).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type {
  PosterDoc,
  ReviewSeverity,
  ReviewSourceKind,
} from '@postr/shared';
import { BusyIndicator, busyProps } from '@/components/BusyIndicator';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { APP_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';
import { usePlan } from '@/hooks/usePlan';
import { ApiError, formatRetryAfter } from '@/lib/apiClient';
import { createCheckout } from '@/data/billing';
import { stashCheckoutIntent } from '@/data/checkoutIntent';
import { listPosters, loadPoster, type PosterListRow } from '@/data/posters';
import { ingestFileForReview, ingestPosterForReview } from '@/review/ingest';
import {
  IngestError,
  type IngestErrorKind,
  type NormalizedArtifact,
} from '@/review/ingest/types';
import {
  listMyReviews,
  requestCritique,
  ReviewPaymentRequiredError,
  type CritiqueResponse,
  type PosterReviewSummary,
} from '@/review/reviewApi';
import {
  FindingCard,
  ReviewScoreHeader,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
} from '@/review/FindingCards';

type Phase = 'idle' | 'ingesting' | 'reviewing' | 'done' | 'error';

const SEVERITY_ORDER: ReviewSeverity[] = ['high', 'medium', 'low'];

const SOURCE_LABELS: Record<ReviewSourceKind, string> = {
  postr: 'Postr poster',
  pdf: 'PDF',
  pptx: 'Slides',
  image: 'Image',
};

const STAGE_LABELS: Record<'initial' | 'followup' | 'closed', string> = {
  initial: 'Initial review',
  followup: 'Follow-up',
  closed: 'Closed',
};

/** User-facing copy for each typed ingest failure (never a silent truncation). */
const INGEST_ERROR_MESSAGES: Record<IngestErrorKind, string> = {
  'too-many-pages':
    'That file has more than 24 pages — trim it to 24 pages or fewer and try again.',
  'unsupported-mime':
    'That file type is not supported — upload a PDF, PPTX, PNG, or JPG.',
  'file-too-large':
    'That file is too large to review — export a lighter copy and try again.',
  'unreadable-file':
    "We couldn't read that file — try exporting it again from the app that made it.",
  'blank-render':
    'That file rendered blank — check it opens correctly and try again.',
  'upload-failed':
    'Something went wrong uploading your file. Try again, or use Send Feedback if it keeps happening.',
  'server-render-failed':
    'Something went wrong preparing your file. Try again, or use Send Feedback if it keeps happening.',
};

function critiqueErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    // 429 arrives with the human wait already in the message (Task 23).
    if (err.status === 429) return err.message;
    if (err.message === 'too_many_pages') {
      return 'That file has more than 24 pages — trim it to 24 pages or fewer and try again.';
    }
    if (err.message === 'image_too_large') {
      return 'One of the page images is too large to review — export a lighter copy and try again.';
    }
    if (err.message === 'review_closed') {
      return 'That review is already closed — start a new one instead.';
    }
    if (err.message === 'review_not_complete') {
      return 'That review is not ready for its follow-up yet — run the initial review first.';
    }
  }
  return 'Something went wrong reviewing your file. Try again, or use Send Feedback if it keeps happening.';
}

export default function PresentationChecker() {
  useDocumentMeta(APP_ROUTE_META['/presentation-checker'] ?? null);
  const plan = usePlan();

  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<NormalizedArtifact | null>(null);
  const [sourcePosterId, setSourcePosterId] = useState<string | null>(null);
  const [result, setResult] = useState<CritiqueResponse | null>(null);
  const [paywall, setPaywall] = useState<ReviewPaymentRequiredError | null>(null);
  const [followupConfirm, setFollowupConfirm] = useState(false);
  const [pendingFollowup, setPendingFollowup] = useState(false);
  const [activeRegion, setActiveRegion] = useState<{
    page: number;
    bbox: [number, number, number, number];
  } | null>(null);
  const [pastReviews, setPastReviews] = useState<PosterReviewSummary[]>([]);
  const [myPosters, setMyPosters] = useState<PosterListRow[]>([]);
  const [pickedPosterId, setPickedPosterId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refreshHistory() {
    try {
      setPastReviews(await listMyReviews());
    } catch (err) {
      console.error('[review] history read failed:', err);
    }
  }

  async function refreshPosters() {
    try {
      setMyPosters(await listPosters());
    } catch (err) {
      console.error('[review] poster list read failed:', err);
    }
  }

  useEffect(() => {
    if (plan.loading || plan.isGuest) return;
    void refreshHistory();
    void refreshPosters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.loading, plan.isGuest]);

  /**
   * The one path every review takes: ingest → critique. Ingest failures
   * map to their typed messages; critique failures map 402 → paywall
   * and everything else to a generic line (the error itself is always
   * console-logged first — the export-flow house rule).
   */
  async function startReview(
    job: () => Promise<NormalizedArtifact>,
    opts: { posterId?: string; reviewId?: string } = {},
  ) {
    setPaywall(null);
    setErrorMessage(null);
    setActiveRegion(null);
    setPhase('ingesting');
    let art: NormalizedArtifact;
    try {
      art = await job();
    } catch (err) {
      console.error('[review] ingest failed:', err);
      setErrorMessage(
        err instanceof IngestError
          ? INGEST_ERROR_MESSAGES[err.kind]
          : 'Something went wrong reading that file. Try again, or use Send Feedback if it keeps happening.',
      );
      setPhase('error');
      return;
    }
    setArtifact(art);
    setSourcePosterId(opts.posterId ?? null);
    setPhase('reviewing');
    try {
      const res = await requestCritique({
        sourceKind: art.meta.sourceKind,
        filename: art.meta.filename,
        pages: art.pages.map((p) => ({
          pageNumber: p.pageNumber,
          url: p.signedUrl,
          widthPx: p.widthPx,
          heightPx: p.heightPx,
        })),
        posterDoc: art.posterDoc,
        posterId: opts.posterId,
        reviewId: opts.reviewId,
      });
      setResult(res);
      setFollowupConfirm(false);
      setPendingFollowup(false);
      setPhase('done');
      void refreshHistory();
    } catch (err) {
      if (err instanceof ReviewPaymentRequiredError) {
        // The paywall replaces the working view; the artifact stays in
        // state so a successful purchase can simply re-run.
        setPaywall(err);
        setPhase('idle');
        return;
      }
      console.error('[review] critique failed:', err);
      setErrorMessage(critiqueErrorMessage(err));
      setPhase('error');
    }
  }

  async function handleFile(file: File) {
    await startReview(() => ingestFileForReview(file), {
      reviewId: pendingFollowup ? result?.reviewId : undefined,
    });
  }

  async function runPosterReview(posterId: string) {
    const row = await loadPoster(posterId);
    if (!row) {
      setErrorMessage('That poster could not be loaded — it may have been deleted.');
      setPhase('error');
      return;
    }
    const doc: PosterDoc = row.data;
    await startReview(() => ingestPosterForReview({ doc, posterId }), {
      posterId,
    });
  }

  /** Follow-up on a Postr poster: re-read it fresh — the user revised. */
  async function runPosterFollowup() {
    if (!result || !sourcePosterId) return;
    const row = await loadPoster(sourcePosterId);
    if (!row) {
      setErrorMessage('That poster could not be loaded — it may have been deleted.');
      setPhase('error');
      return;
    }
    const doc: PosterDoc = row.data;
    const posterId = row.id;
    await startReview(() => ingestPosterForReview({ doc, posterId }), {
      posterId,
      reviewId: result.reviewId,
    });
  }

  function resetForNewReview() {
    setResult(null);
    setArtifact(null);
    setSourcePosterId(null);
    setFollowupConfirm(false);
    setPendingFollowup(false);
    setActiveRegion(null);
    setPhase('idle');
  }

  const busy = phase === 'ingesting' || phase === 'reviewing';

  return (
    <main className="flex min-h-screen w-screen flex-col bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 pb-8 pt-6">
        <h1 className="text-2xl font-bold text-white">Presentation Checker</h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Get feedback on your poster or talk — scores for narrative, design,
          and content, plus fix cards anchored to the exact spots to change.
        </p>

        {/* The ONE file input, always mounted: the follow-up's "Choose
            the revised file" button needs it during the results phase,
            when the upload card is no longer rendered. sr-only — every
            trigger is a real button that forwards the click. */}
        <input
          id="review-file"
          ref={fileInputRef}
          type="file"
          accept=".pdf,.pptx,.png,.jpg"
          aria-label="File to review"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset so picking the same file twice still fires.
            e.target.value = '';
            if (file) void handleFile(file);
          }}
        />

        {paywall ? (
          <ReviewPaywallPanel
            error={paywall}
            isGuest={plan.isGuest}
            hasActiveTerm={plan.hasActiveTerm}
            onDismiss={() => setPaywall(null)}
          />
        ) : phase === 'done' && result && artifact ? (
          <section aria-label="Review results" className="mt-5 flex flex-col gap-5">
            <ReviewScoreHeader scores={result.critique.dimensionScores} />

            <div className="rounded-lg border border-[#1f1f2e] bg-[#0d0d15] p-4">
              <h2 className="text-sm font-semibold text-[#e2e2e8]">
                How a first-time viewer reads it
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#c8cad0]">
                {result.critique.attentionSummary}
              </p>
            </div>

            {result.critique.prioritization && (
              <div className="rounded-md border border-[#7c6aed55] bg-[#17142a] px-4 py-3">
                <div className="text-xs font-bold uppercase tracking-wider text-[#9b8cf0]">
                  Priority call
                </div>
                <p className="mt-1 text-sm leading-relaxed text-[#e2e2e8]">
                  {result.critique.prioritization}
                </p>
              </div>
            )}

            {/* Page strip — region-anchored cards light up a bbox overlay
                here. bbox is normalized [x, y, w, h] fractions (D7). */}
            <div aria-label="Reviewed pages" className="flex gap-2 overflow-x-auto pb-1">
              {artifact.pages.map((p) => (
                <div key={p.pageNumber} className="relative shrink-0">
                  <img
                    src={p.signedUrl}
                    alt={`Page ${p.pageNumber}`}
                    className="block w-40 rounded border border-[#1f1f2e]"
                  />
                  {activeRegion && activeRegion.page === p.pageNumber && (
                    <div
                      data-testid="region-overlay"
                      className="pointer-events-none absolute rounded-sm border-2 border-[#f97316] bg-[#f9731622]"
                      style={{
                        left: `${activeRegion.bbox[0] * 100}%`,
                        top: `${activeRegion.bbox[1] * 100}%`,
                        width: `${activeRegion.bbox[2] * 100}%`,
                        height: `${activeRegion.bbox[3] * 100}%`,
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-[#e2e2e8]">
                Fix cards ({result.critique.findings.length})
              </h2>
              {SEVERITY_ORDER.map((sev) => {
                const items = result.critique.findings.filter(
                  (f) => f.severity === sev,
                );
                if (items.length === 0) return null;
                return (
                  <div key={sev} className="flex flex-col gap-2">
                    <div
                      className="text-xs font-bold uppercase tracking-wider"
                      style={{ color: SEVERITY_COLORS[sev] }}
                    >
                      {SEVERITY_LABELS[sev]} ({items.length})
                    </div>
                    {items.map((f, i) => {
                      const anchor = f.anchor;
                      const onJump =
                        anchor.kind === 'region'
                          ? () =>
                              setActiveRegion({
                                page: anchor.page,
                                bbox: anchor.bbox,
                              })
                          : undefined;
                      return (
                        <FindingCard
                          key={`${f.category}-${i}`}
                          finding={f}
                          onJump={onJump}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {result.stage === 'initial' ? (
              <section
                aria-label="Follow-up review"
                className="rounded-lg border border-[#1f1f2e] bg-[#0d0d15] p-4"
              >
                <h2 className="text-sm font-semibold text-[#e2e2e8]">
                  Your one follow-up
                </h2>
                {!followupConfirm ? (
                  <>
                    <p className="mt-1 text-sm leading-relaxed text-[#9ca3af]">
                      Revise against these cards, then run the follow-up — it
                      checks your revision against these exact findings.
                    </p>
                    <button
                      type="button"
                      onClick={() => setFollowupConfirm(true)}
                      className="mt-3 inline-flex min-h-11 items-center rounded-md border border-[#3a3a4e] px-4 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] hover:text-white"
                    >
                      Request your one follow-up
                    </button>
                  </>
                ) : (
                  <div role="note" className="mt-2">
                    <p className="text-sm font-semibold text-[#f9e2af]">
                      This is your one follow-up — the review closes after it.
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[#9ca3af]">
                      {sourcePosterId
                        ? 'Save your revisions in the editor first — the follow-up re-reads your poster as it is now.'
                        : 'Pick the revised file — the follow-up reads it against the findings above.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {sourcePosterId ? (
                        <button
                          type="button"
                          onClick={() => void runPosterFollowup()}
                          className="inline-flex min-h-11 items-center rounded-md bg-[#7c6aed] px-4 text-sm font-semibold text-white hover:brightness-110"
                        >
                          Run the follow-up on my poster
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setPendingFollowup(true);
                            fileInputRef.current?.click();
                          }}
                          className="inline-flex min-h-11 items-center rounded-md bg-[#7c6aed] px-4 text-sm font-semibold text-white hover:brightness-110"
                        >
                          Choose the revised file
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setFollowupConfirm(false)}
                        className="inline-flex min-h-11 items-center rounded-md border border-[#3a3a4e] px-4 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed]"
                      >
                        Not yet
                      </button>
                    </div>
                  </div>
                )}
              </section>
            ) : (
              <section
                aria-label="Review closed"
                className="rounded-lg border border-[#1f1f2e] bg-[#0d0d15] p-4"
              >
                <p className="text-sm leading-relaxed text-[#9ca3af]">
                  This review is closed — the follow-up was its last pass. A
                  fresh review uses a new credit.
                </p>
                <button
                  type="button"
                  onClick={resetForNewReview}
                  className="mt-3 inline-flex min-h-11 items-center rounded-md border border-[#3a3a4e] px-4 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] hover:text-white"
                >
                  Start a new review
                </button>
              </section>
            )}
          </section>
        ) : (
          <>
            <section
              aria-label="Start a review"
              className="mt-5 rounded-lg border border-[#1f1f2e] bg-[#0d0d15] p-5"
              {...busyProps(busy)}
            >
              {busy ? (
                <BusyIndicator
                  label={
                    phase === 'ingesting'
                      ? 'Preparing your file for review…'
                      : 'Reading your poster or talk…'
                  }
                  hint={
                    phase === 'ingesting'
                      ? 'Large files can take a moment.'
                      : 'A full review usually takes under a minute.'
                  }
                />
              ) : phase === 'error' && errorMessage ? (
                <div>
                  <p role="alert" className="text-sm text-[#fca5a5]">
                    {errorMessage}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPhase('idle')}
                    className="mt-3 inline-flex min-h-11 items-center rounded-md border border-[#3a3a4e] px-4 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] hover:text-white"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <>
                  <div className="block text-sm font-semibold text-[#e2e2e8]">
                    Upload a poster PDF, talk deck, or image
                  </div>
                  <p className="mt-1 text-xs text-[#6b7280]">
                    PDF, PPTX, PNG, or JPG — up to 24 pages. Nothing is
                    published; the review is only for you.
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 inline-flex min-h-11 items-center rounded-md bg-[#7c6aed] px-4 text-sm font-semibold text-white hover:brightness-110"
                  >
                    Choose a file
                  </button>

                  {!plan.isGuest && myPosters.length > 0 && (
                    <div className="mt-5 border-t border-[#1f1f2e] pt-4">
                      <label
                        htmlFor="review-poster"
                        className="block text-sm font-semibold text-[#e2e2e8]"
                      >
                        …or review one of your Postr posters
                      </label>
                      <div className="mt-2 flex gap-2">
                        <select
                          id="review-poster"
                          value={pickedPosterId}
                          onChange={(e) => setPickedPosterId(e.target.value)}
                          className="min-w-0 flex-1 rounded-md border border-[#3a3a4e] bg-[#111118] px-3 py-2 text-sm text-[#c8cad0]"
                        >
                          <option value="">Choose a poster…</option>
                          {myPosters.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title || 'Untitled poster'}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!pickedPosterId}
                          onClick={() => void runPosterReview(pickedPosterId)}
                          className="inline-flex min-h-11 shrink-0 items-center rounded-md bg-[#7c6aed] px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
                        >
                          Review this poster
                        </button>
                      </div>
                    </div>
                  )}

                  {plan.isGuest && (
                    <p className="mt-3 text-xs leading-relaxed text-[#6b7280]">
                      You&apos;re browsing as a guest — upload a file to start;
                      you&apos;ll create a free account to run the review.
                    </p>
                  )}
                </>
              )}
            </section>

            {!plan.isGuest && pastReviews.length > 0 && (
              <section aria-label="Your past reviews" className="mt-6">
                <h2 className="text-sm font-semibold text-[#e2e2e8]">
                  Your past reviews
                </h2>
                <ul className="mt-2 space-y-2">
                  {pastReviews.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[#1f1f2e] bg-[#0d0d15] px-3 py-2 text-xs text-[#9ca3af]"
                    >
                      <span className="font-semibold text-[#c8cad0]">
                        {r.filename ?? SOURCE_LABELS[r.sourceKind]}
                      </span>
                      <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                      <span>{STAGE_LABELS[r.stage]}</span>
                      {r.dimensionScores && (
                        <span>
                          Narrative {r.dimensionScores.narrative}/5 · Design{' '}
                          {r.dimensionScores.design}/5 · Content{' '}
                          {r.dimensionScores.content}/5
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
      <PublicFooter />
    </main>
  );
}

/**
 * The 402 paywall. Copy names what the user GETS (a scored review with
 * fix cards and a follow-up), never what they're blocked from, and
 * never says "AI" (D15). Guests route through the account-first flow
 * (stash + /auth?plan=…), exactly like the export paywall
 * (EditableExportButtons). The add-on button appears only for term
 * holders — without an active term the weekly quota unlocks nothing
 * (D4), so selling it there would be a dead end.
 */
function ReviewPaywallPanel({
  error,
  isGuest,
  hasActiveTerm,
  onDismiss,
}: {
  error: ReviewPaymentRequiredError;
  isGuest: boolean;
  hasActiveTerm: boolean;
  onDismiss: () => void;
}) {
  const navigate = useNavigate();
  const [checkoutFailed, setCheckoutFailed] = useState(false);
  const quotaHit = error.reason === 'weekly_quota_exceeded';

  async function buy(sku: 'review_pack' | 'review_addon') {
    if (isGuest) {
      stashCheckoutIntent(sku);
      navigate(`/auth?plan=${sku}`);
      return;
    }
    try {
      window.location.href = await createCheckout(sku);
    } catch (err) {
      console.error('[billing] review checkout failed:', err);
      setCheckoutFailed(true);
    }
  }

  return (
    <section
      aria-label="Unlock reviews"
      className="mt-5 rounded-lg border border-[#3a3050] bg-[#17141f] p-5"
    >
      <h2 className="text-base font-semibold text-[#e2e2e8]">
        Get feedback on your poster or talk
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[#9ca3af]">
        A review scores your narrative, design, and content, then walks you
        through fix cards anchored to the exact spots to change — each with
        a rewritten example from your own content. One follow-up review is
        included, so you can check your revision.
      </p>
      {quotaHit && (
        <p
          role="status"
          className="mt-3 rounded-md border border-[#eab30833] bg-[#eab30811] px-3 py-2 text-xs text-[#eab308]"
        >
          You&apos;ve used this week&apos;s reviews
          {error.retryAfterSec
            ? ` — your next weekly review opens up in ${formatRetryAfter(error.retryAfterSec)}`
            : ''}
          . A review pack works right away.
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void buy('review_pack')}
          className="inline-flex min-h-11 items-center rounded-md bg-[#5641b8] px-4 text-sm font-semibold text-white hover:bg-[#4c39a6]"
        >
          Get the review pack
        </button>
        {hasActiveTerm ? (
          <button
            type="button"
            onClick={() => void buy('review_addon')}
            className="inline-flex min-h-11 items-center rounded-md border border-[#3a3050] bg-[#1a1a26] px-4 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed]"
          >
            Add weekly reviews to your term
          </button>
        ) : (
          <span className="text-xs leading-relaxed text-[#6b7280]">
            The weekly review add-on rides on the semester term —{' '}
            <a href="/pricing" className="text-[#9b8cf0]">
              start the term
            </a>{' '}
            to add it.
          </span>
        )}
      </div>
      {isGuest && (
        <p className="mt-3 text-xs leading-relaxed text-[#8b8f99]">
          You&apos;re working as a guest — you&apos;ll create a free account
          (or sign in with Google) first, so your purchase and reviews stay
          yours across devices.
        </p>
      )}
      {checkoutFailed && (
        <p role="alert" className="mt-3 text-xs text-[#fca5a5]">
          Something went wrong starting checkout. Try again, or use Send
          Feedback so we can look into it.
        </p>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="mt-4 text-xs text-[#6b7280] underline hover:text-[#c8cad0]"
      >
        Back to the upload
      </button>
    </section>
  );
}
