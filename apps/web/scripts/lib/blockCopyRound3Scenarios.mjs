/**
 * Review round 3 of record 35 (docs/fixes/35-block-copy.md §9), folded into
 * scripts/canvas-paste-check.mjs (`--only C-r3`): the reviewer's probes that
 * found a defect, re-entered as the user enters (the starting layout's
 * column 2 typed into and filled through "+ Upload figure", or a poster
 * seeded into the fake backend; blocks selected with a rubber band; a real
 * ⌘C, ⌘X, ⌘V, ⌘D, ⌘Z, ⌘⇧Z, ArrowRight, typing, today's Replace button, a
 * double-click on the canvas). Storage's copy is made slow, or made to fail,
 * with a route on /storage/v1/object/copy: a transient 503 (storage busy), a
 * refusal (400 carrying "404 Object not found", as storage answers for a
 * file that is not there), or a first copy made whose answer is lost (a 504
 * page, a network failure) before a retry reaches the fake storage. How often real storage fails a copy is
 * UNVERIFIED. What is read: the poster rows, the fake storage's files, what
 * the canvas draws (the blocks drawn, an image's natural size), the
 * clipboard as another application reads it, and the toasts. Nothing calls
 * the app's store or its modules.
 *
 * CLAIMS (observed = the defect present)
 *   KEEP a picture emptied where it could be kept (R3-1): a figure cut in
 *        one poster and pasted into another while storage could not copy
 *        its file just then (503), or while storage made the copy but its
 *        answer was lost (a gateway's 504, a network failure; the final
 *        check's F35-FC-1), draws no picture there once the copies have
 *        answered (or after a reload), or the "couldn't be copied" toast is
 *        shown for it
 *   MSGT a toast not true when shown (R3-2): "… couldn't be copied, so its
 *        block is empty." while the pasted block it names is not on the
 *        canvas (⌘Z pressed meanwhile) or draws a picture (a Replace made
 *        meanwhile)
 *   HIST a pasted copy or a ⌘D clone that holds its own file loses it to
 *        an undo or a redo (R3-3): after one ⌘Z of a step made while its
 *        file was copied (a move with ArrowRight, a typed word, the copy
 *        itself dragged with the mouse: R3-3's sibling, found here), or
 *        after ⌘⇧Z of the paste or clone undone before its file was
 *        copied, the block holds its original's file again (in the stored
 *        row, also after a reload)
 *   PT   (R3-4, record 35's claim) a word double-clicked on the canvas in
 *        a block that is not being edited (the References block), then ⌘C:
 *        the word not selected after the double-click, a block payload on
 *        the clipboard, or not that word
 *   D    a copy or clone without its own file holding A once its file was
 *        copied (the premise of HIST; in C-r3-cut-cross-504-written and
 *        -answer-lost the figure not holding its own file in the other
 *        poster's folder once the retry answered, or after a reload)
 *
 * The control `carried` (exit 2 when it fails): the route saw the copy
 * request; the paste was the engine's own trusted paste; the double-click
 * found the word drawn and the probe's read was trusted.
 */
import { MOD, KEY, clickAway, focusBlockEnd } from './undoKit.mjs';
import { sleep } from './editorHarness.mjs';
import { IMAGES, addedBlocks, eventCount, fileOf, handOver, storedBlocks, until } from './canvasPasteKit.mjs';
import { fillViaChooser, storeFirst } from './canvasPasteScenarios.mjs';
import {
  bandSelect, bytesAt, column, drawnImage, openPosterWith, pageNow, pasteCarried, payloadIn, plainBlock, readClipboard, replaceImage, sameBytes, sentinel, short,
  toastsSince, userColumn,
} from './blockCopyKit.mjs';

/** The blocks a step added, the credit mark left out (seeded when a stored poster opens). */
const madeSince = (before, after) => addedBlocks(before, after).filter((b) => !b.locked);
const blockOf = (s, id) => storedBlocks(s.state, s.id).find((b) => b.id === id);
/** 'own' when `src` is block `id`'s own file in poster `posterId`, 'source' when it is `from`, else the path shortened. */
const kindOf = (uid, posterId, id, src, from) => {
  if (src == null) return 'null';
  if (src === from) return 'source';
  if (new RegExp(`^storage://${uid}/${posterId}/${id}-[A-Za-z0-9_-]{8}\\.[a-z0-9]+$`).test(src)) return 'own';
  return short(src);
};
/** What block `id` draws, waiting up to `tries` × 250 ms for a picture to load; null when none. */
async function drawnWait(page, id, tries = 24) {
  let d = null;
  for (let k = 0; k < tries && d === null; k += 1) {
    d = await drawnImage(page, id);
    if (d === null) await page.waitForTimeout(250);
  }
  return d;
}
const isDrawn = (page, id) => page.evaluate((bid) => !!document.querySelector(`#poster-canvas [data-block-id="${bid}"]`), id);
const LOST = /couldn.t be copied/;
async function reload(s) {
  await s.page.reload();
  await s.page.waitForSelector('#poster-canvas [data-block-id]', { timeout: 60000 });
  await s.page.waitForTimeout(1500);
}

/** Storage's copy answers `status` (503: busy; 400 carrying 404: not there) after `delay` ms; returns readers of the requests seen and answered. */
async function failingCopy(s, { status, delay = 0 }) {
  let seen = 0;
  let answered = 0;
  const body = status === 503
    ? { statusCode: '503', error: 'Service Unavailable', message: '503 Service Unavailable' }
    : { statusCode: '404', error: 'not_found', message: 'Object not found' };
  await s.context.route('**/storage/v1/object/copy', async (route) => {
    seen += 1;
    if (delay) await sleep(delay);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    answered += 1;
  });
  return { seen: () => seen, answered: () => answered };
}

/**
 * Storage's first copy is made (the file written at its destination in the
 * fake storage) but its answer never reaches the page: a gateway's 504 with
 * an HTML body (`how` 'gateway': the gateway timed out while storage
 * finished; the upload's comment names such 504s), or a network failure
 * (`how` 'lost'). Every later try goes to the fake backend, which refuses a
 * destination that exists (409 Duplicate), as the storage API does. Whether
 * real storage answers this sequence so is UNVERIFIED (the final check of
 * record 35, F35-FC-1). Returns readers of the requests seen and of the path
 * the first one wrote.
 */
async function copyWrittenUnanswered(s, how) {
  let seen = 0;
  let wrote = null;
  await s.context.route('**/storage/v1/object/copy', async (route) => {
    seen += 1;
    if (seen > 1) return route.fallback();
    let b = {};
    try { b = JSON.parse(route.request().postData() || '{}'); } catch { /* keep {} */ }
    const src = s.state.objects.get(b.sourceKey);
    if (src && !s.state.objects.has(b.destinationKey)) {
      s.state.objects.set(b.destinationKey, { bytes: Buffer.from(src.bytes), type: src.type, t: Date.now() });
      wrote = b.destinationKey;
    }
    if (how === 'lost') return route.abort('failed');
    return route.fulfill({ status: 504, contentType: 'text/html', body: '<html><head><title>504 Gateway Time-out</title></head><body><h1>504 Gateway Time-out</h1></body></html>' });
  });
  return { seen: () => seen, wrote: () => wrote };
}

/**
 * Storage's own error answers to a copy, as the storage API sends them (the
 * HTTP status, and the body storage-js reads `statusCode` and `message`
 * from); the shapes of the final check's probe (record 35 §9, F35-FC-2).
 * Whether real storage answers each case so is UNVERIFIED.
 */
const ANSWERS = {
  503: [503, { statusCode: '503', error: 'Service Unavailable', message: '503 Service Unavailable' }],
  403: [403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' }],
  jwt: [400, { statusCode: '400', code: 'InvalidJWT', error: 'InvalidJWT', message: 'jwt expired' }],
  404: [400, { statusCode: '404', error: 'not_found', message: 'Object not found' }],
};

/**
 * Storage's copy answered try by try as `plan` says (the last step repeats):
 * a key of `ANSWERS`, whatever the file, or 'fake' (the fake storage
 * answers: its 404 for a file that is not there, else the copy). Returns
 * readers of the requests seen and answered.
 */
export async function plannedCopy(s, plan) {
  let seen = 0;
  let answered = 0;
  await s.context.route('**/storage/v1/object/copy', async (route) => {
    const step = plan[Math.min(seen, plan.length - 1)];
    seen += 1;
    if (step === 'fake') {
      await route.fallback();
    } else {
      const [status, body] = ANSWERS[step];
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    }
    answered += 1;
  });
  return { seen: () => seen, answered: () => answered };
}

/** Storage's copy answers after `ms` (the fake backend then copies); returns a reader of the requests held. */
async function slowCopy(s, ms) {
  let held = 0;
  await s.context.route('**/storage/v1/object/copy', async (route) => { held += 1; await sleep(ms); return route.fallback(); });
  return () => held;
}

// ------------------------------------------------------------- KEEP (R3-1)

/**
 * R3-1: column 2's figure (image A) cut with ⌘X in the poster the user is
 * making, then the user's other poster opened (as from the dashboard) and
 * ⌘V there while storage answers every copy with a transient 503. The rule:
 * the pasted figure keeps the file it shows (the account's own) when storage
 * cannot copy it just then; no toast; it still draws A after a reload.
 *
 * With `sc.written` (the final check of record 35, F35-FC-1): storage makes
 * the first copy but its answer is lost (`copyWrittenUnanswered`: a gateway's
 * 504, or a network failure), and the retry reaches the fake storage. The
 * rule D: a copy storage could make is the pasted figure's own file in this
 * poster's folder (claim D), drawn, with no toast (claim KEEP).
 *
 * With `sc.plan` (correction 5, the lead's rule on F35-FC-2): storage's
 * copy answered try by try (`plannedCopy`; `sc.tries` the requests it then
 * makes): a refusal that is not about the file (403, an expired token's
 * InvalidJWT, busy then a 404 while the file is there) keeps the figure on
 * its source, drawn, with no toast (claim KEEP; with `sc.replaceAfter` a
 * later Replace gives it its own name and leaves the source's file as it
 * was: claim R). With `sc.missing` the source's file is not there when ⌘V
 * is pressed (removed from the fake storage after the cut) and the fake
 * answers its 404: the figure is emptied, with the toast (claim MISS, the
 * control that must still empty).
 */
export async function runCutCrossFail(h, s, sc = {}) {
  await storeFirst(s);
  await sentinel(s);
  const posterA = s.id;
  const img = column(storedBlocks(s.state, s.id), 1)[2];
  await fillViaChooser(s, img.id, fileOf(IMAGES.A));
  const o = blockOf(s, img.id);
  await bandSelect(s.page, [o.id]);
  await s.page.keyboard.press(`${MOD}+x`);
  const cut = await until(() => !storedBlocks(s.state, posterA).some((b) => b.id === o.id), 6000);
  await s.page.waitForTimeout(1500);
  await openPosterWith(h, s, () => ({ blocks: [plainBlock('zqbtext', 'text', 40, 200, 100, 40, { content: 'ZQ poster B' })] }));
  const posterB = s.id;
  const written = sc.written ? await copyWrittenUnanswered(s, sc.written) : null;
  const planned = sc.plan ? await plannedCopy(s, sc.plan) : null;
  const copy503 = written || planned ? null : await failingCopy(s, { status: 503 });
  const seen = () => (written ?? planned ?? copy503).seen();
  const sourceKey = String(o.imageSrc ?? '').slice('storage://'.length);
  if (sc.missing) s.state.objects.delete(sourceKey);
  await clickAway(s.page);
  const before = storedBlocks(s.state, s.id);
  const from = await eventCount(s.page);
  const t0 = await pageNow(s.page);
  const fakeFrom = s.state.copies.length;
  await s.page.keyboard.press(`${MOD}+v`);
  const pasted = await until(() => madeSince(before, storedBlocks(s.state, s.id))[0], 6000);
  if (!pasted) throw new Error('precondition: nothing pasted');
  const carried = await pasteCarried(s, from);
  const drawnWhileCopying = await drawnWait(s.page, pasted.id, 8);
  // Storage's answers (busy: 3 tries, 1 s and 4 s apart; written: the lost answer, then the fake's to the retry), then the paste settles.
  if (written) await until(() => written.seen() >= 2 && s.state.copies.length > fakeFrom, 12000);
  else if (planned) await until(() => planned.answered() >= sc.tries, 12000);
  else await until(() => copy503.answered() >= 3, 12000);
  await s.page.waitForTimeout(2500);
  const toasts = await toastsSince(s.page, t0);
  const held = blockOf(s, pasted.id);
  const drawnAfter = await drawnWait(s.page, pasted.id, 8);
  await reload(s);
  const afterReload = blockOf(s, pasted.id);
  const drawnAfterReload = await drawnWait(s.page, pasted.id);
  const p = [];
  if (!held?.imageSrc) p.push(`the pasted figure holds ${short(held?.imageSrc)} once the copies answered`);
  if (drawnAfter !== 'A') p.push(`the pasted figure draws ${drawnAfter} once the copies answered, want A`);
  if (drawnAfterReload !== 'A') p.push(`after a reload it draws ${drawnAfterReload}, want A`);
  if (toasts.some((t) => LOST.test(t))) p.push('the "couldn\'t be copied" toast was shown');
  const kind = (b) => kindOf(s.uid, posterB, pasted.id, b?.imageSrc, o.imageSrc);
  const heldKind = held ? kind(held) : 'absent';
  const reloadKind = afterReload ? kind(afterReload) : 'absent';
  const hidden = written?.wrote() ?? null;
  // MISS: the control that must still empty (the source's file is not there).
  const m = [];
  if (sc.missing) {
    if (held?.imageSrc) m.push(`the pasted figure holds ${heldKind} once the copy answered, want empty`);
    if (afterReload?.imageSrc) m.push(`after a reload it holds ${reloadKind}, want empty`);
    if (!toasts.some((t) => LOST.test(t))) m.push('no "couldn\'t be copied" toast');
  }
  const figures = `A ${storedBlocks(s.state, posterA).filter((b) => b.type === 'image' && b.imageSrc).length}, B ${storedBlocks(s.state, posterB).filter((b) => b.type === 'image' && b.imageSrc).length}`;
  let replaced = null;
  if (sc.replaceAfter && reloadKind === 'source') {
    // What the user sees next (F35-FC-3's shape): the figure shares the source's file until a Replace gives it its own name.
    await replaceImage(s, pasted.id, fileOf(IMAGES.C), () => blockOf(s, pasted.id)?.imageSrc);
    const now = blockOf(s, pasted.id);
    replaced = { held: kind(now), drawn: await drawnWait(s.page, pasted.id), sourceFile: sameBytes(bytesAt(s.state, o.imageSrc), fileOf(IMAGES.A).bytes) ? 'A, untouched' : 'CHANGED or gone' };
  }
  const claims = sc.missing
    ? { MISS: m.length > 0 }
    : {
      KEEP: p.length > 0,
      ...(written ? { D: heldKind !== 'own' || reloadKind !== 'own' } : {}),
      ...(replaced ? { R: replaced.held !== 'own' || replaced.drawn !== 'C' || replaced.sourceFile !== 'A, untouched' } : {}),
    };
  const answers = written
    ? `${sc.written === 'lost' ? 'lost on the network' : '504 html'} (the copy made), then the fake's ${s.state.copies.slice(fakeFrom).map((c) => c.status).join(',') || 'none'}`
    : planned ? `${sc.plan.join(' then ')}${sc.plan.includes('fake') ? ` (the fake's ${s.state.copies.slice(fakeFrom).map((c) => c.status).join(',') || 'none'})` : ''}` : 503;
  return {
    claims,
    numbers: {
      cutFromA: !!cut, pasted: `${pasted.type}${pasted.type === 'text' ? ` ${JSON.stringify(String(pasted.content ?? '').slice(0, 30))}` : ''}`, copyAnswers: answers, sourceFileAtPaste: sc.missing ? 'removed' : (s.state.objects.has(sourceKey) ? 'there' : 'gone'),
      copyRequests: seen(), drawnWhileCopying, heldOnceAnswered: heldKind, drawnOnceAnswered: drawnAfter, heldAfterReload: reloadKind, drawnAfterReload, toasts: toasts.join(' | ') || 'none',
      figuresWithPicture: figures,
      ...(written ? {
        hiddenCopy: hidden ? short(`storage://${hidden}`) : 'none', hiddenCopyHeld: hidden ? afterReload?.imageSrc === `storage://${hidden}` : 'n/a',
        filesInB: [...s.state.objects.keys()].filter((k) => k.startsWith(`${s.uid}/${posterB}/`)).length,
      } : {}),
      ...(sc.replaceAfter ? { afterReplaceWithC: replaced ? `holds ${replaced.held}, draws ${replaced.drawn}; the source's file ${replaced.sourceFile}` : 'not done (the figure did not keep its source)' } : {}),
      problems: (sc.missing ? m : p).join(' ; ') || 'none',
    },
    carried: seen() >= 1 ? carried : { ok: false, why: 'the route saw no copy request' },
  };
}

// ------------------------------------------------------------- MSGT (R3-2)

/**
 * R3-2: column 2's image copied (⌘C) and pasted (⌘V) while storage refuses
 * the copy after `sc.delay` ms (a file that is not there). Meanwhile the
 * user (`sc.meanwhile`) presses ⌘Z 300 ms after ⌘V, or (after a ⌘X of the
 * image first, so the copy lands at its place) replaces the pasted copy's
 * picture with C. The rule: the toast "… couldn't be copied, so its block is
 * empty." only for a pasted block on the canvas that is empty when it is
 * shown.
 */
async function runToastTruth(h, s, sc) {
  const col = await userColumn(s);
  await clickAway(s.page);
  await bandSelect(s.page, [col.img.id]);
  await s.page.keyboard.press(`${MOD}+c`);
  await s.page.waitForTimeout(300);
  await clickAway(s.page);
  await s.page.waitForTimeout(900);
  if (sc.meanwhile === 'replace') {
    await bandSelect(s.page, [col.img.id]);
    await s.page.keyboard.press(`${MOD}+x`);
    await until(() => !blockOf(s, col.img.id), 6000);
    await s.page.waitForTimeout(700);
    await clickAway(s.page);
  }
  const before = storedBlocks(s.state, s.id);
  const refused = await failingCopy(s, { status: 400, delay: sc.delay });
  const from = await eventCount(s.page);
  const t0 = await pageNow(s.page);
  await s.page.keyboard.press(`${MOD}+v`);
  const pasted = await until(() => madeSince(before, storedBlocks(s.state, s.id))[0], 6000);
  if (!pasted) throw new Error('precondition: nothing pasted');
  const carried = await pasteCarried(s, from);
  let did;
  if (sc.meanwhile === 'undo') {
    await s.page.waitForTimeout(300);
    await s.page.keyboard.press(KEY.undo);
    did = '⌘Z 300 ms after ⌘V';
  } else {
    // The paste selects the copy: its Replace button, as a user replaces a selected figure.
    const file = fileOf(IMAGES.C);
    handOver(s, [file]);
    const replace = s.page.getByRole('button', { name: /Replace/i }).first();
    const [chooser] = await Promise.all([s.page.waitForEvent('filechooser', { timeout: 8000 }), replace.click()]);
    await chooser.setFiles({ name: file.name, mimeType: file.type, buffer: file.bytes });
    await until(() => blockOf(s, pasted.id)?.imageSrc !== pasted.imageSrc, 10000);
    did = 'the pasted copy replaced with C';
  }
  // Watch until storage has refused the copy and the paste has settled: what the canvas shows when a toast comes.
  let atToast = null;
  const tEnd = Date.now() + sc.delay + 4000;
  while (Date.now() < tEnd) {
    const seen = await toastsSince(s.page, t0);
    if (!atToast && seen.some((t) => LOST.test(t))) {
      const drawn = await isDrawn(s.page, pasted.id);
      atToast = { drawn, picture: drawn ? await drawnWait(s.page, pasted.id, 8) : null };
    }
    if (refused.answered() >= 1 && Date.now() > tEnd - 2500) break;
    await s.page.waitForTimeout(100);
  }
  const toasts = await toastsSince(s.page, t0);
  const nowHeld = blockOf(s, pasted.id);
  let afterRedo = 'n/a';
  if (sc.meanwhile === 'undo') {
    await clickAway(s.page);
    await s.page.keyboard.press(KEY.redo);
    await s.page.waitForTimeout(2000);
    const back = blockOf(s, pasted.id);
    afterRedo = back ? `${kindOf(s.uid, s.id, pasted.id, back.imageSrc, col.img.imageSrc)} drawing ${await drawnWait(s.page, pasted.id, 8)}` : 'absent';
  }
  const p = [];
  if (atToast && (!atToast.drawn || atToast.picture !== null)) {
    p.push(`"couldn't be copied, so its block is empty" shown while the pasted block ${atToast.drawn ? `draws ${atToast.picture}` : 'is not on the canvas'}`);
  }
  return {
    claims: { MSGT: p.length > 0 },
    numbers: {
      meanwhile: did, copyRefusedAfterMs: sc.delay, copyRequests: refused.seen(), shownWhileCopying: kindOf(s.uid, s.id, pasted.id, pasted.imageSrc, col.img.imageSrc),
      toasts: toasts.join(' | ') || 'none', blockWhenToastShown: atToast ? (atToast.drawn ? `drawn, picture ${atToast.picture}` : 'not on the canvas') : 'no such toast',
      heldAfter: nowHeld ? kindOf(s.uid, s.id, pasted.id, nowHeld.imageSrc, col.img.imageSrc) : 'absent', afterRedo, problems: p.join(' ; ') || 'none',
    },
    carried: refused.seen() >= 1 ? carried : { ok: false, why: 'the route saw no copy request' },
  };
}

// ------------------------------------------------------------- HIST (R3-3)

/**
 * R3-3: column 2's image copied and pasted (⌘V), or cloned (⌘D,
 * `sc.via`), while storage's copy takes `sc.delay` ms; before it lands the
 * user makes another step (`sc.step`: column 1's text moved with
 * ArrowRight, a word typed into column 2's text, or the pasted copy itself
 * dragged with the mouse, pressed before the copy lands and released after:
 * R3-3's sibling, the drag's own snapshot of the poster); after it lands,
 * one ⌘Z. The rule: the ⌘Z undoes that step and the copy keeps its own file
 * (stored, and after a reload).
 */
async function runSwapThenUndo(h, s, sc) {
  const col = await userColumn(s);
  await clickAway(s.page);
  await bandSelect(s.page, [col.img.id]);
  if (sc.via === 'paste') {
    await s.page.keyboard.press(`${MOD}+c`);
    await s.page.waitForTimeout(300);
    await clickAway(s.page);
  }
  await s.page.waitForTimeout(900);
  const before = storedBlocks(s.state, s.id);
  const held = await slowCopy(s, sc.delay);
  const from = await eventCount(s.page);
  await s.page.keyboard.press(sc.via === 'paste' ? `${MOD}+v` : `${MOD}+d`);
  const made = await until(() => madeSince(before, storedBlocks(s.state, s.id))[0], 6000);
  if (!made) throw new Error('precondition: nothing pasted or cloned');
  const carried = sc.via === 'paste' ? await pasteCarried(s, from) : { ok: true, why: '⌘D (no clipboard)' };
  let stepDone;
  let undoneStep;
  if (sc.step === 'drag') {
    // The paste selected the copy: press on its move handle (as arrangeUi's dragMove), move in steps for longer than the copy takes, release after it lands.
    const box = await s.page.locator(`#poster-canvas [data-block-id="${made.id}"] button[title^="Drag to move"]`).first().boundingBox();
    if (!box) throw new Error('precondition: the pasted copy\'s move handle is not drawn');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await s.page.mouse.move(cx, cy);
    await s.page.mouse.down();
    for (let k = 1; k <= 10; k += 1) {
      await s.page.mouse.move(cx + k * 6, cy + k * 4, { steps: 2 });
      await s.page.waitForTimeout(Math.round((sc.delay + 600) / 10));
    }
    await s.page.mouse.up();
    stepDone = !!(await until(() => blockOf(s, made.id)?.x !== made.x, 4000));
    undoneStep = () => blockOf(s, made.id)?.x === made.x && blockOf(s, made.id)?.y === made.y;
  } else if (sc.step === 'move') {
    const c1 = column(storedBlocks(s.state, s.id), 0).find((b) => b.type === 'text');
    await bandSelect(s.page, [c1.id]);
    await s.page.keyboard.press('ArrowRight');
    stepDone = !!(await until(() => blockOf(s, c1.id)?.x !== c1.x, 3000));
    undoneStep = () => blockOf(s, c1.id)?.x === c1.x;
  } else {
    await focusBlockEnd(s.page, col.text.id);
    await s.page.keyboard.type(' ZQBURST', { delay: 150 });
    stepDone = !!(await until(() => (blockOf(s, col.text.id)?.content ?? '').includes('ZQBURST'), 6000));
    undoneStep = () => !(blockOf(s, col.text.id)?.content ?? '').includes('ZQBURST');
  }
  await clickAway(s.page);
  await s.page.waitForTimeout(sc.delay + 1500);
  const kind = (b) => (b ? kindOf(s.uid, s.id, made.id, b.imageSrc, col.img.imageSrc) : 'absent');
  const beforeUndo = kind(blockOf(s, made.id));
  await s.page.keyboard.press(KEY.undo);
  await s.page.waitForTimeout(2000);
  const tookStepBack = undoneStep();
  const afterUndo = kind(blockOf(s, made.id));
  await reload(s);
  const afterReload = kind(blockOf(s, made.id));
  const drawn = await drawnWait(s.page, made.id);
  const p = [];
  if (!tookStepBack) p.push('the ⌘Z did not undo the step made while the file was copied');
  if (afterUndo !== 'own') p.push(`after the ⌘Z the ${sc.via === 'paste' ? 'copy' : 'clone'} holds ${afterUndo}, want its own file`);
  if (afterReload !== 'own') p.push(`after a reload it holds ${afterReload}`);
  return {
    claims: { HIST: beforeUndo === 'own' ? p.length > 0 : null, D: beforeUndo !== 'own' },
    numbers: {
      via: sc.via, step: sc.step, copyDelayMs: sc.delay, stepStored: stepDone, heldBeforeUndo: beforeUndo, undoTookStepBack: tookStepBack, heldAfterUndo: afterUndo,
      heldAfterReload: afterReload, drawnAfterReload: drawn, original: short(col.img.imageSrc), problems: p.join(' ; ') || 'none',
    },
    carried: held() >= 1 ? carried : { ok: false, why: 'the route held no copy request' },
  };
}

/**
 * R3-3's sibling (record §10 until round 3): ⌘V (or ⌘D) while storage's copy
 * takes `sc.delay` ms, ⌘Z 300 ms after (before the file is copied), then,
 * once it is copied, ⌘⇧Z. The rule: the block brought back holds its own
 * file (stored, and after a reload), drawing A.
 */
async function runRedoOwnFile(h, s, sc) {
  const col = await userColumn(s);
  await clickAway(s.page);
  await bandSelect(s.page, [col.img.id]);
  if (sc.via === 'paste') {
    await s.page.keyboard.press(`${MOD}+c`);
    await s.page.waitForTimeout(300);
    await clickAway(s.page);
  }
  await s.page.waitForTimeout(900);
  const before = storedBlocks(s.state, s.id);
  const held = await slowCopy(s, sc.delay);
  const from = await eventCount(s.page);
  const known = await s.page.evaluate(() => [...new Set([...document.querySelectorAll('#poster-canvas [data-block-id]')].map((e) => e.getAttribute('data-block-id')))]);
  await s.page.keyboard.press(sc.via === 'paste' ? `${MOD}+v` : `${MOD}+d`);
  await s.page.waitForTimeout(300);
  const id = (await s.page.evaluate(() => [...new Set([...document.querySelectorAll('#poster-canvas [data-block-id]')].map((e) => e.getAttribute('data-block-id')))])).find((x) => !known.includes(x));
  await s.page.keyboard.press(KEY.undo);
  const carried = sc.via === 'paste' ? await pasteCarried(s, from) : { ok: true, why: '⌘D (no clipboard)' };
  await s.page.waitForTimeout(sc.delay + 1500);
  const goneAfterUndo = !(await isDrawn(s.page, id ?? '-'));
  await clickAway(s.page);
  await s.page.keyboard.press(KEY.redo);
  await until(() => blockOf(s, id ?? '-'), 6000);
  await s.page.waitForTimeout(1500);
  const kind = (b) => (b ? kindOf(s.uid, s.id, id, b.imageSrc, col.img.imageSrc) : 'absent');
  const afterRedo = kind(blockOf(s, id ?? '-'));
  await reload(s);
  const afterReload = kind(blockOf(s, id ?? '-'));
  const drawn = id ? await drawnWait(s.page, id) : null;
  const p = [];
  if (afterRedo !== 'own') p.push(`after ⌘⇧Z the ${sc.via === 'paste' ? 'copy' : 'clone'} holds ${afterRedo}, want its own file`);
  if (afterReload !== 'own') p.push(`after a reload it holds ${afterReload}`);
  if (drawn !== 'A') p.push(`it draws ${drawn}, want A`);
  return {
    claims: { HIST: id && goneAfterUndo ? p.length > 0 : null },
    numbers: { via: sc.via, copyDelayMs: sc.delay, newBlock: id ? 'drawn at 300 ms' : 'none', goneAfterUndo, heldAfterRedo: afterRedo, heldAfterReload: afterReload, drawnAfterReload: drawn, problems: p.join(' ; ') || 'none' },
    carried: held() >= 1 && id ? carried : { ok: false, why: `the route held ${held()} copy request(s); new block ${id ?? 'none'}` },
  };
}

// --------------------------------------------------------------- PT (R3-4)

/**
 * R3-4: a poster with a References block (a reference titled "ZQREFTITLE
 * words"), nothing being edited; a double-click on the word ZQREFTITLE on
 * the canvas, then ⌘C. The rule (main's behaviour): the double-click selects
 * the word and ⌘C copies it (the browser's copy), no payload.
 */
async function runDblClickWord(h, s) {
  await openPosterWith(h, s, () => ({
    blocks: [plainBlock('zqref1', 'references', 240, 60, 200, 120), plainBlock('zqtxt1', 'text', 40, 60, 150, 60, { content: 'ZQ other words' })],
    data: { references: [{ id: 'r1', authors: ['Smith J'], year: '2020', title: 'ZQREFTITLE words', journal: 'Acme J' }] },
  }));
  await sentinel(s);
  const pt = await s.page.evaluate(() => {
    const el = document.querySelector('#poster-canvas [data-block-id="zqref1"]');
    if (!el) return { err: 'the References block is not drawn' };
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = (n.textContent ?? '').indexOf('ZQREFTITLE');
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i + 2);
      r.setEnd(n, i + 5);
      const b = r.getBoundingClientRect();
      if (b.width > 0) return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }
    return { err: 'the word is not drawn' };
  });
  if (pt.err) throw new Error(`precondition: ${pt.err}`);
  await s.page.mouse.dblclick(pt.x, pt.y);
  await s.page.waitForTimeout(400);
  const after = await s.page.evaluate(() => ({
    selected: String(getSelection() ?? ''),
    editing: !!document.activeElement?.isContentEditable,
    blocks: [...new Set([...document.querySelectorAll('#poster-canvas [data-postr-selected="true"]')].map((e) => e.getAttribute('data-block-id')))].join(',') || 'none',
  }));
  await s.page.keyboard.press(`${MOD}+c`);
  await s.page.waitForTimeout(300);
  const clip = await readClipboard(s.page);
  const pl = clip ? await payloadIn(s.page, clip.html) : { found: false };
  const p = [];
  if (!after.selected.includes('ZQREFTITLE')) p.push(`the double-click left ${JSON.stringify(after.selected.slice(0, 30))} selected, want the word`);
  if (pl.found) p.push('a block payload on the clipboard');
  if (!(clip?.text ?? '').includes('ZQREFTITLE')) p.push(`the clipboard's text is ${JSON.stringify((clip?.text ?? '').slice(0, 30))}, want the word`);
  return {
    claims: { PT: p.length > 0 },
    numbers: { selectionAfterDblclick: JSON.stringify(after.selected.slice(0, 30)), editing: after.editing, blocksSelected: after.blocks, clipboardText: JSON.stringify((clip?.text ?? '').slice(0, 40)), payload: pl.found ? 'found' : 'none', problems: p.join(' ; ') || 'none' },
    carried: { ok: !!clip?.trusted, why: `the word found and double-clicked; probe read trusted=${clip?.trusted}` },
  };
}

// --------------------------------------------------------------- list

export const ROUND3_BLOCK_SCENARIOS = [
  { id: 'C-r3-cut-cross-fail', run: runCutCrossFail, how: 'KEEP (R3-1): column 2\'s figure cut with ⌘X, the user\'s other poster opened as from the dashboard, ⌘V there while storage answers every copy with a transient 503: the figure keeps the file it shows and draws A, also after a reload; no "couldn\'t be copied" toast' },
  { id: 'C-r3-cut-cross-504-written', run: runCutCrossFail, written: 'gateway', how: 'KEEP and D (the final check, F35-FC-1): the same cut and paste in the other poster; storage makes the first copy but the gateway answers 504 (an HTML page), and the retry reaches storage: the figure holds its own file in this poster\'s folder and draws A, also after a reload; no "couldn\'t be copied" toast' },
  { id: 'C-r3-cut-cross-answer-lost', run: runCutCrossFail, written: 'lost', how: 'KEEP and D (F35-FC-1\'s sibling): the same, the first copy made but its answer lost on the network: the figure holds its own file and draws A, also after a reload; no toast' },
  { id: 'C-r3-toast-undo', run: runToastTruth, meanwhile: 'undo', delay: 2500, how: 'MSGT (R3-2): column 2\'s image copied and pasted while storage refuses the copy after 2.5 s, ⌘Z 300 ms after ⌘V: no "couldn\'t be copied, so its block is empty" toast while the block is not on the canvas' },
  { id: 'C-r3-toast-replace', run: runToastTruth, meanwhile: 'replace', delay: 6000, how: 'MSGT (R3-2): column 2\'s image cut, then pasted back while storage refuses the copy after 6 s, the pasted copy replaced with C meanwhile: no "couldn\'t be copied, so its block is empty" toast while it draws C' },
  { id: 'C-r3-swap-undo-move', run: runSwapThenUndo, via: 'paste', step: 'move', delay: 1500, how: 'HIST (R3-3): column 2\'s image pasted while storage\'s copy takes 1.5 s, column 1\'s text moved with ArrowRight meanwhile; once copied, one ⌘Z: the move undone, the copy keeps its own file (and after a reload)' },
  { id: 'C-r3-swap-undo-move-dup', run: runSwapThenUndo, via: 'dup', step: 'move', delay: 1500, how: 'HIST (R3-3): the same with ⌘D: the clone keeps its own file after the ⌘Z' },
  { id: 'C-r3-swap-undo-drag', run: runSwapThenUndo, via: 'paste', step: 'drag', delay: 1500, how: 'HIST (R3-3\'s sibling): column 2\'s image pasted while storage\'s copy takes 1.5 s, the pasted copy dragged with the mouse meanwhile (pressed before the copy lands, released 2.1 s later); one ⌘Z: the drag undone, the copy keeps its own file (and after a reload)' },
  { id: 'C-r3-swap-undo-typing', run: runSwapThenUndo, via: 'paste', step: 'typing', delay: 1500, how: 'HIST (R3-3): column 2\'s image pasted while storage\'s copy takes 1.5 s, a word typed into column 2\'s text meanwhile (one key each 150 ms); once copied, one ⌘Z: the word undone, the copy keeps its own file' },
  { id: 'C-r3-redo-own-file', run: runRedoOwnFile, via: 'paste', delay: 1000, how: 'HIST (R3-3\'s sibling): ⌘V while storage\'s copy takes 1 s, ⌘Z at 300 ms, then once copied ⌘⇧Z: the copy brought back holds its own file, drawing A (and after a reload)' },
  { id: 'C-r3-redo-own-file-dup', run: runRedoOwnFile, via: 'dup', delay: 1000, how: 'HIST (R3-3\'s sibling): the same with ⌘D' },
  { id: 'C-r3-dbl-references', run: runDblClickWord, how: 'PT (R3-4): a word of the References block double-clicked on the canvas, nothing being edited, ⌘C: the word selected and copied (the browser\'s copy), no payload' },
];
