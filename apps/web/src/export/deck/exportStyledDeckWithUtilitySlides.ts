/**
 * Compose the FULL styled-deck pptx export (Task 10 — the integration):
 * the styled content slides, plus THREE Phase-2 utility groups — the
 * palette swatch slide, the icon-library slide, and the explainer +
 * 5 empty layout slides from `templateSlides.ts` — appended to the SAME
 * pptx instance so the export is one file, not several.
 *
 * The layout-slide group is what makes the paid PowerPoint card's "5
 * empty layout slides to duplicate" claim (`ExportDrawer.tsx`) true:
 * before this, `addTemplateSlides` was never called on the styled
 * export path, so a paying user's `.pptx` had zero layout slides
 * despite the card advertising them (final-review finding). Wiring it
 * in here — alongside the palette and icon slides that were already
 * wired — makes the copy match the file.
 *
 * The PDF export path (`exportStyledDeckPdf`) never sees any of these
 * utility slides — they are pptx-only by construction (`paletteSlide.ts`
 * / `iconLibrarySlide.ts` / `templateSlides.ts` all append straight to a
 * `PptxGenJS` instance, never touching `StyledSlideDeck`), so there is
 * nothing to omit there.
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
import {
  addTemplateSlides,
  type TemplateSlideStyle,
} from '../pptx/templateSlides';
import type { MasterPalette } from '../pptx/masters';
import { cssColorToHex6 } from '../richText';

export interface ExportStyledDeckWithUtilitySlidesOptions extends StyledDeckPptxOptions {
  /** Injectable SVG rasterizer for the icon slide (tests / headless). */
  rasterizeSvg?: IconLibrarySlideOptions['rasterizeSvg'];
}

const UTILITY_FONT = 'Arial';

// Matches deckWriter.ts's SLIDE_WIDTH_IN / SLIDE_HEIGHT_IN — the styled
// pptx instance is always this widescreen size (see
// `buildStyledDeckPptxInstance`'s `defineLayout` call), and
// `addTemplateSlides` needs the same numbers to lay out its explainer +
// layout slides at the right scale.
const SLIDE_WIDTH_IN = 13.333;
const SLIDE_HEIGHT_IN = 7.5;

/** Derive the palette slide's type/voice from the deck's own theme type
 *  scale, mirroring how `resolveTemplateStyle` derives it from the
 *  poster's styles for the `templateSlides.ts` poster-export path. */
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
 * Guarantee a 6-digit hex for a theme palette slot, falling back safely
 * when the slot is missing or the stored value isn't a parseable color
 * (`cssColorToHex6` returns null for either) — mirrors `masters.ts`'s
 * `resolveMasterPalette`, which applies the identical guarantee to the
 * poster's own `Palette` on the (unstyled) poster-export path.
 */
function hex6(value: string | undefined, fallback: string): string {
  return cssColorToHex6(value ?? null) ?? fallback;
}

/**
 * Map the styled deck's 4-slot `Theme.palette` onto the 7-field
 * `MasterPalette` the layout-slide masters expect.
 *
 * `Theme.palette` is `[background, primary-ink, accent, secondary-accent]`
 * — the same 4-row shape `generateTheme` (Task 5) produces and the
 * palette-swatch utility slide already displays row-for-row. `MasterPalette`
 * wants 7 named slots, so each theme slot is reused for the closest-fit
 * field rather than inventing new colors the deck's own theme never
 * chose:
 *   - `bg`       ← palette[0]  (the deck's background — same slot
 *                                `buildStyledDeckPptxInstance` already
 *                                uses for every content slide's fill)
 *   - `primary`  ← palette[1]  (the deck's main ink color)
 *   - `accent`   ← palette[2]  (the deck's accent — headings, rules)
 *   - `accent2`  ← palette[3]  (the deck's secondary accent)
 *   - `muted`    ← palette[1]  (no dedicated muted slot in a 4-color
 *                                theme; the layout slides only use
 *                                `muted` for a small corner label, so
 *                                reusing the primary ink at that scale
 *                                reads as "muted" without introducing a
 *                                fifth, ungrounded color)
 *   - `headerBg` ← palette[0]  (the header band sits on the same
 *                                background as the rest of the slide —
 *                                the styled deck has no separate header
 *                                treatment the way a poster's `Palette`
 *                                does)
 *   - `headerFg` ← palette[1]  (header text is the deck's primary ink,
 *                                same reasoning as `headerBg`)
 * Every field is routed through `hex6` so a missing or malformed theme
 * slot degrades to the same defaults `resolveMasterPalette` uses,
 * rather than handing pptxgenjs an invalid color.
 */
function masterPaletteFromTheme(theme: Theme): MasterPalette {
  const bg = hex6(theme.palette[0], 'FFFFFF');
  const primary = hex6(theme.palette[1], '111111');
  const accent = hex6(theme.palette[2], '0F4C75');
  const accent2 = hex6(theme.palette[3], '3282B8');
  return {
    bg,
    primary,
    accent,
    accent2,
    muted: primary,
    headerBg: bg,
    headerFg: primary,
  };
}

/** Derive the layout slides' style from the deck's own theme — the
 *  styled export path has a `Theme`, not a `PosterDoc`, so it cannot
 *  call `resolveTemplateStyle` (which needs the poster's own
 *  `doc.styles`); this is that function's styled-deck equivalent. */
function templateStyleFromTheme(theme: Theme): TemplateSlideStyle {
  return {
    font: UTILITY_FONT,
    palette: masterPaletteFromTheme(theme),
    headingPt: theme.typeScale.heading * 0.55,
    bodyPt: theme.typeScale.body * 0.7,
    labelPt: theme.typeScale.label,
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
 * Export a `StyledSlideDeck` as an editable `.pptx` with the palette,
 * icon-library, and layout-template utility slides appended after the
 * content slides. One `pptx.write()` call — every slide, content and
 * utility, in one file.
 *
 * `palettes` is the 4-row curated set from `generateTheme` (Task 5) —
 * `StyledSlideDeck` itself carries only the single ACTIVE theme, not the
 * full palette options, so the palette slide's rows are passed in
 * separately rather than read off the deck.
 *
 * Order: palette, then icon library, then the explainer + 5 layout
 * slides. Deterministic and arbitrary beyond that — nothing downstream
 * depends on utility-slide order, only on every one of them carrying
 * `TEMPLATE_SLIDE_PREFIX` (which each of the three appenders already
 * guarantees on its own).
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

  // The paid PowerPoint card (`ExportDrawer.tsx`) advertises "5 empty
  // layout slides to duplicate" — `addTemplateSlides` is what actually
  // produces them (1 explainer + 5 named layouts). Without this call
  // the card's claim was false: a paying user's file had zero layout
  // slides (final-review finding). `addSlide({ masterName })` degrades
  // gracefully to the deck's default layout when a name isn't a
  // DEFINED master (pptxgenjs never throws on an unknown masterName),
  // and every layout slide here sets its own `slide.background` and
  // explicit per-object `fontFace`/`fontSize`/`color` rather than
  // relying on inherited placeholder styling — so these slides render
  // correctly-styled content even though this styled pptx instance
  // never calls `defineSlideMaster` (unlike the poster-export path in
  // `writer.ts`, which does). The only thing a missing master
  // definition costs is the *named* layout not appearing in
  // PowerPoint's Layout gallery under that name — cosmetic, not
  // functional, and out of scope for what the copy promises.
  addTemplateSlides(pptx, templateStyleFromTheme(deck.theme), SLIDE_WIDTH_IN, SLIDE_HEIGHT_IN);

  return (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
}
