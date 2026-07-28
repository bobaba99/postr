/**
 * LaTeX poster writer — `PosterDoc` → compilable `poster.tex`.
 *
 * Class decision (plan §4): `article` + `geometry` + `textpos`.
 * `textpos` is absolute positioning with a settable module unit; we
 * set `\TPHorizModule`/`\TPVertModule` to 0.1in (exactly one Postr
 * unit) so every block's coordinates are emitted VERBATIM — no
 * conversion, no rounding, and the file stays legible to a human
 * who wants to nudge something.
 *
 * Engine: XeLaTeX/LuaLaTeX via fontspec for the real Google fonts,
 * with a commented pdfLaTeX fallback mapping each family to a
 * TeX-native near-equivalent.
 *
 * Pure function — no DOM, no store, no network (plan §5).
 */
import type { Block, PosterDoc, TypeStyle } from '@postr/shared';
import { TABLE_BORDER_PRESETS } from '@/poster/constants';
import { escapeLatex } from './escape';
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
import { unitsToInches, unitsToPoints } from '../units';
import {
  attributionLatexBlock,
  attributionLatexComment,
  type AttributionOptions,
} from '../attribution';

export interface LatexWriterOptions extends ExportContentOptions {
  /** Block id → relative image path inside the bundle (figures/…). */
  assetPaths?: ReadonlyMap<string, string>;
  /** Whether a references.bib ships alongside (mentioned in header). */
  hasBib?: boolean;
  // `attribution` (the paid-plan seam) is inherited from
  // ExportContentOptions, which also threads it into the references
  // formatter so the credit entry honours the same seam.
}

export interface LatexDocument {
  tex: string;
  warnings: string[];
}

/** pdfLaTeX near-equivalents for the ten curated families (plan §4). */
const PDFLATEX_FALLBACKS: Record<string, { pkg: string; opts?: string; exact: boolean }> = {
  'Source Sans 3': { pkg: 'sourcesanspro', opts: 'default', exact: true },
  'DM Sans': { pkg: 'sourcesanspro', opts: 'default', exact: false },
  'IBM Plex Sans': { pkg: 'plex-sans', opts: 'sfdefault', exact: true },
  'Fira Sans': { pkg: 'FiraSans', opts: 'sfdefault', exact: true },
  'Libre Franklin': { pkg: 'librefranklin', opts: 'sfdefault', exact: true },
  Outfit: { pkg: 'sourcesanspro', opts: 'default', exact: false },
  Charter: { pkg: 'XCharter', exact: true },
  Literata: { pkg: 'cochineal', exact: false },
  'Source Serif 4': { pkg: 'sourceserifpro', opts: 'default', exact: true },
  Lora: { pkg: 'cochineal', exact: false },
};

/** Trim trailing zeros: 7.2 → "7.2", 36 → "36", 15.5 → "15.5". */
const num = (n: number): string => String(Number(n.toFixed(3)));

const fontSize = (sizeUnits: number, lineHeight: number): string => {
  const pt = unitsToPoints(sizeUnits);
  return `\\fontsize{${num(pt)}pt}{${num(pt * lineHeight)}pt}\\selectfont`;
};

const texColor = (css: string | null | undefined, fallbackName: string): string => {
  const hex = cssColorToHex6(css ?? null);
  return hex ? `\\textcolor[HTML]{${hex}}` : `\\textcolor{${fallbackName}}`;
};

// ── inline runs ──────────────────────────────────────────────────────

function runToLatex(run: RichRun): string {
  let out = escapeLatex(run.text);
  if (!out) return '';
  if (run.bold) out = `\\textbf{${out}}`;
  if (run.italic) out = `\\textit{${out}}`;
  if (run.underline) out = `\\uline{${out}}`;
  if (run.strike) out = `\\sout{${out}}`;
  if (run.sup) out = `\\textsuperscript{${out}}`;
  if (run.sub) out = `\\textsubscript{${out}}`;
  const colorHex = cssColorToHex6(run.color);
  if (colorHex) out = `\\textcolor[HTML]{${colorHex}}{${out}}`;
  const highlightHex = cssColorToHex6(run.highlight);
  if (highlightHex) out = `\\colorbox[HTML]{${highlightHex}}{${out}}`;
  return out;
}

const runsToLatex = (runs: readonly RichRun[]): string =>
  runs.map(runToLatex).join('');

/**
 * Paragraphs → LaTeX body. Plain paragraphs join with `\\`;
 * consecutive list items group into itemize/enumerate.
 */
export function paragraphsToLatex(paragraphs: readonly RichParagraph[]): string {
  const lines: string[] = [];
  let i = 0;
  while (i < paragraphs.length) {
    const p = paragraphs[i]!;
    if (p.list !== null) {
      const env = p.list === 'ordered' ? 'enumerate' : 'itemize';
      const items: string[] = [];
      const first = p.listIndex;
      let j = i;
      while (j < paragraphs.length && paragraphs[j]!.list === p.list) {
        items.push(`  \\item ${runsToLatex(paragraphs[j]!.runs)}`);
        j += 1;
      }
      const setCounter =
        p.list === 'ordered' && first && first !== 1
          ? `  \\setcounter{enumi}{${first - 1}}\n`
          : '';
      lines.push(`\\begin{${env}}\n${setCounter}${items.join('\n')}\n\\end{${env}}`);
      i = j;
      continue;
    }
    const body = runsToLatex(p.runs);
    lines.push(body.length > 0 ? body : '~'); // keep intentional blank lines
    i += 1;
  }
  // `\\` between plain lines; environments separate themselves.
  return lines
    .map((line, idx) => {
      const isEnv = line.startsWith('\\begin{');
      const nextIsEnv = idx + 1 < lines.length && lines[idx + 1]!.startsWith('\\begin{');
      const last = idx === lines.length - 1;
      return isEnv || nextIsEnv || last ? line : `${line}\\\\`;
    })
    .join('\n');
}

// ── block emitters ───────────────────────────────────────────────────

interface EmitContext {
  doc: PosterDoc;
  options: LatexWriterOptions;
  captionNumbers: Record<string, number>;
  headingNumbers: Record<string, number>;
  warnings: string[];
}

function textBlockEnv(b: Block, body: string): string {
  const open = `\\begin{textblock}{${num(b.w)}}(${num(b.x)},${num(b.y)})`;
  const rot = b.rotation ?? 0;
  if (rot === 0) {
    return `${open}\n${body}\n\\end{textblock}`;
  }
  // Our rotation is clockwise; \rotatebox is counter-clockwise.
  const wrapped =
    `\\rotatebox[origin=c]{${num(-rot)}}{\\begin{minipage}{${num(unitsToInches(b.w))}in}\n` +
    `${body}\n\\end{minipage}}`;
  return `${open}\n${wrapped}\n\\end{textblock}`;
}

function weightCmds(style: TypeStyle): string {
  let out = '';
  if (style.weight >= 600) out += '\\bfseries ';
  if (style.italic) out += '\\itshape ';
  return out;
}

function emitTitle(b: Block, ctx: EmitContext): string {
  const st = ctx.doc.styles.title;
  const body =
    `{${fontSize(st.size, st.lineHeight)}${weightCmds(st)}` +
    `${texColor(st.color, 'postrPrimary')}{\\centering ` +
    `${paragraphsToLatex(parseRichText(b.content))}\\par}}`;
  return textBlockEnv(b, body);
}

function emitAuthors(b: Block, ctx: EmitContext): string {
  const st = ctx.doc.styles.authors;
  const content = deriveAuthorsContent(ctx.doc.authors, ctx.doc.institutions);
  const lines: string[] = [];
  if (content.authors.length > 0) {
    lines.push(
      content.authors
        .map((a) => {
          const markers =
            a.markers.length > 0
              ? `\\textsuperscript{${escapeLatex(a.markers.join(','))}}`
              : '';
          return `${escapeLatex(a.name)}${markers}`;
        })
        .join(', '),
    );
  }
  if (content.affiliations.length > 0) {
    const affil = content.affiliations
      .map((x) => `\\textsuperscript{${x.index}}${escapeLatex(x.text)}`)
      .join(' \\,·\\, ');
    lines.push(`{${fontSize(st.size * 0.82, 1.2)}\\textcolor{postrMuted}{${affil}}}`);
  }
  if (content.footnote) {
    lines.push(
      `{${fontSize(st.size * 0.72, 1.2)}\\textcolor{postrMuted}{\\itshape ${escapeLatex(content.footnote)}}}`,
    );
  }
  if (lines.length === 0) return '';
  const body =
    `{${fontSize(st.size, Math.min(1.2, st.lineHeight))}${weightCmds(st)}` +
    `\\textcolor{postrPrimary}{\\centering ${lines.join('\\\\\n')}\\par}}`;
  return textBlockEnv(b, body);
}

function emitHeading(b: Block, ctx: EmitContext): string {
  const st = ctx.doc.styles.heading;
  const hs = ctx.doc.headingStyle;
  const widthIn = num(unitsToInches(b.w));
  const n = ctx.headingNumbers[b.id];
  const numberPrefix = n && n > 0 ? `${n}.~` : '';
  const align = hs.align === 'center' ? '\\centering ' : '';
  let inner =
    `${numberPrefix}${paragraphsToLatex(parseRichText(b.content))}`;
  if (hs.border === 'left') {
    inner = `\\textcolor{postrAccent}{\\rule[-0.25ex]{2.5pt}{1.1em}}\\hspace{0.4em}${inner}`;
  }
  // The underline rule stays INSIDE the paragraph (before \par):
  // after \par we are in vertical mode where \\ is illegal.
  // Explicit width — \linewidth does not track textpos's \hsize.
  if (hs.border === 'bottom' || hs.border === 'thick') {
    const pt = hs.border === 'thick' ? '2.4pt' : '1pt';
    inner = `${inner}\\\\[2pt]{\\color{postrAccent}\\rule{${widthIn}in}{${pt}}}`;
  }
  let body =
    `{${fontSize(st.size, st.lineHeight)}${weightCmds(st)}` +
    `${texColor(st.color, 'postrAccent')}{${align}${inner}\\par}}`;
  if (hs.fill || hs.border === 'box') {
    const boxed = `\\parbox{\\dimexpr ${widthIn}in-2\\fboxsep\\relax}{${body}}`;
    body = hs.fill
      ? `\\colorbox{postrAccent!12}{${boxed}}`
      : `{\\color{postrAccent}\\fbox{${boxed}}}`;
  }
  return textBlockEnv(b, body);
}

function emitText(b: Block, ctx: EmitContext): string {
  const st = ctx.doc.styles.body;
  const body =
    `{${fontSize(st.size, st.lineHeight)}${weightCmds(st)}` +
    `${texColor(st.color, 'postrPrimary')}{${paragraphsToLatex(parseRichText(b.content))}\\par}}`;
  return textBlockEnv(b, body);
}

function captionLatex(b: Block, ctx: EmitContext, label: 'Figure' | 'Table'): string | null {
  const position = b.captionPosition ?? 'top';
  const n = ctx.captionNumbers[b.id];
  if (position === 'none' || n === undefined) return null;
  const st = ctx.doc.styles.body;
  const text = paragraphsToLatex(parseRichText(b.caption ?? ''));
  return (
    `{${fontSize(Math.round(st.size * 0.85), 1.35)}\\textcolor{postrMuted}{\\itshape ` +
    `\\textbf{${label} ${n}.} ${text}\\par}}`
  );
}

function noteLatex(b: Block, ctx: EmitContext): string | null {
  if (!b.note) return null;
  const st = ctx.doc.styles.body;
  return (
    `{${fontSize(Math.round(st.size * 0.85), 1.35)}\\textcolor{postrMuted}{\\itshape ` +
    `${paragraphsToLatex(parseRichText(b.note))}\\par}}`
  );
}

/**
 * Join block sub-parts (caption / graphic / note). Every part ends
 * with \par (vertical mode), so parts are separated with \vspace —
 * a \\ here would be a "no line here to end" compile error.
 */
const joinParts = (parts: Array<string | null>): string =>
  parts.filter((p): p is string => p !== null).join('\n\\vspace{4pt}\n');

function emitImage(b: Block, ctx: EmitContext): string {
  const path = ctx.options.assetPaths?.get(b.id);
  const heightIn = num(unitsToInches(b.h));
  const widthIn = num(unitsToInches(b.w));
  let graphic: string;
  if (path) {
    const fit = b.imageFit ?? 'contain';
    const keep = fit === 'contain' ? ',keepaspectratio' : '';
    if (fit === 'cover') {
      ctx.warnings.push(
        `Figure "${path}" uses cover fit — LaTeX cannot crop to fill, so it is scaled to fit instead.`,
      );
    }
    if (path.toLowerCase().endsWith('.svg')) {
      ctx.warnings.push(
        `"${path}" is an SVG — compile with the svg package (\\usepackage{svg}) or convert it to PNG first.`,
      );
    }
    if (b.crop && (b.crop.top || b.crop.right || b.crop.bottom || b.crop.left)) {
      ctx.warnings.push(
        'An inline image crop is not applied in the LaTeX export — the full image is included.',
      );
    }
    graphic = `\\includegraphics[width=${widthIn}in,height=${heightIn}in${keep}]{${path}}\\par`;
  } else {
    ctx.warnings.push('An image block had no resolvable file — exported as a placeholder box.');
    graphic =
      `\\fbox{\\parbox[c][${heightIn}in][c]{\\dimexpr ${widthIn}in-2\\fboxsep\\relax}` +
      `{\\centering\\textcolor{postrMuted}{missing image}\\par}}\\par`;
  }
  const position = b.captionPosition ?? 'top';
  const caption = captionLatex(b, ctx, 'Figure');
  if (caption !== null && (position === 'left' || position === 'right')) {
    ctx.warnings.push(
      'A side caption (left/right) was exported above its figure — textpos stacks caption and figure vertically.',
    );
  }
  const note = noteLatex(b, ctx);
  const parts =
    position === 'bottom' || position === 'right'
      ? [graphic, caption, note]
      : [caption, graphic, note];
  return textBlockEnv(b, joinParts(parts));
}

function emitTable(b: Block, ctx: EmitContext): string {
  const data = b.tableData;
  if (!data || data.rows === 0 || data.cols === 0) return '';
  const st = ctx.doc.styles.body;
  const preset = TABLE_BORDER_PRESETS[data.borderPreset];
  const cb = data.customBorder;
  const isCustom = data.borderPreset === 'custom' && !!cb;
  const vertical = isCustom ? cb!.innerV.some(Boolean) : (preset?.verticalLines ?? false);
  const outer = isCustom
    ? cb!.topLine && cb!.bottomLine && cb!.leftLine && cb!.rightLine
    : (preset?.outerBorder ?? false);
  const topLine = isCustom ? cb!.topLine : ((preset?.topLine || preset?.outerBorder) ?? false);
  const bottomLine = isCustom
    ? cb!.bottomLine
    : ((preset?.bottomLine || preset?.outerBorder) ?? false);
  const headerLine = isCustom ? cb!.headerLine : (preset?.headerLine ?? false);
  const horizontal = isCustom ? cb!.innerH.some(Boolean) : (preset?.horizontalLines ?? false);
  if (isCustom) {
    ctx.warnings.push(
      'Custom per-line table borders are approximated in LaTeX (all-or-nothing inner rules).',
    );
  }

  const widthIn = unitsToInches(b.w);
  const widths = data.colWidths?.length === data.cols ? data.colWidths : null;
  const sep = vertical ? '|' : '';
  const colSpec =
    (outer || vertical ? '|' : '') +
    Array.from({ length: data.cols }, (_, c) => {
      const pct = widths ? widths[c]! : 100 / data.cols;
      // Subtract ~2×tabcolsep, clamped so a narrow column never
      // produces a negative p{} width.
      return `p{${num(Math.max(0.2, (widthIn * pct) / 100 - 0.12))}in}`;
    }).join(sep) +
    (outer || vertical ? '|' : '');

  const rows: string[] = [];
  if (topLine) rows.push('\\hline');
  for (let r = 0; r < data.rows; r++) {
    const cells = Array.from({ length: data.cols }, (_, c) => {
      const cell = data.cells[r * data.cols + c] ?? '';
      const runs = parseRichText(cell)
        .map((p) => runsToLatex(p.runs))
        .join(' ');
      return r === 0 ? `\\textbf{${runs}}` : runs;
    });
    rows.push(`${cells.join(' & ')} \\\\`);
    if (r === 0 && headerLine) rows.push('\\hline');
    else if (r < data.rows - 1 && horizontal) rows.push('\\hline');
  }
  if (bottomLine) rows.push('\\hline');

  const table =
    `{${fontSize(st.size * 0.9, 1.25)}\\textcolor{postrPrimary}{%\n` +
    `\\setlength{\\tabcolsep}{4pt}\\renewcommand{\\arraystretch}{1.25}%\n` +
    `\\begin{tabular}{${colSpec}}\n${rows.join('\n')}\n\\end{tabular}\\par}}`;

  const caption = captionLatex(b, ctx, 'Table');
  const note = noteLatex(b, ctx);
  const position = b.captionPosition ?? 'top';
  const parts =
    position === 'bottom' || position === 'right'
      ? [table, caption, note]
      : [caption, table, note];
  return textBlockEnv(b, joinParts(parts));
}

function emitReferences(b: Block, ctx: EmitContext): string {
  const st = ctx.doc.styles.body;
  const entries = formatReferencesForExport(ctx.doc.references, ctx.options);
  const items = entries.map((entry) => {
    const inline = splitItalicMarkers(entry)
      .map((seg) => (seg.italic ? `\\emph{${escapeLatex(seg.text)}}` : escapeLatex(seg.text)))
      .join('');
    return `\\hangindent=1.5em\\hangafter=1 ${inline}\\par`;
  });
  const heading = `{\\bfseries${texColor(null, 'postrAccent')}{References}\\par}`;
  const body =
    `{${fontSize(st.size * 0.88, 1.25)}\\textcolor{postrPrimary}{%\n` +
    `{${fontSize(st.size, 1.25)}${heading}}\n\\smallskip\n${items.join('\n')}}}`;
  return textBlockEnv(b, body);
}

// ── document assembly ────────────────────────────────────────────────

function paletteDefs(doc: PosterDoc): string {
  const entries: Array<[string, string | undefined]> = [
    ['postrBg', doc.palette.bg],
    ['postrPrimary', doc.palette.primary],
    ['postrAccent', doc.palette.accent],
    ['postrAccentB', doc.palette.accent2],
    ['postrMuted', doc.palette.muted],
    ['postrHeaderBg', doc.palette.headerBg],
    ['postrHeaderFg', doc.palette.headerFg],
  ];
  return entries
    .map(([name, css]) => `\\definecolor{${name}}{HTML}{${cssColorToHex6(css) ?? '000000'}}`)
    .join('\n');
}

function fontSetup(doc: PosterDoc): string {
  const family = doc.fontFamily;
  const safeFamily = /^[A-Za-z0-9 ]+$/.test(family) ? family : 'Source Sans 3';
  const fallback = PDFLATEX_FALLBACKS[safeFamily];
  const fallbackLines = fallback
    ? [
        '%% ── pdfLaTeX fallback ──────────────────────────────────────',
        '%% On a locked-down TeX install without XeLaTeX, comment the',
        '%% fontspec lines above and uncomment:',
        `%%   \\usepackage[T1]{fontenc}`,
        `%%   \\usepackage${fallback.opts ? `[${fallback.opts}]` : ''}{${fallback.pkg}}` +
          (fallback.exact ? '' : `   % nearest TeX-native match for ${safeFamily}`),
      ]
    : [];
  return [
    '\\usepackage{fontspec}          % XeLaTeX / LuaLaTeX',
    `\\setmainfont{${safeFamily}}`,
    `\\setsansfont{${safeFamily}}`,
    ...fallbackLines,
  ].join('\n');
}

const EMITTERS: Partial<Record<Block['type'], (b: Block, ctx: EmitContext) => string>> = {
  title: emitTitle,
  authors: emitAuthors,
  heading: emitHeading,
  text: emitText,
  image: emitImage,
  logo: emitImage,
  table: emitTable,
  references: emitReferences,
};

/** Build the complete poster.tex source. */
export function buildLatexDocument(
  doc: PosterDoc,
  options: LatexWriterOptions = {},
): LatexDocument {
  const warnings: string[] = [];
  const ctx: EmitContext = {
    doc,
    options,
    captionNumbers: computeCaptionNumbers(doc.blocks),
    headingNumbers: computeHeadingNumbers(doc.blocks),
    warnings,
  };

  const blocks = doc.blocks
    .map((b) => {
      const emit = EMITTERS[b.type];
      if (!emit) return '';
      return emit(b, ctx);
    })
    .filter((s) => s.length > 0);

  const title = extractPosterTitle(doc) || 'Poster';
  // Footer colophon — an absolute textpos block pinned near the page
  // bottom. Emitted AFTER the poster's own blocks and positioned in
  // page space, so it cannot displace a single block coordinate.
  const attributionBlock = attributionLatexBlock(doc.heightIn, options.attribution);
  const tex = `%% ${escapeLatex(title)}
${attributionLatexComment()}
%% Generated by Postr (https://postr.sh) — editable LaTeX export.
%% Compile:  xelatex poster.tex   (or: lualatex poster.tex)
%%
%% Geometry: 1 textpos module = 0.1 in = 1 Postr unit, so every
%% \\begin{textblock}{W}(X,Y) below carries the poster's own
%% coordinates verbatim. Nudge a block by editing its numbers.
${options.hasBib ? '%% References also ship as references.bib for \\bibliography use.\n' : ''}\\documentclass{article}
\\usepackage[paperwidth=${num(doc.widthIn)}in,paperheight=${num(doc.heightIn)}in,margin=0in]{geometry}
\\usepackage[absolute,overlay]{textpos}
\\setlength{\\TPHorizModule}{0.1in}   % 1 Postr unit
\\setlength{\\TPVertModule}{0.1in}
\\usepackage{graphicx}
\\usepackage{xcolor}
\\usepackage[normalem]{ulem}
${fontSetup(doc)}

${paletteDefs(doc)}

\\pagestyle{empty}
\\setlength{\\parindent}{0pt}

\\begin{document}
\\pagecolor{postrBg}
\\color{postrPrimary}

${blocks.join('\n\n')}
${attributionBlock ? `\n${attributionBlock}\n` : ''}
\\end{document}
`;

  return { tex, warnings };
}
