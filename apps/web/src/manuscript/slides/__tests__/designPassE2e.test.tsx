/**
 * Task 10 — the design-pass integration (Phase-2 spec §1).
 *
 * Drives the wizard with INJECTED style + theme clients (testHooks), so no
 * network is touched, through: manuscript → extract → build the plain deck
 * → AUTOMATIC style+theme pass → styled deck renders in the viewer → a vibe
 * submit re-themes (re-runs theme only, keeps the styled structure) → the
 * export drawer calls the styled writers (exportStyledDeckPptx /
 * exportStyledDeckPdf), never the Phase-1 plain ones.
 *
 * Mirrors e2e.test.tsx's injection pattern (testHooks) and MANUSCRIPT
 * fixture shape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SlidesWizard } from '../SlidesWizard';
import * as utilitySlidesModule from '../../../export/deck/exportStyledDeckWithUtilitySlides';
import * as deckPdfModule from '../../../export/pdf/deckPdf';
import type { StyledSlide } from '../../deck/styledTypes';
import type { SlideDeck } from '../../deck/types';

const MANUSCRIPT = [
  'Spaced practice in the classroom',
  '',
  'Jane Doe, John Smith',
  '',
  'Introduction',
  'Classroom evidence over many weeks is thin.',
  '',
  'Methods',
  'Two conditions, 120 students, six weeks.',
  '',
  'Results',
  'Spacing raised six-week recall by 34%. The effect held across every age band.',
].join('\n');

const injectedFindings = {
  findings: [
    { text: 'Spacing +34% recall', sourceQuote: 'raised six-week recall by 34%', sourceSection: 'Results', rank: 1 },
    { text: 'Held across ages', sourceQuote: 'held across every age band', sourceSection: 'Results', rank: 2 },
  ],
};

// Index-aligned 1:1 with buildDeck.ts's fixed slide order (title, hook,
// question, methods, one per ranked finding, references) — styleClient.ts's
// documented contract, and what SlideViewer.tsx's alignment guard requires
// to actually render the styled stage instead of falling back to plain.
// MANUSCRIPT + injectedFindings (2 findings, 10-min duration) produce
// exactly 7 plain slides, so this fixture has exactly 7 entries too.
const STYLED_SLIDES: StyledSlide[] = [
  {
    role: 'title',
    device: 'plain',
    elements: [{ kind: 'title', text: 'Spaced practice in the classroom', x: 0.7, y: 0.5 }],
  },
  {
    role: 'hook',
    device: 'plain',
    elements: [{ kind: 'body', text: 'Classroom evidence over many weeks is thin.', x: 0.7, y: 0.6 }],
  },
  {
    role: 'question',
    device: 'plain',
    elements: [{ kind: 'body', text: 'This study takes up that question directly.', x: 0.7, y: 0.6 }],
  },
  {
    role: 'methods',
    device: 'plain',
    elements: [{ kind: 'body', text: 'Two conditions, 120 students, six weeks.', x: 0.7, y: 0.6 }],
  },
  {
    role: 'result',
    device: 'stat-emphasis',
    elements: [{ kind: 'title', text: 'Spacing +34% recall', x: 0.7, y: 0.5 }],
  },
  {
    role: 'result',
    device: 'stat-emphasis',
    elements: [{ kind: 'title', text: 'Held across ages', x: 0.7, y: 0.5 }],
  },
  {
    role: 'references',
    device: 'plain',
    elements: [{ kind: 'body', text: 'References', x: 0.7, y: 0.6 }],
  },
];

const THEME_V1 = {
  theme: {
    palette: ['#FFFFFF', '#111111', '#7C6AED', '#6B7280'],
    typeScale: { heading: 40, body: 18, label: 12 },
    accentTreatment: 'Use sparingly.',
  },
  palettes: [
    ['#FFFFFF', '#111111', '#7C6AED', '#6B7280'],
    ['#F5F5F0', '#1F2933', '#2E7D6B', '#9AA5B1'],
    ['#FBF9F6', '#22223B', '#9A8C98', '#C9ADA7'],
    ['#F0F4F8', '#102A43', '#486581', '#829AB1'],
  ],
};

const THEME_V2 = {
  theme: {
    palette: ['#111111', '#FFFFFF', '#FFD700', '#999999'],
    typeScale: { heading: 44, body: 20, label: 13 },
    accentTreatment: 'Bold, confident.',
  },
  palettes: THEME_V1.palettes,
};

async function buildDeckThroughWizard(props: React.ComponentProps<typeof SlidesWizard>) {
  render(<SlidesWizard {...props} />);

  const paste = screen.getByPlaceholderText(/paste your manuscript/i);
  fireEvent.change(paste, { target: { value: MANUSCRIPT } });
  fireEvent.click(screen.getByRole('button', { name: /find the key findings/i }));

  await waitFor(() =>
    expect(screen.getByText('Spacing +34% recall')).toBeInTheDocument(),
  );

  fireEvent.click(screen.getByRole('button', { name: /build the deck/i }));
}

describe('design pass e2e (Task 10)', () => {
  let exportStyledDeckPptxSpy: ReturnType<typeof vi.spyOn>;
  let exportStyledDeckPdfSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // vi.spyOn on an already-spied module export reuses the same
    // underlying mock, so its call history otherwise carries over from
    // the previous test in this file. Restore first so each test starts
    // from a clean, unspied module and gets a fresh spy + call count.
    vi.restoreAllMocks();
    exportStyledDeckPptxSpy = vi
      .spyOn(utilitySlidesModule, 'exportStyledDeckWithUtilitySlides')
      .mockResolvedValue(new Uint8Array([1, 2, 3]));
    exportStyledDeckPdfSpy = vi
      .spyOn(deckPdfModule, 'exportStyledDeckPdf')
      .mockResolvedValue(new Uint8Array([4, 5, 6]));
    // downloadBytes calls URL.createObjectURL/revokeObjectURL + <a>.click().
    // Not under test here — stub the URL half; jsdom's <a>.click() already
    // no-ops harmlessly (it logs a benign "navigation not implemented").
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  it('automatically styles + themes the deck on first assembly — the viewer shows the STYLED deck, never a plain dead-end', async () => {
    const styleClient = vi.fn(async (_plainDeck: SlideDeck) => STYLED_SLIDES);
    const themeClient = vi.fn(async (_topic: string, _vibe: string | undefined) => THEME_V1);

    await buildDeckThroughWizard({
      testHooks: { extractClient: async () => injectedFindings, styleClient, themeClient },
    });

    // Both calls fired automatically — no user action beyond building the deck.
    await waitFor(() => {
      expect(styleClient).toHaveBeenCalledTimes(1);
      expect(themeClient).toHaveBeenCalledTimes(1);
    });

    // styleDeck got the plain deck (has a `slides` array of plain Slide shape).
    const [plainDeckArg] = styleClient.mock.calls[0]!;
    expect(plainDeckArg.slides.length).toBeGreaterThan(0);
    expect(plainDeckArg.slides[0]).toHaveProperty('assertion');

    // generateTheme got a topic (derived from the manuscript title) and no vibe yet.
    const [topicArg, vibeArg] = themeClient.mock.calls[0]!;
    expect(topicArg).toMatch(/spaced practice/i);
    expect(vibeArg).toBeUndefined();

    // The styled stage itself is labelled distinctly from the plain stage
    // (SlideViewer.tsx's StyledSlideStage aria-label) — proves the STYLED
    // branch rendered for the active (title) slide, not the plain
    // SlideStage fallback.
    await waitFor(() => {
      expect(screen.getByLabelText(/slide 1 preview \(styled\)/i)).toBeInTheDocument();
    });

    // Selecting the first result thumbnail (index 4: title, hook, question,
    // methods, result) shows STYLED_SLIDES[4]'s own text on the styled
    // stage — StyledSlide[] is index-aligned with the plain deck's slides
    // in the same order (styleClient.ts's contract).
    const allTabs = screen.getAllByRole('tab');
    fireEvent.click(allTabs[4]!);
    await waitFor(() => {
      expect(screen.getByLabelText(/slide 5 preview \(styled\)/i)).toBeInTheDocument();
    });
    expect(
      screen.getAllByText(/spacing \+34% recall/i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('degrades to the plain deck (no dead end) when styling fails, with a generic error — never raw error text', async () => {
    const styleClient = vi.fn(async () => {
      throw new Error('upstream 502 from styleDeck: raw internal detail');
    });
    const themeClient = vi.fn(async () => THEME_V1);

    await buildDeckThroughWizard({
      testHooks: { extractClient: async () => injectedFindings, styleClient, themeClient },
    });

    await waitFor(() => expect(styleClient).toHaveBeenCalledTimes(1));

    // Generic message shown, never the raw error text (house rule).
    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/upstream 502/i)).not.toBeInTheDocument();

    // The plain deck's own result slide still renders — never a dead end.
    // (Appears at least once — in the thumbnail rail; the styled stage
    // never rendered since styling failed.)
    expect(screen.getAllByText(/spacing \+34% recall/i).length).toBeGreaterThanOrEqual(1);
    // No styled-stage label reached the DOM — confirms the fallback is
    // the plain SlideStage, not a stale/partial styled render.
    expect(screen.queryByLabelText(/preview \(styled\)/i)).not.toBeInTheDocument();
  });

  it('vibe submit re-runs theme only (not style) and re-themes the existing styled deck', async () => {
    const styleClient = vi.fn(async () => STYLED_SLIDES);
    const themeClient = vi.fn(async (topic: string, vibe?: string) =>
      vibe ? THEME_V2 : THEME_V1,
    );

    await buildDeckThroughWizard({
      testHooks: { extractClient: async () => injectedFindings, styleClient, themeClient },
    });

    await waitFor(() => expect(themeClient).toHaveBeenCalledTimes(1));

    // Submit a vibe via the VibeField's text input + Enter (mirrors
    // VibeField.test.tsx's own interaction).
    const vibeInput = screen.getByPlaceholderText(/describe the vibe/i);
    fireEvent.change(vibeInput, { target: { value: 'Bold, confident.' } });
    fireEvent.keyDown(vibeInput, { key: 'Enter' });

    await waitFor(() => expect(themeClient).toHaveBeenCalledTimes(2));

    // style was NEVER re-run — only theme (cheap re-vibe, spec §1).
    expect(styleClient).toHaveBeenCalledTimes(1);

    const [, secondVibeArg] = themeClient.mock.calls[1]!;
    expect(secondVibeArg).toBe('Bold, confident.');
  });

  it('export drawer calls the STYLED writers (pptx appends palette + icon slides; pdf omits utility slides) and never window.print', async () => {
    const printSpy = vi.fn();
    const originalPrint = window.print;
    window.print = printSpy;

    const styleClient = vi.fn(async () => STYLED_SLIDES);
    const themeClient = vi.fn(async () => THEME_V1);

    await buildDeckThroughWizard({
      testHooks: { extractClient: async () => injectedFindings, styleClient, themeClient },
    });

    await waitFor(() => expect(themeClient).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /^export/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /download pdf/i })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
    await waitFor(() => expect(exportStyledDeckPdfSpy).toHaveBeenCalledTimes(1));
    expect(printSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /powerpoint|\.pptx/i }));
    await waitFor(() => expect(exportStyledDeckPptxSpy).toHaveBeenCalledTimes(1));

    // Both writers were handed a StyledSlideDeck (theme + slides), not the
    // plain SlideDeck.
    const [pdfDeckArg] = exportStyledDeckPdfSpy.mock.calls[0]!;
    expect(pdfDeckArg).toHaveProperty('theme');
    const [pptxDeckArg] = exportStyledDeckPptxSpy.mock.calls[0]!;
    expect(pptxDeckArg).toHaveProperty('theme');

    window.print = originalPrint;
  });

  it('a count-mismatched styled response (schema-valid but wrong slide count) keeps preview, vibe, and export ALL on the plain path — never "previewed plain, exported styled"', async () => {
    // A schema-valid style-deck response the server's zod schema doesn't
    // rule out: fewer slides than the plain deck (e.g. the model dropped
    // one). SlideViewer.tsx's display already falls back to the plain
    // stage for this; this test locks that the VibeField and the export
    // buttons agree — none of the three trusts an unaligned styled deck.
    const MISMATCHED_STYLED_SLIDES = STYLED_SLIDES.slice(0, 3); // 3, not 7
    const styleClient = vi.fn(async () => MISMATCHED_STYLED_SLIDES);
    const themeClient = vi.fn(async () => THEME_V1);

    await buildDeckThroughWizard({
      testHooks: { extractClient: async () => injectedFindings, styleClient, themeClient },
    });

    await waitFor(() => {
      expect(styleClient).toHaveBeenCalledTimes(1);
      expect(themeClient).toHaveBeenCalledTimes(1);
    });

    // (a) Preview: the plain stage rendered, not the styled one — the
    // count mismatch means SlideViewer never trusts styledDeck.slides[i].
    await waitFor(() => {
      expect(screen.getAllByText(/spacing \+34% recall/i).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByLabelText(/preview \(styled\)/i)).not.toBeInTheDocument();

    // (b) Vibe: the VibeField is not rendered at all — re-theming a deck
    // the UI doesn't trust enough to preview must not be offered.
    expect(screen.queryByPlaceholderText(/describe the vibe/i)).not.toBeInTheDocument();

    // (c) Export: the drawer shows the "styling in progress" note and
    // both export buttons are disabled — the export path must not allow
    // exporting the untrusted styled deck just because styledDeck itself
    // is non-null.
    fireEvent.click(screen.getByRole('button', { name: /^export/i }));
    const downloadPdfButton = await screen.findByRole('button', { name: /download pdf/i });
    const exportPptxButton = screen.getByRole('button', { name: /powerpoint|\.pptx/i });
    expect(downloadPdfButton).toBeDisabled();
    expect(exportPptxButton).toBeDisabled();

    // Clicking a disabled button is a no-op in the DOM, but assert the
    // writers were never invoked either, as the real guard (not just the
    // disabled attribute).
    fireEvent.click(downloadPdfButton);
    fireEvent.click(exportPptxButton);
    expect(exportStyledDeckPdfSpy).not.toHaveBeenCalled();
    expect(exportStyledDeckPptxSpy).not.toHaveBeenCalled();
  });

  it('a rebuild to a SAME-length new deck does not trust the PRIOR build\'s stale styled deck while its own design pass is in flight', async () => {
    // buildFromFindings (SlidesWizard.tsx) sets the new plain deck
    // immediately but the design pass (styleDeck + generateTheme) that
    // styles IT is async. Before the fix, `styledDeck` from the PRIOR
    // build was never cleared, so `alignedStyledDeck`'s length-only guard
    // (styledDeck.slides.length === deck.slides.length) stayed truthy for
    // the whole in-flight window whenever the new build happened to have
    // the SAME slide count as the old one — the exact case here (both
    // builds parse the same MANUSCRIPT/injectedFindings fixture, so both
    // are 7 plain slides). The result: the narrative step would render
    // deck B's plain thumbnails/notes but deck A's STYLED stage, the
    // VibeField would show, export would be enabled, and a vibe-submit
    // would re-theme stale deck A — "previewed one thing, exported a
    // mix", the exact failure the alignment guard exists to prevent.
    //
    // First style call resolves immediately (deck A, styled + aligned).
    // Second style call (deck B, the rebuild) is held open with a
    // manually-resolved deferred promise so the test can inspect the
    // in-flight window before letting it resolve.
    let resolveSecondStyle!: (slides: StyledSlide[]) => void;
    const secondStylePromise = new Promise<StyledSlide[]>((resolve) => {
      resolveSecondStyle = resolve;
    });
    const styleClient = vi
      .fn<(plainDeck: SlideDeck) => Promise<StyledSlide[]>>()
      .mockResolvedValueOnce(STYLED_SLIDES) // deck A's design pass
      .mockReturnValueOnce(secondStylePromise); // deck B's — held open
    const themeClient = vi.fn(async () => THEME_V1);

    await buildDeckThroughWizard({
      testHooks: { extractClient: async () => injectedFindings, styleClient, themeClient },
    });

    // Deck A's design pass resolved: styled stage is showing, aligned.
    await waitFor(() => {
      expect(screen.getByLabelText(/slide 1 preview \(styled\)/i)).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText(/describe the vibe/i)).toBeInTheDocument();

    // Trigger the rebuild: navigate back to the star-finding step (its
    // StepBar header is the 2nd of 6 — stepConfig.ts's WIZARD_STEPS order
    // is constraints, starFinding, narrative, …), pick a DIFFERENT star,
    // then click "Build the deck" again. deriveDeckInput + buildDeck are
    // deterministic over the same MANUSCRIPT/injectedFindings fixture
    // regardless of which finding leads, so deck B is also 7 plain slides
    // — the same length as deck A, the scenario this guard must handle.
    const starFindingHeader = screen.getByRole('button', { name: /star finding/i });
    fireEvent.click(starFindingHeader);

    const findingButtons = screen
      .getAllByRole('button')
      .filter((btn) => btn.getAttribute('aria-pressed') !== null);
    // Pick the finding that is NOT already the star (index 0 is the star
    // after the first build promoted it to front).
    fireEvent.click(findingButtons[1]!);
    fireEvent.click(screen.getByRole('button', { name: /build the deck/i }));

    // Deck B's (2nd) design pass has now fired but not yet resolved —
    // this is the in-flight window under test.
    await waitFor(() => expect(styleClient).toHaveBeenCalledTimes(2));

    // (a) Preview: must show PLAIN, not deck A's stale styled stage. The
    // fix resets styledDeck to null on rebuild, so alignedStyledDeck is
    // null until deck B's OWN design pass resolves.
    expect(screen.queryByLabelText(/preview \(styled\)/i)).not.toBeInTheDocument();

    // (b) VibeField: must be absent — re-theming nothing (or worse, deck
    // A under deck B's hood) must not be offered mid-rebuild.
    expect(screen.queryByPlaceholderText(/describe the vibe/i)).not.toBeInTheDocument();

    // (c) Export: both buttons disabled, and clicking them (a no-op on a
    // disabled button, but assert the real guard too) must not invoke
    // either writer with deck A's stale styled content.
    fireEvent.click(screen.getByRole('button', { name: /^export/i }));
    const downloadPdfButton = await screen.findByRole('button', { name: /download pdf/i });
    const exportPptxButton = screen.getByRole('button', { name: /powerpoint|\.pptx/i });
    expect(downloadPdfButton).toBeDisabled();
    expect(exportPptxButton).toBeDisabled();
    fireEvent.click(downloadPdfButton);
    fireEvent.click(exportPptxButton);
    expect(exportStyledDeckPdfSpy).not.toHaveBeenCalled();
    expect(exportStyledDeckPptxSpy).not.toHaveBeenCalled();

    // Now let deck B's design pass resolve — the styled stage returns,
    // this time genuinely aligned with deck B, proving the reset only
    // gates the in-flight window and doesn't wedge the feature.
    resolveSecondStyle(STYLED_SLIDES);
    await waitFor(() => {
      expect(screen.getByLabelText(/slide 1 preview \(styled\)/i)).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText(/describe the vibe/i)).toBeInTheDocument();
  });
});
