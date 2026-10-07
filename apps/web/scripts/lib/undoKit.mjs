/**
 * Helpers for scripts/undo-history-check.mjs (plan item 12; record
 * docs/fixes/12-one-undo-history.md): the user's actions on the editor —
 * the mouse and the keys, through Playwright — and passive reads of the
 * page. Nothing here calls the app's store; `read` and `probe` only look.
 *
 * Written by item 12's reproducer (the helpers of its harness) and its
 * confirmer (the event probe, the sidebar's Content box, the version
 * route), folded together for the fix.
 */

// The host's native editing modifier (Playwright sends the host's editing
// commands: macOS maps ⌘, Linux Ctrl). The editor accepts both.
export const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
export const KEY = {
  undo: `${MOD}+z`,
  // Playwright keeps a named key's case under Shift ("z" → key "z"), as
  // macOS Chrome and Safari report ⌘⇧Z; "KeyZ" under Shift sends key "Z".
  redo: `${MOD}+Shift+z`,
  redoUpper: `${MOD}+Shift+KeyZ`,
  redoY: `${MOD}+y`,
  bold: `${MOD}+b`,
  copy: `${MOD}+c`,
  paste: `${MOD}+v`,
  toEnd: process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End',
  selWordLeft: process.platform === 'darwin' ? 'Alt+Shift+ArrowLeft' : 'Control+Shift+ArrowLeft',
};
export const PAUSE = 800; // a settle after typing; steps are by word now, not by pause

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The shared fixture (lib/editorHarness.mjs buildDoc) wraps each text block
 * in <p>, which the editor's sanitizer unwraps on the first commit. A
 * template's text is plain (templates.ts), so by default the text is stored
 * the way the editor itself stores it; U10p keeps the <p> on purpose. The
 * table gets a caption, so the Edit tab shows its caption field.
 */
export const canonical = (doc) => ({
  ...doc,
  blocks: doc.blocks.map((b) => {
    if (b.type === 'text') return { ...b, content: b.content.replace(/<\/?p>/g, '') };
    if (b.type === 'table') return { ...b, caption: 'ZQ table caption', captionPosition: 'bottom' };
    return b;
  }),
});
export const withParagraphs = (doc) => doc;

/** Everything observed at one instant: DOM and passive store reads. */
export async function read(page, ids) {
  return page.evaluate(async (ids) => {
    const m = await import('/src/stores/posterStore.ts');
    const s = m.usePosterStore.getState();
    const norm = (html) => (html ?? '').replace(/\s+/g, ' ').trim();
    const plain = (html) => {
      const d = document.createElement('div');
      d.innerHTML = html ?? '';
      return (d.textContent ?? '').replace(/\s+/g, ' ').trim();
    };
    const blocks = {};
    for (const id of ids) {
      const ce = document.querySelector(`#poster-canvas [data-block-id="${id}"] [contenteditable]`);
      const b = s.doc.blocks.find((x) => x.id === id);
      blocks[id] = {
        dom: ce ? (ce.textContent ?? '').replace(/\s+/g, ' ').trim() : null,
        domHtml: ce ? norm(ce.innerHTML) : null,
        store: plain(b?.content),
        storeHtml: norm(b?.content),
        x: b?.x,
        present: !!b,
      };
    }
    const toast = [...document.querySelectorAll('div')].find(
      (d) => d.children.length === 0 && (d.textContent === 'Undo' || d.textContent === 'Redo')
        && getComputedStyle(d).pointerEvents === 'none',
    );
    const a = document.activeElement;
    const active = a?.isContentEditable
      ? `CE:${a.closest('[data-block-id]')?.getAttribute('data-block-id') ?? 'outside-canvas'}`
      : `${a?.tagName ?? 'none'}${a?.getAttribute?.('aria-label') ? `[${a.getAttribute('aria-label')}]` : ''}`;
    return { blocks, canUndo: s.canUndo, canRedo: s.canRedo, font: s.doc.fontFamily, toast: toast?.textContent ?? null, active };
  }, ids);
}

/** The selection in the focused editing host, in characters of its text; null outside one. */
export async function caretIn(page) {
  return page.evaluate(() => {
    const host = document.activeElement;
    const sel = getSelection();
    if (!host?.isContentEditable || !sel || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0);
    if (!host.contains(r.startContainer)) return null;
    const pre = document.createRange();
    pre.selectNodeContents(host);
    pre.setEnd(r.startContainer, r.startOffset);
    const start = pre.toString().length;
    return { start, end: start + r.toString().length, text: r.toString(), length: (host.textContent ?? '').length };
  });
}

export async function textBlockIds(page) {
  return page.evaluate(() => [...document.querySelectorAll('#poster-canvas [data-block-type="text"]')]
    .map((e) => e.getAttribute('data-block-id')));
}

/** A block's id by its type (the first of that type on the poster). */
export async function blockOf(page, type) {
  return page.evaluate((t) => document.querySelector(`#poster-canvas [data-block-type="${t}"]`)?.getAttribute('data-block-id') ?? null, type);
}

/** Click into block `id`'s text and put the caret at its end, with the user's keys. */
export async function focusBlockEnd(page, id) {
  const ce = page.locator(`#poster-canvas [data-block-id="${id}"] [contenteditable="true"]`).first();
  await ce.scrollIntoViewIfNeeded();
  const focused = () => page.evaluate((id) => {
    const a = document.activeElement;
    return !!a?.isContentEditable && a.closest('[data-block-id]')?.getAttribute('data-block-id') === id;
  }, id);
  for (let i = 0; i < 3 && !(await focused()); i += 1) {
    await ce.click();
    await page.waitForTimeout(250);
  }
  if (!(await focused())) throw new Error(`could not focus the text of block ${id}`);
  await page.keyboard.press(KEY.toEnd);
  await page.waitForTimeout(80);
  const atEnd = await page.evaluate(() => {
    const sel = getSelection();
    const host = document.activeElement;
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
    const r = document.createRange();
    r.selectNodeContents(host);
    r.setStart(sel.anchorNode, sel.anchorOffset);
    return r.toString().length === 0;
  });
  if (!atEnd) throw new Error(`${KEY.toEnd} did not put the caret at the end of block ${id}`);
}

export async function typeWord(page, text) {
  await page.keyboard.type(text, { delay: 35 });
  await page.waitForTimeout(PAUSE);
}

/** A point on the canvas workspace outside the poster and not a control (fix 01's harness). */
export async function clickAway(page) {
  const pt = await page.evaluate(() => {
    const outer = document.querySelector('[data-postr-canvas-outer]');
    const poster = document.getElementById('poster-canvas');
    if (!outer || !poster) return null;
    const o = outer.getBoundingClientRect();
    const p = poster.getBoundingClientRect();
    const cands = [];
    for (const fx of [0.5, 0.2, 0.8]) {
      cands.push([o.left + (o.width * fx), (p.bottom + o.bottom) / 2]);
      cands.push([o.left + (o.width * fx), (o.top + p.top) / 2]);
    }
    for (const fy of [0.5, 0.3, 0.7]) {
      cands.push([(p.right + o.right) / 2, o.top + o.height * fy]);
      cands.push([(o.left + p.left) / 2, o.top + o.height * fy]);
    }
    for (const [x, y] of cands) {
      const el = document.elementFromPoint(x, y);
      if (!el || !outer.contains(el)) continue;
      if (el.closest('#poster-canvas') || el.closest('button') || el.closest('input,select,textarea,[contenteditable="true"]')) continue;
      return { x, y };
    }
    return null;
  });
  if (!pt) throw new Error('no empty canvas point found');
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(300);
  const a = await page.evaluate(() => document.activeElement?.isContentEditable ?? false);
  if (a) throw new Error('clicking away left the caret in a text block');
}

export async function press(page, key, wait = 150) {
  await page.keyboard.press(key);
  await page.waitForTimeout(wait);
}

/** Press `key` until `pred(state)` holds, at most `max` times. */
export async function pressUntil(page, ids, key, pred, max) {
  let s = await read(page, ids);
  let n = 0;
  while (n < max && !pred(s)) {
    await press(page, key, 120);
    n += 1;
    s = await read(page, ids);
  }
  return { presses: n, reached: pred(s), state: s };
}

export async function openTab(page, label) {
  await page.locator('button[data-postr-tab]').filter({ hasText: new RegExp(`^${label}`) }).first().click();
  await page.waitForTimeout(350);
}

export async function changeFont(page, to = 'DM Sans') {
  await openTab(page, 'style');
  await page.locator('select', { has: page.locator('option[value="Source Sans 3"]') }).first().selectOption(to);
  await page.waitForTimeout(300);
}

/** Select the last word of the focused block with the keyboard (caret at its end first). */
export async function selectLastWord(page, id) {
  await focusBlockEnd(page, id);
  // Word-left treats the closing "." as a word of its own in some engines:
  // extend until the selection holds letters ("protocol.").
  let sel = '';
  for (let i = 0; i < 3 && !/[a-z]{3}/i.test(sel); i += 1) {
    await press(page, KEY.selWordLeft, 120);
    sel = await page.evaluate(() => getSelection()?.toString() ?? '');
  }
  if (!/[a-z]{3}/i.test(sel)) throw new Error(`${KEY.selWordLeft} did not select a word in block ${id} (${JSON.stringify(sel)})`);
  return sel;
}

/**
 * Select a block without putting a caret in it: a click near its frame's
 * top-left corner (the item 12 confirmer's way in to a table or an image).
 */
export async function selectFrame(page, id) {
  // The first match: some engines' layouts hold a second element with the
  // block's id (Firefox, an image block; the confirmer met it on a table).
  const frame = page.locator(`#poster-canvas [data-block-id="${id}"]`).first();
  await frame.scrollIntoViewIfNeeded();
  const bb = await frame.boundingBox();
  await page.mouse.click(bb.x + 3, bb.y + 3);
  await page.waitForTimeout(400);
  const ok = await page.evaluate((i) => document.querySelector(`[data-block-id="${i}"]`)?.dataset.postrSelected === 'true', id);
  if (!ok) throw new Error(`a click on the frame of block ${id} did not select it`);
}

/** Click into the Edit block tab's Content box (the selected block's), caret at its end. */
export async function focusContentBox(page) {
  const pt = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[contenteditable]')].find((e) => !e.closest('#poster-canvas'));
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + Math.min(20, r.width / 2), y: r.top + Math.min(10, r.height / 2) };
  });
  if (!pt) throw new Error('no Content box (is a text block selected and the Edit block tab open?)');
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(250);
  await page.keyboard.press(KEY.toEnd);
  await page.waitForTimeout(80);
  const inBox = await page.evaluate(() => {
    const a = document.activeElement;
    return !!a?.isContentEditable && !a.closest('#poster-canvas');
  });
  if (!inBox) throw new Error('the click did not put the caret in the Content box');
}

/** The Content box's text, or null. */
export const contentBoxText = (page) => page.evaluate(() =>
  [...document.querySelectorAll('[contenteditable]')].find((e) => !e.closest('#poster-canvas'))?.textContent ?? null);

/**
 * Start recording, in the page, every history input (beforeinput and
 * input of type historyUndo / historyRedo) with where it was aimed and
 * whether it was cancelled. `probeTake` returns and clears the record.
 */
export async function probeInstall(page) {
  await page.evaluate(() => {
    const where = (el) => {
      if (!el || el.nodeType !== 1) return String(el?.nodeName);
      const b = el.closest('[data-block-id]');
      if (b && el.closest('#poster-canvas')) return `canvas:${b.getAttribute('data-block-type')}`;
      if (el.isContentEditable) return 'sidebar-ce';
      return el.tagName + (el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : '');
    };
    window.__hist = [];
    const rec = (e) => {
      if (!/^history/.test(e.inputType)) return;
      // Read the verdict after every listener ran.
      setTimeout(() => window.__hist.push(`${e.type === 'beforeinput' ? 'bi' : 'in'}:${e.inputType}@${where(e.target)}${e.defaultPrevented ? ':cancelled' : ''}`), 0);
    };
    document.addEventListener('beforeinput', rec, true);
    document.addEventListener('input', rec, true);
  });
}
export const probeTake = (page) => page.evaluate(() => (window.__hist ?? []).splice(0).join(', ') || 'none');

/** Which element has the focus, as the confirmer named it. */
export const activeIs = (page) => page.evaluate(() => {
  const a = document.activeElement;
  if (!a) return 'none';
  if (a.isContentEditable) return a.closest('#poster-canvas') ? `canvas:${a.closest('[data-block-id]')?.getAttribute('data-block-type')}` : 'sidebar-ce';
  return `${a.tagName}${a.getAttribute('aria-label') ? `[${a.getAttribute('aria-label')}]` : ''}`;
});

export { sleep };
