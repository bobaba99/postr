/**
 * autoLayout — one-click "tidy up" for the current set of blocks.
 *
 * Algorithm (from prototype.js):
 *   1. Separate header blocks (title, authors) from body blocks.
 *   2. Pin headers to the top of the poster.
 *   3. Cluster body blocks by x-position with a threshold of 30 units.
 *   4. Assign each body block to its nearest cluster.
 *   5. Within each column, sort by y and re-stack with uniform gaps.
 *   6. Headings get auto-computed heights based on font size; other
 *      block types preserve their original height.
 *   7. Snap all coordinates to the grid.
 *
 * The function is pure: it returns a new Block[] and never mutates
 * the input.
 */
import type { Block, Styles } from '@postr/shared';
import { M, GAP } from './constants';
import { snap } from './snap';

const COLUMN_CLUSTER_THRESHOLD = 30;

interface Cluster {
  center: number;
  xs: number[];
}

export function autoLayout(
  blocks: Block[],
  canvasWidth: number,
  _canvasHeight: number,
  styles: Styles,
): Block[] {
  const headers = blocks.filter((b) => b.type === 'title' || b.type === 'authors');
  const body = blocks.filter((b) => b.type !== 'title' && b.type !== 'authors');

  if (body.length === 0) {
    // Nothing meaningful to rearrange — return a fresh array (still
    // immutable) but preserve order.
    return [...blocks];
  }

  // Step 1: pin headers using the title's measured content height
  // (the caller's probe may have grown it to accommodate a multi-line
  // title). Authors sits directly under the title — not at a hardcoded
  // y — so long titles no longer collide with the authors line.
  //
  // HEADER_GAP is intentionally tight (2 units ≈ 0.2") so the
  // title/authors pair visually reads as one unit, matching the
  // compact spacing of other stacked components. With the old
  // hardcoded `snap(57)` + default `title.h = 45`, the implied gap
  // was also 2 — we preserve that default while letting the gap
  // scale correctly for longer titles.
  const titleBlk = headers.find((b) => b.type === 'title');
  const titleH = titleBlk ? titleBlk.h : 45;
  const HEADER_GAP = 2;
  const authorsY = snap(M + titleH + HEADER_GAP);
  const pinnedHeaders = headers.map((b) => {
    if (b.type === 'title') return { ...b, x: M, y: M, w: canvasWidth - M * 2 };
    return { ...b, x: M, y: authorsY, w: canvasWidth - M * 2 };
  });

  // Body starts below the full header stack (title + gap + authors)
  // with a standard body margin `M` below the authors block. This
  // replaces the old hardcoded `HEADER_BOTTOM = 81` so long titles
  // push the body down in lockstep with the header grow.
  const authorsBlk = headers.find((b) => b.type === 'authors');
  const authorsH = authorsBlk ? authorsBlk.h : 20;
  const headerBottom = authorsY + authorsH;

  // Step 2: cluster body block x positions
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

  const colCount = Math.max(1, clusters.length);
  const colWidth = (canvasWidth - M * 2 - GAP * (colCount - 1)) / colCount;

  // Step 3: assign each body block to its nearest cluster
  const buckets: Block[][] = Array.from({ length: colCount }, () => []);
  for (const b of body) {
    let bestIdx = 0;
    let bestDist = Infinity;
    clusters.forEach((cluster, i) => {
      const d = Math.abs(b.x - cluster.center);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    buckets[bestIdx]!.push(b);
  }

  // Step 4: within each column, sort by y and restack
  const bodyTop = headerBottom + M;
  const repositionedBody: Block[] = [];
  buckets.forEach((column, columnIndex) => {
    const sorted = [...column].sort((a, b) => a.y - b.y);
    let cursorY = bodyTop;
    for (const b of sorted) {
      const isHeading = b.type === 'heading';
      const height = isHeading ? Math.round(styles.heading.size * 1.6 + 8) : b.h;
      const newBlock: Block = {
        ...b,
        x: snap(M + columnIndex * (colWidth + GAP)),
        y: snap(cursorY),
        w: snap(colWidth),
        ...(isHeading ? {} : { h: snap(height) }),
      };
      repositionedBody.push(newBlock);
      cursorY += height + GAP;
    }
  });

  return [...pinnedHeaders, ...repositionedBody];
}
