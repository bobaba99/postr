/**
 * Feedback digest — emails the owner the feedback rows they have not
 * been told about yet.
 *
 * Flow (one run, POST /cron/feedback-digest, daily from
 * .github/workflows/cron-feedback-digest.yml):
 *   1. read up to BATCH_LIMIT rows of public.feedback where notified_at is
 *      null, oldest first;
 *   2. none → done, no email;
 *   3. send ONE email listing them (Resend HTTP API);
 *   4. stamp those rows' notified_at.
 * A failed send stamps nothing, so the next run retries the same rows. A
 * stamp that fails AFTER a send would resend them next run; the Resend
 * Idempotency-Key (derived from the row ids, kept 24 h by Resend) stops
 * that duplicate when the retry comes within a day.
 *
 * Data minimisation: the email carries what the user typed (cut to
 * TEXT_MAX), the title, the kind, the page and the account type. It does
 * NOT carry the console log, the attachment, the user agent or the
 * submitter's email address. Those stay in Supabase; the email links to
 * the table.
 */
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Most rows one email lists. The rest wait for the next run. */
export const BATCH_LIMIT = 50;
/** Longest piece of a user's text quoted in the email. */
export const TEXT_MAX = 1500;

export interface FeedbackDigestRow {
  id: string;
  user_id: string | null;
  kind: 'bug' | 'feature' | 'other' | string;
  title: string;
  body: string;
  page_url: string | null;
  status: string;
  created_at: string;
}

export type AccountKind = 'registered' | 'guest' | 'deleted' | 'unknown';

export interface DigestConfig {
  resendApiKey: string;
  from: string;
  to: string[];
  /** Supabase Studio link to the feedback table, when it can be built. */
  studioUrl: string | null;
}

export interface OutgoingEmail {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}

export type SendEmail = (email: OutgoingEmail) => Promise<{ id: string }>;

export interface DigestResult {
  /** Un-notified rows found this run (at most BATCH_LIMIT). */
  found: number;
  /** True when an email went out. */
  emailed: boolean;
  /** Resend's id for the email, when one went out. */
  emailId: string | null;
  /** Un-notified rows still waiting after this run. */
  remaining: number;
}

// ── Configuration ──────────────────────────────────────────────────

/**
 * Read the digest's settings from the environment. Returns the names of
 * the missing variables instead of throwing, so the route can answer 500
 * with a message that says exactly what to set.
 */
export function readDigestConfig(
  env: NodeJS.ProcessEnv = process.env,
): DigestConfig | { missing: string[] } {
  const resendApiKey = env.RESEND_API_KEY?.trim() ?? '';
  const from = env.FEEDBACK_DIGEST_FROM?.trim() ?? '';
  const to = (env.FEEDBACK_DIGEST_TO ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const missing: string[] = [];
  if (!resendApiKey) missing.push('RESEND_API_KEY');
  if (!from) missing.push('FEEDBACK_DIGEST_FROM');
  if (to.length === 0) missing.push('FEEDBACK_DIGEST_TO');
  if (missing.length > 0) return { missing };

  return { resendApiKey, from, to, studioUrl: studioTableUrl(env.SUPABASE_URL) };
}

/** https://<ref>.supabase.co → the Studio table editor for that project. */
export function studioTableUrl(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  try {
    const host = new URL(supabaseUrl).hostname;
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/);
    return match ? `https://supabase.com/dashboard/project/${match[1]}/editor` : null;
  } catch {
    return null;
  }
}

// ── Email delivery (Resend) ────────────────────────────────────────

/**
 * Send through Resend's HTTP API with plain fetch — no SDK dependency.
 * https://resend.com/docs/api-reference/emails/send-email
 */
export function createResendSender(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): SendEmail {
  return async (email) => {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': email.idempotencyKey,
      },
      body: JSON.stringify({
        from: email.from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
    if (!res.ok) {
      // Resend answers JSON { name, message } on errors. Keep it short;
      // it never contains the email body.
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`resend_${res.status}: ${detail}`);
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { id: data.id ?? '' };
  };
}

// ── Formatting ─────────────────────────────────────────────────────

/**
 * The client (apps/web/src/data/feedback.ts) appends its diagnostics to
 * the user's text under these headers. Split them off so the email
 * quotes only what the user wrote.
 */
export function splitDiagnostics(body: string): {
  text: string;
  hasAttachment: boolean;
  logChars: number;
} {
  const markers = ['\n--- ATTACHMENT', '\n--- CONSOLE LOG'];
  const cut = markers
    .map((m) => body.indexOf(m))
    .filter((i) => i >= 0)
    .reduce((min, i) => Math.min(min, i), body.length);
  const tail = body.slice(cut);
  const log = tail.match(/\n--- CONSOLE LOG \(last (\d+) chars\) ---/);
  return {
    text: body.slice(0, cut).trim(),
    hasAttachment: tail.includes('\n--- ATTACHMENT'),
    logChars: log ? Number(log[1]) : 0,
  };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cutText(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}… [${s.length - max} more characters in Supabase]` : s;
}

const KIND_LABEL: Record<string, string> = { bug: 'Bug', feature: 'Feature', other: 'Other' };
const ACCOUNT_LABEL: Record<AccountKind, string> = {
  registered: 'registered account',
  guest: 'guest (no email)',
  deleted: 'account since deleted',
  unknown: 'account type unknown',
};

function kindCounts(rows: FeedbackDigestRow[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  const rank = (k: string) => {
    const i = ['feature', 'bug', 'other'].indexOf(k);
    return i < 0 ? 99 : i;
  };
  return [...counts.keys()]
    .sort((a, b) => rank(a) - rank(b))
    .map((k) => `${counts.get(k)} ${(KIND_LABEL[k] ?? k).toLowerCase()}`)
    .join(', ');
}

/** Only http(s) links are rendered as links; anything else is shown as text. */
function safeHttpUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function buildDigestEmail(
  rows: FeedbackDigestRow[],
  accounts: Map<string, AccountKind>,
  opts: { studioUrl: string | null; remaining: number },
): { subject: string; html: string; text: string } {
  const n = rows.length;
  const subject = `Postr feedback: ${n} new (${kindCounts(rows)})`;

  const textParts: string[] = [`${n} new feedback ${n === 1 ? 'entry' : 'entries'} on Postr.`, ''];
  const htmlParts: string[] = [
    `<p style="margin:0 0 16px">${n} new feedback ${n === 1 ? 'entry' : 'entries'} on Postr.</p>`,
  ];

  rows.forEach((row, i) => {
    const { text, hasAttachment, logChars } = splitDiagnostics(row.body);
    const account = row.user_id ? (accounts.get(row.user_id) ?? 'unknown') : 'deleted';
    const kind = KIND_LABEL[row.kind] ?? row.kind;
    const when = new Date(row.created_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    const extras = [
      hasAttachment ? 'attachment' : null,
      logChars > 0 ? `console log (${logChars.toLocaleString('en-US')} chars)` : null,
    ].filter(Boolean);
    const quoted = cutText(text, TEXT_MAX);
    const page = safeHttpUrl(row.page_url);

    textParts.push(
      `${i + 1}. [${kind}] ${row.title}`,
      `   ${when} · ${ACCOUNT_LABEL[account]}${row.page_url ? ` · ${row.page_url}` : ''}`,
      ...quoted.split('\n').map((l) => `   ${l}`),
      ...(extras.length ? [`   + ${extras.join(', ')} (in Supabase)`] : []),
      `   id: ${row.id}`,
      '',
    );

    htmlParts.push(
      `<div style="margin:0 0 20px;padding:12px 14px;border:1px solid #ddd;border-radius:8px">` +
        `<div style="font-size:12px;color:#666;margin-bottom:4px">` +
        `<strong style="color:#7c6aed">${escapeHtml(kind)}</strong> · ${escapeHtml(when)} · ${escapeHtml(ACCOUNT_LABEL[account])}` +
        (page
          ? ` · <a href="${escapeHtml(page)}" style="color:#666">${escapeHtml(cutText(page, 80))}</a>`
          : row.page_url
            ? ` · ${escapeHtml(cutText(row.page_url, 80))}`
            : '') +
        `</div>` +
        `<div style="font-size:15px;font-weight:600;margin-bottom:6px">${escapeHtml(row.title)}</div>` +
        `<div style="white-space:pre-wrap;font-size:14px;line-height:1.5">${escapeHtml(quoted)}</div>` +
        (extras.length
          ? `<div style="font-size:12px;color:#666;margin-top:6px">+ ${escapeHtml(extras.join(', '))} (in Supabase)</div>`
          : '') +
        `<div style="font-size:11px;color:#999;margin-top:6px">id: ${escapeHtml(row.id)}</div>` +
        `</div>`,
    );
  });

  if (opts.remaining > 0) {
    textParts.push(`${opts.remaining} more waiting; they come in the next digest.`, '');
    htmlParts.push(
      `<p style="margin:0 0 16px">${opts.remaining} more waiting; they come in the next digest.</p>`,
    );
  }
  if (opts.studioUrl) {
    textParts.push(`Open the feedback table: ${opts.studioUrl} (table public.feedback)`);
    htmlParts.push(
      `<p style="margin:0"><a href="${escapeHtml(opts.studioUrl)}">Open the feedback table in Supabase</a> (public.feedback)</p>`,
    );
  }

  return {
    subject,
    text: textParts.join('\n'),
    html: `<div style="font-family:system-ui,-apple-system,sans-serif;color:#111;max-width:640px">${htmlParts.join('')}</div>`,
  };
}

/** Same rows → same key, so a retry within Resend's 24 h window is not resent. */
export function digestIdempotencyKey(ids: string[]): string {
  const hash = createHash('sha256').update([...ids].sort().join(',')).digest('hex');
  return `feedback-digest-${hash.slice(0, 40)}`;
}

// ── The run ────────────────────────────────────────────────────────

async function lookupAccounts(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, AccountKind>> {
  const out = new Map<string, AccountKind>();
  for (const id of new Set(userIds)) {
    try {
      const { data, error } = await supabase.auth.admin.getUserById(id);
      if (error || !data.user) {
        out.set(id, error && /not.?found/i.test(error.message) ? 'deleted' : 'unknown');
      } else {
        out.set(id, data.user.is_anonymous ? 'guest' : 'registered');
      }
    } catch {
      out.set(id, 'unknown');
    }
  }
  return out;
}

export async function runFeedbackDigest(
  supabase: SupabaseClient,
  send: SendEmail,
  config: Pick<DigestConfig, 'from' | 'to' | 'studioUrl'>,
  now: () => Date = () => new Date(),
): Promise<DigestResult> {
  const { data, error } = await supabase
    .from('feedback')
    .select('id, user_id, kind, title, body, page_url, status, created_at')
    .is('notified_at', null)
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);
  if (error) throw new Error(`read feedback: ${error.message}`);

  const rows = (data ?? []) as FeedbackDigestRow[];
  if (rows.length === 0) {
    return { found: 0, emailed: false, emailId: null, remaining: 0 };
  }

  const { count, error: countError } = await supabase
    .from('feedback')
    .select('id', { count: 'exact', head: true })
    .is('notified_at', null);
  if (countError) throw new Error(`count feedback: ${countError.message}`);
  const waitingAfter = Math.max(0, (count ?? rows.length) - rows.length);

  const accounts = await lookupAccounts(
    supabase,
    rows.map((r) => r.user_id).filter((id): id is string => Boolean(id)),
  );
  const email = buildDigestEmail(rows, accounts, {
    studioUrl: config.studioUrl,
    remaining: waitingAfter,
  });
  const ids = rows.map((r) => r.id);

  const sent = await send({
    from: config.from,
    to: config.to,
    ...email,
    idempotencyKey: digestIdempotencyKey(ids),
  });

  const { error: stampError } = await supabase
    .from('feedback')
    .update({ notified_at: now().toISOString() })
    .in('id', ids)
    .is('notified_at', null);
  if (stampError) {
    // The email is out; the rows were not stamped, so the next run will
    // list them again (deduplicated by Resend within 24 h).
    throw new Error(`email sent (${sent.id}) but stamping failed: ${stampError.message}`);
  }

  return { found: rows.length, emailed: true, emailId: sent.id || null, remaining: waitingAfter };
}
