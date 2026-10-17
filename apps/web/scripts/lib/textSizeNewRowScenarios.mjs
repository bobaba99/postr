/**
 * scripts/text-size-check.mjs's information scenarios from review round 1 of
 * record 37 (docs/fixes/37-load-size-cap.md §9, R37-1, R37-2, R37-3, R37-5),
 * folded in from the reviewer's probe. All information: printed, not counted.
 *
 *   new-row-defaults  a guest's first /p/new (the fake backend inserts the
 *        row, its `data` the posters table's column default as the migration
 *        file holds it): the inserted sizes, authors line height and palette
 *        against the migration file's default (read here from the SQL) and
 *        today's DEFAULT_STYLES and DEFAULT_PALETTE (the app's own module);
 *        what is drawn and what the Style tab's fields read; then
 *        manual-test-flows §38's A+ once and A− once, and §41's step,
 *        Style › Typography › Body typed to 12 and A+ once: drawn and
 *        fields (R37-1, R37-3)
 *   new-row-emptied  a guest's first /p/new, nothing else changed, every
 *        deletable block deleted with its own "Delete block" button, saved:
 *        the saved row against the inserted row, key by key (R37-2: can the
 *        row's data tell a never-saved row from an emptied poster?)
 *   old-default-strings / old-default-authors-absent  the old default with
 *        its four sizes stored as strings, and with the authors level
 *        missing (no known writer made either): drawn, the store's sizes with
 *        their types, the Style tab's fields (R37-5)
 *
 * Each enters as a user does: /p/new as a guest (lib/guestBackend.mjs, the
 * multi-row fake: the posters table is its `rows`), the Style tab's Body
 * field typed with the keyboard, the top bar's A+ with the mouse, a block
 * selected with a click and its "Delete block" button. What is drawn is each
 * level's computed font-size (lib/textSizeRead.mjs); the store and the
 * app's constants are read passively (the dev server's modules), so not on
 * the production build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './editorHarness.mjs';
import * as G from './guestBackend.mjs';
import { MOD } from './undoKit.mjs';
import { editorLevels } from './textSizeRead.mjs';
import { pressSize, openTab, needControl } from './textSizeKit.mjs';

const LEVEL_KEYS = ['title', 'heading', 'authors', 'body'];
const MIGRATION = 'supabase/migrations/20260408000100_posters.sql';
const styleField = (page, i) => page.locator('[data-postr-sidebar] input[type="number"][title="Font size (points)"]').nth(i);
const ptOf = (levels) => Object.fromEntries(Object.entries(levels).map(([k, v]) => [k, v ? Number(v.pt.toFixed(3)) : null]));
const sizesOf = (styles) => Object.fromEntries(LEVEL_KEYS.map((k) => [k, styles?.[k]?.size ?? null]));

/** JSON with every object's keys sorted, so two documents compare by value. */
const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const same = (a, b) => canon(a) === canon(b);

/**
 * The posters table's default for `data` as the migration file holds it now,
 * parsed from the SQL, and every later migration that alters that default
 * (file names; none is expected: record 37 §6, INSPECTED).
 */
export function migrationDefault(repo = REPO) {
  const sql = fs.readFileSync(path.join(repo, MIGRATION), 'utf8');
  const m = /data jsonb not null default '([\s\S]*?)'::jsonb/.exec(sql);
  if (!m) throw new Error(`${MIGRATION} has no data default this instrument can read`);
  const dir = path.join(repo, 'supabase/migrations');
  const later = fs.readdirSync(dir).filter((f) => f !== path.basename(MIGRATION))
    .filter((f) => /alter\s+table\s+(public\.)?posters[\s\S]*?alter\s+column\s+data/i.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  return { data: JSON.parse(m[1]), later };
}

/** The Style tab's four size fields as a user reads them (whole pt). */
async function fields(page) {
  await openTab(page, 'style');
  const out = {};
  for (const [i, k] of LEVEL_KEYS.entries()) out[k] = Number(await styleField(page, i).inputValue());
  return out;
}

/** Select the field's text with its own keys and type `value` one key at a time. */
async function typeInto(locator, value) {
  await locator.click({ clickCount: 3 });
  await locator.press(`${MOD}+a`);
  await locator.pressSequentially(String(value), { delay: 40 });
  await locator.page().waitForTimeout(350);
}

/**
 * A guest's first visit: the multi-row fake, /p/new, the editor settled on
 * /p/<id>. Returns what the scenarios read: the page, its context, the fake's
 * state, the poster id, the row as the backend inserted it (copied before any
 * save), and the data saves seen by then.
 */
export async function openNewGuestPoster(h, { viewport }) {
  const state = G.newState({ anonymous: true });
  const { context, page } = await G.newGuestPage(h, state, { viewport });
  try {
    const id = await G.openNewPoster(page, h.base);
    const row = state.rows.find((r) => r.id === id);
    if (!row) throw new Error('the fake backend holds no row for the new poster');
    return { context, page, state, id, inserted: structuredClone(row), savesBeforeRead: G.dataPatches(state).length, rows: state.rows.length };
  } catch (e) {
    await context.close().catch(() => {});
    throw e;
  }
}

/** R37-1 and R37-3: what a new row holds and draws, then manual-test-flows §38's A+ and A−, and §41's Body 12 then A+, on it. */
export async function newRowDefaults(page, ed) {
  const ins = ed.inserted.data;
  const mig = migrationDefault();
  const today = await page.evaluate(async () => {
    const c = await import('/src/poster/constants.ts');
    return { styles: c.DEFAULT_STYLES, palette: c.DEFAULT_PALETTE };
  });
  const drawn = await editorLevels(page);
  const shown = await fields(page);
  await needControl(page);
  // manual-test-flows §38's first steps on a new poster: A+ once, A− once.
  await pressSize(page, 'up');
  const up40 = await editorLevels(page);
  const shown40 = await fields(page);
  await pressSize(page, 'down');
  const shownBack = await fields(page);
  await typeInto(styleField(page, 3), 12);
  await pressSize(page, 'up');
  const up = await editorLevels(page);
  const shownUp = await fields(page);
  return {
    numbers: {
      rows: ed.rows, savesBeforeRead: ed.savesBeforeRead,
      insertedSizes: sizesOf(ins.styles), insertedAuthorsLineHeight: ins.styles?.authors?.lineHeight, insertedAccent: ins.palette?.accent,
      migrationSizes: sizesOf(mig.data.styles), migrationAccent: mig.data.palette?.accent, laterMigrationsAlteringDefault: mig.later,
      insertedIsMigrationDefault: same(ins, mig.data), fakeCopiesMigration: same(G.DEFAULT_DATA, mig.data),
      todaySizes: sizesOf(today.styles), todayAuthorsLineHeight: today.styles.authors.lineHeight, todayAccent: today.palette.accent,
      insertedStylesAreToday: same(ins.styles, today.styles), insertedPaletteIsToday: same(ins.palette, today.palette),
      drawn: ptOf(drawn), fields: shown,
      afterUp: ptOf(up40), fieldsAfterUp: shown40, fieldsAfterUpDown: shownBack,
      afterBody12Up: ptOf(up), fieldsAfterBody12Up: shownUp,
    },
  };
}

/** R37-2: a new poster emptied with "Delete block" and saved, against the row as inserted. */
export async function newRowEmptied(page, ed) {
  const unlocked = () => page.evaluate(async () => {
    const m = await import('/src/stores/posterStore.ts');
    return m.usePosterStore.getState().doc.blocks.filter((b) => !b.locked).map((b) => b.id);
  });
  for (let i = 0; i < 60; i += 1) {
    const ids = await unlocked();
    if (ids.length === 0) break;
    await page.locator(`#poster-canvas [data-block-id="${ids[0]}"]`).click({ position: { x: 4, y: 4 }, force: true });
    await page.waitForTimeout(150);
    const del = page.locator('#poster-canvas button[title="Delete block"]').first();
    if (await del.count()) await del.click();
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  const left = await unlocked();
  const storeBlocks = await page.evaluate(async () => (await import('/src/stores/posterStore.ts')).usePosterStore.getState().doc.blocks.length);
  const row = () => ed.state.rows.find((r) => r.id === ed.id);
  const saved = await G.waitFor(() => (row()?.data?.blocks?.length === storeBlocks && G.dataPatches(ed.state).length > 0 ? structuredClone(row().data) : null), { timeout: 12000, every: 150 });
  if (!saved) throw new Error('the emptied poster never reached the backend (autosave)');
  const ins = ed.inserted.data;
  const keys = [...new Set([...Object.keys(ins), ...Object.keys(saved)])].sort();
  return {
    numbers: {
      deletableLeft: left.length, blocksSaved: saved.blocks.length,
      keysDiffering: keys.filter((k) => !same(ins[k], saved[k])),
      insertedAccent: ins.palette?.accent, emptiedAccent: saved.palette?.accent,
      stylesSame: same(ins.styles, saved.styles),
      emptiedEqualsInsertedExceptBlocks: same({ ...saved, blocks: [] }, { ...ins, blocks: [] }),
    },
  };
}

/** R37-5: an odd shape of the old default, opened: drawn, the store's sizes with their types, the fields. */
export async function oldDefaultOdd(page) {
  const drawn = await editorLevels(page);
  const store = await page.evaluate(async () => {
    const s = (await import('/src/stores/posterStore.ts')).usePosterStore.getState().doc.styles;
    return Object.fromEntries(['title', 'heading', 'authors', 'body'].map((k) => [k, s[k] ? `${typeof s[k].size} ${String(s[k].size)}` : 'missing']));
  });
  return { numbers: { drawn: ptOf(drawn), store, fields: await fields(page) } };
}
