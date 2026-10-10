/**
 * The print window's document (record 30, docs/fixes/30-one-print-path.md):
 * the page is the poster's size; colours print without "Background
 * graphics"; the sheet keeps the editor's base styles and is scaled to the
 * page, not laid out again at 9.6 times its size; the print dialog's steps
 * are listed once, here; the free PDF's credit line is unchanged.
 *
 * What these rules do to the printed geometry is measured in the browser
 * (scripts/print-path-check.mjs, every block and line against the editor in
 * Chromium, Firefox and WebKit; Chromium's PDF; scripts/print-dialog-check.mjs,
 * Chromium's print dialog). These tests pin the document's text.
 *
 * Re-run: npx vitest run src/export/__tests__/printDocument.test.ts
 */
import { describe, expect, it } from 'vitest';
import { buildPrintDocument, printDialogSteps } from '../printDocument';
import { attributionPrintCss, attributionPrintHtml } from '../attribution';

const W = 48;
const H = 36;
const html = buildPrintDocument({
  widthIn: W,
  heightIn: H,
  px: 10,
  fontFamily: 'Source Sans 3',
  fontHref: 'https://fonts.googleapis.com/css2?family=Source+Sans+3',
  bgColor: '#ffffff',
  title: 'Sample Poster',
  canvasHtml: '<div id="poster-canvas"><div data-block-id="b1">Text</div></div>',
  attribution: {},
});
const doc = new DOMParser().parseFromString(html, 'text/html');
const css = [...doc.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
/** The @media print block's text. */
const printCss = css.slice(css.indexOf('@media print'));
/** The declarations of the first rule whose selector list is exactly `sel`. */
function rule(sel: string): string {
  const at = css.indexOf(`${sel} {`);
  expect(at, `a rule for ${sel}`).toBeGreaterThanOrEqual(0);
  return css.slice(at + sel.length + 2, css.indexOf('}', at));
}

describe('the page', () => {
  it('is the poster’s size with no margin (unchanged)', () => {
    expect(css).toMatch(new RegExp(`@page\\s*{\\s*size:\\s*${W}in ${H}in;\\s*margin:\\s*0;`));
  });
});

describe('colours print without "Background graphics"', () => {
  it('sets print-color-adjust: exact, standard and -webkit-, on every element', () => {
    const all = rule('*');
    expect(all).toMatch(/(^|[;\s])print-color-adjust:\s*exact;/);
    expect(all).toMatch(/-webkit-print-color-adjust:\s*exact;/);
  });
});

describe('the sheet is laid out as the editor lays it out', () => {
  it('scales the print root to the page with a transform, not CSS zoom', () => {
    expect(printCss).toMatch(/#poster-print-root\s*{[^}]*transform:\s*scale\(9\.6\);[^}]*transform-origin:\s*0 0;/);
    expect(printCss).not.toMatch(/zoom:/);
  });
  it('gives the sheet the line height and font settings it inherits in the editor', () => {
    const base = rule('#poster-print-root > #poster-canvas');
    expect(base).toMatch(/line-height:\s*1\.5;/);
    expect(base).toMatch(/text-rendering:\s*optimizeLegibility;/);
    expect(base).toMatch(/tab-size:\s*4;/);
  });
  it('restates the editor stylesheet’s rules the sheet relies on, scoped to the sheet', () => {
    expect(css).toMatch(/#poster-print-root > #poster-canvas table\s*{\s*text-indent: 0; border-color: inherit; border-collapse: collapse;\s*}/);
    expect(css).toMatch(/#poster-print-root > #poster-canvas sup\s*{[^}]*line-height: 0;/);
    expect(css).toMatch(/#poster-print-root > #poster-canvas \[data-block-id\] li\s*{\s*list-style: revert; display: list-item;\s*}/);
  });
});

describe('the print dialog’s steps, listed once', () => {
  it('names Save as PDF, Margins None and the paper size if it shows one; nothing about Background graphics', () => {
    const hint = doc.querySelector('.print-toolbar-hint')!;
    const steps = [...hint.querySelectorAll('ol > li')].map((li) => li.textContent?.trim());
    expect(steps).toEqual([
      // Firefox names its PDF printer "Save to PDF" (its own strings,
      // printUI.ftl; review round 1, R1-F3; scripts/print-dialog-check.mjs LABEL).
      'Destination or printer: Save as PDF (in Firefox, Save to PDF; in Safari, the PDF menu at the bottom › Save as PDF).',
      'Margins, if it shows them: None.',
      `Paper size, if it shows one: ${W} × ${H} in.`,
      'Save.',
    ]);
    expect(hint.textContent).not.toMatch(/Background graphics/);
    expect(doc.querySelectorAll('ol').length).toBe(1);
    expect(printDialogSteps(36, 48)).toContain('36 × 48 in');
  });
});

describe('the print window’s screen view', () => {
  it('holds the toolbar and the steps in the page’s flow above the poster, not over it', () => {
    // Review round 1 (R1-F4): the header was fixed over the page and the
    // poster started a fixed 220 px down; the header grows as its lines
    // wrap, and covered the top of the poster in a window 700 px wide or
    // less (scripts/print-path-check.mjs HEADER measures it in the browser).
    expect(rule('.print-header')).toMatch(/position:\s*sticky;/);
    expect(rule('.print-header')).not.toMatch(/position:\s*fixed;/);
    expect(rule('.print-stage')).not.toMatch(/padding:\s*220px/);
  });
});

describe('the free PDF’s credit line (unchanged)', () => {
  it('is laid out in print in a layer at the page’s own scale, 96 px per inch, scaled back from the sheet’s corner', () => {
    // Review round 2 (R2-F2): laid out with the sheet at 10 px per inch and
    // scaled 9.6 times, the mark's image was drawn to a whole sheet unit:
    // 0.2 or 0.3 in, not colophonGeometry()'s 0.225 in at 48 × 36 (Chromium's
    // PDF, scripts/print-path-check.mjs CREDIT, which measures the mark;
    // this pins the document's text).
    const block = (sel: string) => {
      const at = printCss.indexOf(`${sel} {`);
      expect(at, `a print rule for ${sel}`).toBeGreaterThanOrEqual(0);
      return printCss.slice(at, printCss.indexOf('}', at));
    };
    const layer = block('.postr-attribution-page');
    expect(layer).toMatch(/width:\s*4608px;[^}]*height:\s*3456px;/);
    expect(layer).toMatch(/transform:\s*scale\(0\.1041666/);
    expect(layer).toMatch(/transform-origin:\s*0 0;/);
    expect(block('.postr-attribution')).toMatch(/font-size:\s*16\.8px;/);
    expect(block('.postr-attribution-mark')).toMatch(/width:\s*21\.6px;[^}]*height:\s*21\.6px;/);
  });

  it('is attribution.ts’s markup and stylesheet, beside the sheet', () => {
    expect(html).toContain(attributionPrintHtml({}));
    expect(css).toContain(attributionPrintCss(W, H, {}).trim());
    const root = doc.getElementById('poster-print-root')!;
    expect(root.querySelector(':scope > .postr-attribution-page > .postr-attribution')?.textContent).toBe('made with postr.sh');
  });
});
