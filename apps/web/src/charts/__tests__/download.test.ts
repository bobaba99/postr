import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Palette } from '@postr/shared';
import { inferTable } from '../inferColumns';
import { buildChartSpec } from '../buildSpec';
import { recommend } from '../recommend';
import { sampleDatasets } from '../sampleData';
import { chartToSvgString, downloadChartSvg } from '../download';

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
});
