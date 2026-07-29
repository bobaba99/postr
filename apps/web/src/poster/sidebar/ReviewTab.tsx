/**
 * ReviewTab — the Presentation Checker inside the editor (spec §1: the
 * Postr-native poster is the richest input — the review gets both the
 * rendered capture AND the structured PosterDoc).
 *
 * Runs a review of the CURRENT poster: capture + upload via the ingest
 * layer, critique via the review API, then the same shared score header
 * and finding cards the /presentation-checker page shows — a
 * block-anchored card jumps straight to its block via onJumpToBlock.
 * One follow-up per review, disclosed up front ("This is your one
 * follow-up — the review closes after it."); then the review closes and
 * a fresh review needs a new credit.
 *
 * Lives in its own file rather than inside Sidebar.tsx (the IssuesTab
 * pattern) because the review flow carries real state — ingest,
 * request, paywall, follow-up — that needs isolated tests, and
 * Sidebar.tsx is already ~4.3k lines.
 */
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { ReviewAnchor, ReviewSeverity } from '@postr/shared';
import { BusyIndicator, busyProps } from '@/components/BusyIndicator';
import { usePosterStore } from '@/stores/posterStore';
import { usePlan } from '@/hooks/usePlan';
import { formatRetryAfter } from '@/lib/apiClient';
import { createCheckout } from '@/data/billing';
import { stashCheckoutIntent } from '@/data/checkoutIntent';
import { ingestPosterForReview } from '@/review/ingest';
import {
  requestCritique,
  ReviewPaymentRequiredError,
  type CritiqueResponse,
} from '@/review/reviewApi';
import {
  FindingCard,
  ReviewScoreHeader,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
} from '@/review/FindingCards';

const SEVERITY_ORDER: ReviewSeverity[] = ['high', 'medium', 'low'];

const primaryButton: React.CSSProperties = {
  padding: '12px 16px',
  background: '#5641b8',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
  textAlign: 'center',
  width: '100%',
};

const secondaryButton: React.CSSProperties = {
  padding: '10px 14px',
  background: '#1a1a26',
  color: '#c8cad0',
  border: '1px solid #3a3050',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};

export function ReviewTab({
  onJumpToBlock,
}: {
  onJumpToBlock?: (blockId: string) => void;
}) {
  const doc = usePosterStore((s) => s.doc);
  const posterId = usePosterStore((s) => s.posterId);
  const plan = usePlan();
  const navigate = useNavigate();

  const [running, setRunning] = useState(false);
  const inFlightRef = useRef(false);
  const [result, setResult] = useState<CritiqueResponse | null>(null);
  const [paywall, setPaywall] =
    useState<ReviewPaymentRequiredError | null>(null);
  const [failed, setFailed] = useState(false);
  const [checkoutFailed, setCheckoutFailed] = useState(false);
  const [followupConfirm, setFollowupConfirm] = useState(false);

  async function run(reviewId?: string) {
    // State updates are batched, so `running` can remain false for two
    // activations in the same tick. The ref is the synchronous lock that
    // prevents duplicate captures and, critically, duplicate credit spends.
    if (!doc || !posterId || inFlightRef.current) return;
    inFlightRef.current = true;
    setRunning(true);
    setFailed(false);
    setPaywall(null);
    try {
      const artifact = await ingestPosterForReview({ doc, posterId });
      const response = await requestCritique({
        sourceKind: 'postr',
        pages: artifact.pages.map((page) => ({
          pageNumber: page.pageNumber,
          url: page.signedUrl,
          widthPx: page.widthPx,
          heightPx: page.heightPx,
          ...(page.storagePath ? { storagePath: page.storagePath } : {}),
        })),
        posterDoc: artifact.posterDoc ?? doc,
        posterId,
        reviewId,
      });
      setResult(response);
      setFollowupConfirm(false);
    } catch (err) {
      if (err instanceof ReviewPaymentRequiredError) {
        setPaywall(err);
        return;
      }
      console.error('[review] poster review failed:', err);
      setFailed(true);
    } finally {
      inFlightRef.current = false;
      setRunning(false);
    }
  }

  async function buy(sku: 'review_pack' | 'review_addon') {
    if (plan.isGuest) {
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

  function jumpFor(anchor: ReviewAnchor): (() => void) | undefined {
    if (anchor.kind !== 'block' || !onJumpToBlock) return undefined;
    const blockId = anchor.blockId;
    return () => onJumpToBlock(blockId);
  }

  // The pre-gate saves a wasted capture while the server's 402 remains
  // authoritative. Once a result exists, keep it visible so its included
  // follow-up stays available even if the credit balance is now zero.
  if (paywall || (!plan.loading && !plan.canReview && !result)) {
    return (
      <PaywallPanel
        error={paywall ?? new ReviewPaymentRequiredError('no_credit')}
        hasActiveTerm={plan.hasActiveTerm}
        checkoutFailed={checkoutFailed}
        onBuy={(sku) => void buy(sku)}
      />
    );
  }

  return (
    <div
      {...busyProps(running)}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      {!result && (
        <>
          <p
            style={{
              fontSize: 13,
              color: '#9ca3af',
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            Get a scored review of this poster — narrative, design, and
            content — with fix cards that jump to the block they affect. One
            follow-up is included.
          </p>
          <button
            type="button"
            disabled={!doc || !posterId || running}
            onClick={() => void run()}
            style={{
              ...primaryButton,
              opacity: !doc || !posterId || running ? 0.65 : 1,
            }}
          >
            {running ? (
              <BusyIndicator inline label="Reading your poster…" />
            ) : (
              'Review this poster'
            )}
          </button>
          <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>
            Uses one review credit, or your weekly add-on review.
          </div>
        </>
      )}

      {failed && (
        <div
          role="alert"
          style={{ fontSize: 12, color: '#fca5a5', lineHeight: 1.5 }}
        >
          Something went wrong. Try again, or use Send Feedback so we can look
          into it.
        </div>
      )}

      {result && (
        <>
          <ReviewScoreHeader scores={result.critique.dimensionScores} />

          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: '#9ca3af',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
              }}
            >
              How a first-time viewer reads it
            </div>
            <p
              style={{
                fontSize: 13,
                color: '#c8cad0',
                lineHeight: 1.55,
                margin: '6px 0 0',
              }}
            >
              {result.critique.attentionSummary}
            </p>
          </div>

          {result.critique.prioritization && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #7c6aed55',
                background: '#17142a',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#9b8cf0',
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                }}
              >
                Priority call
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: '#e2e2e8',
                  lineHeight: 1.5,
                  marginTop: 4,
                }}
              >
                {result.critique.prioritization}
              </div>
            </div>
          )}

          {SEVERITY_ORDER.map((severity) => {
            const findings = result.critique.findings.filter(
              (finding) => finding.severity === severity,
            );
            if (findings.length === 0) return null;
            return (
              <div
                key={severity}
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: SEVERITY_COLORS[severity],
                    textTransform: 'uppercase',
                    letterSpacing: 0.8,
                  }}
                >
                  {SEVERITY_LABELS[severity]} ({findings.length})
                </div>
                {findings.map((finding, index) => (
                  <FindingCard
                    key={`${finding.category}-${index}`}
                    finding={finding}
                    onJump={jumpFor(finding.anchor)}
                  />
                ))}
              </div>
            );
          })}

          {result.stage === 'initial' ? (
            <div style={{ borderTop: '1px solid #1f1f2e', paddingTop: 12 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#e2e2e8',
                }}
              >
                Your one follow-up
              </div>
              {!followupConfirm ? (
                <>
                  <p
                    style={{
                      fontSize: 12.5,
                      color: '#9ca3af',
                      lineHeight: 1.5,
                      margin: '6px 0 0',
                    }}
                  >
                    Revise the poster, then run the follow-up — it checks your
                    revision against these exact findings.
                  </p>
                  <button
                    type="button"
                    onClick={() => setFollowupConfirm(true)}
                    style={{ ...secondaryButton, marginTop: 8 }}
                  >
                    Request your one follow-up
                  </button>
                </>
              ) : (
                <div role="note" style={{ marginTop: 6 }}>
                  <p
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: '#f9e2af',
                      margin: 0,
                    }}
                  >
                    This is your one follow-up — the review closes after it.
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      color: '#9ca3af',
                      lineHeight: 1.5,
                      margin: '6px 0 0',
                    }}
                  >
                    The follow-up re-reads your poster exactly as it is now —
                    make your edits first.
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginTop: 8,
                    }}
                  >
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => void run(result.reviewId)}
                      style={secondaryButton}
                    >
                      {running ? (
                        <BusyIndicator
                          inline
                          label="Reading your poster…"
                        />
                      ) : (
                        'Run the follow-up'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFollowupConfirm(false)}
                      style={secondaryButton}
                    >
                      Not yet
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ borderTop: '1px solid #1f1f2e', paddingTop: 12 }}>
              <p
                style={{
                  fontSize: 12.5,
                  color: '#9ca3af',
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                This review is closed — the follow-up was its last pass. A
                fresh review uses a new credit.
              </p>
              <button
                type="button"
                disabled={running}
                onClick={() => void run()}
                style={{ ...secondaryButton, marginTop: 8 }}
              >
                Start a new review
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The paywall state — reached from the plan pre-gate or a 402. Copy
 * names what the review does, never "AI" (D15). The add-on appears only
 * for term holders because without an active term the quota unlocks
 * nothing.
 */
function PaywallPanel({
  error,
  hasActiveTerm,
  checkoutFailed,
  onBuy,
}: {
  error: ReviewPaymentRequiredError;
  hasActiveTerm: boolean;
  checkoutFailed: boolean;
  onBuy: (sku: 'review_pack' | 'review_addon') => void;
}) {
  const quotaHit = error.reason === 'weekly_quota_exceeded';
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 8,
        border: '1px solid #3a3050',
        background: '#17141f',
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: '#e2e2e8',
          marginBottom: 4,
        }}
      >
        Get feedback on your poster
      </div>
      <div style={{ fontSize: 12.5, color: '#9ca3af', lineHeight: 1.5 }}>
        A review scores narrative, design, and content, then gives you fix
        cards that jump to the exact block to change — each with a rewritten
        example from your own poster. One follow-up review is included.
      </div>
      {quotaHit && (
        <div
          role="status"
          style={{
            marginTop: 8,
            fontSize: 12,
            color: '#eab308',
            lineHeight: 1.5,
          }}
        >
          You&apos;ve used this week&apos;s reviews
          {error.retryAfterSec
            ? ` — your next weekly review opens up in ${formatRetryAfter(error.retryAfterSec)}`
            : ''}
          . A review pack works right away.
        </div>
      )}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 12,
        }}
      >
        <button
          type="button"
          onClick={() => onBuy('review_pack')}
          style={secondaryButton}
        >
          Get the review pack
        </button>
        {hasActiveTerm && (
          <button
            type="button"
            onClick={() => onBuy('review_addon')}
            style={secondaryButton}
          >
            Add weekly reviews
          </button>
        )}
      </div>
      {checkoutFailed && (
        <div
          role="alert"
          style={{ marginTop: 8, fontSize: 12, color: '#fca5a5' }}
        >
          Something went wrong starting checkout. Try again, or use Send
          Feedback so we can look into it.
        </div>
      )}
    </div>
  );
}
