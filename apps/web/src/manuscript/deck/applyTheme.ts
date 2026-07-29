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
 * Remaps a color to the theme palette based on element kind (for text elements).
 * If the element is a title, heading, body, quote, or label, and the color
 * is not already in the theme palette, map it to the appropriate palette slot.
 * Otherwise, return the color as-is or undefined if it's not in the palette.
 */
function remapColor(color: string | undefined, kind: string, theme: Theme): string | undefined {
  if (!color) return undefined;

  // If the color is already in the theme palette, keep it
  if (theme.palette.includes(color)) return color;

  // For title/body/label/quote elements, map to an appropriate slot
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

  // If no mapping applies, clear the color
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
