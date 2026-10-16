/**
 * What scripts/text-size-check.mjs reads (record docs/fixes/33-text-size.md),
 * written from the record's rule table (the MVP design doc §3.7), not from
 * the app's code: the sizes each text level is drawn at on a sheet, the top
 * bar's text-size control (its buttons, their state and title, the label),
 * the geometry of the top bar's groups, the sizes the store holds (a passive
 * read, for the exact round trip), and the text sizes a PowerPoint file
 * writes.
 *
 * Every size is read in points: a sheet is laid out in poster units (1 unit
 * is 1 CSS px at zoom 1, 7.2 pt, poster/constants.ts), and a computed
 * font-size is taken before any transform, so the editor's zoom and the
 * print document's scale do not enter.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { REPO } from './editorHarness.mjs';

const require = createRequire(import.meta.url);
const { unzipSync, strFromU8 } = require(path.join(REPO, 'node_modules/fflate'));

/** Points per poster unit (1 unit = 1/10 in). */
export const PT_PER_UNIT = 7.2;
/** The body sizes of the rule table, in pt. */
export const BODY_SIZES = [28, 32, 36, 40, 44, 48];
/** The levels, and the block type each is drawn in. */
export const LEVELS = { title: 'title', heading: 'heading', authors: 'authors', body: 'text' };

/** The rule's next body size from `pt` (`dir` 1 up, -1 down), or null at a bound. */
export function nextBody(pt, dir) {
  const eps = 1e-6;
  if (dir > 0) return BODY_SIZES.find((s) => s > pt + eps) ?? null;
  return [...BODY_SIZES].reverse().find((s) => s < pt - eps) ?? null;
}

/**
 * In the page: the size, in pt, each level is drawn at on the sheet `sheetSel`
 * (the editor's `#poster-canvas`, or the print document's). A level's size is
 * the largest computed font-size among its blocks' text: elements holding
 * text of their own, and each editing host (an empty block's text field is
 * still sized). The editor's own marks (handles, selection controls, hints)
 * are not read. A level with no block on the sheet is null; `spread` is how
 * far apart its blocks are drawn (0 when they agree).
 */
export function readLevelsInPage({ sheetSel, ptPerUnit, levels }) {
  const sheet = document.querySelector(sheetSel);
  if (!sheet) return { error: `no ${sheetSel}` };
  const SKIP = '[data-postr-selection-ui], [data-postr-resize-handle], [data-postr-overlay], [data-postr-editor-ui]';
  const out = {};
  for (const [level, type] of Object.entries(levels)) {
    const sizes = [];
    for (const frame of sheet.querySelectorAll(`[data-block-type="${type}"]`)) {
      let max = 0;
      for (const el of [frame, ...frame.querySelectorAll('*')]) {
        if (el.closest(SKIP)) continue;
        const ownText = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
        if (!ownText && el.getAttribute('contenteditable') !== 'true' && el.getAttribute('contenteditable') !== '') continue;
        max = Math.max(max, parseFloat(getComputedStyle(el).fontSize));
      }
      if (max > 0) sizes.push(max * ptPerUnit);
    }
    out[level] = sizes.length ? { pt: Math.max(...sizes), spread: Math.max(...sizes) - Math.min(...sizes), n: sizes.length } : null;
  }
  return out;
}

/**
 * Information: a figure's caption, which follows the body by its own rule
 * (blocks.tsx `CaptionWrapper`), read as the text of image blocks (an empty
 * figure's "+ Upload figure" hint is the editor's and is skipped).
 */
export const captionLevel = (page) => page.evaluate(readLevelsInPage, { sheetSel: '#poster-canvas', ptPerUnit: PT_PER_UNIT, levels: { caption: 'image' } });

/** The levels drawn on the editor's sheet, in pt. */
export const editorLevels = (page) => page.evaluate(readLevelsInPage, { sheetSel: '#poster-canvas', ptPerUnit: PT_PER_UNIT, levels: LEVELS });

/**
 * In the page: the top bar's text-size control as a user meets it: the
 * buttons named "Decrease text size" and "Increase text size" inside the
 * top bar, whether each is disabled (the `disabled` property or
 * aria-disabled="true"), its title, and the text shown between them.
 */
export function readControlInPage() {
  const bar = document.querySelector('[data-postr-editor-topbar]');
  if (!bar) return { bar: false };
  const named = (name) => [...bar.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent.trim()) === name) ?? null;
  const down = named('Decrease text size');
  const up = named('Increase text size');
  const state = (b) => (b ? { disabled: b.disabled || b.getAttribute('aria-disabled') === 'true', title: b.getAttribute('title') ?? '' } : null);
  let label = null;
  if (down && up) {
    const r = document.createRange();
    r.setStartAfter(down);
    r.setEndBefore(up);
    label = r.toString().replace(/\s+/g, ' ').trim();
  }
  return { bar: true, down: state(down), up: state(up), label };
}

export const control = (page) => page.evaluate(readControlInPage);

/** The four level sizes the store holds, as exact strings (shortest round trip), read without acting. */
export const storeSizes = (page) => page.evaluate(async () => {
  const m = await import('/src/stores/posterStore.ts');
  const s = m.usePosterStore.getState().doc.styles;
  return Object.fromEntries(['title', 'heading', 'authors', 'body'].map((k) => [k, String(s[k].size)]));
});

/** Undo steps the store could take, and redo steps (a passive read of its flags). */
export const historyFlags = (page) => page.evaluate(async () => {
  const m = await import('/src/stores/posterStore.ts');
  const s = m.usePosterStore.getState();
  return { canUndo: s.canUndo, canRedo: s.canRedo };
});

/**
 * In the page: the boxes of the top bar's controls, in window px: the bar,
 * the History group, the text-size group (the box holding both of its
 * buttons and the label), Save PDF, and the sidebar's Show button when the
 * sidebar is hidden; each button's own top element at its centre; and
 * whether the label wraps (its height against one line).
 */
export function readBarInPage() {
  const bar = document.querySelector('[data-postr-editor-topbar]');
  if (!bar) return { error: 'no top bar' };
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
  };
  const named = (name) => [...bar.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === name) ?? null;
  const down = named('Decrease text size');
  const up = named('Increase text size');
  let group = null;
  let labelLines = null;
  if (down && up) {
    let g = down.parentElement;
    while (g && !g.contains(up)) g = g.parentElement;
    group = g;
    // The label: what lies between the two buttons. An inline box broken
    // over lines has one client rect per line; a block's lines are its
    // height over its line height.
    const between = [];
    for (let n = down.nextSibling; n && n !== up; n = n.nextSibling) between.push(n);
    labelLines = Math.max(0, ...between.map((n) => {
      if (n.nodeType === 3) {
        if (!n.textContent.trim()) return 0;
        const r = document.createRange();
        r.selectNodeContents(n);
        return new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size;
      }
      if (n.nodeType !== 1) return 0;
      const cs = getComputedStyle(n);
      if (cs.display === 'inline') return n.getClientRects().length;
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      return Math.round(n.getBoundingClientRect().height / lh);
    }));
  }
  const buttons = [...bar.querySelectorAll('button')];
  const covered = buttons.filter((b) => {
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top?.closest('button') !== b;
  }).map((b) => b.getAttribute('aria-label') ?? b.textContent.trim());
  return {
    window: { w: innerWidth, h: innerHeight },
    bar: { ...box(bar), scrollW: bar.scrollWidth, clientW: bar.clientWidth },
    history: box(document.querySelector('[data-postr-history-buttons]')),
    textSize: box(group),
    print: box(bar.querySelector('[data-postr-topbar-print]')),
    reveal: box(document.querySelector('[data-postr-sidebar-reveal]')),
    labelLines,
    covered,
  };
}

/** Pairs among `boxes` (name → box) that overlap by more than 0.5 px both ways. */
export function overlapping(boxes) {
  const list = Object.entries(boxes).filter(([, b]) => b);
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const [an, a] = list[i];
      const [bn, b] = list[j];
      const dx = Math.min(a.r, b.r) - Math.max(a.l, b.l);
      const dy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      if (dx > 0.5 && dy > 0.5) out.push(`${an}×${bn}`);
    }
  }
  return out;
}

const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/**
 * Slide 1 of a .pptx: every text shape's text and the sizes (pt) its runs
 * are written at (`<a:rPr sz>` and `<a:defRPr sz>`, in hundredths of a
 * point). Plain Node, the repo's fflate and regular expressions: nothing of
 * the app's export code reads what it wrote.
 */
export function pptxTextSizes(bytes) {
  const files = unzipSync(new Uint8Array(bytes));
  const xml = strFromU8(files['ppt/slides/slide1.xml']);
  return [...xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)].map((m) => {
    const body = m[1];
    const runs = [...body.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)].map((r) => {
      const sz = /<a:rPr\b[^>]*\bsz="(\d+)"/.exec(r[1]);
      const t = /<a:t>([\s\S]*?)<\/a:t>/.exec(r[1]);
      return { pt: sz ? Number(sz[1]) / 100 : null, text: t ? decodeXml(t[1]) : '' };
    });
    return { text: runs.map((r) => r.text).join(''), runs };
  }).filter((s) => s.text.trim());
}
