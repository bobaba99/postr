/**
 * Compose the FULL styled-deck pptx export (Task 10 — the integration):
 * the styled content slides, plus the two Phase-2 utility slides — the
 * palette swatch slide and the icon-library slide — appended to the SAME
 * pptx instance so the export is one file, not several.
 *
 * The PDF export path (`exportStyledDeckPdf`) never sees these utility
 * slides — they are pptx-only by construction (`paletteSlide.ts` /
 * `iconLibrarySlide.ts` append straight to a `PptxGenJS` instance, never
 * touching `StyledSlideDeck`), so there is nothing to omit there.
 *
 * `addIconLibrarySlide` is ASYNC (it rasterizes each icon's SVG to PNG —
 * pptxgenjs cannot embed SVG). This function awaits it before the final
 * `pptx.write()`, or the archive would be written mid-rasterization.
 */
import type PptxGenJS from 'pptxgenjs';
import type { StyledSlideDeck, Theme } from '../../manuscript/deck/styledTypes';
import { buildStyledDeckPptxInstance, type StyledDeckPptxOptions } from '../pptx/deckWriter';
import { addPaletteSlide, type PaletteSlideStyle } from './paletteSlide';
import { addIconLibrarySlide, type IconLibrarySlideOptions } from './iconLibrarySlide';
import { pickIcons } from './iconSet';

export interface ExportStyledDeckWithUtilitySlidesOptions extends StyledDeckPptxOptions {
  /** Injectable SVG rasterizer for the icon slide (tests / headless). */
  rasterizeSvg?: IconLibrarySlideOptions['rasterizeSvg'];
}

const UTILITY_FONT = 'Arial';

/** Derive the palette slide's type/voice from the deck's own theme type
 *  scale, mirroring how `resolveTemplateStyle` derives it from the
 *  poster's styles for the (currently unwired) `templateSlides.ts` path. */
function paletteStyleFromTheme(theme: Theme): PaletteSlideStyle {
  return {
    font: UTILITY_FONT,
    headingPt: theme.typeScale.heading * 0.55,
    bodyPt: theme.typeScale.body * 0.7,
    labelPt: theme.typeScale.label,
    textColor: theme.palette[1] ?? '#111111',
  };
}

/**
 * Topic keywords for icon matching — every content slide's role, plus
 * any element text, gives `pickIcons` something to tag-match against.
 * Falls back to the full curated set (via `pickIcons`'s own empty-input
 * behavior) when nothing matches.
 */
function topicKeywordsFromDeck(deck: StyledSlideDeck): string[] {
  const words = new Set<string>();
  for (const slide of deck.slides) {
    words.add(slide.role);
    for (const el of slide.elements) {
      if (!el.text) continue;
      for (const word of el.text.split(/\s+/)) {
        const cleaned = word.replace(/[^a-zA-Z-]/g, '');
        if (cleaned.length >= 3) words.add(cleaned.toLowerCase());
      }
    }
  }
  return [...words];
}

/**
 * Export a `StyledSlideDeck` as an editable `.pptx` with the palette and
 * icon-library utility slides appended after the content slides. One
 * `pptx.write()` call — every slide, content and utility, in one file.
 *
 * `palettes` is the 4-row curated set from `generateTheme` (Task 5) —
 * `StyledSlideDeck` itself carries only the single ACTIVE theme, not the
 * full palette options, so the palette slide's rows are passed in
 * separately rather than read off the deck.
 */
export async function exportStyledDeckWithUtilitySlides(
  deck: StyledSlideDeck,
  palettes: readonly (readonly string[])[],
  options: ExportStyledDeckWithUtilitySlidesOptions = {},
): Promise<Uint8Array> {
  const pptx: PptxGenJS = await buildStyledDeckPptxInstance(deck, options);

  const paletteRows = palettes.length > 0 ? palettes : [deck.theme.palette];
  addPaletteSlide(pptx, paletteRows, paletteStyleFromTheme(deck.theme));

  const icons = pickIcons(topicKeywordsFromDeck(deck));
  await addIconLibrarySlide(pptx, icons, deck.theme, {
    rasterizeSvg: options.rasterizeSvg,
  });

  return (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
}
