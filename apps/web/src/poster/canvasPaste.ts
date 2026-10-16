/**
 * A paste or a drop on the canvas (record 34, docs/fixes/34-paste-drop.md;
 * bounded-designs.md §3.3 table A row 3, table B, "Drop", "Image checks").
 * The rules, pure; the listeners are useCanvasPaste.ts.
 *
 * **Table B: ⌘V / Ctrl+V with nothing in edit mode** (no caret in a block,
 * a field or a cell; a block may be selected). The clipboard is read in
 * this order and the first match wins:
 *
 * | Order | The clipboard holds | Then |
 * |---|---|---|
 * | 1 | Postr's own copied blocks | not built: the next fix (block copy and paste) adds its check first in `readCanvasPaste` |
 * | 2 | HTML with a `<table>` (Excel, Word, Sheets) | a new table block, filled by record 32's grid reader (tablePaste.ts) |
 * | 3 | an image file, and no text | a new image block; if an EMPTY image block is selected, that one is filled instead |
 * | 4 | any other text, tabs included | a new text block holding it, cleaned as record 32's text paste (pasteClean.ts) |
 * | 5 | anything else | nothing |
 *
 * Order 2 comes before 3: Excel also puts a picture of the cells on the
 * clipboard. Text with tabs is not a table (tab-indented prose would become
 * one). HTML whose table has text around it is order 4's: record 32's
 * reader reads such a paste from its plain text. "Text" is what record 32's
 * text paste would insert (`pastedWords`): the clipboard's HTML cleaned when
 * it has HTML, else its plain text. So an HTML `<img>` alone, or a style
 * sheet, is not text; nor is a browser's "Copy image" that carries an
 * `<img>` fragment AND the image's address as plain text (the HTML wins, as
 * in a text block): that paste is the image (record 34 review, R34-2). The
 * address alone is text (order 4).
 *
 * **Table A row 3**: the caret in a text (a text block, a heading, the
 * title), an image file and no text on the clipboard: a new image block
 * next to that block (`nextTo`); the text is left as it is.
 *
 * **Drop**: image files dropped on the canvas make one image block each,
 * the first centred on the drop point, each next one 1 in down and right of
 * the last. One image dropped on an image block replaces its image. A file
 * that is not an image, or over 10 MB, is skipped with the upload's message.
 *
 * **Where a new block goes** (one rule each): a paste with nothing in edit
 * mode centres it in the part of the sheet the canvas shows; a drop centres
 * it on the drop point; both snapped to the ½ in grid and kept on the sheet.
 * Its size is Insert's for its type; an image block's is Insert › Image's
 * box with the image's shape (imageFile.ts).
 *
 * Out of scope (record 34 §10): Postr's own block copy, cut and paste and
 * its clipboard payload (order 1, the next fix), the image file a ⌘D clone
 * shares (§3.3 D, the next fix), images in a table cell, dragging text or
 * blocks between posters, SVG markup pasted as text.
 */
import type { Block, TableData } from '@postr/shared';
import { SNAP_GRID } from './constants';
import { pastedHtml } from './pasteClean';
import { sanitizeTyped } from './sanitizeHtml';
import { htmlTableGrid, pasteGrid } from './tablePaste';

/** What a paste with nothing in edit mode makes (table B); null for order 5. */
export type CanvasPaste =
  | { kind: 'table'; rows: string[][] }
  | { kind: 'image'; file: File }
  | { kind: 'text'; html: string };

/** The parts of a DataTransfer the rules read (a paste's clipboardData, a drop's dataTransfer). */
export interface TransferLike {
  getData(type: string): string;
  readonly items?: ArrayLike<{ kind: string; type: string; getAsFile(): File | null }> | null;
  readonly files?: ArrayLike<File> | null;
}

/** Every file the transfer carries, each once (an engine lists a file in `items`, in `files`, or in both). */
export function filesOf(data: TransferLike): File[] {
  const out: File[] = [];
  for (const it of Array.from(data.items ?? [])) {
    if (it.kind !== 'file') continue;
    const f = it.getAsFile();
    if (f) out.push(f);
  }
  if (!out.length) out.push(...Array.from(data.files ?? []));
  return out;
}

/** Whether a file is an image by its type (the upload's own check, imageFile.ts). */
export const isImageFile = (f: File) => f.type.startsWith('image/');

/**
 * The text a paste of this clipboard would insert into a text block (record
 * 32's text paste: the clipboard's HTML cleaned, or else its plain text),
 * kept as the poster stores it; '' when it would insert no words a user
 * would see. Table B's order 4 stores it; it is what "text" means in table
 * B's order 3 and in table A row 3, so the two can never disagree (record
 * 34 review, R34-2: an image with an `<img>` fragment and its address as
 * plain text was "text" to one and empty to the other, and pasted nothing).
 */
export function pastedWords(html: string, text: string): string {
  if (!html && !text.trim()) return '';
  const clean = sanitizeTyped(pastedHtml(html, text, true), true);
  return (new DOMParser().parseFromString(clean, 'text/html').body.textContent ?? '').trim() ? clean : '';
}

/** Table B: what a paste with nothing in edit mode makes, by the first match; null for order 5. */
export function readCanvasPaste(data: TransferLike): CanvasPaste | null {
  const html = data.getData('text/html') ?? '';
  const text = data.getData('text/plain') ?? '';
  // Order 1, Postr's own copied blocks, is the next fix's (block copy and
  // paste): its check goes here, before order 2.
  const rows = html ? htmlTableGrid(html, text) : null;
  if (rows) return { kind: 'table', rows };
  const words = pastedWords(html, text);
  const image = filesOf(data).find(isImageFile);
  if (image && !words) return { kind: 'image', file: image };
  if (words) return { kind: 'text', html: words };
  return null;
}

/** The image file of a paste into text that table A row 3 takes (an image and no text: `pastedWords`); null otherwise. */
export function imageOnlyPaste(data: TransferLike): File | null {
  if (pastedWords(data.getData('text/html') ?? '', data.getData('text/plain') ?? '')) return null;
  return filesOf(data).find(isImageFile) ?? null;
}

/** Whether the element is in edit mode: a field, a menu, or editable text (a paste there is the field's own). */
export function isEditing(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable === true;
}

/**
 * Whether a table shows cells selected by dragging (TableBlock marks its
 * table `data-postr-cell-range`): edit mode too, as a caret in a cell is.
 * Record 32 left such a range out of its paste targets, and a browser may
 * leave the focus on the page after the drag (Chromium does), where table B
 * made a stray new block beside the table (record 34 review, R34-3).
 */
export function cellRangeShown(root: ParentNode = document): boolean {
  return root.querySelector('#poster-canvas [data-postr-cell-range]') !== null;
}

// ----------------------------------------------------------------- sizes

/** Insert's default size for each kind of block, in units (1/10 in); Insert (PosterEditor addBlock) uses it too. */
export function insertSize(type: Block['type']): { w: number; h: number } {
  return {
    w: type === 'logo' ? 50 : 155,
    h: type === 'logo' ? 40 : type === 'heading' ? 22 : type === 'references' ? 120 : 140,
  };
}

/** A new table block's data from pasted rows: record 32's grid poured into an empty table, with Insert › Table's borders. */
export function tableFromRows(rows: string[][]): TableData {
  return pasteGrid({ rows: 0, cols: 0, cells: [], colWidths: null, borderPreset: 'apa' }, 0, 0, rows);
}

// ------------------------------------------------------------- placement

export interface Box { x: number; y: number; w: number; h: number }
export interface Size { w: number; h: number }

/** A top-left snapped to the ½ in grid, then kept on the sheet (at 0 when the block is larger than the sheet). */
export function snapOnto(x: number, y: number, size: Size, sheet: Size): { x: number; y: number } {
  const snap = (v: number) => Math.round(v / SNAP_GRID) * SNAP_GRID;
  const keep = (v: number, len: number, room: number) => Math.max(0, Math.min(room - len, v));
  return { x: keep(snap(x), size.w, sheet.w), y: keep(snap(y), size.h, sheet.h) };
}

/** Centred on a point (a drop), snapped and kept on the sheet. */
export function centredAt(pt: { x: number; y: number }, size: Size, sheet: Size): { x: number; y: number } {
  return snapOnto(pt.x - size.w / 2, pt.y - size.h / 2, size, sheet);
}

/** Centred in the part of the sheet in view (`view`, units; the whole sheet when none of it shows), snapped and kept on it. */
export function centredIn(view: Box | null, size: Size, sheet: Size): { x: number; y: number } {
  const v = view && view.w > 0 && view.h > 0 ? view : { x: 0, y: 0, w: sheet.w, h: sheet.h };
  return centredAt({ x: v.x + v.w / 2, y: v.y + v.h / 2 }, size, sheet);
}

/** The gap between a text and the image pasted next to it: one grid step (½ in). */
export const NEXT_TO_GAP = SNAP_GRID;

/**
 * Next to a text as the canvas draws it (`text`: its left and width as
 * stored, its top and height as drawn — a text block grows with its text,
 * so its stored height is not what shows): to its right, top aligned, when
 * the new block fits on the sheet there; else below it, left aligned, kept
 * on the sheet.
 */
export function nextTo(text: Box, size: Size, sheet: Size): { x: number; y: number } {
  const right = { x: text.x + text.w + NEXT_TO_GAP, y: text.y };
  if (right.x + size.w <= sheet.w && right.y + size.h <= sheet.h) return right;
  const below = { x: text.x, y: text.y + text.h + NEXT_TO_GAP };
  return {
    x: Math.max(0, Math.min(sheet.w - size.w, below.x)),
    y: Math.max(0, Math.min(sheet.h - size.h, below.y)),
  };
}

/** The places of `n` dropped blocks: the first centred on the point, each next 1 in (10 units) down and right of the last, each kept on the sheet. */
export function dropPositions(pt: { x: number; y: number }, sizes: Size[], sheet: Size): Array<{ x: number; y: number }> {
  if (!sizes.length) return [];
  const first = centredAt(pt, sizes[0]!, sheet);
  return sizes.map((size, i) => (i === 0 ? first : snapOnto(first.x + 10 * i, first.y + 10 * i, size, sheet)));
}
