/**
 * Record 31 — the parts of a chart block's way into the PowerPoint file
 * (docs/fixes/31-exports-charts.md), each on its own: the writer's chart
 * emitter (a picture at the box it is drawn in, at the export's scale,
 * turned with the chart; its caption and note; a chart that cannot be drawn
 * left out with a warning), the picture's reading of the editor's sheet
 * (chartPicture.ts), its pixel size, and the poster font put in the picture
 * (chartFont.ts). The user's entry, Export › PowerPoint in the editor, is
 * src/poster/__tests__/exportsCharts.test.tsx; the browser's part is
 * scripts/pptx-export-check.mjs.
 *
 * Re-run: npx vitest run src/export/__tests__/pptxCharts.test.ts
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import type { Block, PosterDoc } from '@postr/shared';
import { exportPosterPptx } from '../pptx/writer';
import { CHART_FONT_MISSING, CHART_LEFT_OUT, type ChartPicture } from '../pptx/chartShape';
import { editorChartPicture, picturePixels, type ChartDrawer } from '../pptx/chartPicture';
import type { SvgRasterizer } from '../pptx/rasterizeSvg';
import { CHART_DRAWING_ATTR, SheetNotShownError, waitForChartsReadable } from '@/charts/chartDrawing';
import { baseBlock, makeFixtureDoc, TINY_PNG_BYTES } from './fixtures';

const chart = (over: Partial<Block> = {}): Block =>
  baseBlock({
    id: 'c1', type: 'chart', x: 100, y: 200, w: 120, h: 80, caption: 'Mean score by group.', captionPosition: 'bottom',
    chartSpec: { version: 1, form: 'bar', data: { columns: [], rows: [] }, encoding: {}, options: { legend: false, sort: 'none', horizontal: false, directLabel: 'none' }, paletteSlots: ['accent'] },
    ...over,
  });
const docWith = (blocks: Block[], over: Partial<PosterDoc> = {}) => makeFixtureDoc({ blocks, references: [], ...over });

/**
 * A drawer that reads each chart (recording which), then draws `picture`
 * (null: the drawing failed); `read: null` reads nothing (not on the sheet).
 */
function drawer(picture: ChartPicture | null, { read = true }: { read?: boolean } = {}) {
  const asked: string[] = [];
  const draw: ChartDrawer = (b) => {
    asked.push(b.id);
    return read ? async () => picture : null;
  };
  return { draw, asked };
}
const PIC: ChartPicture = {
  png: TINY_PNG_BYTES,
  box: { x: 101, y: 201, w: 118, h: 80 },
  caption: { x: 101, y: 281, w: 118, h: 6 },
  note: null,
};

async function slideOf(doc: PosterDoc, draw: ChartDrawer) {
  const result = await exportPosterPptx(doc, { fetcher: async () => TINY_PNG_BYTES, drawChart: draw, attribution: { paidPlan: true } });
  const xml = strFromU8(unzipSync(result.bytes)['ppt/slides/slide1.xml']!);
  return { result, xml };
}
/** A shape's box (its xfrm's offset and extent), in inches. */
const boxIn = (body: string) => {
  const off = /<a:off x="(-?\d+)" y="(-?\d+)"/.exec(body)!;
  const ext = /<a:ext cx="(\d+)" cy="(\d+)"/.exec(body)!;
  return [off[1], off[2], ext[1], ext[2]].map((v) => Number(v) / 914400);
};
const pics = (xml: string) =>
  [...xml.matchAll(/<p:pic>([\s\S]*?)<\/p:pic>/g)].map((m) => ({
    box: boxIn(m[1]!),
    rot: Number(/<a:xfrm[^>]*rot="(\d+)"/.exec(m[1]!)?.[1] ?? 0) / 60000,
    descr: /descr="([^"]*)"/.exec(m[1]!)?.[1] ?? '',
  }));
/** Each text box: its text and its box in inches. */
const texts = (xml: string) =>
  [...xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)].map((m) => ({
    text: [...m[1]!.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join(''),
    box: boxIn(m[1]!),
    rot: Number(/<a:xfrm[^>]*rot="(\d+)"/.exec(m[1]!)?.[1] ?? 0) / 60000,
  }));

describe('the writer — a chart block is a picture at the box it is drawn in', () => {
  it('places the picture and its caption where the editor draws them, the caption numbered as a figure', async () => {
    const { draw, asked } = drawer(PIC);
    const { xml, result } = await slideOf(docWith([chart()]), draw);
    expect(asked).toEqual(['c1']);
    const [p] = pics(xml);
    expect(p!.box.map((v) => +v.toFixed(4))).toEqual([10.1, 20.1, 11.8, 8]);
    expect(p!.descr).toBe('Figure 1. Mean score by group.');
    const cap = texts(xml).find((t) => t.text.startsWith('Figure 1.'))!;
    expect(cap.text).toBe('Figure 1. Mean score by group.');
    expect(cap.box.map((v) => +v.toFixed(4))).toEqual([10.1, 28.1, 11.8, 0.6]);
    expect(result.warnings.join(' ')).not.toMatch(/chart/i);
  });

  it('halves the picture with everything else on a poster over 56 in', async () => {
    const { draw } = drawer(PIC);
    const { xml, result } = await slideOf(docWith([chart()], { widthIn: 94, heightIn: 48 }), draw);
    expect(result.scaled).toBe(true);
    expect(pics(xml)[0]!.box.map((v) => +v.toFixed(4))).toEqual([5.05, 10.05, 5.9, 4]);
  });

  it('turns the picture, its caption and its note with the chart, each about its own centre', async () => {
    const { draw } = drawer({ ...PIC, note: { x: 101, y: 287, w: 118, h: 4 } });
    const { xml } = await slideOf(docWith([chart({ rotation: -90, note: 'Note. Group means.' })]), draw);
    expect(pics(xml)[0]!.rot).toBe(270);
    expect(texts(xml).find((t) => t.text.startsWith('Figure 1.'))!.rot).toBe(270);
    const note = texts(xml).find((t) => t.text === 'Note. Group means.')!;
    expect(note.box.map((v) => +v.toFixed(4))).toEqual([10.1, 28.7, 11.8, 0.4]);
    expect(note.rot).toBe(270);
  });

  it('leaves a chart it cannot draw out, says so, and keeps its caption', async () => {
    const { draw } = drawer(null);
    const { xml, result } = await slideOf(docWith([chart()]), draw);
    expect(pics(xml)).toEqual([]);
    expect(result.warnings).toContain(CHART_LEFT_OUT);
    expect(texts(xml).some((t) => t.text === 'Figure 1. Mean score by group.')).toBe(true);
  });

  it('leaves a chart out with the same warning when it is not on the sheet, or its reading or drawing throws, and still writes the file', async () => {
    const throwsOnRead: ChartDrawer = () => {
      throw new Error('read');
    };
    const throwsOnDraw: ChartDrawer = () => async () => {
      throw new Error('draw');
    };
    for (const draw of [drawer(PIC, { read: false }).draw, throwsOnRead, throwsOnDraw]) {
      const { xml, result } = await slideOf(docWith([chart(), baseBlock({ id: 't', type: 'text', content: 'Words' })]), draw);
      expect(pics(xml)).toEqual([]);
      expect(result.warnings).toContain(CHART_LEFT_OUT);
      expect(texts(xml).map((t) => t.text)).toContain('Words');
    }
  });

  it('writes nothing when a chart’s reading finds the poster hidden or gone (review R2-F1)', async () => {
    for (const why of ['hidden', 'gone'] as const) {
      const hidden: ChartDrawer = () => {
        throw new SheetNotShownError(why);
      };
      await expect(slideOf(docWith([chart(), baseBlock({ id: 't', type: 'text', content: 'Words' })]), hidden)).rejects.toBeInstanceOf(SheetNotShownError);
    }
  });

  it('reads every chart before it draws any (one reading of the page)', async () => {
    const events: string[] = [];
    const draw: ChartDrawer = (b) => {
      events.push(`read ${b.id}`);
      return async () => {
        events.push(`draw ${b.id}`);
        return PIC;
      };
    };
    await slideOf(docWith([chart(), chart({ id: 'c2', x: 300 })]), draw);
    expect(events).toEqual(['read c1', 'read c2', 'draw c1', 'draw c2']);
  });

  it('says when the picture could not get the poster font', async () => {
    const { draw } = drawer({ ...PIC, fontMissing: true });
    const { result } = await slideOf(docWith([chart()]), draw);
    expect(result.warnings).toContain(CHART_FONT_MISSING);
  });

  it('asks for no picture on a poster without charts', async () => {
    const { draw, asked } = drawer(PIC);
    const { xml } = await slideOf(docWith([baseBlock({ id: 't', type: 'text', content: 'Words' })]), draw);
    expect(asked).toEqual([]);
    expect(pics(xml)).toEqual([]);
  });

  it('writes nothing for an empty references block (no "References" over an empty list)', async () => {
    const { draw } = drawer(PIC);
    const refs = baseBlock({ id: 'r', type: 'references', x: 10, y: 10, w: 100, h: 40 });
    const { xml } = await slideOf(docWith([refs]), draw);
    expect(texts(xml).map((t) => t.text)).not.toContain('References');
    const withRefs = docWith([refs], { references: makeFixtureDoc().references });
    const { xml: xml2 } = await slideOf(withRefs, draw);
    expect(texts(xml2).some((t) => t.text.startsWith('References'))).toBe(true);
  });
});

describe('picturePixels — 300 px per inch, within 4096² px', () => {
  it('draws at 300 px per inch', () => {
    expect(picturePixels(9.8, 7)).toEqual({ w: 2940, h: 2100 });
  });
  it('draws a box larger than 4096² px at 300 per inch with fewer, its shape kept', () => {
    const { w, h } = picturePixels(14.733, 14.794);
    expect(w * h).toBeLessThanOrEqual(4096 * 4096 + w + h);
    expect(w / h).toBeCloseTo(14.733 / 14.794, 3);
    expect(Math.round(w / 14.733)).toBe(277);
  });
  it('past about 186 sq in the cap sets the floor: a 45.8 × 30 in chart (one filling a 48 × 36 in poster) gets 110.5 px per inch (review R2-F2)', () => {
    // 300 px per inch up to 4096² / 300² = 186.4 sq in.
    expect(picturePixels(13.6, 13.6)).toEqual({ w: 4080, h: 4080 });
    const { w, h } = picturePixels(45.8, 30);
    expect(w).toBe(5061);
    expect(w / 45.8).toBeCloseTo(110.5, 1);
    expect(w * h).toBeLessThanOrEqual(4096 * 4096 + w + h);
  });
});

describe('editorChartPicture — the chart as the editor draws it', () => {
  const realRect = Element.prototype.getBoundingClientRect;
  afterEach(() => {
    Element.prototype.getBoundingClientRect = realRect;
    document.body.replaceChildren();
  });
  const rect = (x: number, y: number, w: number, h: number) =>
    ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;
  /** How far the page has scrolled since the sheet was laid out (screen px, down). */
  let scrolled = 0;
  /**
   * A sheet at 2 screen px per poster unit, offset (30, 40) on screen,
   * holding the chart's frame; with `sized`, its caption and note report a
   * laid-out size (98 × 6 and 98 × 4 units, under the chart). Every box
   * moves up by `scrolled`, the sheet's too.
   */
  function sheet(doc: PosterDoc, { turned = false, sized = false } = {}) {
    scrolled = 0;
    const size = (w: number, h: number) => (sized ? ` style="width:${w}px;height:${h}px"` : '');
    document.body.innerHTML = `
      <div id="poster-canvas">
        <div data-block-id="c1" data-block-type="chart">
          <div data-postr-selection-ui=""><button><svg viewBox="0 0 24 24"><path d="M0 0"/></svg></button></div>
          <div><div id="host"><svg viewBox="0 0 980 700" style="width:100%;height:100%"><text>Score</text></svg></div></div>
          <div data-postr-caption="" id="cap"${size(98, 6)}>Figure 1. Mean score by group.</div>
          <div data-postr-note="" id="note"${size(98, 4)}>Note. Group means.</div>
        </div>
      </div>`;
    const at = (x: number, y: number, w: number, h: number) => rect(x, y - scrolled, w, h);
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.id === 'poster-canvas') return at(30, 40, doc.widthIn * 10 * 2, doc.heightIn * 10 * 2);
      // The host drawn at units (101, 201), 98 × 70, or turned 90° about its centre.
      if (this.id === 'host') return turned ? at(30 + 2 * (150 - 35), 40 + 2 * (236 - 49), 140, 196) : at(30 + 202, 40 + 402, 196, 140);
      if (this.id === 'cap') return at(30 + 202, 40 + 542, 196, 12);
      if (this.id === 'note') return at(30 + 202, 40 + 554, 196, 8);
      return realRect.call(this);
    };
  }
  /** Read the chart off the sheet, then draw its picture. */
  const readAndDraw = (b: Block, doc: PosterDoc, raster: SvgRasterizer = rasterize) => editorChartPicture(b, doc)?.(raster) ?? Promise.resolve(null);
  const rastered: Array<{ svg: string; w: number; h: number }> = [];
  const rasterize = async (bytes: Uint8Array, w: number, h: number) => {
    rastered.push({ svg: new TextDecoder().decode(bytes), w, h });
    return TINY_PNG_BYTES;
  };

  it('copies the chart’s own svg (not a handle’s icon) at 300 px per inch, at its box', async () => {
    rastered.length = 0;
    const doc = docWith([chart()]);
    sheet(doc);
    const pic = await readAndDraw(chart(), doc);
    expect(pic!.box).toEqual({ x: 101, y: 201, w: 98, h: 70 });
    expect(rastered).toHaveLength(1);
    expect(rastered[0]!.svg).toContain('<text>Score</text>');
    expect(rastered[0]!.svg).toMatch(/^<svg[^>]*\swidth="2940"[^>]*\sheight="2100"|^<svg[^>]*\sheight="2100"[^>]*\swidth="2940"/);
    expect([rastered[0]!.w, rastered[0]!.h]).toEqual([2940, 2100]);
  });

  it('reads a turned chart as its size before the turn, centred where it is drawn', async () => {
    const doc = docWith([chart({ rotation: 90 })]);
    sheet(doc, { turned: true });
    const pic = await readAndDraw(chart({ rotation: 90 }), doc);
    // Centre (150, 236) units; size 98 × 70 from the drawing (jsdom gives no laid-out size).
    expect(pic!.box).toEqual({ x: 101, y: 201, w: 98, h: 70 });
  });

  it('puts the page’s web font into the picture, and says when it cannot', async () => {
    const doc = docWith([chart()], { fontFamily: 'Source Sans 3' });
    sheet(doc);
    Object.defineProperty(document, 'fonts', { configurable: true, value: { forEach: (cb: (f: unknown) => void) => [{ family: 'Source Sans 3', status: 'loaded' }].forEach(cb) } });
    const css = "@font-face { font-family: 'Source Sans 3'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/s.woff2) format('woff2'); unicode-range: U+0000-00FF; }";
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('googleapis') ? new Response(css) : new Response(new Uint8Array([7, 8, 9])))));
    try {
      rastered.length = 0;
      const pic = await readAndDraw(chart(), doc);
      expect(pic!.fontMissing).toBeUndefined();
      expect(rastered[0]!.svg).toMatch(/<style>@font-face \{ font-family: 'Source Sans 3'; font-style: normal; font-weight: 400; src: url\(data:font\/woff2;base64,BwgJ\)/);
      vi.resetModules();
      const fresh = await import('../pptx/chartPicture');
      vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
      const missing = await fresh.editorChartPicture(chart(), doc)!(rasterize);
      expect(missing!.fontMissing).toBe(true);
      expect(missing!.png.length).toBeGreaterThan(0);
    } finally {
      delete (document as { fonts?: unknown }).fonts;
      vi.unstubAllGlobals();
    }
  });

  it('answers null for a chart that is not drawn', async () => {
    const doc = docWith([chart()]);
    sheet(doc);
    document.getElementById('poster-canvas')!.innerHTML = '<div data-block-id="c1" data-block-type="chart"><div data-postr-editor-ui="">Something went wrong rendering this chart.</div></div>';
    expect(editorChartPicture(chart(), doc)).toBeNull();
  });

  it('throws, rather than answer "not drawn", when the sheet is hidden (Preview) or gone (review R2-F1)', async () => {
    const doc = docWith([chart()]);
    sheet(doc);
    // Preview sets the editor's tree to display: none: every box on the sheet reads 0.
    Element.prototype.getBoundingClientRect = () => rect(0, 0, 0, 0);
    expect(() => editorChartPicture(chart(), doc)).toThrow(expect.objectContaining({ name: 'SheetNotShownError', why: 'hidden' }));
    document.body.replaceChildren();
    expect(() => editorChartPicture(chart(), doc)).toThrow(expect.objectContaining({ name: 'SheetNotShownError', why: 'gone' }));
  });

  it('reads the caption’s and the note’s boxes with the chart’s: a scroll while the picture is drawn moves none (review R1-F1)', async () => {
    const doc = docWith([chart({ note: 'Note. Group means.' })]);
    sheet(doc, { sized: true });
    const draw = editorChartPicture(chart({ note: 'Note. Group means.' }), doc)!;
    const pic = await draw(async (bytes, w, h) => {
      scrolled += 500;
      return rasterize(bytes, w, h);
    });
    expect(scrolled).toBe(500);
    expect(pic!.box).toEqual({ x: 101, y: 201, w: 98, h: 70 });
    expect(pic!.caption).toEqual({ x: 101, y: 271, w: 98, h: 6 });
    expect(pic!.note).toEqual({ x: 101, y: 277, w: 98, h: 4 });
  });

  it('leaves the chart out when the canvas step answers no bytes', async () => {
    const doc = docWith([chart()]);
    sheet(doc);
    expect(await readAndDraw(chart(), doc, async () => new Uint8Array(0))).toBeNull();
    expect(await readAndDraw(chart(), doc, async () => null)).toBeNull();
  });
});

describe('waitForChartsReadable — the export waits for the poster as the editor shows it (review R1-F2, R2-F1)', () => {
  const realRect = Element.prototype.getBoundingClientRect;
  afterEach(() => {
    Element.prototype.getBoundingClientRect = realRect;
    document.body.replaceChildren();
  });
  const rect = (w: number) => ({ x: 0, y: 0, left: 0, top: 0, width: w, height: w, right: w, bottom: w, toJSON: () => ({}) }) as DOMRect;
  /** A sheet holding one chart block, shown (`width` > 0) or hidden (0), the chart drawing or not. */
  function sheet(state: { width: number; drawing: boolean }) {
    document.body.innerHTML = '<div id="poster-canvas"><div data-block-id="c1"><div id="c1"></div></div></div>';
    Element.prototype.getBoundingClientRect = function (this: Element) {
      return this.id === 'poster-canvas' ? rect(state.width) : realRect.call(this);
    };
    const set = (next: Partial<typeof state>) => {
      Object.assign(state, next);
      const c = document.getElementById('c1')!;
      if (state.drawing) c.setAttribute(CHART_DRAWING_ATTR, '');
      else c.removeAttribute(CHART_DRAWING_ATTR);
    };
    set({});
    return set;
  }
  const settle = (p: Promise<void>) => p.then(() => 'ready', (e: Error) => `${e.name}${(e as { why?: string }).why ? ` ${(e as { why?: string }).why}` : ''}`);

  it('resolves at once for a shown sheet with no chart drawing', async () => {
    sheet({ width: 480, drawing: false });
    expect(await settle(waitForChartsReadable(1000))).toBe('ready');
  });

  it('waits while the sheet is hidden, and resolves once it is shown again with no chart drawing', async () => {
    const set = sheet({ width: 0, drawing: true });
    const result = settle(waitForChartsReadable(3000));
    setTimeout(() => set({ drawing: false }), 150);
    setTimeout(() => set({ width: 480 }), 400);
    expect(await result).toBe('ready');
  });

  it('past the wait: hidden says hidden, drawing says drawing', async () => {
    sheet({ width: 0, drawing: false });
    expect(await settle(waitForChartsReadable(250))).toBe('SheetNotShownError hidden');
    sheet({ width: 480, drawing: true });
    expect(await settle(waitForChartsReadable(250))).toBe('ChartsStillDrawingError');
  });

  it('gives up at once, not at the end of the wait, when the sheet is gone (the editor left)', async () => {
    sheet({ width: 480, drawing: true });
    const started = Date.now();
    const result = settle(waitForChartsReadable(5000));
    setTimeout(() => document.body.replaceChildren(), 150);
    expect(await result).toBe('SheetNotShownError gone');
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('embeddedFontCss — the poster font, inside the picture', () => {
  afterEach(() => vi.resetModules());
  const CSS = `/* latin-ext */
@font-face { font-family: 'Zq Sans'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/a-ext.woff2) format('woff2'); unicode-range: U+0100-02BA, U+1E00-1E9F; }
/* latin */
@font-face { font-family: 'Zq Sans'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/a-latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+2000-206F; }
@font-face { font-family: 'Zq Sans'; font-style: normal; font-weight: 700; src: url(https://fonts.gstatic.com/b-latin.woff2) format('woff2'); unicode-range: U+0000-00FF; }
@font-face { font-family: 'Zq Sans'; font-style: italic; font-weight: 400; src: url(https://fonts.gstatic.com/i-latin.woff2) format('woff2'); unicode-range: U+0000-00FF; }
@font-face { font-family: 'Zq Sans'; font-style: normal; font-weight: 300 800; src: url(https://fonts.gstatic.com/v-cyr.woff2) format('woff2'); unicode-range: U+0400-045F; }`;
  function fetcher(fail: string | null = null) {
    const asked: string[] = [];
    const f = (async (url: string) => {
      asked.push(url);
      if (fail && url.includes(fail)) return new Response('no', { status: 404 });
      if (url.startsWith('https://fonts.googleapis.com/')) return new Response(CSS, { status: 200 });
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }) as unknown as typeof fetch;
    return { f, asked };
  }

  it('keeps only the normal 400 faces whose subsets hold the chart’s characters, each file inlined', async () => {
    const { embeddedFontCss } = await import('../pptx/chartFont');
    const { f, asked } = fetcher();
    const css = await embeddedFontCss('Zq Sans', 'Week 12 – Control', f);
    expect(css).not.toBeNull();
    expect(css).toContain("font-family: 'Zq Sans'");
    expect(css).toContain('url(data:font/woff2;base64,AQID)');
    expect(css).toContain('unicode-range: U+0000-00FF, U+2000-206F');
    expect((css!.match(/@font-face/g) ?? []).length).toBe(1);
    expect(asked.filter((u) => u.includes('gstatic'))).toEqual(['https://fonts.gstatic.com/a-latin.woff2']);
  });

  it('takes a face whose weight range holds 400 when the text needs its subset', async () => {
    const { embeddedFontCss } = await import('../pptx/chartFont');
    const { f } = fetcher();
    const css = await embeddedFontCss('Zq Sans', 'Неделя', f);
    expect((css!.match(/@font-face/g) ?? []).length).toBe(1);
    expect(css).toContain('U+0400-045F');
  });

  it('answers null when the stylesheet or a font file cannot be fetched', async () => {
    const { embeddedFontCss } = await import('../pptx/chartFont');
    expect(await embeddedFontCss('Zq Sans', 'Week', fetcher('googleapis').f)).toBeNull();
    vi.resetModules();
    const again = await import('../pptx/chartFont');
    expect(await again.embeddedFontCss('Zq Sans', 'Week', fetcher('a-latin').f)).toBeNull();
  });

  it('fetches the stylesheet again on the next export after a fetch that failed (the failure is not kept)', async () => {
    const { embeddedFontCss } = await import('../pptx/chartFont');
    expect(await embeddedFontCss('Zq Sans', 'Week', fetcher('googleapis').f)).toBeNull();
    const { f, asked } = fetcher();
    const css = await embeddedFontCss('Zq Sans', 'Week', f);
    expect(asked.some((u) => u.startsWith('https://fonts.googleapis.com/'))).toBe(true);
    expect(css).toContain('url(data:font/woff2;base64,AQID)');
  });

  it('knows a web font the page has loaded from one it has not', async () => {
    const { documentHasWebFont } = await import('../pptx/chartFont');
    const faces = [{ family: '"Zq Sans"', status: 'loaded' }, { family: 'Other', status: 'unloaded' }];
    Object.defineProperty(document, 'fonts', { configurable: true, value: { forEach: (cb: (f: unknown) => void) => faces.forEach(cb) } });
    try {
      expect(documentHasWebFont('Zq Sans')).toBe(true);
      expect(documentHasWebFont('Other')).toBe(false);
      expect(documentHasWebFont('Charter')).toBe(false);
    } finally {
      delete (document as { fonts?: unknown }).fonts;
    }
  });
});

describe('the copy that names what PowerPoint does with charts, in English and French', () => {
  it('says charts come in as pictures, not that they are left out', async () => {
    const { ABOUT_COPY } = await import('@/i18n/about');
    const ship = (lang: 'en' | 'fr') => ABOUT_COPY[lang].milestones.find((m) => m.id === 'ship')!.body;
    expect(ship('en')).toContain('Charts made in Postr are included as pictures.');
    expect(ship('en')).not.toMatch(/not included/);
    expect(ship('fr')).toContain('Les graphiques créés dans Postr y sont inclus sous forme d’images.');
    expect(ship('fr')).not.toMatch(/pas inclus/);
  });
});
