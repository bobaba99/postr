/**
 * ReviewTab — the editor's Presentation Checker panel, tested in
 * isolation: the poster store is seeded directly (the
 * EditableExportButtons.test.tsx convention), and reviewApi / ingest /
 * usePlan / billing / checkout-intent are module-mocked. The mocked
 * ReviewPaymentRequiredError class keeps `instanceof` working because
 * the component and the test share the same mocked binding.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useState, type ComponentProps } from 'react';
import { ReviewTab } from '../sidebar/ReviewTab';
import { Sidebar, type SidebarTab } from '../Sidebar';
import { usePosterStore } from '@/stores/posterStore';

const { requestCritiqueMock, ingestMock, createCheckoutMock } = vi.hoisted(() => ({
  requestCritiqueMock: vi.fn(),
  ingestMock: vi.fn(),
  createCheckoutMock: vi.fn(),
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

vi.mock('@/data/billing', () => ({ createCheckout: createCheckoutMock }));
vi.mock('@/data/checkoutIntent', () => ({ stashCheckoutIntent: vi.fn() }));
vi.mock('@/components/UpdateAvailableToast', () => ({
  UpdateAvailableBanner: () => null,
  JustRefreshedBanner: () => null,
}));

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
    title: {
      size: 72,
      weight: 700,
      italic: false,
      lineHeight: 1.1,
      color: null,
      highlight: null,
    },
    heading: {
      size: 28,
      weight: 600,
      italic: false,
      lineHeight: 1.2,
      color: null,
      highlight: null,
    },
    authors: {
      size: 18,
      weight: 400,
      italic: false,
      lineHeight: 1.3,
      color: null,
      highlight: null,
    },
    body: {
      size: 14,
      weight: 400,
      italic: false,
      lineHeight: 1.4,
      color: null,
      highlight: null,
    },
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
        example:
          'Cut "Sleep has been studied since…" down to "Sleep loss impairs recall."',
      },
    ],
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function seedPoster() {
  usePosterStore.setState({
    posterId: 'poster-1',
    posterTitle: 'Test poster',
    doc: DOC,
  } as never);
}

function SidebarHarness() {
  const [activeTab, setActiveTab] = useState<SidebarTab>('review');
  const noop = () => {};
  const baseProps = {
    posterTitle: 'Test poster',
    onChangePosterTitle: noop,
    posterSizeKey: '48×36',
    posterWidthIn: 48,
    posterHeightIn: 36,
    onChangePosterSize: noop,
    onChangeCustomSize: noop,
    showGrid: false,
    onToggleGrid: noop,
    showRuler: false,
    onToggleRuler: noop,
    fontFamily: 'Inter',
    onChangeFont: noop,
    palette: DOC.palette,
    paletteName: 'Test',
    onChangePalette: noop,
    styles: DOC.styles,
    onChangeStyles: noop,
    headingStyle: DOC.headingStyle,
    onChangeHeadingStyle: noop,
    authors: [],
    onChangeAuthors: noop,
    institutions: [],
    onChangeInstitutions: noop,
    references: [],
    onChangeReferences: noop,
    citationStyle: 'APA 7',
    onChangeCitationStyle: noop,
    selectedBlock: null,
    onUpdateBlock: noop,
    onAddBlock: noop,
    onApplyTemplate: noop,
    onAutoLayout: noop,
    onPrint: noop,
    onPrintAtStaples: noop,
    onPreview: noop,
    onPublish: noop,
    savedPresets: [],
    onSavePreset: noop,
    onLoadPreset: noop,
    customPalettes: [],
    onCreateCustomPalette: noop,
    onEditCustomPalette: noop,
    onDeleteCustomPalette: noop,
    checkFigureWidthIn: 10,
    checkFigureHeightIn: 7,
    figureMode: 'check',
    onChangeFigureMode: noop,
    posterTables: [],
    onInsertChart: noop,
    issues: [],
    posterId: 'poster-1',
    pendingCommentAnchor: null,
    onClearPendingCommentAnchor: noop,
    onSaveVersion: async () => {},
    onRestoreVersion: async () => {},
  } as unknown as Omit<
    ComponentProps<typeof Sidebar>,
    'activeTab' | 'onChangeTab'
  >;

  return (
    <Sidebar
      {...baseProps}
      activeTab={activeTab}
      onChangeTab={setActiveTab}
    />
  );
}

beforeEach(() => {
  vi.stubEnv('VITE_ENABLE_PRESENTATION_CHECKER', 'true');
  seedPoster();
  requestCritiqueMock.mockReset();
  ingestMock.mockReset();
  ingestMock.mockResolvedValue(ARTIFACT);
  createCheckoutMock.mockReset();
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
  it('keeps the editor entry point hidden until the rollout flag is enabled', async () => {
    vi.stubEnv('VITE_ENABLE_PRESENTATION_CHECKER', 'false');
    render(
      <MemoryRouter>
        <SidebarHarness />
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole('button', { name: 'review' }),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'layout' }),
      ).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('run renders the score header and finding cards from the fromPoster ingest', async () => {
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    render(
      <MemoryRouter>
        <ReviewTab />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Review this poster'));

    expect(ingestMock).toHaveBeenCalledWith({
      doc: DOC,
      posterId: 'poster-1',
    });
    expect(await screen.findByTestId('score-design')).toHaveTextContent('2/5');
    expect(requestCritiqueMock).toHaveBeenCalledWith({
      sourceKind: 'postr',
      pages: [
        {
          pageNumber: 1,
          url: ARTIFACT.pages[0]!.signedUrl,
          widthPx: 2048,
          heightPx: 1536,
          storagePath: ARTIFACT.pages[0]!.storagePath,
        },
      ],
      posterDoc: DOC,
      posterId: 'poster-1',
      reviewId: undefined,
    });
    expect(
      screen.getByText('The background block outranks the key result.'),
    ).toBeTruthy();
    expect(screen.getByText(/Sleep loss impairs recall/i)).toBeTruthy();
  });

  it('releases the editor-only local capture preview after the request settles', async () => {
    const revoke = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);
    ingestMock.mockResolvedValue({
      ...ARTIFACT,
      pages: [
        {
          ...ARTIFACT.pages[0]!,
          previewUrl: 'blob:https://postr.test/editor-review',
        },
      ],
    });
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    render(
      <MemoryRouter>
        <ReviewTab />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Review this poster'));
    await screen.findByTestId('score-design');

    expect(revoke).toHaveBeenCalledWith(
      'blob:https://postr.test/editor-review',
    );
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
    planState.value = {
      ...planState.value,
      canReview: false,
      reviewCredits: 0,
    };
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

  it('does not sell a second weekly add-on to an active add-on subscriber', () => {
    planState.value = {
      ...planState.value,
      canReview: false,
      reviewCredits: 0,
      hasReviewAddon: true,
    };
    render(
      <MemoryRouter>
        <ReviewTab />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Get the review pack/i)).toBeTruthy();
    expect(screen.queryByText('Add weekly reviews')).toBeNull();
  });

  it('synchronously disables add-on checkout and coalesces a double click', () => {
    planState.value = {
      ...planState.value,
      canReview: false,
      reviewCredits: 0,
      hasReviewAddon: false,
    };
    const checkoutGate = deferred<string>();
    createCheckoutMock.mockReturnValue(checkoutGate.promise);
    render(
      <MemoryRouter>
        <ReviewTab />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', {
      name: 'Add weekly reviews',
    }) as HTMLButtonElement;
    act(() => {
      button.click();
      button.click();
    });

    expect(createCheckoutMock).toHaveBeenCalledTimes(1);
    expect(createCheckoutMock).toHaveBeenCalledWith('review_addon');
    expect(button).toBeDisabled();
  });

  it('coalesces same-tick initial review activations into one request', async () => {
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    const ingestGate = deferred<typeof ARTIFACT>();
    ingestMock.mockReturnValue(ingestGate.promise);
    render(
      <MemoryRouter>
        <ReviewTab />
      </MemoryRouter>,
    );

    const runButton = screen.getByText(
      'Review this poster',
    ) as HTMLButtonElement;
    act(() => {
      runButton.click();
      runButton.click();
    });

    expect(ingestMock).toHaveBeenCalledTimes(1);
    ingestGate.resolve(ARTIFACT);
    await waitFor(() => {
      expect(requestCritiqueMock).toHaveBeenCalledTimes(1);
    });
  });

  it('coalesces same-tick follow-up activations into one request', async () => {
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    render(
      <MemoryRouter>
        <ReviewTab />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('Review this poster'));
    await screen.findByTestId('score-design');
    fireEvent.click(screen.getByText('Request your one follow-up'));

    ingestMock.mockClear();
    requestCritiqueMock.mockClear();
    const ingestGate = deferred<typeof ARTIFACT>();
    ingestMock.mockReturnValue(ingestGate.promise);
    const followupButton = screen.getByText(
      'Run the follow-up',
    ) as HTMLButtonElement;
    act(() => {
      followupButton.click();
      followupButton.click();
    });

    expect(ingestMock).toHaveBeenCalledTimes(1);
    ingestGate.resolve(ARTIFACT);
    await waitFor(() => {
      expect(requestCritiqueMock).toHaveBeenCalledTimes(1);
    });
  });

  it('coalesces same-tick new-review activations into one request', async () => {
    requestCritiqueMock.mockResolvedValue({
      ...CRITIQUE,
      stage: 'closed' as const,
    });
    render(
      <MemoryRouter>
        <ReviewTab />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('Review this poster'));
    await screen.findByTestId('score-design');

    ingestMock.mockClear();
    requestCritiqueMock.mockClear();
    const ingestGate = deferred<typeof ARTIFACT>();
    ingestMock.mockReturnValue(ingestGate.promise);
    const newReviewButton = screen.getByText(
      'Start a new review',
    ) as HTMLButtonElement;
    act(() => {
      newReviewButton.click();
      newReviewButton.click();
    });

    expect(ingestMock).toHaveBeenCalledTimes(1);
    ingestGate.resolve(ARTIFACT);
    await waitFor(() => {
      expect(requestCritiqueMock).toHaveBeenCalledTimes(1);
    });
  });

  it('preserves a paid result and follow-up state across sidebar tab switches', async () => {
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    render(
      <MemoryRouter>
        <SidebarHarness />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Review this poster'));
    const scoreBeforeSwitch = await screen.findByTestId('score-design');
    fireEvent.click(screen.getByText('Request your one follow-up'));
    expect(
      screen.getByText(/the review closes after it/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'edit block' }));
    fireEvent.click(screen.getByRole('button', { name: 'review' }));

    expect(screen.getByTestId('score-design')).toBe(scoreBeforeSwitch);
    expect(
      screen.getByText(/the review closes after it/i),
    ).toBeInTheDocument();
    expect(requestCritiqueMock).toHaveBeenCalledTimes(1);
  });
});
