/**
 * The rotate-room scenarios of scripts/control-size-check.mjs (claim Rr,
 * plan item 19's Q3): where the selected logo's rotate control is after
 * the view moves with the zoom unchanged. Below the block, unless there it
 * would meet the ZoomBar or leave the visible canvas; then in the handle
 * row. The logo flush with the sheet's bottom edge, zoomed in by a pinch,
 * then a scroll (a wheel, as a user scrolls) or a narrower window (a
 * canvas resize that leaves the zoom as it was). Split out of the harness
 * to keep it under 800 lines; it runs them.
 */
import { openEditor } from './editorHarness.mjs';
import { pinchTo, readControls, round, zoomNow } from './selectionControls.mjs';

/** Where the selected logo's rotate control is, and what it would need below. */
async function rotatePlace(page) {
  const reading = await readControls(page);
  const blk = reading.blocks[0];
  const rot = reading.controls.find((c) => c.kind === 'rotate' && c.owner === blk.owner);
  const zb = reading.controls.find((c) => c.kind === 'zoombar:Zoom in');
  // In the handle row: beside the move button (below the block, fix 19
  // holds it in a box of its own).
  const inRow = await page.evaluate(() => {
    const r = document.querySelector('#poster-canvas [data-postr-selected="true"] > [data-postr-selection-ui] > button[title^="Drag to rotate"]');
    return !!r && !!r.parentElement.querySelector(':scope > button[title^="Drag to move"]');
  });
  // The ZoomBar's own box (its parent of the Zoom in button).
  const bar = await page.evaluate(() => {
    const b = document.querySelector('button[aria-label="Zoom in"]').parentElement.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  return { reading, blk, rot, inRow, bar, zoomBarButton: zb ? zb.r : null };
}

/** Wheel (no modifier: a scroll) over the canvas until the logo's box is at (`x`, `bottom`) on screen. */
async function scrollLogoTo(page, { cx, bottom }) {
  const o = await page.locator('[data-postr-canvas-outer]').boundingBox();
  await page.mouse.move(o.x + o.width / 2, o.y + o.height / 2);
  for (let i = 0; i < 4; i++) {
    const b = await page.locator('#poster-canvas [data-block-id="zqbottom"]').boundingBox();
    const dx = cx === undefined ? 0 : b.x + b.width / 2 - cx;
    const dy = b.y + b.height - bottom;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    await page.mouse.wheel(dx, dy);
    await page.waitForTimeout(350);
  }
}

/** One reading's verdict: the rotate control not where Q3 puts it. */
function rotateVerdict(p, expect) {
  const v = p.rot;
  if (!v) return 'no rotate control';
  if (expect === 'row' && !p.inRow) return `below the block with no room there (sticks out ${round(v.stickOut, 1)} px; on top at its centre: ${v.onTop ?? 'itself'})`;
  if (expect === 'below' && p.inRow) return 'in the handle row with room below the block';
  if (v.stickOut > 0.5 || (!v.hitOk && !String(v.onTop).startsWith('selection:'))) return `outside the canvas by ${round(v.stickOut, 1)} px or under ${v.onTop}`;
  return null;
}

/**
 * The two scenarios, for control-size-check.mjs's list. `bottom` is its
 * subject: a 15 × 2 in logo flush with the sheet's bottom edge (`edit`,
 * `select`).
 */
export function roomScenarios(bottom) {
  return [{
    id: 'room-scroll-1280x800-48x36-bottom',
    async run(h) {
      const { context, page, state } = await openEditor(h, { viewport: { width: 1280, height: 800 }, poster: { w: 48, h: 36 }, editDoc: bottom.edit });
      try {
        await page.getByRole('button', { name: 'Fit poster to screen' }).click();
        await page.waitForTimeout(350);
        await bottom.select(page);
        await pinchTo(page, 2.5);
        const z0 = await zoomNow(page);
        const vis = (await readControls(page)).vis;
        const steps = [];
        // 150 px left of the canvas's centre, clear of the ZoomBar; 60 px
        // above the canvas's bottom (as far as the gutter lets the sheet go)
        // the rotate control has room below, 20 px above it has not.
        const GAPS = [60, 20, 60];
        for (const [i, [label, expect]] of [['room below', 'below'], ['20 px from the bottom', 'row'], ['back up', 'below']].entries()) {
          await scrollLogoTo(page, { cx: vis.x + vis.w / 2 - 150, bottom: vis.y + vis.h - GAPS[i] });
          const p = await rotatePlace(page);
          const logoBottomGap = round(vis.y + vis.h - (p.blk.outer.y + p.blk.outer.h), 1);
          steps.push({ label, expect, logoBottomGap, inRow: p.inRow, zoom: round(p.reading.zoom, 4), verdict: rotateVerdict(p, expect), rot: p.rot ? { r: p.rot.r, onTop: p.rot.onTop, stickOut: p.rot.stickOut } : null });
        }
        // Preconditions: the zoom never moved, the logo stayed selected and reached each place within 3 px.
        const z1 = await zoomNow(page);
        const bad = steps.filter((x, i) => Math.abs(x.logoBottomGap - GAPS[i]) > 3);
        if (Math.abs(z1 - z0) > 1e-9 || bad.length) throw new Error(`precondition: zoom ${z0} → ${z1}; logo places ${JSON.stringify(steps.map((x) => x.logoBottomGap))}`);
        if (state.errors.length) throw new Error(`page errors: ${state.errors.join(' | ').slice(0, 200)}`);
        return { room: steps, zoom: round(z0, 4) };
      } finally {
        await context.close();
      }
    },
  }, {
    // A portrait poster's fit is limited by the canvas's height, so a
    // narrower window changes neither the fit nor the zoom: nothing in the
    // editor renders, but the ZoomBar (centred on the canvas) moves left
    // under a block the sheet's scroll keeps in place.
    id: 'room-resize-1280x800-24x36-bottom',
    async run(h) {
      const { context, page, state } = await openEditor(h, { viewport: { width: 1280, height: 800 }, poster: { w: 24, h: 36 }, editDoc: bottom.edit });
      try {
        await page.getByRole('button', { name: 'Fit poster to screen' }).click();
        await page.waitForTimeout(350);
        await bottom.select(page);
        await pinchTo(page, 4);
        const z0 = await zoomNow(page);
        const before = await readControls(page);
        const vis = before.vis;
        // The logo 60 px above the canvas's bottom and 100 px left of its centre: room below, clear of the ZoomBar.
        await scrollLogoTo(page, { cx: vis.x + vis.w / 2 - 100, bottom: vis.y + vis.h - 60 });
        const a = await rotatePlace(page);
        const shrink = 200;
        await page.setViewportSize({ width: 1280 - shrink, height: 800 });
        await page.waitForTimeout(500);
        const b = await rotatePlace(page);
        const z1 = await zoomNow(page);
        // Preconditions: the zoom stayed, the logo did not move, the ZoomBar moved left by half the shrink.
        const moved = Math.hypot(b.blk.outer.x - a.blk.outer.x, b.blk.outer.y - a.blk.outer.y);
        const barShift = (a.bar.x + a.bar.w / 2) - (b.bar.x + b.bar.w / 2);
        const logoGap = vis.y + vis.h - (a.blk.outer.y + a.blk.outer.h);
        if (Math.abs(z1 - z0) > 1e-9 || moved > 1 || Math.abs(barShift - shrink / 2) > 2 || Math.abs(logoGap - 60) > 3) {
          throw new Error(`precondition: zoom ${z0} → ${z1}, logo moved ${round(moved)} px, ZoomBar moved ${round(barShift)} px, logo ${round(logoGap)} px above the bottom`);
        }
        if (state.errors.length) throw new Error(`page errors: ${state.errors.join(' | ').slice(0, 200)}`);
        const steps = [
          { label: 'room below, clear of the ZoomBar', expect: 'below', inRow: a.inRow, verdict: rotateVerdict(a, 'below'), rot: a.rot ? { r: a.rot.r, onTop: a.rot.onTop } : null },
          { label: `window ${shrink} px narrower: the ZoomBar under it`, expect: 'row', inRow: b.inRow, verdict: rotateVerdict(b, 'row'), rot: b.rot ? { r: b.rot.r, onTop: b.rot.onTop } : null },
        ];
        return { room: steps, zoom: round(z0, 4), barShift: round(barShift, 1) };
      } finally {
        await context.close();
      }
    },
  }];
}
