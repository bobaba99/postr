/**
 * Text editing like PowerPoint (record docs/fixes/39-text-editing.md; the
 * MVP design doc docs/launch/mvp-editor/bounded-designs.md §3.2 "Text
 * editing rules"), for scripts/keep-work-check.mjs: the format bar over
 * selected text (T1), PowerPoint's superscript and subscript keys (T2),
 * sub- and superscript kept through typing, the save, a reload, the print
 * window, the PowerPoint file and a copy between blocks (T3), and the "/"
 * symbol menu (T4).
 *
 * Each scenario enters where a user does: a fresh poster at /p/new, signed
 * in as a term holder (lib/keepWorkKit.mjs openSignedIn); the caret put in
 * a text block with a mouse click and the editor's own keys (lib/undoKit.mjs
 * focusBlockEnd), text typed and selected with the real keyboard
 * (Shift + arrow), the format bar's buttons pressed with the mouse, the
 * menu driven with Tab, the arrows, Enter, Esc and a click. What was stored
 * is read from the fake backend's row, never from the app's store.
 *
 * Why here and not in a new harness: keep-work-check already opens a
 * signed-in term holder (the PowerPoint file is theirs), reads what was
 * stored, reloads, opens the print window and reads the PowerPoint file's
 * slides (keepWorkKit), which T3 needs; record 32's real ⌘C / ⌘V helpers
 * are reused from lib/tablePasteScenarios.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { REPO, sleep } from './editorHarness.mjs';
import { KEY, MOD, blockOf, clickAway, focusBlockEnd, textBlockIds } from './undoKit.mjs';
import { downloadPptx, openPrintWindow, reload, rowOf } from './keepWorkKit.mjs';
import { clickToEnd, copyToClipboard, textOf, watchPastes } from './tablePasteScenarios.mjs';

const require = createRequire(import.meta.url);
const { unzipSync, strFromU8 } = require(path.join(REPO, 'node_modules/fflate'));

const CANVAS = '#poster-canvas';
/** The format bar's buttons, in order, as bounded-designs §3.2 lists them. */
export const BAR = ['B', 'I', 'U', 'x²', 'x₂', '•', '1.', 'Clear'];
/**
 * PowerPoint's keys (record 39 §2): Microsoft gives Ctrl + Shift + Plus and
 * Ctrl + = on Windows, Control + Shift + Plus and Control + = in its Mac
 * article, and ⌘ + Control + Shift + = and ⌘ + Control + = in its Mac
 * shortcut table. Playwright names the = key "Equal" (Shift makes it "+").
 */
export const SUP_KEY = 'Control+Shift+Equal';
export const SUB_KEY = 'Control+Equal';
export const SUP_KEY_CMD = 'Meta+Control+Shift+Equal';
/** The browser's own zoom-in key on this host (⌘ + = on a Mac, Ctrl + = elsewhere). */
export const ZOOM_KEY = process.platform === 'darwin' ? 'Meta+Equal' : 'Control+Equal';

/**
 * How many symbols the menu has (symbols.ts, read from disk: the fix does
 * not change it). The design doc and the inventory say 66; the table holds
 * 65 (record 39 §4).
 */
export const SYMBOL_COUNT = (() => {
  const src = fs.readFileSync(path.join(REPO, 'apps/web/src/poster/symbols.ts'), 'utf8');
  const body = src.slice(src.indexOf('{') + 1, src.indexOf('};'));
  return [...body.matchAll(/([A-Za-z0-9]+):\s*'/g)].length;
})();

const contentOf = (state, id, blockId) => (rowOf(state, id)?.data?.blocks ?? []).find((b) => b.id === blockId)?.content ?? null;

/** Wait until the stored content of `blockId` passes `test`; the content then (or the last read). */
async function storedWhen(state, id, blockId, test, timeout = 8000) {
  const t0 = Date.now();
  let c = contentOf(state, id, blockId);
  while (Date.now() - t0 < timeout) {
    c = contentOf(state, id, blockId);
    if (test(c ?? '')) return { ok: true, html: c };
    await sleep(100);
  }
  return { ok: false, html: c };
}

/** The floating format bar's buttons as drawn: their text, title and pressed state. */
export const barButtons = (page) => page.evaluate(() => {
  const pill = document.querySelector('.postr-format-toolbar-enter');
  if (!pill) return null;
  return [...pill.querySelectorAll('button')].map((b) => ({ text: (b.textContent ?? '').trim(), title: b.getAttribute('title'), pressed: b.getAttribute('aria-pressed') }));
});

/** Wait for the format bar (a selection made), then its buttons; null if it does not come. */
async function waitBar(page, timeout = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const b = await barButtons(page);
    if (b) return b;
    await sleep(80);
  }
  return null;
}

/** The pressed state of the bar's button `text` ('true' | 'false' | null when absent). */
const pressedOf = (buttons, text) => buttons?.find((b) => b.text === text)?.pressed ?? null;

/** Click the format bar's button whose text is `text` with the mouse; false when the bar has none. */
export async function clickBar(page, text) {
  const box = await page.evaluate((t) => {
    const pill = document.querySelector('.postr-format-toolbar-enter');
    const b = pill && [...pill.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === t);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, text);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(250);
  return true;
}

/** From the caret: `skip` presses of ← then `len` of Shift + ← (a selection made with the keyboard). */
async function selectBack(page, skip, len) {
  for (let i = 0; i < skip; i += 1) await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < len; i += 1) await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(250);
  return page.evaluate(() => getSelection()?.toString() ?? '');
}

/** Put the caret at the end of block `blockId`, `skip` ← from it, and select `len` characters back. */
async function selectInBlock(page, blockId, skip, len) {
  await focusBlockEnd(page, blockId);
  return selectBack(page, skip, len);
}

/** Every keydown of the = key (any modifiers): whether it was cancelled and where the focus was. */
async function watchEqualKeys(page) {
  await page.evaluate(() => {
    if (window.__zqKeys) return;
    window.__zqKeys = [];
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Equal' && e.key !== '=' && e.key !== '+') return;
      const inText = !!document.activeElement?.isContentEditable;
      setTimeout(() => window.__zqKeys.push({ key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey, prevented: e.defaultPrevented, inText }), 0);
    }, true);
  });
}
const takeKeys = (page) => page.evaluate(() => (window.__zqKeys ?? []).splice(0));

/** The page's zoom as the page sees it. */
const zoomNow = (page) => page.evaluate(() => ({ dpr: window.devicePixelRatio, vv: window.visualViewport?.scale ?? null, inner: window.innerWidth }));

/** The "/" menu as drawn: open, its entries, the highlighted one's index, its footer. */
export const slashMenu = (page) => page.evaluate(() => {
  const box = document.querySelector('[role="listbox"]');
  if (!box) return { open: false };
  const opts = [...box.querySelectorAll('[role="option"]')];
  return {
    open: true,
    count: opts.length,
    highlighted: opts.map((o, i) => (o.getAttribute('aria-selected') === 'true' ? i : -1)).filter((i) => i >= 0),
    first: (opts[0]?.textContent ?? '').trim(),
    footer: (box.lastElementChild && !box.lastElementChild.matches('[role="option"]') ? box.lastElementChild.textContent : '').trim(),
  };
});

/** The focused editing host's text by line (innerText), and whether the focus is in block `blockId`. */
const hostLines = (page, blockId) => page.evaluate((id) => {
  const a = document.activeElement;
  const inBlock = !!a?.isContentEditable && a.closest('[data-block-id]')?.getAttribute('data-block-id') === id;
  const el = document.querySelector(`#poster-canvas [data-block-id="${id}"] [contenteditable]`);
  return { inBlock, lines: (el?.innerText ?? '').replace(/ /g, ' ').split('\n') };
}, blockId);

/**
 * Where the text of the `tag` element (a sup or a sub) that follows text
 * ending in `marker` is drawn against the marker's last letter: the centre
 * of its glyph box minus the letter's, in em of the letter's font (negative
 * = raised). Null when no such element is drawn under `rootSel`.
 */
async function scriptOffset(frame, marker, tag, rootSel) {
  return frame.evaluate(({ marker, tag, rootSel }) => {
    const root = document.querySelector(rootSel);
    if (!root) return null;
    const boxOf = (r) => [...r.getClientRects()].find((x) => x.width > 0 && x.height > 0) ?? r.getBoundingClientRect();
    for (const el of root.querySelectorAll(tag)) {
      const prev = el.previousSibling;
      if (!prev || prev.nodeType !== 3 || !prev.data.endsWith(marker)) continue;
      const r = document.createRange();
      r.setStart(prev, prev.data.length - 1);
      r.setEnd(prev, prev.data.length);
      const base = boxOf(r);
      const t = document.createRange();
      t.selectNodeContents(el);
      const s = boxOf(t);
      const em = parseFloat(getComputedStyle(prev.parentElement).fontSize) || base.height;
      const c = (b) => (b.top + b.bottom) / 2;
      return { center: Math.round(((c(s) - c(base)) / em) * 100) / 100, size: Math.round((s.height / base.height) * 100) / 100, text: el.textContent };
    }
    return null;
  }, { marker, tag, rootSel });
}

/**
 * The runs of the slide paragraph holding `marker` in the PowerPoint file:
 * each run's text and its rPr baseline (pptxgenjs writes superscript as
 * 30000 and subscript as -40000, node_modules/pptxgenjs/dist/pptxgen.es.js;
 * none: null).
 */
export function pptxRunsWith(bytes, marker) {
  const files = unzipSync(new Uint8Array(bytes));
  for (const [name, data] of Object.entries(files)) {
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(name)) continue;
    const xml = strFromU8(data);
    for (const m of xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>|<a:p\s[^>]*>([\s\S]*?)<\/a:p>/g)) {
      const body = m[1] ?? m[2] ?? '';
      if (!body.includes(marker)) continue;
      return [...body.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)].map((r) => {
        const rpr = r[1].match(/<a:rPr\b[^>]*>/)?.[0] ?? '';
        const t = r[1].match(/<a:t>([\s\S]*?)<\/a:t>/)?.[1] ?? '';
        return { text: t, baseline: rpr.match(/\bbaseline="(-?\d+)"/)?.[1] ?? null };
      });
    }
  }
  return null;
}

/** The run that follows the run ending in `marker`: its text and baseline. */
function runAfter(runs, marker) {
  const i = (runs ?? []).findIndex((r) => r.text.endsWith(marker));
  return i >= 0 ? runs[i + 1] ?? null : null;
}

const SUP_H = /ZQH<sup>2<\/sup>O/;
const SUB_C = /ZQCO<sub>2<\/sub>/;
const noScript = (html) => !/<su[bp]\b/i.test(html ?? '');

/**
 * T3 from a block holding "ZQH<sup>2</sup>O ZQCO<sub>2</sub> ZQEND" (the
 * caret anywhere): " ZQMORE" typed on at the block's end (after plain text:
 * typing right after a subscript continues it, TE-I-type-after-sub); what is stored; the
 * canvas after a reload; the print window (Save PDF); the PowerPoint file;
 * "ZQH2O" selected with Shift + ← and copied with the engine's own ⌘C into
 * block `second` with ⌘V. Claims named `${p}a` … `${p}c`.
 */
async function survives(s, block, second, p) {
  const { page, state, id } = s;
  await focusBlockEnd(page, block);
  await page.keyboard.type(' ZQMORE', { delay: 30 });
  const typed = await storedWhen(state, id, block, (c) => SUP_H.test(c) && SUB_C.test(c) && c.includes('ZQMORE'));
  await reload(page);
  const drawn = await page.evaluate((b) => document.querySelector(`#poster-canvas [data-block-id="${b}"] [contenteditable]`)?.innerHTML ?? '', block);
  const popup = await openPrintWindow(page, 'ZQMORE');
  const pSup = await scriptOffset(popup, 'ZQH', 'sup', 'body');
  const pSub = await scriptOffset(popup, 'ZQCO', 'sub', 'body');
  await popup.close();
  const runs = pptxRunsWith(await downloadPptx(page), 'ZQMORE');
  const rSup = runAfter(runs, 'ZQH');
  const rSub = runAfter(runs, 'ZQCO');
  // A copy between blocks with the engine's own ⌘C / ⌘V.
  await watchPastes(page);
  await focusBlockEnd(page, block);
  const copied = await selectBack(page, ' ZQCO2 ZQEND ZQMORE'.length, 5);
  await page.keyboard.press(`${MOD}+c`);
  await page.waitForTimeout(150);
  await clickToEnd(page, page.locator(`${CANVAS} [data-block-id="${second}"] [contenteditable="true"]`).first());
  await page.keyboard.press(`${MOD}+v`);
  const pasted = await storedWhen(state, id, second, (c) => c.includes('ZQH'));
  const clip = await page.evaluate(() => window.__zqPastes?.at(-1) ?? null);
  return {
    claims: {
      [`${p}a`]: !typed.ok,
      [`${p}r`]: !SUP_H.test(drawn) || !SUB_C.test(drawn),
      [`${p}p`]: !pSup || !pSub || !(pSup.center < -0.1) || !(pSub.center > 0.05),
      [`${p}x`]: rSup?.text !== '2' || rSup?.baseline === null || Number(rSup.baseline) <= 0 || rSub?.text !== '2' || rSub?.baseline === null || Number(rSub.baseline) >= 0,
      [`${p}c`]: !SUP_H.test(pasted.html ?? ''),
    },
    numbers: {
      stored: JSON.stringify(typed.html), reloaded: JSON.stringify(drawn.slice(0, 160)), printSup: JSON.stringify(pSup), printSub: JSON.stringify(pSub),
      pptxSup: JSON.stringify(rSup), pptxSub: JSON.stringify(rSub), copied: JSON.stringify(copied), clipTrusted: clip?.trusted ?? null, clipHtml: JSON.stringify((clip?.html ?? '').slice(0, 200)), pasted: JSON.stringify(pasted.html),
    },
  };
}

/** The words typed "inside a word" (bounded-designs §3.2): each a line of its own, then Enter. */
export const IN_WORD = ['n/a', 'mg/kg', 'w/', 'μg/d', 'see Fig. 2/', 'and/or', '24/7', 'km/h'];

export const TEXT_EDIT = [
  {
    id: 'TE1-format-bar', claims: ['TE1', 'TE1a', 'TE1s', 'TE1u', 'TE1r', 'TE1t', 'TE1x', 'TE1xs'],
    how: 'text block 1: " ZQH2O" typed, the "2" selected with Shift + ←; the format bar\'s buttons read; x² clicked; its state; one ⌘Z, one ⌘⇧Z; x² again (off); x² then x₂',
    async run(h, s) {
      const { page, state, id } = s;
      const [block] = await textBlockIds(page);
      await focusBlockEnd(page, block);
      await page.keyboard.type(' ZQH2O', { delay: 30 });
      if (!(await storedWhen(state, id, block, (c) => c.includes('ZQH2O'))).ok) throw new Error('precondition: the typed word was not stored');
      const sel = await selectBack(page, 1, 1);
      const bar = await waitBar(page);
      const texts = (bar ?? []).map((b) => b.text);
      const numbers = { selected: JSON.stringify(sel), bar: JSON.stringify(texts), titles: JSON.stringify((bar ?? []).filter((b) => /^x/.test(b.text)).map((b) => b.title)) };
      const claims = { TE1: JSON.stringify(texts) !== JSON.stringify(BAR) };
      const hasSup = texts.includes('x²');
      const hasSub = texts.includes('x₂');
      if (!hasSup || !hasSub) {
        return { claims: { ...claims, TE1a: true, TE1s: true, TE1u: true, TE1r: true, TE1t: true, TE1x: true, TE1xs: true }, numbers: { ...numbers, skipped: 'no x² or x₂ on the bar' } };
      }
      await clickBar(page, 'x²');
      const on = await storedWhen(state, id, block, (c) => SUP_H.test(c));
      const afterOn = await barButtons(page);
      claims.TE1a = !on.ok;
      claims.TE1s = pressedOf(afterOn, 'x²') !== 'true' || pressedOf(afterOn, 'x₂') !== 'false';
      numbers.storedOn = JSON.stringify(on.html);
      numbers.stateOn = `x²=${pressedOf(afterOn, 'x²')} x₂=${pressedOf(afterOn, 'x₂')}`;
      // One ⌘Z: the superscript goes, the typed word stays (a step of its own).
      await page.keyboard.press(KEY.undo);
      const undone = await storedWhen(state, id, block, (c) => c.includes('ZQH2O') && noScript(c));
      const undoneDom = await page.evaluate((b) => document.querySelector(`#poster-canvas [data-block-id="${b}"] [contenteditable]`)?.innerHTML ?? null, block);
      claims.TE1u = !undone.ok || !/ZQH2O/.test(undoneDom ?? '') || !noScript(undoneDom);
      await page.keyboard.press(KEY.redo);
      const redone = await storedWhen(state, id, block, (c) => SUP_H.test(c));
      claims.TE1r = !redone.ok;
      numbers.undo = JSON.stringify(undone.html);
      numbers.redo = JSON.stringify(redone.html);
      // x² again on the superscript "2": removed.
      await selectInBlock(page, block, 1, 1);
      await waitBar(page);
      await clickBar(page, 'x²');
      const off = await storedWhen(state, id, block, (c) => c.includes('ZQH2O') && noScript(c));
      claims.TE1t = !off.ok;
      numbers.storedOff = JSON.stringify(off.html);
      // x² then x₂: subscript only.
      await selectInBlock(page, block, 1, 1);
      await waitBar(page);
      await clickBar(page, 'x²');
      await storedWhen(state, id, block, (c) => SUP_H.test(c));
      await clickBar(page, 'x₂');
      const swapped = await storedWhen(state, id, block, (c) => /ZQH<sub>2<\/sub>O/.test(c) && !/<sup\b/.test(c));
      const afterSwap = await barButtons(page);
      claims.TE1x = !swapped.ok;
      claims.TE1xs = pressedOf(afterSwap, 'x₂') !== 'true' || pressedOf(afterSwap, 'x²') !== 'false';
      numbers.storedSwap = JSON.stringify(swapped.html);
      numbers.stateSwap = `x²=${pressedOf(afterSwap, 'x²')} x₂=${pressedOf(afterSwap, 'x₂')}`;
      return { claims, numbers };
    },
  },
  {
    id: 'TE1l-list-state', claims: ['TE1l', 'TE1b'],
    how: 'text block 1: " ZQL1" typed, made a bulleted line with the bar\'s "•", then "ZQL1" selected with Shift + ←: the bar\'s • pressed and 1. not; "ZQL1" made bold with B: B pressed',
    async run(h, s) {
      const { page, state, id } = s;
      const [block] = await textBlockIds(page);
      await focusBlockEnd(page, block);
      await page.keyboard.type('ZQL1', { delay: 30 });
      if (!(await storedWhen(state, id, block, (c) => c.includes('ZQL1'))).ok) throw new Error('precondition: the typed word was not stored');
      await selectBack(page, 0, 4);
      if (!(await waitBar(page))) throw new Error('no format bar over the selection');
      await clickBar(page, '•');
      const listed = await storedWhen(state, id, block, (c) => /<ul>[\s\S]*ZQL1/.test(c));
      await selectInBlock(page, block, 0, 4);
      const bar = await waitBar(page);
      await clickBar(page, 'B');
      await page.waitForTimeout(300);
      const bold = await barButtons(page);
      return {
        claims: {
          TE1l: !listed.ok || pressedOf(bar, '•') !== 'true' || pressedOf(bar, '1.') !== 'false',
          TE1b: pressedOf(bold, 'B') !== 'true',
        },
        numbers: { stored: JSON.stringify(listed.html), stateInList: `•=${pressedOf(bar, '•')} 1.=${pressedOf(bar, '1.')}`, boldPressed: pressedOf(bold, 'B') },
      };
    },
  },
  {
    id: 'TE2-keys', claims: ['TE2', 'TE2p', 'TE2u', 'TE2t', 'TE2b', 'TE2m', 'TE2o', 'TE2z'],
    how: 'text block 1: " ZQK2O", the "2" selected with Shift + ←; Control + Shift + = (superscript), one ⌘Z, the key again twice (on, off), Control + = (subscript), ⌘ + Control + Shift + = (the Mac table\'s key); then the image block selected by its frame and the text left: both keys; ⌘ + = in text',
    async run(h, s) {
      const { page, state, id } = s;
      await watchEqualKeys(page);
      const [block] = await textBlockIds(page);
      await focusBlockEnd(page, block);
      await page.keyboard.type(' ZQK2O', { delay: 30 });
      if (!(await storedWhen(state, id, block, (c) => c.includes('ZQK2O'))).ok) throw new Error('precondition: the typed word was not stored');
      await selectBack(page, 1, 1);
      await takeKeys(page);
      await page.keyboard.press(SUP_KEY);
      const sup = await storedWhen(state, id, block, (c) => /ZQK<sup>2<\/sup>O/.test(c));
      const supKeys = await takeKeys(page);
      await page.keyboard.press(KEY.undo);
      const undone = await storedWhen(state, id, block, (c) => c.includes('ZQK2O') && noScript(c));
      await selectInBlock(page, block, 1, 1);
      await page.keyboard.press(SUP_KEY);
      const again = await storedWhen(state, id, block, (c) => /ZQK<sup>2<\/sup>O/.test(c));
      await page.keyboard.press(SUP_KEY);
      const off = await storedWhen(state, id, block, (c) => c.includes('ZQK2O') && noScript(c));
      await page.keyboard.press(SUB_KEY);
      const sub = await storedWhen(state, id, block, (c) => /ZQK<sub>2<\/sub>O/.test(c) && !/<sup\b/.test(c));
      await page.keyboard.press(SUP_KEY_CMD);
      const cmd = await storedWhen(state, id, block, (c) => /ZQK<sup>2<\/sup>O/.test(c) && !/<sub\b/.test(c));
      const textKeys = await takeKeys(page);
      // Outside text: the keys are the browser's (not cancelled), nothing changes.
      const before = contentOf(state, id, block);
      await clickAway(page);
      await page.keyboard.press(SUP_KEY);
      await page.keyboard.press(SUB_KEY);
      await page.waitForTimeout(1200);
      const outKeys = await takeKeys(page);
      const outChanged = contentOf(state, id, block) !== before;
      // ⌘ + = (the Mac browsers' zoom-in) in text: not taken.
      await focusBlockEnd(page, block);
      await page.keyboard.press(ZOOM_KEY);
      await page.waitForTimeout(300);
      const zoomKeys = await takeKeys(page);
      return {
        claims: {
          TE2: !sup.ok,
          TE2p: !(supKeys.length && supKeys.every((k) => k.prevented && k.inText)),
          TE2u: !sup.ok || !undone.ok,
          TE2t: !again.ok || !off.ok,
          TE2b: !sub.ok,
          TE2m: !cmd.ok,
          TE2o: outChanged || outKeys.length !== 2 || outKeys.some((k) => k.prevented || k.inText),
          TE2z: process.platform === 'darwin' ? zoomKeys.some((k) => k.prevented) : false,
        },
        numbers: {
          sup: JSON.stringify(sup.html), undo: JSON.stringify(undone.html), off: JSON.stringify(off.html), sub: JSON.stringify(sub.html), cmd: JSON.stringify(cmd.html),
          supKeys: JSON.stringify(supKeys), textKeysPrevented: textKeys.map((k) => k.prevented).join(','), outKeys: JSON.stringify(outKeys), outChanged, zoomKeyInText: JSON.stringify(zoomKeys),
        },
      };
    },
  },
  {
    id: 'TE2w-windows', claims: ['TE2w', 'TE2wt'],
    // The page told it runs on Windows: the app reads navigator.platform.
    session: { initScript: () => Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'Win32', configurable: true }) },
    how: 'navigator.platform "Win32" (an init script): " ZQW2O", the "2" selected; the bar\'s x² and x₂ titles; Ctrl + Shift + = and Ctrl + = in text; ⌘ + Control + Shift + = (not a Windows key)',
    async run(h, s) {
      const { page, state, id } = s;
      await watchEqualKeys(page);
      const [block] = await textBlockIds(page);
      await focusBlockEnd(page, block);
      await page.keyboard.type(' ZQW2O', { delay: 30 });
      if (!(await storedWhen(state, id, block, (c) => c.includes('ZQW2O'))).ok) throw new Error('precondition: the typed word was not stored');
      await selectBack(page, 1, 1);
      const bar = await waitBar(page);
      const titles = (bar ?? []).filter((b) => /^x/.test(b.text)).map((b) => b.title);
      await page.keyboard.press(SUP_KEY);
      const sup = await storedWhen(state, id, block, (c) => /ZQW<sup>2<\/sup>O/.test(c));
      await page.keyboard.press(SUB_KEY);
      const sub = await storedWhen(state, id, block, (c) => /ZQW<sub>2<\/sub>O/.test(c));
      await takeKeys(page);
      await page.keyboard.press(SUP_KEY_CMD);
      await page.waitForTimeout(1200);
      const winCmd = await takeKeys(page);
      const kept = /ZQW<sub>2<\/sub>O/.test(contentOf(state, id, block) ?? '');
      return {
        claims: {
          TE2w: !sup.ok || !sub.ok || !kept || winCmd.some((k) => k.prevented),
          TE2wt: JSON.stringify(titles) !== JSON.stringify(['Superscript (Ctrl+Shift+=)', 'Subscript (Ctrl+=)']),
        },
        numbers: { platform: await page.evaluate(() => navigator.platform), titles: JSON.stringify(titles), sup: JSON.stringify(sup.html), sub: JSON.stringify(sub.html), metaControlKey: JSON.stringify(winCmd), subKeptAfterIt: kept },
      };
    },
  },
  {
    id: 'TE3-survives', claims: ['TE3a', 'TE3r', 'TE3p', 'TE3x', 'TE3c'],
    how: 'text block 1: " ZQH2O ZQCO2 ZQEND"; the second "2" made x₂ and the first x², with the bar; End and " ZQMORE" typed on; stored; reload; Save PDF; Export › PowerPoint; "ZQH2O" selected with Shift + ← and copied with ⌘C into text block 2 with ⌘V',
    async run(h, s) {
      const { page, state, id } = s;
      const [block, second] = await textBlockIds(page);
      if (!second) throw new Error('precondition: two text blocks');
      await focusBlockEnd(page, block);
      await page.keyboard.type(' ZQH2O ZQCO2 ZQEND', { delay: 30 });
      if (!(await storedWhen(state, id, block, (c) => c.includes('ZQEND'))).ok) throw new Error('precondition: the typed words were not stored');
      await selectBack(page, ' ZQEND'.length, 1);
      if (!(await waitBar(page)) || !(await clickBar(page, 'x₂'))) return { claims: { TE3a: true, TE3r: true, TE3p: true, TE3x: true, TE3c: true }, numbers: { skipped: 'no x₂ on the bar' } };
      await selectInBlock(page, block, ' ZQCO2 ZQEND'.length + 1, 1);
      await waitBar(page);
      await clickBar(page, 'x²');
      await storedWhen(state, id, block, (c) => SUP_H.test(c) && SUB_C.test(c));
      return survives(s, block, second, 'TE3');
    },
  },
  {
    id: 'TE3s-survives-pasted', claims: ['TE3sa', 'TE3sr', 'TE3sp', 'TE3sx', 'TE3sc'],
    how: 'the same words with their sub- and superscript put there by a paste (another application\'s copy: "ZQH<sup>2</sup>O ZQCO<sub>2</sub> ZQEND" on the clipboard by a real ⌘C, a real ⌘V at the end of text block 1), then the same as TE3: typed on, stored, reload, Save PDF, PowerPoint, a copy into text block 2 (T3 on its own, without the bar)',
    async run(h, s) {
      const { page, state, id } = s;
      const [block, second] = await textBlockIds(page);
      if (!second) throw new Error('precondition: two text blocks');
      const put = await copyToClipboard(page, { 'text/html': ' ZQH<sup>2</sup>O ZQCO<sub>2</sub> ZQEND', 'text/plain': ' ZQH2O ZQCO2 ZQEND' });
      if (!put) throw new Error('precondition: the copy source did not write the clipboard');
      await clickToEnd(page, page.locator(`${CANVAS} [data-block-id="${block}"] [contenteditable="true"]`).first());
      await page.keyboard.press(`${MOD}+v`);
      if (!(await storedWhen(state, id, block, (c) => SUP_H.test(c) && SUB_C.test(c) && c.includes('ZQEND'))).ok) {
        return { claims: { TE3sa: true, TE3sr: true, TE3sp: true, TE3sx: true, TE3sc: true }, numbers: { skipped: 'the paste did not store the sub- and superscript', stored: JSON.stringify(contentOf(state, id, block)) } };
      }
      const r = await survives(s, block, second, 'TE3s');
      return r;
    },
  },
  {
    id: 'TE4-slash-in-word', claims: ['TE4w', 'TE4wm'],
    how: `text block 1 (empty): each of ${IN_WORD.map((w) => `"${w}"`).join(', ')} typed on a line of its own, then Enter; the menu read before each Enter; what is stored`,
    async run(h, s) {
      const { page, state, id } = s;
      const [block] = await textBlockIds(page);
      await focusBlockEnd(page, block);
      const per = [];
      for (const word of IN_WORD) {
        await page.keyboard.type(word, { delay: 30 });
        await page.waitForTimeout(150);
        const menu = await slashMenu(page);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(150);
        const { lines } = await hostLines(page, block);
        per.push({ word, menu: menu.open, lineKept: lines.includes(word), lines: lines.length });
      }
      await page.keyboard.type('ZQSWEND', { delay: 30 });
      const stored = await storedWhen(state, id, block, (c) => c.includes('ZQSWEND'));
      const storedLines = textOf(stored.html ?? '').split('\n');
      const changed = IN_WORD.filter((w) => !storedLines.includes(w));
      return {
        claims: { TE4w: changed.length > 0, TE4wm: per.some((p) => p.menu) },
        numbers: { changed: JSON.stringify(changed), menuOpenedOn: JSON.stringify(per.filter((p) => p.menu).map((p) => p.word)), storedLines: JSON.stringify(storedLines) },
      };
    },
  },
  {
    id: 'TE4-slash-menu', claims: ['TE4n', 'TE4h', 'TE4x', 'TE4e', 'TE4s', 'TE4k', 'TE4l', 'TE4t', 'TE4c'],
    how: 'text block 1 (empty): "/" at the block\'s start (the menu\'s entries, the highlighted one), Esc; "al", Enter (no arrow); "x /a" (after a space), ↓, Enter; Enter, "/al" (a line start), Tab; " /s", a click on √',
    async run(h, s) {
      const { page, state, id } = s;
      const [block] = await textBlockIds(page);
      await focusBlockEnd(page, block);
      await page.keyboard.type('/', { delay: 30 });
      await page.waitForTimeout(200);
      const bare = await slashMenu(page);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      const afterEsc = await slashMenu(page);
      const escFocus = await hostLines(page, block);
      await page.keyboard.type('al', { delay: 30 });
      await page.waitForTimeout(150);
      const al = await slashMenu(page);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      const afterEnter = await slashMenu(page);
      const enterLines = (await hostLines(page, block)).lines;
      await page.keyboard.type('x /a', { delay: 30 });
      await page.waitForTimeout(150);
      const space = await slashMenu(page);
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(150);
      const moved = await slashMenu(page);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      const arrowLines = (await hostLines(page, block)).lines;
      await page.keyboard.press('Enter');
      await page.keyboard.type('/al', { delay: 30 });
      await page.waitForTimeout(150);
      const lineStart = await slashMenu(page);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(200);
      await page.keyboard.type(' /s', { delay: 30 });
      await page.waitForTimeout(200);
      const sqrt = await page.evaluate(() => {
        const o = [...document.querySelectorAll('[role="listbox"] [role="option"]')].find((x) => x.textContent?.includes('√'));
        if (!o) return null;
        const r = o.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      if (sqrt) await page.mouse.click(sqrt.x, sqrt.y);
      await page.waitForTimeout(200);
      await page.keyboard.type('ZQSM', { delay: 30 });
      const stored = await storedWhen(state, id, block, (c) => c.includes('ZQSM'));
      const lines = textOf(stored.html ?? '').split('\n');
      return {
        claims: {
          TE4n: !bare.open || bare.count !== SYMBOL_COUNT,
          TE4h: JSON.stringify(bare.highlighted) !== '[0]' || JSON.stringify(moved.highlighted) !== '[1]',
          TE4x: afterEsc.open || !escFocus.inBlock || escFocus.lines.join('\n') !== '/',
          TE4e: !al.open || afterEnter.open || lines[0] !== '/al',
          TE4s: !space.open,
          TE4k: lines[1] !== 'x ≈',
          TE4l: !lineStart.open,
          TE4t: !/^α/.test(lines[2] ?? ''),
          TE4c: !sqrt || !/^α √ZQSM$/.test(lines[2] ?? ''),
        },
        numbers: {
          symbols: SYMBOL_COUNT, bare: JSON.stringify(bare), afterEsc: afterEsc.open, al: JSON.stringify({ open: al.open, count: al.count }), enterLines: JSON.stringify(enterLines),
          afterSpace: JSON.stringify({ open: space.open, count: space.count }), afterArrow: JSON.stringify(moved.highlighted), arrowLines: JSON.stringify(arrowLines),
          lineStart: JSON.stringify({ open: lineStart.open, count: lineStart.count }), storedLines: JSON.stringify(lines),
        },
      };
    },
  },
  {
    id: 'TE4-slash-line-start', claims: ['TE4j'],
    how: 'text block 1 (empty): "ZQJ1", Enter, "/al" (the menu at a line start), Tab, " ZQJ2": α starts the second line and the first is untouched (found by the fix\'s first run: the symbol joined the two lines)',
    async run(h, s) {
      const { page, state, id } = s;
      const [block] = await textBlockIds(page);
      await focusBlockEnd(page, block);
      await page.keyboard.type('ZQJ1', { delay: 30 });
      await page.keyboard.press('Enter');
      await page.keyboard.type('/al', { delay: 30 });
      await page.waitForTimeout(150);
      const menu = await slashMenu(page);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(200);
      await page.keyboard.type(' ZQJ2', { delay: 30 });
      const stored = await storedWhen(state, id, block, (c) => c.includes('ZQJ2'));
      const lines = textOf(stored.html ?? '').split('\n');
      return {
        claims: { TE4j: JSON.stringify(lines) !== JSON.stringify(['ZQJ1', 'α ZQJ2']) },
        numbers: { menu: JSON.stringify({ open: menu.open, count: menu.count }), stored: JSON.stringify(stored.html), lines: JSON.stringify(lines), drawn: JSON.stringify((await hostLines(page, block)).lines) },
      };
    },
  },
  {
    id: 'TE4-slash-title', claims: ['TE4ti'],
    how: 'the title: "ZQT /al" typed (the menu open), Enter: the menu closed, nothing inserted, no line break',
    async run(h, s) {
      const { page, state, id } = s;
      const title = await blockOf(page, 'title');
      await focusBlockEnd(page, title);
      await page.keyboard.type('ZQT /al', { delay: 30 });
      await page.waitForTimeout(150);
      const menu = await slashMenu(page);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(250);
      const after = await slashMenu(page);
      await page.keyboard.type('Z', { delay: 30 });
      const stored = await storedWhen(state, id, title, (c) => c.includes('ZQT'));
      return {
        claims: { TE4ti: !menu.open || after.open || !/^ZQT \/alZ$/.test(textOf(stored.html ?? '').replace(/ /g, ' ')) },
        numbers: { menuBefore: menu.open, menuAfter: after.open, stored: JSON.stringify(stored.html) },
      };
    },
  },
  {
    id: 'TE3i-copy-inside', claims: ['TE3i', 'TE3ib', 'TE3ik', 'TE3ix', 'TE3ixu', 'TE3ixp'],
    how: 'text block 1: " ZQH2O ZQC2X ZQBOLDY"; with the bar the second "2" made x₂, the first x² and "BOLD" B; then ONLY the superscript "2", only the subscript "2" and only "OL" of the bold word selected with Shift + ← and copied with ⌘C, each pasted with ⌘V into text block 2 between a typed marker and an "E"; then the superscript "2" alone cut with ⌘X, one ⌘Z, one ⌘⇧Z, and pasted the same way (review round 1, R1-F1: the copy of the formatted characters alone)',
    async run(h, s) {
      const { page, state, id } = s;
      const [block, second] = await textBlockIds(page);
      if (!second) throw new Error('precondition: two text blocks');
      const words = ' ZQH2O ZQC2X ZQBOLDY';
      // ← presses from the block's end to stand just after character `i`.
      const after = (i) => words.length - i - 1;
      const supAt = words.indexOf('ZQH2O') + 3;
      const subAt = words.indexOf('ZQC2X') + 3;
      const boldAt = words.indexOf('BOLD');
      await focusBlockEnd(page, block);
      await page.keyboard.type(words, { delay: 30 });
      if (!(await storedWhen(state, id, block, (c) => c.includes('ZQBOLDY'))).ok) throw new Error('precondition: the typed words were not stored');
      for (const [skip, len, button] of [[after(subAt), 1, 'x₂'], [after(supAt), 1, 'x²'], [after(boldAt + 3), 4, 'B']]) {
        await selectInBlock(page, block, skip, len);
        if (!(await waitBar(page)) || !(await clickBar(page, button))) throw new Error(`precondition: no ${button} on the bar`);
      }
      const made = await storedWhen(state, id, block, (c) => SUP_H.test(c) && /ZQC<sub>2<\/sub>X/.test(c) && /ZQ<(b|strong)>BOLD<\/(b|strong)>Y/.test(c));
      if (!made.ok) throw new Error(`precondition: the formats were not stored (${made.html})`);
      await watchPastes(page);
      /** ⌘V into text block 2 between " <marker>" and "E"; the stored block 2 once the paste is in. */
      const pasteAt = async (marker) => {
        await focusBlockEnd(page, second);
        await page.keyboard.type(` ${marker}E`, { delay: 30 });
        await page.keyboard.press('ArrowLeft');
        await storedWhen(state, id, second, (c) => c.includes(`${marker}E`));
        await page.keyboard.press(`${MOD}+v`);
        const r = await storedWhen(state, id, second, (c) => c.includes(marker) && !c.includes(`${marker}E`));
        const clip = await page.evaluate(() => window.__zqPastes?.at(-1)?.html ?? null);
        return { html: r.html ?? '', clip: (clip ?? '').replace(/ style="[^"]*"/g, '').slice(0, 160) };
      };
      const copyAt = async (skip, len, marker) => {
        const sel = await selectInBlock(page, block, skip, len);
        await page.keyboard.press(`${MOD}+c`);
        await page.waitForTimeout(200);
        return { sel, ...(await pasteAt(marker)) };
      };
      const sup = await copyAt(after(supAt), 1, 'ZQA');
      const sub = await copyAt(after(subAt), 1, 'ZQB');
      const bold = await copyAt(after(boldAt + 2), 2, 'ZQK');
      // A cut of the superscript "2" alone: removed, one undo step, kept on the clipboard.
      const cutSel = await selectInBlock(page, block, after(supAt), 1);
      await page.keyboard.press(`${MOD}+x`);
      const cut = await storedWhen(state, id, block, (c) => textOf(c).includes(' ZQHO ') && !/<sup\b/.test(c));
      await page.keyboard.press(KEY.undo);
      const undone = await storedWhen(state, id, block, (c) => SUP_H.test(c));
      await page.keyboard.press(KEY.redo);
      const redone = await storedWhen(state, id, block, (c) => textOf(c).includes(' ZQHO ') && !/<sup\b/.test(c));
      const cutPasted = await pasteAt('ZQX');
      return {
        claims: {
          TE3i: !/ZQA<sup>2<\/sup>E/.test(sup.html),
          TE3ib: !/ZQB<sub>2<\/sub>E/.test(sub.html),
          TE3ik: !/ZQK<(b|strong)>OL<\/(b|strong)>E/.test(bold.html),
          TE3ix: cutSel !== '2' || !cut.ok,
          TE3ixu: !undone.ok || !redone.ok,
          TE3ixp: !/ZQX<sup>2<\/sup>E/.test(cutPasted.html),
        },
        numbers: {
          made: JSON.stringify(made.html), sup: JSON.stringify(sup), sub: JSON.stringify(sub), bold: JSON.stringify(bold),
          cut: JSON.stringify(cut.html), undone: JSON.stringify(undone.html), redone: JSON.stringify(redone.html), cutPasted: JSON.stringify(cutPasted),
        },
      };
    },
  },
  {
    id: 'TE4-slash-br-line', claims: ['TE4jb', 'TE4ju', 'TE4jl'],
    how: 'text block 1: "ZQB1", Enter, "ZQB2", Shift + Enter, "/al" (the menu on a line Shift + Enter made inside the line Enter made), Tab: the lines; one ⌘Z, one ⌘⇧Z; " ZQBE" typed at the end; text block 2: "ZQL1" made a bulleted line with •, Shift + Enter, "/al", Tab, " ZQLE" (review round 1, R1-F2: in Firefox the symbol deleted the line break)',
    async run(h, s) {
      const { page, state, id } = s;
      const [block, second] = await textBlockIds(page);
      if (!second) throw new Error('precondition: two text blocks');
      const linesOf = (html) => textOf(html ?? '').split('\n');
      await focusBlockEnd(page, block);
      await page.keyboard.type('ZQB1', { delay: 30 });
      await page.keyboard.press('Enter');
      await page.keyboard.type('ZQB2', { delay: 30 });
      await page.keyboard.press('Shift+Enter');
      await page.waitForTimeout(150);
      await page.keyboard.type('/al', { delay: 30 });
      await page.waitForTimeout(150);
      const menu = await slashMenu(page);
      await page.keyboard.press('Tab');
      const inserted = await storedWhen(state, id, block, (c) => textOf(c).includes('α'));
      await page.keyboard.press(KEY.undo);
      const undone = await storedWhen(state, id, block, (c) => textOf(c).includes('/al') && !textOf(c).includes('α'));
      await page.keyboard.press(KEY.redo);
      const redone = await storedWhen(state, id, block, (c) => textOf(c).includes('α'));
      await focusBlockEnd(page, block);
      await page.keyboard.type(' ZQBE', { delay: 30 });
      const fin = await storedWhen(state, id, block, (c) => c.includes('ZQBE'));
      // The same on a line Shift + Enter made in a list item.
      await focusBlockEnd(page, second);
      await page.keyboard.type('ZQL1', { delay: 30 });
      await selectBack(page, 0, 4);
      if (!(await waitBar(page)) || !(await clickBar(page, '•'))) throw new Error('precondition: no • on the bar');
      await storedWhen(state, id, second, (c) => /<ul>[\s\S]*ZQL1/.test(c));
      await focusBlockEnd(page, second);
      await page.keyboard.press('Shift+Enter');
      await page.waitForTimeout(150);
      await page.keyboard.type('/al', { delay: 30 });
      await page.waitForTimeout(150);
      const menuL = await slashMenu(page);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(200);
      await page.keyboard.type(' ZQLE', { delay: 30 });
      const li = await storedWhen(state, id, second, (c) => c.includes('ZQLE'));
      const same = (html, want) => JSON.stringify(linesOf(html)) === JSON.stringify(want);
      return {
        claims: {
          TE4jb: !menu.open || !same(fin.html, ['ZQB1', 'ZQB2', 'α ZQBE']),
          TE4ju: !same(inserted.html, ['ZQB1', 'ZQB2', 'α']) || !same(undone.html, ['ZQB1', 'ZQB2', '/al']) || !same(redone.html, ['ZQB1', 'ZQB2', 'α']),
          TE4jl: !menuL.open || !/<ul>/.test(li.html ?? '') || !same(li.html, ['ZQL1', 'α ZQLE']),
        },
        numbers: {
          menu: JSON.stringify({ open: menu.open, count: menu.count }), inserted: JSON.stringify(inserted.html), undone: JSON.stringify(undone.html), redone: JSON.stringify(redone.html),
          stored: JSON.stringify(fin.html), lines: JSON.stringify(linesOf(fin.html)), listMenu: JSON.stringify({ open: menuL.open, count: menuL.count }), list: JSON.stringify(li.html), listLines: JSON.stringify(linesOf(li.html)),
        },
      };
    },
  },
  {
    id: 'TE2n-numpad', claims: ['TE2n'],
    how: 'text block 1: " ZQN2O", the "2" selected with Shift + ←; Control + the numeric keypad\'s + and Control + Shift + it (Windows browsers zoom with Ctrl + keypad +; not PowerPoint\'s = key): whether each keydown is cancelled and whether the stored text changes (review round 1, R1-F3)',
    async run(h, s) {
      const { page, state, id } = s;
      await watchEqualKeys(page);
      const [block] = await textBlockIds(page);
      await focusBlockEnd(page, block);
      await page.keyboard.type(' ZQN2O', { delay: 30 });
      if (!(await storedWhen(state, id, block, (c) => c.includes('ZQN2O'))).ok) throw new Error('precondition: the typed word was not stored');
      const per = {};
      for (const k of ['Control+NumpadAdd', 'Control+Shift+NumpadAdd']) {
        await selectInBlock(page, block, 1, 1);
        await takeKeys(page);
        await page.keyboard.press(k);
        await page.waitForTimeout(1200);
        per[k] = { keys: await takeKeys(page), stored: contentOf(state, id, block) };
      }
      const all = Object.values(per);
      return {
        claims: { TE2n: all.some((p) => p.keys.length !== 1 || p.keys[0].prevented || !/ZQN2O/.test(p.stored ?? '') || !noScript(p.stored)) },
        numbers: Object.fromEntries(Object.entries(per).map(([k, p]) => [k, `${p.keys.map((x) => `${x.key}:${x.prevented ? 'cancelled' : 'passed'}`).join(',')} → ${JSON.stringify(p.stored)}`])),
      };
    },
  },
  {
    id: 'TE4-slash-menu-bottom', claims: ['TE4b'],
    how: 'a 1440 × 600 window: the lowest text block wholly in the window, " /" typed at its end (the menu, 220 px high, would reach past the window\'s bottom below the caret), then ↑ (the highlight goes round to the last entry): the menu box and the highlighted entry against the window (review round 1, R1-F5)',
    async run(h, s) {
      const { page } = s;
      await page.setViewportSize({ width: 1440, height: 600 });
      await page.waitForTimeout(600);
      const ids = await textBlockIds(page);
      const low = await page.evaluate((ids) => ids
        .map((i) => [i, document.querySelector(`#poster-canvas [data-block-id="${i}"]`).getBoundingClientRect().bottom])
        .filter(([, b]) => b < innerHeight).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null, ids);
      if (!low) throw new Error('precondition: no text block inside the window');
      await focusBlockEnd(page, low);
      await page.keyboard.type(' /', { delay: 30 });
      await page.waitForTimeout(200);
      const caret = await page.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight }; });
      if (caret.bottom + 6 + 220 <= caret.vh) throw new Error(`precondition: the menu fits below the caret (${JSON.stringify(caret)})`);
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(200);
      const drawn = await page.evaluate(() => {
        const box = document.querySelector('[role="listbox"]');
        const o = box?.querySelector('[aria-selected="true"]');
        if (!box || !o) return null;
        const b = box.getBoundingClientRect();
        const r = o.getBoundingClientRect();
        return { boxTop: Math.round(b.top), boxBottom: Math.round(b.bottom), optTop: Math.round(r.top), optBottom: Math.round(r.bottom), vh: innerHeight, highlighted: (o.textContent ?? '').trim() };
      });
      return {
        claims: { TE4b: !drawn || drawn.boxTop < 0 || drawn.boxBottom > drawn.vh || drawn.optTop < 0 || drawn.optBottom > drawn.vh },
        numbers: { caret: JSON.stringify(caret), drawn: JSON.stringify(drawn) },
      };
    },
  },
  {
    id: 'TE4-slash-menu-shift', claims: ['TE4m'],
    how: 'text block 1: "ZQM1", Enter, "ZQM2"; the caret to the block\'s start, " /a" (the menu open), Shift + ↓ (a selection made into the next line): the menu, the selection; then Tab: whether a symbol is stored (review round 1, R1-F6)',
    async run(h, s) {
      const { page, state, id } = s;
      const [block] = await textBlockIds(page);
      await focusBlockEnd(page, block);
      await page.keyboard.type('ZQM1', { delay: 30 });
      await page.keyboard.press('Enter');
      await page.keyboard.type('ZQM2', { delay: 30 });
      if (!(await storedWhen(state, id, block, (c) => c.includes('ZQM2'))).ok) throw new Error('precondition: the typed words were not stored');
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowUp' : 'Control+Home');
      await page.keyboard.type(' /a', { delay: 30 });
      await page.waitForTimeout(150);
      const open = await slashMenu(page);
      await page.keyboard.press('Shift+ArrowDown');
      await page.waitForTimeout(250);
      const shifted = await slashMenu(page);
      const sel = await page.evaluate(() => getSelection()?.toString() ?? '');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(1200);
      const stored = contentOf(state, id, block);
      return {
        claims: { TE4m: !open.open || sel === '' || shifted.open || /[αβγ≈→]/.test(textOf(stored ?? '')) },
        numbers: { open: JSON.stringify({ open: open.open, count: open.count }), afterShiftDown: JSON.stringify({ open: shifted.open, selection: sel }), stored: JSON.stringify(stored) },
      };
    },
  },
  {
    id: 'TE-I-insert-variants', info: true,
    how: 'information (the cause of TE4jb, review round 1 R28): in a scratch contenteditable outside the app, drawn pre-wrap as the editor is, holding <div>ZQV1</div><div>ZQV2<br>/al</div>: (v1) the "/al" text selected and execCommand insertText α (what the editor did); (v2) "al" selected (the slash kept), insertText; (v3) the caret at the end, insertText α, then the "/al" before it selected and deleted; (v4) the text node\'s data replaced (what the editor does since)',
    async run(h, s) {
      const out = await s.page.evaluate(() => {
        const res = {};
        const make = () => {
          const el = document.createElement('div');
          el.contentEditable = 'true';
          el.style.whiteSpace = 'pre-wrap';
          el.innerHTML = '<div>ZQV1</div><div>ZQV2<br>/al</div>';
          document.body.appendChild(el);
          el.focus();
          return { el, t: el.lastChild.lastChild };
        };
        const sel = getSelection();
        const pick = (n, a, b) => { const r = document.createRange(); r.setStart(n, a); r.setEnd(n, b); sel.removeAllRanges(); sel.addRange(r); };
        let { el, t } = make(); pick(t, 0, 3); document.execCommand('insertText', false, 'α'); res.v1 = el.innerHTML; el.remove();
        ({ el, t } = make()); pick(t, 1, 3); document.execCommand('insertText', false, 'α'); res.v2 = el.innerHTML; el.remove();
        ({ el, t } = make()); pick(t, 3, 3); document.execCommand('insertText', false, 'α'); pick(el.lastChild.lastChild, 0, 3); document.execCommand('delete'); res.v3 = el.innerHTML; el.remove();
        ({ el, t } = make()); t.replaceData(0, 3, 'α'); res.v4 = el.innerHTML; el.remove();
        return res;
      });
      return { numbers: out };
    },
  },
  {
    id: 'TE-I-layouts', info: true,
    how: 'information (review round 1, R1-F4): keydowns dispatched on the focused text with a "2" selected, as other keyboard layouts send them (a page cannot make Playwright type them; untrusted events, handled by the same React handler): German "+" key (key "+", code BracketRight), German Shift + 0 (key "=", code Digit0), the German dead acute on the US = key\'s place (key "Dead", code Equal), French "=" (key "=", code Slash), each with Ctrl: taken or left, and what is stored',
    async run(h, s) {
      const { page, state, id } = s;
      const [block] = await textBlockIds(page);
      await focusBlockEnd(page, block);
      await page.keyboard.type(' ZQY2O', { delay: 30 });
      await storedWhen(state, id, block, (c) => c.includes('ZQY2O'));
      const cases = {
        germanPlus: { key: '+', code: 'BracketRight', shiftKey: false },
        germanShift0: { key: '=', code: 'Digit0', shiftKey: true },
        germanDeadAcute: { key: 'Dead', code: 'Equal', shiftKey: false },
        frenchEqual: { key: '=', code: 'Slash', shiftKey: false },
      };
      const out = {};
      for (const [name, c] of Object.entries(cases)) {
        await selectInBlock(page, block, 1, 1);
        const taken = await page.evaluate((c) => {
          const e = new KeyboardEvent('keydown', { ...c, ctrlKey: true, bubbles: true, cancelable: true });
          document.activeElement.dispatchEvent(e);
          return e.defaultPrevented;
        }, c);
        await page.waitForTimeout(1200);
        const st = contentOf(state, id, block);
        out[name] = `${taken ? 'taken' : 'left'} → ${JSON.stringify(st)}`;
        if (/<su[bp]>/.test(st ?? '')) {
          await page.keyboard.press(KEY.undo);
          await storedWhen(state, id, block, (x) => x.includes('ZQY2O'));
        }
      }
      return { numbers: out };
    },
  },
  {
    id: 'TE-I-type-after-sub', info: true,
    how: 'information: " ZQCO<sub>2</sub>" pasted at the end of text block 1 (a real ⌘V), End, " ZQNEXT" typed: whether the typed word goes into the subscript (it continues the format, as a word processor does)',
    async run(h, s) {
      const { page, state, id } = s;
      const [block] = await textBlockIds(page);
      await copyToClipboard(page, { 'text/html': ' ZQCO<sub>2</sub>', 'text/plain': ' ZQCO2' });
      await clickToEnd(page, page.locator(`${CANVAS} [data-block-id="${block}"] [contenteditable="true"]`).first());
      await page.keyboard.press(`${MOD}+v`);
      await storedWhen(state, id, block, (c) => SUB_C.test(c));
      await focusBlockEnd(page, block);
      await page.keyboard.type(' ZQNEXT', { delay: 30 });
      const stored = await storedWhen(state, id, block, (c) => c.includes('ZQNEXT'));
      return { numbers: { stored: JSON.stringify(stored.html), typedInsideSub: /<sub>[^<]*ZQNEXT/.test(stored.html ?? '') } };
    },
  },
  {
    id: 'TE-I-engine-commands', info: true,
    how: 'information (the cause of record 39\'s own toggle): in text block 1, " H2O" typed and its "2" selected, then the engine\'s own commands run from the page: execCommand superscript, the states (queryCommandState), subscript, the states, subscript again; then in text block 2 with the page\'s base rule overridden (sup / sub vertical-align super / sub): whether the engine reads its own superscript and removes it on a second press',
    async run(h, s) {
      const run = (override) => s.page.evaluate((override) => {
        if (override) {
          const st = document.createElement('style');
          st.textContent = 'sup{vertical-align:super!important}sub{vertical-align:sub!important}';
          document.head.appendChild(st);
        }
        const host = document.activeElement;
        const sel = getSelection();
        const w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          const i = n.data.indexOf('H2O');
          if (i < 0) continue;
          const r = document.createRange();
          r.setStart(n, i + 1);
          r.setEnd(n, i + 2);
          sel.removeAllRanges();
          sel.addRange(r);
          break;
        }
        const out = {};
        document.execCommand('superscript');
        out.sup = host.innerHTML.slice(-20);
        out.stateSup = document.queryCommandState('superscript');
        document.execCommand('subscript');
        out.subOverSup = host.innerHTML.slice(-20);
        out.stateSub = document.queryCommandState('subscript');
        document.execCommand('subscript');
        out.subAgain = host.innerHTML.slice(-20);
        return out;
      }, override);
      const [block, second] = await textBlockIds(s.page);
      await focusBlockEnd(s.page, block);
      await s.page.keyboard.type(' H2O', { delay: 20 });
      const plain = await run(false);
      // The override stays on the page: the plain run comes first.
      await focusBlockEnd(s.page, second);
      await s.page.keyboard.type(' H2O', { delay: 20 });
      const overridden = await run(true);
      return { numbers: { asIs: JSON.stringify(plain), baseRuleOverridden: JSON.stringify(overridden) } };
    },
  },
  {
    id: 'TE-I-zoom', info: true,
    how: 'information: the page\'s zoom (devicePixelRatio, visualViewport.scale) before and after the browser\'s own zoom-in key (⌘ + = here) pressed outside text and Control + Shift + = in text: whether Playwright\'s keys reach the browser\'s zoom at all',
    async run(h, s) {
      const { page } = s;
      await watchEqualKeys(page);
      const z0 = await zoomNow(page);
      await clickAway(page);
      await page.keyboard.press(ZOOM_KEY);
      await page.waitForTimeout(600);
      const z1 = await zoomNow(page);
      const [block] = await textBlockIds(page);
      await focusBlockEnd(page, block);
      await page.keyboard.press(SUP_KEY);
      await page.waitForTimeout(600);
      const z2 = await zoomNow(page);
      return { numbers: { before: JSON.stringify(z0), afterZoomKeyOutside: JSON.stringify(z1), afterSupKeyInText: JSON.stringify(z2), keys: JSON.stringify(await takeKeys(page)) } };
    },
  },
];
