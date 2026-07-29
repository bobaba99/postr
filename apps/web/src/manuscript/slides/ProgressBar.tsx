/**
 * ProgressBar — the wizard's top progress indicator (spec §2, v2 layout).
 *
 * Sits at the head of the main column, above the slide viewer. Reports the
 * wizard's position two ways: a readable label ("Constraints · 1 / 6") and a
 * filled track whose width is the derived fraction. The whole thing is one
 * ARIA `progressbar` so assistive tech reads position without seeing the
 * decorative fill.
 *
 * Presentational ON PURPOSE — no local state, no GSAP. The fill uses a plain
 * CSS width transition (a single transition, never a per-keystroke JS
 * animation — spec §Task 10 motion budget); the wizard drives `current`.
 */
import { STEP_TOTAL } from './stepConfig';

interface ProgressBarProps {
  /** 1-based position of the current step (clamped to [0, total]). */
  current: number;
  /** Total number of steps. Defaults to the wizard's step count. */
  total?: number;
  /** Human label for the current step, shown beside the count. */
  label: string;
}

export function ProgressBar({
  current,
  total = STEP_TOTAL,
  label,
}: ProgressBarProps) {
  // Clamp so a fill can never exceed its track (an out-of-range `current`
  // is a caller bug, but it must not render a bar wider than 100%).
  const now = Math.max(0, Math.min(current, total));
  const percent = total > 0 ? Math.round((now / total) * 100) : 0;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={now}
      aria-label={`Wizard progress — ${label}, step ${now} of ${total}`}
      className="flex flex-col gap-1.5"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="text-xs font-medium tabular-nums text-[#6b7280]">
          {now} / {total}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1f1f2e]">
        <div
          className="h-full rounded-full bg-[#7c6aed] transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
