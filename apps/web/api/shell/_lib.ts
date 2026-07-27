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

const SITE = { siteName: 'Postr', locale: 'en_US' };

export interface ShellMeta {
  title: string;
  description: string;
  robots: string;
  canonical: string | null;
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
  title: string | null;
  imageUrl: string | null;
}): ShellMeta {
  const title = input.title?.trim() || 'Untitled poster';
  return {
    title: `${title} · Shared on Postr`,
    description:
      'A research poster shared for review on Postr. Comment on it, or make your own conference poster free.',
    robots: 'noindex,nofollow',
    canonical: null,
    ogType: 'article',
    ogImage: input.imageUrl,
    ogImageAlt: `Research poster: ${title}`,
  };
}
