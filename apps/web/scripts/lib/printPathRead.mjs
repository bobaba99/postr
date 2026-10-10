/**
 * What scripts/print-path-check.mjs reads (record 30): a sheet's blocks
 * and the lines of text in them, in poster inches, from the editor, from
 * Preview's own drawing and from the print document; how two readings
 * differ; and what Chromium's PDF of the print document holds.
 *
 * `readSheet` runs in the page (passed to page.evaluate, so it is
 * self-contained). Every length is measured against the sheet's own box
 * and given in poster inches, so the editor's zoom transform, Preview's
 * scale and the print document's CSS zoom all cancel out, and so would an
 * engine that reports a zoomed document's boxes uniformly scaled.
 */

/**
 * The blocks on the sheet `sheetSel`: each block's box (left, top, width,
 * height) and the lines of its text, in poster inches from the sheet's
 * top-left corner. A line is the words laid out on one row, in document
 * order (a table's cells side by side make one row), each word placed by
 * its own box (a Range over its characters). The editor's own marks
 * (resize handles, the selection's controls, overlays) are not read.
 */
export function readSheet({ sheetSel, posterW }) {
  const sheet = document.querySelector(sheetSel);
  if (!sheet) return { error: `no ${sheetSel}` };
  const s = sheet.getBoundingClientRect();
  const k = posterW / s.width;
  const inch = (v) => Math.round(v * k * 1000) / 1000;
  const SKIP = '[data-postr-selection-ui], [data-postr-resize-handle], [data-postr-overlay], [data-postr-editor-ui]';
  const shown = (el) => {
    for (let n = el; n && n !== sheet; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    }
    return true;
  };
  const frames = [...sheet.querySelectorAll('[data-block-id]')].filter((el) => !el.parentElement.closest('[data-block-id]') && !el.closest(SKIP));
  const blocks = frames.map((el) => {
    const r = el.getBoundingClientRect();
    const words = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      // Chart text is SVG, laid out by the chart and read by the chart
      // harness (chart-print-size-check.mjs); here a chart is its box.
      if (!p || p.closest(SKIP) || p.closest('svg') || !shown(p)) continue;
      for (const m of n.textContent.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(n, m.index);
        range.setEnd(n, m.index + m[0].length);
        const rects = [...range.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
        if (!rects.length) continue;
        if (rects.every((x) => Math.abs(x.top - rects[0].top) < 0.4 * rects[0].height)) {
          const w = rects[0];
          words.push({ t: m[0], top: w.top, bottom: w.bottom, left: w.left, h: w.height });
          continue;
        }
        // A word broken across lines (after a hyphen: "10-" | "minute"):
        // each piece on its own line, character by character.
        let piece = null;
        for (let i = 0; i < m[0].length; i += 1) {
          const cr = document.createRange();
          cr.setStart(n, m.index + i);
          cr.setEnd(n, m.index + i + 1);
          const c = [...cr.getClientRects()].find((x) => x.width > 0 && x.height > 0);
          if (!c) { if (piece) piece.t += m[0][i]; continue; }
          if (piece && Math.abs(c.top - piece.top) < 0.4 * piece.h) piece.t += m[0][i];
          else {
            if (piece) words.push(piece);
            piece = { t: m[0][i], top: c.top, bottom: c.bottom, left: c.left, h: c.height };
          }
        }
        if (piece) words.push(piece);
      }
    }
    const lines = [];
    for (const w of words) {
      const cur = lines[lines.length - 1];
      if (cur && Math.abs(w.top - cur.top) <= 0.4 * Math.max(w.h, cur.h)) {
        cur.words.push(w.t);
        cur.left = Math.min(cur.left, w.left);
        cur.bottom = Math.max(cur.bottom, w.bottom);
      } else lines.push({ words: [w.t], top: w.top, bottom: w.bottom, left: w.left, h: w.h });
    }
    return {
      id: el.getAttribute('data-block-id'),
      type: el.getAttribute('data-block-type') ?? '',
      selected: el.getAttribute('data-postr-selected') === 'true',
      box: [r.left - s.left, r.top - s.top, r.width, r.height].map(inch),
      lines: lines.map((l) => ({ text: l.words.join(' '), top: inch(l.top - s.top), bottom: inch(l.bottom - s.top), left: inch(l.left - s.left) })),
    };
  });
  return { sheetIn: [inch(s.width), inch(s.height)], blocks };
}

/** The largest of the four box differences, in inches. */
const boxDiff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

/**
 * How `other` (the print document, or Preview's drawing) differs from the
 * editor `ref`, block by block: boxes more than `tol` inches apart, lines
 * broken differently (their texts), and lines that keep their text but sit
 * more than `tol` from where the editor draws them. `missing` lists blocks
 * read in one and not the other.
 */
export function compareSheets(ref, other, tol, lineTol = tol) {
  const byId = new Map(other.blocks.map((b) => [b.id, b]));
  const out = { boxes: [], wraps: [], linePos: [], missing: [], worstBox: 0, worstLine: 0 };
  for (const a of ref.blocks) {
    const b = byId.get(a.id);
    if (!b) { out.missing.push(`${a.type} ${a.id} not in the other`); continue; }
    byId.delete(a.id);
    const d = boxDiff(a.box, b.box);
    out.worstBox = Math.max(out.worstBox, d);
    if (d > tol) out.boxes.push({ id: a.id, type: a.type, editor: a.box, other: b.box, d: Math.round(d * 1000) / 1000 });
    // Spaces ignored: words are read per text node, and the print copy is
    // serialised and parsed again, which joins adjacent text nodes ("1" and
    // "." of a heading's number read as "1 ." in the editor, "1." in print).
    // Words moving between lines still change the lines' texts.
    const ta = a.lines.map((l) => l.text);
    const tb = b.lines.map((l) => l.text);
    const squash = (t) => t.replace(/\s+/g, '');
    if (ta.map(squash).join('\n') !== tb.map(squash).join('\n')) {
      const at = ta.findIndex((t, i) => squash(t) !== squash(tb[i] ?? ''));
      out.wraps.push({ id: a.id, type: a.type, lines: [ta.length, tb.length], firstDiff: at < 0 ? ta.length : at, editor: ta[at < 0 ? ta.length - 1 : at] ?? null, other: tb[at < 0 ? tb.length - 1 : at] ?? null });
    } else {
      // Lines measured against their own block's box: a block moved as a
      // whole is the box claim's, not this one's.
      let worst = 0;
      a.lines.forEach((l, i) => {
        const m = b.lines[i];
        worst = Math.max(worst, Math.abs((l.top - a.box[1]) - (m.top - b.box[1])), Math.abs((l.left - a.box[0]) - (m.left - b.box[0])));
      });
      out.worstLine = Math.max(out.worstLine, worst);
      if (worst > lineTol) out.linePos.push({ id: a.id, type: a.type, d: Math.round(worst * 1000) / 1000 });
    }
  }
  for (const [id, b] of byId) out.missing.push(`${b.type} ${id} only in the other`);
  out.worstBox = Math.round(out.worstBox * 1000) / 1000;
  out.worstLine = Math.round(out.worstLine * 1000) / 1000;
  return out;
}

/**
 * Where the title runs into the block under it: the title's bottom against
 * the top of the highest block that starts below the title's own top and
 * overlaps it sideways, in inches (positive: they overlap). Null when the
 * sheet has no title or nothing under it.
 */
export function titleOverlap(sheet) {
  const title = sheet.blocks.find((b) => b.type === 'title');
  if (!title) return null;
  const [tl, tt, tw, th] = title.box;
  const under = sheet.blocks.filter((b) => b !== title && b.box[1] > tt + 0.01 && b.box[0] < tl + tw && b.box[0] + b.box[2] > tl);
  if (!under.length) return null;
  const next = under.reduce((m, b) => (b.box[1] < m.box[1] ? b : m));
  return { under: next.type, overlapIn: Math.round((tt + th - next.box[1]) * 1000) / 1000 };
}

/**
 * A PDF's first page (Chromium's or Firefox's print of a print document):
 * its page size in inches, its text items (string, x and baseline y in
 * inches from the top-left), and the colours of the areas it paints (hex):
 * a path filled while that colour is the fill colour. Text is painted with
 * the fill colour too, so a colour only used for text is not an area.
 * Read with pdf-lib and pdf.js.
 */
export async function pdfFacts(bytes, { PDFDocument, pdfjs }) {
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  const { width, height } = pages[0].getSize();
  const pj = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, isEvalSupported: false }).promise;
  const pg = await pj.getPage(1);
  const tc = await pg.getTextContent();
  const items = tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({ s: it.str, x: it.transform[4] / 72, y: (height - it.transform[5]) / 72, w: it.width / 72 }));
  const ops = await pg.getOperatorList();
  const O = pdfjs.OPS;
  const FILLS = new Set([O.fill, O.eoFill, O.fillStroke, O.eoFillStroke, O.closeFillStroke, O.closeEOFillStroke]);
  const hex = (n) => Math.round(n).toString(16).padStart(2, '0');
  // pdf.js hands the colour as a typed array of 0–255 (mapping a typed
  // array keeps its type: Array.from first), or as a hex string.
  const colour = (a) => (typeof a?.[0] === 'string' ? a[0].toLowerCase() : a?.length === 3 ? `#${Array.from(a, (v) => hex(v)).join('')}` : null);
  const areas = new Set();
  const stack = [];
  let fill = '#000000';
  ops.fnArray.forEach((fn, i) => {
    if (fn === O.save) stack.push(fill);
    else if (fn === O.restore) fill = stack.pop() ?? fill;
    else if (fn === O.setFillRGBColor) fill = colour(ops.argsArray[i]) ?? fill;
    else if (FILLS.has(fn)) areas.add(fill);
  });
  await pj.destroy();
  return { pages: pages.length, pageIn: [Math.round((width / 72) * 1000) / 1000, Math.round((height / 72) * 1000) / 1000], items, areas: [...areas] };
}

/**
 * Each line the editor draws, looked for in the PDF: the PDF's text items
 * whose baseline falls inside the line's height and whose start lies
 * inside its block, joined left to right, must spell the line (spaces
 * ignored: the PDF's runs carry their own). Returns the lines not found.
 */
export function linesInPdf(ref, pdf, tol) {
  const lost = [];
  let checked = 0;
  let offPage = 0;
  const [pw, ph] = pdf.pageIn;
  for (const b of ref.blocks) {
    if (b.type === 'chart') continue; // chart text is SVG: the chart harness's
    const [bl, , bw] = b.box;
    for (const l of b.lines) {
      // A line past the page's edge (a block past the sheet) is cut by
      // design; Issues lists the block.
      if (l.bottom > ph + tol || l.left > pw) { offPage += 1; continue; }
      checked += 1;
      // Its characters, as a multiset, among the PDF's text in its band:
      // pdf.js gives runs, not glyphs, so a superscript inside a run's span
      // cannot be put back in order, and a block overlapping another (the
      // poster's own overlap, in the editor too) brings that block's words
      // into the band. A word that moved to another line is still missed.
      const want = [...l.text.replace(/\s+/g, '')];
      const got = pdf.items.filter((it) => it.y >= l.top - tol && it.y <= l.bottom + tol && it.x >= bl - tol && it.x <= bl + bw + tol);
      const pool = new Map();
      for (const ch of got.map((it) => it.s).join('').replace(/\s+/g, '')) pool.set(ch, (pool.get(ch) ?? 0) + 1);
      const missing = [];
      for (const ch of want) {
        const n = pool.get(ch) ?? 0;
        if (n > 0) pool.set(ch, n - 1);
        else missing.push(ch);
      }
      if (missing.length) lost.push({ id: b.id, type: b.type, line: l.text.slice(0, 60), missing: missing.join('').slice(0, 40) });
    }
  }
  return { checked, offPage, lost };
}

/**
 * Two declarations BASE reads as one (record 30's review round 3, R3-F2: on
 * the production build BASE reported two rules the CSS minifier rewrote, so
 * the build run could not exit 0). Each is an equivalence, not a tolerance:
 * - `colour`: CSS Color 4 defines `transparent` as rgba(0, 0, 0, 0); the
 *   minifier writes it `#0000`, which the engines read as rgba(0, 0, 0, 0)
 *   (preflight's button rule).
 * - `initial`: a border-image longhand at its initial value is dropped. The
 *   minifier merges preflight's three border longhands into `border`, which
 *   also sets the five border-image longhands to their initial value
 *   (Chromium reads them `initial`, Firefox and WebKit as the values below).
 *   No stylesheet the sheet meets sets border-image (the app's: none, by
 *   grep; the browsers' own: none, 57 element types read with no author CSS
 *   in the three engines), so setting it to its initial value changes
 *   nothing. Only border-image: a declaration at its initial value in general
 *   does change things (preflight's `vertical-align: baseline` on sub and sup
 *   undoes the browser's own super and sub: without it a formatted text block
 *   broke into 25 lines, not 21; the mutant B-sup-vertical-align), so it is
 *   still compared.
 */
export const DECL_EQUIV = {
  colour: ['transparent', 'rgba(0, 0, 0, 0)'],
  initial: { 'border-image-source': 'none', 'border-image-slice': '100%', 'border-image-width': '1', 'border-image-outset': '0', 'border-image-repeat': 'stretch' },
};

/**
 * The editor's stylesheet rules that match an element on the sheet (runs
 * in the editor's page), less those that lay nothing out on paper: the
 * out-of-bounds colouring (data-postr-oob, editor chrome the print copy
 * drops), motion (transitions and animations), rules that only set
 * Tailwind's custom properties (--tw-*, read by its utility classes, none
 * of which the sheet uses), and Observable Plot's own rules (a <style>
 * inside each chart's svg, copied with it). An empty image block's
 * "+ Upload figure" is a button on the sheet, so the base rules for buttons
 * count. Each is { selector, css }: `css` is the rule's declarations as the
 * browser parses them, one longhand each, in name order, so a rule the build's
 * CSS minifier reordered or merged into a shorthand reads as the rule it was
 * (record 30's review round 2, R2-F5: on the production build 7 rules read as
 * lost that differed only so; the dev server serves them as written), with
 * `equiv` (DECL_EQUIV) applied (review round 3, R3-F2: the last two).
 */
export function sheetRules(equiv) {
  const decls = (st) => [...st]
    .filter((p) => { const v = st.getPropertyValue(p); return !(p in equiv.initial && (v === 'initial' || v === equiv.initial[p])); })
    .map((p) => `${p}: ${st.getPropertyValue(p).split(equiv.colour[0]).join(equiv.colour[1])}${st.getPropertyPriority(p) ? ' !important' : ''}`).sort().join('; ');
  const sheet = document.getElementById('poster-canvas');
  const els = [sheet, ...sheet.querySelectorAll('*')];
  const out = [];
  const visit = (rules, inMedia) => {
    for (const r of rules) {
      if (r.type === CSSRule.MEDIA_RULE) { visit(r.cssRules, true); continue; }
      if (r.type !== CSSRule.STYLE_RULE) continue;
      const sel = r.selectorText;
      if (/data-postr-oob|:where\(\.plot-/.test(sel)) continue;
      const props = [...r.style];
      if (props.every((p) => p.startsWith('--'))) continue;
      if (props.every((p) => /^(transition|animation)/.test(p))) continue;
      if (inMedia) continue; // the app's only media rules on the sheet are motion (prefers-reduced-motion)
      if (els.some((el) => { try { return el.matches(sel); } catch { return false; } })) out.push({ selector: sel, css: decls(r.style) });
    }
  };
  for (const s of document.styleSheets) {
    try { visit(s.cssRules, false); } catch { /* a cross-origin sheet (Google Fonts) */ }
  }
  return out;
}

/**
 * Each of `rules` (the editor's, from sheetRules) the print document
 * restates for its sheet (runs in the print window): a rule with the same
 * declarations (longhands in name order, `equiv` applied, as sheetRules
 * reads them) whose selector is the editor's with every part scoped to the
 * sheet. Returns the editor rules it does not restate.
 */
export function unrestated({ rules, equiv }) {
  const decls = (st) => [...st]
    .filter((p) => { const v = st.getPropertyValue(p); return !(p in equiv.initial && (v === 'initial' || v === equiv.initial[p])); })
    .map((p) => `${p}: ${st.getPropertyValue(p).split(equiv.colour[0]).join(equiv.colour[1])}${st.getPropertyPriority(p) ? ' !important' : ''}`).sort().join('; ');
  const mine = [];
  for (const s of document.styleSheets) {
    try {
      for (const r of s.cssRules) if (r.type === CSSRule.STYLE_RULE) mine.push({ selector: r.selectorText, css: decls(r.style) });
    } catch { /* cross-origin */ }
  }
  // The sheet's own element (the bare scope) is what the editor's `*` also
  // matches on the sheet: it is dropped, the rest compared part by part.
  const norm = (sel) => sel.split(',').map((p) => p.trim().replace(/^#poster-print-root\s*>\s*#poster-canvas\s*/, '').trim()).filter(Boolean).sort().join(', ');
  return rules.filter((r) => !mine.some((m) => m.css === r.css && norm(m.selector) === r.selector.split(',').map((p) => p.trim()).sort().join(', ')));
}

/** Properties the sheet inherits, read on the sheet's own element (in screen media). */
export const INHERITED = ['fontFamily', 'fontSize', 'lineHeight', 'fontWeight', 'fontStyle', 'textRendering', 'letterSpacing', 'wordSpacing', 'tabSize', 'fontFeatureSettings', 'fontVariationSettings', 'fontKerning', 'webkitFontSmoothing', 'color'];

/** The inherited properties' computed values on the sheet `sel` (runs in the page). */
export function sheetInherited({ sel, props }) {
  const el = document.querySelector(sel);
  if (!el) return null;
  const cs = getComputedStyle(el);
  return Object.fromEntries(props.map((p) => [p, cs[p] ?? '']));
}
