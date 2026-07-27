/**
 * `ParsedShape` → Postr `Block` mapping.
 *
 * Text shapes become title / heading / text blocks based on their run
 * size relative to the rest of the slide; pictures and tables map
 * one-to-one. Everything here is pure so it unit-tests without a zip.
 */
import { nanoid } from 'nanoid';
import type { Block, TableData } from '@postr/shared';
import { escapeHtml } from './text';
import type { ParsedParagraph, ParsedShape, ShapeRect } from './shapes';

/** Runs → sanitized inline HTML, preserving bold/italic and
 *  paragraph breaks the way `parseRichText` expects to read them. */
export function paragraphsToHtml(paragraphs: ParsedParagraph[]): string {
  return paragraphs
    .map((p) =>
      p.runs
        .map((run) => {
          // Escape first: run text is attacker-controlled file content
          // and lands in a field the renderer injects as HTML.
          let html = escapeHtml(run.text).replace(/\n/g, '<br>');
          if (run.bold) html = `<b>${html}</b>`;
          if (run.italic) html = `<i>${html}</i>`;
          return html;
        })
        .join(''),
    )
    // Blank trailing paragraphs are an artifact of empty <a:p> nodes;
    // dropping them keeps a round-tripped block byte-comparable.
    .filter((line, idx, all) => line !== '' || idx < all.length - 1)
    .join('<br>');
}

/** Plain text of a shape — used for title detection and previews. */
export function paragraphsToPlainText(paragraphs: ParsedParagraph[]): string {
  return paragraphs
    .map((p) => p.runs.map((r) => r.text).join(''))
    .join('\n')
    .trim();
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Geometry is preserved exactly; only float noise is trimmed. A
 *  round-tripped export lands on integers here, not near-misses. */
function geometry(rect: ShapeRect, scale: number): Pick<Block, 'x' | 'y' | 'w' | 'h'> {
  return {
    x: Math.max(0, round1(rect.x * scale)),
    y: Math.max(0, round1(rect.y * scale)),
    w: Math.max(1, round1(rect.w * scale)),
    h: Math.max(1, round1(rect.h * scale)),
  };
}

const emptyBlock = (
  type: Block['type'],
  rect: ShapeRect,
  scale: number,
): Block => ({
  id: nanoid(8),
  type,
  ...geometry(rect, scale),
  content: '',
  imageSrc: null,
  imageFit: 'contain',
  tableData: null,
});

/**
 * Shown whenever a picture cannot be resolved to bytes, for ANY reason:
 * a `<a:blip>` with no `r:embed` (handled here) and an `r:embed` whose
 * relationship or media part is missing (handled in `parsePptx`). Both
 * leave the user with the same blank frame, so both say the same thing.
 */
export const UNREADABLE_IMAGE_WARNING =
  'An image on the slide could not be read and was left as an empty frame.';

export interface MappedBlocks {
  blocks: Block[];
  /** Index into `blocks` → the picture's relationship id, so the
   *  caller can upload media bytes and set `imageSrc`. */
  pictureEmbeds: Map<string, string>;
  title: string;
  warnings: string[];
}

/**
 * Classify text shapes by size. The largest text on the slide is the
 * title; anything at least 1.25× the median is a heading. This is a
 * heuristic on purpose — PowerPoint carries no notion of "this is a
 * poster heading", and the exporter's own size ladder (title > heading
 * > body) is what makes it reliable for round-tripped files.
 */
function classifyText(sizePt: number | null, sizes: number[]): Block['type'] {
  if (sizePt === null || sizes.length === 0) return 'text';
  const max = Math.max(...sizes);
  if (sizePt === max && sizes.filter((s) => s === max).length === 1) {
    return 'title';
  }
  const sorted = [...sizes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? sizePt;
  return sizePt >= median * 1.25 ? 'heading' : 'text';
}

/**
 * Map parsed shapes onto blocks.
 *
 * `scale` undoes the exporter's half-scaling (2 for a halved deck,
 * 1 otherwise) so a poster wider than PowerPoint's 56-inch ceiling
 * comes back at its ORIGINAL size rather than half of it.
 */
export function shapesToBlocks(
  shapes: readonly ParsedShape[],
  scale: number,
): MappedBlocks {
  const warnings: string[] = [];
  const blocks: Block[] = [];
  const pictureEmbeds = new Map<string, string>();

  const sizes = shapes
    .filter((s): s is Extract<ParsedShape, { kind: 'text' }> => s.kind === 'text')
    .map((s) => s.sizePt)
    .filter((s): s is number => s !== null);

  let title = '';

  for (const shape of shapes) {
    if (shape.kind === 'unsupported') {
      warnings.push(
        `${capitalize(shape.label)} could not be imported — PowerPoint stores it in a format Postr can't edit. Re-add it from the Insert tab.`,
      );
      continue;
    }

    if (shape.kind === 'text') {
      const content = paragraphsToHtml(shape.paragraphs);
      const plain = paragraphsToPlainText(shape.paragraphs);
      if (!plain) continue; // empty text box — nothing to carry over
      const type = classifyText(shape.sizePt, sizes);
      if (type === 'title' && !title) title = plain;
      if (shape.placedByFallback) {
        warnings.push(
          `PowerPoint stored the position of “${preview(plain)}” in the slide layout, ` +
            'so it was placed at the top-left corner. Drag it where you want it.',
        );
      }
      blocks.push({ ...emptyBlock(type, shape.rect, scale), content });
      continue;
    }

    if (shape.kind === 'picture') {
      const block = emptyBlock('image', shape.rect, scale);
      blocks.push(block);
      // A blip with no r:embed points at nothing, so `parsePptx` never
      // sees this picture and cannot warn for it. Warn here instead, so
      // an empty frame is never left unexplained.
      if (shape.embedId) pictureEmbeds.set(block.id, shape.embedId);
      else warnings.push(UNREADABLE_IMAGE_WARNING);
      continue;
    }

    // table
    const tableData: TableData = {
      rows: shape.table.rows,
      cols: shape.table.cols,
      cells: shape.table.cells.map((cell) => escapeHtml(cell)),
      colWidths: shape.table.colWidths,
      borderPreset: 'apa',
    };
    blocks.push({ ...emptyBlock('table', shape.rect, scale), tableData });
  }

  return { blocks, pictureEmbeds, title, warnings };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** First line of a block's text, short enough to sit inside a warning
 *  and name the affected content without quoting a whole paragraph. */
function preview(plain: string): string {
  const firstLine = plain.split('\n')[0]?.trim() ?? '';
  return firstLine.length > 40 ? `${firstLine.slice(0, 40).trimEnd()}…` : firstLine;
}
