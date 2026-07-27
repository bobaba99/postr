import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Palette } from '@postr/shared';
import { inferTable } from '../inferColumns';
import { buildChartSpec } from '../buildSpec';
import { recommend } from '../recommend';
import { sampleDatasets } from '../sampleData';
import { unzipSync, strFromU8 } from 'fflate';
import { chartToSvgString, downloadChartSvg, downloadChartsZip } from '../download';

const palette: Palette = {
  bg: '#ffffff',
  primary: '#1f2a44',
  accent: '#2f6f8f',
  accent2: '#b0533a',
  muted: '#6b7280',
  headerBg: '#1f2a44',
  headerFg: '#ffffff',
};

function fixtureSpec() {
  const dataset = sampleDatasets().find((d) => d.key === 'grouped-means')!;
  const table = inferTable(dataset.table);
  return buildChartSpec(table, recommend(table)[0]!)!;
}

describe('chartToSvgString', () => {
  it('produces a standalone svg document with namespace and white background', async () => {
    const text = await chartToSvgString(fixtureSpec(), palette, 'Georgia, serif');
    expect(text.startsWith('<svg')).toBe(true);
    expect(text).toContain('xmlns="http://www.w3.org/2000/svg"');
    // First painted element is the background rect so transparent
    // viewers don't render the chart on black.
    expect(text).toMatch(/<rect[^>]*fill="#ffffff"/);
    expect(text).toContain('viewBox');
  });

  it('is deterministic for the same spec and theme', async () => {
    const spec = fixtureSpec();
    const a = await chartToSvgString(spec, palette, 'Georgia, serif');
    const b = await chartToSvgString(spec, palette, 'Georgia, serif');
    expect(a).toBe(b);
  });
});

describe('downloadChartSvg', () => {
  const urlSpy = { create: vi.fn(() => 'blob:postr-test'), revoke: vi.fn() };

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: urlSpy.create,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: urlSpy.revoke,
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('clicks a temporary anchor with the requested filename', async () => {
    const clicked: HTMLAnchorElement[] = [];
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicked.push(this);
    };
    try {
      await downloadChartSvg(fixtureSpec(), palette, 'Georgia, serif', 'chart.svg');
    } finally {
      HTMLAnchorElement.prototype.click = originalClick;
    }
    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.download).toBe('chart.svg');
    expect(clicked[0]!.href).toContain('blob:postr-test');
    // The anchor cleans itself up and the object URL is revoked
    // after the grace period.
    expect(clicked[0]!.isConnected).toBe(false);
    vi.runOnlyPendingTimers();
    expect(urlSpy.revoke).toHaveBeenCalledWith('blob:postr-test');
  });

  it('bundles several figures into one zip instead of firing N downloads', async () => {
    const spec = fixtureSpec();
    const clicked: HTMLAnchorElement[] = [];
    // jsdom's Blob has no arrayBuffer(), so intercept the bytes at the
    // Blob constructor instead of reading them back off the object.
    const parts: { bytes: Uint8Array; type: string }[] = [];
    const RealBlob = globalThis.Blob;
    class CapturingBlob extends RealBlob {
      constructor(blobParts?: BlobPart[], options?: BlobPropertyBag) {
        super(blobParts, options);
        const first = blobParts?.[0];
        if (first instanceof ArrayBuffer) {
          parts.push({ bytes: new Uint8Array(first), type: options?.type ?? '' });
        }
      }
    }
    globalThis.Blob = CapturingBlob as unknown as typeof Blob;
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicked.push(this);
    };
    try {
      await downloadChartsZip(
        [
          { spec, filename: 'figure-A-bar-chart.svg' },
          { spec, filename: 'figure-B-dot-plot.svg' },
        ],
        palette,
        'Georgia, serif',
        'svg',
        'figures-svg.zip',
      );
    } finally {
      HTMLAnchorElement.prototype.click = originalClick;
      globalThis.Blob = RealBlob;
    }

    // One download, not two.
    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.download).toBe('figures-svg.zip');

    const zip = parts.at(-1)!;
    expect(zip.type).toBe('application/zip');
    const entries = unzipSync(zip.bytes);
    // Predictable, panel-letter-prefixed entry names.
    expect(Object.keys(entries).sort()).toEqual([
      'figure-A-bar-chart.svg',
      'figure-B-dot-plot.svg',
    ]);
    expect(strFromU8(entries['figure-A-bar-chart.svg']!)).toContain('<svg');
  });

  it('refuses an empty selection rather than emitting a zip with no entries', async () => {
    await expect(
      downloadChartsZip([], palette, 'Georgia, serif', 'svg', 'figures.zip'),
    ).rejects.toThrow();
  });
});
