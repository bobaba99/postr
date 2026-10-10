/**
 * The item 12 reproducer's scenarios for scripts/undo-history-check.mjs
 * (typing, keys, formatting, sidebar fields, tables, depth), updated for
 * the owner's decisions of 2026-10-06 (record
 * docs/fixes/12-one-undo-history.md, section 3): the selection toolbar's
 * A+ and alignment are gone (their claims moved to TB in
 * undoScenariosEntries.mjs), U8 also reads where the focus goes (K2), U12
 * counts reversed letters (U12r), and U9n became claim N1. The claims are
 * listed in the harness's header.
 */
import {
  KEY, MOD, PAUSE, caretIn, changeFont, clickAway, focusBlockEnd, openTab, press, pressUntil,
  read, selectLastWord, textBlockIds, typeWord, withParagraphs,
} from './undoKit.mjs';

/** A point just after the focused table cell's last letter. */
function cellTextEnd(page) {
  return page.evaluate(() => {
    const host = document.activeElement;
    const r = document.createRange();
    r.selectNodeContents(host);
    const rects = [...r.getClientRects()];
    const last = rects[rects.length - 1] ?? host.getBoundingClientRect();
    return { x: last.right - 1, y: last.top + last.height / 2 };
  });
}

/** The caret is collapsed at the end of the focused editing host. */
function caretAtCellEnd(page) {
  return page.evaluate(() => {
    const host = document.activeElement;
    const sel = getSelection();
    if (!host?.isContentEditable || !sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
    const r = document.createRange();
    r.selectNodeContents(host);
    r.setStart(sel.anchorNode, sel.anchorOffset);
    return r.toString().length === 0;
  });
}

/** Each formatting action X, from the user's entry point; returns once it has landed. */
async function formatAction(page, x, [a, b]) {
  if (x === 'paste') {
    await selectLastWord(page, b);
    await press(page, KEY.copy);
    await focusBlockEnd(page, a);
    await press(page, KEY.paste, 300);
  } else {
    await selectLastWord(page, a);
    if (x === 'boldkey') await press(page, KEY.bold, 300);
    if (x === 'del') await press(page, 'Backspace', 300);
    if (x === 'bold') {
      // The selection toolbar (portaled, fixed, z-index 9700), not the
      // docked copy in the sidebar's Edit block tab.
      const btn = page.locator('div[style*="z-index: 9700"] button[title="B"]').first();
      await btn.waitFor({ state: 'visible', timeout: 3000 });
      await btn.click();
      await page.waitForTimeout(300);
    }
  }
  await page.waitForTimeout(PAUSE);
}

const FORMAT_HOW = {
  bold: 'select the last word of block 1 (word-left with Shift), click B on the selection toolbar',
  boldkey: 'select the last word of block 1, ⌘B (Playwright delivers native ⌘B to Chromium only)',
  paste: 'select the last word of block 2, ⌘C; caret at the end of block 1, ⌘V',
  del: 'select the last word of block 1, Backspace',
};

const tail = (h) => (h ?? '').slice(-64);

/** X, then ⌘Z and ⌘⇧Z with the caret still in the block (claims Xu, Xr; Xs for size). */
function formatInside(x) {
  return {
    id: `F-${x}-inside`, claims: [`${x}u`, `${x}r`],
    how: `${FORMAT_HOW[x]}; then ⌘Z and ⌘⇧Z in the block`,
    async run(page, ids) {
      const [a] = ids;
      const before = await read(page, [a]);
      await formatAction(page, x, ids);
      const done = await read(page, [a]);
      if (done.blocks[a].domHtml === before.blocks[a].domHtml) {
        if (x === 'paste') return { skip: 'the engine\'s clipboard did not carry ⌘C to ⌘V (nothing pasted)' };
        throw new Error(`${x} changed nothing in the block`);
      }
      await press(page, KEY.undo, 300);
      const u = await read(page, [a]);
      await press(page, KEY.redo, 300);
      const r = await read(page, [a]);
      const claims = {
        [`${x}u`]: u.blocks[a].domHtml !== before.blocks[a].domHtml,
        [`${x}r`]: r.blocks[a].domHtml !== done.blocks[a].domHtml,
      };
      return {
        claims,
        numbers: {
          before: tail(before.blocks[a].domHtml), afterX: tail(done.blocks[a].domHtml),
          storeAfterX: tail(done.blocks[a].storeHtml), afterUndo: tail(u.blocks[a].domHtml),
          afterRedo: tail(r.blocks[a].domHtml), canRedo: r.canRedo, toastUndo: u.toast,
        },
      };
    },
  };
}

/** X, click away, ⌘Z (claim Xo). */
function formatOutside(x) {
  return {
    id: `F-${x}-outside`, claims: [`${x}o`],
    how: `${FORMAT_HOW[x]}; click away; ⌘Z`,
    async run(page, ids) {
      const [a] = ids;
      const before = await read(page, [a]);
      await formatAction(page, x, ids);
      const done = await read(page, [a]);
      if (done.blocks[a].domHtml === before.blocks[a].domHtml) {
        if (x === 'paste') return { skip: 'the engine\'s clipboard did not carry ⌘C to ⌘V (nothing pasted)' };
        throw new Error(`${x} changed nothing in the block`);
      }
      await clickAway(page);
      await press(page, KEY.undo, 300);
      const o = await read(page, [a]);
      return {
        claims: { [`${x}o`]: o.blocks[a].domHtml !== before.blocks[a].domHtml },
        numbers: { before: tail(before.blocks[a].domHtml), afterX: tail(done.blocks[a].domHtml), afterUndo: tail(o.blocks[a].domHtml), canUndoBefore: done.canUndo, toast: o.toast },
      };
    },
  };
}

const has = (s, id, word) => (s.blocks[id].dom ?? '').includes(word);
const agree = (s, id) => s.blocks[id].dom === s.blocks[id].store;

// ------------------------------------------------------------------ scenarios
// A scenario returns { claims: {id: boolean observed}, numbers, info? } or,
// for a control, { control: true, ok, numbers }. `skip` = a string reason.
export const CORE = [
  {
    id: 'C1-sidebar-font', control: true,
    how: 'Style › Font → DM Sans, click away, ⌘Z, ⌘⇧Z (key "z"), ⌘Z, ⌘Y',
    async run(page) {
      const before = (await read(page, [])).font;
      await changeFont(page);
      await clickAway(page);
      const changed = (await read(page, [])).font;
      await press(page, KEY.undo); const u = (await read(page, [])).font;
      await press(page, KEY.redo); const r = (await read(page, [])).font;
      await press(page, KEY.undo); await press(page, KEY.redoY); const ry = (await read(page, [])).font;
      return { control: true, ok: changed === 'DM Sans' && u === before && r === 'DM Sans' && ry === 'DM Sans', numbers: { before, changed, undo: u, redo: r, redoY: ry } };
    },
  },
  {
    id: 'C2-type-click-away', control: true,
    how: 'type " ZQTYPED" in text block 1, click away, ⌘Z, ⌘⇧Z',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a); await typeWord(page, ' ZQTYPED');
      await clickAway(page);
      await press(page, KEY.undo); const u = await read(page, [a]);
      await press(page, KEY.redo); const r = await read(page, [a]);
      return {
        control: true,
        ok: !has(u, a, 'ZQTYPED') && agree(u, a) && has(r, a, 'ZQTYPED') && agree(r, a),
        numbers: { afterUndo: u.blocks[a].dom.slice(-24), afterRedo: r.blocks[a].dom.slice(-24), toastUndo: u.toast, toastRedo: r.toast },
      };
    },
  },
  {
    id: 'U1-type-undo-inside', claims: ['U1', 'U1g'],
    how: 'type " ZQTYPED" (8 characters, 35 ms apart) in block 1, then ⌘Z in the block until the word is gone (≤ 12)',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a); await typeWord(page, ' ZQTYPED');
      const typed = await read(page, [a]);
      await press(page, KEY.undo);
      const first = await read(page, [a]);
      const rest = await pressUntil(page, [a], KEY.undo, (s) => !s.blocks[a].dom.includes(' Z'), 11);
      const presses = 1 + rest.presses;
      return {
        claims: {
          U1: first.blocks[a].dom !== typed.blocks[a].dom && first.canRedo === false && first.toast === null,
          U1g: presses !== 1 || !rest.reached,
        },
        numbers: {
          firstUndoRemoved: JSON.stringify(typed.blocks[a].dom.slice(first.blocks[a].dom.length)),
          canRedoAfterFirst: first.canRedo, toastAfterFirst: first.toast,
          pressesToRemoveWord: rest.reached ? presses : `>${presses}`,
          storeMatchesDom: agree(rest.state, a), active: rest.state.active,
        },
      };
    },
  },
  {
    id: 'U2-type-redo-inside', claims: ['U2', 'U2y'],
    how: 'type " ZQTYPED", ⌘Z in the block until gone, ⌘⇧Z until back (≤ 12); then ⌘Z once and ⌘Y',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a); await typeWord(page, ' ZQTYPED');
      const u = await pressUntil(page, [a], KEY.undo, (s) => !s.blocks[a].dom.includes(' Z'), 12);
      const r = await pressUntil(page, [a], KEY.redo, (s) => s.blocks[a].dom.includes('ZQTYPED'), 12);
      await press(page, KEY.undo);
      const beforeY = await read(page, [a]);
      await press(page, KEY.redoY);
      const afterY = await read(page, [a]);
      return {
        claims: { U2: !r.reached, U2y: afterY.blocks[a].dom === beforeY.blocks[a].dom },
        numbers: {
          undoPresses: u.presses, redoPresses: r.presses, redone: r.reached, canRedo: r.state.canRedo,
          cmdYChanged: afterY.blocks[a].dom !== beforeY.blocks[a].dom, storeMatchesDom: agree(afterY, a),
        },
      };
    },
  },
  {
    id: 'U3-F2-redo-after-leaving', claims: ['U3'],
    how: 'type " ZQTYPED", ⌘Z in the block until gone, click away, ⌘⇧Z (and ⌘Y)',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a); await typeWord(page, ' ZQTYPED');
      const u = await pressUntil(page, [a], KEY.undo, (s) => !s.blocks[a].dom.includes(' Z'), 12);
      await clickAway(page);
      const away = await read(page, [a]);
      await press(page, KEY.redo); const r = await read(page, [a]);
      await press(page, KEY.redoY); const ry = await read(page, [a]);
      return {
        claims: { U3: !has(r, a, 'ZQTYPED') && !has(ry, a, 'ZQTYPED') },
        numbers: { undoPresses: u.presses, canRedoAfterLeaving: away.canRedo, afterCmdShiftZ: has(r, a, 'ZQTYPED'), afterCmdY: has(ry, a, 'ZQTYPED'), toast: r.toast },
      };
    },
  },
  {
    id: 'U4-undo-inside-then-outside', claims: ['U4'],
    how: 'type " ZQTYPED", ⌘Z in the block until gone, click away, ⌘Z (and again until the block is as it was before typing, ≤ 12)',
    async run(page, ids) {
      const [a] = ids;
      const orig = (await read(page, [a])).blocks[a].dom;
      await focusBlockEnd(page, a); await typeWord(page, ' ZQTYPED');
      const u = await pressUntil(page, [a], KEY.undo, (s) => !s.blocks[a].dom.includes(' Z'), 12);
      await clickAway(page);
      await press(page, KEY.undo); const o1 = await read(page, [a]);
      // How many of the editor's ⌘Z bring the block back to before the typing,
      // and what each one shows on the way.
      const trail = [o1.blocks[a].dom.slice(orig.length - 3) || '(orig)'];
      let n = 1;
      let s = o1;
      while (n < 12 && s.blocks[a].dom !== orig && s.canUndo) {
        await press(page, KEY.undo, 120); n += 1; s = await read(page, [a]);
        trail.push(s.blocks[a].dom.slice(orig.length - 3) || '(orig)');
      }
      return {
        claims: { U4: has(o1, a, 'ZQTYPED') || o1.blocks[a].dom.length > orig.length },
        numbers: { insidePresses: u.presses, firstOutsideUndoShows: JSON.stringify(o1.blocks[a].dom.slice(orig.length)), outsidePressesToOriginal: s.blocks[a].dom === orig ? n : `>${n}`, trail: trail.join(' → ') },
      };
    },
  },
  {
    id: 'U5-burst-granularity', claims: ['U5'],
    how: 'block 1: type " ZQONE", 1.5 s, " ZQTWO", ⌘Z in the block; block 2: the same, click away, ⌘Z; compare what each removed',
    async run(page, ids) {
      const [a, b] = ids;
      const origA = (await read(page, [a])).blocks[a].dom;
      const origB = (await read(page, [b])).blocks[b].dom;
      await focusBlockEnd(page, a);
      await page.keyboard.type(' ZQONE', { delay: 35 }); await page.waitForTimeout(1500);
      await typeWord(page, ' ZQTWO');
      await press(page, KEY.undo);
      const inside = (await read(page, [a])).blocks[a].dom.slice(origA.length);
      await focusBlockEnd(page, b);
      await page.keyboard.type(' ZQONE', { delay: 35 }); await page.waitForTimeout(1500);
      await typeWord(page, ' ZQTWO');
      await clickAway(page);
      await press(page, KEY.undo);
      const outside = (await read(page, [b])).blocks[b].dom.slice(origB.length);
      return {
        claims: { U5: inside !== outside },
        numbers: { leftAfterInsideUndo: JSON.stringify(inside), leftAfterOutsideUndo: JSON.stringify(outside) },
      };
    },
  },
  {
    id: 'U6-sidebar-edit-then-undo-in-text', claims: ['U6'],
    how: 'Style › Font → DM Sans, click into text block 1 (no typing), ⌘Z',
    async run(page, ids) {
      const [a] = ids;
      await changeFont(page);
      await focusBlockEnd(page, a);
      const before = await read(page, [a]);
      await press(page, KEY.undo);
      const after = await read(page, [a]);
      return {
        claims: { U6: after.font === 'DM Sans' },
        numbers: { fontAfterUndo: after.font, blockTextChanged: after.blocks[a].dom !== before.blocks[a].dom, active: after.active, toast: after.toast },
      };
    },
  },
  {
    id: 'U7-across-blocks-inside', claims: ['U7'],
    how: 'type " ZQAAA" in block 1, " ZQBBB" in block 2, then ⌘Z in block 2 (≤ 20), watching both',
    async run(page, ids) {
      const [a, b] = ids;
      await focusBlockEnd(page, a); await typeWord(page, ' ZQAAA');
      await focusBlockEnd(page, b); await typeWord(page, ' ZQBBB');
      let bGone = null;
      let aGone = null;
      let s = await read(page, [a, b]);
      for (let n = 1; n <= 20 && aGone === null; n += 1) {
        await press(page, KEY.undo, 120);
        s = await read(page, [a, b]);
        if (bGone === null && !has(s, b, 'ZQB')) bGone = n;
        if (!has(s, a, 'ZQA')) aGone = n;
      }
      return {
        claims: { U7: aGone === null },
        numbers: { pressesUntilBlock2WordGone: bGone ?? '>20', pressesUntilBlock1WordGone: aGone ?? '>20', block1: s.blocks[a].dom.slice(-14), block2: s.blocks[b].dom.slice(-14), active: s.active, canRedo: s.canRedo },
      };
    },
  },
  {
    id: 'U8-other-block-undo', claims: ['U8', 'K2'],
    how: 'type " ZQAAA" in block 1, click into block 2 (no typing), ⌘Z',
    async run(page, ids) {
      const [a, b] = ids;
      await focusBlockEnd(page, a); await typeWord(page, ' ZQAAA');
      await focusBlockEnd(page, b);
      const before = await read(page, [a, b]);
      await press(page, KEY.undo, 300);
      const after = await read(page, [a, b]);
      return {
        claims: {
          U8: after.blocks[a].dom === before.blocks[a].dom,
          // Owner decision 4: the block whose text was undone has the caret.
          K2: after.active !== `CE:${a}`,
        },
        numbers: { block1Before: before.blocks[a].dom.slice(-10), block1After: after.blocks[a].dom.slice(-10), block2Changed: after.blocks[b].dom !== before.blocks[b].dom, active: after.active, canRedo: after.canRedo },
      };
    },
  },
  ...[
    ['U9-sidebar-field-undo', 'authors', 'input[placeholder="Author name"]', 'Authors › Author name (a field of the poster)'],
  ].map(([id, tab, selector, label]) => ({
    id, claims: ['U9'],
    how: `type " ZQAAA" in block 1, click ${label} (no typing), ⌘Z`,
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a); await typeWord(page, ' ZQAAA');
      await openTab(page, tab);
      const field = page.locator(selector).first();
      await field.click();
      await page.waitForTimeout(200);
      const before = await read(page, [a]);
      const valueBefore = await field.inputValue();
      await press(page, KEY.undo, 300);
      const after = await read(page, [a]);
      return {
        claims: { U9: after.canRedo === false || has(after, a, 'ZQAAA') },
        numbers: { active: before.active, block1Before: before.blocks[a].dom.slice(-10), block1After: after.blocks[a].dom.slice(-10), storeAfter: after.blocks[a].store.slice(-10), fieldBefore: valueBefore, fieldAfter: await field.inputValue(), canRedo: after.canRedo, toast: after.toast },
      };
    },
  })),
  ...['bold', 'paste', 'del'].flatMap((x) => [formatInside(x), formatOutside(x)]),
  { ...formatInside('boldkey'), info: true, chromiumOnly: true },
  ...['inside', 'outside'].map((where) => ({
    // Edit block's Font size field is hidden (record 29).
    id: `F-blocksize-${where}`, claims: [where === 'inside' ? 'bsf' : 'bso'], needs: 'ADJUSTMENTS_ENABLED',
    how: `click block 1, Edit block › Font size field: select all, type 60; ${where === 'inside' ? '⌘Z in the field, then ⌘⇧Z' : 'click away, ⌘Z'}`,
    async run(page, ids) {
      const [a] = ids;
      const px = () => page.evaluate((id) => getComputedStyle(document.querySelector(`#poster-canvas [data-block-id="${id}"] [contenteditable]`)).fontSize, a);
      await focusBlockEnd(page, a);
      const field = page.locator('input[title="Font size (points)"]').first();
      await field.waitFor({ state: 'visible', timeout: 5000 });
      const v0 = await field.inputValue();
      const px0 = await px();
      await field.click();
      await press(page, `${MOD}+a`, 80);
      await page.keyboard.type('60', { delay: 35 });
      await page.waitForTimeout(PAUSE);
      const v1 = await field.inputValue();
      const px1 = await px();
      if (px1 === px0) throw new Error('typing 60 in the Font size field did not change the block');
      if (where === 'outside') {
        await clickAway(page);
        await press(page, KEY.undo, 300);
        const pxo = await px();
        return { claims: { bso: pxo !== px0 }, numbers: { blockFont: `${px0} → ${px1} → ⌘Z ${pxo}`, field: `${v0} → ${v1}` } };
      }
      await press(page, KEY.undo, 300);
      const vu = await field.inputValue(); const pxu = await px();
      const su = await read(page, [a]);
      await press(page, KEY.redo, 300);
      const vr = await field.inputValue(); const pxr = await px();
      return {
        claims: { bsf: pxu !== px0 },
        numbers: { field: `${v0} → ${v1} → ⌘Z ${vu} → ⌘⇧Z ${vr}`, blockFont: `${px0} → ${px1} → ⌘Z ${pxu} → ⌘⇧Z ${pxr}`, canRedoAfterFieldUndo: su.canRedo, block1TextAfterFieldUndo: su.blocks[a].dom.slice(-12) },
      };
    },
  })),
  {
    id: 'U10-editor-undo-then-native', claims: ['U10'],
    how: 'type " ZQTYPED" in block 1, click away, ⌘Z (the editor removes it), click back into block 1, ⌘Z, then ⌘⇧Z',
    async run(page, ids) {
      const [a] = ids;
      const orig = (await read(page, [a])).blocks[a].dom;
      await focusBlockEnd(page, a); await typeWord(page, ' ZQTYPED');
      await clickAway(page);
      await press(page, KEY.undo);
      const s1 = await read(page, [a]);
      if (s1.blocks[a].dom !== orig) throw new Error(`the editor's undo did not restore the block (${s1.blocks[a].dom.slice(-16)})`);
      await focusBlockEnd(page, a);
      const sf = await read(page, [a]);
      await page.evaluate((id) => {
        const host = document.querySelector(`#poster-canvas [data-block-id="${id}"] [contenteditable]`);
        window.__inputs = [];
        host.addEventListener('input', (e) => window.__inputs.push(`${e.inputType}:${host.textContent.slice(-10)}`));
      }, a);
      await press(page, KEY.undo, 300);
      const s2 = await read(page, [a]);
      const inputs = await page.evaluate(() => window.__inputs.splice(0));
      await press(page, KEY.redo, 300);
      const s3 = await read(page, [a]);
      // Then the editor's own redo, from outside the block.
      await clickAway(page);
      await press(page, KEY.redo, 300);
      const s4 = await read(page, [a]);
      return {
        claims: { U10: s2.blocks[a].dom !== orig || !has(s4, a, 'ZQTYPED') },
        numbers: { afterEditorUndo: s1.blocks[a].dom.slice(-14), canRedoAfterEditorUndo: s1.canRedo, canRedoAfterFocus: sf.canRedo, nativeUndoInputEvents: inputs.join(' | ') || 'none', storeHtmlBeforeNativeUndo: JSON.stringify(s1.blocks[a].storeHtml), storeHtmlAfterNativeUndo: JSON.stringify(s2.blocks[a].storeHtml), afterNativeUndo: s2.blocks[a].dom.slice(-14), canRedoAfterNativeUndo: s2.canRedo, afterNativeRedo: s3.blocks[a].dom.slice(-14), editorRedoAfterLeaving: s4.blocks[a].dom.slice(-14), storeMatchesDom: agree(s4, a) },
      };
    },
  },
  {
    id: 'U10p-editor-undo-then-native-paragraphs', claims: ['U10'], info: true, editDoc: withParagraphs,
    how: 'type " ZQTYPED" in block 1, click away, ⌘Z (the editor removes it), click back into block 1, ⌘Z, then ⌘⇧Z',
    async run(page, ids) {
      const [a] = ids;
      const orig = (await read(page, [a])).blocks[a].dom;
      await focusBlockEnd(page, a); await typeWord(page, ' ZQTYPED');
      await clickAway(page);
      await press(page, KEY.undo);
      const s1 = await read(page, [a]);
      if (s1.blocks[a].dom !== orig) throw new Error(`the editor's undo did not restore the block (${s1.blocks[a].dom.slice(-16)})`);
      await focusBlockEnd(page, a);
      const sf = await read(page, [a]);
      await page.evaluate((id) => {
        const host = document.querySelector(`#poster-canvas [data-block-id="${id}"] [contenteditable]`);
        window.__inputs = [];
        host.addEventListener('input', (e) => window.__inputs.push(`${e.inputType}:${host.textContent.slice(-10)}`));
      }, a);
      await press(page, KEY.undo, 300);
      const s2 = await read(page, [a]);
      const inputs = await page.evaluate(() => window.__inputs.splice(0));
      await press(page, KEY.redo, 300);
      const s3 = await read(page, [a]);
      // Then the editor's own redo, from outside the block.
      await clickAway(page);
      await press(page, KEY.redo, 300);
      const s4 = await read(page, [a]);
      return {
        claims: { U10: s2.blocks[a].dom !== orig || !has(s4, a, 'ZQTYPED') },
        numbers: { afterEditorUndo: s1.blocks[a].dom.slice(-14), canRedoAfterEditorUndo: s1.canRedo, canRedoAfterFocus: sf.canRedo, nativeUndoInputEvents: inputs.join(' | ') || 'none', storeHtmlBeforeNativeUndo: JSON.stringify(s1.blocks[a].storeHtml), storeHtmlAfterNativeUndo: JSON.stringify(s2.blocks[a].storeHtml), afterNativeUndo: s2.blocks[a].dom.slice(-14), canRedoAfterNativeUndo: s2.canRedo, afterNativeRedo: s3.blocks[a].dom.slice(-14), editorRedoAfterLeaving: s4.blocks[a].dom.slice(-14), storeMatchesDom: agree(s4, a) },
      };
    },
  },
  {
    id: 'U11-type-after-undo-inside', claims: ['U11'],
    how: 'type " ZQTYPED" in block 1, ⌘Z in the block until the word is gone (≤ 12), type "Q"',
    async run(page, ids) {
      const [a] = ids;
      const orig = (await read(page, [a])).blocks[a].dom;
      await focusBlockEnd(page, a); await typeWord(page, ' ZQTYPED');
      const u = await pressUntil(page, [a], KEY.undo, (s) => !s.blocks[a].dom.includes(' Z'), 12);
      await typeWord(page, 'Q');
      const s = await read(page, [a]);
      return {
        claims: { U11: s.blocks[a].store.includes('ZQTYPED') || s.blocks[a].dom.includes('ZQTYPED') },
        numbers: { undoPresses: u.presses, wordGoneOnScreen: u.reached, storeAfterQ: s.blocks[a].store.slice(orig.length - 3), domAfterQ: s.blocks[a].dom.slice(orig.length - 3), storeMatchesDom: agree(s, a) },
      };
    },
  },
  {
    id: 'U12-table-cell-typing', claims: ['U12', 'U12r', 'U12e'],
    how: 'type "ZQCELL" in a body cell of the table, click away, ⌘Z until gone (≤ 12); on a second poster: Style › Font, then 55 characters in the cell, click away, ⌘Z × 60',
    async run(page, ids, reopen) {
      const cellText = (p) => p.evaluate(() => [...document.querySelectorAll('#poster-canvas [data-block-type="table"] td [contenteditable]')][3]?.textContent ?? null);
      const typeInCell = async (p, text) => {
        const cell = p.locator('#poster-canvas [data-block-type="table"] td [contenteditable]').nth(3);
        await cell.scrollIntoViewIfNeeded();
        for (let i = 0; i < 3 && !(await p.evaluate(() => !!document.activeElement?.closest('td'))); i += 1) {
          await cell.click(); await p.waitForTimeout(250);
        }
        if (!(await p.evaluate(() => !!document.activeElement?.closest('td')))) throw new Error('could not focus a table cell');
        // A click just after the cell's last letter puts the caret at its
        // end. Not ⌘↓ (version 1): the table moves the focus to the cell
        // below when ↓ is pressed with the caret already at the end.
        const end = await cellTextEnd(p);
        await p.mouse.click(end.x, end.y);
        await p.waitForTimeout(150);
        // On main the cell is rewritten as it takes the focus, and the caret
        // goes back to its start: recorded, and part of U12r.
        const atEnd = await caretAtCellEnd(p);
        await p.keyboard.type(text, { delay: 35 });
        await p.waitForTimeout(PAUSE);
        return atEnd;
      };
      const c0 = await cellText(page);
      const caretAtEndAfterClick = await typeInCell(page, 'ZQCELL');
      const c1 = await cellText(page);
      // The letters, in whatever order they landed (U12r: on main the cell
      // was rewritten on every keystroke and its caret jumped to the start).
      if (c1?.length !== c0.length + 6) throw new Error(`typing did not reach the cell (${c0} → ${c1})`);
      await clickAway(page);
      let n = 0;
      while (n < 12 && (await cellText(page)) !== c0) { await press(page, KEY.undo, 120); n += 1; }
      const gone = (await cellText(page)) === c0;
      // History eviction: a font change, then 55 typed characters in a cell.
      const { page: p2 } = await reopen();
      await changeFont(p2);
      await typeInCell(p2, 'ZQ' + 'x'.repeat(53));
      await clickAway(p2);
      let fontBack = null;
      for (let i = 1; i <= 60 && fontBack === null; i += 1) {
        await press(p2, KEY.undo, 40);
        if ((await read(p2, [])).font !== 'DM Sans') fontBack = i;
      }
      return {
        claims: { U12: !gone || n > 1, U12r: c1 !== `${c0}ZQCELL`, U12e: fontBack === null },
        numbers: { cellBefore: c0, caretAtEndAfterClick, cellAfterTypingZQCELL: c1, undosToRemove6Chars: gone ? n : `>${n}`, undosUntilFontChangeReverted: fontBack ?? '>60 (evicted)' },
      };
    },
  },
  ...[['highlight', 'Highlight · Yellow']].map(([what, title]) => ({
    // The format bar's highlight is hidden (record 29).
    id: `P1-${what}-kept`, info: true, claims: ['kept'], needs: 'ADJUSTMENTS_ENABLED',
    how: `select the last word of block 1, click ${title} on the selection toolbar, then type "Q" at the end (a later keystroke commits the block)`,
    async run(page, ids) {
      const [a] = ids;
      await selectLastWord(page, a);
      const btn = page.locator(`div[style*="z-index: 9700"] button[title="${title}"]`).first();
      await btn.waitFor({ state: 'visible', timeout: 3000 });
      await btn.click();
      await page.waitForTimeout(300);
      const s1 = await read(page, [a]);
      await focusBlockEnd(page, a); await typeWord(page, 'Q');
      const s2 = await read(page, [a]);
      const mark = /background-color/;
      return {
        claims: { kept: !mark.test(s2.blocks[a].storeHtml) },
        numbers: { domAfter: tail(s1.blocks[a].domHtml), storeAfter: tail(s1.blocks[a].storeHtml), storeAfterQ: tail(s2.blocks[a].storeHtml) },
      };
    },
  })),
  {
    id: 'U14-ctrl-keys', claims: ['U14'],
    how: 'Style › Font → DM Sans, click away, Ctrl+Z, Ctrl+Shift+Z (key "Z"), then Ctrl+Y',
    async run(page) {
      const before = (await read(page, [])).font;
      await changeFont(page);
      await clickAway(page);
      await press(page, 'Control+z'); const u = (await read(page, [])).font;
      await press(page, 'Control+Shift+KeyZ'); const r = (await read(page, [])).font;
      await press(page, 'Control+y'); const ry = (await read(page, [])).font;
      if (u !== before) throw new Error(`Ctrl+Z did not undo the font (${u})`);
      return { claims: { U14: r !== 'DM Sans' }, numbers: { afterCtrlZ: u, afterCtrlShiftZ: r, afterCtrlY: ry } };
    },
  },
  {
    id: 'U15-cmd-shift-Z-uppercase', claims: ['U15'],
    how: 'Style › Font → DM Sans, click away, ⌘Z, ⌘⇧Z delivered as key "Z"',
    async run(page) {
      await changeFont(page);
      await clickAway(page);
      await press(page, KEY.undo);
      await press(page, KEY.redoUpper); const r = await read(page, []);
      return { claims: { U15: r.font !== 'DM Sans' }, numbers: { afterRedo: r.font, canRedo: r.canRedo } };
    },
  },
  {
    id: 'U16-toast-with-nothing', claims: ['U16'],
    how: 'a freshly opened poster, click away, ⌘Z, then ⌘⇧Z',
    async run(page, ids) {
      await clickAway(page);
      const s0 = await read(page, ids);
      await press(page, KEY.undo, 100); const u = await read(page, ids);
      await page.waitForTimeout(1500);
      await press(page, KEY.redo, 100); const r = await read(page, ids);
      const same = (s) => ids.every((id) => s.blocks[id].domHtml === s0.blocks[id].domHtml);
      return {
        claims: { U16: (u.toast === 'Undo' && !s0.canUndo && same(u)) || (r.toast === 'Redo' && !s0.canRedo && same(r)) },
        numbers: { canUndo: s0.canUndo, canRedo: s0.canRedo, toastAfterUndo: u.toast, toastAfterRedo: r.toast, docUnchanged: same(u) && same(r) },
      };
    },
  },
  {
    id: 'U17-history-depth', claims: ['U17'],
    how: 'click the references block (selects it, no text caret), ArrowRight × 60 (one step each), then ⌘Z × 60',
    async run(page) {
      const ref = page.locator('#poster-canvas [data-block-type="references"]').first();
      const id = await ref.getAttribute('data-block-id');
      await ref.click();
      await page.waitForTimeout(250);
      if (await page.evaluate(() => document.activeElement?.isContentEditable ?? false)) throw new Error('the references block took a text caret');
      const x0 = (await read(page, [id])).blocks[id].x;
      for (let i = 0; i < 60; i += 1) await press(page, 'ArrowRight', 25);
      await page.waitForTimeout(300);
      const x1 = (await read(page, [id])).blocks[id].x;
      if (x1 === x0) throw new Error('ArrowRight did not move the selected block');
      let changed = 0;
      let prev = x1;
      for (let i = 0; i < 60; i += 1) {
        await press(page, KEY.undo, 25);
        const x = (await read(page, [id])).blocks[id].x;
        if (x !== prev) changed += 1;
        prev = x;
      }
      return { claims: { U17: prev !== x0 }, numbers: { x0, afterNudges: x1, afterUndos: prev, undosThatMoved: changed } };
    },
  },
  {
    id: 'M1-mutations-per-keystroke', info: true,
    how: 'observe DOM mutations outside the focused block while typing " ZQTYPED" in block 1',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a);
      await page.evaluate((id) => {
        const host = document.querySelector(`#poster-canvas [data-block-id="${id}"] [contenteditable]`);
        window.__mut = [];
        window.__mo = new MutationObserver((recs) => {
          for (const r of recs) {
            const t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
            if (host.contains(t)) continue;
            const where = t.closest('[data-block-id]') ? `block ${t.closest('[data-block-id]').getAttribute('data-block-type')}`
              : t.closest('[contenteditable]') ? 'a contenteditable outside the canvas (sidebar Content box)'
                : t.closest('aside,nav,[role="tablist"]') ? 'sidebar chrome' : t.tagName.toLowerCase();
            window.__mut.push(`${r.type}:${where}`);
          }
        });
        window.__mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
      }, a);
      await typeWord(page, ' ZQTYPED');
      const muts = await page.evaluate(() => { window.__mo.disconnect(); return window.__mut; });
      const by = {};
      for (const m of muts) by[m] = (by[m] ?? 0) + 1;
      const top = Object.entries(by).sort((p, q) => q[1] - p[1]).slice(0, 6).map(([k, v]) => `${v}× ${k}`);
      return { info: true, numbers: { typedChars: 8, mutationsOutsideBlock: muts.length, perChar: Math.round(muts.length / 8 * 10) / 10, top: top.join('; ') } };
    },
  },
];
