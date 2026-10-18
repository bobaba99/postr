/**
 * Per-frame ruler recorder for ruler-check.mjs --frames (fix 04, cause C).
 *
 * A reading of the page taken in requestAnimationFrame is not what the
 * frame paints: in a frame's rendering update the browser runs, in order,
 * scroll events, rAF callbacks, style and layout, ResizeObserver callbacks
 * (looping while they change layout), then paint. Page script can change
 * the DOM after rAF only in a ResizeObserver callback, and the rulers put a
 * reading on the page in one. So every frame is sampled twice:
 *   raf  — in the frame's rAF callback (where the review's samplers read);
 *   late — in a ResizeObserver callback that runs after every observer
 *          delivered in the loop's first pass, in the same rendering update.
 *          An observer delivered in a later pass (a deeper element resized
 *          by a callback) runs after it. The claims use late.
 * A ruler's bar is the element around its marks that clips them (the marks
 * may sit in a layer of their own inside it).
 * Ported from the first step 10 review's late sampler (not kept in the repo). One
 * change: the late observer is created afresh in each
 * frame's rAF (G1 created it once at the start), so it is always the
 * page's newest observer and runs after an observer the page creates while
 * recording (callbacks run in creation order). The deep probe it observes
 * is kept: it is deeper than anything the page observes, so it does not
 * change the depth rule of the observer loop.
 *
 * Same rendering update: each frame's rAF posts a task (MessageChannel);
 * the late sample records whether it ran before that task (lateBeforeTask).
 * A late sample that ran after it is not from that frame's rendering update,
 * and the frame cannot be judged.
 *
 * selfTest(page) is the known-answer control: two observers move two
 * elements by 100 px in their callbacks, one created before the recording
 * starts and one created while it runs. On the frame they move, the raf
 * sample must see 0 and the late sample 100, and every late sample must be
 * from its frame's rendering update.
 *
 * The measure (in the page) reads layout only: the sheet's layout slot (the
 * parent of [data-postr-canvas-frame], untransformed), the sheet's size in
 * inches from its own style, and every ruler tick inside its bar, each tick's
 * inch taken from the ruler's labels and the ticks' order (as ruler-check's
 * at-rest measure does). err = tick − (slot edge + inch × slot width / W).
 * It also reads the longest stretch of each bar with no tick, between two
 * ticks or at either end of the bar (gapIn).
 *
 * Blind spots (the second step 10 review, MEASURED by its reviewer R1 on
 * synthetic rulers in jsdom):
 *   - the reference is the slot, the same box the rulers read (R1-F8). With
 *     the painted sheet 8 px off its slot, rulers placed on the slot read
 *     clean here (ruler-check at rest: OBSERVED, 8 px), and rulers placed
 *     on the painted sheet read STALE, 8 px. Today only the entrance
 *     animation moves the painted sheet off its slot; ruler-check's rest
 *     control after each event bounds it (slot and painted sheet within
 *     0.5 px);
 *   - paint is not read (R1-F9): a bar that ends short of the canvas (gaps
 *     are measured from the bar's own ends), a tick's line drawn away from
 *     its box, a bar at opacity 0 or covered, and a tick painted smeared
 *     over two device pixels (R3-F1) all read clean;
 *   - a missing interior mark makes the labels disagree, and the frame is
 *     unjudgeable (exit 2), not stale.
 */

export const RECORDER = `
(() => {
  if (window.__rcf) return;
  const F = { run: 0, frames: [], roErrors: [] };
  window.__rcf = F;
  window.addEventListener('error', (e) => { if (/ResizeObserver/.test(String(e.message))) F.roErrors.push(String(e.message).slice(0, 160)); });
  const round = (v) => Math.round(v * 100) / 100;
  // A chain of 80 fixed divs: the probe is deeper than anything the page observes.
  let host = document.body;
  for (let d = 0; d < 80; d += 1) { const c = document.createElement('div'); c.style.cssText = 'position:fixed;left:-40px;top:-40px;width:4px;height:4px;overflow:hidden;pointer-events:none;opacity:0;'; host.appendChild(c); host = c; }
  const probe = document.createElement('div');
  probe.style.cssText = 'width:1px;height:1px;';
  host.appendChild(probe);

  F.measure = () => {
    const outer = document.querySelector('[data-postr-canvas-outer]');
    const frame = document.querySelector('[data-postr-canvas-frame]');
    const sheet = document.getElementById('poster-canvas');
    if (!outer || !frame || !sheet) return { shown: false, missing: true };
    const o = outer.getBoundingClientRect();
    if (!(o.width > 0 && o.height > 0)) return { shown: false };
    const slot = frame.parentElement.getBoundingClientRect();
    const p = sheet.getBoundingClientRect();
    const W = parseFloat(sheet.style.width) / 10;
    const H = parseFloat(sheet.style.height) / 10;
    const perInch = slot.width / W;
    const workarea = frame.parentElement.parentElement;
    const cs = getComputedStyle(workarea);
    const w0 = workarea.getBoundingClientRect();
    const centring = { x: round(slot.left - (w0.left + parseFloat(cs.paddingLeft))), y: round(slot.top - (w0.top + parseFloat(cs.paddingTop))) };
    const labels = [...document.querySelectorAll('span')].filter((sp) => !outer.contains(sp) && /^-?\\d+"$/.test(sp.textContent.trim()));
    const axis = (vertical) => {
      const mine = labels.filter((sp) => (sp.style.writingMode === 'vertical-lr') === vertical);
      if (!mine.length) return { n: 0, noMarks: true };
      // The marks' own parent may be a layer inside the bar; the bar is the
      // nearest element around them that clips.
      const ticks = [...mine[0].parentElement.parentElement.children];
      let bar = mine[0].parentElement.parentElement;
      while (bar && getComputedStyle(bar).overflow !== 'hidden') bar = bar.parentElement;
      if (!bar) return { n: 0, disagree: 'no clipping ruler bar' };
      const bases = new Set(mine.map((sp) => Number(sp.textContent.trim().replace('"', '')) - ticks.indexOf(sp.parentElement)));
      if (bases.size !== 1) return { n: 0, disagree: [...bases].join(',') };
      const first = [...bases][0];
      const b = bar.getBoundingClientRect();
      const lo = vertical ? b.top : b.left;
      const hi = vertical ? b.bottom : b.right;
      const edge = vertical ? slot.top : slot.left;
      let n = 0; let min = Infinity; let max = -Infinity; let firstPos = null;
      const onBar = [];
      ticks.forEach((t, i) => {
        const r = t.getBoundingClientRect();
        const pos = vertical ? r.top : r.left;
        if (pos < lo || pos > hi) return;
        const err = pos - (edge + (first + i) * perInch);
        n += 1;
        if (err < min) min = err;
        if (err > max) max = err;
        if (firstPos === null) firstPos = pos;
        onBar.push(pos);
      });
      if (!n) return { n: 0, noMarks: true };
      // The longest stretch of bar with no tick: at either end, or between
      // two ticks, in inches (a partly blank ruler; the step 9-D review, D-02).
      onBar.sort((a, b) => a - b);
      let gap = Math.max(onBar[0] - lo, hi - onBar[onBar.length - 1]);
      for (let k = 1; k < onBar.length; k += 1) gap = Math.max(gap, onBar[k] - onBar[k - 1]);
      return { n, min: round(min), max: round(max), firstPos: round(firstPos), gapIn: round(gap / perInch) };
    };
    const top = axis(false);
    const left = axis(true);
    const m = {
      shown: true, dpr: window.devicePixelRatio, W, H, perInch: round(perInch),
      slot: { l: round(slot.left), t: round(slot.top), w: round(slot.width) },
      sheet: { l: round(p.left), t: round(p.top), w: round(p.width) },
      centring, cw: outer.clientWidth, sx: outer.scrollLeft, sy: outer.scrollTop, top, left,
    };
    m.sig = [m.slot.l, m.slot.t, m.slot.w, top.firstPos, top.n, left.firstPos, left.n, m.cw, m.sx, m.sy].join(',');
    return m;
  };

  F.start = (measure = F.measure, maxFrames = 600) => {
    const run = (F.run += 1);
    const frames = [];
    F.frames = frames;
    F.roErrorsAtStart = F.roErrors.length;
    const mc = new MessageChannel();
    mc.port1.onmessage = (e) => { const f = frames[e.data]; if (f && f.taskAt === undefined) f.taskAt = 1; };
    let w = 1;
    const tick = () => {
      if (F.run !== run) return;
      const cur = { i: frames.length, t: Math.round(performance.now() * 100) / 100, raf: measure('raf') };
      frames.push(cur);
      // A fresh observer each frame: the newest, so its callback runs after the page's.
      const ro = new ResizeObserver(() => {
        ro.disconnect();
        if (F.run !== run || cur.late !== undefined) return;
        cur.late = measure('late');
        cur.lateBeforeTask = cur.taskAt === undefined;
      });
      ro.observe(probe);
      w = w === 1 ? 2 : 1;
      probe.style.width = w + 'px';
      mc.port2.postMessage(cur.i);
      if (frames.length < maxFrames) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  F.stop = () => { F.run += 1; return F.frames; };
})();
`;

export async function installRecorder(page) {
  await page.evaluate(RECORDER);
}

/** Known-answer control for the late sample (see the header). */
export async function selfTest(page) {
  await installRecorder(page);
  return page.evaluate(() => new Promise((resolve) => {
    const mk = () => {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:0;top:0;width:10px;height:10px;opacity:0;pointer-events:none;';
      document.body.appendChild(d);
      return d;
    };
    const [x, y, x2, z] = [mk(), mk(), mk(), mk()];
    let armed = false;
    const early = new ResizeObserver(() => { if (armed) y.style.left = '100px'; });
    early.observe(x);
    let later = null;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.__rcf.start(() => [y.getBoundingClientRect().left, z.getBoundingClientRect().left], 10);
      setTimeout(() => {
        // Created while the recording runs, as a remounted component's observer would be.
        later = new ResizeObserver(() => { if (armed) z.style.left = '100px'; });
        later.observe(x2);
        requestAnimationFrame(() => { armed = true; x.style.width = '20px'; x2.style.width = '20px'; });
      }, 50);
      setTimeout(() => {
        const frames = window.__rcf.stop();
        early.disconnect();
        later?.disconnect();
        [x, y, x2, z].forEach((e) => e.remove());
        const early100 = frames.some((f) => f.raf[0] === 0 && f.late && f.late[0] === 100);
        const later100 = frames.some((f) => f.raf[1] === 0 && f.late && f.late[1] === 100);
        const sameUpdate = frames.length > 0 && frames.every((f) => f.late !== undefined && f.lateBeforeTask);
        resolve({ ok: early100 && later100 && sameUpdate, early100, later100, sameUpdate, frames: frames.map((f) => [f.raf, f.late, f.lateBeforeTask]) });
      }, 600);
    }));
  }));
}

/**
 * Known-answer control for the ResizeObserver-loop count (INFO): a loop the
 * control makes itself must be counted, then it is removed from the count.
 */
export async function roLoopControl(page) {
  await installRecorder(page);
  return page.evaluate(() => new Promise((resolve) => {
    const before = window.__rcf.roErrors.length;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:0;top:0;width:10px;height:10px;opacity:0;';
    document.body.appendChild(el);
    let n = 0;
    const ro = new ResizeObserver(() => { n += 1; if (n < 4) el.style.width = `${10 + n * 10}px`; });
    ro.observe(el);
    setTimeout(() => {
      ro.disconnect();
      el.remove();
      const caught = window.__rcf.roErrors.length > before;
      window.__rcf.roErrors.length = before;
      resolve({ caught });
    }, 300);
  }));
}

/** A reading taken now (no frame), with the recorder's measure. */
export async function measureNow(page) {
  await installRecorder(page);
  return page.evaluate(() => window.__rcf.measure('now'));
}

/** A stretch of bar longer than this, in inches, with no tick is a partly blank ruler (ticks come every inch). */
export const MAX_GAP_IN = 1.05;

/**
 * How far a tick may sit from its inch, in px, at device pixel ratio `dpr`:
 * half a device pixel (the rounding to whole device pixels moves a tick by up
 * to that) plus layout's 1/64 px unit. 0.516 px at a ratio of 1; the review
 * of the port (R1-F5) measured the rounding go past 0.516 px, legitimately,
 * at a ratio of 0.67, where half a device pixel is 0.746 px.
 */
export const tickLimit = (dpr = 1) => 0.5 / (dpr || 1) + 1 / 64;

/**
 * Judge one sample. `model` is what a mark's error must be at this frame:
 * 'sheet' — 0 (on the sheet's inch); 'h1h2' — the bar's 24 px inset less
 * the sheet's centring in the workarea (main's rest, the record's H1 + H2,
 * read from the same frame's layout). Stale: some tick more than half a
 * device pixel plus layout's 1/64 px unit from it (0.5 / ratio + 1/64 px:
 * 0.516 px at a ratio of 1, 0.57 at 0.9; the review of the port, R1-F5),
 * a ruler with no mark in its bar, or a stretch of a bar over
 * MAX_GAP_IN with no tick (a partly blank ruler; the step 9-D review,
 * D-02). Unjudgeable: the labels of a ruler disagree on its first inch.
 */
export function judge(m, model) {
  let off = 0;
  let noMarks = false;
  let gapIn = 0;
  for (const axis of ['top', 'left']) {
    const a = m[axis];
    if (a.disagree) return { unjudgeable: `labels disagree on the ${axis} ruler's first inch: ${a.disagree}` };
    if (a.noMarks) { noMarks = true; continue; }
    const ref = model === 'h1h2' ? 24 - m.centring[axis === 'top' ? 'x' : 'y'] : 0;
    off = Math.max(off, Math.abs(a.max - ref), Math.abs(a.min - ref));
    gapIn = Math.max(gapIn, a.gapIn ?? 0);
  }
  const gapped = gapIn > MAX_GAP_IN;
  // Half a device pixel plus layout's 1/64 px unit: ticks sit on whole
  // device pixels (the second step 10 review, R3-F1), and a device pixel is
  // 1 / ratio px (below a ratio of 1, more than a pixel; R1-F5).
  return { stale: noMarks || gapped || off > tickLimit(m.dpr), off: Math.round(off * 100) / 100, noMarks, gapped, gapIn };
}

/** The rest model that fits a reading taken at rest: 'sheet', else 'h1h2', else null. */
export function restModel(m) {
  if (!m?.shown) return null;
  for (const model of ['sheet', 'h1h2']) {
    const j = judge(m, model);
    if (!j.unjudgeable && !j.stale) return model;
  }
  return null;
}

/**
 * Record the frames of one event: start the recorder, run `act` (the
 * user's input), and keep recording until at least `minFrames` frames and
 * the last `quiet` frames are laid out and unchanged (the transition is
 * over), or `maxFrames`. Returns the frames and whether it settled.
 */
export async function recordEvent(page, act, { minFrames = 40, quiet = 8, maxFrames = 400 } = {}) {
  await installRecorder(page);
  await page.evaluate((max) => window.__rcf.start(undefined, max), maxFrames);
  const info = await act();
  const settled = await page.waitForFunction(([minF, q, maxF]) => {
    const f = window.__rcf.frames;
    if (f.length >= maxF) return true;
    if (f.length < minF + 1) return false;
    const last = f.slice(-q - 1, -1); // the newest frame may not have its late sample yet
    return last.length === q && last.every((x) => x.late && x.late.shown && x.late.sig === last[0].late.sig);
  }, [minFrames, quiet, maxFrames], { timeout: 20000, polling: 100 }).then(() => true, () => false);
  const { frames, roErrors } = await page.evaluate(() => {
    const fr = window.__rcf.stop();
    // Let the last frame's rendering update finish before reading it.
    return new Promise((r) => requestAnimationFrame(() => r({ frames: fr, roErrors: window.__rcf.roErrors.slice(window.__rcf.roErrorsAtStart) })));
  });
  const last = frames.slice(-quiet - 1, -1);
  const quietAtEnd = last.length === quiet && last.every((x) => x.late && x.late.shown && x.late.sig === last[0].late.sig);
  return { frames, info, settled: settled && quietAtEnd, roErrors };
}

/**
 * Per-event verdict. Every frame whose late sample shows the editor is
 * judged; a frame with no late sample from its own rendering update is
 * unjudgeable (and fails the instrument).
 */
export function judgeEvent(frames, model) {
  const out = { frames: frames.length, shown: 0, stale: 0, staleIdx: [], noMarks: 0, gapped: 0, worstGapIn: 0, worstPx: 0, rafStale: 0, unjudgeable: [] };
  for (const f of frames) {
    if (f.late === undefined || !f.lateBeforeTask) {
      out.unjudgeable.push(`frame ${f.i}: ${f.late === undefined ? 'no late sample' : 'late sample after its frame'}`);
      continue;
    }
    if (!f.late.shown) continue;
    out.shown += 1;
    const j = judge(f.late, model);
    if (j.unjudgeable) { out.unjudgeable.push(`frame ${f.i}: ${j.unjudgeable}`); continue; }
    if (j.stale) {
      out.stale += 1;
      out.staleIdx.push(f.i);
      if (j.noMarks) out.noMarks += 1;
      else out.worstPx = Math.max(out.worstPx, j.off);
      if (j.gapped) { out.gapped += 1; out.worstGapIn = Math.max(out.worstGapIn, j.gapIn); }
    }
    if (f.raf?.shown) {
      const r = judge(f.raf, model);
      if (r.stale) out.rafStale += 1;
    }
  }
  return out;
}
