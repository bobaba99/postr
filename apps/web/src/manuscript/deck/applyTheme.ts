/**
 * applyTheme — Arm-T normalize layer
 *
 * Recolors every element to the theme palette (structural roles → palette slots)
 * and re-sizes text to the theme's type scale. P's structure (positions, device,
 * text) is untouched; only color + font size change. This is what makes
 * "re-vibe = re-run T only" cheap.
 *
 * Pure function: returns a new deck without mutating the input.
 */

import type { StyledSlideDeck, StyledSlide, StyledElement, Theme } from './styledTypes';

/**
 * Maps a slide role to a palette slot index.
 * title/heading → ink (palette[1])
 * accent-* → accent (palette[2])
 * muted/footer → muted (palette[3])
 * bg/background → bg (palette[0])
 * Others → no color (undefined)
 */
function roleToColorSlot(role: string): number | undefined {
  if (role === 'title' || role === 'heading') return 1; // ink
  if (role.startsWith('accent')) return 2; // accent
  if (role === 'muted' || role === 'footer') return 3; // muted
  if (role === 'bg' || role === 'background') return 0; // background
  return undefined;
}

/**
 * Maps an element kind to a type scale key.
 * title → heading
 * body/quote → body
 * label → label
 * Others → no size change (undefined)
 */
function kindToTypeScaleKey(kind: string): 'heading' | 'body' | 'label' | undefined {
  if (kind === 'title') return 'heading';
  if (kind === 'body' || kind === 'quote') return 'body';
  if (kind === 'label') return 'label';
  return undefined;
}

/**
 * Remaps a color to the theme palette based on element kind. Runs
 * whether or not the element already had a color — Arm P (styleDeck)
 * does not promise every element carries one, and an uncolored text
 * element must still land on a real, theme-legible color rather than
 * staying undefined (every downstream renderer — the live preview in
 * SlideViewer.tsx, the pptx writer, the pdf writer — falls back to a
 * single hardcoded near-black when `color` is undefined, which is
 * invisible on a dark theme background).
 *
 * For any kind this function KNOWS how to map (title/body/label/quote
 * via `kindToTypeScaleKey`, or a role-prefixed kind via
 * `roleToColorSlot`), the mapping always wins — deterministically, even
 * if the element already carries a color. This is what makes a re-vibe
 * (a second `applyTheme` pass with a DIFFERENT theme, over an
 * already-themed deck — SlidesWizard.tsx's handleVibeSubmit) safe: a
 * palette is not a stable set of colors across themes, only a stable
 * set of SLOT semantics (ink is always palette[1], background always
 * palette[0], etc). Trusting "the color happens to already be
 * somewhere in the new palette" would keep an old ink color that now
 * sits in the new theme's BACKGROUND slot — invisible-on-background is
 * exactly the bug this guards against.
 *
 * Only a kind with NO mapping at all falls back to "keep the existing
 * color as-is if it's already in this theme's palette, else clear it" —
 * there, preserving a plausible custom color is more useful than
 * clearing it, since there is no structural slot to recompute from.
 */
function remapColor(color: string | undefined, kind: string, theme: Theme): string | undefined {
  // For title/body/label/quote elements, map to an appropriate slot —
  // regardless of whether they started with a color, and regardless of
  // whether that color happens to appear elsewhere in the new palette.
  const typeScaleKey = kindToTypeScaleKey(kind);
  if (typeScaleKey) {
    // Map text elements to ink (palette[1])
    return theme.palette[1];
  }

  // For role-based elements (callout-box, etc), try to map by role prefix
  const roleSlot = roleToColorSlot(kind);
  if (roleSlot !== undefined && roleSlot < theme.palette.length) {
    return theme.palette[roleSlot];
  }

  // No structural mapping applies for this kind. If the element already
  // carries a color that happens to be one of this theme's own colors,
  // trust it (there's no slot semantics to contradict); otherwise clear
  // an off-palette color rather than carry a stale one forward.
  if (color && theme.palette.includes(color)) return color;
  return undefined;
}

/**
 * Apply theme: recolor elements and re-size text.
 */
export function applyTheme(deck: StyledSlideDeck, theme: Theme): StyledSlideDeck {
  const newSlides = deck.slides.map((slide) => applyThemeToSlide(slide, theme));

  return {
    ...deck,
    slides: newSlides,
    theme, // Update the deck's theme reference
  };
}

function applyThemeToSlide(slide: StyledSlide, theme: Theme): StyledSlide {
  const newElements = slide.elements.map((element) => applyThemeToElement(element, theme));

  return {
    ...slide,
    elements: newElements,
  };
}

function applyThemeToElement(element: StyledElement, theme: Theme): StyledElement {
  const typeScaleKey = kindToTypeScaleKey(element.kind);
  const fontSize = typeScaleKey ? theme.typeScale[typeScaleKey] : element.fontSize;
  const color = remapColor(element.color, element.kind, theme);

  return {
    ...element,
    fontSize,
    color,
  };
}
