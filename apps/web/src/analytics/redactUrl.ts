/**
 * URL redaction for Vercel Web Analytics.
 *
 * ── Why this exists ──────────────────────────────────────────────
 * Vercel Web Analytics records the URL of every page view. Several of
 * Postr's routes carry identifiers in the path, and one of them is
 * genuinely sensitive:
 *
 *   /s/:slug        a share link to UNPUBLISHED research, sent to a
 *                   supervisor or collaborator for comment. The slug
 *                   is the capability — knowing it is how you open it.
 *   /p/:posterId    a specific person's poster.
 *   /gallery/:id    a gallery entry (the gallery is switched off and the
 *                   route redirects to /, but an address can be reported
 *                   before the redirect lands).
 *   /admin/gallery  moderation surface.
 *
 * analytics/__tests__/redactUrl.test.ts reads every `:param` route from
 * routes.tsx and fails until a new one is redacted here.
 *
 * The router matches without regard to case and after decoding
 * percent-escapes, so /P/<id>, /Gallery/<id> and /%70/<id> open the same
 * pages as their lower-case spellings. The match below reads the path the
 * same way (decoded, lower-cased), so every spelling the router serves is
 * redacted, and also collapses repeated slashes, so a not-found address
 * that still carries an id (//p/<id>) is redacted too (record 24, review
 * round 1: upper-case addresses were reported with their id).
 *
 * Vercel groups by dynamic path in its dashboard, but the raw URL is
 * still transmitted and stored. That is the part this module prevents:
 * a share-link slug for someone's unpublished work should not leave
 * this application at all, dashboard grouping notwithstanding.
 *
 * ── What is kept ─────────────────────────────────────────────────
 * Everything the SEO work actually needs: page views for the marketing
 * and tool pages (/, /about, /chart-chooser, the legal pages).
 * Identifier routes are collapsed to their shape, so a
 * count of "someone opened a share link" survives while "which one"
 * does not.
 *
 * Query strings are dropped wholesale rather than filtered. Postr puts
 * no personal data in them today, but a redactor that has to be
 * updated whenever a param is added is a redactor that will eventually
 * be forgotten. Dropping everything is the safe default; add an
 * allowlist here if a specific param is ever genuinely needed.
 */

/**
 * Path prefixes whose next segment is an identifier, mapped to the
 * shape recorded instead. Order matters only for readability — the
 * match is exact on the first segment.
 */
const IDENTIFIER_ROUTES: ReadonlyArray<{ prefix: string; shape: string }> = [
  { prefix: '/s', shape: '/s/[redacted]' },
  { prefix: '/p', shape: '/p/[redacted]' },
  { prefix: '/gallery', shape: '/gallery/[redacted]' },
];

/** Whole subtrees recorded only as their root. */
const REDACTED_SUBTREES: readonly string[] = ['/admin'];

/** Origin used when the incoming URL is relative or unparseable. */
const FALLBACK_ORIGIN = 'https://www.postr.sh';

/**
 * The path for matching only: percent-escapes decoded (a malformed one
 * leaves the path as it is) and lower case, as the router reads it; and
 * runs of slashes collapsed (a doubled slash is a not-found page whose
 * address would still carry the id).
 */
function routeKey(pathname: string): string {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // A malformed escape: match on the raw path.
  }
  return decoded.toLowerCase().replace(/\/{2,}/g, '/');
}

/**
 * Rewrite a URL before it is sent to analytics.
 *
 * RETURNS AN ABSOLUTE URL, and must keep doing so. Vercel validates
 * the beacon payload against `^https?://` and rejects anything else
 * with HTTP 400 — the event is dropped server-side and the dashboard
 * shows zero. An earlier version returned bare pathnames, which meant
 * analytics silently collected nothing at all while looking correct
 * in the client: the script loaded, `window.va` existed, the beacon
 * fired, and every POST came back 400.
 *
 * The origin is preserved rather than invented, so apex vs www stays
 * visible in the data. Only the PATH is redacted, which is where the
 * identifiers are.
 *
 * Never returns null — dropping the event entirely would lose the
 * page-view count too, and the count is the part worth having.
 * Callers pass this to `<Analytics beforeSend>`.
 */
export function redactUrl(url: string): string {
  let parsed: URL;
  try {
    // Vercel passes an absolute URL; the base is a fallback for the
    // relative case so this never throws on malformed input.
    parsed = new URL(url, FALLBACK_ORIGIN);
  } catch {
    // Unparseable input reveals nothing useful and might contain
    // anything — record it as unknown rather than passing it through.
    return `${FALLBACK_ORIGIN}/[unparseable]`;
  }

  const origin = /^https?:$/.test(parsed.protocol) ? parsed.origin : FALLBACK_ORIGIN;
  const key = routeKey(parsed.pathname);

  for (const { prefix, shape } of IDENTIFIER_ROUTES) {
    if (key === prefix || key.startsWith(`${prefix}/`)) {
      return `${origin}${shape}`;
    }
  }

  for (const root of REDACTED_SUBTREES) {
    if (key === root || key.startsWith(`${root}/`)) {
      return `${origin}${root}/[redacted]`;
    }
  }

  // Everything else is a public route with no identifier: keep the
  // path, drop the query string.
  return `${origin}${parsed.pathname}`;
}
