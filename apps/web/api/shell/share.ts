/**
 * Edge shell for /s/:slug — public share links.
 *
 * Two requirements that must hold together, and are easy to break apart:
 *   1. NEVER indexable. These are users' unpublished, in-progress
 *      research. Enforced by the X-Robots-Tag header here AND by the
 *      vercel.json header rule, belt and braces.
 *   2. Rich preview cards. Pasting a share link into a lab Slack is the
 *      core sharing loop, and unfurlers never run JavaScript, so this
 *      function is the only place that card can come from.
 *
 * WHAT SHIPS TODAY: (1) fully, and (2) only as far as the poster's
 * title and description. There is deliberately NO og:image yet.
 * Poster thumbnails live in the `poster-assets` bucket, which is
 * private (`public: false` in 20260408000500_storage.sql), and its
 * storage RLS is keyed on a user-id path prefix, so an anon-key edge
 * function can neither read the bytes nor mint a signed URL. Emitting a
 * `/object/public/...` URL anyway would hand unfurlers a 404 and they
 * would drop the whole card, which is worse than a text-only one.
 *
 * Unblocking it is a product decision, not a code change: either move
 * share thumbnails to a public bucket (they are users' unpublished
 * research, so that needs consent), or render a synthetic card with
 * @vercel/og from the poster's title and palette, which leaks nothing.
 * The second is almost certainly the right answer.
 *
 * Same fail-safe contract as gallery.ts: any failure returns the plain
 * shell rather than an error, so this is safe to deploy before the env
 * vars exist.
 */
import {
  buildShareMeta,
  fetchShell,
  injectOrPassThrough,
  supabaseEnv,
} from './_lib';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const shell = await fetchShell(request);
  const slug = new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? '';

  const env = supabaseEnv();
  // Even with no data, emit noindex meta. Never let a share link fall
  // through as an indexable-looking page.
  if (!env || !slug) {
    return injectOrPassThrough(
      shell,
      buildShareMeta({ title: null, imageUrl: null }),
    );
  }

  let row: Record<string, unknown> | null = null;
  try {
    // Reads through `posters_select_public`, which grants anon SELECT
    // where is_public = true. A poster that is not shared simply returns
    // no rows, so RLS — not this code — is what keeps private posters
    // private. The is_public filter below is belt-and-braces.
    const query = new URL(`${env.url}/rest/v1/posters`);
    query.searchParams.set('select', 'title');
    query.searchParams.set('share_slug', `eq.${slug}`);
    query.searchParams.set('is_public', 'is.true');
    query.searchParams.set('limit', '1');

    const res = await fetch(query, {
      headers: { apikey: env.key, authorization: `Bearer ${env.key}` },
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const rows = (await res.json()) as Record<string, unknown>[];
      row = rows[0] ?? null;
    }
  } catch {
    // fall through to the untitled card
  }

  // imageUrl stays null — see the note at the top of this file.
  const meta = buildShareMeta({
    title: (row?.title as string | null) ?? null,
    imageUrl: null,
  });

  return injectOrPassThrough(shell, meta);
}
