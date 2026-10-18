/**
 * Review round 1 of record 35 (docs/fixes/35-block-copy.md §9), folded into
 * scripts/canvas-paste-check.mjs (`--only C-r1`): the reviewer's probes that
 * found a defect, re-entered as the user enters (blocks selected with a
 * rubber band, a real ⌘X, ⌘C, ⌘V and ⌘D; a payload put on the clipboard by
 * record 32's copy source, a real ⌘C), on posters seeded into the fake
 * backend with the files their blocks name. What is read: the poster rows,
 * the fake storage's files and copies, the system clipboard (a real ⌘V into
 * a field the harness adds), what the canvas draws (an image's natural size)
 * and the toasts. Nothing calls the app's store or its modules.
 *
 * CLAIMS (observed = the defect present)
 *   CUT  ⌘X removed a block that ⌘V cannot bring back as it was (R1-2: a
 *        logo whose picture is an address, as the presets and My Logos
 *        store it; R1-4: a block over the payload's bounds), or put such a
 *        block on the clipboard, or the other selected blocks were not cut
 *   DUP  ⌘D of a stored image made a clone that draws no picture (R1-3:
 *        storage's copy unreachable), or a clone that kept its original's
 *        file drew the original's new picture after a Replace and a reload
 *   LEG  ⌘C, ⌘V of an image stored under an older name pasted a block
 *        without its own file holding the picture (R1-3)
 *   RACE a second ⌘V pressed while the first paste copies its files brought
 *        a second title into the poster (R1-5, C4)
 *   MSG  the rule's toast not shown; N another block changed; U one ⌘Z did
 *        not undo the step
 *
 * INFORMATION (printed, not counted)
 *   C-r1-i-insert-logo-reopened (R1-6): Insert › Logo on a stored poster
 *   reopened (the credit mark seeded on load): what is selected, what ⌘C
 *   puts on the clipboard, what ⌘V pastes.
 */
import { MOD, clickAway, openTab } from './undoKit.mjs';
import { copyToClipboard } from './tablePasteScenarios.mjs';
import { IMAGES, addedBlocks, eventCount, fileOf, othersChanged, settledChange, storedBlocks, storedEquals, until } from './canvasPasteKit.mjs';
import {
  CREDIT_MARK, SENTINEL, bandSelect, bytesAt, drawnImage, openPosterWith, pageNow, pasteCarried, payloadHtml, payloadIn, plainBlock, readClipboard,
  replaceImage, sameBytes, selectedIds, sentinel, short, toastsSince,
} from './blockCopyKit.mjs';

const A = () => fileOf(IMAGES.A).bytes;
const has = (s, id) => storedBlocks(s.state, s.id).some((b) => b.id === id);
/**
 * The blocks a step added, the credit mark left out: the editor seeds the
 * mark when it opens a stored poster, and it reaches the row with the next
 * save (not the step's).
 */
const madeSince = (s, before) => addedBlocks(before, storedBlocks(s.state, s.id)).filter((b) => !b.locked);
/** Whether the row is back to `before` (plus the credit mark seeded on load, if it was stored since). */
async function backTo(s, before, timeout = 6000) {
  const seeded = storedBlocks(s.state, s.id).filter((b) => b.locked && !before.some((o) => o.id === b.id));
  return (await storedEquals(s.state, s.id, [...before, ...seeded], timeout)) || (await storedEquals(s.state, s.id, before, 300));
}

/** The toast texts since `t0`, joined for printing. */
const shown = async (s, t0) => (await toastsSince(s.page, t0)).join(' | ') || 'none';

/** Wait until a stored image block draws a picture (its natural size), up to ~6 s. */
async function drawnSoon(page, id) {
  let got = null;
  for (let k = 0; k < 24 && got === null; k += 1) {
    got = await drawnImage(page, id);
    if (got === null) await page.waitForTimeout(250);
  }
  return got;
}

// ------------------------------------------------------------- ⌘X (CUT)

/**
 * R1-2: a poster with a text block, a logo whose picture is an address (as a
 * preset or a My Logos logo is stored) and the credit mark; the text and the
 * logo selected with a band, ⌘X. The rule: the text is cut and on the
 * clipboard; the logo stays, and a toast says why (⌘V could not bring its
 * picture back: an address is never pasted, C6).
 */
async function runCutAddressLogo(h, s) {
  const src = 'https://zq-logo.invalid/user-logos/zq.png?token=abc';
  const text = plainBlock('zqtext1', 'text', 40, 200, 100, 40, { content: 'ZQCUT words' });
  const logo = plainBlock('zqlogo1', 'logo', 200, 120, 60, 40, { imageSrc: src });
  await openPosterWith(h, s, () => ({ blocks: [text, logo, CREDIT_MARK(420, 330)] }));
  await sentinel(s);
  const before = storedBlocks(s.state, s.id);
  await bandSelect(s.page, [text.id, logo.id]);
  const t0 = await pageNow(s.page);
  await s.page.keyboard.press(`${MOD}+x`);
  await until(() => !has(s, text.id) || !has(s, logo.id), 4000);
  await s.page.waitForTimeout(1200);
  const toasts = await shown(s, t0);
  const afterCut = storedBlocks(s.state, s.id);
  const clip = await readClipboard(s.page);
  const pl = clip ? await payloadIn(s.page, clip.html) : { found: false };
  const carriedIds = pl.found ? (pl.json?.blocks ?? []).map((b) => b.id) : [];
  const p = [];
  if (!afterCut.some((b) => b.id === logo.id)) p.push('the logo was cut');
  else if (afterCut.find((b) => b.id === logo.id).imageSrc !== src) p.push('the logo\'s picture changed');
  if (afterCut.some((b) => b.id === text.id)) p.push('the text was not cut');
  if (carriedIds.includes(logo.id)) p.push('the logo is on the clipboard');
  if (!carriedIds.includes(text.id)) p.push('the text is not on the clipboard');
  // What a paste brings back now (information): before the correction, an empty logo.
  await clickAway(s.page);
  const from = await eventCount(s.page);
  const t1 = await pageNow(s.page);
  await s.page.keyboard.press(`${MOD}+v`);
  await settledChange(s.state, s.id, afterCut, { timeout: 6000, quiet: 1200 }).catch(() => null);
  const pasted = madeSince(s, afterCut);
  return {
    claims: { CUT: p.length > 0, MSG: !/stays on the canvas/i.test(toasts), N: othersChanged(before, afterCut, [text.id, logo.id]).length > 0 },
    numbers: {
      logoAfterCut: afterCut.some((b) => b.id === logo.id) ? short(afterCut.find((b) => b.id === logo.id).imageSrc) : 'gone', textAfterCut: afterCut.some((b) => b.id === text.id) ? 'there' : 'gone',
      clipboard: pl.found ? carriedIds.join(',') : JSON.stringify((clip?.text ?? '').slice(0, 30)), cutToasts: toasts,
      pastedAfter: pasted.map((b) => `${b.type}${b.type === 'logo' ? ` src ${short(b.imageSrc)}` : ''} (${b.x},${b.y})`).join(' ') || 'none', pasteToasts: await shown(s, t1),
      problems: p.join(' ; ') || 'none',
    },
    carried: clip?.trusted ? await pasteCarried(s, from) : { ok: false, why: 'the clipboard could not be read' },
  };
}

/**
 * R1-4: a poster with a small text block and a block over the payload's
 * bounds (a table of 51 columns, or a text of more than 100 000
 * characters), both selected with a band, ⌘X. The rule: nothing is copied or
 * cut (⌘V would refuse the payload), and a toast says so; the clipboard
 * keeps what it held.
 */
async function runCutTooBig(h, s, sc) {
  const small = plainBlock('zqsmall1', 'text', 40, 60, 100, 30, { content: 'ZQ small words' });
  const big = sc.big === 'text'
    ? plainBlock('zqbig1', 'text', 40, 120, 150, 60, { content: `ZQBIG ${'a'.repeat(100_001)}` })
    : plainBlock('zqbig1', 'table', 40, 120, 400, 40, { tableData: { rows: 1, cols: 51, cells: Array.from({ length: 51 }, (_, i) => `c${i}`), colWidths: null, borderPreset: 'apa' } });
  await openPosterWith(h, s, () => ({ blocks: [small, big] }));
  await sentinel(s);
  const before = storedBlocks(s.state, s.id);
  await bandSelect(s.page, [small.id, big.id]);
  const t0 = await pageNow(s.page);
  await s.page.keyboard.press(`${MOD}+x`);
  await until(() => !has(s, small.id) || !has(s, big.id), 3000);
  await s.page.waitForTimeout(1200);
  const toasts = await shown(s, t0);
  const afterCut = storedBlocks(s.state, s.id);
  const clip = await readClipboard(s.page);
  const pl = clip ? await payloadIn(s.page, clip.html) : { found: false };
  const p = [];
  if (!afterCut.some((b) => b.id === small.id) || !afterCut.some((b) => b.id === big.id)) p.push(`cut: ${[small, big].filter((b) => !afterCut.some((a) => a.id === b.id)).map((b) => b.id).join(',')}`);
  if (pl.found) p.push('a payload on the clipboard');
  let undoneByOne = null;
  if (p.length && !afterCut.some((b) => b.id === small.id)) {
    // Before the correction: what ⌘V brings back, and one ⌘Z.
    await clickAway(s.page);
    await s.page.keyboard.press(`${MOD}+v`);
    await s.page.waitForTimeout(1500);
    await s.page.keyboard.press(`${MOD}+z`);
    undoneByOne = await backTo(s, before, 4000);
  }
  return {
    claims: { CUT: p.length > 0, MSG: !/too large to copy/i.test(toasts), N: othersChanged(before, afterCut, [small.id, big.id]).length > 0 },
    numbers: {
      big: sc.big, bigChars: JSON.stringify(big).length, blocksAfterCut: afterCut.length, clipboard: pl.found ? `payload of ${pl.json?.blocks?.length}` : JSON.stringify((clip?.text ?? '').slice(0, 30)),
      toasts: await shown(s, t0), ...(undoneByOne !== null ? { restoredByOneUndoAfterPaste: undoneByOne } : {}), problems: p.join(' ; ') || 'none',
    },
    carried: { ok: !!clip?.trusted && (pl.found || clip.text.includes(SENTINEL) || p.length > 0), why: `probe read: trusted=${clip?.trusted} text=${JSON.stringify((clip?.text ?? '').slice(0, 30))}` },
  };
}

// ------------------------------------------------------- ⌘D (DUP, LEG)

/**
 * R1-3: a poster with an image stored under `name` (in its own folder);
 * the image selected with a band, ⌘D (with `failCopy`, storage's copy
 * request fails as a network failure does). The rule: the clone draws the
 * picture: its own file when the copy is made, else its original's file
 * (nothing overwrites or deletes a file since record 35). One ⌘Z removes it.
 */
async function runDupImage(h, s, sc) {
  const id = 'zqimg01';
  let path = null;
  await openPosterWith(h, s, (uid, posterId) => {
    path = `${uid}/${posterId}/${sc.name(id)}`;
    return { blocks: [plainBlock(id, 'image', 200, 120, 80, 50, { imageSrc: `storage://${path}` })], files: [[path, A()]] };
  });
  let attempts = 0;
  if (sc.failCopy) await s.context.route('**/storage/v1/object/copy', (route) => { attempts += 1; return route.abort('internetdisconnected'); });
  const originalDrawn = await drawnSoon(s.page, id);
  const before = storedBlocks(s.state, s.id);
  await bandSelect(s.page, [id]);
  const ids = await s.page.evaluate(() => [...document.querySelectorAll('#poster-canvas [data-block-id]')].map((e) => e.getAttribute('data-block-id')));
  const copiesFrom = s.state.copies.length;
  const t0 = await pageNow(s.page);
  const w0 = Date.now();
  await s.page.keyboard.press(`${MOD}+d`);
  const appeared = await s.page.waitForFunction((known) => [...document.querySelectorAll('#poster-canvas [data-block-id]')].some((e) => !known.includes(e.getAttribute('data-block-id'))), ids, { timeout: 15000, polling: 50 }).then(() => true).catch(() => false);
  const msToClone = appeared ? Date.now() - w0 : null;
  await settledChange(s.state, s.id, before, { timeout: 8000, quiet: 1200 }).catch(() => null);
  const clone = madeSince(s, before)[0];
  const cloneDrawn = clone ? await drawnSoon(s.page, clone.id) : null;
  const p = [];
  if (!clone) p.push('no clone');
  else {
    if (cloneDrawn !== 'A') p.push(`the clone draws ${cloneDrawn}, want A`);
    if (!sameBytes(bytesAt(s.state, clone.imageSrc), A())) p.push(`the clone's file ${short(clone.imageSrc)} does not hold A`);
    if (sc.wantOwnFile && !new RegExp(`^storage://${s.uid}/${s.id}/${clone.id}-[A-Za-z0-9_-]+\\.png$`).test(clone.imageSrc ?? '')) p.push(`the clone's imageSrc ${short(clone.imageSrc)}, want its own file`);
  }
  if (storedBlocks(s.state, s.id).find((b) => b.id === id)?.imageSrc !== `storage://${path}`) p.push('the original\'s source changed');
  let undone = null;
  let afterReplace = null;
  if (clone && sc.replaceAfter) {
    // A clone that keeps its original's file: Replace the original's picture
    // with C, reload; the clone must still draw A (nothing overwrites a file).
    await clickAway(s.page);
    await replaceImage(s, id, fileOf(IMAGES.C), () => storedBlocks(s.state, s.id).find((b) => b.id === id)?.imageSrc);
    await s.page.waitForTimeout(1500);
    await s.page.reload();
    await s.page.waitForSelector(`#poster-canvas [data-block-id="${clone.id}"]`, { timeout: 30000 });
    const o = await drawnSoon(s.page, id);
    const c = await drawnSoon(s.page, clone.id);
    afterReplace = `original ${o} · clone ${c} (A's file ${sameBytes(bytesAt(s.state, `storage://${path}`), A()) ? 'untouched' : 'CHANGED'})`;
    if (o !== 'C') p.push(`after Replace and a reload the original draws ${o}, want C`);
    if (c !== 'A') p.push(`after Replace and a reload the clone draws ${c}, want A`);
  } else if (clone) {
    await s.page.keyboard.press(`${MOD}+z`);
    undone = await backTo(s, before);
  }
  return {
    claims: { [sc.claim]: p.length > 0, U: clone && !sc.replaceAfter ? !undone : null },
    numbers: {
      original: short(`storage://${path}`), originalDrawn, msFromKeyToCloneDrawn: msToClone, copyAttempts: sc.failCopy ? attempts : s.state.copies.slice(copiesFrom).map((c) => c.status).join(',') || 'none',
      clone: clone ? short(clone.imageSrc) : 'none', cloneDrawn, toasts: await shown(s, t0), ...(sc.replaceAfter ? { drawnAfterReplaceAndReload: afterReplace } : { undoRestored: undone }), problems: p.join(' ; ') || 'none',
    },
    carried: { ok: originalDrawn === 'A', why: `the original draws ${originalDrawn} (the seeded file is read and drawn)` },
  };
}

/**
 * R1-3: an image stored under an older name (`{block}.plot_final`, which the
 * rule before record 35 wrote for a file whose name has no plain
 * extension), selected with a band, ⌘C, ⌘V: a copy 1 in down and right with
 * its own file holding the picture, drawn.
 */
async function runPasteLegacy(h, s) {
  const id = 'zqleg01';
  let path = null;
  await openPosterWith(h, s, (uid, posterId) => {
    path = `${uid}/${posterId}/${id}.plot_final`;
    return { blocks: [plainBlock(id, 'image', 200, 120, 80, 50, { imageSrc: `storage://${path}` })], files: [[path, A()]] };
  });
  await sentinel(s);
  const originalDrawn = await drawnSoon(s.page, id);
  await bandSelect(s.page, [id]);
  await s.page.keyboard.press(`${MOD}+c`);
  await s.page.waitForTimeout(300);
  await clickAway(s.page);
  const before = storedBlocks(s.state, s.id);
  const from = await eventCount(s.page);
  const t0 = await pageNow(s.page);
  await s.page.keyboard.press(`${MOD}+v`);
  await settledChange(s.state, s.id, before, { timeout: 8000, quiet: 1200 }).catch(() => null);
  const copy = madeSince(s, before)[0];
  const drawn = copy ? await drawnSoon(s.page, copy.id) : null;
  const p = [];
  if (!copy) p.push('nothing pasted');
  else {
    if (!new RegExp(`^storage://${s.uid}/${s.id}/${copy.id}-[A-Za-z0-9_-]+\\.png$`).test(copy.imageSrc ?? '')) p.push(`imageSrc ${short(copy.imageSrc)}, want its own file`);
    if (!sameBytes(bytesAt(s.state, copy.imageSrc), A())) p.push('its file does not hold A');
    if (drawn !== 'A') p.push(`draws ${drawn}, want A`);
    if (copy.x !== 210 || copy.y !== 130) p.push(`at (${copy.x}, ${copy.y}), want (210, 130)`);
  }
  return {
    claims: { LEG: p.length > 0 },
    numbers: { original: short(`storage://${path}`), originalDrawn, copy: copy ? short(copy.imageSrc) : 'none', drawn, toasts: await shown(s, t0), problems: p.join(' ; ') || 'none' },
    carried: originalDrawn === 'A' ? await pasteCarried(s, from) : { ok: false, why: `the original draws ${originalDrawn}` },
  };
}

// ---------------------------------------------------------- ⌘V (RACE)

/**
 * R1-5: a poster with no title; a payload holding a title and a stored image
 * (written by hand, put on the clipboard by the copy source's ⌘C); storage's
 * copy answering after 1.5 s; ⌘V twice, 300 ms apart. The rule (C4): one
 * title in all; the second paste's title refused with the toast; each
 * paste's image pasted.
 */
async function runTitleRace(h, s) {
  let src = null;
  await openPosterWith(h, s, (uid, posterId) => {
    const path = `${uid}/${posterId}/zqsrc01-abcd1234.png`;
    src = `storage://${path}`;
    return { blocks: [plainBlock('zqtext1', 'text', 40, 200, 100, 40, { content: 'ZQ words' })], files: [[path, A()]] };
  });
  await s.context.route('**/storage/v1/object/copy', async (route) => { await new Promise((r) => setTimeout(r, 1500)); return route.fallback(); });
  const payload = { v: 1, blocks: [plainBlock('zqtitle9', 'title', 20, 10, 400, 40, { content: 'ZQ TITLE' }), plainBlock('zqimg9', 'image', 20, 80, 80, 50, { imageSrc: src })] };
  if (!(await copyToClipboard(s.page, { 'text/html': payloadHtml(payload, 'ZQ'), 'text/plain': 'ZQ' }))) throw new Error('precondition: the payload copy did not run');
  await clickAway(s.page);
  const before = storedBlocks(s.state, s.id);
  const from = await eventCount(s.page);
  const t0 = await pageNow(s.page);
  await s.page.keyboard.press(`${MOD}+v`);
  await s.page.waitForTimeout(300);
  await s.page.keyboard.press(`${MOD}+v`);
  await until(() => addedBlocks(before, storedBlocks(s.state, s.id)).filter((b) => b.type === 'image').length >= 2, 12000);
  await s.page.waitForTimeout(1500);
  const after = storedBlocks(s.state, s.id);
  const added = addedBlocks(before, after).filter((b) => !b.locked);
  const titles = after.filter((b) => b.type === 'title').length;
  const toasts = await shown(s, t0);
  const p = [];
  if (titles !== 1) p.push(`${titles} titles`);
  if (added.filter((b) => b.type === 'image').length !== 2) p.push(`${added.filter((b) => b.type === 'image').length} images pasted, want 2`);
  return {
    claims: { RACE: p.length > 0, MSG: !/already has a title/i.test(toasts), N: othersChanged(before, after, []).length > 0 },
    numbers: { titlesBefore: before.filter((b) => b.type === 'title').length, titlesAfter: titles, added: added.map((b) => b.type).join(','), toasts, problems: p.join(' ; ') || 'none' },
    carried: await pasteCarried(s, from, { html: true }),
  };
}

// ------------------------------------------------- information (R1-6)

/**
 * R1-6 (information): a stored poster reopened (the editor seeds the credit
 * mark on load), Insert › Logo, ⌘C, ⌘V: what is selected, what the
 * clipboard holds, what is pasted. The manual flow's logo step depends on it.
 */
async function runInsertLogoReopened(h, s) {
  await openPosterWith(h, s, () => ({ blocks: [plainBlock('zqtext1', 'text', 40, 200, 100, 40, { content: 'ZQ words' })] }));
  await sentinel(s);
  await s.page.waitForTimeout(800);
  const markDrawn = await s.page.evaluate(() => !!document.querySelector('#poster-canvas [data-block-id="__postr_ack_mark__"]'));
  const before0 = storedBlocks(s.state, s.id);
  await openTab(s.page, 'insert');
  await s.page.locator('button', { hasText: /^\+ Logo/ }).first().click();
  await s.page.waitForTimeout(1200);
  const sel = await selectedIds(s.page);
  const logosAdded = madeSince(s, before0).filter((b) => b.type === 'logo').length;
  await s.page.keyboard.press(`${MOD}+c`);
  await s.page.waitForTimeout(300);
  const clip = await readClipboard(s.page);
  const pl = clip ? await payloadIn(s.page, clip.html) : { found: false };
  await clickAway(s.page);
  const before = storedBlocks(s.state, s.id);
  const from = await eventCount(s.page);
  const t0 = await pageNow(s.page);
  await s.page.keyboard.press(`${MOD}+v`);
  await s.page.waitForTimeout(2000);
  const added = madeSince(s, before);
  return {
    claims: {},
    numbers: {
      creditMarkDrawn: markDrawn, logosAddedByInsert: logosAdded, selectedAfterInsert: sel.join(',') || 'none', clipboardText: JSON.stringify((clip?.text ?? '').slice(0, 30)),
      payload: pl.found ? 'found' : 'none', pasted: added.map((b) => b.type).join(',') || 'none', toasts: await shown(s, t0),
    },
    carried: await pasteCarried(s, from),
  };
}

// --------------------------------------------------------------- list

export const REVIEW_BLOCK_SCENARIOS = [
  { id: 'C-r1-cut-address-logo', run: runCutAddressLogo, how: 'CUT, MSG (R1-2): a text block and a logo whose picture is an address (as a preset or My Logos stores it) selected with a band, ⌘X: the text cut and on the clipboard, the logo stays with a toast (⌘V could not bring its picture back)' },
  { id: 'C-r1-cut-big-table', run: runCutTooBig, big: 'table', how: 'CUT, MSG (R1-4): a small text block and a table of 51 columns selected, ⌘X: nothing copied or cut, a toast; the clipboard keeps what it held' },
  { id: 'C-r1-cut-big-text', run: runCutTooBig, big: 'text', how: 'CUT, MSG (R1-4): a small text block and a text of 100 007 characters selected, ⌘X: nothing copied or cut, a toast' },
  { id: 'C-r1-dup-copy-fails', run: runDupImage, claim: 'DUP', failCopy: true, name: (id) => `${id}-abcd1234.png`, how: 'DUP, U (R1-3): a stored image selected, storage\'s copy failing as a network failure does, ⌘D: the clone draws the picture (its original\'s file), one ⌘Z removes it; the time from the key to the clone drawn' },
  { id: 'C-r1-dup-copy-fails-replace', run: runDupImage, claim: 'DUP', failCopy: true, replaceAfter: true, name: (id) => `${id}-abcd1234.png`, how: 'DUP (R1-3): the same, then Replace on the original with C and a reload: the original draws C, the clone (which kept the original\'s file) still A' },
  { id: 'C-r1-dup-legacy', run: runDupImage, claim: 'LEG', wantOwnFile: true, name: (id) => `${id}.plot_final`, how: 'LEG, U (R1-3): an image stored under an older name ({block}.plot_final) selected, ⌘D: the clone has its own file holding the picture, drawn' },
  { id: 'C-r1-paste-legacy', run: runPasteLegacy, how: 'LEG (R1-3): the same image selected, ⌘C, ⌘V: a copy 1 in down and right with its own file holding the picture, drawn' },
  { id: 'C-r1-title-race', run: runTitleRace, how: 'RACE, MSG (R1-5): a poster with no title, a payload of a title and a stored image, storage\'s copy answering after 1.5 s, ⌘V twice 300 ms apart: one title in all, the second refused with the toast, both images pasted' },
  { id: 'C-r1-i-insert-logo-reopened', run: runInsertLogoReopened, info: true, how: 'INFORMATION (R1-6): a stored poster reopened (the credit mark seeded on load), Insert › Logo, ⌘C, ⌘V: what is selected, copied and pasted' },
];
