/**
 * Pure content derivations shared by the export writers.
 *
 * These mirror what the canvas renders (PosterEditor / blocks.tsx)
 * WITHOUT touching the DOM or the store, so a `PosterDoc` that was
 * never opened in the editor exports identically (plan §5):
 *
 * - figure/table caption numbers — reading order (y, then x)
 * - heading numbers — doc.blocks array order
 * - the authors block's three lines (authors + markers,
 *   affiliations, equal-contrib/corresponding footnote)
 * - formatted reference strings for the active citation style
 */
import type { Author, Block, Institution, PosterDoc, Reference } from '@postr/shared';
import {
  withAcknowledgementReference,
  type AttributionOptions,
} from './attribution';
import {
  CITATION_STYLES,
  DEFAULT_CITATION_STYLE,
  sortReferences,
  type CitationStyleKey,
  type SortMode,
} from '@/poster/citations';

// =========================================================================
// Numbering
// =========================================================================

/**
 * Auto-numbered captions for image + table blocks, keyed by block id.
 * Reading order: top-to-bottom primary, left-to-right secondary —
 * identical to PosterEditor's captionNumbers memo.
 */
export function computeCaptionNumbers(blocks: readonly Block[]): Record<string, number> {
  const out: Record<string, number> = {};
  const readingOrder = (a: Block, b: Block) => a.y - b.y || a.x - b.x;
  for (const type of ['image', 'table'] as const) {
    blocks
      .filter((b) => b.type === type)
      .slice()
      .sort(readingOrder)
      .forEach((b, i) => {
        out[b.id] = i + 1;
      });
  }
  return out;
}

/**
 * Section numbers for heading blocks — doc.blocks ARRAY order, not
 * canvas position (matches PosterEditor's headingNumbers memo).
 */
export function computeHeadingNumbers(blocks: readonly Block[]): Record<string, number> {
  const out: Record<string, number> = {};
  let counter = 0;
  for (const b of blocks) {
    if (b.type === 'heading') {
      counter += 1;
      out[b.id] = counter;
    }
  }
  return out;
}

// =========================================================================
// Authors block content (mirrors AuthorLine in blocks.tsx)
// =========================================================================

export interface AuthorSegment {
  name: string;
  /** Superscript markers: affiliation indices, then `*`, then `†`. */
  markers: string[];
}

export interface AffiliationSegment {
  /** 1-based superscript index shown before the institution. */
  index: number;
  text: string;
}

export interface AuthorsContent {
  authors: AuthorSegment[];
  affiliations: AffiliationSegment[];
  /** "*Equal contribution · †Corresponding author" line, or null. */
  footnote: string | null;
}

export function deriveAuthorsContent(
  authors: readonly Author[],
  institutions: readonly Institution[],
): AuthorsContent {
  const validAuthors = authors.filter((a) => a.name);
  const linked = institutions.filter((inst) =>
    authors.some((a) => a.affiliationIds.includes(inst.id)),
  );
  const used = linked.length > 0 ? linked : [...institutions];

  const authorSegments: AuthorSegment[] = validAuthors.map((a) => {
    const indices = a.affiliationIds
      .map((id) => used.findIndex((x) => x.id === id))
      .filter((x) => x >= 0)
      .map((x) => String(x + 1));
    const markers = [...indices];
    if (a.equalContrib) markers.push('*');
    if (a.isCorresponding) markers.push('†');
    return { name: a.name, markers };
  });

  const affiliations: AffiliationSegment[] = used.map((inst, i) => ({
    index: i + 1,
    text: [inst.name, inst.dept, inst.location].filter(Boolean).join(', '),
  }));

  const hasEqual = validAuthors.some((a) => a.equalContrib);
  const hasCorr = validAuthors.some((a) => a.isCorresponding);
  const footnoteParts: string[] = [];
  if (hasEqual) footnoteParts.push('*Equal contribution');
  if (hasCorr) footnoteParts.push('†Corresponding author');

  return {
    authors: authorSegments,
    affiliations,
    footnote: footnoteParts.length > 0 ? footnoteParts.join(' · ') : null,
  };
}

// =========================================================================
// References
// =========================================================================

export interface ExportContentOptions {
  citationStyle?: CitationStyleKey;
  sortMode?: SortMode;
  /** Paid-plan seam — see export/attribution.ts. */
  attribution?: AttributionOptions;
}

/**
 * References formatted with the active citation style, in render
 * order. Output strings use the `_italic_` marker dialect from
 * citations.ts (split with `splitItalicMarkers`).
 *
 * Defaults mirror the editor: APA 7, alphabetical sort.
 *
 * The Postr credit is appended as the LAST entry (owner decision) —
 * see `withAcknowledgementReference`. It is added AFTER sorting on
 * purpose: sorting first would alphabetize "Postr" into the middle of
 * the user's list, where a tool citation does not belong. Numbering
 * still runs over the combined list, so Vancouver/IEEE give it the
 * correct final index.
 *
 * Appending is idempotent, so a doc whose `references` already carry
 * the entry (a re-imported `.postr`) does not gain a second one.
 */
export function formatReferencesForExport(
  references: readonly Reference[],
  options: ExportContentOptions = {},
): string[] {
  const style = options.citationStyle ?? DEFAULT_CITATION_STYLE;
  const sortMode = options.sortMode ?? 'alpha';
  const fmt = CITATION_STYLES[style] ?? CITATION_STYLES[DEFAULT_CITATION_STYLE];
  const sorted = sortReferences([...references], sortMode);
  const withAck = withAcknowledgementReference(sorted, options.attribution);
  return withAck.map((r, i) => fmt(r, i));
}

// =========================================================================
// Misc
// =========================================================================

/** The poster's title text (plain), from the first title block. */
export function extractPosterTitle(doc: PosterDoc): string {
  const title = doc.blocks.find((b) => b.type === 'title');
  if (!title?.content) return '';
  // Title content is sanitized inline HTML — strip tags & entities
  // via the run parser's plain projection without pulling in a DOM.
  return title.content
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) =>
      m === '&amp;' ? '&' : m === '&lt;' ? '<' : m === '&gt;' ? '>' : m === '&quot;' ? '"' : m === '&nbsp;' ? ' ' : "'",
    )
    .trim();
}

/** Filesystem-safe base name for downloads and zip entries. */
export function safeFileBaseName(name: string, fallback = 'poster'): string {
  const cleaned = name.replace(/[^a-z0-9-_]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return cleaned || fallback;
}
