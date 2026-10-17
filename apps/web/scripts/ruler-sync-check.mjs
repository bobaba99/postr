#!/usr/bin/env node
/**
 * ruler-sync-check.mjs — how often do the workspace rulers take their
 * synchronous path, and does React refuse any of those flushes?
 * (docs/fixes/04-rulers-match-sheet.md, steps 9-E, 9-F and 10.)
 *
 * The rulers render their marks synchronously (flushSync) only when a
 * reading leaves a stretch of bar the marks on the page do not cover; that
 * render can pull a pending editor update into the event (S9C-02), and in
 * React's own commit it is refused with a console error (E-03). This serves
 * the tree with one edit that counts each entry into that flushSync (the
 * behaviour is unchanged) and drives the inputs the reviews found it on.
 * With --mutant <name>, that mutant of 04-rulers-match-sheet.mutants.json is
 * served with it: the survivors the unit tests cannot see (the added pixel,
 * the commit's flush) are falsified here, and so is the margin of 300,
 * which a unit test now kills too (the step 9-F review, F-03).
 *
 * Per input it prints the entries into the synchronous path and React's
 * "flushSync was called from inside a lifecycle method" errors. The designed
 * cases take it exactly once: leaving Preview after the window grew (D-01),
 * and a scroll into content that grew with nothing the rulers observe
 * resizing (a block nudged far off the sheet; the second step 10 review, R1-F1 and
 * R2-F1). Every other input here, never. The path is also taken, once, when
 * the window grows at the zoom floor, in width or in height alone (the second
 * step 10 review: R2, R3 and the critic's probe); no input here drives that.
 *
 * Blind spots (the second step 10 review, R1-F7): it counts entries into the one
 * flushSync call, not React's commits inside the callbacks, so a
 * synchronous render reached another way is not seen; and it cannot serve a
 * mutant that edits that call (uncovered-rendered-later: once the counting
 * edit is applied, the mutant's text is found 0 times, exit 2).
 *
 * RUN (from apps/web; the tree's apps/web/.env must point at the harness's
 * fake backend, https://dummy.supabase.co and http://localhost:3000)
 *   node scripts/ruler-sync-check.mjs [--mutant no-plus-one] [--groups scroll,sidebar,commit,zoomed,margin,preview,content]
 *   env POSTR_BROWSER, POSTR_SCROLLBARS=classic, PORT (default 5446), OUT_DIR
 * EXIT 0 the synchronous path taken once on each designed input and never
 *      otherwise, and no refused flush · 1 otherwise · 2 the instrument
 *      failed (a crash too)
 *
 * Side effect: rewrites apps/web/public/version.json (Vite's build stamp);
 * restore it afterwards (git checkout).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// A crash is the instrument failing, not an input off the path (the second step 10
// review, R1-F6: an uncaught error exited 1).
for (const event of ['uncaughtException', 'unhandledRejection']) {
  process.on(event, (e) => { console.error(`[sync-check] instrument error: ${e?.stack ?? e}`); process.exit(2); });
}
const args = process.argv.slice(2);
const opt = (name) => { const at = args.indexOf(`--${name}`); return at < 0 ? null : args[at + 1]; };
const GROUPS = (opt('groups') ?? 'scroll,sidebar,commit,zoomed,margin,preview,content').split(',');
const MUTANT = opt('mutant');
const OUT = path.resolve(process.env.OUT_DIR ?? path.join(os.tmpdir(), 'postr-ruler-sync-check'));
fs.mkdirSync(OUT, { recursive: true });

// The counting edit, and a mutant of the fix's own spec if asked for, served
// together through the harness's POSTR_MUTANT.
const COUNT = ['src/poster/WorkspaceRulers.tsx', 'flushSync(() => setDrawn(next));',
  'void ((window.__postrSyncs = (window.__postrSyncs ?? 0) + 1), flushSync(() => setDrawn(next)));'];
const specOf = JSON.parse(fs.readFileSync(path.join(HERE, '../../../docs/fixes/04-rulers-match-sheet.mutants.json'), 'utf8'));
const extra = MUTANT ? specOf.mutants[MUTANT]?.edits : [];
if (!extra) { console.error(`[sync-check] no mutant "${MUTANT}" in 04-rulers-match-sheet.mutants.json`); process.exit(2); }
const specPath = path.join(OUT, 'probe.mutants.json');
fs.writeFileSync(specPath, JSON.stringify({ tests: specOf.tests, mutants: { probe: { undoes: `count${MUTANT ? ` + ${MUTANT}` : ''}`, edits: [COUNT, ...extra] } } }));
process.env.POSTR_MUTANT = `${specPath}#probe`;

const { SWITCH_OFF, openEditor, startHarness, switchOffReason, switchesOff } = await import('./lib/editorHarness.mjs');
const h = await startHarness({ name: 'ruler-sync-check', port: Number(process.env.PORT ?? 5446) }).catch((e) => {
  console.error(`[sync-check] instrument error: ${e}`);
  process.exit(2);
});

const syncs = (p) => p.evaluate(() => window.__postrSyncs ?? 0);
const click = async (p, name, n) => {
  for (let i = 0; i < n; i += 1) { await p.getByRole('button', { name }).click(); await p.waitForTimeout(120); }
  await p.waitForTimeout(300);
};
const scrollTo = (p, where) => p.evaluate((w) => {
  const o = document.querySelector('[data-postr-canvas-outer]');
  o.scrollLeft = (o.scrollWidth - o.clientWidth) * w;
  o.scrollTop = (o.scrollHeight - o.clientHeight) * w;
}, where);
const hideSidebar = async (p) => { await p.getByRole('button', { name: 'Hide sidebar' }).click(); await p.waitForTimeout(900); };
const guides = async (p, open) => {
  const isOpen = !(await p.$('[title="Show poster guidelines"]'));
  if (isOpen === open) return;
  await p.click(open ? '[title="Show poster guidelines"]' : '[title="Hide guidelines"]');
  await p.waitForTimeout(600);
};

/** Each input: its group, whether it is D-01's designed case, a setup, and the action measured. */
const INPUTS = [
  ['scroll', 'zoomed in 20, a scroll to the far end', false, (p) => click(p, 'Zoom in', 20), (p) => scrollTo(p, 1)],
  ['scroll', 'zoomed in 20, the End key three times', false, async (p) => {
    await click(p, 'Zoom in', 20);
    await p.locator('[data-postr-canvas-outer]').click({ position: { x: 5, y: 5 } }).catch(() => {});
  }, async (p) => { for (let i = 0; i < 3; i += 1) { await p.keyboard.press('End'); await p.waitForTimeout(150); } }],
  ['sidebar', 'zoomed in 20, at the far end, Hide sidebar', false, async (p) => { await click(p, 'Zoom in', 20); await scrollTo(p, 1); }, hideSidebar],
  ['commit', 'zoomed in 20, at the far end, Fit', false, async (p) => { await click(p, 'Zoom in', 20); await scrollTo(p, 1); }, (p) => click(p, 'Fit poster to screen', 1)],
  ['commit', 'window 1280 x 800 to 1920 x 1080 at the fit', false, async () => {}, (p) => p.setViewportSize({ width: 1920, height: 1080 })],
  ...[[1280, 800, 0.5], [1280, 800, 1], [1920, 1080, 0.5], [1920, 1080, 1]].map(([w, hgt, at]) => ['zoomed', `${w} x ${hgt}, zoomed in 6, ${at === 1 ? 'at the far end' : 'in the middle'}, Hide sidebar`, false,
    async (p) => { await p.setViewportSize({ width: w, height: hgt }); await p.waitForTimeout(400); await click(p, 'Fit poster to screen', 1); await click(p, 'Zoom in', 6); await scrollTo(p, at); }, hideSidebar]),
  ...[['at the fit', 0], ['zoomed out 3', 3], ['zoomed out 10', 10]].flatMap(([label, n]) => [
    ['margin', `Hide sidebar ${label}`, false, (p) => click(p, 'Zoom out', n), hideSidebar],
    // The guidelines panel is hidden with record 29's EDITOR_EXTRAS_ENABLED.
    ['margin', `the guides panel closed ${label}`, false, async (p) => { await guides(p, true); await click(p, 'Zoom out', n); }, (p) => guides(p, false), 'EDITOR_EXTRAS_ENABLED'],
  ]),
  ['preview', 'Preview, the window grown to 2560 x 1440, Escape (D-01)', true, async (p) => {
    await p.setViewportSize({ width: 800, height: 700 }); await p.waitForTimeout(300);
    await click(p, 'Fit poster to screen', 1);
    await p.locator('[data-postr-tab]', { hasText: 'export' }).click();
    await p.getByRole('button', { name: /Preview poster/ }).click();
    await p.getByRole('button', { name: 'Back to Editor' }).waitFor();
    await p.setViewportSize({ width: 2560, height: 1440 }); await p.waitForTimeout(400);
  }, (p) => p.keyboard.press('Escape')],
  ['content', 'zoomed in 20, a block nudged 20 in down, a jump to the bottom (R1-F1)', true, async (p) => {
    await click(p, 'Fit poster to screen', 1);
    const refs = await p.locator('#poster-canvas [data-block-type="references"]').first().boundingBox();
    await p.mouse.click(refs.x + 6, refs.y + 6); await p.waitForTimeout(300);
    await click(p, 'Zoom in', 20);
    for (let i = 0; i < 40; i += 1) { await p.keyboard.press('ArrowDown'); await p.waitForTimeout(40); }
    await p.waitForTimeout(600);
  }, (p) => scrollTo(p, 1)],
];

let bad = 0;
let switchOff = 0;
console.log(`scrollbars ${h.scrollbars} · ${h.engine}${MUTANT ? ` · mutant ${MUTANT}` : ''}`);
try {
for (const [group, name, designed, setup, act, needs] of INPUTS.filter(([g]) => GROUPS.includes(g))) {
  const off = switchesOff(needs);
  if (off.length) {
    switchOff += 1;
    console.log(`  ${group.padEnd(8)} ${name.padEnd(62)} ${switchOffReason(off)}`);
    continue;
  }
  const { context, page } = await openEditor(h, { viewport: { width: 1280, height: 800 }, poster: { w: 48, h: 36 } });
  const refused = [];
  page.on('console', (m) => { if (m.type() === 'error' && /flushSync was called from inside a lifecycle method/.test(m.text())) refused.push(1); });
  try {
    await setup(page);
    await page.waitForTimeout(400);
    const before = await syncs(page);
    const refusedBefore = refused.length;
    await act(page);
    await page.waitForTimeout(900);
    const taken = (await syncs(page)) - before;
    const inCommit = refused.length - refusedBefore;
    const ok = inCommit === 0 && taken === (designed ? 1 : 0);
    if (!ok) bad += 1;
    console.log(`${ok ? '  ' : 'X '}${group.padEnd(8)} ${name.padEnd(62)} synchronous ${taken} · refused in a commit ${inCommit}`);
  } finally {
    await context.close();
  }
}
} finally {
  await h.stop();
}
console.log(`[sync-check] ${bad} input(s) off the expected path · ${SWITCH_OFF}: ${switchOff}`);
process.exit(bad ? 1 : 0);
