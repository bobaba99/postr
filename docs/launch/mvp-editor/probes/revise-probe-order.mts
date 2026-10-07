// Probe (reviser pass 2026-10-07): how blocks are ordered today, and what the
// doc's proposed single reading-order rule would give, on the 5 templates and
// the welcome seed. Also runs today's autoLayout() on each and reports heading
// renumbering and full-width blocks squeezed to one column. Read-only against
// main f554eaa. Production code used: makeBlocks, autoLayout,
// computeHeadingNumbers, computeCaptionNumbers. The proposed rule
// (readingOrder below) is a DESIGN SKETCH written for this probe, not code.
//   (once, from mvp-doc/: ln -s <repo>/node_modules node_modules
//    so templates.ts can resolve 'nanoid'; remove it afterwards)
// Run: cd apps/web && npx tsx ../../docs/launch/mvp-editor/probes/revise-probe-order.mts
import { execFileSync } from 'node:child_process';
import { makeBlocks } from '../../../../apps/web/src/poster/templates.ts';
import { autoLayout } from '../../../../apps/web/src/poster/autoLayout.ts';
import { DEFAULT_STYLES, PX, M } from '../../../../apps/web/src/poster/constants.ts';
import { computeHeadingNumbers, computeCaptionNumbers } from '../../../../apps/web/src/export/posterContent.ts';

type B = any;
const name = (b: B) => (b.type === 'heading' ? b.content : b.type);

// Proposed rule: wide blocks (at least 90% of the inner width; a first try at > half failed on Sidebar + Focus, whose 70% main column is a column) are their own band and
// split the poster into bands; inside a band, columns by left edge (within
// 30 units = 3 in, Auto-Arrange's own cluster threshold), left to right, each
// top to bottom; bands top to bottom.
function readingOrder(blocks: B[], W: number): B[] {
  const body = blocks.filter((b) => b.type !== 'title' && b.type !== 'authors' && !b.locked);
  const inner = W - 2 * M;
  const wide = body.filter((b) => b.w >= inner * 0.9).sort((a, b) => a.y - b.y);
  const narrow = body.filter((b) => b.w < inner * 0.9);
  const bands: B[][] = [];
  const cuts = wide.map((b) => b.y);
  const bandOf = (y: number) => cuts.filter((c) => c <= y).length; // narrow band index
  const narrowBands: B[][] = Array.from({ length: wide.length + 1 }, () => []);
  for (const b of narrow) narrowBands[bandOf(b.y)]!.push(b);
  const orderBand = (band: B[]) => {
    const xs = [...band].sort((a, b) => a.x - b.x);
    const cols: B[][] = [];
    for (const b of xs) {
      const col = cols.find((c) => Math.abs(c[0].x - b.x) < 30);
      if (col) col.push(b); else cols.push([b]);
    }
    return cols.flatMap((c) => c.sort((a, b) => a.y - b.y));
  };
  for (let i = 0; i <= wide.length; i++) {
    bands.push(orderBand(narrowBands[i]!));
    if (i < wide.length) bands.push([wide[i]]);
  }
  return bands.flat();
}

function report(label: string, blocks: B[], W: number, H: number) {
  const hn = computeHeadingNumbers(blocks);
  const today = blocks.filter((b) => b.type === 'heading').map((b) => `${hn[b.id]}.${b.content}`);
  const ro = readingOrder(blocks, W);
  const proposed = ro.filter((b) => b.type === 'heading').map((b, i) => `${i + 1}.${b.content}`);
  const cn = computeCaptionNumbers(blocks);
  const figsToday = blocks.filter((b) => b.type === 'image' || b.type === 'table').map((b) => `${b.type} ${cn[b.id]}@(${Math.round(b.x)},${Math.round(b.y)})`);
  const figsProposed = ro.filter((b) => b.type === 'image' || b.type === 'table');
  const fp: string[] = []; const k: Record<string, number> = {};
  for (const b of figsProposed) { k[b.type] = (k[b.type] ?? 0) + 1; fp.push(`${b.type} ${k[b.type]}@(${Math.round(b.x)},${Math.round(b.y)})`); }
  console.log(`\n### ${label}`);
  console.log(`headings today (array order):   ${today.join('  ') || '(none)'}`);
  console.log(`headings, proposed rule:        ${proposed.join('  ') || '(none)'}`);
  console.log(`same? ${JSON.stringify(today.map((s) => s.split('.')[1])) === JSON.stringify(proposed.map((s) => s.split('.')[1]))}`);
  console.log(`figures/tables today (y,x):     ${figsToday.join('  ') || '(none)'}`);
  console.log(`figures/tables, proposed rule:  ${fp.join('  ') || '(none)'}`);
  const res = autoLayout(blocks, W, H, DEFAULT_STYLES);
  const hn2 = computeHeadingNumbers(res.blocks);
  const after = res.blocks.filter((b: B) => b.type === 'heading').map((b: B) => `${hn2[b.id]}.${b.content}`);
  console.log(`after today's Auto-Arrange:     ${after.join('  ') || '(none)'}`);
  // heading immediately followed (same column, next block below) by what?
  const cols = new Map<number, B[]>();
  for (const b of res.blocks) if (b.type !== 'title' && b.type !== 'authors') { const c = Math.round(b.x); cols.set(c, [...(cols.get(c) ?? []), b]); }
  const stuck: string[] = [];
  for (const [, list] of cols) { list.sort((a, b) => a.y - b.y); for (let i = 0; i < list.length; i++) if (list[i].type === 'heading') stuck.push(`${list[i].content} -> ${list[i + 1] ? name(list[i + 1]) : '(end)'}`); }
  console.log(`below each heading after:       ${stuck.join(' | ') || '(none)'}`);
  const squeezed = blocks.filter((b) => b.type !== 'title' && b.type !== 'authors' && b.w > (W - 2 * M) / 2).map((b) => {
    const a = res.blocks.find((x: B) => x.id === b.id); return `${name(b)} w ${Math.round(b.w)} -> ${Math.round(a.w)}`; });
  console.log(`wide blocks after:              ${squeezed.join(' | ') || '(none)'}`);
}

const W = 48 * PX, H = 36 * PX;
for (const key of ['3col', '2col', 'billboard', 'sidebar', 'empty'] as const) report(`template ${key} 48x36`, makeBlocks(key, 48, 36), W, H);
const json = execFileSync('unzip', ['-p', 'public/seeds/welcome-cat-poster.postr', 'poster.json']).toString();
const seed = JSON.parse(json);
report('welcome seed 48x36', seed.blocks, seed.widthIn * PX, seed.heightIn * PX);
