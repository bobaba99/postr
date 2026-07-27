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
  `[prerender] wrote ${written.length} routes: ${written
    .map((w) => w.routePath)
    .join(', ')}`,
);
