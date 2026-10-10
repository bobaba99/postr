/**
 * The selected block's controls as a user meets them, read from layout in
 * a real browser: shared by scripts/control-size-check.mjs (plan item 19)
 * and any editor harness that needs a selection's controls, the zoom, or
 * the WCAG 2.5.8 target-size test. Plain ESM, run in bare Node; the
 * functions taking `page` drive a Playwright page opened with
 * lib/editorHarness.mjs's openEditor.
 *
 * What counts as a control is read from the app's own markers, not from a
 * copy of its geometry: `data-postr-resize-handle` (resizeHandles.tsx),
 * `data-postr-selection-ui` (blocks.tsx's handle row, rotate stem and
 * button; GroupFrame.tsx; CropOverlay.tsx), the table's strips and grips by
 * their accessible names and titles (blocks.tsx TableBlock), the crop
 * overlay's edge handles and bar by theirs. DESIGN_UNITS is the one copy of
 * the source's sizes, in sheet units; it is used only to test the claim that
 * a control's size is its size in units times the zoom.
 */

import { switchesOff } from './editorHarness.mjs';

export const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** Sheet units of each control as written in blocks.tsx / resizeHandles.tsx / GroupFrame.tsx. */
export const DESIGN_UNITS = {
  handle: 10, 'handle-dot': 5, 'group-handle': 10, 'group-handle-dot': 5, move: 18, delete: 18, replace: 18, crop: 18, rotate: 18,
  'row-height': 18, 'table-col-resize': 6, 'table-row-sel': 8, 'table-col-sel': 8,
  // CropOverlay.tsx: edge handles 5 thick (12 long), Cancel / Reset / Apply 18.
  'crop-edge-top': 5, 'crop-edge-bottom': 5, 'crop-edge-left': 5, 'crop-edge-right': 5, 'crop-btn': 18,
};

/** Strip the instance suffix (a direction or an index) from a control's kind. */
export const baseKind = (kind) => kind.replace(/-(nw|ne|se|sw|n|e|s|w|\d+)$/, '');

/**
 * The size that should stay fixed on screen: a strip's or an edge handle's
 * thickness (its length follows the block), the stem's length, the handle
 * row's and the label's height (their width follows what they hold: the
 * label's text, and which buttons the row shows), otherwise the width.
 */
const FIXED_HEIGHT = new Set(['table-col-sel', 'stem', 'crop-edge-top', 'crop-edge-bottom', 'row', 'label']);
export const fixedDim = (base) => (FIXED_HEIGHT.has(base) ? 'h' : 'w');

/**
 * Kinds left out of claim Oc (one block's own controls overlapping): the
 * layout overlaps the owner put on the Later list (2026-10-06): a group's
 * frame over its members' controls (Q5), crop mode's controls (Q6), and a
 * table's strips and grips within the handles' reach (Q7).
 */
export const OC_EXCLUDED = (c) => c.owner === 'group' || /^crop-/.test(c.kind) || /^table-/.test(c.kind);

export const zoomNow = (page) => page.evaluate(() => {
  const s = document.getElementById('poster-canvas');
  return s.getBoundingClientRect().width / Number(s.style.width.replace('px', ''));
});

/** Click a ZoomBar button until the zoom stops moving. */
export async function stepUntilStable(page, label, max) {
  let prev = await zoomNow(page);
  for (let i = 0; i < max; i++) {
    await page.getByRole('button', { name: label }).click();
    await page.waitForTimeout(40);
    const z = await zoomNow(page);
    if (Math.abs(z - prev) < 1e-9) return { zoom: z, clicks: i + 1 };
    prev = z;
  }
  return { zoom: prev, clicks: max };
}

/** A pinch (Ctrl + wheel) over the canvas's centre towards `target`. */
export async function pinchTo(page, target) {
  const o = await page.locator('[data-postr-canvas-outer]').boundingBox();
  await page.mouse.move(o.x + o.width / 2, o.y + o.height / 2);
  for (let i = 0; i < 6; i++) {
    const z = await zoomNow(page);
    if (Math.abs(z / target - 1) < 0.002) break;
    await page.keyboard.down('Control');
    // PosterEditor's pinch: factor = exp(−deltaY / 240).
    await page.mouse.wheel(0, 240 * Math.log(z / target));
    await page.keyboard.up('Control');
    await page.waitForTimeout(150);
  }
  return zoomNow(page);
}

/**
 * Where the sheet is larger than the canvas, scroll so the selection is
 * centred, as a user pans to it. Where the sheet fits, leave the scroll as
 * the editor left it: a user has no reason to scroll there.
 */
export async function centreSelection(page) {
  await page.evaluate(() => {
    const outer = document.querySelector('[data-postr-canvas-outer]');
    const sheet = document.getElementById('poster-canvas').getBoundingClientRect();
    if (sheet.width <= outer.clientWidth && sheet.height <= outer.clientHeight) return;
    const sel = [...document.querySelectorAll('#poster-canvas [data-postr-selected="true"]')];
    if (!sel.length) return;
    const rs = sel.map((e) => e.getBoundingClientRect());
    const cx = (Math.min(...rs.map((r) => r.left)) + Math.max(...rs.map((r) => r.right))) / 2;
    const cy = (Math.min(...rs.map((r) => r.top)) + Math.max(...rs.map((r) => r.bottom))) / 2;
    const ob = outer.getBoundingClientRect();
    outer.scrollLeft += cx - (ob.left + outer.clientLeft + outer.clientWidth / 2);
    outer.scrollTop += cy - (ob.top + outer.clientTop + outer.clientHeight / 2);
  });
  await page.waitForTimeout(120);
}

/** Click a block where it is itself on top (none of its controls, no neighbour). */
export async function clickOwnPoint(page, sel) {
  const pt = await page.evaluate((sel) => {
    const el = document.querySelector(`#poster-canvas ${sel}`);
    const r = el.getBoundingClientRect();
    for (const fy of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      for (const fx of [0.5, 0.35, 0.65, 0.2, 0.8]) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        const hit = document.elementFromPoint(x, y);
        if (hit && el.contains(hit) && !hit.closest('[data-postr-selection-ui], [data-postr-resize-handle], [role="button"]')) return { x, y };
      }
    }
    return null;
  }, sel);
  if (!pt) throw new Error(`precondition: a point of ${sel} where it is on top`);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(250);
}

/** Every selection control on screen, its box, and what is on top at its centre. */
export async function readControls(page) {
  return page.evaluate(() => {
    const box = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    const outer = document.querySelector('[data-postr-canvas-outer]');
    const ob = outer.getBoundingClientRect();
    const vis = { x: ob.left + outer.clientLeft, y: ob.top + outer.clientTop, w: outer.clientWidth, h: outer.clientHeight };
    const sheet = document.getElementById('poster-canvas');
    const sb = sheet.getBoundingClientRect();
    const zoom = sb.width / Number(sheet.style.width.replace('px', ''));
    const sheetHidden = Math.max(0, vis.x - sb.left, sb.right - (vis.x + vis.w), vis.y - sb.top, sb.bottom - (vis.y + vis.h));
    const found = [];
    const add = (kind, el, target, owner, extra = {}) => found.push({ kind, el, target, owner, ...extra });
    const ORDER8 = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    const ORDER4 = ['nw', 'ne', 'se', 'sw'];
    const handlesOf = (parent, prefix, owner) => {
      const hs = [...parent.children].filter((c) => c.hasAttribute('data-postr-resize-handle'));
      const order = hs.length === 8 ? ORDER8 : hs.length === 4 ? ORDER4 : null;
      hs.forEach((hd, i) => {
        // A handle that names its direction (fix 19 draws only some of
        // them on a block small on screen); otherwise main's fixed order.
        const named = hd.getAttribute('data-postr-resize-handle');
        const dir = named || (order ? order[i] : i);
        add(`${prefix}-${dir}`, hd, true, owner);
        // The visible square inside the hit zone.
        if (hd.firstElementChild) add(`${prefix}-dot-${dir}`, hd.firstElementChild, false, owner);
      });
      return hs.length;
    };
    const selected = [...sheet.querySelectorAll(':scope > [data-block-id][data-postr-selected="true"]')];
    let handleCounts = [];
    // Each selected block's box on screen that its resize handles sit on
    // (unrotated blocks): its rendered size less the selection border, for
    // the owner's rule on small blocks (claim Cm).
    const blocks = [];
    for (const blk of selected) {
      const owner = blk.dataset.blockType + (selected.length > 1 ? `#${selected.indexOf(blk)}` : '');
      const bb = blk.getBoundingClientRect();
      const cs = getComputedStyle(blk);
      const bx = (parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth)) * zoom;
      const by = (parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)) * zoom;
      blocks.push({ owner, type: blk.dataset.blockType, w: bb.width - bx, h: bb.height - by, outer: { x: bb.x, y: bb.y, w: bb.width, h: bb.height } });
      handleCounts.push(handlesOf(blk, 'handle', owner));
      for (const ui of [...blk.children].filter((c) => c.hasAttribute('data-postr-selection-ui'))) {
        // Main: the rotate button itself; fix 19: a box holding it (the
        // scale back), the row holding it when below has no room.
        const rotateIn = ui.tagName === 'DIV' && [...ui.children].find((c) => c.tagName === 'BUTTON' && (c.getAttribute('title') || '').startsWith('Drag to rotate'));
        if (ui.tagName === 'BUTTON') add('rotate', ui, true, owner);
        else if (rotateIn && !ui.querySelector('button[title^="Drag to move"]')) add('rotate', rotateIn, true, owner);
        else if (ui.querySelector('button')) {
          add('row', ui, false, owner);
          for (const c of ui.children) {
            // The hidden crop button's empty slot (record 29, blocks.tsx
            // data-postr-row-slot) is part of the row's width, not a
            // control: read through the row.
            if (c.hasAttribute('data-postr-row-slot')) continue;
            const t = c.getAttribute('title') || '';
            // The rotate control can sit in the row (fix 19, when below the
            // block has no room).
            const kind = t.startsWith('Drag to move') ? 'move' : t === 'Delete block' ? 'delete'
              : t.startsWith('Replace') ? 'replace' : /crop/i.test(t) ? 'crop' : t.startsWith('Drag to rotate') ? 'rotate'
                : c.tagName === 'BUTTON' ? 'button?' : 'label';
            add(kind, c, kind !== 'label', owner);
          }
        } else add('stem', ui, false, owner);
      }
      if (blk.dataset.blockType === 'table') {
        blk.querySelectorAll('[title="Drag to resize column"]').forEach((e, i) => add(`table-col-resize-${i}`, e, true, owner));
        blk.querySelectorAll('[aria-label^="Select row"]').forEach((e, i) => add(`table-row-sel-${i}`, e, true, owner));
        blk.querySelectorAll('[aria-label^="Select column"]').forEach((e, i) => add(`table-col-sel-${i}`, e, true, owner));
      }
      // Crop mode (CropOverlay.tsx): four edge handles and a Cancel / Reset / Apply bar.
      for (const edge of ['top', 'right', 'bottom', 'left']) {
        const e = blk.querySelector(`[aria-label="crop ${edge} edge"]`);
        if (e) add(`crop-edge-${edge}`, e, true, owner);
      }
      ['Cancel (Esc)', 'Reset crop', 'Apply crop (Enter)'].forEach((t, i) => {
        const e = blk.querySelector(`button[title^="${t}"]`);
        if (e) add(`crop-btn-${i}`, e, true, owner);
      });
    }
    const group = [...sheet.children].find((c) => c.hasAttribute('data-postr-selection-ui')
      && [...c.children].some((k) => k.hasAttribute('data-postr-resize-handle')));
    let groupFit = null;
    if (group) {
      add('group-body', group, true, 'group');
      handleCounts.push(handlesOf(group, 'group-handle', 'group'));
      // The frame is drawn from the blocks' stored geometry (GroupFrame's
      // groupBounds); a block that grows with its content renders taller.
      // Each side's distance, frame minus the union of the rendered blocks,
      // in sheet units (px / zoom) and in px.
      const g = group.getBoundingClientRect();
      const rs = selected.map((e) => e.getBoundingClientRect());
      const u = { l: Math.min(...rs.map((r) => r.left)), t: Math.min(...rs.map((r) => r.top)), r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)) };
      const px = { left: g.left - u.l, top: g.top - u.t, right: g.right - u.r, bottom: g.bottom - u.b };
      groupFit = { px, units: Object.fromEntries(Object.entries(px).map(([k, v]) => [k, v / zoom])) };
    }
    // Drawn outside the sheet: the ZoomBar and the format toolbar.
    for (const label of ['Zoom out', 'Reset zoom to fit', 'Zoom in', 'Fit poster to screen']) {
      const b = document.querySelector(`button[aria-label="${label}"]`);
      if (b) add(`zoombar:${label}`, b, true, 'chrome');
    }
    const toolbar = [...document.body.children].find((d) => d.style && d.style.position === 'fixed' && d.style.zIndex === '9700');
    if (toolbar) add('format-toolbar', toolbar, false, 'portal');
    const describe = (el, px, py) => {
      // Anything inside a selection overlay (a block's controls, the group
      // frame, the crop overlay and its bar) is a selection control, whatever
      // it is: test that before the generic "a titled button is chrome".
      const selUi = el && el.closest && el.closest('#poster-canvas [data-postr-resize-handle], #poster-canvas [data-postr-selection-ui]');
      if (selUi) {
        if (el.closest('[data-postr-resize-handle]')) return 'selection:resize handle';
        const named = el.closest('[title], [aria-label]');
        const label = named && selUi.contains(named) ? (named.getAttribute('aria-label') || named.getAttribute('title')) : null;
        return `selection:${label || (selUi.hasAttribute('data-postr-selection-ui') && selUi.parentElement?.id === 'poster-canvas' ? 'group frame' : el.tagName.toLowerCase())}`;
      }
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        if ([...e.children].some((k) => k.getAttribute && k.getAttribute('aria-label') === 'Zoom out')) return 'chrome:ZoomBar';
        const al = e.getAttribute('aria-label');
        if (e.tagName === 'BUTTON' && (al || e.title)) return `chrome:${al || e.title}`;
        if (e.hasAttribute('data-postr-oob-banner')) return 'chrome:out-of-bounds banner';
        if (e.hasAttribute('data-block-id')) return `block:${e.dataset.blockType}`;
        if (e.id === 'poster-canvas') return 'sheet';
        if (e.hasAttribute('data-postr-canvas-outer')) return 'workspace';
      }
      if (!el) return 'offscreen';
      const outside = px < vis.x || px > vis.x + vis.w || py < vis.y || py > vis.y + vis.h;
      return `${outside ? 'outside-canvas' : 'other'}:${el.tagName.toLowerCase()}`;
    };
    // The widest border a control draws (itself or inside it), on screen: a
    // browser rounds a border up to a whole layout pixel, which the zoom
    // then enlarges (claim Sp). Each element's own scale on screen is its
    // box on screen over its layout width (unrotated controls).
    const borderPx = (el) => {
      let m = 0;
      for (const e of [el, ...el.querySelectorAll('*')]) {
        const cs = getComputedStyle(e);
        const lw = parseFloat(cs.width);
        const k = lw > 0 ? e.getBoundingClientRect().width / lw : zoom;
        for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
          if (cs[`border${side}Style`] !== 'none') m = Math.max(m, (parseFloat(cs[`border${side}Width`]) || 0) * k);
        }
      }
      return m;
    };
    const out = found.map(({ el, ...c }) => {
      const r = box(el);
      const bpx = c.owner === 'chrome' || c.owner === 'portal' ? 0 : borderPx(el);
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const onScreen = cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight;
      const top = onScreen ? document.elementFromPoint(cx, cy) : null;
      const hitOk = !!top && (top === el || el.contains(top));
      const stickOut = Math.max(0, vis.x - r.x, r.x + r.w - (vis.x + vis.w), vis.y - r.y, r.y + r.h - (vis.y + vis.h));
      // Whether the centre is inside the visible canvas: where it is not (the
      // sheet scrolled past it at a high zoom), what is on top says nothing
      // about the controls.
      const inVis = cx >= vis.x && cx <= vis.x + vis.w && cy >= vis.y && cy <= vis.y + vis.h;
      return { ...c, r, hitOk, inVis, onTop: hitOk ? null : describe(top, cx, cy), stickOut, bpx };
    });
    // Claim Pl: each control where the design puts it, against the box it
    // belongs to (unrotated blocks; within 1 px on screen): a resize
    // handle centred on its corner or edge of the padding box (a group's
    // on the frame); since fix 19 the handle row's bottom 14 px above the
    // box and centred on it, the rotate control (when below) 14 px under
    // it, centred; a crop edge centred on its crop line (no crop yet), the
    // crop bar 4 px under the image, centred; a selected table's row strip
    // ending 2 px left of the table, a column strip 2 px above it, a column
    // grip centred on the border between two column strips.
    const placement = [];
    const near = (what, got, want) => { if (Math.abs(got - want) > 1) placement.push(`${what}: ${Math.round((got - want) * 10) / 10} px off`); };
    const padBox = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const bl = parseFloat(cs.borderLeftWidth) * zoom; const bt = parseFloat(cs.borderTopWidth) * zoom;
      const br = parseFloat(cs.borderRightWidth) * zoom; const bb2 = parseFloat(cs.borderBottomWidth) * zoom;
      return { x: r.x + bl, y: r.y + bt, w: r.width - bl - br, h: r.height - bt - bb2 };
    };
    const handlePlaces = (parent, P, who) => {
      for (const hd of [...parent.children].filter((c) => c.getAttribute('data-postr-resize-handle'))) {
        const d = hd.getAttribute('data-postr-resize-handle');
        const r = hd.getBoundingClientRect();
        const fx = d.includes('w') ? 0 : d.includes('e') ? 1 : 0.5;
        const fy = d.includes('n') ? 0 : d.includes('s') ? 1 : 0.5;
        near(`${who} handle ${d} x`, r.x + r.width / 2, P.x + fx * P.w);
        near(`${who} handle ${d} y`, r.y + r.height / 2, P.y + fy * P.h);
      }
    };
    for (const blk of selected) {
      if (blk.style.transform && blk.style.transform.includes('rotate')) continue;
      const P = padBox(blk);
      const who = blk.dataset.blockType;
      handlePlaces(blk, P, who);
      for (const ui of [...blk.children].filter((c) => c.hasAttribute('data-postr-selection-ui'))) {
        const r = ui.getBoundingClientRect();
        if (ui.querySelector(':scope > button[title^="Drag to move"]')) {
          near(`${who} row bottom`, r.bottom, P.y - 14);
          near(`${who} row centre`, r.x + r.width / 2, P.x + P.w / 2);
        } else if (ui.querySelector(':scope > button[title^="Drag to rotate"]')) {
          near(`${who} rotate top`, r.y, P.y + P.h + 14);
          near(`${who} rotate centre`, r.x + r.width / 2, P.x + P.w / 2);
        }
      }
      const top = blk.querySelector('[aria-label="crop top edge"]');
      if (top) {
        const R = top.parentElement.getBoundingClientRect();
        const c = (el) => { const q = el.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; };
        const at = { top: [R.x + R.width / 2, R.y], bottom: [R.x + R.width / 2, R.bottom], left: [R.x, R.y + R.height / 2], right: [R.right, R.y + R.height / 2] };
        for (const [edge, [x, y]] of Object.entries(at)) {
          const e = blk.querySelector(`[aria-label="crop ${edge} edge"]`);
          near(`crop ${edge} edge x`, c(e).x, x);
          near(`crop ${edge} edge y`, c(e).y, y);
        }
        const bar = blk.querySelector('button[title^="Cancel (Esc)"]').parentElement.getBoundingClientRect();
        near('crop bar top', bar.y, R.bottom + 4);
        near('crop bar centre', bar.x + bar.width / 2, R.x + R.width / 2);
      }
      if (blk.dataset.blockType === 'table') {
        const rows = [...blk.querySelectorAll('[aria-label^="Select row"]')];
        const cols = [...blk.querySelectorAll('[aria-label^="Select column"]')];
        const T = rows[0]?.offsetParent?.getBoundingClientRect();
        if (T) {
          rows.forEach((e, i) => near(`row strip ${i} right edge`, e.getBoundingClientRect().right, T.x - 2));
          cols.forEach((e, i) => near(`column strip ${i} bottom edge`, e.getBoundingClientRect().bottom, T.y - 2));
          [...blk.querySelectorAll('[title="Drag to resize column"]')].forEach((g, i) => {
            const q = g.getBoundingClientRect();
            if (cols[i]) near(`column grip ${i} centre`, q.x + q.width / 2, cols[i].getBoundingClientRect().right);
          });
        }
      }
    }
    if (group) handlePlaces(group, padBox(group), 'group');
    return {
      zoom, vis, sheet: { x: sb.x, y: sb.y, w: sb.width, h: sb.height }, sheetHidden, handleCounts, groupFit, blocks, placement,
      overflow: { x: outer.scrollWidth - outer.clientWidth, y: outer.scrollHeight - outer.clientHeight },
      selectedCount: selected.length, window: { w: innerWidth, h: innerHeight }, controls: out,
    };
  });
}

/**
 * WCAG 2.5.8 (target size, minimum): 24 × 24, or the spacing test. `tol`:
 * the engines lay out in fractions of a pixel (Chromium and WebKit 1/64,
 * Firefox 1/60) of the element's own space, so a length of 24 px drawn in
 * the zoomed sheet can measure up to zoom / 60 px short (23.98 at the
 * 1280 × 800 fit); pass `layoutTolerance(zoom)` to read that as 24.
 */
export const layoutTolerance = (zoom) => zoom / 60;
export function wcag(targets, tol = 0) {
  const small = (c) => c.r.w < 24 - tol || c.r.h < 24 - tol;
  const centre = (c) => ({ x: c.r.x + c.r.w / 2, y: c.r.y + c.r.h / 2 });
  const circleMeetsRect = (p, r) => {
    const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
    const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
    return dx * dx + dy * dy < 144;
  };
  return targets.map((c) => {
    if (!small(c)) return { kind: c.kind, owner: c.owner, pass: true, size: [round(c.r.w), round(c.r.h)] };
    const p = centre(c);
    const meets = targets.filter((o) => o !== c && !(o.kind === 'group-body' && c.kind.startsWith('group-handle')))
      .filter((o) => circleMeetsRect(p, o.r) || (small(o) && Math.hypot(centre(o).x - p.x, centre(o).y - p.y) < 24))
      .map((o) => `${o.owner}:${o.kind}`);
    return { kind: c.kind, owner: c.owner, pass: meets.length === 0, size: [round(c.r.w), round(c.r.h)], meets: meets.slice(0, 4) };
  });
}

/**
 * Pairs of grabbable controls whose boxes overlap (designed nesting
 * excluded), over 1 px². `units` is the area in sheet units (px / zoom²),
 * which says whether the overlap comes from the layout (it is there at
 * every zoom) or from the zoom.
 */
export function overlaps(targets, zoom) {
  const out = [];
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      const a = targets[i];
      const b = targets[j];
      const nested = (a.kind === 'group-body' && b.kind.startsWith('group-handle')) || (b.kind === 'group-body' && a.kind.startsWith('group-handle'));
      if (nested) continue;
      const w = Math.min(a.r.x + a.r.w, b.r.x + b.r.w) - Math.max(a.r.x, b.r.x);
      const h = Math.min(a.r.y + a.r.h, b.r.y + b.r.h) - Math.max(a.r.y, b.r.y);
      if (w > 0 && h > 0 && (w * h > 1 || (w * h) / (zoom * zoom) > 0.25)) {
        out.push({ a: `${a.owner}:${a.kind}`, b: `${b.owner}:${b.kind}`, area: round(w * h, 1), units: round((w * h) / (zoom * zoom), 2), px: w * h > 1 });
      }
    }
  }
  return out;
}

/**
 * Claim Oc: one block's own grabbable controls overlapping each other (same
 * owner, over 1 px² on screen), less the kinds on the Later list
 * (OC_EXCLUDED).
 */
export function ownOverlaps(targets, zoom) {
  const mine = targets.filter((c) => !OC_EXCLUDED(c));
  return overlaps(mine, zoom).filter((o) => o.px && o.a.split(':')[0] === o.b.split(':')[0]);
}

const ALL8 = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CORNERS = ['nw', 'ne', 'se', 'sw'];

/**
 * Claim Cm: the owner's rule for a block small on screen (2026-10-06, Q2),
 * read against what is drawn. Only what the rule states is checked, and
 * that nothing else goes missing: an axis under 72 px draws no edge handles
 * along it (n and s for the width, e and w for the height); under 24 px on
 * both, only the bottom-right corner and the move button; the type label
 * only from 120 px wide. Above those sizes, every handle the block has
 * (a contained image has corners only) from 72 px on both axes, every
 * corner from 24 px on both, and the move, delete (and an image's replace
 * and crop) buttons and the rotate control whenever the block is not under
 * 24 px on both and its handle row fits (below). The bottom-right corner is
 * always drawn. A rule for one axis under 24 px is not the owner's and is
 * not checked here (claim Oc checks its result). `cornersOnly(type)` says
 * which blocks have corners only. Unrotated blocks.
 *
 * The handle row wider than the block (the lead's rule for review finding
 * F3, record 19), zoomed out under OVERVIEW_ZOOM: a row that draws delete,
 * replace or crop is no wider than the block, its label included; it draws
 * them (and the rotate control) exactly where its buttons fit: the move
 * button, delete, and an image's or logo's replace and crop, 24 px each with
 * 4 px between (Q1's hit area; the row's gap), within 0.5 px. From
 * OVERVIEW_ZOOM up every block not under 24 px on both axes draws them all.
 * The rotate control, when it joins the row (Q3), is not counted. The label
 * yields to the buttons (implementer): a drawn label fits in the row with
 * them, and from 120 px wide it is drawn unless the row with it (at least
 * 40 px more, the narrowest label) would be wider than the block.
 *
 * Record 29's ADJUSTMENTS_ENABLED (config/features.ts) hides the rotate
 * control and the crop button. While the tree has it off (`adjustments`
 * false, read from the file by default; since the merge of main, record 30,
 * into record 29) neither is asked for; an image's or logo's row keeps the
 * crop button's slot, budgeted (selectionLayout handleRowWidth,
 * imageButtons) and drawn empty (blocks.tsx data-postr-row-slot), so its
 * width and parts are read as before.
 */
/**
 * The zoom from which the handle row is never cut (the lead's rule for F3,
 * its threshold measured with this harness's claim Fz, record 19 section 9):
 * the source's OVERVIEW_ZOOM, written here from the measurement.
 */
export const OVERVIEW_ZOOM = 0.35;

export function ruleCheck(reading, cornersOnly, adjustments = switchesOff('ADJUSTMENTS_ENABLED').length === 0) {
  const out = [];
  for (const b of reading.blocks) {
    const mine = reading.controls.filter((c) => c.owner === b.owner);
    const has = (kind) => mine.some((c) => c.kind === kind);
    const handles = new Set(mine.filter((c) => /^handle-(nw|ne|se|sw|n|e|s|w)$/.test(c.kind)).map((c) => c.kind.slice(7)));
    const base = cornersOnly(b.type) ? CORNERS : ALL8;
    const tiny = b.w < 24 && b.h < 24;
    const say = (s) => out.push(`${b.owner} ${round(b.w, 1)}×${round(b.h, 1)} px: ${s}`);
    if (b.w < 72 && (handles.has('n') || handles.has('s'))) say('n or s handle drawn under 72 px wide');
    if (b.h < 72 && (handles.has('e') || handles.has('w'))) say('e or w handle drawn under 72 px tall');
    if (!handles.has('se')) say('no bottom-right handle');
    if (!has('move')) say('no move button');
    if (tiny) {
      const extra = [...handles].filter((d) => d !== 'se');
      if (extra.length) say(`handles ${extra.join(',')} drawn under 24 px on both axes`);
      for (const k of ['delete', 'replace', 'crop', 'rotate', 'label']) if (has(k)) say(`${k} drawn under 24 px on both axes`);
    } else {
      // The row as drawn, and its buttons' width (the move button, delete
      // and an image's or logo's replace and crop). The rotate control in
      // the row (Q3) is its last button, not counted.
      const row = mine.find((c) => c.kind === 'row');
      const label = mine.find((c) => c.kind === 'label');
      const rot = mine.find((c) => c.kind === 'rotate');
      const rotInRow = !!rot && !!row && Math.abs(rot.r.y + rot.r.h / 2 - (row.r.y + row.r.h / 2)) < 1;
      const own = row ? row.r.w - (rotInRow ? 28 : 0) : 0;
      const imageButtons = b.type === 'image' || b.type === 'logo';
      const kinds = ['delete', ...(imageButtons ? ['replace', ...(adjustments ? ['crop'] : [])] : [])];
      // The crop button's slot stays when it is hidden (record 29): the app
      // budgets it and draws it empty (blocks.tsx data-postr-row-slot), so
      // the row keeps its width.
      const hiddenSlot = imageButtons && !adjustments ? 28 : 0;
      const full = 24 + kinds.length * 28 + hiddenSlot;
      const drawn = kinds.filter(has);
      const overview = reading.zoom < OVERVIEW_ZOOM;
      if (drawn.length && row && own > b.w + 0.5 && (overview || label)) say(`${[...drawn, ...(label ? ['label'] : [])].join(', ')} drawn in a row ${round(own, 1)} px wide, wider than the block`);
      const parts = full + (label ? 4 + label.r.w : 0);
      if (drawn.length === kinds.length && row && Math.abs(own - parts) > 1) say(`the row is ${round(own, 1)} px wide, not the ${round(parts, 1)} px its parts add to`);
      if (b.w >= 120 && !has('label') && (!drawn.length || own + 44 <= b.w - 0.5)) say('no type label at 120 px wide or more, with room for one');
      const all = [...kinds, ...(adjustments ? ['rotate'] : [])];
      if (!overview || full <= b.w - 0.5) for (const k of all) { if (!has(k)) say(`no ${k} control (${overview ? `the row, ${round(full, 1)} px, fits` : `zoom ${round(reading.zoom, 3)}, not zoomed out`})`); }
      else if (full > b.w + 0.5) for (const k of all) { if (has(k)) say(`${k} drawn though the row (${round(full, 1)} px) is wider than the block, zoomed out`); }
      else if (all.some(has) && !all.every(has)) say(`part of the row drawn (${all.filter(has).join(', ')})`);
      if (b.w >= 24 && b.h >= 24) for (const d of base.filter((x) => CORNERS.includes(x))) if (!handles.has(d)) say(`no ${d} corner`);
      if (b.w >= 72 && b.h >= 72) for (const d of base) if (!handles.has(d)) say(`no ${d} handle`);
    }
    if (b.w < 120 && has('label')) say('type label drawn under 120 px wide');
  }
  return out;
}

/** A table's row or column strip: its length is the row's or the column's. */
const STRIP = /^table-(row|col)-sel/;
/** A strip's length, along the row or the column. */
const stripLength = (c) => (/^table-row-sel/.test(c.kind) ? c.r.h : c.r.w);

/** One zoom step's verdicts from the raw reading. */
export function judge(reading, whole) {
  const sel = reading.controls.filter((c) => c.owner !== 'chrome' && c.owner !== 'portal');
  const targets = sel.filter((c) => c.target);
  const tol = layoutTolerance(reading.zoom);
  const w = wcag(targets, tol);
  const failsT = w.filter((x) => !x.pass);
  // T-fit's reading: a table strip by its thickness (its length follows
  // the table's rows and columns, which no control size can change: claim
  // Tl lists those under 24 px); every other target as T reads it.
  const fitFails = failsT.filter((x) => {
    const c = targets.find((t) => t.kind === x.kind && t.owner === x.owner);
    if (!c || !STRIP.test(c.kind)) return true;
    const thickness = /^table-row-sel/.test(c.kind) ? c.r.w : c.r.h;
    return thickness < 24 - tol;
  });
  const shortStrips = targets.filter((c) => STRIP.test(c.kind) && stripLength(c) < 24 - tol);
  const covered = targets.filter((c) => !c.hitOk);
  // What is on top at a covered control's centre: another selection control
  // (claim O), or anything else, the ZoomBar, the sidebar or nothing (R).
  // Only a centre on the visible canvas counts for O: off it, the sheet has
  // been scrolled past the control.
  const byOther = covered.filter((c) => !String(c.onTop).startsWith('selection:'));
  const byControl = covered.filter((c) => c.inVis && String(c.onTop).startsWith('selection:'));
  const outside = targets.filter((c) => c.stickOut > 0.5);
  const ovAll = overlaps(targets, reading.zoom);
  const ov = ovAll.filter((o) => o.px);
  const own = ownOverlaps(targets, reading.zoom);
  return {
    T: failsT.length > 0,
    Tfit: fitFails.length > 0,
    tFitFails: fitFails.map((x) => `${x.owner}:${x.kind} ${x.size.join('×')}`),
    shortStrips: shortStrips.map((c) => `${c.owner}:${c.kind} ${round(stripLength(c))} px long`),
    R: whole && (outside.length > 0 || byOther.length > 0),
    O: ov.length > 0 || byControl.length > 0,
    Oc: own.length > 0,
    ownOverlaps: own.map((o) => `${o.a} / ${o.b} ${o.area} px²`),
    overlapsUnits: ovAll,
    tFails: failsT.map((x) => `${x.owner}:${x.kind} ${x.size.join('×')}`),
    outside: outside.map((c) => `${c.owner}:${c.kind} +${round(c.stickOut, 1)}px`),
    coveredByOther: byOther.map((c) => `${c.owner}:${c.kind} under ${c.onTop}`),
    coveredByControl: byControl.map((c) => `${c.owner}:${c.kind} under ${c.onTop}`),
    overlaps: ov,
  };
}
