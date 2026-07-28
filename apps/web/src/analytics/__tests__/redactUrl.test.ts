/**
 * These assert a PRIVACY boundary, not a formatting preference. A
 * regression here means an unpublished-research share slug leaves the
 * application, so each case names the thing it protects.
 */
import { describe, expect, it } from 'vitest';
import { redactUrl } from '../redactUrl';

const ORIGIN = 'https://www.postr.sh';

describe('share links never leave the app', () => {
  it('redacts the slug, which is the capability to open the poster', () => {
    const out = redactUrl(`${ORIGIN}/s/quiet-otter-1f2a3b`);
    expect(out).toBe('/s/[redacted]');
    expect(out).not.toContain('quiet-otter');
  });

  it('redacts a slug carrying a query string too', () => {
    const out = redactUrl(`${ORIGIN}/s/quiet-otter-1f2a3b?from=email`);
    expect(out).toBe('/s/[redacted]');
    expect(out).not.toContain('quiet-otter');
    expect(out).not.toContain('from=email');
  });

  it('redacts deeper paths under a share link', () => {
    expect(redactUrl(`${ORIGIN}/s/abc/anything/else`)).toBe('/s/[redacted]');
  });
});

describe('poster and admin routes', () => {
  it('redacts a poster id', () => {
    const out = redactUrl(`${ORIGIN}/p/ec67e5ba-7c24-436e-a9e8-1731dd9e5d0c`);
    expect(out).toBe('/p/[redacted]');
    expect(out).not.toContain('ec67e5ba');
  });

  it('redacts the admin subtree', () => {
    expect(redactUrl(`${ORIGIN}/admin/gallery`)).toBe('/admin/[redacted]');
  });
});

describe('public routes are kept — this is the data worth having', () => {
  it.each([
    '/',
    '/about',
    '/chart-chooser',
    '/paper-to-poster',
    '/privacy',
    '/cookies',
    '/terms',
  ])('keeps %s', (path) => {
    expect(redactUrl(ORIGIN + path)).toBe(path);
  });

  it('drops the query string even on a public route', () => {
    // Postr puts nothing personal in query params today, but a
    // redactor that must be updated per-param will be forgotten.
    expect(redactUrl(`${ORIGIN}/chart-chooser?utm_source=libguide&email=a@b.c`)).toBe(
      '/chart-chooser',
    );
  });
});

describe('malformed input', () => {
  it('never passes through something it could not parse', () => {
    // ':' with no scheme is not a valid URL even against a base.
    const out = redactUrl('http://[');
    expect(out).toBe('/[unparseable]');
  });

  it('handles a relative URL without throwing', () => {
    expect(redactUrl('/about')).toBe('/about');
  });
});
