/**
 * POST /cron/feedback-digest — the owner is emailed each feedback row once.
 *
 * Supabase is an in-memory fake of public.feedback (+ auth.admin) that
 * honours the exact query shapes runFeedbackDigest uses; the email sender
 * is a recording fake. The contract pinned here:
 *   - the route is locked behind CRON_SECRET and fails loudly (500) when a
 *     digest setting is missing;
 *   - no new rows → no email;
 *   - new rows → ONE email, then those rows are stamped and never resent;
 *   - a failed send stamps nothing, so the next run retries the same rows;
 *   - the email quotes what the user typed, never the console log, the
 *     attachment path or the submitter's email, and escapes HTML.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCronRouter } from '../cron.js';
import {
  BATCH_LIMIT,
  buildDigestEmail,
  createResendSender,
  digestIdempotencyKey,
  splitDiagnostics,
  studioTableUrl,
  type FeedbackDigestRow,
  type OutgoingEmail,
  type SendEmail,
} from '../feedbackDigest.js';

const SECRET = 'a'.repeat(64);
const ENV = {
  RESEND_API_KEY: 're_test',
  FEEDBACK_DIGEST_FROM: 'Postr <feedback@postr.sh>',
  FEEDBACK_DIGEST_TO: 'owner@example.com',
  SUPABASE_URL: 'https://abcd1234.supabase.co',
};

interface Row extends FeedbackDigestRow {
  notified_at: string | null;
}

const REGISTERED = '0e000000-0000-4000-a000-000000000001';
const GUEST = '0e000000-0000-4000-a000-000000000002';
const GONE = '0e000000-0000-4000-a000-000000000003';

function row(n: number, over: Partial<Row> = {}): Row {
  return {
    id: `0d000000-0000-4000-a000-${String(n).padStart(12, '0')}`,
    user_id: REGISTERED,
    kind: 'feature',
    title: `Idea ${n}`,
    body: `Please add thing ${n}.`,
    page_url: 'https://www.postr.sh/dashboard',
    status: 'new',
    created_at: new Date(Date.UTC(2026, 10, 1, 12, n)).toISOString(),
    notified_at: null,
    ...over,
  };
}

/** In-memory public.feedback with the query shapes the digest uses. */
function fakeSupabase(rows: Row[], opts: { stampError?: string; readError?: string } = {}) {
  const users: Record<string, { is_anonymous: boolean }> = {
    [REGISTERED]: { is_anonymous: false },
    [GUEST]: { is_anonymous: true },
  };

  function query() {
    const filters: Array<(r: Row) => boolean> = [];
    let mode: 'select' | 'count' | 'update' = 'select';
    let patch: Partial<Row> = {};
    let limit = Infinity;
    let ascending = true;
    const q = {
      select(_cols: string, o?: { count?: string; head?: boolean }) {
        if (o?.head) mode = 'count';
        return q;
      },
      update(p: Partial<Row>) {
        mode = 'update';
        patch = p;
        return q;
      },
      is(col: keyof Row, val: null) {
        filters.push((r) => r[col] === val);
        return q;
      },
      in(col: keyof Row, vals: string[]) {
        filters.push((r) => vals.includes(r[col] as string));
        return q;
      },
      order(_col: string, o: { ascending: boolean }) {
        ascending = o.ascending;
        return q;
      },
      limit(n: number) {
        limit = n;
        return q;
      },
      then(resolve: (v: unknown) => void) {
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (mode === 'update') {
          if (opts.stampError) return resolve({ error: { message: opts.stampError } });
          hit.forEach((r) => Object.assign(r, patch));
          return resolve({ error: null });
        }
        if (opts.readError) return resolve({ data: null, error: { message: opts.readError } });
        if (mode === 'count') return resolve({ count: hit.length, error: null });
        const sorted = [...hit].sort((a, b) =>
          ascending ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at),
        );
        return resolve({ data: sorted.slice(0, limit).map(({ notified_at: _n, ...r }) => r), error: null });
      },
    };
    return q;
  }

  return {
    from: (table: string) => {
      if (table !== 'feedback') throw new Error(`unexpected table ${table}`);
      return query();
    },
    auth: {
      admin: {
        getUserById: vi.fn(async (id: string) =>
          users[id]
            ? { data: { user: { id, ...users[id] } }, error: null }
            : { data: { user: null }, error: { message: 'User not found' } },
        ),
      },
    },
  } as unknown as SupabaseClient;
}

function app(supabase: SupabaseClient | null, send: SendEmail, env: NodeJS.ProcessEnv = ENV) {
  const a = express();
  a.use(createCronRouter(() => supabase, { env, makeSender: () => send }));
  return a;
}

function recorder() {
  const sent: OutgoingEmail[] = [];
  const send = vi.fn(async (e: OutgoingEmail) => {
    sent.push(e);
    return { id: `email-${sent.length}` };
  });
  return { sent, send };
}

const post = (a: express.Express, auth = `Bearer ${SECRET}`) =>
  request(a).post('/cron/feedback-digest').set('Authorization', auth);

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('POST /cron/feedback-digest — access and configuration', () => {
  it('refuses a missing or wrong secret', async () => {
    const { send } = recorder();
    const a = app(fakeSupabase([row(1)]), send);
    expect((await request(a).post('/cron/feedback-digest')).status).toBe(401);
    expect((await post(a, `Bearer ${'b'.repeat(64)}`)).status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses everything when CRON_SECRET is unset on the server', async () => {
    delete process.env.CRON_SECRET;
    const { send } = recorder();
    expect((await post(app(fakeSupabase([row(1)]), send))).status).toBe(401);
  });

  it('answers 500 naming each missing digest setting', async () => {
    const { send } = recorder();
    const res = await post(app(fakeSupabase([row(1)]), send, { SUPABASE_URL: ENV.SUPABASE_URL }));
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('digest_not_configured');
    expect(res.body.missing).toEqual(['RESEND_API_KEY', 'FEEDBACK_DIGEST_FROM', 'FEEDBACK_DIGEST_TO']);
    expect(send).not.toHaveBeenCalled();
  });

  it('answers 500 when Supabase is not configured', async () => {
    const { send } = recorder();
    const res = await post(app(null, send));
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('supabase_not_configured');
  });
});

describe('POST /cron/feedback-digest — each row is emailed once', () => {
  it('sends nothing when there is no new feedback', async () => {
    const { send } = recorder();
    const res = await post(app(fakeSupabase([row(1, { notified_at: '2026-10-01T00:00:00Z' })]), send));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, found: 0, emailed: false, remaining: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends one email for the new rows, stamps them, and does not resend', async () => {
    const rows = [row(1), row(2, { kind: 'bug' }), row(3, { notified_at: '2026-10-01T00:00:00Z' })];
    const { sent, send } = recorder();
    const a = app(fakeSupabase(rows), send);

    const first = await post(a);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ found: 2, emailed: true, emailId: 'email-1', remaining: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toEqual(['owner@example.com']);
    expect(sent[0]!.from).toBe('Postr <feedback@postr.sh>');
    expect(sent[0]!.subject).toBe('Postr feedback: 2 new (1 feature, 1 bug)');
    expect(rows[0]!.notified_at).not.toBeNull();
    expect(rows[1]!.notified_at).not.toBeNull();
    expect(rows[2]!.notified_at).toBe('2026-10-01T00:00:00Z');

    const second = await post(a);
    expect(second.body).toMatchObject({ found: 0, emailed: false });
    expect(sent).toHaveLength(1);
  });

  it('stamps nothing when the send fails, and the next run sends the same rows', async () => {
    const rows = [row(1), row(2)];
    const supabase = fakeSupabase(rows);
    const failing = vi.fn(async () => {
      throw new Error('resend_403: domain not verified');
    });
    const res = await post(app(supabase, failing));
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('resend_403');
    expect(rows.every((r) => r.notified_at === null)).toBe(true);

    const { sent, send } = recorder();
    const retry = await post(app(supabase, send));
    expect(retry.body).toMatchObject({ found: 2, emailed: true });
    expect(sent[0]!.idempotencyKey).toBe(digestIdempotencyKey(rows.map((r) => r.id)));
  });

  it('reports a stamp failure after the send as a 500 that says the email went out', async () => {
    const { send } = recorder();
    const res = await post(app(fakeSupabase([row(1)], { stampError: 'boom' }), send));
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/email sent \(email-1\) but stamping failed: boom/);
  });

  it('answers 500 when the feedback table cannot be read', async () => {
    const { send } = recorder();
    const res = await post(app(fakeSupabase([row(1)], { readError: 'permission denied' }), send));
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('permission denied');
    expect(send).not.toHaveBeenCalled();
  });

  it(`lists at most ${BATCH_LIMIT} rows, oldest first, and says how many wait`, async () => {
    const rows = Array.from({ length: BATCH_LIMIT + 5 }, (_, i) => row(BATCH_LIMIT + 5 - i));
    const { sent, send } = recorder();
    const a = app(fakeSupabase(rows), send);

    const first = await post(a);
    expect(first.body).toMatchObject({ found: BATCH_LIMIT, remaining: 5 });
    expect(sent[0]!.text).toContain('1. [Feature] Idea 1\n');
    expect(sent[0]!.text).toContain('5 more waiting');

    const second = await post(a);
    expect(second.body).toMatchObject({ found: 5, remaining: 0 });
    expect(sent[1]!.text).toContain(`[Feature] Idea ${BATCH_LIMIT + 1}`);
  });
});

describe('the digest email', () => {
  const diagnostic = row(1, {
    kind: 'bug',
    title: 'Import <b>failed</b>',
    body:
      'It broke on <script>alert(1)</script> my PDF.\n\n' +
      '\n--- ATTACHMENT ---\nstorage://user-1/feedback/123-poster.pdf\n' +
      '\n--- CONSOLE LOG (last 5321 chars) ---\n[error] secret-token-abc',
  });

  it('quotes the user text only — no console log, no attachment path', () => {
    const email = buildDigestEmail([diagnostic], new Map([[REGISTERED, 'registered']]), {
      studioUrl: null,
      remaining: 0,
    });
    for (const part of [email.text, email.html]) {
      expect(part).not.toContain('secret-token-abc');
      expect(part).not.toContain('storage://');
    }
    expect(email.text).toContain('It broke on <script>alert(1)</script> my PDF.');
    expect(email.text).toContain('+ attachment, console log (5,321 chars) (in Supabase)');
  });

  it('escapes HTML from the title and the text', () => {
    const email = buildDigestEmail([diagnostic], new Map(), { studioUrl: null, remaining: 0 });
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<b>failed</b>');
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(email.html).toContain('Import &lt;b&gt;failed&lt;/b&gt;');
  });

  it('links only http(s) pages', () => {
    const js = row(1, { page_url: 'javascript:alert(1)' });
    const email = buildDigestEmail([js], new Map(), { studioUrl: null, remaining: 0 });
    expect(email.html).not.toContain('href="javascript:');
  });

  it('labels the account and never includes an email address', async () => {
    const rows = [row(1), row(2, { user_id: GUEST }), row(3, { user_id: GONE }), row(4, { user_id: null })];
    const { sent, send } = recorder();
    await post(app(fakeSupabase(rows), send));
    const text = sent[0]!.text;
    expect(text).toContain('registered account');
    expect(text).toContain('guest (no email)');
    expect(text.match(/account since deleted/g)).toHaveLength(2);
    expect(text).not.toMatch(/@/);
  });

  it('cuts a long text and points to Supabase for the rest', () => {
    const long = row(1, { body: 'w'.repeat(2000) });
    const email = buildDigestEmail([long], new Map(), { studioUrl: null, remaining: 0 });
    expect(email.text).toContain('… [500 more characters in Supabase]');
  });

  it('links the Supabase table editor for the project', async () => {
    const { sent, send } = recorder();
    await post(app(fakeSupabase([row(1)]), send));
    expect(sent[0]!.html).toContain('https://supabase.com/dashboard/project/abcd1234/editor');
    expect(studioTableUrl('http://localhost:54321')).toBeNull();
  });
});

describe('helpers', () => {
  it('splitDiagnostics keeps a body with no diagnostics whole', () => {
    expect(splitDiagnostics('  just text  ')).toEqual({ text: 'just text', hasAttachment: false, logChars: 0 });
  });

  it('the idempotency key depends on the set of ids, not their order', () => {
    expect(digestIdempotencyKey(['b', 'a'])).toBe(digestIdempotencyKey(['a', 'b']));
    expect(digestIdempotencyKey(['a'])).not.toBe(digestIdempotencyKey(['a', 'b']));
    expect(digestIdempotencyKey(['a']).length).toBeLessThanOrEqual(256);
  });

  it('the Resend sender posts the email with the key and the idempotency header', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'abc' }), { status: 200 }));
    const send = createResendSender('re_key', fetchImpl as unknown as typeof fetch);
    const out = await send({
      from: 'f@x.org',
      to: ['t@x.org'],
      subject: 's',
      html: '<p>h</p>',
      text: 'h',
      idempotencyKey: 'k1',
    });
    expect(out).toEqual({ id: 'abc' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer re_key', 'Idempotency-Key': 'k1' });
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'f@x.org',
      to: ['t@x.org'],
      subject: 's',
      html: '<p>h</p>',
      text: 'h',
    });
  });

  it('the Resend sender throws on an error status', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{"message":"You can only send testing emails to your own email address"}', { status: 403 }),
    );
    const send = createResendSender('re_key', fetchImpl as unknown as typeof fetch);
    await expect(
      send({ from: 'f', to: ['t'], subject: 's', html: 'h', text: 'h', idempotencyKey: 'k' }),
    ).rejects.toThrow(/resend_403: .*own email address/);
  });
});
