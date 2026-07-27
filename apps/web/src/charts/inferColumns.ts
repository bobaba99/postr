/**
 * Column type inference for the plot picker.
 *
 * Turns a RawTable (strings/numbers/dates straight from a parser)
 * into typed columns the recommender can reason about. Pure
 * functions, deterministic, no LLM — inference the model would do
 * (column types → form) is a lookup we can run in microseconds.
 *
 * Locale numerics: European exports write "1,5" where US exports
 * write "1.5". The decimal style is decided PER COLUMN: any
 * digit.digit occurrence anywhere in the column locks dot-decimal
 * (commas become thousands separators); otherwise single-comma values
 * with a non-3-digit fraction lock comma-decimal. The genuinely
 * ambiguous all-"1,234" column is read as thousands — the safer
 * default for anglophone research data, and wrong by at most 1000× in
 * a way the preview makes immediately visible.
 */
import type { RawCell, RawTable } from './parseData';

export type ColumnKind = 'number' | 'category' | 'date';

export interface InferredColumn {
  name: string;
  kind: ColumnKind;
  /** Coerced values, row-aligned. Unparseable cells become null. */
  values: (string | number | null)[];
  /** Count of distinct non-null values. */
  distinct: number;
  /**
   * True for date columns and for year-like integer columns
   * ("Year": 2019, 2020, …). Ordered columns are trend axes.
   */
  ordered: boolean;
  /** True when the raw values were percentages ("45%"). */
  percent: boolean;
}

export interface InferredTable {
  columns: InferredColumn[];
  rowCount: number;
}

const ISO_DATE = /^\d{4}-\d{1,2}(-\d{1,2})?([T ].*)?$/;
const SLASH_DATE = /^\d{1,2}[/.]\d{1,2}[/.]\d{2,4}$/;
const MONTH_NAME =
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*([ '-]?\d{1,4})?$/i;

const DOT_DECIMAL = /^[-+]?\d{1,3}(,\d{3})*(\.\d+)?([eE][-+]?\d+)?%?$/;
const PLAIN_NUMBER = /^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?%?$/;
const COMMA_DECIMAL = /^[-+]?\d+,\d+%?$/;

function rawToText(cell: RawCell): string | null {
  if (cell === null || cell === undefined) return null;
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  const text = String(cell).trim();
  return text.length > 0 ? text : null;
}

function isDateText(text: string): boolean {
  return ISO_DATE.test(text) || SLASH_DATE.test(text) || MONTH_NAME.test(text);
}

type DecimalStyle = 'dot' | 'comma';

/**
 * Decide the column's decimal style. Any digit.digit value anywhere
 * locks dot; otherwise a single-comma value whose fraction is not
 * exactly 3 digits can only be a decimal comma.
 */
function decideDecimalStyle(texts: string[]): DecimalStyle {
  if (texts.some((t) => /\d\.\d/.test(t))) return 'dot';
  const commaOnly = texts.filter((t) => COMMA_DECIMAL.test(t));
  if (commaOnly.length > 0 && commaOnly.some((t) => !/,\d{3}%?$/.test(t))) {
    return 'comma';
  }
  return 'dot';
}

function parseNumericText(text: string, style: DecimalStyle): number | null {
  // Strip percent signs and space-flavored thousands separators
  // (regular, no-break U+00A0, narrow no-break U+202F).
  let t = text.replace(/%$/, '').replace(/[\u00a0\u202f ]/g, '');
  if (style === 'comma') {
    t = t.replace(',', '.');
  } else {
    t = t.replace(/,/g, '');
  }
  if (!/^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function isNumericText(text: string): boolean {
  return PLAIN_NUMBER.test(text) || DOT_DECIMAL.test(text) || COMMA_DECIMAL.test(text);
}

/** Share of non-null values a rule must cover before it wins the column. */
const KIND_THRESHOLD = 0.9;

interface ColumnScan {
  cells: RawCell[];
  texts: (string | null)[];
}

function scanColumn(raw: RawTable, index: number): ColumnScan {
  const cells = raw.rows.map((row) => row[index] ?? null);
  return { cells, texts: cells.map(rawToText) };
}

function inferOne(name: string, scan: ColumnScan): InferredColumn {
  const nonNull = scan.texts.filter((t): t is string => t !== null);
  const nativeNumbers = scan.cells.filter((c) => typeof c === 'number');
  const nativeDates = scan.cells.filter((c) => c instanceof Date);

  const finish = (
    kind: ColumnKind,
    values: (string | number | null)[],
    extras: { ordered?: boolean; percent?: boolean } = {},
  ): InferredColumn => {
    const distinct = new Set(values.filter((v) => v !== null)).size;
    return {
      name,
      kind,
      values,
      distinct,
      ordered: extras.ordered ?? kind === 'date',
      percent: extras.percent ?? false,
    };
  };

  if (nonNull.length === 0) {
    return finish('category', scan.texts);
  }

  // Native types from Excel win outright.
  if (nativeDates.length / nonNull.length >= KIND_THRESHOLD) {
    return finish('date', scan.texts);
  }
  if (nativeNumbers.length / nonNull.length >= KIND_THRESHOLD) {
    const values = scan.cells.map((c) => (typeof c === 'number' ? c : null));
    return finish('number', values, { ordered: isYearLike(name, values) });
  }

  // Text dates before text numbers: "2024-01-15" contains digits but
  // must not be read as arithmetic.
  const dateish = nonNull.filter(isDateText);
  if (dateish.length / nonNull.length >= KIND_THRESHOLD && hasDateShape(nonNull)) {
    return finish('date', scan.texts);
  }

  const numericish = nonNull.filter(isNumericText);
  if (numericish.length / nonNull.length >= KIND_THRESHOLD) {
    const style = decideDecimalStyle(nonNull);
    const values = scan.texts.map((t) => (t === null ? null : parseNumericText(t, style)));
    const percent = nonNull.filter((t) => t.endsWith('%')).length / nonNull.length >= KIND_THRESHOLD;
    return finish('number', values, { ordered: isYearLike(name, values), percent });
  }

  return finish('category', scan.texts);
}

/**
 * Bare-integer years ("2018", "2019", …) chart as a trend axis, not a
 * magnitude. Same for explicitly time-named integer columns (week,
 * session, trial…). Requires ≥ 2 distinct values so a constant
 * "Year = 2024" metadata column stays categorical-ish.
 */
function isYearLike(name: string, values: (string | number | null)[]): boolean {
  const nums = values.filter((v): v is number => typeof v === 'number');
  if (nums.length === 0) return false;
  if (!nums.every((n) => Number.isInteger(n))) return false;
  const distinct = new Set(nums).size;
  if (distinct < 2) return false;
  const allYearRange = nums.every((n) => n >= 1800 && n <= 2200);
  const timeName = /^(year|month|week|day|date|time|session|visit|trial|wave)s?\b/i.test(name);
  return allYearRange || timeName;
}

/**
 * Month-name guard: a category column like "May" / "Jun" only counts
 * as dates when several distinct calendar-ish values appear —
 * otherwise a "Dec" abbreviation for "decrease" would flip a column.
 */
function hasDateShape(nonNull: string[]): boolean {
  return new Set(nonNull.map((t) => t.toLowerCase())).size >= 2;
}

export function inferTable(raw: RawTable): InferredTable {
  const columns = raw.header.map((name, i) => inferOne(name, scanColumn(raw, i)));
  return { columns, rowCount: raw.rows.length };
}
