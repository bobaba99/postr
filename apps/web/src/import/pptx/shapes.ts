/**
 * Slide shape reader — walks `<p:spTree>` and turns each child into a
 * neutral `ParsedShape`. Geometry is converted from EMU to poster
 * units here via `emuToUnits`, the exact inverse of the exporter's
 * `unitsToEmu`, so a round-tripped file lands on its original numbers.
 *
 * This module knows OOXML, not Postr blocks. Mapping a shape onto a
 * `Block` is `toBlocks.ts`'s job.
 */
import { emuToUnits } from '@/export/units';
import {
  NS_A,
  NS_P,
  NS_R,
  allEls,
  firstEl,
  intAttr,
} from './ooxml';

/** Geometry in poster units (1 unit = 1/10 inch). */
export interface ShapeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ParsedRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

export interface ParsedParagraph {
  runs: ParsedRun[];
}

export interface ParsedTable {
  rows: number;
  cols: number;
  /** Row-major, `cells[row * cols + col]`, matching `TableData`. */
  cells: string[];
  /** Column widths as percentages, or null when unavailable. */
  colWidths: number[] | null;
}

export type ParsedShape =
  | {
      kind: 'text';
      rect: ShapeRect;
      paragraphs: ParsedParagraph[];
      sizePt: number | null;
      /** True when the shape carried no `<a:xfrm>` and `rect` is the
       *  fallback placement rather than the file's own geometry. */
      placedByFallback?: boolean;
    }
  | { kind: 'picture'; rect: ShapeRect; embedId: string | null; name: string }
  | { kind: 'table'; rect: ShapeRect; table: ParsedTable }
  | { kind: 'unsupported'; rect: ShapeRect | null; label: string };

/**
 * Placement for a text shape whose geometry we cannot read.
 *
 * PowerPoint placeholders inherit their `<a:xfrm>` from the slide
 * layout/master and routinely omit `spPr` entirely, so decks authored
 * in PowerPoint — as opposed to round-tripped through Postr's own
 * exporter, which always writes an explicit xfrm — would otherwise lose
 * their body text with nothing said. A nominal box at the origin keeps
 * the words; the accompanying warning tells the user to reposition it.
 *
 * Units are poster units (1 unit = 1/10 inch): a 20×4 inch box.
 */
const FALLBACK_TEXT_RECT: ShapeRect = { x: 0, y: 0, w: 200, h: 40 };

/** Read `<a:off>`/`<a:ext>` out of an already-located `xfrm`. */
function rectFromXfrm(xfrm: Element | null): ShapeRect | null {
  if (!xfrm) return null;
  const off = firstEl(xfrm, NS_A, 'off');
  const ext = firstEl(xfrm, NS_A, 'ext');
  if (!off || !ext) return null;
  return {
    x: emuToUnits(intAttr(off, 'x')),
    y: emuToUnits(intAttr(off, 'y')),
    w: emuToUnits(intAttr(ext, 'cx')),
    h: emuToUnits(intAttr(ext, 'cy')),
  };
}

/** `<a:off>`/`<a:ext>` → poster units, for a shape's own `spPr`. */
function readRect(scope: Element | null): ShapeRect | null {
  if (!scope) return null;
  return rectFromXfrm(firstEl(scope, NS_A, 'xfrm'));
}

/**
 * A `graphicFrame` carries its transform as a DIRECT `<p:xfrm>` child,
 * not the `<a:xfrm>` every other shape uses. Scan direct children only:
 * a descendant search would first hit the `<a:xfrm>` buried inside the
 * frame's graphic data (a nested table/diagram transform) and place the
 * table at the wrong coordinates.
 */
function readFrameRect(frame: Element): ShapeRect | null {
  for (const node of Array.from(frame.childNodes)) {
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    if (el.localName === 'xfrm' && (el.namespaceURI === NS_P || el.namespaceURI === NS_A)) {
      return rectFromXfrm(el);
    }
  }
  return null;
}

/**
 * Read `<p:txBody>` into paragraphs.
 *
 * Each `<a:p>` is one paragraph — that is exactly how the exporter's
 * `breakLine` lands on disk, so paragraph structure round-trips. Runs
 * are collected as `<a:r>` descendants; `<a:br>` inside a paragraph
 * is a soft line break and is flattened into a newline run.
 */
function readParagraphs(txBody: Element): ParsedParagraph[] {
  const paragraphs: ParsedParagraph[] = [];
  for (const p of allEls(txBody, NS_A, 'p')) {
    const runs: ParsedRun[] = [];
    // Walk children in document order so <a:br> lands between runs.
    for (const node of Array.from(p.childNodes)) {
      if (node.nodeType !== 1) continue;
      const el = node as Element;
      if (el.namespaceURI !== NS_A) continue;
      if (el.localName === 'r') {
        const textEl = firstEl(el, NS_A, 't');
        const text = textEl?.textContent ?? '';
        if (!text) continue;
        const rPr = firstEl(el, NS_A, 'rPr');
        runs.push({
          text,
          bold: rPr?.getAttribute('b') === '1',
          italic: rPr?.getAttribute('i') === '1',
        });
      } else if (el.localName === 'br') {
        runs.push({ text: '\n', bold: false, italic: false });
      }
    }
    paragraphs.push({ runs });
  }
  return paragraphs;
}

/** Largest run size in the shape, in points (OOXML stores hundredths).
 *  Used to tell a title/heading from body text. */
function readMaxSizePt(txBody: Element): number | null {
  let max = 0;
  for (const rPr of allEls(txBody, NS_A, 'rPr')) {
    const sz = intAttr(rPr, 'sz', 0);
    if (sz > max) max = sz;
  }
  return max > 0 ? max / 100 : null;
}

/** Concatenated plain text of a table cell, paragraphs joined by \n. */
function cellText(tc: Element): string {
  const txBody = firstEl(tc, NS_A, 'txBody');
  if (!txBody) return '';
  return readParagraphs(txBody)
    .map((p) => p.runs.map((r) => r.text).join(''))
    .join('\n')
    .trim();
}

function readTable(tbl: Element): ParsedTable | null {
  // Only direct row children — a nested table would otherwise inflate
  // the row count and desynchronize the row-major cell array.
  const trs = Array.from(tbl.childNodes).filter(
    (n): n is Element =>
      n.nodeType === 1 &&
      (n as Element).namespaceURI === NS_A &&
      (n as Element).localName === 'tr',
  );
  if (trs.length === 0) return null;

  const grid = firstEl(tbl, NS_A, 'tblGrid');
  const gridCols = grid ? allEls(grid, NS_A, 'gridCol') : [];
  const rowCells = trs.map((tr) =>
    Array.from(tr.childNodes).filter(
      (n): n is Element =>
        n.nodeType === 1 &&
        (n as Element).namespaceURI === NS_A &&
        (n as Element).localName === 'tc',
    ),
  );
  const cols = Math.max(
    gridCols.length,
    ...rowCells.map((cells) => cells.length),
  );
  if (cols === 0) return null;

  // Fill row-major, padding short rows so the flat array always has
  // exactly rows × cols entries (TableData's invariant).
  const cells: string[] = [];
  for (const rowCell of rowCells) {
    for (let c = 0; c < cols; c++) {
      const tc = rowCell[c];
      cells.push(tc ? cellText(tc) : '');
    }
  }

  const widths = gridCols.map((gc) => intAttr(gc, 'w', 0));
  const totalWidth = widths.reduce((sum, w) => sum + w, 0);
  const colWidths =
    widths.length === cols && totalWidth > 0
      ? widths.map((w) => Math.round((w / totalWidth) * 1000) / 10)
      : null;

  return { rows: rowCells.length, cols, cells, colWidths };
}

/** Human-readable label for a shape we cannot represent. */
function unsupportedLabel(el: Element): string {
  const graphicData = firstEl(el, NS_A, 'graphicData');
  const uri = graphicData?.getAttribute('uri') ?? '';
  if (uri.includes('/chart')) return 'a chart';
  if (uri.includes('smartArt') || uri.includes('diagram')) return 'a SmartArt diagram';
  if (uri.includes('/ole') || uri.includes('oleObject')) return 'an embedded object';
  if (el.localName === 'grpSp') return 'a grouped shape';
  return 'an unsupported shape';
}

/**
 * Parse every top-level child of the slide's shape tree.
 *
 * Only direct children are walked: shapes nested inside a group are
 * reported through the group's single "unsupported" entry rather than
 * being silently hoisted to slide coordinates (their geometry is
 * relative to the group's child offset, so hoisting misplaces them).
 */
export function parseShapeTree(spTree: Element): ParsedShape[] {
  const shapes: ParsedShape[] = [];

  for (const node of Array.from(spTree.childNodes)) {
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    const local = el.localName;

    if (el.namespaceURI === NS_P && local === 'sp') {
      const rect = readRect(firstEl(el, NS_P, 'spPr'));
      const txBody = firstEl(el, NS_P, 'txBody');
      if (!txBody) {
        // A drawn shape with no text (the exporter's heading rules and
        // divider lines). Decorative — dropping it loses no content, so
        // it is not worth a warning.
        continue;
      }
      // Text is content: never drop it for missing geometry. Fall back
      // to a nominal box and let toBlocks warn that it needs moving.
      shapes.push({
        kind: 'text',
        rect: rect ?? FALLBACK_TEXT_RECT,
        paragraphs: readParagraphs(txBody),
        sizePt: readMaxSizePt(txBody),
        ...(rect ? {} : { placedByFallback: true }),
      });
      continue;
    }

    if (el.namespaceURI === NS_P && local === 'pic') {
      const rect = readRect(firstEl(el, NS_P, 'spPr'));
      if (!rect) continue;
      const blip = firstEl(el, NS_A, 'blip');
      const cNvPr = firstEl(el, NS_P, 'cNvPr');
      shapes.push({
        kind: 'picture',
        rect,
        embedId: blip?.getAttributeNS(NS_R, 'embed') ?? null,
        name: cNvPr?.getAttribute('name') ?? 'image',
      });
      continue;
    }

    if (el.namespaceURI === NS_P && local === 'graphicFrame') {
      const rect = readFrameRect(el);
      const tbl = firstEl(el, NS_A, 'tbl');
      if (tbl && rect) {
        const table = readTable(tbl);
        if (table) {
          shapes.push({ kind: 'table', rect, table });
          continue;
        }
      }
      shapes.push({ kind: 'unsupported', rect, label: unsupportedLabel(el) });
      continue;
    }

    if (el.namespaceURI === NS_P && (local === 'grpSp' || local === 'AlternateContent')) {
      shapes.push({
        kind: 'unsupported',
        rect: readRect(firstEl(el, NS_P, 'grpSpPr')),
        label: unsupportedLabel(el),
      });
      continue;
    }
  }

  return shapes;
}
