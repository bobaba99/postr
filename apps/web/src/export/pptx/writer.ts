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
 * Pure `PosterDoc → bytes` — no DOM, no store (plan §5).
 */
import type PptxGenJS from 'pptxgenjs';
import type { Block, PosterDoc, TypeStyle } from '@postr/shared';
import { planPptxScale, unitsToInches, unitsToPoints } from '../units';
import { ACK_BLOCK_ID } from '../ackBlock';
import {
  cssColorToHex6,
  parseRichText,
  splitItalicMarkers,
  type RichParagraph,
  type RichRun,
} from '../richText';
import {
  computeCaptionNumbers,
  computeHeadingNumbers,
  deriveAuthorsContent,
  extractPosterTitle,
  formatReferencesForExport,
  type ExportContentOptions,
} from '../posterContent';
import {
  resolvePosterAssets,
  type AssetFetcher,
  type ResolvedAsset,
} from '../resolveAssets';
import { tableCellBorders } from './tableBorders';
import { attributionDocProperty, attributionPptxBox } from '../attribution';

export interface PptxExportOptions extends ExportContentOptions {
  /** Injectable for tests / server pipelines. */
  fetcher?: AssetFetcher;
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

interface Ctx {
  doc: PosterDoc;
  scale: number;
  captionNumbers: Record<string, number>;
  headingNumbers: Record<string, number>;
  assets: Map<string, ResolvedAsset>;
  options: PptxExportOptions;
  warnings: string[];
}

/** Block geometry → slide inches at the plan's scale. */
const rect = (b: Block, s: number) => ({
  x: unitsToInches(b.x) * s,
  y: unitsToInches(b.y) * s,
  w: unitsToInches(b.w) * s,
  h: unitsToInches(b.h) * s,
});

const pt = (sizeUnits: number, s: number): number =>
  Math.round(unitsToPoints(sizeUnits) * s * 100) / 100;

const hex = (css: string | null | undefined, fallback: string): string =>
  cssColorToHex6(css ?? null) ?? fallback;

function runOptions(run: RichRun): PptxGenJS.TextPropsOptions {
  const opts: PptxGenJS.TextPropsOptions = {};
  if (run.bold) opts.bold = true;
  if (run.italic) opts.italic = true;
  if (run.underline) opts.underline = { style: 'sng' };
  if (run.strike) opts.strike = 'sngStrike';
  if (run.sub) opts.subscript = true;
  if (run.sup) opts.superscript = true;
  const color = cssColorToHex6(run.color);
  if (color) opts.color = color;
  const highlight = cssColorToHex6(run.highlight);
  if (highlight) opts.highlight = highlight;
  return opts;
}

/** Guard: pptxgenjs needs at least one run per text shape. */
const orEmptyRun = (runs: PptxGenJS.TextProps[]): PptxGenJS.TextProps[] =>
  runs.length > 0 ? runs : [{ text: '', options: {} }];

/** Paragraphs → pptxgenjs run array with breakLine + bullets. */
export function paragraphsToTextProps(
  paragraphs: readonly RichParagraph[],
): PptxGenJS.TextProps[] {
  const out: PptxGenJS.TextProps[] = [];
  paragraphs.forEach((p, pi) => {
    const last = pi === paragraphs.length - 1;
    const bullet: PptxGenJS.TextPropsOptions['bullet'] =
      p.list === 'unordered' ? true : p.list === 'ordered' ? { type: 'number' } : undefined;
    if (p.runs.length === 0) {
      out.push({ text: '', options: { breakLine: !last } });
      return;
    }
    p.runs.forEach((run, ri) => {
      const opts = runOptions(run);
      if (bullet !== undefined && ri === 0) opts.bullet = bullet;
      opts.breakLine = ri === p.runs.length - 1 && !last;
      out.push({ text: run.text, options: opts });
    });
  });
  return out;
}

function styleOptions(
  style: TypeStyle,
  ctx: Ctx,
  fallbackColor: string,
): PptxGenJS.TextPropsOptions {
  return {
    fontFace: ctx.doc.fontFamily,
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
    fontFace: ctx.doc.fontFamily,
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

interface SubBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Caption layout: returns caption + content + note boxes within the
 *  block frame, mirroring the canvas CaptionWrapper geometry. The
 *  note always sits directly under the content (canvas keeps body +
 *  note in one vertical sub-column regardless of caption side). */
function captionSplit(
  b: Block,
  ctx: Ctx,
): { caption: SubBox | null; content: SubBox; note: SubBox | null } {
  const box = rect(b, ctx.scale);
  const position = b.captionPosition ?? 'top';
  const n = ctx.captionNumbers[b.id];
  const smallPt = pt(Math.round(ctx.doc.styles.body.size * 0.85), ctx.scale);
  const smallH = (smallPt / 72) * 1.6; // one small-text line + breathing room, inches
  const gap = 0.06 * ctx.scale;
  const noteUnder = (content: SubBox): SubBox | null =>
    b.note
      ? { x: content.x, y: content.y + content.h + gap, w: content.w, h: smallH }
      : null;
  if (position === 'none' || n === undefined) {
    return { caption: null, content: box, note: noteUnder(box) };
  }
  if (position === 'left' || position === 'right') {
    const capW = box.w * 0.35;
    const contentW = box.w - capW - gap;
    const capX = position === 'left' ? box.x : box.x + contentW + gap;
    const contentX = position === 'left' ? box.x + capW + gap : box.x;
    const content = { x: contentX, y: box.y, w: contentW, h: box.h };
    return {
      caption: { x: capX, y: box.y, w: capW, h: box.h },
      content,
      note: noteUnder(content),
    };
  }
  if (position === 'bottom') {
    const note = noteUnder(box);
    // Canvas order for bottom captions is content → note → caption,
    // so the caption drops below the note when one exists.
    const capY = note ? note.y + note.h + gap : box.y + box.h + gap;
    return {
      caption: { x: box.x, y: capY, w: box.w, h: smallH },
      content: box,
      note,
    };
  }
  // top (default): caption above, content keeps its declared frame
  // shifted below — same as the canvas where top captions grow the
  // block downward rather than squeezing the image.
  const content = { x: box.x, y: box.y + smallH + gap, w: box.w, h: box.h };
  return {
    caption: { x: box.x, y: box.y, w: box.w, h: smallH },
    content,
    note: noteUnder(content),
  };
}

function captionText(b: Block, ctx: Ctx, label: 'Figure' | 'Table'): PptxGenJS.TextProps[] {
  const n = ctx.captionNumbers[b.id];
  const runs = paragraphsToTextProps(parseRichText(b.caption ?? ''));
  return [{ text: `${label} ${n}. `, options: { bold: true } }, ...runs];
}

/** Small muted italic text shape — captions and figure/table notes,
 *  matching the canvas CaptionWrapper styling (0.85 × body size). */
function addMutedText(
  slide: PptxGenJS.Slide,
  runs: PptxGenJS.TextProps[],
  box: SubBox,
  ctx: Ctx,
): void {
  slide.addText(orEmptyRun(runs), {
    ...box,
    fontFace: ctx.doc.fontFamily,
    fontSize: pt(Math.round(ctx.doc.styles.body.size * 0.85), ctx.scale),
    color: hex(ctx.doc.palette.muted, '6B7280'),
    italic: true,
    align: 'left',
    valign: 'top',
  });
}

function addImage(slide: PptxGenJS.Slide, b: Block, ctx: Ctx): void {
  const asset = ctx.assets.get(b.id);
  if (!asset && !b.imageSrc && !b.note) return; // fully empty image block
  const { caption, content, note } = captionSplit(b, ctx);
  const muted = hex(ctx.doc.palette.muted, '6B7280');

  if (asset) {
    // The acknowledgement mark is an SVG we generate ourselves, so the
    // pre-2019 caveat is not something the user chose or can act on —
    // warning about it would be noise about a block they did not add.
    if (asset.ext === 'svg' && b.id !== ACK_BLOCK_ID) {
      ctx.warnings.push(
        'An SVG figure was embedded — older PowerPoint versions (pre-2019) may not render it.',
      );
    }
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
      const runsCells: PptxGenJS.TableCell[] = parseRichText(data.cells[r * data.cols + c] ?? '')
        .flatMap((p) => p.runs)
        .map((run) => ({ text: run.text, options: runOptions(run) }));
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
    fontFace: ctx.doc.fontFamily,
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
    fontFace: ctx.doc.fontFamily,
    fontSize: pt(st.size, ctx.scale),
    color: hex(ctx.doc.palette.primary, '111111'),
    align: 'left',
    valign: 'top',
    lineSpacingMultiple: 1.2,
  });
}

// ── helpers ──────────────────────────────────────────────────────────

/** Ours: clockwise degrees, any sign. pptxgenjs: 0–359 clockwise. */
export function normalizeRotation(rotation: number | undefined): number | undefined {
  if (!rotation) return undefined;
  return ((Math.round(rotation) % 360) + 360) % 360 || undefined;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// ── entry point ──────────────────────────────────────────────────────

/**
 * Export a poster as an editable .pptx. Throws `PptxSizeLimitError`
 * (from units.ts) when the poster exceeds 112 in — the UI steers
 * the user to LaTeX/PDF instead of clipping.
 */
export async function exportPosterPptx(
  doc: PosterDoc,
  options: PptxExportOptions = {},
): Promise<PptxExportResult> {
  const plan = planPptxScale(doc.widthIn, doc.heightIn);
  const { assets } = await resolvePosterAssets(doc, options.fetcher);

  // Lazy-load pptxgenjs so it stays out of the main bundle.
  const { default: PptxGen } = await import('pptxgenjs');
  const pptx = new PptxGen();
  pptx.defineLayout({
    name: 'POSTR_POSTER',
    width: plan.slideWidthIn,
    height: plan.slideHeightIn,
  });
  pptx.layout = 'POSTR_POSTER';

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
    scale: plan.scale,
    captionNumbers: computeCaptionNumbers(doc.blocks),
    headingNumbers: computeHeadingNumbers(doc.blocks),
    assets,
    options,
    warnings,
  };

  const slide = pptx.addSlide();
  // Background: the poster's own fill colour, and nothing else.
  //
  // An earlier build flattened the acknowledgement mark into a
  // generated background IMAGE so it could not be selected or deleted.
  // That worked, and it cost every user the background-colour picker:
  // PowerPoint cannot recolour a picture fill, so a user who never
  // wanted to touch the credit could no longer restyle their poster.
  // The mark is an ordinary picture shape again (see the block loop),
  // and this is a plain solid fill.
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
    slide.addText([{ text: attributionBox.text, options: {} }], {
      x: attributionBox.x,
      y: attributionBox.y,
      w: attributionBox.w,
      h: attributionBox.h,
      fontFace: doc.fontFamily,
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

  const buffer = (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
  return {
    bytes: new Uint8Array(buffer),
    scaled: plan.scaled,
    note: plan.note,
    warnings: [...new Set(warnings)],
  };
}
