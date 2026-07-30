/**
 * reviewApi — the web client for the Presentation Checker API.
 *
 * Pins the two error translations the UI depends on (402 →
 * ReviewPaymentRequiredError carrying the server's reason; 429 → an
 * ApiError whose message carries the human wait from formatRetryAfter)
 * and the listMyReviews row→summary mapping. apiClient and supabase are
 * module-mocked (the data/__tests__/posters.test.ts convention) — no
 * network.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiError } from '@/lib/apiClient';

const { postJsonMock, fromMock } = vi.hoisted(() => ({
  postJsonMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>();
  return { ...actual, postJson: postJsonMock };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock },
}));

import {
  ReviewPaymentRequiredError,
  listMyReviews,
  requestCritique,
} from '../reviewApi';

const BODY = {
  sourceKind: 'pdf' as const,
  pages: [
    {
      pageNumber: 1,
      url: 'https://example.supabase.co/storage/v1/object/sign/poster-assets/temp/review/p1.jpg?token=x',
      widthPx: 1650,
      heightPx: 1275,
    },
  ],
};

beforeEach(() => {
  postJsonMock.mockReset();
  fromMock.mockReset();
});

describe('requestCritique', () => {
  it('posts to the critique route with auth and returns the response', async () => {
    const response = {
      reviewId: 'rev-1',
      stage: 'initial' as const,
      critique: {
        dimensionScores: { narrative: 4, design: 3, content: 5 },
        attentionSummary: 'The eye lands on the results figure first.',
        findings: [],
      },
    };
    postJsonMock.mockResolvedValue(response);

    const result = await requestCritique(BODY);

    expect(postJsonMock).toHaveBeenCalledWith('/api/review/critique', BODY, {
      auth: true,
    });
    expect(result).toBe(response);
  });

  it('maps a 402 ApiError to ReviewPaymentRequiredError with the server reason', async () => {
    postJsonMock.mockRejectedValue(
      new ApiError(
        'review_payment_required',
        402,
        { error: 'review_payment_required', reason: 'weekly_quota_exceeded' },
        3600,
      ),
    );

    const err: unknown = await requestCritique(BODY).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ReviewPaymentRequiredError);
    expect((err as ReviewPaymentRequiredError).reason).toBe(
      'weekly_quota_exceeded',
    );
    expect((err as ReviewPaymentRequiredError).retryAfterSec).toBe(3600);
  });

  it("defaults the 402 reason to 'no_credit' when the body lacks one", async () => {
    postJsonMock.mockRejectedValue(
      new ApiError('review_payment_required', 402, null),
    );

    const err: unknown = await requestCritique(BODY).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ReviewPaymentRequiredError);
    expect((err as ReviewPaymentRequiredError).reason).toBe('no_credit');
    expect((err as ReviewPaymentRequiredError).retryAfterSec).toBeUndefined();
  });

  it('rethrows a 429 with the human wait from formatRetryAfter in the message', async () => {
    postJsonMock.mockRejectedValue(
      new ApiError('rate_limited', 429, { error: 'rate_limited' }, 90),
    );

    const err: unknown = await requestCritique(BODY).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(429);
    expect((err as ApiError).message).toContain('2 minutes');
    expect((err as ApiError).retryAfterSec).toBe(90);
  });

  it('propagates other ApiErrors untouched', async () => {
    const upstream = new ApiError('review_upstream', 502, {
      error: 'review_upstream',
    });
    postJsonMock.mockRejectedValue(upstream);

    const err: unknown = await requestCritique(BODY).catch((e: unknown) => e);

    expect(err).toBe(upstream);
  });
});

describe('listMyReviews', () => {
  function chainResolving(response: { data: unknown; error: unknown }) {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => response),
    };
    fromMock.mockReturnValue(chain);
    return chain;
  }

  it('selects the owner-visible columns newest-first and maps rows to summaries', async () => {
    const chain = chainResolving({
      data: [
        {
          id: 'rev-1',
          poster_id: null,
          source_kind: 'pdf',
          source_meta: { filename: 'talk.pdf', pageCount: 12 },
          status: 'complete',
          stage: 'initial',
          initial_findings: {
            dimensionScores: { narrative: 4, design: 2, content: 4 },
          },
          created_at: '2026-07-29T10:00:00Z',
        },
      ],
      error: null,
    });

    const reviews = await listMyReviews();

    expect(fromMock).toHaveBeenCalledWith('poster_reviews');
    expect(chain.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
    expect(reviews).toEqual([
      {
        id: 'rev-1',
        posterId: null,
        sourceKind: 'pdf',
        status: 'complete',
        stage: 'initial',
        filename: 'talk.pdf',
        pageCount: 12,
        dimensionScores: { narrative: 4, design: 2, content: 4 },
        createdAt: '2026-07-29T10:00:00Z',
      },
    ]);
  });

  it('returns an empty list when the user has no reviews', async () => {
    chainResolving({ data: [], error: null });

    await expect(listMyReviews()).resolves.toEqual([]);
  });

  it('throws a descriptive error when the select fails', async () => {
    chainResolving({ data: null, error: { message: 'rls denied' } });

    await expect(listMyReviews()).rejects.toThrow('rls denied');
  });
});
