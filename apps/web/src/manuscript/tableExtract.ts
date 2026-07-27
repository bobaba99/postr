/**
 * Q2 plot branch, data source (a) — offer the manuscript's OWN tables
 * to the chart chooser, pre-filled.
 *
 * Deterministic parsing end to end. The .docx ingest already
 * reconstructs `<table>` grids (docxIngest.readTableGrid); this module
 * decides which of them are worth offering and converts them to the
 * chart chooser's `RawTable` shape.
 *
 * If this finds nothing — or the user rejects what it finds — the flow
 * falls back to the chooser's existing paste / CSV / XLSX ingest, which
 * is why nothing here throws: an empty list IS the fallback signal.
 */
import type { DocumentModel, ManuscriptTableRef } from '@postr/shared';
import type { RawTable } from '@/charts/parseData';

/** A manuscript table the chooser can start from. */
export interface ExtractedTable {
  id: string;
  /** What the user sees in the offer list. */
  label: string;
  table: RawTable;
  /** Rows × columns, for the summary line. */
  summary: string;
}

/** Below two data rows there is nothing to plot — a one-row table is a
 *  summary line, and charting it produces a single bar. */
const MIN_DATA_ROWS = 2;

/**
 * Does this grid carry anything numeric? A table of entirely textual
 * cells (a participant characteristics table of "Yes"/"No") cannot
 * drive a chart, and offering it wastes the user's attention.
 *
 * Deliberately loose about FORMAT — "12.4%", "1,203", "0.03" and
 * "(0.12)" all count. Strictness belongs to the chooser's own column
 * inference, which already handles this and is the single place that
 * should.
 */
function hasNumericCells(rows: string[][]): boolean {
  return rows.some((row) => row.some((cell) => /\d/.test(cell)));
}

/**
 * A results table is the one worth offering first. Deterministic
 * signal: the caption says "Table", the table lives in a Results
 * section, or its cells carry statistics.
 */
function isResultsTable(doc: DocumentModel, ref: ManuscriptTableRef): boolean {
  const section = doc.sections.find((s) => s.id === ref.sourceSectionId);
  return section?.kind === 'results';
}

function labelFor(ref: ManuscriptTableRef, index: number): string {
  const caption = ref.caption.trim();
  if (caption) {
    return caption.length <= 60 ? caption : `${caption.slice(0, 59)}…`;
  }
  return `Table ${index + 1}`;
}

/**
 * Every manuscript table that could plausibly back a figure, results
 * tables first.
 *
 * Returns [] when the manuscript carried no usable grid — pasted text
 * always lands here, since a paste has captions but no cells.
 */
export function extractPlottableTables(doc: DocumentModel): ExtractedTable[] {
  const usable = doc.tables
    .map((ref, index) => ({ ref, index }))
    .filter(({ ref }) => {
      const data = ref.data;
      if (!data) return false;
      if (data.header.length < 2) return false;
      if (data.rows.length < MIN_DATA_ROWS) return false;
      return hasNumericCells(data.rows);
    });

  // Results tables lead. `sort` is stable, so document order survives
  // within each group.
  const ordered = [...usable].sort((a, b) => {
    const aResults = isResultsTable(doc, a.ref) ? 0 : 1;
    const bResults = isResultsTable(doc, b.ref) ? 0 : 1;
    return aResults - bResults;
  });

  return ordered.map(({ ref, index }) => {
    const data = ref.data!;
    return {
      id: ref.id,
      label: labelFor(ref, index),
      table: { header: data.header, rows: data.rows },
      summary: `${data.rows.length.toLocaleString()} rows × ${data.header.length} columns`,
    };
  });
}
