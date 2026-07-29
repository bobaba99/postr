/**
 * Multi-slide, text-only PPTX deck writer (Phase 1 — paper-to-slides).
 *
 * `SlideDeck` → PowerPoint bytes, one editable slide per `Slide`, black
 * text on white, no theme, no colour, Arial, generous margins. "Correct
 * and complete before pretty" (spec §Phase 1) — the design pass is Plan 2.
 *
 * REUSE LEDGER: mirrors the poster writer's (`writer.ts`) lazy
 * `pptxgenjs` import so the library stays in its own chunk and decks that
 * are never exported pay nothing. Unlike the poster writer this path
 * emits ONLY text boxes and notes — no images — so no rasterization path
 * is reachable and no SVG can ever leak into the archive (pptxgenjs
 * throws on embedded SVG; see `rasterizeSvg.ts`). `deckWriter.test.ts`
 * locks the raster-only guarantee in by unzipping the output.
 */
import type PptxGenJS from 'pptxgenjs';
import type { Slide, SlideDeck } from '../../manuscript/deck/types';

/** Injectable pptxgenjs constructor for tests / server pipelines. */
type PptxGenCtor = typeof PptxGenJS;

export interface DeckPptxOptions {
  /** Injectable pptxgenjs constructor (tests / headless). */
  pptxgen?: PptxGenCtor;
}

// Standard 16:9 slide in inches — matches PowerPoint's widescreen default.
const SLIDE_WIDTH_IN = 13.333;
const SLIDE_HEIGHT_IN = 7.5;
const LAYOUT_NAME = 'POSTR_SLIDES_WIDE';

// Black on white, one clean typeface. No palette in Phase 1.
const FONT_FACE = 'Arial';
const TITLE_COLOR = '111111';
const BODY_COLOR = '333333';
const REFERENCE_COLOR = '6B7280'; // muted grey — apparatus, not content
const BACKGROUND = 'FFFFFF';

/** Compose the acknowledgement-free speaker-notes string for a slide. */
function speakerNotesString(slide: Slide): string {
  return slide.speakerNotes
    .map((n) => (n.provenance ? `${n.text}  [${n.provenance}]` : n.text))
    .join('\n');
}

/** Draw a single deck slide onto a fresh pptx slide. */
function addDeckSlide(pptx: PptxGenJS, s: Slide): void {
  const slide = pptx.addSlide();
  slide.background = { color: BACKGROUND };

  const isTitle = s.role === 'title';
  slide.addText(s.assertion, {
    x: 0.7,
    y: isTitle ? 3.0 : 0.6,
    w: 11.9,
    h: isTitle ? 1.5 : 1.4,
    fontFace: FONT_FACE,
    fontSize: isTitle ? 40 : 26,
    bold: true,
    color: TITLE_COLOR,
    align: 'left',
    valign: isTitle ? 'middle' : 'top',
  });

  if (s.evidence) {
    slide.addText(s.evidence, {
      x: 0.7,
      y: 2.2,
      w: 11.9,
      h: 4.6,
      fontFace: FONT_FACE,
      fontSize: 16,
      color: BODY_COLOR,
      align: 'left',
      valign: 'top',
    });
  }

  // Bottom-box citation apparatus: the slide's references, small and
  // muted, pinned to the lower edge. Rendered ONLY when non-empty so
  // most slides have no reference box at all. References are apparatus,
  // not talk content — never word-capped (see types.ts).
  if (s.references.length > 0) {
    slide.addText(s.references.join('\n'), {
      x: 0.7,
      y: 6.7,
      w: 11.9,
      h: 0.6,
      fontFace: FONT_FACE,
      fontSize: 9,
      color: REFERENCE_COLOR,
      align: 'left',
      valign: 'bottom',
    });
  }

  const notes = speakerNotesString(s);
  if (notes.length > 0) {
    slide.addNotes(notes);
  }
}

/**
 * Export a `SlideDeck` as an editable, text-only `.pptx`.
 *
 * Errors from pptxgenjs (a malformed slide the library rejects, an SVG
 * that slipped in) propagate to the caller unchanged — the raw failure is
 * more actionable than a swallowed one, and it matches the poster writer
 * (`writer.ts`), which also lets `pptx.write` reject through.
 */
export async function exportDeckPptx(
  deck: SlideDeck,
  options: DeckPptxOptions = {},
): Promise<Uint8Array> {
  // Lazy-load pptxgenjs so it stays out of the main bundle (mirrors
  // writer.ts). Injectable for tests / headless pipelines.
  const PptxGen = options.pptxgen ?? (await import('pptxgenjs')).default;
  const pptx = new PptxGen();
  pptx.defineLayout({
    name: LAYOUT_NAME,
    width: SLIDE_WIDTH_IN,
    height: SLIDE_HEIGHT_IN,
  });
  pptx.layout = LAYOUT_NAME;
  pptx.theme = { headFontFace: FONT_FACE, bodyFontFace: FONT_FACE };

  for (const s of deck.slides) {
    addDeckSlide(pptx, s);
  }

  const buffer = (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
  return buffer;
}
