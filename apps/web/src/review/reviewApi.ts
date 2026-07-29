/**
 * Presentation Checker API client — the web side of the review feature
 * (spec §5; the naming trap is why nothing here says "feedback").
 *
 * `requestCritique` wraps POST /api/review/critique in the shared
 * postJson helper. Initial and follow-up calls carry browser-generated
 * idempotency keys; an ambiguous transport failure retries with the same key
 * so the API can replay instead of charging or judging twice. It also translates the two
 * statuses the UI handles specially:
 *   402 → ReviewPaymentRequiredError (the paywall; `reason` tells the
 *         panel which pitch to show — 'no_credit' buys a pack,
 *         'weekly_quota_exceeded' waits or buys a pack)
 *   429 → rethrown as an ApiError whose message carries the human wait
 *         ("2 minutes") from formatRetryAfter, so error panels can show
 *         the message verbatim
 * Everything else (400/403/404/409/413/502) propagates as the original
 * ApiError — the route's snake_case `error` code is its message.
 *
 * `listMyReviews` reads the user's own poster_reviews rows directly via
 * supabase-js: the table's RLS is owner SELECT-only (D3) — all writes go
 * through the API's service_role client, so there is nothing to wrap.
 */
import type {
  CritiqueResult,
  PosterDoc,
  ReviewDimension,
  ReviewPageRef,
  ReviewSourceKind,
} from '@postr/shared';
import { ApiError, formatRetryAfter, postJson } from '@/lib/apiClient';
import { supabase } from '@/lib/supabase';
import { removeReviewPages } from './ingest/uploadReviewPage';

const IN_PROGRESS_POLL_MS = 2_000;
const IN_PROGRESS_MAX_POLLS = 300; // ten minutes: matches the server lease

export interface CritiqueRequestBody {
  sourceKind: ReviewSourceKind;
  pages: ReviewPageRef[];
  posterDoc?: PosterDoc;
  posterId?: string;
  reviewId?: string;
  /** Stable idempotency key for one logical initial review. */
  requestKey?: string;
  /** Stable idempotency key for the one included follow-up. */
  followupRequestId?: string;
  /** Upload filename — the API stamps it into source_meta (shown in the past-reviews list). */
  filename?: string;
}

export interface CritiqueResponse {
  reviewId: string;
  stage: 'initial' | 'closed';
  critique: CritiqueResult;
}

/** The 402 paywall signal from the review route. */
export class ReviewPaymentRequiredError extends Error {
  /** Server-provided: 'no_credit' | 'weekly_quota_exceeded'. */
  readonly reason: string;
  readonly retryAfterSec?: number;
  constructor(reason: string, retryAfterSec?: number) {
    super('review_payment_required');
    this.name = 'ReviewPaymentRequiredError';
    this.reason = reason;
    this.retryAfterSec = retryAfterSec;
  }
}

export async function requestCritique(
  body: CritiqueRequestBody,
): Promise<CritiqueResponse> {
  const requestBody: CritiqueRequestBody = body.reviewId
    ? {
        ...body,
        followupRequestId:
          body.followupRequestId ?? crypto.randomUUID(),
      }
    : { ...body, requestKey: body.requestKey ?? crypto.randomUUID() };
  const post = () =>
    postJson<CritiqueResponse>('/api/review/critique', requestBody, {
      auth: true,
    });

  try {
    return await post();
  } catch (err) {
    // A transport failure is ambiguous: the server may have completed the
    // review after the connection disappeared. Retry once with the exact same
    // key so the API replays instead of charging/calling the provider again.
    if (isTransportError(err)) {
      try {
        return await post();
      } catch (retryErr) {
        err = retryErr;
      }
    }
    // The first request may still be running when an ambiguous retry reaches
    // the API. Keep the original key alive until the server can replay a
    // terminal result; returning the 409 would make the next UI attempt mint a
    // new key and could duplicate paid work. Cleanup remains deferred by the
    // outer finally while this loop is active.
    let polls = 0;
    while (
      polls < IN_PROGRESS_MAX_POLLS &&
      (isTransportError(err) ||
        (err instanceof ApiError && isReviewInProgress(err)))
    ) {
      polls += 1;
      await wait(IN_PROGRESS_POLL_MS);
      try {
        return await post();
      } catch (pollError) {
        err = pollError;
      }
    }
    if (err instanceof ApiError && err.status === 402) {
      const paymentBody = err.body as { reason?: string } | null;
      throw new ReviewPaymentRequiredError(
        paymentBody?.reason ?? 'no_credit',
        err.retryAfterSec,
      );
    }
    if (err instanceof ApiError && err.status === 429) {
      throw new ApiError(
        `Too many review requests right now — try again in ${formatRetryAfter(err.retryAfterSec ?? 60)}.`,
        err.status,
        err.body,
        err.retryAfterSec,
      );
    }
    throw err;
  } finally {
    // The API also cleans valid requests, but its outer rate limiter can
    // reject before the critique handler runs and a network failure may
    // leave the browser unsure whether the request arrived. Deleting the
    // caller's review-temp paths here is an idempotent, best-effort fallback.
    const tempPaths = [
      ...new Set(
        body.pages
          .map((page) => page.storagePath)
          .filter(
            (path): path is string =>
              typeof path === 'string' && isReviewTempStoragePath(path),
          ),
      ),
    ];
    await removeReviewPages(tempPaths);
  }
}

function isTransportError(error: unknown): error is TypeError {
  return error instanceof TypeError;
}

function isReviewInProgress(error: ApiError): boolean {
  return (
    error.status === 409 &&
    (error.body as { error?: unknown } | null)?.error ===
      'review_in_progress'
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isReviewTempStoragePath(path: string): boolean {
  const segments = path.split('/');
  return (
    segments.length >= 4 &&
    segments[1] === 'review-temp' &&
    segments.every(
      (segment) => segment.length > 0 && segment !== '.' && segment !== '..',
    )
  );
}

/** One row of the signed-in user's review history (past-reviews list). */
export interface PosterReviewSummary {
  id: string;
  posterId: string | null;
  sourceKind: ReviewSourceKind;
  status: 'pending' | 'complete' | 'failed';
  stage: 'initial' | 'followup' | 'closed';
  /** source_meta.filename — set for uploads, null for Postr posters. */
  filename: string | null;
  /** source_meta.pageCount. */
  pageCount: number | null;
  /** Dimension scores of the initial critique, once complete. */
  dimensionScores: Record<ReviewDimension, number> | null;
  createdAt: string;
}

interface PosterReviewRow {
  id: string;
  poster_id: string | null;
  source_kind: ReviewSourceKind;
  source_meta: { filename?: string; pageCount?: number } | null;
  status: 'pending' | 'complete' | 'failed';
  stage: 'initial' | 'followup' | 'closed';
  initial_findings: {
    dimensionScores?: Record<ReviewDimension, number>;
  } | null;
  created_at: string;
}

/**
 * The signed-in user's reviews, newest first, capped at 20. Owner
 * SELECT-only RLS scopes the read to the caller — an anonymous session
 * simply sees its own (usually empty) set.
 */
export async function listMyReviews(): Promise<PosterReviewSummary[]> {
  // poster_reviews is newer than the generated Database type in some
  // builds; cast the projection (same convention as usePlan).
  const { data, error } = await supabase
    .from('poster_reviews')
    .select(
      'id, poster_id, source_kind, source_meta, status, stage, initial_findings, created_at' as never,
    )
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(`listMyReviews failed: ${error.message}`);
  const rows = (data ?? []) as unknown as PosterReviewRow[];
  return rows.map((row) => ({
    id: row.id,
    posterId: row.poster_id,
    sourceKind: row.source_kind,
    status: row.status,
    stage: row.stage,
    filename: row.source_meta?.filename ?? null,
    pageCount: row.source_meta?.pageCount ?? null,
    dimensionScores: row.initial_findings?.dimensionScores ?? null,
    createdAt: row.created_at,
  }));
}
