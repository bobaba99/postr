/**
 * The workspace rulers' ticks as PAINTED, read from a screenshot at the
 * device's own pixels (scripts/ruler-paint-check.mjs). Ported from the
 * follow-up review of fix 04 (R2-paint's tools/judge.mjs; its known answers
 * are in that review's record). The DOM is read only to know where to look:
 * which device columns belong to which tick, which inch a tick is, where the
 * bars and the sheet are laid out, and the sheet's size in inches.
 *
 * Per tick of a ruler (all in device px):
 *   crisp    — no device column (top ruler) or row (left ruler) partly
 *              covered: every one is under 0.12 or over 0.88 of the tick's
 *              colour (white at 35 % over the bar's);
 *   smeared  — at least one partly covered: the tick's 1 px line spread
 *              over two device pixels;
 *   missing  — less than 0.4 device px of tick colour in its window;
 *   covered  — something drawn over the bar at the tick (the out-of-bounds
 *              banner, a tab), seen in the DOM or as bar pixels not of the
 *              bar's colour: not judged;
 *   edge     — its window runs past the bar's ends: not judged.
 * The painted sheet edge is the area-weighted step in brightness across it,
 * the median over 21 rows (left edge) or columns (top edge); it is not read
 * when the edge is off screen, the step is unclean, or it is more than 2
 * device px from the sheet's layout edge. Against it:
 *   off0     — the painted 0" tick's leading edge less the painted edge;
 *   err      — each judged tick's painted leading edge less its inch on the
 *              painted sheet (the edge + inch × the sheet's laid-out inch).
 */
import { decodePNG } from './png.mjs';

/** What the judge needs from the page, read in it (CSS px). */
export function collectDom(page) {
  return page.evaluate(() => {
    const dpr = window.devicePixelRatio;
    const sheetEl = document.getElementById('poster-canvas');
    const outer = document.querySelector('[data-postr-canvas-outer]');
    if (!sheetEl || !outer) return { error: 'no sheet or canvas' };
    const s = sheetEl.getBoundingClientRect();
    const wIn = parseFloat(sheetEl.style.width) / 10;
    const hIn = parseFloat(sheetEl.style.height) / 10;
    const o = outer.getBoundingClientRect();
    const view = {
      l: o.left + outer.clientLeft, t: o.top + outer.clientTop,
      r: o.left + outer.clientLeft + outer.clientWidth, b: o.top + outer.clientTop + outer.clientHeight,
    };
    const lines = [...document.querySelectorAll('div')].filter((d) => getComputedStyle(d).backgroundColor === 'rgba(255, 255, 255, 0.35)');
    // The out-of-bounds banner lies over the top ruler and takes no pointer events.
    const banners = [...document.querySelectorAll('div')].filter((d) => /outside poster bounds/.test(d.textContent ?? '') && d.children.length <= 3 && d.getBoundingClientRect().height < 80);
    const ruler = (vertical) => {
      const mine = lines.filter((d) => (vertical ? d.style.height === '1px' : d.style.width === '1px'));
      if (!mine.length) return null;
      const layer = mine[0].parentElement.parentElement;
      // The bar: the nearest ancestor that clips (main's marks sit in the
      // bar itself, with no layer of their own).
      let bar = mine[0].parentElement;
      while (bar && getComputedStyle(bar).overflow !== 'hidden') bar = bar.parentElement;
      if (!bar) return null;
      const br = bar.getBoundingClientRect();
      const perInch = vertical ? s.height / hIn : s.width / wIn;
      let maxDev = 0;
      const ticks = mine.map((d) => {
        const r = d.getBoundingClientRect();
        const off = parseFloat(vertical ? d.parentElement.style.top : d.parentElement.style.left);
        const inch = Math.round(off / perInch);
        maxDev = Math.max(maxDev, Math.abs(off / perInch - inch));
        // Something drawn over the ruler at the tick: the topmost hit is not
        // in the canvas the bars lie over (the bars take no pointer events).
        const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
        const hit = document.elementFromPoint(cx, cy);
        const under = (el) => { const b = el.getBoundingClientRect(); return cx >= b.left - 4 && cx <= b.right + 4 && cy >= b.top - 4 && cy <= b.bottom + 4; };
        const domCovered = !hit || !(outer.contains(hit) || outer === hit) || banners.some(under);
        return { inch, l: r.left, t: r.top, w: r.width, h: r.height, domCovered };
      });
      const side = vertical ? 'top' : 'left';
      return {
        bar: { l: br.left, t: br.top, r: br.right, b: br.bottom },
        placement: layer === bar ? '(no layer)' : `${side} ${layer.style[side] || '(none)'}${layer.style.transform ? ` ${layer.style.transform}` : ''}`,
        perInch, inchDev: Math.round(maxDev * 1000) / 1000, ticks,
      };
    };
    return {
      dpr, inner: [innerWidth, innerHeight], sheet: { l: s.left, t: s.top, r: s.right, b: s.bottom, wIn, hIn }, view,
      scroll: { x: outer.scrollLeft, y: outer.scrollTop }, top: ruler(false), left: ruler(true),
    };
  });
}

const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : NaN; };
export const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v);

/**
 * The painted sheet edge along one axis, in device px, or null. vertical
 * false: the left edge (x), sampled on rows; true: the top edge (y), on columns.
 */
function sheetEdge(img, dom, vertical) {
  const d = dom.dpr;
  const { sheet: s, view } = dom;
  const top = dom.top?.bar; const left = dom.left?.bar;
  const visL = Math.max(view.l, left ? left.r : view.l); const visT = Math.max(view.t, top ? top.b : view.t);
  const edgeCss = vertical ? s.t : s.l;
  const lo = vertical ? visT : visL; const hi = vertical ? view.b : view.r;
  if (edgeCss * d - 8 < lo * d || edgeCss * d + 8 > hi * d) return null;
  const a0 = vertical ? Math.max(s.l, visL) : Math.max(s.t, visT);
  const a1 = vertical ? Math.min(s.r, view.r) : Math.min(s.b, view.b);
  if (a1 - a0 < 20) return null;
  const e = Math.round(edgeCss * d);
  const v = (along, across) => (vertical ? img.lum(along, across) : img.lum(across, along));
  const est = [];
  for (let k = 0; k < 21; k += 1) {
    const along = Math.floor((a0 + 8 + (k / 20) * (a1 - a0 - 16)) * d);
    const out = median([v(along, e - 6), v(along, e - 5), v(along, e - 4)]);
    const inn = median([v(along, e + 3), v(along, e + 4), v(along, e + 5)]);
    // A dark workspace outside, the sheet inside, and nothing else between.
    if (inn - out < 50 || out > 60) continue;
    let sum = 0;
    for (let c = e - 3; c <= e + 2; c += 1) sum += Math.min(1, Math.max(0, (v(along, c) - out) / (inn - out)));
    est.push(e + 3 - sum);
  }
  if (est.length < 5) return null;
  const p = median(est);
  if (Math.abs(p - edgeCss * d) > 2) return null;
  return { p, spread: Math.max(...est) - Math.min(...est), layout: edgeCss * d };
}

/** Judge one ruler's painted ticks against the painted sheet edge (or null). */
function judgeRuler(img, dom, vertical, edge) {
  const d = dom.dpr;
  const R = vertical ? dom.left : dom.top;
  if (!R) return { noMarks: true };
  const bar = R.bar;
  // Lines across the ticks, inside every minor tick's extent.
  const minor = R.ticks.filter((t) => (vertical ? t.w : t.h) < 10);
  const pool = minor.length ? minor : R.ticks;
  const acrossLo = Math.max(...pool.map((t) => (vertical ? t.l : t.t)));
  const acrossHi = Math.min(...pool.map((t) => (vertical ? t.l + t.w : t.t + t.h)));
  let s0 = Math.ceil(acrossLo * d) + 1; let s1 = Math.floor(acrossHi * d) - 2;
  if (s1 < s0) { s0 = Math.floor(((acrossLo + acrossHi) / 2) * d); s1 = s0; }
  const span0 = Math.ceil((vertical ? bar.t : bar.l) * d) + 1;
  const span1 = Math.floor((vertical ? bar.b : bar.r) * d) - 2;
  const px = (along, across) => (vertical ? img.lum(across, along) : img.lum(along, across));
  const rgb = (along, across) => (vertical ? img.rgb(across, along) : img.rgb(along, across));
  // The bar's background: a low percentile of the values along the line.
  const vals = [];
  for (let a = span0; a <= span1; a += 1) vals.push(px(a, s0));
  vals.sort((x, y) => x - y);
  const bg = vals[Math.floor(vals.length * 0.1)];
  const full = bg + 0.35 * (255 - bg);
  const chans = [[], [], []];
  for (let a = span0; a <= span1; a += 1) rgb(a, s0).forEach((ch, k) => chans[k].push(ch));
  const bgRgb = chans.map((c) => { c.sort((x, y) => x - y); return c[Math.floor(c.length * 0.1)]; });
  const cov = (a) => {
    const vs = [];
    for (let s = s0; s <= s1; s += 1) vs.push(px(a, s));
    return (median(vs) - bg) / (full - bg);
  };
  const ticks = R.ticks.map((t) => ({ ...t, c: (vertical ? t.t + t.h / 2 : t.l + t.w / 2) * d, lead: (vertical ? t.t : t.l) * d }))
    .sort((a, b) => a.c - b.c);
  const res = { n: 0, crisp: 0, smeared: 0, missing: 0, covered: 0, edge: 0, off0: null, errs: [], smearedInches: [], peak: [] };
  ticks.forEach((t, i) => {
    const w0 = Math.max(i ? (ticks[i - 1].c + t.c) / 2 : -Infinity, t.c - 3 * d - 1);
    const w1 = Math.min(i < ticks.length - 1 ? (ticks[i + 1].c + t.c) / 2 : Infinity, t.c + 3 * d + 1);
    const a0 = Math.ceil(w0 - 0.5); const a1 = Math.floor(w1 - 0.5);
    if (a0 < span0 || a1 > span1) { res.edge += 1; return; }
    if (t.domCovered) { res.covered += 1; return; }
    const cs = [];
    for (let a = a0; a <= a1; a += 1) cs.push([a, cov(a)]);
    // Covered: no bare bar around the tick, or bar pixels not of its colour.
    const bgCols = cs.filter(([, c]) => Math.abs(c) < 0.06);
    if (bgCols.length < 2 || bgCols.some(([a]) => rgb(a, s0).some((ch, k) => Math.abs(ch - bgRgb[k]) > 4))) { res.covered += 1; return; }
    const W = cs.reduce((acc, [, c]) => acc + Math.max(0, c), 0);
    if (W < 0.4) { res.missing += 1; return; }
    res.n += 1;
    if (cs.some(([, c]) => c > 0.12 && c < 0.88)) {
      res.smeared += 1;
      if (res.smearedInches.length < 6) res.smearedInches.push(t.inch);
    } else res.crisp += 1;
    res.peak.push(Math.max(...cs.map(([, c]) => c)));
    if (!edge) return;
    const centroid = cs.reduce((acc, [a, c]) => acc + (a + 0.5) * Math.max(0, c), 0) / W;
    const leadEdge = centroid - W / 2;
    res.errs.push(leadEdge - (edge.p + t.inch * R.perInch * d));
    if (t.inch === 0) res.off0 = r3(leadEdge - edge.p);
  });
  const worst = res.errs.length ? res.errs.reduce((w, e) => (Math.abs(e) > Math.abs(w) ? e : w), 0) : null;
  return {
    n: res.n, crisp: res.crisp, smeared: res.smeared, missing: res.missing, covered: res.covered, edge: res.edge,
    smearedInches: res.smearedInches, off0: res.off0, worstTick: worst === null ? null : r3(worst), ticksAgainstEdge: res.errs.length,
    peakCov: r3(median(res.peak)), bg: r3(bg), placement: R.placement, inchDev: R.inchDev,
    barFrac: r3((((vertical ? bar.t : bar.l) * d) % 1 + 1) % 1),
    sheetEdge: edge ? { p: r3(edge.p), spread: r3(edge.spread), layout: r3(edge.layout) } : null,
  };
}

/**
 * Judge both rulers in `png` (a screenshot at the device's pixels) against
 * `dom` (collectDom, read just before). The screenshot must be the window's
 * size at its ratio.
 */
export function judgeShot(png, dom) {
  const img = decodePNG(png);
  const want = [Math.round(dom.inner[0] * dom.dpr), Math.round(dom.inner[1] * dom.dpr)];
  if (Math.abs(img.w - want[0]) > 1 || Math.abs(img.h - want[1]) > 1) {
    return { error: `screenshot ${img.w}x${img.h}, not the window's ${want.join('x')} device px` };
  }
  return { top: judgeRuler(img, dom, false, sheetEdge(img, dom, false)), left: judgeRuler(img, dom, true, sheetEdge(img, dom, true)) };
}
