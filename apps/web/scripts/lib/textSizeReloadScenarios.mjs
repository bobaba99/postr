/**
 * scripts/text-size-check.mjs's reload scenarios (record 37,
 * docs/fixes/37-load-size-cap.md; RELOAD and RELOAD12 were first written as
 * information by record 33, §6 sibling f and review finding R1-F2, and moved
 * here as claims). Whether the sizes a user set are drawn the same when the
 * poster is opened again, and whether a poster stored before the typography
 * calibration is still drawn at today's sizes.
 *
 * Each enters as a user does: the top bar's A+ with the mouse, the Style
 * tab's size fields typed into with the keyboard (select all, then the
 * digits), the Layout tab's size fields with Enter and the size dialog's
 * "Change size", the Style tab's palette row and font menu, a block's
 * "Delete block" button, the autosave awaited in the fake backend, then the
 * page reloaded (the editor opening the stored poster again). The expected
 * values come from record 37's rule table, not from the app's code: a size
 * that is not the old default as a whole is drawn as stored (the size drawn
 * before the reload), and a poster holding the old default's four sizes is
 * drawn at today's defaults (title 100.8, heading 57.6, authors 36, body
 * 36 pt: poster/constants.ts DEFAULT_STYLES 14 / 8 / 5 / 5 units, the
 * numbers record 33 measured on its default poster, a document the harness
 * builds from DEFAULT_STYLES, lib/editorHarness.mjs buildDoc). A new row is
 * not that poster: it holds the posters table's column default, title 22
 * units (158.4 pt; review round 1, R37-1, `new-row-defaults`).
 *
 * Each returns `{ claims, numbers }`, a claim true when the defect is
 * observed; information scenarios return numbers only.
 */
import { MOD } from './undoKit.mjs';
import { editorLevels, storeSizes } from './textSizeRead.mjs';
import { TOL_PT, needControl, pressSize, openTab } from './textSizeKit.mjs';

/** Today's default sizes in pt, by the rule (see the header). */
export const TODAY_PT = { title: 100.8, heading: 57.6, authors: 36, body: 36 };
const LEVEL_KEYS = ['title', 'heading', 'authors', 'body'];

const styleField = (page, i) => page.locator('[data-postr-sidebar] input[type="number"][title="Font size (points)"]').nth(i);
const ptOf = (levels) => Object.fromEntries(Object.entries(levels).map(([k, v]) => [k, v ? Number(v.pt.toFixed(3)) : null]));
/** Levels drawn more than TOL_PT from `want` (pt by level; a level drawn in one and not the other counts). */
const offFrom = (levels, want) => LEVEL_KEYS.filter((k) => (levels[k] === null) !== (want[k] === null || want[k] === undefined)
  || (levels[k] && want[k] != null && Math.abs(levels[k].pt - want[k]) > TOL_PT));
const ptMap = (levels) => Object.fromEntries(LEVEL_KEYS.map((k) => [k, levels[k] ? levels[k].pt : null]));

/** Select the field's text with its own keys and type `value` one key at a time. */
async function typeInto(locator, value) {
  await locator.click({ clickCount: 3 });
  await locator.press(`${MOD}+a`);
  await locator.pressSequentially(String(value), { delay: 40 });
  await locator.page().waitForTimeout(350);
}

/** Waits until the fake backend's row satisfies `ok(data)` (the autosave), up to 12 s. */
async function savedWhen(page, ed, ok) {
  const t0 = Date.now();
  while (Date.now() - t0 < 12000 && !ok(ed.state.row?.data ?? {})) await page.waitForTimeout(200);
  return ok(ed.state.row?.data ?? {});
}

/** The store's sizes saved: the backend holds each level at the store's own value. */
const sizesSaved = (page, ed, want) => savedWhen(page, ed, (d) => LEVEL_KEYS.every((k) => String(d?.styles?.[k]?.size) === want[k]));

async function reopen(page) {
  await page.reload();
  await page.waitForSelector('#poster-canvas [data-block-id]', { timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
}

/** The poster as the store holds it, for the sibling reads (a passive import of the store). */
const storeDoc = (page) => page.evaluate(async () => {
  const m = await import('/src/stores/posterStore.ts');
  const d = m.usePosterStore.getState().doc;
  return {
    widthIn: d.widthIn, heightIn: d.heightIn, fontFamily: d.fontFamily, palette: JSON.stringify(d.palette),
    blocks: d.blocks.length, unlocked: d.blocks.filter((b) => !b.locked).map((b) => b.id),
  };
});

/**
 * RELOAD and RELOADSTYLE: a title of 170 pt and a heading of 80 pt set by
 * hand (the poster `hand-large-36`), A+ three times to a 48 pt body (226.67,
 * 106.67, 48, 48 pt: past the old ceilings of 216 and 100.8 pt), saved,
 * reloaded: every level drawn as before the reload (RELOAD). Then the Style
 * tab's heading field typed to 110 pt with no A± at all, saved, reloaded:
 * the heading drawn at 110 pt (RELOADSTYLE, the path older than record 33).
 */
export async function reloadCeiling(page, ed) {
  await needControl(page);
  for (let i = 0; i < 3; i += 1) await pressSize(page, 'up');
  const before = await editorLevels(page);
  const saved = await sizesSaved(page, ed, await storeSizes(page));
  if (!saved) throw new Error('the A+ presses never reached the backend (autosave)');
  await reopen(page);
  const after = await editorLevels(page);
  await openTab(page, 'style');
  await typeInto(styleField(page, 1), 110);
  const typed = await editorLevels(page);
  if (Math.abs((typed.heading?.pt ?? 0) - 110) > TOL_PT) throw new Error(`the heading field did not take 110 pt (drawn ${typed.heading?.pt})`);
  const saved2 = await sizesSaved(page, ed, await storeSizes(page));
  if (!saved2) throw new Error('the typed heading never reached the backend (autosave)');
  await reopen(page);
  const typedAfter = await editorLevels(page);
  const changed = offFrom(after, ptMap(before));
  const changedTyped = offFrom(typedAfter, ptMap(typed));
  return {
    claims: { RELOAD: changed.length > 0, RELOADSTYLE: changedTyped.length > 0 },
    numbers: {
      before: ptOf(before), afterReload: ptOf(after), changedOnReload: changed,
      styleTabHeading: `${typed.heading.pt.toFixed(2)} → reload → ${typedAfter.heading?.pt.toFixed(2)}`, changedTyped,
    },
  };
}

/**
 * RELOAD12 (review round 1 of record 33, R1-F2, the ordinary path): the
 * Style tab's Body field typed to 12 pt (its own minimum), A+ once (to
 * 28 pt: title 235.2, heading 134.4, authors 84 pt), saved, reloaded: every
 * level drawn as before the reload.
 */
export async function reloadSmallBody(page, ed) {
  await needControl(page);
  await openTab(page, 'style');
  await typeInto(styleField(page, 3), 12);
  const at12 = await editorLevels(page);
  await pressSize(page, 'up');
  const up = await editorLevels(page);
  const saved = await sizesSaved(page, ed, await storeSizes(page));
  if (!saved) throw new Error('the press never reached the backend (autosave)');
  await reopen(page);
  const after = await editorLevels(page);
  const changed = offFrom(after, ptMap(up));
  return { claims: { RELOAD12: changed.length > 0 }, numbers: { at12: ptOf(at12), afterUp: ptOf(up), afterReload: ptOf(after), changedOnReload: changed } };
}

/**
 * RELOADONE: the Style tab's title field typed to 432 pt, the old default's
 * title on its own (432 ÷ 7.2 is exactly 60 units; the field stores what is
 * typed, its 200 pt maximum is not enforced), saved, reloaded: the title
 * drawn at 432 pt and the other levels as before. One level at its old
 * value is not an old poster (record 37's rule: all four sizes, or none).
 */
export async function reloadOldTitleAlone(page, ed) {
  await openTab(page, 'style');
  await typeInto(styleField(page, 0), 432);
  const typed = await editorLevels(page);
  const store = await storeSizes(page);
  const saved = await sizesSaved(page, ed, store);
  if (!saved) throw new Error('the typed title never reached the backend (autosave)');
  await reopen(page);
  const after = await editorLevels(page);
  const changed = offFrom(after, ptMap(typed));
  return {
    claims: { RELOADONE: changed.length > 0 || Math.abs((after.title?.pt ?? 0) - 432) > TOL_PT },
    numbers: { storedTitleUnits: store.title, typed: ptOf(typed), afterReload: ptOf(after), changedOnReload: changed },
  };
}

/**
 * STALE and STALEEMPTY: a poster stored with the old default as a whole is
 * drawn at today's default sizes when opened (the repair kept): one a user
 * wrote into (`old-default-written`, STALE) and one as the old default
 * created it, no blocks (`old-default-empty`, STALEEMPTY: the template laid
 * out too, as for any empty poster).
 */
export function oldDefault(claim) {
  return async (page) => {
    const drawn = await editorLevels(page);
    const doc = await storeDoc(page);
    // The old default has no authors, so on the empty poster the authors
    // block draws no text: a level is compared where it is drawn, and the
    // title, a heading and the body must be drawn.
    const off = [...drawnOff(drawn, TODAY_PT), ...['title', 'heading', 'body'].filter((k) => !drawn[k]).map((k) => `${k} not drawn`)];
    const store = await storeSizes(page);
    return {
      claims: { [claim]: off.length > 0 || (claim === 'STALEEMPTY' && doc.unlocked.length === 0) },
      numbers: { drawn: ptOf(drawn), store, offTodaysDefaults: off, blocks: doc.blocks },
    };
  };
}

/** Levels drawn more than TOL_PT from `want`; a level with no text drawn is not compared. */
const drawnOff = (levels, want) => LEVEL_KEYS.filter((k) => levels[k] && Math.abs(levels[k].pt - want[k]) > TOL_PT);

/**
 * Information (record 37's rule, a consequence named in its section 7): an
 * old poster whose body was changed by hand (60 / 28 / 22 / 9 units) is not
 * the old default as a whole, so every level is drawn as stored.
 */
export async function oldDefaultOneEdited(page) {
  const drawn = await editorLevels(page);
  return { numbers: { drawn: ptOf(drawn), store: await storeSizes(page), offStored: drawnOff(drawn, { title: 432, heading: 201.6, authors: 158.4, body: 64.8 }) } };
}

/**
 * Information, siblings of the cause (record 37 §6): other settings a user
 * makes, saved and reloaded. The Layout tab's width typed to 100 in and its
 * height to 10 in (the fields' own bounds), each with Enter and the dialog's
 * "Change size"; the Style tab's palette row "Nature / Biology" and its font
 * menu set to DM Sans. Each read from the store before and after the
 * reload.
 */
export async function reloadSiblings(page, ed) {
  await openTab(page, 'layout');
  for (const [label, value] of [['Poster width in inches', '100'], ['Poster height in inches', '10']]) {
    const f = page.locator(`input[aria-label="${label}"]`).first();
    await typeInto(f, value);
    await f.press('Enter');
    await page.getByRole('button', { name: 'Change size', exact: true }).click({ timeout: 5000 });
    await page.waitForTimeout(500);
  }
  await openTab(page, 'style');
  await page.getByRole('button', { name: /Nature \/ Biology/ }).first().click();
  await page.waitForTimeout(300);
  await page.locator('select', { has: page.locator('option[value="Source Sans 3"]') }).selectOption('DM Sans');
  await page.waitForTimeout(300);
  const before = await storeDoc(page);
  const saved = await savedWhen(page, ed, (d) => d.widthIn === before.widthIn && d.heightIn === before.heightIn && d.fontFamily === before.fontFamily && JSON.stringify(d.palette) === before.palette);
  await reopen(page);
  const after = await storeDoc(page);
  const changed = ['widthIn', 'heightIn', 'fontFamily', 'palette'].filter((k) => before[k] !== after[k]);
  return { numbers: { saved, before: `${before.widthIn}×${before.heightIn} ${before.fontFamily}`, after: `${after.widthIn}×${after.heightIn} ${after.fontFamily}`, paletteKept: before.palette === after.palette, changedOnReload: changed } };
}

/** Information, a sibling: a stored font the font list does not have is opened and reloaded; what the store holds and what the canvas asks for. */
export async function fontNotListed(page) {
  const read = () => page.evaluate(async () => {
    const m = await import('/src/stores/posterStore.ts');
    const el = document.querySelector('#poster-canvas [data-block-type="text"] [contenteditable]');
    return { store: m.usePosterStore.getState().doc.fontFamily, css: el ? getComputedStyle(el).fontFamily : null };
  });
  const opened = await read();
  await reopen(page);
  const reloaded = await read();
  return { numbers: { opened: opened.store, css: opened.css, reloaded: reloaded.store } };
}

/**
 * Information, a sibling: every block a user can delete deleted (each
 * selected with a click, then its "Delete block" button), saved, reloaded:
 * whether the starting template comes back (the editor page lays one out
 * when a stored poster has no blocks) and whether the palette is kept.
 */
export async function reloadEmptied(page, ed) {
  const start = await storeDoc(page);
  await openTab(page, 'style');
  await page.getByRole('button', { name: /Nature \/ Biology/ }).first().click();
  await page.waitForTimeout(300);
  for (let i = 0; i < 60; i += 1) {
    const { unlocked } = await storeDoc(page);
    if (unlocked.length === 0) break;
    const frame = page.locator(`#poster-canvas [data-block-id="${unlocked[0]}"]`);
    await frame.click({ position: { x: 4, y: 4 }, force: true });
    await page.waitForTimeout(150);
    const del = page.locator('#poster-canvas button[title="Delete block"]').first();
    if (await del.count()) await del.click();
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  const before = await storeDoc(page);
  const saved = await savedWhen(page, ed, (d) => Array.isArray(d.blocks) && d.blocks.length === before.blocks);
  await reopen(page);
  const after = await storeDoc(page);
  return { numbers: { saved, lockedAtStart: start.blocks - start.unlocked.length, deletableLeft: before.unlocked.length, blocksBefore: before.blocks, blocksAfter: after.blocks, templateBack: after.unlocked.length > 0, paletteKept: before.palette === after.palette } };
}
