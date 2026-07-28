/**
 * Chart series palettes — colours for drawing N series in one figure.
 *
 * Distinct from the POSTER palette (poster/constants.ts), which is a
 * 7-slot semantic structure describing a document's theme: background,
 * body text, header fill, and so on. This file is about the other
 * problem — when a figure draws six bars, which six colours are they,
 * and can a reader with colour-vision deficiency still tell them
 * apart?
 *
 * Every colour here is reproduced exactly as published by Simplified
 * Science Publishing, whose palettes are built and CVD-tested for
 * scientific figures:
 * https://www.simplifiedsciencepublishing.com/resources/best-color-palettes-for-scientific-figures-and-data-visualizations
 *
 * DO NOT "improve" individual hexes. The value of a tested palette is
 * the relationship between its colours — separation in luminance as
 * well as hue, so the set survives greyscale printing and both common
 * red-green deficiencies. Swapping one colour for a nicer-looking one
 * silently discards that property while leaving the palette's name
 * claiming it. Add whole palettes rather than editing existing ones.
 *
 * Sizes are 3 and 6 because those are what the source publishes as
 * complete tested sets (it also has 2, 4, and 8). There is no 5-colour
 * set on the page, and inventing a fifth colour to pad one out would
 * be exactly the kind of untested edit the paragraph above warns
 * about, so 6 is offered instead.
 */

/** How a palette's colours relate to each other — drives which
 *  palettes are offered for a given chart form. */
export type SeriesPaletteKind =
  /** Unordered categories: treatment vs control, species A/B/C. */
  | 'qualitative'
  /** Ordered low→high: dose levels, time bins, Likert agreement. */
  | 'sequential'
  /** Two directions away from a meaningful midpoint: change scores. */
  | 'divergent'
  /** Luminance-only: safe for mono printing and every CVD type. */
  | 'grayscale';

export interface SeriesPalette {
  /** Stable id — persisted on charts, so never rename in place. */
  id: string;
  /** Shown in the picker. */
  name: string;
  kind: SeriesPaletteKind;
  /** Colours in draw order. Length is the palette's size. */
  colors: readonly string[];
  /** One line on when to reach for it. */
  note: string;
}

/**
 * Three-colour sets. Two divergent colours plus a gray, or three
 * sequential stops of one hue — the source's two recommended shapes
 * for three series.
 */
export const SERIES_PALETTES_3: readonly SeriesPalette[] = [
  {
    id: 'blue-orange-gray',
    name: 'Blue · Orange · Gray',
    kind: 'qualitative',
    colors: ['#1a80bb', '#ea801c', '#b8b8b8'],
    note: 'The most robust pair under red-green CVD, plus a neutral.',
  },
  {
    id: 'teal-red-gray',
    name: 'Teal · Red · Gray',
    kind: 'qualitative',
    colors: ['#298c8c', '#a00000', '#b8b8b8'],
    note: 'Strong separation when a "bad" category should read as red.',
  },
  {
    id: 'purple-gray-gold',
    name: 'Purple · Gray · Gold',
    kind: 'qualitative',
    colors: ['#5e4c5f', '#999999', '#ffbb6f'],
    note: 'Muted alternative when blue is already used elsewhere.',
  },
  {
    id: 'blues-sequential',
    name: 'Blues (light → dark)',
    kind: 'sequential',
    colors: ['#8cc5e3', '#3594cc', '#2066a8'],
    note: 'Ordered categories — dose, time bin, or severity.',
  },
  {
    id: 'reds-sequential',
    name: 'Reds (light → dark)',
    kind: 'sequential',
    colors: ['#d8a6a6', '#c46666', '#a00000'],
    note: 'Ordered categories where intensity should read as risk.',
  },
  {
    id: 'teals-sequential',
    name: 'Teals (light → dark)',
    kind: 'sequential',
    colors: ['#9fc8c8', '#54a1a1', '#1f6f6f'],
    note: 'Ordered categories in a cooler register.',
  },
];

/**
 * Six-colour sets. At six series, hue alone stops being enough — each
 * of these also varies luminance so the set survives greyscale.
 */
export const SERIES_PALETTES_6: readonly SeriesPalette[] = [
  {
    id: 'qualitative-6',
    name: 'Contrasting six',
    kind: 'qualitative',
    colors: ['#082a54', '#e02b35', '#f0c571', '#59a89c', '#a559aa', '#cecece'],
    note: 'Six unordered categories — the general-purpose choice.',
  },
  {
    id: 'divergent-6',
    name: 'Blue → Red (divergent)',
    kind: 'divergent',
    colors: ['#2066a8', '#8ec1da', '#cde1ec', '#ededed', '#f6d6c2', '#d47264'],
    note: 'Change from a midpoint — heat maps, gain vs loss.',
  },
  {
    id: 'sequential-teal-6',
    name: 'Teal ramp',
    kind: 'sequential',
    colors: ['#b5d1ae', '#80ae9a', '#568b87', '#326b77', '#1b485e', '#122740'],
    note: 'Six ordered levels, light to dark.',
  },
  {
    id: 'grayscale-6',
    name: 'Grayscale',
    kind: 'grayscale',
    colors: ['#262626', '#595959', '#7f7f7f', '#a1a1a1', '#bababa', '#d4d4d4'],
    note: 'Mono printing, or when colour carries no meaning.',
  },
];

/** Every series palette, both sizes. */
export const SERIES_PALETTES: readonly SeriesPalette[] = [
  ...SERIES_PALETTES_3,
  ...SERIES_PALETTES_6,
];

/** Look up by id. Returns null rather than a silent fallback, so a
 *  stale id on a saved chart is visible instead of quietly redrawn in
 *  the wrong colours. */
export function findSeriesPalette(id: string): SeriesPalette | null {
  return SERIES_PALETTES.find((p) => p.id === id) ?? null;
}

/**
 * The palettes worth offering for `count` series.
 *
 * Exact-size matches come first: a 3-series chart drawn from a
 * 6-colour palette uses half of it and throws away the luminance
 * spacing that made the set work. Larger palettes still follow, since
 * truncating a tested set is better than cycling a small one.
 */
export function seriesPalettesFor(count: number): readonly SeriesPalette[] {
  if (count <= 0) return SERIES_PALETTES;
  const fits = SERIES_PALETTES.filter((p) => p.colors.length >= count);
  const exact = fits.filter((p) => p.colors.length === count);
  const larger = fits.filter((p) => p.colors.length !== count);
  // Nothing is wide enough — hand back the widest so the caller can
  // cycle rather than getting an empty list.
  if (fits.length === 0) return SERIES_PALETTES_6;
  return [...exact, ...larger];
}
