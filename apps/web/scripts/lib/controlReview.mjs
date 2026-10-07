/**
 * Scenarios of scripts/control-size-check.mjs that came from fix 19's review
 * round 1 (record 19, section 9): each folds in a reviewer's probe that found
 * a defect (docs/fixes/README.md, "Harnesses to reuse"). Split out to keep the
 * harness under 800 lines; it runs them (reviewScenarios) and folds their
 * verdicts into its own (reviewVerdicts).
 *
 * CLAIMS (OBSERVED when the defect is present)
 *   Or        a rotated block's own grabbable control (a resize handle, a
 *             button of its handle row, its rotate control) is not the element
 *             on top at its own centre, and another of the same block's
 *             controls is: turned 0 and 180 degrees, where the upright handle
 *             row runs along the edge it sits by, at the 1280 x 800 fit, 100%
 *             and 200%. The block is an 8 x 6 in image stretched to fill (8
 *             handles) on the 48 x 36 in poster, opened turned (a saved
 *             poster) and selected by a click. Centres off the visible canvas
 *             are not read.
 *   Or-tilt   INFORMATION: the same at 10, 170, -170, 90, 135, -135 and -90
 *             degrees, where the upright row lies across the tilted edge and
 *             its ends can reach a handle whatever it turns about (main: one or
 *             two handles at each of these turns and zooms).
 *   Pl-rot    on a turned block (every turn above, every zoom), the handle
 *             row's centre is not 26 px (ROW_LIFT + HIT / 2) out from the
 *             midpoint of the block's top edge along the block's own upward
 *             axis, or the rotate control's (below) 26 px out from its bottom
 *             edge's: within 1 px. Written from fix 19's own geometry
 *             (selectionLayout.ts), as claim Pl is; Or says whether the place
 *             is right.
 *   Or-click  a click (no drag) at the centre of a resize handle's square
 *             deletes the block, or moves or resizes it by more than 0.5 sheet
 *             units: the image turned half a turn the way a user turns it (its
 *             rotate control dragged round the block to the 180 degree snap),
 *             at 100%, each handle clicked in turn.
 *   St        a control's fixed size on screen moves while it settles: in an
 *             animation frame after a zoom change (the frame's zoom is the new
 *             one), the size differs from the one it settles at by more than
 *             0.5 px. Every frame read in the 600 ms from just before a Zoom in
 *             click, a Zoom out click and pinches x1.5 and x0.5 (Ctrl + wheel
 *             over the parked pointer), with the title, the image in crop mode
 *             and the table selected. The sizes
 *             are claim S's (handles and buttons both ways, a strip or grip
 *             across, the row's height); a hovered control is not read (the
 *             stylesheet's hover lift scales it on purpose), and the pointer
 *             is parked on the workspace, clear of the selection.
 *   Nb        INFORMATION: with a block selected, the other blocks whose centre
 *             lies under the selected block's controls (a click there reaches
 *             the control, not the block), and what is on top there: at the
 *             floor, a pinch to 0.35 and the fit, the template's image, the
 *             title and the table selected in turn.
 * CONTROLS (a failure is exit 2)
 *   K-rot     each block renders the turn it was opened with, and the drag
 *             reached the 180 degree snap
 *   K-settle  each action changed the zoom, and at least 20 frames were read
 *             at the new zoom
 *   K-nb      the floor was reached and the subject stayed selected
 *   Fd, Fh, Ns, K-fd  review finding F3, a click meant for another block that
 *             reaches the selection's controls: lib/neighbourClicks.mjs
 * BLIND SPOTS: one block size and one poster; the hit test samples each
 *   control's centre only; St reads layout boxes, not paint (an animated
 *   colour or shadow is not read); Nb clicks nothing.
 */
import { openEditor } from './editorHarness.mjs';
import { neighbourClickScenarios, neighbourClickVerdicts } from './neighbourClicks.mjs';
import { centreSelection, clickOwnPoint, pinchTo, round, stepUntilStable, zoomNow } from './selectionControls.mjs';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4AWP4z8DwHwyBAMQgYGBgAAB1SQX7nHNiaQAAAABJRU5ErkJggg==';
const VIEW = { width: 1280, height: 800 };
const POSTER = { w: 48, h: 36 };
/** The turns whose upright row runs along its edge (Or), and the tilted ones (Or-tilt). */
const ALONG = [0, 180];
const TILT = [10, 170, -170, 90, 135, -135, -90];
/** Where fix 19 puts the centres of the handle row and the rotate control: this far out from the block's edge (px). */
const CENTRE_OUT = 14 + 24 / 2;
const ONE_SIZE_PX = 0.5;

/** The 8 × 6 in image stretched to fill, turned by `rotation` degrees. */
const turnedImage = (rotation) => (doc) => ({
  ...doc,
  blocks: [...doc.blocks, {
    id: 'zqrot', type: 'image', x: 200, y: 160, w: 80, h: 60, content: '', imageSrc: PNG, imageFit: 'fill', tableData: null, rotation,
  }],
});

/**
 * The rotated block's own grabbable controls: what is on top at each one's
 * centre; and where the handle row's and the rotate control's centres are
 * against where fix 19 puts them (claim Pl-rot).
 */
const ownControls = (page, { rotation, out }) => page.evaluate(({ rotation, out }) => {
  const blk = document.querySelector('#poster-canvas [data-block-id="zqrot"]');
  if (!blk) return null;
  const outer = document.querySelector('[data-postr-canvas-outer]');
  const ob = outer.getBoundingClientRect();
  const vis = { x: ob.left + outer.clientLeft, y: ob.top + outer.clientTop, w: outer.clientWidth, h: outer.clientHeight };
  const name = (el) => {
    const hd = el.closest('[data-postr-resize-handle]');
    if (hd) return `handle ${hd.getAttribute('data-postr-resize-handle') || '?'}`;
    const t = el.closest('[title]');
    if (t && t.closest('[data-postr-selection-ui]')) return (t.getAttribute('title') || '').split(' (')[0].split(' —')[0];
    if (el.closest('[data-postr-selection-ui]')) return 'handle row';
    const b = el.closest('[data-block-id]');
    return b ? `block:${b.dataset.blockType}` : el.tagName.toLowerCase();
  };
  // Main draws the rotate button itself as a child of the block.
  const els = [
    ...blk.querySelectorAll(':scope > [data-postr-resize-handle]'),
    ...blk.querySelectorAll(':scope > [data-postr-selection-ui] button, :scope > button[data-postr-selection-ui]'),
  ];
  const controls = els.map((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const inVis = cx >= vis.x && cx <= vis.x + vis.w && cy >= vis.y && cy <= vis.y + vis.h;
    const top = document.elementFromPoint(cx, cy);
    const hitOk = !!top && (top === el || el.contains(top));
    const ctl = !hitOk && top && top.closest('[data-postr-resize-handle], [data-postr-selection-ui]');
    return { name: name(el), inVis, hitOk, byOwn: !!ctl && blk.contains(ctl), onTop: hitOk || !top ? null : name(top) };
  });
  // The block turns about its centre; its padding box (the handles' box)
  // is clientHeight sheet units tall. Out along its own up axis, turned by
  // `rotation` clockwise on screen: (sin t, -cos t).
  const sheet = document.getElementById('poster-canvas');
  const zoom = sheet.getBoundingClientRect().width / Number(sheet.style.width.replace('px', ''));
  const b = blk.getBoundingClientRect();
  const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const t = (rotation * Math.PI) / 180;
  const d = (blk.clientHeight * zoom) / 2 + out;
  const centreOf = (el) => { const q = el.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; };
  const place = [];
  const near = (what, got, want) => {
    const off = Math.hypot(got.x - want.x, got.y - want.y);
    if (off > 1) place.push(`${what} ${Math.round(off * 10) / 10} px off`);
  };
  const move = blk.querySelector(':scope > [data-postr-selection-ui] > button[title^="Drag to move"]');
  if (move) near('handle row centre', centreOf(move.parentElement), { x: c.x + d * Math.sin(t), y: c.y - d * Math.cos(t) });
  const rot = blk.querySelector(':scope > [data-postr-selection-ui] > button[title^="Drag to rotate"]');
  if (rot && !rot.parentElement.querySelector(':scope > button[title^="Drag to move"]')) {
    near('rotate control centre', centreOf(rot.parentElement), { x: c.x - d * Math.sin(t), y: c.y + d * Math.cos(t) });
  }
  return { transform: blk.style.transform, controls, place };
}, { rotation, out });

/** Claims Or, Or-tilt and Pl-rot: one turn, at the fit, 100% and 200%. */
function turnedScenario(rotation) {
  return {
    id: `rotated-${rotation < 0 ? 'm' : ''}${Math.abs(rotation)}-1280x800-48x36`,
    async run(h) {
      const { context, page, state } = await openEditor(h, { viewport: VIEW, poster: POSTER, editDoc: turnedImage(rotation) });
      try {
        await page.getByRole('button', { name: 'Fit poster to screen' }).click();
        await page.waitForTimeout(350);
        await clickOwnPoint(page, '[data-block-id="zqrot"]');
        const steps = [];
        for (const z of ['fit', '100', '200']) {
          if (z === '100') await pinchTo(page, 1);
          if (z === '200') await pinchTo(page, 2);
          await centreSelection(page);
          const read = await ownControls(page, { rotation, out: CENTRE_OUT });
          if (!read) throw new Error('precondition: the turned image is on the sheet');
          const seen = read.controls.filter((c) => c.inVis);
          steps.push({
            z, zoom: round(await zoomNow(page), 4), transform: read.transform, controls: seen.length,
            byOwn: seen.filter((c) => c.byOwn).map((c) => `${c.name} under ${c.onTop}`),
            byOther: seen.filter((c) => !c.hitOk && !c.byOwn).map((c) => `${c.name} under ${c.onTop}`),
            place: read.place,
          });
        }
        if (state.errors.length) throw new Error(`page errors: ${state.errors.join(' | ').slice(0, 200)}`);
        const flags = [];
        if (steps.some((s) => s.byOwn.length)) flags.push(ALONG.includes(rotation) ? 'Or' : 'Or-tilt');
        if (steps.some((s) => s.place.length)) flags.push('Pl-rot');
        const line = `[${flags.length ? `OBSERVED ${flags.join(',')}` : 'not observed'}] rotated ${rotation}° ${steps.map((s) => `${s.z}@${s.zoom}: ${s.byOwn.length} of ${s.controls} covered by its own${s.byOwn.length ? ` (${s.byOwn.join('; ')})` : ''}${s.place.length ? `, ${s.place.join(', ')}` : ''}`).join(' · ')}`;
        return { turned: { rotation, along: ALONG.includes(rotation), steps }, line };
      } finally {
        await context.close();
      }
    },
  };
}

/** The stored geometry of the turned image, as the editor renders it (sheet units). */
const turnedGeometry = (page) => page.evaluate(() => {
  const el = document.querySelector('#poster-canvas [data-block-id="zqrot"]');
  if (!el) return null;
  const n = (v) => Number(String(v).replace('px', ''));
  return { x: n(el.style.left), y: n(el.style.top), w: n(el.style.width), h: n(el.style.height), transform: el.style.transform };
});

/** Claim Or-click: turned half a turn by its rotate control, then each handle's square clicked at 100%. */
const clickScenario = {
  id: 'rotated-click-1280x800-48x36',
  async run(h) {
    const { context, page, state } = await openEditor(h, { viewport: VIEW, poster: POSTER, editDoc: turnedImage(0) });
    try {
      await page.getByRole('button', { name: 'Fit poster to screen' }).click();
      await page.waitForTimeout(350);
      await clickOwnPoint(page, '[data-block-id="zqrot"]');
      // Drag the rotate control half a turn round the block's centre, as a user does.
      const at = await page.evaluate(() => {
        const blk = document.querySelector('#poster-canvas [data-block-id="zqrot"]');
        const b = blk.getBoundingClientRect();
        const r = blk.querySelector('button[title^="Drag to rotate"]').getBoundingClientRect();
        return { cx: b.x + b.width / 2, cy: b.y + b.height / 2, rx: r.x + r.width / 2, ry: r.y + r.height / 2 };
      });
      const radius = Math.hypot(at.rx - at.cx, at.ry - at.cy);
      const a0 = Math.atan2(at.ry - at.cy, at.rx - at.cx);
      await page.mouse.move(at.rx, at.ry);
      await page.mouse.down();
      for (let i = 1; i <= 24; i++) {
        const a = a0 + (Math.PI * i) / 24;
        await page.mouse.move(at.cx + radius * Math.cos(a), at.cy + radius * Math.sin(a));
      }
      await page.mouse.up();
      await page.waitForTimeout(300);
      const turned = await turnedGeometry(page);
      await pinchTo(page, 1);
      await centreSelection(page);
      const clicks = [];
      for (const dir of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
        const before = await turnedGeometry(page);
        if (!before) break;
        const t = await page.evaluate((dir) => {
          // A handle that names its direction (fix 19), or main's fixed order of eight.
          const hs = [...document.querySelectorAll('#poster-canvas [data-block-id="zqrot"] > [data-postr-resize-handle]')];
          const unnamed = hs.length === 8 && hs.every((e) => !e.getAttribute('data-postr-resize-handle'));
          const hd = unnamed ? hs[['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].indexOf(dir)] : hs.find((e) => e.getAttribute('data-postr-resize-handle') === dir);
          if (!hd) return null;
          const m = (hd.firstElementChild || hd).getBoundingClientRect();
          const x = m.x + m.width / 2;
          const y = m.y + m.height / 2;
          const top = document.elementFromPoint(x, y);
          const titled = top && top.closest('[title]');
          return { x, y, onTop: top && hd.contains(top) ? 'itself' : titled ? titled.getAttribute('title').split(' (')[0] : top ? top.tagName.toLowerCase() : 'nothing' };
        }, dir);
        if (!t) continue;
        await page.mouse.click(t.x, t.y);
        await page.waitForTimeout(300);
        const after = await turnedGeometry(page);
        const moved = after ? Math.max(...['x', 'y', 'w', 'h'].map((k) => Math.abs(after[k] - before[k]))) : null;
        const verdict = !after ? 'the block was deleted' : moved > 0.5 ? `the block moved or resized by ${round(moved)} units` : null;
        clicks.push({ dir, onTop: t.onTop, verdict });
        if (!after) break;
      }
      if (state.errors.length) throw new Error(`page errors: ${state.errors.join(' | ').slice(0, 200)}`);
      const bad = clicks.filter((c) => c.verdict);
      const line = `[${bad.length ? 'OBSERVED Or-click' : 'not observed'}] ${this.id} ${turned?.transform} at ${round(await zoomNow(page), 3)}: ${clicks.map((c) => `${c.dir} (on top: ${c.onTop})${c.verdict ? ` → ${c.verdict}` : ''}`).join(' · ')}`;
      return { rotClick: { transform: turned?.transform ?? null, clicks }, line };
    } finally {
      await context.close();
    }
  },
};

/** Start reading every selection control's fixed sizes each animation frame for `ms`. */
const startFrames = (page, ms) => page.evaluate((ms) => {
  const collect = () => {
    const out = [];
    for (const blk of document.querySelectorAll('#poster-canvas > [data-block-id][data-postr-selected="true"]')) {
      blk.querySelectorAll(':scope > [data-postr-resize-handle]').forEach((e) => out.push([`handle-${e.getAttribute('data-postr-resize-handle')}`, e, 'wh']));
      blk.querySelectorAll('[data-postr-selection-ui] button').forEach((e) => out.push([`button:${e.getAttribute('title') || '?'}`, e, 'wh']));
      const row = blk.querySelector('[data-postr-selection-ui] > button[title^="Drag to move"]');
      if (row) out.push(['handle row', row.parentElement, 'h']);
      blk.querySelectorAll('[role="button"][aria-label^="crop "]').forEach((e) => out.push([e.getAttribute('aria-label'), e, 'wh']));
      blk.querySelectorAll('[aria-label^="Select row"]').forEach((e, i) => out.push([`row strip ${i}`, e, 'w']));
      blk.querySelectorAll('[aria-label^="Select column"]').forEach((e, i) => out.push([`column strip ${i}`, e, 'h']));
      blk.querySelectorAll('[title="Drag to resize column"]').forEach((e, i) => out.push([`column grip ${i}`, e, 'w']));
    }
    return out;
  };
  const sheet = document.getElementById('poster-canvas');
  const frames = [];
  window.__postrFrames = frames;
  const t0 = performance.now();
  const loop = () => {
    const t = performance.now() - t0;
    const sizes = {};
    for (const [key, el, dims] of collect()) {
      if (el.matches(':hover')) continue;
      const r = el.getBoundingClientRect();
      sizes[key] = [...dims].map((d) => (d === 'w' ? r.width : r.height));
    }
    frames.push({ t: Math.round(t), zoom: sheet.getBoundingClientRect().width / Number(sheet.style.width.replace('px', '')), sizes });
    if (t < ms) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}, ms);

/** Claim St: the controls' sizes in each frame after a zoom change. */
function settleScenario(name, subject) {
  return {
    id: `settle-1280x800-48x36-${name}`,
    async run(h) {
      const { context, page, state } = await openEditor(h, { viewport: VIEW, poster: POSTER, editDoc: subject.edit });
      try {
        await page.getByRole('button', { name: 'Fit poster to screen' }).click();
        await page.waitForTimeout(350);
        await subject.select(page);
        // Park the pointer on the workspace, 20 px inside the canvas's
        // top-left corner, as record 19 measured it. (After the merge of main
        // into fix 12 it sat at the left edge's half height for a while:
        // fix 12's Undo / Redo buttons were drawn over that corner and took
        // the pinch, K-settle; they are in the editor's top bar since.)
        const o = await page.locator('[data-postr-canvas-outer]').boundingBox();
        const park = { x: o.x + 20, y: o.y + 20 };
        // Precondition: the park is the workspace itself, so a Ctrl + wheel
        // there reaches the canvas's pinch handler (chrome drawn over the
        // canvas would take it).
        const parkedOn = await page.evaluate(({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          if (el && el.closest('[data-postr-canvas-outer]') && !el.closest('#poster-canvas')) return 'workspace';
          const named = el && el.closest('[aria-label], [title]');
          return named ? (named.getAttribute('aria-label') || named.getAttribute('title')) : el ? el.tagName.toLowerCase() : 'nothing';
        }, park);
        if (parkedOn !== 'workspace') throw new Error(`precondition: the parked pointer (${Math.round(park.x)}, ${Math.round(park.y)}) is on "${parkedOn}", not the workspace`);
        const zb = async (label) => {
          const b = await page.getByRole('button', { name: label }).boundingBox();
          await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
        };
        const pinch = async (f) => {
          await page.mouse.move(park.x, park.y);
          await page.keyboard.down('Control');
          await page.mouse.wheel(0, -240 * Math.log(f));
          await page.keyboard.up('Control');
        };
        const actions = [['Zoom in', () => zb('Zoom in')], ['Zoom out', () => zb('Zoom out')], ['pinch x1.5', () => pinch(1.5)], ['pinch x0.5', () => pinch(0.5)]];
        const rows = [];
        for (const [label, act] of actions) {
          await page.mouse.move(park.x, park.y);
          await page.waitForTimeout(300);
          const z0 = await zoomNow(page);
          await startFrames(page, 600);
          await act();
          await page.waitForTimeout(800);
          const frames = await page.evaluate(() => window.__postrFrames);
          const z1 = await zoomNow(page);
          const last = frames[frames.length - 1];
          const after = frames.filter((f) => Math.abs(f.zoom - z1) < 1e-6);
          const off = [];
          for (const f of after) {
            for (const [key, v] of Object.entries(f.sizes)) {
              const end = last.sizes[key];
              if (!end) continue;
              const d = Math.max(...v.map((x, i) => Math.abs(x - end[i])));
              if (d > ONE_SIZE_PX) off.push({ key, t: f.t, got: v.map((x) => round(x)), end: end.map((x) => round(x)), d });
            }
          }
          const worst = {};
          for (const x of off) if (!worst[x.key] || x.d > worst[x.key].d) worst[x.key] = x;
          rows.push({
            label, z0: round(z0, 4), z1: round(z1, 4), frames: after.length, offFrames: off.length,
            worst: Object.values(worst).map((x) => `${x.key} ${x.got.join('×')} px at ${x.t} ms (settles at ${x.end.join('×')})`),
          });
        }
        if (state.errors.length) throw new Error(`page errors: ${state.errors.join(' | ').slice(0, 200)}`);
        const bad = rows.filter((r) => r.offFrames);
        const line = `[${bad.length ? 'OBSERVED St' : 'not observed'}] ${this.id} ${rows.map((r) => `${r.label} ${r.z0}→${r.z1}: ${r.offFrames} off in ${r.frames} frames${r.worst.length ? ` (${r.worst.slice(0, 3).join('; ')})` : ''}`).join(' · ')}`;
        return { settle: rows, line };
      } finally {
        await context.close();
      }
    },
  };
}

/** The other blocks whose centre is under the selection's controls, and what is on top there. */
const neighbourHits = (page) => page.evaluate(() => {
  const sheet = document.getElementById('poster-canvas');
  const others = [...sheet.querySelectorAll(':scope > [data-block-id]:not([data-postr-selected="true"])')];
  const ctl = (el) => {
    const sel = el.closest('[data-postr-selected="true"]');
    const c = el.closest('[data-postr-resize-handle], [data-postr-selection-ui], [aria-label^="Select row"], [aria-label^="Select column"], [title="Drag to resize column"]');
    return c && sel && sel.contains(c) ? c : null;
  };
  const label = (el) => {
    if (el.closest('[data-postr-resize-handle]')) return 'a resize handle';
    const t = el.closest('[title], [aria-label]');
    if (t && ctl(t)) return (t.getAttribute('title') || t.getAttribute('aria-label')).split(' (')[0].split(' —')[0];
    return 'the handle row';
  };
  const under = [];
  let elsewhere = 0;
  for (const b of others) {
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    if (top && ctl(top)) under.push(`${b.dataset.blockType} under ${label(top)}`);
    else if (!top || !b.contains(top)) elsewhere += 1;
  }
  return { others: others.length, under, elsewhere, selected: sheet.querySelectorAll(':scope > [data-postr-selected="true"]').length };
});

/** Claim Nb: one subject selected, at the floor, a pinch to 0.35 and the fit. */
function neighbourScenario(name, select) {
  return {
    id: `neighbours-1280x800-48x36-${name}`,
    async run(h) {
      // The template's image with a picture (an empty one opens the file picker on click).
      const edit = (doc) => ({ ...doc, blocks: doc.blocks.map((b) => (b.type === 'image' ? { ...b, imageSrc: PNG } : b)) });
      const { context, page, state } = await openEditor(h, { viewport: VIEW, poster: POSTER, editDoc: edit });
      try {
        await page.getByRole('button', { name: 'Fit poster to screen' }).click();
        await page.waitForTimeout(350);
        await select(page);
        const steps = [];
        const floor = (await stepUntilStable(page, 'Zoom out', 60)).zoom;
        steps.push({ z: 'floor', zoom: round(floor, 4), ...(await neighbourHits(page)) });
        await pinchTo(page, 0.35);
        steps.push({ z: '0.35', zoom: round(await zoomNow(page), 4), ...(await neighbourHits(page)) });
        await page.getByRole('button', { name: 'Fit poster to screen' }).click();
        await page.waitForTimeout(350);
        steps.push({ z: 'fit', zoom: round(await zoomNow(page), 4), ...(await neighbourHits(page)) });
        if (state.errors.length) throw new Error(`page errors: ${state.errors.join(' | ').slice(0, 200)}`);
        const line = `[${steps.some((s) => s.under.length) ? 'OBSERVED Nb' : 'not observed'}] ${this.id} ${steps.map((s) => `${s.z}@${s.zoom}: ${s.under.length} of ${s.others}${s.under.length ? ` (${s.under.join('; ')})` : ''}`).join(' · ')}`;
        return { neighbours: { subject: name, steps }, line };
      } finally {
        await context.close();
      }
    },
  };
}

/** The scenarios, for control-size-check.mjs's list; `subjects` is its SUBJECTS. */
export function reviewScenarios(subjects) {
  return [
    ...[...ALONG, ...TILT].map(turnedScenario),
    clickScenario,
    settleScenario('title', subjects.title),
    settleScenario('crop', subjects.crop),
    settleScenario('table', subjects.table),
    neighbourScenario('image', (page) => clickOwnPoint(page, '[data-block-type="image"]')),
    neighbourScenario('title', subjects.title.select),
    neighbourScenario('table', subjects.table.select),
    ...neighbourClickScenarios(),
  ];
}

/**
 * Claims Or, Or-tilt, Pl-rot, Or-click, St and Nb, and controls K-rot,
 * K-settle and K-nb, from the harness's results; with lib/neighbourClicks.mjs's
 * Fd, Fh, Ns and K-fd.
 */
export function reviewVerdicts(results) {
  const claim = () => ({ observed: 0, of: 0, cases: [] });
  const claims = { Or: claim(), 'Or-tilt': claim(), 'Pl-rot': claim(), 'Or-click': claim(), St: claim(), Nb: claim() };
  const controls = { 'K-rot': [], 'K-settle': [], 'K-nb': [] };
  for (const r of results.filter((x) => x.turned)) {
    const { rotation, along, steps } = r.turned;
    const c = claims[along ? 'Or' : 'Or-tilt'];
    for (const s of steps) {
      // The editor may store a turn a hair off the one opened (10.0001).
      const deg = Number((s.transform.match(/rotate\(([-\d.e]+)deg\)/) ?? [0, 0])[1]);
      if (Math.abs(deg - rotation) > 0.01) controls['K-rot'].push(`${r.id}: renders ${s.transform || 'no turn'}`);
      c.of += 1;
      if (s.byOwn.length) { c.observed += 1; c.cases.push(`${rotation}° at ${s.z} (${s.zoom}): ${s.byOwn.join('; ')}`); }
      claims['Pl-rot'].of += 1;
      if (s.place.length) { claims['Pl-rot'].observed += 1; claims['Pl-rot'].cases.push(`${rotation}° at ${s.z} (${s.zoom}): ${s.place.join('; ')}`); }
    }
  }
  for (const r of results.filter((x) => x.rotClick)) {
    const deg = Number(((r.rotClick.transform ?? '').match(/rotate\(([-\d.e]+)deg\)/) ?? [0, 0])[1]);
    if (Math.abs(Math.abs(deg) - 180) > 0.01) controls['K-rot'].push(`${r.id}: the drag left ${r.rotClick.transform || 'no turn'}`);
    for (const c of r.rotClick.clicks) {
      claims['Or-click'].of += 1;
      if (c.verdict) { claims['Or-click'].observed += 1; claims['Or-click'].cases.push(`${c.dir} (on top: ${c.onTop}): ${c.verdict}`); }
    }
  }
  for (const r of results.filter((x) => x.settle)) {
    for (const s of r.settle) {
      if (Math.abs(s.z1 - s.z0) < 1e-6 || s.frames < 20) controls['K-settle'].push(`${r.id} ${s.label}: zoom ${s.z0} → ${s.z1}, ${s.frames} frames`);
      claims.St.of += 1;
      if (s.offFrames) { claims.St.observed += 1; claims.St.cases.push(`${r.id} ${s.label} ${s.z0}→${s.z1}: ${s.worst.join('; ')}`); }
    }
  }
  for (const r of results.filter((x) => x.neighbours)) {
    const st = r.neighbours.steps;
    if (Math.abs(st[0].zoom - 0.2) > 1e-6 || st.some((s) => s.selected !== 1)) controls['K-nb'].push(`${r.id}: floor ${st[0].zoom}, selected ${st.map((s) => s.selected).join('/')}`);
    for (const s of st) {
      claims.Nb.of += 1;
      if (s.under.length) { claims.Nb.observed += 1; claims.Nb.cases.push(`${r.neighbours.subject} at ${s.z} (${s.zoom}): ${s.under.length} of ${s.others} (${s.under.join('; ')})`); }
    }
  }
  const nc = neighbourClickVerdicts(results);
  return { claims: { ...claims, ...nc.claims }, controls: { ...controls, ...nc.controls } };
}
