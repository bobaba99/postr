/**
 * Record 31 — exports: Postr's own charts in the PowerPoint file, and the
 * editor's hints in neither the PDF nor the PowerPoint file
 * (docs/fixes/31-exports-charts.md).
 *
 * Before the fix the paid PowerPoint export had no case for chart blocks: a
 * poster with a chart exported the same slide as one without, no picture,
 * no caption, no warning (MEASURED, scripts/pptx-export-check.mjs: 60 of 60
 * charts drawn in the editor and 0 pictures). And "⎙ Save PDF" printed the
 * editor's hints: an empty figure's "+ Upload figure", an empty references
 * block's "Add references in Refs tab →" (record 30's INFO ui-copied and
 * ui-font; record 29's R1-02).
 *
 * Entry points are the user's: Export › PowerPoint and Export › "⎙ Save
 * PDF" in the editor, the file and the print document read back. jsdom lays
 * nothing out and draws nothing, so the browser's part is played: a
 * ResizeObserver reports the chart host's box (as chartBlockLayout.test.tsx
 * does), the sheet and that host report where they are drawn, and an svg is
 * drawn to a PNG by a stand-in for the canvas step (it records the svg it is
 * handed and answers a PNG of the size the svg asks for). What the browser
 * itself gives (the picture against the editor's drawing, its place on
 * every chart form and size, LibreOffice and the app's own reader) is
 * measured by scripts/pptx-export-check.mjs.
 *
 * Re-run: npx vitest run src/poster/__tests__/exportsCharts.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
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
vi.mock('@/data/billing', async (orig) => ({
  ...(await orig<typeof import('@/data/billing')>()),
  markPaidExport: vi.fn(async () => undefined),
  consumeExportCredit: vi.fn(async () => 0),
}));
// A term holder by default (PowerPoint is theirs); a pack holder where a test says.
const plan = vi.hoisted(() => ({ term: true, credits: 0 }));
vi.mock('@/hooks/usePlan', () => ({
  usePlan: () => ({
    loading: false, hasActiveTerm: plan.term, credits: plan.credits, reviewCredits: 0, hasReviewAddon: false, canReview: false,
    canExport: true, isGuest: false, subscriptionStatus: null, refresh: async () => null, applyCredits: () => {},
  }),
}));
// A chart's drawing held back (a slow network: Observable Plot's chunk not
// yet in), released by the test; not held unless a test holds it.
const drawGate = vi.hoisted(() => ({ held: null as Promise<void> | null, release: () => {} }));
function holdDrawing() {
  drawGate.held = new Promise<void>((resolve) => {
    drawGate.release = () => {
      drawGate.held = null;
      resolve();
    };
  });
}
vi.mock('@/charts/renderChart', async (orig) => {
  const real = await orig<typeof import('@/charts/renderChart')>();
  return {
    ...real,
    renderChartLaidOut: async (...args: Parameters<typeof real.renderChartLaidOut>) => {
      await drawGate.held;
      return real.renderChartLaidOut(...args);
    },
  };
});
// The canvas step, played: what it is handed, and a PNG of the size the svg asks for.
const rastered = vi.hoisted(() => ({ svgs: [] as string[], onDraw: null as null | (() => void) }));
vi.mock('@/export/pptx/rasterizeSvg', () => ({
  browserRasterizeSvg: async (bytes: Uint8Array, w: number, h: number) => {
    const svg = new TextDecoder().decode(bytes);
    rastered.svgs.push(svg);
    rastered.onDraw?.();
    const attr = (name: string, fallback: number) => Number(new RegExp(`<svg[^>]*\\s${name}="([\\d.]+)"`).exec(svg)?.[1] ?? fallback);
    const png = new Uint8Array(33);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(png.buffer).setUint32(16, Math.round(attr('width', w)));
    new DataView(png.buffer).setUint32(20, Math.round(attr('height', h)));
    png.set([8, 6, 0, 0, 0], 24);
    return png;
  },
}));
// The thumbnail's drawing step: the copy of the sheet it is handed.
const drawn = vi.hoisted(() => ({ html: [] as string[] }));
vi.mock('html-to-image', () => ({
  toCanvas: vi.fn(async (node: HTMLElement) => {
    drawn.html.push(node.outerHTML);
    throw new Error('not drawn in jsdom');
  }),
}));

type Kit = typeof import('./editorKit');
type Rtl = typeof import('@testing-library/react');
let k: Kit;
let rtl: Rtl;
let view: { unmount: () => void } | null = null;

/** The editor's hints and prompts on the sheet (the record's rule: never in an export). */
const HINTS = ['+ Upload figure', 'click to browse · drag to move', '+ Logo', 'presets · upload · reuse', 'Add authors in sidebar →',
  'Add references in Refs tab →', 'Rendering chart…', 'Something went wrong rendering this chart.', 'Send Feedback'];

// ── The browser's layout, played ─────────────────────────────────────
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
/** Lay out every observed element inside `root` at w × h (poster units). */
async function layOut(root: Element, w: number, h: number) {
  await rtl.act(async () => {
    for (const o of observers) {
      const els = [...o.els].filter((el) => root.contains(el));
      if (!els.length) continue;
      o.cb(els.map((target) => ({
        target,
        contentRect: { width: w, height: h, x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, toJSON: () => ({}) },
        borderBoxSize: [{ inlineSize: w, blockSize: h }],
        contentBoxSize: [{ inlineSize: w, blockSize: h }],
        devicePixelContentBoxSize: [],
      })) as unknown as ResizeObserverEntry[], o.self as ResizeObserver);
    }
  });
}
const rect = (x: number, y: number, w: number, h: number) =>
  ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;
const realRect = Element.prototype.getBoundingClientRect;
const realStyle = window.getComputedStyle;
type Box = [number, number, number, number];
/** How far the page has scrolled since the boxes were played (screen px, down). */
let scrolled = 0;
/**
 * Where the browser draws the sheet (at its corner, 1 px per poster unit)
 * and each chart's host (the chart frame's box less its 1 unit border, the
 * caption under it): `hosts` by block id. With `parts`, each chart's
 * caption and note too, with the laid-out size the browser reports for
 * them (jsdom reports none). Every box moves up by `scrolled`, as a scroll
 * moves everything on the page, the sheet with it.
 */
function playDrawn(posterW: number, posterH: number, hosts: Record<string, Box>, parts: Record<string, { caption?: Box; note?: Box }> = {}) {
  scrolled = 0;
  // Nothing inside a tree set to display: none is drawn (Preview hides the
  // editor so): every box there is empty, as the browser reports it.
  let el: Element | null = null;
  const at = (x: number, y: number, w: number, h: number) => (el?.closest('[style*="display: none"]') ? rect(0, 0, 0, 0) : rect(x, y - scrolled, w, h));
  const partOf = (el: Element): Box | undefined => {
    const id = el.closest('[data-block-id]')?.getAttribute('data-block-id') ?? '';
    if (el.hasAttribute('data-postr-caption')) return parts[id]?.caption;
    if (el.hasAttribute('data-postr-note')) return parts[id]?.note;
    return undefined;
  };
  Element.prototype.getBoundingClientRect = function (this: Element) {
    el = this;
    if (this.id === 'poster-canvas') return at(0, 0, posterW * 10, posterH * 10);
    if (this.querySelector(':scope > svg[viewBox]')) {
      const box = hosts[this.closest('[data-block-id]')?.getAttribute('data-block-id') ?? ''];
      if (box) return at(...box);
    }
    const part = partOf(this);
    if (part) return at(...part);
    return realRect.call(this);
  };
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) => {
    const cs = realStyle.call(window, el, pseudo);
    const part = partOf(el);
    if (!part) return cs;
    return new Proxy(cs, {
      get: (target, prop) => {
        if (prop === 'width') return `${part[2]}px`;
        if (prop === 'height') return `${part[3]}px`;
        const v = Reflect.get(target, prop, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
  });
}

const cat = (names: string[]) => names.map((name) => ({ name, kind: 'category' as const }));
const SPEC: ChartSpec = {
  version: 1,
  form: 'bar-grouped',
  data: {
    columns: [...cat(['Visit', 'Arm']), { name: 'Score', kind: 'number' }],
    rows: ['Week 1', 'Week 4', 'Week 8', 'Week 12'].flatMap((g, i) => ['Control', 'Treated'].map((s, j) => [g, s, 10 + i * 3 + j * 2])),
  },
  encoding: { x: 'Visit', y: 'Score', series: 'Arm' },
  options: { legend: true, sort: 'none', horizontal: false, directLabel: 'none' },
  paletteSlots: ['accent', 'primary'],
  xLabel: 'Visit',
  yLabel: 'Score',
};
const CAPTION = 'Sample data, not real results. Mean score by visit and arm.';
const base = { content: '', imageSrc: null, imageFit: 'contain' as const, tableData: null };
const chart = (over: Partial<Block> = {}): Block =>
  ({ ...base, id: 'c1', type: 'chart', x: 250, y: 240, w: 100, h: 70, chartSpec: SPEC, caption: CAPTION, captionPosition: 'bottom', ...over }) as Block;

async function openPoster(edit: (d: PosterDoc) => PosterDoc) {
  view?.unmount();
  view = null;
  vi.resetModules();
  k = await import('./editorKit');
  rtl = await import('@testing-library/react');
  const { usePosterStore } = await import('@/stores/posterStore');
  usePosterStore.getState().setPoster('fixture-1', edit(k.makeDoc() as PosterDoc), k.NAME);
  view = k.renderEditor();
  await k.nextTask();
}
const frame = (id: string) => k.q<HTMLElement>(`#poster-canvas [data-block-id="${id}"]`);
const button = (name: RegExp) => [...document.querySelectorAll('button')].find((b) => name.test((b.textContent ?? '').trim()));
async function chartDrawn(id: string, widthPx: number) {
  await rtl.waitFor(() => {
    const svg = frame(id)?.querySelector('svg[viewBox]');
    expect(svg?.getAttribute('viewBox')?.split(' ')[2]).toBe(String(widthPx));
  }, { timeout: 4000 });
}

// ── The download, kept ───────────────────────────────────────────────
let downloads: Blob[] = [];
function keepDownloads() {
  downloads = [];
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: (b: Blob) => { downloads.push(b); return 'blob:test'; } });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: () => {} });
}
const blobBytes = (b: Blob) => new Promise<Uint8Array>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
  r.onerror = () => reject(r.error);
  r.readAsArrayBuffer(b);
});
async function exportPowerPoint(): Promise<{ slide: string; paras: string[] }> {
  k.openTab(/^export$/i);
  await k.nextTask();
  await k.click(button(/PowerPoint \(\.pptx\)$/), 'Export › PowerPoint');
  await rtl.waitFor(() => expect(downloads.length).toBe(1), { timeout: 8000 });
  const files = unzipSync(await blobBytes(downloads[0]!));
  const slide = strFromU8(files['ppt/slides/slide1.xml']!);
  const paras = [...slide.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((m) => [...m[1]!.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join(''));
  return { slide, paras };
}
/** Each text box on the slide: its text and its box in inches. */
const textBoxes = (slide: string) =>
  [...slide.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)].map((m) => {
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"/.exec(m[1]!);
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"/.exec(m[1]!);
    return {
      text: [...m[1]!.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join(''),
      box: off && ext ? [off[1], off[2], ext[1], ext[2]].map((v) => Number(v) / 914400) : null,
    };
  });
/** Each picture on the slide: its box in inches. */
const pictures = (slide: string) =>
  [...slide.matchAll(/<p:pic>([\s\S]*?)<\/p:pic>/g)].map((m) => {
    const off = /<a:off x="(\d+)" y="(\d+)"/.exec(m[1]!)!;
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"/.exec(m[1]!)!;
    return [off[1], off[2], ext[1], ext[2]].map((v) => Number(v) / 914400);
  });

// ── The print window, stubbed: what it is written ────────────────────
let windows: string[] = [];
function stubWindows() {
  windows = [];
  vi.stubGlobal('open', vi.fn(() => {
    const i = windows.push('') - 1;
    return { document: { open: vi.fn(), write: (s: string) => { windows[i] += s; }, close: vi.fn() }, focus: vi.fn(), print: vi.fn(), close: vi.fn(), addEventListener: vi.fn() };
  }));
}
const sheetText = (html: string) => new DOMParser().parseFromString(html, 'text/html').getElementById('poster-canvas')?.textContent ?? '';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  observers.length = 0;
  rastered.svgs.length = 0;
  rastered.onDraw = null;
  drawn.html.length = 0;
  plan.term = true;
  plan.credits = 0;
  drawGate.held = null;
  vi.stubGlobal('ResizeObserver', LayoutObserver);
  keepDownloads();
});
afterEach(() => {
  drawGate.release();
  view?.unmount();
  view = null;
  Element.prototype.getBoundingClientRect = realRect;
  vi.doUnmock('@/charts/chartDrawing');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('record 31, part 1 — a chart block is a picture in the PowerPoint file', () => {
  it('Export › PowerPoint writes the chart as the editor draws it, at its box, with its caption', async () => {
    await openPoster((d) => ({ ...d, blocks: [...d.blocks, chart()] }));
    await layOut(frame('c1'), 98, 70);
    await chartDrawn('c1', 980);
    playDrawn(48, 36, { c1: [251, 241, 98, 70] });
    const { slide, paras } = await exportPowerPoint();

    // The picture: at the chart's box (the frame less its 1 unit border), 9.8 × 7 in.
    const pics = pictures(slide);
    expect(pics.length, 'one picture on the slide').toBe(1);
    const [x, y, w, h] = pics[0]!;
    expect(x).toBeCloseTo(25.1, 3);
    expect(y).toBeCloseTo(24.1, 3);
    expect(w).toBeCloseTo(9.8, 3);
    expect(h).toBeCloseTo(7, 3);
    // Its caption: "Figure N." from the reading order, then the caption.
    expect(paras).toContain(`Figure 1. ${CAPTION}`);
    // The picture is the editor's own drawing (its text and legend), drawn at 300 px per inch.
    expect(rastered.svgs.length).toBe(1);
    const svg = rastered.svgs[0]!;
    for (const t of ['Visit', 'Score', 'Control', 'Treated', 'Week 12']) expect(svg).toContain(t);
    expect(svg).toMatch(/<svg[^>]*\swidth="2940"/);
    expect(svg).toMatch(/<svg[^>]*\sheight="2100"/);
  });

  it('a chart that cannot be drawn is left out, and the export says so', async () => {
    const broken = chart({ chartSpec: { ...SPEC, data: { ...SPEC.data, rows: [] } }, captionPosition: 'none' });
    // And one with no chart at all (a block whose spec is missing).
    const empty = chart({ id: 'c2', x: 360, chartSpec: undefined, captionPosition: 'none' });
    await openPoster((d) => ({ ...d, blocks: [...d.blocks, broken, empty] }));
    await rtl.waitFor(() => expect(frame('c1').textContent).toContain('Something went wrong rendering this chart.'));
    await rtl.waitFor(() => expect(frame('c2').textContent).toContain('Something went wrong rendering this chart.'));
    // The sheet drawn on the page (the export copies charts only from a shown poster: review round 2).
    playDrawn(48, 36, {});
    const { slide } = await exportPowerPoint();
    expect(pictures(slide)).toEqual([]);
    await rtl.waitFor(() => expect(document.body.textContent).toContain('A chart could not be drawn, so the PowerPoint file leaves it out.'));
  });

  it('the Export tab says what happens to charts', async () => {
    await openPoster((d) => d);
    k.openTab(/^export$/i);
    await k.nextTask();
    const panel = document.body.textContent ?? '';
    expect(panel).not.toContain('Charts made in Postr are not included.');
    expect(panel).toContain('Charts made in Postr become pictures.');
  });
});

describe('record 31, review round 1 — the export reads the page once, after every chart is drawn', () => {
  const NOTE = 'Note. Values are group means.';
  const STILL_DRAWING = 'A chart is still drawing, so nothing was exported. Try again in a moment.';
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const r3 = (box: number[] | null | undefined) => box?.map((v) => +v.toFixed(3));
  async function clickPowerPoint() {
    k.openTab(/^export$/i);
    await k.nextTask();
    await k.click(button(/PowerPoint \(\.pptx\)$/), 'Export › PowerPoint');
  }
  const slideOf = async (b: Blob) => strFromU8(unzipSync(await blobBytes(b))['ppt/slides/slide1.xml']!);

  it('R1-F1: a scroll while the file is built does not move a chart’s caption or note in it', async () => {
    await openPoster((d) => ({ ...d, blocks: [...d.blocks, chart({ note: NOTE })] }));
    await layOut(frame('c1'), 98, 70);
    await chartDrawn('c1', 980);
    playDrawn(48, 36, { c1: [251, 241, 98, 70] }, { c1: { caption: [251, 311, 98, 6], note: [251, 317, 98, 4] } });
    // The page scrolls 500 px while the picture is being drawn (the canvas step).
    rastered.onDraw = () => {
      scrolled += 500;
    };
    const { slide } = await exportPowerPoint();
    expect(scrolled, 'precondition: the page scrolled during the export').toBe(500);
    const box = (text: string) => r3(textBoxes(slide).find((t) => t.text.replace(/\s+/g, ' ').trim() === text)?.box);
    expect(r3(pictures(slide)[0]), 'the picture where the editor draws the chart').toEqual([25.1, 24.1, 9.8, 7]);
    expect(box(`Figure 1. ${CAPTION}`), 'the caption where the editor draws it').toEqual([25.1, 31.1, 9.8, 0.6]);
    expect(box(NOTE), 'the note where the editor draws it').toEqual([25.1, 31.7, 9.8, 0.4]);
  });

  it('R1-F2: Export › PowerPoint with a chart still drawing waits for it, and the file has its picture', async () => {
    holdDrawing();
    await openPoster((d) => ({ ...d, blocks: [...d.blocks, chart()] }));
    await layOut(frame('c1'), 98, 70);
    expect(frame('c1').textContent, 'precondition: the chart is still drawing at the click').toContain('Rendering chart…');
    playDrawn(48, 36, { c1: [251, 241, 98, 70] });
    await clickPowerPoint();
    await sleep(400);
    expect(downloads.length, 'no file while the chart is still drawing').toBe(0);
    drawGate.release();
    await rtl.waitFor(() => expect(downloads.length).toBe(1), { timeout: 8000 });
    expect(pictures(await slideOf(downloads[0]!)), 'the chart, drawn once it could be').toHaveLength(1);
    expect(document.body.textContent).not.toContain('A chart could not be drawn');
  }, 15000);

  it('R1-F2 (sibling): a chart redrawing for a new size is waited for, and the file has the new drawing', async () => {
    await openPoster((d) => ({ ...d, blocks: [...d.blocks, chart()] }));
    await layOut(frame('c1'), 98, 70);
    await chartDrawn('c1', 980);
    // The chart is given a wider box (a resize): its redraw is held, the old drawing still on screen.
    holdDrawing();
    await layOut(frame('c1'), 120, 70);
    expect(frame('c1').querySelector('svg[viewBox]')?.getAttribute('viewBox'), 'precondition: the old drawing on screen').toBe('0 0 980 700');
    playDrawn(48, 36, { c1: [251, 241, 120, 70] });
    await clickPowerPoint();
    await sleep(400);
    expect(downloads.length, 'no file while the chart redraws').toBe(0);
    drawGate.release();
    await rtl.waitFor(() => expect(downloads.length).toBe(1), { timeout: 8000 });
    expect(pictures(await slideOf(downloads[0]!))).toHaveLength(1);
    expect(rastered.svgs.at(-1), 'the picture is the drawing for the new box').toMatch(/viewBox="0 0 1200 700"/);
  }, 15000);

  for (const who of ['pack', 'term'] as const) {
    it(`R1-F2: a chart still drawing past the wait: nothing exported, ${who === 'pack' ? 'no credit used' : 'no paid export recorded'}, the Export tab says so, and the next export has it`, async () => {
      // The wait shortened for the test (10 s in the app: the browser harness waits it out).
      vi.doMock('@/charts/chartDrawing', async (orig) => ({ ...(await orig<Record<string, unknown>>()), CHART_DRAW_WAIT_MS: 500 }));
      if (who === 'pack') {
        plan.term = false;
        plan.credits = 2;
      }
      holdDrawing();
      await openPoster((d) => ({ ...d, blocks: [...d.blocks, chart()] }));
      await layOut(frame('c1'), 98, 70);
      playDrawn(48, 36, { c1: [251, 241, 98, 70] });
      const billing = await import('@/data/billing');
      vi.mocked(billing.consumeExportCredit).mockClear();
      vi.mocked(billing.markPaidExport).mockClear();
      await clickPowerPoint();
      await rtl.waitFor(() => expect(document.body.textContent).toContain(STILL_DRAWING), { timeout: 5000 });
      await sleep(300);
      expect(downloads.length, 'no file').toBe(0);
      expect(billing.consumeExportCredit, 'no credit used').not.toHaveBeenCalled();
      expect(billing.markPaidExport, 'no paid export recorded').not.toHaveBeenCalled();
      expect(document.body.textContent).not.toContain('Something went wrong');
      // Once the chart has drawn, the export goes through, the chart in it.
      drawGate.release();
      await chartDrawn('c1', 980);
      playDrawn(48, 36, { c1: [251, 241, 98, 70] });
      await clickPowerPoint();
      await rtl.waitFor(() => expect(downloads.length).toBe(1), { timeout: 8000 });
      expect(pictures(await slideOf(downloads[0]!))).toHaveLength(1);
      expect(who === 'pack' ? billing.consumeExportCredit : billing.markPaidExport).toHaveBeenCalledTimes(1);
      expect(document.body.textContent).not.toContain(STILL_DRAWING);
    }, 20000);
  }
});

describe('record 31, review round 2 — the export copies the charts only from the poster as the editor shows it', () => {
  const HIDDEN = 'The poster was hidden in Preview, so its charts could not be copied and nothing was exported. Try again.';
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const slideOf = async (b: Blob) => strFromU8(unzipSync(await blobBytes(b))['ppt/slides/slide1.xml']!);
  async function clickPowerPoint() {
    k.openTab(/^export$/i);
    await k.nextTask();
    await k.click(button(/PowerPoint \(\.pptx\)$/), 'Export › PowerPoint');
  }
  const openPreview = () => k.click(button(/Preview poster$/), 'Export › 👁 Preview poster');
  const d0Charts = () => document.querySelectorAll('#poster-canvas [data-block-type="chart"]').length;
  const backToEditor = () => k.click(button(/^Back to Editor$/), 'Preview › Back to Editor');
  async function billingCleared() {
    const billing = await import('@/data/billing');
    vi.mocked(billing.consumeExportCredit).mockClear();
    vi.mocked(billing.markPaidExport).mockClear();
    return billing;
  }

  for (const who of ['pack', 'term'] as const) {
    it(`R2-F1: Preview opened while Export › PowerPoint waits and kept past the wait: nothing exported, ${who === 'pack' ? 'no credit used' : 'no paid export recorded'}, and back in the editor the Export tab says why`, async () => {
      // The wait shortened for the test (10 s in the app: the browser harness waits it out).
      vi.doMock('@/charts/chartDrawing', async (orig) => ({ ...(await orig<Record<string, unknown>>()), CHART_DRAW_WAIT_MS: 500 }));
      if (who === 'pack') {
        plan.term = false;
        plan.credits = 2;
      }
      holdDrawing();
      await openPoster((d) => ({ ...d, blocks: [...d.blocks, chart()] }));
      await layOut(frame('c1'), 98, 70);
      playDrawn(48, 36, { c1: [251, 241, 98, 70] });
      const billing = await billingCleared();
      await clickPowerPoint();
      await openPreview();
      expect(k.q('#poster-canvas').getBoundingClientRect().width, 'precondition: Preview hides the sheet').toBe(0);
      // The chart finishes drawing while the user looks at Preview.
      drawGate.release();
      await chartDrawn('c1', 980);
      await rtl.waitFor(() => expect(document.body.textContent).toContain(HIDDEN), { timeout: 5000 });
      await sleep(300);
      expect(downloads.length, 'no file').toBe(0);
      expect(billing.consumeExportCredit, 'no credit used').not.toHaveBeenCalled();
      expect(billing.markPaidExport, 'no paid export recorded').not.toHaveBeenCalled();
      await backToEditor();
      expect(document.body.textContent).toContain(HIDDEN);
      expect(document.body.textContent).not.toContain('A chart could not be drawn');
      expect(document.body.textContent).not.toContain('Something went wrong');
      // Back in the editor, the next export has the chart.
      await clickPowerPoint();
      await rtl.waitFor(() => expect(downloads.length).toBe(1), { timeout: 8000 });
      expect(pictures(await slideOf(downloads[0]!))).toHaveLength(1);
      expect(who === 'pack' ? billing.consumeExportCredit : billing.markPaidExport).toHaveBeenCalledTimes(1);
    }, 20000);
  }

  it('R2-F1: back from Preview within the wait, the export goes on and the file has the chart', async () => {
    plan.term = false;
    plan.credits = 2;
    holdDrawing();
    await openPoster((d) => ({ ...d, blocks: [...d.blocks, chart()] }));
    await layOut(frame('c1'), 98, 70);
    playDrawn(48, 36, { c1: [251, 241, 98, 70] });
    const billing = await billingCleared();
    await clickPowerPoint();
    await openPreview();
    drawGate.release();
    await chartDrawn('c1', 980);
    await sleep(400);
    expect(downloads.length, 'no file while the poster is hidden').toBe(0);
    expect(billing.consumeExportCredit).not.toHaveBeenCalled();
    await backToEditor();
    await rtl.waitFor(() => expect(downloads.length).toBe(1), { timeout: 8000 });
    expect(pictures(await slideOf(downloads[0]!)), 'the chart, copied once the poster is shown').toHaveLength(1);
    expect(billing.consumeExportCredit).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain('A chart could not be drawn');
  }, 15000);

  it('R2-F1: Preview opened before the export reaches its wait, every chart drawn (a slow first export): nothing exported or spent', async () => {
    vi.doMock('@/charts/chartDrawing', async (orig) => ({ ...(await orig<Record<string, unknown>>()), CHART_DRAW_WAIT_MS: 500 }));
    plan.term = false;
    plan.credits = 2;
    await openPoster((d) => ({ ...d, blocks: [...d.blocks, chart()] }));
    await layOut(frame('c1'), 98, 70);
    await chartDrawn('c1', 980);
    playDrawn(48, 36, { c1: [251, 241, 98, 70] });
    const billing = await billingCleared();
    k.openTab(/^export$/i);
    await k.nextTask();
    // Both clicks before the writer's chunk is in: the export has not read the page yet.
    rtl.fireEvent.click(button(/PowerPoint \(\.pptx\)$/)!);
    rtl.fireEvent.click(button(/Preview poster$/)!);
    await rtl.waitFor(() => expect(document.body.textContent).toContain(HIDDEN), { timeout: 5000 });
    await sleep(300);
    expect(downloads.length, 'no file').toBe(0);
    expect(billing.consumeExportCredit, 'no credit used').not.toHaveBeenCalled();
  }, 15000);

  it('a poster without charts reads nothing off the page: exported at once, the sheet not laid out (Preview, or jsdom)', async () => {
    await openPoster((d) => d);
    expect(d0Charts(), 'precondition: no chart block').toBe(0);
    expect(k.q('#poster-canvas').getBoundingClientRect().width, 'precondition: the sheet reads 0 wide').toBe(0);
    await clickPowerPoint();
    await rtl.waitFor(() => expect(downloads.length).toBe(1), { timeout: 3000 });
    expect(document.body.textContent).not.toContain(HIDDEN);
  });

  it('R2-F1: the editor left while Export › PowerPoint waits: nothing exported or spent', async () => {
    plan.term = false;
    plan.credits = 2;
    holdDrawing();
    await openPoster((d) => ({ ...d, blocks: [...d.blocks, chart()] }));
    await layOut(frame('c1'), 98, 70);
    playDrawn(48, 36, { c1: [251, 241, 98, 70] });
    const billing = await billingCleared();
    await clickPowerPoint();
    // An in-app route change (the browser's Back to the dashboard) unmounts the editor.
    view?.unmount();
    view = null;
    drawGate.release();
    await sleep(1200);
    expect(downloads.length, 'no file').toBe(0);
    expect(billing.consumeExportCredit, 'no credit used').not.toHaveBeenCalled();
    expect(billing.markPaidExport, 'no paid export recorded').not.toHaveBeenCalled();
  }, 15000);
});

describe('record 31, part 2 — the editor’s hints never reach an export', () => {
  const emptyBlocks = (d: PosterDoc): PosterDoc => ({
    ...d,
    authors: [],
    institutions: [],
    references: [],
    blocks: [
      ...d.blocks,
      { ...base, id: 'au', type: 'authors', x: 20, y: 85, w: 440, h: 12 },
      { ...base, id: 'lg', type: 'logo', x: 20, y: 230, w: 50, h: 50 },
      { ...base, id: 'im', type: 'image', x: 80, y: 230, w: 80, h: 60, captionPosition: 'none' },
      { ...base, id: 'rf', type: 'references', x: 170, y: 230, w: 170, h: 40 },
      chart({ id: 'cb', x: 20, y: 300, chartSpec: { ...SPEC, data: { ...SPEC.data, rows: [] } }, captionPosition: 'none' }),
    ] as Block[],
  });

  it('Save PDF prints empty blocks as empty space: no hint or prompt in the print document', async () => {
    stubWindows();
    await openPoster(emptyBlocks);
    await rtl.waitFor(() => expect(frame('cb').textContent).toContain('Something went wrong'));
    const shown = document.getElementById('poster-canvas')!.textContent ?? '';
    const expected = HINTS.filter((x) => x !== 'Rendering chart…');
    for (const x of expected) expect(shown, `precondition: the editor shows "${x}"`).toContain(x);

    k.openTab(/^export$/i);
    await k.nextTask();
    await k.click(button(/^⎙ Save PDF$/), 'Export › ⎙ Save PDF');
    expect(windows.length).toBe(1);
    const printed = sheetText(windows[0]!);
    for (const x of HINTS) expect(printed, `"${x}" in the print document`).not.toContain(x);
    // The blocks themselves are printed: their frames stay where they are.
    const doc = new DOMParser().parseFromString(windows[0]!, 'text/html');
    for (const id of ['au', 'lg', 'im', 'rf', 'cb']) expect(doc.querySelector(`#poster-canvas [data-block-id="${id}"]`), id).not.toBeNull();
  });

  it('an authors block with institutions and no author prints the institutions, not the prompt', async () => {
    stubWindows();
    await openPoster((d) => ({
      ...emptyBlocks(d),
      institutions: [{ id: 'i1', name: 'Acme State University', dept: 'Department of Psychology' }],
    }));
    expect(frame('au').textContent, 'precondition: the editor shows the prompt and the institution').toContain('Add authors in sidebar →');
    k.openTab(/^export$/i);
    await k.nextTask();
    await k.click(button(/^⎙ Save PDF$/), 'Export › ⎙ Save PDF');
    const printed = new DOMParser().parseFromString(windows[0]!, 'text/html').querySelector('[data-block-id="au"]')!.textContent ?? '';
    expect(printed).not.toContain('Add authors in sidebar →');
    expect(printed).toContain('Acme State University');
  });

  it('the PowerPoint file writes nothing for an empty references block', async () => {
    await openPoster(emptyBlocks);
    playDrawn(48, 36, {});
    const { paras } = await exportPowerPoint();
    expect(paras.filter((p) => p.trim() === 'References')).toEqual([]);
    for (const x of HINTS) expect(paras.join('\n')).not.toContain(x);
  });

  it('the dashboard thumbnail, drawn from the same copy, shows none of them either', async () => {
    await openPoster(emptyBlocks);
    await rtl.waitFor(() => expect(frame('cb').textContent).toContain('Something went wrong'));
    const { capturePosterJpeg } = await vi.importActual<typeof import('@/data/thumbnails')>('@/data/thumbnails');
    // The copy's width, as the browser lays it out (480 units for 48 in).
    const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!;
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get(this: HTMLElement) { return this.id === 'poster-canvas' ? 480 : 0; } });
    try {
      await rtl.act(async () => {
        await capturePosterJpeg({ targetWidthPx: 400, quality: 0.8 });
      });
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth);
    }
    expect(drawn.html, 'the copy reached the drawing step').toHaveLength(1);
    const text = new DOMParser().parseFromString(drawn.html[0]!, 'text/html').body.textContent ?? '';
    for (const x of HINTS) expect(text).not.toContain(x);
  });
});
