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
import {
  ApiError,
  ApiResponseDecodeError,
  formatRetryAfter,
  postJson,
} from '@/lib/apiClient';
import { supabase } from '@/lib/supabase';
import { removeReviewPages } from './ingest/uploadReviewPage';

const IN_PROGRESS_POLL_MS = 2_000;
const IN_PROGRESS_MAX_POLLS = 300; // ten minutes: matches the server lease
const IN_PROGRESS_MAX_WAIT_MS = 10 * 60 * 1_000;

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
  const post = async () => {
    const raw = await postJson<unknown>('/api/review/critique', requestBody, {
      auth: true,
    });
    const parsed = parseCritiqueResponse(raw);
    if (!parsed) {
      throw new ApiResponseDecodeError(
        'Successful critique response did not match its contract.',
      );
    }
    return parsed;
  };

  try {
    return await post();
  } catch (err) {
    const pollDeadline = Date.now() + IN_PROGRESS_MAX_WAIT_MS;
    let shouldPoll =
      isTransportError(err) || isReviewInProgressError(err);

    // A transport failure is ambiguous: the server may have completed the
    // review after the connection disappeared. Retry once with the exact same
    // key so the API replays instead of charging/calling the provider again.
    if (isTransportError(err)) {
      try {
        return await post();
      } catch (retryErr) {
        err = retryErr;
        shouldPoll = isAmbiguousPollError(retryErr);
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
      Date.now() < pollDeadline &&
      shouldPoll
    ) {
      polls += 1;
      const remainingMs = pollDeadline - Date.now();
      await wait(Math.min(reviewPollDelayMs(err), remainingMs));
      try {
        return await post();
      } catch (pollError) {
        err = pollError;
        // Once a request is known to be ambiguous, the route's outer
        // per-minute limiter is also transient: wait its Retry-After and keep
        // the same key alive instead of deleting pages and minting a new key.
        shouldPoll = isAmbiguousPollError(pollError);
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

function parseCritiqueResponse(raw: unknown): CritiqueResponse | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (
    typeof value.reviewId !== 'string' ||
    (value.stage !== 'initial' && value.stage !== 'closed') ||
    !parseCritiqueResult(value.critique)
  ) {
    return null;
  }
  return raw as CritiqueResponse;
}

const REVIEW_DIMENSIONS = ['narrative', 'design', 'content'] as const;
const REVIEW_SEVERITIES = ['high', 'medium', 'low'] as const;
const REVIEW_CATEGORIES = [
  'buried-key-result',
  'over-emphasis',
  'redundant-text',
  'competing-elements',
  'wall-of-text',
  'decorative-hijack',
  'no-takeaway',
  'figure-text-disconnect',
  'jargon-mismatch',
  'claims-evidence-gap',
  'section-imbalance',
  'readability-at-distance',
] as const;
const REVIEW_ACTIONS = [
  'cut',
  'demote-to-appendix',
  'show-visually',
  'condense',
  'keep-as-primary',
  'add',
] as const;

function parseCritiqueResult(raw: unknown): CritiqueResult | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const critique = raw as Record<string, unknown>;
  const scores = critique.dimensionScores;
  if (
    !scores ||
    typeof scores !== 'object' ||
    Array.isArray(scores) ||
    typeof critique.attentionSummary !== 'string' ||
    (critique.prioritization !== undefined &&
      typeof critique.prioritization !== 'string') ||
    !Array.isArray(critique.findings)
  ) {
    return null;
  }
  const scoreRecord = scores as Record<string, unknown>;
  if (
    !REVIEW_DIMENSIONS.every((dimension) => {
      const score = scoreRecord[dimension];
      return (
        Number.isInteger(score) &&
        (score as number) >= 1 &&
        (score as number) <= 5
      );
    }) ||
    !critique.findings.every(isReviewFinding)
  ) {
    return null;
  }
  return raw as CritiqueResult;
}

function parseDimensionScores(
  raw: unknown,
): Record<ReviewDimension, number> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const scores = (raw as Record<string, unknown>).dimensionScores;
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) {
    return null;
  }
  const scoreRecord = scores as Record<string, unknown>;
  if (
    !REVIEW_DIMENSIONS.every((dimension) => {
      const score = scoreRecord[dimension];
      return (
        Number.isInteger(score) &&
        (score as number) >= 1 &&
        (score as number) <= 5
      );
    })
  ) {
    return null;
  }
  return scores as Record<ReviewDimension, number>;
}

function isReviewFinding(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const finding = raw as Record<string, unknown>;
  return (
    REVIEW_DIMENSIONS.includes(
      finding.dimension as (typeof REVIEW_DIMENSIONS)[number],
    ) &&
    REVIEW_SEVERITIES.includes(
      finding.severity as (typeof REVIEW_SEVERITIES)[number],
    ) &&
    REVIEW_CATEGORIES.includes(
      finding.category as (typeof REVIEW_CATEGORIES)[number],
    ) &&
    REVIEW_ACTIONS.includes(
      finding.action as (typeof REVIEW_ACTIONS)[number],
    ) &&
    typeof finding.problem === 'string' &&
    typeof finding.fix === 'string' &&
    typeof finding.example === 'string' &&
    (finding.tradeoff === undefined || typeof finding.tradeoff === 'string') &&
    isReviewAnchor(finding.anchor)
  );
}

function isReviewAnchor(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const anchor = raw as Record<string, unknown>;
  if (anchor.kind === 'block') {
    return typeof anchor.blockId === 'string' && anchor.blockId.length > 0;
  }
  if (
    (anchor.kind === 'slide' || anchor.kind === 'region') &&
    (!Number.isInteger(anchor.page) || (anchor.page as number) < 1)
  ) {
    return false;
  }
  if (anchor.kind === 'slide') return true;
  if (anchor.kind !== 'region' || !Array.isArray(anchor.bbox)) return false;
  return (
    anchor.bbox.length === 4 &&
    anchor.bbox.every(
      (value) =>
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 1,
    )
  );
}

function isReviewInProgressError(error: unknown): error is ApiError {
  return error instanceof ApiError && isReviewInProgress(error);
}

function isAmbiguousPollError(error: unknown): boolean {
  return (
    isTransportError(error) ||
    isReviewInProgressError(error) ||
    (error instanceof ApiError && error.status === 429)
  );
}

function reviewPollDelayMs(error: unknown): number {
  if (error instanceof ApiError && error.status === 429) {
    return Math.max(
      IN_PROGRESS_POLL_MS,
      (error.retryAfterSec ?? 60) * 1_000,
    );
  }
  return IN_PROGRESS_POLL_MS;
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
  initial_findings: unknown;
  followup_findings?: unknown;
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
    dimensionScores: parseDimensionScores(row.initial_findings),
    createdAt: row.created_at,
  }));
}

/** One complete owner-visible review with a critique safe to render. */
export interface PosterReviewDetail
  extends Omit<PosterReviewSummary, 'dimensionScores'> {
  critique: CritiqueResult;
}

/**
 * Loads one signed-in user's review through the table's owner SELECT RLS.
 * Stored JSON is untrusted at runtime, so a malformed critique never reaches
 * the result cards.
 */
export async function getMyReview(
  reviewId: string,
): Promise<PosterReviewDetail | null> {
  const { data, error } = await supabase
    .from('poster_reviews')
    .select(
      'id, poster_id, source_kind, source_meta, status, stage, initial_findings, followup_findings, created_at' as never,
    )
    .eq('id', reviewId)
    .maybeSingle();
  if (error) throw new Error(`getMyReview failed: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as PosterReviewRow;
  const storedCritique =
    row.stage === 'closed' ? row.followup_findings : row.initial_findings;
  const critique = parseCritiqueResult(storedCritique);
  if (!critique) {
    throw new Error('getMyReview failed: stored critique is invalid');
  }

  return {
    id: row.id,
    posterId: row.poster_id,
    sourceKind: row.source_kind,
    status: row.status,
    stage: row.stage,
    filename: row.source_meta?.filename ?? null,
    pageCount: row.source_meta?.pageCount ?? null,
    critique,
    createdAt: row.created_at,
  };
}
