#!/usr/bin/env node
/**
 * chart-print-size-check.mjs — the printed size of the text in Postr's OWN
 * inserted charts (Insert › Chart and the Figure tab's Make a figure), and
 * whether their caption, axis titles, tick labels and legend are clipped, in
 * the real editor and in the document "⎙ Save PDF" writes (plan item 13
 * part 2, sub-item F and the clipping found in passing; record
 * docs/fixes/13c-chart-text-minimums.md). Written by item 13 part 2's
 * reproducer; the confirmer's partition (more series, longer names,
 * narrower and wider blocks, the print document) folded in by the fix;
 * its review round 1's partition (tables a user pastes: lib/
 * chartPasteTables.mjs), its paste entry, a selected chart's print and the
 * print document laid out in print media folded in by the corrector.
 *
 * WHY: renderChart.ts painted a legend by growing the svg's height and set a
 * viewBox; the block kept its height, so the svg was scaled down to fit and
 * every text with it. The chart was drawn at the block's stored size while
 * the frame's border leaves a smaller box. A caption under the chart took
 * height from the same fixed block, so it (and the "Sample data, not real
 * results." prefix in it) fell past the frame, which clips.
 *
 * ENTRY POINTS
 *   U (scenario ui): the user's. Figure tab › Make a figure › "I don't have
 *     data yet" › a shape › the first answer of each later step › "Insert
 *     selected figures" (every panel selected). The inserted blocks are
 *     measured. Control K-U: each U chart equals its sweep twin.
 *   S: a saved poster holding chart blocks, opened in the editor. Two chart
 *     sets: the chooser's 21 figures, built by the app's own modules
 *     (sampleDatasets → inferTable → recommendFigures → buildChartSpec →
 *     captionFor, the PreviewStep's pipeline, sample captions), and the
 *     confirmer's 4 (2 series; 6 long-named series; 8 lines; a one-series
 *     bar with no legend). Scenarios:
 *       sweep      every chart at the user's sizes (USER_SIZES: 6 × 4.5 to
 *                  20 × 15 in), caption at the bottom (the insert's) and none
 *       positions  caption top, left and right at 6 × 4.5, 10 × 7, 20 × 15
 *       note       a footnote under the chart (8 × 6 right, 10 × 7 bottom)
 *       legend-off the legend charts with their legend switched off
 *       fonts      the poster font set to Charter, a curated font macOS has
 *                  installed (real metrics, a serif), at 6 × 4.5 and 10 × 7
 *       outside    4 × 3 and 5 × 7 in, below the user's range: INFO only
 *       quick      7 × 5 none, 10 × 7 bottom, 6 × 4.5 left (for falsifying)
 *       preview    10 × 7, caption at the bottom, printed from Export ›
 *                  Preview poster (the editor hidden behind the overlay)
 *       draws      10 × 7, caption at the bottom: the editor reloaded with a
 *                  MutationObserver installed before the app's scripts, which
 *                  counts each chart's svg as it is put on the sheet
 *       selected   10 × 7, caption at the bottom, the first chart selected
 *                  before "⎙ Save PDF" (CHROME)
 *     The review's partition (fix 13c review round 1): 19 charts built from
 *     8 pasted tables through the paste path's own modules (parseDelimited →
 *     inferTable → recommend at each emphasis → buildChartSpec →
 *     captionFor): long mixed-case and upper-case categories, ten long-named
 *     series, values in the millions, long column names, Likert statements,
 *     paired labels. Scenarios:
 *       paste           8 sizes, the range's corners and middles (6 × 4.5,
 *                       6 × 15, 20 × 4.5, 20 × 15, 9 × 6.5, 13 × 11,
 *                       7.5 × 10, 16 × 6), caption at the bottom and none
 *       paste-sides     6 × 4.5, 20 × 4.5, 6 × 15 caption right and top;
 *                       6.5 × 5, 7 × 5, 8 × 6, 10 × 7 none, bottom, right
 *       paste-longcap   a three-sentence caption: 6 × 4.5 bottom and left,
 *                       20 × 4.5 right
 *       paste-legend-off, paste-fonts (Charter), paste-outside (INFO)
 *   U-paste (scenario ui-paste): the user's paste entry, Insert › + Chart ›
 *     "Paste your table" › Use this table › the ladder's first answers ›
 *     Insert selected figures, six of the tables, measured in the editor
 *     and in "⎙ Save PDF" (the just-inserted chart is selected).
 *     Every S editor also presses "⎙ Save PDF" (window.open stubbed,
 *     window.print never runs) and measures the same charts in the HTML it
 *     writes, laid out in print media (its @media print rules: the sheet
 *     zoomed to the page); --no-print skips that.
 *
 * MEASURE (lib/chartMeasure.mjs): each visible <text>'s printed pt and role,
 *   whether it is clipped, and the caption's state, in poster inches.
 *
 * CLAIMS (gated over the user's sizes; the outside scenario is INFO)
 *   BELOW  a chart text prints under the canonical minimum for figure text:
 *          tick labels, legend text and line-end labels 14 pt, axis titles
 *          18 pt (the lead's decision 1; the harness's own copy of the
 *          numbers, control K-min).
 *   CLIP   a caption not shown whole (past what is shown, or cut inside its
 *          own box), its sample-data prefix not shown, or a tick label,
 *          axis title, legend or line-end label clipped.
 *   PRINT  the print document differs from the editor: a role's smallest pt
 *          smaller by more than 0.01 or larger by more than 0.5 % (in print
 *          media the zoomed sheet draws a 1-unit border 0.9375 units wide,
 *          so a chart's box is up to 0.3 % larger), or a text or caption
 *          clipped in one only.
 *   COLLIDE an axis title over a tick label, a legend label or a line-end
 *          label, a legend label over a tick label, or tick labels on one
 *          axis whose glyphs meet (OVERLAP-INKED, below).
 *   CHROME the print document carries resize handles, the selection's
 *          controls or a selected frame's accent border.
 *   REDRAW (scenario draws) a chart drawn more than once while the editor
 *          opens: ChartBlock waits for its laid-out box instead of drawing
 *          first at the block's stored size and again at the box.
 *   INFO   SHRUNK: text under the chart's design size (18 pt, 24 pt axis
 *          titles), i.e. the chart scaled its text; GROWN: a chart drawn
 *          taller than its block (its text at the minimums did not fit the
 *          block's height, and the block grew); the reproducer's CLIP line
 *          (caption shown, x ticks, x title); OVERLAP: tick labels on one
 *          axis whose font boxes overlap, and OVERLAP-INKED x, fx, y: those
 *          whose glyphs meet (a line of each on one row, or stacked with
 *          baselines closer than 0.72 em), gated in COLLIDE; INSERT-COVER
 *          (scenario ui): the blocks a UI-inserted chart's drawn frame
 *          covers, and those it covers only because it is drawn taller than
 *          its stored block (Insert places by the stored size); [by set]:
 *          the claims for the chooser and confirmer sets and for the pasted
 *          tables apart.
 *
 * CONTROLS (exit 2 if one fails)
 *   K-geom  tick pt by the CTM equals tick pt by layout boxes (Plot's base
 *           font × the viewBox's meet scale in its host × 0.72 pt per render
 *           px at 100 render px per inch) within 0.05, every chart-size, in
 *           the editor and in print.
 *   K-frame every block frame is as wide as its stored width (0.02 in): the
 *           sheet's px per inch; in the editor and in print.
 *   K-U     each UI-inserted chart equals its saved-poster twin (0.05 pt).
 *   K-count every chart placed in an editor is measured, in both documents.
 *   K-min   when the tree has src/poster/figureTextMinimums.ts, its tick,
 *           legend and axis-title minimums equal this harness's.
 *
 * BLIND SPOTS: the poster's web font is not loaded (the fake backend aborts
 *   Google Fonts), so text widths are the fallback font's, in the editor and
 *   in print alike (the chart measures its text in the font the page has,
 *   so a web font that loads after the chart is drawn is not covered); the
 *   browser's PDF rasteriser is not measured (the review read Chromium's
 *   PDF with PyMuPDF and found the DOM's sizes; its glyph check is not
 *   folded in); in WebKit the print document is read in screen media (its
 *   DOM reads 9.6 times small under the print zoom; K-geom print).
 *   Only the sheet's own blocks are measured:
 *   the thumbnail capture's momentary copy of the sheet is not (in Firefox
 *   it was read once as a UI chart "at 10.43 pt" and failed K-U). In
 *   WebKit a thumbnail upload's page error (fake backend storage) is counted
 *   as INFO webkit-storage, not as an error.
 *
 * RUN (from apps/web): node scripts/chart-print-size-check.mjs
 *   [--only sweep,positions,note,legend-off,fonts,outside,quick,preview,draws,selected,ui,
 *           paste,paste-sides,paste-longcap,paste-legend-off,paste-fonts,paste-outside,ui-paste] [--no-print]
 *   env PORT (default 5393), OUT_DIR, POSTR_BROWSER, POSTR_MUTANT.
 * EXIT 0 no claim observed · 1 a claim observed, controls held · 2 a control
 *   failed or an error.
 * Side effect: vite.config.ts rewrites public/version.json; put back here.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { measureChartsIn, measurePrint, SAMPLE_PREFIX } from './lib/chartMeasure.mjs';
import { PASTE_TABLES, LONG_CAPTION_TAIL } from './lib/chartPasteTables.mjs';

const log = (...a) => process.stderr.write(`${a.join(' ')}\n`);
process.exitCode = 2;
const args = process.argv.slice(2);
const onlyAt = args.indexOf('--only');
const ONLY = onlyAt >= 0 ? new Set(args[onlyAt + 1].split(',')) : null;
const PRINT = !args.includes('--no-print');
const PORT = Number(process.env.PORT ?? 5393);
const OUT = path.resolve(process.env.OUT_DIR ?? path.join(os.tmpdir(), 'postr-chart-print-size-check'));
process.env.OUT_DIR = OUT;
fs.mkdirSync(OUT, { recursive: true });
const { WEB, startHarness, openEditor } = await import('./lib/editorHarness.mjs');

const CLIP_TOL_IN = 0.01;
/** How much larger print may draw a chart's text than the editor (the zoom's border rounding). */
const PRINT_UP = 0.005;
const USER_SIZES = [[6, 4.5], [7, 5], [8, 6], [10, 7], [12, 5], [12, 9], [14, 10], [16, 10], [20, 15]];
const OUTSIDE_SIZES = [[4, 3], [5, 7]];
/** The canonical minimums (decision 1), the harness's own copy. */
const MIN = { tick: 14, legend: 14, direct: 14, axisTitle: 18 };
/** The chart's design sizes: what it draws when nothing scales it. */
const DESIGN = { tick: 18, legend: 18, direct: 18, axisTitle: 24 };
const SHAPES = ['A number compared across groups', 'A measure tracked over time', 'The relationship between two measures',
  'Parts of a whole', 'Ratings on an agreement scale', 'Before-and-after values', 'The spread of one measure'];
const NOTE = 'Note. Values are group means; error bars omitted for clarity.';

// The confirmer's four charts (chart-print-confirm.mjs), with captions.
const cat = (names) => names.map((n) => ({ name: n, kind: 'category' }));
const opts = (o = {}) => ({ legend: true, sort: 'none', horizontal: false, directLabel: 'none', ...o });
const grouped = (series) => ({
  version: 1, form: 'bar-grouped',
  data: { columns: [...cat(['week', 'arm']), { name: 'score', kind: 'number' }],
    rows: ['Week 1', 'Week 4', 'Week 8', 'Week 12'].flatMap((g, i) => series.map((s, j) => [g, s, 10 + i * 3 + j * 2])) },
  encoding: { x: 'week', y: 'score', series: 'arm' }, options: opts(), paletteSlots: ['accent', 'primary', 'secondary'],
  xLabel: 'Visit', yLabel: 'Score',
});
const CONFIRM = [
  { sample: 'confirm', form: 'grouped-2', spec: grouped(['Control', 'Treated']) },
  { sample: 'confirm', form: 'grouped-6-long', spec: grouped(['Placebo arm', 'Low dose arm', 'Medium dose arm', 'High dose arm', 'Active comparator', 'Open-label extension']) },
  { sample: 'confirm', form: 'line-8', spec: {
    version: 1, form: 'line',
    data: { columns: [{ name: 'day', kind: 'number' }, ...cat(['site']), { name: 'count', kind: 'number' }],
      rows: Array.from({ length: 8 }, (_, s) => Array.from({ length: 10 }, (_, d) => [d, `Site ${String.fromCharCode(65 + s)}`, 5 + d * (s + 1)])).flat() },
    encoding: { x: 'day', y: 'count', series: 'site' }, options: opts(), paletteSlots: ['accent', 'primary', 'secondary'],
    xLabel: 'Day', yLabel: 'Count' } },
  { sample: 'confirm', form: 'bar-1', spec: {
    version: 1, form: 'bar',
    data: { columns: [...cat(['group']), { name: 'value', kind: 'number' }], rows: [['A', 3], ['B', 5], ['C', 4], ['D', 6]] },
    encoding: { x: 'group', y: 'value' }, options: opts({ legend: false }), paletteSlots: ['accent'], xLabel: 'Group', yLabel: 'Value' } },
].map((c) => ({ ...c, caption: `${SAMPLE_PREFIX} Mean score by group (made-up values, ${c.form}).` }));

const want = (s) => !ONLY || ONLY.has(s);
/** The review's sizes (fix 13c review round 1): the range's corners and middles. */
const PASTE_SIZES = [[6, 4.5], [6, 15], [20, 4.5], [20, 15], [9, 6.5], [13, 11], [7.5, 10], [16, 6]];
function variants() {
  const v = [];
  const add = (scenario, [w, h], caption, extra = {}) => v.push({ scenario, w, h, caption, set: 'base', ...extra });
  const paste = (scenario, size, caption, extra = {}) => add(scenario, size, caption, { set: 'paste', ...extra });
  if (want('sweep')) for (const s of USER_SIZES) for (const c of ['bottom', 'none']) add('sweep', s, c);
  if (want('positions')) for (const s of [[6, 4.5], [10, 7], [20, 15]]) for (const c of ['top', 'left', 'right']) add('positions', s, c);
  if (want('note')) { add('note', [8, 6], 'right', { note: true }); add('note', [10, 7], 'bottom', { note: true }); }
  if (want('legend-off')) { add('legend-off', [6, 4.5], 'bottom', { legendOff: true }); add('legend-off', [10, 7], 'none', { legendOff: true }); }
  if (want('fonts')) { add('fonts', [6, 4.5], 'none', { font: 'Charter' }); add('fonts', [10, 7], 'bottom', { font: 'Charter' }); }
  if (want('outside')) for (const s of OUTSIDE_SIZES) for (const c of ['bottom', 'none']) add('outside', s, c, { info: true });
  if (want('quick')) { add('quick', [7, 5], 'none'); add('quick', [10, 7], 'bottom'); add('quick', [6, 4.5], 'left'); }
  if (want('preview')) add('preview', [10, 7], 'bottom', { preview: true });
  if (want('draws')) add('draws', [10, 7], 'bottom', { draws: true });
  if (want('selected')) add('selected', [10, 7], 'bottom', { select: true });
  // The review's partition: pasted tables at the range's corners and
  // middles, captions at the side and long, legends off, Charter.
  if (want('paste')) for (const s of PASTE_SIZES) for (const c of ['bottom', 'none']) paste('paste', s, c);
  if (want('paste-sides')) {
    for (const s of [[6, 4.5], [20, 4.5], [6, 15]]) for (const c of ['right', 'top']) paste('paste-sides', s, c);
    for (const s of [[6.5, 5], [7, 5], [8, 6], [10, 7]]) for (const c of ['none', 'bottom', 'right']) paste('paste-sides', s, c);
  }
  if (want('paste-longcap')) {
    paste('paste-longcap', [6, 4.5], 'bottom', { longCaption: true });
    paste('paste-longcap', [6, 4.5], 'left', { longCaption: true });
    paste('paste-longcap', [20, 4.5], 'right', { longCaption: true });
  }
  if (want('paste-legend-off')) paste('paste-legend-off', [6, 4.5], 'bottom', { legendOff: true });
  if (want('paste-fonts')) { paste('paste-fonts', [6, 4.5], 'bottom', { font: 'Charter' }); paste('paste-fonts', [20, 4.5], 'none', { font: 'Charter' }); }
  if (want('paste-outside')) for (const s of OUTSIDE_SIZES) paste('paste-outside', s, 'none', { info: true });
  return v;
}

/**
 * A poster tall and wide enough to hold every chart inside the sheet,
 * captions grown: a long side caption beside a 6 in chart runs about 25 in
 * tall, and a block past the sheet's bottom edge prints differently (in
 * print media Chromium lays its border out 1.458 units wide, not 0.9375:
 * the review's Q-R7, measured with scratch probe r7), so it gets the room.
 */
function layout(n, w, h, { longCaption = false } = {}) {
  const cols = Math.min(5, n);
  const rows = Math.ceil(n / cols);
  const pitchX = w + 1;
  const pitchY = h + (longCaption ? 30 : 7);
  return { cols, poster: { w: Math.ceil(4 + cols * pitchX), h: Math.ceil(10 + rows * pitchY) }, at: (i) => ({ x: (2 + (i % cols) * pitchX) * 10, y: (6 + Math.floor(i / cols) * pitchY) * 10 }) };
}

async function waitCharts(page, n) {
  await page.waitForFunction((k) => document.querySelectorAll('#poster-canvas [data-block-id] svg[viewBox]').length >= k, n, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
}

const measureIn = (page, root, posterW) =>
  page.evaluate(`(${measureChartsIn.toString()})(${JSON.stringify(root)}, ${posterW}, ${JSON.stringify(SAMPLE_PREFIX)}, ${CLIP_TOL_IN}, ${PREFIX_TOL_IN})`);

// Read before Vite starts: loading vite.config.ts rewrites the file.
const stampFile = path.join(WEB, 'public/version.json');
const stamp = fs.readFileSync(stampFile);
const h = await startHarness({ name: 'chart-print-size-check', port: PORT });
// WebKit reads the print document's DOM about 9.6 times small under the
// print media's CSS zoom (its CTM and its boxes disagree: control K-geom
// print, 1706 of 1706 in a trial run; the review saw the same), so there
// the document is measured in screen media.
const PRINT_MEDIA = h.engine !== 'webkit';
// WebKit rounds a caption word's Range rects to whole CSS px in the
// sheet's units (one unit, 0.1 in): the prefix check allows that there.
const PREFIX_TOL_IN = h.engine === 'webkit' ? 0.1 : CLIP_TOL_IN;
const results = { git: h.git, engine: h.engine, mutant: h.mutant, sweep: [], ui: [], uiPaste: [], chrome: [], minimumsModule: null, errors: [], ignoredErrors: [] };
const controlFails = [];
try {
  const ctx0 = await h.browser.newContext();
  const p0 = await ctx0.newPage();
  await p0.goto(`${h.base}/version.json`);
  const specs = await p0.evaluate(async () => {
    const sd = await import('/src/charts/sampleData.ts');
    const ic = await import('/src/charts/inferColumns.ts');
    const rc = await import('/src/charts/recommend.ts');
    const bs = await import('/src/charts/buildSpec.ts');
    return sd.sampleDatasets().flatMap((ds) => {
      const table = ic.inferTable(ds.table);
      return rc.recommendFigures(table).recommendations.flatMap((rec) => {
        const spec = bs.buildChartSpec(table, rec);
        return spec ? [{ sample: ds.key, form: rec.form, spec, caption: bs.captionFor(table, rec, { sample: true }) }] : [];
      });
    });
  });
  // The review's pasted tables, through the paste path's own modules
  // (parseDelimited → inferTable → recommend at each emphasis →
  // buildChartSpec → captionFor), every distinct form once.
  const pasted = await p0.evaluate(async (tables) => {
    const pd = await import('/src/charts/parseData.ts');
    const ic = await import('/src/charts/inferColumns.ts');
    const rc = await import('/src/charts/recommend.ts');
    const bs = await import('/src/charts/buildSpec.ts');
    const out = [];
    for (const [key, text] of Object.entries(tables)) {
      const parsed = pd.parseDelimited(text);
      if (!parsed.ok) continue;
      const table = ic.inferTable(parsed.table);
      const seen = new Set();
      for (const emphasis of [null, 'difference', 'trend', 'spread', 'relationship', 'share']) {
        for (const rec of rc.recommend(table, emphasis ? { emphasis } : {})) {
          const id = `${rec.form}${rec.horizontal ? '-h' : ''}`;
          if (seen.has(id)) continue;
          seen.add(id);
          const spec = bs.buildChartSpec(table, rec);
          if (spec) out.push({ sample: `paste:${key}`, form: id, spec, caption: bs.captionFor(table, rec, { sample: true }) });
        }
      }
    }
    return out;
  }, PASTE_TABLES);
  // K-min: the tree's shared minimums, when it has the module.
  results.minimumsModule = await p0.evaluate(async () => {
    try {
      const m = await import('/src/poster/figureTextMinimums.ts');
      return { tick: m.FIGURE_TEXT_MIN_PT.axisText, legend: m.FIGURE_TEXT_MIN_PT.legendText, axisTitle: m.FIGURE_TEXT_MIN_PT.axisTitle };
    } catch { return null; }
  });
  await ctx0.close();
  if (results.minimumsModule) {
    for (const k of ['tick', 'legend', 'axisTitle']) if (results.minimumsModule[k] !== MIN[k]) controlFails.push(`K-min ${k}: module ${results.minimumsModule[k]}, harness ${MIN[k]}`);
  }
  const charts = [...specs, ...CONFIRM];
  log(`[harness] ${specs.length} chooser figures from ${new Set(specs.map((s) => s.sample)).size} samples, ${CONFIRM.length} of the confirmer's and ${pasted.length} pasted (${Object.keys(PASTE_TABLES).length} tables, the review's); minimums module ${results.minimumsModule ? JSON.stringify(results.minimumsModule) : 'absent'}`);

  for (const v of variants()) {
    const pool = v.set === 'paste' ? pasted : charts;
    const set = v.legendOff ? pool.filter((c) => c.spec.options.legend) : pool;
    const L = layout(set.length, v.w, v.h, { longCaption: !!v.longCaption });
    const blocksFor = (doc) => {
      const keep = doc.blocks.filter((b) => !['text', 'heading', 'title', 'authors', 'references'].includes(b.type));
      const chartBlocks = set.map((c, i) => ({
        id: `zqchart${i}`, type: 'chart', ...L.at(i), w: v.w * 10, h: v.h * 10, content: '', imageSrc: null, imageFit: 'contain', tableData: null,
        chartSpec: v.legendOff ? { ...c.spec, options: { ...c.spec.options, legend: false } } : c.spec,
        caption: v.longCaption ? c.caption + LONG_CAPTION_TAIL : c.caption, captionPosition: v.caption, ...(v.note ? { note: NOTE } : {}),
      }));
      return { ...doc, ...(v.font ? { fontFamily: v.font } : {}), blocks: [...keep, ...chartBlocks] };
    };
    let ed;
    try {
      ed = await openEditor(h, { viewport: { width: 1440, height: 900 }, poster: L.poster, editDoc: blocksFor });
      if (v.draws) {
        // Count each chart's svg as it lands, from before the app's first script.
        await ed.page.addInitScript(() => {
          window.__zqDraws = {};
          new MutationObserver((records) => {
            for (const r of records) {
              for (const n of r.addedNodes) {
                if (n.nodeName.toLowerCase() !== 'svg' || !n.getAttribute('viewBox')) continue;
                const id = n.closest('[data-block-type="chart"]')?.getAttribute('data-block-id');
                if (id) window.__zqDraws[id] = (window.__zqDraws[id] ?? 0) + 1;
              }
            }
          }).observe(document, { childList: true, subtree: true });
        });
        await ed.page.reload();
        await ed.page.waitForSelector('#poster-canvas [data-block-id]', { timeout: 90000 });
      }
      await waitCharts(ed.page, set.length);
      if (v.draws) await ed.page.waitForTimeout(1500);
      if (v.select) {
        // Select the first chart, as a user does before Export (the click on
        // the Export tab does not deselect it); its frame's border widens
        // and its handles are drawn. The chart redraws for its new box.
        const fr = await ed.page.locator('#poster-canvas [data-block-id="zqchart0"]').boundingBox();
        await ed.page.mouse.click(fr.x + fr.width * 0.5, fr.y + Math.min(30, fr.height * 0.2));
        await ed.page.waitForTimeout(1200);
        results.selectedInEditor = await ed.page.evaluate(() => document.querySelectorAll('#poster-canvas [data-postr-selected="true"]').length);
      }
      const draws = v.draws ? await ed.page.evaluate(() => window.__zqDraws) : null;
      const m = await measureIn(ed.page, '#poster-canvas', L.poster.w);
      const printed = PRINT || v.preview ? await measurePrint(ed.page, ed.context, L.poster.w, CLIP_TOL_IN, { viaPreview: !!v.preview, printMedia: PRINT_MEDIA, prefixTolIn: PREFIX_TOL_IN }) : null;
      const pr = printed ? printed.charts : null;
      if (printed) results.chrome.push({ scenario: v.scenario, w: v.w, h: v.h, caption: v.caption, ...printed.chrome });
      const found = m.filter((c) => /^zqchart\d+$/.test(c.id));
      if (found.length !== set.length) controlFails.push(`K-count ${v.scenario} ${v.w}x${v.h} ${v.caption}: ${found.length} of ${set.length} charts measured in the editor`);
      if (pr && pr.filter((c) => /^zqchart\d+$/.test(c.id)).length !== set.length) controlFails.push(`K-count ${v.scenario} ${v.w}x${v.h} ${v.caption}: print has ${pr.length} charts of ${set.length}`);
      for (const c of found) {
        const i = Number(c.id.replace('zqchart', ''));
        const p = pr ? pr.find((x) => x.id === c.id) ?? null : null;
        results.sweep.push({ ...v, sample: set[i].sample, form: set[i].form, legend: !v.legendOff && set[i].spec.options.legend, spec: set[i].spec, editor: c, print: p, ...(draws ? { draws: draws[c.id] ?? 0 } : {}) });
      }
      for (const e of ed.state.errors) {
        // WebKit, the fake backend: a thumbnail upload to storage fails as a
        // page error ("Fetch API cannot load …/storage/v1/… due to access
        // control checks"), seen only in the draws scenario, which reloads
        // the editor (3 of 4 runs that drew each chart twice, 0 of 7 that did
        // not; why is UNVERIFIED: an upload cut off by the reload is the
        // likeliest). Not the charts' doing: counted, not an error.
        if (h.engine === 'webkit' && /Fetch API cannot load .*\/storage\/v1\/.*access control checks/.test(e)) results.ignoredErrors.push(`${v.scenario} ${v.w}x${v.h}: ${e.slice(0, 160)}`);
        else results.errors.push(`${v.scenario} ${v.w}x${v.h}: ${e}`);
      }
      log(`[S] ${v.scenario} ${v.w} × ${v.h} in, caption ${v.caption}${v.longCaption ? ' (long)' : ''}${v.note ? ' + note' : ''}${v.legendOff ? ', legend off' : ''}${v.font ? `, font ${v.font}` : ''}: ${found.length} charts${pr ? ' (+ print)' : ''}`);
    } catch (e) {
      results.errors.push(`${v.scenario} ${v.w}x${v.h} ${v.caption}: ${String(e).slice(0, 200)}`);
      log(`[S] ${v.scenario} ${v.w}x${v.h} ${v.caption}: ERROR ${String(e).slice(0, 200)}`);
    } finally {
      await ed?.context.close().catch(() => {});
    }
  }

  if (want('ui')) {
    for (const shape of SHAPES) {
      const ed = await openEditor(h, { viewport: { width: 1440, height: 900 }, poster: { w: 48, h: 36 } });
      try {
        const pg = ed.page;
        await pg.locator('button[data-postr-tab]', { hasText: /^figure$/ }).click();
        await pg.getByRole('button', { name: 'Make a figure' }).click();
        await pg.getByRole('button', { name: 'I don’t have data yet' }).click();
        await pg.getByRole('button', { name: shape, exact: true }).click();
        for (let k = 0; k < 6; k += 1) {
          if (await pg.getByRole('button', { name: /^Insert selected figures/ }).count()) break;
          const groups = pg.locator('[role="group"]');
          let clicked = false;
          for (let g = (await groups.count()) - 1; g >= 0 && !clicked; g -= 1) {
            const btn = groups.nth(g).locator('button[aria-pressed="false"]').first();
            if (await btn.count()) { await btn.click(); clicked = true; }
          }
          if (!clicked) break;
          await pg.waitForTimeout(300);
        }
        await pg.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find((b) => /^Insert selected figures/.test(b.textContent.trim()));
          let box = btn;
          while (box && !box.querySelector('label input[type="checkbox"]')) box = box.parentElement;
          for (const cb of box ? box.querySelectorAll('label input[type="checkbox"]') : []) if (!cb.checked) cb.click();
        });
        await pg.waitForTimeout(300);
        const before = await pg.locator('#poster-canvas [data-block-id] svg[viewBox]').count();
        await pg.getByRole('button', { name: /^Insert selected figures/ }).click();
        await pg.waitForFunction((k) => document.querySelectorAll('#poster-canvas [data-block-id] svg[viewBox]').length > k, before, { timeout: 30000 });
        await pg.waitForTimeout(800);
        const m = await measureIn(pg, '#poster-canvas', 48);
        const t0 = Date.now();
        while (Date.now() - t0 < 15000 && !(ed.state.row?.data?.blocks ?? []).some((x) => x.type === 'chart')) await pg.waitForTimeout(250);
        const docBlocks = ed.state.row?.data?.blocks ?? [];
        // INFO INSERT-COVER: the other blocks an inserted chart's frame covers
        // as drawn (caption included), and those it covers only because the
        // drawn frame is taller than the stored block (Insert places a chart
        // by its stored size).
        const frames = await pg.evaluate(() => {
          const sheet = document.querySelector('#poster-canvas');
          const k = sheet.getBoundingClientRect().width / 480;
          const s0 = sheet.getBoundingClientRect();
          return [...sheet.querySelectorAll('[data-block-id]')].map((el) => {
            const r = el.getBoundingClientRect();
            return { id: el.dataset.blockId, x: (r.left - s0.left) / k, y: (r.top - s0.top) / k, w: r.width / k, h: r.height / k };
          });
        });
        const meets = (a, o) => Math.min(a.x + a.w, o.x + o.w) - Math.max(a.x, o.x) > 0.5 && Math.min(a.y + a.h, o.y + o.h) - Math.max(a.y, o.y) > 0.5;
        for (const c of m) {
          const b = docBlocks.find((x) => x.id === c.id);
          if (!b || b.type !== 'chart') continue;
          const drawn = frames.find((f) => f.id === c.id);
          const others = frames.filter((f) => f.id !== c.id);
          const covers = drawn ? others.filter((o) => meets(drawn, o)).map((o) => o.id) : [];
          const byStored = others.filter((o) => meets({ x: b.x, y: b.y, w: b.w, h: b.h }, o)).map((o) => o.id);
          const cover = { drawnH: drawn ? Math.round(drawn.h * 10) / 10 : null, storedH: b.h, covers: covers.length, onlyAsDrawn: covers.filter((id) => !byStored.includes(id)).length };
          results.ui.push({ shape, id: c.id, form: b.chartSpec?.form ?? null, spec: b.chartSpec ?? null, w: b.w / 10, h: b.h / 10, caption: b.captionPosition ?? null, cover, editor: c });
        }
        log(`[U] ${shape}: ${m.length} chart(s) inserted and measured`);
      } catch (e) {
        results.errors.push(`ui ${shape}: ${String(e).slice(0, 200)}`);
        log(`[U] ${shape}: ERROR ${String(e).slice(0, 200)}`);
      } finally {
        await ed.context.close();
      }
    }
  }
  if (want('ui-paste')) {
    // The user's paste entry: Insert › + Chart › "Paste your table" › Use
    // this table › the ladder's first answers › Insert selected figures, at
    // the default size; measured in the editor and in "⎙ Save PDF" (the
    // review's uprobe, folded in).
    for (const key of ['longcats', 'upperseries', 'millions', 'manyseries', 'likert', 'paired']) {
      const ed = await openEditor(h, { viewport: { width: 1600, height: 1000 }, poster: { w: 48, h: 36 } });
      try {
        const pg = ed.page;
        await pg.locator('button[data-postr-tab]', { hasText: /^insert$/ }).click();
        await pg.getByRole('button', { name: /\+ Chart/ }).click();
        await pg.getByRole('textbox', { name: 'Paste your table' }).fill(PASTE_TABLES[key]);
        await pg.getByRole('button', { name: 'Use this table' }).click();
        for (let k = 0; k < 8; k += 1) {
          await pg.waitForTimeout(350);
          if (await pg.getByRole('button', { name: /^Insert selected figures/ }).count()) break;
          if (await pg.getByRole('button', { name: 'Use these' }).count()) {
            const chips = pg.locator('[role="group"][aria-label="Pick up to two columns to compare across"] button');
            if (await chips.count()) { await chips.first().click(); await pg.getByRole('button', { name: 'Use these' }).click(); } else await pg.getByRole('button', { name: 'Don’t split' }).click();
            continue;
          }
          const groups = pg.locator('[role="group"]');
          let clicked = false;
          for (let g = (await groups.count()) - 1; g >= 0 && !clicked; g -= 1) {
            const btn = groups.nth(g).locator('button[aria-pressed="false"]').first();
            if (await btn.count()) { await btn.click(); clicked = true; }
          }
          if (!clicked) break;
        }
        const before = await pg.locator('#poster-canvas [data-block-type="chart"]').count();
        await pg.getByRole('button', { name: /^Insert selected figures/ }).click();
        await pg.waitForFunction((n) => document.querySelectorAll('#poster-canvas [data-block-type="chart"] svg[viewBox]').length > n, before, { timeout: 30000 });
        await pg.waitForTimeout(1500);
        const t0 = Date.now();
        while (Date.now() - t0 < 15000 && !(ed.state.row?.data?.blocks ?? []).some((x) => x.type === 'chart')) await pg.waitForTimeout(250);
        const docBlocks = ed.state.row?.data?.blocks ?? [];
        const m = await measureIn(pg, '#poster-canvas', 48);
        const printed = PRINT ? await measurePrint(pg, ed.context, 48, CLIP_TOL_IN, { printMedia: PRINT_MEDIA, prefixTolIn: PREFIX_TOL_IN }) : null;
        if (printed) results.chrome.push({ scenario: 'ui-paste', key, ...printed.chrome });
        for (const c of m) {
          const b = docBlocks.find((x) => x.id === c.id);
          if (!b || b.type !== 'chart') continue;
          const p = printed ? printed.charts.find((x) => x.id === c.id) ?? null : null;
          results.sweep.push({ scenario: 'ui-paste', set: 'paste', w: b.w / 10, h: b.h / 10, caption: b.captionPosition ?? 'top', sample: `paste:${key}`, form: b.chartSpec?.form ?? '?', legend: !!b.chartSpec?.options?.legend, spec: b.chartSpec, editor: c, print: p });
        }
        for (const e of ed.state.errors) results.errors.push(`ui-paste ${key}: ${e}`);
        log(`[U] paste ${key}: ${m.filter((c) => docBlocks.some((b) => b.id === c.id && b.type === 'chart')).length} chart(s) inserted and measured${printed ? ' (+ print)' : ''}`);
      } catch (e) {
        results.errors.push(`ui-paste ${key}: ${String(e).slice(0, 200)}`);
        log(`[U] paste ${key}: ERROR ${String(e).slice(0, 200)}`);
      } finally {
        await ed.context.close();
      }
    }
  }
} finally {
  await h.stop();
  fs.writeFileSync(stampFile, stamp);
}

// ---------------------------------------------------------------- score
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const minOf = (texts, role) => {
  const v = texts.filter((t) => t.role === role).map((t) => t.pt);
  return v.length ? Math.min(...v) : null;
};
const ROLES = ['tick', 'axisTitle', 'legend', 'direct'];
const byRole = (texts) => Object.fromEntries(ROLES.map((k) => [k, r2(minOf(texts, k))]));
const byRoleRaw = (texts) => Object.fromEntries(ROLES.map((k) => [k, minOf(texts, k)]));
/**
 * The roles under a minimum. BELOW reads the unrounded sizes, to a
 * thousandth of a point (above the CTM's float noise), so a chart scaled
 * by a fraction of a render px (a box a hair short of the chart) shows;
 * SHRUNK reads the rounded ones.
 */
const BELOW_TOL_PT = 1e-3;
const lows = (m, mins, tol = 1e-6) => Object.entries(mins).filter(([k, x]) => m[k] != null && m[k] < x - tol).map(([k]) => k);
function clipsOf(c) {
  const out = c.texts.filter((t) => t.clipped && t.role !== 'other').map((t) => `${t.role} "${t.text}" (${Object.entries(t.over ?? {}).map(([k, v]) => `${k} ${v} in`).join(', ')})`);
  if (c.caption && !c.caption.shown) out.push('caption past what is shown');
  if (c.caption?.cutInside) out.push('caption cut inside its box');
  if (c.caption && c.caption.prefixShown === false) out.push('sample-data prefix hidden');
  return out;
}

for (const s of results.sweep) {
  // K-geom: by layout boxes. Render px per inch: 10 per poster unit × 10 units.
  const [, , vw, vh] = s.editor.viewBox.split(' ').map(Number);
  const k = Math.min((s.editor.hostIn.w * 100) / vw, (s.editor.hostIn.h * 100) / vh);
  const byBoxes = s.editor.basePx * k * 0.72;
  const t = minOf(s.editor.texts, 'tick');
  if (t != null && Math.abs(t - byBoxes) > 0.05) controlFails.push(`K-geom ${s.sample}/${s.form} @${s.w}x${s.h} ${s.caption}: tick ${r2(t)} pt by CTM, ${r2(byBoxes)} by boxes`);
  if (Math.abs(s.editor.frameIn.w - s.w) > 0.02) controlFails.push(`K-frame editor ${s.sample}/${s.form} @${s.w}x${s.h}: frame ${s.editor.frameIn.w} in, stored ${s.w}`);
  if (s.print) {
    // K-geom in print: the same check in the print document.
    const [, , pvw, pvh] = s.print.viewBox.split(' ').map(Number);
    const pk = Math.min((s.print.hostIn.w * 100) / pvw, (s.print.hostIn.h * 100) / pvh);
    const pt = minOf(s.print.texts, 'tick');
    if (pt != null && Math.abs(pt - s.print.basePx * pk * 0.72) > 0.05) controlFails.push(`K-geom print ${s.sample}/${s.form} @${s.w}x${s.h} ${s.caption}: tick ${r2(pt)} pt by CTM, ${r2(s.print.basePx * pk * 0.72)} by boxes`);
  }
  if (s.print && Math.abs(s.print.frameIn.w - s.w) > 0.02) controlFails.push(`K-frame print ${s.sample}/${s.form} @${s.w}x${s.h}: frame ${s.print.frameIn.w} in, stored ${s.w}`);
  s.min = byRole(s.editor.texts);
  s.below = lows(byRoleRaw(s.editor.texts), MIN, BELOW_TOL_PT);
  s.shrunk = lows(s.min, DESIGN);
  s.clips = clipsOf(s.editor);
  // Tick labels whose glyphs meet are a collision: the layout wraps
  // category labels to their room and holds their lines in their bands
  // (review Q-R4: wrapped y labels ran into each other), and spaces a
  // continuous axis's ticks by their labels' width.
  const inked = (c) => ['x', 'fx', 'y'].filter((a) => c?.tickOverlapsInked?.[a]).map((a) => `${a} tick labels over each other (${c.tickOverlapsInked[a]} pairs)`);
  s.collisions = [...s.editor.collisions, ...inked(s.editor), ...(s.print?.collisions ?? []).map((c) => `print ${c}`), ...inked(s.print).map((c) => `print ${c}`)];
  // The chart drawn taller than its block: its text at the minimums did not
  // fit the block's height, and the block grew rather than the text shrink.
  // The chart's own box is the block's height with a caption (the body is
  // pinned) and that less the frame's border without one.
  s.grownIn = r2(s.editor.hostIn.h - (s.caption === 'none' && !s.note ? s.h - 0.2 : s.h));
  if (s.print) {
    const pm = byRole(s.print.texts);
    // Compared unrounded: two values rounded to 0.01 can differ by a step.
    // Print smaller than the editor by more than 0.01 pt is a difference;
    // larger by up to PRINT_UP: in print media the sheet is zoomed 9.6
    // times and Chromium draws a 1-unit frame border 9 device px wide
    // (0.9375 units), so the chart's box, and its text, come out up to
    // 0.3 % larger (a 43-unit box 43.125).
    const raw = (texts, k2) => minOf(texts, k2);
    const diff = Object.keys(pm).filter((k2) => {
      const [a, b] = [raw(s.editor.texts, k2), raw(s.print.texts, k2)];
      return (a == null) !== (b == null) || (a != null && (b < a - 0.01 || b > a * (1 + PRINT_UP)));
    });
    const pc = clipsOf(s.print);
    // Which texts are clipped, not by how much (that differs by the zoom's rounding).
    const who = (list) => list.map((x) => x.replace(/ \([^()]*\)$/, '')).join('|');
    s.printDiff = [...diff.map((k2) => `${k2} editor ${s.min[k2]} print ${pm[k2]}`), ...(who(pc) !== who(s.clips) ? [`clips editor [${s.clips.join(', ')}] print [${pc.join(', ')}]`] : [])];
    s.printBelow = lows(byRoleRaw(s.print.texts), MIN, BELOW_TOL_PT);
    s.printClips = pc;
  }
}
const sameSpec = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let kuCompared = 0;
for (const u of results.ui.filter((x) => x.spec)) {
  const twin = results.sweep.find((s) => s.scenario === 'sweep' && s.w === u.w && s.h === u.h && s.caption === u.caption && sameSpec(s.spec, u.spec));
  if (!twin) { u.twin = 'none'; continue; }
  kuCompared += 1;
  const a = byRole(u.editor.texts);
  for (const k of Object.keys(a)) if ((a[k] ?? -1) !== (twin.min[k] ?? -1) && Math.abs((a[k] ?? 0) - (twin.min[k] ?? 0)) > 0.05) controlFails.push(`K-U ${u.shape} ${u.form} ${k}: UI ${a[k]} pt vs saved-poster ${twin.min[k]} pt`);
}

const gated = results.sweep.filter((s) => !s.info);
const info = results.sweep.filter((s) => s.info);
const label = (s) => `${s.sample}/${s.form}${s.legend ? ' (legend)' : ''} @${s.w}x${s.h} caption ${s.caption}${s.note ? '+note' : ''}${s.font ? ` ${s.font}` : ''}`;
const lines = [];
for (const s of results.sweep) {
  lines.push(`${s.info ? 'INFO ' : ''}${label(s)} [host ${s.editor.hostIn.w} × ${s.editor.hostIn.h} in, frame ${s.editor.frameIn.w} × ${s.editor.frameIn.h}, viewBox ${s.editor.viewBox}]: tick ${s.min.tick} · axis title ${s.min.axisTitle} · legend ${s.min.legend} · direct ${s.min.direct}`
    + `${s.below.length ? `  BELOW ${s.below.join(',')}` : ''}${s.clips.length ? `  CLIP ${s.clips.join('; ')}` : ''}${s.collisions.length ? `  COLLIDE ${s.collisions.join('; ')}` : ''}${s.printDiff?.length ? `  PRINT ${s.printDiff.join('; ')}` : ''}`);
}
for (const l of lines) log(l);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));

const n = gated.length;
const below = gated.filter((s) => s.below.length || s.printBelow?.length);
const clip = gated.filter((s) => s.clips.length || s.printClips?.length);
const printed = gated.filter((s) => s.print);
const collide = gated.filter((s) => s.collisions.length);
const printDiff = printed.filter((s) => s.printDiff.length);
const shrunk = gated.filter((s) => s.shrunk.length);
const capRows = gated.filter((s) => s.caption !== 'none');
const overlap = gated.filter((s) => s.editor.tickOverlaps > 0);
const minAll = (role) => r2(Math.min(...gated.map((s) => s.min[role]).filter((x) => x != null)));
log(`[control K-geom] ${controlFails.some((f) => f.startsWith('K-geom')) ? 'FAIL' : 'OK'}: ${results.sweep.length} chart-sizes, tick size by CTM against layout boxes, editor${PRINT ? ` and print (${PRINT_MEDIA ? 'print' : 'screen'} media)` : ''}`);
log(`[control K-frame] ${controlFails.some((f) => f.startsWith('K-frame')) ? 'FAIL' : 'OK'}: ${results.sweep.length} block frames at their stored width, editor${PRINT ? ' and print' : ''}`);
log(`[control K-U] ${controlFails.some((f) => f.startsWith('K-U')) ? 'FAIL' : 'OK'}: ${kuCompared} of ${results.ui.filter((x) => x.spec).length} UI-inserted charts compared with their saved-poster twin`);
log(`[control K-count] ${controlFails.some((f) => f.startsWith('K-count')) ? 'FAIL' : 'OK'}: every placed chart measured`);
log(`[control K-min] ${controlFails.some((f) => f.startsWith('K-min')) ? 'FAIL' : 'OK'}: ${results.minimumsModule ? `figureTextMinimums.ts ${JSON.stringify(results.minimumsModule)}` : 'no figureTextMinimums.ts in this tree'}`);
if (controlFails.length) log(`[controls] ${controlFails.slice(0, 8).join(' | ')}`);
if (results.errors.length) log(`[errors] ${results.errors.slice(0, 6).join(' | ')}`);
if (results.ignoredErrors.length) log(`[INFO webkit-storage] ${results.ignoredErrors.length} thumbnail-upload page errors (WebKit, the fake backend's storage), not counted as errors`);
const rawAll = (role) => Math.min(...gated.flatMap((s) => [minOf(s.editor.texts, role), s.print ? minOf(s.print.texts, role) : null]).filter((x) => x != null)).toFixed(4);
log(`[INFO SHRUNK] text under the chart's design size (18 pt, axis titles 24): ${shrunk.length} of ${n} chart-sizes; smallest tick ${minAll('tick')}, legend ${minAll('legend')}, axis title ${minAll('axisTitle')}, direct ${minAll('direct')}; unrounded, editor and print: tick ${rawAll('tick')}, legend ${rawAll('legend')}, axis title ${rawAll('axisTitle')}`);
log(`[INFO CLIP-repro] caption at the bottom (the insert's): caption shown in ${capRows.filter((s) => s.caption === 'bottom' && s.editor.caption?.shown).length} of ${capRows.filter((s) => s.caption === 'bottom').length}; x-axis title or tick labels clipped in ${gated.filter((s) => s.editor.texts.some((t) => t.clipped && (t.role === 'tick' || t.role === 'axisTitle'))).length} of ${n}`);
log(`[INFO OVERLAP] tick labels written over each other: ${overlap.length} of ${n} chart-sizes (${overlap.reduce((a, s) => a + s.editor.tickOverlaps, 0)} pairs)${overlap.length ? `: ${overlap.slice(0, 4).map((s) => `${label(s)} ${s.editor.tickOverlaps}`).join(' | ')}` : ''}`);
for (const axis of ['x', 'fx', 'y']) {
  const inked = gated.filter((s) => (s.editor.tickOverlapsInked?.[axis] ?? 0) > 0);
  log(`[INFO OVERLAP-INKED ${axis}] ${axis} tick labels whose glyphs meet: ${inked.length} of ${n} chart-sizes (${inked.reduce((a, s) => a + s.editor.tickOverlapsInked[axis], 0)} pairs)${inked.length ? `: ${inked.slice(0, 4).map((s) => `${label(s)} ${s.editor.tickOverlapsInked[axis]}`).join(' | ')}` : ''}`);
}
const uiCover = results.ui.filter((u) => u.cover);
log(`[INFO INSERT-COVER] UI-inserted charts covering another block as drawn: ${uiCover.filter((u) => u.cover.covers).length} of ${uiCover.length}; covering one only because the drawn frame (caption included) is taller than the stored block: ${uiCover.filter((u) => u.cover.onlyAsDrawn).length} of ${uiCover.length}${uiCover.length ? ` (drawn ${[...new Set(uiCover.map((u) => u.cover.drawnH))].join('/')} units tall, stored ${[...new Set(uiCover.map((u) => u.cover.storedH))].join('/')})` : ''}`);
log(`[INFO outside] ${info.length} chart-sizes at ${OUTSIDE_SIZES.map((x) => x.join('x')).join(', ')} in: below the minimum ${info.filter((s) => s.below.length).length}, clipped ${info.filter((s) => s.clips.length).length}, shrunk ${info.filter((s) => s.shrunk.length).length}; smallest tick ${r2(Math.min(...info.map((s) => s.min.tick).filter((x) => x != null)))}`);
const detail = (claim, s) => (claim === 'BELOW' ? [...s.below, ...(s.printBelow ?? []).map((x) => `print ${x}`)]
  : claim === 'CLIP' ? [...s.clips, ...(s.printClips ?? []).map((x) => `print ${x}`)]
    : claim === 'COLLIDE' ? s.collisions : s.printDiff).join(',');
const say = (claim, rows, what) => log(`[${rows.length ? 'OBSERVED' : 'not observed'} ${claim}] ${rows.length} of ${n} chart-sizes ${what}${rows.length ? `: ${rows.slice(0, 4).map((s) => `${label(s)} ${detail(claim, s)}`).join(' | ')}` : ''}`);
say('BELOW', below, 'print a text under the canonical minimum (14 pt ticks, legend, line-end labels; 18 pt axis titles)');
say('CLIP', clip, 'clip a caption, its sample-data prefix, an axis title, a tick label or the legend');
say('COLLIDE', collide, 'draw an axis title over a tick label, the legend or a line-end label, the legend over a tick label, or tick labels over each other');
if (PRINT) say('PRINT', printDiff, `differ between the editor and the print document (${printed.length} compared)`);
// CHROME: the print document carries the editor's own marks.
const chromeRows = results.chrome.filter((c) => c.handles || c.selectionUi || c.accentFrames);
if (PRINT) log(`[${chromeRows.length ? 'OBSERVED' : 'not observed'} CHROME] ${chromeRows.length} of ${results.chrome.length} print documents carry resize handles, the selection's controls or a selected frame's accent border${chromeRows.length ? `: ${chromeRows.slice(0, 4).map((c) => `${c.scenario} ${c.w ?? ''}x${c.h ?? ''} ${c.key ?? c.caption ?? ''}: handles ${c.handles}, selection ${c.selectionUi}, accent ${c.accentFrames}`).join(' | ')}` : ''}${results.selectedInEditor !== undefined ? ` (selected in the editor before Save PDF: ${results.selectedInEditor})` : ''}`);
const grown = gated.filter((s) => s.grownIn > 0.02);
log(`[INFO GROWN] charts drawn taller than their block (the text at the minimums did not fit its height): ${grown.length} of ${n}${grown.length ? `: ${grown.slice(0, 6).map((s) => `${label(s)} +${s.grownIn} in`).join(' | ')}` : ''}`);
for (const [name, rows] of [['the chooser and confirmer sets', gated.filter((s) => s.set !== 'paste')], ['the pasted tables (the review\'s partition)', gated.filter((s) => s.set === 'paste')]]) {
  if (!rows.length) continue;
  const c = (f) => rows.filter(f).length;
  log(`[by set] ${name}: ${rows.length} chart-sizes; BELOW ${c((s) => s.below.length || s.printBelow?.length)}, CLIP ${c((s) => s.clips.length || s.printClips?.length)}, COLLIDE ${c((s) => s.collisions.length)}, PRINT ${c((s) => s.printDiff?.length)}, GROWN ${c((s) => s.grownIn > 0.02)}; smallest tick ${r2(Math.min(...rows.map((s) => s.min.tick).filter((x) => x != null)))}, axis title ${r2(Math.min(...rows.map((s) => s.min.axisTitle).filter((x) => x != null)))}, legend ${r2(Math.min(...rows.map((s) => s.min.legend).filter((x) => x != null)))}`);
}
const drawn = gated.filter((s) => s.draws !== undefined);
const redraw = drawn.filter((s) => s.draws !== 1);
if (drawn.length) log(`[${redraw.length ? 'OBSERVED' : 'not observed'} REDRAW] ${redraw.length} of ${drawn.length} charts drawn other than once while the editor opened${redraw.length ? `: ${redraw.slice(0, 4).map((s) => `${label(s)} ${s.draws}×`).join(' | ')}` : ''}`);
const failed = controlFails.length || results.errors.length || !n;
const exit = failed ? 2 : below.length || clip.length || collide.length || printDiff.length || redraw.length || chromeRows.length ? 1 : 0;
log(`[harness] exit=${exit} (${h.engine}${h.mutant ? `, mutant ${h.mutant}` : ''}) wrote ${path.join(OUT, 'results.json')}`);
process.exit(exit);
