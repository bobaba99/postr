/**
 * Scenarios for scripts/undo-history-check.mjs added with the fix (plan
 * item 12; record docs/fixes/12-one-undo-history.md): the owner's
 * decisions of 2026-10-06 (word steps, the caret after an undo, the
 * buttons, a version restore, the toolbar, fields that keep their own
 * undo) and the entry points the item 12 confirmer measured on main with
 * its own probes (E1–E17 of its confirm12.mjs, folded in here). Each
 * returns { claims: {id: observed}, numbers }; a claim is OBSERVED when the
 * defect is present. The claims are listed in the harness's header.
 */
import {
  KEY, MOD, activeIs, blockOf, canonical, caretIn, clickAway, contentBoxText, focusBlockEnd, focusContentBox, openTab,
  press, probeInstall, probeTake, read, selectFrame, selectLastWord, typeWord,
} from './undoKit.mjs';

const has = (s, id, word) => (s.blocks[id].dom ?? '').includes(word);
const agree = (s, id) => s.blocks[id].dom === s.blocks[id].store;
const unchanged = (a, b, id) => a.blocks[id].dom === b.blocks[id].dom && a.blocks[id].store === b.blocks[id].store;

/** The engine a page runs in. */
const engine = (page) => page.context().browser()?.browserType().name() ?? 'chromium';

const GONE = ['Smaller', 'Larger', '⟸', '≡', '⟹'];
const KEPT = ['B', 'I', 'U', 'S', '•', '1.', 'Highlight · Yellow', 'Text · Red', 'Clear formatting'];

/** The titles of a toolbar's buttons. */
const toolbarTitles = (page, selector) => page.evaluate((sel) => {
  const bar = document.querySelector(sel);
  return bar ? [...bar.querySelectorAll('button')].map((b) => b.getAttribute('title')) : null;
}, selector);

/** The table's caption gap in the store. */
const gapOf = (page, id) => page.evaluate(async (i) => {
  const m = await import('/src/stores/posterStore.ts');
  return m.usePosterStore.getState().doc.blocks.find((b) => b.id === i)?.captionGap ?? 0;
}, id);

const captionOf = (page, id) => page.evaluate(async (i) => {
  const m = await import('/src/stores/posterStore.ts');
  return m.usePosterStore.getState().doc.blocks.find((b) => b.id === i)?.caption ?? '';
}, id);

/** The confirmer's E11 route: one saved version, holding the poster as it opened. */
async function mockVersions(page) {
  const initial = await page.evaluate(async () => {
    const m = await import('/src/stores/posterStore.ts');
    const s = m.usePosterStore.getState();
    return { doc: s.doc, posterId: s.posterId };
  });
  const vrow = { id: '00000000-0000-4000-8000-0000000000a1', poster_id: initial.posterId, user_id: 'u', name: 'ZQ version one', created_at: new Date(Date.now() - 3600e3).toISOString() };
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  await page.context().route('https://dummy.supabase.co/rest/v1/poster_versions**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const obj = (req.headers().accept || '').includes('vnd.pgrst.object');
    const url = req.url();
    let body;
    if (req.method() === 'GET') body = url.includes('data') || url.includes('select=*') || obj ? (obj ? { ...vrow, data: initial.doc } : [{ ...vrow, data: initial.doc }]) : [vrow];
    else body = obj ? { ...vrow, id: '00000000-0000-4000-8000-0000000000b2', name: 'Before restore' } : [{ ...vrow }];
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
  });
}

export const ENTRIES = [
  {
    id: 'N1-poster-name-keeps-own-undo', claims: ['N1'],
    how: 'type " ZQAAA" in block 1, click Layout › Poster name (not the poster), type " ZQNAME" there, ⌘Z twice in the field',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a); await typeWord(page, ' ZQAAA');
      await openTab(page, 'layout');
      const field = page.locator('input[aria-label="Poster name"]').first();
      await field.click();
      await page.keyboard.press('End');
      await typeWord(page, ' ZQNAME');
      await probeInstall(page);
      const before = await read(page, [a]);
      const v0 = await field.inputValue();
      await press(page, KEY.undo, 300);
      await press(page, KEY.undo, 300);
      const after = await read(page, [a]);
      const active = await activeIs(page);
      return {
        claims: { N1: !unchanged(before, after, a) || after.canRedo !== before.canRedo || active !== 'INPUT[Poster name]' },
        numbers: { fieldTyped: v0.slice(-14), fieldAfter: (await field.inputValue()).slice(-14), block1: after.blocks[a].dom.slice(-10), canRedo: after.canRedo, active, history: await probeTake(page) },
      };
    },
  },
  {
    id: 'TB-toolbar-no-size-or-align', claims: ['TB'],
    how: 'select the last word of block 1: the selection toolbar\'s buttons; then the docked copy in Edit block',
    async run(page, ids) {
      const [a] = ids;
      await selectLastWord(page, a);
      await page.locator('div[style*="z-index: 9700"] button[title="B"]').first().waitFor({ state: 'visible', timeout: 3000 });
      const floating = await toolbarTitles(page, 'div[style*="z-index: 9700"]');
      await openTab(page, 'edit block');
      const docked = await page.evaluate(() => {
        const label = [...document.querySelectorAll('label')].find((l) => l.textContent === 'Content');
        return label ? [...label.parentElement.querySelectorAll('button')].map((b) => b.getAttribute('title')) : null;
      });
      if (!floating || !docked) throw new Error('a toolbar was not found');
      if (!KEPT.every((k) => floating.includes(k) && docked.includes(k))) throw new Error(`a kept button is missing: ${floating.join(' ')}`);
      return {
        claims: { TB: GONE.some((g) => floating.includes(g) || docked.includes(g)) },
        numbers: { floating: floating.join(' '), docked: docked.join(' ') },
      };
    },
  },
  {
    id: 'W1-one-step-per-word', claims: ['W1', 'W1i'],
    how: 'block 1: type " ZQWONE ZQWTWO" (no pause), click away, ⌘Z twice; block 2: the same, ⌘Z in the block',
    async run(page, ids) {
      const [a, b] = ids;
      const o = await read(page, [a, b]);
      await focusBlockEnd(page, a); await typeWord(page, ' ZQWONE ZQWTWO');
      await clickAway(page);
      await press(page, KEY.undo, 300); const u1 = await read(page, [a]);
      await press(page, KEY.undo, 300); const u2 = await read(page, [a]);
      await focusBlockEnd(page, b); await typeWord(page, ' ZQWONE ZQWTWO');
      await press(page, KEY.undo, 300); const i1 = await read(page, [b]);
      return {
        claims: {
          W1: u1.blocks[a].dom !== `${o.blocks[a].dom} ZQWONE` || u2.blocks[a].dom !== o.blocks[a].dom,
          W1i: i1.blocks[b].dom !== `${o.blocks[b].dom} ZQWONE`,
        },
        numbers: { afterUndo1: u1.blocks[a].dom.slice(-16), afterUndo2: u2.blocks[a].dom.slice(-16), insideAfterUndo1: i1.blocks[b].dom.slice(-16) },
      };
    },
  },
  {
    id: 'W2-pause-inside-a-word', claims: ['W2'],
    how: 'type "ZQAB", wait 1.5 s, type "CD" in block 1, click away, ⌘Z once',
    async run(page, ids) {
      const [a] = ids;
      const o = (await read(page, [a])).blocks[a].dom;
      await focusBlockEnd(page, a);
      await page.keyboard.type('ZQAB', { delay: 35 }); await page.waitForTimeout(1500);
      await typeWord(page, 'CD');
      await clickAway(page);
      await press(page, KEY.undo, 300);
      const u = await read(page, [a]);
      return { claims: { W2: u.blocks[a].dom !== o }, numbers: { afterUndo: u.blocks[a].dom.slice(-12) } };
    },
  },
  {
    id: 'W3-enter-then-typing', claims: ['W3'],
    how: 'type " ZQA" in block 1, Enter, type "ZQB": does the screen keep ZQB on its own line while the caret is in the block',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a);
      await page.keyboard.type(' ZQA', { delay: 35 });
      await page.keyboard.press('Enter');
      await typeWord(page, 'ZQB');
      const shown = await page.evaluate((id) => document.querySelector(`#poster-canvas [data-block-id="${id}"] [contenteditable]`).innerText, a);
      const s = await read(page, [a]);
      // The editor writes its own typing back into the block only when
      // the store changed it from outside; written back here, the
      // sanitizer's flattening of the new line (record section 10) would
      // join "ZQB" to the line before as it is typed.
      return {
        claims: { W3: !/ZQA\s*\n\s*ZQB/.test(shown) },
        numbers: { onScreen: JSON.stringify(shown.slice(-12)), storeHtml: s.blocks[a].storeHtml.slice(-16), active: s.active },
      };
    },
  },
  {
    id: 'K1-caret-after-undo-and-redo', claims: ['K1'],
    how: 'type " ZQTYPED" in block 1, click away, ⌘Z: where is the caret; then ⌘⇧Z: what is selected',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a); await typeWord(page, ' ZQTYPED');
      await clickAway(page);
      await press(page, KEY.undo, 300);
      const su = await read(page, [a]); const cu = await caretIn(page);
      await press(page, KEY.redo, 300);
      const sr = await read(page, [a]); const cr = await caretIn(page);
      const undoOk = su.active === `CE:${a}` && cu && cu.start === cu.end && cu.end === cu.length;
      const redoOk = sr.active === `CE:${a}` && cr?.text === 'ZQTYPED';
      return {
        claims: { K1: !undoOk || !redoOk },
        numbers: { activeAfterUndo: su.active, caretAfterUndo: JSON.stringify(cu), activeAfterRedo: sr.active, selectedAfterRedo: JSON.stringify(cr?.text ?? null) },
      };
    },
  },
  {
    id: 'B1-undo-redo-buttons', claims: ['B1'],
    how: 'the Undo and Redo buttons: state on a fresh poster; type " ZQTYPED", click away; click Undo; Tab from Undo to Redo and press Enter',
    async run(page, ids) {
      const [a] = ids;
      const state = () => page.evaluate(() => {
        const b = (n) => document.querySelector(`button[aria-label="${n}"]`);
        const u = b('Undo'); const r = b('Redo');
        const vis = (el) => !!el && el.getBoundingClientRect().width > 0;
        return u && r ? { undo: !u.disabled, redo: !r.disabled, visible: vis(u) && vis(r) } : null;
      });
      const s0 = await state();
      if (!s0) return { claims: { B1: true }, numbers: { buttons: 0 } };
      await focusBlockEnd(page, a); await typeWord(page, ' ZQTYPED');
      await clickAway(page);
      const s1 = await state();
      await page.locator('button[aria-label="Undo"]').click();
      await page.waitForTimeout(300);
      const r1 = await read(page, [a]); const s2 = await state();
      await page.locator('button[aria-label="Undo"]').focus();
      // Safari moves Tab between text fields only unless its "Press Tab to
      // highlight each item" setting is on; Option+Tab reaches every
      // control there (and WebKit here does the same).
      await page.keyboard.press(engine(page) === 'webkit' ? 'Alt+Tab' : 'Tab');
      const tabbed = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      const r2 = await read(page, [a]);
      const ok = s0.visible && !s0.undo && !s0.redo && s1.undo && !s1.redo && !has(r1, a, 'ZQTYPED') && s2.redo
        && tabbed === 'Redo' && has(r2, a, 'ZQTYPED');
      return {
        claims: { B1: !ok },
        numbers: { fresh: JSON.stringify(s0), afterTyping: JSON.stringify(s1), afterClickUndo: `${r1.blocks[a].dom.slice(-10)} ${JSON.stringify(s2)}`, tabFromUndo: tabbed, afterEnterOnRedo: r2.blocks[a].dom.slice(-10) },
      };
    },
  },
  {
    // Review round 2 (R2-F2), from the reviewer's kb.mjs K1/K2: a keyboard
    // press used to move the focus into the text, so the next Enter typed a
    // line break into the poster (wiping the redo) or replaced the redone
    // word. The poster has no table, as the reviewer's: the table's last
    // cell keeps forward Tab (R2-F3, B1t, Later list), and Shift+Tab from
    // the workspace leaves Playwright's Firefox at the page's first control.
    id: 'B2-buttons-from-the-keyboard', claims: ['B2'],
    editDoc: (doc) => { const d = canonical(doc); return { ...d, blocks: d.blocks.filter((b) => b.type !== 'table') }; },
    how: 'a poster without a table: type " ZQAA ZQBB" in block 1, click away; Tab to Undo, Enter, Space; Tab to Redo, Enter, Space; then click Undo with the mouse',
    async run(page, ids) {
      const [a] = ids;
      const fwd = engine(page) === 'webkit' ? 'Alt+Tab' : 'Tab';
      const label = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName ?? 'none');
      const text = async () => (await read(page, [a])).blocks[a];
      await focusBlockEnd(page, a);
      await typeWord(page, ' ZQAA ZQBB');
      await clickAway(page);
      const base = (await text()).store.replace(/ ZQAA ZQBB$/, '');
      let presses = 0;
      while ((await label()) !== 'Undo' && presses < 60) { await page.keyboard.press(fwd); presses += 1; }
      if ((await label()) !== 'Undo') throw new Error(`${fwd} did not reach Undo in 60 presses`);
      const tail = (s) => (s.startsWith(base) ? `…${s.slice(base.length)}` : s);
      const steps = [];
      const after = async (what) => { await page.waitForTimeout(300); const t = await text(); steps.push({ what, text: tail(t.store), screen: tail(t.dom), lineBreak: /<br|<div/i.test(t.storeHtml), focus: await label() }); };
      await page.keyboard.press('Enter'); await after('Enter on Undo');
      await page.keyboard.press(' '); await after('Space on Undo');
      await page.keyboard.press(fwd);
      const onRedo = await label();
      await page.keyboard.press('Enter'); await after('Enter on Redo');
      await page.keyboard.press(' '); await after('Space on Redo');
      await page.locator('button[aria-label="Undo"]').click();
      await page.waitForTimeout(300);
      const click = await caretIn(page);
      const clickFocus = await activeIs(page);
      const want = [['… ZQAA', 'Undo'], ['…', 'Undo'], ['… ZQAA', 'Redo'], ['… ZQAA ZQBB', null]];
      const keysOk = steps.every((st, i) => st.text === want[i][0] && st.screen === st.text && !st.lineBreak && (want[i][1] === null || st.focus === want[i][1]));
      // A mouse click keeps decision 4: the caret back where the word was.
      const clickOk = clickFocus === 'canvas:text' && !!click && click.start === click.end && click.start === `${base} ZQAA `.length;
      return {
        claims: { B2: !keysOk || onRedo !== 'Redo' || !clickOk },
        numbers: { tabsToUndo: presses, steps: JSON.stringify(steps), tabToRedo: onRedo, afterMouseClickOnUndo: `${clickFocus} caret ${JSON.stringify(click)}` },
      };
    },
  },
  {
    // Information (review round 2, R2-F3, the reviewer's taborder.mjs): the
    // table's last cell keeps forward Tab (pre-existing, blocks.tsx
    // onCellKeyDown; the plan's Later list), so on a poster with a table
    // forward Tab never reaches the buttons; Shift+Tab does (B2).
    id: 'B1t-forward-tab-and-the-table', info: true,
    how: 'information: type " ZQTYPED" in block 1, click away; Tab up to 150 times: does the focus reach Undo, and where does it stop?',
    async run(page, ids) {
      const [a] = ids;
      const fwd = engine(page) === 'webkit' ? 'Alt+Tab' : 'Tab';
      await focusBlockEnd(page, a); await typeWord(page, ' ZQTYPED');
      await clickAway(page);
      let n = 0;
      let at = '';
      while (n < 150) {
        await page.keyboard.press(fwd);
        n += 1;
        at = await activeIs(page);
        if (at === 'BUTTON[Undo]') break;
      }
      return { numbers: { reachedUndo: at === 'BUTTON[Undo]', presses: n, focusAtEnd: at } };
    },
  },
  {
    id: 'V1-version-restore-is-a-step', claims: ['V1'],
    how: 'a saved version (the poster as it opened); type " ZQVR" in block 1, click away, Versions › Restore › Restore; click away, ⌘Z, then ⌘⇧Z',
    async run(page, ids) {
      const [a] = ids;
      await mockVersions(page);
      await focusBlockEnd(page, a); await typeWord(page, ' ZQVR');
      await clickAway(page);
      await openTab(page, 'versions');
      await page.getByRole('button', { name: 'Restore', exact: true }).first().click();
      await page.waitForTimeout(300);
      await page.getByRole('dialog').getByRole('button', { name: 'Restore', exact: true }).click();
      await page.waitForTimeout(1200);
      const restored = await read(page, [a]);
      if (has(restored, a, 'ZQVR')) throw new Error('the restore did not put the saved version in place');
      await clickAway(page);
      await press(page, KEY.undo, 300); const u = await read(page, [a]);
      await press(page, KEY.redo, 300); const r = await read(page, [a]);
      return {
        claims: { V1: !has(u, a, 'ZQVR') || has(r, a, 'ZQVR') },
        numbers: { afterRestore: restored.blocks[a].dom.slice(-10), afterUndo: u.blocks[a].dom.slice(-10), afterRedo: r.blocks[a].dom.slice(-10), canUndoAfterRestore: restored.canUndo },
      };
    },
  },
  {
    id: 'E1-content-box', claims: ['E1'],
    how: 'click block 1 (Edit block shows its Content box), click the box, type " ZQSB", ⌘Z in the box, then ⌘⇧Z',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a);
      await openTab(page, 'edit block');
      await focusContentBox(page);
      await typeWord(page, ' ZQSB');
      await press(page, KEY.undo, 300);
      const u = await read(page, [a]); const boxU = await contentBoxText(page); const act = await activeIs(page);
      await press(page, KEY.redo, 300);
      const r = await read(page, [a]); const boxR = await contentBoxText(page);
      return {
        claims: { E1: has(u, a, 'ZQSB') || (boxU ?? '').includes('ZQSB') || !u.canRedo || !(boxR ?? '').includes('ZQSB') || !has(r, a, 'ZQSB') || act !== 'sidebar-ce' },
        numbers: { boxAfterUndo: (boxU ?? '').slice(-10), canvasAfterUndo: u.blocks[a].dom.slice(-10), activeAfterUndo: act, boxAfterRedo: (boxR ?? '').slice(-10) },
      };
    },
  },
  {
    id: 'E1x-canvas-then-content-box', claims: ['E1x'],
    how: 'type " ZQCV" on the canvas in block 1, then " ZQSB" in its Content box, ⌘Z four times in the box',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a); await typeWord(page, ' ZQCV');
      await openTab(page, 'edit block');
      await focusContentBox(page);
      await typeWord(page, ' ZQSB');
      for (let i = 0; i < 4; i += 1) await press(page, KEY.undo, 200);
      const s = await read(page, [a]); const box = await contentBoxText(page);
      return {
        claims: { E1x: has(s, a, 'ZQCV') || s.blocks[a].store.includes('ZQCV') || (box ?? '').replace(/\s+/g, ' ').trim() !== s.blocks[a].store },
        numbers: { canvas: s.blocks[a].dom.slice(-12), store: s.blocks[a].store.slice(-12), box: (box ?? '').slice(-12) },
      };
    },
  },
  {
    id: 'E2-caption-slider', claims: ['E2'],
    how: 'type " ZQSL" in block 1, click away; select the table, Edit block, focus Caption spacing, ArrowRight × 3, ⌘Z on the slider',
    async run(page, ids) {
      const [a] = ids;
      const table = await blockOf(page, 'table');
      await focusBlockEnd(page, a); await typeWord(page, ' ZQSL');
      await clickAway(page);
      await selectFrame(page, table);
      await openTab(page, 'edit block');
      const slider = page.locator('input[type="range"]').first();
      await slider.scrollIntoViewIfNeeded();
      await slider.focus();
      const g0 = await gapOf(page, table);
      for (let i = 0; i < 3; i += 1) await press(page, 'ArrowRight', 120);
      const g1 = await gapOf(page, table);
      await probeInstall(page);
      const before = await read(page, [a]);
      await press(page, KEY.undo, 300);
      const g2 = await gapOf(page, table); const after = await read(page, [a]); const act = await activeIs(page);
      return {
        claims: { E2: g2 !== g1 - 1 || !unchanged(before, after, a) || act !== 'INPUT' },
        numbers: { gap: `${g0} → ${g1} → ⌘Z ${g2}`, block1: after.blocks[a].dom.slice(-10), active: act, history: await probeTake(page) },
      };
    },
  },
  {
    id: 'E4-code-box-keeps-own-undo', claims: ['E4'],
    how: 'type " ZQFG" in block 1, click away; Figure › Check a figure, click the code box, insert a 53-character script, ⌘Z three times there',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a); await typeWord(page, ' ZQFG');
      await clickAway(page);
      await openTab(page, 'figure');
      await page.getByRole('button', { name: 'Check a figure' }).click();
      await page.waitForTimeout(300);
      const ta = page.locator('textarea[aria-label="Your R or Python plotting code"]');
      await ta.waitFor({ state: 'visible', timeout: 8000 });
      await ta.click();
      await page.keyboard.insertText('library(ggplot2)\nggplot(df, aes(x, y)) + geom_point()');
      await page.waitForTimeout(600);
      await probeInstall(page);
      const before = await read(page, [a]);
      const lens = [];
      const acts = [];
      for (let i = 0; i < 3; i += 1) {
        await press(page, KEY.undo, 300);
        lens.push((await ta.inputValue()).length);
        acts.push(await activeIs(page));
      }
      const after = await read(page, [a]);
      return {
        claims: { E4: !unchanged(before, after, a) || after.canRedo !== before.canRedo || acts.some((x) => !x.startsWith('TEXTAREA')) },
        numbers: { codeLengthAfterEachUndo: lens.join(' → '), active: acts.join(' → '), block1: after.blocks[a].dom.slice(-10), history: await probeTake(page) },
      };
    },
  },
  {
    id: 'E5-edit-menu-stand-in', claims: ['E5'],
    how: 'type " ZQMA" in block 1; document.execCommand("undo") with the caret in it; click away; execCommand("undo") and ("redo") with the focus on the page',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a); await typeWord(page, ' ZQMA');
      await probeInstall(page);
      const s0 = await read(page, [a]);
      const exec = (c) => page.evaluate((cmd) => { try { return document.execCommand(cmd); } catch (e) { return `throw ${e}`; } }, c);
      const r1 = await exec('undo'); await page.waitForTimeout(300); const s1 = await read(page, [a]);
      await clickAway(page);
      const r2 = await exec('undo'); await page.waitForTimeout(300); const s2 = await read(page, [a]);
      const r3 = await exec('redo'); await page.waitForTimeout(300); const s3 = await read(page, [a]);
      // The poster may be undone by the editor (its redo then holds the
      // word) or not at all; it must never differ from what is on screen,
      // nor change behind the editor's back.
      const bad = (prev, s) => !agree(s, a) || (s.blocks[a].store !== prev.blocks[a].store && !s.canRedo && s.blocks[a].store.length < prev.blocks[a].store.length);
      return {
        claims: { E5: bad(s0, s1) || bad(s1, s2) || !agree(s3, a) },
        numbers: { returns: `${r1}/${r2}/${r3}`, afterInBlock: s1.blocks[a].dom.slice(-10), afterOnPage: s2.blocks[a].dom.slice(-10), afterRedo: s3.blocks[a].dom.slice(-10), storeMatchesDom: [agree(s1, a), agree(s2, a), agree(s3, a)].join('/'), history: await probeTake(page) },
      };
    },
  },
  {
    id: 'E6-ctrl-z-in-text', claims: ['E6'],
    how: 'type " ZQCT" in block 1, Ctrl+Z with the caret in it (on a Mac too)',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a); await typeWord(page, ' ZQCT');
      await press(page, 'Control+z', 300);
      const s = await read(page, [a]);
      return { claims: { E6: has(s, a, 'ZQCT') || !s.canRedo }, numbers: { block1: s.blocks[a].dom.slice(-10), canRedo: s.canRedo, host: MOD } };
    },
  },
  {
    id: 'E7-deleted-block-undo-in-text', claims: ['E7'],
    how: 'select the image (frame corner), Backspace; click into block 1; ⌘Z',
    async run(page, ids) {
      const [a] = ids;
      const img = await blockOf(page, 'image');
      await selectFrame(page, img);
      await page.evaluate(() => document.activeElement?.blur?.());
      await press(page, 'Backspace', 300);
      const del = await read(page, [img]);
      if (del.blocks[img].present) throw new Error('Backspace did not delete the selected image');
      await focusBlockEnd(page, a);
      await press(page, KEY.undo, 300);
      const s = await read(page, [img]);
      return { claims: { E7: !s.blocks[img].present }, numbers: { imageBack: s.blocks[img].present, canRedo: s.canRedo } };
    },
  },
  {
    id: 'E9-title-block', claims: ['E9'],
    how: 'type " ZQTW" in the title (not "ZQTI": the fixture\'s title starts "ZQTITLE"), ⌘Z in it, click away, ⌘⇧Z',
    async run(page) {
      const t = await blockOf(page, 'title');
      await focusBlockEnd(page, t); await typeWord(page, ' ZQTW');
      await press(page, KEY.undo, 300); const u = await read(page, [t]);
      await clickAway(page);
      await press(page, KEY.redo, 300); const r = await read(page, [t]);
      return { claims: { E9: has(u, t, 'ZQTW') || !u.canRedo || !has(r, t, 'ZQTW') }, numbers: { afterUndo: u.blocks[t].dom.slice(-10), canRedoAfterUndo: u.canRedo, afterRedo: r.blocks[t].dom.slice(-10) } };
    },
  },
  {
    id: 'E14-preview', claims: ['E14'],
    how: 'type " ZQPV" in block 1, click away, Export › Preview poster, ⌘Z twice, Escape, ⌘Z',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a); await typeWord(page, ' ZQPV');
      await clickAway(page);
      await openTab(page, 'export');
      await page.getByRole('button', { name: /Preview poster/ }).click();
      await page.waitForTimeout(800);
      await probeInstall(page);
      const before = await read(page, [a]);
      await press(page, KEY.undo, 300); await press(page, KEY.undo, 300);
      const inPreview = await read(page, [a]);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      await press(page, KEY.undo, 300);
      const out = await read(page, [a]);
      return {
        claims: { E14: !unchanged(before, inPreview, a) || inPreview.canRedo || has(out, a, 'ZQPV') },
        numbers: { inPreview: inPreview.blocks[a].store.slice(-10), canRedoInPreview: inPreview.canRedo, afterExitUndo: out.blocks[a].dom.slice(-10), history: await probeTake(page) },
      };
    },
  },
  {
    id: 'E15-dialog-open', claims: ['E15'],
    how: 'type " ZQMD" in block 1, click away; Layout width ↑ Enter (the size dialog), ⌘Z twice; Cancel, click away, ⌘Z',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a); await typeWord(page, ' ZQMD');
      await clickAway(page);
      await openTab(page, 'layout');
      await page.locator('input[aria-label="Poster width in inches"]').click();
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Enter');
      const dlg = page.getByRole('dialog', { name: /Change poster to/ });
      await dlg.waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(300);
      await probeInstall(page);
      const before = await read(page, [a]);
      await press(page, KEY.undo, 300); await press(page, KEY.undo, 300);
      const inDialog = await read(page, [a]);
      const focusInDialog = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
      await dlg.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.waitForTimeout(500);
      await clickAway(page);
      await press(page, KEY.undo, 300);
      const after = await read(page, [a]);
      return {
        claims: { E15: !unchanged(before, inDialog, a) || !focusInDialog || has(after, a, 'ZQMD') },
        numbers: { inDialog: inDialog.blocks[a].dom.slice(-10), focusInDialog, afterCancelUndo: after.blocks[a].dom.slice(-10), history: await probeTake(page) },
      };
    },
  },
  {
    id: 'E17-table-caption', claims: ['E17'],
    how: 'type " ZQCC" in block 1, click away; select the table, Edit block, click the caption field, End, type " ZQCAP", ⌘Z there',
    async run(page, ids) {
      const [a] = ids;
      const table = await blockOf(page, 'table');
      await focusBlockEnd(page, a); await typeWord(page, ' ZQCC');
      await clickAway(page);
      await selectFrame(page, table);
      await openTab(page, 'edit block');
      const cap = page.locator('input[placeholder="table description…"]');
      await cap.scrollIntoViewIfNeeded();
      await cap.click();
      await page.keyboard.press('End');
      const c0 = await captionOf(page, table);
      await typeWord(page, ' ZQCAP');
      await press(page, KEY.undo, 300);
      const c1 = await captionOf(page, table); const s = await read(page, [a]); const act = await activeIs(page);
      // The word goes in one ⌘Z, through the editor (its redo holds it);
      // the space typed before it is a step of its own (historySteps.ts).
      return {
        claims: { E17: c1.trimEnd() !== c0.trimEnd() || !s.canRedo || !has(s, a, 'ZQCC') || !act.startsWith('INPUT') },
        numbers: { caption: `${JSON.stringify(c0)} → ⌘Z ${JSON.stringify(c1)}`, field: await cap.inputValue(), canRedo: s.canRedo, block1: s.blocks[a].dom.slice(-10), active: act },
      };
    },
  },
];
