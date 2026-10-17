/**
 * Posters for scripts/text-size-check.mjs (record 33): the five layout
 * templates and the welcome poster as a new user meets them (from
 * lib/printPathPosters.mjs, built from the app's own `makeBlocks` and the
 * welcome seed's `poster.json`), and posters whose sizes a user set by hand
 * in the Style tab: a body between two of the rule's sizes (34 pt, 30 pt),
 * below them (24 pt) and above them (52 pt), and ratios set level by level.
 * A size set in the Style tab is stored as the points typed ÷ 7.2 (the
 * field's own conversion, `ptToUnits`), so these posters store theirs the
 * same way.
 */
import { POSTERS as PRINT_POSTERS } from './printPathPosters.mjs';
import { prose } from './arrangeScenarios.mjs';

const u = (pt) => pt / 7.2;

/** `styles` with the four levels' sizes replaced (in pt, stored as the Style tab stores them). */
export function withSizes(styles, pts) {
  const out = { ...styles };
  for (const [k, pt] of Object.entries(pts)) out[k] = { ...styles[k], size: u(pt) };
  return out;
}

/** A template's text blocks given prose and its title given a line, as a user has written into it. */
export function filled(blocks, title = 'ZQTITLE Sleep Restriction and Working Memory in Domestic Cats') {
  let i = 0;
  return blocks.map((b) => {
    if (b.type === 'title') return { ...b, content: title };
    if (b.type !== 'text') return b;
    i += 1;
    return { ...b, content: prose(i, [60, 30, 50, 30][(i - 1) % 4]) };
  });
}

const fromPrint = (id) => {
  const p = PRINT_POSTERS.find((x) => x.id === id);
  if (!p) throw new Error(`no print-path poster ${id}`);
  return { id: p.id, size: p.size, build: (a, d) => ({ ...d, ...p.build(a) }) };
};

/**
 * Every poster: `id`, the sheet `size`, `build(a, d)` returning the doc to
 * store (`a` from `prepAssets`, `d` the harness's default doc: the
 * 3-column template with authors and the default styles), and `extremes`
 * for the posters whose A+ to 48 pt and A− to 28 pt are read as
 * information (the brief's rule 7).
 */
export const POSTERS = [
  { ...fromPrint('tpl-3col'), extremes: true },
  { ...fromPrint('tpl-2col'), extremes: true },
  { ...fromPrint('tpl-billboard'), extremes: true },
  { ...fromPrint('tpl-sidebar'), extremes: true },
  { ...fromPrint('tpl-empty'), extremes: true },
  { ...fromPrint('welcome'), extremes: true },
  {
    id: 'body-34', size: { w: 48, h: 36 },
    build: (a, d) => ({ ...d, blocks: filled(a.t['3col@48x36']), styles: withSizes(d.styles, { body: 34 }) }),
  },
  {
    id: 'body-30-hand', size: { w: 48, h: 36 },
    build: (a, d) => ({ ...d, blocks: filled(a.t['3col@48x36']), styles: withSizes(d.styles, { title: 101, heading: 58, authors: 33, body: 30 }) }),
  },
  {
    id: 'body-24', size: { w: 48, h: 36 },
    build: (a, d) => ({ ...d, blocks: filled(a.t['3col@48x36']), styles: withSizes(d.styles, { body: 24 }) }),
  },
  {
    id: 'body-52', size: { w: 48, h: 36 },
    build: (a, d) => ({ ...d, blocks: filled(a.t['3col@48x36']), styles: withSizes(d.styles, { body: 52 }) }),
  },
  {
    // Ratios set level by level: a long title made smaller on its own, a
    // large heading, small authors, on a body of 40 pt.
    id: 'hand-ratios-40', size: { w: 48, h: 36 },
    build: (a, d) => ({ ...d, blocks: filled(a.t['3col@48x36']), styles: withSizes(d.styles, { title: 90, heading: 64, authors: 28, body: 40 }) }),
  },
  {
    // A large heading and title set by hand (within the Style tab's 200 pt):
    // A+ to 48 pt takes the heading past 14 units and the title past 30.
    id: 'hand-large-36', size: { w: 48, h: 36 },
    build: (a, d) => ({ ...d, blocks: filled(a.t['3col@48x36']), styles: withSizes(d.styles, { title: 170, heading: 80 }) }),
  },
  {
    id: 'user-filled', size: { w: 48, h: 36 },
    build: (a, d) => ({ ...d, blocks: filled(a.t['3col@48x36']) }),
  },
];

/** `styles` with one level's size stored as `raw`, as it is (null, a string, a negative number). */
const withRaw = (styles, level, raw) => ({ ...styles, [level]: { ...styles[level], size: raw } });

/**
 * Posters stored with a size that is not a size (review round 1, R1-F1 and
 * R1-F5): only a stored poster holds these (a NaN written as JSON is null;
 * the Style tab's field stores 0 when cleared, never these). Not on the
 * ladder: their own scenarios read them (lib/textSizeEdgeScenarios.mjs).
 */
export const EDGE_POSTERS = [
  ['stored-body-null', 'body', null],
  ['stored-body-string', 'body', '5'],
  ['stored-body-negative', 'body', -5],
  ['stored-title-null', 'title', null],
].map(([id, level, raw]) => ({
  id, size: { w: 48, h: 36 },
  build: (a, d) => ({ ...d, blocks: filled(a.t['3col@48x36']), styles: withRaw(d.styles, level, raw) }),
}));

/**
 * The poster every database row was created with before the typography
 * calibration (record 37): the posters table's first default for `data`,
 * copied from `supabase/migrations/20260408000100_posters.sql` as commit
 * 853ec1c wrote it (rewritten in place by 979df80, 2026-04-09, which also
 * added the editor page's load-time repair). Sizes in poster units: title 60,
 * heading 28, authors 22, body 18 (432 / 201.6 / 158.4 / 129.6 pt). The
 * client's own pre-calibration DEFAULT_STYLES (24 / 13 / 11 / 9, before
 * 9aa4620) were used only by a test and never written into a poster.
 */
export const OLD_DEFAULT_DATA = {
  version: 1,
  widthIn: 48,
  heightIn: 36,
  blocks: [],
  fontFamily: 'Source Sans 3',
  palette: { bg: '#ffffff', primary: '#1a1a26', accent: '#7c6aed', accent2: '#4a6cf7', muted: '#6b7280', headerBg: '#f3f4f6', headerFg: '#1a1a26' },
  styles: {
    title: { size: 60, weight: 700, italic: false, lineHeight: 1.1, color: null, highlight: null },
    heading: { size: 28, weight: 700, italic: false, lineHeight: 1.2, color: null, highlight: null },
    authors: { size: 22, weight: 400, italic: false, lineHeight: 1.3, color: null, highlight: null },
    body: { size: 18, weight: 400, italic: false, lineHeight: 1.4, color: null, highlight: null },
  },
  headingStyle: { border: 'bottom', fill: false, align: 'left' },
  institutions: [],
  authors: [],
  references: [],
};

/**
 * Posters for record 37's reload scenarios (lib/textSizeReloadScenarios.mjs):
 * the old default as a new row held it (no blocks); an old poster a user
 * wrote into before the calibration (its blocks, the old sizes); the same
 * with one level changed by hand (body 9 units, 64.8 pt: the only way a
 * poster could hold some old sizes and not others was an edit in the half
 * hour between autosave, 4e3190c, and the repair, 979df80); a font the
 * font list does not have, stored (a sibling read: fonts are not repaired);
 * and two odd shapes of the old default (its sizes as strings, its authors
 * level missing), information from review round 1.
 */
export const RELOAD_POSTERS = [
  { id: 'old-default-empty', size: { w: 48, h: 36 }, build: () => structuredClone(OLD_DEFAULT_DATA) },
  {
    // Written into: the template's blocks given text, and the harness's
    // made-up authors (so the authors block draws its level too).
    id: 'old-default-written', size: { w: 48, h: 36 },
    build: (a, d) => ({ ...structuredClone(OLD_DEFAULT_DATA), blocks: filled(a.t['3col@48x36']), authors: d.authors, institutions: d.institutions }),
  },
  {
    id: 'old-default-one-edited', size: { w: 48, h: 36 },
    build: (a, d) => {
      const o = structuredClone(OLD_DEFAULT_DATA);
      return { ...o, blocks: filled(a.t['3col@48x36']), authors: d.authors, institutions: d.institutions, styles: { ...o.styles, body: { ...o.styles.body, size: 9 } } };
    },
  },
  {
    id: 'font-not-listed', size: { w: 48, h: 36 },
    build: (a, d) => ({ ...d, blocks: filled(a.t['3col@48x36']), fontFamily: 'ZQ Unlisted Sans' }),
  },
  // Review round 1 of record 37 (R37-5): two odd shapes of the old default
  // that no known writer produced, read as information: its four sizes stored
  // as strings, and the old default with the authors level missing.
  {
    id: 'old-default-strings', size: { w: 48, h: 36 },
    build: (a, d) => {
      const o = structuredClone(OLD_DEFAULT_DATA);
      const styles = Object.fromEntries(Object.entries(o.styles).map(([k, v]) => [k, { ...v, size: String(v.size) }]));
      return { ...o, blocks: filled(a.t['3col@48x36']), authors: d.authors, institutions: d.institutions, styles };
    },
  },
  {
    id: 'old-default-authors-absent', size: { w: 48, h: 36 },
    build: (a, d) => {
      const o = structuredClone(OLD_DEFAULT_DATA);
      const { authors: _authors, ...styles } = o.styles;
      return { ...o, blocks: filled(a.t['3col@48x36']), authors: d.authors, institutions: d.institutions, styles };
    },
  },
];

export const posterById = (id) => [...POSTERS, ...EDGE_POSTERS, ...RELOAD_POSTERS].find((p) => p.id === id);
