/**
 * Render every HTML file in ./generated/ to a 36×24" PDF in ./pdf/
 * via Playwright. Two-step pipeline so the importer's
 * figure-extraction path actually fires:
 *
 *   1. Load the HTML.
 *   2. For every <svg> element, screenshot it into a PNG, then
 *      replace the <svg> with an <img src="data:image/png;...">.
 *      Chrome's print-to-PDF embeds <img> tags as paintImageXObject
 *      ops, which is what `pdfjs.getOperatorList()` needs to find
 *      figure regions. Inline SVG, by contrast, is exported as
 *      vector paths and the importer's pixel pipeline can't see it.
 *   3. Print the rasterized DOM to a 36×24" PDF.
 *
 * Run:  tsx scripts/poster-benchmark/renderPdf.ts
 */

import { mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_DIR = join(__dirname, 'generated');
const PDF_DIR = join(__dirname, 'pdf');
mkdirSync(PDF_DIR, { recursive: true });

const htmlFiles = readdirSync(HTML_DIR).filter((f) => f.endsWith('.html'));
if (htmlFiles.length === 0) {
  // eslint-disable-next-line no-console
  console.error('No HTML files in', HTML_DIR, '— run generate.ts first.');
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 2592, height: 1728 }, // 36×24" @ 72dpi
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  for (const file of htmlFiles) {
    const url = pathToFileURL(join(HTML_DIR, file)).toString();
    const out = join(PDF_DIR, file.replace(/\.html$/, '.pdf'));
    await page.goto(url, { waitUntil: 'networkidle' });

    // Rasterize every <svg> into a PNG via Playwright's
    // elementHandle.screenshot(), then swap the SVG element for an
    // <img> with the resulting data URL. Done sequentially so the
    // DOM mutations don't disturb each other.
    const svgHandles = await page.locator('svg').elementHandles();
    for (const handle of svgHandles) {
      const buf = await handle.screenshot({ omitBackground: false });
      const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
      // Swap in-place so layout / aspect ratio carry over from the
      // original SVG's bounding box.
      await page.evaluate(
        (args) => {
          const target = args.target;
          const img = document.createElement('img');
          img.src = args.dataUrl;
          // Preserve the SVG's computed dimensions so the page
          // layout doesn't reflow.
          const r = (target as Element).getBoundingClientRect();
          img.style.width = `${r.width}px`;
          img.style.height = `${r.height}px`;
          (target as Element).replaceWith(img);
        },
        { target: handle, dataUrl },
      );
      await handle.dispose();
    }

    // Force a layout pass + give the data-URL <img>s a tick to load
    // before printing.
    await page.waitForTimeout(300);

    await page.pdf({
      path: out,
      width: '36in',
      height: '24in',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    // eslint-disable-next-line no-console
    console.log(`  ✓ ${file.replace('.html', '.pdf')}  (${svgHandles.length} svgs rasterized)`);
  }
  await browser.close();
  // eslint-disable-next-line no-console
  console.log(`\nRendered ${htmlFiles.length} PDFs to ${PDF_DIR}`);
})();
