/**
 * A paste into a table cell (fix 32, docs/fixes/32-table-paste.md;
 * bounded-designs.md §3.3 A, PowerPoint's behaviour). The rule table:
 *
 * | The clipboard holds | Then |
 * |---|---|
 * | HTML with a `<table>` (Excel, Word, Google Sheets), and no other text | A grid: the table's cells |
 * | Plain text with a tab or a line break (blank lines at its end aside) | A grid: a row per line, a cell per tab |
 * | Any other text | Into the cell at the caret, cleaned as a text block's paste is, with no line break at its end |
 * | No text (an image alone) | The browser's own paste, as before (image paste is a later item) |
 *
 * A grid fills the table from the focused cell, left to right and down; the
 * table grows by rows and columns to hold it; no cell outside the pasted
 * area changes; nothing is dropped. A merged cell's text goes in its first
 * cell and the cells it covers are written empty, so the cells after it
 * keep their columns. Each pasted cell keeps bold, italic, underline, sub,
 * sup and the line breaks it shows, and drops colour, highlight, font and
 * size (pasteClean.ts); text is stored as text ("<" as "&lt;").
 *
 * Blank lines at the end of the plain text are not rows, and the one line
 * of rule 1 ends with no line break: an engine's copy of a whole paragraph
 * (a triple-click) ends its plain text with line breaks (Chromium two,
 * WebKit one) and its HTML with `<br class="Apple-interchange-newline">`,
 * which made a second row that emptied the cell below (Chromium) or a
 * blank line in the cell (WebKit; record 32 section 9, R1-F2). A blank line
 * at the start is still a row, so a range whose first cell is empty keeps
 * its place.
 *
 * Before fix 32 the table's handler built a new table from any paste with
 * text and put it in place of the old one: one word pasted into a cell of
 * a 4 × 3 table left a 1 × 1 table, and a cell's text was stored as markup,
 * so an <img onerror> pasted as text ran (MEASURED in three engines,
 * scripts/table-paste-check.mjs).
 *
 * Out of scope (record section 10): inserting rows or columns in the middle,
 * comma-separated text, quoted fields in tab-separated text (Excel puts its
 * HTML table on the clipboard too, read first), formatting a source sets by
 * style rather than by tag (Google Sheets' bold), and a paste over a range
 * of cells selected by dragging (no cell has the caret then).
 */
import type { TableData } from '@postr/shared';
import { cleanPastedContent, escapeText, parsePasted, pastedHtml } from './pasteClean';

export type CellPaste =
  | { kind: 'grid'; rows: string[][] }
  | { kind: 'text'; html: string };

/** Lines of plain text; the line breaks at its end do not start rows. */
function linesOf(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/);
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** One HTML cell's content (its whitespace already read as drawn), cleaned: no space, &nbsp; or blank line at its edges or beside a line break. */
function cellHtml(cell: HTMLTableCellElement): string {
  return cleanPastedContent(cell, true)
    .replace(/(?: |&nbsp;)*<br>(?: |&nbsp;)*/g, '<br>')
    .replace(/^(?:\s|&nbsp;|<br>)+|(?:\s|&nbsp;|<br>)+$/g, '');
}

/** The grid of the HTML's tables, row by row; null when it has none, or text outside them. */
function htmlGrid(html: string, text: string): string[][] | null {
  if (!/<table[\s>]/i.test(html)) return null;
  // Its whitespace read once with the cells' ancestors in place (a table's
  // own white-space style reaches its cells); a style sheet gone.
  const doc = parsePasted(html, text);
  const tables = Array.from(doc.querySelectorAll('table')).filter((t) => !t.parentElement?.closest('table'));
  if (!tables.length) return null;
  // Text outside the tables' cells (a paragraph copied with them, a
  // table's caption) is pasted too: the plain text holds it, so the paste
  // is read from there instead.
  const rest = doc.body.cloneNode(true) as HTMLElement;
  rest.querySelectorAll('table').forEach((el) => el.remove());
  if ((rest.textContent ?? '').trim() || tables.some((t) => (t.caption?.textContent ?? '').trim())) return null;
  const grid: string[][] = [];
  for (const table of tables) {
    const top = grid.length;
    const rows = Array.from(table.rows);
    rows.forEach((tr, i) => {
      const y = top + i;
      grid[y] ??= [];
      let x = 0;
      for (const cell of Array.from(tr.cells)) {
        while (grid[y]![x] !== undefined) x += 1;
        const across = Math.max(1, cell.colSpan);
        const down = Math.max(1, Math.min(cell.rowSpan || rows.length - i, rows.length - i));
        for (let dy = 0; dy < down; dy += 1) {
          const row = (grid[y + dy] ??= []);
          for (let dx = 0; dx < across; dx += 1) row[x + dx] = dy === 0 && dx === 0 ? cellHtml(cell) : '';
        }
        x += across;
      }
    });
  }
  const cols = Math.max(0, ...grid.map((r) => r.length));
  if (!cols) return null;
  return grid.map((r) => Array.from({ length: cols }, (_, c) => r[c] ?? ''));
}

/** What a paste into a cell is, by the rule table above; null when it holds no text. */
export function readCellPaste(html: string, text: string): CellPaste | null {
  const fromHtml = html ? htmlGrid(html, text) : null;
  if (fromHtml) return { kind: 'grid', rows: fromHtml };
  const lines = linesOf(text);
  if (lines.length > 1 || lines[0]!.includes('\t')) {
    return { kind: 'grid', rows: lines.map((l) => l.split('\t').map(escapeText)) };
  }
  const one = pastedHtml(html, lines[0]!, true).replace(/(?:<br>|\n)+$/, '');
  return one ? { kind: 'text', html: one } : null;
}

/**
 * The table with `rows` pasted from row `r0`, column `c0`: grown to hold
 * them, every cell outside the pasted area as it was. Column widths are
 * kept unless columns are added (then even, as Format › Columns does).
 */
export function pasteGrid(data: TableData, r0: number, c0: number, rows: string[][]): TableData {
  const height = rows.length;
  const width = Math.max(0, ...rows.map((r) => r.length));
  const nextRows = Math.max(data.rows, r0 + height);
  const nextCols = Math.max(data.cols, c0 + width);
  const cells: string[] = [];
  for (let r = 0; r < nextRows; r += 1) {
    for (let c = 0; c < nextCols; c += 1) {
      const pasted = r >= r0 && r < r0 + height && c >= c0 && c < c0 + width;
      const old = r < data.rows && c < data.cols ? data.cells[r * data.cols + c] ?? '' : '';
      cells.push(pasted ? rows[r - r0]![c - c0] ?? '' : old);
    }
  }
  return {
    ...data,
    rows: nextRows,
    cols: nextCols,
    cells,
    colWidths: nextCols === data.cols ? data.colWidths : null,
  };
}
