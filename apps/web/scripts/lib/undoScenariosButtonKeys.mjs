/**
 * Scenarios for scripts/undo-history-check.mjs from the fix 12 review,
 * round 3 (record docs/fixes/12-one-undo-history.md, section 9, R3-F1):
 * Undo pressed from the keyboard kept the focus on the button (round 2,
 * R2-F2) but still selected the block it changed, and the editor's delete
 * / nudge / duplicate keys act on the selection whenever the focus is not
 * in a text field. So the next arrow key moved the restored block and
 * Backspace or Delete removed it, the redo lost. Folded in from the
 * reviewer's kbsel.mjs, with its siblings: a keyboard-only user, who cannot
 * click away, reaches Undo with the block still selected from typing in
 * it; the Redo button; ⌘D; Tab past Redo to the next control; and the
 * table's own Delete / Backspace listeners (B3t, found while answering
 * R3-F1, TESTED in jsdom first). Each
 * returns { claims: {id: observed}, numbers }; a claim is OBSERVED when the
 * defect is present. The claims are listed in the harness header.
 */
import { MOD, activeIs, blockOf, canonical, clickAway, focusBlockEnd, press, read, selectFrame, tabToward, typeWord } from './undoKit.mjs';
import { switchesOff } from './editorHarness.mjs';

/** The engine a page runs in. */
const engine = (page) => page.context().browser()?.browserType().name() ?? 'chromium';
const fwdTab = (page) => (engine(page) === 'webkit' ? 'Alt+Tab' : 'Tab');

/** The reviewer's poster: no table (its last cell keeps forward Tab, R2-F3). */
const noTable = (doc) => { const d = canonical(doc); return { ...d, blocks: d.blocks.filter((b) => b.type !== 'table') }; };

/** Every block's place and the history flags (the store, read only), and the blocks marked selected on the canvas. */
const snapshot = (page) => page.evaluate(async () => {
  const m = await import('/src/stores/posterStore.ts');
  const s = m.usePosterStore.getState();
  const selected = [...new Set([...document.querySelectorAll('#poster-canvas [data-postr-selected="true"]')].map((e) => e.getAttribute('data-block-id')))];
  return {
    count: s.doc.blocks.length,
    places: s.doc.blocks.map((b) => `${b.id}@${Math.round(b.x * 100) / 100},${Math.round(b.y * 100) / 100}`).join(' '),
    canRedo: s.canRedo,
    selected,
  };
});

/**
 * Playwright's WebKit goes back in history on a Backspace that nothing
 * cancels when the focus is not in a text field (B3w; the round 3 reviewer
 * met it in its control), which leaves the editor before the poster can be
 * read. Installed just before the key, on window in the bubble phase: it
 * cancels only a Backspace that is still uncancelled there, and no listener
 * of the app reads `defaultPrevented` (grep of apps/web/src), so what the
 * editor does with the key is unchanged. The URL is compared too.
 */
const holdBackspaceNavigation = (page) => page.evaluate(() => {
  window.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !e.defaultPrevented) e.preventDefault(); });
  return location.href;
});

/** Tab (or Shift+Tab, undoKit tabToward) until the focus is on the button named `name`; the presses and key, or null. */
async function tabTo(page, name) {
  const r = await tabToward(page, name);
  return r ? `${r.presses} × ${r.key}` : null;
}

/**
 * One case on a new page: " ZQAA ZQBB" typed at the end of block 1; then
 * `start` ('away': click the empty workspace; 'kbd': no click, Tab from the
 * text as a keyboard-only user does); Tab to Undo and Enter (for 'redo':
 * Enter twice, Tab to Redo, Enter); then `key` on the focused button. The
 * poster must not change, the redo must stay, the focus must stay.
 */
async function keyCase(open, { start, key }) {
  const { page } = await open();
  const ids = await page.evaluate(() => [...document.querySelectorAll('#poster-canvas [data-block-type="text"]')].map((e) => e.getAttribute('data-block-id')));
  const [a] = ids;
  await focusBlockEnd(page, a);
  await typeWord(page, ' ZQAA ZQBB');
  if (start !== 'kbd') await clickAway(page);
  const tabs = await tabTo(page, 'Undo');
  if (tabs === null) throw new Error(`neither Tab nor Shift+Tab reached Undo (${start})`);
  const atUndo = await snapshot(page);
  await press(page, 'Enter', 300);
  let button = 'Undo';
  if (start === 'redo') {
    await press(page, 'Enter', 300);
    await page.keyboard.press(fwdTab(page));
    button = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    if (button !== 'Redo') throw new Error(`Tab from Undo reached ${button}`);
    await press(page, 'Enter', 300);
  }
  const before = await snapshot(page);
  const focusBefore = await activeIs(page);
  const url = await holdBackspaceNavigation(page);
  await press(page, key, 400);
  if (page.url() !== url) throw new Error(`${key} left the editor (${url} → ${page.url()})`);
  const after = await snapshot(page);
  const focusAfter = await activeIs(page);
  const text = (await read(page, [a])).blocks[a];
  const changed = after.count !== before.count || after.places !== before.places;
  const redoLost = before.canRedo && !after.canRedo;
  return {
    observed: changed || redoLost || focusAfter !== `BUTTON[${button}]`,
    reading: `${start}/${button}/${key}: tabs ${tabs}, selected at Undo [${atUndo.selected.join(',')}], after the press [${before.selected.join(',')}] focus ${focusBefore} redo ${before.canRedo}; after ${key}: blocks ${before.count}→${after.count}${after.places !== before.places ? ' MOVED' : ''}, redo ${after.canRedo}, focus ${focusAfter}, text …${text.store.slice(-11)}`,
  };
}

export const BUTTON_KEYS = [
  {
    id: 'B3-keys-on-the-buttons', claims: ['B3', 'B3k', 'B3r'],
    editDoc: noTable,
    how: 'a poster without a table, " ZQAA ZQBB" typed at the end of block 1; each case on a new page (a Backspace still uncancelled after the app is held at the window, B3w): B3 click away, Tab to Undo, Enter, then ArrowDown / ArrowRight / Backspace / Delete / ⌘D on Undo; B3k the same with no click away (a keyboard-only user: Tab from the text, the block still selected), ArrowDown / Backspace; B3r Enter twice on Undo, Tab to Redo, Enter, then ArrowRight / Backspace on Redo',
    async run(page, ids, reopen) {
      const open = async () => reopen();
      const cases = [
        ['B3', { start: 'away', key: 'ArrowDown' }], ['B3', { start: 'away', key: 'ArrowRight' }],
        ['B3', { start: 'away', key: 'Backspace' }], ['B3', { start: 'away', key: 'Delete' }],
        ['B3', { start: 'away', key: `${MOD}+d` }],
        ['B3k', { start: 'kbd', key: 'ArrowDown' }], ['B3k', { start: 'kbd', key: 'Backspace' }],
        ['B3r', { start: 'redo', key: 'ArrowRight' }], ['B3r', { start: 'redo', key: 'Backspace' }],
      ];
      const claims = { B3: false, B3k: false, B3r: false };
      const numbers = {};
      for (const [claim, c] of cases) {
        const r = await keyCase(open, c);
        claims[claim] ||= r.observed;
        numbers[`${claim} ${c.key}`] = r.reading;
      }
      return { claims, numbers };
    },
  },
  {
    // The selection follows the focus: a keyboard press of Undo selects no
    // block, so the control after Redo (reached by Tab) does not pass an
    // arrow to a block the press selected (the delete / nudge handler acts
    // from every control that is not a text field: item 22, parked).
    id: 'B3s-keyboard-press-selects-nothing', claims: ['B3s'],
    editDoc: noTable,
    how: 'a poster without a table: " ZQAA ZQBB" in block 1, click away, Tab to Undo, Enter; which blocks are selected; Tab twice (past Redo), ArrowRight there',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a);
      await typeWord(page, ' ZQAA ZQBB');
      await clickAway(page);
      if ((await tabTo(page, 'Undo')) === null) throw new Error('Tab did not reach Undo');
      await press(page, 'Enter', 300);
      const pressed = await snapshot(page);
      await page.keyboard.press(fwdTab(page));
      await page.keyboard.press(fwdTab(page));
      const next = await activeIs(page);
      await press(page, 'ArrowRight', 400);
      const after = await snapshot(page);
      return {
        claims: { B3s: pressed.selected.length > 0 || after.places !== pressed.places || after.canRedo !== pressed.canRedo },
        numbers: { selectedAfterEnterOnUndo: `[${pressed.selected.join(',')}]`, controlAfterRedo: next, arrowThere: after.places !== pressed.places ? 'a block MOVED' : 'nothing moved', redo: `${pressed.canRedo} → ${after.canRedo}` },
      };
    },
  },
  {
    // A sibling found while answering R3-F1: the table's own Delete /
    // Backspace listeners (a whole column or row, a range of cells) had the
    // same text-field-only guard. Undo gets the focus with .focus(), a
    // stand-in for Shift+Tab: forward Tab stops in the table's last cell
    // (R2-F3), and Playwright's Firefox stops Shift+Tab at the page's first
    // control.
    id: 'B3t-keys-on-the-buttons-and-the-table', claims: ['B3t'],
    how: '" ZQTT" typed in block 1, click away; select the table, click its "Select column 1" handle, focus Undo, Backspace, Delete; then drag across the first two cells, focus Undo, Backspace, Delete',
    async run(page, ids) {
      const [a] = ids;
      const table = await blockOf(page, 'table');
      await focusBlockEnd(page, a); await typeWord(page, ' ZQTT');
      await clickAway(page);
      await selectFrame(page, table);
      const grid = () => page.evaluate(async (i) => {
        const m = await import('/src/stores/posterStore.ts');
        const t = m.usePosterStore.getState().doc.blocks.find((b) => b.id === i)?.tableData;
        return t ? { size: `${t.rows}x${t.cols}`, first: t.cells.slice(0, 2).join('|') } : { size: 'the table removed', first: 'the table removed' };
      }, table);
      const g0 = await grid();
      const undo = page.locator('button[aria-label="Undo"]');
      const url = await holdBackspaceNavigation(page);
      // Record 29: the column strips are hidden while ADJUSTMENTS_ENABLED is
      // off, so this half is left out then; the cell range below runs.
      const stripsHidden = switchesOff('ADJUSTMENTS_ENABLED').length > 0;
      let g1 = g0;
      if (!stripsHidden) {
        await page.getByRole('button', { name: 'Select column 1' }).click();
        await page.waitForTimeout(200);
        await undo.focus();
        await press(page, 'Backspace', 300); await press(page, 'Delete', 300);
        g1 = await grid();
      }
      const td = (i) => page.locator(`#poster-canvas [data-block-id="${table}"] td`).nth(i);
      if (g1.size !== g0.size) {
        return { claims: { B3t: true }, numbers: { table: g0.size, columnSelectedThenKeysOnUndo: g1.size } };
      }
      const [c0, c1] = [await td(0).boundingBox(), await td(1).boundingBox()];
      await page.mouse.move(c0.x + c0.width / 2, c0.y + c0.height / 2);
      await page.mouse.down();
      await page.mouse.move(c1.x + c1.width / 2, c1.y + c1.height / 2, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(200);
      await undo.focus();
      const focus = await activeIs(page);
      await press(page, 'Backspace', 300); await press(page, 'Delete', 300);
      if (page.url() !== url) throw new Error(`Backspace left the editor (${url} → ${page.url()})`);
      const g2 = await grid();
      const s = await read(page, [a]);
      return {
        claims: { B3t: g1.size !== g0.size || g2.first !== g0.first || !s.blocks[a].store.endsWith('ZQTT') || focus !== 'BUTTON[Undo]' },
        numbers: { table: g0.size, columnSelectedThenKeysOnUndo: stripsHidden ? 'left out (ADJUSTMENTS_ENABLED off: no column strips)' : g1.size, rangeThenKeysOnUndo: `${JSON.stringify(g0.first)} → ${JSON.stringify(g2.first)}`, focus, block1: s.blocks[a].store.slice(-6) },
      };
    },
  },
  {
    // Information, why B3 and B3t hold a Backspace at the window: with
    // nothing selected, Backspace on a focused Undo button. In Playwright's
    // WebKit an uncancelled Backspace outside a text field goes back in
    // history (the round 3 reviewer's control met it); whether Safari does
    // is not measured here.
    id: 'B3w-backspace-on-a-button', info: true,
    editDoc: noTable,
    how: 'information: " ZQAA" typed in block 1, click away (nothing selected), Tab to Undo, Backspace: does the page leave the editor?',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a);
      await typeWord(page, ' ZQAA');
      await clickAway(page);
      if ((await tabTo(page, 'Undo')) === null) throw new Error('Tab did not reach Undo');
      const url = page.url();
      await press(page, 'Backspace', 800);
      return { numbers: { leftTheEditor: page.url() !== url, url: page.url() === url ? 'unchanged' : `${new URL(url).pathname} → ${new URL(page.url()).pathname}` } };
    },
  },
  {
    // Information, the cost of B3's guard: with the mouse, after a nudge,
    // Undo clicked, the next arrow nudges the still-selected block again
    // only where the click left the focus off the button. Where a click
    // focuses a button (Chromium and Firefox on Windows and Linux, by their
    // platform conventions: UNVERIFIED on this macOS host), the guard keeps
    // that arrow off the poster until the poster is clicked (record 12 §10).
    id: 'B3m-mouse-then-arrow', info: true,
    how: 'information: click the references block (selected, no caret), ArrowRight (a nudge), click Undo with the mouse, ArrowRight again: where is the focus, and does the block move?',
    async run(page) {
      const ref = page.locator('#poster-canvas [data-block-type="references"]').first();
      const id = await ref.getAttribute('data-block-id');
      await ref.click();
      await page.waitForTimeout(250);
      const x = async () => (await read(page, [id])).blocks[id].x;
      const x0 = await x();
      await press(page, 'ArrowRight', 300); const x1 = await x();
      await page.locator('button[aria-label="Undo"]').click();
      await page.waitForTimeout(300);
      const x2 = await x(); const focus = await activeIs(page);
      await press(page, 'ArrowRight', 300); const x3 = await x();
      return { numbers: { x: `${x0} → nudge ${x1} → Undo click ${x2} → ArrowRight ${x3}`, focusAfterClick: focus, arrowAfterClickMoved: x3 !== x2 } };
    },
  },
];
