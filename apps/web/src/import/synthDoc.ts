/**
 * Doc synthesizer — turns a PDF/image extraction into a real PosterDoc.
 *
 * Inputs: role-assigned text clusters + extracted figure blocks + page
 * dimensions in points. Output: a fully-populated `PosterDoc` ready to
 * pass to `usePosterStore.setPoster()`.
 *
 * Coordinate conversion: pdfjs reports in PDF user-space points (72 pt
 * per inch); we convert to poster units (10 units per inch) via
 * `ptToUnits`. Sizes get rounded; positions get snapped to the 5-unit
 * snap grid the editor uses.
 */
import { nanoid } from 'nanoid';
import type {
  Block,
  HeadingStyle,
  ImportResult,
  Palette,
  PartialBlock,
  PosterDoc,
  Styles,
} from '@postr/shared';
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_HEADING_STYLE,
  DEFAULT_PALETTE,
  DEFAULT_STYLES,
  POSTER_SIZES,
  SNAP_GRID,
  inToUnits,
  ptToIn,
  ptToUnits,
} from '../poster/constants';
import type { RoledCluster } from './clusterText';
import { parseAuthorsText } from './parseAuthors';

export interface SynthDefaults {
  fontFamily?: string;
  palette?: Palette;
  styles?: Styles;
  headingStyle?: HeadingStyle;
}

export interface SynthInput {
  pageWidthPt: number;
  pageHeightPt: number;
  clusters: RoledCluster[];
  /** Figure blocks already produced by the PDF/image extractor — they
   *  arrive in poster-unit coordinates because the upload step needs
   *  the assigned `id` and the converted bbox before synthesis runs. */
  figureBlocks: PartialBlock[];
  warnings?: string[];
  sourceFonts?: string[];
}

export interface SynthOutput {
  doc: PosterDoc;
  title: string;
  /** Surface warnings collected from clustering and synthesis (column
   *  ordering, multi-page rejection, etc.) up to the preview modal. */
  warnings: string[];
}

/**
 * Convert raw extraction output → a valid `PosterDoc`. Pure function:
 * no I/O, no React, safe to unit-test.
 *
 * The figure blocks come pre-uploaded with `imageSrc = "storage://..."`
 * because the PDF extractor needs to produce the upload before we know
 * the final blockId. Pass them through verbatim — this function only
 * snaps their coordinates and asserts they have ids.
 */
export function synthesizeDoc(
  input: SynthInput,
  defaults: SynthDefaults = {},
): SynthOutput {
  const { pageWidthPt, pageHeightPt, clusters, figureBlocks } = input;
  const widthIn = ptToIn(pageWidthPt);
  const heightIn = ptToIn(pageHeightPt);
  const { widthIn: posterWidthIn, heightIn: posterHeightIn } =
    pickPosterSize(widthIn, heightIn);

  const scaleX = posterWidthIn / widthIn;
  const scaleY = posterHeightIn / heightIn;

  const blocks: Block[] = [];
  let titleText = '';
  let parsedAuthors: ReturnType<typeof parseAuthorsText> = {
    authors: [],
    institutions: [],
  };

  for (const c of clusters) {
    if (c.role === 'authors') {
      // Parse the authors-cluster text into structured data so the
      // sidebar AUTHORS tab populates immediately. The block itself
      // becomes a positioning anchor — `AuthorLine` renders from the
      // structured arrays, not from `block.content`.
      parsedAuthors = parseAuthorsText(c.text);
    }
    const block = clusterToBlock(c, scaleX, scaleY);
    if (!block) continue;
    if (c.role === 'title' && !titleText) titleText = c.text;
    blocks.push(block);
  }

  // Figure blocks: snap and append. They already have ids assigned by
  // the extractor (so the upload path could use them).
  for (const fb of figureBlocks) {
    blocks.push(snapFigureBlock(fb, scaleX, scaleY));
  }

  const doc: PosterDoc = {
    version: 1,
    widthIn: posterWidthIn,
    heightIn: posterHeightIn,
    blocks,
    fontFamily: defaults.fontFamily ?? DEFAULT_FONT_FAMILY,
    palette: defaults.palette ?? DEFAULT_PALETTE,
    styles: defaults.styles ?? DEFAULT_STYLES,
    headingStyle: defaults.headingStyle ?? DEFAULT_HEADING_STYLE,
    institutions: parsedAuthors.institutions,
    authors: parsedAuthors.authors,
    references: [],
  };

  return {
    doc,
    title: titleText || 'Imported poster',
    warnings: [...(input.warnings ?? [])],
  };
}

/**
 * Convenience overload: take an `ImportResult` (already in poster
 * units) plus the role-assigned clusters and synth a doc. Used by
 * `extractFromImage` (Tier 1) where the LLM does its own clustering.
 */
export function synthesizeDocFromResult(
  result: ImportResult,
  defaults: SynthDefaults = {},
): SynthOutput {
  const widthIn = result.pageWidthIn;
  const heightIn = result.pageHeightIn;
  const { widthIn: posterWidthIn, heightIn: posterHeightIn } =
    pickPosterSize(widthIn, heightIn);
  const scaleX = posterWidthIn / widthIn;
  const scaleY = posterHeightIn / heightIn;

  const blocks: Block[] = result.blocks.map((pb) =>
    snapFigureBlock(pb, scaleX, scaleY),
  );

  let title = '';
  for (const b of blocks) {
    if (b.type === 'title' && b.content) {
      title = b.content;
      break;
    }
  }

  const doc: PosterDoc = {
    version: 1,
    widthIn: posterWidthIn,
    heightIn: posterHeightIn,
    blocks,
    fontFamily: defaults.fontFamily ?? DEFAULT_FONT_FAMILY,
    palette: defaults.palette ?? result.detectedPalette ?? DEFAULT_PALETTE,
    styles: defaults.styles ?? DEFAULT_STYLES,
    headingStyle: defaults.headingStyle ?? DEFAULT_HEADING_STYLE,
    institutions: [],
    authors: [],
    references: [],
  };

  return {
    doc,
    title: title || 'Imported poster',
    warnings: [...result.warnings],
  };
}

/**
 * Pick the closest supported poster size for the source dimensions.
 * Snapping to a curated size keeps the rendered poster within the
 * editor's print-readability calibration.
 */
export function pickPosterSize(
  sourceWidthIn: number,
  sourceHeightIn: number,
): { widthIn: number; heightIn: number; key: string } {
  let bestKey = '48×36';
  let bestDist = Infinity;
  const sourceArea = sourceWidthIn * sourceHeightIn;
  for (const [key, size] of Object.entries(POSTER_SIZES)) {
    const sameOrientation =
      Math.sign(size.w - size.h) === Math.sign(sourceWidthIn - sourceHeightIn) ||
      Math.abs(sourceWidthIn - sourceHeightIn) < 0.5;
    // Distance metric: aspect-ratio match weighted heavier than area.
    const aspectSrc = sourceWidthIn / sourceHeightIn;
    const aspectTgt = size.w / size.h;
    const aspectDelta = Math.abs(aspectSrc - aspectTgt);
    const areaDelta = Math.abs(size.w * size.h - sourceArea) / sourceArea;
    const dist = aspectDelta * 4 + areaDelta * (sameOrientation ? 1 : 5);
    if (dist < bestDist) {
      bestDist = dist;
      bestKey = key;
    }
  }
  const size = POSTER_SIZES[bestKey]!;
  return { widthIn: size.w, heightIn: size.h, key: bestKey };
}

function clusterToBlock(
  c: RoledCluster,
  scaleX: number,
  scaleY: number,
): Block | null {
  const text = c.text.trim();
  if (!text) return null;

  const x = snap(ptToUnits(c.bbox.x) * scaleX);
  const y = snap(ptToUnits(c.bbox.y) * scaleY);
  const w = snap(ptToUnits(c.bbox.w) * scaleX);
  const h = snap(ptToUnits(c.bbox.h) * scaleY);

  return {
    id: nanoid(8),
    type: c.role,
    x: clampNonNeg(x),
    y: clampNonNeg(y),
    w: Math.max(SNAP_GRID, w),
    h: Math.max(SNAP_GRID, h),
    content: text,
    imageSrc: null,
    imageFit: 'contain',
    tableData: null,
  };
}

function snapFigureBlock(
  pb: PartialBlock,
  scaleX: number,
  scaleY: number,
): Block {
  return {
    ...pb,
    id: nanoid(8),
    x: clampNonNeg(snap(pb.x * scaleX)),
    y: clampNonNeg(snap(pb.y * scaleY)),
    w: Math.max(SNAP_GRID, snap(pb.w * scaleX)),
    h: Math.max(SNAP_GRID, snap(pb.h * scaleY)),
  };
}

function snap(units: number): number {
  return Math.round(units / SNAP_GRID) * SNAP_GRID;
}

function clampNonNeg(n: number): number {
  return Math.max(0, n);
}

// Re-export utility for callers that need to convert dims separately.
export { inToUnits as inchesToUnits };
