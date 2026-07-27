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
import { referencesToBib } from './bib';
import { buildLatexDocument } from './writer';
import type { AttributionOptions } from '../attribution';

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

function buildReadme(doc: PosterDoc, hasBib: boolean, hasFigures: boolean): string {
  const title = extractPosterTitle(doc) || 'Poster';
  return [
    `${title} — LaTeX export from Postr (https://postr.sh)`,
    '',
    'Compile:',
    '  xelatex poster.tex',
    '',
    '(LuaLaTeX also works: lualatex poster.tex. The document uses',
    'fontspec, so plain pdflatex needs the commented fallback block',
    'near the top of poster.tex.)',
    '',
    `Fonts: the poster uses "${doc.fontFamily}". Install it from`,
    'Google Fonts if your system lacks it:',
    `  https://fonts.google.com/specimen/${encodeURIComponent(doc.fontFamily.replace(/ /g, '+'))}`,
    '',
    ...(hasFigures
      ? ['figures/ holds every image at the resolution stored in Postr.', '']
      : []),
    ...(hasBib
      ? [
          'references.bib mirrors the poster reference list for',
          '\\bibliography workflows; the .tex renders the same list as',
          'literal text so the compiled poster matches the original.',
          '',
        ]
      : []),
    'Every \\begin{textblock}{W}(X,Y) uses poster coordinates where',
    'one module = 0.1 inch — edit the numbers to nudge a block.',
    '',
  ].join('\n');
}

/**
 * Export a poster as an editable LaTeX bundle. Pure `PosterDoc →
 * bytes` — safe to call on documents never opened in the editor.
 */
export async function exportPosterLatex(
  doc: PosterDoc,
  options: LatexExportOptions = {},
): Promise<LatexExportResult> {
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

  const { tex, warnings } = buildLatexDocument(doc, {
    ...options,
    assetPaths,
    hasBib: doc.references.length > 0,
  });

  files['poster.tex'] = textToBytes(tex);
  const bib = referencesToBib(doc.references);
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
