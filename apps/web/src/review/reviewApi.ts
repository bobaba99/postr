/**
 * Presentation Checker API client — the web side of the review feature
 * (spec §5; the naming trap is why nothing here says "feedback").
 *
 * `requestCritique` wraps POST /api/review/critique in the shared
 * postJson helper and translates the two statuses the UI handles
 * specially:
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

export interface CritiqueRequestBody {
  sourceKind: ReviewSourceKind;
  pages: ReviewPageRef[];
  posterDoc?: PosterDoc;
  posterId?: string;
  reviewId?: string;
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
  try {
    return await postJson<CritiqueResponse>('/api/review/critique', body, {
      auth: true,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 402) {
      // The route puts retryAfterSec in the 402 JSON body; the
      // Retry-After header (apiClient's only source) is absent on 402s,
      // so read the body first and fall back to the header value.
      const paymentBody = err.body as {
        reason?: string;
        retryAfterSec?: number;
      } | null;
      throw new ReviewPaymentRequiredError(
        paymentBody?.reason ?? 'no_credit',
        paymentBody?.retryAfterSec ?? err.retryAfterSec,
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
  }
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
