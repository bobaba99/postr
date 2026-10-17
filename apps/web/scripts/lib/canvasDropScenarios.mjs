/**
 * Drop scenarios for scripts/canvas-paste-check.mjs (record
 * docs/fixes/34-paste-drop.md; bounded-designs §3.3 "Drop" and "Image
 * checks"): files dropped on the canvas as lib/canvasPasteKit.mjs's
 * dropFiles does it (Chromium: trusted, through the DevTools protocol;
 * Firefox and WebKit: page-made drag events carrying real Files), then
 * the poster, the uploads and the drawing read, and one ⌘Z.
 *
 * A drop point is where the user lets go; the block's place is judged in
 * sheet units read from the sheet's own box on screen (its zoom from its
 * width), not from the app's code.
 */
import { MOD, clickAway } from './undoKit.mjs';
import { until } from './canvasPasteKit.mjs';
import { pinchTo } from './selectionControls.mjs';
import {
  IMAGES, PDF_FILE, addedBlocks, bigPng, handOver, drawnBlock, dropFiles, emptySheetPoint, eventCount, eventsSince, fileOf, othersChanged,
  keyedName, paintShare, renamed, settledChange, sheetUnits, storedBlocks, storedEquals, toUnits, uploadsOf, waitPaint,
} from './canvasPasteKit.mjs';
import { fillViaChooser, judgeCreate, openSession, storeFirst } from './canvasPasteScenarios.mjs';

const round = (v) => Math.round(v * 100) / 100;

/** The drop reached the page (control K2): Chromium's trusted dragover, or the page-made events dispatched. */
export async function dropReached(s, from, how) {
  const overs = await eventsSince(s.page, 'dragover', from);
  const drops = await eventsSince(s.page, 'drop', from);
  const files = overs[0]?.types?.includes('Files') ?? false;
  return { ok: overs.length > 0 && files, why: `${how}: dragover ${overs.length} (trusted ${overs[0]?.trusted ?? '-'}), drop ${drops.length}, types ${overs[0]?.types?.join(',') ?? '-'}` };
}

/** Drop `files` at an empty point of the sheet (fractions fx, fy) and judge the blocks made. */
async function runDropNew(h, s, sc) {
  await storeFirst(s);
  if (sc.zoom) await sc.zoom(s);
  const pt = await emptySheetPoint(s.page, sc.at?.[0] ?? 0.5, sc.at?.[1] ?? 0.93);
  if (!pt) throw new Error('precondition: no empty point on the sheet');
  const d0 = await drawnBlock(s.page, storedBlocks(s.state, s.id)[0].id);
  const dropAt = toUnits(d0, pt);
  const before = storedBlocks(s.state, s.id);
  const since = Date.now();
  const from = await eventCount(s.page);
  const alertsFrom = s.alerts.length;
  const files = sc.files();
  const drop = await dropFiles(h, s, files, pt, h.out);
  const k2 = await dropReached(s, from, drop.how);
  const images = sc.want;
  const alerts = () => s.alerts.slice(alertsFrom).map((a) => a.message);
  const claims = {};
  const numbers = { how: drop.how, dragoverCancelled: drop.overCancelled, dropAtIn: `${round(dropAt.x / 10)}, ${round(dropAt.y / 10)}`, zoom: round(d0.zoom) };
  if (!images.length) {
    await s.page.waitForTimeout(2500);
    const after = storedBlocks(s.state, s.id);
    const ups = s.state.uploads.filter((u) => u.t >= since).length;
    claims[sc.claim] = addedBlocks(before, after).length > 0 || othersChanged(before, after).length > 0 || ups > 0;
    if (sc.message) claims.MSG = !alerts().some((m) => sc.message.test(m));
    return { claims, numbers: { ...numbers, added: addedBlocks(before, after).length, uploads: ups, alerts: alerts().join(' | ').slice(0, 200) || 'none' }, carried: k2 };
  }
  const want = images.map((img, i) => ({ type: 'image', image: img, inView: false, covered: i < images.length - 1 }));
  const place = (blk, i, after) => {
    const p = [];
    if (i === 0) {
      // Centred on the drop point, or as near it as the sheet lets it be (the rule keeps it on the sheet).
      const sheet = sheetUnits(s.state, s.id);
      const want = { x: Math.max(blk.w / 2, Math.min(sheet.w - blk.w / 2, dropAt.x)), y: Math.max(blk.h / 2, Math.min(sheet.h - blk.h / 2, dropAt.y)) };
      const cx = blk.x + blk.w / 2;
      const cy = blk.y + blk.h / 2;
      if (Math.abs(cx - want.x) > 3 || Math.abs(cy - want.y) > 3) p.push(`centre ${round(cx)}, ${round(cy)}, want ${round(want.x)}, ${round(want.y)} for the drop point ${round(dropAt.x)}, ${round(dropAt.y)} (units)`);
    } else {
      const first = addedBlocks(before, after)[0];
      if (Math.abs(blk.x - first.x - 10 * i) > 0.01 || Math.abs(blk.y - first.y - 10 * i) > 0.01) p.push(`at ${round(blk.x)}, ${round(blk.y)}: not ${i} in down and right of the first (${round(first.x)}, ${round(first.y)})`);
    }
    return p;
  };
  const r = await judgeCreate(s, before, want, { since, place });
  claims[sc.claim] = r.claims.MADE;
  claims.N = r.claims.N;
  claims.U = r.claims.U;
  if (sc.message) claims.MSG = !alerts().some((m) => sc.message.test(m));
  return { claims, numbers: { ...numbers, ...r.numbers, alerts: alerts().join(' | ').slice(0, 160) || 'none' }, carried: k2 };
}

/**
 * Drop `file` on the layout's image block (empty, or filled first with
 * image A through its own upload): its image replaced. Then, as
 * information (bounded-designs §3.3 D, the next fix's), what one ⌘Z
 * stores and draws.
 */
async function runDropOnImage(h, s, sc) {
  await storeFirst(s);
  const img = storedBlocks(s.state, s.id).find((b) => b.type === 'image');
  if (!img) throw new Error('precondition: no image block');
  if (sc.filled) await fillViaChooser(s, img.id, fileOf(IMAGES.A));
  const held = storedBlocks(s.state, s.id).find((b) => b.id === img.id);
  const paintBefore = sc.filled ? await waitPaint(s.page, img.id, IMAGES.A.rgb) : null;
  const d = await drawnBlock(s.page, img.id);
  const pt = { x: d.box.x + d.box.w / 2, y: d.box.y + d.box.h * 0.6 };
  const before = storedBlocks(s.state, s.id);
  const since = Date.now();
  const from = await eventCount(s.page);
  const drop = await dropFiles(h, s, [sc.file], pt, h.out);
  const k2 = await dropReached(s, from, drop.how);
  const changed = await settledChange(s.state, s.id, before, { timeout: 14000 });
  const after = storedBlocks(s.state, s.id);
  const blk = after.find((b) => b.id === img.id);
  const p = [];
  const added = addedBlocks(before, after);
  if (added.length) p.push(`${added.length} blocks added`);
  const ext = sc.file.name.split('.').pop();
  if (!new RegExp(`^storage://${s.uid}/${s.id}/${keyedName(img.id, ext)}$`).test(blk?.imageSrc ?? '')) p.push(`imageSrc ${String(blk?.imageSrc).slice(0, 80)}`);
  const ups = uploadsOf(s.state, img.id, since);
  if (ups.length !== 1) p.push(`${ups.length} uploads keyed by it`);
  const aspect = IMAGES.B.w / IMAGES.B.h;
  if (blk && Math.abs(blk.w - held.w) > 0.01) p.push(`width ${blk.w}, was ${held.w}`);
  if (blk && Math.abs(blk.h - Math.round(held.w / aspect)) > 1) p.push(`height ${blk.h}, want the image's shape ${Math.round(held.w / aspect)}`);
  const paint = await waitPaint(s.page, img.id, IMAGES.B.rgb);
  if (paint === null || paint < 0.5) p.push(`the new image covers ${paint} of its box`);
  const others = othersChanged(before, after, [img.id]);
  // One ⌘Z: on an empty block it must empty it again (U, counted); on a
  // filled one, information: what it stores and draws (§3.3 D).
  await s.page.keyboard.press(`${MOD}+z`);
  const undone = await storedEquals(s.state, s.id, before, 6000);
  const stillDrawsNew = sc.filled ? null : ((await paintShare(s.page, img.id, IMAGES.B.rgb)) ?? 0) > 0.05;
  await s.page.waitForTimeout(1200);
  const now = storedBlocks(s.state, s.id).find((b) => b.id === img.id);
  const share = async (rgb) => paintShare(s.page, img.id, rgb);
  const undoInfo = {
    storedBackToBefore: undone,
    imageSrcAfterUndo: String(now?.imageSrc ?? null).replace(/^storage:\/\/[^/]+\/[^/]+\//, 'storage://…/'),
    drawnAfterUndo: `A ${await share(IMAGES.A.rgb)} · B ${await share(IMAGES.B.rgb)}`,
    fileAtOldPathIs: sc.filled ? (s.state.objects.get(String(held.imageSrc).replace('storage://', ''))?.bytes.length ?? 'gone') : 'n/a',
  };
  if (sc.filled) {
    // And after a reload (the poster as stored after the ⌘Z, drawn from storage).
    await s.page.waitForTimeout(1500);
    await s.page.reload();
    await s.page.waitForSelector(`#poster-canvas [data-block-id="${img.id}"]`, { timeout: 15000 });
    await s.page.waitForTimeout(2500);
    undoInfo.drawnAfterUndoAndReload = `A ${await share(IMAGES.A.rgb)} · B ${await share(IMAGES.B.rgb)}`;
    await s.page.waitForTimeout(1500);
    const reloaded = storedBlocks(s.state, s.id).find((b) => b.id === img.id);
    undoInfo.storedAfterReload = `h ${reloaded && round(reloaded.h)}`;
  }
  return {
    // U only when the drop changed the block (with nothing changed, ⌘Z would undo the user's last edit).
    claims: { [sc.claim]: p.length > 0, N: others.length > 0, U: sc.filled || !changed ? null : (!undone || stillDrawsNew) },
    numbers: {
      how: drop.how, dragoverCancelled: drop.overCancelled, stored: changed, held: String(held.imageSrc).replace(/^storage:\/\/[^/]+\/[^/]+\//, 'storage://…/'),
      paintBefore, imageSrc: String(blk?.imageSrc).replace(/^storage:\/\/[^/]+\/[^/]+\//, 'storage://…/'), w: blk && round(blk.w), h: blk && round(blk.h), uploads: ups.length, paint,
      othersChanged: others.join(',') || 'none', problems: p.join(' ; ') || 'none', ...undoInfo,
    },
    carried: k2,
  };
}

/**
 * Information: today's Replace (the handle row's button → the file chooser)
 * with a file of the same extension on a filled image block: what it
 * stores and draws, and how many ⌘Z it takes to get back (a sibling of the
 * drop on an image block; §3.3 D).
 */
async function runReplaceButton(h, s) {
  await storeFirst(s);
  const img = storedBlocks(s.state, s.id).find((b) => b.type === 'image');
  await fillViaChooser(s, img.id, fileOf(IMAGES.A));
  await waitPaint(s.page, img.id, IMAGES.A.rgb);
  const before = storedBlocks(s.state, s.id);
  await s.page.locator(`#poster-canvas [data-block-id="${img.id}"] img`).first().click();
  await s.page.waitForTimeout(300);
  const replace = s.page.getByRole('button', { name: /Replace/i }).first();
  const since = Date.now();
  const [chooser] = await Promise.all([s.page.waitForEvent('filechooser', { timeout: 8000 }), replace.click()]);
  const f = fileOf(IMAGES.B);
  handOver(s, [f]);
  await chooser.setFiles({ name: f.name, mimeType: f.type, buffer: f.bytes });
  await settledChange(s.state, s.id, before, { timeout: 14000 });
  await clickAway(s.page);
  const paint = `A ${await paintShare(s.page, img.id, IMAGES.A.rgb)} · B ${await paintShare(s.page, img.id, IMAGES.B.rgb)}`;
  let presses = 0;
  while (presses < 6 && !(await storedEquals(s.state, s.id, before, 1500))) {
    await s.page.keyboard.press(`${MOD}+z`);
    presses += 1;
  }
  const back = await storedEquals(s.state, s.id, before, 3000);
  await s.page.waitForTimeout(1000);
  return {
    claims: {},
    numbers: { uploads: uploadsOf(s.state, img.id, since).length, drawnAfterReplace: paint, undoPressesToBefore: back ? presses : `more than ${presses}`, drawnAfterUndo: `A ${await paintShare(s.page, img.id, IMAGES.A.rgb)} · B ${await paintShare(s.page, img.id, IMAGES.B.rgb)}` },
    carried: { ok: true, why: 'information' },
  };
}

/**
 * The image block's own "+ Upload figure" (the file chooser) on the
 * layout's empty image block: the path a paste into a selected empty image
 * block and a drop on an image block share (record section 6). UP: not one
 * upload keyed by it, its height not the image's shape, not drawn, or one
 * ⌘Z does not empty it again (the poster as stored before); UPB (with the
 * upload held by the fake storage): a `blob:` address stored in the poster
 * while the upload was out; UPX (a file over 10 MB): the message not shown,
 * or anything stored or uploaded.
 */
async function runOwnUpload(h, s, sc) {
  await storeFirst(s);
  const img = storedBlocks(s.state, s.id).find((b) => b.type === 'image' && !b.imageSrc);
  if (!img) throw new Error('precondition: no empty image block');
  const before = storedBlocks(s.state, s.id);
  if (sc.uploadDelayMs) s.state.faults.uploadDelayMs = sc.uploadDelayMs;
  // Every value of the block's imageSrc the backend stored, polled while the upload runs.
  const seenSrcs = new Set();
  let polling = true;
  const poll = (async () => {
    while (polling) {
      const b = storedBlocks(s.state, s.id).find((x) => x.id === img.id);
      seenSrcs.add(String(b?.imageSrc ?? null).replace(/^storage:\/\/[^/]+\/[^/]+\//, 'storage://…/').replace(/^(blob:|data:).*/, '$1…'));
      await new Promise((r) => setTimeout(r, 50));
    }
  })();
  const since = Date.now();
  const alertsFrom = s.alerts.length;
  const file = sc.big ? { name: 'zq-big.png', type: 'image/png', bytes: bigPng() } : fileOf(IMAGES.A);
  handOver(s, [file]);
  const btn = s.page.locator(`#poster-canvas [data-block-id="${img.id}"] button`, { hasText: '+ Upload figure' }).first();
  const [chooser] = await Promise.all([s.page.waitForEvent('filechooser', { timeout: 8000 }), btn.click()]);
  await chooser.setFiles({ name: file.name, mimeType: file.type, buffer: file.bytes });
  const alerts = () => s.alerts.slice(alertsFrom).map((a) => a.message);
  if (sc.big) {
    await s.page.waitForTimeout(3000);
    polling = false; await poll;
    const now = storedBlocks(s.state, s.id).find((b) => b.id === img.id);
    const ups = s.state.uploads.filter((u) => u.t >= since).length;
    return {
      claims: { UPX: !alerts().some((m) => MSG_BIG.test(m)) || ups > 0 || JSON.stringify(now) !== JSON.stringify(img) },
      numbers: { uploads: ups, imageSrcStored: [...seenSrcs].join(' → '), hAfter: now && round(now.h), hBefore: round(img.h), alerts: alerts().join(' | ').slice(0, 160) || 'none' },
      carried: { ok: true, why: 'the file chooser' },
    };
  }
  const ok = await until(() => (storedBlocks(s.state, s.id).find((b) => b.id === img.id)?.imageSrc ?? '').startsWith('storage://'), 15000);
  await settledChange(s.state, s.id, before, { timeout: 15000, quiet: 1500 });
  polling = false; await poll;
  const after = storedBlocks(s.state, s.id);
  const blk = after.find((b) => b.id === img.id);
  const p = [];
  if (!ok) p.push('no storage:// imageSrc stored');
  const ups = uploadsOf(s.state, img.id, since);
  if (ups.length !== 1) p.push(`${ups.length} uploads keyed by it`);
  const aspect = IMAGES.A.w / IMAGES.A.h;
  if (blk && Math.abs(blk.h - Math.round(blk.w / aspect)) > 2) p.push(`height ${blk.h}, want the image's shape ${Math.round(blk.w / aspect)}`);
  const paint = await waitPaint(s.page, img.id, IMAGES.A.rgb);
  if (paint === null || paint < 0.5) p.push(`its image covers ${paint} of its box`);
  const others = othersChanged(before, after, [img.id]);
  const blobStored = [...seenSrcs].some((v) => v.startsWith('blob:'));
  await clickAway(s.page);
  // One ⌘Z empties it again; then, information, the presses back to the poster before.
  await s.page.keyboard.press(`${MOD}+z`);
  const undone = await storedEquals(s.state, s.id, before, 4000);
  await s.page.waitForTimeout(1000);
  const afterOne = storedBlocks(s.state, s.id).find((b) => b.id === img.id);
  let presses = 1;
  while (presses < 6 && !(await storedEquals(s.state, s.id, before, 1500))) {
    await s.page.keyboard.press(`${MOD}+z`);
    presses += 1;
  }
  const back = await storedEquals(s.state, s.id, before, 2000);
  return {
    claims: { UP: p.length > 0 || !undone, ...(sc.uploadDelayMs ? { UPB: blobStored } : {}), N: others.length > 0 },
    numbers: {
      uploads: ups.length, h: blk && round(blk.h), paint, imageSrcStored: [...seenSrcs].join(' → '),
      afterOneUndo: `imageSrc ${String(afterOne?.imageSrc ?? null).replace(/^storage:\/\/[^/]+\/[^/]+\//, 'storage://…/').replace(/^(blob:|data:).*/, '$1…')} h ${afterOne && round(afterOne.h)}`,
      undoPressesToBefore: back ? presses : `more than ${presses}`, problems: p.join(' ; ') || 'none',
    },
    carried: { ok: true, why: 'the file chooser' },
  };
}

const A = () => [fileOf(IMAGES.A)];
const MSG_NOT_IMAGE = /doesn't look like an image/;
const MSG_BIG = /too large[\s\S]*10 MB/;

export const DROP_SCENARIOS = [
  {
    id: 'D-canvas', claim: 'DR', how: 'an image file (magenta, 160 × 100 px) dropped on an empty point of the sheet at FIT: one image block centred on the drop point (within 0.3 in, the ½ in grid\'s snap), the image\'s shape in Insert › Image\'s box, uploaded once keyed by its id, drawn, on the sheet; one ⌘Z removes it',
    files: A, want: [IMAGES.A], at: [0.17, 0.75],
  },
  {
    id: 'D-edge', claim: 'DR', how: 'the same dropped near the sheet\'s bottom edge: the block as near the drop point as the sheet lets it be, wholly on the sheet',
    files: A, want: [IMAGES.A], at: [0.5, 0.97],
  },
  {
    id: 'D-zoomed', claim: 'DR', how: 'the same with the zoom pinched to 250 %: the drop point read through the zoom',
    files: A, want: [IMAGES.A], at: [0.45, 0.6], zoom: async (s) => { await pinchTo(s.page, 2.5); },
  },
  {
    id: 'D-several', claim: 'DM', how: 'three images (wide, tall, square) dropped at once: one block each, the first at the drop point, each next one 1 in down and right of the last; three uploads; one ⌘Z removes all three',
    files: () => [fileOf(IMAGES.A), fileOf(IMAGES.B), fileOf(IMAGES.C)], want: [IMAGES.A, IMAGES.B, IMAGES.C], at: [0.35, 0.55],
  },
  {
    id: 'D-not-image', claim: 'DX', how: 'a PDF dropped on the sheet: skipped with today\'s message ("…doesn\'t look like an image…"), no block, no upload',
    files: () => [PDF_FILE], want: [], message: MSG_NOT_IMAGE,
  },
  {
    id: 'D-mixed', claim: 'DX', how: 'an image and a PDF dropped together: one image block (the image), the PDF skipped with today\'s message',
    files: () => [fileOf(IMAGES.A), PDF_FILE], want: [IMAGES.A], message: MSG_NOT_IMAGE, at: [0.5, 0.93],
  },
  {
    id: 'D-big', claim: 'TEN', how: 'a real PNG over 10 MB dropped: today\'s message ("…too large… under 10 MB"), no block, no upload',
    files: () => [{ name: 'zq-big.png', type: 'image/png', bytes: bigPng() }], want: [], message: MSG_BIG,
  },
  {
    id: 'D-on-image', claim: 'DI', onImage: true, filled: true, file: fileOf(IMAGES.B), how: 'a tall image (teal) dropped on the layout\'s image block holding a wide one (magenta, put there by its own "+ Upload figure"): its image replaced (no new block), uploaded once to its own path, its width kept and its height the new shape, drawn teal; then, information (§3.3 D): what one ⌘Z stores and draws',
  },
  {
    id: 'D-on-image-jpg', claim: 'DI', onImage: true, filled: true, file: renamed(fileOf(IMAGES.B), 'zq-figure-b.jpg', 'image/jpeg'), how: 'the same with the new file named .jpg (another extension, so another storage path): replaced; information: what one ⌘Z stores and draws',
  },
  {
    id: 'D-on-empty-image', claim: 'DI', onImage: true, filled: false, file: fileOf(IMAGES.B), how: 'a tall image dropped on the layout\'s EMPTY image block: that block filled (no new block), uploaded once keyed by its id, drawn',
  },
  {
    id: 'G-drop', claim: 'G', guest: true, how: 'a guest (anonymous session) drops an image on the sheet: one image block, uploaded under the guest\'s own folder, drawn; one ⌘Z removes it',
    files: A, want: [IMAGES.A], at: [0.5, 0.93],
  },
  { id: 'UP-own', ownUpload: true, how: 'the image block\'s own "+ Upload figure" (the file chooser) on the layout\'s empty image block, a wide image: uploaded once keyed by its id, its height the image\'s shape, drawn; one ⌘Z empties it again (the path a paste into a selected empty image block and a drop on an image block share)' },
  { id: 'UP-own-slow', ownUpload: true, uploadDelayMs: 2500, how: 'the same with the upload held 2.5 s by the fake storage: no blob: address stored in the poster while it is out (UPB)' },
  { id: 'UP-own-big', ownUpload: true, big: true, how: 'the same with a real PNG over 10 MB: today\'s message ("…too large… under 10 MB"), nothing stored in the block, no upload (UPX)' },
  { id: 'I-replace-button', info: true, how: 'information (§3.3 D): today\'s Replace button with a file of the same extension on a filled image block: what is drawn after, and the ⌘Z presses back to the poster before' },
];

export async function runDropScenario(h, openSignedIn, sc) {
  const s = await openSession(h, openSignedIn, { guest: !!sc.guest });
  try {
    const r = sc.info ? await runReplaceButton(h, s) : sc.ownUpload ? await runOwnUpload(h, s, sc) : sc.onImage ? await runDropOnImage(h, s, sc) : await runDropNew(h, s, sc);
    return { ...r, pageErrors: s.state.errors };
  } finally {
    await s.context.close().catch(() => {});
  }
}

