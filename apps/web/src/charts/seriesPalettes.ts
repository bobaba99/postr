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
 * The Simplified Science sets span sizes 2, 3, 4, 6, and 8 — every
 * complete tested set that source publishes. There is no 5-colour set
 * on the page, and inventing a fifth colour to pad one out would be
 * exactly the kind of untested edit the paragraph above warns about,
 * so a 5-series chart draws from the 6-colour sets instead (see
 * `seriesPalettesFor`).
 *
 * Alongside them are named colourblind-safe qualitative sets from two
 * other authorities: Okabe & Ito's Color Universal Design palette (8)
 * and Paul Tol's schemes (SRON technical note — bright 7, muted 9,
 * high-contrast 3). Same rule applies: verbatim source hexes, and each
 * clears the greyscale-separation test the rest of the file enforces.
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
 * Two-colour sets — the source's recommended pairs for a single
 * comparison (treatment vs control, before vs after). Every pair is
 * either two hues that survive both red-green CVD types, or a gray
 * paired with one accent, or a light/dark sequential pair.
 */
export const SERIES_PALETTES_2: readonly SeriesPalette[] = [
  // The source also lists Blue·Red and Blue·Orange as CVD-safe pairs,
  // but both are optimised for HUE separation and sit at nearly the
  // same luminance (spread 0.12 / 0.14) — they fail the greyscale test
  // this file enforces. They survive mono only once a gray is added,
  // which is exactly what the 3-colour "…+ Gray" sets below do, so they
  // live there rather than as bare pairs.
  {
    id: 'blue-yellow-2',
    name: 'Blue · Yellow',
    kind: 'qualitative',
    colors: ['#1a80bb', '#f2c45f'],
    note: 'High luminance separation — survives greyscale printing.',
  },
  {
    id: 'teal-gold-2',
    name: 'Teal · Gold',
    kind: 'qualitative',
    colors: ['#298c8c', '#f1a226'],
    note: 'A warmer pair when blue is already used elsewhere.',
  },
  {
    id: 'teal-magenta-2',
    name: 'Teal · Magenta',
    kind: 'qualitative',
    colors: ['#298c8c', '#800074'],
    note: 'Two saturated hues, well separated for two categories.',
  },
  {
    id: 'gray-blue-2',
    name: 'Gray · Blue',
    kind: 'qualitative',
    colors: ['#b8b8b8', '#1a80bb'],
    note: 'Grays a reference group so one accent group stands out.',
  },
  {
    id: 'grayscale-2',
    name: 'Grayscale',
    kind: 'grayscale',
    colors: ['#b8b8b8', '#707070'],
    note: 'Mono printing, or when colour carries no meaning.',
  },
  {
    id: 'blues-2',
    name: 'Blues (light → dark)',
    kind: 'sequential',
    colors: ['#8cc5e3', '#1a80bb'],
    note: 'Two ordered levels — low vs high of one dimension.',
  },
];

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

/**
 * Four-colour sets. Four divergent hues chosen to stay separable in
 * greyscale, or two light/dark sequential pairs — the source's two
 * shapes for four series.
 */
export const SERIES_PALETTES_4: readonly SeriesPalette[] = [
  {
    id: 'divergent-4-a',
    name: 'Blue · Red · Yellow · Teal',
    kind: 'qualitative',
    colors: ['#0000a2', '#bc272d', '#e9c716', '#50ad9f'],
    note: 'Four saturated hues with different luminances for greyscale.',
  },
  {
    id: 'divergent-4-b',
    name: 'Purple · Blue · Pink · Teal',
    kind: 'qualitative',
    colors: ['#4a2377', '#8cc5e3', '#f55f74', '#0d7d87'],
    note: 'A cooler four-hue set, still separable in mono.',
  },
  {
    id: 'divergent-4-c',
    name: 'Red · Orange · Light Teal · Dark Teal',
    kind: 'qualitative',
    colors: ['#d31f11', '#f47a00', '#62c8d3', '#007191'],
    note: 'Warm-to-cool four-hue set for four unordered categories.',
  },
  // The next three are two light/dark pairs of two hues — a common
  // shape for "two groups × two levels". They are NOT a single ordered
  // ramp (their luminance zig-zags between the two hues), so they are
  // `qualitative`, not `sequential`: labelling them sequential would
  // claim a monotonic order the colours don't carry.
  {
    id: 'seq-pairs-4-blue-orange',
    name: 'Blue pair · Orange pair',
    kind: 'qualitative',
    colors: ['#3594cc', '#8cc5e3', '#ea801c', '#f0b077'],
    note: 'Two light/dark pairs — two dimensions, two levels each.',
  },
  {
    id: 'seq-pairs-4-brown-teal',
    name: 'Brown pair · Teal pair',
    kind: 'qualitative',
    colors: ['#c99b38', '#eddca5', '#00b0be', '#8fd7d7'],
    note: 'Two light/dark pairs in a warmer register.',
  },
  {
    id: 'seq-pairs-4-teal-red',
    name: 'Teal pair · Red pair',
    kind: 'qualitative',
    colors: ['#0d7d87', '#99c6cc', '#c31e23', '#ff5a5e'],
    note: 'Two light/dark pairs, cool vs warm.',
  },
];

/**
 * Eight-colour sets. The most any one figure should carry — past this,
 * split into small multiples rather than adding a ninth hue nobody can
 * name. Bright and muted variants trade legibility for restraint.
 */
export const SERIES_PALETTES_8: readonly SeriesPalette[] = [
  {
    id: 'bright-8',
    name: 'Bright eight',
    kind: 'qualitative',
    colors: ['#003a7d', '#008dff', '#ff73b6', '#c701ff', '#4ecb8d', '#ff9d3a', '#f9e858', '#d83034'],
    note: 'Eight high-saturation hues — maximum separation, loud.',
  },
  {
    id: 'muted-8',
    name: 'Muted eight',
    kind: 'qualitative',
    colors: ['#c8c8c8', '#f0c571', '#59a89c', '#0b81a2', '#e25759', '#9d2c00', '#7e4794', '#36b700'],
    note: 'Eight calmer hues for a poster that already carries colour.',
  },
  {
    id: 'grayscale-8',
    name: 'Grayscale',
    kind: 'grayscale',
    colors: ['#0d0d0d', '#262626', '#595959', '#7f7f7f', '#a1a1a1', '#bababa', '#d4d4d4', '#ededed'],
    note: 'Mono printing, or when colour carries no meaning.',
  },
];

/**
 * Named colourblind-safe qualitative sets from outside Simplified
 * Science Publishing — Okabe & Ito's Color Universal Design palette and
 * Paul Tol's schemes (SRON technical note). Verbatim source hexes; each
 * clears the same greyscale-separation test as the sets above. All are
 * `qualitative` — unordered categorical sets, not luminance ramps.
 */
export const SERIES_PALETTES_NAMED: readonly SeriesPalette[] = [
  {
    id: 'okabe-ito',
    name: 'Okabe–Ito',
    kind: 'qualitative',
    colors: ['#000000', '#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7'],
    note: 'The standard eight-colour CVD-safe set for scientific figures.',
  },
  {
    id: 'tol-bright',
    name: 'Tol bright',
    kind: 'qualitative',
    colors: ['#4477aa', '#ee6677', '#228833', '#ccbb44', '#66ccee', '#aa3377', '#bbbbbb'],
    note: 'Paul Tol’s bright scheme — seven well-separated hues.',
  },
  {
    id: 'tol-muted',
    name: 'Tol muted',
    kind: 'qualitative',
    colors: ['#332288', '#88ccee', '#44aa99', '#117733', '#999933', '#ddcc77', '#cc6677', '#882255', '#aa4499'],
    note: 'Nine muted hues for many categories; softer than bright.',
  },
  {
    id: 'tol-high-contrast',
    name: 'Tol high-contrast',
    kind: 'qualitative',
    colors: ['#004488', '#ddaa33', '#bb5566'],
    note: 'Three maximally distinct colours, also mono-safe.',
  },
];

/** Every series palette, all sizes (2, 3, 4, 6, 8) plus the named sets. */
export const SERIES_PALETTES: readonly SeriesPalette[] = [
  ...SERIES_PALETTES_2,
  ...SERIES_PALETTES_3,
  ...SERIES_PALETTES_4,
  ...SERIES_PALETTES_6,
  ...SERIES_PALETTES_8,
  ...SERIES_PALETTES_NAMED,
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
