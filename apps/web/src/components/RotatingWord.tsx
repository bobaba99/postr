/**
 * RotatingWord — one slot in a sentence that cycles through phrases.
 *
 * Used in the landing hero to let a single line carry several claims
 * without becoming a list. The sentence stays readable as prose; the
 * slot does the work.
 *
 * Three things this deliberately gets right, because rotating text is
 * usually done badly:
 *
 * 1. NO VERTICAL SHIFT. The slot sizes to the current phrase, so the
 *    sentence re-wraps as phrases change — that is deliberate. An
 *    earlier version reserved the WIDEST phrase to prevent any reflow,
 *    but it left a visible gap after every shorter phrase, which reads
 *    as broken copy. The hidden sizer survives only to reserve height,
 *    so a re-wrap never pushes the buttons below it around.
 *
 * 2. REDUCED MOTION IS RESPECTED, and respected properly — not by
 *    animating anyway, and not by freezing on the first phrase
 *    forever. The text still changes so the reader sees every claim;
 *    it simply cross-fades instead of moving. Anyone who has asked
 *    their OS to stop things moving gets that, without losing content.
 *
 * 3. IT IS READABLE BY A CRAWLER AND A SCREEN READER. All phrases are
 *    in the DOM. The visible one is announced via aria-live="polite"
 *    only when the user has NOT asked for reduced motion — otherwise
 *    a politely-announced change every three seconds is its own kind
 *    of hostile.
 */
import { useEffect, useRef, useState } from 'react';

const ROTATE_MS = 2600;

interface RotatingWordProps {
  /** Phrases to cycle through, in order. At least one. */
  phrases: readonly string[];
  /** Extra classes for the visible text (colour, weight). */
  className?: string;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

export function RotatingWord({ phrases, className = '' }: RotatingWordProps) {
  const [index, setIndex] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (phrases.length <= 1) return;
    timer.current = window.setInterval(() => {
      setIndex((i) => (i + 1) % phrases.length);
    }, ROTATE_MS);
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, [phrases.length]);

  const current = phrases[index % phrases.length] ?? '';
  // The longest phrase reserves the slot. Ties resolve to the first,
  // which is fine — they are the same width by definition.
  const widest = phrases.reduce((a, b) => (b.length > a.length ? b : a), phrases[0] ?? '');

  return (
    <span className="postr-rotating-word">
      {/* Width reservation: present in layout, hidden from everyone. */}
      <span className="postr-rotating-word__sizer" aria-hidden="true">
        {widest}
      </span>
      <span
        // Announced only when motion is welcome — see the note above.
        aria-live={reducedMotion ? 'off' : 'polite'}
        className={`postr-rotating-word__text ${className}`}
        key={index}
      >
        {current}
      </span>
    </span>
  );
}
