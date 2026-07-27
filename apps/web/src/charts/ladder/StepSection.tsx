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
  fontSize: 11,
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
  useEffect(() => {
    if (state !== 'active') return;
    const frame = requestAnimationFrame(() => setRevealed(true));
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
    return () => cancelAnimationFrame(frame);
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
              fontSize: 12,
              cursor: 'pointer',
              padding: '2px 4px',
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
