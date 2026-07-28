/**
 * StepSection — one rung of the auto-scrolling ladder.
 *
 * Answered steps collapse to a one-line summary with a "change"
 * affordance; the active step's content reveals via
 * grid-template-rows 0fr → 1fr (the pattern used for guideline
 * sections) with the house motion tokens. Steps below the active one
 * are simply not mounted, which is a stronger guarantee than `inert`:
 * nothing hidden is ever tabbable or read by a screen reader.
 *
 * Focus handling: when a step becomes active after a user answer,
 * the ladder moves FOCUS (not just scroll) to the step's first
 * control — auto-scroll alone gives screen-reader users nothing.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

interface StepSectionProps {
  /** 1-based display index. */
  index: number;
  title: string;
  state: 'active' | 'answered';
  /** One-line answer summary shown when collapsed. */
  summary?: string;
  /** Re-open this step (invalidates everything below it). */
  onReopen?: () => void;
  /** True once the user has interacted — gates scroll AND focus. */
  shouldFocusOnMount: boolean;
  children?: ReactNode;
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  minWidth: 0,
};

const indexStyle: CSSProperties = {
  // 12px is the legibility floor on a phone; 11px tripped the audit.
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#6b6b76',
  flexShrink: 0,
};

export function StepSection({
  index,
  title,
  state,
  summary,
  onReopen,
  shouldFocusOnMount,
  children,
}: StepSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [revealed, setRevealed] = useState(false);

  // Reveal on mount (0fr → 1fr), then scroll + focus — but never on
  // page load: only after the user's own answer created this step.
  //
  // The rAF is a PAINT-TIMING nicety, not a correctness requirement:
  // deferring one frame lets the browser paint the collapsed state
  // first so the reveal is a transition rather than a pop. It must
  // therefore never be the only thing that sets `revealed`.
  //
  // requestAnimationFrame DOES NOT FIRE IN A BACKGROUND TAB. When this
  // was the sole path, a step mounted in a hidden tab never revealed:
  // the callback stayed queued, `revealed` stayed false, and the row
  // sat at 0fr permanently with its content in the DOM but clipped to
  // zero height. Verified in Chromium — /chart-chooser step 1 rendered
  // as an empty gap, paste box and all three entry buttons invisible.
  //
  // The timeout is the guarantee: whichever fires first wins, and a
  // hidden tab still reveals (instantly, which is correct — there is
  // no one watching to see a transition). Same principle as
  // motion/canAnimate.ts: an enhancement that cannot prove it will run
  // does not get to decide whether content is visible.
  useEffect(() => {
    if (state !== 'active') return;
    const frame = requestAnimationFrame(() => setRevealed(true));
    const fallback = window.setTimeout(() => setRevealed(true), 80);
    if (shouldFocusOnMount && sectionRef.current) {
      const el = sectionRef.current;
      const reduced =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      const focusable = el.querySelector<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus({ preventScroll: true });
    }
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (state === 'answered') {
    return (
      <section
        aria-label={`Step ${index}: ${title}`}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          padding: '10px 0',
          borderBottom: '1px solid #1e1e2e',
        }}
      >
        <span style={indexStyle}>{index}</span>
        <span style={{ fontSize: 13, color: '#8a8a95', flexShrink: 0 }}>{title}</span>
        <span
          style={{
            fontSize: 13,
            color: '#c8cad0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
            flex: 1,
          }}
        >
          {summary}
        </span>
        {onReopen && (
          <button
            type="button"
            onClick={onReopen}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#7c6aed',
              fontSize: 13,
              cursor: 'pointer',
              // Re-opening an answered step is the only way back up
              // the ladder, so it needs a real target rather than the
              // 22px sliver it measured at.
              minHeight: 44,
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0 8px',
              flexShrink: 0,
            }}
          >
            ▸ change
          </button>
        )}
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      aria-label={`Step ${index}: ${title}`}
      aria-live="polite"
      style={{ padding: '14px 0', borderBottom: '1px solid #1e1e2e' }}
    >
      <div style={headerStyle}>
        <span style={indexStyle}>{index}</span>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#e8e8ee', margin: 0 }}>{title}</h3>
      </div>
      <div className="postr-step-reveal" data-revealed={revealed ? 'true' : 'false'}>
        <div ref={contentRef} style={{ overflow: 'hidden', minHeight: 0 }}>
          <div style={{ paddingTop: 12 }}>{children}</div>
        </div>
      </div>
    </section>
  );
}
