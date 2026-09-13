/**
 * Screenshot the colophon stress sheets produced by colophon-stress.ts.
 *
 * Captures two images per poster size:
 *   <key>.png      the whole sheet, for proportion
 *   <key>-crop.png the bottom-right corner at 3x, for legibility
 *
 * It also MEASURES the colophon's real box and reports whether it stayed
 * inside the 1-inch bottom margin band — a screenshot shows you what it
 * looks like, the measurement proves it cannot overlap content.
 */
import { chromium } from 'playwright';
import { readdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const dir = process.argv[2];
const outDir = process.argv[3] ?? dir;
if (!dir) { console.error('usage: colophon-shots.mjs <htmlDir> [outDir]'); process.exit(1); }

const browser = await chromium.launch();
const page = await browser.newPage({ viewportSize: { width: 1300, height: 1000 } });
const report = [];

for (const f of readdirSync(dir).filter((x) => x.endsWith('.html'))) {
  const key = basename(f, '.html');
  await page.goto('file://' + join(dir, f));
  await page.waitForTimeout(450);

  const m = await page.evaluate(() => {
    const el = document.querySelector('.postr-attribution');
    const root = document.getElementById('poster-print-root');
    const mark = document.querySelector('.postr-attribution-mark');
    if (!el || !root) return null;
    const r = el.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const zoom = parseFloat(getComputedStyle(root).zoom || '1');
    return {
      // Convert back to poster units (1 unit = 0.1in) by dividing out the
      // harness preview zoom, so numbers are comparable across sizes.
      wUnits: r.width / zoom,
      hUnits: r.height / zoom,
      rightGapUnits: (rr.right - r.right) / zoom,
      bottomGapUnits: (rr.bottom - r.bottom) / zoom,
      // getComputedStyle returns the AUTHORED px value (zoom is applied at
      // paint, not to the computed style), so these are already in poster
      // units. getBoundingClientRect above DOES include zoom, hence the
      // division there and not here. Getting this backwards silently scales
      // every number by the preview factor.
      fontPx: parseFloat(cs.fontSize),
      markPx: mark ? parseFloat(getComputedStyle(mark).width) : null,
      text: (el.textContent || '').trim(),
    };
  });

  // Whole sheet, for proportion. fullPage so tall portrait posters are
  // captured end to end rather than cut at the fold.
  await page.screenshot({ path: join(outDir, `${key}.png`), fullPage: true });

  // Corner crop, for legibility. Scroll the colophon into view first —
  // on a portrait poster it sits well below the fold, and a viewport
  // clip computed from an off-screen rect is empty.
  const box = await page.evaluate(() => {
    const el = document.querySelector('.postr-attribution');
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'end' });
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await page.waitForTimeout(120);
  if (box) {
    const vp = page.viewportSize();
    const pad = 110;
    const x = Math.max(0, Math.min(vp.width - 10, box.x - pad * 3));
    const y = Math.max(0, Math.min(vp.height - 10, box.y - pad));
    const width = Math.max(20, Math.min(vp.width - x, box.w + pad * 4));
    const height = Math.max(20, Math.min(vp.height - y, box.h + pad * 2));
    await page.screenshot({ path: join(outDir, `${key}-crop.png`), clip: { x, y, width, height } });
  }

  // M = 10 units = 1 inch. Templates place no block below (height - M), so
  // the bottom M units are the reserved band. The colophon is inside it only
  // if its TOP edge is also below that line, i.e. bottomGap + height <= M.
  // `bottom: M` alone puts the box just ABOVE the band, in content space.
  const insideBand = m ? (m.bottomGapUnits + m.hUnits) <= 10.001 : false;
  report.push({ key, ...m, insideBand });
}

await browser.close();

const fmt = (n) => (n == null ? '   -  ' : n.toFixed(2).padStart(6));
console.log('size      fontU  ->  pt    markU   boxW   boxH   right  bottom  in-band');
for (const r of report) {
  const pt = r.fontPx == null ? null : r.fontPx * 7.2;
  console.log(
    `${r.key.padEnd(8)} ${fmt(r.fontPx)} ${fmt(pt)}  ${fmt(r.markPx)} ${fmt(r.wUnits)} ${fmt(r.hUnits)} ${fmt(r.rightGapUnits)} ${fmt(r.bottomGapUnits)}   ${r.insideBand ? 'YES' : '** NO **'}`,
  );
}
writeFileSync(join(outDir, 'measurements.json'), JSON.stringify(report, null, 2));
