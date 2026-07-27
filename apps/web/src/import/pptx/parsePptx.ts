/**
 * .pptx → `PosterDoc` — the pure parsing half of the importer.
 *
 * Pure `bytes → doc + media`: no storage, no React, no network, so it
 * unit-tests directly against the bytes the PPTX *exporter* produces.
 * Uploading media and minting the poster row is `pptxImport.ts`'s job.
 *
 * The exporter (`export/pptx/writer.ts`) is the specification in
 * reverse — every conversion here is the inverse of one there, sharing
 * `EMU_PER_UNIT` through `export/units.ts` rather than re-deriving it.
 */
import type { PosterDoc } from '@postr/shared';
import { emuToInches } from '@/export/units';
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_HEADING_STYLE,
  DEFAULT_PALETTE,
  DEFAULT_STYLES,
} from '@/poster/constants';
import {
  NS_A,
  NS_P,
  PptxImportError,
  type ZipEntries,
  allEls,
  bytesToText,
  firstEl,
  intAttr,
  parsePart,
  parseXml,
  readPptxEntries,
  resolveRelationships,
} from './ooxml';
import { parseShapeTree } from './shapes';
import { shapesToBlocks } from './toBlocks';

/** Image bytes pulled out of `ppt/media/*`, keyed by block id. */
export interface PptxMedia {
  blockId: string;
  bytes: Uint8Array;
  /** Lowercase extension, sanitized to alphanumerics. */
  ext: string;
}

export interface ParsePptxResult {
  doc: PosterDoc;
  title: string;
  warnings: string[];
  media: PptxMedia[];
}

/**
 * The exporter writes this note into `docProps/core.xml` (`dc:subject`)
 * whenever it halves a poster that exceeded PowerPoint's 56-inch
 * ceiling. Finding it is how we know to double the geometry back to
 * the poster's ORIGINAL size instead of importing a half-size poster.
 *
 * Matched on the stable, quoted dimensions rather than the full
 * sentence so wording tweaks in the exporter's copy don't break the
 * round trip.
 */
const HALF_SIZE_PATTERN = /exactly half size \(([\d.]+)×([\d.]+) in\)/;

/** Slide size lives in `<p:sldSz>`, in EMU. */
function readSlideSize(presentation: Document): { widthIn: number; heightIn: number } {
  const sldSz = firstEl(presentation, NS_P, 'sldSz');
  if (!sldSz) {
    throw new PptxImportError('Presentation is missing its slide size.');
  }
  const widthIn = emuToInches(intAttr(sldSz, 'cx'));
  const heightIn = emuToInches(intAttr(sldSz, 'cy'));
  if (!(widthIn > 0) || !(heightIn > 0)) {
    throw new PptxImportError('Presentation has an invalid slide size.');
  }
  return { widthIn, heightIn };
}

/**
 * Slide parts in presentation order.
 *
 * `ppt/presentation.xml.rels` maps each `<p:sldId r:id>` to its part,
 * which is authoritative — zip entry order and `slideN.xml` numbering
 * both lie when slides have been reordered or deleted in PowerPoint.
 */
function listSlidePaths(entries: ZipEntries, presentation: Document): string[] {
  const rels = resolveRelationships(entries, 'ppt/presentation.xml');
  const ordered: string[] = [];
  for (const sldId of allEls(presentation, NS_P, 'sldId')) {
    const rid = sldId.getAttributeNS(
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'id',
    );
    const target = rid ? rels.get(rid) : null;
    if (target && entries[target]) ordered.push(target);
  }
  if (ordered.length > 0) return ordered;

  // Fallback for decks with an unusual rels layout: numeric order over
  // whatever slide parts exist.
  return Object.keys(entries)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
}

const slideNumber = (path: string): number =>
  Number.parseInt(path.replace(/\D+/g, ''), 10) || 0;

/** Detect the exporter's half-scale marker in the core properties. */
function readHalfScale(entries: ZipEntries): { scale: number; note: string | null } {
  const core = entries['docProps/core.xml'];
  if (!core) return { scale: 1, note: null };
  let subject = '';
  try {
    const doc = parseXml(bytesToText(core));
    subject =
      doc.getElementsByTagName('dc:subject')[0]?.textContent ??
      doc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'subject')[0]
        ?.textContent ??
      '';
  } catch {
    // Damaged core properties are not fatal — import at 1:1.
    return { scale: 1, note: null };
  }
  if (!HALF_SIZE_PATTERN.test(subject)) return { scale: 1, note: null };
  return {
    scale: 2,
    note:
      'This PowerPoint file was exported at half size to fit PowerPoint’s ' +
      '56-inch limit. It has been restored to its original dimensions.',
  };
}

const sanitizeExt = (raw: string): string => {
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  return !cleaned || cleaned.length > 6 ? 'png' : cleaned;
};

/**
 * Parse .pptx bytes into a `PosterDoc` plus the media that still needs
 * uploading. Throws `PptxImportError` for unreadable input.
 */
export function parsePptx(bytes: Uint8Array): ParsePptxResult {
  const entries = readPptxEntries(bytes);

  const presentation = parsePart(entries, 'ppt/presentation.xml');
  if (!presentation) {
    throw new PptxImportError('Presentation part is missing.');
  }

  const { widthIn, heightIn } = readSlideSize(presentation);
  const { scale, note } = readHalfScale(entries);
  const slidePaths = listSlidePaths(entries, presentation);
  if (slidePaths.length === 0) {
    throw new PptxImportError('Presentation contains no slides.');
  }

  const warnings: string[] = [];
  if (note) warnings.push(note);
  if (slidePaths.length > 1) {
    // A poster is ONE canvas. Say plainly what was dropped rather than
    // letting slides 2..n vanish without a word.
    const skipped = slidePaths.length - 1;
    warnings.push(
      `This file has ${slidePaths.length} slides. Only the first was imported — ` +
        `${skipped} ${skipped === 1 ? 'slide was' : 'slides were'} skipped, ` +
        'because a poster is a single canvas.',
    );
  }

  const slidePath = slidePaths[0]!;
  const slide = parsePart(entries, slidePath);
  if (!slide) throw new PptxImportError('First slide could not be read.');
  const spTree = firstEl(slide, NS_P, 'spTree');
  if (!spTree) throw new PptxImportError('Slide has no shape tree.');

  const shapes = parseShapeTree(spTree);
  const mapped = shapesToBlocks(shapes, scale);
  warnings.push(...mapped.warnings);

  // Resolve each picture's r:embed to bytes in ppt/media/*.
  const rels = resolveRelationships(entries, slidePath);
  const media: PptxMedia[] = [];
  for (const [blockId, embedId] of mapped.pictureEmbeds) {
    const target = rels.get(embedId);
    const bytesForImage = target ? entries[target] : undefined;
    if (!target || !bytesForImage) {
      warnings.push(
        'An image on the slide could not be read and was left as an empty frame.',
      );
      continue;
    }
    media.push({
      blockId,
      bytes: bytesForImage,
      ext: sanitizeExt(target.split('.').pop() ?? 'png'),
    });
  }

  if (mapped.blocks.length === 0) {
    warnings.push(
      'No text, images, or tables were found on the first slide — the imported poster is empty.',
    );
  }

  const doc: PosterDoc = {
    version: 1,
    // Undo the exporter's halving so the poster returns at full size.
    widthIn: round2(widthIn * scale),
    heightIn: round2(heightIn * scale),
    blocks: mapped.blocks,
    fontFamily: readFontFamily(slide) ?? DEFAULT_FONT_FAMILY,
    palette: DEFAULT_PALETTE,
    styles: DEFAULT_STYLES,
    headingStyle: DEFAULT_HEADING_STYLE,
    institutions: [],
    authors: [],
    references: [],
  };

  return { doc, title: mapped.title || 'Imported poster', warnings, media };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Most-used `<a:latin typeface>` on the slide, when it is one of the
 *  curated families; otherwise null so the default applies. */
function readFontFamily(slide: Document): string | null {
  const counts = new Map<string, number>();
  for (const latin of allEls(slide, NS_A, 'latin')) {
    const face = latin.getAttribute('typeface');
    if (face) counts.set(face, (counts.get(face) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [face, count] of counts) {
    if (count > bestCount) {
      best = face;
      bestCount = count;
    }
  }
  return best;
}
