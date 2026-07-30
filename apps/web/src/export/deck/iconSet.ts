/**
 * Curated academic/scientific icon set (Phase 2 — Task 7, icon sourcing).
 *
 * ── Sourcing / license ───────────────────────────────────────────────
 *
 * Every icon below is ORIGINAL WORK, hand-authored inline for this
 * project — simple monochrome line glyphs, each just a few `<path>` /
 * `<circle>` / `<line>` primitives on a 24×24 grid, 2px stroke,
 * `stroke-linecap="round"` / `stroke-linejoin="round"`, no fill. They
 * are not traced, adapted, or copied from any third-party icon set,
 * font, or library. Postr owns them outright and releases them
 * CC0-equivalent (public-domain-style, no attribution required) —
 * there is deliberately no external license to track, audit, or
 * violate.
 *
 * This is the safe path called for in the Task 7 brief: rather than
 * pulling from an unverified "permissively-licensed" third-party icon
 * pack (a genuine sourcing risk — license text drifts, packs get
 * relicensed, and this session cannot fetch and verify a real license
 * file), a small original set sidesteps the risk entirely while still
 * giving the icon slide something to place. If a broader/prettier
 * third-party set is wanted later, swap `CURATED_ICONS` for a vetted
 * one — `pickIcons` and `addIconLibrarySlide` don't care where the
 * `svg` strings came from, only that they use `currentColor`.
 *
 * ── Why `currentColor` ───────────────────────────────────────────────
 *
 * Every icon's stroke is `currentColor` (never a hardcoded hex) so
 * `addIconLibrarySlide` can recolor to the deck's theme by wrapping the
 * SVG in `<svg style="color:#RRGGBB">…` before rasterizing — one
 * substitution point, no per-icon patching.
 */

export interface CuratedIcon {
  /** Stable id, also used as the fallback label under the icon. */
  id: string;
  /** Human label shown under the icon on the slide. */
  label: string;
  /** Lowercase topic keywords this icon matches against. */
  tags: string[];
  /** Inline SVG source, 24x24 viewBox, currentColor stroke, no fill. */
  svg: string;
}

const ICON_ATTRS =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
  'xmlns="http://www.w3.org/2000/svg"';

export const CURATED_ICONS: readonly CuratedIcon[] = [
  {
    id: 'flask',
    label: 'Flask',
    tags: ['chemistry', 'experiment', 'lab', 'reaction', 'sample'],
    svg:
      `<svg ${ICON_ATTRS}>` +
      '<path d="M9 2h6"/>' +
      '<path d="M10 2v6.5L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8.5V2"/>' +
      '<path d="M7.5 15h9"/>' +
      '</svg>',
  },
  {
    id: 'brain',
    label: 'Brain',
    tags: ['brain', 'memory', 'cognit', 'neuro', 'mind', 'sleep'],
    svg:
      `<svg ${ICON_ATTRS}>` +
      '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1.5 5.6A3.5 3.5 0 0 0 8 18a2.5 2.5 0 0 0 4-2V6a2 2 0 0 0-3-2Z"/>' +
      '<path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1.5 5.6A3.5 3.5 0 0 1 16 18a2.5 2.5 0 0 1-4-2"/>' +
      '</svg>',
  },
  {
    id: 'chart',
    label: 'Line chart',
    tags: ['chart', 'data', 'trend', 'result', 'analysis', 'statistic'],
    svg:
      `<svg ${ICON_ATTRS}>` +
      '<path d="M3 3v18h18"/>' +
      '<path d="M7 15l4-5 3 3 5-7"/>' +
      '</svg>',
  },
  {
    id: 'dna',
    label: 'DNA helix',
    tags: ['dna', 'gene', 'genetic', 'biology', 'molecular'],
    svg:
      `<svg ${ICON_ATTRS}>` +
      '<path d="M7 3c0 6 10 6 10 12s-10 6-10 12" transform="translate(0 -3)"/>' +
      '<path d="M17 3c0 6-10 6-10 12s10 6 10 12" transform="translate(0 -3)"/>' +
      '<path d="M8 8h8"/><path d="M7 12h10"/><path d="M8 16h8"/>' +
      '</svg>',
  },
  {
    id: 'book',
    label: 'Book',
    tags: ['book', 'literature', 'review', 'reference', 'citation', 'reading'],
    svg:
      `<svg ${ICON_ATTRS}>` +
      '<path d="M4 5a2 2 0 0 1 2-2h6v18H6a2 2 0 0 0-2 2Z"/>' +
      '<path d="M20 5a2 2 0 0 0-2-2h-6v18h6a2 2 0 0 1 2 2Z"/>' +
      '</svg>',
  },
  {
    id: 'clock',
    label: 'Clock',
    tags: ['clock', 'time', 'duration', 'longitudinal', 'follow-up', 'sleep'],
    svg:
      `<svg ${ICON_ATTRS}>` +
      '<circle cx="12" cy="12" r="9"/>' +
      '<path d="M12 7v5l3.5 2"/>' +
      '</svg>',
  },
  {
    id: 'magnifier',
    label: 'Magnifier',
    tags: ['magnifier', 'search', 'method', 'inspect', 'detail', 'review'],
    svg:
      `<svg ${ICON_ATTRS}>` +
      '<circle cx="10.5" cy="10.5" r="6.5"/>' +
      '<path d="M20 20l-4.8-4.8"/>' +
      '</svg>',
  },
  {
    id: 'bars',
    label: 'Bar chart',
    tags: ['bars', 'comparison', 'result', 'data', 'statistic', 'chart'],
    svg:
      `<svg ${ICON_ATTRS}>` +
      '<path d="M4 21V10"/>' +
      '<path d="M12 21V4"/>' +
      '<path d="M20 21v-7"/>' +
      '<path d="M2 21h20"/>' +
      '</svg>',
  },
  {
    id: 'molecule',
    label: 'Molecule',
    tags: ['molecule', 'chemistry', 'compound', 'biology', 'structure'],
    svg:
      `<svg ${ICON_ATTRS}>` +
      '<circle cx="6" cy="6" r="2.2"/>' +
      '<circle cx="18" cy="6" r="2.2"/>' +
      '<circle cx="12" cy="17" r="2.2"/>' +
      '<path d="M7.8 7.3 10.4 15.2"/>' +
      '<path d="M16.2 7.3 13.6 15.2"/>' +
      '<path d="M8.2 6h7.6"/>' +
      '</svg>',
  },
  {
    id: 'person',
    label: 'Participant',
    tags: ['person', 'participant', 'subject', 'cohort', 'sample', 'human'],
    svg:
      `<svg ${ICON_ATTRS}>` +
      '<circle cx="12" cy="7" r="3.5"/>' +
      '<path d="M5 21c0-4.4 3.6-7 7-7s7 2.6 7 7"/>' +
      '</svg>',
  },
] as const;

/**
 * Tag-match `CURATED_ICONS` against `topicKeywords`, case-insensitively
 * and substring-both-ways (a keyword like "cognitive" matches the
 * `brain` icon's `cognit` tag, and a short tag like `dna` matches a
 * keyword of exactly `dna`). De-duplicates by id and preserves
 * `CURATED_ICONS` order.
 *
 * Falls back to the full curated set when nothing matches, so the icon
 * slide is never handed an empty list — a deck about an unmapped topic
 * still gets a generic, usable icon library rather than a blank slide.
 */
export function pickIcons(topicKeywords: readonly string[]): CuratedIcon[] {
  const keywords = topicKeywords
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0);

  if (keywords.length === 0) return [...CURATED_ICONS];

  // A minimum length on the "tag contains keyword" direction avoids
  // noise matches from very short keywords (e.g. "an" would otherwise
  // match the `person` icon's `human` tag purely by substring luck).
  // The reverse direction ("keyword contains tag", for a short tag
  // like `dna` matching a longer keyword like `dna-methylation`) has
  // no such risk since CURATED_ICONS' tags are curated, not arbitrary
  // input.
  const MIN_KEYWORD_LEN_FOR_SUBSTRING_MATCH = 3;
  const matched = CURATED_ICONS.filter((icon) =>
    icon.tags.some((tag) =>
      keywords.some(
        (kw) =>
          (kw.length >= MIN_KEYWORD_LEN_FOR_SUBSTRING_MATCH &&
            tag.includes(kw)) ||
          kw.includes(tag),
      ),
    ),
  );

  return matched.length > 0 ? matched : [...CURATED_ICONS];
}
