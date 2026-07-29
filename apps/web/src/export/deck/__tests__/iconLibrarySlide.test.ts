/**
 * PPTX-only icon-library utility slide (Phase 2 — Task 7).
 *
 * `addIconLibrarySlide` places a curated, theme-recolored set of
 * `CuratedIcon`s on one appended, `TEMPLATE_SLIDE_PREFIX`-named slide.
 * Icons are ORIGINAL SVG source (see `iconSet.ts`), and pptxgenjs
 * cannot embed SVG directly (see `rasterizeSvg.ts` /
 * `pptxSvgRaster.test.ts`) — so, mirroring the poster writer's proven
 * pattern, each icon is rasterized to PNG via an injectable
 * `SvgRasterizer` before `addImage`. jsdom has no real canvas, so tests
 * inject a fake rasterizer (same convention as `pptxSvgRaster.test.ts`)
 * and assert on what was requested rather than on real pixels.
 */
import { describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import PptxGenJS from 'pptxgenjs';
import { addIconLibrarySlide } from '../iconLibrarySlide';
import { CURATED_ICONS, pickIcons } from '../iconSet';
import { TEMPLATE_SLIDE_PREFIX } from '../../pptx/templateMarker';
import { TINY_PNG_BYTES } from '../../__tests__/fixtures';
import type { Theme } from '../../../manuscript/deck/styledTypes';

const SLIDE_WIDTH_IN = 13.333;
const SLIDE_HEIGHT_IN = 7.5;
const LAYOUT_NAME = 'TEST_LAYOUT_WIDE';

const theme: Theme = {
  palette: ['#F7F8FA', '#1F2933', '#3E5C76', '#5F8F8B', '#C98A5B', '#D9E2EC'],
  typeScale: { heading: 30, body: 18, label: 13 },
  accentTreatment: 'slate',
};

async function buildPptx(): Promise<PptxGenJS> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: LAYOUT_NAME, width: SLIDE_WIDTH_IN, height: SLIDE_HEIGHT_IN });
  pptx.layout = LAYOUT_NAME;
  return pptx;
}

const slideXmls = (files: Record<string, Uint8Array>): string[] =>
  Object.keys(files)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort((a, b) => Number(a.replace(/\D+/g, '')) - Number(b.replace(/\D+/g, '')));

describe('pickIcons(topic) → addIconLibrarySlide', () => {
  it('pickIcons(["memory", "sleep"]) returns tag-matched icons', () => {
    const picked = pickIcons(['memory', 'sleep']);
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.some((i) => i.id === 'brain' || i.id === 'clock')).toBe(true);
  });

  it('appends exactly one slide', async () => {
    const pptx = await buildPptx();
    const rasterizeSvg = vi.fn(async () => TINY_PNG_BYTES);
    await addIconLibrarySlide(pptx, pickIcons(['memory', 'sleep']), theme, { rasterizeSvg });
    const bytes = (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
    const files = unzipSync(bytes);
    expect(slideXmls(files)).toHaveLength(1);
  });

  it('names the slide with TEMPLATE_SLIDE_PREFIX', async () => {
    const pptx = await buildPptx();
    const rasterizeSvg = vi.fn(async () => TINY_PNG_BYTES);
    await addIconLibrarySlide(pptx, pickIcons(['memory']), theme, { rasterizeSvg });
    const bytes = (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
    const files = unzipSync(bytes);
    const [slidePath] = slideXmls(files);
    const xml = strFromU8(files[slidePath!]!);
    const name = /<p:cSld name="([^"]*)"/.exec(xml)?.[1] ?? '';
    expect(name.startsWith(TEMPLATE_SLIDE_PREFIX)).toBe(true);
  });

  it('places 8-12 icons as rasterized images, never raw SVG', async () => {
    const pptx = await buildPptx();
    const rasterizeSvg = vi.fn(async () => TINY_PNG_BYTES);
    await addIconLibrarySlide(pptx, [...CURATED_ICONS], theme, { rasterizeSvg });
    const bytes = (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
    const files = unzipSync(bytes);

    expect(rasterizeSvg).toHaveBeenCalledTimes(CURATED_ICONS.length);
    expect(Object.keys(files).some((k) => k.endsWith('.svg'))).toBe(false);
    expect(Object.keys(files).some((k) => k.startsWith('ppt/media/image'))).toBe(true);
  });

  it('recolors each icon to the theme before rasterizing (currentColor resolved via a style="color:#hex" wrapper to a theme hex)', async () => {
    const pptx = await buildPptx();
    const seenSvgs: string[] = [];
    const rasterizeSvg = vi.fn(async (bytes: Uint8Array) => {
      seenSvgs.push(new TextDecoder().decode(bytes));
      return TINY_PNG_BYTES;
    });
    await addIconLibrarySlide(pptx, pickIcons(['memory']), theme, { rasterizeSvg });

    expect(seenSvgs.length).toBeGreaterThan(0);
    for (const svg of seenSvgs) {
      // currentColor is left in place (that's how SVG recoloring works);
      // what must be present is a style="color:#hex" that resolves it —
      // and that hex must be one of the theme's own colors.
      expect(svg).toMatch(/style="color:#[0-9A-Fa-f]{6}"/);
      expect(theme.palette.some((hex) => svg.includes(hex))).toBe(true);
    }
  });

  it('gives each icon a text label under it', async () => {
    const pptx = await buildPptx();
    const rasterizeSvg = vi.fn(async () => TINY_PNG_BYTES);
    const icons = pickIcons(['memory', 'sleep']);
    await addIconLibrarySlide(pptx, icons, theme, { rasterizeSvg });
    const bytes = (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
    const files = unzipSync(bytes);
    const [slidePath] = slideXmls(files);
    const xml = strFromU8(files[slidePath!]!);
    for (const icon of icons) {
      expect(xml).toContain(icon.label);
    }
  });

  it('caps placement at 12 icons even if handed more', async () => {
    const pptx = await buildPptx();
    const rasterizeSvg = vi.fn(async () => TINY_PNG_BYTES);
    // CURATED_ICONS itself is <= 12, so duplicate to exceed the cap.
    const many = [...CURATED_ICONS, ...CURATED_ICONS].map((icon, i) => ({
      ...icon,
      id: `${icon.id}-${i}`,
    }));
    await addIconLibrarySlide(pptx, many, theme, { rasterizeSvg });
    expect(rasterizeSvg.mock.calls.length).toBeLessThanOrEqual(12);
  });

  it('never throws when rasterization fails — degrades gracefully', async () => {
    const pptx = await buildPptx();
    const rasterizeSvg = vi.fn(async () => null);
    await expect(
      addIconLibrarySlide(pptx, pickIcons(['memory']), theme, { rasterizeSvg }),
    ).resolves.toBeUndefined();
  });

  it('keeps every icon image within the slide bounds, even at the full 12-icon (2-row) grid', async () => {
    const pptx = await buildPptx();
    const rasterizeSvg = vi.fn(async () => TINY_PNG_BYTES);
    // CURATED_ICONS is 10; pad to 12 to exercise the full 2-row grid.
    const twelve = [
      ...CURATED_ICONS,
      { ...CURATED_ICONS[0]!, id: 'flask-2' },
      { ...CURATED_ICONS[1]!, id: 'brain-2' },
    ];
    await addIconLibrarySlide(pptx, twelve, theme, { rasterizeSvg });
    const bytes = (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
    const files = unzipSync(bytes);
    const [slidePath] = slideXmls(files);
    const xml = strFromU8(files[slidePath!]!);

    const EMU_PER_IN = 914400;
    const slideWEmu = SLIDE_WIDTH_IN * EMU_PER_IN;
    const slideHEmu = SLIDE_HEIGHT_IN * EMU_PER_IN;

    // Scope to <p:pic> blocks only — text boxes have their own <a:off>
    // in the same compact format, which a bare regex would also catch.
    const picBlocks = [...xml.matchAll(/<p:pic>.*?<\/p:pic>/gs)].map((m) => m[0]);
    expect(picBlocks.length).toBe(12);
    const offsets = picBlocks.map((block) => {
      const match = /<a:off x="(\d+)" y="(\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(
        block,
      );
      expect(match, `<p:pic> block missing <a:off>/<a:ext>: ${block}`).not.toBeNull();
      return match!.slice(1);
    });
    for (const [xStr, yStr, cxStr, cyStr] of offsets) {
      const x = Number(xStr);
      const y = Number(yStr);
      const cx = Number(cxStr);
      const cy = Number(cyStr);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + cx).toBeLessThanOrEqual(slideWEmu);
      expect(y + cy).toBeLessThanOrEqual(slideHEmu);
    }
  });
});
