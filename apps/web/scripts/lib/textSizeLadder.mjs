/**
 * scripts/text-size-check.mjs's ladder scenario (record 33): on one poster,
 * from its start, A+ (or A− when A+ is off) once, Undo, Redo, Undo; then
 * A+ to the top, A− to the bottom and A+ back to the first size reached,
 * every press a mouse click on the top bar's button. At every size: each
 * level as drawn against the rule, the control's label and buttons, and
 * the store's sizes against the first visit of that size (the exact round
 * trip). At the top and the bottom, for the posters marked `extremes`, what
 * the sheet then holds (information): overlaps, blocks past the sheet, and
 * what Issues lists.
 */
import { readSheetInPage, overlapsOf } from './arrangeRead.mjs';
import { issueRows } from './simplifyKit.mjs';
import { BODY_SIZES, PT_PER_UNIT, captionLevel, nextBody } from './textSizeRead.mjs';
import {
  needControl, pressSize, pressHistory, openTab, snapshot, expectedAt, sizeMisses, controlMisses, sameSizes, sizeDiff,
} from './textSizeKit.mjs';

const LADDER_MAX = 20;

/** What the sheet holds, for the information reading: overlaps, blocks past it, Issues' rows about them. */
async function sheetState(page) {
  const sheet = await page.evaluate(readSheetInPage);
  const past = sheet.blocks.filter((b) => b.y + b.h > sheet.H + 0.5 || b.x + b.w > sheet.W + 0.5).map((b) => `${b.type}+${(Math.max(b.y + b.h - sheet.H, b.x + b.w - sheet.W) / 10).toFixed(2)}in`);
  await openTab(page, 'issues');
  const rows = await issueRows(page);
  await openTab(page, 'layout');
  const about = rows.filter((r) => /overlap|bottom margin|off the|outside|past|beyond|canvas/i.test(`${r.category} ${r.message}`));
  return { overlaps: overlapsOf(sheet).length, past, issues: about.map((r) => `${r.category}: ${r.message}`.slice(0, 90)), issueRows: rows.length };
}

/**
 * The ladder on one poster. `open()` opens it; returns `{ claims, numbers }`
 * (a claim is true when the defect is observed).
 */
export async function ladder(page, poster) {
  const claims = { S: false, L: false, RT: false, U: false, R: false, DX: false };
  const numbers = { presses: 0, rungs: [], misses: [], captions: [] };
  await needControl(page);
  const start = await snapshot(page);
  // Which size is next is decided on the body as stored (a passive read):
  // an engine serialises a computed size to a few digits (WebKit drew 40 pt
  // as 39.99996), which would put a body ON a size just below it. The sizes
  // expected on the sheet are ratios to the drawn start (`drawn0`); a poster
  // with no text block (the empty template) draws no body, and its drawn
  // start is the stored one.
  const b0 = Number(start.store.body) * PT_PER_UNIT;
  const drawn0 = start.levels.body?.pt ?? b0;
  numbers.start = Object.fromEntries(Object.entries(start.levels).map(([k, v]) => [k, v ? Number(v.pt.toFixed(4)) : null]));
  const extremes = {};
  if (poster.extremes) extremes.start = await sheetState(page);

  const seen = new Map();
  const onTable = BODY_SIZES.some((s) => Math.abs(s - b0) < 1e-6);
  let revisits = 0;
  if (onTable) seen.set(Math.round(b0), start.store);
  let bodyPt = b0;
  const miss = (claim, text) => { claims[claim] = true; numbers.misses.push(`${claim} ${text}`); };
  const check = async (label) => {
    const s = await snapshot(page);
    const bodyNow = s.levels.body?.pt ?? Number(s.store.body) * PT_PER_UNIT;
    for (const m of sizeMisses(s.levels, expectedAt(start.levels, bodyPt, drawn0))) miss('S', `${label}: ${m}`);
    for (const m of controlMisses(s.ctl, bodyPt)) miss('L', `${label}: ${m}`);
    const key = Math.round(bodyPt);
    if (seen.has(key)) {
      revisits += 1;
      if (!sameSizes(seen.get(key), s.store)) miss('RT', `${label} at ${key} pt: ${sizeDiff(seen.get(key), s.store).join(', ')}`);
    } else seen.set(key, s.store);
    numbers.rungs.push(`${label}:${bodyNow.toFixed(2)}`);
    const cap = (await captionLevel(page)).caption;
    if (cap) numbers.captions.push(`${Math.round(bodyPt)}:${cap.pt.toFixed(2)}`);
    return s;
  };
  for (const m of controlMisses(start.ctl, b0)) miss('L', `start: ${m}`);

  // One press, Undo, Redo, Undo (the brief's rule 4).
  const first = nextBody(b0, 1) !== null ? 'up' : 'down';
  await pressSize(page, first);
  numbers.presses += 1;
  const afterFirst = await snapshot(page);
  await pressHistory(page, 'Undo');
  const undone = await snapshot(page);
  if (!sameSizes(undone.store, start.store)) miss('U', `one Undo: ${sizeDiff(start.store, undone.store).join(', ')}`);
  for (const m of sizeMisses(undone.levels, expectedAt(start.levels, drawn0, drawn0))) miss('U', `drawn after Undo: ${m}`);
  await pressHistory(page, 'Redo');
  const redone = await snapshot(page);
  if (!sameSizes(redone.store, afterFirst.store)) miss('R', `Redo: ${sizeDiff(afterFirst.store, redone.store).join(', ')}`);
  await pressHistory(page, 'Undo');

  // A disabled button pressed anyway changes nothing.
  const pressDisabled = async (dir) => {
    const before = await snapshot(page);
    await pressSize(page, dir, { force: true });
    const after = await snapshot(page);
    if (!sameSizes(before.store, after.store)) miss('DX', `${dir} pressed while disabled: ${sizeDiff(before.store, after.store).join(', ')}`);
  };

  // Up to the top.
  let firstRung = null;
  for (let i = 0; i < LADDER_MAX && nextBody(bodyPt, 1) !== null; i += 1) {
    await pressSize(page, 'up');
    numbers.presses += 1;
    bodyPt = nextBody(bodyPt, 1);
    firstRung ??= bodyPt;
    await check(`+${bodyPt}`);
  }
  if (poster.extremes) extremes.top = { body: bodyPt, ...(await sheetState(page)) };
  await pressDisabled('up');
  // Down to the bottom.
  for (let i = 0; i < LADDER_MAX && nextBody(bodyPt, -1) !== null; i += 1) {
    await pressSize(page, 'down');
    numbers.presses += 1;
    bodyPt = nextBody(bodyPt, -1);
    firstRung ??= bodyPt;
    await check(`-${bodyPt}`);
  }
  if (poster.extremes) extremes.bottom = { body: bodyPt, ...(await sheetState(page)) };
  await pressDisabled('down');
  // Back up to the first size reached (the start, when it is one of the six).
  const home = onTable ? Math.round(b0) : firstRung;
  for (let i = 0; i < LADDER_MAX && bodyPt < home - 1e-6; i += 1) {
    await pressSize(page, 'up');
    numbers.presses += 1;
    bodyPt = nextBody(bodyPt, 1);
    await check(`+${bodyPt}`);
  }
  numbers.home = home;
  numbers.revisits = revisits;
  if (poster.extremes) numbers.extremes = extremes;
  numbers.misses = numbers.misses.slice(0, 12);
  return { claims, numbers };
}
