/**
 * /presentation-checker — one review surface for posters and talks.
 *
 * Entitlements are deliberately server-authoritative: a 402 response
 * renders the paywall, while client plan state only shapes checkout.
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
import { createCheckout } from '@/data/billing';
import { stashCheckoutIntent } from '@/data/checkoutIntent';
import { listPosters, loadPoster, type PosterListRow } from '@/data/posters';
import { usePlan } from '@/hooks/usePlan';
import { ApiError, formatRetryAfter } from '@/lib/apiClient';
import {
  FindingCard,
  ReviewScoreHeader,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
} from '@/review/FindingCards';
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
import { APP_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

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

function critiqueErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return error.message;
    if (error.message === 'too_many_pages') {
      return 'That file has more than 24 pages — trim it to 24 pages or fewer and try again.';
    }
    if (error.message === 'image_too_large') {
      return 'One of the page images is too large to review — export a lighter copy and try again.';
    }
    if (error.message === 'review_closed') {
      return 'That review is already closed — start a new one instead.';
    }
    if (error.message === 'review_not_complete') {
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
  const [paywall, setPaywall] =
    useState<ReviewPaymentRequiredError | null>(null);
  const [followupConfirm, setFollowupConfirm] = useState(false);
  const [pendingFollowup, setPendingFollowup] = useState(false);
  const [activeRegion, setActiveRegion] = useState<{
    page: number;
    bbox: [number, number, number, number];
  } | null>(null);
  const [regionAnnouncement, setRegionAnnouncement] = useState('');
  const [pastReviews, setPastReviews] = useState<PosterReviewSummary[]>([]);
  const [myPosters, setMyPosters] = useState<PosterListRow[]>([]);
  const [pickedPosterId, setPickedPosterId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const posterActivationInFlightRef = useRef(false);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());

  async function refreshHistory() {
    try {
      setPastReviews(await listMyReviews());
    } catch (error) {
      console.error('[review] history read failed:', error);
    }
  }

  async function refreshPosters() {
    try {
      setMyPosters(await listPosters());
    } catch (error) {
      console.error('[review] poster list read failed:', error);
    }
  }

  useEffect(() => {
    if (plan.loading || plan.isGuest) return;
    void refreshHistory();
    void refreshPosters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.loading, plan.isGuest]);

  async function startReview(
    job: () => Promise<NormalizedArtifact>,
    options: { posterId?: string; reviewId?: string } = {},
  ) {
    setPaywall(null);
    setErrorMessage(null);
    setActiveRegion(null);
    setRegionAnnouncement('');
    setPhase('ingesting');

    let nextArtifact: NormalizedArtifact;
    try {
      nextArtifact = await job();
    } catch (error) {
      console.error('[review] ingest failed:', error);
      setErrorMessage(
        error instanceof IngestError
          ? INGEST_ERROR_MESSAGES[error.kind]
          : 'Something went wrong reading that file. Try again, or use Send Feedback if it keeps happening.',
      );
      setPhase('error');
      return;
    }

    setArtifact(nextArtifact);
    setSourcePosterId(options.posterId ?? null);
    setPhase('reviewing');
    try {
      const nextResult = await requestCritique({
        sourceKind: nextArtifact.meta.sourceKind,
        filename: nextArtifact.meta.filename,
        pages: nextArtifact.pages.map((page) => ({
          pageNumber: page.pageNumber,
          ...(page.storagePath ? { storagePath: page.storagePath } : {}),
          url: page.signedUrl,
          widthPx: page.widthPx,
          heightPx: page.heightPx,
        })),
        posterDoc: nextArtifact.posterDoc,
        posterId: options.posterId,
        reviewId: options.reviewId,
      });
      setResult(nextResult);
      setFollowupConfirm(false);
      setPendingFollowup(false);
      setPhase('done');
      void refreshHistory();
    } catch (error) {
      if (error instanceof ReviewPaymentRequiredError) {
        setPaywall(error);
        setPhase('idle');
        return;
      }
      console.error('[review] critique failed:', error);
      setErrorMessage(critiqueErrorMessage(error));
      setPhase('error');
    }
  }

  async function handleFile(file: File) {
    await startReview(() => ingestFileForReview(file), {
      reviewId: pendingFollowup ? result?.reviewId : undefined,
    });
  }

  async function runPosterReview(posterId: string, reviewId?: string) {
    if (posterActivationInFlightRef.current) return;
    posterActivationInFlightRef.current = true;
    setPaywall(null);
    setErrorMessage(null);
    setPhase('ingesting');
    try {
      const row = await loadPoster(posterId);
      if (!row) {
        setErrorMessage(
          'That poster could not be loaded — it may have been deleted.',
        );
        setPhase('error');
        return;
      }
      const doc: PosterDoc = row.data;
      await startReview(
        () => ingestPosterForReview({ doc, posterId: row.id }),
        {
          posterId: row.id,
          reviewId,
        },
      );
    } catch (error) {
      console.error('[review] poster load failed:', error);
      setErrorMessage(
        'That poster could not be loaded — it may have been deleted.',
      );
      setPhase('error');
    } finally {
      posterActivationInFlightRef.current = false;
    }
  }

  async function runPosterFollowup() {
    if (!result || !sourcePosterId) return;
    await runPosterReview(sourcePosterId, result.reviewId);
  }

  function showRegion(
    page: number,
    bbox: [number, number, number, number],
  ) {
    setActiveRegion({ page, bbox });
    setRegionAnnouncement(`Showing the highlighted issue on page ${page}.`);
    const pageElement = pageRefs.current.get(page);
    if (!pageElement) return;
    pageElement.focus({ preventScroll: true });
    pageElement.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }

  function resetForNewReview() {
    setResult(null);
    setArtifact(null);
    setSourcePosterId(null);
    setFollowupConfirm(false);
    setPendingFollowup(false);
    setActiveRegion(null);
    setRegionAnnouncement('');
    setPhase('idle');
  }

  const busy = phase === 'ingesting' || phase === 'reviewing';

  return (
    <main className="flex min-h-screen w-screen flex-col bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 pb-8 pt-6">
        <h1 className="text-2xl font-bold text-white">
          Presentation Checker
        </h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Get feedback on your poster or talk — scores for narrative, design,
          and content, plus fix cards anchored to the exact spots to change.
        </p>

        <input
          id="review-file"
          ref={fileInputRef}
          type="file"
          accept=".pdf,.pptx,.png,.jpg"
          aria-label="File to review"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
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
          <section
            aria-label="Review results"
            className="mt-5 flex flex-col gap-5"
          >
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

            <div
              aria-label="Reviewed pages"
              className="flex gap-2 overflow-x-auto pb-1"
            >
              {artifact.pages.map((page) => (
                <div
                  key={page.pageNumber}
                  ref={(element) => {
                    if (element) {
                      pageRefs.current.set(page.pageNumber, element);
                    } else {
                      pageRefs.current.delete(page.pageNumber);
                    }
                  }}
                  role="group"
                  aria-label={`Reviewed page ${page.pageNumber}`}
                  data-testid={`review-page-${page.pageNumber}`}
                  tabIndex={-1}
                  className="relative shrink-0 focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:ring-offset-2 focus:ring-offset-[#0a0a12]"
                >
                  <img
                    src={page.signedUrl}
                    alt={`Page ${page.pageNumber}`}
                    className="block w-40 rounded border border-[#1f1f2e]"
                  />
                  {activeRegion &&
                    activeRegion.page === page.pageNumber && (
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
            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="sr-only"
            >
              {regionAnnouncement}
            </p>

            <div className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-[#e2e2e8]">
                Fix cards ({result.critique.findings.length})
              </h2>
              {SEVERITY_ORDER.map((severity) => {
                const findings = result.critique.findings.filter(
                  (finding) => finding.severity === severity,
                );
                if (findings.length === 0) return null;
                return (
                  <div key={severity} className="flex flex-col gap-2">
                    <div
                      className="text-xs font-bold uppercase tracking-wider"
                      style={{ color: SEVERITY_COLORS[severity] }}
                    >
                      {SEVERITY_LABELS[severity]} ({findings.length})
                    </div>
                    {findings.map((finding, index) => {
                      const anchor = finding.anchor;
                      const onJump =
                        anchor.kind === 'region'
                          ? () => showRegion(anchor.page, anchor.bbox)
                          : undefined;
                      return (
                        <FindingCard
                          key={`${finding.category}-${index}`}
                          finding={finding}
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
                      className="mt-3 inline-flex min-h-11 items-center rounded-md border border-[#3a3a4e] px-4 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b8cf0]"
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
                          disabled={busy}
                          onClick={() => void runPosterFollowup()}
                          className="inline-flex min-h-11 items-center rounded-md bg-[#7c6aed] px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b5aaff]"
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
                          className="inline-flex min-h-11 items-center rounded-md bg-[#7c6aed] px-4 text-sm font-semibold text-white hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b5aaff]"
                        >
                          Choose the revised file
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setFollowupConfirm(false)}
                        className="inline-flex min-h-11 items-center rounded-md border border-[#3a3a4e] px-4 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b8cf0]"
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
                  className="mt-3 inline-flex min-h-11 items-center rounded-md border border-[#3a3a4e] px-4 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b8cf0]"
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
                    className="mt-3 inline-flex min-h-11 items-center rounded-md border border-[#3a3a4e] px-4 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b8cf0]"
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
                    className="mt-3 inline-flex min-h-11 items-center rounded-md bg-[#7c6aed] px-4 text-sm font-semibold text-white hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b5aaff]"
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
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <select
                          id="review-poster"
                          value={pickedPosterId}
                          onChange={(event) =>
                            setPickedPosterId(event.target.value)
                          }
                          className="min-h-11 min-w-0 flex-1 rounded-md border border-[#3a3a4e] bg-[#111118] px-3 py-2 text-sm text-[#c8cad0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b8cf0]"
                        >
                          <option value="">Choose a poster…</option>
                          {myPosters.map((poster) => (
                            <option key={poster.id} value={poster.id}>
                              {poster.title || 'Untitled poster'}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!pickedPosterId || busy}
                          onClick={() => void runPosterReview(pickedPosterId)}
                          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-[#7c6aed] px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b5aaff]"
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
                  {pastReviews.map((review) => (
                    <li
                      key={review.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[#1f1f2e] bg-[#0d0d15] px-3 py-2 text-xs text-[#9ca3af]"
                    >
                      <span className="font-semibold text-[#c8cad0]">
                        {review.filename ?? SOURCE_LABELS[review.sourceKind]}
                      </span>
                      <span>
                        {new Date(review.createdAt).toLocaleDateString()}
                      </span>
                      <span>{STAGE_LABELS[review.stage]}</span>
                      {review.dimensionScores && (
                        <span>
                          Narrative {review.dimensionScores.narrative}/5 ·
                          Design {review.dimensionScores.design}/5 · Content{' '}
                          {review.dimensionScores.content}/5
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
    } catch (checkoutError) {
      console.error('[billing] review checkout failed:', checkoutError);
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
        through fix cards anchored to the exact spots to change — each with a
        rewritten example from your own content. One follow-up review is
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
          className="inline-flex min-h-11 items-center rounded-md bg-[#5641b8] px-4 text-sm font-semibold text-white hover:bg-[#4c39a6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b5aaff]"
        >
          Get the review pack
        </button>
        {hasActiveTerm ? (
          <button
            type="button"
            onClick={() => void buy('review_addon')}
            className="inline-flex min-h-11 items-center rounded-md border border-[#3a3050] bg-[#1a1a26] px-4 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b8cf0]"
          >
            Add weekly reviews to your term
          </button>
        ) : (
          <span className="text-xs leading-relaxed text-[#6b7280]">
            The weekly review add-on rides on the semester term —{' '}
            <a
              href="/pricing"
              className="text-[#9b8cf0] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b8cf0]"
            >
              start the term
            </a>{' '}
            to add it.
          </span>
        )}
      </div>
      {isGuest && (
        <p className="mt-3 text-xs leading-relaxed text-[#8b8f99]">
          You&apos;re working as a guest — you&apos;ll create a free account (or
          sign in with Google) first, so your purchase and reviews stay yours
          across devices.
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
        className="mt-4 text-xs text-[#6b7280] underline hover:text-[#c8cad0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b8cf0]"
      >
        Back to the upload
      </button>
    </section>
  );
}
