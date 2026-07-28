/**
 * Export acknowledgement — the single source of truth for the credit
 * line that rides along with every export.
 *
 * ── Why "acknowledgement" and not "watermark" ─────────────────────
 * Shape and tone are an owner decision (Gavin, 2026-07-27). This is
 * NOT a vendor watermark advertising the tool. It is the convention
 * academics already follow: posters routinely carry funding lines,
 * software citations, and facility acknowledgements, because crediting
 * what contributed to the work is normal practice in the field.
 *
 * That distinction is the whole design. A vendor mark invites
 * resentment — and campus word-of-mouth is the distribution plan, so
 * resentment is expensive. An acknowledgement in the house style of a
 * funding line invites none, because the reader writes those lines
 * themselves. Postr is free; a credit is the ordinary reciprocal.
 *
 * Practical consequences, all deliberate:
 *   - "Poster made with postr.sh" reads as a credit. "Made with
 *     postr.sh" alone reads as a stamp on the artifact.
 *   - It sits with the acknowledgements, in the margin band, at
 *     acknowledgement scale — not badged in a corner.
 *   - No logo, no colour, no verb, no product claim.
 * The copy is frozen — change `ACKNOWLEDGEMENT_TEXT` and you change
 * what hangs on a conference wall.
 *
 * ── The paid seam ────────────────────────────────────────────────
 * There is NO paid tier today: no entitlement column, no billing,
 * no plan field on the user. `shouldAttribute` exists so that when
 * one ships, turning the line off is a one-line change at the call
 * sites (pass the real entitlement) rather than a hunt through four
 * exporters. Until then every caller passes nothing and gets `true`.
 *
 * Per-format helpers live here too, so no caller re-derives the
 * string or invents its own wording.
 */

/**
 * Frozen copy. Phrased as a credit line, not a maker's mark — see the
 * module note. Do not add a logo, a verb, or a product claim.
 */
export const ACKNOWLEDGEMENT_TEXT = 'Poster made with postr.sh';

/**
 * @deprecated Use {@link ACKNOWLEDGEMENT_TEXT}. Retained so any call
 * site missed during the rename still emits the same string rather
 * than failing silently.
 */
export const ATTRIBUTION_TEXT = ACKNOWLEDGEMENT_TEXT;

/** Canonical URL, for the formats that can carry a machine-readable one. */
export const ATTRIBUTION_URL = 'https://postr.sh';

export interface AttributionOptions {
  /**
   * True once the poster's owner is on a paid plan, which removes the
   * visible mark. Undefined today — the paid tier does not exist yet,
   * so the seam defaults to attributing. Callers will thread the real
   * entitlement through this field when billing ships.
   */
  paidPlan?: boolean;
}

/**
 * The single predicate every export path consults before rendering a
 * visible mark. Defaults to `true` — attribution is the free-tier
 * default and absence of information is not evidence of a paid plan.
 */
export function shouldAttribute(opts: AttributionOptions = {}): boolean {
  return opts.paidPlan !== true;
}

// ── per-format helpers ───────────────────────────────────────────────

/**
 * Print / PDF: an absolutely-positioned line pinned to the bottom
 * edge of the printed sheet, inside the 1-inch band every layout
 * template reserves as a margin (`M` in poster/constants) — the same
 * band a funding or acknowledgement line would occupy.
 *
 * Deliberately NOT part of the canvas flow — it is a sibling overlay
 * on the print root, so the poster's `@page` size, its canvas
 * dimensions, and every block's x/y stay untouched.
 *
 * Returns `''` when suppressed so the caller can interpolate it
 * unconditionally.
 */
export function acknowledgementPrintHtml(opts: AttributionOptions = {}): string {
  if (!shouldAttribute(opts)) return '';
  return `<div class="postr-attribution" aria-hidden="true">${ACKNOWLEDGEMENT_TEXT}</div>`;
}

/**
 * The stylesheet rule for `acknowledgementPrintHtml`.
 *
 * PLACEMENT (owner decision): it belongs in the band where authors
 * already put logos and the references block — the bottom margin —
 * and it must never impair readability of real content.
 *
 * `left: M` (10 units) aligns it to the same left edge every template
 * gives its references block (`x: M` in templates.ts), so it reads as
 * part of that furniture rather than as a mark stuck in a corner.
 *
 * `bottom: M` keeps it INSIDE the margin band rather than in the
 * sheet's dead edge, which is where a funding line would sit.
 *
 * Sizes are in CSS pixels at the canvas's natural scale (1 poster unit
 * = 1 px), and the print window's `zoom` carries them to true print
 * size. At 7 units the line prints around 7 pt — legible to someone
 * standing at the poster, deliberately below the 18 pt axis-label and
 * 12 pt caption floors in `readability.ts`, so it never competes with
 * content and never reads as something the audience must read.
 *
 * It cannot overlap content: templates reserve this band as margin,
 * and no template places a block below `bodyTop + bodyHeight`.
 */
export function acknowledgementPrintCss(opts: AttributionOptions = {}): string {
  if (!shouldAttribute(opts)) return '';
  return `
  /* Acknowledgement line — sits in the bottom margin band with the
     logos and references, left-aligned to the references column.
     Never in the canvas flow, so poster dimensions and block
     positions are unaffected. */
  .postr-attribution {
    position: absolute;
    left: 10px;
    bottom: 10px;
    z-index: 1;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 7px;
    /* Bold at the owner's request. The size and muted colour still do
       the subordinating, so the line reads as a credit with a little
       more presence rather than as something competing for attention. */
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.02em;
    color: rgba(107, 114, 128, 0.72);
    pointer-events: none;
  }`;
}

/**
 * PPTX: geometry (inches) and copy for a small muted text box near the
 * bottom edge. The user can select and delete it in PowerPoint, which
 * is the point — the mark is non-coercive.
 *
 * `null` when suppressed.
 */
export interface PptxAcknowledgementBox {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
}

export function acknowledgementPptxBox(
  slideWidthIn: number,
  slideHeightIn: number,
  opts: AttributionOptions = {},
): PptxAcknowledgementBox | null {
  if (!shouldAttribute(opts)) return null;
  const h = 0.28;
  const margin = 0.18;
  return {
    text: ATTRIBUTION_TEXT,
    x: margin,
    y: Math.max(0, slideHeightIn - h - margin),
    w: Math.max(0.5, Math.min(slideWidthIn - margin * 2, 4)),
    h,
    fontSize: 11,
  };
}

/**
 * Document-property value for formats with a "generator" style field.
 * PPTX core.xml already uses dc:subject for the half-scale note, so
 * this goes in a different property (see the writer).
 */
export function acknowledgementDocProperty(): string {
  return `${ACKNOWLEDGEMENT_TEXT} (${ATTRIBUTION_URL})`;
}

/**
 * LaTeX header comment — matches bib.ts's existing
 * "% Generated by Postr (postr.sh)" voice.
 */
export function acknowledgementLatexComment(): string {
  return `%% ${ACKNOWLEDGEMENT_TEXT}`;
}

/**
 * LaTeX footer line — a small muted line at the foot of the document.
 * Emitted at absolute page-bottom via textpos so it cannot disturb any
 * block's coordinates. `''` when suppressed.
 *
 * @param heightIn poster height, used to pin the line 0.3in from the
 *   bottom edge (textpos modules are 0.1in — see the writer's preamble).
 */
export function acknowledgementLatexBlock(
  heightIn: number,
  opts: AttributionOptions = {},
): string {
  if (!shouldAttribute(opts)) return '';
  const y = Number((heightIn * 10 - 3).toFixed(3));
  return [
    `\\begin{textblock}{40}(3,${y})`,
    `{\\fontsize{9pt}{11pt}\\selectfont\\bfseries\\textcolor{postrMuted}{${ACKNOWLEDGEMENT_TEXT}}\\par}`,
    '\\end{textblock}',
  ].join('\n');
}

/**
 * `.postr` bundle: metadata only. A backup format nobody but the
 * re-importing user ever opens gets NO visible mark — only a
 * generator field, so a round-tripped bundle is self-describing.
 */
export function acknowledgementBundleGenerator(): string {
  return acknowledgementDocProperty();
}

// ── references entry ─────────────────────────────────────────────────
//
// The credit also appears as the LAST entry of the references block,
// where a software citation sits. That is the owner's decision and it
// is the most defensible placement in the whole feature: academics
// already cite their tools (SPSS, R, Prism, BioRender), so a Postr
// line among them is the convention, not an intrusion.
//
// It is composed as a real `Reference` rather than a hardcoded string
// so it flows through the SAME formatter every other entry uses — APA,
// Vancouver, IEEE and Harvard each render it in their own idiom, with
// the right numeric prefix, automatically. Hardcoding the string would
// have produced an APA-shaped line sitting inside a numbered Vancouver
// list.

/** Publisher/author field for the software citation. */
export const ACK_REFERENCE_AUTHOR = 'Postr';

/**
 * The acknowledgement rendered as a `Reference`-shaped record, ready
 * to append to `doc.references` before formatting.
 *
 * `rawText` is set, which makes every formatter render it verbatim
 * (see citations.ts `raw()`) apart from the numeric prefix that
 * Vancouver and IEEE add. That is deliberate: a software citation has
 * no journal or volume, and letting the field-based composer at it
 * would emit "Postr (n.d.). ." with empty slots.
 *
 * The id is a fixed sentinel so duplicate-detection is an id compare
 * rather than a string match against user content.
 */
export const ACK_REFERENCE_ID = '__postr_ack__';

export interface AckReference {
  id: string;
  authors: string[];
  year?: string;
  title?: string;
  journal?: string;
  doi?: string;
  rawText?: string;
}

/**
 * The credit as a citation entry. Shape matches `Reference` from
 * @postr/shared without importing it, so this module stays free of a
 * dependency on the poster model.
 */
export function acknowledgementReference(): AckReference {
  return {
    id: ACK_REFERENCE_ID,
    authors: [ACK_REFERENCE_AUTHOR],
    title: ACKNOWLEDGEMENT_TEXT,
    rawText: `${ACKNOWLEDGEMENT_TEXT} ${ATTRIBUTION_URL}`,
  };
}

/**
 * Append the credit to a reference list, idempotently.
 *
 * Returns the input unchanged when:
 *   - suppressed by the paid seam;
 *   - the entry is already present, so a doc that round-trips through
 *     export and import repeatedly never accumulates duplicates;
 *   - the poster has NO references of its own (owner decision,
 *     2026-07-27). A credit is a credit only when it sits among real
 *     citations. Alone under a "References" heading it is the only
 *     thing in the section, which reads as self-serving rather than as
 *     the software citation it is meant to be. Nothing is lost: the
 *     geometry-placed logo block still carries the acknowledgement on
 *     those posters.
 *
 * The empty check counts entries that are not the sentinel, so a list
 * containing ONLY a previously-injected credit (a re-imported bundle
 * whose user references were all deleted) is still treated as empty.
 *
 * Returns a NEW array; the input is never mutated.
 */
export function withAcknowledgementReference<T extends { id: string }>(
  references: readonly T[],
  opts: AttributionOptions = {},
): T[] {
  if (!shouldAttribute(opts)) return [...references];
  if (!hasOwnReferences(references)) return [...references];
  if (references.some((r) => r.id === ACK_REFERENCE_ID)) return [...references];
  return [...references, acknowledgementReference() as unknown as T];
}

/**
 * True when the list holds at least one reference the user actually
 * added — i.e. anything that is not the injected credit sentinel.
 *
 * Shared by every output path so "has references of its own" means the
 * same thing on canvas, in print, in LaTeX and in the .bib.
 */
export function hasOwnReferences(references: readonly { id: string }[]): boolean {
  return references.some((r) => r.id !== ACK_REFERENCE_ID);
}

/**
 * BibTeX entry for the credit — a real `@misc` entry, not the
 * "% Generated by Postr" comment the .bib already carried. A comment
 * is invisible to `\bibliography`; an entry is citable, which is the
 * whole point of shipping a .bib.
 *
 * The key is namespaced (`postr`) so it cannot collide with a
 * user reference key generated from an author surname.
 */
export function acknowledgementBibEntry(): string {
  return [
    '@misc{postr,',
    `  title = {${ACKNOWLEDGEMENT_TEXT}},`,
    `  author = {${ACK_REFERENCE_AUTHOR}},`,
    `  howpublished = {\\url{${ATTRIBUTION_URL}}},`,
    '}',
  ].join('\n');
}

// ── Back-compat aliases ──────────────────────────────────────────────
// The module was first written as a vendor "attribution" mark before
// the framing was corrected to an academic acknowledgement. These keep
// any un-renamed call site working rather than failing silently.
export const attributionPrintHtml = acknowledgementPrintHtml;
export const attributionPrintCss = acknowledgementPrintCss;
export const attributionPptxBox = acknowledgementPptxBox;
export const attributionDocProperty = acknowledgementDocProperty;
export const attributionLatexComment = acknowledgementLatexComment;
export const attributionLatexBlock = acknowledgementLatexBlock;
export const attributionBundleGenerator = acknowledgementBundleGenerator;
