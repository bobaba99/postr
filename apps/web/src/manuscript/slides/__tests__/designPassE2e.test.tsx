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
});
