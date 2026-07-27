/**
 * Writes dist/sitemap-static.xml from the same routes.json the app uses.
 *
 * Only indexable routes are listed. A noindexed URL in a sitemap is a
 * Search Console error, not a neutral extra.
 *
 * <changefreq> and <priority> are deliberately omitted — Google has
 * ignored both for years. <lastmod> is omitted too: a lastmod that is
 * not genuinely tied to content changes is worse than none, because
 * Google demotes the signal site-wide once it catches a site stamping
 * build time on unchanged pages.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFor, escapeText, INDEXABLE } from './lib/headTags.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, '..');

const routes = JSON.parse(
  readFileSync(join(WEB_ROOT, 'src/seo/routes.json'), 'utf8'),
);

const urls = Object.entries(routes.static)
  .filter(([, record]) => record.robots === INDEXABLE)
  .map(([path]) => canonicalFor(path, routes.siteOrigin));

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((loc) => `  <url><loc>${escapeText(loc)}</loc></url>`).join('\n')}
</urlset>
`;

const outPath = join(WEB_ROOT, 'dist/sitemap-static.xml');
writeFileSync(outPath, xml, 'utf8');
console.log(`[gen-sitemap] wrote ${urls.length} URLs to dist/sitemap-static.xml`);
