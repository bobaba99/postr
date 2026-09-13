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
 *   - The copy is a credit, never a product claim: no verb of making
 *     addressed to the reader, no tagline, no feature. Until
 *     2026-09-13 it read "Poster made with postr.sh", on the argument
 *     that the leading noun is what separates a credit from a stamp.
 *     The owner shortened it to the current value that day, once the
 *     colophon was quarter-sized and moved to the margin's right end —
 *     at that scale it no longer reads as a badge, so the leading noun
 *     was doing less work than the size was. `ACKNOWLEDGEMENT_TEXT` is
 *     the only definition; do not reintroduce the old string here.
 *   - It sits in the bottom margin band at acknowledgement scale —
 *     the band where funding lines and logos already live. Since
 *     2026-09-13 it is anchored to that band's RIGHT end and set at a
 *     quarter of its former size (see `acknowledgementPrintCss`),
 *     because at its previous size it printed larger than most
 *     posters' body text and read as exactly the badge this framing
 *     exists to avoid.
 *   - A SMALL MUTED logo now accompanies the text in the print/PDF
 *     colophon (settled 2026-08-06). Still no colour band, no verb, no
 *     product claim — the mark is grey and margin-scaled, so the
 *     anti-"vendor sticker" intent holds.
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
import { colophonMarkPngDataUri } from './colophonMarkPng';

/**
 * Frozen copy. Phrased as a credit line, not a maker's mark — see the
 * module note. Do not add a verb or a product claim.
 *
 * UPDATE (settled 2026-08-06): a small MUTED logo now accompanies this
 * text in the print/PDF colophon (see `acknowledgementPrintHtml`). This is
 * a deliberate, settled partial change to the original "no logo, no
 * colour" rule: a small grey corner mark is allowed; a saturated coloured
 * band is still forbidden. The anti-"vendor sticker" intent is preserved
 * by keeping the mark small, muted, and in the margin band.
 */
export const ACKNOWLEDGEMENT_TEXT = 'made with postr.sh';

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
  // Settled 2026-08-06: a small MUTED logo sits before the text. It is the
  // grey `muted` library variant (never the purple brand mark) and a PNG
  // (not inline SVG) because some PDF print engines mis-render inline SVG
  // in the print window. Small, muted, in the margin — reads as a colophon
  // mark, not a vendor sticker; still governed by the same anti-"sticker"
  // intent as the text.
  return (
    `<div class="postr-attribution" aria-hidden="true">` +
    `<img class="postr-attribution-mark" src="${colophonMarkPngDataUri()}" alt="" />` +
    `<span>${ACKNOWLEDGEMENT_TEXT}</span>` +
    `</div>`
  );
}

/**
 * The stylesheet rule for `acknowledgementPrintHtml`.
 *
 * PLACEMENT (owner decision, revised 2026-09-13): it belongs in the
 * bottom margin band, and it must never impair readability of real
 * content. It is now anchored to the band's RIGHT end (`right: M`)
 * rather than its left. The references block owns the left edge
 * (`x: M` in templates.ts); putting the credit at the opposite end
 * keeps it out of that column's optical run and reads as a colophon
 * rather than as a mis-aligned first entry.
 *
 * `bottom: M` keeps it INSIDE the margin band rather than in the
 * sheet's dead edge, which is where a funding line would sit.
 *
 * ── Sizing, and the bug this replaces ────────────────────────────
 * Sizes here are CSS pixels at the canvas's NATURAL scale, where
 * 1 poster unit = 1 px = 0.1 INCH — not 1 pt. The print window then
 * applies `zoom: 96 / PX` (9.6 at PX=10) to reach true print size.
 *
 * The previous values ignored that conversion. `font-size: 7px` was
 * commented as printing "around 7 pt"; it actually printed at
 * 7 × 9.6 = 67.2 CSS px = 0.7 in = **50.4 pt**, and the 9 px mark at
 * 0.9 in — a credit line set larger than most posters' body text,
 * which is exactly the "vendor sticker" failure the whole
 * acknowledgement framing exists to avoid.
 *
 * Every dimension below is therefore the old value × 0.25, so the row
 * keeps its proportions at a quarter of its former width:
 *   font-size 7 → 1.75 px  (prints 1.75 × 9.6 / 96 in = 0.175 in ≈ 12.6 pt)
 *   mark       9 → 2.25 px (prints 0.225 in)
 *   gap        4 → 1 px
 * 12.6 pt sits below the 18 pt axis-label and (just above) the 12 pt
 * caption floors in `readability.ts`, so the line is legible to a
 * reader standing at the poster without competing with content —
 * which is what the original comment intended all along.
 *
 * It cannot overlap content: templates reserve this band as margin,
 * and no template places a block below `bodyTop + bodyHeight`.
 */
export function acknowledgementPrintCss(opts: AttributionOptions = {}): string {
  if (!shouldAttribute(opts)) return '';
  return `
  /* Acknowledgement line — sits in the bottom margin band, anchored to
     its RIGHT end so it stays clear of the references column that owns
     the left edge. Never in the canvas flow, so poster dimensions and
     block positions are unaffected. */
  .postr-attribution {
    /* The right edge comes from 'right: 10px' alone — the box is
       absolutely positioned with no 'left' and no 'width', so it is
       shrink-to-fit and there is no free space for 'justify-content'
       to distribute. Do not "restore" a flex alignment here; removing
       'right' is what would break the anchor. (No backticks in this
       string: it is a template literal.) */
    position: absolute;
    right: 10px;
    bottom: 10px;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 1px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 1.75px;
    /* Bold at the owner's request. The size and muted colour still do
       the subordinating, so the line reads as a credit with a little
       more presence rather than as something competing for attention. */
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.02em;
    color: rgba(107, 114, 128, 0.72);
    white-space: nowrap;
    pointer-events: none;
  }
  /* Small muted mark (settled 2026-08-06). Sized to the cap-height of the
     text so it reads as part of the colophon, not a badge. It is a grey
     PNG, always scaled DOWN, and lives inside the bottom-margin overlay —
     so it cannot overlap poster content. */
  .postr-attribution-mark {
    width: 2.25px;
    height: 2.25px;
    display: block;
    flex: none;
    opacity: 0.72;
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
