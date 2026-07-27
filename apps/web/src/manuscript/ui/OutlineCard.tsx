/**
 * OutlineCard — the checkpoint. Five editable panels (plus pins), each
 * showing which manuscript section it came from, so the wrong-finding
 * failure mode is caught in a ten-second read instead of surviving
 * into a printed poster.
 */
import { countWords } from '../buildDocumentModel';

export interface OutlineEntryView {
  key: string;
  kind: 'role' | 'pinned';
  heading: string;
  descriptor: string;
  /** Provenance — the manuscript heading(s) this panel came from. */
  provenance: string;
  text: string;
  truncated: boolean;
  budgetWords: number;
  missing: boolean;
}

interface OutlineCardProps {
  entries: OutlineEntryView[];
  onEdit: (key: string, text: string) => void;
}

export function OutlineCard({ entries, onEdit }: OutlineCardProps) {
  return (
    <div className="postr-rise-in rounded-lg border border-[#2a2a3a] bg-[#111118] p-4">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7c6aed]">
        Poster outline
      </div>
      <div className="flex flex-col gap-4">
        {entries.map((entry) => (
          <OutlineEntry key={entry.key} entry={entry} onEdit={onEdit} />
        ))}
      </div>
    </div>
  );
}

function OutlineEntry({
  entry,
  onEdit,
}: {
  entry: OutlineEntryView;
  onEdit: (key: string, text: string) => void;
}) {
  const words = countWords(entry.text);
  const overBudget = words > entry.budgetWords;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm font-semibold text-[#e2e2e8]">
          {entry.heading}
        </span>
        {entry.provenance && (
          <span className="text-[11px] text-[#6b7280]">
            from {entry.provenance}
          </span>
        )}
        {entry.truncated && (
          <span className="rounded bg-[#7c6aed22] px-1.5 py-0.5 text-[10px] font-semibold text-[#c8b6ff]">
            shortened to fit
          </span>
        )}
        {entry.missing && (
          <span className="rounded bg-[#eab30822] px-1.5 py-0.5 text-[10px] font-semibold text-[#eab308]">
            needs your input
          </span>
        )}
      </div>
      <textarea
        value={entry.text}
        onChange={(e) => onEdit(entry.key, e.target.value)}
        placeholder={
          entry.missing
            ? `Write the ${entry.heading.toLowerCase()} here — ${entry.descriptor.toLowerCase()}.`
            : undefined
        }
        rows={Math.max(2, Math.min(6, Math.ceil(entry.text.length / 70)))}
        className="w-full resize-y rounded-md border border-[#2a2a3a] bg-[#0a0a12] px-3 py-2 text-sm leading-relaxed text-[#c8cad0] outline-none focus:border-[#7c6aed]"
      />
      <div
        className={`mt-0.5 text-right text-[10px] ${overBudget ? 'font-semibold text-[#eab308]' : 'text-[#4b5563]'}`}
      >
        {words}/{entry.budgetWords} words
        {overBudget && ' — over budget, the poster will clip this'}
      </div>
    </div>
  );
}
