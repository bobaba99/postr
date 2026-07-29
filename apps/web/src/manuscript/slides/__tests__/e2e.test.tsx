/**
 * Task 12 — end-to-end wiring (spec §2, the whole manuscript→deck→export
 * path on one surface).
 *
 * Drives the real flow with an INJECTED extraction client (testHooks) so no
 * network is touched: paste a manuscript → set the duration → advance out of
 * Constraints (which runs extraction) → pick the star finding → the deck
 * assembles through the real buildDeck → the viewer shows it → the export
 * drawer offers the free PDF.
 *
 * The invariants locked here:
 *   1. the injected findings actually reach the deck (one result slide per
 *      finding, star first) — proving extract→buildDeck→viewer is wired, not
 *      the Phase-1 placeholder;
 *   2. the export drawer's free "Download PDF" is reachable once a deck exists.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SlidesWizard } from '../SlidesWizard';

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

describe('paper-to-slides end to end', () => {
  it('builds a deck from injected findings and offers the free PDF export', async () => {
    render(
      <SlidesWizard
        testHooks={{ extractClient: async () => injectedFindings }}
      />,
    );

    // STEP 1 — Constraints: paste the manuscript, keep the default duration.
    const paste = screen.getByPlaceholderText(/paste your manuscript/i);
    fireEvent.change(paste, { target: { value: MANUSCRIPT } });

    // Advance out of Constraints — this runs the injected extraction.
    fireEvent.click(screen.getByRole('button', { name: /find the key findings/i }));

    // STEP 2 — Star finding: both injected findings render as cards.
    await waitFor(() =>
      expect(screen.getByText('Spacing +34% recall')).toBeInTheDocument(),
    );
    expect(screen.getByText('Held across ages')).toBeInTheDocument();

    // Build the deck with the default ranking (finding 1 is the star).
    fireEvent.click(screen.getByRole('button', { name: /build the deck/i }));

    // The deck now shows both findings as result slides (expand, not compress).
    let resultTabs: HTMLElement[] = [];
    await waitFor(() => {
      const rail = screen.getByRole('tablist', { name: /slides/i });
      resultTabs = within(rail)
        .getAllByRole('tab')
        .filter((t) => /result/i.test(t.getAttribute('aria-label') ?? ''));
      expect(resultTabs).toHaveLength(2);
    });

    // The star finding leads the result run — its text is on the first
    // result thumbnail, scoped to the rail so the StepBar summary and the
    // slide stage do not create ambiguous matches.
    expect(within(resultTabs[0]!).getByText(/spacing \+34% recall/i)).toBeInTheDocument();

    // Export drawer: open it and confirm the free PDF is reachable.
    fireEvent.click(screen.getByRole('button', { name: /^export/i }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /download pdf/i }),
      ).toBeInTheDocument(),
    );
  });
});
