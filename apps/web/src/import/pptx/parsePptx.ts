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
import { APPENDED_SLIDE_COUNT, TEMPLATE_SLIDE_PREFIX } from '@/export/pptx/templateMarker';
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_HEADING_STYLE,
  DEFAULT_PALETTE,
  DEFAULT_STYLES,
  FONT_NAMES,
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
import { UNREADABLE_IMAGE_WARNING, shapesToBlocks } from './toBlocks';

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

/**
 * How many slides after the first are Postr's own appended templates.
 *
 * Every Postr export is a multi-slide deck: the poster, an explainer,
 * and one empty slide per named layout (see
 * `export/pptx/templateSlides.ts`). Re-importing a file Postr itself
 * produced must NOT tell the user that six slides of their content
 * were skipped — they never authored those slides.
 *
 * The exporter names each appended slide `<p:cSld name="Postr
 * template - …">`, so identity travels with the slide rather than
 * with its POSITION. That matters: the moment a user pastes their own
 * slide at the end of a Postr deck, a trailing-run rule would stop
 * recognising all six templates and over-report the skip count. Here
 * the pasted slide is the only one counted, which is the honest
 * answer.
 *
 * A genuine deck from PowerPoint carries `Slide 1`…`Slide 7` (or no
 * name at all), so it warns exactly as it did before. A user who
 * renames one of our templates has adopted it as their own, and it
 * counts again — also correct.
 */
function countTemplateSlides(entries: ZipEntries, slidePaths: string[]): number {
  return slidePaths.filter((path) => isTemplateSlide(entries, path)).length;
}

/**
 * Which slide is the poster.
 *
 * Normally the first, but a user can reorder slides in the sorter or
 * delete the poster outright — and then slide 1 is one of OUR empty
 * templates. Importing that would hand the user a blank canvas titled
 * "3-Column Classic" and quietly drop the poster sitting two slides
 * down. So the poster is the first slide that is not one of ours.
 *
 * Returns -1 when EVERY slide is one of ours — the user deleted the
 * poster and kept only the blank templates. There is no poster to
 * import then, and falling back to the first slide would hand them
 * Postr's own explainer copy as if it were their content.
 */
function findPosterSlide(entries: ZipEntries, slidePaths: string[]): number {
  return slidePaths.findIndex((path) => !isTemplateSlide(entries, path));
}

/**
 * `<p:cSld name="…">` is the FIRST element inside `<p:sld>`, so the
 * marker always lands within the opening kilobyte.
 */
const CSLD_NAME_RE = /<p:cSld[^>]*\bname="([^"]*)"/;
const CSLD_SCAN_BYTES = 2048;

/**
 * Is this slide one Postr appended?
 *
 * Deliberately reads the RAW BYTES instead of parsing the part. Two
 * reasons, both load-bearing:
 *
 * 1. `parsePart` THROWS on malformed XML. This probe runs over slides
 *    2..n — the very slides the importer is about to discard anyway —
 *    so parsing them would let one bad byte in a trailing slide sink
 *    an otherwise perfectly importable poster. A slide we cannot read
 *    is definitionally not one we wrote, and saying so costs nothing.
 * 2. It runs once per slide on the import path. Building a full DOM
 *    for an entire slide part to read one attribute is work that
 *    scales with deck size for a result that is thrown away.
 *
 * A false negative is harmless: the slide simply counts as skipped
 * content and the user gets the warning they used to get.
 */
function isTemplateSlide(entries: ZipEntries, path: string): boolean {
  const bytes = entries[path];
  if (!bytes) return false;
  const head = bytesToText(bytes.subarray(0, CSLD_SCAN_BYTES));
  return CSLD_NAME_RE.exec(head)?.[1]?.startsWith(TEMPLATE_SLIDE_PREFIX) ?? false;
}

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
  // Postr's own appended template slides are not the user's content,
  // so they are not "skipped" — subtract them before deciding.
  //
  // Capped at the number we actually append: the marker lives in an
  // attribute anyone can write, and nothing here is a trust decision,
  // but an unbounded subtraction would let a deck full of forged (or
  // merely unlucky) names claim that NOTHING was skipped. The cap
  // bounds the worst case to under-reporting by six.
  const templates = Math.min(
    countTemplateSlides(entries, slidePaths),
    APPENDED_SLIDE_COUNT,
  );
  const posterIdx = findPosterSlide(entries, slidePaths);
  if (posterIdx === -1) {
    // Only Postr's own blank templates are left — the poster slide was
    // deleted. Refuse rather than importing the explainer as content.
    throw new PptxImportError('Presentation contains no slides.');
  }
  const userSlides = slidePaths.length - templates;
  if (userSlides > 1) {
    // A poster is ONE canvas. Say plainly what was dropped rather than
    // letting the other slides vanish without a word.
    const skipped = userSlides - 1;
    warnings.push(
      `This file has ${userSlides} slides. Only one was imported — ` +
        `${skipped} ${skipped === 1 ? 'slide was' : 'slides were'} skipped, ` +
        'because a poster is a single canvas.',
    );
  }

  const slidePath = slidePaths[posterIdx]!;
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
      warnings.push(UNREADABLE_IMAGE_WARNING);
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
/**
 * The most-used font on the slide, IF we recognise it.
 *
 * An imported .pptx is a file from outside this system, so `typeface`
 * is untrusted input: it is whatever string the authoring tool wrote,
 * and it flows into a PosterDoc that later gets re-serialised into
 * exported XML. Returning it verbatim would let a hostile or merely
 * malformed name (an `&`, a quote, a `<`) travel through the document
 * and corrupt an export downstream.
 *
 * So this is an allowlist, not a sanitiser: a face is accepted only if
 * it is one of the curated families in `FONT_NAMES`. Anything else —
 * a font Postr does not ship, or a crafted name — falls back to the
 * default, which is also the honest outcome, since the editor could
 * not render an unknown family anyway.
 */
function readFontFamily(slide: Document): string | null {
  const counts = new Map<string, number>();
  for (const latin of allEls(slide, NS_A, 'latin')) {
    const face = latin.getAttribute('typeface');
    if (face && FONT_NAMES.includes(face)) {
      counts.set(face, (counts.get(face) ?? 0) + 1);
    }
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
