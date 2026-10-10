/**
 * The free PDF's credit mark in Chromium's PDF, for scripts/print-path-check.mjs
 * (record 30's review round 2, R2-F2: under the print's scale the 128 × 128
 * PNG mark printed 0.2 in on every size and 0.2 × 0.3 in on four of
 * thirteen, where colophonGeometry() asks 0.21 to 0.26 in and main printed
 * within 0.01 in of it).
 *
 * The colophon is print-only, so there is no editor drawing to compare it
 * with: its reference is colophonGeometry(), read from the app's own module.
 * The mark must be square and that size, and its bottom edge where the
 * geometry puts the colophon's, each within CREDIT_TOL.
 *
 * `colophonSweep` takes the print document from the editor on the server
 * under test, as a user makes it (Export › "⎙ Save PDF", window.open
 * stubbed to keep what it writes, as scripts/print-dialog-check.mjs does),
 * with an empty sheet (the colophon does not depend on the sheet), at the
 * eight preset sizes and five custom ones, and reads each PDF Chromium
 * makes of it (page.pdf, the CSS page size, backgrounds off). Under
 * POSTR_SERVE=preview that is the production build's document. Review round
 * 3 (R3-F1): the sweep built its documents by importing /src/export/
 * printDocument.ts from `docBase`, the dev server on PORT + 1 under
 * preview, so on the build it measured the source, not the build: the
 * credit layer broken in dist only, the sweep still read 13 of 13 marks
 * right while the posters' own prints read CREDIT 3. Only the reference,
 * colophonGeometry(), still comes from `docBase` (the build serves no
 * modules).
 */

/** A print pixel and a half (96 per inch): a mark snapped by a whole print pixel still passes. */
export const CREDIT_TOL = 0.015;

/** The eight presets (constants.ts POSTER_SIZES) and five custom sizes. */
export const COLOPHON_SIZES = [
  [48, 36], [36, 48], [42, 36], [36, 42], [42, 42], [24, 36], [46.8, 33.1], [33.1, 46.8],
  [33.3, 23.4], [100, 10], [10, 100], [100, 100], [60.5, 30.3],
];

/**
 * A PDF's first page: the rectangles its images are painted in, and its
 * text items, in inches from the page's top-left (pdf.js).
 */
export async function pdfImagesAndText(bytes, { pdfjs }) {
  const pj = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, isEvalSupported: false }).promise;
  const pg = await pj.getPage(1);
  const [, , pw, ph] = pg.view;
  const ops = await pg.getOperatorList();
  const O = pdfjs.OPS;
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const r3 = (v) => Math.round(v * 1000) / 1000;
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const images = [];
  ops.fnArray.forEach((fn, i) => {
    const a = ops.argsArray[i];
    if (fn === O.save) stack.push(ctm);
    else if (fn === O.restore) ctm = stack.pop() ?? ctm;
    else if (fn === O.transform) ctm = mul(ctm, a);
    else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject || fn === O.paintImageMaskXObject) {
      const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      images.push([Math.min(...xs) / 72, (ph - Math.max(...ys)) / 72, (Math.max(...xs) - Math.min(...xs)) / 72, (Math.max(...ys) - Math.min(...ys)) / 72].map(r3));
    }
  });
  const tc = await pg.getTextContent();
  const items = tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({ s: it.str, x: r3(it.transform[4] / 72), y: r3((ph - it.transform[5]) / 72) }));
  await pj.destroy();
  return { pageIn: [r3(pw / 72), r3(ph / 72)], images, items };
}

/**
 * The credit mark in a PDF of a `w` × `h` in poster against `geo` (the
 * colophonGeometry() of that size, in poster units, and `px` units per
 * inch): the lowest, rightmost image under an inch. Returns the reading and
 * what is wrong with it (empty when it is right).
 */
export function creditMark(pdf, { w, h, geo, px }) {
  const want = geo.markUnits / px;
  const wantBottom = h - geo.bottomUnits / px;
  const small = pdf.images.filter((r) => r[2] < 1 && r[3] < 1 && r[1] > h - 2 && r[0] > w / 2);
  const mark = small.sort((a, b) => (b[1] + b[3]) - (a[1] + a[3]) || b[0] - a[0])[0] ?? null;
  const credit = pdf.items.find((it) => /postr/.test(it.s)) ?? null;
  const wrong = [];
  if (!mark) wrong.push('no mark');
  else {
    const r3 = (v) => Math.round(v * 1000) / 1000;
    if (Math.abs(mark[2] - mark[3]) > CREDIT_TOL) wrong.push(`not square: ${mark[2]} × ${mark[3]} in`);
    if (Math.abs(mark[2] - want) > CREDIT_TOL || Math.abs(mark[3] - want) > CREDIT_TOL) wrong.push(`${mark[2]} × ${mark[3]} in, the geometry's ${r3(want)} in`);
    if (Math.abs(mark[1] + mark[3] - wantBottom) > CREDIT_TOL) wrong.push(`its bottom at ${r3(mark[1] + mark[3])} in, the geometry's ${r3(wantBottom)} in`);
  }
  return { mark, want: Math.round(want * 1000) / 1000, credit: credit ? { x: credit.x, baselineUp: Math.round((h - credit.y) * 1000) / 1000 } : null, wrong };
}

/**
 * The print document "⎙ Save PDF" writes in the editor at each of `sizes`
 * (an empty sheet), on `h.base`, the server under test, made into a PDF by
 * Chromium; the credit mark read in each against colophonGeometry() (from
 * `h.docBase`). `openEditor` is lib/editorHarness.mjs's. Network requests
 * other than data: URLs are aborted (the poster font's stylesheet); the
 * document's own print call is left out. With `outDir` (and node's `fs`)
 * each PDF is kept there. Each row carries the editor page's errors.
 */
export async function colophonSweep({ h, openEditor, sizes = COLOPHON_SIZES, pdfjs, outDir = null, fs = null }) {
  const geo = await geometryOf(h.browser, h.docBase, sizes);
  const docs = [];
  for (const [w, ht] of sizes) {
    const ed = await openEditor(h, { viewport: { width: 1440, height: 900 }, poster: { w, h: ht }, editDoc: (doc) => ({ ...doc, blocks: [] }) });
    try {
      await ed.page.evaluate(() => {
        window.__zqPrint = null;
        window.open = () => {
          let s = '';
          return { document: { open() {}, write(x) { s += x; }, close() { window.__zqPrint = s; } }, focus() {}, print() {}, close() {}, addEventListener() {} };
        };
      });
      await ed.page.locator('button[data-postr-tab]', { hasText: /^export$/i }).click();
      await ed.page.getByRole('button', { name: '⎙ Save PDF' }).click();
      const html = await ed.page.waitForFunction(() => window.__zqPrint, null, { timeout: 15000 }).then((x) => x.jsonValue());
      docs.push({ w, h: ht, html, errors: [...ed.state.errors], ...geo[`${w}×${ht}`] });
    } finally {
      await ed.context.close().catch(() => {});
    }
  }
  const ctx = await h.browser.newContext();
  const rows = [];
  try {
    await ctx.route('**/*', (route) => (route.request().url().startsWith('data:') ? route.continue() : route.abort()));
    for (const d of docs) {
      const page = await ctx.newPage();
      try {
        await page.setContent(d.html.replace('window.print();', '/* not printed here */'), { waitUntil: 'load' });
        await page.emulateMedia({ media: 'print' });
        const bytes = await page.pdf({ preferCSSPageSize: true, printBackground: false });
        if (outDir && fs) fs.writeFileSync(`${outDir}/colophon-${d.w}x${d.h}.pdf`, bytes);
        const pdf = await pdfImagesAndText(bytes, { pdfjs });
        rows.push({ size: `${d.w}×${d.h}`, pageIn: pdf.pageIn, errors: d.errors, ...creditMark(pdf, { w: d.w, h: d.h, geo: d.geo, px: d.px }) });
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await ctx.close().catch(() => {});
  }
  return rows;
}

/** colophonGeometry() and PX for `w` × `h`, read from the app's own modules on `docBase`. */
export async function geometryOf(browser, docBase, sizes) {
  const prep = await (await browser.newContext()).newPage();
  try {
    await prep.goto(`${docBase}/version.json`);
    return await prep.evaluate(async (list) => {
      const cg = await import('/src/export/colophonGeometry.ts');
      const c = await import('/src/poster/constants.ts');
      return Object.fromEntries(list.map(([w, h]) => [`${w}×${h}`, { geo: cg.colophonGeometry(w, h), px: c.PX }]));
    }, sizes);
  } finally {
    await prep.context().close().catch(() => {});
  }
}
