/**
 * Helpers for scripts/canvas-paste-check.mjs (record
 * docs/fixes/34-paste-drop.md): image files made in Node, put on the
 * engine's clipboard or dropped on the page as a user would, and passive
 * reads of what the fake backend stored (lib/guestBackend.mjs: the poster
 * row and the poster-assets uploads) and what the canvas draws. Nothing here
 * calls the app's store or its modules.
 *
 * How a file reaches the page, per engine (record section 3):
 *   - paste: an image is written to the engine's clipboard with
 *     navigator.clipboard.write inside a real click on a button the harness
 *     adds, then a real ⌘V delivers the engine's own trusted paste carrying
 *     the file (Chromium, WebKit). Playwright's Firefox delivers a trusted
 *     paste whose file item has no file (getAsFile() is null; MEASURED by a
 *     probe, record section 3), so there the paste is a page-made paste event
 *     carrying a real File (`imageMode` 'event'), as is any shape whose
 *     bytes an engine's clipboard would not keep (a file that is not an
 *     image, an image over 10 MB).
 *   - drop: Chromium drops real files from disk through the DevTools
 *     protocol (Input.dispatchDragEvent: trusted dragenter, dragover, drop;
 *     the drop fires only if the page cancelled dragover, as a user's drop
 *     does). Firefox and WebKit get page-made drag events carrying a
 *     DataTransfer of real Files; their default actions (opening the file in
 *     the tab) are not exercised, so there the instrument reads whether the
 *     page cancelled dragover, which a real drop needs.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { sleep } from './editorHarness.mjs';
import { rowOf } from './keepWorkKit.mjs';
import { decodePNG } from './png.mjs';

// ------------------------------------------------------------- image files

/** A PNG chunk: length, type, data, CRC over type and data. */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

/** An 8-bit RGB PNG of `w` × `h`; `pixel(x, y)` gives [r, g, b]. `level` is zlib's (0 stores, for a file that keeps its size). */
export function pngOf(w, h, pixel, level = 9) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  let p = 0;
  for (let y = 0; y < h; y += 1) {
    raw[p++] = 0;
    for (let x = 0; x < w; x += 1) {
      const [r, g, b] = pixel(x, y);
      raw[p++] = r; raw[p++] = g; raw[p++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The test images, each one solid colour so the drawing can be told apart
 * (`rgb`). A is wide (1.6), B tall (0.6), C square; BIG is noise stored
 * uncompressed, a real PNG over 10 MB (2200 × 1700 × 3 bytes).
 */
export const IMAGES = {
  A: { name: 'zq-figure-a.png', type: 'image/png', w: 160, h: 100, rgb: [220, 40, 170] },
  B: { name: 'zq-figure-b.png', type: 'image/png', w: 90, h: 150, rgb: [20, 160, 150] },
  C: { name: 'zq-figure-c.png', type: 'image/png', w: 120, h: 120, rgb: [240, 140, 20] },
};
const cache = new Map();
/** The bytes of a test image (cached). */
export function imageBytes(img) {
  if (!cache.has(img.name)) cache.set(img.name, pngOf(img.w, img.h, () => img.rgb));
  return cache.get(img.name);
}
/** A real PNG over 10 MB (noise, stored): what the 10 MB rule refuses. */
export function bigPng() {
  if (!cache.has('big')) {
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed & 255; };
    cache.set('big', pngOf(2200, 1700, () => [rnd(), rnd(), rnd()], 0));
  }
  return cache.get('big');
}
/** A file as the page receives it: name, type, bytes. */
export const fileOf = (img) => ({ name: img.name, type: img.type, bytes: imageBytes(img) });
/** The same image under another name and type (B written as a JPEG name: a different extension in storage). */
export const renamed = (file, name, type) => ({ ...file, name, type });
/** Not an image: a small PDF-shaped file. */
export const PDF_FILE = { name: 'zq-notes.pdf', type: 'application/pdf', bytes: Buffer.from('%PDF-1.4\n% ZQ not an image\n%%EOF\n') };

// ------------------------------------------------------------- the page

/**
 * Give the fake backend a copy of the files handed to the page: an upload
 * whose body the browser's DevTools leaves out (Chromium: a file dropped
 * from disk; WebKit: every multipart upload) is kept as this copy
 * (lib/guestBackend.mjs handedFiles, logged `fromHarness`).
 */
export function handOver(s, files) {
  for (const f of files) {
    s.state.handedFiles.set(f.name, f.bytes);
    s.state.handedLast = f.bytes;
  }
}

/** Grant the async clipboard to the page's origin where the engine has the permission (Chromium). */
export async function allowClipboard(h, context) {
  if (h.engine === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: h.base });
}

/** How an image reaches a paste in this engine: the real clipboard, or a page-made event (Firefox; IMG_PASTE=event). */
export const imageMode = (h) => (process.env.IMG_PASTE === 'event' || h.engine === 'firefox' ? 'event' : 'clipboard');

/**
 * Record every paste and drag event that reaches the page (capture, before
 * the app): trusted or not, its types, its files, where it landed, and
 * whether the app cancelled it (read after the event, in a microtask), and
 * every alert the page shows. Idempotent.
 */
export async function watchEvents(page) {
  await page.evaluate(() => {
    if (window.__zqEv) return;
    window.__zqEv = [];
    window.__zqAlerts = [];
    const files = (dt) => {
      const out = [];
      for (const it of dt?.items ?? []) {
        if (it.kind !== 'file') continue;
        const f = it.getAsFile();
        out.push(f ? `${f.type}:${f.size}` : `${it.type}:no file`);
      }
      return out;
    };
    for (const type of ['paste', 'dragenter', 'dragover', 'drop']) {
      document.addEventListener(type, (e) => {
        const dt = e.clipboardData ?? e.dataTransfer;
        const rec = {
          type, trusted: e.isTrusted, types: [...(dt?.types ?? [])], files: files(dt),
          text: dt?.getData?.('text/plain')?.slice(0, 60) ?? '',
          target: e.target?.closest?.('[data-block-id]')?.getAttribute('data-block-type') ?? e.target?.tagName ?? '',
          active: document.activeElement?.tagName ?? '',
        };
        window.__zqEv.push(rec);
        // Read once the event has gone through every listener (the app's run after this capture one).
        setTimeout(() => { rec.cancelled = e.defaultPrevented; }, 0);
      }, true);
    }
  });
}

/** The page's alerts are answered (accepted) and their text kept in `s.alerts`. */
export function catchAlerts(s) {
  s.alerts = [];
  s.page.on('dialog', async (d) => {
    s.alerts.push({ type: d.type(), message: d.message().slice(0, 200) });
    await d.accept().catch(() => {});
  });
}

/** The events of `type` recorded since index `from`. */
export const eventsSince = (page, type, from = 0) => page.evaluate(([t, f]) => (window.__zqEv ?? []).slice(f).filter((e) => e.type === t), [type, from]);
export const eventCount = (page) => page.evaluate(() => (window.__zqEv ?? []).length);

/**
 * Write `file` (an image) to the engine's clipboard: navigator.clipboard.write
 * inside a real click on a button the harness adds (the async clipboard
 * needs the user's gesture). Returns 'ok' or the error. The button is left
 * focused: the caller puts the focus where its scenario wants it after.
 */
export async function writeImageToClipboard(page, file) {
  return writeClipboardItem(page, { [file.type]: file.bytes });
}

/**
 * Write ONE clipboard item holding several types (`items`: type → a Buffer
 * or a string; for example an image with an `<img>` fragment and its
 * address, as a browser's "Copy image" does) to the engine's clipboard, the
 * way writeImageToClipboard does (a real click). Since record 34's review
 * round (R34-2, the reviewer's probe folded in).
 */
export async function writeClipboardItem(page, items) {
  const entries = Object.entries(items).map(([type, v]) => [type, Buffer.isBuffer(v) ? { b64: v.toString('base64') } : { s: v }]);
  await page.evaluate((entries) => {
    let btn = document.getElementById('zq-image-source');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'zq-image-source';
      btn.textContent = 'ZQ image source';
      Object.assign(btn.style, { position: 'fixed', left: '0', top: '0', zIndex: '2147483647', font: '12px sans-serif' });
      document.body.appendChild(btn);
    }
    window.__zqClip = 'pending';
    btn.onclick = async () => {
      try {
        const rec = {};
        for (const [type, v] of entries) {
          const body = v.b64 ? Uint8Array.from(atob(v.b64), (c) => c.charCodeAt(0)) : v.s;
          rec[type] = new Blob([body], { type });
        }
        await navigator.clipboard.write([new ClipboardItem(rec)]);
        window.__zqClip = 'ok';
      } catch (e) { window.__zqClip = `fail ${String(e).slice(0, 120)}`; }
    };
  }, entries);
  const b = await page.locator('#zq-image-source').boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  for (let i = 0; i < 30; i += 1) {
    const r = await page.evaluate(() => window.__zqClip);
    if (r !== 'pending') return r;
    await sleep(100);
  }
  return 'timeout';
}

/** A page-made paste event at the focused element carrying `files` and `strings` (the event mode). */
export async function dispatchPaste(page, { files = [], strings = {} } = {}) {
  await page.evaluate(({ files, strings }) => {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name, { type: f.type }));
    for (const [k, v] of Object.entries(strings)) dt.setData(k, v);
    const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    // Firefox gives a page-made paste event's init clipboard nothing (keep-work-check H5).
    Object.defineProperty(ev, 'clipboardData', { value: dt });
    (document.activeElement ?? document.body).dispatchEvent(ev);
  }, { files: files.map((f) => ({ name: f.name, type: f.type, b64: f.bytes.toString('base64') })), strings });
}

/**
 * Drop `files` at the viewport point (x, y): Chromium through the DevTools
 * protocol (real files written to `dir`, trusted events), the others with
 * page-made drag events. `s` is the session: its page, and its fake
 * backend's state, which is handed a copy of every file (`handOver`).
 * Returns { how, overCancelled } where overCancelled
 * says whether the app cancelled the dragover (a real drop needs it).
 */
export async function dropFiles(h, s, files, { x, y }, dir) {
  const { page } = s;
  if (h.engine === 'chromium' && process.env.DROP_MODE !== 'event') {
    const paths = files.map((f, i) => {
      const p = path.join(dir, `drop-${Date.now()}-${i}-${f.name}`);
      fs.writeFileSync(p, f.bytes);
      // The fake storage's copy, by the name the page sees (lib/guestBackend.mjs handedFiles).
      s.state.handedFiles.set(path.basename(p), f.bytes);
      s.state.handedLast = f.bytes;
      return p;
    });
    const from = await eventCount(page);
    const cdp = await page.context().newCDPSession(page);
    const data = { items: [], files: paths, dragOperationsMask: 1 };
    for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, x, y, data });
    await cdp.detach().catch(() => {});
    await sleep(200);
    const overs = await eventsSince(page, 'dragover', from);
    return { how: 'cdp (trusted)', overCancelled: overs.length > 0 && overs.every((e) => e.cancelled) };
  }
  handOver(s, files);
  const overCancelled = await page.evaluate(({ files, x, y }) => {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name, { type: f.type }));
    const target = document.elementFromPoint(x, y) ?? document.body;
    const fire = (type) => target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, dataTransfer: dt }));
    fire('dragenter');
    const notCancelled = fire('dragover');
    fire('drop');
    return !notCancelled;
  }, { files: files.map((f) => ({ name: f.name, type: f.type, b64: f.bytes.toString('base64') })), x, y });
  return { how: 'page-made events', overCancelled };
}

// ------------------------------------------------------------- readings

/** The stored blocks of poster `id` (a copy). */
export const storedBlocks = (state, id) => JSON.parse(JSON.stringify(rowOf(state, id)?.data?.blocks ?? []));
/** The stored sheet size in units (1/10 in). */
export const sheetUnits = (state, id) => {
  const d = rowOf(state, id)?.data;
  return { w: (d?.widthIn ?? 48) * 10, h: (d?.heightIn ?? 36) * 10 };
};
/** Blocks in `after` that `before` does not have. */
export const addedBlocks = (before, after) => after.filter((b) => !before.some((o) => o.id === b.id));
/** Blocks of `before` (other than `except`) changed or gone in `after`. */
export const othersChanged = (before, after, except = []) => before
  .filter((b) => !except.includes(b.id))
  .filter((b) => JSON.stringify(after.find((a) => a.id === b.id) ?? null) !== JSON.stringify(b))
  .map((b) => b.id);
/** Whether a block lies wholly on the sheet. */
export const onSheet = (b, sheet) => b.x >= 0 && b.y >= 0 && b.x + b.w <= sheet.w + 1e-6 && b.y + b.h <= sheet.h + 1e-6;

/**
 * The name of block `blockId`'s file, as a pattern: {blockId}.{ext} (record
 * 34's uploads) or, since record 35's new name per upload,
 * {blockId}-{random}.{ext}. Record 34's claims are about the keying; record
 * 35's own scenarios require the new name.
 */
export const keyedName = (blockId, ext = '[a-z0-9]+') => `${blockId}(?:-[A-Za-z0-9_-]+)?\\.${ext}`;

/** Uploads of poster-assets since `since` whose file is block `blockId`'s (path …/{blockId}[-{random}].{ext}). */
export const uploadsOf = (state, blockId, since = 0) => state.uploads.filter((u) => u.t >= since && u.status === 200 && new RegExp(`/${keyedName(blockId)}$`).test(u.path));

/** Wait until `read()` is truthy; its value, or null. */
export async function until(read, timeout = 10000, every = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = read();
    if (v) return v;
    await sleep(every);
  }
  return null;
}

/** Wait until the stored blocks differ from `before` and stay unchanged for `quiet` ms (an upload and its save landed). */
export async function settledChange(state, id, before, { timeout = 12000, quiet = 1500 } = {}) {
  const t0 = Date.now();
  let last = JSON.stringify(before);
  let lastAt = Date.now();
  let changed = false;
  while (Date.now() - t0 < timeout) {
    const now = JSON.stringify(storedBlocks(state, id));
    if (now !== last) { last = now; lastAt = Date.now(); changed = changed || now !== JSON.stringify(before); }
    if (changed && Date.now() - lastAt >= quiet) return true;
    await sleep(100);
  }
  return changed;
}

/** Wait until the stored blocks equal `want`. */
export async function storedEquals(state, id, want, timeout = 10000) {
  return !!(await until(() => JSON.stringify(storedBlocks(state, id)) === JSON.stringify(want), timeout));
}

/**
 * Where block `blockId` is drawn: its box in the viewport, the canvas's
 * visible box (the scroll container's client area), the sheet's box and the
 * zoom read from the sheet (its width on screen over its width in units),
 * and the block's image (loaded, natural size, the kind of its current
 * source).
 */
export const drawnBlock = (page, blockId) => page.evaluate((bid) => {
  const el = document.querySelector(`#poster-canvas [data-block-id="${bid}"]`);
  const outer = document.querySelector('[data-postr-canvas-outer]');
  const sheet = document.getElementById('poster-canvas');
  if (!el || !outer || !sheet) return null;
  const r = el.getBoundingClientRect();
  const o = outer.getBoundingClientRect();
  const s = sheet.getBoundingClientRect();
  const img = el.querySelector('img');
  const src = img?.currentSrc || img?.src || '';
  return {
    box: { x: r.left, y: r.top, w: r.width, h: r.height },
    view: { x: o.left + outer.clientLeft, y: o.top + outer.clientTop, w: outer.clientWidth, h: outer.clientHeight },
    sheet: { x: s.left, y: s.top, w: s.width, h: s.height },
    zoom: s.width / sheet.offsetWidth,
    img: img ? { loaded: img.complete && img.naturalWidth > 8, nw: img.naturalWidth, nh: img.naturalHeight, src: src.startsWith('blob:') ? 'blob' : src.startsWith('data:') ? 'data' : /\/object\/sign\//.test(src) ? 'signed' : src ? 'other' : 'none' } : null,
  };
}, blockId);

/** Whether a box lies wholly inside another (1 px of slack). */
export const inside = (a, b) => a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.w <= b.x + b.w + 1 && a.y + a.h <= b.y + b.h + 1;

/**
 * The share of block `blockId`'s drawn box painted in colour `rgb` (each
 * channel within 40), from a screenshot of the part of the box inside the
 * canvas's view. The block is deselected first by the caller when its
 * selection chrome would cover it. Null when the block is not drawn.
 */
export async function paintShare(page, blockId, rgb) {
  const d = await drawnBlock(page, blockId);
  if (!d) return null;
  const x0 = Math.max(d.box.x, d.view.x);
  const y0 = Math.max(d.box.y, d.view.y);
  const x1 = Math.min(d.box.x + d.box.w, d.view.x + d.view.w);
  const y1 = Math.min(d.box.y + d.box.h, d.view.y + d.view.h);
  if (x1 - x0 < 2 || y1 - y0 < 2) return 0;
  const shot = await page.screenshot({ clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } });
  const png = decodePNG(shot);
  let hit = 0;
  for (let y = 0; y < png.h; y += 1) {
    for (let x = 0; x < png.w; x += 1) {
      const p = png.rgb(x, y);
      if (Math.abs(p[0] - rgb[0]) <= 40 && Math.abs(p[1] - rgb[1]) <= 40 && Math.abs(p[2] - rgb[2]) <= 40) hit += 1;
    }
  }
  return Math.round((hit / (png.w * png.h)) * 1000) / 1000;
}

/**
 * Wait until block `blockId` draws a loaded image and `rgb` covers at least
 * `min` of its box; the last share read (the share may stay below `min`).
 */
export async function waitPaint(page, blockId, rgb, { min = 0.5, timeout = 8000 } = {}) {
  const t0 = Date.now();
  let share = null;
  while (Date.now() - t0 < timeout) {
    const d = await drawnBlock(page, blockId);
    if (d?.img?.loaded) {
      share = await paintShare(page, blockId, rgb);
      if (share !== null && share >= min) return share;
    }
    await sleep(250);
  }
  return share;
}

/** A point on the canvas's empty workspace or sheet with no block under it: the sheet point (fx, fy) given as fractions, nudged until empty. */
export const emptySheetPoint = (page, fx = 0.5, fy = 0.5) => page.evaluate(([fx, fy]) => {
  const s = document.getElementById('poster-canvas').getBoundingClientRect();
  const outer = document.querySelector('[data-postr-canvas-outer]').getBoundingClientRect();
  for (let k = 0; k < 40; k += 1) {
    const dx = (k % 8) * 0.03 * (k % 2 ? 1 : -1);
    const dy = Math.floor(k / 8) * 0.04;
    const x = s.left + s.width * (fx + dx);
    const y = s.top + s.height * (fy + dy);
    if (x < outer.left || y < outer.top || x > outer.right || y > outer.bottom) continue;
    const el = document.elementFromPoint(x, y);
    if (el && el.closest('#poster-canvas') && !el.closest('[data-block-id]')) return { x, y };
  }
  return null;
}, [fx, fy]);

/** Viewport point → sheet units, read from the sheet's box (its zoom from its width on screen). */
export const toUnits = (d, pt) => ({ x: (pt.x - d.sheet.x) / d.zoom, y: (pt.y - d.sheet.y) / d.zoom });
