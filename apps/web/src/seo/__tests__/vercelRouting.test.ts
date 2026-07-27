/**
 * Locks the routing contract between the client router and vercel.json.
 *
 * vercel.json deliberately has NO catch-all rewrite. Real client routes
 * are served one of two ways:
 *
 *   1. Prerendered routes (`routes.json` "static") exist on disk as
 *      `dist/<route>/index.html`, and the filesystem wins before
 *      rewrites — so they need no rewrite. Deliberately so: if the
 *      prerender step ever fails to emit a file, the route 404s loudly
 *      instead of silently serving the bare shell with a 200.
 *   2. App routes (auth-gated, dynamic) get an explicit rewrite to
 *      /index.html (or to an edge shell function for /s/:slug).
 *
 * Everything else falls through to Vercel's 404 handling, which serves
 * `dist/404.html` (emitted by scripts/prerender.mjs) with a real 404
 * status. These tests fail the build if a client route loses its
 * server-side coverage, or if a catch-all quietly reopens the
 * unbounded soft-404 space.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import routes from '../routes.json';

interface Rewrite {
  source: string;
  destination: string;
}

interface Redirect {
  source: string;
  destination: string;
  permanent?: boolean;
  has?: Array<{ type: string; value: string }>;
}

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const vercelConfig = JSON.parse(
  readFileSync(resolve(WEB_ROOT, 'vercel.json'), 'utf8'),
) as { rewrites?: Rewrite[]; redirects?: Redirect[] };

const rewrites = vercelConfig.rewrites ?? [];
const redirects = vercelConfig.redirects ?? [];

/**
 * Every path the client router serves in production. Mirrors the
 * <Route path=...> entries in src/routes.tsx — update both together.
 * /debug is absent on purpose: production builds drop that route
 * (import.meta.env.DEV), so it should be a real 404, not a soft one.
 */
const CLIENT_ROUTES = [
  '/',
  '/about',
  '/gallery',
  '/gallery/:entryId',
  '/privacy',
  '/cookies',
  '/terms',
  '/auth',
  '/s/:slug',
  '/dashboard',
  '/p/:posterId',
  '/profile',
  '/admin/gallery',
];

/** Paths that must fall through to the platform 404. */
const UNKNOWN_PATHS = [
  '/wp-admin',
  '/asdf',
  '/random/deep/path.php',
  '/debug',
  '/p',
  '/s',
  '/admin',
  '/admin/anything-else',
];

const PRERENDERED = new Set(Object.keys(routes.static));

/**
 * Convert a vercel.json rewrite source to a matcher. Only the simple
 * path-to-regexp subset this config uses: literal segments and
 * single-segment `:params`.
 */
function sourceToRegExp(source: string): RegExp {
  const pattern = source
    .split('/')
    .map((segment) =>
      segment.startsWith(':')
        ? '[^/]+'
        : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('/');
  return new RegExp(`^${pattern}$`);
}

/** A concrete URL a visitor would actually request for a route pattern. */
function concretePathFor(route: string): string {
  return route.replace(/:[A-Za-z]+/g, 'sample-value');
}

function rewriteMatching(path: string): Rewrite | undefined {
  return rewrites.find((rewrite) => sourceToRegExp(rewrite.source).test(path));
}

describe('vercel.json rewrites', () => {
  it('has no catch-all rewrite (unknown paths must reach the 404 handler)', () => {
    for (const path of UNKNOWN_PATHS) {
      const match = rewriteMatching(path);
      expect(
        match,
        `${path} is rewritten to ${match?.destination} — the soft-404 space is back`,
      ).toBeUndefined();
    }
  });

  it.each(CLIENT_ROUTES)('%s is served (prerender or rewrite)', (route) => {
    if (PRERENDERED.has(route)) return; // filesystem wins before rewrites
    const match = rewriteMatching(concretePathFor(route));
    expect(
      match,
      `${route} has no prerendered file and no rewrite — it would 404 in production`,
    ).toBeDefined();
  });

  it('does not shadow prerendered routes with rewrites', () => {
    for (const route of PRERENDERED) {
      if (route === '/') continue; // '/' is dist/index.html itself
      const match = rewriteMatching(route);
      expect(
        match,
        `${route} is prerendered; a rewrite would mask a broken prerender as a silent 200`,
      ).toBeUndefined();
    }
  });

  it('sends /s/:slug to the share edge shell', () => {
    const match = rewriteMatching('/s/some-slug');
    expect(match?.destination).toBe('/api/shell/share');
  });
});

describe('vercel.json redirects', () => {
  it('permanently redirects the apex host to www, preserving the path', () => {
    const apex = redirects.find((redirect) =>
      redirect.has?.some(
        (condition) =>
          condition.type === 'host' && condition.value === 'postr.sh',
      ),
    );
    expect(apex, 'no host-based apex redirect found').toBeDefined();
    expect(apex?.permanent).toBe(true);
    expect(apex?.source).toBe('/:path*');
    expect(apex?.destination).toBe('https://www.postr.sh/:path*');
  });
});

describe('branded 404 source data', () => {
  it('routes.json app["/404"] carries what prerender.mjs needs for dist/404.html', () => {
    const notFound = routes.app['/404'];
    expect(notFound.robots).toBe('noindex,nofollow');
    expect(notFound.h1).toBeTruthy();
    expect(notFound.copy.length).toBeGreaterThan(0);
  });
});
