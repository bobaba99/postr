/**
 * Q2 plot branch — the chart chooser as an inline SIDE PANEL.
 *
 * The user never leaves the page: the existing chooser
 * (@/charts/ladder/ChartChooser) is IMPORTED and mounted here, not
 * forked. A link to /chart-chooser is offered alongside for anyone who
 * wants the full tool with its download actions.
 *
 * Data source, in order:
 *   (a) tables extracted from the manuscript itself, offered pre-filled
 *       — deterministic parsing, no model call;
 *   (b) the chooser's own paste / CSV / XLSX ingest, which is what the
 *       user gets when extraction found nothing or they reject it.
 *
 * This component owns (a) only. Once the user picks an extracted table
 * — or skips — the chooser owns everything after.
 */
import { useMemo, useState } from 'react';
import type { DocumentModel, Palette } from '@postr/shared';
import { ChartChooser } from '@/charts/ladder/ChartChooser';
import type { PosterTableRef } from '@/charts/ladder/DataStep';
import { extractPlottableTables } from '../tableExtract';

interface ChartPanelProps {
  doc: DocumentModel | null;
  palette: Palette;
  fontFamily: string;
  onClose: () => void;
}

export function ChartPanel({ doc, palette, fontFamily, onClose }: ChartPanelProps) {
  const extracted = useMemo(
    () => (doc ? extractPlottableTables(doc) : []),
    [doc],
  );
  /** null = still offering; the user has neither picked nor skipped. */
  const [offerDismissed, setOfferDismissed] = useState(false);
  const [chosenId, setChosenId] = useState<string | null>(null);

  // Extracted tables are handed to the chooser through its existing
  // `posterTables` door rather than a new prop — it already knows how
  // to turn a TableData into a parsed table (header detection, the row
  // cap, column inference), and adding a second entry path would be
  // two code paths for one idea.
  const posterTables: PosterTableRef[] = useMemo(() => {
    const chosen = chosenId
      ? extracted.filter((t) => t.id === chosenId)
      : extracted;
    return chosen.map((t) => {
      const cols = t.table.header.length;
      // TableData is row-major and flat, with the header as row 0 —
      // the same layout parseTableBlock expects.
      const cells = [
        ...t.table.header,
        ...t.table.rows.flatMap((row) =>
          Array.from({ length: cols }, (_, i) => String(row[i] ?? '')),
        ),
      ];
      return {
        blockId: t.id,
        label: t.label,
        tableData: {
          rows: t.table.rows.length + 1,
          cols,
          cells,
          colWidths: null,
          borderPreset: 'apa',
        },
      };
    });
  }, [extracted, chosenId]);

  const showOffer = extracted.length > 0 && !offerDismissed && chosenId === null;

  return (
    <aside
      aria-label="Chart builder"
      className="postr-rise-in flex min-h-0 flex-col rounded-lg border border-[#1f1f2e] bg-[#0d0d15]"
    >
      <header className="flex items-center justify-between border-b border-[#1f1f2e] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Build your figure</h2>
          <p className="mt-0.5 text-[11px] text-[#6b7280]">
            A plot usually reads better than a table at three feet.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/chart-chooser"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-[#9b8cff] underline underline-offset-2 hover:text-white"
          >
            Open the full tool
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chart builder"
            className="rounded-md border border-[#3a3a4e] px-2 py-1 text-xs text-[#c8cad0] hover:border-[#7c6aed] hover:text-white"
          >
            Close
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {showOffer && (
          <div className="postr-rise-in mb-4 rounded-md border border-[#2a2a3a] bg-[#101018] p-3">
            <p className="text-xs text-[#c8cad0]">
              {extracted.length === 1
                ? 'I found a table in your manuscript. Use it?'
                : `I found ${extracted.length} tables in your manuscript. Use one?`}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {extracted.map((table) => (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => setChosenId(table.id)}
                  className="rounded-md border border-[#3a3a4e] bg-[#14141f] px-3 py-1.5 text-left text-xs text-[#c8cad0] hover:border-[#7c6aed] hover:text-white"
                >
                  <span className="block">{table.label}</span>
                  <span className="block text-[10px] text-[#6b7280]">
                    {table.summary}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setOfferDismissed(true)}
                className="rounded-md border border-[#2a2a3a] px-3 py-1.5 text-xs text-[#9ca3af] hover:border-[#7c6aed] hover:text-white"
              >
                Use different data
              </button>
            </div>
          </div>
        )}

        <ChartChooser
          layout="panel"
          palette={palette}
          fontFamily={fontFamily}
          posterTables={posterTables}
          actions={[]}
        />
      </div>
    </aside>
  );
}
