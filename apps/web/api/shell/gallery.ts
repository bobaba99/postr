/**
 * Edge shell for /gallery/:entryId.
 *
 * Gallery entries are unbounded and change without a deploy, so they
 * cannot be prerendered at build time. This fetches the row and injects
 * per-entry head tags into the built shell, returning identical HTML to
 * every requester — no user-agent sniffing, no cloaking.
 *
 * FAIL-SAFE BY DESIGN. Every failure path (missing env vars, Supabase
 * unreachable, malformed response) returns the unmodified shell, which
 * is exactly what the catch-all rewrite would have served. Deploying
 * this before SUPABASE_URL / SUPABASE_ANON_KEY exist in the Vercel
 * project is therefore harmless: the page keeps working and simply
 * carries no per-entry metadata until the vars are set.
 *
 * Required env (either naming works; unprefixed wins):
 *   SUPABASE_URL      or VITE_SUPABASE_URL
 *   SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY
 *
 * Reads through the existing `gallery_entries_public_select` RLS policy
 * with the anon key. No service role, no new secret.
 */
import {
  buildEntryMeta,
  fetchShell,
  injectOrPassThrough,
  supabaseEnv,
} from './_lib';

export const config = { runtime: 'edge' };

const FIELD_LABELS: Record<string, string> = {
  neuroscience: 'Neuroscience',
  psychology: 'Psychology',
  medicine: 'Medicine',
  biology: 'Biology',
  computer_science: 'Computer Science',
  physics: 'Physics',
  chemistry: 'Chemistry',
  engineering: 'Engineering',
  social_sciences: 'Social Sciences',
  humanities: 'Humanities',
  other: 'Other',
};

export default async function handler(request: Request): Promise<Response> {
  const shell = await fetchShell(request);
  const entryId =
    new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? '';

  const env = supabaseEnv();
  if (!env || !entryId) return injectOrPassThrough(shell, null);

  let row: Record<string, unknown> | null = null;
  try {
    const query = new URL(`${env.url}/rest/v1/gallery_entries`);
    query.searchParams.set(
      'select',
      'id,title,field,conference,year,notes,image_path',
    );
    query.searchParams.set('id', `eq.${entryId}`);
    query.searchParams.set('retracted_at', 'is.null');
    query.searchParams.set('limit', '1');

    const res = await fetch(query, {
      headers: { apikey: env.key, authorization: `Bearer ${env.key}` },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return injectOrPassThrough(shell, null);
    const rows = (await res.json()) as Record<string, unknown>[];
    row = rows[0] ?? null;
  } catch {
    // Timeout, network error, or bad JSON. A metadata miss is not worth
    // a 500 on a public page.
    return injectOrPassThrough(shell, null);
  }

  // Genuinely absent or retracted. A real 404 matters: the catch-all
  // returns 200 for every bad id today, which manufactures unbounded
  // soft-404s, and a retracted poster must stop being indexable at once.
  if (!row) {
    return new Response(shell || 'Not found', {
      status: 404,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'x-robots-tag': 'noindex, nofollow',
        'cache-control': 'public, s-maxage=60',
      },
    });
  }

  const meta = buildEntryMeta({
    id: String(row.id),
    title: String(row.title ?? 'Untitled poster'),
    fieldLabel: FIELD_LABELS[String(row.field ?? 'other')] ?? 'Other',
    conference: (row.conference as string | null) ?? null,
    year: (row.year as number | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    imagePath: (row.image_path as string | null) ?? null,
    supabaseUrl: env.url,
  });

  return injectOrPassThrough(shell, meta);
}
