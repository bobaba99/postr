/**
 * Writes a real HTML document per static public route, after `vite build`.
 *
 * Why this exists: Googlebot renders JavaScript, so Google can already
 * read this SPA. Nothing else can. Social unfurlers (Slackbot,
 * Twitterbot, LinkedInBot, facebookexternalhit) have never executed
 * JavaScript, and AI crawlers (GPTBot, ClaudeBot, PerplexityBot) fetch
 * raw HTML only. All of them currently receive `<div id="root"></div>`.
 * This step gives them per-route title, description, canonical, Open
 * Graph tags and the page's primary text.
 *
 * How it survives the catch-all rewrite: Vercel checks the filesystem
 * before applying `rewrites`, so a real file at `dist/about/index.html`
 * wins over `/(.*)` -> `/index.html`. That is already observable in
 * production, where /favicon.svg and /version.json are served rather
 * than rewritten.
 *
 * Emit DIRECTORIES, never flat files. `cleanUrls` is unset (defaults
 * false), so `dist/about.html` would be reachable only at `/about.html`
 * and `/about` would keep serving the shell — a silent failure with a
 * green build and a 200 response. Hence verify-prerender.sh.
 *
 * This script also emits `dist/404.html`. vercel.json enumerates the
 * real client routes instead of a blanket catch-all, so any path that
 * matches neither the filesystem nor a rewrite falls through to
 * Vercel's 404 handling — which serves `404.html` from the output
 * directory WITH a real 404 status. The file is the SPA shell plus
 * noindex head tags, so browsers hydrate the branded NotFound page
 * while crawlers see an honest 404 instead of the old soft-404 space.
 *
 * French pages (fix 26): a record with language fr-CA is written like any
 * other, with its French head; a page whose twin is prerendered too names
 * both in hreflang alternates (lib/headTags.mjs alternatesFor). The
 * fallback links for readers that run no script are in the page's own
 * language, plus one link to its twin in the other language.
 *
 * src/seo/__tests__/prerenderFrench.test.ts runs this script (a copy of it
 * and of lib/headTags.mjs and routes.json, so a mutant of any of them is
 * what runs) on a copy of the shell, and reads what it writes.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPageMeta, injectHead, twinPath } from './lib/headTags.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, '..');
const DIST = join(WEB_ROOT, 'dist');

const routes = JSON.parse(
  readFileSync(join(WEB_ROOT, 'src/seo/routes.json'), 'utf8'),
);

const site = {
  siteOrigin: routes.siteOrigin,
  siteName: routes.siteName,
  language: routes.language,
  locale: routes.locale,
  defaultOgImage: routes.defaultOgImage,
};

const shellPath = join(DIST, 'index.html');
let shell;
try {
  shell = readFileSync(shellPath, 'utf8');
} catch {
  console.error(
    `[prerender] ${shellPath} not found. Run \`vite build\` first.`,
  );
  process.exit(1);
}

/** French when the record says fr-CA (lib/headTags.mjs reads the same field). */
const isFrench = (record) => (record.language ?? routes.language) === 'fr-CA';

/** The fallback nav's words, per language. */
const FALLBACK_WORDS = {
  en: { nav: 'Postr pages', home: 'Home', signIn: 'Sign in', languageName: 'English' },
  fr: { nav: 'Pages de Postr', home: 'Accueil', signIn: 'Connexion', languageName: 'Français' },
};

/**
 * The fallback links of a page: the static pages in its language, sign-in
 * in its language, and its twin in the other language when there is one.
 */
function fallbackNavFor(routePath, record) {
  const lang = isFrench(record) ? 'fr' : 'en';
  const other = lang === 'fr' ? 'en' : 'fr';
  const words = FALLBACK_WORDS[lang];
  const links = Object.entries(routes.static)
    .filter(([, r]) => isFrench(r) === (lang === 'fr'))
    .map(([href, r]) => ({ href, label: href === '/' || href === '/fr' ? words.home : r.h1 }));
  links.push({ href: lang === 'fr' ? '/auth/fr' : '/auth', label: words.signIn });
  const twin = twinPath(routePath);
  const prerenderedTwin = routes.static[twin] ?? (routes.app?.[twin]?.prerender ? routes.app[twin] : null);
  if (prerenderedTwin) links.push({ href: twin, label: FALLBACK_WORDS[other].languageName });
  return { links, navLabel: words.nav };
}

/** Route path -> file to write. Root overwrites the shell itself. */
function outputPathFor(routePath) {
  if (routePath === '/') return join(DIST, 'index.html');
  return join(DIST, routePath.replace(/^\//, ''), 'index.html');
}

const written = [];

for (const [routePath, record] of Object.entries(routes.static)) {
  const meta = buildPageMeta(routePath, record, site, routes);
  const html = injectHead(shell, meta, site, {
    h1: record.h1,
    copy: record.copy,
    ...fallbackNavFor(routePath, record),
  });

  const outPath = outputPathFor(routePath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, 'utf8');
  written.push({ routePath, outPath, bytes: Buffer.byteLength(html) });
}

for (const [routePath, record] of Object.entries(routes.app ?? {}).filter(
  ([, value]) => value.prerender === true,
)) {
  if (!record.h1 || !record.copy?.length) {
    console.error(
      `[prerender] routes.json app["${routePath}"] is marked prerender but has no h1/copy.`,
    );
    process.exit(1);
  }
  const html = injectHead(shell, buildPageMeta(routePath, record, site, routes), site, {
    h1: record.h1,
    copy: record.copy,
    ...fallbackNavFor(routePath, record),
  });
  const outPath = outputPathFor(routePath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, 'utf8');
  written.push({ routePath, outPath, bytes: Buffer.byteLength(html) });
}

// The branded 404 page, served by Vercel with a real 404 status for any
// path no rewrite or file matches. Single-sourced from routes.json so
// its head tags cannot drift from what the React NotFound page sets.
const notFoundRecord = routes.app?.['/404'];
if (!notFoundRecord?.h1 || !notFoundRecord?.copy?.length) {
  console.error(
    '[prerender] routes.json app["/404"] is missing h1/copy — cannot emit dist/404.html.',
  );
  process.exit(1);
}

const notFoundHtml = injectHead(
  shell,
  buildPageMeta('/404', notFoundRecord, site, routes),
  site,
  {
    h1: notFoundRecord.h1,
    copy: notFoundRecord.copy,
    ...fallbackNavFor('/404', notFoundRecord),
  },
);
const notFoundPath = join(DIST, '404.html');
writeFileSync(notFoundPath, notFoundHtml, 'utf8');
written.push({
  routePath: '/404.html',
  outPath: notFoundPath,
  bytes: Buffer.byteLength(notFoundHtml),
});

const shellBytes = Buffer.byteLength(shell);
for (const { routePath, bytes } of written) {
  if (bytes <= shellBytes) {
    console.error(
      `[prerender] ${routePath} is ${bytes}B, not larger than the ${shellBytes}B shell — injection did nothing.`,
    );
    process.exit(1);
  }
}

console.log(
  `[prerender] wrote ${written.length} pages: ${written
    .map((w) => w.routePath)
    .join(', ')} (404.html serves unknown paths at status 404)`,
);
