/**
 * The final check of record 35 (docs/fixes/35-block-copy.md §9), F35-FC-2,
 * folded into scripts/canvas-paste-check.mjs (`--only C-fc`) for correction
 * 5: the lead's rule for a pasted image or a ⌘D clone whose source is a file
 * of the user's own folder: the block is emptied only when storage says that
 * file does not exist (a 404 / not_found answered to the first try); every
 * other refusal or failure keeps the block showing its source, with no
 * "couldn't be copied" toast. Entered as the user enters: column 2's figure
 * filled through "+ Upload figure" and cut with ⌘X, the user's other poster
 * opened as from the dashboard and ⌘V there (the checker's `F-cut-` shapes);
 * or a poster seeded with an image, selected with a rubber band, ⌘D.
 * Storage's copy is answered with a route on /storage/v1/object/copy, try by
 * try (lib/blockCopyRound3Scenarios.mjs `plannedCopy`: storage's own error
 * bodies as the checker's probe sent them), or by the fake storage itself for
 * a file that is not there. What is read: the poster rows, the fake storage's
 * files, what the canvas draws (an image's natural size) and the toasts.
 * Nothing calls the app's store or its modules.
 *
 * CLAIMS (observed = the defect present)
 *   KEEP a pasted figure or a ⌘D clone whose own-folder source is there,
 *        refused for a reason that is not about the file, draws no picture
 *        once the copy has answered (or after a reload), or the "couldn't be
 *        copied" toast is shown for it
 *   MISS the control: a pasted figure or a ⌘D clone whose own-folder source
 *        is not there (storage's 404) is not emptied once the copy has
 *        answered (or after a reload), or the toast is missing
 *   R    (C-fc-cut-403) after a reload, a Replace on the pasted figure that
 *        kept its source does not give it its own name drawing C, or changes
 *        the source's file
 *
 * The control `carried` (exit 2 when it fails): the route (or the fake) saw
 * the copy request; the paste was the engine's own trusted paste; the seeded
 * original drew A (⌘D, its file there).
 */
import { MOD, clickAway } from './undoKit.mjs';
import { IMAGES, addedBlocks, fileOf, storedBlocks, until } from './canvasPasteKit.mjs';
import { bandSelect, drawnImage, openPosterWith, pageNow, plainBlock, short, toastsSince } from './blockCopyKit.mjs';
import { plannedCopy, runCutCrossFail } from './blockCopyRound3Scenarios.mjs';

const LOST = /couldn.t be copied/;
const blockOf = (s, id) => storedBlocks(s.state, s.id).find((b) => b.id === id);
/** What block `id` draws, waiting up to `tries` × 250 ms for a picture to load; null when none. */
async function drawnWait(page, id, tries = 24) {
  let d = null;
  for (let k = 0; k < tries && d === null; k += 1) {
    d = await drawnImage(page, id);
    if (d === null) await page.waitForTimeout(250);
  }
  return d;
}

/**
 * ⌘D of a seeded poster's image (its file `{block}-abcd1234.png` in the
 * user's own folder, there unless `sc.missing`), storage's copy answered as
 * `sc.plan` says ('fake': the fake storage answers, its 404 for a file that
 * is not there). The rule: refused for a reason not about the file, the
 * clone keeps its original's file, drawn, no toast (KEEP); the file not
 * there, the clone is emptied, with the toast (MISS).
 */
async function runDupRefusal(h, s, sc) {
  const id = 'zqimg01';
  let path = null;
  await openPosterWith(h, s, (uid, posterId) => {
    path = `${uid}/${posterId}/${id}-abcd1234.png`;
    return { blocks: [plainBlock(id, 'image', 200, 120, 80, 50, { imageSrc: `storage://${path}` })], files: sc.missing ? [] : [[path, fileOf(IMAGES.A).bytes]] };
  });
  const from = `storage://${path}`;
  const planned = await plannedCopy(s, sc.plan);
  const originalDrawn = await drawnWait(s.page, id, sc.missing ? 4 : 24);
  const before = storedBlocks(s.state, s.id);
  await bandSelect(s.page, [id]);
  const t0 = await pageNow(s.page);
  await s.page.keyboard.press(`${MOD}+d`);
  const clone = await until(() => addedBlocks(before, storedBlocks(s.state, s.id)).find((b) => !b.locked), 6000);
  if (!clone) throw new Error('precondition: no clone');
  await until(() => planned.answered() >= 1, 8000);
  await s.page.waitForTimeout(2500);
  const toasts = await toastsSince(s.page, t0);
  const kind = (b) => {
    if (!b) return 'absent';
    if (b.imageSrc == null) return 'null';
    if (b.imageSrc === from) return 'source';
    if (new RegExp(`^storage://${s.uid}/${s.id}/${clone.id}-[A-Za-z0-9_-]{8}\\.png$`).test(b.imageSrc)) return 'own';
    return short(b.imageSrc);
  };
  const held = kind(blockOf(s, clone.id));
  const drawn = await drawnWait(s.page, clone.id, sc.missing ? 4 : 24);
  await clickAway(s.page);
  await s.page.reload();
  await s.page.waitForSelector(`#poster-canvas [data-block-id="${clone.id}"]`, { timeout: 60000 });
  await s.page.waitForTimeout(1500);
  const afterReload = kind(blockOf(s, clone.id));
  const drawnAfterReload = await drawnWait(s.page, clone.id, sc.missing ? 4 : 24);
  const p = [];
  if (sc.missing) {
    if (held !== 'null') p.push(`the clone holds ${held} once the copy answered, want empty`);
    if (afterReload !== 'null') p.push(`after a reload it holds ${afterReload}, want empty`);
    if (!toasts.some((t) => LOST.test(t))) p.push('no "couldn\'t be copied" toast');
  } else {
    if (held !== 'source' || drawn !== 'A') p.push(`the clone holds ${held} drawing ${drawn}, want its original's file drawing A`);
    if (afterReload !== 'source' || drawnAfterReload !== 'A') p.push(`after a reload it holds ${afterReload} drawing ${drawnAfterReload}`);
    if (toasts.some((t) => LOST.test(t))) p.push('the "couldn\'t be copied" toast was shown');
  }
  return {
    claims: { [sc.missing ? 'MISS' : 'KEEP']: p.length > 0 },
    numbers: {
      original: short(from), originalFile: sc.missing ? 'not there' : 'there', originalDrawn, copyAnswers: sc.plan.join(' then '),
      fakeCopies: s.state.copies.map((c) => c.status).join(',') || 'none', copyRequests: planned.seen(), cloneHeld: held, cloneDrawn: drawn,
      heldAfterReload: afterReload, drawnAfterReload, toasts: toasts.join(' | ') || 'none', problems: p.join(' ; ') || 'none',
    },
    carried: planned.seen() >= 1 && (sc.missing || originalDrawn === 'A')
      ? { ok: true, why: `the copy request seen (${planned.seen()}); the original draws ${originalDrawn}` }
      : { ok: false, why: `copy requests ${planned.seen()}; the original draws ${originalDrawn}` },
  };
}

export const FINAL_BLOCK_SCENARIOS = [
  { id: 'C-fc-cut-403', run: runCutCrossFail, plan: ['403'], tries: 1, replaceAfter: true, how: 'KEEP, R (F35-FC-2, the checker\'s F-cut-403): column 2\'s figure cut with ⌘X, the user\'s other poster opened, ⌘V there while storage refuses the copy 403 (row-level security) although the file is there: the figure keeps its source and draws A, also after a reload, no toast; then a Replace with C gives it its own name, the source\'s file untouched' },
  { id: 'C-fc-cut-jwt', run: runCutCrossFail, plan: ['jwt'], tries: 1, how: 'KEEP (F35-FC-2): the same, storage answering the first try 400 InvalidJWT "jwt expired": kept on its source, drawn, no toast' },
  { id: 'C-fc-cut-busy-jwt', run: runCutCrossFail, plan: ['503', 'jwt'], tries: 2, how: 'KEEP (F35-FC-2, the checker\'s F-cut-busy-then-jwt): busy (503), then 400 InvalidJWT: kept on its source, drawn, no toast' },
  { id: 'C-fc-cut-busy-404', run: runCutCrossFail, plan: ['503', '404'], tries: 2, how: 'KEEP (F35-FC-2, the checker\'s F-cut-busy-then-missing): busy (503), then a 404 "Object not found" while the file IS there: kept on its source, drawn, no toast' },
  { id: 'C-fc-cut-missing', run: runCutCrossFail, plan: ['fake'], tries: 1, missing: true, how: 'MISS (the control): the same cut and paste, the source\'s file not there when ⌘V is pressed, the fake storage answering its 404: the figure emptied, with the toast, also after a reload' },
  { id: 'C-fc-dup-403', run: runDupRefusal, plan: ['403'], how: 'KEEP (F35-FC-2, ⌘D): a stored image selected, ⌘D while storage refuses the copy 403: the clone keeps its original\'s file and draws A, also after a reload, no toast' },
  { id: 'C-fc-dup-missing', run: runDupRefusal, plan: ['fake'], missing: true, how: 'MISS (the lead\'s rule for ⌘D): a stored image whose file is not there, ⌘D, the fake storage answering its 404: the clone emptied, with the toast, also after a reload' },
];
