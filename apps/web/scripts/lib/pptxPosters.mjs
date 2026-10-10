/**
 * Posters for scripts/pptx-export-check.mjs (record 31): Postr's own charts
 * of every form at two sizes, captions on each side, a note, long captions,
 * turned charts, a selected chart, a poster over 56 in (exported at half
 * size), blocks left empty (each showing an editor hint), and the print
 * path harness's templates, welcome poster, figures and charts posters
 * (lib/printPathPosters.mjs) as a new user and a writer meet them.
 *
 * Charts come from the app's own modules, read in the page: the chooser's
 * pipeline (sampleDatasets → inferTable → recommendFigures → buildChartSpec
 * → captionFor) and the paste path's (parseDelimited → inferTable →
 * recommend at each emphasis), on lib/chartPasteTables.mjs's tables. One
 * chart per form (a horizontal bar counts as its own form).
 */
import { POSTERS as PRINT_POSTERS } from './printPathPosters.mjs';
import { LONG_CAPTION_TAIL } from './chartPasteTables.mjs';

/** PowerPoint's largest slide side; the export halves a poster past it. */
export const PPTX_MAX_IN = 56;
const NOTE = 'Note. Values are group means; error bars omitted for clarity.';
const MARGIN_X = 2;
const TOP = 4;

/**
 * Charts laid out in a grid on posters no wider or taller than `maxIn`:
 * chunks of `items` ({ c, w, h, caption, note, rotation }), each with its
 * blocks and its sheet size. A frame grows past its stored height with its
 * caption; `room` inches under each row hold it.
 */
function grid(items, { maxIn = PPTX_MAX_IN, room = 4, gap = 1 } = {}) {
  const out = [];
  let i = 0;
  while (i < items.length) {
    const w = Math.max(...items.slice(i).map((t) => t.w));
    const hh = Math.max(...items.slice(i).map((t) => t.h));
    const cols = Math.max(1, Math.floor((maxIn - 2 * MARGIN_X + gap) / (w + gap)));
    const rows = Math.max(1, Math.floor((maxIn - TOP - 2) / (hh + room)));
    const chunk = items.slice(i, i + cols * rows);
    const usedCols = Math.min(cols, chunk.length);
    const usedRows = Math.ceil(chunk.length / cols);
    const blocks = chunk.map((t, k) => chartBlock(`zqchart${i + k}`, t, {
      x: (MARGIN_X + (k % cols) * (w + gap)) * 10,
      y: (TOP + Math.floor(k / cols) * (hh + room)) * 10,
    }));
    out.push({ blocks, size: { w: Math.ceil(2 * MARGIN_X + usedCols * (w + gap)), h: Math.ceil(TOP + 2 + usedRows * (hh + room)) } });
    i += chunk.length;
  }
  return out;
}

/** A chart block as Insert stores one (the caption under the chart by default). */
export function chartBlock(id, { c, w, h, caption = 'bottom', note = false, rotation = 0, longCaption = false, spec }, { x, y }) {
  return {
    id, type: 'chart', x, y, w: w * 10, h: h * 10, content: '', imageSrc: null, imageFit: 'contain', tableData: null,
    chartSpec: spec ?? c.spec,
    caption: longCaption ? c.caption + LONG_CAPTION_TAIL : c.caption,
    captionPosition: caption,
    ...(note ? { note: NOTE } : {}),
    ...(rotation ? { rotation } : {}),
  };
}

/** One chart per form, chooser first, then the pasted tables' forms it lacks. */
export function oneEachForm(pool) {
  const seen = new Map();
  for (const c of pool) {
    const id = `${c.spec.form}${c.spec.options?.horizontal ? '-h' : ''}`;
    if (!seen.has(id)) seen.set(id, { ...c, formId: id });
  }
  return [...seen.values()];
}

/**
 * Every poster: `id`, `size`, `blocks` (or `fromPrint`, a print path poster's
 * id, built with its own assets), `doc` (other fields to replace), `select`
 * (a chart block's id to select before the export), `hints` (the editor
 * hints its sheet must show, control K-hint).
 */
export function pptxPosters(forms) {
  const posters = [];
  for (const id of ['tpl-3col', 'tpl-2col', 'tpl-billboard', 'tpl-sidebar', 'tpl-empty', 'welcome', 'user-figures', 'user-charts']) {
    const hints = id === 'tpl-billboard' ? ['+ Upload figure'] : id.startsWith('tpl-') && id !== 'tpl-empty' ? ['+ Upload figure', 'Add references in Refs tab →'] : id === 'user-charts' || id === 'user-figures' ? ['Add references in Refs tab →'] : [];
    posters.push({ id, fromPrint: id, hints });
  }
  for (const [w, h] of [[6, 4.5], [12, 9]]) {
    grid(forms.map((c) => ({ c, w, h }))).forEach((g, k) => posters.push({ id: `forms-${w}x${h}-${k + 1}`, ...g }));
  }
  const three = forms.slice(0, 3);
  const sides = ['top', 'left', 'right', 'none'].flatMap((caption) => three.map((c) => ({ c, w: 8, h: 6, caption })));
  sides.push(...three.map((c) => ({ c, w: 8, h: 6, caption: 'bottom', note: true })), { c: three[0], w: 8, h: 6, caption: 'top', note: true });
  grid(sides, { room: 9 }).forEach((g, k) => posters.push({ id: `sides-8x6-${k + 1}`, ...g }));
  grid(three.slice(0, 2).flatMap((c) => [{ c, w: 6, h: 4.5, caption: 'bottom', longCaption: true }, { c, w: 10, h: 7, caption: 'top', longCaption: true }]), { room: 6 })
    .forEach((g, k) => posters.push({ id: `longcap-${k + 1}`, ...g }));
  // The -90° chart has a note too (record 31's review round 1, R1-F3: a
  // turned chart's note turns with it).
  const turned = grid([{ c: three[0], w: 8, h: 6, rotation: 20 }, { c: three[1], w: 8, h: 6, caption: 'top', rotation: -90, note: true }, { c: three[2], w: 6, h: 4.5, caption: 'right', rotation: 180 }], { room: 8, gap: 4 });
  posters.push({ id: 'rotated', ...turned[0] });
  const sel = grid([{ c: three[0], w: 8, h: 6 }, { c: three[1], w: 8, h: 6, caption: 'top' }]);
  posters.push({ id: 'selected', ...sel[0], select: 'zqchart0' });
  const half = grid(forms.slice(0, 6).map((c) => ({ c, w: 14, h: 10 })), { maxIn: 200 });
  posters.push({ id: 'half-size', blocks: half[0].blocks, size: { w: Math.max(72, half[0].size.w), h: Math.max(48, half[0].size.h) } });
  // Blocks left empty, each with the editor's hint, and a chart that cannot
  // be drawn (no rows: renderChart throws, ChartBlock shows its error).
  const base = { content: '', imageSrc: null, imageFit: 'contain', tableData: null };
  posters.push({
    id: 'empty-blocks', size: { w: 36, h: 24 },
    blocks: [
      { ...base, id: 'zqtitle', type: 'title', x: 20, y: 20, w: 320, h: 30, content: 'Empty blocks print as nothing' },
      { ...base, id: 'zqauthors', type: 'authors', x: 20, y: 55, w: 320, h: 22 },
      { ...base, id: 'zqlogo', type: 'logo', x: 20, y: 85, w: 50, h: 50 },
      { ...base, id: 'zqimage', type: 'image', x: 80, y: 85, w: 80, h: 60, captionPosition: 'none' },
      { ...base, id: 'zqrefs', type: 'references', x: 170, y: 85, w: 170, h: 40 },
      chartBlock('zqbroken', { c: forms[0], w: 8, h: 6, caption: 'none', spec: { ...forms[0].spec, data: { ...forms[0].spec.data, rows: [] } } }, { x: 20, y: 150 }),
      chartBlock('zqchart0', { c: forms[1], w: 8, h: 6 }, { x: 120, y: 150 }),
      // What does print for an empty block: a heading's number, a figure's
      // "Figure N." label (review round 2, R2-F3; INFO empty-printed).
      { ...base, id: 'zqheading', type: 'heading', x: 220, y: 150, w: 120, h: 14 },
      { ...base, id: 'zqimage2', type: 'image', x: 220, y: 175, w: 80, h: 40, captionPosition: 'bottom' },
    ],
    // The empty blocks whose printed text INFO empty-printed reads.
    emptyProbe: ['zqheading', 'zqimage', 'zqimage2', 'zqauthors', 'zqlogo', 'zqrefs', 'zqbroken'],
    doc: { authors: [], institutions: [], references: [] },
    hints: ['+ Upload figure', '+ Logo', 'Add authors in sidebar →', 'Add references in Refs tab →', 'Something went wrong rendering this chart.', 'Send Feedback'],
    broken: ['zqbroken'],
  });
  // What the user does while the file is built (lib/pptxTiming.mjs; record
  // 31's review round 1): a scroll (R1-F1), and an export while the charts
  // still draw, within the export's wait and past it, a pack holder's
  // credit counted (R1-F2). The charts poster, as a writer meets it.
  const chartsHints = ['Add references in Refs tab →'];
  posters.push({ id: 'scroll-export', fromPrint: 'user-charts', hints: chartsHints, timing: { zoomIn: true, holdFontMs: 2500, scroll: 500 } });
  posters.push({ id: 'loading-export', fromPrint: 'user-charts', hints: chartsHints, timing: { holdPlotMs: 4000 } });
  posters.push({ id: 'loading-past-wait', fromPrint: 'user-charts', hints: chartsHints, timing: { holdPlotMs: 15000, expectNoFile: true, pack: 2 } });
  // And while the export waits, the user opens Preview (and stays past the
  // wait, or comes back within it) or goes Back to the dashboard (record
  // 31's review round 2, R2-F1): the charts still drawing, or the writer's
  // chunk held with every chart drawn. A pack holder's credit counted.
  const away = (over) => ({ away: 'preview', awayAtMs: 500, pack: 2, ...over });
  posters.push({ id: 'preview-export', fromPrint: 'user-charts', hints: chartsHints, timing: away({ holdPlotMs: 4000, expectNoFile: true }) });
  posters.push({ id: 'preview-return-export', fromPrint: 'user-charts', hints: chartsHints, timing: away({ holdPlotMs: 4000, returnAtMs: 5000 }) });
  posters.push({ id: 'preview-slow-export', fromPrint: 'user-charts', hints: chartsHints, timing: away({ holdWriterMs: 3000, awayAtMs: 300, expectNoFile: true }) });
  posters.push({ id: 'leave-export', fromPrint: 'user-charts', hints: chartsHints, timing: away({ holdPlotMs: 4000, away: 'leave', expectNoFile: true }) });
  return posters;
}

/** A print path poster's doc fields (its `build` with its own assets). */
export function fromPrintPoster(id, assets) {
  const P = PRINT_POSTERS.find((p) => p.id === id);
  return { size: P.size, name: P.name, fields: P.build(assets) };
}
