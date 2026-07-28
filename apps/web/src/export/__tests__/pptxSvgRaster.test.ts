/**
 * Regression: pptxgenjs cannot embed an SVG data URI — its image
 * loader throws `image.onerror` and `pptx.write()` rejects, failing
 * the entire export. This bit every poster carrying an SVG image
 * block, most commonly the seeded acknowledgement mark, which surfaced
 * only as the generic "Something went wrong".
 *
 * The writer now rasterizes SVG assets to PNG before embedding. These
 * tests pin that: an SVG asset is converted (not passed through), the
 * export succeeds, and nothing SVG reaches `ppt/media/`. jsdom has no
 * real canvas, so the rasterizer is injected — which also covers the
 * failure path (rasterizer returns null → placeholder, never a throw).
 */
import { describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import { exportPosterPptx } from '../pptx/writer';
import { makeFixtureDoc, baseBlock, TINY_PNG_BYTES } from './fixtures';

const SVG_BYTES = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="16" fill="#6b7280"/></svg>',
);

/** A doc with exactly one image block, resolved to SVG bytes below. */
function docWithSvgImage() {
  return makeFixtureDoc({
    blocks: [
      baseBlock({
        id: 'fig-svg',
        type: 'image',
        x: 20,
        y: 120,
        w: 80,
        h: 80,
        imageSrc: 'data:image/svg+xml;base64,anything',
      }),
    ],
  });
}

describe('exportPosterPptx — SVG rasterization', () => {
  it('does not throw when a resolved asset is SVG', async () => {
    const rasterizeSvg = vi.fn(async () => TINY_PNG_BYTES);
    await expect(
      exportPosterPptx(docWithSvgImage(), {
        fetcher: async () => SVG_BYTES,
        rasterizeSvg,
      }),
    ).resolves.toBeDefined();
  });

  it('rasterizes the SVG to PNG rather than passing it through', async () => {
    const rasterizeSvg = vi.fn(async () => TINY_PNG_BYTES);
    const { bytes } = await exportPosterPptx(docWithSvgImage(), {
      fetcher: async () => SVG_BYTES,
      rasterizeSvg,
    });

    // The rasterizer ran, sized from the block's units (80×80) at 2×.
    expect(rasterizeSvg).toHaveBeenCalledTimes(1);
    expect(rasterizeSvg).toHaveBeenCalledWith(SVG_BYTES, 160, 160);

    // No SVG part survives into the media folder — pptxgenjs would
    // reject it. PNG media is present instead.
    const names = Object.keys(unzipSync(bytes));
    expect(names.some((n) => /ppt\/media\/.*\.svg$/i.test(n))).toBe(false);
    expect(names.some((n) => n.startsWith('ppt/media/image'))).toBe(true);
  });

  it('falls back to a placeholder (never throws) when rasterization fails', async () => {
    // Rasterizer returns null — the browser path does this on any
    // canvas/decode failure. The asset is dropped, the export still
    // succeeds, and a "missing image" placeholder warning is emitted.
    const rasterizeSvg = vi.fn(async () => null);
    const result = await exportPosterPptx(docWithSvgImage(), {
      fetcher: async () => SVG_BYTES,
      rasterizeSvg,
    });

    expect(result.bytes.length).toBeGreaterThan(0);
    const names = Object.keys(unzipSync(result.bytes));
    expect(names.some((n) => /ppt\/media\/.*\.svg$/i.test(n))).toBe(false);
    expect(
      result.warnings.some((w) => w.toLowerCase().includes('could not be loaded')),
    ).toBe(true);
  });

  it('leaves non-SVG (PNG) assets untouched — rasterizer not called', async () => {
    const rasterizeSvg = vi.fn(async () => TINY_PNG_BYTES);
    await exportPosterPptx(
      makeFixtureDoc({
        blocks: [
          baseBlock({
            id: 'fig-png',
            type: 'image',
            x: 20,
            y: 120,
            w: 80,
            h: 80,
            imageSrc: 'data:image/png;base64,anything',
          }),
        ],
      }),
      { fetcher: async () => TINY_PNG_BYTES, rasterizeSvg },
    );
    expect(rasterizeSvg).not.toHaveBeenCalled();
  });
});
