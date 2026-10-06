/**
 * LaTeX export bundle assembly — `PosterDoc` → `.zip` bytes.
 *
 * Deliverable per plan §4: a zip of `poster.tex`, `figures/`,
 * `references.bib`, and a `README.txt` with the one-line compile
 * command. A bare .tex with broken image paths is not an export.
 *
 * This module is the UI's dynamic-import boundary — fflate and the
 * writer stay out of any page that never exports.
 */
import { zipSync } from 'fflate';
import type { PosterDoc } from '@postr/shared';
import { resolvePosterAssets, type AssetFetcher } from '../resolveAssets';
import {
  computeCaptionNumbers,
  extractPosterTitle,
  type ExportContentOptions,
} from '../posterContent';
import { FONTS } from '@/poster/constants';
import { referencesToBib } from './bib';
import { buildLatexDocument, hasPdflatexFallback } from './writer';
import type { AttributionOptions } from '../attribution';
import { stripAckBlock } from '../stripAckBlock';

export interface LatexExportOptions extends ExportContentOptions {
  /** Injectable for tests / server pipelines. */
  fetcher?: AssetFetcher;
  /** Paid-plan seam — see export/attribution.ts. */
  attribution?: AttributionOptions;
}

export interface LatexExportResult {
  /** The zip archive, ready to download as `<name>-latex.zip`. */
  bytes: Uint8Array;
  /** Product-toned notes to surface in the export UI. */
  warnings: string[];
}

/**
 * Encode text, re-wrapping into the CURRENT realm's Uint8Array.
 * Some sandboxes (vitest's jsdom vm) hand back TextEncoder output
 * from another realm, which fails fflate's `instanceof Uint8Array`
 * check and silently turns a file entry into a directory tree.
 */
function textToBytes(s: string): Uint8Array {
  return new Uint8Array(new TextEncoder().encode(s));
}

/**
 * Curated families that Google Fonts does not carry. Charter's specimen
 * page and its CSS2 request both answer "Font family not found" (content
 * audit, 2026-09-30), so a Charter poster gets no Google Fonts link.
 */
const NOT_ON_GOOGLE_FONTS: ReadonlySet<string> = new Set(['Charter']);

/**
 * True when the README can send the user to a Google Fonts specimen
 * page: a curated family other than the ones Google Fonts lacks. A
 * family outside the curated ten is unknown, so it gets no link.
 */
function hasGoogleFontsPage(family: string): boolean {
  return Object.prototype.hasOwnProperty.call(FONTS, family) && !NOT_ON_GOOGLE_FONTS.has(family);
}

function fontLines(family: string): string[] {
  if (!hasGoogleFontsPage(family)) {
    return [`Fonts: the poster uses "${family}". Install it if`, 'your system lacks it.'];
  }
  return [
    `Fonts: the poster uses "${family}". Install it from`,
    'Google Fonts if your system lacks it:',
    `  https://fonts.google.com/specimen/${encodeURIComponent(family.replace(/ /g, '+'))}`,
  ];
}

function buildReadme(doc: PosterDoc, hasBib: boolean, hasFigures: boolean): string {
  const title = extractPosterTitle(doc) || 'Poster';
  const printsReferenceList = doc.blocks.some((b) => b.type === 'references');
  return [
    `${title} — LaTeX export from Postr (https://postr.sh)`,
    '',
    'Compile:',
    '  xelatex poster.tex',
    '',
    'poster.tex loads fontspec, so it needs XeLaTeX or LuaLaTeX',
    ...(hasPdflatexFallback(doc.fontFamily)
      ? [
          '(lualatex poster.tex). For pdflatex, follow the commented',
          'pdfLaTeX fallback block near the top of poster.tex.',
        ]
      : ['(lualatex poster.tex).']),
    '',
    ...fontLines(doc.fontFamily),
    '',
    ...(hasFigures
      ? ["figures/ holds the poster's image files, copied unchanged", 'from Postr.', '']
      : []),
    ...(hasBib
      ? [
          "references.bib holds the poster's references as BibTeX",
          'entries for \\bibliography workflows. poster.tex does not read it.',
          ...(printsReferenceList ? ['It prints the reference list as literal text.'] : []),
          '',
        ]
      : []),
    'Every \\begin{textblock}{W}(X,Y) uses poster coordinates where',
    'one module = 0.1 inch. Edit the numbers to nudge a block.',
    '',
  ].join('\n');
}

/**
 * Export a poster as an editable LaTeX bundle. Pure `PosterDoc →
 * bytes` — safe to call on documents never opened in the editor.
 */
export async function exportPosterLatex(
  input: PosterDoc,
  options: LatexExportOptions = {},
): Promise<LatexExportResult> {
  // Paid seam, applied BEFORE assets resolve so the seeded acknowledgement
  // mark is neither zipped as `figures/logo-N` nor `\includegraphics`'d.
  // The writer applies the same step, so a direct `buildLatexDocument`
  // caller gets the same answer.
  const doc = stripAckBlock(input, options.attribution);
  const { assets } = await resolvePosterAssets(doc, options.fetcher);
  const captionNumbers = computeCaptionNumbers(doc.blocks);

  const files: Record<string, Uint8Array> = {};
  const assetPaths = new Map<string, string>();
  let logoCount = 0;
  let extraCount = 0;
  for (const block of doc.blocks) {
    const asset = assets.get(block.id);
    if (!asset) continue;
    const figureNumber = captionNumbers[block.id];
    const name =
      block.type === 'logo'
        ? `logo-${++logoCount}`
        : figureNumber !== undefined
          ? `figure-${figureNumber}`
          : `image-${++extraCount}`;
    const path = `figures/${name}.${asset.ext}`;
    assetPaths.set(block.id, path);
    files[path] = asset.bytes;
  }

  // The bib now always carries at least the Postr `@misc` entry when
  // attribution is active, so `hasBib` is derived from the rendered
  // bib rather than from the user's reference count.
  const bib = referencesToBib(doc.references, options.attribution);

  const { tex, warnings } = buildLatexDocument(doc, {
    ...options,
    assetPaths,
    hasBib: bib.length > 0,
  });

  files['poster.tex'] = textToBytes(tex);
  if (bib) files['references.bib'] = textToBytes(bib);
  files['README.txt'] = textToBytes(
    buildReadme(doc, bib.length > 0, assetPaths.size > 0),
  );

  // The writer pushes one placeholder warning per unresolved block —
  // dedupe so five broken images read as one line in the export UI.
  const allWarnings = [...new Set(warnings)];

  const zipped = zipSync(files, { level: 6 });
  // Fresh copy so downstream Blob construction never sees a shared buffer.
  const bytes = new Uint8Array(zipped.byteLength);
  bytes.set(zipped);
  return { bytes, warnings: allWarnings };
}
