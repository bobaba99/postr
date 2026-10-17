/**
 * Review round 2 of record 35 (docs/fixes/35-block-copy.md §9), folded into
 * scripts/canvas-paste-check.mjs (`--only C-r2`): the reviewer's probes that
 * found a defect, re-entered as the user enters (the starting layout's
 * column 2 typed into and filled through "+ Upload figure", or a poster
 * seeded into the fake backend with the files its blocks name; blocks
 * selected with a rubber band; a real ⌘C, ⌘X, ⌘V, ⌘D, ⌘Z and ⌘⇧Z).
 * Storage's copy is made slow with a route on /storage/v1/object/copy (the
 * fake backend itself answers at once; how long the real storage takes is
 * UNVERIFIED). What is read: the poster rows, the fake storage's files and
 * copies, what the canvas draws (the blocks drawn, an image's natural size,
 * its clip) and the toasts. Nothing calls the app's store or its modules.
 *
 * CLAIMS (observed = the defect present)
 *   INFL a step that waits for storage's copy (R2-1): ⌘D's clone or ⌘V's
 *        copies not on the canvas at once (before the copy answers); a ⌘Z
 *        pressed meanwhile undid another step (the word typed before), left
 *        the new blocks once the copy answered, or ⌘⇧Z did not bring them
 *        back (drawing the picture) with the word kept; a second ⌘D pressed
 *        meanwhile did not clone the first clone 1 in further (+20)
 *   CROP a stored crop the editor allows (a side over 50 %, up to 90 %:
 *        CropOverlay) not carried by ⌘C, or a copy (⌘V, or ⌘X then ⌘V) not
 *        holding the original's crop, or drawn with another clip (R2-2)
 *   CUT  ⌘X of more blocks than a payload carries (201) removed any, or put
 *        a payload on the clipboard (R2-3: R1-4's rule)
 *   D    a clone or a copy without its own file holding A once the copy
 *        answered; MSG the rule's toast not shown; U one ⌘Z did not undo
 *        the step
 *
 * INFORMATION (printed, not counted)
 *   C-r2-i-150: 150 blocks (50 stored images) copied and pasted: the times,
 *   the storage copies, one ⌘Z. C-r2-i-other-apps (R2-4): what a plain
 *   field and a rich field with no paste listener of their own (as a mail
 *   composer starts from) receive after ⌘C, and Postr's own text in edit
 *   mode.
 *
 * The control `carried` (exit 2 when it fails): storage's copy was delayed
 * (the route saw the request), or the paste was the engine's own trusted
 * paste, or the band selected what it should.
 */
import { MOD, KEY, clickAway, focusBlockEnd } from './undoKit.mjs';
import { sleep } from './editorHarness.mjs';
import { IMAGES, addedBlocks, eventCount, fileOf, othersChanged, settledChange, storedBlocks, storedEquals, until } from './canvasPasteKit.mjs';
import {
  bandSelect, bytesAt, column, drawnImage, openPosterWith, pageNow, pasteCarried, payloadIn, plainBlock, readClipboard, sameBytes, SENTINEL,
  sentinel, short, toastsSince, typeInto, userColumn,
} from './blockCopyKit.mjs';

const A = () => fileOf(IMAGES.A).bytes;
/** The blocks a step added, the credit mark left out (seeded when a stored poster opens). */
const madeSince = (before, after) => addedBlocks(before, after).filter((b) => !b.locked);
const drawnIds = (page) => page.evaluate(() => [...new Set([...document.querySelectorAll('#poster-canvas [data-block-id]')].map((e) => e.getAttribute('data-block-id')))]);
const textOf = (s, id) => storedBlocks(s.state, s.id).find((b) => b.id === id)?.content ?? '';
const shown = async (s, t0) => (await toastsSince(s.page, t0)).join(' | ') || 'none';
const offsetOf = (b, o) => `(+${Math.round((b.x - o.x) * 100) / 100}, +${Math.round((b.y - o.y) * 100) / 100})`;
const ownFile = (s, b) => new RegExp(`^storage://${s.uid}/${s.id}/${b.id}-[A-Za-z0-9_-]+\\.png$`).test(b.imageSrc ?? '') && sameBytes(bytesAt(s.state, b.imageSrc), A());

/** Wait until a stored image block draws a picture (its natural size), up to ~6 s. */
async function drawnSoon(page, id) {
  let got = null;
  for (let k = 0; k < 24 && got === null; k += 1) {
    got = await drawnImage(page, id);
    if (got === null) await page.waitForTimeout(250);
  }
  return got;
}

/** What block `id` draws within `ms` (polled every 100 ms), or null. */
async function drawnWithin(page, id, ms) {
  const t0 = Date.now();
  let got = await drawnImage(page, id);
  while (got === null && Date.now() - t0 < ms) {
    await page.waitForTimeout(100);
    got = await drawnImage(page, id);
  }
  return got;
}

/** Storage's copy answers after `ms`; returns a reader of how many copy requests the route held. */
async function slowCopy(s, ms) {
  let held = 0;
  await s.context.route('**/storage/v1/object/copy', async (route) => { held += 1; await sleep(ms); return route.fallback(); });
  return () => held;
}

// ------------------------------------------------- ⌘D / ⌘V in flight (INFL)

/**
 * R2-1: the user types a word into column 2's text, then selects its image
 * and presses ⌘D while storage's copy takes `sc.delay` ms, and ⌘Z
 * `sc.undoAt` ms after (the user's "oops"), then ⌘⇧Z. The rule: the clone is
 * on the canvas at once; ⌘Z removes it and nothing else; it does not come
 * back when the copy answers; ⌘⇧Z brings it back, drawing the picture.
 */
async function runDupUndoInflight(h, s, sc) {
  const col = await userColumn(s);
  await typeInto(s, col.text.id, ' ZQLAST');
  await clickAway(s.page);
  await s.page.waitForTimeout(900);
  const before = storedBlocks(s.state, s.id);
  const held = await slowCopy(s, sc.delay);
  await bandSelect(s.page, [col.img.id]);
  const known = await drawnIds(s.page);
  await s.page.keyboard.press(`${MOD}+d`);
  await s.page.waitForTimeout(sc.undoAt);
  const drawnAtUndo = (await drawnIds(s.page)).filter((id) => !known.includes(id)).length;
  await s.page.keyboard.press(KEY.undo);
  await s.page.waitForTimeout(sc.delay + 2500);
  const afterUndo = storedBlocks(s.state, s.id);
  const left = madeSince(before, afterUndo);
  const textAfterUndo = textOf(s, col.text.id);
  await clickAway(s.page);
  await s.page.keyboard.press(KEY.redo);
  await settledChange(s.state, s.id, afterUndo, { timeout: 6000, quiet: 1200 }).catch(() => null);
  const redone = madeSince(before, storedBlocks(s.state, s.id));
  const textAfterRedo = textOf(s, col.text.id);
  const redoneDrawn = redone[0] ? await drawnSoon(s.page, redone[0].id) : null;
  const p = [];
  if (drawnAtUndo !== 1) p.push(`${drawnAtUndo} new blocks drawn when ⌘Z was pressed, want the clone`);
  if (left.length) p.push(`${left.length} clone(s) on the poster after ⌘Z and the copy`);
  if (!textAfterUndo.includes('ZQLAST')) p.push('⌘Z undid the word typed before ⌘D');
  if (!textAfterRedo.includes('ZQLAST')) p.push('the word is lost after ⌘⇧Z');
  if (redone.length !== 1) p.push(`⌘⇧Z brought back ${redone.length} clones, want 1`);
  else if (redoneDrawn !== 'A') p.push(`the clone brought back draws ${redoneDrawn}, want A`);
  if (storedBlocks(s.state, s.id).find((b) => b.id === col.img.id)?.imageSrc !== col.img.imageSrc) p.push('the original\'s source changed');
  return {
    claims: { INFL: p.length > 0 },
    numbers: {
      copyDelayMs: sc.delay, undoAtMs: sc.undoAt, newBlocksDrawnAtUndo: drawnAtUndo, clonesAfterUndo: left.length,
      textAfterUndo: JSON.stringify(textAfterUndo.slice(-24)), textAfterRedo: JSON.stringify(textAfterRedo.slice(-24)),
      redone: redone.map((b) => `${offsetOf(b, col.img)} ${short(b.imageSrc)}`).join(' ') || 'none', redoneDrawn, problems: p.join(' ; ') || 'none',
    },
    carried: { ok: held() >= 1, why: `the route held ${held()} copy request(s) ${sc.delay} ms` },
  };
}

/**
 * R2-1: column 2's image selected, ⌘D twice `sc.gap` ms apart while
 * storage's copy takes `sc.delay` ms. The rule: the second ⌘D clones the
 * first clone (selected after the first ⌘D), so the clones land at +10 and
 * +20; each gets its own file once the copies answer; two ⌘Z remove both.
 */
async function runDupTwiceInflight(h, s, sc) {
  const col = await userColumn(s);
  await clickAway(s.page);
  const before = storedBlocks(s.state, s.id);
  const held = await slowCopy(s, sc.delay);
  await bandSelect(s.page, [col.img.id]);
  await s.page.keyboard.press(`${MOD}+d`);
  await s.page.waitForTimeout(sc.gap);
  await s.page.keyboard.press(`${MOD}+d`);
  await s.page.waitForTimeout(sc.delay);
  await settledChange(s.state, s.id, before, { timeout: 10000, quiet: 1500 }).catch(() => null);
  const clones = madeSince(before, storedBlocks(s.state, s.id));
  const o = col.img;
  const offsets = clones.map((c) => offsetOf(c, o));
  const p = [];
  if (clones.length !== 2) p.push(`${clones.length} clones, want 2`);
  else if (offsets.join(' ') !== '(+10, +10) (+20, +20)') p.push(`clones at ${offsets.join(' ')}, want (+10, +10) (+20, +20)`);
  const d = clones.filter((c) => !ownFile(s, c)).map((c) => `${c.id} holds ${short(c.imageSrc)}`);
  const drawn = [];
  for (const c of clones) drawn.push(await drawnSoon(s.page, c.id));
  if (drawn.some((x) => x !== 'A')) p.push(`the clones draw ${drawn.join(',')}, want A`);
  await clickAway(s.page);
  await s.page.keyboard.press(KEY.undo);
  await s.page.waitForTimeout(400);
  await s.page.keyboard.press(KEY.undo);
  const undone = await storedEquals(s.state, s.id, before, 6000);
  return {
    claims: { INFL: p.length > 0, D: clones.length ? d.length > 0 : null, U: clones.length ? !undone : null },
    numbers: {
      copyDelayMs: sc.delay, secondPressAtMs: sc.gap, clones: clones.length, offsets: offsets.join(' ') || 'none',
      files: clones.map((c) => short(c.imageSrc)).join(' ') || 'none', drawn: drawn.join(',') || 'none', twoUndosRestored: undone,
      problems: [...p, ...d].join(' ; ') || 'none',
    },
    carried: { ok: held() >= 1, why: `the route held ${held()} copy request(s) ${sc.delay} ms` },
  };
}

/**
 * R2-1: column 2's image copied (⌘C), a word typed into its text, then ⌘V
 * while storage's copy takes `sc.delay` ms, ⌘Z `sc.undoAt` ms after, then
 * ⌘⇧Z. The rule: the copy is on the canvas at once (drawing the picture:
 * the account's own file); ⌘Z removes it and nothing else; it does not come
 * back when the copy answers; ⌘⇧Z brings it back, drawing the picture.
 */
async function runPasteUndoInflight(h, s, sc) {
  const col = await userColumn(s);
  await clickAway(s.page);
  await bandSelect(s.page, [col.img.id]);
  await s.page.keyboard.press(`${MOD}+c`);
  await s.page.waitForTimeout(300);
  await typeInto(s, col.text.id, ' ZQLAST');
  await clickAway(s.page);
  await s.page.waitForTimeout(900);
  const before = storedBlocks(s.state, s.id);
  const held = await slowCopy(s, sc.delay);
  const known = await drawnIds(s.page);
  const from = await eventCount(s.page);
  await s.page.keyboard.press(`${MOD}+v`);
  await s.page.waitForTimeout(sc.undoAt);
  const newIds = (await drawnIds(s.page)).filter((id) => !known.includes(id));
  const drawnAtUndo = newIds[0] ? await drawnImage(s.page, newIds[0]) : null;
  await s.page.keyboard.press(KEY.undo);
  await s.page.waitForTimeout(sc.delay + 2500);
  const afterUndo = storedBlocks(s.state, s.id);
  const left = madeSince(before, afterUndo);
  const textAfterUndo = textOf(s, col.text.id);
  await clickAway(s.page);
  await s.page.keyboard.press(KEY.redo);
  await settledChange(s.state, s.id, afterUndo, { timeout: 6000, quiet: 1200 }).catch(() => null);
  const redone = madeSince(before, storedBlocks(s.state, s.id));
  const textAfterRedo = textOf(s, col.text.id);
  const redoneDrawn = redone[0] ? await drawnSoon(s.page, redone[0].id) : null;
  const p = [];
  if (newIds.length !== 1) p.push(`${newIds.length} new blocks drawn when ⌘Z was pressed, want the copy`);
  if (left.length) p.push(`${left.length} block(s) pasted after ⌘Z and the copy`);
  if (!textAfterUndo.includes('ZQLAST')) p.push('⌘Z undid the word typed before ⌘V');
  if (!textAfterRedo.includes('ZQLAST')) p.push('the word is lost after ⌘⇧Z');
  if (redone.length !== 1) p.push(`⌘⇧Z brought back ${redone.length} copies, want 1`);
  else if (redoneDrawn !== 'A') p.push(`the copy brought back draws ${redoneDrawn}, want A`);
  return {
    claims: { INFL: p.length > 0 },
    numbers: {
      copyDelayMs: sc.delay, undoAtMs: sc.undoAt, newBlocksDrawnAtUndo: newIds.length, copyDrewAtUndo: drawnAtUndo, blocksAfterUndo: left.length,
      textAfterUndo: JSON.stringify(textAfterUndo.slice(-24)), textAfterRedo: JSON.stringify(textAfterRedo.slice(-24)),
      redone: redone.map((b) => `${offsetOf(b, col.img)} ${short(b.imageSrc)}`).join(' ') || 'none', redoneDrawn, problems: p.join(' ; ') || 'none',
    },
    carried: held() >= 1 ? await pasteCarried(s, from) : { ok: false, why: 'the route held no copy request' },
  };
}

/**
 * R2-1: column 2's image copied, ⌘V while storage's copy takes `sc.delay`
 * ms, no other key. The rule: the copy is on the canvas at once, drawing
 * the picture; once the copy answers it holds its own file (A's bytes,
 * under its own id), drawn; one ⌘Z removes it.
 */
async function runPasteSlow(h, s, sc) {
  const col = await userColumn(s);
  await clickAway(s.page);
  await bandSelect(s.page, [col.img.id]);
  await s.page.keyboard.press(`${MOD}+c`);
  await s.page.waitForTimeout(300);
  await clickAway(s.page);
  const before = storedBlocks(s.state, s.id);
  const held = await slowCopy(s, sc.delay);
  const known = await drawnIds(s.page);
  const from = await eventCount(s.page);
  await s.page.keyboard.press(`${MOD}+v`);
  await s.page.waitForTimeout(400);
  const newIds = (await drawnIds(s.page)).filter((id) => !known.includes(id));
  const drewAt400 = newIds[0] ? await drawnWithin(s.page, newIds[0], 600) : null;
  await s.page.waitForTimeout(sc.delay);
  await settledChange(s.state, s.id, before, { timeout: 10000, quiet: 1500 }).catch(() => null);
  const after = storedBlocks(s.state, s.id);
  const pasted = madeSince(before, after);
  const p = [];
  if (newIds.length !== 1) p.push(`${newIds.length} new blocks drawn 400 ms after ⌘V (the copy answering after ${sc.delay} ms), want 1`);
  else if (drewAt400 !== 'A') p.push(`the copy drew ${drewAt400} before the file was copied, want A`);
  const d = pasted.length !== 1 ? [`${pasted.length} blocks pasted, want 1`] : ownFile(s, pasted[0]) ? [] : [`the copy holds ${short(pasted[0].imageSrc)}, want its own file holding A`];
  const finalDrawn = pasted[0] ? await drawnSoon(s.page, pasted[0].id) : null;
  if (finalDrawn !== 'A') d.push(`the copy draws ${finalDrawn} once its file is copied, want A`);
  if (after.find((b) => b.id === col.img.id)?.imageSrc !== col.img.imageSrc) d.push('the original\'s source changed');
  await clickAway(s.page);
  await s.page.keyboard.press(KEY.undo);
  const undone = await storedEquals(s.state, s.id, before, 6000);
  return {
    claims: { INFL: p.length > 0, D: d.length > 0, U: pasted.length ? !undone : null, N: othersChanged(before, after, []).length > 0 },
    numbers: { copyDelayMs: sc.delay, newBlocksDrawnAt400ms: newIds.length, drewAt400, stored: pasted.map((b) => short(b.imageSrc)).join(' ') || 'none', finalDrawn, undoRestored: undone, problems: [...p, ...d].join(' ; ') || 'none' },
    carried: held() >= 1 ? await pasteCarried(s, from) : { ok: false, why: 'the route held no copy request' },
  };
}

// ------------------------------------------------------------- CROP (R2-2)

/** The clip-path each element of block `id` is drawn with ('none' when none). */
const clipOf = (page, id) => page.evaluate((bid) => {
  const box = document.querySelector(`#poster-canvas [data-block-id="${bid}"]`);
  if (!box) return null;
  return [box, ...box.querySelectorAll('*')].map((e) => getComputedStyle(e).clipPath).filter((c) => c && c !== 'none').join('|') || 'none';
}, id);

/**
 * R2-2: a poster with two stored images cropped on the left by 60 % (the
 * crop overlay allows a side up to 90 %) and by 40 %; both selected, ⌘C,
 * ⌘V; then ⌘Z, the 60 % one cut and pasted back. The rule: the payload
 * carries each crop as stored; every copy holds its original's crop and is
 * drawn with the same clip.
 */
async function runCrop(h, s) {
  const crop = (left) => ({ top: 0, right: 0, bottom: 0, left });
  await openPosterWith(h, s, (uid, posterId) => {
    const mk = (id, x, left) => [plainBlock(id, 'image', x, 80, 120, 75, { imageSrc: `storage://${uid}/${posterId}/${id}-seed0001.png`, crop: crop(left) }), [`${uid}/${posterId}/${id}-seed0001.png`, A()]];
    const [a, fa] = mk('zqcrop60', 40, 60);
    const [b, fb] = mk('zqcrop40', 240, 40);
    return { blocks: [a, b], files: [fa, fb] };
  });
  await sentinel(s);
  const want = { zqcrop60: crop(60), zqcrop40: crop(40) };
  const clips = { zqcrop60: await clipOf(s.page, 'zqcrop60'), zqcrop40: await clipOf(s.page, 'zqcrop40') };
  await bandSelect(s.page, ['zqcrop60', 'zqcrop40']);
  await s.page.keyboard.press(`${MOD}+c`);
  await s.page.waitForTimeout(300);
  const clip = await readClipboard(s.page);
  const pl = clip ? await payloadIn(s.page, clip.html) : { found: false };
  const p = [];
  const carriedCrops = pl.found && !pl.error ? pl.json.blocks.map((b) => `${b.id}:${JSON.stringify(b.crop ?? null)}`) : [];
  for (const [id, c] of Object.entries(want)) if (!carriedCrops.includes(`${id}:${JSON.stringify(c)}`)) p.push(`the payload does not carry ${id}'s crop as stored`);
  await clickAway(s.page);
  let before = storedBlocks(s.state, s.id);
  const from = await eventCount(s.page);
  await s.page.keyboard.press(`${MOD}+v`);
  await settledChange(s.state, s.id, before, { timeout: 8000 }).catch(() => null);
  const pasted = madeSince(before, storedBlocks(s.state, s.id));
  const pastedClips = [];
  for (const [i, id] of ['zqcrop60', 'zqcrop40'].entries()) {
    const b = pasted[i];
    if (!b) { p.push(`no copy of ${id}`); continue; }
    if (JSON.stringify(b.crop ?? null) !== JSON.stringify(want[id])) p.push(`the copy of ${id} holds crop ${JSON.stringify(b.crop ?? null)}`);
    const c = await clipOf(s.page, b.id);
    pastedClips.push(c);
    if (c !== clips[id]) p.push(`the copy of ${id} is drawn with ${c}, the original with ${clips[id]}`);
  }
  await clickAway(s.page);
  await s.page.keyboard.press(KEY.undo);
  await s.page.waitForTimeout(1000);
  await bandSelect(s.page, ['zqcrop60']);
  await s.page.keyboard.press(`${MOD}+x`);
  await until(() => !storedBlocks(s.state, s.id).some((b) => b.id === 'zqcrop60'), 6000);
  await s.page.waitForTimeout(600);
  await clickAway(s.page);
  before = storedBlocks(s.state, s.id);
  await s.page.keyboard.press(`${MOD}+v`);
  await settledChange(s.state, s.id, before, { timeout: 8000 }).catch(() => null);
  const back = madeSince(before, storedBlocks(s.state, s.id))[0];
  const backClip = back ? await clipOf(s.page, back.id) : null;
  if (!back) p.push('⌘X then ⌘V brought nothing back');
  else {
    if (JSON.stringify(back.crop ?? null) !== JSON.stringify(want.zqcrop60)) p.push(`⌘X then ⌘V brought it back with crop ${JSON.stringify(back.crop ?? null)}`);
    if (backClip !== clips.zqcrop60) p.push(`⌘X then ⌘V: drawn with ${backClip}, the original with ${clips.zqcrop60}`);
  }
  return {
    claims: { CROP: p.length > 0 },
    numbers: {
      originalsDrawn: `${clips.zqcrop60} · ${clips.zqcrop40}`, payloadCrops: carriedCrops.join(' ') || 'no payload', pasted: pasted.map((b) => JSON.stringify(b.crop ?? null)).join(' ') || 'none',
      pastedDrawn: pastedClips.join(' · ') || 'none', cutAndPastedBack: back ? `(${back.x}, ${back.y}) ${JSON.stringify(back.crop ?? null)} ${backClip}` : 'none', problems: p.join(' ; ') || 'none',
    },
    carried: await pasteCarried(s, from, { html: true }),
  };
}

// --------------------------------------------- many blocks (CUT; information)

/**
 * A seeded poster of `n` blocks on a 48 × 36 in sheet in a grid (texts,
 * headings, and every third a stored image with its own file), all selected
 * with a band drawn over the whole sheet from the workspace.
 */
async function manyBlocks(h, s, n) {
  await openPosterWith(h, s, (uid, posterId) => {
    const blocks = [];
    const files = [];
    for (let i = 0; i < n; i += 1) {
      const id = `zh${String(i).padStart(4, '0')}`;
      const x = 6 + (i % 15) * 31;
      const y = 6 + Math.floor(i / 15) * Math.max(10, Math.floor(340 / Math.ceil(n / 15)));
      if (i % 3 === 2) {
        const path = `${uid}/${posterId}/${id}-seed0001.png`;
        files.push([path, A()]);
        blocks.push(plainBlock(id, 'image', x, y, 28, 8, { imageSrc: `storage://${path}` }));
      } else blocks.push(plainBlock(id, i % 3 === 0 ? 'text' : 'heading', x, y, 28, 8, { content: `ZQ ${id} ${'w'.repeat(40)}` }));
    }
    return { blocks, files };
  }, { waitFor: '#poster-canvas [data-block-id="zh0000"]' });
  await s.page.waitForTimeout(1200);
  await sentinel(s);
  const pts = await s.page.evaluate(() => {
    const r = document.getElementById('poster-canvas').getBoundingClientRect();
    return { a: { x: r.left - 6, y: r.top - 6 }, b: { x: r.right + 6, y: r.bottom + 6 } };
  });
  await s.page.mouse.move(pts.a.x, pts.a.y);
  await s.page.mouse.down();
  await s.page.mouse.move(pts.b.x, pts.b.y, { steps: 10 });
  await s.page.mouse.up();
  await s.page.waitForTimeout(600);
  return s.page.evaluate(() => new Set([...document.querySelectorAll('#poster-canvas [data-postr-selected="true"]')].map((e) => e.getAttribute('data-block-id'))).size);
}

/**
 * R2-3: 201 blocks (67 stored images) selected with a band, ⌘X. The rule
 * (R1-4's): a payload holds at most 200 blocks, so nothing is copied or cut
 * and a toast says the blocks are too large to copy; the clipboard keeps
 * what it held.
 */
async function runCut201(h, s) {
  const selected = await manyBlocks(h, s, 201);
  const start = storedBlocks(s.state, s.id);
  const t0 = await pageNow(s.page);
  await s.page.keyboard.press(`${MOD}+x`);
  await until(() => storedBlocks(s.state, s.id).length < start.length, 3000);
  await s.page.waitForTimeout(1200);
  const toasts = await shown(s, t0);
  const afterCut = storedBlocks(s.state, s.id);
  const clip = await readClipboard(s.page);
  const pl = clip ? await payloadIn(s.page, clip.html) : { found: false };
  const p = [];
  if (afterCut.length !== start.length) p.push(`${start.length - afterCut.length} blocks cut`);
  if (pl.found) p.push(`a payload of ${pl.json?.blocks?.length ?? pl.error} blocks on the clipboard`);
  return {
    claims: { CUT: p.length > 0, MSG: !/too large to copy/i.test(toasts) },
    numbers: { selected, stored: start.length, afterCut: afterCut.length, clipboard: pl.found ? 'a payload' : JSON.stringify((clip?.text ?? '').slice(0, 30)), toasts, problems: p.join(' ; ') || 'none' },
    carried: { ok: selected >= 201 && !!clip?.trusted && (pl.found || clip.text.includes(SENTINEL)), why: `band selected ${selected}; probe read trusted=${clip?.trusted}` },
  };
}

/** Information: 150 blocks (50 stored images) selected with a band, ⌘C, ⌘V, one ⌘Z. */
async function runMany150(h, s) {
  const selected = await manyBlocks(h, s, 150);
  const tKey = Date.now();
  await s.page.keyboard.press(`${MOD}+c`);
  const keyMs = Date.now() - tKey;
  await s.page.waitForTimeout(500);
  await clickAway(s.page);
  const before = storedBlocks(s.state, s.id);
  const copies0 = s.state.copies.length;
  const known = await drawnIds(s.page);
  const from = await eventCount(s.page);
  const tv = Date.now();
  await s.page.keyboard.press(`${MOD}+v`);
  await s.page.waitForFunction((k) => document.querySelectorAll('#poster-canvas [data-block-id]').length >= k.length + 150, known, { timeout: 20000, polling: 50 }).catch(() => null);
  const msToDrawn = Date.now() - tv;
  await settledChange(s.state, s.id, before, { timeout: 30000, quiet: 1500 }).catch(() => null);
  const pasted = madeSince(before, storedBlocks(s.state, s.id));
  const own = pasted.filter((b) => b.type === 'image' && ownFile(s, b)).length;
  await clickAway(s.page);
  await s.page.keyboard.press(KEY.undo);
  const undone = await storedEquals(s.state, s.id, before, 8000);
  return {
    claims: {},
    numbers: {
      selected, keyRoundTripMs: keyMs, pasted: pasted.length, msFromKeyTo150Drawn: msToDrawn, imagesWithOwnFile: own,
      storageCopies: `${s.state.copies.slice(copies0).filter((c) => c.status === 200).length} ok of ${s.state.copies.length - copies0}`, oneUndoRestored: undone,
    },
    carried: await pasteCarried(s, from),
  };
}

// ------------------------------------------------ information (R2-4)

/**
 * R2-4 (information): column 2's heading, text and image copied; what a
 * plain field outside the editor, a rich field with no paste listener of its
 * own (the engine's own HTML paste, as a mail composer starts from) and
 * Postr's own text block in edit mode receive.
 */
async function runOtherApps(h, s) {
  const col = await userColumn(s);
  await clickAway(s.page);
  await bandSelect(s.page, [col.head.id, col.text.id, col.img.id]);
  await s.page.keyboard.press(`${MOD}+c`);
  await s.page.waitForTimeout(300);
  await clickAway(s.page);
  const out = {};
  for (const kind of ['textarea', 'rich']) {
    await s.page.evaluate((k) => {
      const el = document.createElement(k === 'textarea' ? 'textarea' : 'div');
      el.id = 'zq-target';
      if (k === 'rich') el.contentEditable = 'true';
      Object.assign(el.style, { position: 'fixed', left: '8px', bottom: '8px', width: '300px', height: '80px', zIndex: '2147483647', background: '#fff', color: '#000' });
      document.body.appendChild(el);
    }, kind);
    await s.page.locator('#zq-target').click();
    await s.page.keyboard.press(`${MOD}+v`);
    await s.page.waitForTimeout(500);
    const got = await s.page.evaluate((uid) => {
      const el = document.getElementById('zq-target');
      const mark = el.querySelector?.('[data-postr-blocks]')?.getAttribute('data-postr-blocks') ?? '';
      const r = { value: el.value ?? null, keepsMark: mark.length > 0, markChars: mark.length, markHasAccountId: mark.includes(uid) };
      el.remove();
      return r;
    }, s.uid);
    if (kind === 'textarea') out.plainFieldGot = JSON.stringify(got.value);
    else Object.assign(out, { richFieldKeepsMark: got.keepsMark, richMarkChars: got.markChars, richMarkHoldsAccountId: got.markHasAccountId });
  }
  const t1 = column(storedBlocks(s.state, s.id), 0).find((b) => b.type === 'text');
  const before = storedBlocks(s.state, s.id);
  const was = before.find((b) => b.id === t1.id)?.content ?? '';
  const from = await eventCount(s.page);
  await focusBlockEnd(s.page, t1.id);
  await s.page.keyboard.press(`${MOD}+v`);
  await s.page.waitForTimeout(1500);
  await clickAway(s.page);
  await s.page.waitForTimeout(800);
  const now = storedBlocks(s.state, s.id).find((b) => b.id === t1.id)?.content ?? '';
  Object.assign(out, { textBlockStoresMark: now.includes('postr-blocks'), textBlockGained: JSON.stringify(now.slice(was.length).slice(0, 80)), blocksAddedByTextPaste: madeSince(before, storedBlocks(s.state, s.id)).length });
  return { claims: {}, numbers: out, carried: await pasteCarried(s, from) };
}

// --------------------------------------------------------------- list

export const ROUND2_BLOCK_SCENARIOS = [
  { id: 'C-r2-dup-undo-inflight', run: runDupUndoInflight, delay: 1000, undoAt: 400, how: 'INFL (R2-1): a word typed into column 2\'s text, its image selected, ⌘D while storage\'s copy takes 1 s, ⌘Z 400 ms after, ⌘⇧Z: the clone on the canvas at once, ⌘Z removes only it, ⌘⇧Z brings it back drawing A, the word kept' },
  { id: 'C-r2-dup-undo-inflight-300', run: runDupUndoInflight, delay: 300, undoAt: 150, how: 'INFL (R2-1): the same with the copy taking 300 ms and ⌘Z at 150 ms' },
  { id: 'C-r2-dup-twice-inflight', run: runDupTwiceInflight, delay: 1000, gap: 250, how: 'INFL, D, U (R2-1): column 2\'s image selected, ⌘D twice 250 ms apart while storage\'s copy takes 1 s: clones at +10 and +20, each with its own file holding A once copied; two ⌘Z remove both' },
  { id: 'C-r2-paste-undo-inflight', run: runPasteUndoInflight, delay: 1000, undoAt: 400, how: 'INFL (R2-1): column 2\'s image copied, a word typed, ⌘V while storage\'s copy takes 1 s, ⌘Z 400 ms after, ⌘⇧Z: the copy on the canvas at once, ⌘Z removes only it, ⌘⇧Z brings it back drawing A, the word kept' },
  { id: 'C-r2-paste-slow', run: runPasteSlow, delay: 1500, how: 'INFL, D, U (R2-1): column 2\'s image copied, ⌘V while storage\'s copy takes 1.5 s: the copy drawn (A) at once; once copied it holds its own file holding A; one ⌘Z removes it' },
  { id: 'C-r2-crop', run: runCrop, how: 'CROP (R2-2): two stored images cropped on the left by 60 % and 40 % selected, ⌘C, ⌘V; then the 60 % one cut and pasted back: the payload and every copy hold the crop as stored and are drawn with the original\'s clip' },
  { id: 'C-r2-cut-201', run: runCut201, how: 'CUT, MSG (R2-3): 201 blocks (67 stored images) selected with a band over the sheet, ⌘X: nothing cut or copied, "These blocks are too large to copy."' },
  { id: 'C-r2-i-150', run: runMany150, info: true, how: 'INFORMATION: 150 blocks (50 stored images) selected, ⌘C, ⌘V, one ⌘Z: the times, the copies' },
  { id: 'C-r2-i-other-apps', run: runOtherApps, info: true, how: 'INFORMATION (R2-4): after ⌘C of a heading, a text and an image, what a plain field, a rich field with no paste listener of its own and Postr\'s text in edit mode receive' },
];
