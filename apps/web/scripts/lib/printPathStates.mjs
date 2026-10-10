/**
 * Editor states the posters of scripts/print-path-check.mjs do not reach on
 * their own, folded in from record 30's review round 2 (its probes r2hover
 * and r2ime): printing with the pointer resting on a selected table, and
 * ⌘P / Ctrl+P pressed inside an input method's composition.
 *
 * TABLE (R2-F1). A user clicks into a cell in the last column of a table,
 * types, and presses ⌘P without moving the mouse: the table's hover-only
 * "+" bar along its right edge is on screen, and so is a row strip's tint
 * when the pointer rests on the strip. Variants:
 *   cell   the pointer left on the cell (the "Add column" bar shows)
 *   strip  the pointer moved onto the row strip of the cell's row (tinted)
 *   off    the pointer moved off the sheet first: the control
 * Read: the table's controls (buttons, role="button" strips, titled grips)
 * in the editor just before the key and in the print document laid out in
 * print media, and which of them paint (a background with alpha and an
 * opacity above 0, a box); Chromium: the PDF's fills in the poster's accent
 * colour on or beside the table, against the control's.
 *
 * COMPOSING (R2-F3, Chromium only: DevTools' Input.imeSetComposition opens
 * the composition). ⌘P / Ctrl+P inside a composition in a text block: its
 * keydown at the window, after every handler (isComposing, defaultPrevented),
 * and whether a print window opened; then the composition committed and the
 * key pressed again, which must print (the control).
 */

/**
 * A table block's own controls (runs in the page): each button, role="button"
 * element and titled element inside the block (a cell's own text is none of
 * these), with whether it paints in the current media. The block's selection
 * controls (its handle row, resize handles: fix 13c strips them from the
 * copy, SEL checks that) are not the table's and are left out.
 */
export function tableControls(sel) {
  const blk = document.querySelector(sel);
  if (!blk) return null;
  const alpha = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return c && c !== 'transparent' ? 1 : 0;
    const parts = m[1].split(/[,\s/]+/).filter(Boolean);
    return parts.length > 3 ? Number(parts[3]) : 1;
  };
  const out = [];
  for (const el of blk.querySelectorAll('button, [role="button"], [title]')) {
    if (el.closest('[data-postr-selection-ui], [data-postr-resize-handle]')) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const label = el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30) || el.tagName.toLowerCase();
    const paints = cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0 && alpha(cs.backgroundColor) > 0 && r.width > 0 && r.height > 0;
    out.push({ label: label.replace(/\d+/g, 'N'), paints, bg: paints ? cs.backgroundColor : undefined });
  }
  return { count: out.length, painting: out.filter((c) => c.paints).map((c) => `${c.label} (${c.bg})`), kinds: [...new Set(out.map((c) => c.label))] };
}

/**
 * Put the editor in a TABLE variant's state: the table `tableId` selected,
 * the caret at the end of the cell in its second row and last column, a few
 * characters typed, the pointer where the variant leaves it. Returns what
 * the editor shows of the table's controls just before the key.
 */
export async function tableState(page, { tableId, variant, sleep, clickAway }) {
  await clickAway(page);
  await page.keyboard.press('Escape');
  await sleep(200);
  const blockSel = `#poster-canvas [data-block-id="${tableId}"]`;
  const cols = await page.evaluate((s) => document.querySelector(`${s} tr`).children.length, blockSel);
  const cell = page.locator(`${blockSel} td [contenteditable]`).nth(cols + cols - 1);
  await cell.click();
  await sleep(300);
  await cell.click();
  await sleep(200);
  const b = await cell.boundingBox();
  await page.mouse.move(b.x + b.width / 2 + 3, b.y + b.height / 2 + 1, { steps: 2 });
  await page.keyboard.press('End');
  await page.keyboard.type(' (n=12)', { delay: 10 });
  await sleep(300);
  if (variant === 'strip') {
    const sb = await page.locator(`${blockSel} [role="button"][aria-label="Select row 2"]`).first().boundingBox();
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 4 });
    await sleep(200);
  } else if (variant === 'off') {
    const at = await page.evaluate(() => {
      const outer = document.querySelector('[data-postr-canvas-outer]').getBoundingClientRect();
      const s = document.getElementById('poster-canvas').getBoundingClientRect();
      return { x: (outer.left + s.left) / 2, y: outer.top + 40 };
    });
    await page.mouse.move(at.x, at.y, { steps: 4 });
    await sleep(200);
  }
  return page.evaluate(tableControls, blockSel);
}

/** What the editor must show before the key, per variant (control K-hover). */
export function tableStateHeld(variant, shown) {
  if (!shown) return false;
  const p = shown.painting.join(' | ');
  if (variant === 'cell') return /Add column/.test(p);
  if (variant === 'strip') return /Select row/.test(p);
  return shown.painting.length === 0;
}

/**
 * The PDF's fills in `colour` (hex) whose box meets `box` (inches, the
 * table's) grown by `margin` inches: [left, top, width, height] each, in
 * inches from the page's top-left, rounded to 0.01 in.
 */
export async function fillsNear(bytes, { colour, box, margin = 1 }, { pdfjs }) {
  const pj = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, isEvalSupported: false }).promise;
  const pg = await pj.getPage(1);
  const ph = pg.view[3];
  const ops = await pg.getOperatorList();
  const O = pdfjs.OPS;
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const hex = (n) => Math.round(n).toString(16).padStart(2, '0');
  const asHex = (a) => (typeof a?.[0] === 'string' ? a[0].toLowerCase() : a?.length === 3 ? `#${Array.from(a, (v) => hex(v)).join('')}` : null);
  const FILLS = new Set([O.fill, O.eoFill, O.fillStroke, O.eoFillStroke, O.closeFillStroke, O.closeEOFillStroke]);
  const r2 = (v) => Math.round(v * 100) / 100;
  let ctm = [1, 0, 0, 1, 0, 0];
  let fill = '#000000';
  let last = null;
  const stack = [];
  const out = [];
  ops.fnArray.forEach((fn, i) => {
    const a = ops.argsArray[i];
    if (fn === O.save) stack.push([ctm, fill]);
    else if (fn === O.restore) [ctm, fill] = stack.pop() ?? [ctm, fill];
    else if (fn === O.transform) ctm = mul(ctm, a);
    else if (fn === O.setFillRGBColor) fill = asHex(a) ?? fill;
    else if (fn === O.constructPath) {
      const mm = a[2];
      if (mm && mm.length === 4 && Number.isFinite(mm[0])) {
        const pts = [[mm[0], mm[1]], [mm[2], mm[3]]].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
        last = [Math.min(pts[0][0], pts[1][0]) / 72, (ph - Math.max(pts[0][1], pts[1][1])) / 72, Math.abs(pts[1][0] - pts[0][0]) / 72, Math.abs(pts[1][1] - pts[0][1]) / 72];
      } else last = null;
    } else if (FILLS.has(fn) && last && fill === colour) {
      const [x, y, w, hh] = last;
      if (x < box[0] + box[2] + margin && x + w > box[0] - margin && y < box[1] + box[3] + margin && y + hh > box[1] - margin) out.push([x, y, w, hh].map(r2));
    }
  });
  await pj.destroy();
  return out;
}

/**
 * TABLE: the three variants on the poster `P` (the editor `ed`), the control
 * first. Typed into a cell in the last column of the longest table, then
 * ⌘P / Ctrl+P (`chord`); the print document read with print-path-check's
 * `readPrint` against the editor as it is then (`readSheet`, `compareSheets`
 * at `tol` = [box, line]). Claims and control failures go to `see` and
 * `controlFails`; Chromium's PDFs to `savePdf(name, bytes)`. Returns each
 * variant's readings.
 */
export async function tableStates({ page, P, ed, engine, sleep, clickAway, chord, readPrint, readSheet, compareSheets, tol, see, controlFails, pdfjs, savePdf }) {
  const tableId = await page.evaluate(() => [...document.querySelectorAll('#poster-canvas [data-block-type="table"]')]
    .sort((a, b) => b.querySelectorAll('td').length - a.querySelectorAll('td').length)[0]?.getAttribute('data-block-id'));
  const accent = String(ed.state.row?.data?.palette?.accent ?? '').toLowerCase();
  const out = {};
  let controlFills = null;
  for (const variant of ['off', 'cell', 'strip']) {
    const label = `key+table-${variant}`;
    const shown = await tableState(page, { tableId, variant, sleep, clickAway });
    const t = { shown };
    out[label] = t;
    if (!tableStateHeld(variant, shown)) { controlFails.push(`K-hover ${P.id} ${label}: the editor shows ${JSON.stringify(shown?.painting)}`); continue; }
    const popupP = page.waitForEvent('popup', { timeout: 4000 }).catch(() => null);
    await page.keyboard.press(chord);
    const popup = await popupP;
    if (!popup) { see('KEY', `${P.id} ${label}: no print window`); continue; }
    await popup.waitForSelector('#poster-print-root', { timeout: 15000 });
    const now = await page.evaluate(readSheet, { sheetSel: '#poster-canvas', posterW: P.size.w });
    const pr = await readPrint(popup, P.size.w, P.size.h, `${P.id} ${label}`);
    const c = compareSheets(now, pr.sheet, tol[0], tol[1]);
    t.print = await popup.evaluate(tableControls, `#poster-print-root [data-block-id="${tableId}"]`);
    Object.assign(t, { worstBox: c.worstBox, worstLine: c.worstLine, wraps: c.wraps.length });
    if (c.boxes.length) see('POS', `${P.id} ${label}: ${c.boxes.length} blocks off, worst ${c.worstBox} in`);
    if (c.wraps.length) see('WRAP', `${P.id} ${label}: ${c.wraps.length} blocks broken differently`);
    if (t.print?.painting.length) see('TABLEUI', `${P.id} ${label}: the print document carries ${t.print.painting.join(', ')}`);
    if (engine === 'chromium') {
      const bytes = await popup.pdf({ preferCSSPageSize: true, printBackground: false });
      savePdf(`${P.id}-${label}.pdf`, bytes);
      const box = pr.sheet.blocks.find((b) => b.id === tableId)?.box;
      t.pdfFills = await fillsNear(bytes, { colour: accent, box }, { pdfjs });
      if (variant === 'off') controlFills = new Set(t.pdfFills.map((f) => f.join(',')));
      else {
        const extra = t.pdfFills.filter((f) => !controlFills?.has(f.join(',')));
        t.pdfExtra = extra;
        if (extra.length) see('TABLEUI', `${P.id} ${label} pdf: ${extra.length} fill(s) in the accent ${accent} on or beside the table that the control lacks (${extra.slice(0, 2).map((f) => `[${f.join(', ')}] in`).join(', ')})`);
      }
    }
    await popup.close().catch(() => {});
  }
  return out;
}

/**
 * COMPOSING: ⌘P / Ctrl+P inside a composition opened in the text block
 * `textSel` (Chromium: DevTools' Input.imeSetComposition), then again after
 * the composition is committed. Returns the keydowns seen at the window
 * after every handler, and whether each press opened a print window.
 */
export async function keyComposing(page, { textSel, chord, sleep }) {
  await page.evaluate(() => {
    window.__zqCompose = [];
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'p') window.__zqCompose.push({ composing: e.isComposing, prevented: e.defaultPrevented });
    });
  });
  const text = page.locator(textSel).first();
  await text.click();
  await page.keyboard.press('End');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 });
  await sleep(200);
  const duringP = page.waitForEvent('popup', { timeout: 2500 }).catch(() => null);
  await page.keyboard.press(chord);
  const during = await duringP;
  await during?.close().catch(() => {});
  await cdp.send('Input.insertText', { text: 'にほ' });
  await sleep(300);
  const afterP = page.waitForEvent('popup', { timeout: 4000 }).catch(() => null);
  await page.keyboard.press(chord);
  const after = await afterP;
  await after?.close().catch(() => {});
  await cdp.detach().catch(() => {});
  const keys = await page.evaluate(() => window.__zqCompose);
  return { keys, openedDuring: !!during, openedAfter: !!after };
}
