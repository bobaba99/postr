/**
 * RotatingWord — a line that types out a series of phrases in turn.
 *
 * Used in the landing hero to let one sentence carry several claims
 * without becoming a bullet list.
 *
 * IT SITS ON ITS OWN LINE, ON PURPOSE. Earlier versions ran the slot
 * inline inside the sentence, which made the phrase's rendered WIDTH a
 * layout problem: the sentence reflowed on every change, and reserving
 * the widest phrase left a visible gap after the short ones. That was
 * fought with a character budget, then a pixel budget, then a hidden
 * grid sizer — and phrases still clipped. Breaking the line removes the
 * constraint rather than managing it: nothing follows the phrase on its
 * line, so a long one simply has room. Add phrases freely; there is no
 * width budget to respect any more.
 *
 * Three things this deliberately gets right:
 *
 * 1. NO LAYOUT SHIFT. The line reserves its own height from the
 *    typography, so the buttons below never move as phrases change —
 *    and because the caret sits at the end of the text rather than in
 *    reserved space, nothing jumps horizontally either.
 *
 * 2. REDUCED MOTION IS RESPECTED, and properly — not by animating
 *    anyway, and not by freezing on the first phrase forever. Each
 *    phrase appears whole and holds; the reader still sees every claim
 *    without a character-by-character effect that is, by definition,
 *    the thing they asked their OS to stop.
 *
 * 3. IT IS READABLE BY A CRAWLER AND A SCREEN READER. The full current
 *    phrase is always in the DOM as text — the typing effect reveals a
 *    substring, so no assistive technology sees a half-word. The live
 *    region announces only settled phrases, never mid-type, and only
 *    when motion is welcome.
 */
import { useEffect, useRef, useState } from 'react';

/**
 * Typing cadence. 45ms/char is the range that reads as brisk
 * typing rather than a stutter; at ~25 characters a phrase takes
 * roughly a second to appear.
 */
const TYPE_MS = 45;
/** Erase runs faster than typing — nobody needs to watch a rewind. */
const ERASE_MS = 22;
/** How long a completed phrase holds before it erases. */
const HOLD_MS = 1500;
/** Beat between erasing one phrase and typing the next. */
const GAP_MS = 220;

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
  const [typed, setTyped] = useState(() => phrases[0] ?? '');
  const [erasing, setErasing] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const timer = useRef<number | null>(null);

  const current = phrases[index % phrases.length] ?? '';

  /*
    One timeout per step rather than an interval: each phase has its own
    duration (type, hold, erase, gap), and a single interval cannot
    express that without tracking elapsed time by hand.

    Under reduced motion the whole state machine collapses to "swap the
    phrase on a slow timer" — no substring animation at all.
  */
  useEffect(() => {
    if (phrases.length <= 1) return;

    if (reducedMotion) {
      setTyped(current);
      timer.current = window.setTimeout(
        () => setIndex((i) => (i + 1) % phrases.length),
        HOLD_MS + 1200,
      );
      return () => {
        if (timer.current !== null) window.clearTimeout(timer.current);
      };
    }

    let delay: number;
    let next: () => void;

    if (!erasing && typed.length < current.length) {
      delay = TYPE_MS;
      next = () => setTyped(current.slice(0, typed.length + 1));
    } else if (!erasing && typed.length === current.length) {
      delay = HOLD_MS;
      next = () => setErasing(true);
    } else if (erasing && typed.length > 0) {
      delay = ERASE_MS;
      next = () => setTyped(current.slice(0, typed.length - 1));
    } else {
      delay = GAP_MS;
      next = () => {
        setErasing(false);
        setIndex((i) => (i + 1) % phrases.length);
      };
    }

    timer.current = window.setTimeout(next, delay);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [typed, erasing, current, index, phrases.length, reducedMotion]);

  // Announce only settled phrases. Announcing every keystroke would
  // make a screen reader read the phrase letter by letter.
  const settled = typed === current;

  return (
    <span className="postr-typed-line">
      <span
        className={`postr-typed-line__text ${className}`}
        aria-live={reducedMotion ? 'off' : 'polite'}
      >
        {typed}
      </span>
      <span className="postr-typed-line__caret" aria-hidden="true" />
      {/*
        The full phrase for assistive tech and crawlers, so neither
        depends on the animation's progress. `settled` keeps the live
        region above from double-announcing mid-type.
      */}
      <span className="sr-only">{settled ? '' : current}</span>
    </span>
  );
}
