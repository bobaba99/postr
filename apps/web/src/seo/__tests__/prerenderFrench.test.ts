/**
 * Fix 26 — the build writes the French pages with their own head.
 *
 * Runs the real build steps (scripts/prerender.mjs, then
 * scripts/gen-sitemap.mjs) in plain Node, as `npm run build` does: copies of
 * the two scripts, scripts/lib/headTags.mjs, src/seo/routes.json and
 * src/config/features.ts, laid out as in apps/web, with a copy of the shell
 * index.html as dist/, in a scratch folder; then reads the files they write.
 * The copies are read through copyScan's readSource, so under
 * scripts/mutation-check.mjs a mutant of any of the five is what runs. Claims:
 *
 *   P1  every French page in routes.json is written to <path>/index.html
 *       with <html lang="fr-CA">, its French title, description, canonical
 *       and og:locale fr_CA, and its French h1 and copy for non-JS readers;
 *   P2  each prerendered pair names both pages in hreflang alternates,
 *       x-default English, on both pages;
 *   P3  a page's fallback links (for readers that run no script) are in
 *       its own language, plus one link to its counterpart;
 *   P4  the sitemap lists the French pages that are indexable, and only
 *       those (no /auth/fr);
 *   P5  the fallback links follow the app's nav: no page links the Why
 *       posters page in its language while WHY_POSTERS_NAV_ENABLED is off
 *       (2026-10-29), every page does while it is on, and the page stays
 *       written and in the sitemap either way. The build runs twice: as
 *       shipped, and with the switch inverted in its copy of features.ts
 *       under a comment that quotes the shipped line, so both halves are
 *       checked whatever ships, and the build must read the declaration,
 *       not the first text that looks like it.
 *
 * Re-run: npx vitest run src/seo/__tests__/prerenderFrench.test.ts
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readSource } from '@/test/copyScan';
import { WHY_POSTERS_NAV_ENABLED } from '@/config/features';
import routes from '../routes.json';

const WEB = process.cwd();
const ORIGIN = routes.siteOrigin;
let root = '';
let dist = '';
/** The same build with WHY_POSTERS_NAV_ENABLED inverted (P5). */
let rootFlipped = '';
let distFlipped = '';

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

/** A page's fallback nav: its label and links, decoded. */
const navOf = (html: string) => {
  const nav = html.match(/<nav aria-label="([^"]*)">([\s\S]*?)<\/nav>/);
  if (!nav) throw new Error('no fallback nav');
  const links = [...(nav[2] ?? '').matchAll(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => ({
    href: m[1] ?? '',
    text: decode(m[2] ?? ''),
  }));
  return { label: nav[1], links };
};

/** The build's inputs, copied into the scratch apps/web as they are (or as a mutant has them). */
const COPIED = [
  'scripts/prerender.mjs',
  'scripts/gen-sitemap.mjs',
  'scripts/lib/headTags.mjs',
  'src/seo/routes.json',
  'src/config/features.ts',
];

/**
 * Copies the build's inputs into a scratch apps/web, passing each file's
 * text through `edit`, runs the two build steps there, and returns the
 * scratch folder and its dist/.
 */
function buildIn(edit: (file: string, text: string) => string = (_file, text) => text) {
  const scratch = mkdtempSync(join(tmpdir(), 'postr-prerender-'));
  const out = join(scratch, 'dist');
  for (const file of [...COPIED, 'index.html']) {
    const target = file === 'index.html' ? join(out, 'index.html') : join(scratch, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, edit(file, readSource(join(WEB, file))));
  }
  execFileSync(process.execPath, [join(scratch, 'scripts/prerender.mjs')], { stdio: 'pipe' });
  execFileSync(process.execPath, [join(scratch, 'scripts/gen-sitemap.mjs')], { stdio: 'pipe' });
  return { scratch, out };
}

const SWITCH_LINE = /^export const WHY_POSTERS_NAV_ENABLED = (true|false);$/m;

/** features.ts with the switch inverted, under a comment quoting the shipped line. */
function flipSwitch(text: string): string {
  if (!SWITCH_LINE.test(text)) throw new Error('features.ts: no WHY_POSTERS_NAV_ENABLED line to flip');
  return text.replace(
    SWITCH_LINE,
    `/* export const WHY_POSTERS_NAV_ENABLED = ${WHY_POSTERS_NAV_ENABLED}; */\n` +
      `export const WHY_POSTERS_NAV_ENABLED = ${!WHY_POSTERS_NAV_ENABLED};`,
  );
}

beforeAll(() => {
  ({ scratch: root, out: dist } = buildIn());
  ({ scratch: rootFlipped, out: distFlipped } = buildIn((file, text) =>
    file === 'src/config/features.ts' ? flipSwitch(text) : text,
  ));
});
afterAll(() => {
  for (const scratch of [root, rootFlipped]) {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
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

describe('P5 — the fallback links follow the app’s nav: Why posters', () => {
  /** The Why posters page in a record's language. */
  const pageIn = (record: RouteRecord) => (record.language === 'fr-CA' ? '/why-posters/fr' : '/why-posters');
  /** The link to a page's twin in the other language, which P3 covers. */
  const isLanguageLink = (text: string) => text === 'English' || text === 'Français';
  /** Each build, with the switch value it was made with (read once beforeAll has run). */
  const builds = () =>
    [
      ['as shipped', dist, WHY_POSTERS_NAV_ENABLED],
      ['switch inverted', distFlipped, !WHY_POSTERS_NAV_ENABLED],
    ] as const;
  const readIn = (out: string, path: string) =>
    readFileSync(join(out, path === '/' ? '' : path.slice(1), 'index.html'), 'utf8');

  it.each(PRERENDERED)('%s links the page only while WHY_POSTERS_NAV_ENABLED is on', (path, record) => {
    for (const [build, out, on] of builds()) {
      const hrefs = navOf(readIn(out, path)).links.filter((l) => !isLanguageLink(l.text)).map((l) => l.href);
      expect(hrefs, build).toContain(record.language === 'fr-CA' ? '/pricing/fr' : '/pricing');
      expect(hrefs.includes(pageIn(record)), build).toBe(on);
    }
  });

  it('the 404 page links it only while the switch is on', () => {
    for (const [build, out, on] of builds()) {
      const hrefs = navOf(readFileSync(join(out, '404.html'), 'utf8')).links.map((l) => l.href);
      expect(hrefs, build).toContain('/pricing');
      expect(hrefs.includes('/why-posters'), build).toBe(on);
    }
  });

  it('writes both pages and keeps them in the sitemap either way', () => {
    for (const [build, out] of builds()) {
      expect(attr(readIn(out, '/why-posters'), /<h1>([^<]*)<\/h1>/), build).toBe(STATIC['/why-posters']?.h1);
      expect(attr(readIn(out, '/why-posters/fr'), /<h1>([^<]*)<\/h1>/), build).toBe(STATIC['/why-posters/fr']?.h1);
      const xml = readFileSync(join(out, 'sitemap-static.xml'), 'utf8');
      expect(xml, build).toContain(`<loc>${ORIGIN}/why-posters</loc>`);
      expect(xml, build).toContain(`<loc>${ORIGIN}/why-posters/fr</loc>`);
    }
  });
});
