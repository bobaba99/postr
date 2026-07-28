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
 * 1. THE SENTENCE NEVER REFLOWS. The slot reserves the widest phrase,
 *    so the words after it never jump as phrases change. This only
 *    works because the phrases are written to a tight length budget —
 *    see HERO_FRICTIONS in Landing.tsx. An earlier attempt reserved
 *    the widest phrase over a set that ran 16–34 characters, which
 *    left a visible gap after every short phrase; the fix is equal
 *    phrases, not a slot that resizes under the reader.
 *
 * 2. REDUCED MOTION IS RESPECTED, and respected properly — not by
 *    animating anyway, and not by freezing on the first phrase
 *    forever. The text still changes so the reader sees every claim;
 *    it simply cross-fades instead of rotating. Anyone who has asked
 *    their OS to stop things moving gets that, without losing content.
 *
 * 3. IT IS READABLE BY A CRAWLER AND A SCREEN READER. All phrases are
 *    in the DOM. The visible one is announced via aria-live="polite"
 *    only when the user has NOT asked for reduced motion — otherwise
 *    a politely-announced change every few seconds is its own kind
 *    of hostile.
 *
 * The transition is a CUBE ROTATION: the outgoing phrase rotates away
 * about the x-axis while the incoming one rotates in behind it, so the
 * two read as adjacent faces of a solid rather than one word blinking
 * out and another blinking in. Both faces are in the DOM during the
 * turn — that is what makes it a rotation and not a cross-fade.
 */
import { useEffect, useRef, useState } from 'react';

/**
 * Dwell time per phrase, including the turn. 2600ms read as frantic;
 * at ~26 characters a phrase this leaves roughly three seconds to
 * actually finish reading one before it moves.
 */
const ROTATE_MS = 4200;

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
  // The phrase rotating OUT. null on first paint, so the hero does not
  // animate a face in from nothing before the reader has looked at it.
  const [previous, setPrevious] = useState<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (phrases.length <= 1) return;
    timer.current = window.setInterval(() => {
      setIndex((i) => {
        setPrevious(i);
        return (i + 1) % phrases.length;
      });
    }, ROTATE_MS);
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, [phrases.length]);

  const current = phrases[index % phrases.length] ?? '';
  const outgoing = previous === null ? null : phrases[previous % phrases.length] ?? null;

  return (
    <span className="postr-rotating-word">
      {/*
        Width reservation: ALL phrases, stacked in a grid cell so the
        slot is as wide as the genuinely widest one and as tall as one
        line. Present in layout, hidden from everyone.

        An earlier version reserved whichever phrase had the most
        CHARACTERS, which is not the same thing — measured at the
        hero's face, "the unreadable tiny figures" (27 chars, 219.4px)
        is wider than "the authors and affiliations" (28 chars,
        218.5px), so the slot came up 3px short and that one phrase
        overflowed. Letting the browser measure removes the guess, and
        also means new phrases can't silently break the layout.
      */}
      <span className="postr-rotating-word__sizer" aria-hidden="true">
        {phrases.map((phrase, i) => (
          <span key={i} className="postr-rotating-word__sizer-item">
            {phrase}
          </span>
        ))}
      </span>

      {/*
        Both faces are mounted during a turn. `key` on each face
        restarts its animation on every rotation; the outgoing face is
        aria-hidden so a screen reader never hears the old and new
        phrase as one run-on string.
      */}
      {outgoing !== null && !reducedMotion && (
        <span
          key={`out-${previous}-${index}`}
          aria-hidden="true"
          className={`postr-rotating-word__face postr-rotating-word__face--out ${className}`}
        >
          {outgoing}
        </span>
      )}

      <span
        // Announced only when motion is welcome — see the note above.
        aria-live={reducedMotion ? 'off' : 'polite'}
        className={`postr-rotating-word__face postr-rotating-word__face--in ${className}`}
        key={`in-${index}`}
      >
        {current}
      </span>
    </span>
  );
}
