import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { APP_ROUTE_META, STATIC_ROUTE_META, type PageMeta } from '../siteMeta';
import { useDocumentMeta } from '../useDocumentMeta';

function Probe({ meta, jsonLd }: { meta: PageMeta | null; jsonLd?: object | null }) {
  useDocumentMeta(meta, jsonLd ?? null);
  return null;
}

const content = (selector: string): string | null =>
  document.head.querySelector(selector)?.getAttribute('content') ?? null;

const count = (selector: string): number =>
  document.head.querySelectorAll(selector).length;

const about = STATIC_ROUTE_META['/about'] as PageMeta;
const dashboard = APP_ROUTE_META['/dashboard'] as PageMeta;

beforeEach(() => {
  document.head.innerHTML = '';
  document.title = '';
});

describe('useDocumentMeta', () => {
  it('sets the document title', () => {
    render(<Probe meta={about} />);
    expect(document.title).toBe(about.title);
  });

  it('writes description, robots and canonical', () => {
    render(<Probe meta={about} />);
    expect(content('meta[name="description"]')).toBe(about.description);
    expect(content('meta[name="robots"]')).toBe(about.robots);
    expect(
      document.head.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    ).toBe(about.canonical);
  });

  it('writes Open Graph and Twitter cards', () => {
    render(<Probe meta={about} />);
    expect(content('meta[property="og:title"]')).toBe(about.title);
    expect(content('meta[property="og:description"]')).toBe(about.description);
    expect(content('meta[property="og:url"]')).toBe(about.canonical);
    expect(content('meta[name="twitter:title"]')).toBe(about.title);
  });

  describe('card type follows whether an image actually exists', () => {
    it('omits image tags and downgrades the card when there is none', () => {
      // An og:image pointing at a missing file would point at the SPA
      // shell (the catch-all returns 200 HTML for missing files) and
      // unfurlers would drop the card entirely — so a route without an
      // image must emit no image tags at all.
      render(<Probe meta={{ ...about, ogImage: null, ogImageAlt: null }} />);

      expect(count('meta[property="og:image"]')).toBe(0);
      expect(count('meta[name="twitter:image"]')).toBe(0);
      expect(content('meta[name="twitter:card"]')).toBe('summary');
    });

    it('points indexable routes at the site-wide OG card', () => {
      render(<Probe meta={about} />);

      expect(content('meta[property="og:image"]')).toBe(
        'https://www.postr.sh/og-card.png',
      );
      expect(content('meta[name="twitter:card"]')).toBe('summary_large_image');
    });

    it('uses the large card when a real image is supplied', () => {
      render(
        <Probe meta={{ ...about, ogImage: 'https://x/y.png', ogImageAlt: 'A poster' }} />,
      );

      expect(content('meta[property="og:image"]')).toBe('https://x/y.png');
      expect(content('meta[property="og:image:alt"]')).toBe('A poster');
      expect(content('meta[name="twitter:card"]')).toBe('summary_large_image');
    });

    it('declares no image dimensions, since poster aspect ratios vary', () => {
      render(<Probe meta={{ ...about, ogImage: 'https://x/y.png' }} />);

      expect(count('meta[property="og:image:width"]')).toBe(0);
      expect(count('meta[property="og:image:height"]')).toBe(0);
    });
  });

  it('omits twitter:site, because a dangling handle suppresses the card', () => {
    render(<Probe meta={about} />);
    expect(count('meta[name="twitter:site"]')).toBe(0);
  });

  it('does nothing when meta is null, so a loading route keeps the previous title', () => {
    document.title = 'Previous title';
    render(<Probe meta={null} />);
    expect(document.title).toBe('Previous title');
    expect(count('meta[name="description"]')).toBe(0);
  });

  describe('adopting prerendered tags', () => {
    it('updates a prerendered description in place instead of appending a second one', () => {
      // Simulates what scripts/prerender.mjs bakes into dist/about/index.html.
      document.head.innerHTML =
        '<meta name="description" content="stale prerendered text">';

      render(<Probe meta={about} />);

      expect(count('meta[name="description"]')).toBe(1);
      expect(content('meta[name="description"]')).toBe(about.description);
    });

    it('updates a prerendered canonical in place', () => {
      document.head.innerHTML =
        '<link rel="canonical" href="https://www.postr.sh/wrong">';

      render(<Probe meta={about} />);

      expect(count('link[rel="canonical"]')).toBe(1);
      expect(
        document.head.querySelector('link[rel="canonical"]')?.getAttribute('href'),
      ).toBe(about.canonical);
    });

    it('removes a prerendered canonical it never marked when landing on a noindex route', () => {
      // Regression: removal used to be gated on the data-pm marker, so a
      // canonical injected by the build script survived onto noindex
      // pages — the exact noindex+canonical contradiction PageMeta
      // forbids. A crawler's first view of /dashboard is unmarked HTML.
      document.head.innerHTML =
        '<link rel="canonical" href="https://www.postr.sh/leaked">';

      render(<Probe meta={dashboard} />);

      expect(count('link[rel="canonical"]')).toBe(0);
      expect(content('meta[name="robots"]')).toBe('noindex,nofollow');
    });

    it('removes an unmarked prerendered og:image when a route has none', () => {
      document.head.innerHTML =
        '<meta property="og:image" content="https://www.postr.sh/stale.png">';

      render(<Probe meta={dashboard} />);

      expect(count('meta[property="og:image"]')).toBe(0);
    });

    it('does not duplicate tags when the same route renders twice', () => {
      const { rerender } = render(<Probe meta={about} />);
      rerender(<Probe meta={{ ...about }} />);

      expect(count('meta[name="description"]')).toBe(1);
      expect(count('meta[property="og:title"]')).toBe(1);
      expect(count('link[rel="canonical"]')).toBe(1);
    });
  });

  describe('navigating between routes', () => {
    it('drops the canonical when moving to a noindex route', () => {
      const { rerender } = render(<Probe meta={about} />);
      expect(count('link[rel="canonical"]')).toBe(1);

      rerender(<Probe meta={dashboard} />);

      expect(count('link[rel="canonical"]')).toBe(0);
      expect(content('meta[name="robots"]')).toBe('noindex,nofollow');
    });

    it('replaces values rather than accumulating tags', () => {
      const { rerender } = render(<Probe meta={about} />);
      rerender(<Probe meta={STATIC_ROUTE_META['/terms'] as PageMeta} />);

      expect(count('meta[name="description"]')).toBe(1);
      expect(content('meta[name="description"]')).toBe(
        STATIC_ROUTE_META['/terms']?.description,
      );
    });
  });

  describe('json-ld', () => {
    it('emits a block when given one', () => {
      render(<Probe meta={about} jsonLd={{ '@type': 'WebPage' }} />);
      const node = document.head.querySelector(
        'script[type="application/ld+json"]',
      );
      expect(JSON.parse(node?.textContent ?? '{}')).toEqual({ '@type': 'WebPage' });
    });

    it('emits none when not given one', () => {
      render(<Probe meta={about} />);
      expect(count('script[type="application/ld+json"]')).toBe(0);
    });

    it('does not clobber a site-wide block it does not own', () => {
      // The Organization/WebSite @graph lives in index.html without the
      // data-pm marker; the hook must leave it alone.
      document.head.innerHTML =
        '<script type="application/ld+json">{"@type":"Organization"}</script>';

      render(<Probe meta={about} />);

      expect(count('script[type="application/ld+json"]')).toBe(1);
      expect(
        document.head.querySelector('script[type="application/ld+json"]')
          ?.textContent,
      ).toContain('Organization');
    });
  });
});
