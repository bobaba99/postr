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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/apiClient';

const { postJsonMock, fromMock, removeMock } = vi.hoisted(() => ({
  postJsonMock: vi.fn(),
  fromMock: vi.fn(),
  removeMock: vi.fn(),
}));

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>();
  return { ...actual, postJson: postJsonMock };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: fromMock,
    storage: { from: () => ({ remove: removeMock }) },
  },
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
const REQUEST_KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeEach(() => {
  postJsonMock.mockReset();
  fromMock.mockReset();
  removeMock.mockReset();
  removeMock.mockResolvedValue({ data: [], error: null });
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
    REQUEST_KEY as `${string}-${string}-${string}-${string}-${string}`,
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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

    expect(postJsonMock).toHaveBeenCalledWith(
      '/api/review/critique',
      { ...BODY, requestKey: REQUEST_KEY },
      { auth: true },
    );
    expect(result).toBe(response);
  });

  it('retries a transport failure once with the same generated request key', async () => {
    const response = {
      reviewId: 'rev-1',
      stage: 'initial' as const,
      critique: {
        dimensionScores: { narrative: 4, design: 3, content: 5 },
        attentionSummary: 'The eye lands on the results figure first.',
        findings: [],
      },
    };
    postJsonMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(response);

    await expect(requestCritique(BODY)).resolves.toBe(response);

    expect(postJsonMock).toHaveBeenCalledTimes(2);
    expect(postJsonMock.mock.calls[0]![1]).toEqual({
      ...BODY,
      requestKey: REQUEST_KEY,
    });
    expect(postJsonMock.mock.calls[1]![1]).toEqual(
      postJsonMock.mock.calls[0]![1],
    );
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it('polls an ambiguous in-progress retry to replay before cleaning temp pages', async () => {
    vi.useFakeTimers();
    const response = {
      reviewId: 'rev-1',
      stage: 'initial' as const,
      critique: {
        dimensionScores: { narrative: 4, design: 3, content: 5 },
        attentionSummary: 'The original request completed.',
        findings: [],
      },
    };
    postJsonMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(
        new ApiError(
          'review_in_progress',
          409,
          { error: 'review_in_progress' },
          2,
        ),
      )
      .mockResolvedValueOnce(response);
    const body = {
      ...BODY,
      pages: [
        {
          ...BODY.pages[0]!,
          storagePath: 'user-1/review-temp/session-1/page-1.jpg',
        },
      ],
    };

    const pending = requestCritique(body);
    await vi.waitFor(() => expect(postJsonMock).toHaveBeenCalledTimes(2));
    expect(removeMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    await expect(pending).resolves.toBe(response);

    expect(postJsonMock).toHaveBeenCalledTimes(3);
    expect(postJsonMock.mock.calls[2]![1]).toEqual(
      postJsonMock.mock.calls[0]![1],
    );
    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(removeMock).toHaveBeenCalledWith([
      'user-1/review-temp/session-1/page-1.jpg',
    ]);
  });

  it('adds one stable idempotency key to a follow-up', async () => {
    postJsonMock.mockResolvedValue({
      reviewId: 'rev-1',
      stage: 'closed',
      critique: {
        dimensionScores: { narrative: 4, design: 4, content: 5 },
        attentionSummary: 'The revision lands the result first.',
        findings: [],
      },
    });
    const followup = { ...BODY, reviewId: 'rev-1' };

    await requestCritique(followup);

    expect(postJsonMock).toHaveBeenCalledWith(
      '/api/review/critique',
      { ...followup, followupRequestId: REQUEST_KEY },
      { auth: true },
    );
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
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

  it('best-effort removes review-temp pages even when the critique is rate-limited', async () => {
    postJsonMock.mockRejectedValue(
      new ApiError('rate_limited', 429, { error: 'rate_limited' }, 90),
    );
    const basePage = BODY.pages[0]!;
    const body = {
      ...BODY,
      pages: [
        {
          ...basePage,
          storagePath: 'user-1/review-temp/session-1/page-1.jpg',
        },
        {
          ...basePage,
          pageNumber: 2,
          storagePath: 'user-1/poster-1/review-capture.jpg',
        },
      ],
    };

    await requestCritique(body).catch(() => undefined);

    expect(removeMock).toHaveBeenCalledWith([
      'user-1/review-temp/session-1/page-1.jpg',
    ]);
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
