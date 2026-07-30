/**
 * StarFindingStep — the wizard's second step (spec §2, Turn 2).
 *
 * The extraction has run; this step shows the ranked findings as selectable
 * cards and lets the user promote one to the STAR (rank it first). The star
 * leads the result run in the deck; the rest keep their extracted order.
 * Selecting a card moves it to the front — a single click, no drag, no
 * reorder UI (that is Phase 2). Every card carries its verbatim sourceQuote
 * so the user sees the finding is grounded in their own words.
 *
 * The three surfaces are mutually exclusive: `loading` (extraction in
 * flight), `error` (a generic line — never raw error text, house rule), or
 * the finding list. An empty list after a successful extraction is honest —
 * the paper had no finding that survived the fidelity gate — and says so.
 */
import type { RankedFinding } from '../deck/extractFindings';

interface StarFindingStepProps {
  loading: boolean;
  error: boolean;
  findings: RankedFinding[];
  /** Index of the current star within `findings`. */
  starIndex: number;
  onPickStar: (index: number) => void;
  onRetry: () => void;
}

export function StarFindingStep({
  loading,
  error,
  findings,
  starIndex,
  onPickStar,
  onRetry,
}: StarFindingStepProps) {
  if (loading) {
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-[#2a2a3a] bg-[#0f0f16] px-4 py-3 text-sm italic text-[#9ca3af]"
        aria-live="polite"
      >
        <span className="postr-busy-dot" aria-hidden="true" />
        <span>Finding the key findings in your results…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-[#3a2530] bg-[#1a1013] px-4 py-3">
        <p role="alert" className="text-sm text-[#f87171]">
          Something went wrong. Please try again.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex min-h-11 items-center rounded-md border border-[#3a3a4e] px-4 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] hover:text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  if (findings.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-[#2a2a3a] px-4 py-3 text-sm text-[#8b8f99]">
        No clear findings were detected in the results. Check that the
        manuscript includes a results section, then try again.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[#c8cad0]">
        Pick your star finding — it leads the talk. The rest follow in order.
      </p>
      <ul className="flex flex-col gap-2">
        {findings.map((finding, i) => {
          const isStar = i === starIndex;
          return (
            <li key={`${finding.text}-${i}`}>
              <button
                type="button"
                onClick={() => onPickStar(i)}
                aria-pressed={isStar}
                className={`flex w-full flex-col gap-1 rounded-lg border px-4 py-3 text-left transition-colors ${
                  isStar
                    ? 'border-[#7c6aed] bg-[#16161f]'
                    : 'border-[#2a2a3a] bg-[#0f0f16] hover:border-[#3a3a4e]'
                }`}
              >
                <span className="flex items-center gap-2">
                  {isStar && (
                    <span
                      aria-hidden="true"
                      className="rounded bg-[#5641b8] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white"
                    >
                      Star
                    </span>
                  )}
                  <span className="text-sm font-semibold text-[#e2e2e8]">
                    {finding.text}
                  </span>
                </span>
                <span className="text-xs italic leading-snug text-[#8b8fa3]">
                  “{finding.sourceQuote}”
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
