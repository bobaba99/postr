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
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPageMeta, injectHead } from './lib/headTags.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, '..');
const DIST = join(WEB_ROOT, 'dist');

const routes = JSON.parse(
  readFileSync(join(WEB_ROOT, 'src/seo/routes.json'), 'utf8'),
);

const site = {
  siteOrigin: routes.siteOrigin,
  siteName: routes.siteName,
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

/** Route path -> file to write. Root overwrites the shell itself. */
function outputPathFor(routePath) {
  if (routePath === '/') return join(DIST, 'index.html');
  return join(DIST, routePath.replace(/^\//, ''), 'index.html');
}

const written = [];

for (const [routePath, record] of Object.entries(routes.static)) {
  const meta = buildPageMeta(routePath, record, site);
  const html = injectHead(shell, meta, site, {
    h1: record.h1,
    copy: record.copy,
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
  buildPageMeta('/404', notFoundRecord, site),
  site,
  { h1: notFoundRecord.h1, copy: notFoundRecord.copy },
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
