/**
 * The user's actions for scripts/text-size-check.mjs (record 33): the top
 * bar's buttons pressed with the mouse (Playwright's real pointer events),
 * the sidebar's tabs and fields, and the checks of a level's size against
 * the rule. Nothing here calls the app's store; reads are passive
 * (lib/textSizeRead.mjs).
 */
import { control, editorLevels, storeSizes, nextBody } from './textSizeRead.mjs';

export const NAMES = { up: 'Increase text size', down: 'Decrease text size' };
/** Points: a drawn level against the rule (the brief's 0.01 pt). */
export const TOL_PT = 0.01;
export const SETTLE = 250;

/** The control is not on this tree (before the fix): the scenario has nothing to press. */
export class NoControl extends Error {
  constructor() { super('no text-size control in the top bar (claim TB)'); }
}

const button = (page, dir) => page.locator(`[data-postr-editor-topbar] button[aria-label="${NAMES[dir]}"]`).first();

/** Throws NoControl when the top bar has no A− / A+. */
export async function needControl(page) {
  const c = await control(page);
  if (!c.up || !c.down) throw new NoControl();
  return c;
}

/** Press A+ (`up`) or A− (`down`) with the mouse; `force` presses a disabled one. */
export async function pressSize(page, dir, { force = false } = {}) {
  await button(page, dir).click({ force });
  await page.waitForTimeout(SETTLE);
}

/** The top bar's Undo or Redo, with the mouse. */
export async function pressHistory(page, name) {
  await page.locator('[data-postr-history-buttons] button[aria-label="' + name + '"]').click();
  await page.waitForTimeout(SETTLE);
}

/** A sidebar tab by its visible label. */
export async function openTab(page, label) {
  await page.locator('button[data-postr-tab]').filter({ hasText: new RegExp(`^${label}`) }).first().click();
  await page.waitForTimeout(350);
}

/** Everything one reading takes: drawn levels, the control, the store's sizes. */
export async function snapshot(page) {
  const [levels, ctl, store] = await Promise.all([editorLevels(page), control(page), storeSizes(page)]);
  return { levels, ctl, store };
}

/**
 * The rule's expected sizes at body `bodyPt`, from the poster's drawn start
 * `start` (levels in pt): the body at `bodyPt`, every other level its start
 * times bodyPt ÷ the start's body (ratios to the start, not chained).
 */
export function expectedAt(start, bodyPt, startBodyPt = start.body?.pt) {
  const k = bodyPt / startBodyPt;
  const out = {};
  for (const [lv, v] of Object.entries(start)) out[lv] = v ? (lv === 'body' ? bodyPt : v.pt * k) : null;
  return out;
}

/** Levels drawn more than TOL_PT from `expected` (and a level drawn by its blocks at two sizes). */
export function sizeMisses(levels, expected) {
  const out = [];
  for (const [lv, want] of Object.entries(expected)) {
    const got = levels[lv];
    if (want === null || !got) continue;
    if (Math.abs(got.pt - want) > TOL_PT) out.push(`${lv} ${got.pt.toFixed(4)} vs ${want.toFixed(4)}`);
    if (got.spread > TOL_PT) out.push(`${lv} drawn at sizes ${got.spread.toFixed(4)} pt apart`);
  }
  return out;
}

/** What the rule says the control shows at body `pt`: its label and which buttons are disabled. */
export function controlMisses(ctl, pt) {
  const out = [];
  const label = `Body ${Math.round(pt)} pt`;
  if (ctl.label !== label) out.push(`label "${ctl.label}" vs "${label}"`);
  const upOff = nextBody(pt, 1) === null;
  const downOff = nextBody(pt, -1) === null;
  if (ctl.up.disabled !== upOff) out.push(`A+ ${ctl.up.disabled ? 'disabled' : 'enabled'} at ${pt.toFixed(2)} pt`);
  if (ctl.down.disabled !== downOff) out.push(`A− ${ctl.down.disabled ? 'disabled' : 'enabled'} at ${pt.toFixed(2)} pt`);
  if (upOff && !/48 pt/.test(ctl.up.title)) out.push(`disabled A+'s title "${ctl.up.title}" names no 48 pt`);
  if (downOff && !/28 pt/.test(ctl.down.title)) out.push(`disabled A−'s title "${ctl.down.title}" names no 28 pt`);
  if (!ctl.up.title || !ctl.down.title) out.push('a button without a title');
  return out;
}

/** The store's four sizes equal, exactly (their shortest round-trip strings). */
export const sameSizes = (a, b) => ['title', 'heading', 'authors', 'body'].every((k) => a[k] === b[k]);
export const sizeDiff = (a, b) => ['title', 'heading', 'authors', 'body'].filter((k) => a[k] !== b[k]).map((k) => `${k} ${a[k]}→${b[k]}`);
