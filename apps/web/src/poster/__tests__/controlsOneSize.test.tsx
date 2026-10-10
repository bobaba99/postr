/**
 * Fix 19 (plan item 19) — a selected block's controls are one size on
 * screen at every zoom. Engineering record: docs/fixes/19-controls-one-size.md.
 *
 * The owner's answers (2026-10-06):
 *   Q1  every control a user grabs has a 24 × 24 CSS px hit area at every
 *       zoom (WCAG 2.5.8), with smaller marks: 8 px handle squares, 20 px
 *       round buttons;
 *   Q2  a block small on screen draws fewer controls: no edge handles along
 *       an axis under 72 px, only the bottom-right corner and the move
 *       button under 24 px on both axes, no type label under 120 px wide;
 *       and (the lead's rule for review finding F3) zoomed far out (under
 *       35%) a handle row wider than its block draws only the move button:
 *       no delete, replace, crop or rotate control;
 *   and table strips and grips, crop mode and a group's handles are one
 *   size like the rest.
 *
 * Entered the way a user enters: a click on the block (Shift + click for a
 * group, the Crop button for crop mode), then the ZoomBar's Zoom out, Zoom
 * in and FIT, and a Ctrl + wheel pinch on the canvas. jsdom does no layout,
 * so a control's size on screen is worked out from its inline styles by
 * CSS's own rules (cssLengthKit.ts): nothing here reads how the fix writes
 * them. In jsdom a block's height is its stored height (no ResizeObserver
 * fires). Where the controls sit against the canvas, the ZoomBar and each
 * other, and a block's rendered height, need layout:
 * scripts/control-size-check.mjs measures those in Chromium, Firefox and
 * WebKit.
 *
 * Re-run: npx vitest run src/poster/__tests__/controlsOneSize.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Record 29 hid the rotate control, the crop button and the table strips (config/features.ts ADJUSTMENTS_ENABLED);
// this file tests that kept code, so it turns the switch on. The shipped
// configuration is src/poster/__tests__/mvpHidden.test.tsx.
vi.mock('@/config/features', async (orig) => ({
  ...(await orig<typeof import('@/config/features')>()),
  ADJUSTMENTS_ENABLED: true,
}));

// Each test clicks the ZoomBar many times: give it room on a loaded machine.
vi.setConfig({ testTimeout: 30_000 });
import { fireEvent, screen } from '@testing-library/react';
import type { Block, PosterDoc } from '@postr/shared';

const authSpies = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: authSpies,
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
  },
}));
vi.mock('@/data/posters', async (orig) => ({
  ...(await orig<typeof import('@/data/posters')>()),
  upsertPoster: vi.fn(async () => ({})),
}));
vi.mock('@/data/thumbnails', () => ({ captureThumbnail: vi.fn(async () => null) }));
// The editor's entrance and the "pop" when a block is selected (GSAP)
// scale the canvas or the block, and the controls with them, for a moment;
// jsdom can leave them mid-way. The sizes at rest are what is measured.
vi.mock('@/motion/timelines/editorEntrance', () => ({ editorEntrance: vi.fn() }));
vi.mock('@/motion/timelines/blockSelection', () => ({ blockSelection: vi.fn() }));
vi.mock('@/data/posterImages', async (orig) => ({
  ...(await orig<typeof import('@/data/posterImages')>()),
  uploadPosterImage: vi.fn(async () => null),
}));

import { NoopResizeObserver, click, load, makeDoc, nextTask, q, renderEditor } from './editorKit';
import { stubScreen, zoomNow } from './workspaceKit';
import { onScreen, resolveLength, scaleAbove } from './cssLengthKit';

/** A 2 × 2 PNG, so image and logo blocks show a picture. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4AWP4z8DwHwyBAMQgYGBgAAB1SQX7nHNiaQAAAABJRU5ErkJggg==';

/** The default poster plus a logo, a contained image and a 4 × 3 table, each with its own room. */
function makeFixture(): PosterDoc {
  const d = makeDoc(48, 36);
  const base = d.blocks[2]!;
  const extra: Block[] = [
    { ...base, id: 'lg1', type: 'logo', x: 330, y: 300, w: 30, h: 20, content: '', imageSrc: PNG, imageFit: 'contain' },
    { ...base, id: 'im1', type: 'image', x: 20, y: 280, w: 30, h: 30, content: '', imageSrc: PNG, imageFit: 'contain' },
    {
      ...base, id: 'tb1', type: 'table', x: 120, y: 240, w: 150, h: 60, content: '',
      tableData: {
        rows: 4, cols: 3,
        cells: ['Measure', 'M (SD)', 'p', 'DV 1', '4.2 (0.8)', '< .01', 'DV 2', '3.1 (1.1)', '.03', 'DV 3', '2.8 (0.6)', '.12'],
        colWidths: null, borderPreset: 'apa',
      },
    } as Block,
  ];
  return { ...d, blocks: [...d.blocks, ...extra] } as PosterDoc;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------- the user's path

/** A 1000 × 640 px canvas: the 48 × 36 in sheet fits at 512 / 360 = 1.42. */
function openEditor(doc: PosterDoc = makeFixture()) {
  stubScreen({ width: 1000, height: 640 });
  load(doc);
  renderEditor();
}

const blockEl = (id: string) => q<HTMLElement>(`#poster-canvas [data-block-id="${id}"]`);

async function selectBlock(id: string, shift = false) {
  fireEvent.click(blockEl(id), { shiftKey: shift });
  await nextTask();
}

/** Click a ZoomBar button until the zoom stops moving. */
async function stepUntilStable(label: 'Zoom in' | 'Zoom out') {
  for (let i = 0; i < 100; i++) {
    const before = zoomNow();
    await click(screen.getByRole('button', { name: label }), label);
    if (Math.abs(zoomNow() - before) < 1e-9) return;
  }
  throw new Error(`${label} never stopped`);
}

/** A pinch (Ctrl + wheel) on the canvas by `factor`: PosterEditor zooms by exp(−deltaY / 240). */
async function pinch(factor: number) {
  fireEvent.wheel(q('[data-postr-canvas-outer]'), { ctrlKey: true, deltaY: -240 * Math.log(factor), clientX: 300, clientY: 300 });
  await nextTask();
}

/**
 * The zooms a user meets: the fit, a pinch in, the floor (Zoom out until it
 * stops), the ceiling (a long pinch in, which stops there); `read` runs at
 * each.
 */
async function atEveryZoom<T>(read: () => T): Promise<{ zoom: number; got: T }[]> {
  const out: { zoom: number; got: T }[] = [];
  await click(screen.getByRole('button', { name: 'Fit poster to screen' }), 'FIT');
  out.push({ zoom: zoomNow(), got: read() });
  await pinch(1.7);
  out.push({ zoom: zoomNow(), got: read() });
  await stepUntilStable('Zoom out');
  out.push({ zoom: zoomNow(), got: read() });
  await pinch(100);
  out.push({ zoom: zoomNow(), got: read() });
  // Preconditions: the four zooms are the ones meant.
  expect(out[0]!.zoom, 'the fit').toBeCloseTo(512 / 360, 6);
  expect(out[1]!.zoom, 'a pinch in').toBeGreaterThan(out[0]!.zoom * 1.5);
  expect(out[2]!.zoom, 'the floor').toBeCloseTo(0.2, 9);
  expect(out[3]!.zoom, 'the ceiling').toBeCloseTo(10, 9);
  return out;
}

// ---------------------------------------------------------------- what a control is

/** The selection's controls: each selected block's handles, row, rotate and stem, crop overlay, a table's strips and grips (selected), and a group's frame. */
function controlRoots(): Element[] {
  const roots: Element[] = [];
  for (const blk of document.querySelectorAll('#poster-canvas > [data-block-id][data-postr-selected="true"]')) {
    roots.push(...blk.querySelectorAll(':scope > [data-postr-resize-handle]'));
    roots.push(...blk.querySelectorAll('[data-postr-selection-ui]'));
    roots.push(...blk.querySelectorAll('[aria-label^="Select row"], [aria-label^="Select column"], [title="Drag to resize column"]'));
  }
  roots.push(...document.querySelectorAll('#poster-canvas > [data-postr-selection-ui]'));
  return roots;
}

/** A name for a control that survives a re-render: its path of labels (or places among unlabelled siblings) from the sheet. */
function keyOf(el: Element): string {
  const parts: string[] = [];
  const name = (e: Element) =>
    e.getAttribute('data-postr-resize-handle') || e.getAttribute('aria-label') || e.getAttribute('title') || e.getAttribute('data-block-id');
  for (let e: Element | null = el; e && e.id !== 'poster-canvas'; e = e.parentElement) {
    const n = name(e);
    if (n) {
      parts.push(`${e.tagName}[${n}]`);
    } else {
      const sibs = [...(e.parentElement?.children ?? [])].filter((s) => s.tagName === e!.tagName && !name(s));
      parts.push(`${e.tagName}#${sibs.indexOf(e)}`);
    }
  }
  return parts.reverse().join('>');
}

/** Every length a control's inline style sets (an SVG's width and height attributes too). */
const PROPS = [
  'width', 'height', 'min-width', 'top', 'left', 'right', 'bottom', 'margin-left', 'margin-top', 'margin-bottom', 'padding', 'gap',
  'padding-left', 'padding-top', 'font-size', 'letter-spacing', 'border-radius', 'border', 'box-shadow', 'filter',
  'background-image', 'background-size',
];

/**
 * Lengths drawn in the sheet's units on purpose: a group frame's box is the
 * outline of its blocks; the crop overlay's kept area is drawn with a
 * shadow spread wide enough to dim the whole block (9999 px) and keeps the
 * sheet's 2-unit frame, as the block's own selection border does.
 */
function inSheetUnitsByDesign(el: Element, prop: string): boolean {
  const st = (el as HTMLElement).style;
  if (el.parentElement?.id === 'poster-canvas' && ['left', 'top', 'width', 'height'].includes(prop)) return true;
  if ((prop === 'box-shadow' || prop === 'border') && st.getPropertyValue('box-shadow').includes('9999px')) return true;
  return false;
}

/** Each control element's lengths on screen (px; a percentage part is not a size). */
function readLengths(): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const els = new Set<Element>();
  for (const r of controlRoots()) {
    els.add(r);
    r.querySelectorAll('*').forEach((c) => els.add(c));
  }
  for (const el of els) {
    const key = keyOf(el);
    for (const prop of PROPS) {
      if (inSheetUnitsByDesign(el, prop)) continue;
      let ls = onScreen(el, prop);
      if (!ls.length && el.tagName.toLowerCase() === 'svg' && (prop === 'width' || prop === 'height') && el.getAttribute(prop)) {
        const k = scaleAbove(el);
        ls = [{ px: resolveLength(el, `${el.getAttribute(prop)}px`).px * (prop === 'width' ? k.x : k.y), pct: 0 }];
      }
      ls.forEach((l, i) => out.set(`${key} ${prop}[${i}]`, [l.px]));
    }
  }
  return out;
}

/** A length's px on screen for one property (the first length it holds). */
const px = (el: Element, prop: string) => onScreen(el, prop)[0]?.px ?? NaN;

/**
 * The width of what an element's background paints, on screen: CSS paints
 * the background over the box `background-clip` names (the border box by
 * default, else inside the border, or inside the padding too).
 */
function paintedWidth(el: Element): number {
  const st = (el as HTMLElement).style;
  const sides = (prop: string) => {
    const ls = onScreen(el, prop).map((l) => l.px);
    // `padding: a` or `padding: a b …`: the left and right are the second
    // value when there are two or more.
    return ls.length === 0 ? 0 : 2 * (ls.length >= 2 ? ls[1]! : ls[0]!);
  };
  const clip = st.getPropertyValue('background-clip') || 'border-box';
  const borderW = sides('border-width');
  let w = px(el, 'width');
  if (clip === 'padding-box' || clip === 'content-box') w -= borderW;
  if (clip === 'content-box') w -= sides('padding');
  return w;
}

/**
 * The size of each control a user grabs, on screen: its width and height,
 * or its thickness alone for a table strip or grip (their length is the
 * row's, the column's or the table's).
 */
function readTargets(): { key: string; dims: number[] }[] {
  const out: { key: string; dims: number[] }[] = [];
  for (const blk of document.querySelectorAll('#poster-canvas > [data-block-id][data-postr-selected="true"]')) {
    const both = [
      ...blk.querySelectorAll(':scope > [data-postr-resize-handle]'),
      ...blk.querySelectorAll('[data-postr-selection-ui] button, button[data-postr-selection-ui]'),
      ...blk.querySelectorAll('[aria-label^="crop "][role="button"]'),
    ];
    for (const el of both) out.push({ key: keyOf(el), dims: [px(el, 'width'), px(el, 'height')] });
    blk.querySelectorAll('[aria-label^="Select row"], [title="Drag to resize column"]').forEach((el) => out.push({ key: keyOf(el), dims: [px(el, 'width')] }));
    blk.querySelectorAll('[aria-label^="Select column"]').forEach((el) => out.push({ key: keyOf(el), dims: [px(el, 'height')] }));
  }
  for (const g of document.querySelectorAll('#poster-canvas > [data-postr-selection-ui] > [data-postr-resize-handle]')) {
    out.push({ key: keyOf(g), dims: [px(g, 'width'), px(g, 'height')] });
  }
  return out;
}

/** Lengths that differ between zooms by more than 0.01 px (rounding). */
function sizesThatMove(steps: { zoom: number; got: Map<string, number[]> }[]): string[] {
  const all = new Map<string, { zoom: number; v: number }[]>();
  for (const s of steps) for (const [k, v] of s.got) (all.get(k) ?? all.set(k, []).get(k)!).push({ zoom: s.zoom, v: v[0]! });
  const bad: string[] = [];
  for (const [k, vs] of all) {
    if (vs.length < 2) continue;
    const lo = Math.min(...vs.map((x) => x.v));
    const hi = Math.max(...vs.map((x) => x.v));
    if (hi - lo > 0.01) bad.push(`${k}: ${vs.map((x) => `${+x.v.toFixed(2)} px at ${+x.zoom.toFixed(2)}`).join(', ')}`);
  }
  return bad;
}

/** Grabbable controls under 24 px on screen, at each zoom. */
function under24(steps: { zoom: number; got: { key: string; dims: number[] }[] }[]): string[] {
  const bad: string[] = [];
  for (const s of steps) {
    for (const t of s.got) {
      if (t.dims.some((d) => !(d >= 24 - 0.01))) bad.push(`${t.key} ${t.dims.map((d) => +d.toFixed(2)).join(' × ')} px at ${+s.zoom.toFixed(2)}`);
    }
  }
  return bad;
}

const show = (xs: string[]) => (xs.length ? `${xs.length}:\n  ${xs.slice(0, 12).join('\n  ')}` : 'none');

// ---------------------------------------------------------------- one size at every zoom

describe('one size on screen at every zoom (S), every grabbable control at least 24 px (Q1)', () => {
  const subjects: [string, () => Promise<void>][] = [
    ['the title', () => selectBlock('t1')],
    ['a logo', () => selectBlock('lg1')],
    ['a contained image', () => selectBlock('im1')],
    ['a table, with its strips and grips', () => selectBlock('tb1')],
    ['a group (Shift + click)', async () => { await selectBlock('t1'); await selectBlock('b1', true); }],
    ['an image in crop mode (its Crop button)', async () => {
      await selectBlock('im1');
      await click(q('#poster-canvas [data-block-id="im1"] button[title="Crop image"]'), 'Crop image');
      expect(q('#poster-canvas [aria-label="crop top edge"]'), 'precondition: crop mode is on').not.toBeNull();
    }],
  ];

  it.each(subjects)('%s: every length its controls draw is the same on screen at every zoom', async (_n, select) => {
    openEditor();
    await select();
    expect(controlRoots().length, 'precondition: the selection draws controls').toBeGreaterThan(0);
    const steps = await atEveryZoom(readLengths);
    expect(show(sizesThatMove(steps)), 'lengths that change with the zoom').toBe('none');
  });

  it.each(subjects)('%s: every control a user grabs is at least 24 px on screen at every zoom', async (_n, select) => {
    openEditor();
    await select();
    const steps = await atEveryZoom(readTargets);
    expect(steps[0]!.got.length, 'precondition: grabbable controls found').toBeGreaterThan(0);
    expect(show(under24(steps)), 'grabbable controls under 24 px').toBe('none');
  });
});

describe('the marks inside the hit areas (Q1)', () => {
  it('a resize handle draws an 8 px square in its 24 px hit area, at every zoom', async () => {
    openEditor();
    await selectBlock('t1');
    const steps = await atEveryZoom(() => {
      const h = q('#poster-canvas [data-block-id="t1"] > [data-postr-resize-handle]');
      const dot = h.firstElementChild!;
      return [px(h, 'width'), px(h, 'height'), px(dot, 'width'), px(dot, 'height')];
    });
    for (const s of steps) {
      const [w, h, dw, dh] = s.got.map((v) => +v.toFixed(3));
      expect([w, h, dw, dh], `at zoom ${s.zoom}`).toEqual([24, 24, 8, 8]);
    }
  });

  it('a round button (move, delete, rotate) shows a 20 px circle in its 24 px hit area, at every zoom', async () => {
    openEditor();
    await selectBlock('t1');
    const steps = await atEveryZoom(() =>
      ['Drag to move', 'Delete block', 'Drag to rotate'].map((t) => {
        const b = q(`#poster-canvas [data-block-id="t1"] button[title^="${t}"]`);
        return [px(b, 'width'), paintedWidth(b)];
      }),
    );
    for (const s of steps) expect(s.got.map(([w, c]) => [+w!.toFixed(3), +c!.toFixed(3)]), `at zoom ${s.zoom}`).toEqual([[24, 20], [24, 20], [24, 20]]);
  });
});

// ---------------------------------------------------------------- Q2: a block small on screen

/** The handles a block draws, by the direction each names (or its place on main). */
const handlesOf = (id: string) =>
  [...q(`#poster-canvas [data-block-id="${id}"]`).querySelectorAll(':scope > [data-postr-resize-handle]')]
    .map((h, i) => h.getAttribute('data-postr-resize-handle') || `#${i}`)
    .sort();
const rowOf = (id: string) => {
  const row = q(`#poster-canvas [data-block-id="${id}"]`).querySelector('[data-postr-selection-ui]');
  return [...(row?.children ?? [])].map((c) => c.getAttribute('title')?.split(' ')[0] ?? 'label');
};
const rotateOf = (id: string) => q(`#poster-canvas [data-block-id="${id}"]`).querySelectorAll('button[title^="Drag to rotate"]').length;

describe('Q2 — a block small on screen draws fewer controls (the owner\'s rule)', () => {
  // The logo is 30 × 20 units and keeps its stored height: 42.7 × 28.4 px at
  // the fit (1.42), 6 × 4 px at the floor, 300 × 200 px at the ceiling.
  it('under 24 px on both axes: only the bottom-right corner and the move button', async () => {
    openEditor();
    await selectBlock('lg1');
    await stepUntilStable('Zoom out');
    expect(zoomNow(), 'precondition: the floor').toBeCloseTo(0.2, 9);
    expect(handlesOf('lg1')).toEqual(['se']);
    expect(rowOf('lg1')).toEqual(['Drag']);
    expect(rotateOf('lg1'), 'no rotate control').toBe(0);
  });

  it('under 72 px on both axes: no edge handles, only the four corners; under 120 px wide, no type label', async () => {
    openEditor();
    await selectBlock('lg1');
    expect(zoomNow(), 'precondition: the fit').toBeCloseTo(512 / 360, 6);
    expect(handlesOf('lg1')).toEqual(['ne', 'nw', 'se', 'sw']);
    expect(rowOf('lg1'), 'move, replace, crop and delete, no label').toEqual(['Drag', 'Replace', 'Crop', 'Delete']);
    expect(rotateOf('lg1'), 'the rotate control').toBe(1);
  });

  it('at 72 px and more on both axes and 120 px wide: all eight handles and the type label', async () => {
    openEditor();
    await selectBlock('lg1');
    await stepUntilStable('Zoom in');
    expect(handlesOf('lg1')).toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w']);
    expect(rowOf('lg1')).toEqual(['Drag', 'label', 'Replace', 'Crop', 'Delete']);
    expect(rotateOf('lg1')).toBe(1);
  });

  it('only one axis under 72 px: that axis\'s edge handles go, the other\'s stay', async () => {
    openEditor();
    // The title, 440 × 60 units (stored; jsdom has no rendered height): at
    // the floor 88 × 12 px, at a pinch to 0.8 352 × 48 px.
    await selectBlock('t1');
    await pinch(0.8 / (512 / 360));
    expect(zoomNow(), 'precondition').toBeCloseTo(0.8, 3);
    expect(handlesOf('t1')).toEqual(['n', 'ne', 'nw', 's', 'se', 'sw']);
  });

  it('a contained image keeps to its corners, and hides them the same way', async () => {
    openEditor();
    await selectBlock('im1');
    expect(handlesOf('im1'), 'at the fit, 42.7 px square').toEqual(['ne', 'nw', 'se', 'sw']);
    await stepUntilStable('Zoom out');
    expect(handlesOf('im1'), 'at the floor, 6 px square').toEqual(['se']);
    await pinch(100);
    expect(zoomNow(), 'precondition: the ceiling').toBeCloseTo(10, 9);
    expect(handlesOf('im1'), 'at the ceiling, 300 px square: still no edge handles').toEqual(['ne', 'nw', 'se', 'sw']);
  });

  it('a group\'s frame follows the same rule (its stored box: 440 × 200 units)', async () => {
    openEditor();
    await selectBlock('t1');
    await selectBlock('b1', true);
    const frame = () => q('#poster-canvas > [data-postr-selection-ui]');
    const dirs = () => [...frame().querySelectorAll(':scope > [data-postr-resize-handle]')].map((h, i) => h.getAttribute('data-postr-resize-handle') || `#${i}`).sort();
    expect(dirs(), 'at the fit, 625 × 284 px').toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w']);
    await stepUntilStable('Zoom out');
    expect(dirs(), 'at the floor, 88 × 40 px').toEqual(['n', 'ne', 'nw', 's', 'se', 'sw']);
  });
});

describe('one axis under 24 px (the implementer\'s rule, so the handles left do not overlap)', () => {
  it('a block under 24 px tall keeps only its bottom row of handles', async () => {
    openEditor();
    await selectBlock('lg1');
    // 30 × 20 units at 1.0: 30 × 20 px.
    await pinch(1 / (512 / 360));
    expect(zoomNow(), 'precondition').toBeCloseTo(1, 3);
    expect(handlesOf('lg1')).toEqual(['se', 'sw']);
    expect(rotateOf('lg1'), 'the rotate control stays').toBe(1);
  });

  it('a block under 24 px wide keeps only its right column of handles', async () => {
    // The logo made narrow and tall: 10 × 60 units.
    const d = makeFixture();
    openEditor({ ...d, blocks: d.blocks.map((b) => (b.id === 'lg1' ? { ...b, w: 10, h: 60 } : b)) } as PosterDoc);
    await selectBlock('lg1');
    await pinch(1.5 / (512 / 360));
    expect(zoomNow(), 'precondition').toBeCloseTo(1.5, 3);
    // 15 × 90 px: under 24 wide, at least 72 tall.
    expect(handlesOf('lg1')).toEqual(['e', 'ne', 'se']);
  });
});

describe('zoomed far out, a handle row wider than its block shows only the move button (review F3, the lead\'s rule)', () => {
  // The row's own controls, 24 px each and 4 px apart: move, (the label),
  // delete, and an image's or logo's replace and crop. Zoomed far out they
  // reached over the neighbours, and a click meant for one could delete the
  // selected block; under 35% (measured: record 19, section 9) such a row is
  // cut to its move button. At editing zooms it stays whole.
  /** The logo made wide and thin: 150 × 20 units (at the floor 30 × 4 px: not under 24 px on both axes). */
  const wideLogo = () => {
    const d = makeFixture();
    return { ...d, blocks: d.blocks.map((b) => (b.id === 'lg1' ? { ...b, w: 150 } : b)) } as PosterDoc;
  };

  it('the logo at the fit, 42.7 px wide (its row: 108 px): Replace, Crop, Delete and the rotate control stay', async () => {
    openEditor();
    await selectBlock('lg1');
    expect(zoomNow(), 'precondition: the fit').toBeCloseTo(512 / 360, 6);
    expect(rowOf('lg1')).toEqual(['Drag', 'Replace', 'Crop', 'Delete']);
    expect(rotateOf('lg1')).toBe(1);
  });

  it('a 150 × 20 unit logo at the floor, 30 px wide: the move button only, no rotate control', async () => {
    openEditor(wideLogo());
    await selectBlock('lg1');
    await stepUntilStable('Zoom out');
    expect(zoomNow(), 'precondition: the floor').toBeCloseTo(0.2, 9);
    expect(rowOf('lg1')).toEqual(['Drag']);
    expect(rotateOf('lg1'), 'no rotate control').toBe(0);
    expect(handlesOf('lg1'), 'its handles as the owner\'s rule draws them').toEqual(['se', 'sw']);
  });

  it('a 300 × 20 unit logo at the floor, 60 px: wider than a text block\'s row (52 px), narrower than its own (108 px), so cut', async () => {
    const d = makeFixture();
    openEditor({ ...d, blocks: d.blocks.map((b) => (b.id === 'lg1' ? { ...b, x: 100, w: 300 } : b)) } as PosterDoc);
    await selectBlock('lg1');
    await stepUntilStable('Zoom out');
    expect(rowOf('lg1')).toEqual(['Drag']);
    expect(rotateOf('lg1')).toBe(0);
  });

  it('the same logo across the threshold: cut at 34%, whole at 36% (51 and 54 px wide, both narrower than its row)', async () => {
    openEditor(wideLogo());
    await selectBlock('lg1');
    await pinch(0.34 / (512 / 360));
    expect(zoomNow(), 'precondition').toBeCloseTo(0.34, 3);
    expect(rowOf('lg1')).toEqual(['Drag']);
    expect(rotateOf('lg1')).toBe(0);
    await pinch(0.36 / 0.34);
    expect(zoomNow(), 'precondition').toBeCloseTo(0.36, 3);
    expect(rowOf('lg1')).toEqual(['Drag', 'Replace', 'Crop', 'Delete']);
    expect(rotateOf('lg1')).toBe(1);
  });

  it('the title at the floor, 88 px wide (its row: 52 px): move, delete and the rotate control', async () => {
    openEditor();
    await selectBlock('t1');
    await stepUntilStable('Zoom out');
    expect(rowOf('t1')).toEqual(['Drag', 'Delete']);
    expect(rotateOf('t1')).toBe(1);
  });

  it.each(['Delete', 'Backspace'])('the logo with only its move button is still deleted by the %s key', async (key) => {
    openEditor(wideLogo());
    await selectBlock('lg1');
    await stepUntilStable('Zoom out');
    expect(rowOf('lg1'), 'precondition: no delete button').toEqual(['Drag']);
    fireEvent.keyDown(window, { key });
    await nextTask();
    expect(document.querySelector('#poster-canvas [data-block-id="lg1"]'), 'the logo is gone').toBeNull();
  });

  it('the logo with only its move button is still deleted from its right-click menu', async () => {
    openEditor(wideLogo());
    await selectBlock('lg1');
    await stepUntilStable('Zoom out');
    expect(rowOf('lg1'), 'precondition: no delete button').toEqual(['Drag']);
    fireEvent.contextMenu(blockEl('lg1'), { clientX: 200, clientY: 200 });
    await nextTask();
    fireEvent.click(screen.getByRole('button', { name: /^Delete\s*⌫$/ }));
    await nextTask();
    expect(document.querySelector('#poster-canvas [data-block-id="lg1"]'), 'the logo is gone').toBeNull();
  });
});

// ---------------------------------------------------------------- the table's strips when not selected

describe('an unselected table\'s strips and grips are drawn as before (Q7 is on the Later list)', () => {
  it('8 units wide, 10 units out, in the sheet\'s units: they keep their footprint around the table', async () => {
    openEditor();
    const strip = q('#poster-canvas [data-block-id="tb1"] [aria-label="Select row 1"]');
    const col = q('#poster-canvas [data-block-id="tb1"] [aria-label="Select column 1"]');
    const grip = q('#poster-canvas [data-block-id="tb1"] [title="Drag to resize column"]');
    // In the table's own space (the sheet's units): no scale of their own.
    const units = (el: Element, prop: string) => resolveLength(el, (el as HTMLElement).style.getPropertyValue(prop)).px;
    expect([units(strip, 'left'), units(strip, 'width'), units(col, 'top'), units(col, 'height'), units(grip, 'width')]).toEqual([-10, 8, -10, 8, 6]);
    expect([strip, col, grip].map((e) => (e as HTMLElement).style.transform || 'none'), 'no scale back').toEqual(['none', 'none', 'none']);
  });
});
