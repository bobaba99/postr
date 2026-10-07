/**
 * Scenarios for scripts/undo-history-check.mjs from the fix 12 review,
 * round 2 (R2-F1; record docs/fixes/12-one-undo-history.md, section 9):
 * text typed through a composition — an input method (Japanese, Chinese,
 * Korean), a dead key, a phone keyboard that composes each word — must be
 * one unit of the undo history, never one step per composition update.
 *
 * Driven through Chromium's own IME pipeline (CDP Input.imeSetComposition
 * and Input.insertText), which fires the real compositionstart, update and
 * end, beforeinput insertCompositionText and input events. Playwright has
 * no IME driver for Firefox or WebKit, so these are Chromium only. Folded
 * in from the reviewer's probes ime.mjs, evict.mjs and ime-events.mjs.
 *
 * Expected steps (the rule, record section 7 C): a composition joins one
 * step with its commit; it starts a new step after a space, at the start
 * of the field, or after a Han, Hiragana or Katakana character; after any
 * other letter it continues the word being typed. Each returns
 * { claims: {id: observed}, numbers }; a claim is OBSERVED when the defect
 * is present. The claims are listed in the harness header.
 */
import { KEY, changeFont, clickAway, focusBlockEnd, openTab, press, sleep } from './undoKit.mjs';

const ONLY_CHROMIUM = 'CDP drives Chromium\'s own IME; Playwright has no IME driver for Firefox or WebKit';
const JAPANESE = [['n', 'に', 'にh', 'にほ', 'にほn', 'にほん', 'にほんg', 'にほんご'], '日本語'];
const KANA = /[぀-ゟ]/;

/** One composition: each update shown in the field, then the commit. */
async function compose(cdp, updates, commit, gap = 120) {
  for (const s of updates) {
    await cdp.send('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length });
    await sleep(gap);
  }
  await cdp.send('Input.insertText', { text: commit });
  await sleep(gap);
}

/** A text block's text on screen and in the store, untrimmed (a no-break space read as a space). */
const textOf = (page, id) => page.evaluate(async (i) => {
  const m = await import('/src/stores/posterStore.ts');
  const b = m.usePosterStore.getState().doc.blocks.find((x) => x.id === i);
  const d = document.createElement('div');
  d.innerHTML = b?.content ?? '';
  const ce = document.querySelector(`#poster-canvas [data-block-id="${i}"] [contenteditable]`);
  const nb = (s) => (s ?? '').replace(/ /g, ' ');
  return { dom: nb(ce?.textContent), store: nb(d.textContent) };
}, id);

/** ⌘Z until the block's stored text is `target` (≤ max): the texts seen on the way, relative to `base`. */
async function walk(page, id, base, target, max = 14) {
  const seen = [];
  for (let n = 1; n <= max; n += 1) {
    await press(page, KEY.undo, 150);
    const t = (await textOf(page, id)).store;
    seen.push(t.startsWith(base) ? `…${t.slice(base.length)}` : t);
    if (t === target) break;
  }
  return seen;
}

const cdpOf = (page) => page.context().newCDPSession(page);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** A block scenario: caret at the end of block 1, `type` composes, click away, ⌘Z to the original. */
function blockScenario(id, claim, how, type, expected) {
  return {
    id, claims: [claim], how, chromiumOnly: ONLY_CHROMIUM,
    async run(page, ids) {
      const [a] = ids;
      const cdp = await cdpOf(page);
      const base = (await textOf(page, a)).store;
      await focusBlockEnd(page, a);
      await type(page, cdp);
      await sleep(400);
      const typed = await textOf(page, a);
      await clickAway(page);
      const seen = await walk(page, a, base, base);
      return {
        claims: { [claim]: !same(seen, expected) },
        numbers: { typed: `…${typed.store.slice(base.length)}`, screenAgrees: typed.dom === typed.store, undoPresses: seen.length, seen: JSON.stringify(seen) },
      };
    },
  };
}

export const COMPOSE = [
  {
    id: 'I0-composition-events', info: true, chromiumOnly: ONLY_CHROMIUM,
    how: 'information: the events one Japanese composition fires in block 1 (type, data, whether the selection was a caret)',
    async run(page, ids) {
      const [a] = ids;
      const cdp = await cdpOf(page);
      await focusBlockEnd(page, a);
      await page.evaluate(() => {
        window.__ev = [];
        const sel = () => getSelection()?.isCollapsed;
        for (const t of ['compositionstart', 'compositionend']) document.addEventListener(t, (e) => window.__ev.push(`${t}(${e.data})`), true);
        document.addEventListener('beforeinput', (e) => window.__ev.push(`bi:${e.inputType}(${e.data})${sel() ? '' : ':over-selection'}`), true);
      });
      await compose(cdp, ['n', 'に', 'にh'], '日');
      return { numbers: { events: (await page.evaluate(() => window.__ev.join(' '))) } };
    },
  },
  blockScenario('I1-japanese', 'I1', 'block 1: type " ", compose にほんご from romaji (8 updates), commit 日本語; click away; ⌘Z to the original',
    async (page, cdp) => { await page.keyboard.type(' '); await sleep(200); await compose(cdp, ...JAPANESE); },
    ['… ', '…']),
  {
    id: 'I1i-japanese-in-the-block', claims: ['I1i'], chromiumOnly: ONLY_CHROMIUM,
    how: 'block 1: type " ", compose 日本語 as in I1; ⌘Z once with the caret still in the block',
    async run(page, ids) {
      const [a] = ids;
      const cdp = await cdpOf(page);
      const base = (await textOf(page, a)).store;
      await focusBlockEnd(page, a);
      await page.keyboard.type(' ');
      await sleep(200);
      await compose(cdp, ...JAPANESE);
      await sleep(400);
      await press(page, KEY.undo, 300);
      const t = await textOf(page, a);
      return {
        claims: { I1i: t.store !== `${base} ` || t.dom !== t.store },
        numbers: { afterUndo: `…${t.store.slice(base.length)}`, onScreen: `…${t.dom.slice(base.length)}` },
      };
    },
  },
  blockScenario('I2-chinese', 'I2', 'block 1: type " ", compose 中 (zhong) and 文 (wen), pause 6 s, 很 (hen); click away; ⌘Z to the original',
    async (page, cdp) => {
      await page.keyboard.type(' ');
      await sleep(200);
      await compose(cdp, ['z', 'zh', 'zho', 'zhon', 'zhong'], '中');
      await compose(cdp, ['w', 'we', 'wen'], '文');
      await sleep(6000);
      await compose(cdp, ['h', 'he', 'hen'], '很');
    },
    ['… 中文', '… 中', '… ', '…']),
  blockScenario('I3-korean', 'I3', 'block 1: type " ", compose 한 (ㅎ 하 한) and 글 (ㄱ 그 글); click away; ⌘Z to the original',
    async (page, cdp) => {
      await page.keyboard.type(' ');
      await sleep(200);
      await compose(cdp, ['ㅎ', '하', '한'], '한');
      await compose(cdp, ['ㄱ', '그', '글'], '글');
    },
    ['… ', '…']),
  blockScenario('I4-dead-key', 'I4', 'block 1: type " caf", a dead key composes ´ then commits é; click away; ⌘Z to the original',
    async (page, cdp) => { await page.keyboard.type(' caf', { delay: 35 }); await compose(cdp, ['´'], 'é'); },
    ['… ', '…']),
  blockScenario('I5-phone-keyboard', 'I5', 'block 1: a phone keyboard that composes each word: " ", hello (5 updates), " ", world (5 updates); click away; ⌘Z to the original',
    async (page, cdp) => {
      await cdp.send('Input.insertText', { text: ' ' });
      await sleep(120);
      await compose(cdp, ['h', 'he', 'hel', 'hell', 'hello'], 'hello');
      await cdp.send('Input.insertText', { text: ' ' });
      await sleep(120);
      await compose(cdp, ['w', 'wo', 'wor', 'worl', 'world'], 'world');
    },
    ['… hello ', '… ', '…']),
  {
    id: 'I6-cell-and-author', claims: ['I6'], chromiumOnly: ONLY_CHROMIUM,
    how: 'a table cell: End, " ", 한글 composed, ⌘Z once in the cell; Authors › Author name: End, " ", 日本語 composed, ⌘Z once in the field',
    async run(page) {
      const cdp = await cdpOf(page);
      const cell = page.locator('#poster-canvas [data-block-type="table"] td [contenteditable]').nth(3);
      await cell.scrollIntoViewIfNeeded();
      await cell.click();
      await sleep(250);
      await page.keyboard.press('End');
      const c0 = await cell.evaluate((e) => e.textContent.replace(/ /g, ' '));
      await page.keyboard.type(' ');
      await sleep(150);
      await compose(cdp, ['ㅎ', '하', '한'], '한');
      await compose(cdp, ['ㄱ', '그', '글'], '글');
      await sleep(300);
      const c1 = await cell.evaluate((e) => e.textContent.replace(/ /g, ' '));
      await press(page, KEY.undo, 300);
      const c2 = await cell.evaluate((e) => e.textContent.replace(/ /g, ' '));
      await openTab(page, 'authors');
      const field = page.locator('input[placeholder="Author name"]').first();
      await field.click();
      await page.keyboard.press('End');
      const f0 = await field.inputValue();
      await page.keyboard.type(' ');
      await sleep(150);
      await compose(cdp, ...JAPANESE);
      await sleep(300);
      const f1 = await field.inputValue();
      await press(page, KEY.undo, 300);
      const f2 = await field.inputValue();
      return {
        claims: { I6: c1 !== `${c0} 한글` || c2 !== `${c0} ` || f1 !== `${f0} 日本語` || f2 !== `${f0} ` },
        numbers: { cell: `${JSON.stringify(c1)} → ⌘Z ${JSON.stringify(c2)}`, author: `${JSON.stringify(f1)} → ⌘Z ${JSON.stringify(f2)}` },
      };
    },
  },
  {
    // Information, not counted (found while answering R2-F1; LOW, the plan's
    // Later list): CDP's empty composition is how Chromium cancels one, as
    // Escape does in an input method.
    id: 'I8-cancelled-composition', info: true, chromiumOnly: ONLY_CHROMIUM,
    how: 'information: block 1, type " ZQW", ⌘Z (a redo is held); compose n, に and cancel it; click away, ⌘Z once: is the redo kept, and does the ⌘Z change anything?',
    async run(page, ids) {
      const [a] = ids;
      const cdp = await cdpOf(page);
      const flags = () => page.evaluate(async () => { const s = (await import('/src/stores/posterStore.ts')).usePosterStore.getState(); return { canUndo: s.canUndo, canRedo: s.canRedo }; });
      await focusBlockEnd(page, a);
      await page.keyboard.type(' ZQW', { delay: 35 });
      await sleep(300);
      await press(page, KEY.undo, 300);
      const t0 = (await textOf(page, a)).store;
      const f0 = await flags();
      for (const s of ['n', 'に']) { await cdp.send('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length }); await sleep(150); }
      await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
      await sleep(400);
      const t1 = (await textOf(page, a)).store;
      const f1 = await flags();
      await clickAway(page);
      await press(page, KEY.undo, 300);
      const t2 = (await textOf(page, a)).store;
      return {
        claims: { redoDropped: f0.canRedo && !f1.canRedo, emptyStep: t1 === t0 && t2 === t1 },
        numbers: { textUnchangedByCancel: t1 === t0, canRedo: `${f0.canRedo} → ${f1.canRedo}`, firstUndoChangedText: t2 !== t1 },
      };
    },
  },
  {
    id: 'I7-no-eviction', claims: ['I7'], chromiumOnly: ONLY_CHROMIUM,
    how: 'Style › Font to DM Sans, then 12 words " 日本語" composed in block 1 (8 updates each); click away; ⌘Z until the font is back (≤ 40)',
    async run(page, ids) {
      const [a] = ids;
      const cdp = await cdpOf(page);
      const fontOf = () => page.evaluate(async () => (await import('/src/stores/posterStore.ts')).usePosterStore.getState().doc.fontFamily);
      const before = await fontOf();
      await changeFont(page, 'DM Sans');
      const changed = await fontOf();
      if (changed === before) throw new Error('the font did not change');
      await focusBlockEnd(page, a);
      for (let w = 0; w < 12; w += 1) {
        await cdp.send('Input.insertText', { text: ' ' });
        await sleep(60);
        await compose(cdp, ...JAPANESE, 60);
      }
      await sleep(400);
      await clickAway(page);
      let n = 0;
      let kana = false;
      while ((await fontOf()) !== before && n < 40) {
        await press(page, KEY.undo, 80);
        n += 1;
        if (KANA.test((await textOf(page, a)).store)) kana = true;
      }
      const back = (await fontOf()) === before;
      return {
        claims: { I7: !back || kana },
        numbers: { font: `${before} → ${changed}`, undoPressesToFont: back ? n : `>${n}`, uncommittedKanaSeen: kana },
      };
    },
  },
];
