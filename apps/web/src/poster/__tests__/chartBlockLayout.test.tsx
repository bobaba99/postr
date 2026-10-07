/**
 * Plan item 13 part 2, stream Q — Postr's own inserted charts never print
 * their text below the canonical minimums, and their caption is never
 * clipped. Record: docs/fixes/13c-chart-text-minimums.md.
 *
 * Before the fix the chart was drawn at the block's stored size while the
 * frame's border leaves a smaller box, its legend grew the svg so the
 * viewBox shrank every text, axis titles were rounded down (33.33 px to
 * 33 px), and a caption took height from the same fixed block, so it fell
 * past the frame, which clips.
 *
 * Entry points are the user's: a saved poster opened in the editor, and
 * Figure › Make a figure › Insert. jsdom does no layout, so the browser's
 * part is played by a ResizeObserver that reports the box the chart's host
 * was laid out in, the way the browser does after layout; what the layout
 * itself gives (the box, the caption under the chart, nothing clipped) is
 * measured in the browser by scripts/chart-print-size-check.mjs.
 *
 * Re-run: npx vitest run src/poster/__tests__/chartBlockLayout.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block, ChartSpec, PosterDoc } from '@postr/shared';

vi.mock('@/lib/supabase', () => {
  const chain = {
    eq: () => chain,
    order: () => Promise.resolve({ data: [], error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return {
    supabase: {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
        getSession: vi.fn(async () => ({ data: { session: null } })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
      from: () => ({ select: () => chain }),
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
    },
  };
});
vi.mock('@/data/posters', async (orig) => ({
  ...(await orig<typeof import('@/data/posters')>()),
  upsertPoster: vi.fn(async () => ({})),
}));
vi.mock('@/data/thumbnails', () => ({ captureThumbnail: vi.fn(async () => null) }));

type Kit = typeof import('./editorKit');
type Rtl = typeof import('@testing-library/react');
let k: Kit;
let rtl: Rtl;
let view: { unmount: () => void } | null = null;

/** Render px per printed pt at ChartBlock's 10 px per poster unit (7.2 pt). */
const PX_PER_PT = 10 / 7.2;

/**
 * The browser's ResizeObserver, played by the test: it reports, when asked,
 * the content box an observed element was laid out in, in CSS px before the
 * canvas's zoom transform, which on the sheet are poster units.
 */
const observers: Array<{ cb: ResizeObserverCallback; els: Set<Element>; self: unknown }> = [];
class LayoutObserver {
  private entry: { cb: ResizeObserverCallback; els: Set<Element>; self: unknown };
  constructor(cb: ResizeObserverCallback) {
    this.entry = { cb, els: new Set(), self: this };
    observers.push(this.entry);
  }
  observe(el: Element) { this.entry.els.add(el); }
  unobserve(el: Element) { this.entry.els.delete(el); }
  disconnect() { this.entry.els.clear(); }
}
function report(root: Element, w: number, h: number) {
  for (const o of observers) {
    const els = [...o.els].filter((el) => root.contains(el));
    if (!els.length) continue;
    const entries = els.map((target) => ({
      target,
      contentRect: { width: w, height: h, x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, toJSON: () => ({}) },
      borderBoxSize: [{ inlineSize: w, blockSize: h }],
      contentBoxSize: [{ inlineSize: w, blockSize: h }],
      devicePixelContentBoxSize: [],
    })) as unknown as ResizeObserverEntry[];
    o.cb(entries, o.self as ResizeObserver);
  }
}
/** Lay out every observed element inside `root` at w × h (poster units). */
async function layOut(root: Element, w: number, h: number) {
  await rtl.act(async () => report(root, w, h));
}
/**
 * The same, with React's updates and effects flushed but no promise let
 * run: what is on screen while the chart redraws for the new box.
 */
function layOutMidDraw(root: Element, w: number, h: number) {
  rtl.act(() => report(root, w, h));
}

const cat = (names: string[]) => names.map((name) => ({ name, kind: 'category' as const }));
/** A grouped bar with a legend: `series` arms, four visits. */
function groupedSpec(series: string[]): ChartSpec {
  return {
    version: 1,
    form: 'bar-grouped',
    data: {
      columns: [...cat(['Visit', 'Arm']), { name: 'Score', kind: 'number' }],
      rows: ['Week 1', 'Week 4', 'Week 8', 'Week 12'].flatMap((g, i) => series.map((s, j) => [g, s, 10 + i * 3 + j * 2])),
    },
    encoding: { x: 'Visit', y: 'Score', series: 'Arm' },
    options: { legend: true, sort: 'none', horizontal: false, directLabel: 'none' },
    paletteSlots: ['accent', 'primary'],
    xLabel: 'Visit',
    yLabel: 'Score',
  };
}
const SAMPLE_CAPTION = 'Sample data, not real results. Mean score by visit and arm.';
function chartBlock(over: Partial<Block> = {}): Block {
  return {
    id: 'c1', type: 'chart', x: 40, y: 60, w: 100, h: 70, content: '', imageSrc: null, imageFit: 'contain', tableData: null,
    chartSpec: groupedSpec(['Control', 'Treated']), caption: SAMPLE_CAPTION, captionPosition: 'bottom',
    ...over,
  } as Block;
}

async function openPoster(blocks: Block[]) {
  view?.unmount();
  view = null;
  vi.resetModules();
  k = await import('./editorKit');
  rtl = await import('@testing-library/react');
  const { usePosterStore } = await import('@/stores/posterStore');
  const doc = k.makeDoc() as PosterDoc;
  usePosterStore.getState().setPoster('fixture-1', { ...doc, blocks: [...doc.blocks, ...blocks] }, k.NAME);
  view = k.renderEditor();
  await k.nextTask();
}
const frame = (id = 'c1') => k.q<HTMLElement>(`[data-block-id="${id}"]`);
const chartSvg = (id = 'c1') => frame(id)?.querySelector('svg[viewBox]') as SVGSVGElement | null;
async function svgWith(pred: (svg: SVGSVGElement) => boolean, id = 'c1'): Promise<SVGSVGElement> {
  await rtl.waitFor(() => {
    const svg = chartSvg(id);
    expect(svg && pred(svg)).toBe(true);
  }, { timeout: 4000 });
  return chartSvg(id)!;
}
const viewBox = (svg: SVGSVGElement) => svg.getAttribute('viewBox')!.split(' ').map(Number);
const fontPx = (el: Element | null) => parseFloat(el?.getAttribute('font-size') ?? 'NaN');
const legendTexts = (svg: SVGSVGElement) => [...svg.querySelectorAll('[aria-label="legend"] text')];
/** The caption's own div: its first child is the bold "Figure N.". */
const captionDiv = (id = 'c1') =>
  [...frame(id).querySelectorAll('div')].find((d) => d.firstElementChild?.tagName === 'B' && /^Figure \d+\.$/.test(d.firstElementChild.textContent ?? '')) ?? null;

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', LayoutObserver);
});
afterEach(() => {
  view?.unmount();
  view = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('item 13 part 2 (stream Q) — a chart draws at the box it is laid out in', () => {
  it('renders at the laid-out box, not the stored block size (the frame border takes 2 units)', async () => {
    await openPoster([chartBlock({ captionPosition: 'none' })]);
    await layOut(frame(), 98, 68);
    const svg = await svgWith((s) => viewBox(s)[2] === 980);
    expect(viewBox(svg)).toEqual([0, 0, 980, 680]);
  });

  it('lays the legend out inside the box: the svg is as tall as the box, so nothing shrinks its text', async () => {
    await openPoster([chartBlock({ captionPosition: 'none' })]);
    await layOut(frame(), 98, 68);
    const svg = await svgWith((s) => viewBox(s)[2] === 980);
    expect(legendTexts(svg).length).toBe(2);
    expect(viewBox(svg)[3]).toBe(680);
    expect(Number(svg.getAttribute('height'))).toBe(680);
  });

  it('draws tick and legend text at 18 pt and axis titles at 24 pt, not rounded down', async () => {
    await openPoster([chartBlock({ captionPosition: 'none' })]);
    await layOut(frame(), 98, 68);
    const svg = await svgWith((s) => viewBox(s)[2] === 980);
    for (const t of legendTexts(svg)) expect(fontPx(t)).toBeCloseTo(18 * PX_PER_PT, 6);
    const titles = [...svg.querySelectorAll('[aria-label="y-axis label"], [aria-label="fx-axis label"]')];
    expect(titles.length).toBe(2);
    for (const g of titles) expect(fontPx(g)).toBeCloseTo(24 * PX_PER_PT, 6);
  });

  it('follows the box when the layout changes (a side caption, a selected frame)', async () => {
    await openPoster([chartBlock({ captionPosition: 'none' })]);
    await layOut(frame(), 98, 68);
    await svgWith((s) => viewBox(s)[2] === 980);
    await layOut(frame(), 63.7, 70);
    const svg = await svgWith((s) => viewBox(s)[2] === 637);
    expect(viewBox(svg)[3]).toBe(700);
  });

  it('keeps the chart on screen while it redraws for a new box (no "Rendering chart…" flash)', async () => {
    await openPoster([chartBlock({ captionPosition: 'none' })]);
    await layOut(frame(), 98, 68);
    await svgWith((s) => viewBox(s)[2] === 980);
    layOutMidDraw(frame(), 97, 67);
    expect(chartSvg()).not.toBeNull();
    expect(frame().textContent).not.toMatch(/Rendering chart/);
    await svgWith((s) => viewBox(s)[2] === 970);
  });

  it('without a layout (no box reported) draws at the stored size, as before', async () => {
    await openPoster([chartBlock({ captionPosition: 'none' })]);
    const svg = await svgWith((s) => viewBox(s)[2] === 1000);
    expect(viewBox(svg)[2]).toBe(1000);
  });

  it('in a box too small for the legend at 18 pt, scales its text toward the minimums, never below 14 pt', async () => {
    const eight = ['Placebo arm', 'Low dose arm', 'Medium dose arm', 'High dose arm', 'Active comparator', 'Open-label extension', 'Standard of care', 'Waitlist control'];
    await openPoster([chartBlock({ w: 60, h: 45, captionPosition: 'none', chartSpec: groupedSpec(eight) })]);
    await layOut(frame(), 58, 43);
    const svg = await svgWith((s) => viewBox(s)[2] === 580);
    const sizes = legendTexts(svg).map(fontPx);
    expect(sizes.length).toBe(8);
    for (const s of sizes) {
      expect(s).toBeGreaterThanOrEqual(14 * PX_PER_PT - 1e-9);
      expect(s).toBeLessThan(18 * PX_PER_PT);
    }
    expect(Number(svg.getAttribute('height'))).toBeLessThanOrEqual(430);
    // Scaled, still not rounded: the tick labels (the svg's base font), the
    // legend and the axis titles keep one scale, a step of a quarter point
    // of tick text, where a rounded px size would land between steps.
    const tickPt = parseFloat(svg.style.fontSize) / PX_PER_PT;
    expect(Math.abs(tickPt * 4 - Math.round(tickPt * 4))).toBeLessThan(1e-6);
    for (const s of sizes) expect(s / PX_PER_PT).toBeCloseTo(tickPt, 6);
    const titles = [...svg.querySelectorAll('[aria-label="y-axis label"], [aria-label="fx-axis label"]')];
    expect(titles.length).toBe(2);
    for (const g of titles) expect(fontPx(g) / PX_PER_PT).toBeCloseTo((tickPt * 24) / 18, 6);
  });
});

describe('item 13 part 2 (stream Q) — a chart block has the caption chrome image blocks have', () => {
  it('a bottom caption adds to the block: the chart keeps the block height, the frame grows', async () => {
    await openPoster([chartBlock()]);
    const cap = captionDiv();
    expect(cap?.textContent).toContain(SAMPLE_CAPTION);
    // The chart's body is pinned to the block's height, and the caption
    // follows it in the flow; the frame is not held at the block height.
    const body = cap!.previousElementSibling as HTMLElement;
    expect((body.firstElementChild as HTMLElement).style.height).toBe('70px');
    expect(frame().style.height).toBe('auto');
  });

  it('a side caption does not clip the chart: the frame grows with it too', async () => {
    await openPoster([chartBlock({ captionPosition: 'right' })]);
    expect(captionDiv()?.textContent).toContain(SAMPLE_CAPTION);
    expect(frame().style.height).toBe('auto');
  });

  it('a hidden caption and no note keep the block at its height', async () => {
    await openPoster([chartBlock({ captionPosition: 'none' })]);
    expect(captionDiv()).toBeNull();
    expect(frame().style.height).toBe('70px');
  });
});

describe('item 13 part 2 (stream Q) — Insert keeps the sample-data caption with the chart', () => {
  it('Figure › Make a figure › sample data › Insert: the caption with its prefix is under a pinned chart', async () => {
    await openPoster([]);
    k.openTab(/^figure$/i);
    await k.nextTask();
    if (k.findButton('Make a figure')?.getAttribute('aria-pressed') !== 'true') await k.click(k.findButton('Make a figure'), 'Make a figure');
    await k.click(k.findButton('I don’t have data yet'), 'no data');
    await k.click(k.findButton('A number compared across groups'), 'shape');
    for (let i = 0; i < 6 && !k.findButton('Insert selected figures'); i += 1) {
      const groups = [...document.querySelectorAll('[role="group"]')];
      const next = groups.reverse().map((g) => g.querySelector('button[aria-pressed="false"]')).find(Boolean);
      if (!next) break;
      await k.click(next, 'first answer');
    }
    const insert = await rtl.waitFor(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /^Insert selected figures/.test(x.textContent?.trim() ?? ''));
      expect(b).toBeTruthy();
      return b!;
    });
    await k.click(insert, 'Insert selected figures');
    const { usePosterStore } = await import('@/stores/posterStore');
    const chart = usePosterStore.getState().doc!.blocks.find((b) => b.type === 'chart')!;
    expect(chart.caption?.startsWith('Sample data, not real results.')).toBe(true);
    const cap = captionDiv(chart.id);
    expect(cap?.textContent).toContain('Sample data, not real results.');
    expect(((cap!.previousElementSibling as HTMLElement).firstElementChild as HTMLElement).style.height).toBe(`${chart.h}px`);
    expect(frame(chart.id).style.height).toBe('auto');
  });
});

describe('item 13 part 2 (stream Q) — labels too long for their room wrap, so none runs past the chart', () => {
  const lines = (el: Element | null | undefined) => el?.querySelectorAll('tspan').length ?? 0;
  const ticks = (svg: SVGSVGElement, axis: string) => [...svg.querySelectorAll(`[aria-label="${axis}-axis tick label"] text`)];

  it('Likert statements left of the plot wrap onto lines', async () => {
    const statements = ['I would recommend it to others', 'The intervention was easy to follow', 'The sessions fit my schedule'];
    const levels = ['Disagree', 'Neutral', 'Agree'];
    const spec: ChartSpec = {
      version: 1, form: 'bar-diverging',
      data: { columns: [...cat(['Statement', 'Response']), { name: 'Percent', kind: 'number' }],
        rows: statements.flatMap((s, i) => levels.map((l, j) => [s, l, 10 + i * 5 + j * 10])) },
      encoding: { y: 'Statement', series: 'Response', value: 'Percent' },
      options: { legend: true, sort: 'none', horizontal: false, directLabel: 'none' }, paletteSlots: ['accent'],
    };
    await openPoster([chartBlock({ w: 60, h: 45, captionPosition: 'none', chartSpec: spec })]);
    await layOut(frame(), 58, 43);
    const svg = await svgWith((s) => viewBox(s)[2] === 580);
    const labels = ticks(svg, 'y');
    expect(labels.length).toBe(3);
    for (const t of labels) expect(lines(t)).toBeGreaterThanOrEqual(2);
  });

  it('two-word categories under a narrow plot wrap onto lines', async () => {
    const groups = ['Waitlist control', 'Low dose', 'High dose', 'Combined therapy', 'Placebo pill', 'Usual care'];
    const spec: ChartSpec = {
      version: 1, form: 'bar',
      data: { columns: [...cat(['Condition']), { name: 'Score', kind: 'number' }], rows: groups.map((g, i) => [g, 10 + i]) },
      encoding: { x: 'Condition', y: 'Score' },
      options: { legend: false, sort: 'none', horizontal: false, directLabel: 'none' }, paletteSlots: ['accent'],
      xLabel: 'Condition', yLabel: 'Score',
    };
    await openPoster([chartBlock({ w: 60, h: 45, captionPosition: 'none', chartSpec: spec })]);
    await layOut(frame(), 58, 43);
    const svg = await svgWith((s) => viewBox(s)[2] === 580);
    const low = ticks(svg, 'x').find((t) => t.textContent?.replace(/\s+/g, ' ').includes('Low'));
    expect(lines(low)).toBe(2);
  });

  it('long series names at the lines’ ends wrap onto lines', async () => {
    const sites = ['Acme State University', 'Sample Research Institute'];
    const spec: ChartSpec = {
      version: 1, form: 'line',
      data: { columns: [{ name: 'Month', kind: 'number' }, ...cat(['Site']), { name: 'Enrolled', kind: 'number' }],
        rows: sites.flatMap((s, i) => [1, 2, 3, 4].map((m) => [m, s, 10 + m * (i + 1)])) },
      encoding: { x: 'Month', y: 'Enrolled', series: 'Site' },
      options: { legend: true, sort: 'none', horizontal: false, directLabel: 'auto' }, paletteSlots: ['accent', 'primary'],
      xLabel: 'Month', yLabel: 'Enrolled',
    };
    await openPoster([chartBlock({ w: 60, h: 45, captionPosition: 'none', chartSpec: spec })]);
    await layOut(frame(), 58, 43);
    const svg = await svgWith((s) => viewBox(s)[2] === 580);
    const ends = [...svg.querySelectorAll('[aria-label="text"] text')];
    expect(ends.length).toBe(2);
    for (const t of ends) expect(lines(t)).toBeGreaterThanOrEqual(2);
  });

  it('a y title longer than the chart is wide wraps above the plot', async () => {
    const spec: ChartSpec = {
      version: 1, form: 'bar',
      data: { columns: [...cat(['Condition']), { name: 'Mean reaction time across all sessions (ms)', kind: 'number' }], rows: [['A', 3], ['B', 5]] },
      encoding: { x: 'Condition', y: 'Mean reaction time across all sessions (ms)' },
      options: { legend: false, sort: 'none', horizontal: false, directLabel: 'none' }, paletteSlots: ['accent'],
      xLabel: 'Condition', yLabel: 'Mean reaction time across all sessions (ms)',
    };
    await openPoster([chartBlock({ w: 60, h: 45, captionPosition: 'none', chartSpec: spec })]);
    await layOut(frame(), 58, 43);
    const svg = await svgWith((s) => viewBox(s)[2] === 580);
    const title = svg.querySelector('[aria-label="y-axis label"] text');
    expect(lines(title)).toBe(2);
    expect(title?.textContent).toContain('sessions');
  });

  it('a single stacked bar (shares of one whole) stays a short bar in a tall box', async () => {
    const spec: ChartSpec = {
      version: 1, form: 'bar-stacked',
      data: { columns: [...cat(['Task']), { name: 'Share', kind: 'number' }], rows: [['Direct care', 40], ['Documentation', 30], ['Training', 30]] },
      encoding: { series: 'Task', y: 'Share' },
      options: { legend: true, sort: 'value', horizontal: false, directLabel: 'none' }, paletteSlots: ['accent'],
      yLabel: 'Share',
    };
    await openPoster([chartBlock({ captionPosition: 'none', chartSpec: spec })]);
    await layOut(frame(), 98, 68);
    const svg = await svgWith((s) => viewBox(s)[2] === 980);
    expect(viewBox(svg)[3]).toBeLessThan(400);
  });
});

/*
 * Review round 1 of fix 13c (record section 9): its findings, each entered
 * where the user enters (a saved poster opened in the editor, the chart's
 * host laid out by the played ResizeObserver; Export › ⎙ Save PDF). jsdom
 * has no canvas, so text is measured by the estimate there; the yardstick
 * these tests hold labels to is a narrower one, 0.55 em a character, so a
 * test does not pass merely because the layout used the same estimate.
 * The browser harness measures the real font.
 */
const YARD_EM = 0.55;
const yard = (text: string | null | undefined, px: number) => (text ?? '').length * YARD_EM * px;
const TRANSLATE = /translate\(\s*(-?[\d.]+(?:e-?\d+)?)[ ,]+(-?[\d.]+(?:e-?\d+)?)/i;
function translate(el: Element | null): [number, number] {
  const m = el?.getAttribute('transform')?.match(TRANSLATE);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}
/** Where a Plot text is drawn: its own translate() and its group's. */
function at(t: Element): [number, number] {
  const [gx, gy] = translate(t.parentElement);
  const [x, y] = translate(t);
  return [gx + x, gy + y];
}
const tickPx = (svg: SVGSVGElement) => parseFloat(svg.style.fontSize);
const linesOf = (t: Element) => [...t.querySelectorAll('tspan')].map((s) => s.textContent ?? '').filter(Boolean).length || 1;
/** The scale the viewBox is shown at in a host laid out at w × h poster units. */
const shownScale = (svg: SVGSVGElement, w: number, h: number) => Math.min((w * 10) / viewBox(svg)[2]!, (h * 10) / viewBox(svg)[3]!);
const px = (s: string | undefined) => parseFloat(s ?? 'NaN');

const ARMS = [
  'Placebo plus standard care (n = 40)', 'Low-dose ketamine infusion (n = 38)', 'Medium-dose ketamine infusion (n = 41)',
  'High-dose ketamine infusion (n = 37)', 'Active comparator: midazolam (n = 39)', 'Electroconvulsive therapy reference arm',
  'Open-label extension cohort A', 'Open-label extension cohort B', 'Sham stimulation control', 'Healthy volunteers (reference)',
];
function likertSpec(statements: string[]): ChartSpec {
  const levels = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
  return {
    version: 1, form: 'bar-diverging',
    data: { columns: [...cat(['Statement', 'Response']), { name: 'Count', kind: 'number' }],
      rows: statements.flatMap((s, i) => levels.map((l, j) => [s, l, 3 + ((i + j * 3) % 7) * 4])) },
    encoding: { y: 'Statement', series: 'Response', value: 'Count' },
    options: { legend: true, sort: 'none', horizontal: false, directLabel: 'none' }, paletteSlots: ['accent'],
  };
}
function millionsLine(seriesNames: string[]): ChartSpec {
  const y = 'Total research funding awarded (Canadian dollars)';
  return {
    version: 1, form: 'line',
    data: { columns: [{ name: 'Year', kind: 'number' }, ...cat(['Funding source']), { name: y, kind: 'number' }],
      rows: seriesNames.flatMap((s, j) => Array.from({ length: 10 }, (_, i) => [2015 + i, s, 1250000 + j * 900000 + i * 410000])) },
    encoding: { x: 'Year', y, series: 'Funding source' },
    options: { legend: true, sort: 'none', horizontal: false, directLabel: 'auto' }, paletteSlots: ['accent', 'primary', 'secondary'],
    xLabel: 'Year', yLabel: y,
  };
}

describe('fix 13c review Q-R1 — a chart too small for its text at the minimums grows; its text never prints below them', () => {
  it('ten long-named series in a 6 × 4.5 in block: the frame grows, and every text prints at or above the minimum', async () => {
    await openPoster([chartBlock({ w: 60, h: 45, captionPosition: 'none', chartSpec: groupedSpec(ARMS) })]);
    await layOut(frame(), 58, 43);
    await svgWith((s) => viewBox(s)[2] === 580);
    await k.nextTask();
    // The browser lays the host out in the frame as it now is (grown, when
    // the chart reported a least height taller than the block); the chart
    // redraws there, or comes out taller than its box.
    const hostH = px(frame().style.height) - 2;
    await layOut(frame(), 58, hostH);
    const svg = await svgWith((s) => viewBox(s)[2] === 580 && viewBox(s)[3]! >= hostH * 10 - 1e-6);
    const shown = shownScale(svg, 58, hostH);
    expect(shown).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(tickPx(svg) * shown).toBeGreaterThanOrEqual(14 * PX_PER_PT - 1e-9);
    for (const t of legendTexts(svg)) expect(fontPx(t) * shown).toBeGreaterThanOrEqual(14 * PX_PER_PT - 1e-9);
    for (const g of svg.querySelectorAll('[aria-label$="-axis label"]')) expect(fontPx(g) * shown).toBeGreaterThanOrEqual(18 * PX_PER_PT - 1e-9);
    // It grew by no more than the minimums need: drawn at them (and the
    // chart's 0.5 % margin for print), not above.
    expect(hostH).toBeGreaterThan(43);
    expect(tickPx(svg) * shown).toBeCloseTo(14 * 1.005 * PX_PER_PT, 6);
  });

  it('under a caption, the chart’s pinned body grows instead', async () => {
    await openPoster([chartBlock({ w: 60, h: 45, captionPosition: 'bottom', chartSpec: groupedSpec(ARMS) })]);
    await layOut(frame(), 58, 45);
    await svgWith((s) => viewBox(s)[2] === 580);
    const body = () => (captionDiv()!.previousElementSibling as HTMLElement).firstElementChild as HTMLElement;
    await rtl.waitFor(() => expect(px(body().style.height)).toBeGreaterThan(45));
  });

  it('a chart that fits keeps the block’s height', async () => {
    await openPoster([chartBlock({ captionPosition: 'none' })]);
    await layOut(frame(), 98, 68);
    await svgWith((s) => viewBox(s)[2] === 980);
    expect(frame().style.height).toBe('70px');
  });
});

describe('fix 13c review Q-R2 to Q-R4 — no label runs past the chart or into another', () => {
  it('Q-R2: y tick labels of a million fit inside the chart’s left edge', async () => {
    await openPoster([chartBlock({ captionPosition: 'none', chartSpec: millionsLine(['Federal councils', 'Provincial agencies', 'Private foundations']) })]);
    await layOut(frame(), 98, 68);
    const svg = await svgWith((s) => viewBox(s)[2] === 980);
    const labels = [...svg.querySelectorAll('[aria-label="y-axis tick label"] text')];
    expect(labels.some((t) => /,000,000/.test(t.textContent ?? ''))).toBe(true);
    // Each label ends at its anchor (text-anchor end) and starts its width left of it.
    for (const t of labels) expect(at(t)[0] - yard(t.textContent, tickPx(svg))).toBeGreaterThanOrEqual(0);
  });

  it('Q-R2: the last x tick label at the plot’s right end fits inside the chart’s right edge', async () => {
    const spec: ChartSpec = {
      version: 1, form: 'bar',
      data: { columns: [...cat(['Site']), { name: 'Steps', kind: 'number' }], rows: [['North', 4000], ['South', 8000], ['East', 12000]] },
      encoding: { x: 'Site', y: 'Steps' },
      options: { legend: false, sort: 'none', horizontal: true, directLabel: 'none' }, paletteSlots: ['accent'],
      xLabel: 'Site', yLabel: 'Steps',
    };
    await openPoster([chartBlock({ captionPosition: 'none', chartSpec: spec })]);
    await layOut(frame(), 98, 68);
    const svg = await svgWith((s) => viewBox(s)[2] === 980);
    const labels = [...svg.querySelectorAll('[aria-label="x-axis tick label"] text')];
    const last = labels.find((t) => t.textContent === '12,000');
    expect(last).toBeTruthy();
    expect(at(last!)[0] + yard(last!.textContent, tickPx(svg)) / 2).toBeLessThanOrEqual(980);
  });

  it('a category axis’s title under the plot, centred there, wraps to stay inside both edges', async () => {
    const x = 'Intervention received during the twelve-week trial period';
    const spec: ChartSpec = {
      version: 1, form: 'bar',
      data: { columns: [...cat([x]), { name: 'Funding', kind: 'number' }], rows: [['A', 1250000], ['B', 4800000], ['C', 9200000]] },
      encoding: { x, y: 'Funding' },
      options: { legend: false, sort: 'none', horizontal: false, directLabel: 'none' }, paletteSlots: ['accent'],
      xLabel: x, yLabel: 'Funding',
    };
    await openPoster([chartBlock({ w: 60, h: 45, captionPosition: 'none', chartSpec: spec })]);
    await layOut(frame(), 58, 43);
    const svg = await svgWith((s) => viewBox(s)[2] === 580);
    const g = svg.querySelector('[aria-label="x-axis label"]')!;
    const t = g.querySelector('text')!;
    const centre = at(t)[0];
    const lines = [...t.querySelectorAll('tspan')].map((s) => s.textContent ?? '');
    for (const l of lines.length ? lines : [t.textContent ?? '']) {
      expect(centre - yard(l, fontPx(g)) / 2).toBeGreaterThanOrEqual(0);
      expect(centre + yard(l, fontPx(g)) / 2).toBeLessThanOrEqual(580);
    }
  });

  it('years under a plot too narrow for one character a band are labelled every other band, none wider than its room', async () => {
    const years = Array.from({ length: 12 }, (_, i) => String(2013 + i));
    const spec: ChartSpec = {
      version: 1, form: 'bar',
      data: { columns: [...cat(['Year']), { name: 'Grants', kind: 'number' }], rows: years.map((y, i) => [y, 10 + i]) },
      encoding: { x: 'Year', y: 'Grants' },
      options: { legend: false, sort: 'none', horizontal: false, directLabel: 'none' }, paletteSlots: ['accent'],
      xLabel: 'Year', yLabel: 'Grants',
    };
    await openPoster([chartBlock({ w: 30, h: 45, captionPosition: 'none', chartSpec: spec })]);
    await layOut(frame(), 28, 43);
    const svg = await svgWith((s) => viewBox(s)[2] === 280);
    const labels = [...svg.querySelectorAll('[aria-label="x-axis tick label"] text')].sort((a, b) => at(a)[0] - at(b)[0]);
    expect(labels.length).toBeGreaterThan(1);
    expect(labels.length).toBeLessThan(years.length);
    for (let i = 1; i < labels.length; i += 1) {
      const room = at(labels[i]!)[0] - at(labels[i - 1]!)[0];
      const widest = (t: Element) => Math.max(...[...t.querySelectorAll('tspan')].map((s) => yard(s.textContent, tickPx(svg))), yard(t.querySelector('tspan') ? '' : t.textContent, tickPx(svg)));
      expect((widest(labels[i]!) + widest(labels[i - 1]!)) / 2).toBeLessThanOrEqual(room);
    }
  });

  it('Q-R3: legend labels longer than the chart is wide wrap onto lines inside it', async () => {
    const names = ['Systolic blood pressure before the intervention, seated, after five minutes of rest (mmHg)', 'Systolic blood pressure after the intervention, seated, after five minutes of rest (mmHg)'];
    await openPoster([chartBlock({ w: 60, h: 45, captionPosition: 'none', chartSpec: groupedSpec(names) })]);
    await layOut(frame(), 58, 43);
    const svg = await svgWith((s) => viewBox(s)[2] === 580);
    const texts = legendTexts(svg);
    expect(texts.length).toBe(2);
    for (const t of texts) {
      const spans = [...t.querySelectorAll('tspan')];
      expect(spans.length).toBeGreaterThanOrEqual(2);
      for (const s of spans) expect(Number(s.getAttribute('x')) + yard(s.textContent, fontPx(t))).toBeLessThanOrEqual(580);
    }
  });

  it('Q-R4: long statements on a category axis never overlap: each band holds its label’s lines', async () => {
    const statements = ['I felt comfortable asking questions during the poster session', 'The figures on the poster were readable from two metres away',
      'The methods section explained the study design clearly enough to follow', 'I would recommend this format for future departmental research days'];
    await openPoster([chartBlock({ w: 60, h: 45, captionPosition: 'none', chartSpec: likertSpec(statements) })]);
    await layOut(frame(), 58, 43);
    await svgWith((s) => viewBox(s)[2] === 580);
    // The block may grow to hold them; lay the host out where the frame says.
    await k.nextTask();
    const hostH = px(frame().style.height) - 2;
    await layOut(frame(), 58, hostH);
    const svg = await svgWith((s) => viewBox(s)[2] === 580 && Math.abs(viewBox(s)[3]! - hostH * 10) < 1e-6);
    const labels = [...svg.querySelectorAll('[aria-label="y-axis tick label"] text')].sort((a, b) => at(a)[1] - at(b)[1]);
    expect(labels.length).toBe(4);
    // Plot sets a label's lines 1 em apart and centres them on the band:
    // two neighbours' lines do not meet when their centres are half of
    // their lines apart, each.
    const line = tickPx(svg);
    for (let i = 1; i < labels.length; i += 1) {
      const room = at(labels[i]!)[1] - at(labels[i - 1]!)[1];
      expect(room).toBeGreaterThanOrEqual(((linesOf(labels[i]!) + linesOf(labels[i - 1]!)) / 2) * line);
    }
  });

  it('Q-R4: the y title above the plot stops short of the line-end labels', async () => {
    await openPoster([chartBlock({ w: 60, h: 45, captionPosition: 'none', chartSpec: millionsLine(['Federal granting councils (CIHR, NSERC, SSHRC)', 'Provincial health research agencies', 'Private foundations and industry partners']) })]);
    await layOut(frame(), 58, 43);
    await svgWith((s) => viewBox(s)[2] === 580);
    await k.nextTask();
    const hostH = px(frame().style.height) - 2;
    await layOut(frame(), 58, hostH);
    const svg = await svgWith((s) => viewBox(s)[2] === 580 && Math.abs(viewBox(s)[3]! - hostH * 10) < 1e-6);
    const ends = [...svg.querySelectorAll('[aria-label="text"] text')];
    expect(ends.length).toBe(3);
    const firstEnd = Math.min(...ends.map((t) => at(t)[0]));
    const title = svg.querySelector('[aria-label="y-axis label"]')!;
    const titlePx = fontPx(title);
    const lines = [...title.querySelectorAll('tspan')].map((s) => s.textContent ?? '');
    for (const l of lines.length ? lines : [title.textContent ?? '']) expect(3 + yard(l, titlePx)).toBeLessThanOrEqual(firstEnd);
  });
});

describe('fix 13c review Q-R5 — "⎙ Save PDF" prints the poster, not the editor’s selection', () => {
  it('a selected chart prints with no resize handles, no handle row and no accent border', async () => {
    const write = vi.fn();
    vi.stubGlobal('open', vi.fn(() => ({ document: { open: vi.fn(), write, close: vi.fn() }, focus: vi.fn(), print: vi.fn(), close: vi.fn(), addEventListener: vi.fn() })));
    // c2 runs past the sheet's bottom edge: out of bounds, a 1.5 px red border.
    await openPoster([chartBlock({ captionPosition: 'none' }), chartBlock({ id: 'c2', y: 330, captionPosition: 'none' })]);
    await rtl.act(async () => {
      rtl.fireEvent.click(frame());
    });
    expect(frame().getAttribute('data-postr-selected')).toBe('true');
    expect(frame('c2').getAttribute('data-postr-oob')).toBe('true');
    expect(document.querySelectorAll('#poster-canvas [data-postr-resize-handle]').length).toBeGreaterThan(0);
    k.openTab(/^export$/i);
    await k.nextTask();
    await k.click(k.findButton('Save PDF'), 'Save PDF');
    const html = String(write.mock.calls.map((c) => c[0]).join(''));
    expect(html).toContain('data-block-id="c1"');
    const printed = new DOMParser().parseFromString(html, 'text/html');
    expect(printed.querySelectorAll('[data-postr-resize-handle]').length).toBe(0);
    expect(printed.querySelectorAll('[data-postr-selection-ui]').length).toBe(0);
    const f = printed.querySelector<HTMLElement>('[data-block-id="c1"]')!;
    // The unselected border, 1 px: the editor draws the selected 1.5 px
    // border 1 device px wide on a 1x screen, and the print's zoom would
    // draw it 1.458 units wide, a smaller box than the chart was drawn for.
    expect(f.style.border).toBe('1px solid transparent');
    expect(printed.querySelector<HTMLElement>('[data-block-id="c2"]')!.style.border).toBe('1px solid transparent');
  });
});

describe('fix 13c round 1 — a chart drawn before the poster’s font loaded is drawn again once it has', () => {
  afterEach(() => {
    delete (document as unknown as { fonts?: unknown }).fonts;
  });
  it('redraws when a face of its font finishes loading, and not for another font', async () => {
    const fonts = Object.assign(new EventTarget(), { status: 'loaded', ready: Promise.resolve(), load: vi.fn(async () => []) });
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
    await openPoster([chartBlock({ captionPosition: 'none' })]);
    await layOut(frame(), 98, 68);
    const first = await svgWith((s) => viewBox(s)[2] === 980);
    const family = (first.style.fontFamily.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');
    expect(family).not.toBe('');
    const loaded = (name: string) => Object.assign(new Event('loadingdone'), { fontfaces: [{ family: name }] });
    await rtl.act(async () => {
      fonts.dispatchEvent(loaded('Some Other Font'));
    });
    await k.nextTask();
    expect(chartSvg()).toBe(first);
    await rtl.act(async () => {
      fonts.dispatchEvent(loaded(family));
    });
    await svgWith((s) => s !== first);
  });
});
