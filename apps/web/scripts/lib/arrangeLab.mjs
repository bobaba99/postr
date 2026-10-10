/**
 * The owner-approved prototype's own `arrange()` (docs/fixes/28-auto-arrange-lab.html,
 * published at https://claude.ai/artifact/FM3NeNqp3oLoeSchbf3giA), run in the
 * editor's page with the editor's inputs, for scripts/auto-arrange-check.mjs.
 *
 * The function's text is cut out of the prototype file and compiled as it is;
 * only what it reads from the prototype's closure is supplied: the poster's
 * geometry, the reading order with each block's current column, the
 * 40-character line width, each table's minimum width and each block's
 * height at a width. Its defaults stay its own (keep 8, equal 2, widths on
 * a ¼ in grid, ½ in for 4 columns). Nothing of the app's Auto-Arrange code
 * runs in it; the block heights are the shared input ("given the same
 * heights"), measured by the app's `measureHeights` for both.
 */
import fs from 'node:fs';
import path from 'node:path';

/** The text of `function arrange(useTemplate) { … }` in the prototype. */
export function labArrangeSource(repo) {
  const file = path.join(repo, 'docs/fixes/28-auto-arrange-lab.html');
  const html = fs.readFileSync(file, 'utf8');
  const start = html.indexOf('function arrange(useTemplate) {');
  if (start < 0) throw new Error(`no arrange() in ${file}`);
  let depth = 0;
  for (let i = html.indexOf('{', start); i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    else if (html[i] === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced braces in the prototype');
}

/**
 * In the page: run the prototype on `input` and return its choice.
 * `input`: { src, W, H, header, k, order: [{ id, type, col }], lineMinIn,
 * tableMinIn: { id: inches }, heightKey } where `window[heightKey](i, w)`
 * returns block i's height in inches at width w.
 */
export function runLabInPage(input) {
  const { src, W, H, header, k, order, lineMinIn, tableMinIn, heightKey } = input;
  const MARGIN = 1;
  const GAP = 0.6;
  const PAD = 0;
  const BW = W - 2 * MARGIN - (k - 1) * GAP;
  const Hb = H - 2 * MARGIN - header - GAP;
  const blocks = order.map((b, i) => ({ ...b, i, aspect: '1:1' }));
  const state = { k, blocks, bodyPt: 36, optShrink: false, optWidths: true, stab: 8, eqw: 2 };
  const geometry = () => ({ W, H, header, BW, Hb });
  // arrange() reads avgChar = wordWidthPt(...) / 28 and the 40-character
  // width as 40 * avgChar / 72 + 2 * PAD: answer with the editor's width.
  const wordWidthPt = () => (lineMinIn * 72 * 28) / 40;
  const tableMinWidth = (b) => tableMinIn[b.id] ?? 0;
  const blockHeight = (b, w) => window[heightKey](b.i, w);
  const aspectOf = () => 1;
  // eslint-disable-next-line no-new-func
  const make = new Function('state', 'geometry', 'blockHeight', 'tableMinWidth', 'wordWidthPt', 'aspectOf', 'MARGIN', 'GAP', 'PAD',
    `${src}\nreturn arrange;`);
  const arrange = make(state, geometry, blockHeight, tableMinWidth, wordWidthPt, aspectOf, MARGIN, GAP, PAD);
  const res = arrange(false);
  return {
    cols: res.cols.map((c) => ({ w: c.w, ids: c.idx.map((i) => blocks[i].id), H: c.H, over: c.over })),
    O: res.O, U: res.U, moved: res.moved, dev: res.dev, evaluated: res.evaluated, ms: res.ms,
    wMin: res.wMin, wMax: res.wMax, wEq: res.wEq, BW, Hb,
  };
}
