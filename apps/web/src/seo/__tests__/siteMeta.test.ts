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
    // "/gallery" is intentionally absent: the public gallery is
    // deactivated and its routes redirect to the landing page.
    expect(Object.keys(STATIC_ROUTE_META).sort()).toEqual([
      '/',
      '/about',
      '/chart-chooser',
      '/cookies',
      '/cookies/fr',
      '/paper-to-poster',
      '/paper-to-slides',
      '/pricing',
      '/privacy',
      '/privacy/fr',
      '/terms',
      '/terms/fr',
      '/why-posters',
    ]);
  });

  it.each([
    ['/privacy/fr', 'fr-CA', 'fr_CA'],
    ['/cookies/fr', 'fr-CA', 'fr_CA'],
    ['/terms/fr', 'fr-CA', 'fr_CA'],
  ])('%s has French language and locale signals', (path, language, locale) => {
    const meta = STATIC_ROUTE_META[path];
    expect(meta?.language).toBe(language);
    expect(meta?.locale).toBe(locale);
    expect(meta?.canonical).toBe(canonicalFor(path));
  });

  it('/paper-to-poster promises no slide output — that conversion does not exist', () => {
    // This flow emits a poster draft (PDF / .postr) only, and
    // /paper-to-present redirects here purely to reserve the slug —
    // so visitors arriving from that URL must not be told a deck is
    // waiting at the end of it.
    //
    // Scoped to this one route on purpose. A site-wide ban on the word
    // "PowerPoint" would fire on the landing page's "no PowerPoint",
    // which is a disclaimer about what Postr replaces, not a promise.
    const meta = STATIC_ROUTE_META['/paper-to-poster'];
    const copy = staticCopyFor('/paper-to-poster');
    const text = [
      meta?.title ?? '',
      meta?.description ?? '',
      copy?.h1 ?? '',
      ...(copy?.copy ?? []),
    ].join(' ');

    expect(text).not.toMatch(
      /\b(slide|slides|slide deck|powerpoint|pptx|presentation deck|keynote)\b/i,
    );
  });

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
});

describe('staticCopyFor', () => {
  it('returns crawler-visible copy for a static route', () => {
    const copy = staticCopyFor('/');
    expect(copy?.h1).toBeTruthy();
    expect(copy?.copy.length).toBeGreaterThan(0);
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

  it('is applied while the share record loads instead of inheriting an indexable page', () => {
    const source = readFileSync(`${process.cwd()}/src/pages/Share.tsx`, 'utf8');
    expect(source).toMatch(/useDocumentMeta\(\s*shareMeta\(\{/);
  });
});
