/**
 * ReviewTab — the editor's Presentation Checker panel, tested in
 * isolation: the poster store is seeded directly (the
 * EditableExportButtons.test.tsx convention), and reviewApi / ingest /
 * usePlan / billing / checkout-intent are module-mocked. The mocked
 * ReviewPaymentRequiredError class keeps `instanceof` working because
 * the component and the test share the same mocked binding.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ReviewTab } from '../sidebar/ReviewTab';
import { usePosterStore } from '@/stores/posterStore';

const { requestCritiqueMock, ingestMock } = vi.hoisted(() => ({
  requestCritiqueMock: vi.fn(),
  ingestMock: vi.fn(),
}));

vi.mock('@/review/reviewApi', () => ({
  requestCritique: requestCritiqueMock,
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

vi.mock('@/review/ingest', () => ({ ingestPosterForReview: ingestMock }));

const planState = {
  value: {
    loading: false,
    hasActiveTerm: true,
    credits: 0,
    reviewCredits: 1,
    hasReviewAddon: false,
    canReview: true,
    canExport: true,
    isGuest: false,
    subscriptionStatus: 'active' as string | null,
  },
};
vi.mock('@/hooks/usePlan', () => ({ usePlan: () => planState.value }));

vi.mock('@/data/billing', () => ({ createCheckout: vi.fn() }));
vi.mock('@/data/checkoutIntent', () => ({ stashCheckoutIntent: vi.fn() }));

import { ReviewPaymentRequiredError } from '@/review/reviewApi';

const DOC = {
  version: 1,
  widthIn: 48,
  heightIn: 36,
  blocks: [
    {
      id: 'block-1',
      type: 'text',
      x: 10,
      y: 10,
      w: 400,
      h: 120,
      content: '<p>Background filler</p>',
      imageSrc: null,
      imageFit: 'contain',
      tableData: null,
    },
  ],
  fontFamily: 'Inter',
  palette: {
    bg: '#ffffff',
    primary: '#0f172a',
    accent: '#2563eb',
    accent2: '#0ea5e9',
    muted: '#64748b',
    headerBg: '#0f172a',
    headerFg: '#ffffff',
  },
  styles: {
    title: { size: 72, weight: 700, italic: false, lineHeight: 1.1, color: null, highlight: null },
    heading: { size: 28, weight: 600, italic: false, lineHeight: 1.2, color: null, highlight: null },
    authors: { size: 18, weight: 400, italic: false, lineHeight: 1.3, color: null, highlight: null },
    body: { size: 14, weight: 400, italic: false, lineHeight: 1.4, color: null, highlight: null },
  },
  headingStyle: { border: 'bottom', fill: false, align: 'left' },
  institutions: [],
  authors: [],
  references: [],
};

const ARTIFACT = {
  pages: [
    {
      pageNumber: 1,
      storagePath: 'user-1/poster-1/review-capture.jpg',
      signedUrl:
        'https://example.supabase.co/storage/v1/object/sign/poster-assets/user-1/poster-1/review-capture.jpg?token=x',
      widthPx: 2048,
      heightPx: 1536,
    },
  ],
  posterDoc: DOC,
  meta: {
    sourceKind: 'postr' as const,
    pageCount: 1,
    ingestedAt: '2026-07-29T10:00:00Z',
  },
};

const CRITIQUE = {
  reviewId: 'rev-1',
  stage: 'initial' as const,
  critique: {
    dimensionScores: { narrative: 3, design: 2, content: 4 },
    attentionSummary: 'The eye lands on the background paragraph first.',
    findings: [
      {
        dimension: 'narrative' as const,
        severity: 'high' as const,
        category: 'buried-key-result' as const,
        anchor: { kind: 'block' as const, blockId: 'block-1' },
        action: 'condense' as const,
        problem: 'The background block outranks the key result.',
        fix: 'Condense the background to two lines and lead with the result.',
        example: 'Cut "Sleep has been studied since…" down to "Sleep loss impairs recall."',
      },
    ],
  },
};

function seedPoster() {
  usePosterStore.setState({
    posterId: 'poster-1',
    posterTitle: 'Test poster',
    doc: DOC,
  } as never);
}

beforeEach(() => {
  seedPoster();
  requestCritiqueMock.mockReset();
  ingestMock.mockReset();
  ingestMock.mockResolvedValue(ARTIFACT);
  planState.value = {
    loading: false,
    hasActiveTerm: true,
    credits: 0,
    reviewCredits: 1,
    hasReviewAddon: false,
    canReview: true,
    canExport: true,
    isGuest: false,
    subscriptionStatus: 'active',
  };
});

describe('ReviewTab', () => {
  it('run renders the score header and finding cards from the fromPoster ingest', async () => {
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    render(
      <MemoryRouter>
        <ReviewTab />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Review this poster'));

    // The ingest ran off the store's doc + posterId…
    expect(ingestMock).toHaveBeenCalledWith({ doc: DOC, posterId: 'poster-1' });
    // The critique call awaits the ingest promise inside run(), so it
    // lands a microtask after the click — wait for the run to render
    // before asserting on it (the waitFor convention from
    // EditableExportButtons.test.tsx).
    expect(await screen.findByTestId('score-design')).toHaveTextContent('2/5');
    // …and the critique carried the postr sourceKind, mapped page refs,
    // and the structured doc.
    expect(requestCritiqueMock).toHaveBeenCalledWith({
      sourceKind: 'postr',
      pages: [
        {
          pageNumber: 1,
          url: ARTIFACT.pages[0]!.signedUrl,
          widthPx: 2048,
          heightPx: 1536,
        },
      ],
      posterDoc: DOC,
      posterId: 'poster-1',
      reviewId: undefined,
    });
    expect(
      screen.getByText('The background block outranks the key result.'),
    ).toBeTruthy();
    expect(
      screen.getByText(/Sleep loss impairs recall/i),
    ).toBeTruthy();
  });

  it('clicking a block-anchored card calls onJumpToBlock with the blockId', async () => {
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    const onJumpToBlock = vi.fn();
    render(
      <MemoryRouter>
        <ReviewTab onJumpToBlock={onJumpToBlock} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('Review this poster'));
    await screen.findByTestId('score-design');

    fireEvent.click(
      screen.getByText('The background block outranks the key result.'),
    );

    expect(onJumpToBlock).toHaveBeenCalledWith('block-1');
  });

  it('a user who cannot review sees the paywall instead of the run button', () => {
    planState.value = { ...planState.value, canReview: false, reviewCredits: 0 };
    render(
      <MemoryRouter>
        <ReviewTab />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Get feedback on your poster/i)).toBeTruthy();
    expect(screen.getByText(/Get the review pack/i)).toBeTruthy();
    expect(screen.queryByText('Review this poster')).toBeNull();
    expect(requestCritiqueMock).not.toHaveBeenCalled();
  });
});
