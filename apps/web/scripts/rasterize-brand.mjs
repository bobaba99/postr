/**
 * Rasterizes the brand SVGs in `brand/` into the PNG set in `public/`.
 *
 * Manual dev script, run by hand — deliberately NOT part of
 * `npm run build`. The PNGs are committed as small build inputs, so the
 * build must never depend on a headless browser being installed.
 * Re-run only when the brand marks change:
 *
 *   node scripts/rasterize-brand.mjs
 *
 * Outputs (all into public/):
 *   favicon-16.png, favicon-32.png   — browser-tab icons, from
 *                                      brand/icon-rounded.svg
 *   icon-192.png, icon-512.png       — PWA icons, from icon-rounded.svg
 *   apple-touch-icon.png (180×180)   — from brand/icon-square.svg, whose
 *                                      mark already sits at ~62% of the
 *                                      canvas: iOS rounds the corners
 *                                      itself, so the icon ships
 *                                      full-bleed and opaque
 *   og-card.png (1200×630)           — the site-wide social card that
 *                                      routes.json defaultOgImage points at
 *
 * Rendering happens in Playwright's Chromium (already in the workspace
 * devDependency tree for e2e tests): each asset is a tiny HTML page
 * screenshotted at an exact viewport size, so the browser rasterizes the
 * vectors at the true target resolution instead of downscaling a bitmap.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, '..');
const BRAND_DIR = join(WEB_ROOT, 'brand');
const PUBLIC_DIR = join(WEB_ROOT, 'public');

const BRAND_COLOR = '#7c6aed';

/**
 * The bare weave mark for the OG card — the same geometry as
 * public/favicon.svg minus the tile, using the display-size values
 * (stroke 5, trailing curve at 0.55) rather than the small-size tweaks
 * baked into brand/icon-rounded.svg, because the card renders the mark
 * at 168px where the display values are canonical.
 */
const WEAVE_MARK_SVG = `
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:168px;height:168px;flex:none">
    <path d="M14 14 C32 14, 32 50, 50 50" stroke="white" stroke-width="5" stroke-linecap="round" opacity="0.95"/>
    <path d="M14 50 C32 50, 32 14, 50 14" stroke="white" stroke-width="5" stroke-linecap="round" opacity="0.55"/>
    <circle cx="32" cy="32" r="5" fill="white"/>
  </svg>`;

/** Wraps an icon SVG so it fills the viewport exactly, on a transparent page. */
function iconPage(svg, size) {
  return `<!doctype html>
<html><head><style>
  html, body { margin: 0; padding: 0; background: transparent; }
  svg { display: block; width: ${size}px; height: ${size}px; }
</style></head><body>${svg}</body></html>`;
}

/**
 * The 1200×630 social card: weave mark + wordmark + tagline, centered
 * on a flat brand-color field. Restrained on purpose — at thumbnail
 * size the card must read as one bold lockup, not a layout.
 */
function ogCardPage() {
  return `<!doctype html>
<html><head><style>
  html, body { margin: 0; padding: 0; }
  .card {
    width: 1200px;
    height: 630px;
    background: ${BRAND_COLOR};
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  }
  .lockup { display: flex; align-items: center; gap: 40px; }
  .word {
    font-size: 150px;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1;
    color: #ffffff;
  }
  .tag {
    margin-top: 48px;
    font-size: 41px;
    font-weight: 500;
    letter-spacing: 0.01em;
    color: rgba(255, 255, 255, 0.92);
  }
</style></head>
<body>
  <div class="card">
    <div class="lockup">
      ${WEAVE_MARK_SVG}
      <div class="word">Postr</div>
    </div>
    <div class="tag">Free conference poster maker for researchers</div>
  </div>
</body></html>`;
}

/** Renders one HTML page at an exact viewport size and writes the PNG. */
async function renderPng(browser, { html, width, height, out, transparent }) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  try {
    await page.setContent(html, { waitUntil: 'load' });
    const png = await page.screenshot({
      type: 'png',
      omitBackground: Boolean(transparent),
    });
    writeFileSync(join(PUBLIC_DIR, out), png);
    return { out, bytes: png.byteLength };
  } finally {
    await page.close();
  }
}

async function main() {
  const roundedSvg = readFileSync(join(BRAND_DIR, 'icon-rounded.svg'), 'utf8');
  const squareSvg = readFileSync(join(BRAND_DIR, 'icon-square.svg'), 'utf8');

  const targets = [
    // Rounded tile with transparent corners, per brand/icon-rounded.svg.
    { html: iconPage(roundedSvg, 16), width: 16, height: 16, out: 'favicon-16.png', transparent: true },
    { html: iconPage(roundedSvg, 32), width: 32, height: 32, out: 'favicon-32.png', transparent: true },
    { html: iconPage(roundedSvg, 192), width: 192, height: 192, out: 'icon-192.png', transparent: true },
    { html: iconPage(roundedSvg, 512), width: 512, height: 512, out: 'icon-512.png', transparent: true },
    // Full-bleed and opaque: iOS applies its own corner mask, and a
    // transparent apple-touch-icon gets a black plate behind it.
    { html: iconPage(squareSvg, 180), width: 180, height: 180, out: 'apple-touch-icon.png', transparent: false },
    { html: ogCardPage(), width: 1200, height: 630, out: 'og-card.png', transparent: false },
  ];

  const browser = await chromium.launch();
  try {
    const results = [];
    for (const target of targets) {
      results.push(await renderPng(browser, target));
    }
    console.log(
      `[rasterize-brand] wrote ${results.length} files: ${results
        .map((r) => `${r.out} (${r.bytes}B)`)
        .join(', ')}`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('[rasterize-brand] failed:', error);
  process.exitCode = 1;
});
