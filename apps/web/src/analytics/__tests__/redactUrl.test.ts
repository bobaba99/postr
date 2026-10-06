/**
 * These assert a PRIVACY boundary, not a formatting preference. A
 * regression here means an unpublished-research share slug leaves the
 * application, so each case names the thing it protects.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { matchRoutes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { redactUrl } from '../redactUrl';

const ORIGIN = 'https://www.postr.sh';

describe('share links never leave the app', () => {
  it('redacts the slug, which is the capability to open the poster', () => {
    const out = redactUrl(`${ORIGIN}/s/quiet-otter-1f2a3b`);
    expect(out).toBe(`${ORIGIN}/s/[redacted]`);
    expect(out).not.toContain('quiet-otter');
  });

  it('redacts a slug carrying a query string too', () => {
    const out = redactUrl(`${ORIGIN}/s/quiet-otter-1f2a3b?from=email`);
    expect(out).toBe(`${ORIGIN}/s/[redacted]`);
    expect(out).not.toContain('quiet-otter');
    expect(out).not.toContain('from=email');
  });

  it('redacts deeper paths under a share link', () => {
    expect(redactUrl(`${ORIGIN}/s/abc/anything/else`)).toBe(`${ORIGIN}/s/[redacted]`);
  });
});

describe('poster and admin routes', () => {
  it('redacts a poster id', () => {
    const out = redactUrl(`${ORIGIN}/p/ec67e5ba-7c24-436e-a9e8-1731dd9e5d0c`);
    expect(out).toBe(`${ORIGIN}/p/[redacted]`);
    expect(out).not.toContain('ec67e5ba');
  });

  it('redacts the admin subtree', () => {
    expect(redactUrl(`${ORIGIN}/admin/gallery`)).toBe(`${ORIGIN}/admin/[redacted]`);
  });
});

describe('public routes are kept — this is the data worth having', () => {
  it.each([
    '/',
    '/about',
    '/chart-chooser',
    '/tools/figure-readability',
    '/paper-to-poster',
    '/privacy',
    '/cookies',
    '/terms',
  ])('keeps %s', (path) => {
    expect(redactUrl(ORIGIN + path)).toBe(ORIGIN + path);
  });

  it('drops the query string even on a public route', () => {
    // Postr puts nothing personal in query params today, but a
    // redactor that must be updated per-param will be forgotten.
    expect(redactUrl(`${ORIGIN}/chart-chooser?utm_source=libguide&email=a@b.c`)).toBe(
      `${ORIGIN}/chart-chooser`,
    );
  });
});

describe('malformed input', () => {
  it('never passes through something it could not parse', () => {
    // ':' with no scheme is not a valid URL even against a base.
    const out = redactUrl('http://[');
    expect(out).toBe(`${ORIGIN}/[unparseable]`);
  });

  it('handles a relative URL without throwing', () => {
    expect(redactUrl('/about')).toBe(`${ORIGIN}/about`);
  });
});

/**
 * The output contract, not the redaction logic.
 *
 * Vercel validates the beacon body against `^https?://` and rejects
 * anything else with HTTP 400. A redactor that returns bare pathnames
 * therefore breaks analytics COMPLETELY and SILENTLY: the script
 * loads, `window.va` exists, the beacon fires, every POST 400s, and
 * the dashboard reads zero. That shipped and went unnoticed, because
 * the tests above only ever asserted the path.
 *
 * These assert the shape of every output, so the failure mode cannot
 * return by way of a new branch that forgets the origin.
 */
describe('output is always an absolute URL', () => {
  const CASES = [
    `${ORIGIN}/`,
    `${ORIGIN}/about`,
    `${ORIGIN}/chart-chooser?utm_source=x`,
    `${ORIGIN}/s/secret-slug`,
    `${ORIGIN}/p/poster-id`,
    `${ORIGIN}/admin/gallery`,
    'https://postr.sh/',
    'http://localhost:5173/about',
    '/about',
    'not a url at all',
    '',
  ];

  it.each(CASES)('returns an http(s) URL for %j', (input) => {
    const out = redactUrl(input);
    // The exact pattern Vercel's schema enforces.
    expect(out).toMatch(/^https?:\/\//);
  });

  it.each(CASES)('returns something URL-parseable for %j', (input) => {
    expect(() => new URL(redactUrl(input))).not.toThrow();
  });

  it('preserves the origin it was given rather than rewriting it', () => {
    // apex vs www is real signal about how people reach the site.
    expect(redactUrl('https://postr.sh/about')).toBe('https://postr.sh/about');
    expect(redactUrl('http://localhost:5173/about')).toBe('http://localhost:5173/about');
  });

  it('still redacts identifiers when the origin is not the canonical one', () => {
    const out = redactUrl('https://postr.sh/s/secret-slug');
    expect(out).toBe('https://postr.sh/s/[redacted]');
    expect(out).not.toContain('secret-slug');
  });
});

/**
 * Every route with an identifier in its path is redacted, read from the
 * router itself, so a new `:param` route fails here until redactUrl knows
 * it (record 24: /gallery/:entryId was not covered). A redirecting route
 * counts too: the page address can be reported before the redirect lands.
 */
describe('every id-bearing route in the router', () => {
  const routes = readFileSync(join(process.cwd(), 'src/routes.tsx'), 'utf8');
  const paramPaths = [...routes.matchAll(/path="([^"]*:[^"]*)"/g)].map((match) => match[1] ?? '');

  it('finds the id-bearing routes', () => {
    expect(paramPaths.length).toBeGreaterThanOrEqual(3);
  });

  it.each(paramPaths)('%s never reports its id', (path) => {
    const secret = 'zq-secret-4f1c9a';
    const url = `${ORIGIN}${path.replace(/:[A-Za-z]+/g, secret)}`;
    const out = redactUrl(url);
    expect(out).not.toContain(secret);
    expect(out).toMatch(/^https:\/\/www\.postr\.sh\//);
  });

  /**
   * The router matches paths without regard to case and after decoding
   * percent-escapes, so /P/<id> and /%70/<id> open the editor like /p/<id>
   * (record 24, review round 1: they were reported with the id). Each
   * spelling below is one the router serves as that route — checked here
   * with the router's own matcher — or, for a doubled slash, a not-found
   * page whose address still carries the id.
   */
  const spellings: ReadonlyArray<[string, (path: string) => string, boolean]> = [
    ['upper case', (path) => path.toUpperCase(), true],
    ['capitalised', (path) => path.replace(/^\/(\w)/, (_m, c: string) => `/${c.toUpperCase()}`), true],
    ['percent-encoded first letter', (path) => path.replace(/^\/(\w)/, (_m, c: string) => `/%${c.charCodeAt(0).toString(16)}`), true],
    ['doubled leading slash', (path) => `/${path}`, false],
  ];
  it.each(paramPaths.flatMap((path) => spellings.map(([name, spell, served]) => [path, name, spell, served] as const)))(
    '%s spelled %s never reports its id',
    (path, _name, spell, served) => {
      const secret = 'zq-secret-4f1c9a';
      const spelled = spell(path.replace(/:[A-Za-z]+/g, ':id')).replace(/:id/gi, secret);
      if (served) {
        const match = matchRoutes([{ path }, { path: '*' }], spelled);
        expect(match?.[0]?.route.path, spelled).toBe(path);
      }
      const out = redactUrl(`${ORIGIN}${spelled}`);
      expect(out).not.toContain(secret);
      expect(out).toMatch(/^https:\/\/www\.postr\.sh\//);
    },
  );
});
