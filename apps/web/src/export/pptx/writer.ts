/**
 * PPTX poster writer — `PosterDoc` → PowerPoint bytes via
 * `pptxgenjs` (decided, Gavin 2026-07-27; do not re-open).
 *
 * `pptxgenjs` itself is behind the dynamic `import()` below so
 * posters that are never exported to PowerPoint pay nothing — the
 * library lands in its own lazy chunk (verified in the build).
 *
 * Two things the library does NOT do for us (plan §3):
 * 1. The 56-inch ceiling (§2) — `planPptxScale` decides 1:1 vs
 *    exactly-half scale, the note goes into the core properties AND
 *    an off-slide text box, and >112 in throws rather than clips.
 * 2. Rich-text run mapping — `parseRichText` output is converted
 *    to pptxgenjs run objects here.
 *
 * Pure `PosterDoc → bytes` — no DOM, no store (plan §5) — but for its two
 * browser steps, each injected with a browser default: drawing an SVG to a
 * PNG (rasterizeSvg.ts) and reading a chart's picture off the editor's sheet
 * (chartPicture.ts, record 31).
 */
import type PptxGenJS from 'pptxgenjs';
import type { Block, PosterDoc, TypeStyle } from '@postr/shared';
import { planPptxScale } from '../units';
import { PX } from '@/poster/constants';
import { parseRichText, splitItalicMarkers } from '../richText';
import {
  computeCaptionNumbers,
  computeHeadingNumbers,
  deriveAuthorsContent,
  extractPosterTitle,
  formatReferencesForExport,
  type ExportContentOptions,
} from '../posterContent';
import { resolvePosterAssets, type AssetFetcher } from '../resolveAssets';
import { tableCellBorders } from './tableBorders';
import { attributionDocProperty, attributionPptxBox } from '../attribution';
import { stripAckBlock } from '../stripAckBlock';
import { colophonMarkPngDataUri } from '../colophonMarkPng';
import {
  POSTER_LAYOUT,
  buildMasters,
  resolveMasterPalette,
  safeFontFamily,
} from './masters';
import { patchThemeColors } from './themePatch';
import { browserRasterizeSvg, type SvgRasterizer } from './rasterizeSvg';
import {
  addMutedText,
  bytesToBase64,
  captionSplit,
  captionText,
  hex,
  normalizeRotation,
  orEmptyRun,
  paragraphsToTextProps,
  pt,
  rect,
  type Ctx,
} from './shapeKit';
import { addChart, type ChartPicture } from './chartShape';
import { editorChartPicture, type ChartDraw, type ChartDrawer } from './chartPicture';
import { SheetNotShownError } from '@/charts/chartDrawing';

// Moved to shapeKit.ts (record 31); still exported from here for callers.
export { normalizeRotation, paragraphsToTextProps };

export interface PptxExportOptions extends ExportContentOptions {
  /** Injectable for tests / server pipelines. */
  fetcher?: AssetFetcher;
  /**
   * Accepted-but-ignored. Once toggled whether the explainer + empty
   * template slides were appended after the poster; the poster export no
   * longer appends anything (a poster is a single slide), so this is now
   * inert. Kept only so callers that still pass it are not broken.
   */
  templateSlides?: boolean;
  /**
   * SVG → PNG rasterizer. pptxgenjs cannot embed an SVG data URI —
   * its `<img>`-based loader fires `onerror` and `pptx.write()`
   * rejects — so every SVG asset (most commonly the seeded
   * acknowledgement mark) is converted to PNG before it reaches
   * `addImage`. Defaults to the browser canvas implementation;
   * injectable so tests and headless pipelines can supply their own
   * or omit it (a doc with no SVG asset never calls it).
   */
  rasterizeSvg?: SvgRasterizer;
  /**
   * Reads a chart block off the editor's sheet, then draws its picture
   * (record 31). Defaults to the editor's own drawing (chartPicture.ts);
   * injectable for tests. Every chart is read before the writer's first
   * await; a chart it cannot read or draw is left out of the file, with a
   * warning. A reading that throws SheetNotShownError (the poster hidden
   * or gone) stops the export: nothing is written.
   */
  drawChart?: ChartDrawer;
  // `attribution` (the paid-plan seam) is inherited from
  // ExportContentOptions, which also threads it into the references
  // formatter so the credit entry honours the same seam.
}

export interface PptxExportResult {
  bytes: Uint8Array;
  /** True when the poster exceeded 56 in and was emitted at half size. */
  scaled: boolean;
  /** The user-facing half-size note (also written into the file). */
  note: string | null;
  warnings: string[];
}

function styleOptions(
  style: TypeStyle,
  ctx: Ctx,
  fallbackColor: string,
): PptxGenJS.TextPropsOptions {
  return {
    fontFace: ctx.font,
    fontSize: pt(style.size, ctx.scale),
    bold: style.weight >= 600,
    italic: style.italic,
    color: hex(style.color, fallbackColor),
    lineSpacingMultiple: style.lineHeight,
  };
}

// ── block emitters ───────────────────────────────────────────────────

function addTitle(slide: PptxGenJS.Slide, b: Block, ctx: Ctx): void {
  slide.addText(orEmptyRun(paragraphsToTextProps(parseRichText(b.content))), {
    ...rect(b, ctx.scale),
    ...styleOptions(ctx.doc.styles.title, ctx, hex(ctx.doc.palette.primary, '111111')),
    align: 'center',
    valign: 'top',
    rotate: normalizeRotation(b.rotation),
  });
}

function addAuthors(slide: PptxGenJS.Slide, b: Block, ctx: Ctx): void {
  const st = ctx.doc.styles.authors;
  const content = deriveAuthorsContent(ctx.doc.authors, ctx.doc.institutions);
  const primary = hex(ctx.doc.palette.primary, '111111');
  const accent = hex(ctx.doc.palette.accent, '0F4C75');
  const muted = hex(ctx.doc.palette.muted, '6B7280');
  const runs: PptxGenJS.TextProps[] = [];

  content.authors.forEach((a, i) => {
    runs.push({ text: (i > 0 ? ', ' : '') + a.name, options: {} });
    if (a.markers.length > 0) {
      runs.push({
        text: a.markers.join(','),
        options: { superscript: true, color: accent, bold: true },
      });
    }
  });
  if (runs.length > 0) runs[runs.length - 1]!.options!.breakLine = true;

  content.affiliations.forEach((aff, i) => {
    const size = pt(st.size * 0.82, ctx.scale);
    if (i > 0) runs.push({ text: ' · ', options: { fontSize: size, color: muted } });
    runs.push({
      text: String(aff.index),
      options: { superscript: true, fontSize: size, color: muted, bold: true },
    });
    runs.push({ text: aff.text, options: { fontSize: size, color: muted } });
  });
  if (content.affiliations.length > 0) runs[runs.length - 1]!.options!.breakLine = true;

  if (content.footnote) {
    runs.push({
      text: content.footnote,
      options: { fontSize: pt(st.size * 0.72, ctx.scale), color: muted, italic: true },
    });
  }
  if (runs.length === 0) return;

  slide.addText(runs, {
    ...rect(b, ctx.scale),
    fontFace: ctx.font,
    fontSize: pt(st.size, ctx.scale),
    color: primary,
    align: 'center',
    valign: 'top',
    lineSpacingMultiple: Math.min(1.2, st.lineHeight),
  });
}

function addHeading(slide: PptxGenJS.Slide, b: Block, ctx: Ctx): void {
  const st = ctx.doc.styles.heading;
  const hs = ctx.doc.headingStyle;
  const accent = hex(ctx.doc.palette.accent, '0F4C75');
  const n = ctx.headingNumbers[b.id];
  const runs = orEmptyRun(paragraphsToTextProps(parseRichText(b.content)));
  const withNumber: PptxGenJS.TextProps[] =
    n && n > 0 ? [{ text: `${n}. `, options: {} }, ...runs] : runs;

  const box = rect(b, ctx.scale);
  const opts: PptxGenJS.TextPropsOptions = {
    ...box,
    ...styleOptions(st, ctx, accent),
    align: hs.align === 'center' ? 'center' : 'left',
    valign: 'top',
    rotate: normalizeRotation(b.rotation),
  };
  if (hs.fill) {
    opts.fill = { color: accent, transparency: 88 };
  }
  if (hs.border === 'box') {
    opts.line = { color: accent, width: Math.max(0.5, 1 * ctx.scale) };
  }
  slide.addText(withNumber, opts);

  if (hs.border === 'bottom' || hs.border === 'thick') {
    slide.addShape('line', {
      x: box.x,
      y: box.y + box.h,
      w: box.w,
      h: 0,
      line: { color: accent, width: (hs.border === 'thick' ? 2.4 : 1) * ctx.scale },
    });
  } else if (hs.border === 'left') {
    slide.addShape('line', {
      x: box.x,
      y: box.y,
      w: 0,
      h: box.h,
      line: { color: accent, width: 2.5 * ctx.scale },
    });
  }
}

function addText(slide: PptxGenJS.Slide, b: Block, ctx: Ctx): void {
  slide.addText(orEmptyRun(paragraphsToTextProps(parseRichText(b.content))), {
    ...rect(b, ctx.scale),
    ...styleOptions(ctx.doc.styles.body, ctx, hex(ctx.doc.palette.primary, '111111')),
    align: 'left',
    valign: 'top',
    rotate: normalizeRotation(b.rotation),
  });
}

function addImage(slide: PptxGenJS.Slide, b: Block, ctx: Ctx): void {
  const asset = ctx.assets.get(b.id);
  if (!asset && !b.imageSrc && !b.note) return; // fully empty image block
  const { caption, content, note } = captionSplit(b, ctx);
  const muted = hex(ctx.doc.palette.muted, '6B7280');

  if (asset) {
    // No SVG warning here any more: SVG assets are rasterized to PNG in
    // `exportPosterPptx` before this runs (pptxgenjs cannot embed SVG at
    // all — it does not merely degrade on old PowerPoint, it throws and
    // fails the whole export), so by this point every asset is a raster
    // that renders everywhere. If rasterization failed the asset was
    // dropped and the `else` branch below emits a placeholder.
    if (b.crop && (b.crop.top || b.crop.right || b.crop.bottom || b.crop.left)) {
      ctx.warnings.push(
        'An inline image crop is not applied in the PowerPoint export — the full image is included.',
      );
    }
    const fit = b.imageFit ?? 'contain';
    slide.addImage({
      data: `${asset.mime};base64,${bytesToBase64(asset.bytes)}`,
      x: content.x,
      y: content.y,
      w: content.w,
      h: content.h,
      sizing:
        fit === 'fill'
          ? undefined
          : { type: fit, w: content.w, h: content.h },
      rotate: normalizeRotation(b.rotation),
    });
  } else if (b.imageSrc) {
    ctx.warnings.push('An image could not be loaded — exported as a placeholder box.');
    slide.addText([{ text: 'missing image', options: { color: muted, italic: true } }], {
      ...content,
      align: 'center',
      valign: 'middle',
      fontSize: pt(ctx.doc.styles.body.size, ctx.scale),
      line: { color: muted, width: Math.max(0.5, 1 * ctx.scale), dashType: 'dash' },
    });
  }

  if (caption) {
    addMutedText(slide, captionText(b, ctx, 'Figure'), caption, ctx);
  }
  if (note) {
    addMutedText(slide, paragraphsToTextProps(parseRichText(b.note ?? '')), note, ctx);
  }
}

function addTable(slide: PptxGenJS.Slide, b: Block, ctx: Ctx): void {
  const data = b.tableData;
  if (!data || data.rows === 0 || data.cols === 0) return;
  if (b.rotation) {
    ctx.warnings.push('PowerPoint tables cannot rotate — a rotated table was exported upright.');
  }
  const { caption, content, note } = captionSplit(b, ctx);
  const primary = hex(ctx.doc.palette.primary, '111111');
  const cellPt = pt(ctx.doc.styles.body.size * 0.9, ctx.scale);

  const rows: PptxGenJS.TableRow[] = [];
  for (let r = 0; r < data.rows; r++) {
    const row: PptxGenJS.TableCell[] = [];
    for (let c = 0; c < data.cols; c++) {
      // A cell's lines stay lines (`breakLine`): flattening its paragraphs
      // into one run list joined the words either side of an Enter typed
      // in the cell ("Measure ZQEZQF", MEASURED, fix 27,
      // docs/fixes/27-keep-work-safe.md).
      const runsCells: PptxGenJS.TableCell[] = paragraphsToTextProps(
        parseRichText(data.cells[r * data.cols + c] ?? ''),
      );
      row.push({
        text: runsCells.length > 0 ? runsCells : '',
        options: {
          bold: r === 0 ? true : undefined,
          border: tableCellBorders(data, r, c, ctx.doc.palette, ctx.scale),
          valign: 'middle',
        },
      });
    }
    rows.push(row);
  }

  const widths = data.colWidths?.length === data.cols ? data.colWidths : null;
  const colW = Array.from({ length: data.cols }, (_, c) => {
    const pct = widths ? widths[c]! : 100 / data.cols;
    return (content.w * pct) / 100;
  });

  slide.addTable(rows, {
    x: content.x,
    y: content.y,
    w: content.w,
    colW,
    fontFace: ctx.font,
    fontSize: cellPt,
    color: primary,
    autoPage: false,
  });

  if (caption) {
    addMutedText(slide, captionText(b, ctx, 'Table'), caption, ctx);
  }
  if (note) {
    addMutedText(slide, paragraphsToTextProps(parseRichText(b.note ?? '')), note, ctx);
  }
}

function addReferences(slide: PptxGenJS.Slide, b: Block, ctx: Ctx): void {
  const st = ctx.doc.styles.body;
  const accent = hex(ctx.doc.palette.accent, '0F4C75');
  const entries = formatReferencesForExport(ctx.doc.references, ctx.options);
  // A poster with no references: the editor shows only its hint there and
  // the PDF nothing, so the file writes nothing either, not a "References"
  // title over an empty list (record 31).
  if (entries.length === 0) return;
  const entryPt = pt(st.size * 0.88, ctx.scale);
  const runs: PptxGenJS.TextProps[] = [
    { text: 'References', options: { bold: true, color: accent, breakLine: true } },
  ];
  entries.forEach((entry, i) => {
    const segs = splitItalicMarkers(entry);
    segs.forEach((seg, si) => {
      runs.push({
        text: seg.text,
        options: {
          italic: seg.italic || undefined,
          fontSize: entryPt,
          breakLine: si === segs.length - 1 && i < entries.length - 1,
        },
      });
    });
  });
  slide.addText(runs, {
    ...rect(b, ctx.scale),
    fontFace: ctx.font,
    fontSize: pt(st.size, ctx.scale),
    color: hex(ctx.doc.palette.primary, '111111'),
    align: 'left',
    valign: 'top',
    lineSpacingMultiple: 1.2,
  });
}

// ── entry point ──────────────────────────────────────────────────────

/**
 * Export a poster as an editable .pptx. Throws `PptxSizeLimitError`
 * (from units.ts) when the poster exceeds 112 in — the UI steers
 * the user to the PDF (Save PDF) instead of clipping; the LaTeX export
 * is hidden (config/features.ts LATEX_EXPORT_ENABLED).
 */
export async function exportPosterPptx(
  input: PosterDoc,
  options: PptxExportOptions = {},
): Promise<PptxExportResult> {
  // Paid seam, applied BEFORE assets resolve: the seeded acknowledgement
  // mark is an ordinary locked `logo` block, and the block loop below
  // writes every logo as a picture shape. Dropping it here (and only
  // here) is what makes a paid deck carry no Postr mark at all — the
  // colophon box further down consults the same predicate.
  const doc = stripAckBlock(input, options.attribution);
  const plan = planPptxScale(doc.widthIn, doc.heightIn);
  // Every chart block read off the editor's sheet now, in one pass before
  // anything is awaited, so a scroll or a zoom while the file is built
  // cannot move one (record 31's review round 1, R1-F1); drawn below.
  const drawChart = options.drawChart ?? editorChartPicture;
  const chartDraws = new Map<string, ChartDraw>();
  for (const b of doc.blocks) {
    if (b.type !== 'chart') continue;
    let draw: ChartDraw | null = null;
    try {
      draw = drawChart(b, doc);
    } catch (err) {
      // The poster hidden (Preview) or gone: nothing can be copied, so
      // nothing is written, rather than a file with no charts (review round
      // 2, R2-F1). Any other failure leaves that chart out, with a warning.
      if (err instanceof SheetNotShownError) throw err;
      draw = null;
    }
    if (draw) chartDraws.set(b.id, draw);
  }
  const { assets } = await resolvePosterAssets(doc, options.fetcher);

  // pptxgenjs cannot embed SVG (see rasterizeSvg.ts). Convert every
  // resolved SVG asset to PNG in place BEFORE any slide is drawn, so
  // `addImage` only ever sees a raster the library can load. The passed
  // size is a FALLBACK: an SVG with intrinsic width/height (the ack mark
  // is 64×64) rasters at its own resolution, so this only bounds a
  // dimensionless SVG. block.w/.h are poster units (PX = 10 u/in); ×2
  // gives a reasonable raster for such a case. On conversion failure the
  // asset is dropped (not left as SVG, which would make pptxgenjs
  // throw), so `addImage` emits a missing-image placeholder — because
  // `b.imageSrc` is untouched, its `else` branch fires — instead of
  // aborting the whole export.
  const rasterizeSvg = options.rasterizeSvg ?? browserRasterizeSvg;
  const svgBlocks = doc.blocks.filter((b) => assets.get(b.id)?.ext === 'svg');
  await Promise.all(
    svgBlocks.map(async (block) => {
      const asset = assets.get(block.id);
      if (!asset) return;
      const png = await rasterizeSvg(asset.bytes, block.w * 2, block.h * 2);
      if (png && png.length > 0) {
        assets.set(block.id, { bytes: png, ext: 'png', mime: 'image/png' });
      } else {
        assets.delete(block.id);
      }
    }),
  );

  // Each chart block's picture, from what was read above (record 31): one
  // at a time, each picture is a canvas of up to 16.8 MP.
  const chartPictures = new Map<string, ChartPicture>();
  for (const [id, draw] of chartDraws) {
    const picture = await draw(rasterizeSvg).catch(() => null);
    if (picture) chartPictures.set(id, picture);
  }

  // Lazy-load pptxgenjs so it stays out of the main bundle.
  const { default: PptxGen } = await import('pptxgenjs');
  const pptx = new PptxGen();
  pptx.defineLayout({
    name: 'POSTR_POSTER',
    width: plan.slideWidthIn,
    height: plan.slideHeightIn,
  });
  pptx.layout = 'POSTR_POSTER';

  // Theme fonts — `+mj-lt` / `+mn-lt` in ppt/theme/theme1.xml. This is
  // what a NEW shape or slide inherits in PowerPoint, so the poster's
  // family is the default rather than Calibri. Theme COLOURS are not
  // expressible here; `patchThemeColors` handles them after write.
  //
  // Routed through `safeFontFamily` because pptxgenjs interpolates the
  // name into `typeface="…"` unescaped, and theme1.xml is the first
  // part PowerPoint parses — a stray `&` there breaks the whole file.
  const themeFont = safeFontFamily(doc.fontFamily);
  pptx.theme = { headFontFace: themeFont, bodyFontFace: themeFont };

  // Named layouts, offered in PowerPoint's New Slide / Layout gallery.
  // The first is the empty `POSTER_LAYOUT` used by the poster slide.
  for (const master of buildMasters(doc, plan.slideWidthIn, plan.slideHeightIn, plan.scale)) {
    pptx.defineSlideMaster(master);
  }

  const title = extractPosterTitle(doc) || 'Poster';
  pptx.title = title;
  const authorNames = doc.authors.filter((a) => a.name).map((a) => a.name);
  if (authorNames.length > 0) pptx.author = authorNames.join(', ');
  // Document properties. The generator string goes in `company`
  // (app.xml <Company>) — a free slot that does NOT clobber the
  // half-scale note. core.xml's only writable fields are title /
  // subject / creator / revision, and the first three already carry
  // real poster data, so `dc:subject` is used for the generator ONLY
  // when there is no half-scale note to put there instead.
  pptx.company = attributionDocProperty();
  if (plan.note) {
    // Core-properties note (dc:subject) — survives being emailed
    // onward without the export screen (plan §2 requirement 2).
    // Takes precedence over the generator string.
    pptx.subject = plan.note;
  } else {
    pptx.subject = attributionDocProperty();
  }

  const warnings: string[] = [
    `Fonts are referenced by name, not embedded — install "${doc.fontFamily}" ` +
      `(https://fonts.google.com/specimen/${encodeURIComponent(doc.fontFamily.replace(/ /g, '+'))}) ` +
      'before opening, or PowerPoint will substitute and reflow lines.',
  ];

  const ctx: Ctx = {
    doc,
    font: themeFont,
    scale: plan.scale,
    captionNumbers: computeCaptionNumbers(doc.blocks, doc.widthIn * PX),
    headingNumbers: computeHeadingNumbers(doc.blocks, doc.widthIn * PX),
    assets,
    options,
    warnings,
  };

  // The poster slide attaches to the deliberately EMPTY
  // `POSTER_LAYOUT`. A layout supplies defaults only, and an empty one
  // has no object to inherit from — so every block below keeps the
  // exact geometry, size and colour it had before masters existed.
  const slide = pptx.addSlide({ masterName: POSTER_LAYOUT });
  // Background: the poster's own fill colour, and nothing else.
  //
  // An earlier build flattened the acknowledgement mark into a
  // generated background IMAGE so it could not be selected or deleted.
  // That worked, and it cost every user the background-colour picker:
  // PowerPoint cannot recolour a picture fill, so a user who never
  // wanted to touch the credit could no longer restyle their poster.
  // The mark is an ordinary picture shape again (see the block loop) —
  // on FREE exports only; `stripAckBlock` at the entry point removes it
  // for paid ones — and this is a plain solid fill.
  slide.background = { color: hex(doc.palette.bg, 'FFFFFF') };

  for (const b of doc.blocks) {
    switch (b.type) {
      case 'title':
        addTitle(slide, b, ctx);
        break;
      case 'authors':
        addAuthors(slide, b, ctx);
        break;
      case 'heading':
        addHeading(slide, b, ctx);
        break;
      case 'text':
        addText(slide, b, ctx);
        break;
      case 'image':
      case 'logo':
        addImage(slide, b, ctx);
        break;
      case 'table':
        addTable(slide, b, ctx);
        break;
      case 'references':
        addReferences(slide, b, ctx);
        break;
      case 'chart':
        addChart(slide, b, ctx, chartPictures.get(b.id));
        break;
    }
  }

  // Colophon — a real, small, muted text box near the bottom edge.
  // Added last so it layers above the poster background. It is an
  // ordinary shape: the user can click it and press Delete in
  // PowerPoint, which is deliberate — the mark is non-coercive.
  const attributionBox = attributionPptxBox(
    plan.slideWidthIn,
    plan.slideHeightIn,
    options.attribution,
  );
  if (attributionBox) {
    // A small muted logo sits just left of the text (settled 2026-08-06).
    // Same muted PNG as the print colophon; sized to the text so it reads
    // as part of the colophon, not a badge. Like the text box it is an
    // ordinary picture the user can select and delete in PowerPoint.
    const markIn = 0.16; // ~ the text cap height at fontSize 11
    slide.addImage({
      data: colophonMarkPngDataUri(),
      x: attributionBox.x,
      y: attributionBox.y + attributionBox.h - markIn - 0.02,
      w: markIn,
      h: markIn,
    });
    slide.addText([{ text: attributionBox.text, options: {} }], {
      x: attributionBox.x + markIn + 0.04,
      y: attributionBox.y,
      w: attributionBox.w,
      h: attributionBox.h,
      fontFace: themeFont,
      fontSize: attributionBox.fontSize,
      color: hex(doc.palette.muted, '6B7280'),
      align: 'left',
      valign: 'bottom',
    });
  }

  if (plan.note) {
    // Off-slide text box — the in-file warning a supervisor sees
    // when the deck gets forwarded (plan §2 requirement 2).
    slide.addText([{ text: `⚠ ${plan.note}`, options: {} }], {
      x: 0.2,
      y: plan.slideHeightIn + 0.3,
      w: Math.min(plan.slideWidthIn - 0.4, 12),
      h: 1,
      fontSize: 14,
      color: 'C1121F',
      align: 'left',
      valign: 'top',
    });
  }

  // Everything above belongs to slide 1, and the poster export stops
  // there: a poster is a single canvas, so its `.pptx` is a single
  // slide. The empty talk-layout template slides that once followed the
  // poster (an explainer + one slide per named layout) belong to the
  // talk deck, not the poster — `templateSlides.ts` stays for that path
  // to reuse, but the poster no longer appends them.
  //
  // `options.templateSlides` is accepted-but-ignored: it was the seam
  // that turned the appended slides off for the no-regression test, and
  // nothing appends now, so it can only ever be a no-op. Kept so callers
  // that still pass it are not broken; `pptxTemplateSlides.test.ts`
  // pins that it stays inert.

  const buffer = (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
  // Last step: the poster's palette as the deck's theme colours, which
  // pptxgenjs itself cannot write. Falls back to the library's bytes
  // untouched if anything about the theme part is unexpected.
  const bytes = patchThemeColors(new Uint8Array(buffer), resolveMasterPalette(doc.palette));
  return {
    bytes,
    scaled: plan.scaled,
    note: plan.note,
    warnings: [...new Set(warnings)],
  };
}
