/**
 * Plan item 13 part 2, stream Q, cause RC5 — ONE set of minimums for
 * figure text (the lead's decision 1: the code check's 18/18/14/14/12 with
 * a 0.85 warning band). Record: docs/fixes/13c-chart-text-minimums.md.
 *
 * Before, the code check, the image scan (24/24/18 with a 0.75 band) and
 * the inserted charts (18/24, called "the checker's") each held their own
 * numbers. Here the shared module is replaced by sentinel numbers no
 * surface uses, and every surface that judges or draws figure text must
 * follow them, entered the way a user enters it: the public page's table
 * after Check, the editor's image scan after "Scan image", and an inserted
 * chart in a box too small for its legend at full size. A surface with its
 * own copy of the numbers does not follow the sentinels and fails here.
 *
 * Since the merge into fix 13b, the code check's element tables live in
 * `readabilityTypes.ts` and its row status takes the module's warning band
 * (it was a literal 0.85, review Q-R8); both are entered through the public
 * page here. Not here: the copy that states the numbers is held to the real
 * module by figureTextCopy.test.ts.
 *
 * Re-run: npx vitest run src/poster/__tests__/figureTextMinimums.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block, ChartSpec, PosterDoc } from '@postr/shared';

const SENTINEL = vi.hoisted(() => ({
  plotTitle: 31,
  axisTitle: 20,
  axisText: 16,
  legendText: 15.5,
  legendTitle: 19,
  stripText: 17,
  caption: 11,
}));
const SENTINEL_WARN = vi.hoisted(() => 0.5);
vi.mock('@/poster/figureTextMinimums', () => ({
  FIGURE_TEXT_MIN_PT: SENTINEL,
  FIGURE_TEXT_WARN_RATIO: SENTINEL_WARN,
  figureTextStatus: (pt: number, minPt: number) =>
    pt >= minPt ? 'pass' : pt >= minPt * SENTINEL_WARN ? 'warn' : 'fail',
}));

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
        signInAnonymously: vi.fn(),
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
const scan = vi.hoisted(() => ({ regions: [] as Array<{ text: string; bbox: { x: number; y: number; w: number; h: number }; role: string }> }));
vi.mock('@/lib/apiClient', () => ({
  postJson: vi.fn(async () => ({ imagePixelWidth: 1000, imagePixelHeight: 700, regions: scan.regions })),
  ApiError: class extends Error {},
}));
vi.mock('@/data/posterImages', async (orig) => ({
  ...(await orig<typeof import('@/data/posterImages')>()),
  resolveStorageUrl: vi.fn(async () => 'https://example.test/figure.png'),
}));

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RC5 — the code check takes its minimums from the shared module', () => {
  it('the public page’s table shows the module’s minimum for every element', async () => {
    const { default: Page } = await import('@/pages/FigureReadability');
    render(<MemoryRouter initialEntries={['/tools/figure-readability']}><Page /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/paste your ggplot/i), {
      target: { value: 'library(ggplot2)\nggplot(mtcars, aes(mpg, wt)) + geom_point() + facet_wrap(~cyl) + labs(title = "T", caption = "C") + theme_minimal(base_size = 11)\nggsave("fig.png", width = 7, height = 5)' },
    });
    fireEvent.click(screen.getByRole('button', { name: /check$/i }));
    const table = await screen.findByRole('table');
    const minOf = (name: string) => {
      const row = within(table).getAllByRole('row').find((r) => r.textContent?.startsWith(name));
      return row ? within(row).getAllByRole('cell')[3]?.textContent : null;
    };
    expect(minOf('Plot title')).toBe('31pt');
    expect(minOf('Axis titles')).toBe('20pt');
    expect(minOf('Tick labels')).toBe('16pt');
    expect(minOf('Legend text')).toBe('15.5pt');
    expect(minOf('Strip text')).toBe('17pt');
    expect(minOf('Caption')).toBe('11pt');
  });

  it('and for Python: every row shows the module’s minimum', async () => {
    const { default: Page } = await import('@/pages/FigureReadability');
    render(<MemoryRouter initialEntries={['/tools/figure-readability']}><Page /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/paste your ggplot/i), {
      target: { value: 'import matplotlib.pyplot as plt\nfig, ax = plt.subplots(figsize=(7, 5))\nax.plot([1, 2], [3, 4], label="a")\nax.set_title("T")\nax.set_xlabel("x")\nax.legend()\nfig.text(0.5, 0.01, "Caption")\nfig.savefig("fig.png")' },
    });
    fireEvent.click(screen.getByRole('button', { name: /check$/i }));
    const table = await screen.findByRole('table');
    const minOf = (name: string) => {
      const row = within(table).getAllByRole('row').find((r) => r.textContent?.startsWith(name));
      return row ? within(row).getAllByRole('cell')[3]?.textContent : null;
    };
    expect(minOf('Plot title')).toBe('31pt');
    expect(minOf('Axis titles')).toBe('20pt');
    expect(minOf('Tick labels')).toBe('16pt');
    expect(minOf('Legend text')).toBe('15.5pt');
    expect(minOf('Caption')).toBe('11pt');
  });
});

describe('RC5 — the code check takes its warning band from the shared module', () => {
  // Merge of 13c into 13b (review Q-R8): the code check's row status was a
  // literal 0.85. At the sentinel band (0.5) a row at 55 % of its minimum is
  // a warning; at a literal 0.85 it would be a failure.
  it('a row between the module’s band and its minimum is ⚠, below the band ✗', async () => {
    const { renderPage, typeSize, check, row } = await import('@/pages/__tests__/checkerPageDriver');
    renderPage();
    // The canvas is printed at its own size: scale 1, each row prints at its source size.
    typeSize(7, 5);
    check('library(ggplot2)\nggplot(mtcars, aes(mpg, wt)) + geom_point() + labs(title = "T", x = "Miles", y = "Weight") + theme_minimal(base_size = 11)\nggsave("fig.png", width = 7, height = 5)');
    await screen.findByRole('table');
    expect(screen.getByText(/^Scale factor:/).textContent).toMatch(/1(\.00)?x/);
    // Axis titles 11 pt against 20 (0.55 of it); tick labels 8.8 against 16 (0.55).
    expect(row('Axis titles')).toMatchObject({ print: '11pt', glyph: '⚠' });
    expect(row('Tick labels')).toMatchObject({ print: '8.8pt', glyph: '⚠' });
    // Plot title 13.2 pt against 31 (0.43): below the band.
    expect(row('Plot title')).toMatchObject({ print: '13.2pt', glyph: '✗' });
  });
});

describe('RC5 — the image scan takes its minimums and its warning band from the shared module', () => {
  it('Scan image: each role is judged against the module’s minimum, with its warning band', async () => {
    const { FigureTab } = await import('@/poster/sidebar/FigureTab');
    // The scan scales to the picture's printed box (fix 13b, imageBox.ts): the
    // frame's 1-unit border each side comes off the width, and a top caption
    // keeps the picture block.h tall. A 102 × 70 block draws its picture in 100 × 70.
    const image = { id: 'img1', type: 'image', x: 0, y: 0, w: 102, h: 70, content: '', imageSrc: 'u1/img.png', imageFit: 'contain', tableData: null } as Block;
    // 1000 × 700 px image in a 10 × 7 in picture box: 0.01 in per px, so a box h px tall prints at 0.72 × h pt.
    const at = (pt: number) => ({ x: 0, y: 0, w: 100, h: pt / 0.72 });
    scan.regions = [
      { text: 'Score', role: 'axis-title', bbox: at(19) },   // 19 < 20 and ≥ 10: warn
      { text: '10', role: 'axis-tick', bbox: at(16) },      // 16 ≥ 16: pass
      { text: 'Control', role: 'legend', bbox: at(7) },     // 7 < 7.75: fail
      { text: 'Mean', role: 'title', bbox: at(31) },        // pass
    ];
    render(
      <FigureTab mode="check" onChangeMode={() => {}} selectedImageBlock={image} defaultFigureWidthIn={10} defaultFigureHeightIn={7}
        palette={{ bg: '#fff', primary: '#000', accent: '#00f', accent2: '#f00', muted: '#666', headerBg: '#000', headerFg: '#fff' }}
        fontFamily="Georgia, serif" posterTables={[]} onInsertChart={() => {}} selectedChartBlock={null} onUpdateChartSpec={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Scan image/ }));
    await screen.findByText('Score');
    const rowOf = (text: string) => screen.getByText(text).closest('tr')!;
    const cells = (text: string) => within(rowOf(text)).getAllByRole('cell').map((c) => c.textContent);
    expect(cells('Score')).toEqual(['⚠', 'axis-title', 'Score', '19.0', '20']);
    expect(cells('10')).toEqual(['✓', 'axis-tick', '10', '16.0', '16']);
    expect(cells('Control')).toEqual(['✗', 'legend', 'Control', '7.0', '15.5']);
    expect(cells('Mean')).toEqual(['✓', 'title', 'Mean', '31.0', '31']);
  });
});

describe('RC5 — an inserted chart’s text follows the shared module’s minimums', () => {
  const PX_PER_PT = 10 / 7.2;
  const SERIES = ['Placebo arm', 'Low dose arm', 'Medium dose arm', 'High dose arm', 'Active comparator', 'Open-label extension', 'Standard of care', 'Waitlist control'];
  /** A saved poster with one grouped-bar chart (`n` arms), opened in the editor and laid out at w × h units. */
  async function chartIn(n: number, block: { w: number; h: number }, box: { w: number; h: number }) {
    const observed: Array<{ els: Set<Element>; report: (root: Element, w: number, h: number) => void }> = [];
    vi.stubGlobal('ResizeObserver', class {
      els = new Set<Element>();
      constructor(private cb: ResizeObserverCallback) { observed.push(this); }
      observe(el: Element) { this.els.add(el); }
      unobserve(el: Element) { this.els.delete(el); }
      disconnect() { this.els.clear(); }
      report(root: Element, w: number, h: number) {
        const entries = [...this.els].filter((el) => root.contains(el)).map((target) => ({ target, contentRect: { width: w, height: h } }));
        if (entries.length) this.cb(entries as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
      }
    });
    vi.resetModules();
    const k = await import('./editorKit');
    const { usePosterStore } = await import('@/stores/posterStore');
    const { act } = await import('@testing-library/react');
    const series = SERIES.slice(0, n);
    const spec: ChartSpec = {
      version: 1, form: 'bar-grouped',
      data: { columns: [{ name: 'Visit', kind: 'category' }, { name: 'Arm', kind: 'category' }, { name: 'Score', kind: 'number' }],
        rows: ['W1', 'W4'].flatMap((g, i) => series.map((s, j) => [g, s, 10 + i + j])) },
      encoding: { x: 'Visit', y: 'Score', series: 'Arm' },
      options: { legend: true, sort: 'none', horizontal: false, directLabel: 'none' }, paletteSlots: ['accent'], xLabel: 'Visit', yLabel: 'Score',
    };
    const doc = k.makeDoc() as PosterDoc;
    const chart = { id: 'c1', type: 'chart', x: 40, y: 60, ...block, content: '', imageSrc: null, imageFit: 'contain', tableData: null, chartSpec: spec, captionPosition: 'none' } as Block;
    usePosterStore.getState().setPoster('fixture-1', { ...doc, blocks: [...doc.blocks, chart] }, k.NAME);
    const view = k.renderEditor();
    const frame = document.querySelector('[data-block-id="c1"]')!;
    await act(async () => { for (const o of observed) o.report(frame, box.w, box.h); });
    const svg = await waitFor(() => {
      const el = frame.querySelector('svg[viewBox]');
      expect(el?.getAttribute('viewBox')?.split(' ')[2]).toBe(String(box.w * 10));
      return el!;
    }, { timeout: 4000 });
    return { svg, view };
  }
  const fontPx = (el: Element) => parseFloat(el.getAttribute('font-size')!);

  it('in a box too small for its legend even at the minimums, the chart’s text stops at the module’s tick minimum', async () => {
    const { svg, view } = await chartIn(8, { w: 40, h: 25 }, { w: 38, h: 23 });
    try {
      const sizes = [...svg.querySelectorAll('[aria-label="legend"] text')].map(fontPx);
      expect(sizes.length).toBe(8);
      // 16 pt (the sentinel tick minimum) and the chart's 0.5 % print margin
      // × 10/7.2 px per pt: the floor; the canonical 14 pt would be under it.
      for (const s of sizes) expect(s).toBeCloseTo(16 * 1.005 * PX_PER_PT, 6);
    } finally {
      view.unmount();
    }
  });

  it('with minimums above its own sizes, the chart draws at the minimums', async () => {
    const saved = { ...SENTINEL };
    Object.assign(SENTINEL, { axisText: 20, legendText: 19, axisTitle: 29 });
    try {
      const { svg, view } = await chartIn(2, { w: 100, h: 70 }, { w: 98, h: 68 });
      try {
        // The minimums and the chart's 0.5 % print margin above them.
        for (const t of svg.querySelectorAll('[aria-label="legend"] text')) expect(fontPx(t)).toBeCloseTo(20 * 1.005 * PX_PER_PT, 6);
        const titles = [...svg.querySelectorAll('[aria-label="y-axis label"], [aria-label="fx-axis label"]')];
        expect(titles.length).toBe(2);
        for (const g of titles) expect(fontPx(g)).toBeCloseTo(29 * 1.005 * PX_PER_PT, 6);
      } finally {
        view.unmount();
      }
    } finally {
      Object.assign(SENTINEL, saved);
    }
  });
});
