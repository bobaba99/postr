/**
 * Helpers for the block copy, cut and paste scenarios of
 * scripts/canvas-paste-check.mjs (record docs/fixes/35-block-copy.md;
 * bounded-designs §3.3 tables B order 1, C and D): reading the system
 * clipboard after a real ⌘C or ⌘X, selecting blocks as a user does (a
 * rubber band, never a click that enters a text), the image block's Replace,
 * a poster seeded into the fake backend, the toasts the editor shows, and a
 * marked payload written by hand (the format of record 35's rule table C1,
 * for the untrusted payloads of C6). Nothing here calls the app's store or
 * its modules.
 *
 * The clipboard is read the way another application would read it: a
 * real ⌘V into a field the harness adds outside the editor (`#zq-clip-probe`,
 * contenteditable), whose own capture listener keeps what the engine's
 * trusted paste carried (text/html, text/plain) and cancels it. The editor
 * leaves a paste into a field to the field (record 34's rule).
 */
import { MOD, clickAway, focusBlockEnd } from './undoKit.mjs';
import { sleep } from './editorHarness.mjs';
import { DEFAULT_DATA, makeRow } from './guestBackend.mjs';
import { IMAGES, drawnBlock, eventsSince, fileOf, handOver, storedBlocks, until, watchEvents } from './canvasPasteKit.mjs';
import { copyToClipboard } from './tablePasteScenarios.mjs';
import { fillViaChooser, openSession, storeFirst } from './canvasPasteScenarios.mjs';

/** The attribute that marks Postr's own copied blocks in the clipboard's HTML (record 35, C1). */
export const CLIP_ATTR = 'data-postr-blocks';

/** Escape text for an HTML attribute value in double quotes. */
export const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * A marked payload as record 35's rule table C1 defines it, written by hand
 * (another page could put such HTML on the clipboard): the JSON in the
 * attribute, the words in a paragraph after. `json` is put in as given when
 * it is a string (malformed JSON), else stringified.
 */
export function payloadHtml(json, words = 'ZQ crafted words') {
  const raw = typeof json === 'string' ? json : JSON.stringify(json);
  return `<div ${CLIP_ATTR}="${escapeAttr(raw)}"><p>${escapeAttr(words)}</p></div>`;
}

/** Record every toast-like text the editor adds (copy, paste, credit and image messages), with its time. Idempotent per document. */
export async function watchToasts(page) {
  await page.evaluate(() => {
    if (window.__zqToastObs) return;
    window.__zqToastTexts = [];
    window.__zqToastObs = new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          const t = (n.textContent ?? '').trim();
          if (t && t.length < 240 && /pasted|copied|too large to copy|stays on the canvas|credit stays|can.t be|Charts/i.test(t)) window.__zqToastTexts.push({ t: Date.now(), text: t });
        }
        if (r.type === 'characterData') {
          const t = (r.target.textContent ?? '').trim();
          if (t && t.length < 240 && /pasted|copied|too large to copy|stays on the canvas|credit stays|can.t be|Charts/i.test(t)) window.__zqToastTexts.push({ t: Date.now(), text: t });
        }
      }
    });
    window.__zqToastObs.observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}

/** The toast texts seen since `since` (page clock), each once. */
export const toastsSince = (page, since = 0) => page.evaluate((s) => [...new Set((window.__zqToastTexts ?? []).filter((x) => x.t >= s).map((x) => x.text))], since);
export const pageNow = (page) => page.evaluate(() => Date.now());

/**
 * What the system clipboard holds, read by a real ⌘V into a field the
 * harness adds (as another application would read it): the paste's
 * text/html and text/plain, whether it was the engine's own (trusted).
 * The field is removed after; the blocks' selection is left as the click
 * leaves it.
 */
export async function readClipboard(page) {
  await page.evaluate(() => {
    let probe = document.getElementById('zq-clip-probe');
    if (!probe) {
      probe = document.createElement('div');
      probe.id = 'zq-clip-probe';
      probe.contentEditable = 'true';
      probe.textContent = 'ZQ probe';
      Object.assign(probe.style, { position: 'fixed', right: '4px', bottom: '4px', width: '160px', height: '28px', zIndex: '2147483647', background: '#fff', color: '#000', font: '12px sans-serif', overflow: 'hidden' });
      document.body.appendChild(probe);
      probe.addEventListener('paste', (e) => {
        window.__zqClipRead = {
          trusted: e.isTrusted,
          types: [...(e.clipboardData?.types ?? [])],
          html: e.clipboardData?.getData('text/html') ?? '',
          text: e.clipboardData?.getData('text/plain') ?? '',
        };
        e.preventDefault();
      }, true);
    }
    window.__zqClipRead = null;
  });
  const b = await page.locator('#zq-clip-probe').boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(120);
  await page.keyboard.press(`${MOD}+v`);
  for (let i = 0; i < 30; i += 1) {
    const r = await page.evaluate(() => window.__zqClipRead);
    if (r) {
      await page.evaluate(() => { document.getElementById('zq-clip-probe')?.remove(); });
      return r;
    }
    await sleep(100);
  }
  await page.evaluate(() => { document.getElementById('zq-clip-probe')?.remove(); });
  return null;
}

/**
 * The marked payload in clipboard HTML, parsed in an inert document
 * (DOMParser: no script runs, nothing loads): `{ found, json, error }`.
 */
export const payloadIn = (page, html) => page.evaluate(([h, attr]) => {
  const el = new DOMParser().parseFromString(h ?? '', 'text/html').querySelector(`[${attr}]`);
  if (!el) return { found: false };
  try { return { found: true, json: JSON.parse(el.getAttribute(attr)) }; } catch (e) { return { found: true, error: String(e).slice(0, 120) }; }
}, [html, CLIP_ATTR]);

/**
 * Select exactly `ids` with a rubber band, as a user selects blocks without
 * entering their text: from an empty point just left of and above-inside
 * the first block (a margin or a column gutter) to a point inside the last
 * block's left part. Throws when the band selected anything else, or left a
 * field in edit mode.
 */
export async function bandSelect(page, ids) {
  const pts = await page.evaluate((list) => {
    const boxes = list.map((id) => document.querySelector(`#poster-canvas [data-block-id="${id}"]`)?.getBoundingClientRect());
    if (boxes.some((b) => !b)) return { err: 'a block is not drawn' };
    const first = boxes[0];
    const last = boxes[boxes.length - 1];
    for (const dx of [5, 3, 7, 2]) {
      for (const fy of [0.3, 0.15, 0.5]) {
        const start = { x: first.left - dx, y: first.top + Math.min(first.height * fy, 14) };
        const hit = document.elementFromPoint(start.x, start.y);
        if (hit && hit.closest('[data-postr-canvas-outer]') && !hit.closest('[data-block-id]') && !hit.closest('button')) {
          const end = { x: Math.max(...boxes.map((b) => b.left)) + 12, y: last.top + Math.min(last.height / 2, 18) };
          return { start, end };
        }
      }
    }
    return { err: 'no empty point beside the first block' };
  }, ids);
  if (pts.err) throw new Error(`bandSelect: ${pts.err}`);
  await page.mouse.move(pts.start.x, pts.start.y);
  await page.mouse.down();
  await page.mouse.move(pts.end.x, pts.end.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const sel = await page.evaluate(() => [...new Set([...document.querySelectorAll('#poster-canvas [data-postr-selected="true"]')].map((e) => e.getAttribute('data-block-id')))]);
  const want = [...ids].sort();
  if (JSON.stringify([...sel].sort()) !== JSON.stringify(want)) throw new Error(`the rubber band selected ${JSON.stringify(sel)}, not ${JSON.stringify(want)}`);
  const editing = await page.evaluate(() => document.activeElement?.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? ''));
  if (editing) throw new Error('the rubber band left a field in edit mode');
}

/**
 * Where the page's text selection starts and ends (record 35 §9): its text,
 * and whether its anchor and focus lie in the canvas
 * (`[data-postr-canvas-outer]`) or outside it. Information: a rubber band
 * leaves one in WebKit, and a triple-click in the sidebar ends its range in
 * the canvas in Chromium.
 */
export const selectionEnds = (page) => page.evaluate(() => {
  const sel = getSelection();
  const canvas = document.querySelector('[data-postr-canvas-outer]');
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return 'none';
  const at = (n) => (canvas && canvas.contains(n) ? 'canvas' : 'outside');
  return `"${String(sel).slice(0, 24).replace(/\n/g, ' ')}" anchor ${at(sel.anchorNode)}, focus ${at(sel.focusNode)}`;
});

/** The ids of the blocks drawn selected on the canvas. */
export const selectedIds = (page) => page.evaluate(() => [...new Set([...document.querySelectorAll('#poster-canvas [data-postr-selected="true"]')].map((e) => e.getAttribute('data-block-id')))]);

/**
 * Replace a filled image block's picture with today's Replace (the handle
 * row's button opens the file chooser): the block selected with a rubber
 * band, then the button. Waits until the stored imageSrc or the
 * upload log moved.
 */
export async function replaceImage(s, blockId, file, readStored) {
  const before = readStored();
  // Selected with a band: a clone 1 in down and right may cover most of the picture.
  await bandSelect(s.page, [blockId]);
  const replace = s.page.getByRole('button', { name: /Replace/i }).first();
  handOver(s, [file]);
  const [chooser] = await Promise.all([s.page.waitForEvent('filechooser', { timeout: 8000 }), replace.click()]);
  await chooser.setFiles({ name: file.name, mimeType: file.type, buffer: file.bytes });
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    if (JSON.stringify(readStored()) !== JSON.stringify(before)) break;
    await sleep(100);
  }
  await sleep(1500);
}

/**
 * Seed a poster of the signed-in user into the fake backend (its row in
 * `state.rows`) and open it at /p/<id>, as a user opens one from the
 * dashboard. `blocks` are the poster's blocks.
 */
export async function openSeededPoster(h, s, blocks, { widthIn = 48, heightIn = 36 } = {}) {
  const data = JSON.parse(JSON.stringify({ ...DEFAULT_DATA, widthIn, heightIn, blocks }));
  const row = makeRow(s.uid, data, { title: 'ZQ seeded poster' });
  s.state.rows.push(row);
  await s.page.goto(`${h.base}/p/${row.id}`);
  await s.page.waitForSelector('#poster-canvas [data-block-id]', { timeout: 60000 });
  await s.page.evaluate(() => document.fonts.ready);
  await s.page.waitForTimeout(900);
  return row.id;
}

/** The credit mark as the editor makes it (export/ackBlock.ts: a locked logo block with a fixed id), with a tiny picture. */
export const CREDIT_MARK = (x, y) => ({
  id: '__postr_ack_mark__', type: 'logo', x, y, w: 30, h: 12, content: '',
  imageSrc: 'data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2230%22 height=%2212%22%3E%3Crect width=%2230%22 height=%2212%22 fill=%22%23999%22/%3E%3C/svg%3E',
  imageFit: 'contain', tableData: null, locked: true,
});

/** A plain block for a seeded poster. */
export const plainBlock = (id, type, x, y, w, h, fields = {}) => ({ id, type, x, y, w, h, content: '', imageSrc: null, imageFit: 'contain', tableData: null, ...fields });

/** The bytes the fake storage holds at a `storage://` src (null when none). */
export const bytesAt = (state, src) => {
  if (!src || !String(src).startsWith('storage://')) return null;
  return state.objects.get(String(src).slice('storage://'.length))?.bytes ?? null;
};

/** Whether two byte buffers are the same file. */
export const sameBytes = (a, b) => !!a && !!b && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

/** A number to 2 decimals, for printing. */
export const round = (v) => Math.round(v * 100) / 100;
/** A source shortened for printing (the user's and poster's folders left out). */
export const short = (src) => String(src ?? null).replace(/^storage:\/\/[^/]+\/[^/]+\//, 'storage://…/').replace(/^(data:|blob:).*/, '$1…');
export const SENTINEL = 'ZQ-SENTINEL before the copy';

/**
 * Put a sentinel on the system clipboard (record 32's copy source, a real
 * ⌘C). The clipboard outlives a browser context (Chromium shares it across
 * contexts): without it, something an earlier scenario copied would be read
 * as this one's.
 */
export async function sentinel(s) {
  if (!(await copyToClipboard(s.page, { 'text/plain': SENTINEL }))) throw new Error('precondition: the sentinel copy did not run');
  await clickAway(s.page);
}

/** The session (a signed-in term holder, or a guest with `sc.guest`), with the toasts watched. */
export async function session(h, openSignedIn, sc) {
  const s = await openSession(h, openSignedIn, { guest: !!sc.guest });
  await watchToasts(s.page);
  return s;
}

/**
 * Did the ⌘V reach the page as the engine's own trusted paste (the
 * control)? With `html`, carrying text/html too (a payload the copy
 * source wrote). After a real ⌘C the types are information: before the
 * change ⌘C left the clipboard as it was (text only).
 */
export async function pasteCarried(s, from, { html = false } = {}) {
  const ev = (await eventsSince(s.page, 'paste', from)).at(-1);
  if (!ev) return { ok: false, why: 'no paste event reached the page' };
  return { ok: ev.trusted && (!html || ev.types.includes('text/html')), why: `trusted=${ev.trusted} types=${ev.types.join(',')} text=${JSON.stringify(ev.text.slice(0, 24))}` };
}

/** Which test image a block draws, by its picture's natural size (A 160×100, B 90×150, C 120×120); null when none is loaded. */
export async function drawnImage(page, blockId) {
  const im = (await drawnBlock(page, blockId))?.img;
  if (!im?.loaded) return null;
  for (const [k, v] of Object.entries(IMAGES)) if (im.nw === v.w && im.nh === v.h) return k;
  return `${im.nw}x${im.nh}`;
}

/** The originals' file bytes, by id (images). */
export const bytesOf = (s, blocks) => Object.fromEntries(blocks.filter((b) => b.imageSrc).map((b) => [b.id, bytesAt(s.state, b.imageSrc)]));

/**
 * Seed a poster whose blocks and files name its own id (a stored image's
 * path holds the poster's folder): `build(uid, posterId)` returns
 * `{ blocks, files: [[path, bytes]], data }` (`data`: other fields of the
 * poster, as its authors and references). The row and the files go into the
 * fake backend, then the poster opens at /p/<id> as from the dashboard; the
 * events and toasts are watched. Returns the poster's id (also set on `s`).
 */
export async function openPosterWith(h, s, build, { waitFor = '#poster-canvas [data-block-id]' } = {}) {
  const row = makeRow(s.uid, JSON.parse(JSON.stringify({ ...DEFAULT_DATA, blocks: [] })), { title: 'ZQ seeded poster' });
  const { blocks, files = [], data = {} } = build(s.uid, row.id);
  row.data = { ...row.data, ...JSON.parse(JSON.stringify(data)), blocks: JSON.parse(JSON.stringify(blocks)) };
  for (const [path, bytes] of files) s.state.objects.set(path, { bytes, type: 'image/png', t: Date.now() });
  s.state.rows.push(row);
  await s.page.goto(`${h.base}/p/${row.id}`);
  await s.page.waitForSelector(waitFor, { timeout: 60000 });
  await s.page.evaluate(() => document.fonts.ready);
  await s.page.waitForTimeout(900);
  s.id = row.id;
  await watchEvents(s.page);
  await watchToasts(s.page);
  return row.id;
}

/** The starting layout's blocks of column `i` (0, 1, 2), top to bottom. */
export const column = (blocks, i) => {
  const body = blocks.filter((b) => b.type !== 'title' && b.type !== 'authors' && !b.locked);
  const xs = [...new Set(body.map((b) => Math.round(b.x)))].sort((a, b) => a - b);
  return body.filter((b) => Math.round(b.x) === xs[i]).sort((a, b) => a.y - b.y);
};

/** Type `text` at the end of block `id`'s text and wait until it is stored. */
export async function typeInto(s, id, text) {
  await focusBlockEnd(s.page, id);
  await s.page.keyboard.type(text, { delay: 10 });
  const ok = await until(() => (storedBlocks(s.state, s.id).find((b) => b.id === id)?.content ?? '').includes(text), 10000);
  if (!ok) throw new Error(`precondition: "${text}" was not stored`);
  await s.page.waitForTimeout(500);
}

/**
 * The second column of the starting layout made the user's: a word in its
 * heading and its text, its image filled with image A through "+ Upload
 * figure". Returns the three blocks as stored.
 */
export async function userColumn(s, { image = true } = {}) {
  await storeFirst(s);
  await sentinel(s);
  const [head, text, img] = column(storedBlocks(s.state, s.id), 1);
  if (head?.type !== 'heading' || text?.type !== 'text' || img?.type !== 'image') throw new Error('precondition: column 2 is not heading, text, image');
  await typeInto(s, head.id, 'ZQHEAD');
  await typeInto(s, text.id, 'ZQALPHA words');
  await clickAway(s.page);
  if (image) await fillViaChooser(s, img.id, fileOf(IMAGES.A));
  const now = storedBlocks(s.state, s.id);
  return ['head', 'text', 'img'].reduce((o, k, i) => ({ ...o, [k]: now.find((b) => b.id === [head, text, img][i].id) }), {});
}
