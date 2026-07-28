/**
 * The editable template slides appended after the poster.
 *
 * ── Why slides and not masters ───────────────────────────────────────
 *
 * pptxgenjs cannot emit multiple slide MASTERS: `defineSlideMaster`
 * actually produces a slide LAYOUT, and a deck gets exactly one
 * library-owned `slideMaster1.xml` (see `masters.ts`). PowerPoint's
 * New Slide gallery therefore shows the layouts, but a user who wants
 * "another slide in my poster's style" has to know to go looking for
 * it.
 *
 * So we ship the result instead of the mechanism: one ready-made empty
 * slide per named layout, which the user duplicates. Duplicate Slide
 * is a right-click away and carries the layout, fonts and colours with
 * it — no gallery hunting, no theme knowledge required.
 *
 * ── The importer contract ────────────────────────────────────────────
 *
 * Every export is now a multi-slide deck, and the importer warns when
 * a deck has slides it cannot import. Re-importing Postr's OWN file
 * must not produce "6 slides were skipped" about slides the user never
 * authored. Each appended slide is therefore NAMED with
 * `TEMPLATE_SLIDE_PREFIX`, which pptxgenjs writes into the slide's
 * `<p:cSld name="…">`. `import/pptx/parsePptx.ts` identifies our
 * slides by that name — wherever they sit in the deck, since a user
 * can reorder them — and subtracts them before deciding to warn. A
 * genuine seven-slide deck from PowerPoint still warns correctly.
 */
import type PptxGenJS from 'pptxgenjs';
import type { PosterDoc } from '@postr/shared';
import { unitsToPoints } from '../units';
import {
  LAYOUT_BILLBOARD,
  LAYOUT_BLANK,
  LAYOUT_SIDEBAR,
  LAYOUT_THREE_COL,
  LAYOUT_TWO_COL,
  type MasterPalette,
} from './masters';
import { APPENDED_SLIDE_COUNT, TEMPLATE_SLIDE_PREFIX } from './templateMarker';

export { APPENDED_SLIDE_COUNT, TEMPLATE_SLIDE_PREFIX };

/** The explainer slide is also Postr's, not the user's content. */
export const EXPLAINER_SLIDE_NAME = `${TEMPLATE_SLIDE_PREFIX}About these slides`;

/**
 * Layouts that get an empty template slide, in deck order. The poster
 * layout is deliberately absent — slide 1 already is the poster.
 */
export const TEMPLATE_SLIDE_LAYOUTS: readonly string[] = [
  LAYOUT_THREE_COL,
  LAYOUT_TWO_COL,
  LAYOUT_BILLBOARD,
  LAYOUT_SIDEBAR,
  LAYOUT_BLANK,
];


/**
 * House-voice explainer copy. Plain, short, and about what the user
 * does next — no marketing, and nothing about how the deck was made.
 */
export const EXPLAINER_HEADING = 'The slides after this one are empty templates.';
export const EXPLAINER_BODY =
  'They already use your poster’s fonts and colours. ' +
  'Right-click the one you want and choose Duplicate Slide to add a section, ' +
  'then type over it. Delete any you don’t use — including this slide.';

/**
 * pptxgenjs exposes no public setter for the slide's `<p:cSld name>`,
 * but writes `_name` verbatim into it. Naming the appended slides is
 * what lets the importer tell them apart from real user content, so
 * the private field is worth reaching for — with a narrow cast rather
 * than an `any`.
 *
 * If a library upgrade ever drops the field, the cast still SUCCEEDS
 * and the name simply stops reaching the XML — so the failure is
 * silent, and its consequence is user-visible: every export would
 * start telling people six slides were skipped. It is not cosmetic,
 * and it cannot be caught by types. `pptxTemplateSlides.test.ts`
 * asserting the deck's `<p:cSld name>` values IS the safety net.
 *
 * One further coupling: pptxgenjs also interpolates `_name` into
 * media relationship targets for slides with a background IMAGE
 * (`../media/{name}-image-N.ext`). These slides use a solid colour
 * fill, so that path is unreachable today — but giving one a
 * background image would put this string in a file path.
 */
function nameSlide(slide: PptxGenJS.Slide, name: string): void {
  (slide as PptxGenJS.Slide & { _name?: string })._name = name;
}

/** Everything the appended slides need from the poster. */
export interface TemplateSlideStyle {
  font: string;
  palette: MasterPalette;
  /** Point sizes at the deck's own scale. */
  headingPt: number;
  bodyPt: number;
  labelPt: number;
}

export function resolveTemplateStyle(
  doc: PosterDoc,
  palette: MasterPalette,
  font: string,
  scale: number,
): TemplateSlideStyle {
  const pt = (units: number): number =>
    Math.round(unitsToPoints(units) * scale * 100) / 100;
  return {
    font,
    palette,
    headingPt: pt(doc.styles.heading.size),
    bodyPt: pt(doc.styles.body.size),
    labelPt: pt(Math.round(doc.styles.body.size * 0.85)),
  };
}

/**
 * Append the explainer slide and one empty slide per named layout.
 *
 * Called AFTER the poster slide, so the poster stays slide 1 and its
 * XML is untouched — nothing here reaches back into it.
 */
export function addTemplateSlides(
  pptx: PptxGenJS,
  style: TemplateSlideStyle,
  slideW: number,
  slideH: number,
): void {
  addExplainerSlide(pptx, style, slideW, slideH);
  for (const layout of TEMPLATE_SLIDE_LAYOUTS) {
    addLayoutSlide(pptx, style, layout, slideW, slideH);
  }
}

function addExplainerSlide(
  pptx: PptxGenJS,
  style: TemplateSlideStyle,
  slideW: number,
  slideH: number,
): void {
  const slide = pptx.addSlide({ masterName: LAYOUT_BLANK });
  nameSlide(slide, EXPLAINER_SLIDE_NAME);
  // Layouts carry the poster's background, but a slide-level fill
  // means the explainer reads correctly even if the user swaps
  // layouts on it.
  slide.background = { color: style.palette.bg };

  const margin = slideW * 0.12;
  const w = slideW - margin * 2;
  slide.addText([{ text: EXPLAINER_HEADING, options: {} }], {
    x: margin,
    y: slideH * 0.3,
    w,
    h: slideH * 0.16,
    fontFace: style.font,
    fontSize: style.headingPt,
    color: style.palette.accent,
    bold: true,
    align: 'left',
    valign: 'bottom',
  });
  slide.addText([{ text: EXPLAINER_BODY, options: {} }], {
    x: margin,
    y: slideH * 0.48,
    w,
    h: slideH * 0.22,
    fontFace: style.font,
    fontSize: style.bodyPt,
    color: style.palette.primary,
    align: 'left',
    valign: 'top',
    lineSpacingMultiple: 1.3,
  });
}

/**
 * One empty slide attached to `layoutName`.
 *
 * "Empty" is literal: the slide's ONLY content is a small muted label
 * naming the layout, so the user can tell the five apart at a glance
 * in the slide sorter. Everything that makes the layout legible —
 * placeholders, figure guides, the title band — comes from the layout
 * itself, which is what Duplicate Slide carries along.
 */
function addLayoutSlide(
  pptx: PptxGenJS,
  style: TemplateSlideStyle,
  layoutName: string,
  slideW: number,
  slideH: number,
): void {
  const slide = pptx.addSlide({ masterName: layoutName });
  nameSlide(slide, `${TEMPLATE_SLIDE_PREFIX}${layoutName}`);
  slide.background = { color: style.palette.bg };

  const margin = slideW * 0.02;
  slide.addText([{ text: layoutName, options: {} }], {
    x: margin,
    y: slideH * 0.005,
    w: slideW - margin * 2,
    h: slideH * 0.03,
    fontFace: style.font,
    fontSize: style.labelPt,
    color: style.palette.muted,
    align: 'right',
    valign: 'top',
  });
}
