/**
 * Paste scenarios for scripts/canvas-paste-check.mjs (record
 * docs/fixes/34-paste-drop.md; bounded-designs §3.3 table A row 3, table B
 * orders 2 to 5): a signed-in term holder (or a guest) at /p/new, the
 * shape put on the clipboard by a real ⌘C (lib/tablePasteScenarios.mjs's
 * copy source) or by the async clipboard inside a real click
 * (lib/canvasPasteKit.mjs), the focus set by the mouse, a real ⌘V, ⌘Z.
 * What is read: the poster and the uploads the fake backend stored, and
 * what the canvas draws. Nothing calls the app's store.
 *
 * Every scenario first types a word into the title (the doc is stored only
 * once it is edited: /p/new keeps its layout in memory until then), so
 * "before" is the stored poster.
 */
import { MOD, blockOf, clickAway, focusBlockEnd, openTab } from './undoKit.mjs';
import { newGuestPage, newState, openNewPoster } from './guestBackend.mjs';
import { copyToClipboard } from './tablePasteScenarios.mjs';
import { TABLE_SHAPES, TEXT_SHAPES } from './tablePasteShapes.mjs';
import { pinchTo } from './selectionControls.mjs';
import {
  IMAGES, PDF_FILE, addedBlocks, allowClipboard, bigPng, catchAlerts, dispatchPaste, drawnBlock, emptySheetPoint, eventCount, eventsSince,
  fileOf, handOver, imageMode, inside, onSheet, othersChanged, settledChange, sheetUnits, storedBlocks, storedEquals, until, uploadsOf,
  keyedName, waitPaint, watchEvents, writeClipboardItem, writeImageToClipboard,
} from './canvasPasteKit.mjs';
import { rowOf } from './keepWorkKit.mjs';

const CANVAS = '#poster-canvas';
/** Insert › Image's default box, in units (PosterEditor.tsx addBlock: 155 × 140). */
export const IMAGE_BOX = { w: 155, h: 140 };
/** Insert › Table's and Insert › Text's default size (the same addBlock). */
export const BLOCK_DEFAULT = { w: 155, h: 140 };

/** Type a word into the title so the poster is stored, then leave the text (the user's step 2). */
export async function storeFirst(s) {
  const title = await blockOf(s.page, 'title');
  await focusBlockEnd(s.page, title);
  await s.page.keyboard.type('ZQSTART', { delay: 10 });
  const ok = await until(() => JSON.stringify(rowOf(s.state, s.id)?.data?.blocks ?? []).includes('ZQSTART'), 10000);
  if (!ok) throw new Error('precondition: the typed title was not stored');
  await s.page.waitForTimeout(600);
  await clickAway(s.page);
}

/**
 * Put a shape on the clipboard: strings alone by the copy source's ⌘C, an
 * image by the async clipboard (or kept for a page-made paste); an image
 * WITH strings (a browser's "Copy image" with its fragment and address,
 * record 34's review R34-2) as one item of several types by the async
 * clipboard.
 */
export async function putOnClipboard(h, s, shape) {
  if (shape.file) handOver(s, [shape.file]);
  if (shape.strings && !shape.file) {
    if (!(await copyToClipboard(s.page, shape.strings))) throw new Error('the copy event did not run: nothing put on the clipboard');
    return { mode: 'clipboard' };
  }
  const mode = shape.forceEvent ? 'event' : imageMode(h);
  if (mode === 'event') return { mode };
  const wrote = shape.strings
    ? await writeClipboardItem(s.page, { ...shape.strings, [shape.file.type]: shape.file.bytes })
    : await writeImageToClipboard(s.page, shape.file);
  if (wrote !== 'ok') throw new Error(`the clipboard write failed: ${wrote}`);
  return { mode };
}

/** ⌘V where the focus is, or the page-made paste of the event mode; then `wait` ms. */
export async function pasteNow(s, shape, mode, wait = 300) {
  if (mode === 'event') await dispatchPaste(s.page, { files: shape.file ? [shape.file] : [], strings: shape.strings ?? {} });
  else await s.page.keyboard.press(`${MOD}+v`);
  if (wait) await s.page.waitForTimeout(wait);
}

/** Did the paste that reached the page carry the shape (control K1)? */
export async function carried(s, from, shape, mode) {
  const ev = (await eventsSince(s.page, 'paste', from)).at(-1);
  if (!ev) return { ok: false, why: 'no paste event reached the page' };
  const trustedOk = mode === 'event' || ev.trusted;
  const fileOk = !shape.file || ev.files.some((f) => /^image\/|^application\/pdf/.test(f) && !/no file/.test(f));
  const textOk = !shape.strings?.['text/plain'] || ev.text.length > 0;
  const htmlOk = !shape.strings?.['text/html'] || ev.types.includes('text/html');
  return { ok: trustedOk && fileOk && textOk && htmlOk, why: `${mode}: trusted=${ev.trusted} types=${ev.types.join(',')} files=${ev.files.join(',') || 'none'} text=${JSON.stringify(ev.text.slice(0, 20))} active=${ev.active}` };
}

/**
 * Select block `blockId` without entering it: a small rubber band dragged
 * from the empty sheet just left of the block into its left part (a click
 * on an empty image block opens its file chooser).
 */
export async function selectByBand(page, blockId) {
  const pts = await page.evaluate((bid) => {
    const el = document.querySelector(`#poster-canvas [data-block-id="${bid}"]`);
    const r = el.getBoundingClientRect();
    for (const dy of [0.3, 0.5, 0.7, 0.2, 0.8]) {
      const start = { x: r.left - 4, y: r.top + r.height * dy };
      const hit = document.elementFromPoint(start.x, start.y);
      if (hit && hit.closest('[data-postr-canvas-outer]') && !hit.closest('[data-block-id]') && !hit.closest('button')) {
        return { start, end: { x: r.left + Math.min(30, r.width * 0.2), y: start.y + 12 } };
      }
    }
    return null;
  }, blockId);
  if (!pts) throw new Error('no empty point beside the block to start a rubber band');
  await page.mouse.move(pts.start.x, pts.start.y);
  await page.mouse.down();
  await page.mouse.move(pts.end.x, pts.end.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const sel = await page.evaluate(() => [...document.querySelectorAll('#poster-canvas [data-postr-selected="true"]')].map((e) => e.getAttribute('data-block-id')));
  if (sel.length !== 1 || sel[0] !== blockId) throw new Error(`the rubber band selected ${JSON.stringify(sel)}, not ${blockId}`);
  const active = await page.evaluate(() => document.activeElement?.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? ''));
  if (active) throw new Error('the rubber band left a field in edit mode');
}

/** Fill an empty image block with `file` through its own "+ Upload figure" and the file chooser (today's upload path, for a setup). */
export async function fillViaChooser(s, blockId, file) {
  const before = storedBlocks(s.state, s.id);
  handOver(s, [file]);
  const btn = s.page.locator(`${CANVAS} [data-block-id="${blockId}"] button`, { hasText: '+ Upload figure' }).first();
  const [chooser] = await Promise.all([s.page.waitForEvent('filechooser', { timeout: 8000 }), btn.click()]);
  await chooser.setFiles({ name: file.name, mimeType: file.type, buffer: file.bytes });
  const ok = await until(() => (storedBlocks(s.state, s.id).find((b) => b.id === blockId)?.imageSrc ?? '').startsWith('storage://'), 12000);
  if (!ok) throw new Error('precondition: the chooser upload was not stored');
  await settledChange(s.state, s.id, before, { quiet: 1200 });
  await clickAway(s.page);
}

/** The judgement of one new block against the rule: problems found (empty when it holds). */
function judgeNew(blk, want, ctx) {
  const p = [];
  if (blk.type !== want.type) p.push(`type ${blk.type}, want ${want.type}`);
  if (want.type === 'image' && want.image) {
    const aspect = want.image.w / want.image.h;
    const boxAspect = IMAGE_BOX.w / IMAGE_BOX.h;
    const wantW = aspect >= boxAspect ? IMAGE_BOX.w : Math.round(IMAGE_BOX.h * aspect);
    if (Math.abs(blk.w / blk.h - aspect) > 0.03) p.push(`shape ${(blk.w / blk.h).toFixed(3)}, the image's ${aspect.toFixed(3)}`);
    if (Math.abs(blk.w - wantW) > 1 || blk.h > IMAGE_BOX.h + 2) p.push(`size ${blk.w} × ${blk.h}, want the image's shape in ${IMAGE_BOX.w} × ${IMAGE_BOX.h} (w ${wantW})`);
    if (!new RegExp(`^storage://${ctx.uid}/${ctx.posterId}/${keyedName(blk.id, 'png')}$`).test(blk.imageSrc ?? '')) p.push(`imageSrc ${String(blk.imageSrc).slice(0, 80)}`);
  }
  if (want.type === 'table') {
    const t = blk.tableData;
    const rows = want.grid.length;
    const cols = Math.max(...want.grid.map((r) => r.length));
    if (!t || t.rows !== rows || t.cols !== cols) p.push(`grid ${t?.rows}x${t?.cols}, want ${rows}x${cols}`);
    else {
      const wrong = want.grid.flat().map((v, i) => [v, t.cells[i]]).filter(([v, c]) => (c ?? '') !== v);
      if (wrong.length) p.push(`${wrong.length} cells unlike the reader's: ${wrong.slice(0, 2).map(([v, c]) => `${JSON.stringify(c)} want ${JSON.stringify(v)}`).join(' | ')}`);
    }
  }
  if (want.type === 'text') {
    if (blk.tableData) p.push('a table');
    if (want.content !== undefined && blk.content !== want.content) p.push(`content ${JSON.stringify(blk.content).slice(0, 120)}, want ${JSON.stringify(want.content).slice(0, 120)}`);
    for (const m of want.markers ?? []) if (!(blk.content ?? '').includes(m)) p.push(`missing ${m}`);
    for (const d of want.drop ?? []) if ((blk.content ?? '').toLowerCase().includes(d.toLowerCase())) p.push(`kept ${d}`);
  }
  if ((want.type === 'table' || want.type === 'text') && (blk.w !== BLOCK_DEFAULT.w)) p.push(`width ${blk.w}, want Insert's ${BLOCK_DEFAULT.w}`);
  if (!onSheet(blk, ctx.sheet)) p.push(`off the sheet: x ${blk.x} y ${blk.y} w ${blk.w} h ${blk.h} on ${ctx.sheet.w} × ${ctx.sheet.h}`);
  return p;
}

/**
 * Read and judge a paste or drop that should create blocks: `want` lists
 * each block (type, image, grid, content), `place(blk, i)` returns
 * placement problems. Then one ⌘Z and the poster as before.
 */
export async function judgeCreate(s, before, want, { since, place = () => [], deselect = false, inspect = null } = {}) {
  const changed = await settledChange(s.state, s.id, before, { timeout: 14000 });
  const after = storedBlocks(s.state, s.id);
  const added = addedBlocks(before, after);
  const ctx = { uid: s.uid, posterId: s.id, sheet: sheetUnits(s.state, s.id) };
  const problems = [];
  if (added.length !== want.length) problems.push(`${added.length} blocks added, want ${want.length}`);
  const order = added; // in the order the doc holds them
  const perBlock = [];
  for (let i = 0; i < Math.min(order.length, want.length); i += 1) {
    const blk = order[i];
    const w = want[i];
    const pb = [...judgeNew(blk, w, ctx), ...place(blk, i, after)];
    const d = await drawnBlock(s.page, blk.id);
    if (!d) pb.push('not drawn');
    let paint = null;
    let ups = null;
    if (w.type === 'image') {
      ups = uploadsOf(s.state, blk.id, since);
      if (ups.length !== 1) pb.push(`${ups.length} uploads keyed by it`);
      else if (!ups[0].path.startsWith(`${s.uid}/`)) pb.push(`uploaded to ${ups[0].path}`);
      if (w.covered) {
        // Covered by the next block (several dropped, 1 in apart): its image loaded at the file's size instead.
        const ok = await (async () => {
          for (let k = 0; k < 40; k += 1) {
            const im = (await drawnBlock(s.page, blk.id))?.img;
            if (im?.loaded && im.nw === w.image.w && im.nh === w.image.h) return true;
            await new Promise((r) => setTimeout(r, 200));
          }
          return false;
        })();
        if (!ok) pb.push('its image did not load at the file\'s size');
      } else {
        paint = await waitPaint(s.page, blk.id, w.image.rgb);
        if (paint === null || paint < 0.5) pb.push(`its image covers ${paint} of its box`);
      }
    }
    if (d && !inside(d.box, d.view) && w.inView !== false) pb.push('not wholly in the canvas\'s view');
    const seen = inspect ? await inspect(blk) : null;
    const img = w.type === 'image' ? (await drawnBlock(s.page, blk.id))?.img ?? null : null;
    perBlock.push({ id: blk.id, type: blk.type, x: round(blk.x), y: round(blk.y), w: round(blk.w), h: round(blk.h), paint, uploads: ups?.length ?? null, ...(ups?.length ? { bytes: ups[0].size, ...(ups[0].fromHarness ? { bytesFromHarness: true } : {}) } : {}), ...(img ? { img: `${img.src} ${img.nw}x${img.nh}` } : {}), ...(seen ? { seen } : {}), problems: pb });
    problems.push(...pb.map((x) => `block ${i + 1}: ${x}`));
  }
  const others = othersChanged(before, after, added.map((b) => b.id));
  // U says something only about a paste or drop that made a block: with
  // nothing made, a ⌘Z would undo the user's last edit (null: not counted).
  const made = added.length > 0;
  if (!made) {
    return {
      claims: { MADE: true, N: others.length > 0, U: null },
      numbers: { stored: changed, added: 0, othersChanged: others.join(',') || 'none', problems: problems.join(' ; ') || 'none' },
    };
  }
  if (deselect) await clickAway(s.page);
  // One ⌘Z, from where the paste or drop left the focus.
  await s.page.keyboard.press(`${MOD}+z`);
  const undone = await storedEquals(s.state, s.id, before, 10000);
  const stillDrawn = await s.page.evaluate((ids) => ids.filter((i) => document.querySelector(`#poster-canvas [data-block-id="${i}"]`)).length, added.map((b) => b.id));
  return {
    claims: { MADE: problems.length > 0, N: others.length > 0, U: !undone || stillDrawn > 0 },
    numbers: { stored: changed, added: added.length, blocks: perBlock, othersChanged: others.join(',') || 'none', undoRestored: undone, drawnAfterUndo: stillDrawn, problems: problems.join(' ; ') || 'none' },
  };
}

const round = (v) => Math.round(v * 100) / 100;

/** A fresh signed-in session with the clipboard allowed and the events watched; `guest` for an anonymous one at /p/new. */
export async function openSession(h, openSignedIn, { guest = false } = {}) {
  let s;
  if (guest) {
    const state = newState({ anonymous: true });
    const { context, page } = await newGuestPage(h, state);
    const id = await openNewPoster(page, h.base);
    s = { state, context, page, id };
  } else {
    s = await openSignedIn(h);
  }
  await allowClipboard(h, s.context);
  await watchEvents(s.page);
  catchAlerts(s);
  s.uid = s.state.rows.find((r) => r.id === s.id)?.user_id ?? null;
  return s;
}

/** Placement for a paste with nothing in edit mode: on the sheet (judged) and in the view (judged); its centre's distance from the visible sheet's centre, information. */
async function centreOffset(s, blk) {
  const d = await drawnBlock(s.page, blk.id);
  if (!d) return null;
  const vx0 = Math.max(d.view.x, d.sheet.x); const vy0 = Math.max(d.view.y, d.sheet.y);
  const vx1 = Math.min(d.view.x + d.view.w, d.sheet.x + d.sheet.w); const vy1 = Math.min(d.view.y + d.view.h, d.sheet.y + d.sheet.h);
  const cx = ((vx0 + vx1) / 2 - d.sheet.x) / d.zoom; const cy = ((vy0 + vy1) / 2 - d.sheet.y) / d.zoom;
  return { dxIn: round((blk.x + blk.w / 2 - cx) / 10), dyIn: round((blk.y + blk.h / 2 - cy) / 10), zoom: round(d.zoom) };
}

/**
 * A paste with nothing in edit mode (table B) or with the caret in a text
 * (table A row 3): the shape, where the focus is put (`focus`), what should
 * be made (`want`), and its placement rule (`place`).
 */
async function runPaste(h, s, sc) {
  await storeFirst(s);
  if (sc.zoom) await sc.zoom(s);
  const shape = sc.shape;
  const { mode } = await putOnClipboard(h, s, shape);
  let ref = null;
  if (sc.reference) ref = await sc.reference(s, mode);
  const ctx = (await sc.focus?.(s)) ?? {};
  const before = storedBlocks(s.state, s.id);
  const since = Date.now();
  const from = await eventCount(s.page);
  const alertsFrom = s.alerts.length;
  if (sc.uploadDelayMs) s.state.faults.uploadDelayMs = sc.uploadDelayMs;
  const drawnIds = await s.page.evaluate(() => [...document.querySelectorAll('#poster-canvas [data-block-id]')].map((e) => e.getAttribute('data-block-id')));
  const want = typeof sc.want === 'function' ? sc.want({ ref, ctx }) : sc.want;
  // The fake storage's copy of the file being pasted is the one handed last (a setup may have handed another).
  if (shape.file) handOver(s, [shape.file]);
  const t0 = Date.now();
  await pasteNow(s, shape, mode, 0);
  // Information: how long after the ⌘V the first new block is drawn (an
  // image block waits for its upload), polled every 50 ms.
  const msToBlock = want.length ? await (async () => {
    for (let k = 0; k < 300; k += 1) {
      const fresh = await s.page.evaluate((ids) => [...document.querySelectorAll('#poster-canvas [data-block-id]')].some((e) => !ids.includes(e.getAttribute('data-block-id'))), drawnIds);
      if (fresh) return Date.now() - t0;
      await s.page.waitForTimeout(50);
    }
    return null;
  })() : null;
  await s.page.waitForTimeout(300);
  const k1 = await carried(s, from, shape, mode);
  if (!want.length) {
    // Nothing to make: the poster stays as it was, no upload, and (for an image) the rule's message when it names one.
    await s.page.waitForTimeout(2500);
    const after = storedBlocks(s.state, s.id);
    const added = addedBlocks(before, after);
    const others = othersChanged(before, after, []);
    const ups = s.state.uploads.filter((u) => u.t >= since).length;
    const alerts = s.alerts.slice(alertsFrom).map((a) => a.message);
    const claims = { [sc.claim]: added.length > 0 || others.length > 0 || ups > 0 };
    if (sc.message) claims.MSG = !alerts.some((m) => sc.message.test(m));
    if (sc.fieldGot) claims.FIELD = !(await sc.fieldGot(s));
    return { claims, numbers: { added: added.length, othersChanged: others.join(',') || 'none', uploads: ups, alerts: alerts.join(' | ').slice(0, 160) || 'none', mode }, carried: k1 };
  }
  const placeFn = (blk, i, after) => (sc.place ? sc.place(blk, i, { ...ctx, after, s }) : []);
  const inspect = sc.place === centred ? (blk) => centreOffset(s, blk) : null;
  const r = await judgeCreate(s, before, want, { since, place: placeFn, inspect });
  const claims = { [sc.claim]: r.claims.MADE, N: r.claims.N, U: r.claims.U };
  const extra = {};
  if (sc.textUnchanged) {
    const now = storedBlocks(s.state, s.id).find((b) => b.id === ctx.textId)?.content;
    extra.textAfterUndo = JSON.stringify(now ?? null).slice(0, 60);
  }
  return { claims, numbers: { mode, msToBlock, ...r.numbers, ...extra, ...(ref !== null ? { reference: JSON.stringify(ref).slice(0, 120) } : {}) }, carried: k1 };
}

// --------------------------------------------------------------- shapes

const shapeOf = (id) => TABLE_SHAPES.find((x) => x.id === id) ?? TEXT_SHAPES.find((x) => x.id === id);
const EXCEL = shapeOf('excel-html');
const WORD = shapeOf('word-html');
const COLOUR = shapeOf('text-colour');
const TSV_TEXT = 'ZQt1\tZQt2\nZQt3\tZQt4';

/** Paste the clipboard into the empty text block `id` (record 32's text paste), read what it stores, ⌘Z: the reference a new text block must hold. */
export async function textPasteReference(s, blockId) {
  const before = storedBlocks(s.state, s.id);
  await focusBlockEnd(s.page, blockId);
  await s.page.keyboard.press(`${MOD}+v`);
  const ok = await until(() => (storedBlocks(s.state, s.id).find((b) => b.id === blockId)?.content ?? '') !== '', 8000);
  if (!ok) throw new Error('precondition: the reference paste into a text block stored nothing');
  await s.page.waitForTimeout(700);
  const ref = storedBlocks(s.state, s.id).find((b) => b.id === blockId).content;
  await s.page.keyboard.press(`${MOD}+z`);
  if (!(await storedEquals(s.state, s.id, before, 8000))) throw new Error('precondition: the reference paste was not undone');
  await clickAway(s.page);
  return ref;
}

/** The text blocks of the starting layout, by column (left to right, top to bottom). */
export async function textBlocksByPlace(s) {
  return storedBlocks(s.state, s.id).filter((b) => b.type === 'text').sort((a, b) => a.x - b.x || a.y - b.y);
}

/**
 * A text block's drawn box in units, read on screen: its box against the
 * sheet's, over the zoom (the sheet's width on screen over its width in
 * units). Its stored height is not what the canvas draws: text blocks grow
 * with their text.
 */
const drawnUnits = (page, blockId) => page.evaluate((bid) => {
  const el = document.querySelector(`#poster-canvas [data-block-id="${bid}"]`);
  const sheet = document.getElementById('poster-canvas');
  if (!el || !sheet) return null;
  const r = el.getBoundingClientRect();
  const s = sheet.getBoundingClientRect();
  const z = s.width / sheet.offsetWidth;
  return { top: (r.top - s.top) / z, left: (r.left - s.left) / z, w: r.width / z, h: r.height / z };
}, blockId);

/** Nothing in edit mode and nothing selected: a click on the empty workspace. */
export const nothingSelected = async (s) => { await clickAway(s.page); return {}; };

/** The same where no workspace shows around the sheet (zoomed in): a click on an empty point of the sheet in view. */
const emptySheetClicked = async (s) => {
  const pt = await emptySheetPoint(s.page, 0.5, 0.5);
  if (!pt) throw new Error('no empty point of the sheet in view');
  await s.page.mouse.click(pt.x, pt.y);
  await s.page.waitForTimeout(300);
  const editing = await s.page.evaluate(() => document.activeElement?.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? ''));
  const selected = await s.page.evaluate(() => document.querySelectorAll('#poster-canvas [data-postr-selected="true"]').length);
  if (editing || selected) throw new Error(`precondition: after the click, editing ${editing}, selected ${selected}`);
  return {};
};

/** Placement problems of a paste with nothing in edit mode: none judged beyond on-sheet and in-view (judgeCreate); the centre read as information. */
export const centred = () => [];

/** The caret at the end of the first column's text block, a word typed and stored (table A row 3's text). */
export async function caretInFirstText(s) {
  const tb = (await textBlocksByPlace(s))[0];
  await focusBlockEnd(s.page, tb.id);
  await s.page.keyboard.type('ZQTEXT', { delay: 10 });
  await until(() => (storedBlocks(s.state, s.id).find((b) => b.id === tb.id)?.content ?? '').includes('ZQTEXT'), 8000);
  await s.page.waitForTimeout(700);
  return { textId: tb.id, text: storedBlocks(s.state, s.id).find((b) => b.id === tb.id), drawn: await drawnUnits(s.page, tb.id) };
}

/** Table A row 3's place to the right: within 1 in right of the text block's edge, top aligned with it as drawn; the text unchanged. */
export function rightOfText(blk, i, { text, drawn, after }) {
  const p = [];
  const right = text.x + text.w;
  if (blk.x < right - 0.01 || blk.x - right > 10) p.push(`x ${round(blk.x)}: not within 1 in right of the text block's edge ${round(right)}`);
  if (Math.abs(blk.y - drawn.top) > 0.5) p.push(`top ${round(blk.y)}, the text block's ${round(drawn.top)}`);
  if (after.find((b) => b.id === text.id)?.content !== text.content) p.push('the text changed');
  return p;
}

const IMG = (k) => ({ file: fileOf(IMAGES[k]) });

export const PASTE_SCENARIOS = [
  {
    id: 'B2-excel', claim: 'B2', how: 'nothing in edit mode (a click on the empty workspace), an Excel range of 3 rows by 4 on the clipboard (record 32\'s shape: a merged header, a wrapped label, "p < .05", a line break in a cell), ⌘V: one new table block holding the grid as record 32\'s reader keeps it, Insert\'s width, on the sheet and in the view; one ⌘Z removes it',
    shape: { strings: EXCEL.payload }, focus: nothingSelected, want: [{ type: 'table', grid: EXCEL.expect }], place: centred,
  },
  {
    id: 'B2-word', claim: 'B2', how: 'the same with a Word table of 2 rows by 3 (bold, italic, a red word, an empty cell, two paragraphs in a cell): one new table block',
    shape: { strings: WORD.payload }, focus: nothingSelected, want: [{ type: 'table', grid: WORD.expect }], place: centred,
  },
  {
    id: 'B3-image', claim: 'B3', how: 'nothing in edit mode, an image file (160 × 100 px, magenta) on the clipboard and no text, ⌘V: one new image block of Insert › Image\'s 15.5 × 14 in box with the image\'s shape (15.5 × 9.7 in), uploaded once to {user}/{poster}/{block}.png, drawn, on the sheet and in the view at FIT; one ⌘Z removes it',
    shape: IMG('A'), focus: nothingSelected, want: [{ type: 'image', image: IMAGES.A }], place: centred,
  },
  {
    id: 'B3-tall', claim: 'B3', how: 'the same with a tall image (90 × 150 px, teal): the box\'s height kept, 8.4 × 14 in',
    shape: IMG('B'), focus: nothingSelected, want: [{ type: 'image', image: IMAGES.B }], place: centred,
  },
  {
    id: 'B3-selected-filled', claim: 'B3', how: 'an image block that holds an image selected (a click on it), an image on the clipboard, ⌘V: a NEW image block (only an empty selected image block is filled)',
    shape: IMG('C'),
    focus: async (s) => {
      const img = storedBlocks(s.state, s.id).find((b) => b.type === 'image');
      await fillViaChooser(s, img.id, fileOf(IMAGES.A));
      await s.page.locator(`${CANVAS} [data-block-id="${img.id}"] img`).first().click();
      await s.page.waitForTimeout(300);
      return { imageId: img.id };
    },
    want: [{ type: 'image', image: IMAGES.C }], place: centred,
  },
  {
    id: 'B4-tabs', claim: 'B4', how: 'nothing in edit mode, plain text with tabs and a line break on the clipboard, ⌘V: one new TEXT block (tabs are not a table) holding what record 32\'s paste into an empty text block stores, Insert\'s width, on the sheet and in the view',
    shape: { strings: { 'text/plain': TSV_TEXT } },
    reference: async (s) => textPasteReference(s, (await textBlocksByPlace(s))[2].id),
    focus: nothingSelected,
    want: ({ ref }) => [{ type: 'text', content: ref, markers: ['ZQt1', 'ZQt2', 'ZQt3', 'ZQt4'] }], place: centred,
  },
  {
    id: 'B4-web', claim: 'B4', how: 'the same with a web page\'s styled text (red on yellow 40 px Georgia, bold, italic, underline, sub, sup): one new text block holding record 32\'s cleaned paste (no colour, highlight, font or size)',
    shape: { strings: COLOUR.payload },
    reference: async (s) => textPasteReference(s, (await textBlocksByPlace(s))[2].id),
    focus: nothingSelected,
    want: ({ ref }) => [{ type: 'text', content: ref, markers: ['<b>ZQBOLD</b>', '<sub>2</sub>'], drop: ['color:', 'background-color', 'Georgia', 'font-size'] }], place: centred,
  },
  {
    id: 'B5-img-html', claim: 'B5', how: 'nothing in edit mode, HTML holding only an <img> (no text, no file), ⌘V: nothing (no block, no upload, the poster unchanged)',
    shape: { strings: { 'text/html': '<img src="https://example.test/zq.png" alt="">' } }, focus: nothingSelected, want: [],
  },
  {
    id: 'B5-pdf', claim: 'B5', how: 'nothing in edit mode, a file that is not an image (a PDF) and no text, pasted (a page-made paste: an engine\'s clipboard does not take a PDF from a page): nothing',
    shape: { file: PDF_FILE, forceEvent: true }, focus: nothingSelected, want: [],
  },
  {
    id: 'B3-big', claim: 'TEN', how: 'nothing in edit mode, a real PNG over 10 MB pasted (a page-made paste: the async clipboard re-encodes images): today\'s message ("…too large… under 10 MB"), no block, no upload',
    shape: { file: { name: 'zq-big.png', type: 'image/png', bytes: null }, forceEvent: true, big: true }, focus: nothingSelected, want: [],
    message: /too large[\s\S]*10 MB/,
  },
  {
    id: 'B3-fill-empty', claim: 'B3F', how: 'the empty image block of the layout selected by a rubber band (nothing in edit mode), an image (120 × 120 px, orange) on the clipboard, ⌘V: that block filled (no new block): uploaded once keyed by its id, its width kept and its height the image\'s shape, drawn; one ⌘Z empties it again',
    shape: IMG('C'), fill: true,
  },
  {
    id: 'A3-right', claim: 'A3', how: 'the caret at the end of the first column\'s text block (edit mode), an image and no text on the clipboard, ⌘V: one new image block to the text block\'s right (it fits on the sheet there), its top at the text block\'s top, within 1 in of its right edge; the text unchanged; one ⌘Z removes it',
    shape: IMG('A'), focus: caretInFirstText, want: [{ type: 'image', image: IMAGES.A }], place: rightOfText, textUnchanged: true,
  },
  {
    id: 'A3-below', claim: 'A3', how: 'the same in the third column\'s text block, whose right has no room on the sheet: the new image block below the text block as the canvas draws it (within 1 in), over its columns; the text unchanged',
    shape: IMG('A'),
    focus: async (s) => {
      const tb = (await textBlocksByPlace(s)).at(-1);
      await focusBlockEnd(s.page, tb.id);
      await s.page.keyboard.type('ZQTEXT', { delay: 10 });
      await until(() => (storedBlocks(s.state, s.id).find((b) => b.id === tb.id)?.content ?? '').includes('ZQTEXT'), 8000);
      await s.page.waitForTimeout(700);
      return { textId: tb.id, text: storedBlocks(s.state, s.id).find((b) => b.id === tb.id), drawn: await drawnUnits(s.page, tb.id) };
    },
    want: [{ type: 'image', image: IMAGES.A }],
    place: (blk, i, { text, drawn, after }) => {
      const p = [];
      const bottom = drawn.top + drawn.h;
      if (blk.y < bottom - 0.01 || blk.y - bottom > 10) p.push(`y ${round(blk.y)}: not within 1 in below the drawn text block's bottom ${round(bottom)}`);
      if (blk.x + blk.w <= text.x || blk.x >= text.x + text.w) p.push(`x ${round(blk.x)}: not over the text block's columns`);
      if (after.find((b) => b.id === text.id)?.content !== text.content) p.push('the text changed');
      return p;
    },
  },
  {
    id: 'A3-title', claim: 'A3', how: 'the caret in the title (edit mode), an image on the clipboard, ⌘V: one new image block below the title (the full-width title has no room to its right); the title unchanged',
    shape: IMG('B'),
    focus: async (s) => {
      const t = storedBlocks(s.state, s.id).find((b) => b.type === 'title');
      await focusBlockEnd(s.page, t.id);
      return { textId: t.id, text: t, drawn: await drawnUnits(s.page, t.id) };
    },
    want: [{ type: 'image', image: IMAGES.B }],
    place: (blk, i, { text, drawn, after }) => {
      const p = [];
      const bottom = drawn.top + drawn.h;
      if (blk.y < bottom - 0.01 || blk.y - bottom > 10) p.push(`y ${round(blk.y)}: not within 1 in below the title's drawn bottom ${round(bottom)}`);
      if (after.find((b) => b.id === text.id)?.content !== text.content) p.push('the title changed');
      return p;
    },
  },
  {
    id: 'L-100', claim: 'B3', how: 'the zoom pinched to 100 %, nothing in edit mode, an image pasted: the new block on the sheet and wholly in the view',
    shape: IMG('A'), zoom: async (s) => { await pinchTo(s.page, 1); }, focus: nothingSelected,
    want: [{ type: 'image', image: IMAGES.A }], place: centred,
  },
  {
    id: 'L-zoomed', claim: 'B3', how: 'the zoom pinched to 300 % and the canvas scrolled to the sheet\'s bottom right (only part of the sheet in view), an image pasted: the new block on the sheet and wholly in the view',
    shape: IMG('A'),
    zoom: async (s) => {
      await pinchTo(s.page, 3);
      await s.page.evaluate(() => { const o = document.querySelector('[data-postr-canvas-outer]'); o.scrollLeft = o.scrollWidth; o.scrollTop = o.scrollHeight; });
      await s.page.waitForTimeout(300);
    },
    focus: nothingSelected, want: [{ type: 'image', image: IMAGES.A }], place: centred,
  },
  {
    id: 'L-zoomed-mid', claim: 'B3', how: 'the zoom pinched to 300 % and the canvas scrolled to the middle of its range (the sheet\'s centre in view, its edges not), an image pasted: the new block on the sheet and wholly in the view',
    shape: IMG('A'),
    zoom: async (s) => {
      await pinchTo(s.page, 3);
      await s.page.evaluate(() => { const o = document.querySelector('[data-postr-canvas-outer]'); o.scrollLeft = (o.scrollWidth - o.clientWidth) / 2; o.scrollTop = (o.scrollHeight - o.clientHeight) / 2; });
      await s.page.waitForTimeout(300);
    },
    focus: emptySheetClicked, want: [{ type: 'image', image: IMAGES.A }], place: centred,
  },
  {
    id: 'F-name-text', claim: 'F', how: 'the caret in the sidebar\'s Poster name field, plain text pasted: the field takes it; no block made',
    shape: { strings: { 'text/plain': 'ZQNAME' } },
    focus: async (s) => { await openTab(s.page, 'layout'); await s.page.locator('input[aria-label="Poster name"]').click(); await s.page.keyboard.press('End'); return {}; },
    want: [], fieldGot: async (s) => (await s.page.locator('input[aria-label="Poster name"]').inputValue()).includes('ZQNAME'),
  },
  {
    id: 'F-name-image', claim: 'F', how: 'the caret in the Poster name field, an image pasted: no block made, no upload',
    shape: IMG('A'),
    focus: async (s) => { await openTab(s.page, 'layout'); await s.page.locator('input[aria-label="Poster name"]').click(); return {}; },
    want: [],
  },
  {
    id: 'F-code-image', claim: 'F', how: 'the caret in the Figure tab\'s code box, an image pasted: no block made, no upload',
    shape: IMG('A'),
    focus: async (s) => { await openTab(s.page, 'figure'); await s.page.locator('textarea').first().click(); return {}; },
    want: [],
  },
  {
    id: 'F-code-text', claim: 'F', how: 'the caret in the Figure tab\'s code box, text with tabs pasted: the box takes it; no block made',
    shape: { strings: { 'text/plain': 'ZQCODE\tx = 1' } },
    focus: async (s) => { await openTab(s.page, 'figure'); await s.page.locator('textarea').first().click(); return {}; },
    want: [], fieldGot: async (s) => (await s.page.locator('textarea').first().inputValue()).includes('ZQCODE'),
  },
  {
    id: 'B4-selected', claim: 'B4', how: 'a text block of the layout selected by a rubber band (selected, not in edit mode), plain text on the clipboard, ⌘V: one new text block holding record 32\'s paste; the selected block unchanged',
    shape: { strings: { 'text/plain': 'ZQSEL plain words' } },
    reference: async (s) => textPasteReference(s, (await textBlocksByPlace(s))[2].id),
    focus: async (s) => { const tb = (await textBlocksByPlace(s))[1]; await selectByBand(s.page, tb.id); return { selectedId: tb.id }; },
    want: ({ ref }) => [{ type: 'text', content: ref, markers: ['ZQSEL'] }], place: centred,
  },
  {
    id: 'B3-slow', claim: 'B3', uploadDelayMs: 2500, how: 'B3 with the upload held 2.5 s by the fake storage: one new image block once stored (information: the time from ⌘V to the block drawn)',
    shape: IMG('A'), focus: nothingSelected, want: [{ type: 'image', image: IMAGES.A }], place: centred,
  },
  {
    id: 'L-100-text', claim: 'B4', how: 'the zoom pinched to 100 %, nothing in edit mode, plain text pasted: the new text block on the sheet and wholly in the view',
    shape: { strings: { 'text/plain': 'ZQ100 plain words' } }, zoom: async (s) => { await pinchTo(s.page, 1); }, focus: nothingSelected,
    want: [{ type: 'text', markers: ['ZQ100'] }], place: centred,
  },
  {
    id: 'F-width-image', claim: 'F', how: 'the caret in the Layout tab\'s poster width field (a sidebar field), an image pasted: no block made, no upload',
    shape: IMG('A'),
    focus: async (s) => { await openTab(s.page, 'layout'); await s.page.locator('input[aria-label="Poster width in inches"]').click(); return {}; },
    want: [],
  },
  {
    id: 'F-authors-text', claim: 'F', how: 'the caret in the Authors tab\'s "Paste author list" box, plain text pasted: the box takes it; no block made',
    shape: { strings: { 'text/plain': 'ZQAUTH John Smith, Jane Doe' } },
    focus: async (s) => { await openTab(s.page, 'authors'); await s.page.locator('textarea[placeholder^="John Smith"]').click(); return {}; },
    want: [], fieldGot: async (s) => (await s.page.locator('textarea[placeholder^="John Smith"]').inputValue()).includes('ZQAUTH'),
  },
  {
    id: 'F-refs-image', claim: 'F', how: 'the caret in the References tab\'s paste box, an image pasted: no block made, no upload',
    shape: IMG('A'),
    focus: async (s) => { await openTab(s.page, 'references'); await s.page.locator('textarea[placeholder^="Smith, J."]').click(); return {}; },
    want: [],
  },
  {
    id: 'F-dialog-text', claim: 'F', how: 'the size dialog open (Layout\'s width field ↑ Enter, "Change poster to …", the focus in it), plain text pasted: no block made',
    shape: { strings: { 'text/plain': 'ZQDLG plain words' } },
    focus: async (s) => {
      await openTab(s.page, 'layout');
      await s.page.locator('input[aria-label="Poster width in inches"]').click();
      await s.page.keyboard.press('ArrowUp');
      await s.page.keyboard.press('Enter');
      await s.page.getByRole('dialog', { name: /Change poster to/ }).waitFor({ state: 'visible', timeout: 5000 });
      await s.page.waitForTimeout(300);
      const inDialog = await s.page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
      if (!inDialog) throw new Error('precondition: the focus is not in the dialog');
      return {};
    },
    want: [],
  },
  {
    id: 'I-engine-image-paste', info: true, engineImage: true, how: 'information: what this engine\'s own paste of an image written to its clipboard carries (the reason Firefox\'s image scenarios use a page-made paste)',
  },
  {
    id: 'G-paste', claim: 'G', guest: true, how: 'a guest (anonymous session) at /p/new, nothing in edit mode, an image pasted: one new image block, uploaded under the guest\'s own folder, drawn; one ⌘Z removes it',
    shape: IMG('A'), focus: nothingSelected, want: [{ type: 'image', image: IMAGES.A }], place: centred,
  },
];

/** B3's other half: an empty selected image block is filled (no new block). */
async function runFill(h, s, sc) {
  await storeFirst(s);
  const { mode } = await putOnClipboard(h, s, sc.shape);
  const img = storedBlocks(s.state, s.id).find((b) => b.type === 'image' && !b.imageSrc);
  if (!img) throw new Error('precondition: no empty image block');
  await selectByBand(s.page, img.id);
  handOver(s, [sc.shape.file]);
  const before = storedBlocks(s.state, s.id);
  const since = Date.now();
  const from = await eventCount(s.page);
  await pasteNow(s, sc.shape, mode);
  const k1 = await carried(s, from, sc.shape, mode);
  const changed = await settledChange(s.state, s.id, before, { timeout: 14000 });
  const after = storedBlocks(s.state, s.id);
  const blk = after.find((b) => b.id === img.id);
  const added = addedBlocks(before, after);
  const p = [];
  if (added.length) p.push(`${added.length} blocks added`);
  const aspect = IMAGES.C.w / IMAGES.C.h;
  if (!new RegExp(`^storage://${s.uid}/${s.id}/${keyedName(img.id, 'png')}$`).test(blk?.imageSrc ?? '')) p.push(`imageSrc ${String(blk?.imageSrc).slice(0, 80)}`);
  if (blk && Math.abs(blk.w - img.w) > 0.01) p.push(`width ${blk.w}, was ${img.w}`);
  if (blk && Math.abs(blk.h - Math.round(img.w / aspect)) > 1) p.push(`height ${blk.h}, want the image's shape ${Math.round(img.w / aspect)}`);
  const ups = uploadsOf(s.state, img.id, since);
  if (ups.length !== 1) p.push(`${ups.length} uploads keyed by it`);
  const paint = await waitPaint(s.page, img.id, IMAGES.C.rgb);
  if (paint === null || paint < 0.5) p.push(`its image covers ${paint} of its box`);
  const others = othersChanged(before, after, [img.id]);
  await s.page.keyboard.press(`${MOD}+z`);
  const undone = await storedEquals(s.state, s.id, before, 10000);
  return {
    // U only when the paste changed the block (with nothing changed, ⌘Z would undo the user's last edit).
    claims: { B3F: p.length > 0, N: others.length > 0, U: changed ? !undone : null },
    numbers: { mode, stored: changed, imageSrc: String(blk?.imageSrc).replace(/^storage:\/\/[^/]+\/[^/]+\//, 'storage://…/'), w: blk && round(blk.w), h: blk && round(blk.h), uploads: ups.length, paint, othersChanged: others.join(',') || 'none', undoRestored: undone, problems: p.join(' ; ') || 'none' },
    carried: k1,
  };
}

/**
 * Information: what this engine's own paste of a clipboard image carries
 * (written with the async clipboard in a real click, then a real ⌘V with
 * nothing in edit mode). Playwright's Firefox hands over a file item with
 * no file, which is why its image scenarios use a page-made paste.
 */
async function runEngineImagePaste(h, s) {
  await storeFirst(s);
  const wrote = await writeImageToClipboard(s.page, fileOf(IMAGES.A));
  await clickAway(s.page);
  const from = await eventCount(s.page);
  await s.page.keyboard.press(`${MOD}+v`);
  await s.page.waitForTimeout(500);
  const ev = (await eventsSince(s.page, 'paste', from)).at(-1);
  return {
    claims: {},
    numbers: { clipboardWrite: wrote, pasteReached: !!ev, trusted: ev?.trusted ?? null, types: ev?.types?.join(',') ?? 'none', files: ev?.files?.join(',') || 'none' },
    carried: { ok: true, why: 'information' },
  };
}

export async function runPasteScenario(h, openSignedIn, sc) {
  const s = await openSession(h, openSignedIn, { guest: !!sc.guest });
  try {
    if (sc.engineImage) return { ...(await runEngineImagePaste(h, s)), pageErrors: s.state.errors };
    if (sc.shape.big) sc.shape.file.bytes = bigPng();
    const r = sc.fill ? await runFill(h, s, sc) : await runPaste(h, s, sc);
    return { ...r, pageErrors: s.state.errors };
  } finally {
    await s.context.close().catch(() => {});
  }
}

