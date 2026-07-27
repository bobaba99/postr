/**
 * Google Fonts loading helpers — shared by the editor canvas, the
 * print window, and the standalone manuscript-to-poster preview.
 *
 * Only the requested family is fetched (never all ten curated
 * families) — see the print-perf note in PosterEditor's print flow.
 */

export const FONT_URL_FRAGMENTS: Record<string, string> = {
  'Source Sans 3': 'Source+Sans+3:wght@300;400;500;600;700;800',
  'DM Sans': 'DM+Sans:wght@400;500;600;700;800',
  'IBM Plex Sans': 'IBM+Plex+Sans:wght@300;400;500;600;700',
  'Fira Sans': 'Fira+Sans:wght@300;400;500;600;700;800',
  'Libre Franklin': 'Libre+Franklin:wght@300;400;500;600;700;800',
  Outfit: 'Outfit:wght@300;400;500;600;700;800',
  Charter: 'Charter:ital,wght@0,400;0,700;1,400',
  Literata: 'Literata:wght@400;500;600;700;800',
  'Source Serif 4': 'Source+Serif+4:wght@400;500;600;700;800',
  Lora: 'Lora:wght@400;500;600;700',
};

/** Build a Google Fonts URL for a single font family. */
export function googleFontsUrl(fontFamily: string): string {
  const fragment =
    FONT_URL_FRAGMENTS[fontFamily] ?? FONT_URL_FRAGMENTS['Source Sans 3'];
  return `https://fonts.googleapis.com/css2?family=${fragment}&display=swap`;
}

/** Loaded font families — prevent duplicate link tags. */
const loadedFonts = new Set<string>();

/** Inject a Google Fonts link tag for the given font (idempotent). */
export function ensureFontLoaded(fontFamily: string): void {
  if (loadedFonts.has(fontFamily)) return;
  loadedFonts.add(fontFamily);
  const link = document.createElement('link');
  link.href = googleFontsUrl(fontFamily);
  link.rel = 'stylesheet';
  document.head.appendChild(link);
}
