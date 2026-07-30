/**
 * Guards the one genuine drift risk in this design.
 *
 * The head-tag logic exists twice: in TypeScript for the React runtime
 * (`useDocumentMeta.ts` / `siteMeta.ts`), and in plain ESM for the build
 * script and edge shells (`scripts/lib/headTags.mjs`), because bare Node
 * cannot import TypeScript. If those two ever disagree, crawlers and
 * browsers receive different metadata for the same URL — which is how
 * honest prerendering turns into an accidental cloaking violation.
 *
 * These tests fail the build the moment they diverge.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error — plain ESM sibling implementation, intentionally untyped.
import * as mjs from '../../../scripts/lib/headTags.mjs';
import routes from '../routes.json';
import {
  APP_ROUTE_META,
  STATIC_ROUTE_META,
  canonicalFor,
  type PageMeta,
} from '../siteMeta';
import { tagSpecsFor } from '../useDocumentMeta';

const site = {
  siteOrigin: routes.siteOrigin,
  siteName: routes.siteName,
  language: routes.language,
  locale: routes.locale,
  defaultOgImage: routes.defaultOgImage,
};

const staticPaths = Object.keys(routes.static);

describe('canonicalFor parity', () => {
  it.each(['/', '/about', '/About/', '/privacy?x=1', '/terms#a'])(
    '%s resolves identically in both implementations',
    (path) => {
      expect(mjs.canonicalFor(path, site.siteOrigin)).toBe(canonicalFor(path));
    },
  );
});

describe('buildPageMeta parity', () => {
  const staticRecords: Record<string, unknown> = routes.static;

  it.each(staticPaths)('%s produces an identical PageMeta', (path) => {
    expect(mjs.buildPageMeta(path, staticRecords[path], site)).toEqual(
      STATIC_ROUTE_META[path],
    );
  });
});

describe('tagSpecsFor parity', () => {
  const cases: Array<[string, PageMeta]> = [
    ...staticPaths.map(
      (p) => [p, STATIC_ROUTE_META[p] as PageMeta] as [string, PageMeta],
    ),
    ['/dashboard (noindex)', APP_ROUTE_META['/dashboard'] as PageMeta],
    [
      'with an image',
      {
        ...(STATIC_ROUTE_META['/about'] as PageMeta),
        ogImage: 'https://example.com/poster.png',
        ogImageAlt: 'A poster',
      },
    ],
  ];

  it.each(cases)('%s produces identical tag specs', (_label, meta) => {
    expect(mjs.tagSpecsFor(meta, site)).toEqual(tagSpecsFor(meta));
  });
});

describe('escaping', () => {
  it('escapes attribute-breaking characters', () => {
    expect(mjs.escapeAttr('a "b" & <c>')).toBe('a &quot;b&quot; &amp; &lt;c&gt;');
  });

  it('escapes text content', () => {
    expect(mjs.escapeText('<script>&')).toBe('&lt;script&gt;&amp;');
  });
});

describe('injectHead', () => {
  const shell =
    '<!doctype html><html><head><title>Postr</title>' +
    '<meta name="description" content="default" />' +
    '<script type="application/ld+json">{"@type":"Organization"}</script>' +
    '</head><body><div id="root"></div></body></html>';

  const meta = STATIC_ROUTE_META['/about'] as PageMeta;

  it('replaces the title', () => {
    const out = mjs.injectHead(shell, meta, site);
    expect(out).toContain(`<title>${meta.title}</title>`);
    expect(out).not.toContain('<title>Postr</title>');
  });

  it('sets the document language from route metadata', () => {
    const french = STATIC_ROUTE_META['/privacy/fr'] as PageMeta;
    const localizedShell = shell.replace('<html>', '<html lang="en">');
    const out = mjs.injectHead(localizedShell, french, site);

    expect(out).toContain('<html lang="fr-CA">');
    expect(out).toContain('property="og:locale" content="fr_CA"');
  });

  it('replaces rather than duplicates the default description', () => {
    const out = mjs.injectHead(shell, meta, site);
    expect(out.match(/name="description"/g)).toHaveLength(1);
    expect(out).toContain(meta.description);
    expect(out).not.toContain('content="default"');
  });

  it('preserves the sitewide JSON-LD graph', () => {
    expect(mjs.injectHead(shell, meta, site)).toContain('"@type":"Organization"');
  });

  it('emits the canonical for an indexable route', () => {
    expect(mjs.injectHead(shell, meta, site)).toContain(
      `<link rel="canonical" href="${meta.canonical}" />`,
    );
  });

  it('emits a self-canonical and noindex for a private route', () => {
    const out = mjs.injectHead(
      shell,
      APP_ROUTE_META['/dashboard'] as PageMeta,
      site,
    );
    expect(out).toContain(
      `<link rel="canonical" href="${canonicalFor('/dashboard')}" />`,
    );
    expect(out).toContain('content="noindex,nofollow"');
  });

  it('emits crawlable fallback copy and navigation outside noscript', () => {
    const out = mjs.injectHead(shell, meta, site, {
      h1: 'About Postr',
      copy: ['First line.', 'Second line.'],
      links: [
        { href: '/', label: 'Home' },
        { href: '/pricing', label: 'Pricing' },
      ],
    });
    expect(out).toContain('id="prerendered-content"');
    expect(out).not.toContain('<noscript>');
    expect(out).toContain('<h1>About Postr</h1>');
    expect(out).toContain('<p>First line.</p>');
    expect(out).toContain('<a href="/pricing">Pricing</a>');
    // #root stays empty: React calls createRoot(), which clears the
    // container; main.tsx removes the sibling fallback before mounting.
    expect(out).toContain('<div id="root"></div>');
  });

  it('escapes copy rather than injecting raw HTML', () => {
    const out = mjs.injectHead(shell, meta, site, {
      h1: '<img onerror=alert(1)>',
      copy: ['a & b'],
    });
    expect(out).not.toContain('<img onerror');
    expect(out).toContain('&lt;img onerror=alert(1)&gt;');
    expect(out).toContain('a &amp; b');
  });

  it('is idempotent — re-injecting does not accumulate tags', () => {
    const once = mjs.injectHead(shell, meta, site);
    const twice = mjs.injectHead(once, meta, site);
    expect(twice.match(/name="description"/g)).toHaveLength(1);
    expect(twice.match(/rel="canonical"/g)).toHaveLength(1);
  });

  it.each(staticPaths)(
    '%s exposes at least 150 crawler-visible words and links to every public route',
    (path) => {
      const record = routes.static[path as keyof typeof routes.static];
      const links = Object.entries(routes.static).map(([href, target]) => ({
        href,
        label: href === '/' ? 'Home' : target.h1,
      }));
      const out = mjs.injectHead(
        shell,
        STATIC_ROUTE_META[path] as PageMeta,
        site,
        { h1: record.h1, copy: record.copy, links },
      );
      const fallback =
        out.match(/<main id="prerendered-content"[\s\S]*?<\/main>/)?.[0] ?? '';
      const text = fallback
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      expect(text.split(' ').filter(Boolean).length).toBeGreaterThanOrEqual(150);
      expect(fallback.match(/<a href=/g)).toHaveLength(staticPaths.length);
    },
  );
});

describe('browser bootstrap', () => {
  it('removes the crawlable fallback before React mounts', () => {
    const mainSource = readFileSync(
      `${process.cwd()}/src/main.tsx`,
      'utf8',
    );
    const removal = mainSource.indexOf(
      "document.getElementById('prerendered-content')?.remove();",
    );
    const mount = mainSource.indexOf('ReactDOM.createRoot');

    expect(removal).toBeGreaterThanOrEqual(0);
    expect(removal).toBeLessThan(mount);
  });
});
