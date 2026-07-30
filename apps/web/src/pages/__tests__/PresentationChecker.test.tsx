/**
 * /presentation-checker page — the public review surface.
 *
 * reviewApi, the ingest layer, usePlan, the posters repo, billing,
 * checkout intent, and supabase are all module-mocked: these tests pin
 * the page's behaviour (happy path, paywall on 402, follow-up
 * disclosure, region-anchor overlay), never the network. The mocked
 * ReviewPaymentRequiredError class keeps `instanceof` working because
 * the page and the test share the same mocked binding.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import PresentationChecker from '../../pages/PresentationChecker';

const {
  requestCritiqueMock,
  listMyReviewsMock,
  ingestFileMock,
  ingestPosterMock,
} = vi.hoisted(() => ({
  requestCritiqueMock: vi.fn(),
  listMyReviewsMock: vi.fn(async () => []),
  ingestFileMock: vi.fn(),
  ingestPosterMock: vi.fn(),
}));

vi.mock('@/review/reviewApi', () => ({
  requestCritique: requestCritiqueMock,
  listMyReviews: listMyReviewsMock,
  ReviewPaymentRequiredError: class extends Error {
    readonly reason: string;
    readonly retryAfterSec?: number;
    constructor(reason: string, retryAfterSec?: number) {
      super('review_payment_required');
      this.name = 'ReviewPaymentRequiredError';
      this.reason = reason;
      this.retryAfterSec = retryAfterSec;
    }
  },
}));

vi.mock('@/review/ingest', () => ({
  ingestFileForReview: ingestFileMock,
  ingestPosterForReview: ingestPosterMock,
}));

const planState = {
  value: {
    loading: false,
    hasActiveTerm: false,
    credits: 0,
    reviewCredits: 1,
    hasReviewAddon: false,
    canReview: true,
    canExport: false,
    isGuest: false,
    subscriptionStatus: null as string | null,
  },
};
vi.mock('@/hooks/usePlan', () => ({ usePlan: () => planState.value }));

vi.mock('@/data/posters', () => ({
  listPosters: vi.fn(async () => []),
  loadPoster: vi.fn(async () => null),
}));
vi.mock('@/data/billing', () => ({ createCheckout: vi.fn() }));
vi.mock('@/data/checkoutIntent', () => ({ stashCheckoutIntent: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

import { ReviewPaymentRequiredError } from '@/review/reviewApi';

const ARTIFACT = {
  pages: [
    {
      pageNumber: 1,
      storagePath: 'user-1/temp/review/p1.jpg',
      signedUrl:
        'https://example.supabase.co/storage/v1/object/sign/poster-assets/user-1/temp/review/p1.jpg?token=x',
      widthPx: 1650,
      heightPx: 1275,
    },
    {
      pageNumber: 2,
      storagePath: 'user-1/temp/review/p2.jpg',
      signedUrl:
        'https://example.supabase.co/storage/v1/object/sign/poster-assets/user-1/temp/review/p2.jpg?token=x',
      widthPx: 1650,
      heightPx: 1275,
    },
  ],
  meta: {
    sourceKind: 'pdf' as const,
    filename: 'talk.pdf',
    pageCount: 2,
    ingestedAt: '2026-07-29T10:00:00Z',
  },
};

const CRITIQUE = {
  reviewId: 'rev-1',
  stage: 'initial' as const,
  critique: {
    dimensionScores: { narrative: 4, design: 2, content: 5 },
    attentionSummary:
      'The eye lands on the decorative header photo before the results figure.',
    prioritization:
      'Keep the results figure as primary; demote Table 2 to an appendix.',
    findings: [
      {
        dimension: 'design' as const,
        severity: 'high' as const,
        category: 'decorative-hijack' as const,
        anchor: {
          kind: 'region' as const,
          page: 1,
          bbox: [0.1, 0.2, 0.3, 0.4] as [number, number, number, number],
        },
        action: 'demote-to-appendix' as const,
        problem: 'The decorative header photo outranks the results figure.',
        fix: 'Shrink the photo and give the results figure the top-left entry point.',
        example:
          'Move "Figure 3: recall accuracy" to the top-left column at full width.',
        tradeoff: 'A smaller photo makes a plainer first impression.',
      },
      {
        dimension: 'narrative' as const,
        severity: 'low' as const,
        category: 'no-takeaway' as const,
        anchor: { kind: 'slide' as const, page: 2 },
        action: 'add' as const,
        problem: 'The deck ends on methods details with no take-home.',
        fix: 'Close on a single takeaway slide.',
        example: 'End with: "Sleep loss cut recall by a fifth — test less, sleep more."',
      },
    ],
  },
};

function uploadFile(name = 'talk.pdf') {
  fireEvent.change(screen.getByLabelText('File to review'), {
    target: { files: [new File(['x'], name, { type: 'application/pdf' })] },
  });
}

beforeEach(() => {
  requestCritiqueMock.mockReset();
  listMyReviewsMock.mockReset();
  listMyReviewsMock.mockResolvedValue([]);
  ingestFileMock.mockReset();
  ingestFileMock.mockResolvedValue(ARTIFACT);
  ingestPosterMock.mockReset();
  planState.value = {
    loading: false,
    hasActiveTerm: false,
    credits: 0,
    reviewCredits: 1,
    hasReviewAddon: false,
    canReview: true,
    canExport: false,
    isGuest: false,
    subscriptionStatus: null,
  };
});

describe('PresentationChecker page', () => {
  it('happy path: upload → scores, finding cards, and the personalized example', async () => {
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );

    uploadFile();

    // Score header — all three dimensions.
    expect(await screen.findByTestId('score-narrative')).toHaveTextContent(
      '4/5',
    );
    expect(screen.getByTestId('score-design')).toHaveTextContent('2/5');
    expect(screen.getByTestId('score-content')).toHaveTextContent('5/5');
    // Attention summary prose + prioritization callout.
    expect(
      screen.getByText(/decorative header photo before the results figure/i),
    ).toBeTruthy();
    expect(screen.getByText(/demote Table 2 to an appendix/i)).toBeTruthy();
    // Finding cards render problem + fix, and the example as a blockquote.
    expect(
      screen.getByText(
        'The decorative header photo outranks the results figure.',
      ),
    ).toBeTruthy();
    const quote = screen.getByText(/Move "Figure 3: recall accuracy"/i);
    expect(quote.tagName).toBe('BLOCKQUOTE');
    expect(screen.getByText(/Sleep loss cut recall by a fifth/i)).toBeTruthy();
    // The critique request carried the page refs mapped from the artifact
    // (signedUrl → url, per the ReviewPageRef contract).
    expect(requestCritiqueMock).toHaveBeenCalledWith({
      sourceKind: 'pdf',
      // The upload filename rides along — the API stamps it into
      // source_meta, which is what the past-reviews list renders.
      filename: 'talk.pdf',
      pages: [
        {
          pageNumber: 1,
          url: ARTIFACT.pages[0]!.signedUrl,
          widthPx: 1650,
          heightPx: 1275,
        },
        {
          pageNumber: 2,
          url: ARTIFACT.pages[1]!.signedUrl,
          widthPx: 1650,
          heightPx: 1275,
        },
      ],
      posterDoc: undefined,
      posterId: undefined,
      reviewId: undefined,
    });
  });

  it('402 renders the paywall panel instead of results', async () => {
    requestCritiqueMock.mockRejectedValue(
      new ReviewPaymentRequiredError('no_credit'),
    );
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );

    uploadFile();

    expect(
      await screen.findByText(/Get feedback on your poster or talk/i),
    ).toBeTruthy();
    expect(screen.getByText(/Get the review pack/i)).toBeTruthy();
    expect(screen.queryByTestId('score-narrative')).toBeNull();
  });

  it('the follow-up button reveals the up-front disclosure before anything runs', async () => {
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );
    uploadFile();
    await screen.findByTestId('score-narrative');

    fireEvent.click(screen.getByText(/Request your one follow-up/i));

    // The verbatim disclosure (§5.2 hard requirement) — shown BEFORE the
    // follow-up can run, and clicking the button must not run anything.
    expect(
      screen.getByText(
        'This is your one follow-up — the review closes after it.',
      ),
    ).toBeTruthy();
    expect(requestCritiqueMock).toHaveBeenCalledTimes(1);
  });

  it('clicking a region-anchored card shows the bbox overlay on that page', async () => {
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );
    uploadFile();
    await screen.findByTestId('score-narrative');
    expect(screen.queryByTestId('region-overlay')).toBeNull();

    fireEvent.click(
      screen.getByText(
        'The decorative header photo outranks the results figure.',
      ),
    );

    const overlay = await screen.findByTestId('region-overlay');
    // bbox is normalized [x, y, width, height] fractions (D7) →
    // absolutely-positioned percentages.
    expect(overlay.style.left).toBe('10%');
    expect(overlay.style.top).toBe('20%');
    expect(overlay.style.width).toBe('30%');
    expect(overlay.style.height).toBe('40%');
  });
});
