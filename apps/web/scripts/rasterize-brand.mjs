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
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, '..');
const BRAND_DIR = join(WEB_ROOT, 'brand');
const PUBLIC_DIR = join(WEB_ROOT, 'public');

const BRAND_COLOR = '#7c6aed';
const LIGHT_PURPLE = '#b9a9ff';
const MUTED = '#6b7280';

/**
 * Canonical mark geometry — kept in sync with
 * apps/web/src/brand/markGeometry.ts (the single source for code paths).
 * This is a .mjs run directly by node/Playwright, so it can't import the
 * .ts module without a transpile step; the paths are duplicated here ON
 * PURPOSE and guarded by markGeometry.test.ts + a comment on both sides.
 * If you change the geometry, change it in BOTH places.
 *
 * True 40×40 square drawing area centred in the 64 viewBox; dot at centre.
 */
const PATH_RISE = 'M12 52 C30 52, 34 12, 52 12';
const PATH_FALL = 'M12 12 C30 12, 34 52, 52 52';
const DOT = { cx: 32, cy: 32, r: 6 };

/**
 * The mark's inner SVG (paths + dot, no wrapper). `mono` collapses both
 * curves to one colour (used for muted colophon variants); otherwise the
 * two purples render, or white when `white` is passed for a dark field.
 */
function markInner({ rise, fall, dot, sw = 5.5 }) {
  return [
    `<path d="${PATH_RISE}" stroke="${rise}" stroke-width="${sw}" stroke-linecap="round" fill="none"/>`,
    `<path d="${PATH_FALL}" stroke="${fall}" stroke-width="${sw}" stroke-linecap="round" fill="none"/>`,
    `<circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="${dot}"/>`,
  ].join('');
}

/** The white mark for the OG card / purple fields. */
const WEAVE_MARK_SVG = `
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:168px;height:168px;flex:none">
    ${markInner({ rise: '#ffffff', fall: 'rgba(255,255,255,0.7)', dot: '#ffffff' })}
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

// ── Comprehensive logo library ───────────────────────────────────────
// A generated set of the mark in every variant × format the app needs, so
// a consumer that hits an SVG-in-PDF problem can drop in the PNG instead.
// SVG + PNG per variant; PNG at a size ladder. Written to brand/library/.

const LIB_DIR = join(WEB_ROOT, 'brand', 'library');
const LIB_SIZES = [32, 64, 128, 256, 512, 1024];

/**
 * Variant → the inner mark + optional field. Each is a standalone SVG
 * builder taking a pixel size (viewBox stays 64).
 */
const VARIANTS = {
  // Mark only, no field — the default for overlaying anywhere.
  transparent: () => markInner({ rise: BRAND_COLOR, fall: LIGHT_PURPLE, dot: BRAND_COLOR }),
  // White rounded tile, brand mark + thin purple border.
  'white-bg': () =>
    `<rect x="2" y="2" width="60" height="60" rx="15" fill="#ffffff" stroke="${BRAND_COLOR}" stroke-width="3"/>` +
    markInner({ rise: BRAND_COLOR, fall: LIGHT_PURPLE, dot: BRAND_COLOR }),
  // Purple rounded tile, white mark (the app-icon look).
  'purple-bg': () =>
    `<rect width="64" height="64" rx="15" fill="${BRAND_COLOR}"/>` +
    markInner({ rise: '#ffffff', fall: 'rgba(255,255,255,0.7)', dot: '#ffffff' }),
  // Single dark ink — light docs / greyscale print.
  'mono-dark': () => markInner({ rise: '#1c1b1a', fall: '#1c1b1a', dot: '#1c1b1a' }),
  // Single white ink — dark backgrounds.
  'mono-light': () => markInner({ rise: '#ffffff', fall: '#ffffff', dot: '#ffffff' }),
  // Muted grey — the acknowledgement / colophon treatment.
  muted: () => markInner({ rise: MUTED, fall: MUTED, dot: MUTED }),
};

function variantSvg(name) {
  return `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Postr">${VARIANTS[name]()}</svg>`;
}

/** Lockup: mark + "Postr" wordmark, for headers / cards / colophons. */
function lockupSvg(variant) {
  const onDark = variant === 'purple-bg' || variant === 'mono-light';
  const ink = onDark ? '#ffffff' : BRAND_COLOR;
  const bg =
    variant === 'purple-bg'
      ? `<rect width="260" height="72" rx="14" fill="${BRAND_COLOR}"/>`
      : variant === 'white-bg'
        ? `<rect x="1" y="1" width="258" height="70" rx="14" fill="#ffffff" stroke="${BRAND_COLOR}" stroke-width="2"/>`
        : '';
  const markColor = onDark
    ? { rise: '#ffffff', fall: 'rgba(255,255,255,0.7)', dot: '#ffffff' }
    : { rise: BRAND_COLOR, fall: LIGHT_PURPLE, dot: BRAND_COLOR };
  return [
    `<svg width="260" height="72" viewBox="0 0 260 72" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Postr">`,
    bg,
    `<g transform="translate(12 4) scale(1)">`,
    `<svg x="0" y="0" width="64" height="64" viewBox="0 0 64 64">${markInner(markColor)}</svg>`,
    `</g>`,
    `<text x="88" y="48" font-family="-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="40" font-weight="700" letter-spacing="-1" fill="${ink}">Postr</text>`,
    `</svg>`,
  ].join('');
}

/** Renders an arbitrary SVG string to a PNG at an exact size. */
async function svgToPng(browser, svg, size, transparent = true) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  try {
    await page.setContent(iconPage(svg, size), { waitUntil: 'load' });
    return await page.screenshot({ type: 'png', omitBackground: transparent });
  } finally {
    await page.close();
  }
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
      `[rasterize-brand] wrote ${results.length} icon/card files: ${results
        .map((r) => `${r.out} (${r.bytes}B)`)
        .join(', ')}`,
    );

    // ── Comprehensive library → brand/library/ ──
    mkdirSync(LIB_DIR, { recursive: true });
    const manifest = { generated: 'run scripts/rasterize-brand.mjs to refresh', variants: {}, lockups: {} };
    let libCount = 0;

    for (const name of Object.keys(VARIANTS)) {
      const svg = variantSvg(name);
      const svgName = `postr-mark--${name}.svg`;
      writeFileSync(join(LIB_DIR, svgName), svg);
      const pngs = [];
      // white-bg / purple-bg carry their own field → not transparent.
      const opaque = name === 'white-bg' || name === 'purple-bg';
      for (const size of LIB_SIZES) {
        const png = await svgToPng(browser, svg, size, !opaque);
        const pngName = `postr-mark--${name}@${size}.png`;
        writeFileSync(join(LIB_DIR, pngName), png);
        pngs.push(pngName);
        libCount++;
      }
      manifest.variants[name] = { svg: svgName, png: pngs };
      libCount++;
    }

    for (const name of ['transparent', 'white-bg', 'purple-bg']) {
      const svg = lockupSvg(name);
      const svgName = `postr-lockup--${name}.svg`;
      writeFileSync(join(LIB_DIR, svgName), svg);
      // Lockup PNGs at 2× the 260×72 art (crisp for headers/cards).
      const opaque = name === 'white-bg' || name === 'purple-bg';
      const page = await browser.newPage({ viewport: { width: 520, height: 144 }, deviceScaleFactor: 1 });
      await page.setContent(
        `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:520px;height:144px}</style></head><body>${svg}</body></html>`,
        { waitUntil: 'load' },
      );
      const png = await page.screenshot({ type: 'png', omitBackground: !opaque });
      await page.close();
      const pngName = `postr-lockup--${name}@2x.png`;
      writeFileSync(join(LIB_DIR, pngName), png);
      manifest.lockups[name] = { svg: svgName, png: pngName };
      libCount += 2;
    }

    writeFileSync(join(LIB_DIR, 'index.json'), JSON.stringify(manifest, null, 2));
    writeFileSync(join(LIB_DIR, 'README.md'), libraryReadme(manifest));
    console.log(`[rasterize-brand] wrote ${libCount} library files + manifest to brand/library/`);
  } finally {
    await browser.close();
  }
}

/** Human index for the library folder. */
function libraryReadme(manifest) {
  const lines = [
    '# Postr logo library',
    '',
    'Generated by `apps/web/scripts/rasterize-brand.mjs` — do not hand-edit.',
    'Geometry source of truth: `apps/web/src/brand/markGeometry.ts`.',
    '',
    'Use **SVG** wherever it renders; fall back to **PNG** when SVG breaks a',
    'pipeline (some PDF engines). Pick the variant by background:',
    '',
    '| Variant | Use on |',
    '| --- | --- |',
    '| `transparent` | overlaying on any surface (default) |',
    '| `white-bg` | light UI, documents |',
    '| `purple-bg` | app icon, dark hero, marketing |',
    '| `mono-dark` | greyscale / single-colour light print |',
    '| `mono-light` | dark backgrounds |',
    '| `muted` | acknowledgement / colophon (never coloured) |',
    '',
    `Sizes (PNG): ${LIB_SIZES.join(', ')} px. Lockups (mark + wordmark): transparent / white-bg / purple-bg at 2×.`,
    '',
    'See `index.json` for the machine-readable file map.',
  ];
  return lines.join('\n');
}

main().catch((error) => {
  console.error('[rasterize-brand] failed:', error);
  process.exitCode = 1;
});
