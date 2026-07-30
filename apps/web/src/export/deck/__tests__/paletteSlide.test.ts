/**
 * PPTX-only palette-swap utility slide (Phase 2 — Task 7).
 *
 * `addPaletteSlide` appends ONE slide with 4 labeled swatch rows so a
 * user can pick a different palette and repaint the deck by hand inside
 * PowerPoint. Same unzip-and-assert strategy as
 * `deckWriterStyled.test.ts`: swatches must be real, editable
 * `<a:prstGeom prst="rect">` shapes filled with the given hex — never a
 * rasterized image — and the slide must carry `TEMPLATE_SLIDE_PREFIX` in
 * its `<p:cSld name>` so the importer's own-slide detection (see
 * `templateMarker.ts` / `parsePptx.ts`) skips it on re-import.
 */
import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import PptxGenJS from 'pptxgenjs';
import { addPaletteSlide } from '../paletteSlide';
import { TEMPLATE_SLIDE_PREFIX } from '../../pptx/templateMarker';

const SLIDE_WIDTH_IN = 13.333;
const SLIDE_HEIGHT_IN = 7.5;
const LAYOUT_NAME = 'TEST_LAYOUT_WIDE';

const style = {
  font: 'Arial',
  headingPt: 20,
  bodyPt: 12,
  labelPt: 10,
  textColor: '111111',
};

function fixturePalettes(): string[][] {
  return [
    ['#F7F8FA', '#1F2933', '#3E5C76', '#5F8F8B', '#C98A5B', '#D9E2EC'],
    ['#0B132B', '#1C2541', '#3A506B', '#5BC0BE', '#FFFFFF', '#6FFFE9'],
    ['#FFFFFF', '#111111', '#0F4C75', '#3282B8', '#BBE1FA', '#6B7280'],
    ['#FDF0D5', '#003049', '#D62828', '#F77F00', '#EAE2B7', '#780000'],
  ];
}

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

describe('addPaletteSlide', () => {
  it('appends exactly one slide', async () => {
    const pptx = await buildPptx();
    addPaletteSlide(pptx, fixturePalettes(), style);
    const bytes = (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
    const files = unzipSync(bytes);
    expect(slideXmls(files)).toHaveLength(1);
  });

  it('names the slide with TEMPLATE_SLIDE_PREFIX so the importer ignores it', async () => {
    const pptx = await buildPptx();
    addPaletteSlide(pptx, fixturePalettes(), style);
    const bytes = (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
    const files = unzipSync(bytes);
    const [slidePath] = slideXmls(files);
    const xml = strFromU8(files[slidePath!]!);
    const name = /<p:cSld name="([^"]*)"/.exec(xml)?.[1] ?? '';
    expect(name.startsWith(TEMPLATE_SLIDE_PREFIX)).toBe(true);
  });

  it('draws 4 rows, each with a real rect swatch in the given hex (not an image)', async () => {
    const pptx = await buildPptx();
    const palettes = fixturePalettes();
    addPaletteSlide(pptx, palettes, style);
    const bytes = (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
    const files = unzipSync(bytes);
    const [slidePath] = slideXmls(files);
    const xml = strFromU8(files[slidePath!]!);

    expect(Object.keys(files).some((k) => k.endsWith('.png') || k.endsWith('.svg'))).toBe(false);

    const rectCount = (xml.match(/<a:prstGeom prst="rect"/g) ?? []).length;
    // 4 rows x 6 colors per row = 24 swatch rects minimum.
    expect(rectCount).toBeGreaterThanOrEqual(24);

    for (const row of palettes) {
      for (const hex of row) {
        const hex6 = hex.replace('#', '').toUpperCase();
        expect(xml).toContain(`<a:srgbClr val="${hex6}"/>`);
      }
    }
  });

  it('gives each row a text label', async () => {
    const pptx = await buildPptx();
    addPaletteSlide(pptx, fixturePalettes(), style);
    const bytes = (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
    const files = unzipSync(bytes);
    const [slidePath] = slideXmls(files);
    const xml = strFromU8(files[slidePath!]!);
    const textCount = (xml.match(/<a:t>/g) ?? []).length;
    // 4 row labels + a heading, at minimum.
    expect(textCount).toBeGreaterThanOrEqual(5);
    expect(xml).toContain('Palette 1');
    expect(xml).toContain('Palette 4');
  });
});
