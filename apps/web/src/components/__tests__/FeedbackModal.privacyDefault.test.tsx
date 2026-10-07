/**
 * The feedback form's console log is sent only when the user ticks it
 * (Quebec Law 25, privacy by default; owner decision 2026-10-06, record 24).
 *
 * Entered where a user meets it: Copy a design fails to read a poster, the
 * user clicks "Send feedback" in that modal, and the feedback form opens
 * with the diagnostic context. The console log is the app's own capture
 * (installConsoleCapture, as main.tsx installs it), not a stub.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { PosterDoc, TypeStyle } from '@postr/shared';
import { usePosterStore } from '@/stores/posterStore';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { installConsoleCapture } from '@/lib/consoleCapture';
import type { StyleImportResult } from '@/import/styleImport';
import { CopyDesignModal } from '../CopyDesignModal';
import { FeedbackModal } from '../FeedbackModal';

vi.mock('@/import/styleImport', async () => {
  const actual = await vi.importActual<typeof import('@/import/styleImport')>('@/import/styleImport');
  return { ...actual, extractStyleFromFile: vi.fn() };
});
vi.mock('@/data/feedback', () => ({ submitFeedback: vi.fn(async () => {}) }));

import { extractStyleFromFile } from '@/import/styleImport';
import { submitFeedback } from '@/data/feedback';

const PALETTE = {
  bg: '#FFFFFF',
  primary: '#1A1A2E',
  accent: '#0F4C75',
  accent2: '#3282B8',
  muted: '#6C757D',
  headerBg: '#0F4C75',
  headerFg: '#FFFFFF',
};

function makeDoc(): PosterDoc {
  const style: TypeStyle = { size: 5, weight: 400, italic: false, lineHeight: 1.3, color: null, highlight: null };
  return {
    version: 1,
    widthIn: 48,
    heightIn: 36,
    blocks: [],
    fontFamily: 'Source Sans 3',
    palette: { ...PALETTE },
    styles: { title: style, heading: style, authors: style, body: style },
    headingStyle: { border: 'bottom', fill: false, align: 'left' },
    institutions: [],
    authors: [],
    references: [],
  };
}

const failedRead: StyleImportResult = {
  extracted: null,
  palette: { ...PALETTE },
  coloursOnly: true,
  visionError: new Error('vision_call_failed'),
};

async function reportFailedCopy() {
  vi.mocked(extractStyleFromFile).mockResolvedValue(failedRead);
  render(
    <>
      <CopyDesignModal open onClose={() => {}} />
      <FeedbackModal />
    </>,
  );
  const dropzone = screen.getByText(/drop a poster here/i).parentElement!;
  fireEvent.drop(dropzone, {
    dataTransfer: { files: [new File(['x'], 'poster.png', { type: 'image/png' })] },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Send feedback' }));
  return screen.findByRole('checkbox', { name: /include console log/i });
}

beforeEach(() => {
  vi.clearAllMocks();
  useFeedbackStore.getState().close();
  usePosterStore.getState().setPoster('poster-1', makeDoc());
  installConsoleCapture();
  console.warn('[zq-probe] a line the capture keeps');
});

describe('feedback form — console log is opt-in', () => {
  it('opens with the console log box unticked', async () => {
    const box = await reportFailedCopy();
    expect(box).not.toBeChecked();
  });

  it('sends no console log when the box is left unticked', async () => {
    await reportFailedCopy();
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitFeedback).mock.calls[0]?.[0].log).toBeUndefined();
  });

  it('sends the console log when the user ticks the box', async () => {
    const box = await reportFailedCopy();
    fireEvent.click(box);
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitFeedback).mock.calls[0]?.[0].log).toContain('[zq-probe]');
  });

  it('keeps the attachment box as it was (ticked), which the policy says', async () => {
    await reportFailedCopy();
    expect(screen.getByRole('checkbox', { name: /attach/i })).toBeChecked();
  });

  it('starts unticked again the next time the form opens', async () => {
    const box = await reportFailedCopy();
    fireEvent.click(box);
    expect(box).toBeChecked();
    // The feedback form's own Cancel (the Copy a design modal has one too).
    const form = screen.getByRole('heading', { name: 'Send feedback' }).closest('[data-postr-modal-content]');
    fireEvent.click(within(form as HTMLElement).getByRole('button', { name: /cancel/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Send feedback' }));
    expect(await screen.findByRole('checkbox', { name: /include console log/i })).not.toBeChecked();
  });
});
