/**
 * Text clustering for PDF import.
 *
 * Takes the raw `TextItem[]` stream from `pdfjs.getTextContent()` and
 * groups it into logical blocks (one block ≈ one paragraph or heading).
 * Then assigns a semantic role per cluster using a font-size histogram:
 * largest size in the upper third → title; next tier → heading; remainder
 * → text. The cluster contiguous-with-the-title gets `authors`.
 *
 * The clustering is intentionally simple: spatial DBSCAN-lite on the
 * line baselines with `eps = 1.5 × medianLineHeight`. No graph algorithms,
 * no font-name matching — we trust position + size to do most of the work
 * because that's what the human eye does on a printed poster.
 */

/** A single positioned text run from pdfjs. We accept a structural
 *  subset so unit tests can construct mock items without importing
 *  pdfjs types. */
export interface RawTextItem {
  /** The string content. */
  str: string;
  /** Page-pt x of the baseline-left corner. */
  x: number;
  /** Page-pt y of the baseline. NOTE: pdfjs uses bottom-up coords; we
   *  expect the caller to convert to top-down (y = pageHeight - y) so
   *  cluster math stays intuitive (smaller y = nearer the top). */
  y: number;
  /** Width of the run in pt. */
  width: number;
  /** Height (font size) of the run in pt. */
  height: number;
  /** Font name as reported by pdfjs (not validated, may be base64-mangled). */
  fontName?: string;
}

/** Aggregated cluster of text items that visually belong together. */
export interface TextCluster {
  /** Joined text in reading order. */
  text: string;
  /** Bounding box in page-pt. */
  bbox: { x: number; y: number; w: number; h: number };
  /** Median font size of items in the cluster (pt). */
  fontSizePt: number;
  /** Source font names encountered in the cluster (deduped). */
  fontNames: string[];
  /** Original items, in source order. */
  items: RawTextItem[];
}

/** Cluster + assigned semantic role. */
export interface RoledCluster extends TextCluster {
  role: 'title' | 'heading' | 'authors' | 'text';
}

/**
 * Cluster items by spatial proximity. Items whose bounding boxes are
 * within `eps` pt of each other (4-neighbour adjacency) end up in the
 * same cluster.
 *
 * `eps` defaults to `1.5 × median(item.height)` which approximates
 * "one-and-a-half lines of leading" — generous enough to keep paragraph
 * lines together but tight enough to split adjacent columns.
 */
export function clusterTextItems(
  items: RawTextItem[],
  options: { eps?: number } = {},
): TextCluster[] {
  if (items.length === 0) return [];

  const heights = items.map((i) => i.height).filter((h) => h > 0);
  const medH = heights.length > 0 ? median(heights) : 12;
  const eps = options.eps ?? 1.5 * medH;

  // Union-Find with neighbour proximity check.
  const parent = items.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  // Naive O(n²) — fine for a poster with a few thousand items.
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (areClose(items[i]!, items[j]!, eps)) {
        union(i, j);
      }
    }
  }

  // Bucket by root.
  const buckets = new Map<number, RawTextItem[]>();
  for (let i = 0; i < items.length; i++) {
    const root = find(i);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root)!.push(items[i]!);
  }

  return [...buckets.values()]
    .map(buildCluster)
    .filter((c) => c.text.trim().length > 0);
}

function areClose(a: RawTextItem, b: RawTextItem, eps: number): boolean {
  // Items with different font sizes shouldn't cluster — title /
  // authors / institutions on a poster sit spatially close but are
  // conceptually different blocks. We reject pairs where the smaller
  // font is < 70% of the larger. Empirically this catches:
  //   title 22 ↔ authors 14   (0.64) — split ✓
  //   authors 14 ↔ inst 10    (0.71) — kept (need spatial gap to split)
  //   heading 16 ↔ body 11    (0.69) — split ✓
  //   body 11 ↔ body 10       (0.91) — kept ✓
  // Items in the same logical block almost always share a font size,
  // so 0.7 is rarely too aggressive.
  const maxH = Math.max(a.height, b.height);
  const minH = Math.min(a.height, b.height);
  if (maxH > 0 && minH / maxH < 0.7) return false;

  // Distance between bounding boxes (0 if overlapping, else gap).
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const dx = Math.max(0, Math.max(a.x - bx2, b.x - ax2));
  const dy = Math.max(0, Math.max(a.y - by2, b.y - ay2));
  return Math.hypot(dx, dy) <= eps;
}

function buildCluster(items: RawTextItem[]): TextCluster {
  // Reading order: top-to-bottom, then left-to-right.
  const sorted = [...items].sort((a, b) => {
    // Group by line: items with overlapping y-ranges are on the same line.
    const sameLine = Math.abs(a.y - b.y) < Math.min(a.height, b.height) * 0.5;
    if (sameLine) return a.x - b.x;
    return a.y - b.y;
  });

  // Emit text with line breaks where the y jump exceeds the line height.
  let text = '';
  let prev: RawTextItem | null = null;
  for (const it of sorted) {
    if (prev) {
      const yJump = it.y - prev.y;
      const lineH = Math.min(prev.height, it.height);
      if (yJump > lineH * 0.5) {
        text += '\n';
      } else if (!text.endsWith(' ') && it.x - (prev.x + prev.width) > 1) {
        text += ' ';
      }
    }
    text += it.str;
    prev = it;
  }

  const xs = items.map((i) => i.x);
  const ys = items.map((i) => i.y);
  const x2s = items.map((i) => i.x + i.width);
  const y2s = items.map((i) => i.y + i.height);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(...x2s) - x;
  const h = Math.max(...y2s) - y;

  const sizes = items.map((i) => i.height).filter((s) => s > 0);
  const fontSizePt = sizes.length > 0 ? median(sizes) : 0;
  const fontNames = [
    ...new Set(items.map((i) => i.fontName).filter((n): n is string => !!n)),
  ];

  return { text: text.trim(), bbox: { x, y, w, h }, fontSizePt, fontNames, items };
}

/**
 * Common academic-poster section headings. A cluster whose first line
 * matches one of these (case-insensitive, optional leading numbering
 * "1." / "1.1" / "I.") gets `role: 'heading'` regardless of its font
 * size. Catches the case where the heading is rendered at the same
 * size as body text — pure font-size histograms miss those.
 */
const HEADING_PATTERNS: RegExp[] = [
  /^\s*(?:\d+\.?\d*\.?|[IVX]+\.)?\s*(introduction|background|aims?|hypothes[ie]s|objectives?|motivation|overview)\b/i,
  /^\s*(?:\d+\.?\d*\.?|[IVX]+\.)?\s*(methods?|methodology|materials\s+and\s+methods|approach|design)\b/i,
  /^\s*(?:\d+\.?\d*\.?|[IVX]+\.)?\s*(results?|findings?|analyses?|analysis|outcome[s]?|measurements?)\b/i,
  /^\s*(?:\d+\.?\d*\.?|[IVX]+\.)?\s*(discussion|conclusions?|implications?|future\s+(?:work|directions?))\b/i,
  /^\s*(?:\d+\.?\d*\.?|[IVX]+\.)?\s*(references?|bibliography|citations?|works\s+cited)\b/i,
  /^\s*(?:\d+\.?\d*\.?|[IVX]+\.)?\s*(acknowledg[em]+ents?|funding|disclosures?|contact)\b/i,
  /^\s*(?:\d+\.?\d*\.?|[IVX]+\.)?\s*(demographics?|participants?|subjects?|sample|population)\b/i,
  /^\s*(?:\d+\.?\d*\.?|[IVX]+\.)?\s*(abstract|summary|highlights?|takeaways?)\b/i,
  /^\s*(?:\d+\.?\d*\.?|[IVX]+\.)?\s*(statistical\s+(?:analyses?|analysis|methods?))\b/i,
  /^\s*(?:\d+\.?\d*\.?|[IVX]+\.)?\s*(correlation|regression|principal\s+component)\b/i,
];

/** Returns true if the cluster's first line looks like a poster
 *  section heading. Exported for unit testing. */
export function looksLikeHeading(text: string): boolean {
  if (!text) return false;
  const firstLine = text.split(/\n/)[0]?.trim() ?? '';
  if (!firstLine) return false;
  // Heading lines are short — anything past ~80 chars is probably a
  // sentence that happens to start with a heading-like word.
  if (firstLine.length > 80) return false;
  return HEADING_PATTERNS.some((re) => re.test(firstLine));
}

/** Bullet markers commonly used on academic posters. Matches inline
 *  too: pdfjs frequently joins bullet lines with spaces, so a
 *  cluster's text reads "Heading • bullet 1 • bullet 2" with no
 *  newlines. Includes the dash variants (- – —) and arrow heads. */
const BULLET_RE = /[•●▪◦‣◾▫⦁⁃▶❖✦✓✔]/;

/**
 * Heuristic split: when a heading cluster also contains bulleted body
 * text (`6. Statistical Analyses • Assessing hypothesis#1: • …`),
 * split it into a heading-only cluster and a body cluster sitting
 * below it. Without this the heading block on the canvas reads as
 * one giant 80-word run.
 *
 * Also caps overrun heading text at ~6 words. Real section titles
 * ("introduction", "methods and results", "1. background") rarely
 * exceed that — anything longer is a sentence that picked up the
 * heading regex by accident.
 *
 * Exported for unit testing.
 */
export function splitHeadingClusters(
  clusters: RoledCluster[],
): RoledCluster[] {
  const out: RoledCluster[] = [];
  for (const c of clusters) {
    if (c.role !== 'heading') {
      out.push(c);
      continue;
    }
    const split = trySplitHeading(c);
    if (split) {
      out.push(...split);
    } else {
      out.push(c);
    }
  }
  return out;
}

function trySplitHeading(c: RoledCluster): RoledCluster[] | null {
  const text = c.text;
  // 1. Try to split at the first bullet marker.
  const bulletMatch = text.match(BULLET_RE);
  if (bulletMatch && bulletMatch.index !== undefined && bulletMatch.index >= 2) {
    const before = text.slice(0, bulletMatch.index).trim().replace(/[\s,;:.]+$/, '');
    const after = text.slice(bulletMatch.index).trim();
    if (before && after) {
      const cappedHeading = capHeadingWords(before);
      const remainder =
        cappedHeading === before
          ? after
          : `${before.slice(cappedHeading.length).trim().replace(/^[\s,;:.]+/, '')} ${after}`.trim();
      return makeHeadingBodyPair(c, cappedHeading, remainder);
    }
  }

  // 2. No bullets but the heading is way too long — split off the
  // first 6 words as the heading, push the rest to a body cluster.
  const words = text.split(/\s+/);
  if (words.length > 8) {
    const cappedHeading = capHeadingWords(text);
    const remainder = text.slice(cappedHeading.length).trim().replace(/^[\s,;:.]+/, '');
    if (cappedHeading && remainder) {
      return makeHeadingBodyPair(c, cappedHeading, remainder);
    }
  }
  return null;
}

/** Take the first ≤6 words, preserving any leading numbering
 *  ("1." / "1.1" / "I."). */
function capHeadingWords(text: string, maxWords = 6): string {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/);
  if (words.length <= maxWords) return trimmed;
  return words.slice(0, maxWords).join(' ');
}

function makeHeadingBodyPair(
  c: RoledCluster,
  headingText: string,
  bodyText: string,
): RoledCluster[] {
  // Split the bbox vertically: heading occupies the top ~30% of the
  // original cluster height, body fills the rest. Approximate but
  // good enough for the auto-layout pass to flow them correctly.
  const headingFrac = Math.max(0.15, Math.min(0.4, 1 / Math.max(1, c.text.length / Math.max(1, headingText.length))));
  const headingH = c.bbox.h * headingFrac;
  const heading: RoledCluster = {
    ...c,
    text: headingText,
    bbox: { ...c.bbox, h: headingH },
    items: [],
  };
  const body: RoledCluster = {
    ...c,
    text: bodyText,
    role: 'text',
    bbox: {
      x: c.bbox.x,
      y: c.bbox.y + headingH,
      w: c.bbox.w,
      h: c.bbox.h - headingH,
    },
    items: [],
  };
  return [heading, body];
}

/**
 * Assign a semantic role to each cluster using a font-size histogram.
 *
 * Heuristics (intentionally simple, documented in the preview modal as
 * a known limitation if they go wrong):
 *   - `title`   : the single largest cluster whose top edge is in the
 *                 upper third of the page
 *   - `authors` : the cluster immediately below the title (size tier 2
 *                 or 3, contiguous on y)
 *   - `heading` : matches the title regex OR has the second-tier
 *                 font size by histogram mode
 *   - `text`    : everything else
 *
 * `pageHeightPt` is needed to determine the upper-third title window.
 */
export function assignRoles(
  clusters: TextCluster[],
  pageHeightPt: number,
): RoledCluster[] {
  if (clusters.length === 0) return [];

  // Find the title: largest font-size cluster in the top third.
  const upperThird = pageHeightPt / 3;
  const titleCandidates = clusters
    .filter((c) => c.bbox.y < upperThird)
    .sort((a, b) => b.fontSizePt - a.fontSizePt);
  const titleCluster = titleCandidates[0];

  // Build a histogram of font sizes across non-title clusters.
  const nonTitle = clusters.filter((c) => c !== titleCluster);
  const sizes = nonTitle.map((c) => roundToHalfPt(c.fontSizePt));
  const sizeCounts = histogram(sizes);
  // Sort sizes by descending magnitude — the LARGEST non-title size is
  // the heading tier (frequency-tied is fine, we just want big text
  // that isn't the title).
  const sortedSizes = [...new Set(sizes)].sort((a, b) => b - a);
  const headingSize = sortedSizes[0] ?? 0;

  // Authors: cluster immediately below the title, with strictly smaller
  // font and within ~1.5× title height of the title bottom. Without
  // these guards a body block at the same Y as another body block can
  // land here, which is wrong on multi-column posters.
  let authorsCluster: TextCluster | undefined;
  if (titleCluster) {
    const titleBottom = titleCluster.bbox.y + titleCluster.bbox.h;
    const proximityThreshold = titleBottom + titleCluster.bbox.h * 1.5;
    const below = nonTitle
      .filter(
        (c) =>
          c.bbox.y >= titleBottom &&
          c.bbox.y <= proximityThreshold &&
          c.fontSizePt < titleCluster.fontSizePt,
      )
      .sort((a, b) => a.bbox.y - b.bbox.y);
    authorsCluster = below[0];
  }

  return clusters.map((c) => {
    let role: RoledCluster['role'];
    if (c === titleCluster) role = 'title';
    else if (c === authorsCluster) role = 'authors';
    // Title-regex match wins over font-size — catches "Methods" / "1.
    // INTRODUCTION" rendered at body size on poorly-formatted posters.
    else if (looksLikeHeading(c.text)) role = 'heading';
    else if (roundToHalfPt(c.fontSizePt) >= headingSize && headingSize > 0) {
      role = 'heading';
    } else role = 'text';
    return { ...c, role };
  });

  // Suppress unused-binding lint without changing behavior.
  void sizeCounts;
}

/**
 * Sort clusters into multi-column reading order.
 *
 * Step 1: cluster by X-position into columns using a 1-D DBSCAN-style
 *         pass on `bbox.x` with `eps = pageWidth × 0.05` (~ one column gap).
 * Step 2: within each column, sort top-to-bottom.
 * Step 3: emit columns left-to-right.
 *
 * Imperfect on weird layouts; preview modal warns the user.
 */
export function sortReadingOrder(
  clusters: RoledCluster[],
  pageWidthPt: number,
): RoledCluster[] {
  if (clusters.length === 0) return [];
  // Headers (title + authors) always come first, regardless of column.
  const headers = clusters.filter((c) => c.role === 'title' || c.role === 'authors');
  const body = clusters.filter((c) => c.role !== 'title' && c.role !== 'authors');

  if (body.length === 0) return [...headers];

  // Column assignment compares against the first item's `bbox.x` in
  // the active column rather than a rolling `lastX` — the rolling
  // version chains items into the wrong column when a wide block at
  // the column boundary nudges `lastX` past `eps`. Anchor stays put.
  const eps = pageWidthPt * 0.05;
  const sortedByX = [...body].sort((a, b) => a.bbox.x - b.bbox.x);
  const columns: RoledCluster[][] = [];
  let current: RoledCluster[] = [sortedByX[0]!];
  let columnAnchorX = sortedByX[0]!.bbox.x;
  for (let i = 1; i < sortedByX.length; i++) {
    const c = sortedByX[i]!;
    if (c.bbox.x - columnAnchorX <= eps) {
      current.push(c);
    } else {
      columns.push(current);
      current = [c];
      columnAnchorX = c.bbox.x;
    }
  }
  columns.push(current);

  // Sort within each column top-to-bottom.
  const ordered = columns.flatMap((col) =>
    [...col].sort((a, b) => a.bbox.y - b.bbox.y),
  );

  // Headers first, then column-major body.
  const sortedHeaders = [...headers].sort((a, b) => a.bbox.y - b.bbox.y);
  return [...sortedHeaders, ...ordered];
}

// ── small math helpers ──────────────────────────────────────────────

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function roundToHalfPt(pt: number): number {
  return Math.round(pt * 2) / 2;
}

function histogram(values: number[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}
