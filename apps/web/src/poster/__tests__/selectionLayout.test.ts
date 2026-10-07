/**
 * Fix 19 (plan item 19) — the pure rules behind a selected block's controls:
 * which controls a block draws for its size on screen (the owner's Q2, the
 * implementer's rule for one axis under 24 px, and the lead's rule for a
 * handle row wider than its block, review finding F3), and whether the
 * rotate control has room below the block (Q3). Engineering record:
 * docs/fixes/19-controls-one-size.md.
 *
 * Written against the fix's own functions, so these are secondary: the
 * user's path is in controlsOneSize.test.tsx (jsdom) and
 * scripts/control-size-check.mjs (the browser, where the rotate's room is
 * measured against the real canvas and ZoomBar: claim R).
 *
 * Re-run: npx vitest run src/poster/__tests__/selectionLayout.test.ts
 */
import { describe, expect, it } from 'vitest';
import { OVERVIEW_ZOOM, blockControls, ctl, handleRowWidth, rotateFitsBelow } from '../selectionLayout';

const sorted = (xs: readonly string[]) => [...xs].sort();

describe('ctl — a length drawn the same on screen at every zoom', () => {
  it('divides by the sheet\'s zoom, with 1 when no sheet sets it', () => {
    expect(ctl(24)).toBe('calc(24px / var(--postr-zoom, 1))');
    expect(ctl(-12.5)).toBe('calc(-12.5px / var(--postr-zoom, 1))');
  });
});

describe('blockControls — Q2, a block small on screen', () => {
  it('a big block draws everything', () => {
    const c = blockControls({ wPx: 300, hPx: 200 });
    expect(sorted(c.handles)).toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w']);
    expect(c).toMatchObject({ label: true, buttons: true, rotate: true });
  });

  it('under 72 px wide: no n or s handle; under 72 px tall: no e or w', () => {
    expect(sorted(blockControls({ wPx: 71.9, hPx: 200 }).handles)).toEqual(['e', 'ne', 'nw', 'se', 'sw', 'w']);
    expect(sorted(blockControls({ wPx: 300, hPx: 71.9 }).handles)).toEqual(['n', 'ne', 'nw', 's', 'se', 'sw']);
    expect(sorted(blockControls({ wPx: 72, hPx: 72 }).handles)).toHaveLength(8);
  });

  it('under 24 px on both: the bottom-right corner and the move button only', () => {
    const c = blockControls({ wPx: 23.9, hPx: 23.9 });
    expect(c.handles).toEqual(['se']);
    expect(c).toMatchObject({ label: false, buttons: false, rotate: false });
  });

  it('the type label from 120 px wide', () => {
    expect(blockControls({ wPx: 119.9, hPx: 200 }).label).toBe(false);
    expect(blockControls({ wPx: 120, hPx: 200 }).label).toBe(true);
  });

  it('a block with corners only keeps to them', () => {
    expect(sorted(blockControls({ wPx: 300, hPx: 300, cornersOnly: true }).handles)).toEqual(['ne', 'nw', 'se', 'sw']);
    expect(blockControls({ wPx: 10, hPx: 10, cornersOnly: true }).handles).toEqual(['se']);
  });

  it('one axis under 24 px (the implementer\'s rule): the near row or column goes, so the far one does not overlap it', () => {
    expect(sorted(blockControls({ wPx: 300, hPx: 20 }).handles)).toEqual(['s', 'se', 'sw']);
    expect(sorted(blockControls({ wPx: 20, hPx: 300 }).handles)).toEqual(['e', 'ne', 'se']);
    expect(sorted(blockControls({ wPx: 50, hPx: 20 }).handles)).toEqual(['se', 'sw']);
    const thin = blockControls({ wPx: 300, hPx: 20 });
    expect(thin).toMatchObject({ label: true, buttons: true, rotate: true });
  });

  it('no two handles it draws overlap, at any size (24 px hit areas centred on the corners and edge midpoints)', () => {
    const at = (d: string, w: number, h: number) => ({
      x: d.includes('w') ? 0 : d.includes('e') ? w : w / 2,
      y: d.includes('n') ? 0 : d.includes('s') ? h : h / 2,
    });
    for (let w = 1; w <= 200; w += 1.7) {
      for (let h = 1; h <= 200; h += 1.9) {
        for (const cornersOnly of [false, true]) {
          const hs = blockControls({ wPx: w, hPx: h, cornersOnly }).handles;
          for (let i = 0; i < hs.length; i++) {
            for (let j = i + 1; j < hs.length; j++) {
              const a = at(hs[i]!, w, h);
              const b = at(hs[j]!, w, h);
              const overlap = Math.max(0, 24 - Math.abs(a.x - b.x)) * Math.max(0, 24 - Math.abs(a.y - b.y));
              expect(overlap, `${hs[i]} and ${hs[j]} on a ${w} × ${h} px block`).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    }
  });
});

describe('handleRowWidth — the handle row\'s own controls side by side (24 px each, 4 px apart)', () => {
  it('the move button and delete: 52 px; with an image\'s replace and crop: 108 px', () => {
    expect(handleRowWidth({ labelPx: null, imageButtons: false })).toBe(52);
    expect(handleRowWidth({ labelPx: null, imageButtons: true })).toBe(108);
  });

  it('the type label, when it shows, adds its width and a gap', () => {
    expect(handleRowWidth({ labelPx: 48, imageButtons: false })).toBe(104);
    expect(handleRowWidth({ labelPx: 52, imageButtons: true })).toBe(164);
  });
});

describe('blockControls — zoomed far out, a handle row wider than the block shows only the move button (review F3)', () => {
  const imageRow = (labelPx = 0) => ({ labelPx, imageButtons: true });
  const textRow = (labelPx = 0) => ({ labelPx, imageButtons: false });
  const FAR = 0.2;

  it('the overview range is under 35% (measured: record 19, section 9)', () => {
    expect(OVERVIEW_ZOOM).toBe(0.35);
  });

  it('zoomed out, an image narrower than its row (108 px): no delete, replace, crop or rotate control', () => {
    expect(blockControls({ wPx: 107.9, hPx: 200, row: imageRow(), zoom: FAR })).toMatchObject({ buttons: false, rotate: false });
    expect(blockControls({ wPx: 108, hPx: 200, row: imageRow(), zoom: FAR })).toMatchObject({ buttons: true, rotate: true });
  });

  it('zoomed out, a text block\'s row is the move button and delete (52 px)', () => {
    expect(blockControls({ wPx: 51.9, hPx: 200, row: textRow(), zoom: FAR })).toMatchObject({ buttons: false, rotate: false });
    expect(blockControls({ wPx: 52, hPx: 200, row: textRow(), zoom: FAR })).toMatchObject({ buttons: true, rotate: true });
  });

  it('from 35% up the row is whole however narrow the block (a 3 in image at a fit keeps Replace and Crop)', () => {
    for (const zoom of [OVERVIEW_ZOOM, 0.5, 1, 1.39, 3.39]) {
      expect(blockControls({ wPx: 39, hPx: 49, row: imageRow(52), zoom }), `zoom ${zoom}`).toMatchObject({ buttons: true, rotate: true, label: false });
    }
    expect(blockControls({ wPx: 39, hPx: 49, row: imageRow(52), zoom: OVERVIEW_ZOOM - 0.0001 })).toMatchObject({ buttons: false, rotate: false });
    expect(blockControls({ wPx: 39, hPx: 49, row: imageRow(52) }), 'no zoom given: not zoomed out').toMatchObject({ buttons: true, rotate: true });
  });

  it('where the buttons are drawn, the label (from 120 px wide) shows only if the row has room for it too (implementer)', () => {
    for (const zoom of [FAR, 1]) {
      // An image with a 52 px label: its buttons fit from 108 px, the label from 164.
      expect(blockControls({ wPx: 130, hPx: 200, row: imageRow(52), zoom })).toMatchObject({ label: false, buttons: true, rotate: true });
      expect(blockControls({ wPx: 163.9, hPx: 200, row: imageRow(52), zoom })).toMatchObject({ label: false, buttons: true, rotate: true });
      expect(blockControls({ wPx: 164, hPx: 200, row: imageRow(52), zoom })).toMatchObject({ label: true, buttons: true, rotate: true });
      // A text block's row with a 48 px label is 104 px: the label from 120 px, as the owner's rule says.
      expect(blockControls({ wPx: 120, hPx: 200, row: textRow(48), zoom })).toMatchObject({ label: true, buttons: true });
      expect(blockControls({ wPx: 119.9, hPx: 200, row: textRow(48), zoom })).toMatchObject({ label: false, buttons: true });
    }
  });

  it('zooming in only ever adds controls: buttons, then the label, never one for the other', () => {
    for (const labelPx of [40, 52, 91]) {
      for (const row of [imageRow(labelPx), textRow(labelPx)]) {
        // A block of fixed size in sheet units, the zoom from the floor up.
        for (const [wU, hU] of [[30, 20], [80, 60], [150, 20], [440, 60]] as const) {
          let before = blockControls({ wPx: wU * 0.2, hPx: hU * 0.2, row, zoom: 0.2 });
          for (let zoom = 0.21; zoom <= 4; zoom += 0.01) {
            const now = blockControls({ wPx: wU * zoom, hPx: hU * zoom, row, zoom });
            for (const k of ['label', 'buttons', 'rotate'] as const) {
              expect(!before[k] || now[k], `${k} lost at zoom ${zoom.toFixed(2)} (${wU} × ${hU} units, label ${labelPx} px)`).toBe(true);
            }
            before = now;
          }
        }
      }
    }
  });

  it('the resize handles follow their own rule, whatever the row; never a label under 120 px', () => {
    for (const [w, h] of [[40, 200], [100, 30], [130, 130], [20, 20]]) {
      const without = blockControls({ wPx: w!, hPx: h! });
      const withRow = blockControls({ wPx: w!, hPx: h!, row: imageRow(0), zoom: FAR });
      expect(withRow.handles, `${w} × ${h} px`).toEqual(without.handles);
      if (w! < 120) expect(withRow.label, `${w} × ${h} px`).toBe(false);
    }
  });

  it('without a row (a group\'s frame draws handles only), no row rule', () => {
    expect(blockControls({ wPx: 30, hPx: 200, zoom: FAR })).toMatchObject({ buttons: true, rotate: true });
  });
});

describe('rotateFitsBelow — Q3, the rotate control has room below the block', () => {
  const view = { x: 0, y: 0, w: 1000, h: 700 };
  // The ZoomBar: 140 × 30 px, centred, 12 px above the canvas's bottom.
  const zoomBar = { x: 430, y: 658, w: 140, h: 30 };

  it('room below: true', () => {
    expect(rotateFitsBelow({ centre: { x: 500, y: 300 }, halfH: 50, rotationDeg: 0, view, obstacles: [zoomBar] })).toBe(true);
  });

  it('below would meet the ZoomBar: false (its 24 px hit area starts 14 px under the block)', () => {
    // Block bottom at 636: the rotate spans 650–674, the ZoomBar 658–688.
    expect(rotateFitsBelow({ centre: { x: 500, y: 616 }, halfH: 20, rotationDeg: 0, view, obstacles: [zoomBar] })).toBe(false);
    // The same block away from the ZoomBar, sideways: true.
    expect(rotateFitsBelow({ centre: { x: 200, y: 616 }, halfH: 20, rotationDeg: 0, view, obstacles: [zoomBar] })).toBe(true);
  });

  it('below would leave the visible canvas: false (by more than half a pixel)', () => {
    // Bottom edge at 662: the rotate would span 676–700, inside; at 663, 677–701.
    expect(rotateFitsBelow({ centre: { x: 200, y: 642 }, halfH: 20, rotationDeg: 0, view, obstacles: [] })).toBe(true);
    expect(rotateFitsBelow({ centre: { x: 200, y: 643 }, halfH: 20, rotationDeg: 0, view, obstacles: [] })).toBe(false);
  });

  it('a rotated block: "below" turns with it', () => {
    // Turned 180°, below the block is above it on screen: near the top it has no room.
    expect(rotateFitsBelow({ centre: { x: 200, y: 40 }, halfH: 10, rotationDeg: 180, view, obstacles: [] })).toBe(false);
    expect(rotateFitsBelow({ centre: { x: 200, y: 40 }, halfH: 10, rotationDeg: 0, view, obstacles: [] })).toBe(true);
    // Turned 90° (clockwise), below is to the left.
    expect(rotateFitsBelow({ centre: { x: 30, y: 300 }, halfH: 10, rotationDeg: 90, view, obstacles: [] })).toBe(false);
  });

  it('a canvas not laid out yet (no size) leaves the rotate below', () => {
    expect(rotateFitsBelow({ centre: { x: 0, y: 0 }, halfH: 0, rotationDeg: 0, view: { x: 0, y: 0, w: 0, h: 0 }, obstacles: [] })).toBe(true);
  });
});
