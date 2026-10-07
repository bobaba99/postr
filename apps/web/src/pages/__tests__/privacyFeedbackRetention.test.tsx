/**
 * What the Privacy Policy says a feedback report keeps after its sender
 * deletes their account, against what the code stores (record 24, review
 * round 1).
 *
 * Deleting an account sets the report's user_id to null (the foreign key
 * in supabase/migrations/20260410020000_feedback.sql is `on delete set
 * null`) and deletes the attached file with the account's storage, but the
 * report's text is kept as it was sent. When a file was attached, that text
 * holds the file's storage path, which starts with the account id
 * (data/feedback.ts). The page said the report was "no longer linked" to
 * the account; this test reads the stored text and holds the page to it.
 *
 * Entered where a user sends such a report: Copy a design fails to read a
 * poster, the user clicks "Send feedback", keeps the file attached (the
 * box starts ticked) and sends. data/feedback.ts runs for real; only the
 * Supabase client is faked, to record what it is asked to store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { PosterDoc, TypeStyle } from '@postr/shared';
import { usePosterStore } from '@/stores/posterStore';
import { useFeedbackStore } from '@/stores/feedbackStore';
import type { StyleImportResult } from '@/import/styleImport';
import { CopyDesignModal } from '@/components/CopyDesignModal';
import { FeedbackModal } from '@/components/FeedbackModal';

const ACCOUNT_ID = 'acct-7f3e9b21-zq';
const stored = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, uploads: [] as string[] }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'acct-7f3e9b21-zq' } }, error: null })),
      getSession: vi.fn(() => new Promise<never>(() => {})),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInAnonymously: vi.fn(),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async (path: string) => {
          stored.uploads.push(path);
          return { error: null };
        }),
      })),
    },
    from: vi.fn(() => ({
      insert: vi.fn(async (row: Record<string, unknown>) => {
        stored.rows.push(row);
        return { error: null };
      }),
    })),
  },
}));
vi.mock('@/import/styleImport', async () => {
  const actual = await vi.importActual<typeof import('@/import/styleImport')>('@/import/styleImport');
  return { ...actual, extractStyleFromFile: vi.fn() };
});

import { extractStyleFromFile } from '@/import/styleImport';
import Privacy from '../Privacy';
import PrivacyFr from '../PrivacyFr';

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

/** The report a user sends about a failed Copy a design, file attached. */
async function sendReportWithFile(): Promise<string> {
  vi.mocked(extractStyleFromFile).mockResolvedValue(failedRead);
  const { unmount } = render(
    <>
      <CopyDesignModal open onClose={() => {}} />
      <FeedbackModal />
    </>,
  );
  const dropzone = screen.getByText(/drop a poster here/i).parentElement!;
  fireEvent.drop(dropzone, {
    dataTransfer: { files: [new File(['%PDF'], 'poster.png', { type: 'image/png' })] },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Send feedback' }));
  expect(await screen.findByRole('checkbox', { name: /attach/i })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
  await waitFor(() => expect(stored.rows).toHaveLength(1));
  unmount();
  return String(stored.rows[0]?.body ?? '');
}

/** The cells of the retention table's row about feedback. */
function feedbackRetentionRow(Component: () => React.ReactElement, label: RegExp): string {
  const { container, unmount } = render(
    <MemoryRouter>
      <Component />
    </MemoryRouter>,
  );
  const row = [...container.querySelectorAll('article tbody tr')].find((tr) =>
    label.test((tr.querySelector('td')?.textContent ?? '').trim()),
  );
  const text = (row?.textContent ?? '').replace(/\s+/g, ' ');
  unmount();
  return text;
}

beforeEach(() => {
  vi.clearAllMocks();
  stored.rows.length = 0;
  stored.uploads.length = 0;
  useFeedbackStore.getState().close();
  usePosterStore.getState().setPoster('poster-1', makeDoc());
});

describe('Privacy §9 — a feedback report after account deletion', () => {
  it('the stored report keeps the account id in an attached file’s storage path', async () => {
    const body = await sendReportWithFile();
    expect(stored.uploads[0]).toMatch(new RegExp(`^${ACCOUNT_ID}/feedback/`));
    expect(body).toContain(`storage://${ACCOUNT_ID}/feedback/`);
  });

  it.each([
    ['English', Privacy, /^Feedback$/, /no longer linked/i, /account identifier/i],
    ['French', PrivacyFr, /^Les commentaires$/, /sans y être liés/i, /identifiant de compte/i],
  ] as const)('%s says so, and does not call the report unlinked', async (_lang, Component, label, unlinked, accountId) => {
    const body = await sendReportWithFile();
    const row = feedbackRetentionRow(Component, label);
    expect(row).not.toBe('');
    if (body.includes(ACCOUNT_ID)) {
      expect(row).not.toMatch(unlinked);
      expect(row).toMatch(accountId);
    }
  });
});
