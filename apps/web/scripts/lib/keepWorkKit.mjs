/**
 * Helpers for scripts/keep-work-check.mjs (record
 * docs/fixes/27-keep-work-safe.md): a signed-in session on the fake backend
 * (lib/guestBackend.mjs), and passive reads of what was stored, what the
 * canvas, the print window and the PowerPoint file show, the save pill and
 * the editor's toasts. Nothing here calls the app's store; the user's
 * actions are Playwright's mouse and keys (lib/undoKit.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { REPO, sleep } from './editorHarness.mjs';
import { newState, newGuestPage, openNewPoster } from './guestBackend.mjs';
import { MOD, openTab } from './undoKit.mjs';

const require = createRequire(import.meta.url);
const { unzipSync, strFromU8 } = require(path.join(REPO, 'node_modules/fflate'));

export const SAVE_KEY = `${MOD}+s`;

/**
 * A signed-in user (not a guest: a guest's own leave prompt arms on every
 * edit, which would hide the editor's), by default a term holder (the
 * PowerPoint export is theirs), at the visitor's entry: the editor link
 * /p/new. Records the editor's toasts and every ⌘S keydown's
 * `defaultPrevented`, read after the event finished. `expiresIn` is the
 * session token's lifetime in seconds (the fake backend's, 3600 by
 * default; H6 uses 30, a token the client refreshes before any request).
 */
export async function openSignedIn(h, { plan = 'term', expiresIn = 3600 } = {}) {
  const state = newState({ anonymous: false, plan, expiresIn });
  const { context, page } = await newGuestPage(h, state);
  await context.addInitScript(() => {
    // The print window calls print() on a timer; nothing is printed here.
    window.print = () => {};
    window.__zqToasts = [];
    window.__zqSaveKeys = [];
    const seen = /^(Saved|Not saved.*|Version saved|Could not save version|Version restored|Undo|Redo)$/;
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          const t = (n.textContent ?? '').trim();
          if (n.nodeType === 1 && seen.test(t)) window.__zqToasts.push({ t: Date.now(), text: t });
          else if (n.nodeType === 3 && seen.test(t)) window.__zqToasts.push({ t: Date.now(), text: t });
        }
      }
    }).observe(document, { subtree: true, childList: true, characterData: false });
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        setTimeout(() => window.__zqSaveKeys.push({ t: Date.now(), prevented: e.defaultPrevented, repeat: e.repeat }), 0);
      }
    }, true);
  });
  const id = await openNewPoster(page, h.base);
  return { state, context, page, id };
}

export const rowOf = (state, id) => state.rows.find((r) => r.id === id) ?? null;

/** The stored HTML of the block (or table cell, or a figure or table note) holding `marker`, in the row `id`. */
export function storedHtml(state, id, marker) {
  const row = rowOf(state, id);
  for (const b of row?.data?.blocks ?? []) {
    if ((b.content ?? '').includes(marker)) return b.content;
    for (const c of b.tableData?.cells ?? []) if ((c ?? '').includes(marker)) return c;
    if ((b.note ?? '').includes(marker)) return b.note;
  }
  return null;
}

/**
 * What separates `a` from `b` in stored HTML: 'br' (a <br> or a newline),
 * 'block' (a block tag, e.g. the <div> a browser makes for a new line),
 * 'none' (the two words joined), or 'missing'.
 */
export function breakBetween(html, a, b) {
  if (!html) return 'missing';
  const i = html.indexOf(a);
  const j = html.indexOf(b);
  if (i < 0 || j < 0 || j < i) return 'missing';
  const mid = html.slice(i + a.length, j);
  if (/<br\s*\/?>|\n/i.test(mid)) return 'br';
  if (/<\/?(div|p|li|h\d)\b/i.test(mid)) return 'block';
  return 'none';
}

/** How many <br> (or newlines) sit between `a` and `b`. */
export function breaksBetween(html, a, b) {
  const i = (html ?? '').indexOf(a);
  const j = (html ?? '').indexOf(b);
  if (i < 0 || j < 0 || j < i) return null;
  return (html.slice(i + a.length, j).match(/<br\s*\/?>|\n|<div\b|<p\b/gi) ?? []).length;
}

/**
 * Where `b` is drawn relative to `a` in `frame` (a page or popup), within
 * the element matched by `rootSel`: dy in units of `a`'s glyph height (0 =
 * the same line; about 1.3 = the next line at line height 1.55; about 2.6 =
 * a blank line between). Null when a word is not drawn.
 *
 * A word's box is the first of its range's client rects that has a width:
 * for a word that starts a line after a newline in the same text node
 * ("ZQN1\nZQN2" drawn with pre-wrap), WebKit gives the range an empty rect
 * at the end of the line before as well, and the bounding box of both read
 * the two lines as one (MEASURED in fix 27 review round 1: rects at top 459
 * width 0 and top 468 width 18; Chromium and Firefox give one rect).
 */
export async function drawnGap(frame, a, b, rootSel = 'body') {
  return frame.evaluate(({ a, b, rootSel }) => {
    const root = document.querySelector(rootSel);
    if (!root) return null;
    const rectOf = (word) => {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const i = n.data.indexOf(word);
        if (i < 0) continue;
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + word.length);
        const box = [...r.getClientRects()].find((x) => x.width > 0 && x.height > 0) ?? r.getBoundingClientRect();
        if (box.height > 0) return box;
      }
      return null;
    };
    const ra = rectOf(a);
    const rb = rectOf(b);
    if (!ra || !rb) return null;
    return Math.round(((rb.top - ra.top) / ra.height) * 100) / 100;
  }, { a, b, rootSel });
}

/** Reload the editor and wait for the sheet. */
export async function reload(page) {
  await page.reload();
  await page.waitForSelector('#poster-canvas [data-block-id]', { timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
}

/** Wait until a PATCH carrying `marker` got a 200 (since `since`); its log entry, or null. */
export async function savedWith(state, marker, { since = 0, timeout = 8000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const e = state.log.find((x) => x.method === 'PATCH' && x.t >= since && x.status === 200 && (x.dataStr ?? '').includes(marker));
    if (e) return e;
    await sleep(100);
  }
  return null;
}

/** Every PATCH carrying `marker` (any outcome), since `since`. */
export const attemptsWith = (state, marker, since = 0) => state.log.filter(
  (x) => x.method === 'PATCH' && x.t >= since && (x.dataStr ?? '').includes(marker),
);

/** Version inserts the backend received (any outcome). */
export const versionPosts = (state) => state.log.filter((x) => x.method === 'POST' && x.path.endsWith('/poster_versions'));

/**
 * The save pill's text: the role=status element whose text starts with the
 * pill's own words (main's failure label "Save failed…" included). Not one
 * that merely mentions saving: the "New version available" banner, also a
 * role=status, asks the user to check that the pill "says Saved", and was
 * read as the pill in review round 1 of fix 27 when parallel runs rewrote
 * version.json (finding R1-A6).
 */
export const savePill = (page) => page.evaluate(() => {
  const el = [...document.querySelectorAll('[role="status"]')].find((e) => /^(Saving|Saved|Not saved|Save failed)\b/.test((e.textContent ?? '').trim()));
  return el ? el.textContent.trim() : null;
});

/** Toasts seen since `since` (texts). */
export const toastsSince = (page, since = 0) => page.evaluate((s) => window.__zqToasts.filter((x) => x.t >= s).map((x) => x.text), since);

/** ⌘S keydowns seen: whether each was cancelled (the browser's save dialog swallowed). */
export const saveKeys = (page) => page.evaluate(() => window.__zqSaveKeys.slice());

/** The page clock (ms), for `since` arguments read in the page. */
export const pageNow = (page) => page.evaluate(() => Date.now());

/**
 * Export › Save PDF: the print window the editor opens. Returns the popup
 * once its sheet holds `marker`.
 */
export async function openPrintWindow(page, marker) {
  await openTab(page, 'export');
  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 15000 }),
    page.getByRole('button', { name: /Save PDF/ }).first().click(),
  ]);
  await popup.waitForFunction((m) => (document.body?.textContent ?? '').includes(m), marker, { timeout: 15000 });
  await popup.evaluate(() => document.fonts.ready).catch(() => {});
  await popup.waitForTimeout(300);
  return popup;
}

/** Export › PowerPoint: the downloaded file's bytes. */
export async function downloadPptx(page) {
  await openTab(page, 'export');
  const btn = page.locator('[data-postr-export-pptx]').first();
  await btn.waitFor({ state: 'visible', timeout: 15000 });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), btn.click()]);
  const file = await dl.path();
  return fs.readFileSync(file);
}

const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Every text paragraph (<a:p>) of every slide: its runs' text, a line break (<a:br/>) as "\n". */
export function pptxParagraphs(bytes) {
  const files = unzipSync(new Uint8Array(bytes));
  const out = [];
  for (const [name, data] of Object.entries(files)) {
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(name)) continue;
    const xml = strFromU8(data);
    for (const m of xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>|<a:p\s[^>]*>([\s\S]*?)<\/a:p>/g)) {
      const body = m[1] ?? m[2] ?? '';
      let text = '';
      for (const t of body.matchAll(/<a:t>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>/g)) text += t[1] !== undefined ? decodeXml(t[1]) : '\n';
      if (text) out.push(text);
    }
  }
  return out;
}

/**
 * Every line of every slide, in order: each paragraph (<a:p>), an empty one
 * kept as '', split at its line breaks (<a:br/>). For counting blank lines,
 * which `pptxParagraphs` drops.
 */
export function pptxLines(bytes) {
  const files = unzipSync(new Uint8Array(bytes));
  const out = [];
  for (const [name, data] of Object.entries(files)) {
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(name)) continue;
    const xml = strFromU8(data);
    for (const m of xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>|<a:p\s[^>]*>([\s\S]*?)<\/a:p>|<a:p\/>/g)) {
      const body = m[1] ?? m[2] ?? '';
      let text = '';
      for (const t of body.matchAll(/<a:t>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>/g)) text += t[1] !== undefined ? decodeXml(t[1]) : '\n';
      out.push(...text.split('\n'));
    }
  }
  return out;
}

/** How many lines sit between the line holding `a` and the next line holding `b`, and whether they are all empty; null when one is missing. */
export function linesBetween(lines, a, b) {
  const i = lines.findIndex((l) => l.includes(a));
  if (i < 0) return null;
  const j = lines.findIndex((l, k) => k > i && l.includes(b));
  if (j < 0) return null;
  const mid = lines.slice(i + 1, j);
  return { count: mid.length, empty: mid.every((l) => l.trim() === '') };
}

/**
 * How the PowerPoint file separates `a` from `b`: 'paragraphs' (each in
 * its own <a:p>), 'br' (a line break in one paragraph), 'none' (joined in
 * one run of text), 'tag' (the markup written out as text, e.g. "<div>"),
 * or 'missing'.
 */
export function pptxBreak(paras, a, b) {
  const pa = paras.findIndex((p) => p.includes(a));
  const pb = paras.findIndex((p) => p.includes(b));
  if (pa < 0 || pb < 0) return 'missing';
  if (pa !== pb) return /<\/?div|<br/i.test(paras[pa]) ? 'tag' : 'paragraphs';
  const p = paras[pa];
  const mid = p.slice(p.indexOf(a) + a.length, p.indexOf(b));
  if (/<\/?(div|p|br)\b/i.test(mid)) return 'tag';
  return mid.includes('\n') ? 'br' : 'none';
}
