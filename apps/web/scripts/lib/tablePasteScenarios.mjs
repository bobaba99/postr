/**
 * Scenarios and readings for scripts/table-paste-check.mjs (record
 * docs/fixes/32-table-paste.md). Every scenario enters as a user does: a
 * signed-in term holder at /p/new (lib/keepWorkKit.mjs openSignedIn), the
 * mouse into a cell or a text block, the keyboard's ⌘C and ⌘V, ⌘Z. What is
 * read: the poster the fake backend stored (lib/guestBackend.mjs), what the
 * canvas draws, and the drawn style of pasted text. Nothing calls the app's
 * store.
 *
 * The clipboard (TP_PASTE=clipboard, the default): a copy source the
 * harness adds to the page answers a real ⌘C by putting the shape's
 * text/html and text/plain on the clipboard through the copy event, then a
 * real ⌘V in the target delivers them as the engine's own, trusted paste
 * event. TP_PASTE=event dispatches a page-made paste event carrying the
 * shape instead (keep-work-check H5's way), for an engine whose clipboard
 * does not carry it. Control K1 checks the paste that reached the target
 * carried the shape.
 *
 * A shape with `copy: 'triple'` or `copy: 'select'` is copied by the engine
 * itself (record 32 section 9: the review's probes found two defects only
 * the engines' own copies show): its `source` HTML is drawn in the page,
 * selected with a triple-click on its first paragraph or as a whole, and a
 * real ⌘C serialises it. K1 then checks the trusted paste carried the
 * shape's marker in both types.
 */
import { sleep } from './editorHarness.mjs';
import { MOD, blockOf, focusBlockEnd, textBlockIds } from './undoKit.mjs';
import { rowOf } from './keepWorkKit.mjs';
import { TABLE_SHAPES, TEXT_SHAPES } from './tablePasteShapes.mjs';

const CANVAS = '#poster-canvas';
export const PASTE_MODE = process.env.TP_PASTE ?? 'clipboard';

const blocksOf = (state, id) => rowOf(state, id)?.data?.blocks ?? [];
const storedTable = (state, id, tableId) => {
  const t = blocksOf(state, id).find((b) => b.id === tableId)?.tableData;
  return t ? JSON.parse(JSON.stringify(t)) : null;
};
const storedContent = (state, id, blockId) => blocksOf(state, id).find((b) => b.id === blockId)?.content ?? null;

/** Stored cell HTML as text, read in Node (never parsed in the page, where markup would run). */
export const textOf = (html) => (html ?? '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/** Wait until `read()` returns something other than `was` (JSON), then let a following save land. */
async function changedFrom(read, was, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (JSON.stringify(read()) !== JSON.stringify(was)) { await sleep(900); return true; }
    await sleep(100);
  }
  return false;
}

/** Wait until `read()` equals `want` (JSON). */
async function becomes(read, want, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (JSON.stringify(read()) === JSON.stringify(want)) return true;
    await sleep(100);
  }
  return false;
}

/** The canvas's table: per cell, its drawn text (a line break as "\n") and the drawn grid. */
const drawnTable = (page, tableId) => page.evaluate(({ sel }) => {
  const t = document.querySelector(`${sel} table`);
  if (!t) return null;
  const textOfEl = (el) => {
    let s = '';
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) s += c.data;
        else if (c.nodeName === 'BR') s += '\n';
        else if (c.nodeType === 1) walk(c);
      }
    };
    walk(el);
    return s;
  };
  const rows = [...t.rows].map((tr) => [...tr.cells].map((td) => textOfEl(td.querySelector('[contenteditable]') ?? td)));
  return { grid: `${rows.length}x${rows[0]?.length ?? 0}`, rows, imgs: t.querySelectorAll('img').length };
}, { sel: `${CANVAS} [data-block-id="${tableId}"]` });

/**
 * Put the caret at the end of `locator`'s one line of text with the mouse:
 * a click 20 px in from its right edge, half-way down (clear of a selected
 * block's corner and edge handles, whose 24 px grips reach 12 px inside),
 * up to three times (a selected block may take the first click), then
 * checked. Playwright's own click is not used: it waits for the target to
 * be the hit target, and a selected block's frame can be.
 */
async function clickToEnd(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const atEnd = () => page.evaluate(() => {
    const host = document.activeElement;
    const sel = getSelection();
    if (!host?.isContentEditable || !sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
    const r = document.createRange();
    r.selectNodeContents(host);
    r.setStart(sel.anchorNode, sel.anchorOffset);
    return r.toString().length === 0;
  });
  for (let i = 0; i < 3; i += 1) {
    const box = await locator.boundingBox();
    if (!box) throw new Error('the target has no box');
    await page.mouse.click(box.x + box.width - 20, box.y + box.height / 2);
    await page.waitForTimeout(200);
    if (await atEnd()) return;
  }
  throw new Error('three clicks did not put the caret at the end of the target');
}

/** Record every paste that reaches the page (capture, before the app): trusted, and what it carried. */
async function watchPastes(page) {
  await page.evaluate(() => {
    if (window.__zqPastes) return;
    window.__zqPastes = [];
    document.addEventListener('paste', (e) => {
      window.__zqPastes.push({
        trusted: e.isTrusted,
        html: e.clipboardData?.getData('text/html') ?? '',
        text: e.clipboardData?.getData('text/plain') ?? '',
        inCell: !!document.activeElement?.closest('td'),
      });
    }, true);
  });
}

/**
 * Put `payload` on the clipboard with a real ⌘C on a copy source the
 * harness adds (its copy event writes the payload), the way another
 * application's copy would leave it. Returns whether the copy event ran.
 */
async function copyToClipboard(page, payload) {
  await page.evaluate((p) => {
    document.activeElement?.blur?.();
    let src = document.getElementById('zq-copy-source');
    if (!src) {
      src = document.createElement('div');
      src.id = 'zq-copy-source';
      src.tabIndex = -1;
      src.textContent = 'ZQ copy source';
      Object.assign(src.style, { position: 'fixed', left: '0', bottom: '0', zIndex: '2147483647', background: '#fff', font: '12px sans-serif' });
      document.body.appendChild(src);
      document.addEventListener('copy', (e) => {
        if (!window.__zqPayload) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        for (const [type, value] of Object.entries(window.__zqPayload)) e.clipboardData.setData(type, value);
        window.__zqPayload = null;
      }, true);
    }
    window.__zqPayload = p;
    src.focus();
    const r = document.createRange();
    r.selectNodeContents(src);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  }, payload);
  await page.keyboard.press(`${MOD}+c`);
  await page.waitForTimeout(150);
  return page.evaluate(() => window.__zqPayload === null);
}

/**
 * Let the engine copy `html` itself, as a copy from a web page would: drawn
 * in a box the harness adds, then selected with a triple-click on its first
 * paragraph (`how` 'triple', a user's line selection) or as a whole
 * ('select'), then a real ⌘C. The box is emptied after.
 */
async function copyByEngine(page, html, how) {
  await page.evaluate((h) => {
    document.activeElement?.blur?.();
    let box = document.getElementById('zq-render-source');
    if (!box) {
      box = document.createElement('div');
      box.id = 'zq-render-source';
      Object.assign(box.style, { position: 'fixed', right: '0', top: '0', zIndex: '2147483647', background: '#fff', color: '#000', font: '14px serif', width: '340px', padding: '8px' });
      document.body.appendChild(box);
    }
    box.innerHTML = h;
  }, html);
  if (how === 'triple') {
    const b = await page.locator('#zq-render-source p').first().boundingBox();
    await page.mouse.click(b.x + 10, b.y + b.height / 2, { clickCount: 3 });
  } else {
    await page.evaluate(() => {
      const r = document.createRange();
      r.selectNodeContents(document.getElementById('zq-render-source'));
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
  }
  await page.waitForTimeout(150);
  await page.keyboard.press(`${MOD}+c`);
  await page.waitForTimeout(150);
  await page.evaluate(() => { document.getElementById('zq-render-source').innerHTML = ''; });
}

/** Put the shape on the clipboard: the harness's copy event, or the engine's own copy. */
async function putShape(page, shape) {
  if (shape.copy === 'triple' || shape.copy === 'select') {
    if (PASTE_MODE === 'event') throw new Error('an engine copy needs the real clipboard (TP_PASTE=clipboard)');
    await copyByEngine(page, shape.source, shape.copy);
    return;
  }
  if (PASTE_MODE !== 'event' && !(await copyToClipboard(page, shape.payload))) throw new Error('the copy event did not run: nothing put on the clipboard');
}

/** Paste `payload` where the caret is: ⌘V from the clipboard, or a page-made paste event. */
async function pasteHere(page, payload) {
  if (PASTE_MODE === 'event') {
    await page.evaluate((p) => {
      const dt = new DataTransfer();
      for (const [type, value] of Object.entries(p)) dt.setData(type, value);
      const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
      // Firefox gives a page-made paste event's init clipboard nothing (keep-work-check H5).
      Object.defineProperty(ev, 'clipboardData', { value: dt });
      document.activeElement.dispatchEvent(ev);
    }, payload);
  } else {
    await page.keyboard.press(`${MOD}+v`);
  }
  await page.waitForTimeout(300);
}

/** Did the last paste carry the shape (control K1)? */
async function pasteCarried(page, payload, shape = {}) {
  const last = await page.evaluate(() => window.__zqPastes?.at(-1) ?? null);
  if (!last) return { ok: false, why: 'no paste event reached the page' };
  if (shape.copy === 'triple' || shape.copy === 'select') {
    const ok = last.trusted && last.html.includes(shape.marker) && last.text.includes(shape.marker);
    return { ok, why: `engine copy: trusted=${last.trusted} html=${last.html.includes(shape.marker)} text=${last.text.includes(shape.marker)}`, text: JSON.stringify(last.text), htmlTail: JSON.stringify(last.html.replace(/style="[^"]*"/g, '').slice(-90)) };
  }
  const html = payload['text/html'] ?? '';
  const text = payload['text/plain'] ?? '';
  const marker = (s) => (s.match(/ZQ\w+/) ?? [''])[0];
  const htmlOk = !html || last.html.includes(marker(html));
  const textOk = !text || last.text.replace(/\r/g, '') === text.replace(/\r/g, '') || last.text.includes(marker(text));
  const trustedOk = PASTE_MODE === 'event' || last.trusted;
  return { ok: htmlOk && textOk && trustedOk, why: `trusted=${last.trusted} html=${htmlOk} text=${textOk}`, sameHtml: last.html === html, sameText: last.text === text };
}

/** Type a marker at the end of every cell of the table, so a change to any cell shows. */
async function markCells(page, state, id, tableId) {
  const cells = page.locator(`${CANVAS} [data-block-id="${tableId}"] td [contenteditable]`);
  const n = await cells.count();
  for (let i = 0; i < n; i += 1) {
    await clickToEnd(page, cells.nth(i));
    await page.keyboard.type(` k${i}`, { delay: 5 });
  }
  const done = await becomes(() => {
    const cells = storedTable(state, id, tableId)?.cells;
    return !!cells && cells.length === n && cells.every((c, i) => (c ?? '').includes(`k${i}`));
  }, true, 10000);
  if (!done) throw new Error('precondition: the marked cells were not stored');
  return n;
}

/** Every cell index of an R × C table, with its row and column. */
const each = (rows, cols) => Array.from({ length: rows * cols }, (_, i) => ({ i, r: Math.floor(i / cols), c: i % cols }));

/** One table scenario: mark every cell, paste the shape at its cell, read, ⌘Z, read. */
async function runTableShape(s, shape) {
  const { page, state, id } = s;
  await watchPastes(page);
  const tableId = await blockOf(page, 'table');
  if (!tableId) throw new Error('precondition: the new poster has no table');
  await markCells(page, state, id, tableId);
  const before = storedTable(state, id, tableId);
  const drawnBefore = await drawnTable(page, tableId);
  if (before.rows !== 4 || before.cols !== 3) throw new Error(`precondition: the starting table is ${before.rows}x${before.cols}, not 4x3`);
  await putShape(page, shape);
  const cell = page.locator(`${CANVAS} [data-block-id="${tableId}"] td [contenteditable]`).nth(shape.cell);
  await clickToEnd(page, cell);
  await pasteHere(page, shape.payload);
  const carried = await pasteCarried(page, shape.payload, shape);
  const changed = await changedFrom(() => storedTable(state, id, tableId), before);
  const after = storedTable(state, id, tableId);
  const drawn = await drawnTable(page, tableId);
  const pwn = await page.evaluate(() => window.__zqPwn ?? null);

  const numbers = { before: `${before.rows}x${before.cols}`, after: `${after.rows}x${after.cols}`, drawn: drawn?.grid, stored: changed };
  if (carried.text) Object.assign(numbers, { clipText: carried.text, clipHtmlEnd: carried.htmlTail });
  const claims = {};
  const at = (t, r, c) => (r < t.rows && c < t.cols ? t.cells[r * t.cols + c] ?? '' : '');
  if (shape.kind === 'text') {
    const others = each(before.rows, before.cols).filter(({ i }) => i !== shape.cell && at(after, Math.floor(i / before.cols), i % before.cols) !== before.cells[i]).length;
    const want = before.cells[shape.cell] + shape.appended;
    const got = after.rows === before.rows && after.cols === before.cols ? after.cells[shape.cell] : null;
    // An engine's own copy writes a space beside a styled run as &nbsp;
    // (Chromium, WebKit; main the same, record 32 section 10): read as a space.
    const same = shape.loose ? (a, b) => (a ?? '').replace(/&nbsp;/g, ' ') === b.replace(/&nbsp;/g, ' ') : (a, b) => a === b;
    claims.T1 = after.rows !== before.rows || after.cols !== before.cols || others > 0 || !same(got, want);
    Object.assign(numbers, { otherCellsChanged: others, cell: JSON.stringify(got), want: JSON.stringify(want) });
  } else {
    const [r0, c0] = shape.at;
    const R = shape.expect.length;
    const C = Math.max(...shape.expect.map((row) => row.length));
    const wantRows = Math.max(before.rows, r0 + R);
    const wantCols = Math.max(before.cols, c0 + C);
    let misplaced = 0;
    const wrong = [];
    for (let i = 0; i < R; i += 1) {
      for (let j = 0; j < C; j += 1) {
        const want = shape.expect[i][j] ?? '';
        const got = at(after, r0 + i, c0 + j);
        if (got !== want) { misplaced += 1; if (wrong.length < 3) wrong.push(`${r0 + i},${c0 + j}: ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
      }
    }
    const allText = after.cells.map(textOf).join('\u0001');
    const markers = shape.expect.flat().flatMap((v) => textOf(v).match(/ZQ\w+/g) ?? []);
    const dropped = markers.filter((m) => !allText.includes(m)).length;
    const inArea = (r, c) => r >= r0 && r < r0 + R && c >= c0 && c < c0 + C;
    const outside = each(wantRows, wantCols).filter(({ r, c }) => !inArea(r, c) && at(after, r, c) !== at(before, r, c)).length;
    const drawnOff = drawn ? drawn.rows.flatMap((row, r) => row.filter((t, c) => t !== textOf(at(after, r, c)))).length : -1;
    claims.G1 = misplaced > 0 || dropped > 0;
    claims.G2 = outside > 0;
    claims.G3 = after.rows !== wantRows || after.cols !== wantCols;
    claims.GD = drawn?.grid !== `${after.rows}x${after.cols}` || drawnOff !== 0;
    Object.assign(numbers, { want: `${wantRows}x${wantCols}`, pastedCells: R * C, misplaced, dropped, outsideChanged: outside, drawnCellsOff: drawnOff });
    if (wrong.length) numbers.wrong = wrong.join(' | ');
  }
  if (shape.markup) {
    claims.X = pwn !== null || (drawn?.imgs ?? 0) > 0 || after.cells.some((c) => /<img/i.test(c));
    Object.assign(numbers, { scriptRan: pwn, imgsDrawn: drawn?.imgs ?? null });
  }
  // One ⌘Z, the caret where the paste left it.
  await page.keyboard.press(`${MOD}+z`);
  const undone = await becomes(() => storedTable(state, id, tableId), before);
  await sleep(400);
  const drawnUndo = await drawnTable(page, tableId);
  claims.G4 = !undone || JSON.stringify(drawnUndo?.rows) !== JSON.stringify(drawnBefore?.rows);
  Object.assign(numbers, { undoRestoredStore: undone, undoRestoredDrawn: JSON.stringify(drawnUndo?.rows) === JSON.stringify(drawnBefore?.rows), afterUndo: drawnUndo?.grid });
  return { claims, numbers, carried };
}

/** The drawn style of each marker against its editor's own (colour, background, font, size, weight). */
const drawnStyle = (page, blockId, markers) => page.evaluate(({ sel, markers }) => {
  const root = document.querySelector(`${sel} [contenteditable="true"]`);
  if (!root) return null;
  const base = getComputedStyle(root);
  const out = {};
  for (const m of markers) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let el = null;
    for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data.includes(m)) { el = n.parentElement; break; }
    if (!el) { out[m] = 'not drawn'; continue; }
    const cs = getComputedStyle(el);
    let bg = 'none';
    for (let a = el; a && a !== root; a = a.parentElement) {
      const b = getComputedStyle(a).backgroundColor;
      if (b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') { bg = b; break; }
    }
    const diffs = [];
    if (cs.color !== base.color) diffs.push(`color ${cs.color} vs ${base.color}`);
    if (bg !== 'none') diffs.push(`background ${bg}`);
    if (cs.fontFamily !== base.fontFamily) diffs.push(`font ${cs.fontFamily}`);
    if (cs.fontSize !== base.fontSize) diffs.push(`size ${cs.fontSize} vs ${base.fontSize}`);
    out[m] = { diffs, weight: cs.fontWeight, baseWeight: base.fontWeight };
  }
  return out;
}, { sel: `${CANVAS} [data-block-id="${blockId}"]`, markers });

/** One text scenario (rule 3): the caret at the end of a text block or the title, ⌘V, read, ⌘Z. */
async function runTextShape(s, shape) {
  const { page, state, id } = s;
  await watchPastes(page);
  const blockId = shape.target === 'title' ? await blockOf(page, 'title') : (await textBlockIds(page))[0];
  if (!blockId) throw new Error(`precondition: no ${shape.target} block`);
  await focusBlockEnd(page, blockId);
  const marker = 'ZQBEFORE';
  await page.keyboard.type(marker, { delay: 10 });
  if (!(await becomes(() => (storedContent(state, id, blockId) ?? '').includes(marker), true))) throw new Error('precondition: the typed word was not stored');
  const before = storedContent(state, id, blockId);
  await putShape(page, shape);
  await clickToEnd(page, page.locator(`${CANVAS} [data-block-id="${blockId}"] [contenteditable="true"]`).first());
  await pasteHere(page, shape.payload);
  const carried = await pasteCarried(page, shape.payload, shape);
  await changedFrom(() => storedContent(state, id, blockId), before);
  const after = storedContent(state, id, blockId) ?? '';
  const kept = shape.keep.filter((k) => !after.includes(k));
  const leaked = shape.drop.filter((d) => after.toLowerCase().includes(d.toLowerCase()));
  const style = shape.drawn.length ? await drawnStyle(page, blockId, shape.drawn) : {};
  const styleOff = Object.entries(style ?? {}).filter(([, v]) => v === 'not drawn' || v.diffs.length || (shape.weight && v.weight !== v.baseWeight))
    .map(([m, v]) => `${m}: ${v === 'not drawn' ? v : [...v.diffs, ...(shape.weight && v.weight !== v.baseWeight ? [`weight ${v.weight} vs ${v.baseWeight}`] : [])].join(', ')}`);
  // C5: a line break between two words the source shows on one line.
  let broken = null;
  if (shape.oneLine) {
    const [a, b] = shape.oneLine;
    const i = after.indexOf(a);
    const j = after.indexOf(b, i);
    broken = i < 0 || j < 0 ? 'a marker is missing' : /\n|<br/i.test(after.slice(i, j)) ? JSON.stringify(after.slice(i, j)) : null;
  }
  await page.keyboard.press(`${MOD}+z`);
  const undone = await becomes(() => storedContent(state, id, blockId), before);
  return {
    claims: { C1: leaked.length > 0, C2: kept.length > 0, C3: styleOff.length > 0, C4: !undone, ...(shape.oneLine ? { C5: broken !== null } : {}) },
    numbers: {
      ...(carried.text ? { clipText: carried.text, clipHtmlEnd: carried.htmlTail } : {}),
      ...(shape.oneLine ? { lineBreakStored: broken ?? 'none' } : {}),
      leaked: leaked.join(', ') || 'none', missing: kept.join(', ') || 'none', drawnOff: styleOff.join(' | ') || 'none',
      stored: JSON.stringify(after.slice(after.indexOf(marker) + marker.length, after.indexOf(marker) + marker.length + 220)),
      undoRestored: undone,
    },
    carried,
  };
}

/**
 * A copy inside the poster (rule 3, a guard on the whitespace rule): a line
 * typed with Shift+Enter (Chromium and Firefox store it as a newline, drawn
 * pre-wrap), a double space and a line typed with Enter that starts with two
 * spaces, selected in the first text block, ⌘C, then ⌘V at the end of the
 * second. C2 counts the line break and the double space; the Enter line's
 * leading spaces are read as information (main drops them too). Firefox's clipboard HTML for it is the bare
 * text, with no style saying its whitespace is meant (record 32 section 9:
 * the corrector's audit found the first correction of R1-F3 turned it into
 * "ZQIA ZQIB ZQIC" in Firefox; main kept it).
 */
async function runInnerCopy(s) {
  const { page, state, id } = s;
  await watchPastes(page);
  const [a, b] = await textBlockIds(page);
  if (!a || !b) throw new Error('precondition: two text blocks');
  await focusBlockEnd(page, a);
  await page.keyboard.type('ZQIA', { delay: 10 });
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('ZQIB  ZQIC', { delay: 10 });
  await page.keyboard.press('Enter');
  await page.keyboard.type('  ZQID', { delay: 10 });
  if (!(await becomes(() => (storedContent(state, id, a) ?? '').includes('ZQID'), true))) throw new Error('precondition: the typed lines were not stored');
  const source = storedContent(state, id, a);
  await page.evaluate(() => {
    const host = document.activeElement;
    const w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let start = null;
    let end = null;
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const i = n.data.indexOf('ZQIA');
      if (i >= 0 && !start) start = [n, i];
      const j = n.data.indexOf('ZQID');
      if (j >= 0) end = [n, j + 4];
    }
    const r = document.createRange();
    r.setStart(...start);
    r.setEnd(...end);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  await page.keyboard.press(`${MOD}+c`);
  await page.waitForTimeout(150);
  await clickToEnd(page, page.locator(`${CANVAS} [data-block-id="${b}"] [contenteditable="true"]`).first());
  const before = storedContent(state, id, b);
  await page.keyboard.press(`${MOD}+v`);
  await page.waitForTimeout(300);
  const last = await page.evaluate(() => window.__zqPastes?.at(-1) ?? null);
  const carried = { ok: !!last && last.trusted && last.text.includes('ZQIA') && last.html.includes('ZQIA'), why: `engine copy: trusted=${last?.trusted} html=${last?.html.includes('ZQIA')} text=${last?.text.includes('ZQIA')}`, text: JSON.stringify(last?.text) };
  await changedFrom(() => storedContent(state, id, b), before);
  const after = storedContent(state, id, b) ?? '';
  const pasted = after.slice((before ?? '').length);
  const missing = [
    ...(/ZQIA(?:\n|<br>)ZQIB/.test(pasted) ? [] : ['the line break']),
    ...(/ZQIB(?:  |&nbsp; | &nbsp;|&nbsp;&nbsp;)ZQIC/.test(pasted) ? [] : ['the double space']),
  ];
  // Information, not counted: the paste path drops the spaces that start a
  // line after a boundary (sanitizeHtml), on main too (record 32 section 10).
  const indentKept = /ZQIC(?:\n|<br>)(?:  |&nbsp; | &nbsp;|&nbsp;&nbsp;)ZQID/.test(pasted);
  await page.keyboard.press(`${MOD}+z`);
  const undone = await becomes(() => storedContent(state, id, b), before);
  return {
    claims: { C2: missing.length > 0, C4: !undone },
    numbers: { source: JSON.stringify(source), clipText: carried.text, pasted: JSON.stringify(pasted), missing: missing.join(', ') || 'none', enterLineIndentKept: indentKept, undoRestored: undone },
    carried,
  };
}

/**
 * Information (printed, not counted): a range of cells selected by dragging
 * (the cell the drag starts in loses the caret), then ⌘V with a grid on the
 * clipboard. Out of the fix's scope (record section 10): what the table and
 * the focus are before and after.
 */
async function runDragRange(s) {
  const { page, state, id } = s;
  await watchPastes(page);
  const tableId = await blockOf(page, 'table');
  await markCells(page, state, id, tableId);
  const before = storedTable(state, id, tableId);
  const payload = { 'text/plain': 'ZQd1\tZQd2\nZQd3\tZQd4\n' };
  if (PASTE_MODE !== 'event' && !(await copyToClipboard(page, payload))) throw new Error('the copy event did not run: nothing put on the clipboard');
  const cells = page.locator(`${CANVAS} [data-block-id="${tableId}"] td`);
  const a = await cells.nth(3).boundingBox();
  const b = await cells.nth(7).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const focus = await page.evaluate(() => {
    const a = document.activeElement;
    return a ? `${a.tagName.toLowerCase()}${a.isContentEditable ? ' (editable)' : ''}${a.closest('td') ? ' in a cell' : ''}` : 'none';
  });
  if (PASTE_MODE === 'event') await pasteHere(page, payload);
  else { await page.keyboard.press(`${MOD}+v`); await page.waitForTimeout(300); }
  const reached = await page.evaluate(() => window.__zqPastes?.length ?? 0);
  await changedFrom(() => storedTable(state, id, tableId), before, 3000);
  const after = storedTable(state, id, tableId);
  const changed = after.rows === before.rows && after.cols === before.cols
    ? after.cells.map((c, i) => (c !== before.cells[i] ? i : -1)).filter((i) => i >= 0).join(',') || 'none'
    : 'the table was replaced';
  return {
    claims: {},
    numbers: { focusAfterDrag: focus, pasteEvents: reached, before: `${before.rows}x${before.cols}`, after: `${after.rows}x${after.cols}`, cellsChanged: changed, rangeCells: '3,4,6,7' },
    carried: { ok: true, why: 'not checked (information)' },
  };
}

export const SCENARIOS = [
  ...TABLE_SHAPES.map((shape) => ({ id: `T-${shape.id}`, how: shape.how, run: (h, s) => runTableShape(s, shape) })),
  ...TEXT_SHAPES.map((shape) => ({ id: `F-${shape.id}`, how: shape.how, run: (h, s) => runTextShape(s, shape) })),
  { id: 'F-text-inner-copy', how: 'a line typed with Shift+Enter, a double space and an Enter line starting with two spaces, copied from one text block and pasted into another with the engine\'s own ⌘C / ⌘V: the line break and the double space kept (a guard on the whitespace rule); the indent read, not counted', run: (h, s) => runInnerCopy(s) },
  { id: 'I-drag-range', info: true, how: 'cells 4 to 8 (rows 2 and 3, columns 1 and 2) selected by dragging from cell 4, then ⌘V of a 2 by 2 grid: the focus after the drag, whether a paste event reached the page, the cells it changed', run: (h, s) => runDragRange(s) },
];
