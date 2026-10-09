/**
 * Posters for scripts/auto-arrange-check.mjs (record 28): the five layout
 * templates and the welcome poster as a new user meets them, and posters a
 * user has written into. Blocks come from the app's own `makeBlocks` (read
 * in the page by `templateBlocks`) and from the welcome seed's own
 * `poster.json`; the user-like edits are text typed into those blocks, a
 * heading pasted into the middle of a column, extra figures, a portrait
 * sheet and a short one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { clickAway, dragMove, idsOf } from './arrangeUi.mjs';
import { readingOrderOf } from './arrangeRead.mjs';

const VOCAB = ('participants in each condition reported higher scores across all measures while the control '
  + 'group remained stable over time we found a reliable interaction between task difficulty and sleep '
  + 'duration which suggests attention depends on prior rest these findings extend earlier work on visual '
  + 'search and highlight practical implications for shift workers further research should test larger '
  + 'samples with objective measures of fatigue').split(' ');

/** `n` words of plain prose, deterministic in `seed`, as one paragraph. */
export function prose(seed, n) {
  const words = [];
  for (let i = 0; i < n; i += 1) words.push(VOCAB[(seed * 7 + i * 3 + (i % 5)) % VOCAB.length]);
  words[0] = words[0][0].toUpperCase() + words[0].slice(1);
  return `<p>${words.join(' ')}.</p>`;
}

const REFS = [
  { id: 'r1', authors: ['Smith, J.', 'Doe, J.'], year: '2023', title: 'Sleep restriction and visual search in domestic cats', journal: 'Journal of Sample Research' },
  { id: 'r2', authors: ['Doe, J.'], year: '2021', title: 'A preliminary taxonomy of keyboard proximity', journal: 'Acme State Review' },
  { id: 'r3', authors: ['Smith, J.'], year: '2019', title: 'Attention after rest: a replication with larger samples', journal: 'Sample Research Institute Reports' },
];

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

/**
 * Every scenario: `id`, the sheet `size`, and `build(t, seed)` returning the
 * doc fields to replace (`t` holds the templates' blocks per key and size,
 * `seed` the welcome poster's doc). `crowded` marks a poster that cannot fit.
 * Optional: `ui(page)`, what the user does on the canvas before pressing
 * Auto-Arrange (mouse drags, lib/arrangeUi.mjs); `timing: 'read'`, G6 read
 * and not gated (a known limit on the plan's Later list); `dragAfter`, a
 * block dragged straight down after Auto-Arrange (where it lands is read).
 */
export const SCENARIOS = [
  { id: 'tpl-3col', size: { w: 48, h: 36 }, preview: true, dragAfter: true, build: (t) => ({ blocks: t['3col@48x36'] }) },
  { id: 'tpl-2col', size: { w: 48, h: 36 }, build: (t) => ({ blocks: t['2col@48x36'] }) },
  { id: 'tpl-billboard', size: { w: 48, h: 36 }, build: (t) => ({ blocks: t['billboard@48x36'] }) },
  { id: 'tpl-sidebar', size: { w: 48, h: 36 }, build: (t) => ({ blocks: t['sidebar@48x36'] }) },
  { id: 'tpl-empty', size: { w: 48, h: 36 }, control: true, build: (t) => ({ blocks: t['empty@48x36'] }) },
  {
    id: 'welcome', size: { w: 48, h: 36 },
    build: (_t, seed) => ({
      blocks: seed.blocks, styles: seed.styles, fontFamily: seed.fontFamily, palette: seed.palette,
      headingStyle: seed.headingStyle, authors: seed.authors, institutions: seed.institutions, references: seed.references,
    }),
  },
  {
    id: 'user-long', size: { w: 48, h: 36 },
    build: (t) => ({ blocks: fillText(t['3col@48x36'], [120, 60, 150, 80]), references: REFS }),
  },
  {
    id: 'user-crowded', size: { w: 48, h: 36 }, crowded: true,
    build: (t) => ({ blocks: fillText(t['3col@48x36'], [300, 260, 320, 280]), references: REFS }),
  },
  { id: 'user-portrait', size: { w: 36, h: 48 }, build: (t) => ({ blocks: fillText(t['3col@36x48'], [90, 50, 110, 70]) }) },
  {
    // A heading pasted last into the array but placed in column 2, between
    // the Methods text and the figure: it reads as section 4.
    id: 'user-pasted-heading', size: { w: 48, h: 36 },
    build: (t) => {
      const blocks = fillText(t['3col@48x36'], [70, 40, 60, 40]);
      const methods = blocks.find((b) => b.type === 'heading' && b.content === 'Methods');
      const img = blocks.find((b) => b.type === 'image');
      return {
        blocks: [
          ...blocks.map((b) => (b.id === img.id ? { ...b, y: b.y + 26 } : b)),
          { ...methods, id: 'zqPastedHead', content: 'Procedure', y: img.y - 2 },
        ],
      };
    },
  },
  {
    // Three figures: one more at the foot of column 1 and one in column 3.
    id: 'user-figures', size: { w: 48, h: 36 }, preview: true,
    build: (t) => {
      const blocks = fillText(t['3col@48x36'], [60, 30, 60, 30]);
      const img = blocks.find((b) => b.type === 'image');
      const col1 = blocks.filter((b) => b.x === blocks.find((x) => x.type === 'heading').x);
      const col3x = Math.max(...blocks.filter((b) => b.type === 'heading').map((b) => b.x));
      const low1 = Math.max(...col1.map((b) => b.y + 40));
      return {
        blocks: [
          ...blocks,
          { ...img, id: 'zqFigA', y: low1, h: 60, caption: 'Second figure.' },
          { ...img, id: 'zqFigB', x: col3x, y: 150, h: 70, caption: 'Third figure.' },
        ],
      };
    },
  },
  { id: 'small-48x24', size: { w: 48, h: 24 }, build: (t) => ({ blocks: t['3col@48x24'] }) },
  // Review round 1 (record 28 §9): its probe's posters that found a defect.
  {
    // Authors and affiliations along the foot of the sheet (B-R1): the body
    // runs from under the title to 0.6 in above them.
    id: 'user-authors-footer', size: { w: 48, h: 36 },
    build: (t) => ({
      blocks: fillText(t['3col@48x36'], [70, 40, 60, 40]).map((b) => (b.type === 'authors' ? { ...b, y: 360 - 10 - 22 } : b)),
    }),
  },
  {
    // The same, the authors block dragged there with the mouse.
    id: 'user-authors-dragged', size: { w: 48, h: 36 },
    build: (t) => ({ blocks: fillText(t['3col@48x36'], [70, 40, 60, 40]) }),
    ui: async (page) => {
      const [id] = await idsOf(page, 'authors');
      const y0 = await page.evaluate((i) => parseFloat(document.querySelector(`#poster-canvas [data-block-id="${i}"]`).style.top), id);
      await dragMove(page, id, 0, 325 - y0);
      await clickAway(page);
    },
  },
  {
    // One text block dragged 5 in right and 2 in down with the mouse, part
    // of the way across its column (B-R2): the poster still has 3 columns.
    id: 'user-dragged-out', size: { w: 48, h: 36 },
    build: (t) => ({ blocks: fillText(t['3col@48x36'], [80, 40, 70, 50]) }),
    ui: async (page) => {
      const ids = await idsOf(page, 'text');
      await dragMove(page, ids[1], 50, 20);
      await clickAway(page);
    },
  },
  {
    // Six figures with captions on a 48 × 24 sheet, the text taken out: a
    // second press once moved a heading 0.05 units and added an undo step (B-R7).
    id: 'user-six-figures-48x24', size: { w: 48, h: 24 },
    build: (t) => {
      const blocks = t['3col@48x24'];
      const img = blocks.find((b) => b.type === 'image');
      const extra = [0, 1, 2, 3, 4].map((i) => ({
        ...img, id: `zqF${i}`, x: [10, 165, 320][i % 3], y: 120 + 10 * i, h: 80, caption: `Panel ${i}.`, captionPosition: 'bottom',
      }));
      return { blocks: [...blocks.filter((b) => b.type !== 'text'), ...extra] };
    },
  },
  {
    // Four columns on a 72 × 48 sheet (B-R5): the width search is bounded
    // only from 5 columns, so this takes longer than 300 ms; on the plan's
    // Later list, its time is read, not gated.
    id: 'user-4col-72x48', size: { w: 72, h: 48 }, timing: 'read',
    build: (t) => {
      const blocks = fillText(t['3col@72x48'], [90, 60, 80, 60]);
      const order = readingOrderOf({ W: 720, blocks });
      const cw = (700 - 18) / 4;
      const per = Math.ceil(order.length / 4);
      const at = new Map(order.map((id, i) => [id, { x: 10 + Math.floor(i / per) * (cw + 6), y: 70 + (i % per) * 60, w: cw }]));
      return { blocks: blocks.map((b) => (at.has(b.id) ? { ...b, ...at.get(b.id) } : b)) };
    },
  },
];

/** Template keys and sizes the scenarios read. */
export const TEMPLATE_NEEDS = [
  ['3col', 48, 36], ['2col', 48, 36], ['billboard', 48, 36], ['sidebar', 48, 36], ['empty', 48, 36],
  ['3col', 36, 48], ['3col', 48, 24], ['3col', 72, 48],
];

/** The app's own makeBlocks output for TEMPLATE_NEEDS, read in a page on the dev server. */
export async function templateBlocks(page, base) {
  await page.goto(`${base}/version.json`);
  return page.evaluate(async (needs) => {
    const t = await import('/src/poster/templates.ts');
    const out = {};
    for (const [key, w, h] of needs) out[`${key}@${w}x${h}`] = t.makeBlocks(key, w, h);
    return out;
  }, TEMPLATE_NEEDS);
}

/** The welcome poster's doc, from the seed bundle the app serves. */
export async function welcomeSeed(repo) {
  const { unzipSync, strFromU8 } = await import(pathToFileURL(path.join(repo, 'node_modules/fflate/esm/index.mjs')).href);
  const zip = unzipSync(fs.readFileSync(path.join(repo, 'apps/web/public/seeds/welcome-cat-poster.postr')));
  return JSON.parse(strFromU8(zip['poster.json']));
}
