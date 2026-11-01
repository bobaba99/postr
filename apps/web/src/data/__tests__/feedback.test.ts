/**
 * submitFeedback writes what the database will store.
 *
 * The client puts the diagnostics (attachment path, console log) into the
 * same `body` column as the user's text. Until migration 20261101000000 the
 * database capped `body` at 4000 characters, so a report sent with its
 * console log was refused (check feedback_body_check) and never stored.
 *
 * These tests read the database's limit from the migrations themselves, so
 * a change on either side (client cap or SQL check) that lets them drift
 * fails here.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const inserts: Array<Record<string, unknown>> = [];
let uploadError: { message: string } | null = null;

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
      signInAnonymously: async () => ({ error: null }),
    },
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, ...row });
        return { error: null };
      },
    }),
    storage: {
      from: () => ({
        upload: async () => ({ error: uploadError }),
      }),
    },
  },
}));

import { submitFeedback, FEEDBACK_STORED_BODY_MAX } from '../feedback';

const MIGRATIONS = `${process.cwd()}/../../supabase/migrations`;

/** The upper bound of feedback.body as the LAST migration that sets it says. */
function databaseBodyLimit(): number {
  let limit: number | null = null;
  for (const file of readdirSync(MIGRATIONS).sort()) {
    const sql = readFileSync(`${MIGRATIONS}/${file}`, 'utf8');
    // The create-table check (20260410020000) or a later named constraint.
    const isFeedback =
      /create table public\.feedback\b/.test(sql) || /feedback_body_check/.test(sql);
    if (!isFeedback) continue;
    const match = sql.match(/char_length\(body\)\s+between\s+1\s+and\s+(\d+)/);
    if (match) limit = Number(match[1]);
  }
  if (limit === null) throw new Error('no feedback body check found in the migrations');
  return limit;
}

beforeEach(() => {
  inserts.length = 0;
  uploadError = null;
});

describe('submitFeedback — the stored body fits the database', () => {
  it('the client cap is the database limit', () => {
    expect(FEEDBACK_STORED_BODY_MAX).toBe(databaseBodyLimit());
  });

  it('a full report (4000-char text, attachment, long console log) fits the database check', async () => {
    const text = 'x'.repeat(4000);
    const log = Array.from({ length: 200 }, (_, i) => `[warn] line ${i} ${'y'.repeat(580)}`).join('\n');
    await submitFeedback({
      kind: 'bug',
      title: 'Import failed',
      body: text,
      attachment: new File(['pdf'], 'poster.pdf', { type: 'application/pdf' }),
      log,
    });

    expect(inserts).toHaveLength(1);
    const body = inserts[0]!.body as string;
    expect(body.length).toBeGreaterThan(4000);
    expect(body.length).toBeLessThanOrEqual(databaseBodyLimit());
    // The user's text is kept whole and first; the log's newest line is kept.
    expect(body.startsWith(text)).toBe(true);
    expect(body).toContain('storage://user-1/feedback/');
    expect(body).toContain('[warn] line 199');
  });

  it('a failed upload with a very long file name still fits', async () => {
    uploadError = { message: 'denied' };
    await submitFeedback({
      kind: 'bug',
      title: 'Import failed',
      body: 'z'.repeat(4000),
      attachment: new File(['pdf'], `${'n'.repeat(5000)}.pdf`, { type: 'application/pdf' }),
      log: 'q'.repeat(200_000),
    });
    const body = inserts[0]!.body as string;
    expect(body).toContain('upload failed; metadata only');
    expect(body.length).toBeLessThanOrEqual(databaseBodyLimit());
  });

  it('a plain feature request is stored as typed', async () => {
    await submitFeedback({ kind: 'feature', title: 'Dark mode', body: '  Please add dark mode.  ' });
    expect(inserts[0]).toMatchObject({
      table: 'feedback',
      kind: 'feature',
      title: 'Dark mode',
      body: 'Please add dark mode.',
      user_id: 'user-1',
    });
  });
});
