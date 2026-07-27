/**
 * Excel (.xlsx) input for the plot picker.
 *
 * XLSX ships in Phase 1 because the target users (psych / med
 * students) overwhelmingly hand over .xlsx, not .csv — see
 * docs/plans/2026-07-27-plot-picker-v2.md §3.
 *
 * Reader choice (evaluated 2026-07-27 per the v1 plan's note):
 * `read-excel-file` over SheetJS. It is a fraction of SheetJS's
 * bundle size, actively maintained, and ships its own TypeScript
 * types. The trade-off: it reads modern `.xlsx` only. Legacy `.xls`
 * (last written by Excel 2003) gets a dedicated outcome so the UI can
 * suggest "save as .xlsx or CSV" instead of a generic failure.
 *
 * The reader is lazy-loaded — posters without Excel imports never pay
 * for it. Its v9 API returns every sheet (name + cell grid) in one
 * read, which is exactly what the sheet-picker chip row needs; header
 * detection and the row cap are delegated to `tabulate()` so Excel
 * behaves exactly like CSV/paste.
 */
import { tabulate, type ParseOutcome, type RawCell, type TabulateOptions } from './parseData';

export interface ExcelSheet {
  name: string;
  grid: RawCell[][];
}

export type ExcelOutcome =
  | { ok: true; sheets: ExcelSheet[] }
  | { ok: false; reason: 'legacy-xls' | 'unreadable' };

export function isLegacyXls(fileName: string): boolean {
  return /\.xls$/i.test(fileName.trim());
}

export function isExcelFile(fileName: string): boolean {
  return /\.(xlsx|xls)$/i.test(fileName.trim());
}

function normalizeCell(cell: unknown): RawCell {
  if (cell === null || cell === undefined) return null;
  if (cell instanceof Date) return cell;
  if (typeof cell === 'number' || typeof cell === 'boolean') return cell;
  return String(cell);
}

/**
 * Read the whole workbook. Sheets with no content are dropped so a
 * workbook with one data sheet and two empty scratch sheets skips the
 * sheet picker entirely.
 */
export async function readExcelFile(file: File): Promise<ExcelOutcome> {
  if (isLegacyXls(file.name)) return { ok: false, reason: 'legacy-xls' };
  try {
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    const workbook = await readXlsxFile(file);
    const sheets = workbook
      .map((sheet) => ({
        name: sheet.sheet,
        grid: sheet.data.map((row) => row.map(normalizeCell)),
      }))
      .filter((sheet) =>
        sheet.grid.some((row) =>
          row.some((cell) => cell !== null && String(cell).trim() !== ''),
        ),
      );
    if (sheets.length === 0) return { ok: false, reason: 'unreadable' };
    return { ok: true, sheets };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}

/** Normalize one picked sheet through the shared tabulate pipeline. */
export function tabulateExcelSheet(
  sheet: ExcelSheet,
  options: TabulateOptions = {},
): ParseOutcome {
  return tabulate(sheet.grid, options);
}
