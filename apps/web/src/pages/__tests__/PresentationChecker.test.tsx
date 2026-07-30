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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import PresentationChecker from '../../pages/PresentationChecker';

const {
  requestCritiqueMock,
  listMyReviewsMock,
  getMyReviewMock,
  ingestFileMock,
  ingestPosterMock,
  listPostersMock,
  loadPosterMock,
  createCheckoutMock,
} = vi.hoisted(() => ({
  requestCritiqueMock: vi.fn(),
  listMyReviewsMock: vi.fn(async (): Promise<unknown[]> => []),
  getMyReviewMock: vi.fn(),
  ingestFileMock: vi.fn(),
  ingestPosterMock: vi.fn(),
  listPostersMock: vi.fn(async (): Promise<unknown[]> => []),
  loadPosterMock: vi.fn(),
  createCheckoutMock: vi.fn(),
}));

vi.mock('@/review/reviewApi', () => ({
  requestCritique: requestCritiqueMock,
  listMyReviews: listMyReviewsMock,
  getMyReview: getMyReviewMock,
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
  listPosters: listPostersMock,
  loadPoster: loadPosterMock,
}));
vi.mock('@/data/billing', () => ({ createCheckout: createCheckoutMock }));
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

const scrollIntoViewMock = vi.fn();

const ARTIFACT = {
  pages: [
    {
      pageNumber: 1,
      storagePath: 'user-1/review-temp/session-1/page-1.jpg',
      signedUrl:
        'https://example.supabase.co/storage/v1/object/sign/poster-assets/user-1/review-temp/session-1/page-1.jpg?token=x',
      previewUrl: 'blob:https://postr.test/review-page-1',
      widthPx: 1650,
      heightPx: 1275,
    },
    {
      pageNumber: 2,
      storagePath: 'user-1/review-temp/session-1/page-2.jpg',
      signedUrl:
        'https://example.supabase.co/storage/v1/object/sign/poster-assets/user-1/review-temp/session-1/page-2.jpg?token=x',
      previewUrl: 'blob:https://postr.test/review-page-2',
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

const POSTER_ROW = {
  id: 'poster-1',
  title: 'Research poster',
  data: {
    version: 1 as const,
    widthIn: 48,
    heightIn: 36,
    blocks: [],
    fontFamily: 'Source Sans 3',
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
      title: {
        size: 72,
        weight: 700 as const,
        italic: false,
        lineHeight: 1.1,
        color: null,
        highlight: null,
      },
      heading: {
        size: 28,
        weight: 600 as const,
        italic: false,
        lineHeight: 1.2,
        color: null,
        highlight: null,
      },
      authors: {
        size: 18,
        weight: 400 as const,
        italic: false,
        lineHeight: 1.3,
        color: null,
        highlight: null,
      },
      body: {
        size: 14,
        weight: 400 as const,
        italic: false,
        lineHeight: 1.4,
        color: null,
        highlight: null,
      },
    },
    headingStyle: {
      border: 'bottom' as const,
      fill: false,
      align: 'left' as const,
    },
    institutions: [],
    authors: [],
    references: [],
  },
};

const POSTER_ARTIFACT = {
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
  posterDoc: POSTER_ROW.data,
  meta: {
    sourceKind: 'postr' as const,
    pageCount: 1,
    ingestedAt: '2026-07-29T10:00:00Z',
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function uploadFile(name = 'talk.pdf') {
  fireEvent.change(screen.getByLabelText('File to review'), {
    target: { files: [new File(['x'], name, { type: 'application/pdf' })] },
  });
}

beforeEach(() => {
  vi.stubEnv('VITE_ENABLE_REVIEW_PPTX', 'true');
  requestCritiqueMock.mockReset();
  listMyReviewsMock.mockReset();
  listMyReviewsMock.mockResolvedValue([]);
  getMyReviewMock.mockReset();
  ingestFileMock.mockReset();
  ingestFileMock.mockResolvedValue(ARTIFACT);
  ingestPosterMock.mockReset();
  ingestPosterMock.mockResolvedValue(POSTER_ARTIFACT);
  listPostersMock.mockReset();
  listPostersMock.mockResolvedValue([]);
  loadPosterMock.mockReset();
  createCheckoutMock.mockReset();
  scrollIntoViewMock.mockReset();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoViewMock,
  });
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

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('PresentationChecker page', () => {
  it('hides PPTX and explains the PDF fallback until the worker smoke passes', async () => {
    vi.stubEnv('VITE_ENABLE_REVIEW_PPTX', 'false');
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('File to review')).toHaveAttribute(
      'accept',
      '.pdf,.png,.jpg',
    );
    expect(screen.getByText(/PPTX is coming next/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('File to review'), {
      target: {
        files: [
          new File(['pptx'], 'talk.pptx', {
            type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          }),
        ],
      },
    });

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent(/Export the deck as a PDF/i);
    expect(ingestFileMock).not.toHaveBeenCalled();
  });

  it('happy path: upload → scores, finding cards, and the personalized example', async () => {
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );

    uploadFile();

    expect(await screen.findByTestId('score-narrative')).toHaveTextContent(
      '4/5',
    );
    expect(screen.getByTestId('score-design')).toHaveTextContent('2/5');
    expect(screen.getByTestId('score-content')).toHaveTextContent('5/5');
    expect(
      screen.getByText(/decorative header photo before the results figure/i),
    ).toBeTruthy();
    expect(screen.getByText(/demote Table 2 to an appendix/i)).toBeTruthy();
    expect(
      screen.getByText(
        'The decorative header photo outranks the results figure.',
      ),
    ).toBeTruthy();
    const quote = screen.getByText(/Move "Figure 3: recall accuracy"/i);
    expect(quote.tagName).toBe('BLOCKQUOTE');
    expect(screen.getByText(/Sleep loss cut recall by a fifth/i)).toBeTruthy();
    expect(requestCritiqueMock).toHaveBeenCalledWith({
      sourceKind: 'pdf',
      filename: 'talk.pdf',
      pages: [
        {
          pageNumber: 1,
          storagePath: ARTIFACT.pages[0]!.storagePath,
          url: ARTIFACT.pages[0]!.signedUrl,
          widthPx: 1650,
          heightPx: 1275,
        },
        {
          pageNumber: 2,
          storagePath: ARTIFACT.pages[1]!.storagePath,
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

  it('shows the local page preview after temporary signed files are cleaned', async () => {
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );
    uploadFile();
    await screen.findByTestId('score-narrative');

    expect(screen.getByAltText('Page 1')).toHaveAttribute(
      'src',
      'blob:https://postr.test/review-page-1',
    );
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

  it('does not sell a second weekly add-on when the active add-on quota is exhausted', async () => {
    planState.value = {
      ...planState.value,
      hasActiveTerm: true,
      hasReviewAddon: true,
    };
    requestCritiqueMock.mockRejectedValue(
      new ReviewPaymentRequiredError('weekly_quota_exceeded', 3600),
    );
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );

    uploadFile();

    expect(await screen.findByText(/used this week's reviews/i)).toBeTruthy();
    expect(screen.getByText(/Get the review pack/i)).toBeTruthy();
    expect(
      screen.queryByRole('button', {
        name: /Add weekly reviews to your term/i,
      }),
    ).toBeNull();
  });

  it('synchronously disables add-on checkout and coalesces a double click', async () => {
    planState.value = {
      ...planState.value,
      hasActiveTerm: true,
    };
    requestCritiqueMock.mockRejectedValue(
      new ReviewPaymentRequiredError('no_credit'),
    );
    const checkoutGate = deferred<string>();
    createCheckoutMock.mockReturnValue(checkoutGate.promise);
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );
    uploadFile();

    const button = await screen.findByRole('button', {
      name: /Add weekly reviews to your term/i,
    }) as HTMLButtonElement;
    act(() => {
      button.click();
      button.click();
    });

    expect(createCheckoutMock).toHaveBeenCalledTimes(1);
    expect(createCheckoutMock).toHaveBeenCalledWith('review_addon');
    expect(button).toBeDisabled();
  });

  it('stops a guest PPTX before the permanent-account render endpoint', async () => {
    planState.value = {
      ...planState.value,
      isGuest: true,
      canReview: false,
      reviewCredits: 0,
    };
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('File to review'), {
      target: {
        files: [
          new File(['pptx'], 'talk.pptx', {
            type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          }),
        ],
      },
    });

    expect(
      await screen.findByRole('heading', {
        name: /Get feedback on your poster or talk/i,
      }),
    ).toBeTruthy();
    expect(ingestFileMock).not.toHaveBeenCalled();
  });

  it('defers PPTX selection until guest status has resolved', () => {
    planState.value = {
      ...planState.value,
      loading: true,
      isGuest: true,
    };
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('File to review'), {
      target: {
        files: [
          new File(['pptx'], 'talk.pptx', {
            type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          }),
        ],
      },
    });

    expect(
      screen.queryByRole('heading', {
        name: /Get feedback on your poster or talk/i,
      }),
    ).toBeNull();
    expect(ingestFileMock).not.toHaveBeenCalled();
  });

  it('disables file selection while guest status is loading', () => {
    planState.value = {
      ...planState.value,
      loading: true,
      isGuest: true,
    };
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('button', { name: 'Choose a file' }),
    ).toBeDisabled();
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
    expect(overlay.style.left).toBe('10%');
    expect(overlay.style.top).toBe('20%');
    expect(overlay.style.width).toBe('30%');
    expect(overlay.style.height).toBe('40%');
    expect(screen.getByTestId('review-page-1')).toHaveFocus();
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing the highlighted issue on page 1.',
    );
  });

  it('clicking a slide-anchored card focuses its page and clears a stale region', async () => {
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );
    uploadFile();
    await screen.findByTestId('score-narrative');

    fireEvent.click(
      screen.getByText(
        'The decorative header photo outranks the results figure.',
      ),
    );
    expect(await screen.findByTestId('region-overlay')).toBeTruthy();

    fireEvent.click(
      screen.getByText('The deck ends on methods details with no take-home.'),
    );

    expect(screen.queryByTestId('region-overlay')).toBeNull();
    expect(screen.getByTestId('review-page-2')).toHaveFocus();
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('Showing page 2.');
  });

  it('activates a slide-anchored card from the keyboard', async () => {
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );
    uploadFile();
    await screen.findByTestId('score-narrative');

    const finding = screen
      .getByText('The deck ends on methods details with no take-home.')
      .closest('[role="button"]');
    expect(finding).not.toBeNull();
    fireEvent.keyDown(finding!, { key: 'Enter' });

    expect(screen.getByTestId('review-page-2')).toHaveFocus();
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  it('jumps a native block-anchored card to the single poster page', async () => {
    requestCritiqueMock.mockResolvedValue({
      ...CRITIQUE,
      critique: {
        ...CRITIQUE.critique,
        findings: [
          {
            ...CRITIQUE.critique.findings[0]!,
            anchor: { kind: 'block' as const, blockId: 'results-block' },
          },
        ],
      },
    });
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );
    uploadFile();
    await screen.findByTestId('score-narrative');

    fireEvent.click(
      screen.getByText(
        'The decorative header photo outranks the results figure.',
      ),
    );

    expect(screen.getByTestId('review-page-1')).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Showing page 1.');
  });

  it('coalesces rapid activation while a Postr poster is loading', async () => {
    const loadingPoster = deferred<typeof POSTER_ROW>();
    listPostersMock.mockResolvedValue([POSTER_ROW]);
    loadPosterMock.mockReturnValue(loadingPoster.promise);
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );

    fireEvent.change(
      await screen.findByLabelText(/review one of your Postr posters/i),
      { target: { value: POSTER_ROW.id } },
    );
    const reviewButton = screen.getByRole('button', {
      name: 'Review this poster',
    });
    fireEvent.click(reviewButton);
    fireEvent.click(reviewButton);

    expect(loadPosterMock).toHaveBeenCalledTimes(1);
    loadingPoster.resolve(POSTER_ROW);
    expect(await screen.findByTestId('score-narrative')).toBeTruthy();
    expect(ingestPosterMock).toHaveBeenCalledTimes(1);
    expect(requestCritiqueMock).toHaveBeenCalledTimes(1);
  });

  it('mounts the selected Postr poster canvas before its capture starts', async () => {
    listPostersMock.mockResolvedValue([POSTER_ROW]);
    loadPosterMock.mockResolvedValue(POSTER_ROW);
    ingestPosterMock.mockImplementation(async () => {
      expect(document.getElementById('poster-canvas')).not.toBeNull();
      return POSTER_ARTIFACT;
    });
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );

    fireEvent.change(
      await screen.findByLabelText(/review one of your Postr posters/i),
      { target: { value: POSTER_ROW.id } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Review this poster' }),
    );

    expect(await screen.findByTestId('score-narrative')).toBeTruthy();
    expect(document.getElementById('poster-canvas')).toBeNull();
  });

  it('settles layout after fonts load before capturing a selected poster', async () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    listPostersMock.mockResolvedValue([POSTER_ROW]);
    loadPosterMock.mockResolvedValue(POSTER_ROW);
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );

    fireEvent.change(
      await screen.findByLabelText(/review one of your Postr posters/i),
      { target: { value: POSTER_ROW.id } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Review this poster' }),
    );

    await waitFor(() => expect(frameCallbacks).toHaveLength(1));
    expect(ingestPosterMock).not.toHaveBeenCalled();
    await act(async () => {
      frameCallbacks.shift()?.(0);
      await Promise.resolve();
    });
    expect(frameCallbacks).toHaveLength(1);
    expect(ingestPosterMock).not.toHaveBeenCalled();
    await act(async () => {
      frameCallbacks.shift()?.(16);
      await Promise.resolve();
    });

    await waitFor(() => expect(ingestPosterMock).toHaveBeenCalledTimes(1));
  });

  it('coalesces rapid activation of the one Postr follow-up', async () => {
    const loadingRevision = deferred<typeof POSTER_ROW>();
    listPostersMock.mockResolvedValue([POSTER_ROW]);
    loadPosterMock
      .mockResolvedValueOnce(POSTER_ROW)
      .mockReturnValue(loadingRevision.promise);
    requestCritiqueMock
      .mockResolvedValueOnce(CRITIQUE)
      .mockResolvedValueOnce({ ...CRITIQUE, stage: 'closed' });
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );

    fireEvent.change(
      await screen.findByLabelText(/review one of your Postr posters/i),
      { target: { value: POSTER_ROW.id } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Review this poster' }),
    );
    await screen.findByTestId('score-narrative');
    fireEvent.click(screen.getByText(/Request your one follow-up/i));
    const followupButton = screen.getByRole('button', {
      name: 'Run the follow-up on my poster',
    });
    fireEvent.click(followupButton);
    fireEvent.click(followupButton);

    expect(loadPosterMock).toHaveBeenCalledTimes(2);
    loadingRevision.resolve(POSTER_ROW);
    expect(
      await screen.findByRole('button', { name: 'Start a new review' }),
    ).toBeTruthy();
    expect(ingestPosterMock).toHaveBeenCalledTimes(2);
    expect(requestCritiqueMock).toHaveBeenCalledTimes(2);
  });

  it('catches a rejected poster load and renders the page error state', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    listPostersMock.mockResolvedValue([POSTER_ROW]);
    loadPosterMock.mockRejectedValue(new Error('database unavailable'));
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );

    fireEvent.change(
      await screen.findByLabelText(/review one of your Postr posters/i),
      { target: { value: POSTER_ROW.id } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Review this poster' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That poster could not be loaded — it may have been deleted.',
    );
    expect(requestCritiqueMock).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      '[review] poster load failed:',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it('reopens an uploaded review after reload and resumes its follow-up with the revised file', async () => {
    const summary = {
      id: 'rev-upload',
      posterId: null,
      sourceKind: 'pdf' as const,
      status: 'complete' as const,
      stage: 'initial' as const,
      filename: 'conference-talk.pdf',
      pageCount: 2,
      dimensionScores: CRITIQUE.critique.dimensionScores,
      createdAt: '2026-07-29T10:00:00Z',
    };
    listMyReviewsMock.mockResolvedValue([summary]);
    getMyReviewMock.mockResolvedValue({
      ...summary,
      critique: CRITIQUE.critique,
    });
    requestCritiqueMock.mockResolvedValue({
      ...CRITIQUE,
      reviewId: summary.id,
      stage: 'closed',
    });
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open review: conference-talk.pdf',
      }),
    );

    expect(getMyReviewMock).toHaveBeenCalledWith('rev-upload');
    expect(await screen.findByTestId('score-narrative')).toHaveTextContent(
      '4/5',
    );
    expect(
      screen.getByText(/original temporary file is no longer available/i),
    ).toBeTruthy();
    fireEvent.click(screen.getByText(/Request your one follow-up/i));
    expect(
      screen.getByText(/Pick the revised file/i),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose the revised file' }),
    );

    ingestFileMock.mockResolvedValue({
      ...ARTIFACT,
      meta: {
        ...ARTIFACT.meta,
        filename: 'conference-talk-revised.pdf',
      },
    });
    uploadFile('conference-talk-revised.pdf');

    await waitFor(() =>
      expect(requestCritiqueMock).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: 'conference-talk-revised.pdf',
          reviewId: 'rev-upload',
        }),
      ),
    );
  });

  it('keeps an interrupted follow-up-stage review resumable after reload', async () => {
    const summary = {
      id: 'rev-interrupted-followup',
      posterId: null,
      sourceKind: 'pdf' as const,
      status: 'complete' as const,
      stage: 'followup' as const,
      filename: 'interrupted-talk.pdf',
      pageCount: 2,
      dimensionScores: CRITIQUE.critique.dimensionScores,
      createdAt: '2026-07-29T10:00:00Z',
    };
    listMyReviewsMock.mockResolvedValue([summary]);
    getMyReviewMock.mockResolvedValue({
      ...summary,
      critique: CRITIQUE.critique,
    });
    ingestFileMock.mockResolvedValue({
      ...ARTIFACT,
      meta: {
        ...ARTIFACT.meta,
        filename: 'interrupted-talk-revised.pdf',
      },
    });
    requestCritiqueMock.mockResolvedValue({
      ...CRITIQUE,
      reviewId: summary.id,
      stage: 'closed',
    });
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open review: interrupted-talk.pdf',
      }),
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Request your one follow-up',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose the revised file' }),
    );
    uploadFile('interrupted-talk-revised.pdf');

    await waitFor(() =>
      expect(requestCritiqueMock).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: 'interrupted-talk-revised.pdf',
          reviewId: 'rev-interrupted-followup',
        }),
      ),
    );
  });

  it('reopens a Postr review after reload and regenerates the poster for its included follow-up', async () => {
    const summary = {
      id: 'rev-poster',
      posterId: POSTER_ROW.id,
      sourceKind: 'postr' as const,
      status: 'complete' as const,
      stage: 'initial' as const,
      filename: null,
      pageCount: 1,
      dimensionScores: CRITIQUE.critique.dimensionScores,
      createdAt: '2026-07-29T10:00:00Z',
    };
    listMyReviewsMock.mockResolvedValue([summary]);
    getMyReviewMock.mockResolvedValue({
      ...summary,
      critique: CRITIQUE.critique,
    });
    loadPosterMock.mockResolvedValue(POSTER_ROW);
    requestCritiqueMock.mockResolvedValue({
      ...CRITIQUE,
      reviewId: summary.id,
      stage: 'closed',
    });
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open review: Postr poster',
      }),
    );
    expect(await screen.findByTestId('score-design')).toHaveTextContent('2/5');
    fireEvent.click(screen.getByText(/Request your one follow-up/i));
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Run the follow-up on my poster',
      }),
    );

    await waitFor(() =>
      expect(requestCritiqueMock).toHaveBeenCalledWith(
        expect.objectContaining({
          posterId: POSTER_ROW.id,
          reviewId: 'rev-poster',
        }),
      ),
    );
    expect(loadPosterMock).toHaveBeenCalledWith(POSTER_ROW.id);
    expect(ingestPosterMock).toHaveBeenCalledWith({
      doc: POSTER_ROW.data,
      posterId: POSTER_ROW.id,
    });
  });
});
