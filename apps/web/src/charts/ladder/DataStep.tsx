/**
 * DataStep — the ladder's single smart input target.
 *
 * Accepts ⌘V paste from Excel/Sheets/Numbers (TSV), .csv/.tsv
 * uploads, .xlsx uploads (multi-sheet gets a sheet chip row), table
 * blocks already on the poster, and the "I don't have data yet"
 * synthetic branch. Oversized input is never silently truncated —
 * the user chooses.
 */
import { useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent } from 'react';
import type { TableData } from '@postr/shared';
import {
  parseDelimited,
  parseTableBlock,
  CHART_MAX_ROWS,
  type ParseOutcome,
  type RawTable,
} from '../parseData';
import { isExcelFile, readExcelFile, tabulateExcelSheet, type ExcelSheet } from '../parseExcel';

export interface PosterTableRef {
  blockId: string;
  label: string;
  tableData: TableData;
}

interface DataStepProps {
  posterTables: PosterTableRef[];
  onTable: (table: RawTable, summary: string) => void;
  onSynthetic: () => void;
}

type Pending =
  | { kind: 'text'; text: string }
  | { kind: 'sheet'; sheet: ExcelSheet }
  | { kind: 'block'; tableData: TableData };

interface Failure {
  message: string;
  /** Present for too-large: re-parse with truncation. */
  pending?: Pending;
  rowCount?: number;
}

const buttonStyle: CSSProperties = {
  border: '1px solid #2a2a3a',
  background: '#14141f',
  color: '#c8cad0',
  borderRadius: 8,
  padding: '7px 12px',
  fontSize: 13,
  cursor: 'pointer',
};

function failureMessage(outcome: ParseOutcome): string {
  if (outcome.ok) return '';
  switch (outcome.reason) {
    case 'empty':
      return 'We couldn’t find any rows in that. Try pasting the cells, including the header row.';
    case 'no-delimiter':
      return 'That looks like prose, not a table — paste cells from a spreadsheet, or upload a CSV or Excel file.';
    case 'too-large':
      return `That’s ${outcome.rowCount.toLocaleString()} rows — charts cap at ${CHART_MAX_ROWS.toLocaleString()} so the poster stays fast.`;
    case 'legacy-xls':
      return 'That’s a legacy .xls file. In Excel, save it as .xlsx (or CSV) and try again.';
    case 'unreadable':
      return 'Something went wrong reading that file. Try CSV, or paste the cells directly.';
  }
}

/**
 * A typed table is only worth parsing once it plausibly *is* a table:
 * a header row plus at least one data row. Parsing sooner would
 * advance the ladder mid-word and unmount the textarea under the
 * user's cursor.
 */
function looksLikeTable(text: string): boolean {
  return text.trim().split(/\r?\n/).filter((line) => line.trim().length > 0).length >= 2;
}

export function DataStep({ posterTables, onTable, onSynthetic }: DataStepProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [sheets, setSheets] = useState<ExcelSheet[] | null>(null);
  const [reading, setReading] = useState(false);
  const [draft, setDraft] = useState('');

  const finish = (outcome: ParseOutcome, pending: Pending) => {
    if (outcome.ok) {
      const { header, rows } = outcome.table;
      const truncatedNote = outcome.truncated ? ' (first 2,000 rows)' : '';
      onTable(outcome.table, `${rows.length.toLocaleString()} rows × ${header.length} columns${truncatedNote}`);
      setFailure(null);
      return;
    }
    setFailure({
      message: failureMessage(outcome),
      ...(outcome.reason === 'too-large' ? { pending, rowCount: outcome.rowCount } : {}),
    });
  };

  const parsePending = (pending: Pending, allowTruncate: boolean) => {
    const options = { allowTruncate };
    if (pending.kind === 'text') finish(parseDelimited(pending.text, options), pending);
    else if (pending.kind === 'sheet') finish(tabulateExcelSheet(pending.sheet, options), pending);
    else finish(parseTableBlock(pending.tableData, options), pending);
  };

  const handleText = (text: string) => {
    if (text.trim().length === 0) return;
    setSheets(null);
    // A lone line is a header with nothing under it — never a table.
    // Rejecting it here (rather than letting `tabulate` invent
    // "Column 1" names) also stops a half-typed row from advancing.
    if (!looksLikeTable(text)) {
      setFailure({ message: failureMessage({ ok: false, reason: 'empty' }) });
      return;
    }
    parsePending({ kind: 'text', text }, false);
  };

  const handleFile = async (file: File) => {
    setFailure(null);
    setSheets(null);
    if (isExcelFile(file.name)) {
      setReading(true);
      try {
        const workbook = await readExcelFile(file);
        if (!workbook.ok) {
          setFailure({
            message: failureMessage({ ok: false, reason: workbook.reason }),
          });
          return;
        }
        if (workbook.sheets.length === 1 && workbook.sheets[0]) {
          parsePending({ kind: 'sheet', sheet: workbook.sheets[0] }, false);
        } else {
          setSheets(workbook.sheets);
        }
      } finally {
        setReading(false);
      }
      return;
    }
    try {
      const text = await file.text();
      handleText(text);
    } catch {
      setFailure({ message: failureMessage({ ok: false, reason: 'unreadable' }) });
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const onFilePicked = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    event.target.value = '';
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <textarea
        aria-label="Paste your table"
        placeholder="Paste cells from Excel, Sheets, or Numbers (⌘V) — include the header row"
        rows={3}
        value={draft}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text/plain');
          if (text) {
            e.preventDefault();
            setDraft(text);
            handleText(text);
          }
        }}
        // Typing never parses — that would advance the ladder and
        // unmount this textarea mid-word. Blur is the earliest safe
        // moment; the button below is the explicit affordance.
        onChange={(e) => {
          setDraft(e.target.value);
          if (failure) setFailure(null);
        }}
        onBlur={() => {
          if (looksLikeTable(draft)) handleText(draft);
        }}
        style={{
          width: '100%',
          resize: 'vertical',
          border: '1px dashed #2a2a3a',
          borderRadius: 8,
          background: '#101018',
          color: '#c8cad0',
          fontSize: 13,
          padding: '10px 12px',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {draft.trim().length > 0 && (
          <button
            type="button"
            style={{ ...buttonStyle, borderColor: '#7c6aed', color: '#d6cfff' }}
            onClick={() => handleText(draft)}
          >
            Use this table
          </button>
        )}
        <button type="button" style={buttonStyle} onClick={() => fileRef.current?.click()}>
          {reading ? 'Reading…' : 'Upload CSV or Excel'}
        </button>
        <button type="button" style={buttonStyle} onClick={onSynthetic}>
          I don’t have data yet
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls"
          onChange={onFilePicked}
          style={{ display: 'none' }}
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>

      {posterTables.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#6b6b76' }}>Or use a table from this poster:</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {posterTables.map((ref) => (
              <button
                key={ref.blockId}
                type="button"
                style={buttonStyle}
                onClick={() => parsePending({ kind: 'block', tableData: ref.tableData }, false)}
              >
                {ref.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {sheets && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#6b6b76' }}>Which sheet?</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {sheets.map((sheet) => (
              <button
                key={sheet.name}
                type="button"
                style={buttonStyle}
                onClick={() => parsePending({ kind: 'sheet', sheet }, false)}
              >
                {sheet.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {failure && (
        <div
          role="alert"
          style={{
            border: '1px solid #3a2f2f',
            background: 'rgba(243, 139, 168, 0.08)',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 13,
            color: '#e8b4c0',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <span>{failure.message}</span>
          {failure.pending && (
            <div>
              <button
                type="button"
                style={{ ...buttonStyle, borderColor: '#7c6aed', color: '#d6cfff' }}
                onClick={() => parsePending(failure.pending!, true)}
              >
                Use the first {CHART_MAX_ROWS.toLocaleString()} rows
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
