/**
 * Task 10 — the composed styled-deck pptx export: content slides plus
 * the palette, icon-library, AND layout-template utility slides, in ONE
 * file (one `pptx.write()`), not several. Mirrors
 * `deckWriterStyled.test.ts`'s unzip-and-assert strategy and
 * `iconLibrarySlide.test.ts`'s injected rasterizer (jsdom has no real
 * canvas).
 *
 * The layout-slide group (`addTemplateSlides`) was wired in to make the
 * paid PowerPoint card's "5 empty layout slides to duplicate" claim
 * (`ExportDrawer.tsx`) true — a final-review finding caught that this
 * export previously appended only the palette + icon slides, so a
 * paying user's file had zero layout slides despite the card
 * advertising them.
 */
import { describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { exportStyledDeckWithUtilitySlides } from '../exportStyledDeckWithUtilitySlides';
import { PALETTE_SLIDE_NAME } from '../paletteSlide';
import { ICON_LIBRARY_SLIDE_NAME } from '../iconLibrarySlide';
import {
  EXPLAINER_SLIDE_NAME,
  TEMPLATE_SLIDE_LAYOUTS,
} from '../../pptx/templateSlides';
import { TEMPLATE_SLIDE_PREFIX, APPENDED_SLIDE_COUNT } from '../../pptx/templateMarker';
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
  it('appends exactly 8 utility slides after the content slides, in one file', async () => {
    const rasterizeSvg = vi.fn(async () => TINY_PNG_BYTES);
    const bytes = await exportStyledDeckWithUtilitySlides(fixtureDeck(), PALETTES, {
      rasterizeSvg,
    });
    const files = unzipSync(bytes);
    const xmls = slideXmls(files);

    // 2 content slides + palette + icon library + (1 explainer + 5
    // layout) template slides = 10. The 8 appended utility slides match
    // APPENDED_SLIDE_COUNT — the importer's cap on how many
    // TEMPLATE_SLIDE_PREFIX-named slides a single export can produce.
    expect(xmls).toHaveLength(fixtureDeck().slides.length + APPENDED_SLIDE_COUNT);
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
    expect(names[4]).toBe(EXPLAINER_SLIDE_NAME);
    for (const [i, layout] of TEMPLATE_SLIDE_LAYOUTS.entries()) {
      expect(names[5 + i]).toBe(`${TEMPLATE_SLIDE_PREFIX}${layout}`);
    }
    // Every appended utility slide — palette, icon library, explainer,
    // and all 5 layouts — carries the prefix the importer keys off of.
    for (const name of names.slice(2)) {
      expect(name.startsWith(TEMPLATE_SLIDE_PREFIX)).toBe(true);
    }
  });

  it('appends the explainer + one empty slide per TEMPLATE_SLIDE_LAYOUTS entry, making the paid-card "5 empty layout slides" claim true', async () => {
    const rasterizeSvg = vi.fn(async () => TINY_PNG_BYTES);
    const bytes = await exportStyledDeckWithUtilitySlides(fixtureDeck(), PALETTES, {
      rasterizeSvg,
    });
    const files = unzipSync(bytes);
    const xmls = slideXmls(files);
    const names = slideNames(xmls, files);

    // The 5 layout slides (the explainer is a header, not a layout —
    // matches the ExportDrawer.tsx copy's own accounting).
    const layoutSlideNames = names.filter(
      (n) => n.startsWith(TEMPLATE_SLIDE_PREFIX) && n !== EXPLAINER_SLIDE_NAME && n !== PALETTE_SLIDE_NAME && n !== ICON_LIBRARY_SLIDE_NAME,
    );
    expect(layoutSlideNames).toHaveLength(TEMPLATE_SLIDE_LAYOUTS.length);
    expect(layoutSlideNames).toHaveLength(5);
    expect(names).toContain(EXPLAINER_SLIDE_NAME);
  });

  it('gives each layout slide the theme background fill — theme colors actually reached the layout slides, not just the palette/icon ones', async () => {
    const rasterizeSvg = vi.fn(async () => TINY_PNG_BYTES);
    const bytes = await exportStyledDeckWithUtilitySlides(fixtureDeck(), PALETTES, {
      rasterizeSvg,
    });
    const files = unzipSync(bytes);
    const xmls = slideXmls(files);
    const names = slideNames(xmls, files);

    const bgHex = theme.palette[0]!.replace('#', '').toUpperCase();
    for (const [i, name] of names.entries()) {
      if (name === EXPLAINER_SLIDE_NAME || TEMPLATE_SLIDE_LAYOUTS.some((l) => name === `${TEMPLATE_SLIDE_PREFIX}${l}`)) {
        const xml = strFromU8(files[xmls[i]!]!);
        expect(xml).toContain(`<a:srgbClr val="${bgHex}"/>`);
      }
    }
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
