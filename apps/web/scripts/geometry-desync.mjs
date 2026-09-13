/**
 * Reproduce the stored-vs-rendered block geometry desync, with real layout.
 *
 * WHY A BROWSER. jsdom performs no layout — `offsetHeight` is always 0 —
 * so this defect is invisible to the unit suite by construction. That is
 * also why it survived: every geometry consumer has passing tests, because
 * every one of them is CORRECT given correct input. Nothing supplies
 * correct input.
 *
 * The page below renders two blocks exactly as `blocks.tsx` does: a text
 * block with `height: auto` (its `growsWithContent` path) above a heading
 * pinned at its stored y. Then it measures what actually happened and
 * compares against what the document model claims.
 *
 *   node apps/web/scripts/geometry-desync.mjs
 */
import { chromium } from 'playwright';

const PX = 10;                 // poster units per inch
const CANVAS_W = 48 * PX;
const CANVAS_H = 36 * PX;

// The stored document. These are the numbers every geometry consumer reads.
const STORED = {
  intro:   { id: 'intro',   type: 'text',    x: 10, y: 120, w: 200, h: 100 },
  hypo:    { id: 'hypo',    type: 'heading', x: 10, y: 240, w: 200, h: 14  },
};

const LOTS_OF_TEXT = 'Participants completed the task for twelve weeks and were scored by two independent raters. '.repeat(70);

const page = `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:#222}</style>
<div id="poster-canvas" style="position:relative;width:${CANVAS_W}px;height:${CANVAS_H}px;background:#fff">
  <!-- growsWithContent: height auto, minHeight the stored h (blocks.tsx:2023) -->
  <div data-block-id="intro" style="position:absolute;left:${STORED.intro.x}px;top:${STORED.intro.y}px;
       width:${STORED.intro.w}px;height:auto;min-height:${STORED.intro.h}px;
       font-size:3.2px;line-height:1.35;color:#111;outline:0.4px solid #7c6aed">${LOTS_OF_TEXT}</div>
  <div data-block-id="hypo" style="position:absolute;left:${STORED.hypo.x}px;top:${STORED.hypo.y}px;
       width:${STORED.hypo.w}px;height:auto;min-height:${STORED.hypo.h}px;
       font-size:3.4px;font-weight:700;color:#111;outline:0.4px solid #f38ba8">Hypotheses</div>
</div>`;

const browser = await chromium.launch();
const p = await browser.newPage({ viewportSize: { width: 900, height: 700 } });
await p.setContent(page);
await p.waitForTimeout(200);

const measured = await p.evaluate(() => {
  const out = {};
  for (const el of document.querySelectorAll('[data-block-id]')) {
    const r = el.getBoundingClientRect();
    const c = document.getElementById('poster-canvas').getBoundingClientRect();
    out[el.getAttribute('data-block-id')] = {
      y: Math.round((r.top - c.top) * 100) / 100,
      h: Math.round(r.height * 100) / 100,
    };
  }
  return out;
});
await browser.close();

const overlaps = (a, b) =>
  !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);

const introStored = STORED.intro;
const introReal = { ...STORED.intro, h: measured.intro.h };
const hypoStored = STORED.hypo;

console.log('BLOCK   stored h   rendered h   drift');
for (const id of ['intro', 'hypo']) {
  const d = measured[id].h - STORED[id].h;
  console.log(
    `${id.padEnd(8)}${String(STORED[id].h).padStart(8)}${String(measured[id].h).padStart(13)}` +
    `${(d > 0 ? '+' : '') + d.toFixed(2)}`.padStart(9),
  );
}

console.log('\n--- what the document model believes ---');
console.log('  intro occupies y', introStored.y, '..', introStored.y + introStored.h);
console.log('  hypo  occupies y', hypoStored.y, '..', hypoStored.y + hypoStored.h);
console.log('  overlap?', overlaps(introStored, hypoStored));
console.log('  intro bottom past canvas (' + CANVAS_H + ')?', introStored.y + introStored.h > CANVAS_H);

console.log('\n--- what is actually on screen ---');
console.log('  intro occupies y', introReal.y, '..', (introReal.y + introReal.h).toFixed(2));
console.log('  overlap?', overlaps(introReal, hypoStored));
console.log('  intro bottom past canvas (' + CANVAS_H + ')?', introReal.y + introReal.h > CANVAS_H);

const modelClean = !overlaps(introStored, hypoStored) && introStored.y + introStored.h <= CANVAS_H;
const reallyBroken = overlaps(introReal, hypoStored) || introReal.y + introReal.h > CANVAS_H;
console.log('\nREPRODUCED:', modelClean && reallyBroken ? 'YES' : 'no');
if (modelClean && reallyBroken) {
  console.log('  The model says the poster is clean. The poster is not.');
  console.log('  Every consumer reading stored geometry — checkBounds, placeAckMark,');
  console.log('  findOpenSlot, autoLayout, the exporters — agrees with the model.');
}
process.exit(modelClean && reallyBroken ? 0 : 1);
