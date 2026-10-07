// Probe for the reviser pass (2026-10-07). Read-only against the repo copy
// at main f554eaa. Runs the production autoLayout() and makeBlocks() on the
// default poster (3-Column Classic, 48 x 36 in) and prints heading numbers
// and column placement before and after Auto-Arrange, using the export's own
// heading-number function. Also prints the text-size step table and the
// welcome seed's stored sizes.
//
//   (once, from mvp-doc/: ln -s <repo>/node_modules node_modules
//    so templates.ts can resolve 'nanoid'; remove it afterwards)
// Run (cwd must be apps/web so tsx finds the '@/' path alias; needs a
// node_modules symlink in mvp-doc/ pointing at the main checkout's):
//   cd apps/web && npx tsx ../../docs/launch/mvp-editor/probes/revise-probe.mts
import { execFileSync } from 'node:child_process';
import { makeBlocks } from '../../../../apps/web/src/poster/templates.ts';
import { autoLayout } from '../../../../apps/web/src/poster/autoLayout.ts';
import { DEFAULT_STYLES, POINTS_PER_UNIT, PX } from '../../../../apps/web/src/poster/constants.ts';
import { computeHeadingNumbers, computeCaptionNumbers } from '../../../../apps/web/src/export/posterContent.ts';
import { snap } from '../../../../apps/web/src/poster/snap.ts';

const W = 48, H = 36;
const before = makeBlocks('3col', W, H);
const headingsOf = (blocks: any[]) => {
  const n = computeHeadingNumbers(blocks);
  return blocks
    .filter((b) => b.type === 'heading')
    .map((b) => `${n[b.id]}. ${b.content} (x=${Math.round(b.x)}, y=${Math.round(b.y)})`);
};
console.log('== Heading numbers, fresh 3-Column Classic 48x36 ==');
console.log(headingsOf(before).join('\n'));

const res = autoLayout(before, W * PX, H * PX, DEFAULT_STYLES);
console.log('\n== After autoLayout() (stored heights; the editor measures heights first, which changes h, not the y-sort) ==');
console.log(headingsOf(res.blocks).join('\n'));
console.log('scaledStyles:', JSON.stringify(res.scaledStyles));
console.log('\n== Block order and column after Auto-Arrange ==');
for (const b of res.blocks) {
  const label = b.type === 'heading' || b.type === 'text' ? `${b.type}: ${String(b.content).slice(0, 28)}` : b.type;
  console.log(`x=${Math.round(b.x)} y=${Math.round(b.y)}  ${label}`);
}

// Template text that is content, not a prompt.
console.log('\n== Text/heading blocks with stored content in the fresh poster ==');
for (const b of before) if ((b.type === 'text' || b.type === 'title') && b.content) console.log(`${b.type}: "${b.content}"`);
const table = before.find((b) => b.type === 'table');
console.log('table cells:', JSON.stringify(table?.tableData?.cells));

// Text-size steps (doc §3.7 as drafted) vs constants.ts readability guideline (title 72 / heading 42 / body 24 pt).
console.log('\n== Step table: factor x DEFAULT_STYLES, rounded to 0.1 unit, in pt ==');
const factors = [0.6, 0.7, 0.8, 0.9, 1.0, 1.15, 1.3];
for (const f of factors) {
  const pt = (u: number) => (Math.round(u * f * 10) / 10 * POINTS_PER_UNIT).toFixed(1);
  console.log(`x${f}: title ${pt(DEFAULT_STYLES.title.size)}  heading ${pt(DEFAULT_STYLES.heading.size)}  body ${pt(DEFAULT_STYLES.body.size)}`);
}

// Snap sweep: largest distance from any position to the nearest ½ in grid line, and whether snap() moves it.
let maxDist = 0, unsnapped = 0, total = 0;
for (let v = 0; v <= 500; v += 0.01) {
  total++;
  const s = snap(v);
  if (Math.abs(s - Math.round(v / 5) * 5) > 1e-9) unsnapped++;
  maxDist = Math.max(maxDist, Math.abs(v - Math.round(v / 5) * 5));
}
console.log(`\n== Snap sweep 0..500 units step 0.01: max distance to grid ${maxDist.toFixed(2)} units; positions left off-grid by snap(): ${unsnapped} of ${total}`);

// Welcome seed's stored styles.
const json = execFileSync('unzip', ['-p', '../../../main/apps/web/public/seeds/welcome-cat-poster.postr', 'poster.json']).toString();
const seed = JSON.parse(json);
const doc = seed.data ?? seed.doc ?? seed;
const styles = doc.styles ?? doc.poster?.styles;
console.log('\n== Welcome seed styles (units -> pt) ==');
for (const k of ['title', 'heading', 'authors', 'body']) {
  const u = styles?.[k]?.size;
  console.log(`${k}: ${u} units = ${u ? (u * POINTS_PER_UNIT).toFixed(1) : '?'} pt`);
}
