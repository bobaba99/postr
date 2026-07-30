/**
 * Shared helpers for the edge shell functions.
 *
 * Files prefixed with `_` are not routable on Vercel, so this is a
 * plain module rather than an endpoint.
 *
 * Everything here is written to degrade to "serve the shell unchanged."
 * These functions sit in front of a public page; a metadata miss is
 * always preferable to an error page, so there is no throwing path.
 */
import { injectHead } from '../../scripts/lib/headTags.mjs';

const SITE = {
  siteOrigin: 'https://www.postr.sh',
  siteName: 'Postr',
  language: 'en',
  locale: 'en_US',
  defaultOgImage: '/og-card.png',
};

export interface ShellMeta {
  title: string;
  description: string;
  robots: string;
  canonical: string | null;
  language: string;
  locale: string;
  ogType: string;
  ogImage: string | null;
  ogImageAlt: string | null;
}

export function supabaseEnv(): { url: string; key: string } | null {
  const env = (globalThis as { process?: { env?: Record<string, string> } })
    .process?.env;
  if (!env) return null;
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

/**
 * Fetch the built shell from the deployment itself. `/index.html` is a
 * real file, and Vercel checks the filesystem before rewrites, so this
 * returns the actual document rather than recursing through this
 * function.
 */
export async function fetchShell(request: Request): Promise<string> {
  try {
    const res = await fetch(new URL('/index.html', request.url), {
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) return await res.text();
  } catch {
    // fall through
  }
  // Last resort: a minimal valid document that still boots the app is
  // not something we can synthesise here, so signal upstream instead.
  return '';
}

export function injectOrPassThrough(
  shell: string,
  meta: ShellMeta | null,
): Response {
  if (!shell) {
    // Could not read the shell at all. Redirecting would be worse than
    // a plain error, and returning empty HTML would break the app.
    return new Response('Temporarily unavailable', {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    });
  }

  const html = meta ? injectHead(shell, meta, SITE) : shell;
  const headers: Record<string, string> = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'public, s-maxage=300, stale-while-revalidate=86400',
  };
  if (meta && meta.robots.startsWith('noindex')) {
    headers['x-robots-tag'] = 'noindex, nofollow';
  }
  return new Response(html, { status: 200, headers });
}

/** Mirrors shareMeta() in src/seo/siteMeta.ts. Never indexable. */
export function buildShareMeta(input: {
  slug: string;
  title: string | null;
  imageUrl: string | null;
}): ShellMeta {
  const posterTitle = input.title?.trim();
  const title = posterTitle
    ? `${clampText(posterTitle, 28)} — Shared Poster Review | Postr`
    : 'Shared Research Poster Review | Postr';
  const image =
    input.imageUrl ?? `${SITE.siteOrigin}${SITE.defaultOgImage}`;
  return {
    title,
    description:
      "Review a private research poster shared through Postr. Add comments, return to the owner's read-only poster, or create your own conference poster for free.",
    robots: 'noindex,nofollow',
    canonical: `${SITE.siteOrigin}/s/${input.slug.toLowerCase()}`,
    language: SITE.language,
    locale: SITE.locale,
    ogType: 'article',
    ogImage: image,
    ogImageAlt:
      input.imageUrl && posterTitle
        ? `Research poster: ${posterTitle}`
        : 'Postr: free conference poster maker',
  };
}

function clampText(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  const cut = collapsed.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
