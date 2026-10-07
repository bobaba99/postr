import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  APP_ROUTE_META,
  INDEXABLE,
  NOINDEX,
  SITE_ORIGIN,
  STATIC_ROUTE_META,
  canonicalFor,
  clampDescription,
  editorMeta,
  galleryEntryMeta,
  metaFor,
  shareMeta,
  staticCopyFor,
} from '../siteMeta';

describe('canonicalFor', () => {
  it('keeps the root path as a bare origin with a single slash', () => {
    expect(canonicalFor('/')).toBe(`${SITE_ORIGIN}/`);
  });

  it('strips a trailing slash on non-root paths', () => {
    expect(canonicalFor('/about/')).toBe(`${SITE_ORIGIN}/about`);
  });

  it('lowercases the path', () => {
    expect(canonicalFor('/About')).toBe(`${SITE_ORIGIN}/about`);
  });

  it('drops query strings and fragments', () => {
    expect(canonicalFor('/about?utm_source=x&page=2')).toBe(
      `${SITE_ORIGIN}/about`,
    );
    expect(canonicalFor('/about#team')).toBe(`${SITE_ORIGIN}/about`);
  });

  it('tolerates a path with no leading slash', () => {
    expect(canonicalFor('about')).toBe(`${SITE_ORIGIN}/about`);
  });
});

describe('STATIC_ROUTE_META', () => {
  const entries = Object.entries(STATIC_ROUTE_META);

  it('covers every public static route', () => {
    // "/gallery", "/paper-to-poster", "/paper-to-slides" and
    // "/chart-chooser" are intentionally absent: those features are
    // deactivated and their routes redirect to the landing page (see
    // the routes.tsx header). A static record here would prerender and
    // sitemap a page that only redirects.
    // Each public page has its French twin at its path + /fr, and /fr
    // for the landing page (fix 26).
    expect(Object.keys(STATIC_ROUTE_META).sort()).toEqual([
      '/',
      '/about',
      '/about/fr',
      '/cookies',
      '/cookies/fr',
      '/fr',
      '/pricing',
      '/pricing/fr',
      '/privacy',
      '/privacy/fr',
      '/terms',
      '/terms/fr',
      '/tools/figure-readability',
      '/tools/figure-readability/fr',
      '/why-posters',
      '/why-posters/fr',
    ]);
  });

  it('describes the figure-readability checker for both R and Python users', () => {
    // The page serves both audiences equally; a record that only named
    // one would rank for half the query space it exists for.
    const meta = STATIC_ROUTE_META['/tools/figure-readability'];
    const copy = staticCopyFor('/tools/figure-readability');
    const text = `${meta?.title} ${meta?.description} ${copy?.copy.join(' ')}`;
    expect(text).toMatch(/\bR\b/);
    expect(text).toMatch(/Python|matplotlib/);
    expect(copy?.h1).toBe('Will your figure labels be readable at poster size?');
  });

  it.each([
    ['/privacy/fr', 'fr-CA', 'fr_CA'],
    ['/cookies/fr', 'fr-CA', 'fr_CA'],
    ['/terms/fr', 'fr-CA', 'fr_CA'],
    ['/fr', 'fr-CA', 'fr_CA'],
    ['/about/fr', 'fr-CA', 'fr_CA'],
    ['/why-posters/fr', 'fr-CA', 'fr_CA'],
    ['/pricing/fr', 'fr-CA', 'fr_CA'],
    ['/tools/figure-readability/fr', 'fr-CA', 'fr_CA'],
  ])('%s has French language and locale signals', (path, language, locale) => {
    const meta = STATIC_ROUTE_META[path];
    expect(meta?.language).toBe(language);
    expect(meta?.locale).toBe(locale);
    expect(meta?.canonical).toBe(canonicalFor(path));
  });

  it.each([
    '/paper-to-poster',
    '/paper-to-slides',
    '/presentation-checker',
    '/chart-chooser',
  ])(
    'has no record for the deactivated %s (it would prerender a redirect)',
    (path) => {
      expect(metaFor(path)).toBeNull();
      expect(staticCopyFor(path)).toBeNull();
    },
  );

  it.each(entries)('%s is indexable and carries preview directives', (_p, meta) => {
    expect(meta.robots).toContain(INDEXABLE);
    expect(meta.robots).toContain('max-image-preview:large');
  });

  it.each(entries)('%s has an absolute canonical on the www host', (path, meta) => {
    expect(meta.canonical).toBe(canonicalFor(path));
    expect(meta.canonical).toMatch(/^https:\/\/www\.postr\.sh/);
  });

  it.each(entries)('%s has a unique, budget-sized title', (_p, meta) => {
    expect(meta.title.length).toBeGreaterThanOrEqual(30);
    expect(meta.title.length).toBeLessThanOrEqual(60);
  });

  it.each(entries)('%s has a budget-sized description', (_p, meta) => {
    expect(meta.description.length).toBeGreaterThanOrEqual(120);
    expect(meta.description.length).toBeLessThanOrEqual(160);
  });

  it('gives every route a distinct title — the defect this whole module exists to fix', () => {
    const titles = entries.map(([, meta]) => meta.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('gives every route a distinct description', () => {
    const descriptions = entries.map(([, meta]) => meta.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it('never mentions AI in user-facing copy', () => {
    for (const [, meta] of entries) {
      expect(`${meta.title} ${meta.description}`).not.toMatch(/\bAI\b/i);
    }
  });

  it('never mentions AI in the French copy either (« IA »), outside the legal pages', () => {
    for (const [path, meta] of entries) {
      if (meta.language !== 'fr-CA' || /^\/(privacy|cookies|terms)\//.test(path)) continue;
      const copy = staticCopyFor(path);
      expect(`${meta.title} ${meta.description} ${copy?.h1} ${copy?.copy.join(' ')}`).not.toMatch(
        /\bIA\b|intelligence artificielle/i,
      );
    }
  });

  it('gives every English page with a French twin a different French title and description', () => {
    for (const [path, meta] of entries.filter(([, m]) => m.language === 'fr-CA')) {
      const english = STATIC_ROUTE_META[path === '/fr' ? '/' : path.replace(/\/fr$/, '')];
      expect(english, `${path} has an English page`).toBeDefined();
      expect(meta.title).not.toBe(english?.title);
      expect(meta.description).not.toBe(english?.description);
      expect(staticCopyFor(path)?.copy.length).toBe(staticCopyFor(path === '/fr' ? '/' : path.replace(/\/fr$/, ''))?.copy.length);
    }
  });
});

describe('APP_ROUTE_META', () => {
  const entries = Object.entries(APP_ROUTE_META);

  it.each(entries)('%s is noindex', (_p, meta) => {
    expect(meta.robots).toBe(NOINDEX);
  });

  it.each(entries)('%s emits a self-canonical without becoming indexable', (path, meta) => {
    expect(meta.canonical).toBe(canonicalFor(path));
  });

  it.each(entries)('%s has complete share metadata', (_path, meta) => {
    expect(meta.ogImage).toBe(`${SITE_ORIGIN}/og-card.png`);
    expect(meta.ogImageAlt).toBeTruthy();
  });

  it.each(entries)('%s has budget-sized metadata without becoming indexable', (
    _path,
    meta,
  ) => {
    expect(meta.title.length).toBeGreaterThanOrEqual(30);
    expect(meta.title.length).toBeLessThanOrEqual(60);
    expect(meta.description.length).toBeGreaterThanOrEqual(120);
    expect(meta.description.length).toBeLessThanOrEqual(160);
  });

  it('defines metadata for both billing return states', () => {
    expect(APP_ROUTE_META['/billing/success']).toBeDefined();
    expect(APP_ROUTE_META['/billing/cancel']).toBeDefined();
  });

  it.each(['/auth/fr', '/billing/success/fr', '/billing/cancel/fr', '/404/fr'])(
    'defines French metadata for %s (fix 26)',
    (path) => {
      const meta = APP_ROUTE_META[path];
      expect(meta?.language).toBe('fr-CA');
      expect(meta?.locale).toBe('fr_CA');
      const english = APP_ROUTE_META[path.replace(/\/fr$/, '')];
      expect(meta?.title).not.toBe(english?.title);
      expect(meta?.description).not.toBe(english?.description);
    },
  );
});

describe('staticCopyFor', () => {
  it('returns crawler-visible copy for a static route', () => {
    const copy = staticCopyFor('/');
    expect(copy?.h1).toBeTruthy();
    expect(copy?.copy.length).toBeGreaterThan(0);
  });

  it('states the refund rule in the /pricing crawler copy (owner rule, 2026-09-11)', () => {
    // The pack line names the credit, as data/refundCopy.ts does: credits
    // are pooled, so the server refuses a pack refund once any credit is
    // used. "Until its first export" was wrong in both directions.
    const copy = staticCopyFor('/pricing')?.copy.join(' ') ?? '';
    expect(copy).toMatch(/14 days/);
    expect(copy).toMatch(/until you use an export credit/i);
    expect(copy).not.toMatch(/first export/i);
  });

  it('returns null for a route with no static copy', () => {
    expect(staticCopyFor('/dashboard')).toBeNull();
  });
});

describe('metaFor', () => {
  it('resolves static routes', () => {
    expect(metaFor('/about')?.title).toBe(STATIC_ROUTE_META['/about']?.title);
  });

  it('resolves app routes', () => {
    expect(metaFor('/dashboard')?.robots).toBe(NOINDEX);
  });

  it('returns null for an unknown route', () => {
    expect(metaFor('/nope')).toBeNull();
  });
});

describe('clampDescription', () => {
  it('leaves short text untouched', () => {
    expect(clampDescription('short text')).toBe('short text');
  });

  it('collapses runs of whitespace', () => {
    expect(clampDescription('a   b\n\nc')).toBe('a b c');
  });

  it('truncates on a word boundary rather than mid-word', () => {
    const source = 'alpha beta gamma delta epsilon';
    const result = clampDescription(source, 20);

    expect(result.length).toBeLessThanOrEqual(20);
    expect(result.endsWith('…')).toBe(true);

    // Every surviving word must be a whole word from the source, which
    // is the property that "truncate on a word boundary" actually means.
    const sourceWords = source.split(' ');
    for (const word of result.replace(/…$/, '').trim().split(' ')) {
      expect(sourceWords).toContain(word);
    }
  });

  it('falls back to a hard cut when one word exceeds the budget', () => {
    const result = clampDescription('supercalifragilisticexpialidocious', 12);
    expect(result.length).toBeLessThanOrEqual(12);
  });
});

describe('galleryEntryMeta', () => {
  const base = {
    id: 'abc-123',
    title: 'Feline Proximity to Keyboard as a Function of Human Typing Speed',
    fieldLabel: 'Neuroscience',
    conference: 'SfN',
    year: 2026,
    notes: null,
    imageUrl: 'https://example.supabase.co/storage/v1/object/public/gallery/x.png',
  };

  it('is indexable with a canonical pointing at the entry', () => {
    const meta = galleryEntryMeta(base);
    expect(meta.robots).toContain(INDEXABLE);
    expect(meta.canonical).toBe(`${SITE_ORIGIN}/gallery/abc-123`);
  });

  it('keeps the title within budget even for a long poster title', () => {
    expect(galleryEntryMeta(base).title.length).toBeLessThanOrEqual(80);
  });

  it('mentions the venue when present', () => {
    expect(galleryEntryMeta(base).description).toContain('SfN 2026');
  });

  it('omits the venue cleanly when absent', () => {
    const meta = galleryEntryMeta({ ...base, conference: null, year: null });
    expect(meta.description).not.toContain('()');
  });

  it('uses the poster image as the card, not the default', () => {
    expect(galleryEntryMeta(base).ogImage).toBe(base.imageUrl);
  });

  it('caps the description at the snippet budget', () => {
    const meta = galleryEntryMeta({ ...base, notes: 'x'.repeat(500) });
    expect(meta.description.length).toBeLessThanOrEqual(155);
  });
});

describe('editorMeta', () => {
  it.each([null, 'Untitled poster', 'A'.repeat(200)])(
    'keeps private editor metadata complete for %s',
    (posterTitle) => {
      const meta = editorMeta(posterTitle, 'poster-123');

      expect(meta.robots).toBe(NOINDEX);
      expect(meta.canonical).toBe(canonicalFor('/p/poster-123'));
      expect(meta.title.length).toBeGreaterThanOrEqual(30);
      expect(meta.title.length).toBeLessThanOrEqual(60);
      expect(meta.description.length).toBeGreaterThanOrEqual(120);
      expect(meta.description.length).toBeLessThanOrEqual(160);
    },
  );
});

describe('shareMeta', () => {
  const meta = shareMeta({
    slug: 'review-abc',
    title: 'My WIP poster',
    imageUrl: 'https://x/y.png',
  });

  it('is never indexable — these are unpublished research posters', () => {
    expect(meta.robots).toBe(NOINDEX);
  });

  it('emits a self-canonical without weakening noindex', () => {
    expect(meta.canonical).toBe(canonicalFor('/s/review-abc'));
    expect(meta.robots).toBe(NOINDEX);
  });

  it('carries an image through when one is supplied, so the edge shell can unfurl richly', () => {
    // Note: the live Share.tsx passes null today — real cards need the
    // Phase 1 edge shell. This asserts the builder does not drop an
    // image on the floor once that shell supplies one.
    expect(meta.ogImage).toBe('https://x/y.png');
    expect(meta.title).toContain('My WIP poster');
  });

  it('stays noindex even when an image is supplied', () => {
    expect(meta.robots).toBe(NOINDEX);
    expect(meta.canonical).toBe(canonicalFor('/s/review-abc'));
  });

  it('uses the real default social card when no poster image exists', () => {
    expect(
      shareMeta({ slug: 'review-abc', title: null, imageUrl: null }).ogImage,
    ).toBe(`${SITE_ORIGIN}/og-card.png`);
  });

  it('falls back to a placeholder title for an untitled poster', () => {
    expect(
      shareMeta({ slug: 'review-abc', title: null, imageUrl: null }).title,
    ).toContain('Shared');
    expect(
      shareMeta({ slug: 'review-abc', title: '   ', imageUrl: null }).title,
    ).toContain('Shared');
  });

  it.each([null, 'My WIP poster', 'A'.repeat(200)])(
    'keeps private share metadata within title and description budgets for %s',
    (title) => {
      const result = shareMeta({ slug: 'review-abc', title, imageUrl: null });
      expect(result.title.length).toBeGreaterThanOrEqual(30);
      expect(result.title.length).toBeLessThanOrEqual(60);
      expect(result.description.length).toBeGreaterThanOrEqual(120);
      expect(result.description.length).toBeLessThanOrEqual(160);
    },
  );

  it('describes a share link without promising privacy or comments (sharing is off, fix 23)', () => {
    // A shared poster is readable through the API, and a first-time
    // visitor could not post a comment (copy audit, 2026-09-29), so the
    // card says only what the page does: show the poster read-only.
    const result = shareMeta({ slug: 'review-abc', title: null, imageUrl: null });
    expect(result.description).toMatch(/read-only/);
    expect(`${result.title} ${result.description}`).not.toMatch(/private|comment|review/i);
  });

  it('keeps the edge shell share card word for word the same as shareMeta', () => {
    // api/shell/_lib.ts cannot import this module (it runs on the edge
    // without the app's path aliases), so it carries a copy of the text.
    const source = readFileSync(`${process.cwd()}/api/shell/_lib.ts`, 'utf8');
    const result = shareMeta({ slug: 'review-abc', title: null, imageUrl: null });
    expect(source).toContain(result.description);
    expect(source).toContain(result.title);
  });

  it('is applied while the share record loads instead of inheriting an indexable page', () => {
    const source = readFileSync(`${process.cwd()}/src/pages/Share.tsx`, 'utf8');
    expect(source).toMatch(/useDocumentMeta\(\s*shareMeta\(\{/);
  });
});
