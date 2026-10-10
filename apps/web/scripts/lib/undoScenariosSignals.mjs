/**
 * Scenarios for scripts/undo-history-check.mjs from the fix 12 review,
 * round 1 (record docs/fixes/12-one-undo-history.md, section 9): what the
 * browser says about an edit must decide the undo step, because a diff of
 * the text cannot tell typing from a colour picked one hex digit later, a
 * one-character paste, or a letter typed in front of a word that starts
 * with it; and the browser's own undo in a sidebar field must never be
 * stored. Folded in from the reviewer's probes P1 (E5i), P2 (W4) and P3k
 * (W5); W6 is the caret's word boundary (R1-F6). Each returns
 * { claims: {id: observed}, numbers } (or { skip }); a claim is OBSERVED
 * when the defect is present. The claims are listed in the harness header.
 */
import { KEY, activeIs, clickAway, focusBlockEnd, openTab, press, probeInstall, probeTake, read, typeWord } from './undoKit.mjs';

/** The first author's name, the Edit tab's body colour and the history flags, from the store. */
const storeRead = (page) => page.evaluate(async () => {
  const m = await import('/src/stores/posterStore.ts');
  const s = m.usePosterStore.getState();
  return { author: s.doc.authors[0]?.name ?? null, bodyColor: s.doc.styles.body.color ?? null, canUndo: s.canUndo, canRedo: s.canRedo };
});

/** Record the inputType of every input event in the page (window.__types). */
const recordInputTypes = (page) => page.evaluate(() => {
  window.__types = [];
  document.addEventListener('input', (e) => window.__types.push(e.inputType), true);
});

export const SIGNALS = [
  {
    id: 'W4-colour-drag', claims: ['W4'], needs: 'ADJUSTMENTS_ENABLED', // Edit block's colour field is hidden (record 29)
    how: 'select block 1, Edit block, drag the colour field through 30 values one hex digit apart (the input event the picker fires, one per 16 ms task), click away, ⌘Z until the colour is back',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a);
      await openTab(page, 'edit block');
      const before = (await storeRead(page)).bodyColor;
      const seq = Array.from({ length: 30 }, (_, i) => `#3a5f${(i + 1).toString(16).padStart(2, '0')}`);
      // The native picker cannot be driven; its events can, on the real
      // field: the value set past React, then `input`, as the picker does.
      const fired = await page.evaluate(async (values) => {
        const el = document.querySelector('input[type="color"]');
        if (!el) return 0;
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        for (const v of values) {
          set.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 16));
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return values.length;
      }, seq);
      if (fired !== seq.length) throw new Error('no colour field in Edit block');
      const after = (await storeRead(page)).bodyColor;
      if (after !== seq[seq.length - 1]) throw new Error(`the drag did not reach the store (${after})`);
      await clickAway(page);
      let n = 0;
      let c = after;
      while (c !== before && n < 40) {
        await press(page, KEY.undo, 80);
        n += 1;
        c = (await storeRead(page)).bodyColor;
      }
      return {
        claims: { W4: c !== before || n !== 1 },
        numbers: { values: fired, colour: `${before} → ${after}`, undoPressesToReturn: c === before ? n : `>${n}` },
      };
    },
  },
  {
    id: 'W5-one-character-paste', claims: ['W5'],
    how: 'type " ZQAB" in block 1, Shift+ArrowLeft (selects "B"), ⌘C, caret to the end, ⌘V, type "CD", click away, ⌘Z twice',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a);
      await typeWord(page, ' ZQAB');
      await press(page, 'Shift+ArrowLeft', 120);
      const selected = await page.evaluate(() => getSelection()?.toString() ?? '');
      if (selected !== 'B') throw new Error(`Shift+ArrowLeft selected ${JSON.stringify(selected)}`);
      await press(page, KEY.copy, 150);
      await press(page, KEY.toEnd, 150);
      await recordInputTypes(page);
      await press(page, KEY.paste, 300);
      await typeWord(page, 'CD');
      const t0 = (await read(page, [a])).blocks[a].store;
      if (!t0.endsWith('ZQABBCD')) return { skip: `the engine's clipboard did not carry ⌘C to ⌘V (${JSON.stringify(t0.slice(-8))})` };
      const types = await page.evaluate(() => window.__types.join(','));
      await clickAway(page);
      await press(page, KEY.undo, 300); const u1 = (await read(page, [a])).blocks[a].store;
      await press(page, KEY.undo, 300); const u2 = (await read(page, [a])).blocks[a].store;
      return {
        claims: { W5: !u1.endsWith('ZQABB') || !u2.endsWith('ZQAB') },
        numbers: { inputTypes: JSON.stringify(types), typed: t0.slice(-9), afterUndo1: u1.slice(-9), afterUndo2: u2.slice(-9) },
      };
    },
  },
  {
    id: 'W6-word-at-the-caret', claims: ['W6'],
    how: 'type " ZQAB" in block 1, ArrowLeft × 2 (caret before "AB"), type " A" (a word typed in front of one that starts with "A"), click away, ⌘Z twice',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a);
      await typeWord(page, ' ZQAB');
      await press(page, 'ArrowLeft', 80);
      await press(page, 'ArrowLeft', 80);
      await typeWord(page, ' A');
      const t0 = (await read(page, [a])).blocks[a].store;
      if (!t0.endsWith('ZQ AAB')) throw new Error(`the caret was not before "AB" (${JSON.stringify(t0.slice(-8))})`);
      await clickAway(page);
      await press(page, KEY.undo, 300); const u1 = (await read(page, [a])).blocks[a].store;
      await press(page, KEY.undo, 300); const u2 = (await read(page, [a])).blocks[a].store;
      return {
        claims: { W6: !u1.endsWith('ZQ AB') || !u2.endsWith('ZQAB') },
        numbers: { typed: t0.slice(-8), afterUndo1: u1.slice(-8), afterUndo2: u2.slice(-8) },
      };
    },
  },
  {
    id: 'E5i-edit-menu-in-a-field', claims: ['E5i'],
    how: 'Authors › Author name: click, End, type " ZQX"; document.execCommand("undo") with the focus there (an Edit-menu stand-in); then ⌘Z',
    async run(page) {
      await openTab(page, 'authors');
      const field = page.locator('input[placeholder="Author name"]').first();
      await field.click();
      await page.keyboard.press('End');
      await typeWord(page, ' ZQX');
      const s0 = await storeRead(page);
      if (!(s0.author ?? '').endsWith(' ZQX')) throw new Error(`typing did not reach the author (${s0.author})`);
      await probeInstall(page);
      const r = await page.evaluate(() => { try { return document.execCommand('undo'); } catch (e) { return `throw ${e}`; } });
      await page.waitForTimeout(300);
      const s1 = await storeRead(page); const f1 = await field.inputValue();
      const events = await probeTake(page);
      await press(page, KEY.undo, 300);
      const s2 = await storeRead(page); const f2 = await field.inputValue();
      // The browser's undo may be cancelled and run by the editor (WebKit
      // fires beforeinput: the editor's redo then holds the word) or not
      // stored at all; the store must never change behind the editor's
      // back, the field must show the store, and the editor's ⌘Z must not
      // bring back text (the U4 symptom, in a field).
      const behind = s1.author !== s0.author && !s1.canRedo;
      return {
        claims: { E5i: behind || f1 !== s1.author || f2 !== s2.author || (s2.author ?? '').length > (s1.author ?? '').length },
        numbers: { returned: r, typed: JSON.stringify(s0.author), afterExec: `${JSON.stringify(s1.author)} field ${JSON.stringify(f1)} canRedo ${s1.canRedo}`, afterUndoKey: `${JSON.stringify(s2.author)} field ${JSON.stringify(f2)}`, active: await activeIs(page), history: events },
      };
    },
  },
];
