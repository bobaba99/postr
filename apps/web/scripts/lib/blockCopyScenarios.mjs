/**
 * Block copy, cut and paste, and image files, for
 * scripts/canvas-paste-check.mjs (record docs/fixes/35-block-copy.md;
 * bounded-designs §3.3 table B order 1, table C, D). A sibling of record
 * 34's paste scenarios on the same entry and readings: a signed-in term
 * holder (or a guest) at /p/new on the fake backend and storage, blocks
 * selected with a rubber band (a click on a text enters it), a real ⌘C,
 * ⌘X, ⌘V and ⌘Z, ⌘D, today's Replace button, a reload, a second tab, a
 * second poster. What is read: the poster rows, the storage objects and
 * copies the fake backend keeps, the system clipboard (lib/blockCopyKit.mjs
 * readClipboard: a real ⌘V into a field the harness adds), what the canvas
 * draws (an image's natural size and colour) and the toasts. Nothing calls
 * the app's store or its modules.
 *
 * CLAIMS (observed = the defect present)
 *   C1  ⌘C with blocks selected and nothing in edit mode did not put on the
 *       system clipboard text/html holding a version 1 payload
 *       (`data-postr-blocks`, JSON) of exactly the selected blocks the rule
 *       copies (by the original's id, in the poster's order, each field as
 *       stored; never the credit mark) and text/plain holding their words
 *   C2  ⌘X: the copied blocks not removed, the clipboard not as C1, the
 *       credit mark removed or its toast missing, or one ⌘Z not bringing
 *       the poster back
 *   C3  ⌘V of copied blocks: not exactly one copy of each, each with a new
 *       id, the original's type, content, size, table and caption, placed
 *       1 in down and right of the original while an original is on the
 *       poster, else at its place, each kept on the sheet
 *   C4  a title, an authors block or a user logo pasted into a poster that
 *       has one, or the toast saying why missing, or the other blocks not
 *       pasted; the credit mark counted as a logo
 *   C5  C3 not holding after a reload, in a second tab, in another poster
 *   B1N a payload that fails validation (a huge number, a negative size, an
 *       unknown type or field, another version, malformed JSON, 10 000
 *       blocks) pasted anything
 *   X   an untrusted payload did harm: a script ran (window.__zqPwned), a
 *       pasted text holds markup the editor's sanitizer drops (script,
 *       an event handler, img, svg, iframe, a link, a style sheet), a
 *       pasted image holds a source other than a file in the user's own
 *       folder, the page asked for an outside address, or the page threw
 *   D   a pasted or cloned image does not have its own file
 *       ({user}/{poster}/{its id}-{random}.{ext} holding the original's
 *       bytes), or the original's source or file changed
 *   R   Replace kept the old file name, or overwrote the old file
 *   DR  after a reload a block draws another block's picture
 *   DU  one ⌘Z after a same-type Replace does not draw the old picture
 *   MSG the message the rule names not shown (a refused block, an image
 *       that cannot be copied, a payload that fails validation)
 *   N   another block of the poster changed
 *   U   one ⌘Z did not undo the paste (or the cut, C2) as one step
 *   G   a guest's copy and paste not as C3 and D (its own folder)
 *   EDIT (a guard) ⌘C with the caret in a text put blocks on the clipboard
 *       (the text's own copy, record 32)
 *   PT  ⌘C with text selected on the page outside the canvas (the sidebar)
 *       and a block still selected put blocks on the clipboard, or not the
 *       selected text (the browser's own copy wins)
 *
 * The control `carried` (exit 2 when it fails): the paste that reached the
 * page was the engine's own trusted paste carrying text/html (the copy
 * read back by the probe, or the ⌘V on the canvas).
 */
import { MOD, clickAway, openTab } from './undoKit.mjs';
import { copyToClipboard } from './tablePasteScenarios.mjs';
import {
  IMAGES, addedBlocks, drawnBlock, eventCount, fileOf, othersChanged, settledChange, sheetUnits, storedBlocks, storedEquals,
  until, waitPaint, watchEvents,
} from './canvasPasteKit.mjs';
import { storeFirst } from './canvasPasteScenarios.mjs';
import {
  CLIP_ATTR, CREDIT_MARK, bandSelect, bytesAt, bytesOf, drawnImage, openSeededPoster, pageNow, pasteCarried, payloadHtml, payloadIn, plainBlock,
  readClipboard, replaceImage, round, sameBytes, selectionEnds, sentinel, session, short, toastsSince, watchToasts, column, typeInto, userColumn,
} from './blockCopyKit.mjs';
import { UNTRUSTED_SCENARIOS } from './blockCopyUntrustedScenarios.mjs';
import { REVIEW_BLOCK_SCENARIOS } from './blockCopyReviewScenarios.mjs';
import { ROUND2_BLOCK_SCENARIOS } from './blockCopyRound2Scenarios.mjs';
import { ROUND3_BLOCK_SCENARIOS } from './blockCopyRound3Scenarios.mjs';
import { FINAL_BLOCK_SCENARIOS } from './blockCopyFinalScenarios.mjs';

/**
 * C1: the clipboard against `originals` (the stored blocks the rule copies,
 * in the poster's order) and the `words` text/plain must hold.
 */
async function judgeClipboard(s, originals, words = []) {
  const clip = await readClipboard(s.page);
  const p = [];
  if (!clip) return { problems: ['the clipboard could not be read (no paste reached the probe)'], clip: null, carried: { ok: false, why: 'no paste reached the probe' } };
  const pl = await payloadIn(s.page, clip.html);
  if (!pl.found) p.push(`no ${CLIP_ATTR} payload in text/html (text/plain ${JSON.stringify(clip.text.slice(0, 40))})`);
  else if (pl.error) p.push(`the payload is not JSON: ${pl.error}`);
  else {
    const j = pl.json;
    if (j?.v !== 1) p.push(`version ${JSON.stringify(j?.v)}`);
    const got = Array.isArray(j?.blocks) ? j.blocks : [];
    if (got.length !== originals.length) p.push(`${got.length} blocks, want ${originals.length}`);
    if (JSON.stringify(got.map((b) => b.id)) !== JSON.stringify(originals.map((b) => b.id))) p.push(`order ${got.map((b) => b.id).join(',')} want ${originals.map((b) => b.id).join(',')}`);
    for (const o of originals) {
      const g = got.find((b) => b.id === o.id);
      if (!g) { p.push(`${o.type} ${o.id} missing`); continue; }
      for (const k of ['type', 'x', 'y', 'w', 'h', 'content', 'imageSrc', 'imageFit', 'tableData', 'caption', 'note']) {
        if (JSON.stringify(g[k] ?? null) !== JSON.stringify(o[k] ?? null)) p.push(`${o.type}.${k} ${JSON.stringify(g[k] ?? null).slice(0, 50)} want ${JSON.stringify(o[k] ?? null).slice(0, 50)}`);
      }
    }
    if (got.some((b) => b.locked || b.id === '__postr_ack_mark__')) p.push('the credit mark is in the payload');
  }
  for (const w of words) if (!clip.text.includes(w)) p.push(`text/plain lacks "${w}"`);
  return {
    problems: p, clip, payload: pl,
    carried: { ok: clip.trusted, why: `probe read: trusted=${clip.trusted} types=${clip.types.join(',')} text=${JSON.stringify(clip.text.slice(0, 40))}` },
  };
}

/** A block kept on the sheet: x in [0, sheet − w] (0 when wider), the same for y. */
const kept = (v, len, room) => Math.max(0, Math.min(room - len, v));

/**
 * C3 and D after a ⌘V: the copies of `originals` (in their order), placed
 * by `offset` (units) and kept on `sheet` (poster `posterId`'s), each image
 * with its own file holding `originalBytes[id]` in the user's folder of that
 * poster. Then one ⌘Z (U). Returns claims and numbers.
 */
async function judgePaste(s, before, originals, { offset, originalBytes = {}, posterId = s.id, uid = s.uid }) {
  const changed = await settledChange(s.state, posterId, before, { timeout: 15000 });
  const after = storedBlocks(s.state, posterId);
  // The credit mark the editor seeds when it opens a stored poster (after a
  // reload) reaches the row with the next save: not the paste's.
  const added = addedBlocks(before, after).filter((b) => !b.locked);
  const sheet = sheetUnits(s.state, posterId);
  const p = [];
  const d = [];
  if (added.length !== originals.length) p.push(`${added.length} blocks added, want ${originals.length}`);
  originals.forEach((o, i) => { if (o.type === 'image' && o.imageSrc && !added[i]) d.push(`no copy ${i + 1} of the image`); });
  const perBlock = [];
  for (let i = 0; i < Math.min(added.length, originals.length); i += 1) {
    const a = added[i];
    const o = originals[i];
    const pb = [];
    if (before.some((b) => b.id === a.id) || originals.some((b) => b.id === a.id)) pb.push('not a new id');
    for (const k of ['type', 'w', 'h', 'content', 'tableData', 'caption', 'note', 'imageFit']) {
      if (JSON.stringify(a[k] ?? null) !== JSON.stringify(o[k] ?? null)) pb.push(`${k} ${JSON.stringify(a[k] ?? null).slice(0, 40)} want ${JSON.stringify(o[k] ?? null).slice(0, 40)}`);
    }
    const wantX = kept(o.x + offset, o.w, sheet.w);
    const wantY = kept(o.y + offset, o.h, sheet.h);
    if (Math.abs(a.x - wantX) > 0.01 || Math.abs(a.y - wantY) > 0.01) pb.push(`at (${round(a.x)}, ${round(a.y)}), want (${round(wantX)}, ${round(wantY)})`);
    let paint = null;
    let drawn = null;
    if (o.type === 'image' && o.imageSrc) {
      const re = new RegExp(`^storage://${uid}/${posterId}/${a.id}-[A-Za-z0-9_-]+\\.png$`);
      if (!re.test(a.imageSrc ?? '')) d.push(`copy ${i + 1}: imageSrc ${short(a.imageSrc)}, want its own file {user}/{poster}/${a.id}-{random}.png`);
      if (!sameBytes(bytesAt(s.state, a.imageSrc), originalBytes[o.id])) d.push(`copy ${i + 1}: its file does not hold the original's bytes`);
      const orig = after.find((b) => b.id === o.id);
      if (orig && orig.imageSrc !== o.imageSrc) d.push('the original\'s imageSrc changed');
      if (orig && !sameBytes(bytesAt(s.state, orig.imageSrc), originalBytes[o.id])) d.push('the original\'s file changed');
      paint = await waitPaint(s.page, a.id, IMAGES.A.rgb);
      const im = (await drawnBlock(s.page, a.id))?.img;
      drawn = im ? `${im.src} ${im.nw}x${im.nh}` : 'none';
      if (paint === null || paint < 0.5) pb.push(`its image covers ${paint} of its box`);
    }
    perBlock.push({ id: a.id, type: a.type, x: round(a.x), y: round(a.y), w: round(a.w), h: round(a.h), ...(a.imageSrc !== null && a.imageSrc !== undefined ? { src: short(a.imageSrc) } : {}), ...(paint !== null ? { paint, drawn } : {}), problems: pb });
    p.push(...pb.map((x) => `copy ${i + 1} (${o.type}): ${x}`));
  }
  const others = othersChanged(before, after, []);
  const made = added.length > 0;
  const seededMark = after.some((b) => b.locked && !before.some((o) => o.id === b.id));
  let undone = null;
  let stillDrawn = null;
  if (made) {
    await s.page.keyboard.press(`${MOD}+z`);
    const seeded = after.filter((b) => b.locked && !before.some((o) => o.id === b.id));
    undone = await storedEquals(s.state, posterId, [...before, ...seeded], 10000) || await storedEquals(s.state, posterId, before, 500);
    stillDrawn = await s.page.evaluate((ids) => ids.filter((x) => document.querySelector(`#poster-canvas [data-block-id="${x}"]`)).length, added.map((b) => b.id));
  }
  return {
    claims: { C3: p.length > 0, D: originals.some((o) => o.type === 'image' && o.imageSrc) ? d.length > 0 : null, N: others.length > 0, U: made ? (!undone || stillDrawn > 0) : null },
    numbers: { stored: changed, added: added.length, blocks: perBlock, othersChanged: others.join(',') || 'none', undoRestored: undone, drawnAfterUndo: stillDrawn, ...(seededMark ? { creditMarkSeededOnLoad: true } : {}), problems: [...p, ...d].join(' ; ') || 'none' },
    added,
  };
}

// ------------------------------------------------------------ copy (C1)

/** C1: column 2's heading, text and filled image selected with a band, ⌘C; the clipboard read. With `pasteToo`, ⌘V after (C3, D, U). */
async function runCopyColumn(h, s, sc) {
  const col = await userColumn(s);
  const originals = sc.pick(col);
  await clickAway(s.page);
  await bandSelect(s.page, originals.map((b) => b.id));
  // With `noSelection`, nothing selected on the page when ⌘C is pressed (a
  // rubber band can leave text selected in WebKit, MEASURED on main: its own
  // ⌘C then copied the sidebar's words): the copy event must fire anyway.
  const afterBand = await selectionEnds(s.page);
  const pageSelection = sc.noSelection
    ? await s.page.evaluate(() => { getSelection().removeAllRanges(); return String(getSelection()); })
    : await s.page.evaluate(() => String(getSelection()).slice(0, 40));
  const t0 = await pageNow(s.page);
  await s.page.keyboard.press(`${MOD}+c`);
  await s.page.waitForTimeout(300);
  const toastsCopy = await toastsSince(s.page, t0);
  const c1 = await judgeClipboard(s, originals, sc.words ?? []);
  const claims = { C1: c1.problems.length > 0 };
  const numbers = { copied: originals.map((b) => b.type).join(','), selectionAfterBand: afterBand, pageSelection: JSON.stringify(pageSelection), clipboardText: JSON.stringify(c1.clip?.text ?? null).slice(0, 80), payload: c1.payload?.found ? `${c1.payload.json?.blocks?.length ?? '?'} blocks, v${c1.payload.json?.v}` : 'none', toasts: toastsCopy.join(' | ') || 'none', c1Problems: c1.problems.join(' ; ') || 'none' };
  if (!sc.pasteToo) return { claims, numbers, carried: c1.carried };
  await clickAway(s.page);
  const before = storedBlocks(s.state, s.id);
  const from = await eventCount(s.page);
  await s.page.keyboard.press(`${MOD}+v`);
  const r = await judgePaste(s, before, originals, { offset: 10, originalBytes: bytesOf(s, originals) });
  const k = await pasteCarried(s, from);
  return { claims: { ...claims, ...r.claims }, numbers: { ...numbers, ...r.numbers }, carried: k.ok ? c1.carried : k };
}

/**
 * C1, C3, U for a table: column 3's heading and table (a cell typed into
 * first) selected with a band, ⌘C, then ⌘V: copies 1 in down and right, the
 * table's cells as stored.
 */
async function runCopyTable(h, s) {
  await storeFirst(s);
  await sentinel(s);
  const [head, table] = column(storedBlocks(s.state, s.id), 2);
  if (head?.type !== 'heading' || table?.type !== 'table') throw new Error('precondition: column 3 is not heading, table');
  // A word in the table's first cell, typed as a user types it.
  const cell = s.page.locator(`#poster-canvas [data-block-id="${table.id}"] td [contenteditable="true"]`).first();
  await cell.click();
  await s.page.keyboard.type('ZQCELL', { delay: 10 });
  const typed = await until(() => JSON.stringify(storedBlocks(s.state, s.id).find((b) => b.id === table.id)?.tableData ?? '').includes('ZQCELL'), 10000);
  if (!typed) throw new Error('precondition: the cell\'s word was not stored');
  await s.page.waitForTimeout(500);
  await clickAway(s.page);
  const originals = [head, table].map((o) => storedBlocks(s.state, s.id).find((b) => b.id === o.id));
  await bandSelect(s.page, originals.map((b) => b.id));
  await s.page.keyboard.press(`${MOD}+c`);
  await s.page.waitForTimeout(300);
  const c1 = await judgeClipboard(s, originals, ['ZQCELL']);
  await clickAway(s.page);
  const before = storedBlocks(s.state, s.id);
  const from = await eventCount(s.page);
  await s.page.keyboard.press(`${MOD}+v`);
  const r = await judgePaste(s, before, originals, { offset: 10 });
  const k = await pasteCarried(s, from);
  return {
    claims: { C1: c1.problems.length > 0, ...r.claims },
    numbers: { clipboardText: JSON.stringify(c1.clip?.text ?? null).slice(0, 80), c1Problems: c1.problems.join(' ; ') || 'none', ...r.numbers },
    carried: k.ok ? c1.carried : k,
  };
}

/**
 * PT: a block selected with a band, then text selected in the sidebar (the
 * Insert tab's "Pasting tables" card, a triple-click), ⌘C: the browser's own
 * copy of that text, no payload (found by record 32's table-paste-check
 * after the change: its copy source's ⌘C, with a table still selected, was
 * taken for a block copy).
 */
async function runCopyPageText(h, s) {
  await storeFirst(s);
  await sentinel(s);
  const [, text] = column(storedBlocks(s.state, s.id), 1);
  await typeInto(s, text.id, 'ZQALPHA words');
  await clickAway(s.page);
  await bandSelect(s.page, [text.id]);
  await openTab(s.page, 'insert');
  const card = s.page.locator('div', { hasText: /^Copy cells from/ }).last();
  await card.scrollIntoViewIfNeeded();
  await s.page.waitForTimeout(200);
  const b = await card.boundingBox();
  if (!b) throw new Error('precondition: the Pasting tables card is not drawn');
  await s.page.mouse.click(b.x + 20, b.y + 8, { clickCount: 3 });
  await s.page.waitForTimeout(200);
  const pageSelection = await s.page.evaluate(() => String(getSelection()).slice(0, 60));
  const ends = await selectionEnds(s.page);
  const stillSelected = await s.page.evaluate(() => document.querySelectorAll('#poster-canvas [data-postr-selected="true"]').length);
  await s.page.keyboard.press(`${MOD}+c`);
  await s.page.waitForTimeout(300);
  const clip = await readClipboard(s.page);
  const pl = clip ? await payloadIn(s.page, clip.html) : { found: false };
  const p = [];
  if (pl.found) p.push('a block payload on the clipboard');
  if (!(clip?.text ?? '').includes('Copy cells from')) p.push(`the selected text not copied (text/plain ${JSON.stringify((clip?.text ?? '').slice(0, 40))})`);
  return {
    claims: { PT: p.length > 0 },
    numbers: { pageSelection: JSON.stringify(pageSelection), selectionEnds: ends, blocksSelectedAtCopy: stillSelected, clipboardText: JSON.stringify((clip?.text ?? '').slice(0, 60)), problems: p.join(' ; ') || 'none' },
    carried: { ok: !!clip?.trusted && pageSelection.includes('Copy cells from') && stillSelected > 0, why: `probe read: trusted=${clip?.trusted}; the card's text selected: ${pageSelection.includes('Copy cells from')}; blocks selected at ⌘C: ${stillSelected}` },
  };
}

/** EDIT (a guard): the caret in a text block with its words selected, ⌘C: the text's own copy, no payload. */
async function runCopyEditing(h, s) {
  await storeFirst(s);
  await sentinel(s);
  const [, text] = column(storedBlocks(s.state, s.id), 1);
  await typeInto(s, text.id, 'ZQEDIT words');
  await s.page.keyboard.press(`${MOD}+a`);
  await s.page.keyboard.press(`${MOD}+c`);
  await s.page.waitForTimeout(200);
  const clip = await readClipboard(s.page);
  const pl = clip ? await payloadIn(s.page, clip.html) : { found: false };
  return {
    claims: { EDIT: pl.found },
    numbers: { clipboardText: JSON.stringify(clip?.text ?? null).slice(0, 60), payload: pl.found ? 'found' : 'none' },
    carried: { ok: !!clip?.trusted && (clip?.text ?? '').includes('ZQEDIT'), why: `probe read: trusted=${clip?.trusted} text=${JSON.stringify(clip?.text?.slice(0, 30))}` },
  };
}

// ------------------------------------------------- paste elsewhere (C5)

/**
 * C5: column 2 copied (⌘C), then pasted after a reload, in another poster
 * opened at /p/new in the same tab, or in a second tab at /p/new.
 */
async function runPasteElsewhere(h, s, sc) {
  const col = await userColumn(s);
  const originals = [col.head, col.text, col.img];
  const originalBytes = bytesOf(s, originals);
  await clickAway(s.page);
  await bandSelect(s.page, originals.map((b) => b.id));
  await s.page.keyboard.press(`${MOD}+c`);
  await s.page.waitForTimeout(300);
  let target = s;
  let offset = 10;
  if (sc.where === 'reload') {
    await s.page.reload();
    await s.page.waitForSelector('#poster-canvas [data-block-id]', { timeout: 30000 });
    await s.page.waitForTimeout(1200);
    await watchEvents(s.page);
  } else if (sc.where === 'poster') {
    // Another poster of the user's, opened as from the dashboard (a second
    // /p/new in this session reopens the first poster): an empty row, which
    // the editor fills with the 3-column layout's fresh blocks.
    const id = await openSeededPoster(h, s, []);
    await watchEvents(s.page);
    target = { ...s, id };
    await storeFirst(target);
    offset = 0;
  } else if (sc.where === 'tab') {
    const page = await s.context.newPage();
    page.on('pageerror', (e) => s.state.errors.push(String(e).slice(0, 300)));
    const id = await openSeededPoster(h, { ...s, page }, []);
    target = { ...s, page, id };
    await watchEvents(page);
    await storeFirst(target);
    offset = 0;
  }
  await watchToasts(target.page);
  await clickAway(target.page);
  const before = storedBlocks(s.state, target.id);
  const from = await eventCount(target.page);
  await target.page.keyboard.press(`${MOD}+v`);
  const r = await judgePaste(target, before, originals, { offset, originalBytes, posterId: target.id });
  const carried = await pasteCarried(target, from);
  return { claims: { C5: r.claims.C3, D: r.claims.D, N: r.claims.N, U: r.claims.U }, numbers: { where: sc.where, offset, ...r.numbers }, carried };
}

// ----------------------------------------------------------- cut (C2)

/**
 * C2: column 2's text and image selected, ⌘X: both removed (one undo
 * step), the clipboard holds them; then ⌘V puts copies back at their
 * places (the originals are gone), each image with its own file; one ⌘Z
 * removes the copies and a second brings the cut blocks back.
 */
async function runCut(h, s) {
  const col = await userColumn(s);
  const originals = [col.text, col.img];
  const originalBytes = bytesOf(s, originals);
  await clickAway(s.page);
  const before = storedBlocks(s.state, s.id);
  await bandSelect(s.page, originals.map((b) => b.id));
  await s.page.keyboard.press(`${MOD}+x`);
  await s.page.waitForTimeout(300);
  const gone = await until(() => {
    const now = storedBlocks(s.state, s.id);
    return originals.every((o) => !now.some((b) => b.id === o.id));
  }, 8000);
  const p = [];
  if (!gone) p.push('the cut blocks are still on the poster');
  await s.page.waitForTimeout(800);
  const afterCut = storedBlocks(s.state, s.id);
  const othersCut = othersChanged(before, afterCut, originals.map((b) => b.id));
  const c1 = await judgeClipboard(s, originals, ['ZQALPHA']);
  p.push(...c1.problems.map((x) => `clipboard: ${x}`));
  await clickAway(s.page);
  const from = await eventCount(s.page);
  await s.page.keyboard.press(`${MOD}+v`);
  const r = await judgePaste(s, afterCut, originals, { offset: 0, originalBytes });
  // The paste's ⌘Z ran in judgePaste; one more ⌘Z must undo the cut.
  let cutUndone = null;
  if (gone) {
    await s.page.keyboard.press(`${MOD}+z`);
    cutUndone = await storedEquals(s.state, s.id, before, 10000);
  }
  return {
    claims: { C2: p.length > 0 || !cutUndone, C3: r.claims.C3, D: r.claims.D, N: othersCut.length > 0 || r.claims.N, U: r.claims.U },
    numbers: { removed: gone, othersChangedByCut: othersCut.join(',') || 'none', cutUndoneByOneMore: cutUndone, c2Problems: p.join(' ; ') || 'none', ...r.numbers },
    carried: c1.carried.ok ? await pasteCarried(s, from) : c1.carried,
  };
}

// ------------------------------------------------------- refused (C4)

/**
 * C4: the title and the authors block (with `alsoHeading`, column 1's
 * heading too) copied and pasted into the same poster: the title and the
 * authors block refused with the toast; the heading pasted.
 */
async function runRefuseHeader(h, s, sc) {
  await storeFirst(s);
  await sentinel(s);
  const blocks = storedBlocks(s.state, s.id);
  const title = blocks.find((b) => b.type === 'title');
  const authors = blocks.find((b) => b.type === 'authors');
  const head = column(blocks, 0)[0];
  if (sc.alsoHeading) await typeInto(s, head.id, 'ZQHEAD1');
  await clickAway(s.page);
  const picked = sc.alsoHeading ? [title, authors, storedBlocks(s.state, s.id).find((b) => b.id === head.id)] : [title, authors];
  await bandSelect(s.page, picked.map((b) => b.id));
  await s.page.keyboard.press(`${MOD}+c`);
  await s.page.waitForTimeout(300);
  await clickAway(s.page);
  const before = storedBlocks(s.state, s.id);
  const from = await eventCount(s.page);
  const t0 = await pageNow(s.page);
  await s.page.keyboard.press(`${MOD}+v`);
  await s.page.waitForTimeout(1200);
  const toasts = await toastsSince(s.page, t0);
  const wantToast = /already has a title/i;
  const wantToast2 = /authors/i;
  const msg = !toasts.some((t) => wantToast.test(t) && wantToast2.test(t));
  if (!sc.alsoHeading) {
    await s.page.waitForTimeout(1500);
    const after = storedBlocks(s.state, s.id);
    const added = addedBlocks(before, after);
    return {
      claims: { C4: added.length > 0, MSG: msg, N: othersChanged(before, after, []).length > 0 },
      numbers: { added: added.map((b) => b.type).join(',') || 'none', toasts: toasts.join(' | ') || 'none' },
      carried: await pasteCarried(s, from),
    };
  }
  const r = await judgePaste(s, before, [picked[2]], { offset: 10 });
  return {
    claims: { C4: r.claims.C3, MSG: msg, N: r.claims.N, U: r.claims.U },
    numbers: { toasts: toasts.join(' | ') || 'none', ...r.numbers },
    carried: await pasteCarried(s, from),
  };
}

/** C4: Insert › Logo (an empty logo block, selected), ⌘C, ⌘V: refused with the toast, the poster unchanged. */
async function runRefuseLogo(h, s) {
  await storeFirst(s);
  await sentinel(s);
  const before0 = storedBlocks(s.state, s.id);
  await openTab(s.page, 'insert');
  await s.page.locator('button', { hasText: /^\+ Logo/ }).first().click();
  const logo = await until(() => addedBlocks(before0, storedBlocks(s.state, s.id)).find((b) => b.type === 'logo'), 8000);
  if (!logo) throw new Error('precondition: Insert › Logo added no logo');
  await s.page.waitForTimeout(800);
  // Insert selects the new logo (and nothing is in edit mode): ⌘C from there.
  const sel = await s.page.evaluate(() => [...new Set([...document.querySelectorAll('#poster-canvas [data-postr-selected="true"]')].map((e) => e.getAttribute('data-block-id')))]);
  if (sel.length !== 1 || sel[0] !== logo.id) throw new Error(`precondition: after Insert › Logo the selection is ${JSON.stringify(sel)}`);
  await s.page.keyboard.press(`${MOD}+c`);
  await s.page.waitForTimeout(300);
  await clickAway(s.page);
  const before = storedBlocks(s.state, s.id);
  const from = await eventCount(s.page);
  const t0 = await pageNow(s.page);
  await s.page.keyboard.press(`${MOD}+v`);
  await s.page.waitForTimeout(2500);
  const after = storedBlocks(s.state, s.id);
  const added = addedBlocks(before, after);
  const toasts = await toastsSince(s.page, t0);
  return {
    claims: { C4: added.length > 0, MSG: !toasts.some((t) => /already has a logo/i.test(t)), N: othersChanged(before, after, []).length > 0 },
    numbers: { added: added.map((b) => b.type).join(',') || 'none', toasts: toasts.join(' | ') || 'none' },
    carried: await pasteCarried(s, from),
  };
}

/**
 * C2 and C4 with the credit mark: a poster holding a text block and the
 * credit mark, both selected with a band, ⌘X: the text removed and on the
 * clipboard, the mark kept with its toast and not on the clipboard; then a
 * logo pasted (a payload written by hand) goes in: the credit mark is not a
 * user logo.
 */
async function runCredit(h, s) {
  const text = plainBlock('zqtext01', 'text', 300, 280, 100, 40, { content: 'ZQCREDIT words' });
  const mark = CREDIT_MARK(405, 330);
  const id = await openSeededPoster(h, s, [text, mark]);
  s.id = id;
  await watchEvents(s.page);
  await watchToasts(s.page);
  await sentinel(s);
  const before = storedBlocks(s.state, s.id);
  if (!before.some((b) => b.id === mark.id)) throw new Error('precondition: the seeded poster has no credit mark');
  await bandSelect(s.page, [text.id, mark.id]);
  const t0 = await pageNow(s.page);
  await s.page.keyboard.press(`${MOD}+x`);
  await s.page.waitForTimeout(1500);
  const toasts = await toastsSince(s.page, t0);
  const afterCut = storedBlocks(s.state, s.id);
  const p = [];
  if (afterCut.some((b) => b.id === text.id)) p.push('the text was not cut');
  if (!afterCut.some((b) => b.id === mark.id)) p.push('the credit mark was removed');
  if (!toasts.some((t) => /credit stays/i.test(t))) p.push('no credit toast');
  const c1 = await judgeClipboard(s, [before.find((b) => b.id === text.id)], ['ZQCREDIT']);
  p.push(...c1.problems.map((x) => `clipboard: ${x}`));
  // A logo pasted into this poster, which holds only the credit mark: pasted.
  const logoPayload = { v: 1, blocks: [plainBlock('zqlogo01', 'logo', 20, 20, 50, 40)] };
  if (!(await copyToClipboard(s.page, { 'text/html': payloadHtml(logoPayload, 'ZQ logo'), 'text/plain': 'ZQ logo' }))) throw new Error('precondition: the payload copy did not run');
  await clickAway(s.page);
  const before2 = storedBlocks(s.state, s.id);
  const from = await eventCount(s.page);
  await s.page.keyboard.press(`${MOD}+v`);
  const r = await judgePaste(s, before2, logoPayload.blocks, { offset: 0 });
  return {
    claims: { C2: p.length > 0, C4: r.claims.C3, N: r.claims.N, U: r.claims.U },
    numbers: { toasts: toasts.join(' | ') || 'none', c2Problems: p.join(' ; ') || 'none', ...r.numbers },
    carried: c1.carried.ok ? await pasteCarried(s, from, { html: true }) : c1.carried,
  };
}

// ---------------------------------------------------------- files (D)

/**
 * D, R, DR: column 2's image filled with A, selected with a band, ⌘D: the
 * clone has its own file holding A; then Replace on the original with C
 * (also a PNG): a new name, A's file untouched; after a reload the
 * original draws C and the clone A.
 */
async function runDuplicateFile(h, s) {
  const col = await userColumn(s);
  const orig = col.img;
  const aBytes = bytesAt(s.state, orig.imageSrc);
  await clickAway(s.page);
  await bandSelect(s.page, [orig.id]);
  const before = storedBlocks(s.state, s.id);
  const copiesFrom = s.state.copies.length;
  await s.page.keyboard.press(`${MOD}+d`);
  await settledChange(s.state, s.id, before, { timeout: 12000 });
  const afterDup = storedBlocks(s.state, s.id);
  const clone = addedBlocks(before, afterDup)[0];
  const d = [];
  if (!clone) d.push('no clone');
  else {
    if (clone.imageSrc === orig.imageSrc) d.push('the clone shares the original\'s file');
    if (!new RegExp(`^storage://${s.uid}/${s.id}/${clone.id}-[A-Za-z0-9_-]+\\.png$`).test(clone.imageSrc ?? '')) d.push(`the clone's imageSrc ${short(clone.imageSrc)}`);
    if (!sameBytes(bytesAt(s.state, clone.imageSrc), aBytes)) d.push('the clone\'s file is not A');
  }
  if (afterDup.find((b) => b.id === orig.id)?.imageSrc !== orig.imageSrc) d.push('the original\'s imageSrc changed');
  // Replace the original's picture with C, of the same type.
  await clickAway(s.page);
  const folderBefore = [...s.state.objects.keys()].filter((k) => k.startsWith(`${s.uid}/${s.id}/`)).length;
  const read = () => storedBlocks(s.state, s.id).find((b) => b.id === orig.id)?.imageSrc;
  await replaceImage(s, orig.id, fileOf(IMAGES.C), read);
  const replaced = storedBlocks(s.state, s.id).find((b) => b.id === orig.id);
  const r = [];
  if (replaced.imageSrc === orig.imageSrc) r.push('Replace kept the old file name');
  if (!sameBytes(bytesAt(s.state, orig.imageSrc), aBytes)) r.push('the old file was overwritten');
  if (!new RegExp(`^storage://${s.uid}/${s.id}/${orig.id}-[A-Za-z0-9_-]+\\.png$`).test(replaced.imageSrc ?? '')) r.push(`the new imageSrc ${short(replaced.imageSrc)}`);
  const folderAfter = [...s.state.objects.keys()].filter((k) => k.startsWith(`${s.uid}/${s.id}/`)).length;
  // After a reload, each block draws its own picture.
  await s.page.waitForTimeout(1500);
  await s.page.reload();
  await s.page.waitForSelector(`#poster-canvas [data-block-id="${orig.id}"]`, { timeout: 30000 });
  let o = null;
  let c = null;
  for (let k = 0; k < 40 && (o === null || (clone && c === null)); k += 1) {
    o = await drawnImage(s.page, orig.id);
    c = clone ? await drawnImage(s.page, clone.id) : 'none';
    await s.page.waitForTimeout(250);
  }
  const dr = [];
  if (o !== 'C') dr.push(`the original draws ${o}, want C`);
  if (clone && c !== 'A') dr.push(`the clone draws ${c}, want A`);
  return {
    claims: { D: d.length > 0, R: r.length > 0, DR: dr.length > 0 },
    numbers: {
      original: short(orig.imageSrc), clone: clone ? short(clone.imageSrc) : 'none', storageCopies: s.state.copies.slice(copiesFrom).map((x) => x.status).join(',') || 'none',
      replaced: short(replaced.imageSrc), filesInPosterFolder: `${folderBefore} → ${folderAfter} after one Replace`, drawnAfterReload: `original ${o} · clone ${c}`,
      problems: [...d, ...r, ...dr].join(' ; ') || 'none',
    },
    carried: { ok: true, why: 'keys and Replace (no clipboard)' },
  };
}

/** DU and R: column 2's image filled with A, Replace with C (a PNG), one ⌘Z: the poster as before and A drawn (its file untouched). */
async function runReplaceUndo(h, s) {
  const col = await userColumn(s);
  const orig = col.img;
  const aBytes = bytesAt(s.state, orig.imageSrc);
  await clickAway(s.page);
  const before = storedBlocks(s.state, s.id);
  const read = () => storedBlocks(s.state, s.id).find((b) => b.id === orig.id)?.imageSrc;
  await replaceImage(s, orig.id, fileOf(IMAGES.C), read);
  const replaced = storedBlocks(s.state, s.id).find((b) => b.id === orig.id);
  const r = [];
  if (replaced.imageSrc === orig.imageSrc) r.push('Replace kept the old file name');
  if (!sameBytes(bytesAt(s.state, orig.imageSrc), aBytes)) r.push('the old file was overwritten');
  await clickAway(s.page);
  await s.page.keyboard.press(`${MOD}+z`);
  const undone = await storedEquals(s.state, s.id, before, 10000);
  await s.page.waitForTimeout(1500);
  const drawn = await drawnImage(s.page, orig.id);
  const paintA = await waitPaint(s.page, orig.id, IMAGES.A.rgb, { timeout: 4000 });
  const du = [];
  if (!undone) du.push('one ⌘Z did not bring back the poster as stored before');
  if (drawn !== 'A') du.push(`draws ${drawn} after the ⌘Z, want A`);
  if (paintA === null || paintA < 0.5) du.push(`A covers ${paintA} of the box`);
  return {
    claims: { R: r.length > 0, DU: du.length > 0 },
    numbers: { before: short(orig.imageSrc), replaced: short(replaced.imageSrc), undoRestored: undone, drawnAfterUndo: drawn, paintA, problems: [...r, ...du].join(' ; ') || 'none' },
    carried: { ok: true, why: 'Replace and ⌘Z (no clipboard)' },
  };
}

/** G: a guest copies column 2's filled image and pastes it: a copy with its own file under the guest's folder. */
async function runGuest(h, s) {
  const col = await userColumn(s);
  const originals = [col.img];
  await clickAway(s.page);
  await bandSelect(s.page, [col.img.id]);
  await s.page.keyboard.press(`${MOD}+c`);
  await s.page.waitForTimeout(300);
  await clickAway(s.page);
  const before = storedBlocks(s.state, s.id);
  const from = await eventCount(s.page);
  await s.page.keyboard.press(`${MOD}+v`);
  const r = await judgePaste(s, before, originals, { offset: 10, originalBytes: bytesOf(s, originals) });
  return { claims: { G: r.claims.C3 || r.claims.D, N: r.claims.N, U: r.claims.U }, numbers: { anonymous: s.state.anonymous, ...r.numbers }, carried: await pasteCarried(s, from) };
}

// --------------------------------------------------------------- list

export const BLOCK_SCENARIOS = [
  { id: 'C-copy-text', run: runCopyColumn, noSelection: true, pick: (c) => [c.text], words: ['ZQALPHA words'], how: 'C1: column 2\'s text (typed "ZQALPHA words") selected with a rubber band, nothing selected on the page, ⌘C: the clipboard holds a version 1 payload of that block, as stored, and its words as plain text (read by a real ⌘V into a field the harness adds)' },
  { id: 'C-copy-several', run: runCopyColumn, pick: (c) => [c.head, c.text, c.img], words: ['ZQHEAD', 'ZQALPHA words'], how: 'C1: column 2\'s heading, text and filled image selected with a band, ⌘C: a payload of the three, in the poster\'s order, and their words' },
  { id: 'C-paste-same', run: runCopyColumn, pasteToo: true, pick: (c) => [c.head, c.text, c.img], words: ['ZQHEAD'], how: 'C1, C3, D, U: the same, then a click on the workspace and ⌘V: three copies with new ids 1 in down and right of the originals, the image with its own file (a storage copy into the poster\'s folder, keyed by the copy\'s id), drawn; one ⌘Z removes the three' },
  { id: 'C-copy-table', run: runCopyTable, how: 'C1, C3, U: column 3\'s heading and table (a word typed in its first cell) selected with a band, ⌘C, ⌘V: the payload holds the table as stored and its cells\' words; copies 1 in down and right with the table\'s cells; one ⌘Z removes them' },
  { id: 'C-copy-page-text', run: runCopyPageText, how: 'PT: column 2\'s text selected with a band, then the Insert tab\'s "Pasting tables" card text selected with a triple-click (the block still selected), ⌘C: the browser\'s own copy of the card\'s text, no payload' },
  { id: 'C-copy-editing', run: runCopyEditing, how: 'EDIT (a guard): the caret in column 2\'s text, ⌘A then ⌘C: the text\'s own copy (its words), no payload' },
  { id: 'C-paste-reload', run: runPasteElsewhere, where: 'reload', how: 'C5: column 2 copied (⌘C), the page reloaded, ⌘V: the three copies as C-paste-same' },
  { id: 'C-paste-poster', run: runPasteElsewhere, where: 'poster', how: 'C5: column 2 copied, another poster of the user\'s opened in the same tab (as from the dashboard: an empty row the editor fills with the 3-column layout), ⌘V: the copies at the originals\' places, the image copied into that poster\'s folder' },
  { id: 'C-paste-tab', run: runPasteElsewhere, where: 'tab', how: 'C5: column 2 copied, another poster opened in a second tab, ⌘V there: the copies at the originals\' places, the image copied into that poster\'s folder' },
  { id: 'C-cut', run: runCut, how: 'C2, C3, D, U: column 2\'s text and image selected, ⌘X: both removed, on the clipboard; ⌘V puts copies back at their places (the originals are gone), the image with its own file; one ⌘Z removes the copies, one more brings back the cut blocks' },
  { id: 'C-refuse-header', run: runRefuseHeader, how: 'C4: the title and the authors block selected, ⌘C, ⌘V into the same poster: neither pasted, a toast says the poster already has a title and an authors block' },
  { id: 'C-refuse-header-heading', run: runRefuseHeader, alsoHeading: true, how: 'C4: the title, the authors block and column 1\'s heading: the heading pasted 1 in down and right, the title and authors refused with the toast' },
  { id: 'C-refuse-logo', run: runRefuseLogo, how: 'C4: Insert › Logo, the logo selected, ⌘C, ⌘V: refused, a toast says the poster already has a logo' },
  { id: 'C-credit', run: runCredit, how: 'C2, C4: a poster with a text block and the credit mark, both selected with a band, ⌘X: the text cut and on the clipboard, the mark kept with its toast and not copied; a logo pasted (a payload written by hand) goes in: the credit mark is not a user logo' },
  ...UNTRUSTED_SCENARIOS,
  { id: 'C-dup-file', run: runDuplicateFile, how: 'D, R, DR: column 2\'s image filled with A, ⌘D: the clone has its own file holding A; Replace on the original with C (a PNG): a new file name, A\'s file untouched; after a reload the original draws C and the clone A' },
  { id: 'C-replace-undo', run: runReplaceUndo, how: 'R, DU: column 2\'s image filled with A, Replace with C (a PNG), one ⌘Z: the poster as before and A drawn' },
  { id: 'C-guest', run: runGuest, guest: true, how: 'G: a guest (an anonymous session) copies column 2\'s filled image and pastes it: a copy with its own file under the guest\'s own folder' },
  ...REVIEW_BLOCK_SCENARIOS,
  ...ROUND2_BLOCK_SCENARIOS,
  ...ROUND3_BLOCK_SCENARIOS,
  ...FINAL_BLOCK_SCENARIOS,
];

export async function runBlockScenario(h, openSignedIn, sc) {
  const s = await session(h, openSignedIn, sc);
  try {
    const r = await sc.run(h, s, sc);
    return { ...r, pageErrors: s.state.errors };
  } finally {
    await s.context.close().catch(() => {});
  }
}
