/**
 * Client-side styled-deck PDF writer (Phase 2 — Task 6b).
 *
 * ── Task-0 verdict ────────────────────────────────────────────────────
 * pdf-lib was chosen and validated by the Task-0 spike
 * (__spikes__/pdfFidelity.spike.test.ts): it faithfully reproduces a
 * design-passed slide's positioned text and shape "devices" as real,
 * selectable PDF content — not a rasterized page image. Verdict: GO for
 * client-side PDF; no LibreOffice `soffice` server fallback is needed.
 *
 * `exportStyledDeckPdf` renders the SAME `StyledSlideDeck` model consumed
 * by the PPTX writer (`export/pptx/deckWriter.ts`, Task 6a) to PDF, one
 * page per slide at 13.33x7.5in (matches the pptx widescreen layout), so
 * the two exports visually match. Every `StyledElement` becomes either
 * positioned real text (`page.drawText`, selectable — never rasterized)
 * or a vector shape (`page.drawRectangle`) in the theme color, mirroring
 * the Task-6a device rendering kind-by-kind (see `addKnownElement` there).
 *
 * ── Utility-slide omission ────────────────────────────────────────────
 * The PDF is a read/print artifact — it must NEVER include the
 * PowerPoint-editing utility slides (icon library, palette swatches,
 * empty layout templates) that the pptx writer's `templateSlides.ts`
 * appends after the poster; those are meaningless outside PowerPoint. In
 * practice the `StyledSlideDeck` handed to this writer is the core
 * content+references deck and carries no such slides (the pptx-only
 * utility slides are appended by a layer above `exportStyledDeckPptx`,
 * never by anything that touches `StyledSlideDeck`). This writer stays
 * defensive anyway: any slide carrying a `template-marker` element (this
 * module's own filter convention — see `isUtilitySlide`) is skipped
 * entirely, contributing zero pages.
 *
 * ── Ack mark placement ────────────────────────────────────────────────
 * The ack mark (`ackMarkPngDataUri`) is embedded ONLY on the trailing
 * acknowledgement page, appended after every rendered content slide —
 * never over slide content. A `references`-role slide is content (the
 * user's citation apparatus), not the ack page itself, so the ack mark
 * always gets its own dedicated final page rather than being drawn on
 * top of a content slide.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { isShapeKind, type StyledElement, type StyledSlideDeck } from '../../manuscript/deck/styledTypes';
import { ackMarkPngDataUri } from '../ackMarkPng';

// pdf points per inch; slide = 13.33 x 7.5 in (matches deckWriter.ts's
// SLIDE_WIDTH_IN / SLIDE_HEIGHT_IN so PDF and PPTX pages match visually).
const IN = 72;
const SLIDE_W = 13.33 * IN;
const SLIDE_H = 7.5 * IN;

const DEFAULT_TEXT_COLOR = '#111111';
const DEFAULT_SHAPE_COLOR = '#CCCCCC';
const MARGIN_RIGHT_IN = 0.5;

const ACK_MARK_WIDTH_IN = 2.2;
const ACK_MARK_HEIGHT_IN = ACK_MARK_WIDTH_IN * (400 / 1200); // source aspect: 1200x400

/** This writer's own defensive filter convention: an element with this
 * `kind` anywhere on a slide marks the WHOLE slide as a PPTX-only
 * utility/template slide (icon library, palette, empty layout) that must
 * never reach the PDF. Nothing upstream currently emits this — it exists
 * so the omission contract has a concrete, testable trigger. */
const UTILITY_SLIDE_MARKER_KIND = 'template-marker';

function isUtilitySlide(elements: readonly StyledElement[]): boolean {
  return elements.some((el) => el.kind === UTILITY_SLIDE_MARKER_KIND);
}

function hexToRgb(hex: string | undefined, fallback: string) {
  const h = (hex ?? fallback).replace('#', '');
  const n = h.length === 6 ? h : fallback.replace('#', '');
  return rgb(
    parseInt(n.slice(0, 2), 16) / 255,
    parseInt(n.slice(2, 4), 16) / 255,
    parseInt(n.slice(4, 6), 16) / 255,
  );
}

interface ShapeDims {
  width: number;
  height: number;
}

/** Distinct default dimensions per device-shape family, in points, so the
 * rendered PDF is visually distinguishable (matches the Task-0 spike's
 * per-kind sizing rationale). */
function shapeDims(kind: string): ShapeDims {
  if (kind.includes('dot')) return { width: 0.12 * IN, height: 0.12 * IN };
  if (kind.includes('box')) return { width: 3 * IN, height: 1.5 * IN };
  if (kind === 'progress-track' || kind === 'progress-fill') {
    return { width: kind === 'progress-fill' ? 3.9 * IN : 11.9 * IN, height: 0.12 * IN };
  }
  return { width: 2 * IN, height: 4 };
}

function drawBackground(
  page: PDFPage,
  el: StyledElement,
): void {
  page.drawRectangle({
    x: 0,
    y: 0,
    width: SLIDE_W,
    height: SLIDE_H,
    color: hexToRgb(el.color, '#FFFFFF'),
  });
}

function drawTextElement(
  page: PDFPage,
  el: StyledElement,
  font: PDFFont,
  boldFont: PDFFont,
): void {
  if (!el.text) return;
  const isTitle = el.kind === 'title' || el.kind === 'section-label' || el.kind === 'callout-label';
  const x = el.x * IN;
  const yTop = el.y * IN;
  const fontSize = el.fontSize ?? 14;
  page.drawText(el.text, {
    x,
    y: SLIDE_H - yTop - fontSize,
    size: fontSize,
    font: isTitle ? boldFont : font,
    color: hexToRgb(el.color, DEFAULT_TEXT_COLOR),
    maxWidth: SLIDE_W - x - MARGIN_RIGHT_IN * IN,
    lineHeight: fontSize * 1.25,
  });
}

function drawShapeElement(page: PDFPage, el: StyledElement): void {
  const x = el.x * IN;
  const yTop = el.y * IN;
  const { width, height } = shapeDims(el.kind);
  page.drawRectangle({
    x,
    y: SLIDE_H - yTop - height,
    width,
    height,
    color: hexToRgb(el.color, DEFAULT_SHAPE_COLOR),
  });
}

/** Render every element of one styled slide onto a fresh PDF page.
 * Mirrors the Task-0 spike's dispatch: background → full-bleed rect,
 * recognized shape-kind elements → drawRectangle, remaining text
 * elements → drawText. An element that is neither (no text, not a
 * shape kind) is silently skipped — never thrown, matching the pptx
 * writer's graceful degradation contract (spec §5.3). The
 * `template-marker` element itself carries no text or shape kind, so
 * it is never drawn even on a non-utility slide that happened to
 * carry one.
 *
 * ── Kind wins over text ───────────────────────────────────────────────
 * `isShapeKind` is checked BEFORE `el.text`, deliberately mirroring the
 * pptx writer's dispatch (`deckWriter.ts`'s `addKnownElement`, which
 * switches on `el.kind` and never inspects `text` for a recognized
 * shape kind) and the on-screen preview
 * (`manuscript/slides/SlideViewer.tsx`'s `isShapeKind`-gated
 * `StyledElementView`). The styleDeck tool schema *permits* `text` on
 * every element, including shape kinds like `callout-box` — the prompt
 * only discourages it — so Arm P can legally emit a `callout-box` that
 * also carries a `text` field. If this writer checked `el.text` first,
 * that element would render as SELECTABLE TEXT here while the pptx and
 * the preview both draw it as a plain colored rectangle with the text
 * silently dropped: same `StyledSlideDeck`, three surfaces, two
 * different results. That breaks the locked Global Constraint that "the
 * two writers consume the SAME styled model so PDF and PPTX match by
 * construction" and the preview's what-you-see-is-what-exports
 * contract. Checking kind first keeps all three surfaces in agreement:
 * a shape-kind element is ALWAYS a shape, and any `text` it happens to
 * carry is ignored, exactly as the pptx writer and preview do.
 *
 * The page ALWAYS gets a full-bleed background fill in `themeBgHex`
 * FIRST, before any element — this does not depend on the slide
 * carrying an explicit `background`-kind element. The real styleDeck
 * API prompt (apps/api/src/narrative/styleDeck.ts's
 * STYLE_SYSTEM_PROMPT) never requires one, so relying solely on an
 * element left the PDF's page background undrawn (default white)
 * whenever Arm P omitted it — invisible ink text on a dark theme is
 * the direct, user-visible consequence (Task 10's live-browser
 * verification caught this). The pptx writer (deckWriter.ts) never had
 * this problem: it sets `slide.background` directly from
 * `deck.theme.palette[0]`, independent of any element — this mirrors
 * that. An explicit `background`-kind element, if present, still draws
 * on top afterward (normally the same color, so a visual no-op; kept
 * for forward-compatibility if a future device ever wants a
 * non-uniform background). */
function drawSlide(
  doc: PDFDocument,
  elements: readonly StyledElement[],
  font: PDFFont,
  boldFont: PDFFont,
  themeBgHex: string,
): void {
  const page = doc.addPage([SLIDE_W, SLIDE_H]);
  page.drawRectangle({ x: 0, y: 0, width: SLIDE_W, height: SLIDE_H, color: hexToRgb(themeBgHex, '#FFFFFF') });
  for (const el of elements) {
    // `background` is checked explicitly BEFORE the generic `isShapeKind`
    // branch even though `background` is itself a member of the shared
    // `SHAPE_KINDS` set: it needs the full-bleed `drawBackground` treatment,
    // not the small representative rect `shapeDims`/`drawShapeElement` give
    // every other shape kind. This ordering must stay put.
    if (el.kind === 'background') {
      drawBackground(page, el);
    } else if (isShapeKind(el.kind)) {
      // Shape-kind wins over text — matches deckWriter.ts's
      // addKnownElement and the preview's StyledElementView, so any
      // `text` this element carries (schema-legal but prompt-
      // discouraged) is ignored here exactly as it is there.
      drawShapeElement(page, el);
    } else if (el.text) {
      drawTextElement(page, el, font, boldFont);
    }
  }
}

/** Append the trailing acknowledgement page: the ack mark PNG, placed on
 * its own page so it is never drawn over slide content. */
async function addAckPage(doc: PDFDocument): Promise<void> {
  const page = doc.addPage([SLIDE_W, SLIDE_H]);
  page.drawRectangle({ x: 0, y: 0, width: SLIDE_W, height: SLIDE_H, color: rgb(1, 1, 1) });

  const dataUri = ackMarkPngDataUri();
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
  const pngBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const pngImage = await doc.embedPng(pngBytes);

  const width = ACK_MARK_WIDTH_IN * IN;
  const height = ACK_MARK_HEIGHT_IN * IN;
  page.drawImage(pngImage, {
    x: (SLIDE_W - width) / 2,
    y: (SLIDE_H - height) / 2,
    width,
    height,
  });
}

/**
 * Export a `StyledSlideDeck` (Arm P layout + Arm T theme) to a PDF whose
 * text is real and selectable, not rasterized. Renders content +
 * references slides only — any slide carrying the utility/template
 * marker (`isUtilitySlide`) is filtered out before rendering and
 * contributes zero pages — then appends one trailing acknowledgement
 * page carrying the Postr ack mark.
 */
export async function exportStyledDeckPdf(deck: StyledSlideDeck): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const contentSlides = deck.slides.filter((s) => !isUtilitySlide(s.elements));
  const themeBgHex = deck.theme.palette[0] ?? '#FFFFFF';

  for (const slide of contentSlides) {
    drawSlide(doc, slide.elements, font, boldFont, themeBgHex);
  }

  await addAckPage(doc);

  return doc.save();
}
