/**
 * scripts/text-size-check.mjs's scenarios for the edges review round 1 of
 * record 33 found (docs/fixes/33-text-size.md §9, R1-F1 to R1-F3): a body
 * that is not a size, a level that is not a size, and the two round trips
 * the anchor does not keep exact. Folded in from the reviewer's probe.
 * (R1-F2's reload, RELOAD12, moved to lib/textSizeReloadScenarios.mjs as a
 * claim of record 37.)
 * Each enters as a user does: the Style tab's Body field cleared with its
 * own keys (select all, Backspace), the top bar's buttons with the mouse,
 * the top bar's Undo, a reload. The expected sizes come from the record's
 * rule table (rows 7 and 8 of poster/textSize.ts's header: a body that is
 * not a size is below every size, so A+ sets it to 28 pt and leaves the
 * other levels; a level that is not a size is left as it is), applied to
 * the sizes drawn before the press.
 */
import { MOD } from './undoKit.mjs';
import { PT_PER_UNIT, control, editorLevels, storeSizes } from './textSizeRead.mjs';
import { TOL_PT, needControl, pressSize, pressHistory, openTab, sameSizes, sizeDiff } from './textSizeKit.mjs';

const styleField = (page, i) => page.locator('[data-postr-sidebar] input[type="number"][title="Font size (points)"]').nth(i);
const ptOf = (levels) => Object.fromEntries(Object.entries(levels).map(([k, v]) => [k, v ? Number(v.pt.toFixed(3)) : null]));
const moved = (a, b, keys) => keys.filter((k) => (a[k] === null) !== (b[k] === null) || (a[k] && Math.abs(a[k].pt - b[k].pt) > TOL_PT));
const finite = (store) => ['title', 'heading', 'authors', 'body'].filter((k) => store[k] !== 'null' && !Number.isFinite(Number(store[k])));

/** What the rule table says the control shows for a body that is not a size: no number, A+ to 28 pt, A− greyed and not promising a size. */
function noSizeMisses(c) {
  const out = [];
  if (!c.up || !c.down) return ['no control in the top bar'];
  if (/\d/.test(c.label ?? '')) out.push(`label "${c.label}" shows a number`);
  if (c.up.disabled) out.push('A+ disabled');
  if (!/28 pt/.test(c.up.title)) out.push(`A+'s title "${c.up.title}" names no 28 pt`);
  if (!c.down.disabled) out.push('A− enabled');
  // An enabled A−'s title says where a press takes the body ("Decrease text size (body to N pt)"); a greyed one must not.
  if (/^Decrease text size \(body to/.test(c.down.title)) out.push(`A−'s title "${c.down.title}" promises a size`);
  return out;
}

/** After A+ from a body that is not a size: the body drawn at 28 pt, the other levels drawn as before, the label "Body 28 pt", every stored size a number. */
function upMisses(before, after, c, store) {
  const out = [];
  if (!after.body || Math.abs(after.body.pt - 28) > TOL_PT) out.push(`body drawn ${after.body?.pt ?? 'nowhere'} vs 28`);
  const others = moved(before, after, ['title', 'heading', 'authors']);
  if (others.length) out.push(`moved: ${others.join(', ')}`);
  if (c.label !== 'Body 28 pt') out.push(`label "${c.label}"`);
  const bad = finite(store);
  if (bad.length) out.push(`not a number: ${bad.join(', ')}`);
  return out;
}

/**
 * NOSIZE / NOSIZEUP / NOSIZEU: the Style tab's Body field cleared (select
 * all, Backspace), as a user empties it; then A− (nothing), A+ (28 pt, the
 * other levels kept), the top bar's Undo (the cleared body again).
 */
export async function clearedBody(page) {
  await needControl(page);
  await openTab(page, 'style');
  const f = styleField(page, 3);
  await f.click({ clickCount: 3 });
  await f.press(`${MOD}+a`);
  await f.press('Backspace');
  await page.waitForTimeout(350);
  const cleared = { store: await storeSizes(page), levels: await editorLevels(page), ctl: await control(page), field: await f.inputValue() };
  const shown = noSizeMisses(cleared.ctl);
  await pressSize(page, 'down', { force: true });
  const afterDown = await storeSizes(page);
  await pressSize(page, 'up');
  const up = { store: await storeSizes(page), levels: await editorLevels(page), ctl: await control(page), field: await f.inputValue() };
  const upMiss = upMisses(cleared.levels, up.levels, up.ctl, up.store);
  if (!sameSizes(afterDown, cleared.store)) upMiss.push(`A− changed ${sizeDiff(cleared.store, afterDown).join(', ')}`);
  await pressHistory(page, 'Undo');
  const undone = await storeSizes(page);
  return {
    claims: { NOSIZE: shown.length > 0, NOSIZEUP: upMiss.length > 0, NOSIZEU: !sameSizes(undone, cleared.store) },
    numbers: {
      cleared: { field: cleared.field, body: cleared.store.body, label: cleared.ctl.label, up: cleared.ctl.up, down: cleared.ctl.down },
      afterUp: { drawn: ptOf(up.levels), label: up.ctl.label, field: up.field },
      undone: undone.body, misses: [...shown, ...upMiss],
    },
  };
}

/**
 * ODDCTL / ODDUP: a poster stored with a body that is not a size (null, a
 * string, a negative number: only a stored poster holds these): the control
 * shows with no number and A+ to 28 pt; A+ sets the body to 28 pt and
 * leaves the other levels.
 */
export async function oddBody(page) {
  const c0 = await control(page);
  const shown = noSizeMisses(c0);
  if (!c0.up) return { claims: { ODDCTL: true, ODDUP: true }, numbers: { control: 'absent', store: await storeSizes(page) } };
  const before = { levels: await editorLevels(page), store: await storeSizes(page) };
  await pressSize(page, 'up');
  const after = { levels: await editorLevels(page), store: await storeSizes(page), ctl: await control(page) };
  const miss = upMisses(before.levels, after.levels, after.ctl, after.store);
  return {
    claims: { ODDCTL: shown.length > 0, ODDUP: miss.length > 0 },
    numbers: { stored: before.store.body, label: c0.label, upTitle: c0.up.title, downTitle: c0.down.title, after: ptOf(after.levels), misses: [...shown, ...miss] },
  };
}

/**
 * ODDLEVEL: a poster stored with a title of null (drawn at the size the
 * page inherits): A+ and then A− twice leave the title as it is (stored
 * null, drawn at the same size); the heading follows the rule.
 */
export async function oddTitle(page) {
  await needControl(page);
  const before = { levels: await editorLevels(page), store: await storeSizes(page) };
  await pressSize(page, 'up');
  const up = { levels: await editorLevels(page), store: await storeSizes(page) };
  await pressSize(page, 'down');
  await pressSize(page, 'down');
  const down = { levels: await editorLevels(page), store: await storeSizes(page) };
  const miss = [];
  for (const [at, s] of [['A+', up], ['A− ×2', down]]) {
    if (s.store.title !== before.store.title) miss.push(`${at}: title stored ${s.store.title}`);
    if (moved(before.levels, s.levels, ['title']).length) miss.push(`${at}: title drawn ${s.levels.title?.pt ?? 'nowhere'}`);
  }
  const k = (b) => b / (Number(before.store.body) * PT_PER_UNIT);
  if (Math.abs(up.levels.heading.pt - before.levels.heading.pt * k(40)) > TOL_PT) miss.push(`heading at 40 pt drawn ${up.levels.heading.pt}`);
  if (Math.abs(down.levels.heading.pt - before.levels.heading.pt * k(32)) > TOL_PT) miss.push(`heading at 32 pt drawn ${down.levels.heading.pt}`);
  return { claims: { ODDLEVEL: miss.length > 0 }, numbers: { stored: before.store.title, drawn: ptOf(before.levels), afterUp: ptOf(up.levels), afterDown: ptOf(down.levels), misses: miss } };
}

/** Waits until the fake backend holds `want` at `level` (the autosave), up to 12 s. */
async function saved(page, ed, level, want) {
  const t0 = Date.now();
  while (Date.now() - t0 < 12000 && String(ed.state.row?.data?.styles?.[level]?.size) !== want) await page.waitForTimeout(200);
  return String(ed.state.row?.data?.styles?.[level]?.size) === want;
}

async function reload(page) {
  await page.reload();
  await page.waitForSelector('#poster-canvas [data-block-id]', { timeout: 90000 });
  await page.waitForTimeout(800);
}

/**
 * RTRELOAD (information, R1-F3, record 33 §10): A+ twice, saved, reloaded,
 * A− twice: whether the store's sizes are back exactly (=== on each level),
 * and by how much they miss.
 */
export async function reloadRoundTrip(page, ed) {
  await needControl(page);
  const s0 = await storeSizes(page);
  await pressSize(page, 'up');
  await pressSize(page, 'up');
  const s44 = await storeSizes(page);
  const ok = await saved(page, ed, 'body', s44.body);
  await reload(page);
  const reloaded = await storeSizes(page);
  await pressSize(page, 'down');
  await pressSize(page, 'down');
  const back = await storeSizes(page);
  return { numbers: { saved: ok, reloadedSame: sameSizes(reloaded, s44), exactBack: sameSizes(back, s0), misses: sizeDiff(s0, back), drawn: ptOf(await editorLevels(page)), label: (await control(page)).label } };
}

/**
 * RTSTYLE (information, R1-F3, record 33 §10): A+ twice, the Style tab's
 * title typed to 130 pt, A−, the top bar's Undo twice (back to the sizes at
 * 44 pt), A− twice: whether the store's sizes are back exactly at 36 pt.
 */
export async function styleUndoRoundTrip(page) {
  await needControl(page);
  const s0 = await storeSizes(page);
  await pressSize(page, 'up');
  await pressSize(page, 'up');
  const s44 = await storeSizes(page);
  await openTab(page, 'style');
  const f = styleField(page, 0);
  await f.click({ clickCount: 3 });
  await f.press(`${MOD}+a`);
  await f.pressSequentially('130', { delay: 40 });
  await page.waitForTimeout(350);
  await pressSize(page, 'down');
  await pressHistory(page, 'Undo');
  await pressHistory(page, 'Undo');
  const at44 = sameSizes(await storeSizes(page), s44);
  await pressSize(page, 'down');
  await pressSize(page, 'down');
  const back = await storeSizes(page);
  return { numbers: { backAt44: at44, exactBack: sameSizes(back, s0), misses: sizeDiff(s0, back), drawn: ptOf(await editorLevels(page)), label: (await control(page)).label } };
}
