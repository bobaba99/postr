/**
 * PPTX slide masters — the poster's own styling, carried into
 * PowerPoint so edits and NEW slides inherit it instead of falling
 * back to Calibri-on-white Office defaults.
 *
 * ── What pptxgenjs 4.0.1 actually gives us ──────────────────────────
 *
 * `defineSlideMaster({ title, background, objects })` is a misnomer:
 * it emits a slide *LAYOUT* (`ppt/slideLayouts/slideLayoutN.xml`),
 * not a slide master. There is exactly ONE `slideMaster1.xml` per
 * deck and the library owns it. So a "named layout set" is what the
 * library can express, and that is what this module builds — the
 * names show up in PowerPoint's New Slide / Layout gallery, and
 * `addSlide({ masterName })` picks one per slide.
 *
 * Within a layout the library supports `text`, `rect`, `line`,
 * `image`, `chart` and text `placeholder` objects. Placeholders are
 * TEXT-ONLY — image/chart placeholders are an open library TODO
 * (see createSlideMaster in pptxgen.cjs.js, ISSUE#599), so a figure
 * slot is expressed as a dashed `rect` guide plus a caption
 * placeholder rather than a true picture placeholder.
 *
 * Theme fonts ARE settable (`pptx.theme = { headFontFace,
 * bodyFontFace }` → `+mj-lt` / `+mn-lt` in `theme1.xml`). Theme
 * COLOURS are not: `makeXmlTheme` hardcodes the Office `<a:clrScheme>`
 * and only interpolates the two font faces. `themeColorPatch` below
 * closes that gap after the fact — see its own comment.
 */
import type PptxGenJS from 'pptxgenjs';
import type { Palette, PosterDoc } from '@postr/shared';
import { DEFAULT_FONT_FAMILY, FONT_NAMES } from '@/poster/constants';
import { cssColorToHex6 } from '../richText';
import { unitsToPoints } from '../units';

/** Poster-unit geometry constants mirrored from `poster/constants.ts`
 *  (PX = 10 units/in, M = 10u margin, GAP = 6u gutter). Duplicated as
 *  inches here so the layouts stay pure geometry with no import cycle
 *  back into the editor's poster module. */
const MARGIN_IN = 1;
const GAP_IN = 0.6;
/** Title + authors band height, matching templates.ts HEADER_HEIGHT. */
const HEADER_IN = 7.1;

const hex = (css: string | null | undefined, fallback: string): string =>
  cssColorToHex6(css ?? null) ?? fallback;

/**
 * A font family safe to interpolate into OOXML attributes.
 *
 * pptxgenjs writes `fontFace` / `headFontFace` straight into
 * `typeface="…"` with NO escaping, so an `&`, `<` or `"` in the name
 * yields malformed XML. `PosterDoc.fontFamily` is a plain `string`,
 * and the .pptx importer copies whatever `typeface` it finds without
 * an allowlist — so a hostile name can arrive from an imported deck
 * rather than being hand-authored.
 *
 * Restricting to the curated families closes that off for the theme
 * and every layout at once. Anything unrecognised falls back to the
 * default family, which is also what the editor would render.
 */
export function safeFontFamily(family: string | null | undefined): string {
  return family && FONT_NAMES.includes(family) ? family : DEFAULT_FONT_FAMILY;
}

/** Resolved poster colours, all guaranteed 6-digit hex. */
export interface MasterPalette {
  bg: string;
  primary: string;
  accent: string;
  accent2: string;
  muted: string;
  headerBg: string;
  headerFg: string;
}

export function resolveMasterPalette(palette: Palette): MasterPalette {
  return {
    bg: hex(palette.bg, 'FFFFFF'),
    primary: hex(palette.primary, '111111'),
    accent: hex(palette.accent, '0F4C75'),
    accent2: hex(palette.accent2, '3282B8'),
    muted: hex(palette.muted, '6B7280'),
    headerBg: hex(palette.headerBg, 'FFFFFF'),
    headerFg: hex(palette.headerFg, '111111'),
  };
}

/**
 * Layout names, in gallery order. `POSTER_LAYOUT` is the one the
 * exported poster slide itself uses — deliberately first and content-
 * free so the existing slide keeps rendering exactly as before (a
 * layout only supplies DEFAULTS; anything the slide draws itself wins,
 * and an empty layout cannot shift a single coordinate).
 */
export const POSTER_LAYOUT = 'Poster (as exported)';
export const LAYOUT_THREE_COL = '3-Column Classic';
export const LAYOUT_TWO_COL = '2-Col Wide Figure';
export const LAYOUT_BILLBOARD = 'Billboard';
export const LAYOUT_SIDEBAR = 'Sidebar + Focus';
export const LAYOUT_BLANK = 'Blank';

export const MASTER_LAYOUT_NAMES: readonly string[] = [
  POSTER_LAYOUT,
  LAYOUT_THREE_COL,
  LAYOUT_TWO_COL,
  LAYOUT_BILLBOARD,
  LAYOUT_SIDEBAR,
  LAYOUT_BLANK,
];

type MasterObject = NonNullable<PptxGenJS.SlideMasterProps['objects']>[number];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Font sizes for the layouts, in points at the slide's own scale. */
interface Type {
  title: number;
  authors: number;
  heading: number;
  body: number;
  caption: number;
}

function typeScale(doc: PosterDoc, scale: number): Type {
  const pt = (units: number): number =>
    Math.round(unitsToPoints(units) * scale * 100) / 100;
  const s = doc.styles;
  return {
    title: pt(s.title.size),
    authors: pt(s.authors.size),
    heading: pt(s.heading.size),
    body: pt(s.body.size),
    caption: pt(Math.round(s.body.size * 0.85)),
  };
}

/** A text placeholder carrying the poster's font, size and colour. */
function placeholder(
  name: string,
  type: 'title' | 'body',
  box: Box,
  prompt: string,
  opts: {
    font: string;
    size: number;
    color: string;
    align?: 'left' | 'center';
    bold?: boolean;
    italic?: boolean;
    lineSpacingMultiple?: number;
  },
): MasterObject {
  return {
    placeholder: {
      options: {
        name,
        type,
        ...box,
        fontFace: opts.font,
        fontSize: opts.size,
        color: opts.color,
        align: opts.align ?? 'left',
        valign: 'top',
        ...(opts.bold ? { bold: true } : {}),
        ...(opts.italic ? { italic: true } : {}),
        ...(opts.lineSpacingMultiple
          ? { lineSpacingMultiple: opts.lineSpacingMultiple }
          : {}),
      },
      text: prompt,
    },
  };
}

/** Dashed figure guide. pptxgenjs has no image placeholder, so a
 *  muted dashed rectangle marks where a figure belongs; the user
 *  drops a picture on top of it. */
function figureGuide(box: Box, color: string): MasterObject {
  return {
    rect: {
      ...box,
      fill: { color, transparency: 94 },
      line: { color, width: 1, dashType: 'dash' },
    },
  };
}

/** The title + authors band shared by every content layout. */
function headerObjects(
  doc: PosterDoc,
  p: MasterPalette,
  t: Type,
  slideW: number,
  font: string,
): MasterObject[] {
  const w = slideW - MARGIN_IN * 2;
  return [
    placeholder(
      'title',
      'title',
      { x: MARGIN_IN, y: MARGIN_IN, w, h: 4.5 },
      'Click to add title',
      {
        font,
        size: t.title,
        color: p.primary,
        align: 'center',
        bold: (doc.styles?.title?.weight ?? 400) >= 600,
        lineSpacingMultiple: doc.styles?.title?.lineHeight,
      },
    ),
    placeholder(
      'authors',
      'body',
      { x: MARGIN_IN, y: 5.7, w, h: 2.2 },
      'Authors and affiliations',
      {
        font,
        size: t.authors,
        color: p.primary,
        align: 'center',
      },
    ),
  ];
}

/** Heading + body pair filling one column, plus the accent rule the
 *  poster's heading style draws under headings. */
function columnObjects(
  doc: PosterDoc,
  p: MasterPalette,
  t: Type,
  font: string,
  key: string,
  box: Box,
  headingText: string,
): MasterObject[] {
  const headH = 2;
  const objects: MasterObject[] = [
    placeholder(
      `${key}-heading`,
      'body',
      { x: box.x, y: box.y, w: box.w, h: headH },
      headingText,
      {
        font,
        size: t.heading,
        color: p.accent,
        align: doc.headingStyle?.align === 'center' ? 'center' : 'left',
        bold: (doc.styles?.heading?.weight ?? 400) >= 600,
      },
    ),
    placeholder(
      `${key}-body`,
      'body',
      { x: box.x, y: box.y + headH + 0.2, w: box.w, h: box.h - headH - 0.2 },
      'Click to add text',
      {
        font,
        size: t.body,
        color: p.primary,
        lineSpacingMultiple: doc.styles?.body?.lineHeight,
      },
    ),
  ];
  if (doc.headingStyle?.border === 'bottom' || doc.headingStyle?.border === 'thick') {
    objects.push({
      line: {
        x: box.x,
        y: box.y + headH,
        w: box.w,
        h: 0,
        line: {
          color: p.accent,
          width: doc.headingStyle?.border === 'thick' ? 2.4 : 1,
        },
      },
    });
  }
  return objects;
}

/** Builds every named layout for this poster's size and styling. */
export function buildMasters(
  doc: PosterDoc,
  slideW: number,
  slideH: number,
  scale: number,
): PptxGenJS.SlideMasterProps[] {
  const p = resolveMasterPalette(doc.palette);
  const t = typeScale(doc, scale);
  const background: PptxGenJS.BackgroundProps = { color: p.bg };
  const bodyTop = HEADER_IN + MARGIN_IN;
  const bodyH = slideH - bodyTop - MARGIN_IN;
  const fullW = slideW - MARGIN_IN * 2;
  const font = safeFontFamily(doc.fontFamily);
  const header = headerObjects(doc, p, t, slideW, font);

  // ── Poster (as exported) ─────────────────────────────────────────
  // Intentionally EMPTY apart from the background. The exported slide
  // uses this layout, and an empty layout cannot move, resize or
  // recolour anything the slide draws for itself — which is exactly
  // the no-regression guarantee the poster slide needs.
  const posterLayout: PptxGenJS.SlideMasterProps = {
    title: POSTER_LAYOUT,
    background,
    objects: [],
  };

  // ── 3-Column Classic ─────────────────────────────────────────────
  const c3 = (fullW - GAP_IN * 2) / 3;
  const threeCol: PptxGenJS.SlideMasterProps = {
    title: LAYOUT_THREE_COL,
    background,
    objects: [
      ...header,
      ...columnObjects(doc, p, t, font, 'col1', { x: MARGIN_IN, y: bodyTop, w: c3, h: bodyH }, 'Introduction'),
      ...columnObjects(doc, p, t, font, 'col2', { x: MARGIN_IN + c3 + GAP_IN, y: bodyTop, w: c3, h: bodyH }, 'Methods'),
      ...columnObjects(doc, p, t, font, 'col3', { x: MARGIN_IN + (c3 + GAP_IN) * 2, y: bodyTop, w: c3, h: bodyH }, 'Results'),
    ],
  };

  // ── 2-Col Wide Figure ────────────────────────────────────────────
  const c2 = (fullW - GAP_IN) / 2;
  const figTop = bodyTop + bodyH * 0.3;
  const figH = bodyH * 0.42;
  const twoCol: PptxGenJS.SlideMasterProps = {
    title: LAYOUT_TWO_COL,
    background,
    objects: [
      ...header,
      ...columnObjects(doc, p, t, font, 'left', { x: MARGIN_IN, y: bodyTop, w: c2, h: bodyH * 0.26 }, 'Introduction'),
      ...columnObjects(doc, p, t, font, 'right', { x: MARGIN_IN + c2 + GAP_IN, y: bodyTop, w: c2, h: bodyH * 0.26 }, 'Methods'),
      figureGuide({ x: MARGIN_IN, y: figTop, w: fullW, h: figH }, p.muted),
      placeholder(
        'figure-caption',
        'body',
        { x: MARGIN_IN, y: figTop + figH + 0.2, w: fullW, h: 1 },
        'Figure caption',
        { font, size: t.caption, color: p.muted, italic: true },
      ),
      ...columnObjects(
        doc,
        p,
        t,
        font,
        'discussion',
        { x: MARGIN_IN, y: figTop + figH + 1.4, w: fullW, h: slideH - MARGIN_IN - (figTop + figH + 1.4) },
        'Discussion',
      ),
    ],
  };

  // ── Billboard ────────────────────────────────────────────────────
  const assertH = 5.5;
  const bbFigTop = bodyTop + assertH + 0.6;
  const bbFigH = bodyH * 0.42;
  const bbColTop = bbFigTop + bbFigH + 0.6;
  const bbColH = slideH - MARGIN_IN - bbColTop;
  const billboard: PptxGenJS.SlideMasterProps = {
    title: LAYOUT_BILLBOARD,
    background,
    objects: [
      ...header,
      placeholder(
        'assertion',
        'body',
        { x: MARGIN_IN + 1.5, y: bodyTop, w: fullW - 3, h: assertH },
        'Your key finding in one clear sentence',
        {
          font,
          size: t.heading,
          color: p.accent,
          align: 'center',
          bold: true,
        },
      ),
      figureGuide({ x: MARGIN_IN, y: bbFigTop, w: fullW, h: bbFigH }, p.muted),
      ...columnObjects(doc, p, t, font, 'bb1', { x: MARGIN_IN, y: bbColTop, w: c3, h: bbColH }, 'Background'),
      ...columnObjects(doc, p, t, font, 'bb2', { x: MARGIN_IN + c3 + GAP_IN, y: bbColTop, w: c3, h: bbColH }, 'Methods'),
      ...columnObjects(doc, p, t, font, 'bb3', { x: MARGIN_IN + (c3 + GAP_IN) * 2, y: bbColTop, w: c3, h: bbColH }, 'Implications'),
    ],
  };

  // ── Sidebar + Focus ──────────────────────────────────────────────
  const sideW = (fullW - GAP_IN) * 0.3;
  const mainW = (fullW - GAP_IN) * 0.7;
  const mainX = MARGIN_IN + sideW + GAP_IN;
  const sbFigH = bodyH * 0.52;
  const sidebar: PptxGenJS.SlideMasterProps = {
    title: LAYOUT_SIDEBAR,
    background,
    objects: [
      ...header,
      ...columnObjects(doc, p, t, font, 'side1', { x: MARGIN_IN, y: bodyTop, w: sideW, h: bodyH * 0.46 }, 'Background'),
      ...columnObjects(doc, p, t, font, 'side2', { x: MARGIN_IN, y: bodyTop + bodyH * 0.5, w: sideW, h: bodyH * 0.46 }, 'Methods'),
      placeholder(
        'main-heading',
        'body',
        { x: mainX, y: bodyTop, w: mainW, h: 2 },
        'Results',
        {
          font,
          size: t.heading,
          color: p.accent,
          align: doc.headingStyle?.align === 'center' ? 'center' : 'left',
          bold: (doc.styles?.heading?.weight ?? 400) >= 600,
        },
      ),
      figureGuide({ x: mainX, y: bodyTop + 2.2, w: mainW, h: sbFigH }, p.muted),
      ...columnObjects(
        doc,
        p,
        t,
        font,
        'main-concl',
        { x: mainX, y: bodyTop + 2.4 + sbFigH, w: mainW, h: bodyH - 2.4 - sbFigH },
        'Conclusions',
      ),
    ],
  };

  // ── Blank ────────────────────────────────────────────────────────
  // Background + title band only, so a user starting from scratch
  // still lands on the poster's colours and fonts.
  const blank: PptxGenJS.SlideMasterProps = {
    title: LAYOUT_BLANK,
    background,
    objects: [...header],
  };

  return [posterLayout, threeCol, twoCol, billboard, sidebar, blank];
}

// ── theme colours ────────────────────────────────────────────────────

/**
 * pptxgenjs writes a HARDCODED Office `<a:clrScheme>` into
 * `ppt/theme/theme1.xml` — `makeXmlTheme` only interpolates the two
 * font faces, and `ThemeProps` exposes nothing else. That leaves the
 * theme's colour swatches at Office blue/orange even for a poster
 * styled in, say, teal.
 *
 * It matters because the theme palette is what PowerPoint offers in
 * every colour dropdown, and what a new shape's default fill comes
 * from. Without this the feature's whole point — a new slide looking
 * like the poster — half fails: right font, wrong colours.
 *
 * So the colour scheme is rewritten in the finished bytes. This is a
 * targeted single-element substitution on a document we generated
 * ourselves one function call earlier, not a general OOXML rewriter.
 * If pptxgenjs ever changes its theme markup the regex simply stops
 * matching and the deck keeps the Office swatches — a cosmetic
 * fallback, never a corrupt file.
 */
const CLR_SCHEME_RE = /<a:clrScheme name="Office">[\s\S]*?<\/a:clrScheme>/;

export function themeColorXml(p: MasterPalette): string {
  // dk1/lt1 are the text/background pair PowerPoint uses for default
  // text; dk2/lt2 the secondary pair; accent1..6 the swatch row.
  return (
    '<a:clrScheme name="Postr">' +
    `<a:dk1><a:srgbClr val="${p.primary}"/></a:dk1>` +
    `<a:lt1><a:srgbClr val="${p.bg}"/></a:lt1>` +
    `<a:dk2><a:srgbClr val="${p.headerFg}"/></a:dk2>` +
    `<a:lt2><a:srgbClr val="${p.headerBg}"/></a:lt2>` +
    `<a:accent1><a:srgbClr val="${p.accent}"/></a:accent1>` +
    `<a:accent2><a:srgbClr val="${p.accent2}"/></a:accent2>` +
    `<a:accent3><a:srgbClr val="${p.muted}"/></a:accent3>` +
    `<a:accent4><a:srgbClr val="${p.headerBg}"/></a:accent4>` +
    `<a:accent5><a:srgbClr val="${p.headerFg}"/></a:accent5>` +
    `<a:accent6><a:srgbClr val="${p.primary}"/></a:accent6>` +
    `<a:hlink><a:srgbClr val="${p.accent}"/></a:hlink>` +
    `<a:folHlink><a:srgbClr val="${p.muted}"/></a:folHlink>` +
    '</a:clrScheme>'
  );
}

/**
 * Substitute the poster's palette into a theme1.xml string.
 * Returns the input unchanged when the expected scheme is absent, so
 * a library upgrade degrades to Office swatches rather than throwing.
 */
export function applyThemeColors(themeXml: string, p: MasterPalette): string {
  if (!CLR_SCHEME_RE.test(themeXml)) return themeXml;
  return themeXml.replace(CLR_SCHEME_RE, themeColorXml(p));
}
