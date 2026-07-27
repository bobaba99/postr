/**
 * BusyIndicator — the one loading affordance the app uses for work
 * whose duration we cannot know.
 *
 * Design rules it encodes so no caller has to remember them:
 *
 * - **Words, not just motion.** Every instance carries a label
 *   ("Reading your spreadsheet…"). Anything that can exceed ~1s must
 *   say what is happening, and a bare spinner never does.
 * - **No fake percentages.** The bar is a sweeping shuttle, not a
 *   fill — honest about indeterminate work. Callers with a real
 *   ratio should render a real progress bar instead.
 * - **Screen readers hear it.** `role="status"` + `aria-live="polite"`
 *   announces the label on mount and on every label change.
 * - **Reduced motion still shows something.** The sweep and the dot
 *   pulse are gated in index.css; under `prefers-reduced-motion` they
 *   become static, visible indicators rather than disappearing.
 * - **Immediate.** It is pure CSS with no entrance delay and no
 *   JS-driven first frame, so it paints on the same frame the caller
 *   flips its busy flag.
 *
 * Two shapes:
 *   `<BusyIndicator label="…" />`        — block: sweeping bar + label
 *   `<BusyIndicator label="…" inline />` — inline: pulsing dot + label,
 *                                          sized for button interiors
 *
 * Companion: `busyProps(isBusy)` spreads `aria-busy` onto whatever
 * region the work belongs to, so assistive tech knows the *container*
 * is in flux and not just that a status line appeared.
 */
import type { CSSProperties } from 'react';

export interface BusyIndicatorProps {
  /**
   * What is actually happening, in the user's words — "Reading your
   * spreadsheet…", not "Loading". Announced to screen readers.
   */
  label: string;
  /** Inline dot form, for use inside a button next to its text. */
  inline?: boolean;
  /** Accent applied to the shuttle/dot (they use `currentColor`). */
  tone?: string;
  /**
   * Extra context shown under the label — a second line for slow work
   * ("Large files can take a moment"). Omit for fast operations.
   */
  hint?: string;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_TONE = '#c8b6ff';

/**
 * Spread onto the element whose content is being replaced//refreshed.
 * `aria-busy` on the region is what tells a screen reader "this part
 * is mid-update"; the BusyIndicator's live region carries the words.
 */
export function busyProps(isBusy: boolean): { 'aria-busy': boolean } {
  return { 'aria-busy': isBusy };
}

export function BusyIndicator({
  label,
  inline = false,
  tone = DEFAULT_TONE,
  hint,
  className,
  style,
}: BusyIndicatorProps) {
  if (inline) {
    return (
      <span
        role="status"
        aria-live="polite"
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          color: tone,
          ...style,
        }}
      >
        <span className="postr-busy-dot" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}
    >
      <div className="postr-busy-track" style={{ color: tone }} aria-hidden="true">
        <div className="postr-busy-shuttle" />
      </div>
      <span style={{ fontSize: 13, color: tone, fontWeight: 500 }}>{label}</span>
      {hint && <span style={{ fontSize: 12, color: '#6b7280' }}>{hint}</span>}
    </div>
  );
}
