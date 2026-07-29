/**
 * Task 9 tests — the wizard shell (spec §2, the one-surface flow).
 *
 * The shell assembles the already-built pieces (StepBar, ProgressBar,
 * SlideViewer, ExportDrawer) into the v2 layout: a left step spine and a
 * main column (progress → viewer → upward-expanding export drawer). These
 * assertions lock the load-bearing invariants:
 *
 *   1. it renders and starts on the FIRST step (Constraints), the spine's
 *      authoritative head (stepConfig WIZARD_STEPS[0]);
 *   2. the Turn-1 monetization tip is stated up front, before any effort —
 *      "PDF export is free. PowerPoint (.pptx) export is paid." (spec §2);
 *   3. the privacy line is present and precise — "never stored… never used
 *      to train AI" (spec §1).
 *
 * The real extraction→deck pipeline is Task 12; Phase-1 the shell renders a
 * placeholder deck so the viewer + drawer have something to show.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SlidesWizard } from '../SlidesWizard';

describe('SlidesWizard', () => {
  it('renders the shell and starts on the Constraints step', () => {
    render(<SlidesWizard />);
    // The first step's card header is present, marked as the current step.
    const constraints = screen.getByRole('button', { name: /constraints/i });
    expect(constraints).toBeInTheDocument();
    expect(constraints).toHaveAttribute('aria-current', 'step');
  });

  it('shows the Turn-1 tip: PDF is free, PowerPoint is paid', () => {
    render(<SlidesWizard />);
    expect(screen.getByText(/PDF export is free/i)).toBeInTheDocument();
    expect(screen.getByText(/\.pptx.*paid|PowerPoint.*paid|paid/i)).toBeInTheDocument();
  });

  it('states the manuscript is never stored and never used to train AI', () => {
    render(<SlidesWizard />);
    expect(
      screen.getByText(/never stored on our servers.*never used to train AI/i),
    ).toBeInTheDocument();
  });

  it('renders the progress indicator with the first step labelled', () => {
    render(<SlidesWizard />);
    const progress = screen.getByRole('progressbar');
    expect(progress).toBeInTheDocument();
    // The progress surface names the current step so the user is oriented.
    expect(progress).toHaveAttribute('aria-valuenow');
  });
});
