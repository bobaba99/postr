/**
 * In-page measurement of Postr's chart blocks, shared by the editor and the
 * print document ("⎙ Save PDF"), for scripts/chart-print-size-check.mjs.
 *
 * `measureChartsIn(rootSel, posterWIn)` runs in the page (pass it to
 * page.evaluate as a string; it must not close over anything). For every
 * block under `rootSel` holding a chart svg it returns:
 *   - texts: each visible <text> of the svg, its printed pt and role, and
 *     whether it is clipped. pt = computed font-size (svg user units) × the
 *     scale its screen CTM applies ÷ the sheet's screen px per inch × 72.
 *     Role from Observable Plot's aria-labels: tick (x/y/fx-axis tick label),
 *     axisTitle (x/y/fx-axis label), legend (Postr's painted legend), direct
 *     (Plot text marks: line-end labels), other.
 *   - clipped: the text's box reaches past what is shown by more than
 *     CLIP_TOL_IN: the intersection of every ancestor whose overflow is not
 *     visible, the svg itself included, up to and including the sheet
 *     (`#poster-canvas`; the print root `#poster-print-root` in print), so
 *     the editor's scroll viewport never counts. The text's box is its
 *     font box (ascent to descent, its advance wide), measured on a copy of
 *     the svg drawn at 1 CSS px per user unit and mapped onto the page by
 *     the svg's own screen transform: on the sheet a chart is drawn a few
 *     device px tall, where Chromium rounds SVG text metrics (a 33 px title
 *     measured 36.08 user units tall in the editor and 50 in print, the same
 *     text), so the boxes read in place are not the text's.
 *   - caption: the "Figure N." caption, when the block has one: shown (its
 *     box inside what is shown), cut inside its own box (scrollHeight past
 *     clientHeight), and, when it carries the sample-data prefix, whether
 *     each word of that prefix is shown (its own text boxes).
 *   - tickOverlaps: pairs of tick labels on the same axis whose font boxes
 *     overlap by more than CLIP_TOL_IN both ways; tickOverlapsInked, by axis
 *     (x, y, fx), the pairs whose glyphs meet: a line of one beside a line
 *     of the other on its row, or stacked with baselines closer than
 *     0.72 em (a wrapped label's lines are equal slices of its font box).
 *     A collision for scripts/chart-print-size-check.mjs.
 *   - collisions: an axis title whose font box overlaps a tick label, a
 *     legend label or a line-end label, or a legend label over a tick label,
 *     by more than CLIP_TOL_IN both ways.
 *   - hostIn, frameIn, viewBox, basePx: for the controls.
 * Sizes are in poster inches: screen px ÷ (the sheet's screen width ÷ its
 * width in inches), so the zoom never matters.
 */
export const SAMPLE_PREFIX = 'Sample data, not real results.';

export function measureChartsIn(rootSel, posterWIn, samplePrefix, clipTolIn, prefixTolIn = clipTolIn) {
  const sheet = document.querySelector(`${rootSel} #poster-canvas`) ?? document.querySelector('#poster-canvas');
  const pxPerIn = sheet.getBoundingClientRect().width / posterWIn;
  const stopAt = document.querySelector('#poster-print-root') ?? sheet;
  const role = (t) => {
    for (let e = t; e && e.tagName !== 'svg'; e = e.parentElement) {
      const a = e.getAttribute && e.getAttribute('aria-label');
      if (!a) continue;
      if (/tick label$/.test(a)) return 'tick';
      if (/-axis label$/.test(a)) return 'axisTitle';
      if (a === 'legend') return 'legend';
      if (a === 'text') return 'direct';
    }
    return 'other';
  };
  // What is shown of `el`: every clipping ancestor's box, up to the sheet.
  const shownRect = (el) => {
    const r = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    for (let a = el.parentElement; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const cx = cs.overflowX !== 'visible';
      const cy = cs.overflowY !== 'visible';
      if (cx || cy) {
        const b = a.getBoundingClientRect();
        if (cx) { r.left = Math.max(r.left, b.left); r.right = Math.min(r.right, b.right); }
        if (cy) { r.top = Math.max(r.top, b.top); r.bottom = Math.min(r.bottom, b.bottom); }
      }
      if (a === stopAt) break;
    }
    return r;
  };
  const tol = clipTolIn * pxPerIn;
  // Where each svg is copied to be measured at 1:1 (off screen).
  const bench = document.createElement('div');
  bench.style.cssText = 'position:absolute;left:-200000px;top:0;visibility:hidden;';
  document.body.appendChild(bench);
  // The font box of every <text> of `svg`, in screen px: measured on a 1:1
  // copy, mapped by the original's screen CTM.
  const textBoxes = (svg) => {
    const vb = svg.viewBox.baseVal;
    const copy = svg.cloneNode(true);
    copy.setAttribute('width', String(vb.width));
    copy.setAttribute('height', String(vb.height));
    copy.style.width = `${vb.width}px`;
    copy.style.height = `${vb.height}px`;
    bench.replaceChildren(copy);
    const screen = svg.getScreenCTM();
    const toScreen = (x, y) => ({ x: screen.a * x + screen.c * y + screen.e, y: screen.b * x + screen.d * y + screen.f });
    const boxes = [...copy.querySelectorAll('text')].map((t) => {
      const bb = t.getBBox();
      const m = t.getCTM();
      const pts = [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y + bb.height]]
        .map(([x, y]) => toScreen(m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f));
      return { left: Math.min(...pts.map((q) => q.x)), right: Math.max(...pts.map((q) => q.x)), top: Math.min(...pts.map((q) => q.y)), bottom: Math.max(...pts.map((q) => q.y)) };
    });
    bench.replaceChildren();
    return boxes;
  };
  const past = (box, r) => box.left < r.left - tol || box.right > r.right + tol || box.top < r.top - tol || box.bottom > r.bottom + tol;
  const inches = (v) => Math.round((v / pxPerIn) * 1000) / 1000;
  // Only the sheet's own blocks: the thumbnail capture puts a copy of the
  // sheet (same ids, drawn 1:1) into the document for a moment, and its
  // blocks measured against this sheet's px per inch read as small text
  // (Firefox, the UI scenario: a box chart "at 10.43 pt").
  const out = [...sheet.querySelectorAll('[data-block-id]')].flatMap((b) => {
    const svg = b.querySelector('svg[viewBox]');
    if (!svg) return [];
    const host = svg.parentElement.getBoundingClientRect();
    const frame = b.getBoundingClientRect();
    const boxes = textBoxes(svg);
    const texts = [...svg.querySelectorAll('text')]
      .map((t, i) => [t, boxes[i]])
      .filter(([t]) => t.textContent.trim() && t.getBoundingClientRect().width > 0)
      .map(([t, box]) => {
        const fs = parseFloat(getComputedStyle(t).fontSize);
        const m = t.getScreenCTM();
        const shown = shownRect(t);
        const clipped = past(box, shown);
        return {
          role: role(t),
          pt: (fs * Math.hypot(m.a, m.b)) / pxPerIn * 72,
          clipped,
          // How far past each edge, in inches, when clipped (for the report).
          ...(clipped ? { over: Object.fromEntries([['left', shown.left - box.left], ['top', shown.top - box.top], ['right', box.right - shown.right], ['bottom', box.bottom - shown.bottom]].filter(([, v]) => v > tol).map(([k, v]) => [k, inches(v)])) } : {}),
          text: t.textContent.trim().slice(0, 24),
        };
      });
    // Tick labels written over each other, axis by axis. A pair counts when
    // their font boxes overlap both ways. It is `inked` when the glyphs
    // themselves meet: side by side (advance boxes overlap), or stacked with
    // their baselines closer than a capital's height (0.72 em), where
    // overlapping font boxes are mostly the space above and below the line.
    let tickOverlaps = 0;
    const tickOverlapsInked = { x: 0, y: 0, fx: 0 };
    const byAxis = new Map();
    [...svg.querySelectorAll('text')].forEach((t, i) => {
      const g = t.closest('[aria-label$="tick label"]');
      if (!g || !t.textContent.trim()) return;
      if (!byAxis.has(g)) byAxis.set(g, { axis: g.getAttribute('aria-label').split('-')[0], items: [] });
      const m = t.getScreenCTM();
      byAxis.get(g).items.push({ box: boxes[i], em: parseFloat(getComputedStyle(t).fontSize) * Math.hypot(m.a, m.b), lines: Math.max(1, t.querySelectorAll('tspan').length) });
    });
    // A wrapped label's lines, as equal slices of its font box (its lines
    // are evenly spaced): two labels' glyphs meet when a line of each does,
    // so a label of four lines that overruns its neighbour by a line is
    // caught (fix 13c review Q-R4), where its centre is far from the
    // neighbour's. Two lines' glyphs meet when their boxes overlap across
    // and, up and down, by more than the box's room above a capital and
    // below the baseline (the slice's height less 0.72 em): side by side on
    // one row, or stacked with baselines closer than 0.72 em. (The rule was
    // "centres farther apart across than up and down" for side by side,
    // which counted a right-aligned "0" under "1,000,000", font boxes
    // touching by 2.9 px with their glyphs 8 px apart; scratch probe ypair.)
    const linesOf = (it) => Array.from({ length: it.lines }, (_, k) => {
      const hh = (it.box.bottom - it.box.top) / it.lines;
      return { left: it.box.left, right: it.box.right, top: it.box.top + k * hh, bottom: it.box.top + (k + 1) * hh };
    });
    for (const { axis, items } of byAxis.values()) {
      for (let i = 0; i < items.length; i += 1) {
        for (let j = i + 1; j < items.length; j += 1) {
          const a = items[i].box;
          const c = items[j].box;
          const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left);
          const oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
          if (!(ox > tol && oy > tol)) continue;
          tickOverlaps += 1;
          const em = Math.min(items[i].em, items[j].em);
          const inked = linesOf(items[i]).some((la) => linesOf(items[j]).some((lc) => {
            const lox = Math.min(la.right, lc.right) - Math.max(la.left, lc.left);
            const loy = Math.min(la.bottom, lc.bottom) - Math.max(la.top, lc.top);
            const slack = Math.min(la.bottom - la.top, lc.bottom - lc.top) - 0.72 * em;
            return lox > tol && loy > Math.max(tol, slack);
          }));
          if (inked) tickOverlapsInked[axis] = (tickOverlapsInked[axis] ?? 0) + 1;
        }
      }
    }
    // Titles and the legend over other text.
    const boxed = [...svg.querySelectorAll('text')].map((t, i) => ({ t, box: boxes[i], role: role(t) })).filter((x) => x.t.textContent.trim());
    const overlaps = (a, c) => Math.min(a.right, c.right) - Math.max(a.left, c.left) > tol && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > tol;
    const collisions = [];
    for (const a of boxed) {
      const against = a.role === 'axisTitle' ? ['tick', 'legend', 'direct'] : a.role === 'legend' ? ['tick'] : [];
      for (const c of boxed) {
        if (c !== a && against.includes(c.role) && overlaps(a.box, c.box)) collisions.push(`${a.role} "${a.t.textContent.trim().slice(0, 20)}" over ${c.role} "${c.t.textContent.trim().slice(0, 20)}"`);
      }
    }
    // The caption's own div: its first child is the bold "Figure N." (the
    // wrapper around a top or left caption also starts with that text).
    const capEl = [...b.querySelectorAll('div')].find((d) => d.firstElementChild?.tagName === 'B' && /^(Figure|Table)\s*\d+\.$/.test(d.firstElementChild.textContent.trim()));
    let caption = null;
    if (capEl) {
      const cr = capEl.getBoundingClientRect();
      let prefixShown = null;
      let prefixWhy = null;
      const walker = document.createTreeWalker(capEl, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const at = n.textContent.indexOf(samplePrefix);
        if (at < 0) continue;
        // Word by word: a space where a line wraps hangs past the box
        // invisibly (CSS), so the spaces' own boxes do not count.
        const rects = [];
        for (const m of samplePrefix.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(n, at + m.index);
          range.setEnd(n, at + m.index + m[0].length);
          rects.push(...range.getClientRects());
        }
        const shown = shownRect(n.parentElement);
        const capBox = { left: cr.left, top: cr.top, right: cr.right, bottom: cr.bottom };
        // A word's rects as the engine reports them; WebKit rounds them to
        // whole CSS px in the sheet's own units and returns some 0 px wide
        // at a line's end (a word 20.68 units long read 0 wide, 0.2 units
        // past the caption; scratch probe wkcap), so degenerate rects are
        // left out and the harness passes a looser tolerance there.
        const ptol = prefixTolIn * pxPerIn;
        const pastP = (box, r) => box.left < r.left - ptol || box.right > r.right + ptol || box.top < r.top - ptol || box.bottom > r.bottom + ptol;
        const real = rects.filter((x) => x.width > 0 && x.height > 0);
        prefixShown = real.length > 0 && real.every((x) => !pastP(x, shown) && !pastP(x, capBox));
        if (!prefixShown) {
          const bad = real.find((x) => pastP(x, shown) || pastP(x, capBox));
          prefixWhy = bad
            ? { rect: [bad.left, bad.top, bad.right, bad.bottom].map(inches), shown: [shown.left, shown.top, shown.right, shown.bottom].map(inches), cap: [cr.left, cr.top, cr.right, cr.bottom].map(inches) }
            : { rects: 0 };
        }
        break;
      }
      caption = {
        text: capEl.textContent.trim().slice(0, 60),
        shown: !past(cr, shownRect(capEl)),
        cutInside: capEl.scrollHeight > capEl.clientHeight + 1,
        prefixShown,
        ...(prefixWhy ? { prefixWhy } : {}),
        hIn: inches(cr.height),
      };
    }
    return [{
      id: b.dataset.blockId,
      viewBox: svg.getAttribute('viewBox'),
      hostIn: { w: inches(host.width), h: inches(host.height) },
      frameIn: { w: inches(frame.width), h: inches(frame.height) },
      basePx: parseFloat(getComputedStyle(svg).fontSize),
      svgOverflow: getComputedStyle(svg).overflow,
      caption,
      tickOverlaps,
      tickOverlapsInked,
      collisions,
      texts,
    }];
  });
  bench.remove();
  return out;
}

/**
 * Press "⎙ Save PDF" with window.open stubbed (window.print never runs),
 * load the HTML it writes into a page of the same context, and measure the
 * charts there. Returns { charts, chrome } or throws: chrome counts the
 * editor's own marks the document still carries.
 */
export async function measurePrint(page, context, posterWIn, clipTolIn, { viaPreview = false, printMedia = true, prefixTolIn = clipTolIn } = {}) {
  await page.evaluate(() => {
    window.__zqPrint = null;
    window.open = () => {
      let html = '';
      return { document: { open() {}, write(s) { html += s; }, close() { window.__zqPrint = html; } }, focus() {}, print() {}, close() {}, addEventListener() {} };
    };
  });
  await page.locator('button[data-postr-tab]', { hasText: /^export$/i }).click();
  if (viaPreview) {
    // Export › Preview poster hides the editor (display: none) behind the
    // overlay; its Print button clones the hidden editor's sheet.
    await page.getByRole('button', { name: /Preview poster/ }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'Print / Save PDF' }).click();
  } else {
    await page.getByRole('button', { name: '⎙ Save PDF' }).click();
  }
  const html = await page.waitForFunction(() => window.__zqPrint, null, { timeout: 15000 }).then((x) => x.jsonValue());
  const pp = await context.newPage();
  try {
    await pp.setViewportSize({ width: 1600, height: 1200 });
    await pp.setContent(html, { waitUntil: 'load' });
    // Laid out as it prints: the document's @media print rules apply (the
    // sheet fixed at the page's corner, CSS zoom to the page size). The
    // review measured a side-captioned chart 1.6 % narrower under them
    // than on screen (Q-R7), which screen media never shows.
    if (printMedia) await pp.emulateMedia({ media: 'print' });
    await pp.evaluate(() => document.fonts.ready);
    await pp.waitForTimeout(300);
    const charts = await pp.evaluate(`(${measureChartsIn.toString()})('#poster-print-root', ${posterWIn}, ${JSON.stringify(SAMPLE_PREFIX)}, ${clipTolIn}, ${prefixTolIn})`);
    // Editor chrome the document carries: resize handles, the selection's
    // row and boxes, and a frame's coloured border (a selected frame's
    // accent, an out-of-bounds frame's red dashes; fix 13c review Q-R5).
    const chrome = await pp.evaluate(() => ({
      handles: document.querySelectorAll('[data-postr-resize-handle]').length,
      selectionUi: document.querySelectorAll('[data-postr-selection-ui]').length,
      accentFrames: [...document.querySelectorAll('[data-block-id]')].filter((el) => {
        const cs = getComputedStyle(el);
        return parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none' && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(cs.borderTopColor);
      }).length,
    }));
    return { charts, chrome };
  } finally {
    await pp.close();
  }
}
