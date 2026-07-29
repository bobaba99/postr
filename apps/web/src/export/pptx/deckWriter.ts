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
import type {
  StyledElement,
  StyledSlide,
  StyledSlideDeck,
} from '../../manuscript/deck/styledTypes';

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

// ── Phase 2: styled deck → editable pptx ────────────────────────────────
//
// `exportStyledDeckPptx` renders the shared `StyledSlideDeck` model (Arm P
// layout + Arm T theme) to real, editable pptx shapes and text — no
// images. Every `StyledElement` becomes a text box (if it has `text`) or a
// vector shape at its (x, y) in inches, in the theme color at its
// fontSize. Elements whose `kind` isn't recognised fall back to a plain
// text box (or are skipped, if they carry no text) rather than throwing —
// see spec §5.3 "graceful degradation": an unfamiliar element must never
// break the export.

export interface StyledDeckPptxOptions {
  /** Injectable pptxgenjs constructor (tests / headless). */
  pptxgen?: PptxGenCtor;
}

const STYLED_FONT_FACE = 'Arial';
const DEFAULT_TEXT_COLOR = '111111';
const DEFAULT_SHAPE_COLOR = 'CCCCCC';

/** Strip a leading '#' so pptxgenjs gets the hex6 it expects. */
function toHex6(color: string | undefined, fallback: string): string {
  const stripped = color?.startsWith('#') ? color.slice(1) : color;
  return stripped ? stripped : fallback;
}

/** Draw one StyledElement as a text box. Skips silently if there's no text. */
function addStyledText(
  slide: PptxGenJS.Slide,
  el: StyledElement,
  opts: {
    w?: number;
    h?: number;
    bold?: boolean;
    align?: 'left' | 'center' | 'right';
  } = {},
): void {
  if (!el.text) return;
  slide.addText(el.text, {
    x: el.x,
    y: el.y,
    w: opts.w ?? 11.9,
    h: opts.h ?? 0.6,
    fontFace: STYLED_FONT_FACE,
    fontSize: el.fontSize ?? 18,
    bold: opts.bold ?? false,
    color: toHex6(el.color, DEFAULT_TEXT_COLOR),
    align: opts.align ?? 'left',
    valign: 'top',
  });
}

/** Draw one StyledElement as a thin rectangle (rule/track/fill/box). */
function addStyledRect(
  slide: PptxGenJS.Slide,
  el: StyledElement,
  opts: { w?: number; h?: number } = {},
): void {
  slide.addShape('rect', {
    x: el.x,
    y: el.y,
    w: opts.w ?? 1.5,
    h: opts.h ?? 0.06,
    fill: { color: toHex6(el.color, DEFAULT_SHAPE_COLOR) },
    line: { type: 'none' },
  });
}

/** Element kinds understood by no device-specific renderer, but still
 * meaningfully drawable as a positioned shape/text pair. Kept small and
 * declarative so new device vocabularies stay easy to extend.
 *
 * THIS SWITCH IS THE AUTHORITY for which kinds are shapes: the shared
 * `SHAPE_KINDS` set in `manuscript/deck/styledTypes.ts` (consumed by the
 * PDF writer and the live preview) MUST list exactly the 8 `case` labels
 * below that return a shape (not text). If you add/remove a shape case
 * here, update `SHAPE_KINDS` too, or the three surfaces will disagree on
 * the same `StyledSlideDeck` again. */
function addKnownElement(slide: PptxGenJS.Slide, el: StyledElement): boolean {
  switch (el.kind) {
    // Full-bleed-ish background swatch — draw as a large rect so it
    // remains an editable vector fill, not a picture.
    case 'background':
      slide.addShape('rect', {
        x: 0,
        y: 0,
        w: SLIDE_WIDTH_IN,
        h: SLIDE_HEIGHT_IN,
        fill: { color: toHex6(el.color, 'FFFFFF') },
        line: { type: 'none' },
      });
      return true;

    case 'title':
      addStyledText(slide, el, { w: 11.9, h: 1.6, bold: true });
      return true;

    case 'section-label':
    case 'footer':
    case 'slide-number':
    case 'progress-label':
    case 'callout-label':
      addStyledText(slide, el, { w: 4, h: 0.4 });
      return true;

    case 'body':
    case 'callout-text':
      addStyledText(slide, el, { w: 10.5, h: 1.6 });
      return true;

    case 'quote-block':
      addStyledText(slide, el, { w: 10.5, h: 2.0, bold: true });
      return true;

    case 'top-rule':
    case 'accent-line':
    case 'quote-rule':
      addStyledRect(slide, el, { w: 0.9, h: 0.05 });
      return true;

    case 'accent-dot':
      addStyledRect(slide, el, { w: 0.14, h: 0.14 });
      return true;

    case 'progress-track':
      addStyledRect(slide, el, { w: 11.9, h: 0.12 });
      return true;

    case 'progress-fill':
      // Fill is a fraction of the track; without stage data to size it
      // precisely, render a representative first-third segment so the
      // shape remains a real, editable rect (never a raster image).
      addStyledRect(slide, el, { w: 3.9, h: 0.12 });
      return true;

    case 'callout-box':
      addStyledRect(slide, el, { w: 11.2, h: 1.8 });
      return true;

    default:
      return false;
  }
}

/**
 * Render every element on a styled slide. Known kinds get their proper
 * shape/text treatment; anything else falls back to a plain text box (if
 * it has text) or is skipped entirely — never thrown. This is the single
 * choke point for graceful degradation (spec §5.3), shared by every
 * device renderer above.
 */
function addElements(
  slide: PptxGenJS.Slide,
  elements: readonly StyledElement[],
): void {
  for (const el of elements) {
    const handled = addKnownElement(slide, el);
    if (handled) continue;
    // Unknown kind: fall back to a plain text box when there's text to
    // show; otherwise skip silently. Either way, never throw.
    addStyledText(slide, el, { w: 8, h: 0.6 });
  }
}

/**
 * Draw a single styled slide onto a fresh pptx slide.
 *
 * Rendering is driven entirely by element *kind* (see `addKnownElement`),
 * not by the slide's `device`: Arm P already lays out each device's full
 * shape set (progress-bar, quote-block, callout, stat-emphasis, plain) as
 * concrete elements on `styledSlide.elements` — e.g. progress-bar →
 * progress-track + progress-fill + progress-label elements; quote-block →
 * quote-block + quote-rule; callout → callout-box + callout-label +
 * callout-text. `device` itself carries no extra rendering instructions
 * beyond that, so every device (including one outside
 * `SUPPORTED_DEVICES` — shouldn't happen, the API coerces, but this
 * stays defensive per spec §5.3) renders via the same `addElements` pass
 * below. The out-of-vocabulary case is exercised directly in
 * deckWriterStyled.test.ts.
 */
function addStyledSlide(
  pptx: PptxGenJS,
  s: StyledSlide,
  backgroundHex: string,
): void {
  const slide = pptx.addSlide();
  slide.background = { color: backgroundHex };
  addElements(slide, s.elements);
}

/**
 * Export a `StyledSlideDeck` (Arm P layout + Arm T theme) as an editable,
 * text-and-shapes-only `.pptx`. One pptx slide per styled slide. No
 * images: content is exclusively real text runs and vector shapes, so
 * the raster-only pptxgenjs SVG trap (`rasterizeSvg.ts`,
 * docs/bugs/2026-07-28-pptx-export-svg-ack-mark.md) is not reachable
 * here — mirrors the Phase-1 guarantee in `exportDeckPptx` above.
 *
 * Errors from pptxgenjs itself propagate unchanged (matches
 * `exportDeckPptx` / `writer.ts`); the graceful-degradation contract in
 * this function is specifically about unknown *element kinds* and
 * out-of-vocabulary *device* values, not about swallowing library errors.
 */
export async function exportStyledDeckPptx(
  deck: StyledSlideDeck,
  options: StyledDeckPptxOptions = {},
): Promise<Uint8Array> {
  const pptx = await buildStyledDeckPptxInstance(deck, options);
  const buffer = (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
  return buffer;
}

/**
 * Build the `PptxGenJS` instance for a styled deck WITHOUT writing it —
 * the seam Task 10's export orchestration needs to append the palette
 * and icon-library utility slides (`export/deck/paletteSlide.ts`,
 * `export/deck/iconLibrarySlide.ts`) onto the SAME pptx before the one
 * final `pptx.write()`, rather than producing two separate files.
 * `exportStyledDeckPptx` above is a thin wrapper around this for
 * callers that just want the styled slides on their own (as every
 * existing `deckWriterStyled.test.ts` assertion does).
 */
export async function buildStyledDeckPptxInstance(
  deck: StyledSlideDeck,
  options: StyledDeckPptxOptions = {},
): Promise<PptxGenJS> {
  const PptxGen = options.pptxgen ?? (await import('pptxgenjs')).default;
  const pptx = new PptxGen();
  pptx.defineLayout({
    name: LAYOUT_NAME,
    width: SLIDE_WIDTH_IN,
    height: SLIDE_HEIGHT_IN,
  });
  pptx.layout = LAYOUT_NAME;
  pptx.theme = {
    headFontFace: STYLED_FONT_FACE,
    bodyFontFace: STYLED_FONT_FACE,
  };

  const backgroundHex = toHex6(deck.theme.palette[0], 'FFFFFF');
  for (const s of deck.slides) {
    addStyledSlide(pptx, s, backgroundHex);
  }

  return pptx;
}
