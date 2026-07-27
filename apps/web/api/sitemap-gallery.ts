/**
 * /sitemap-gallery.xml — the dynamic half of the sitemap index.
 *
 * Gallery entries appear whenever a user clicks Publish, which is not a
 * deploy, so this cannot be a build artifact. Served from the edge with
 * a 1-hour cache; that cache IS the freshness mechanism. Do not wire a
 * Supabase webhook to a Vercel Deploy Hook to make it fresher — a full
 * rebuild per publish is a self-inflicted DoS that buys at most 59
 * minutes.
 *
 * Fail-safe: with no env vars or an unreachable database this returns a
 * valid EMPTY urlset rather than an error. An empty sitemap is fine in
 * Search Console; a 500 is a reported failure.
 *
 * lastmod is omitted deliberately. `gallery_entries` has no updated_at
 * column, and stamping a fabricated date is worse than omitting it —
 * Google demotes the signal site-wide once it catches a site doing that.
 */
export const config = { runtime: 'edge' };

const SITE_ORIGIN = 'https://www.postr.sh';
const MAX_URLS = 45000; // sitemap spec caps at 50k; leave headroom.

function xmlFor(ids: string[]): string {
  const urls = ids
    .map((id) => `  <url><loc>${SITE_ORIGIN}/gallery/${id}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function respond(ids: string[]): Response {
  return new Response(xmlFor(ids), {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}

export default async function handler(): Promise<Response> {
  const env = (globalThis as { process?: { env?: Record<string, string> } })
    .process?.env;
  const url = env?.SUPABASE_URL || env?.VITE_SUPABASE_URL;
  const key = env?.SUPABASE_ANON_KEY || env?.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return respond([]);

  try {
    const query = new URL(`${url}/rest/v1/gallery_entries`);
    query.searchParams.set('select', 'id');
    query.searchParams.set('retracted_at', 'is.null');
    query.searchParams.set('order', 'created_at.desc');
    query.searchParams.set('limit', String(MAX_URLS));

    const res = await fetch(query, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return respond([]);

    const rows = (await res.json()) as Array<{ id?: unknown }>;
    return respond(
      rows.map((r) => String(r.id ?? '')).filter((id) => id.length > 0),
    );
  } catch {
    return respond([]);
  }
}
