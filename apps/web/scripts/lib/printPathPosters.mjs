/**
 * Posters for scripts/print-path-check.mjs (record 30): the five layout
 * templates and the welcome poster as a new user meets them, and posters a
 * user has written into: long text, a long title at both of OF-07's shapes,
 * figures with captions and a note, tables with long cells, inserted charts,
 * a long authors block, a font with real metrics (Charter, which macOS has
 * installed) and filled headings, and a portrait sheet.
 *
 * Blocks come from the app's own `makeBlocks` (read in the page), the
 * welcome seed's own `poster.json`, and the chart chooser's own modules
 * (sampleDatasets → inferTable → recommendFigures → buildChartSpec →
 * captionFor). A figure is a PNG the page draws on a canvas, put in the
 * image block as a data: URL (the fake backend has no storage); the
 * welcome poster's 8 MB photograph is replaced by it the same way.
 */
import { prose, welcomeSeed } from './arrangeScenarios.mjs';

const REFS = [
  { id: 'r1', authors: ['Smith, J.', 'Doe, J.'], year: '2023', title: 'Sleep restriction and visual search in domestic cats', journal: 'Journal of Sample Research' },
  { id: 'r2', authors: ['Doe, J.'], year: '2021', title: 'A preliminary taxonomy of keyboard proximity', journal: 'Acme State Review' },
  { id: 'r3', authors: ['Smith, J.'], year: '2019', title: 'Attention after rest: a replication with larger samples', journal: 'Sample Research Institute Reports' },
];

const INSTITUTIONS = [
  { id: 'i1', name: 'Acme State University', dept: 'Department of Psychology' },
  { id: 'i2', name: 'Sample Research Institute', dept: 'Centre for Sleep and Cognition' },
  { id: 'i3', name: 'University of Example', dept: 'School of Veterinary Behaviour' },
  { id: 'i4', name: 'Placeholder College', dept: 'Department of Computer Science' },
];

const AUTHORS_LONG = [
  ['Jane Doe', ['i1', 'i2'], true, true], ['John Smith', ['i1'], false, true], ['Alex Example', ['i3'], false, false],
  ['Sam Sample', ['i2', 'i4'], false, false], ['Pat Placeholder', ['i4'], false, false], ['Chris Specimen', ['i3', 'i1'], false, false],
  ['Taylor Testcase', ['i2'], false, false],
].map(([name, affiliationIds, isCorresponding, equalContrib], i) => ({ id: `a${i + 1}`, name, affiliationIds, isCorresponding, equalContrib }));

const TITLE3 = 'Feline Proximity to the Keyboard Rises with Human Typing Speed: Evidence from Forty-Eight Households Observed Across Twelve Weeks';
const TITLE4 = 'Feline Proximity to the Keyboard Rises with Human Typing Speed: Evidence from Forty-Eight Households Observed Across Twelve Weeks of Remote Work';

/** Text blocks of a template, in array order, given `words[i]` words each. */
function fillText(blocks, words) {
  let i = 0;
  return blocks.map((b) => {
    if (b.type !== 'text') return b;
    const n = words[i % words.length];
    i += 1;
    return { ...b, content: prose(i, n) };
  });
}

const titled = (blocks, title) => blocks.map((b) => (b.type === 'title' ? { ...b, content: title } : b));

/** Template keys and sizes the posters read. */
export const TEMPLATE_NEEDS = [
  ['3col', 48, 36], ['2col', 48, 36], ['billboard', 48, 36], ['sidebar', 48, 36], ['empty', 48, 36], ['3col', 36, 48],
];

/**
 * Every poster: `id`, the sheet `size`, and `build(a)` returning the doc
 * fields to replace (`a.t` the templates' blocks per key and size, `a.seed`
 * the welcome poster's doc, `a.figure` a PNG data: URL, `a.charts` chart
 * specs with captions). `select` names a block the user has selected (by
 * type) before printing: a second pass prints with it selected. `resize`
 * and `tableStates` add the last scenarios (print-path-check.mjs's header).
 */
export const POSTERS = [
  { id: 'tpl-3col', size: { w: 48, h: 36 }, build: (a) => ({ blocks: a.t['3col@48x36'] }) },
  { id: 'tpl-2col', size: { w: 48, h: 36 }, build: (a) => ({ blocks: a.t['2col@48x36'] }) },
  { id: 'tpl-billboard', size: { w: 48, h: 36 }, build: (a) => ({ blocks: a.t['billboard@48x36'] }) },
  { id: 'tpl-sidebar', size: { w: 48, h: 36 }, build: (a) => ({ blocks: a.t['sidebar@48x36'] }) },
  { id: 'tpl-empty', size: { w: 48, h: 36 }, build: (a) => ({ blocks: a.t['empty@48x36'] }) },
  {
    id: 'welcome', size: { w: 48, h: 36 },
    build: (a) => ({
      blocks: a.seed.blocks.map((b) => (b.type === 'image' && /^bundle:/.test(b.imageSrc ?? '') ? { ...b, imageSrc: a.figure } : b)),
      styles: a.seed.styles, fontFamily: a.seed.fontFamily, palette: a.seed.palette, headingStyle: a.seed.headingStyle,
      authors: a.seed.authors, institutions: a.seed.institutions, references: a.seed.references,
    }),
  },
  {
    // OF-07's first shape: a 3-line title at 48 × 36 (0.33 in into the authors).
    id: 'user-title3', size: { w: 48, h: 36 }, select: 'title',
    build: (a) => ({ blocks: titled(fillText(a.t['3col@48x36'], [60, 30, 50, 30]), TITLE3), references: REFS }),
  },
  {
    // OF-07's second: a 4-line title on a portrait 36 × 48 (1.9 in). Its
    // poster is named after its title (`name`, 144 characters): the print
    // window's toolbar shows the name, and its header wraps taller
    // (record 30's review round 1, R1-F4: HEADER).
    id: 'user-title4-portrait', size: { w: 36, h: 48 }, name: TITLE4,
    build: (a) => ({ blocks: titled(fillText(a.t['3col@36x48'], [70, 40, 60, 40]), TITLE4), references: REFS }),
  },
  {
    // Long text, and the formatting a user adds with the selection toolbar
    // (bold, italic, underline, strike, highlight, sub- and superscript, a
    // bulleted and a numbered list), and a bold word in the bold title.
    id: 'user-long', size: { w: 48, h: 36 }, select: 'text',
    build: (a) => {
      const blocks = titled(fillText(a.t['3col@48x36'], [120, 60, 150, 80]), 'Sleep Restriction and <b>Working Memory</b> in Domestic Cats');
      const first = blocks.find((b) => b.type === 'text');
      const rich = `${first.content}<b>Bold</b> and <i>italic</i>, <u>underlined</u>, <s>struck</s> and <mark>highlighted</mark> words; CO<sub>2</sub> and x<sup>2</sup> in a line.<ul><li>A first point that runs long enough to wrap onto a second line here</li><li>A second point</li></ul><ol><li>Step one</li><li>Step two</li></ol>The paragraph after the lists.`;
      return { blocks: blocks.map((b) => (b.id === first.id ? { ...b, content: rich } : b)), references: REFS };
    },
  },
  {
    id: 'user-figures', size: { w: 48, h: 36 },
    build: (a) => {
      const blocks = fillText(a.t['3col@48x36'], [60, 30, 60, 30]);
      const img = blocks.find((b) => b.type === 'image');
      const col1x = blocks.find((b) => b.type === 'heading').x;
      const col3x = Math.max(...blocks.filter((b) => b.type === 'heading').map((b) => b.x));
      return {
        blocks: [
          ...blocks.map((b) => (b.id === img.id ? { ...b, imageSrc: a.figure, caption: 'Mean distance to the keyboard by typing speed, with 95% confidence intervals across all households.', captionPosition: 'bottom' } : b)),
          { ...img, id: 'zqFigA', x: col1x, y: 268, h: 45, imageSrc: a.figure, caption: 'Households by number of cats.', captionPosition: 'top', note: 'Note. Two households kept no cat during week 7.' },
          { ...img, id: 'zqFigB', x: col3x, y: 268, h: 45, imageSrc: a.figure, caption: 'A short caption.', captionPosition: 'bottom' },
        ],
      };
    },
  },
  {
    // `tableStates`: last printed with ⌘P after typing in a cell of its
    // longest table, the pointer left on the cell, on its row strip, or
    // moved off the sheet (review round 2, R2-F1: TABLEUI).
    id: 'user-tables', size: { w: 48, h: 36 }, tableStates: true,
    build: (a) => {
      const blocks = fillText(a.t['3col@48x36'], [50, 30, 50, 30]);
      const tbl = blocks.find((b) => b.type === 'table');
      const img = blocks.find((b) => b.type === 'image');
      const long = {
        rows: 4, cols: 3, colWidths: null, borderPreset: 'apa',
        cells: ['Condition', 'Description of the household routine', 'Distance (cm)',
          'Baseline', 'Typing at the usual speed for the first two weeks of the study', '41.2 (8.0)',
          'Fast', 'Typing a prepared passage as quickly as possible for ten minutes', '18.7 (6.1)',
          'Slow', 'Typing the same passage at half the usual speed', '35.9 (7.4)'],
      };
      return {
        blocks: blocks.map((b) => {
          if (b.id === tbl.id) return { ...b, caption: 'Mean distance by condition.', captionPosition: 'top', note: 'Note. Standard deviations in parentheses; n = 48 households.' };
          if (b.id === img.id) return { ...b, type: 'table', imageSrc: null, tableData: long, caption: 'Conditions and their descriptions.', captionPosition: 'top' };
          return b;
        }),
      };
    },
  },
  {
    id: 'user-charts', size: { w: 48, h: 36 }, select: 'chart',
    build: (a) => {
      const blocks = fillText(a.t['3col@48x36'], [50, 30, 50, 30]);
      const img = blocks.find((b) => b.type === 'image');
      const tbl = blocks.find((b) => b.type === 'table');
      const chart = (b, c, id) => ({ ...b, id, type: 'chart', imageSrc: null, tableData: null, chartSpec: c.spec, caption: c.caption, captionPosition: 'bottom' });
      return { blocks: blocks.map((b) => (b.id === img.id ? chart(b, a.charts[0], 'zqChartA') : b.id === tbl.id ? chart(b, a.charts[1], 'zqChartB') : b)) };
    },
  },
  {
    // Last changed to 36 × 48 in Layout and printed with ⌘P at once
    // (`resize`: key+resized; review round 1, R1-F1).
    id: 'user-authors', size: { w: 48, h: 36 }, resize: { key: '36×48', w: 36, h: 48 },
    build: (a) => ({ blocks: titled(fillText(a.t['3col@48x36'], [50, 30, 50, 30]), TITLE3), authors: AUTHORS_LONG, institutions: INSTITUTIONS }),
  },
  {
    // A font with real metrics on macOS (curated, installed there) and
    // filled headings: the headings' fill is the background the print must
    // keep without the dialog's "Background graphics".
    id: 'user-charter-filled', size: { w: 48, h: 36 },
    build: (a) => ({
      blocks: titled(fillText(a.t['3col@48x36'], [110, 60, 120, 70]), 'Sleep Restriction and Working Memory in Domestic Cats'),
      fontFamily: 'Charter', headingStyle: { border: 'none', fill: true, align: 'left' }, references: REFS,
    }),
  },
];

/**
 * What the posters are built from, read on the dev server through the app's
 * own modules: template blocks, two chart specs from the chooser's sample
 * data, a figure drawn on a canvas, the welcome seed.
 */
export async function prepAssets(page, base, repo) {
  await page.goto(`${base}/version.json`);
  const got = await page.evaluate(async (needs) => {
    const t = await import('/src/poster/templates.ts');
    const templates = {};
    for (const [key, w, h] of needs) templates[`${key}@${w}x${h}`] = t.makeBlocks(key, w, h);
    const sd = await import('/src/charts/sampleData.ts');
    const ic = await import('/src/charts/inferColumns.ts');
    const rc = await import('/src/charts/recommend.ts');
    const bs = await import('/src/charts/buildSpec.ts');
    const charts = [];
    for (const ds of sd.sampleDatasets()) {
      const table = ic.inferTable(ds.table);
      for (const rec of rc.recommendFigures(table).recommendations) {
        const spec = bs.buildChartSpec(table, rec);
        if (spec && charts.length < 2 && !charts.some((c) => c.spec.form === spec.form)) charts.push({ spec, caption: bs.captionFor(table, rec, { sample: true }) });
      }
    }
    const cv = document.createElement('canvas');
    cv.width = 600;
    cv.height = 400;
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 600, 400);
    g.strokeStyle = '#222';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(60, 20); g.lineTo(60, 360); g.lineTo(580, 360);
    g.stroke();
    ['#1a80bb', '#ea801c', '#1f6f6f', '#a00000'].forEach((c, i) => { g.fillStyle = c; g.fillRect(100 + i * 120, 360 - 70 * (i + 1), 80, 70 * (i + 1)); });
    return { templates, charts, figure: cv.toDataURL('image/png') };
  }, TEMPLATE_NEEDS);
  return { t: got.templates, charts: got.charts, figure: got.figure, seed: await welcomeSeed(repo) };
}
