/**
 * Task 10 — the composed styled-deck pptx export: content slides plus
 * the palette and icon-library utility slides, in ONE file (one
 * `pptx.write()`), not several. Mirrors `deckWriterStyled.test.ts`'s
 * unzip-and-assert strategy and `iconLibrarySlide.test.ts`'s injected
 * rasterizer (jsdom has no real canvas).
 */
import { describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { exportStyledDeckWithUtilitySlides } from '../exportStyledDeckWithUtilitySlides';
import { PALETTE_SLIDE_NAME } from '../paletteSlide';
import { ICON_LIBRARY_SLIDE_NAME } from '../iconLibrarySlide';
import { TEMPLATE_SLIDE_PREFIX } from '../../pptx/templateMarker';
import { TINY_PNG_BYTES } from '../../__tests__/fixtures';
import type { StyledSlideDeck } from '../../../manuscript/deck/styledTypes';

const theme: StyledSlideDeck['theme'] = {
  palette: ['#F7F8FA', '#1F2933', '#3E5C76', '#5F8F8B'],
  typeScale: { heading: 30, body: 18, label: 13 },
  accentTreatment: 'slate',
};

function fixtureDeck(): StyledSlideDeck {
  return {
    durationMinutes: 10,
    theme,
    slides: [
      {
        role: 'title',
        device: 'plain',
        elements: [{ kind: 'title', text: 'Spaced practice in the classroom', x: 0.7, y: 0.5 }],
      },
      {
        role: 'result',
        device: 'stat-emphasis',
        elements: [{ kind: 'title', text: 'Spacing raised six-week recall', x: 0.7, y: 0.5 }],
      },
    ],
  };
}

const PALETTES = [
  ['#FFFFFF', '#111111', '#7C6AED', '#6B7280'],
  ['#F5F5F0', '#1F2933', '#2E7D6B', '#9AA5B1'],
  ['#FBF9F6', '#22223B', '#9A8C98', '#C9ADA7'],
  ['#F0F4F8', '#102A43', '#486581', '#829AB1'],
];

const slideXmls = (files: Record<string, Uint8Array>): string[] =>
  Object.keys(files)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort((a, b) => Number(a.replace(/\D+/g, '')) - Number(b.replace(/\D+/g, '')));

const slideNames = (xmls: string[], files: Record<string, Uint8Array>): string[] =>
  xmls.map((path) => {
    const xml = strFromU8(files[path]!);
    return /<p:cSld name="([^"]*)"/.exec(xml)?.[1] ?? '';
  });

describe('exportStyledDeckWithUtilitySlides', () => {
  it('appends exactly 2 utility slides after the content slides, in one file', async () => {
    const rasterizeSvg = vi.fn(async () => TINY_PNG_BYTES);
    const bytes = await exportStyledDeckWithUtilitySlides(fixtureDeck(), PALETTES, {
      rasterizeSvg,
    });
    const files = unzipSync(bytes);
    const xmls = slideXmls(files);

    // 2 content slides + palette + icon library = 4.
    expect(xmls).toHaveLength(4);
  });

  it('names the appended slides with TEMPLATE_SLIDE_PREFIX so the importer recognizes them as Postr-authored', async () => {
    const rasterizeSvg = vi.fn(async () => TINY_PNG_BYTES);
    const bytes = await exportStyledDeckWithUtilitySlides(fixtureDeck(), PALETTES, {
      rasterizeSvg,
    });
    const files = unzipSync(bytes);
    const xmls = slideXmls(files);
    const names = slideNames(xmls, files);

    expect(names[2]).toBe(PALETTE_SLIDE_NAME);
    expect(names[3]).toBe(ICON_LIBRARY_SLIDE_NAME);
    expect(names[2]!.startsWith(TEMPLATE_SLIDE_PREFIX)).toBe(true);
    expect(names[3]!.startsWith(TEMPLATE_SLIDE_PREFIX)).toBe(true);
  });

  it('awaits icon rasterization before writing — the icon slide carries real images, not raw SVG', async () => {
    const rasterizeSvg = vi.fn(async () => TINY_PNG_BYTES);
    const bytes = await exportStyledDeckWithUtilitySlides(fixtureDeck(), PALETTES, {
      rasterizeSvg,
    });
    expect(rasterizeSvg).toHaveBeenCalled();
    const files = unzipSync(bytes);
    expect(Object.keys(files).some((k) => k.endsWith('.svg'))).toBe(false);
    expect(Object.keys(files).some((k) => k.startsWith('ppt/media/image'))).toBe(true);
  });

  it('falls back to the active theme palette as a single row when palettes is empty', async () => {
    const rasterizeSvg = vi.fn(async () => TINY_PNG_BYTES);
    const bytes = await exportStyledDeckWithUtilitySlides(fixtureDeck(), [], { rasterizeSvg });
    const files = unzipSync(bytes);
    const xmls = slideXmls(files);
    const paletteXml = strFromU8(files[xmls[2]!]!);
    expect(paletteXml).toContain('Palette 1');
    expect(paletteXml).not.toContain('Palette 2');
  });
});
