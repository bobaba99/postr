/**
 * BBox sanitization for the vision OCR path.
 *
 * Vision LLMs are not deterministic about coordinate spaces, bbox
 * geometry, or duplicate detections. These helpers wrap the raw
 * `figureBBoxes` / block bboxes returned by `/api/import/extract`
 * so the downstream cropping + rendering pipeline only sees clean,
 * in-page, non-overlapping rectangles.
 *
 * Key behaviors:
 *   - `inferPtScale` — checks whether bbox numbers look like pt
 *     coords (matched to pageWidthPt / pageHeightPt) or pixel
 *     coords of the image the LLM saw. Returns a scale factor we
 *     can multiply by to land everything in pt.
 *   - `clampBBoxToPage` — clamps any out-of-bounds box and rejects
 *     ones that collapse to zero size or land entirely off-page.
 *   - `dedupeOverlappingBBoxes` — merges bboxes whose IoU exceeds
 *     0.55, taking the union as the canonical bbox. Vision models
 *     sometimes emit the same figure twice (e.g., once for the
 *     subplot grid and again for the surrounding panel border).
 *   - `dropDecorativeBBoxes` — drops bboxes that are too small to
 *     be meaningful (< 0.3% of page area) or have an extreme
 *     aspect ratio (> 25:1) that screams "underline / horizontal
 *     rule".
 *
 * `sanitizeFigureBBoxes` chains the four into one call. Defaults
 * were calibrated against the four Class-A/B/C test posters;
 * tightening them dropped real figures on VocUM_poster.pdf.
 */

export interface BBoxLike {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function isFiniteBBox(b: unknown): b is BBoxLike {
  if (!b || typeof b !== 'object') return false;
  const o = b as Record<string, unknown>;
  return (
    typeof o.x === 'number' &&
    Number.isFinite(o.x) &&
    typeof o.y === 'number' &&
    Number.isFinite(o.y) &&
    typeof o.w === 'number' &&
    Number.isFinite(o.w) &&
    typeof o.h === 'number' &&
    Number.isFinite(o.h)
  );
}

/**
 * Decide whether the LLM returned coordinates in the page-pt frame
 * or in pixel space of the image it saw. Returns the multiplier to
 * apply to every bbox to land in pt coords (1 = already in pt).
 *
 * Heuristic: look at the maximum coordinate observed across all
 * input boxes. If it's >= 1.4× the page's matching dimension, the
 * LLM was almost certainly thinking in image pixels and we scale
 * back. We compute scale per-axis and take the smaller (more
 * conservative) so a single huge stray bbox doesn't over-shrink
 * the rest.
 */
export function inferPtScale(
  boxes: BBoxLike[],
  pageWidthPt: number,
  pageHeightPt: number,
): number {
  if (boxes.length === 0) return 1;
  let maxX = 0;
  let maxY = 0;
  for (const b of boxes) {
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  const xRatio = maxX / pageWidthPt;
  const yRatio = maxY / pageHeightPt;
  if (xRatio < 1.4 && yRatio < 1.4) return 1;
  const scaleX = xRatio > 1.4 ? 1 / xRatio : 1;
  const scaleY = yRatio > 1.4 ? 1 / yRatio : 1;
  return Math.min(scaleX, scaleY);
}

export function scaleBBox(b: BBoxLike, scale: number): BBoxLike {
  if (scale === 1) return b;
  return { x: b.x * scale, y: b.y * scale, w: b.w * scale, h: b.h * scale };
}

/** Clamp a bbox to the page rectangle. Returns null if the result
 *  is zero-area or fully off-page. Also normalises negative widths
 *  / heights — some LLMs emit (x2 < x1). */
export function clampBBoxToPage(
  b: BBoxLike,
  pageWidthPt: number,
  pageHeightPt: number,
): BBoxLike | null {
  let x = b.x;
  let y = b.y;
  let w = b.w;
  let h = b.h;
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(pageWidthPt, x + w);
  const bottom = Math.min(pageHeightPt, y + h);
  const cw = right - left;
  const ch = bottom - top;
  if (cw <= 1 || ch <= 1) return null;
  return { x: left, y: top, w: cw, h: ch };
}

/** Reject obviously-decorative or hallucinated boxes:
 *   - area < 0.3% of page
 *   - aspect ratio > 25:1 (likely a horizontal/vertical rule). */
export function dropDecorativeBBoxes(
  boxes: BBoxLike[],
  pageWidthPt: number,
  pageHeightPt: number,
): BBoxLike[] {
  const pageArea = pageWidthPt * pageHeightPt;
  const MIN_AREA_FRACTION = 0.003;
  const MAX_ASPECT = 25;
  return boxes.filter((b) => {
    const area = b.w * b.h;
    if (area / pageArea < MIN_AREA_FRACTION) return false;
    const aspect = Math.max(b.w / b.h, b.h / b.w);
    if (aspect > MAX_ASPECT) return false;
    return true;
  });
}

export function bboxIoU(a: BBoxLike, b: BBoxLike): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  if (inter <= 0) return 0;
  const union = a.w * a.h + b.w * b.h - inter;
  return union <= 0 ? 0 : inter / union;
}

/** Merge overlapping bboxes (IoU > threshold) into their union. */
export function dedupeOverlappingBBoxes(
  boxes: BBoxLike[],
  iouThreshold = 0.55,
): BBoxLike[] {
  const sorted = boxes.slice().sort((a, b) => b.w * b.h - a.w * a.h);
  const out: BBoxLike[] = [];
  for (const b of sorted) {
    let absorbed = false;
    for (let i = 0; i < out.length; i++) {
      if (bboxIoU(out[i]!, b) > iouThreshold) {
        const u = out[i]!;
        const left = Math.min(u.x, b.x);
        const top = Math.min(u.y, b.y);
        const right = Math.max(u.x + u.w, b.x + b.w);
        const bottom = Math.max(u.y + u.h, b.y + b.h);
        out[i] = { x: left, y: top, w: right - left, h: bottom - top };
        absorbed = true;
        break;
      }
    }
    if (!absorbed) out.push(b);
  }
  return out;
}

/** End-to-end pipeline: drop bad geometry → fix coord space →
 *  clamp to page → drop decorations → merge duplicates. */
export function sanitizeFigureBBoxes(
  raw: unknown[],
  pageWidthPt: number,
  pageHeightPt: number,
  ptScale: number,
): BBoxLike[] {
  const finite = raw.filter(isFiniteBBox);
  const scaled = finite.map((b) => scaleBBox(b, ptScale));
  const clamped: BBoxLike[] = [];
  for (const b of scaled) {
    const c = clampBBoxToPage(b, pageWidthPt, pageHeightPt);
    if (c) clamped.push(c);
  }
  const filtered = dropDecorativeBBoxes(clamped, pageWidthPt, pageHeightPt);
  return dedupeOverlappingBBoxes(filtered);
}

/** Counts unique "Figure N." / "Table N." mentions across the LLM's
 *  text blocks. Used to flag the "captions present but no figures
 *  cropped" failure mode. */
export function countCaptionMentions(
  blocks: Array<{ text?: string }> | undefined,
): number {
  if (!Array.isArray(blocks)) return 0;
  const re = /(?:^|[^a-z])(figure|table|fig\.?|tbl\.?)\s*\d+/gi;
  const seen = new Set<string>();
  for (const b of blocks) {
    if (typeof b?.text !== 'string') continue;
    for (const m of b.text.matchAll(re)) {
      seen.add(m[0].toLowerCase().replace(/\s+/g, ' ').trim());
    }
  }
  return seen.size;
}
