/**
 * autoLayout — one-click "tidy up" for the current set of blocks.
 *
 * Algorithm:
 *   1. Pin headers (title, authors) to the top of the poster.
 *   2. Pick a column count from the source layout (clustered x
 *      positions) but consider 2-4 candidates.
 *   3. Sort body blocks by reading order (y ascending).
 *   4. Pack into columns via *shortest-column-first*: each block
 *      goes into whichever column currently has the lowest cursor.
 *      This balances column heights — the prior algorithm preserved
 *      the source x-cluster so a heavy left column left empty space
 *      on the right after auto-arrange.
 *   5. Headings drag the next block into their column as one unit so
 *      a heading never gets separated from its leading content.
 *   6. Pick the candidate column count whose tallest column is
 *      shortest (i.e. tightest pack). This is the "consider all
 *      possible arrangements" pass.
 *   7. If the result still overflows the canvas, scale body+heading
 *      font sizes down (Pass 2) and re-pack.
 *   8. Snap all coordinates to the grid.
 *
 * The function is pure: it returns a new Block[] and never mutates
 * the input.
 */
import type { Block, Styles } from '@postr/shared';
import { M, GAP } from './constants';
import { snap } from './snap';

const COLUMN_CLUSTER_THRESHOLD = 30;

/**
 * Minimum legible column width in poster units (1 unit = 0.1 inch).
 * 8" is roughly the narrowest column where standard body text (24pt
 * minimum per academic guidelines) can hold ~6 words per line —
 * below that, line wrapping turns the column into a comma list.
 *
 * The candidate column-count generator caps `cols` at
 * `floor((canvasWidth − margin) / MIN_COL_WIDTH)` so a 36" landscape
 * poster never auto-arranges into 7 sliver columns.
 */
const MIN_COL_WIDTH = 80;
/** Cap: a poster never has more than this many columns regardless of
 *  raw width — readability collapses past 5 columns for the same
 *  reason a newspaper page tops out at 6. */
const MAX_COLS = 5;

interface Cluster {
  center: number;
  xs: number[];
}

export interface AutoLayoutResult {
  blocks: Block[];
  /** If Pass 2 scaled fonts, these are the new style values. null = no scaling needed. */
  scaledStyles: Styles | null;
}

interface PackInput {
  body: Block[];
  cols: number;
  canvasWidth: number;
  bodyTop: number;
  styles: Styles;
}

interface PackOutput {
  blocks: Block[];
  /** Bottom-most cursor across all columns — the height the body
   *  needs to render. Lower is better when picking between col counts. */
  maxBottom: number;
}

export function autoLayout(
  blocks: Block[],
  canvasWidth: number,
  canvasHeight: number,
  styles: Styles,
): AutoLayoutResult {
  const headers = blocks.filter((b) => b.type === 'title' || b.type === 'authors');
  const body = blocks.filter((b) => b.type !== 'title' && b.type !== 'authors');

  if (body.length === 0) {
    // Nothing meaningful to rearrange — return a fresh array (still
    // immutable) but preserve order.
    return { blocks: [...blocks], scaledStyles: null };
  }

  // Step 1: pin headers — but compute their TIGHT heights from the
  // active styles, not the imported block h. An imported title can
  // arrive with `h: 200` because the source PDF cluster bbox baked
  // in line-leading whitespace; trusting that h leaves a 100-unit
  // gap between title and authors that the user calls out as "for
  // no reason". Same pattern for the authors line.
  //
  // We approximate the line count from the title's text length and
  // canvas width, then size to font × lineHeight × lines. This is
  // tight on multi-line titles too because the canvas-width-based
  // estimate scales with wrapping.
  const titleBlk = headers.find((b) => b.type === 'title');
  const authorsBlk = headers.find((b) => b.type === 'authors');
  const titleH = computeHeaderH(
    titleBlk?.content ?? '',
    styles.title.size,
    styles.title.lineHeight,
    canvasWidth,
    titleBlk?.h ?? 0,
  );
  const authorsH = computeHeaderH(
    authorsBlk?.content ?? '',
    styles.authors.size,
    styles.authors.lineHeight,
    canvasWidth,
    authorsBlk?.h ?? 0,
  );
  const HEADER_GAP = 2;
  const authorsY = snap(M + titleH + HEADER_GAP);
  const pinnedHeaders = headers.map((b) => {
    if (b.type === 'title')
      return { ...b, x: M, y: M, w: canvasWidth - M * 2, h: snap(titleH) };
    return {
      ...b,
      x: M,
      y: authorsY,
      w: canvasWidth - M * 2,
      h: snap(authorsH),
    };
  });

  // Body starts below the full header stack with a standard body
  // margin `M` below the authors block.
  const headerBottom = authorsY + authorsH;

  // Step 2: derive a starting column-count guess from x-clusters.
  const uniqueXs = [...new Set(body.map((b) => b.x))].sort((a, b) => a - b);
  const clusters: Cluster[] = [];
  for (const x of uniqueXs) {
    const existing = clusters.find((c) => Math.abs(c.center - x) < COLUMN_CLUSTER_THRESHOLD);
    if (existing) {
      existing.xs.push(x);
      existing.center = existing.xs.reduce((s, v) => s + v, 0) / existing.xs.length;
    } else {
      clusters.push({ center: x, xs: [x] });
    }
  }
  const sourceColCount = Math.max(1, clusters.length);

  // Step 3: try multiple candidate column counts and pick whichever
  // produces the tightest pack subject to a minimum column width.
  //
  // The candidate set is bounded:
  //   - upper:  floor((canvasWidth - 2M) / MIN_COL_WIDTH) — column
  //             never narrower than ~8 inches.
  //   - upper:  MAX_COLS — even a 100" wall poster doesn't deserve
  //             more than 5 columns of text.
  //   - lower:  1 (no body) up to 4 — covers portrait through
  //             landscape posters.
  const bodyTop = headerBottom + M;
  const widthBudget = canvasWidth - M * 2;
  const maxColsByWidth = Math.max(1, Math.floor(widthBudget / MIN_COL_WIDTH));
  const upperBound = Math.min(MAX_COLS, maxColsByWidth);

  const candidateSet = new Set<number>();
  for (let n = 1; n <= upperBound; n++) candidateSet.add(n);
  // Bias toward the source-derived count when it falls inside the
  // valid range — same shape as the input layout when it works.
  if (sourceColCount >= 1 && sourceColCount <= upperBound) {
    candidateSet.add(sourceColCount);
  }
  const candidates = [...candidateSet].sort((a, b) => a - b);
  // Score each candidate by `maxBottom`, then break ties (within 10%)
  // toward the source column count — auto-arrange should TIDY the
  // user's layout, not redesign it. Without this bias the height
  // minimizer pushes every poster to its widest legal grid.
  interface Scored {
    cols: number;
    out: PackOutput;
  }
  const scored: Scored[] = [];
  for (const cols of candidates) {
    if (cols < 1) continue;
    const out = packShortestColumnFirst({
      body,
      cols,
      canvasWidth,
      bodyTop,
      styles,
    });
    scored.push({ cols, out });
  }
  if (scored.length === 0) {
    return { blocks: [...pinnedHeaders], scaledStyles: null };
  }
  const minHeight = Math.min(...scored.map((s) => s.out.maxBottom));
  const acceptableHeight = minHeight * 1.1;
  const tied = scored.filter((s) => s.out.maxBottom <= acceptableHeight);
  // Prefer source-matching first, else fewer columns (denser body
  // text reads better than thin slivers).
  const best =
    tied.find((s) => s.cols === sourceColCount) ??
    tied.sort((a, b) => a.cols - b.cols)[0]!;
  const repositionedBody = best.out.blocks;
  const pass1Result = [...pinnedHeaders, ...repositionedBody];

  // Pass 2: check if any column overflows. If so, scale body/heading
  // font sizes uniformly so everything fits within canvasHeight.
  const bodyBottom = best.out.maxBottom;
  const availableHeight = canvasHeight - M;

  if (bodyBottom <= availableHeight) {
    return { blocks: pass1Result, scaledStyles: null };
  }

  // Compute scale factor to fit. Floor body font at 3 units (~22pt).
  const MIN_BODY_SIZE = 3;
  const overflowRatio = availableHeight / bodyBottom;
  const scaleFactor = Math.max(
    overflowRatio,
    MIN_BODY_SIZE / styles.body.size,
  );

  if (scaleFactor >= 1) {
    return { blocks: pass1Result, scaledStyles: null };
  }

  // Scale body + heading font sizes, preserve title + authors.
  const scaledStyles: Styles = {
    ...styles,
    body: { ...styles.body, size: Math.max(MIN_BODY_SIZE, Math.round(styles.body.size * scaleFactor * 10) / 10) },
    heading: { ...styles.heading, size: Math.max(MIN_BODY_SIZE, Math.round(styles.heading.size * scaleFactor * 10) / 10) },
  };

  // Re-run packing with the scaled styles + slightly shrunk
  // non-heading heights. We keep the same candidate-column sweep.
  const scaledBody = body.map((b) =>
    b.type === 'heading' ? b : { ...b, h: snap(Math.max(20, b.h * scaleFactor)) },
  );
  let bestScaled: PackOutput | null = null;
  for (const cols of candidates) {
    if (cols < 1) continue;
    const out = packShortestColumnFirst({
      body: scaledBody,
      cols,
      canvasWidth,
      bodyTop,
      styles: scaledStyles,
    });
    if (!bestScaled || out.maxBottom < bestScaled.maxBottom) bestScaled = out;
  }

  return {
    blocks: [...pinnedHeaders, ...bestScaled!.blocks],
    scaledStyles,
  };
}

/**
 * Compute a tight header height in poster units from the text + style.
 *
 * Estimates wrapped line count from the text length and the available
 * width using ~0.45 × font_size as the average glyph width (works
 * well for typical academic-poster fonts). A 60-character title in
 * a 460-unit-wide canvas at 22-unit font gives ceil(60×9.9 / 460) =
 * 2 lines, which renders correctly whether the title fits on one
 * line or wraps to two.
 *
 * `fallback` is the imported block's h — used as a floor only when
 * the text-based estimate is implausibly small (zero text content,
 * etc).
 */
function computeHeaderH(
  text: string,
  fontUnits: number,
  lineHeight: number,
  canvasWidth: number,
  fallback: number,
): number {
  if (!text || fontUnits <= 0) {
    return Math.max(fallback, fontUnits * lineHeight);
  }
  const innerWidth = Math.max(1, canvasWidth - M * 2);
  const avgCharWidth = fontUnits * 0.45;
  const charsPerLine = Math.max(1, Math.floor(innerWidth / avgCharWidth));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const computed = fontUnits * lineHeight * lines;
  // Add a small floor (~0.2 lineH) for descender clearance, but
  // don't trust an inflated `fallback` over the computed value —
  // that's the bug we're fixing.
  return Math.max(fontUnits * lineHeight, computed);
}

/**
 * Pack body blocks into `cols` columns, placing each block in the
 * column whose cursor sits highest (i.e. lowest current bottom edge)
 * at the time. Reading order is approximated by sorting by `y` first
 * — within that order, balancing wins over strict left-to-right.
 *
 * A heading "sticks" to the next block: when the previous block was
 * a heading, force the next non-heading block into the same column
 * so a section-title never gets separated from its leading content.
 */
function packShortestColumnFirst(input: PackInput): PackOutput {
  const { body, cols, canvasWidth, bodyTop, styles } = input;
  const colWidth = (canvasWidth - M * 2 - GAP * (cols - 1)) / cols;
  const cursors = new Array<number>(cols).fill(bodyTop);
  const sorted = [...body].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: Block[] = [];

  let stickColumn: number | null = null; // forces the next block into this col
  for (const b of sorted) {
    const isHeading = b.type === 'heading';
    const height = isHeading
      ? Math.round(styles.heading.size * 1.6 + 8)
      : b.h;

    let bestCol: number;
    if (stickColumn !== null) {
      bestCol = stickColumn;
      stickColumn = null;
    } else {
      bestCol = 0;
      for (let i = 1; i < cols; i++) {
        if (cursors[i]! < cursors[bestCol]!) bestCol = i;
      }
    }

    out.push({
      ...b,
      x: snap(M + bestCol * (colWidth + GAP)),
      y: snap(cursors[bestCol]!),
      w: snap(colWidth),
      ...(isHeading ? {} : { h: snap(height) }),
    });
    cursors[bestCol] = cursors[bestCol]! + height + GAP;

    if (isHeading) stickColumn = bestCol;
  }

  return { blocks: out, maxBottom: Math.max(...cursors) };
}
