/**
 * Fix 26 — the build writes the French pages with their own head.
 *
 * Runs the real build steps (scripts/prerender.mjs, then
 * scripts/gen-sitemap.mjs) in plain Node, as `npm run build` does: copies of
 * the two scripts, scripts/lib/headTags.mjs and src/seo/routes.json, laid
 * out as in apps/web, with a copy of the shell index.html as dist/, in a
 * scratch folder; then reads the files they write. The copies are read
 * through copyScan's readSource, so under scripts/mutation-check.mjs a
 * mutant of any of the four is what runs. Claims:
 *
 *   P1  every French page in routes.json is written to <path>/index.html
 *       with <html lang="fr-CA">, its French title, description, canonical
 *       and og:locale fr_CA, and its French h1 and copy for non-JS readers;
 *   P2  each prerendered pair names both pages in hreflang alternates,
 *       x-default English, on both pages;
 *   P3  a page's fallback links (for readers that run no script) are in
 *       its own language, plus one link to its counterpart;
 *   P4  the sitemap lists the French pages that are indexable, and only
 *       those (no /auth/fr).
 *
 * Re-run: npx vitest run src/seo/__tests__/prerenderFrench.test.ts
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readSource } from '@/test/copyScan';
import routes from '../routes.json';

const WEB = process.cwd();
const ORIGIN = routes.siteOrigin;
let root = '';
let dist = '';

type RouteRecord = {
  title: string;
  description: string;
  h1?: string;
  copy?: string[];
  language?: string;
  locale?: string;
  prerender?: boolean;
};
const STATIC = routes.static as Record<string, RouteRecord>;
const APP = routes.app as Record<string, RouteRecord>;

/** Every prerendered page, with its record. */
const PRERENDERED: Array<[string, RouteRecord]> = [
  ...Object.entries(STATIC),
  ...Object.entries(APP).filter(([, r]) => r.prerender),
];
const FRENCH = PRERENDERED.filter(([, r]) => r.language === 'fr-CA');

const fileFor = (path: string) => join(dist, path === '/' ? '' : path.slice(1), 'index.html');
const read = (path: string) => readFileSync(fileFor(path), 'utf8');
const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attr = (html: string, re: RegExp) => {
  const m = html.match(re);
  return m ? decode(m[1] ?? '') : null;
};
const englishOf = (path: string) => (path === '/fr' ? '/' : path.replace(/\/fr$/, ''));

/** The build's inputs, copied into the scratch apps/web as they are (or as a mutant has them). */
const COPIED = ['scripts/prerender.mjs', 'scripts/gen-sitemap.mjs', 'scripts/lib/headTags.mjs', 'src/seo/routes.json'];

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'postr-prerender-'));
  dist = join(root, 'dist');
  for (const file of [...COPIED, 'index.html']) {
    const target = file === 'index.html' ? join(dist, 'index.html') : join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readSource(join(WEB, file)));
  }
  execFileSync(process.execPath, [join(root, 'scripts/prerender.mjs')], { stdio: 'pipe' });
  execFileSync(process.execPath, [join(root, 'scripts/gen-sitemap.mjs')], { stdio: 'pipe' });
});
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe('P1 — each French page is written with a French head', () => {
  it('there are French pages to write: the five public pages, their landing, and /auth/fr', () => {
    expect(FRENCH.map(([p]) => p).sort()).toEqual(
      ['/auth/fr', '/about/fr', '/cookies/fr', '/fr', '/pricing/fr', '/privacy/fr', '/terms/fr', '/tools/figure-readability/fr', '/why-posters/fr'].sort(),
    );
  });

  it.each(FRENCH)('%s', (path, record) => {
    const html = read(path);
    expect(attr(html, /<html[^>]*\blang="([^"]*)"/)).toBe('fr-CA');
    expect(attr(html, /<title>([^<]*)<\/title>/)).toBe(record.title);
    expect(attr(html, /<meta name="description" content="([^"]*)"/)).toBe(record.description);
    expect(attr(html, /<link rel="canonical" href="([^"]*)"/)).toBe(`${ORIGIN}${path}`);
    expect(attr(html, /<meta property="og:locale" content="([^"]*)"/)).toBe('fr_CA');
    expect(attr(html, /<h1>([^<]*)<\/h1>/)).toBe(record.h1);
    for (const paragraph of record.copy ?? []) expect(decode(html)).toContain(paragraph);
  });
});

describe('P2 — hreflang alternates on both pages of each pair', () => {
  it.each(FRENCH)('%s and its English page', (path) => {
    const en = englishOf(path);
    for (const page of [path, en]) {
      const html = read(page);
      const links = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)" \/>/g)].map(
        (m) => [m[1], m[2]],
      );
      expect(Object.fromEntries(links)).toEqual({
        en: `${ORIGIN}${en}`,
        'fr-CA': `${ORIGIN}${path}`,
        'x-default': `${ORIGIN}${en}`,
      });
    }
  });

  it('the 404 page carries none', () => {
    expect(readFileSync(join(dist, '404.html'), 'utf8')).not.toMatch(/hreflang/);
  });
});

describe('P3 — the fallback links are in the page’s language', () => {
  const navOf = (html: string) => {
    const nav = html.match(/<nav aria-label="([^"]*)">([\s\S]*?)<\/nav>/);
    if (!nav) throw new Error('no fallback nav');
    const links = [...(nav[2] ?? '').matchAll(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => ({
      href: m[1] ?? '',
      text: decode(m[2] ?? ''),
    }));
    return { label: nav[1], links };
  };

  it.each(FRENCH)('%s links French pages, and its English page once', (path) => {
    const { label, links } = navOf(read(path));
    expect(label).toBe('Pages de Postr');
    const switches = links.filter((l) => l.text === 'English');
    expect(switches).toEqual([{ href: englishOf(path), text: 'English' }]);
    const others = links.filter((l) => l.text !== 'English');
    expect(others.length).toBeGreaterThan(3);
    for (const l of others) expect(l.href, l.text).toMatch(/(^\/fr$|\/fr$|\/fr\?)/);
  });

  it.each(FRENCH.map(([p]) => [englishOf(p), p]))('%s links English pages, and %s once', (en, fr) => {
    const { label, links } = navOf(read(en));
    expect(label).toBe('Postr pages');
    expect(links.filter((l) => l.text === 'Français')).toEqual([{ href: fr, text: 'Français' }]);
    for (const l of links.filter((x) => x.text !== 'Français')) expect(l.href, l.text).not.toMatch(/\/fr($|\?)/);
  });
});

describe('P4 — the sitemap', () => {
  it('lists every indexable French page, and not the sign-in page', () => {
    const xml = readFileSync(join(dist, 'sitemap-static.xml'), 'utf8');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    for (const [path, record] of FRENCH) {
      if ((STATIC[path] ? 'index' : 'noindex') === 'index' && record) expect(locs).toContain(`${ORIGIN}${path}`);
    }
    expect(locs).not.toContain(`${ORIGIN}/auth/fr`);
    expect(locs).toContain(`${ORIGIN}/fr`);
  });
});
