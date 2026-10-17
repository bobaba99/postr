/**
 * Scenarios of record 34's review round (docs/fixes/34-paste-drop.md
 * section 9) for scripts/canvas-paste-check.mjs: the reviewer's probes that
 * found a defect, folded into the committed instrument (docs/fixes/README.md
 * "Harnesses to reuse"), on the same entry points and readings as
 * lib/canvasPasteScenarios.mjs and lib/canvasDropScenarios.mjs.
 *
 *   R34-1  DQ   two files dropped on one image block, the second while the
 *               first uploads: the block draws the second (a loaded image,
 *               its colour on half its box, not a revoked blob: address),
 *               the file at its stored path is the second's, and one ⌘Z
 *               brings back the poster as before both (counted for one
 *               extension; with two, information: §3.3 D)
 *   R34-2  B3 / A3  a browser's "Copy image" that also carries an <img>
 *               fragment and the image's address as plain text: the image
 *               (a text paste of that clipboard inserts nothing)
 *   R34-5  B4   an image's address alone: a text block holding it
 *   R34-3  RNG  a table's cells selected by dragging, then ⌘V: no block
 *               made (record 32: a dragged range is not a paste target)
 *   R34-7  F    the feedback dialog open (from a chart's "Send Feedback"),
 *               a click on its heading, text pasted: no block made
 *   R34-4, R34-6  information: a second ⌘V while an image uploads, a ⌘Z
 *               while a dropped image uploads, Insert › Image then ⌘V of a
 *               tall image (what lands where)
 */
import { MOD, clickAway, openTab } from './undoKit.mjs';
import { rowOf } from './keepWorkKit.mjs';
import { TABLE_SHAPES } from './tablePasteShapes.mjs';
import {
  IMAGES, addedBlocks, drawnBlock, dropFiles, emptySheetPoint, eventCount, fileOf, handOver, othersChanged, paintShare, renamed,
  keyedName, settledChange, sheetUnits, storedBlocks, storedEquals, until, uploadsOf, waitPaint, watchEvents,
} from './canvasPasteKit.mjs';
import {
  caretInFirstText, carried, centred, fillViaChooser, nothingSelected, openSession, pasteNow, putOnClipboard, rightOfText, storeFirst,
  textBlocksByPlace, textPasteReference,
} from './canvasPasteScenarios.mjs';
import { dropReached } from './canvasDropScenarios.mjs';

const round = (v) => Math.round(v * 100) / 100;
const short = (src) => String(src ?? null).replace(/^storage:\/\/[^/]+\/[^/]+\//, 'storage://…/').replace(/^(blob:|data:).*/, '$1…');
const brief = (b) => `${b.type} (${round(b.x)}, ${round(b.y)}) ${round(b.w)}×${round(b.h)}`;

/** An image's address (a reserved name: nothing is fetched). */
const ADDRESS = 'https://example.invalid/zq-figure.png';
/**
 * A browser's "Copy image" that carries the image, an <img> fragment and
 * the image's address as plain text (the shape of Firefox's Copy Image as
 * the reviewer put it; what each application puts on the clipboard is
 * UNVERIFIED). A text paste of it inserts nothing: the fragment holds no
 * words and the HTML wins over the plain text (record 32's pastedHtml).
 */
const IMAGE_WITH_ADDRESS = { file: fileOf(IMAGES.A), strings: { 'text/html': `<img alt="ZQ alt text" src="${ADDRESS}">`, 'text/plain': ADDRESS } };

// ---------------------------------------------------------------- R34-1

/**
 * Two files dropped on the layout's image block (holding image A), the
 * second 0.7 s after the first while the fake storage holds every upload
 * 2 s. `second` is the square image C, as a PNG (the same path as the
 * first) or a JPEG name (another path).
 */
async function runTwiceSameBlock(h, s, sc) {
  await storeFirst(s);
  const img = storedBlocks(s.state, s.id).find((b) => b.type === 'image');
  if (!img) throw new Error('precondition: no image block');
  await fillViaChooser(s, img.id, fileOf(IMAGES.A));
  await waitPaint(s.page, img.id, IMAGES.A.rgb);
  // Every blob: address the page revokes, logged (instrumentation: the
  // address the block draws is compared against it afterwards).
  await s.page.evaluate(() => {
    window.__zqRevoked = [];
    const orig = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (u) => { window.__zqRevoked.push(u); return orig(u); };
  });
  s.state.faults.uploadDelayMs = 2000;
  const d = await drawnBlock(s.page, img.id);
  const pt = { x: d.box.x + d.box.w / 2, y: d.box.y + d.box.h * 0.6 };
  const before = storedBlocks(s.state, s.id);
  const since = Date.now();
  const from = await eventCount(s.page);
  const first = fileOf(IMAGES.B);
  const second = sc.second();
  await dropFiles(h, s, [first], pt, h.out);
  await s.page.waitForTimeout(700);
  const drop = await dropFiles(h, s, [second], pt, h.out);
  const k2 = await dropReached(s, from, drop.how);
  await s.page.waitForTimeout(300);
  await settledChange(s.state, s.id, before, { timeout: 12000, quiet: 2500 });
  await s.page.waitForTimeout(1500);
  const after = storedBlocks(s.state, s.id);
  const blk = after.find((b) => b.id === img.id);
  await clickAway(s.page);
  await s.page.waitForTimeout(600);
  const paintC = await waitPaint(s.page, img.id, IMAGES.C.rgb, { timeout: 4000 });
  const drawn = (await drawnBlock(s.page, img.id))?.img ?? null;
  const src = await s.page.evaluate((bid) => document.querySelector(`#poster-canvas [data-block-id="${bid}"] img`)?.src ?? null, img.id);
  const revoked = await s.page.evaluate(() => window.__zqRevoked ?? []);
  const srcRevoked = !!src && revoked.includes(src);
  const stored = s.state.objects.get(String(blk?.imageSrc).replace('storage://', ''))?.bytes ?? null;
  const fileIs = !stored ? 'none' : stored.equals(second.bytes) ? 'C' : stored.equals(first.bytes) ? 'B' : stored.equals(fileOf(IMAGES.A).bytes) ? 'A' : `${stored.length} B`;
  const ext = second.name.split('.').pop();
  const p = [];
  if (!new RegExp(`^storage://${s.uid}/${s.id}/${keyedName(img.id, ext)}$`).test(blk?.imageSrc ?? '')) p.push(`imageSrc ${short(blk?.imageSrc)}`);
  if (fileIs !== 'C') p.push(`the stored file is ${fileIs}, not the second file`);
  if (!drawn?.loaded) p.push(`nothing drawn (img ${JSON.stringify(drawn)})`);
  if (paintC === null || paintC < 0.5) p.push(`the second image covers ${paintC} of its box`);
  if (srcRevoked) p.push('the block draws a blob: address the page revoked');
  const others = othersChanged(before, after, [img.id]);
  // The file now at the block's old path (A's): the first file's upload
  // writes it when it has the same extension (§3.3 D, the next fix's).
  const heldPath = String(before.find((b) => b.id === img.id)?.imageSrc).replace('storage://', '');
  const old = s.state.objects.get(heldPath)?.bytes ?? null;
  const oldPathFileIs = !old ? 'none' : old.equals(fileOf(IMAGES.A).bytes) ? 'A' : old.equals(first.bytes) ? 'B' : old.equals(second.bytes) ? 'C' : `${old.length} B`;
  // ⌘Z presses back to the poster before both drops (the rule: the last file is the one step).
  let presses = 0;
  const afterPress = []; // the block's stored height and file after each press (information)
  while (presses < 4 && !(await storedEquals(s.state, s.id, before, 1500))) {
    await s.page.keyboard.press(`${MOD}+z`);
    presses += 1;
    await s.page.waitForTimeout(1500);
    const b = storedBlocks(s.state, s.id).find((x) => x.id === img.id);
    afterPress.push(`h ${b && round(b.h)} ${short(b?.imageSrc).split('.').pop()}`);
  }
  const back = await storedEquals(s.state, s.id, before, 2000);
  // Counted where the old path still holds what the block showed before
  // (the same extension: the second file's upload landed last there). With
  // another extension the first file's upload overwrote the old path, so
  // the block draws that file after the ⌘Z and its own fit gives it that
  // file's shape, an edit of its own (§3.3 D): the presses are information.
  if (sc.undoCounted !== false && (!back || presses !== 1)) p.push(back ? `${presses} ⌘Z presses back, not 1` : `not back after ${presses} ⌘Z`);
  await s.page.waitForTimeout(1200);
  return {
    claims: { DQ: p.length > 0, N: others.length > 0 },
    numbers: {
      how: drop.how, imageSrc: short(blk?.imageSrc), h: blk && round(blk.h), storedFileIs: fileIs, drawn: drawn ? `${drawn.src} loaded ${drawn.loaded} ${drawn.nw}x${drawn.nh}` : 'none',
      paintC, paintB: await paintShare(s.page, img.id, IMAGES.B.rgb).catch(() => null), drawnSrcRevoked: srcRevoked, revokedCount: revoked.length,
      uploads: uploadsOf(s.state, img.id, since).map((u) => `…/${u.path.split('/').pop()} @${u.t - since}ms`).join(', '),
      undoPressesBack: `${back ? presses : `not back after ${presses}`}${sc.undoCounted === false ? ' (information, §3.3 D)' : ''}`, fileAtOldPathIs: oldPathFileIs,
      storedAfterEachUndo: afterPress.join(' → ') || 'none', hBefore: round(before.find((b) => b.id === img.id)?.h ?? NaN),
      // Information (§3.3 D): what the block draws after the ⌘Z (the first file's upload overwrote the old path).
      drawnAfterUndo: `A ${await paintShare(s.page, img.id, IMAGES.A.rgb)} · B ${await paintShare(s.page, img.id, IMAGES.B.rgb)} · C ${await paintShare(s.page, img.id, IMAGES.C.rgb)}`,
      othersChanged: others.join(',') || 'none', problems: p.join(' ; ') || 'none',
    },
    carried: k2,
  };
}

// ---------------------------------------------------------------- R34-3

/** Insert › Table, cells 1 to 5 (row 1 col 1 to row 2 col 2) selected by dragging, then the shape pasted. */
async function runCellRange(h, s, sc) {
  await storeFirst(s);
  const { mode } = await putOnClipboard(h, s, sc.shape);
  const before0 = storedBlocks(s.state, s.id);
  await openTab(s.page, 'insert');
  await s.page.locator('button', { hasText: 'Data table' }).first().click();
  const tbl = await until(() => addedBlocks(before0, storedBlocks(s.state, s.id))[0], 8000);
  if (!tbl) throw new Error('precondition: Insert › Table made no block');
  await settledChange(s.state, s.id, before0, { timeout: 3000, quiet: 800 });
  const cells = s.page.locator(`#poster-canvas [data-block-id="${tbl.id}"] td`);
  const a = await cells.nth(0).boundingBox();
  const b = await cells.nth(4).boundingBox();
  await s.page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await s.page.mouse.down();
  await s.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await s.page.mouse.up();
  await s.page.waitForTimeout(300);
  const focus = await s.page.evaluate(() => {
    const x = document.activeElement;
    return x ? `${x.tagName}${x.isContentEditable ? '(editable)' : ''}${x.closest('td') ? ' in a cell' : ''}` : 'none';
  });
  const before = storedBlocks(s.state, s.id);
  const from = await eventCount(s.page);
  await pasteNow(s, sc.shape, mode);
  const k1 = await carried(s, from, sc.shape, mode);
  await settledChange(s.state, s.id, before, { timeout: 4000, quiet: 1200 });
  await s.page.waitForTimeout(1200);
  const after = storedBlocks(s.state, s.id);
  const added = addedBlocks(before, after);
  const t0 = before.find((x) => x.id === tbl.id).tableData;
  const t1 = after.find((x) => x.id === tbl.id)?.tableData;
  const cellsChanged = t1 ? t1.cells.map((c, i) => (c !== t0.cells[i] ? i : -1)).filter((i) => i >= 0).join(',') || 'none' : 'gone';
  return {
    // The table's own cells are record 32's (WebKit keeps the caret in a cell after the drag, so its cell paste runs): information.
    claims: { RNG: added.length > 0, N: othersChanged(before, after, [tbl.id, ...added.map((x) => x.id)]).length > 0 },
    numbers: { mode, focusAfterDrag: focus, added: added.map(brief).join(' | ') || 'none', tableCellsChanged: cellsChanged },
    carried: k1,
  };
}

// ---------------------------------------------------------------- R34-7

/**
 * The feedback dialog open, the focus on no field: a poster holding a chart
 * block that cannot be drawn (no chart spec, as a damaged or older poster
 * may: the editor's one way to the dialog, "Something went wrong rendering
 * this chart" → "Send Feedback"), then a click on the dialog's heading.
 */
async function feedbackDialogOpen(s) {
  rowOf(s.state, s.id).data.blocks.push({
    id: 'bzqchart', type: 'chart', x: 330, y: 250, w: 100, h: 70, content: '', imageSrc: null, imageFit: 'contain', tableData: null, chartSpec: null,
  });
  await s.page.reload();
  await s.page.waitForSelector('#poster-canvas [data-block-id="bzqchart"]', { timeout: 30000 });
  await s.page.waitForTimeout(1500);
  await watchEvents(s.page);
  await s.page.locator('#poster-canvas [data-block-id="bzqchart"] button', { hasText: 'Send Feedback' }).click();
  const heading = s.page.locator('h3', { hasText: 'Send feedback' });
  await heading.waitFor({ state: 'visible', timeout: 5000 });
  await s.page.waitForTimeout(400);
  await heading.click();
  await s.page.waitForTimeout(200);
  const editing = await s.page.evaluate(() => document.activeElement?.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? ''));
  if (editing) throw new Error('precondition: a field has the focus in the feedback dialog');
  return {};
}

// ---------------------------------------------------------- information

/** R34-4: upload held 2.5 s, an image pasted with nothing in edit mode, ⌘V again 0.8 s later. */
async function runDoublePaste(h, s) {
  await storeFirst(s);
  const shape = { file: fileOf(IMAGES.A) };
  const { mode } = await putOnClipboard(h, s, shape);
  await clickAway(s.page);
  s.state.faults.uploadDelayMs = 2500;
  const before = storedBlocks(s.state, s.id);
  const imagesBefore = await s.page.evaluate(() => document.querySelectorAll('#poster-canvas [data-block-type="image"]').length);
  const from = await eventCount(s.page);
  handOver(s, [shape.file]);
  await pasteNow(s, shape, mode, 0);
  await s.page.waitForTimeout(800);
  const storedAt800 = addedBlocks(before, storedBlocks(s.state, s.id)).length;
  const drawnAt800 = (await s.page.evaluate(() => document.querySelectorAll('#poster-canvas [data-block-type="image"]').length)) - imagesBefore;
  await pasteNow(s, shape, mode, 0);
  const k1 = await carried(s, from, shape, mode);
  await settledChange(s.state, s.id, before, { timeout: 12000, quiet: 3000 });
  const after = storedBlocks(s.state, s.id);
  const added = addedBlocks(before, after);
  await s.page.keyboard.press(`${MOD}+z`);
  await settledChange(s.state, s.id, after, { timeout: 5000, quiet: 900 });
  return {
    claims: {},
    numbers: {
      newBlocksStoredAt800ms: storedAt800, newImageBlocksDrawnAt800ms: drawnAt800, added: added.map(brief).join(' | ') || 'none',
      samePlace: added.length === 2 && added[0].x === added[1].x && added[0].y === added[1].y, afterOneUndo: addedBlocks(before, storedBlocks(s.state, s.id)).length,
    },
    carried: k1,
  };
}

/** R34-4: upload held 2.5 s, an image dropped, ⌘Z 0.5 s later (before it lands), then ⌘⇧Z. */
async function runUndoDuringUpload(h, s) {
  await storeFirst(s);
  s.state.faults.uploadDelayMs = 2500;
  const pt = await emptySheetPoint(s.page, 0.5, 0.9);
  if (!pt) throw new Error('precondition: no empty point on the sheet');
  const before = storedBlocks(s.state, s.id);
  const from = await eventCount(s.page);
  const drop = await dropFiles(h, s, [fileOf(IMAGES.A)], pt, h.out);
  const k2 = await dropReached(s, from, drop.how);
  await s.page.waitForTimeout(300);
  await s.page.keyboard.press(`${MOD}+z`);
  await s.page.waitForTimeout(4000);
  await settledChange(s.state, s.id, before, { timeout: 6000, quiet: 1500 });
  const after = storedBlocks(s.state, s.id);
  await s.page.keyboard.press(`${MOD}+Shift+z`);
  await s.page.waitForTimeout(1500);
  const redo = storedBlocks(s.state, s.id);
  const title = (blocks) => (blocks.find((b) => b.type === 'title')?.content ?? '').includes('ZQSTART');
  return {
    claims: {},
    numbers: {
      titleTypingBefore: title(before), titleTypingAfterTheUndo: title(after), imageBlocksLanded: addedBlocks(before, after).length,
      redoChangedAnything: JSON.stringify(redo) !== JSON.stringify(after), titleTypingAfterRedo: title(redo),
    },
    carried: k2,
  };
}

/** R34-6: Insert › Image (a new empty block, selected), then ⌘V of the tall image: where its bottom lands against the sheet's. */
async function runInsertThenPasteTall(h, s) {
  await storeFirst(s);
  const shape = { file: fileOf(IMAGES.B) };
  const { mode } = await putOnClipboard(h, s, shape);
  const before0 = storedBlocks(s.state, s.id);
  await openTab(s.page, 'insert');
  await s.page.locator('button', { hasText: 'Figure or photo' }).first().click();
  const inserted = await until(() => addedBlocks(before0, storedBlocks(s.state, s.id))[0], 8000);
  if (!inserted) throw new Error('precondition: Insert › Image made no block');
  await settledChange(s.state, s.id, before0, { timeout: 3000, quiet: 800 });
  const before = storedBlocks(s.state, s.id);
  const since = Date.now();
  const from = await eventCount(s.page);
  handOver(s, [shape.file]);
  await pasteNow(s, shape, mode);
  const k1 = await carried(s, from, shape, mode);
  await settledChange(s.state, s.id, before, { timeout: 10000, quiet: 1200 });
  const after = storedBlocks(s.state, s.id);
  const f = after.find((b) => b.id === inserted.id);
  const sheet = sheetUnits(s.state, s.id);
  return {
    claims: {},
    numbers: {
      inserted: brief(inserted), filled: f ? brief(f) : 'gone', addedByPaste: addedBlocks(before, after).length, uploadsKeyed: uploadsOf(s.state, inserted.id, since).length,
      bottom: f && round(f.y + f.h), sheetH: sheet.h, offSheetIn: f ? round(Math.max(0, f.y + f.h - sheet.h) / 10) : null,
    },
    carried: k1,
  };
}

// ------------------------------------------------------------ the list

export const REVIEW_SCENARIOS = [
  {
    id: 'B3-img-address', claim: 'B3', how: 'R34-2: nothing in edit mode, a browser\'s "Copy image" carrying the image, an <img> fragment and the image\'s address as plain text, ⌘V: one new image block (a text paste of this clipboard inserts nothing), as B3-image',
    shape: IMAGE_WITH_ADDRESS, focus: nothingSelected, want: [{ type: 'image', image: IMAGES.A }], place: centred,
  },
  {
    id: 'A3-img-address', claim: 'A3', how: 'R34-2: the caret at the end of the first column\'s text block, the same clipboard pasted: one new image block to the text block\'s right; the text unchanged',
    shape: IMAGE_WITH_ADDRESS, focus: caretInFirstText, want: [{ type: 'image', image: IMAGES.A }], place: rightOfText, textUnchanged: true,
  },
  {
    id: 'B4-address', claim: 'B4', how: 'R34-5: nothing in edit mode, an image\'s address alone as plain text ("Copy image address"), ⌘V: one new text block holding it, as record 32\'s paste into an empty text block stores it',
    shape: { strings: { 'text/plain': ADDRESS } },
    reference: async (s) => textPasteReference(s, (await textBlocksByPlace(s))[2].id),
    focus: nothingSelected,
    want: ({ ref }) => [{ type: 'text', content: ref, markers: ['example.invalid/zq-figure.png'] }], place: centred,
  },
  {
    id: 'F-feedback-text', claim: 'F', how: 'R34-7: the feedback dialog open (a chart that cannot be drawn → "Send Feedback"), its heading clicked (no field focused), plain text pasted: no block made',
    shape: { strings: { 'text/plain': 'ZQFEED plain words' } }, focus: feedbackDialogOpen, want: [],
  },
  {
    id: 'F-cell-range-tsv', custom: runCellRange, how: 'R34-3: Insert › Table, cells 1 to 5 selected by dragging (no caret in a cell in Chromium and Firefox), tab-separated text pasted: no block made (record 32 §10: a dragged range is not a paste target)',
    shape: { strings: { 'text/plain': 'ZQd1\tZQd2\nZQd3\tZQd4\n' } },
  },
  {
    id: 'F-cell-range-excel', custom: runCellRange, how: 'R34-3: the same with an Excel range on the clipboard: no block made',
    shape: { strings: TABLE_SHAPES.find((t) => t.id === 'excel-html').payload },
  },
  {
    id: 'D-twice-same-block', custom: runTwiceSameBlock, how: 'R34-1: uploads held 2 s, a tall image (B) dropped on the image block holding A, then 0.7 s later a square one (C), both PNG (one path): the block draws C (not a revoked preview), the stored file is C\'s, one ⌘Z back to the poster before both',
    second: () => fileOf(IMAGES.C),
  },
  {
    id: 'D-twice-same-block-jpg', custom: runTwiceSameBlock, how: 'R34-1: the same with the second file named .jpg (another path): the block draws C (not a revoked preview), stored at .jpg; the ⌘Z presses back are information here (the first file\'s upload overwrote the old .png path, §3.3 D: after a ⌘Z the block draws that file and its own fit gives it that file\'s shape)',
    second: () => renamed(fileOf(IMAGES.C), 'zq-figure-c.jpg', 'image/jpeg'), undoCounted: false,
  },
  { id: 'I-double-paste', custom: runDoublePaste, info: true, how: 'information (R34-4): uploads held 2.5 s, an image pasted with nothing in edit mode, ⌘V again 0.8 s later: what shows at 0.8 s, how many blocks land, where, and one ⌘Z' },
  { id: 'I-undo-during-upload', custom: runUndoDuringUpload, info: true, how: 'information (R34-4): uploads held 2.5 s, an image dropped, ⌘Z 0.5 s later: what the ⌘Z undid, what lands, whether ⌘⇧Z then redoes it' },
  { id: 'I-insert-then-paste-tall', custom: runInsertThenPasteTall, info: true, how: 'information (R34-6): Insert › Image, then ⌘V of the tall image: the block filled, its bottom against the sheet\'s' },
];

/** Run a scenario of the list with its own runner (`custom`); paste-format ones go through runPasteScenario. */
export async function runReviewScenario(h, openSignedIn, sc) {
  const s = await openSession(h, openSignedIn, { guest: !!sc.guest });
  try {
    return { ...(await sc.custom(h, s, sc)), pageErrors: s.state.errors };
  } finally {
    await s.context.close().catch(() => {});
  }
}
