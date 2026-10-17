/**
 * The scenarios of scripts/text-size-check.mjs besides the ladder
 * (lib/textSizeLadder.mjs), record 33. Each enters as a user does: the top
 * bar's buttons with the mouse or the keyboard, the sidebar's tabs and
 * fields, typing at the caret, Save PDF from the top bar, Export ›
 * PowerPoint. Each returns `{ claims, numbers }`, a claim true when the
 * defect is observed; `info` scenarios return numbers only.
 */
import { MOD, focusBlockEnd, typeWord, tabToward, caretIn, activeIs } from './undoKit.mjs';
import { openPrintWindow, downloadPptx } from './keepWorkKit.mjs';
import {
  LEVELS, PT_PER_UNIT, control, editorLevels, storeSizes, readLevelsInPage, readBarInPage, overlapping, pptxTextSizes,
} from './textSizeRead.mjs';
import {
  NAMES, TOL_PT, NoControl, needControl, pressSize, pressHistory, openTab, expectedAt, sizeMisses, sameSizes, sizeDiff,
} from './textSizeKit.mjs';

const blockIds = (page, type) => page.evaluate((t) => [...document.querySelectorAll(`#poster-canvas [data-block-type="${t}"]`)].map((e) => e.getAttribute('data-block-id')), type);
const blockBox = (page, id) => page.evaluate((i) => {
  const el = document.querySelector(`#poster-canvas [data-block-id="${i}"]`);
  return el ? `${el.style.left},${el.style.top}` : 'gone';
}, id);
const storedContent = (page, id) => page.evaluate(async (i) => {
  const m = await import('/src/stores/posterStore.ts');
  return m.usePosterStore.getState().doc.blocks.find((b) => b.id === i)?.content ?? null;
}, id);
const plainOf = (html) => String(html ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');

/** TB: the top bar shows [A−] Body N pt [A+] (the claim before the fix). */
export async function topBarControl(page) {
  const c = await control(page);
  const levels = await editorLevels(page);
  const want = `Body ${Math.round(levels.body.pt)} pt`;
  return {
    claims: { TB: !c.up || !c.down || c.label !== want },
    numbers: { bar: c.bar, down: c.down, up: c.up, label: c.label, want },
  };
}

/**
 * KEY: A+ reached with the keyboard (Tab or Shift+Tab from the selected text
 * block) and pressed with Enter and then Space: two steps up, the focus left
 * on the button; then ArrowDown, Backspace and Delete pressed there move,
 * delete and type nothing (the selected block stays where it was).
 */
export async function keys(page) {
  await needControl(page);
  const before = await storeSizes(page);
  const [id] = await blockIds(page, 'text');
  await focusBlockEnd(page, id);
  const box0 = await blockBox(page, id);
  const text0 = await storedContent(page, id);
  const reached = await tabToward(page, NAMES.up);
  if (!reached) throw new Error('Tab did not reach A+');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const afterEnter = await storeSizes(page);
  const focus1 = await activeIs(page);
  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  const afterSpace = await storeSizes(page);
  const focus2 = await activeIs(page);
  // Playwright's WebKit goes back in history on a Backspace nothing cancels
  // outside a text field (record 12, B3w): held at the window in the bubble
  // phase, after the app's own listener, as undo-history-check's B3 does; no
  // listener of the app reads defaultPrevented. The URL is compared too.
  const url = await page.evaluate(() => {
    window.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !e.defaultPrevented) e.preventDefault(); });
    return location.href;
  });
  for (const k of ['ArrowDown', 'Backspace', 'Delete']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(150);
  }
  if (page.url() !== url) throw new Error(`a key on A+ left the editor (${url} → ${page.url()})`);
  const box1 = await blockBox(page, id);
  const text1 = await storedContent(page, id);
  const lv = await editorLevels(page);
  const onButton = `BUTTON[${NAMES.up}]`;
  return {
    claims: {
      KEY: sameSizes(before, afterEnter) || sameSizes(afterEnter, afterSpace) || Math.abs(lv.body.pt - 44) > TOL_PT,
      KEYFOCUS: focus1 !== onButton || focus2 !== onButton,
      KEYPASS: box1 !== box0 || text1 !== text0,
    },
    numbers: { reached, focus1, focus2, body: Number(lv.body.pt.toFixed(3)), box0, box1, textKept: text1 === text0 },
  };
}

/**
 * CARET: the caret in a text block, "ZQab" typed, A+ pressed with the mouse,
 * "cd" typed: the caret stays in the block and the letters join ("ZQabcd");
 * Undo removes "cd" only, the next Undo the size only, the next "ZQab": the
 * typing step is neither lost nor split by the press.
 */
export async function caret(page) {
  await needControl(page);
  const sizes0 = await storeSizes(page);
  const [id] = await blockIds(page, 'text');
  const content0 = plainOf(await storedContent(page, id));
  await focusBlockEnd(page, id);
  await typeWord(page, ' ZQab');
  await pressSize(page, 'up');
  const where = await activeIs(page);
  const at = await caretIn(page);
  const sizes1 = await storeSizes(page);
  await typeWord(page, 'cd');
  const typed = plainOf(await storedContent(page, id));
  await pressHistory(page, 'Undo');
  const u1 = { text: plainOf(await storedContent(page, id)), sizes: await storeSizes(page) };
  await pressHistory(page, 'Undo');
  const u2 = { text: plainOf(await storedContent(page, id)), sizes: await storeSizes(page) };
  await pressHistory(page, 'Undo');
  const u3 = { text: plainOf(await storedContent(page, id)), sizes: await storeSizes(page) };
  const ends = (t, s) => t.trimEnd().endsWith(s);
  return {
    claims: {
      CARET: where !== 'canvas:text' || !at || at.start !== at.length || !ends(typed, 'ZQabcd'),
      STEPS: !(ends(u1.text, 'ZQab') && !ends(u1.text, 'ZQabcd') && sameSizes(u1.sizes, sizes1))
        || !(ends(u2.text, 'ZQab') && sameSizes(u2.sizes, sizes0))
        || !(!u3.text.includes('ZQab') && u3.text.trim() === content0.trim() && sameSizes(u3.sizes, sizes0)),
      PRESSED: sameSizes(sizes0, sizes1),
    },
    numbers: { where, caret: at, typedEnd: typed.slice(-12), u1: u1.text.slice(-10), u2: u2.text.slice(-10), u3: u3.text.slice(-10) },
  };
}

/** The Style tab's four size fields (Typography: title, heading, authors, body). */
const styleFields = (page) => page.locator('[data-postr-sidebar] input[type="number"][title="Font size (points)"]');

async function typeInto(locator, value) {
  await locator.click({ clickCount: 3 });
  await locator.press(`${MOD}+a`);
  await locator.pressSequentially(String(value), { delay: 40 });
  await locator.page().waitForTimeout(300);
}

/** STYLE: the Style tab's title field set to 120 pt changes the title only; A+ then keeps 120 ÷ 36 for it. */
export async function styleTab(page) {
  await needControl(page);
  const start = await editorLevels(page);
  await openTab(page, 'style');
  const fields = styleFields(page);
  if ((await fields.count()) < 4) throw new Error(`the Style tab shows ${await fields.count()} size fields`);
  await typeInto(fields.nth(0), 120);
  const afterField = await editorLevels(page);
  const one = sizeMisses(afterField, { ...expectedAt(start, start.body.pt), title: 120 });
  await pressSize(page, 'up');
  const afterUp = await editorLevels(page);
  const want = { ...expectedAt({ ...start, title: { pt: 120 } }, 40) };
  const kept = sizeMisses(afterUp, want);
  return {
    claims: { STYLE1: one.length > 0, STYLEKEEP: kept.length > 0 },
    numbers: { afterField: Number(afterField.title.pt.toFixed(3)), afterUp: Object.fromEntries(Object.entries(afterUp).map(([k, v]) => [k, v && Number(v.pt.toFixed(3))])), misses: [...one, ...kept] },
  };
}

/** NOTE: a selected text block's Edit tab names the top bar's A− / A+ (rule 6). */
export async function note(page) {
  const [id] = await blockIds(page, 'text');
  await focusBlockEnd(page, id);
  await openTab(page, 'edit block');
  const text = await page.evaluate(() => document.querySelector('[data-postr-sidebar]')?.innerText ?? '');
  const line = text.split('\n').find((l) => /Type on the poster/.test(l)) ?? null;
  return {
    claims: { NOTE: !line || !/A− \/ A\+/.test(line) || !/top bar/.test(line) },
    numbers: { line },
  };
}

/**
 * ROUTE (information): the way to raise every level one step with the Style
 * tab's fields, as a user does it: each field's shown value (whole pt) times
 * 40 ÷ 36, rounded as the field shows it, typed; then back, times 36 ÷ 40.
 * The fields changed, the Undo presses that bring the start back, and how
 * far the ratios and the sizes end from the start.
 */
export async function route(page) {
  const start = await storeSizes(page);
  const startPt = Object.fromEntries(Object.entries(start).map(([k, v]) => [k, Number(v) * PT_PER_UNIT]));
  await openTab(page, 'style');
  const fields = styleFields(page);
  const order = ['title', 'heading', 'authors', 'body'];
  const shown = [];
  for (let i = 0; i < 4; i += 1) shown.push(Number(await fields.nth(i).inputValue()));
  for (let i = 0; i < 4; i += 1) await typeInto(fields.nth(i), Math.round((shown[i] * 40) / 36));
  const up = await storeSizes(page);
  const upPt = Object.fromEntries(Object.entries(up).map(([k, v]) => [k, Number(v) * PT_PER_UNIT]));
  const ratioDrift = order.filter((k) => k !== 'body').map((k) => Math.abs(upPt[k] / upPt.body - startPt[k] / startPt.body) / (startPt[k] / startPt.body));
  let undos = 0;
  while (undos < 12 && !sameSizes(await storeSizes(page), start)) {
    await pressHistory(page, 'Undo');
    undos += 1;
  }
  // Up again and back down by the fields: where the round trip ends.
  for (let i = 0; i < 4; i += 1) await typeInto(fields.nth(i), Math.round((shown[i] * 40) / 36));
  const shownUp = [];
  for (let i = 0; i < 4; i += 1) shownUp.push(Number(await fields.nth(i).inputValue()));
  for (let i = 0; i < 4; i += 1) await typeInto(fields.nth(i), Math.round((shownUp[i] * 36) / 40));
  const back = await storeSizes(page);
  const backPt = Object.fromEntries(Object.entries(back).map(([k, v]) => [k, Number(v) * PT_PER_UNIT]));
  return {
    numbers: {
      fields: 4, shown, typedUp: shown.map((v) => Math.round((v * 40) / 36)), undosToStart: undos,
      maxRatioDriftPct: Number((100 * Math.max(...ratioDrift)).toFixed(3)),
      roundTripPt: Object.fromEntries(order.map((k) => [k, `${startPt[k].toFixed(3)}→${backPt[k].toFixed(3)}`])),
      exactBack: sameSizes(back, start),
    },
  };
}

/** PRINT: after A+, the top bar's Save PDF document draws every level at the editor's size and the rule's. */
export async function print(page) {
  await needControl(page);
  const start = await editorLevels(page);
  await pressSize(page, 'up');
  const ed = await editorLevels(page);
  const popup = await openPrintWindow(page, 'ZQTITLE', { entry: 'topbar' });
  if (!popup) throw new Error('the top bar opened no print window');
  await popup.emulateMedia({ media: 'print' });
  await popup.waitForTimeout(300);
  const pr = await popup.evaluate(readLevelsInPage, { sheetSel: '#poster-print-root #poster-canvas', ptPerUnit: PT_PER_UNIT, levels: LEVELS });
  await popup.close().catch(() => {});
  const vsEditor = sizeMisses(pr, Object.fromEntries(Object.entries(ed).map(([k, v]) => [k, v ? v.pt : null])));
  const vsRule = sizeMisses(pr, expectedAt(start, 40));
  return {
    claims: { PRINT: vsEditor.length > 0 || vsRule.length > 0 },
    numbers: { print: Object.fromEntries(Object.entries(pr).map(([k, v]) => [k, v && Number(v.pt.toFixed(3))])), misses: [...vsEditor, ...vsRule] },
  };
}

/**
 * PPTX: after A+, the PowerPoint file writes the title, each heading, the
 * authors' names and each text block at the editor's size (the writer rounds
 * to 0.01 pt): every run of the shape holding each block's text, its largest.
 */
export async function pptx(page) {
  await needControl(page);
  const start = await editorLevels(page);
  await pressSize(page, 'up');
  const ed = await editorLevels(page);
  const texts = await page.evaluate(() => {
    const pick = (t) => [...document.querySelectorAll(`#poster-canvas [data-block-type="${t}"]`)].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);
    return { title: pick('title'), heading: pick('heading'), authors: pick('authors'), body: pick('text') };
  });
  const shapes = pptxTextSizes(await downloadPptx(page));
  const misses = [];
  const found = {};
  for (const [lv, list] of Object.entries(texts)) {
    for (const t of list) {
      const probe = lv === 'authors' ? (t.match(/^[A-Za-z]+ [A-Za-z]+/) ?? [t])[0] : t.replace(/^\d+\.\s*/, '').split(/[,·\n]/)[0].slice(0, 24).trim();
      const shape = shapes.find((s) => s.text.replace(/\s+/g, ' ').includes(probe));
      if (!shape) { misses.push(`${lv} "${probe}" not in the file`); continue; }
      const pts = shape.runs.map((r) => r.pt).filter((v) => v !== null);
      const max = pts.length ? Math.max(...pts) : null;
      found[lv] = max;
      const want = ed[lv].pt;
      if (max === null || Math.abs(max - want) > 0.006) misses.push(`${lv} "${probe}" written ${max} pt vs drawn ${want.toFixed(3)}`);
    }
  }
  const vsRule = sizeMisses(ed, expectedAt(start, 40));
  return { claims: { PPTX: misses.length > 0 || vsRule.length > 0 }, numbers: { written: found, misses: [...misses, ...vsRule].slice(0, 8) } };
}

/**
 * FIT: the top bar at a window size, the sidebar shown and hidden: no two of
 * its controls overlap, each lies in the bar and the window, the label is on
 * one line, nothing scrolls, each button is the top element at its centre,
 * and the order is History, text size, Save PDF.
 */
export async function fit(page, { sidebar }) {
  if (sidebar === 'hidden') {
    await page.click('[title="Hide sidebar (⌘/)"]');
    await page.waitForTimeout(600);
  }
  const b = await page.evaluate(readBarInPage);
  if (b.error) throw new Error(b.error);
  if (!b.textSize) throw new NoControl();
  const boxes = { history: b.history, textSize: b.textSize, print: b.print, reveal: b.reveal };
  const outside = Object.entries(boxes).filter(([, x]) => x && (x.t < b.bar.t - 0.5 || x.b > b.bar.b + 0.5 || x.l < -0.5 || x.r > b.window.w + 0.5)).map(([k]) => k);
  const order = b.history.r <= b.textSize.l && b.textSize.r <= b.print.l;
  return {
    claims: {
      FITOVER: overlapping(boxes).length > 0,
      FITOUT: outside.length > 0 || b.bar.scrollW > b.bar.clientW,
      FITWRAP: b.labelLines !== 1,
      FITHIT: b.covered.length > 0,
      FITORDER: !order,
    },
    numbers: {
      window: `${b.window.w}x${b.window.h}`, sidebar,
      gaps: { historyToSize: Number((b.textSize.l - b.history.r).toFixed(1)), sizeToPrint: Number((b.print.l - b.textSize.r).toFixed(1)) },
      textSize: [b.textSize.l, b.textSize.t, b.textSize.w, b.textSize.h].map((v) => Math.round(v)),
      overlaps: overlapping(boxes), outside, labelLines: b.labelLines, covered: b.covered,
    },
  };
}

/** UNBOUND: ⌘⇧> and ⌘⇧< (Ctrl off a Mac) change no size, from the caret in text or a selected block. */
export async function unbound(page) {
  const before = await storeSizes(page);
  const [id] = await blockIds(page, 'text');
  await focusBlockEnd(page, id);
  for (const k of [`${MOD}+Shift+Period`, `${MOD}+Shift+Comma`]) {
    await page.keyboard.press(k);
    await page.waitForTimeout(200);
  }
  const inText = await storeSizes(page);
  return { claims: { UNBOUND: !sameSizes(before, inText) }, numbers: { changed: sizeDiff(before, inText) } };
}

/** ARRANGE: after A+ to 48 pt, Layout › Auto-Arrange changes no size (record 28's rule, kept). */
export async function arrange(page) {
  await needControl(page);
  for (let i = 0; i < 3; i += 1) await pressSize(page, 'up');
  const before = { levels: await editorLevels(page), store: await storeSizes(page) };
  await openTab(page, 'layout');
  await page.locator('button', { hasText: 'Auto-Arrange' }).first().click();
  await page.waitForTimeout(900);
  const after = { levels: await editorLevels(page), store: await storeSizes(page) };
  const misses = sizeMisses(after.levels, Object.fromEntries(Object.entries(before.levels).map(([k, v]) => [k, v ? v.pt : null])));
  return {
    claims: { ARRANGE: misses.length > 0 || !sameSizes(before.store, after.store) },
    numbers: { body: Number(after.levels.body.pt.toFixed(3)), misses, store: sizeDiff(before.store, after.store) },
  };
}
