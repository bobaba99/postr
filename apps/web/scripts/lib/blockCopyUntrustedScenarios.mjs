/**
 * The untrusted payloads of record 35's rule C6 (docs/fixes/35-block-copy.md;
 * bounded-designs §3.3 table B order 1), for scripts/canvas-paste-check.mjs
 * (`--only C-x`; moved out of lib/blockCopyScenarios.mjs at review round 1,
 * which keeps that file under 800 lines; the claims are listed there: X,
 * B1N, C3, MSG, N, U). Each payload is written by hand in the format of the
 * rule table (another page could put such HTML on the clipboard), put on the
 * clipboard by record 32's copy source (a real ⌘C), then pasted by a real ⌘V
 * with nothing in edit mode. A valid payload pastes its blocks, cleaned; an
 * invalid one pastes nothing and says so; nothing harmful in any case.
 *
 * Since review round 1 (R1-1): `C-x-cells-total`, two tables of 50 × 50
 * cells, each within a table's bound, over the payload's total of 2 500
 * cells (nothing pasted); `C-x-one-big-table`, one such table, at both
 * bounds (pasted); and the information scenario `C-x-i-big-texts`, twenty
 * texts of 100 000 characters (the JSON's cap of 2 000 000 characters), timed.
 */
import { MOD, clickAway } from './undoKit.mjs';
import { copyToClipboard } from './tablePasteScenarios.mjs';
import { IMAGES, addedBlocks, eventCount, fileOf, othersChanged, settledChange, sheetUnits, storedBlocks, storedEquals } from './canvasPasteKit.mjs';
import { storeFirst } from './canvasPasteScenarios.mjs';
import { pageNow, pasteCarried, payloadHtml, plainBlock, round, short, toastsSince } from './blockCopyKit.mjs';

/** Markup an attacker would put in a pasted text: each sets window.__zqPwned if it runs. */
const EVIL = '<img src=x onerror="window.__zqPwned=(window.__zqPwned||0)+1">ZQ <b>bold</b><script>window.__zqPwned=(window.__zqPwned||0)+1</script>'
  + '<a href="javascript:window.__zqPwned=1">ZQLINK</a><svg onload="window.__zqPwned=1"></svg><iframe srcdoc="<script>parent.__zqPwned=1</script>"></iframe><style>body{display:none}</style>';
/** Markup the sanitizer drops (anything else in a stored text is the allowlist's). */
const UNSAFE = /<script|onerror|onload|javascript:|<img|<svg|<iframe|<a[\s>]|<style|srcdoc/i;
/** Another account's id (a file seeded under it) and an outside host that must never be asked. */
const OTHER = '00000000-0000-4000-8000-0000000000aa';
const EVIL_HOST = 'zq-evil.invalid';

const block = (id, type, x, y, w, h, fields = {}) => plainBlock(id, type, x, y, w, h, fields);
/** A table of 50 × 50 empty cells (a table's bound, 2 500 cells). */
const bigTable = (id, x) => block(id, 'table', x, 40, 400, 300, { tableData: { rows: 50, cols: 50, cells: Array(2500).fill(''), colWidths: null, borderPreset: 'apa' } });

/** The crafted payloads: `blocks(s)` builds them for the session; `valid` how many copies the rule makes (0: nothing). */
const UNTRUSTED = {
  markup: {
    valid: 4,
    blocks: () => [
      block('zqx1', 'text', 20, 120, 150, 60, { content: EVIL }),
      block('zqx2', 'heading', 20, 100, 150, 20, { content: 'ZQH', prompt: '"><img src=x onerror="window.__zqPwned=1">' }),
      block('zqx3', 'image', 200, 120, 100, 80, { caption: EVIL, note: EVIL }),
      block('zqx4', 'table', 320, 120, 150, 60, { tableData: { rows: 1, cols: 2, cells: [EVIL, '<script>window.__zqPwned=1</script>ZQ'], colWidths: null, borderPreset: 'apa' }, caption: EVIL, note: EVIL }),
    ],
    message: null,
  },
  sources: {
    valid: 7,
    message: /7 images couldn.t be copied/i,
    blocks: (s) => [
      `javascript:window.__zqPwned=1`,
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" onload="window.__zqPwned=1"/>',
      `http://${EVIL_HOST}/a.png`,
      `https://${EVIL_HOST}/b.png`,
      'storage://../../etc/passwd',
      `storage://${OTHER}/${OTHER}/theirs.png`,
      `storage://${s.uid}/${s.id}/missing-file.png`,
    ].map((src, i) => block(`zqs${i}`, 'image', 20 + i * 60, 150, 50, 40, { imageSrc: src })),
  },
  hugeNumber: { valid: 0, message: /can.t be pasted/i, blocks: () => [block('zqn1', 'text', 1e308, 10, 100, 40, { content: 'ZQ' })] },
  negativeSize: { valid: 0, message: /can.t be pasted/i, blocks: () => [block('zqn2', 'text', 10, 10, -5, 40, { content: 'ZQ' })] },
  numberAsText: { valid: 0, message: /can.t be pasted/i, blocks: () => [block('zqn3', 'text', '10', 10, 100, 40, { content: 'ZQ' })] },
  unknownType: { valid: 0, message: /can.t be pasted/i, blocks: () => [block('zqt1', 'iframe', 10, 10, 100, 40, { content: 'ZQ' })] },
  chartType: { valid: 0, message: /can.t be pasted/i, blocks: () => [block('zqt2', 'chart', 10, 10, 100, 40, { chartSpec: { version: 1 } })] },
  unknownField: { valid: 0, message: /can.t be pasted/i, blocks: () => [block('zqf1', 'text', 10, 10, 100, 40, { content: 'ZQ', locked: true })] },
  many: { valid: 0, message: /can.t be pasted/i, blocks: () => Array.from({ length: 10000 }, (_, i) => block(`zqm${i}`, 'text', 10, 10, 100, 40, { content: 'ZQ' })) },
  version: { valid: 0, message: /can.t be pasted/i, version: 2, blocks: () => [block('zqv1', 'text', 10, 10, 100, 40, { content: 'ZQ' })] },
  json: { valid: 0, message: /can.t be pasted/i, raw: '{"v":1,"blocks":[{"id":"zq",' },
  // R1-1: two tables, each within a table's bound (50 × 50 = 2 500 cells),
  // 5 000 cells together: over the payload's total (2 500 cells in all).
  cellsTotal: { valid: 0, message: /can.t be pasted/i, blocks: () => [0, 1].map((i) => bigTable(`zqbt${i}`, 20 + i * 10)) },
  // One such table: at both bounds, pasted.
  oneBigTable: { valid: 1, message: null, timeDrawn: true, blocks: () => [bigTable('zqbt0', 20)] },
  // Information (R1-1): twenty texts of 100 000 characters, the JSON's cap.
  bigTexts: {
    valid: 20, message: null, timeDrawn: true,
    blocks: () => Array.from({ length: 20 }, (_, i) => block(`zqbx${i}`, 'text', 10 + (i % 5) * 90, 20 + Math.floor(i / 5) * 80, 80, 60, { content: `ZQBIG${i} ${'lorem ipsum '.repeat(8333)}`.slice(0, 99_000) })),
  },
  keepOnSheet: {
    valid: 2,
    message: null,
    blocks: () => [block('zqk1', 'text', 470, 340, 100, 40, { content: 'ZQKEEP' }), block('zqk2', 'text', 10, 10, 600, 40, { content: 'ZQWIDE' })],
  },
};

/**
 * C6: a payload written by hand (another page's clipboard) put on the
 * clipboard by the copy source's ⌘C, then ⌘V with nothing in edit mode.
 * A valid payload pastes its blocks, cleaned; an invalid one pastes nothing
 * and says so; nothing harmful in any case (X).
 */
async function runUntrusted(h, s, sc) {
  await storeFirst(s);
  const kind = UNTRUSTED[sc.kind];
  if (sc.kind === 'sources') s.state.objects.set(`${OTHER}/${OTHER}/theirs.png`, { bytes: fileOf(IMAGES.A).bytes, type: 'image/png', t: Date.now() });
  const list = kind.blocks ? kind.blocks(s) : null;
  const html = kind.raw ? payloadHtml(kind.raw) : payloadHtml({ v: kind.version ?? 1, blocks: list });
  await s.page.evaluate(() => { window.__zqPwned = 0; });
  if (!(await copyToClipboard(s.page, { 'text/html': html, 'text/plain': 'ZQ crafted words' }))) throw new Error('precondition: the payload copy did not run');
  await clickAway(s.page);
  const before = storedBlocks(s.state, s.id);
  const from = await eventCount(s.page);
  const t0 = await pageNow(s.page);
  const abortedFrom = s.state.aborted.length;
  const errorsFrom = s.state.errors.length;
  const drawnBefore = await s.page.evaluate(() => document.querySelectorAll('#poster-canvas [data-block-id]').length);
  const ms0 = Date.now();
  await s.page.keyboard.press(`${MOD}+v`);
  let msToDrawn = null;
  if (kind.timeDrawn) {
    const drew = await s.page.waitForFunction(([n, k]) => document.querySelectorAll('#poster-canvas [data-block-id]').length >= n + k, [drawnBefore, kind.valid], { timeout: 120000, polling: 50 }).then(() => true).catch(() => false);
    msToDrawn = drew ? Date.now() - ms0 : 'not drawn in 120 s';
  }
  const changed = await settledChange(s.state, s.id, before, { timeout: kind.valid ? (kind.timeDrawn ? 120000 : 15000) : 4000, quiet: 1200 });
  const msToSettle = Date.now() - ms0;
  await s.page.waitForTimeout(600);
  const after = storedBlocks(s.state, s.id);
  const added = addedBlocks(before, after);
  const toasts = await toastsSince(s.page, t0);
  // Information: from ⌘V to the first toast, on the page's clock (an invalid payload's answer; 10 000 blocks must not hold the page).
  const firstToast = await s.page.evaluate((from) => (window.__zqToastTexts ?? []).find((x) => x.t >= from)?.t ?? null, t0);
  const msToToast = firstToast === null ? null : firstToast - t0;
  const pwned = await s.page.evaluate(() => window.__zqPwned || 0);
  const drawnBad = await s.page.evaluate((host) => {
    const c = document.getElementById('poster-canvas');
    return [...c.querySelectorAll('img')].filter((i) => /javascript:|zq-evil|^data:image\/svg/.test(i.getAttribute('src') ?? '')).length + c.querySelectorAll('[onerror],[onload],script,iframe').length;
  }, EVIL_HOST);
  const x = [];
  if (pwned) x.push(`a script ran (${pwned})`);
  if (drawnBad) x.push(`${drawnBad} unsafe elements drawn`);
  for (const b of added) {
    const texts = [b.content, b.caption, b.note, b.prompt, ...(b.tableData?.cells ?? [])].filter((t) => typeof t === 'string');
    const bad = texts.filter((t) => UNSAFE.test(t));
    if (bad.length) x.push(`${b.type} stores markup: ${bad[0].slice(0, 60)}`);
    if (b.imageSrc !== null && b.imageSrc !== undefined && !String(b.imageSrc).startsWith(`storage://${s.uid}/${s.id}/`)) x.push(`${b.type} imageSrc ${String(b.imageSrc).slice(0, 50)}`);
    for (const k of ['x', 'y', 'w', 'h']) if (!Number.isFinite(b[k]) || Math.abs(b[k]) > 10000) x.push(`${k} ${b[k]}`);
  }
  const asked = s.state.aborted.slice(abortedFrom).filter((u) => u.includes(EVIL_HOST));
  if (asked.length) x.push(`asked ${asked[0]}`);
  const errors = s.state.errors.slice(errorsFrom);
  if (errors.length) x.push(`page error: ${errors[0].slice(0, 80)}`);
  const claims = { X: x.length > 0, N: othersChanged(before, after, []).length > 0 };
  const numbers = { kind: sc.kind, added: added.length, msToSettle, msToToast, ...(kind.timeDrawn ? { msToDrawn, storedRowChars: JSON.stringify(after).length, heapMB: await s.page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null)) } : {}), toasts: toasts.join(' | ') || 'none', xProblems: x.join(' ; ') || 'none' };
  if (kind.valid === 0) {
    claims.B1N = added.length > 0;
    claims.MSG = !toasts.some((t) => kind.message.test(t));
  } else {
    if (kind.message) claims.MSG = !toasts.some((t) => kind.message.test(t));
    const p = [];
    if (added.length !== kind.valid) p.push(`${added.length} added, want ${kind.valid}`);
    if (sc.kind === 'sources' && added.some((b) => b.imageSrc !== null)) p.push(`image sources kept: ${added.filter((b) => b.imageSrc !== null).map((b) => short(b.imageSrc)).join(', ')}`);
    if (sc.kind === 'markup') {
      const t = added.find((b) => b.type === 'text');
      if (!t || !/ZQ <b>bold<\/b>/.test(t.content)) p.push(`the text's own words and bold not kept: ${JSON.stringify(t?.content ?? null).slice(0, 80)}`);
    }
    if (sc.kind === 'oneBigTable') {
      const t = added[0]?.tableData;
      if (!t || t.rows !== 50 || t.cols !== 50 || t.cells.length !== 2500) p.push(`the table is ${t?.rows} × ${t?.cols}, ${t?.cells?.length} cells, want 50 × 50`);
    }
    if (sc.kind === 'keepOnSheet') {
      const sheet = sheetUnits(s.state, s.id);
      const k1 = added.find((b) => b.content === 'ZQKEEP');
      const k2 = added.find((b) => b.content === 'ZQWIDE');
      if (!k1 || k1.x !== sheet.w - 100 || k1.y !== sheet.h - 40) p.push(`ZQKEEP at (${k1?.x}, ${k1?.y}), want (${sheet.w - 100}, ${sheet.h - 40})`);
      if (!k2 || k2.x !== 0 || k2.y !== 10) p.push(`ZQWIDE at (${k2?.x}, ${k2?.y}), want (0, 10)`);
    }
    claims.C3 = p.length > 0;
    numbers.c3Problems = p.join(' ; ') || 'none';
    numbers.placed = added.map((b) => `${b.type}(${round(b.x)},${round(b.y)})${b.imageSrc ? ` ${short(b.imageSrc)}` : ''}`).join(' ');
    if (added.length) {
      await s.page.keyboard.press(`${MOD}+z`);
      claims.U = !(await storedEquals(s.state, s.id, before, 10000));
    }
  }
  numbers.stored = changed;
  return { claims, numbers, carried: await pasteCarried(s, from, { html: true }) };
}

export const UNTRUSTED_SCENARIOS = [
  { id: 'C-x-markup', run: runUntrusted, kind: 'markup', how: 'X, C3: a valid payload written by hand whose text, heading prompt, image caption and note and table cells carry a script, an img with onerror, a javascript: link, an svg onload, an iframe and a style sheet: four blocks pasted, every text cleaned by the editor\'s sanitizer, nothing runs' },
  { id: 'C-x-sources', run: runUntrusted, kind: 'sources', how: 'X, C3, MSG: seven image blocks whose sources are javascript:, an svg data: URL, http: and https: addresses, a path with "..", another account\'s file and a missing file: seven empty image blocks, one toast, no request to the outside host' },
  { id: 'C-x-huge-number', run: runUntrusted, kind: 'hugeNumber', how: 'B1N, X, MSG: a block at x 1e308: nothing pasted, a toast' },
  { id: 'C-x-negative-size', run: runUntrusted, kind: 'negativeSize', how: 'B1N: a block 5 units wide below zero: nothing pasted' },
  { id: 'C-x-number-as-text', run: runUntrusted, kind: 'numberAsText', how: 'B1N: a block whose x is the string "10": nothing pasted' },
  { id: 'C-x-unknown-type', run: runUntrusted, kind: 'unknownType', how: 'B1N: a block of type "iframe": nothing pasted' },
  { id: 'C-x-chart', run: runUntrusted, kind: 'chartType', how: 'B1N: a chart block (charts are not copied, D1): nothing pasted' },
  { id: 'C-x-unknown-field', run: runUntrusted, kind: 'unknownField', how: 'B1N: a text block carrying "locked": nothing pasted' },
  { id: 'C-x-many', run: runUntrusted, kind: 'many', how: 'B1N: 10 000 blocks: nothing pasted, the page not held' },
  { id: 'C-x-version', run: runUntrusted, kind: 'version', how: 'B1N: version 2: nothing pasted' },
  { id: 'C-x-json', run: runUntrusted, kind: 'json', how: 'B1N: malformed JSON in the mark: nothing pasted' },
  { id: 'C-x-keep-on-sheet', run: runUntrusted, kind: 'keepOnSheet', how: 'C3: a block at x 470 (100 wide) and y 340 (40 high) on the 480 × 360 sheet lands at (380, 320); one 600 wide at x 0' },
  { id: 'C-x-cells-total', run: runUntrusted, kind: 'cellsTotal', how: 'B1N, X, MSG (R1-1): two tables of 50 × 50 empty cells, each within a table\'s bound, 5 000 cells together, over the payload\'s total of 2 500 cells: nothing pasted, a toast' },
  { id: 'C-x-one-big-table', run: runUntrusted, kind: 'oneBigTable', how: 'C3, X (R1-1): one table of 50 × 50 empty cells, at a table\'s bound and the payload\'s total: pasted, timed to its drawing' },
  { id: 'C-x-i-big-texts', run: runUntrusted, kind: 'bigTexts', info: true, how: 'INFORMATION (R1-1): twenty texts of nearly 100 000 characters each (the JSON near its cap of 2 000 000 characters): how long until they are stored and drawn' },
];
