/**
 * Render every HTML file in ./generated/ to a 36×24" PDF in ./pdf/
 * via Chrome's `--print-to-pdf` headless flag — zero npm deps.
 *
 * The CSS `@page { size: 36in 24in }` rule in each HTML file drives
 * the page geometry, so the PDF preserves the poster's full
 * dimensions including a real text layer (so `pdfjs.getTextContent()`
 * works) plus inline-SVG figures rasterized into the PDF.
 *
 * Run:  tsx scripts/poster-benchmark/renderPdf.ts
 */

import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_DIR = join(__dirname, 'generated');
const PDF_DIR = join(__dirname, 'pdf');
mkdirSync(PDF_DIR, { recursive: true });

const CHROME =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(CHROME)) {
  // eslint-disable-next-line no-console
  console.error(`Chrome not found at ${CHROME}. Install Chrome or update the path.`);
  process.exit(1);
}

const htmlFiles = readdirSync(HTML_DIR).filter((f) => f.endsWith('.html'));
if (htmlFiles.length === 0) {
  // eslint-disable-next-line no-console
  console.error('No HTML files in', HTML_DIR, '— run generate.ts first.');
  process.exit(1);
}

for (const file of htmlFiles) {
  const url = pathToFileURL(join(HTML_DIR, file)).toString();
  const out = join(PDF_DIR, file.replace(/\.html$/, '.pdf'));
  // --no-pdf-header-footer keeps Chrome from injecting URL/page-num
  // chrome that would show up as text the importer would extract.
  // --virtual-time-budget waits for SVG rendering to settle (Chrome
  // returns immediately otherwise and SVG charts come out blank).
  execSync(
    `"${CHROME}" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=4000 --print-to-pdf="${out}" "${url}"`,
    { stdio: 'pipe' },
  );
  // eslint-disable-next-line no-console
  console.log(`  ✓ ${file.replace('.html', '.pdf')}`);
}
// eslint-disable-next-line no-console
console.log(`\nRendered ${htmlFiles.length} PDFs to ${PDF_DIR}`);
