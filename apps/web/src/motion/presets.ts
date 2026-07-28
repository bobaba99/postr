/**
 * Duration constants for GSAP timelines.
 *
 * Friction principle: nothing animates longer than ~400ms. Most
 * micro-interactions sit at `base` (280ms). `slow` is reserved for
 * the editor entrance and template re-flows.
 */
export const DURATION = {
  /** Button presses, hover blooms */
  quick: 0.18,
  /** Default for selection rings, fades, tab cross-fades */
  base: 0.28,
  /** Editor entrance, layout reflow */
  slow: 0.42,
} as const;

/** Default stagger between sibling animations (template apply, etc.). */
export const STAGGER = 0.04;

/**
 * Durations mirroring the `--dur-*` tokens in index.css, in seconds.
 *
 * Separate from DURATION above on purpose: those three are the
 * editor's own scale and predate the CSS tokens. These are the CSS
 * vocabulary exactly, for surfaces where GSAP motion runs alongside
 * CSS transitions and any mismatch reads as two systems. A GSAP
 * reveal at 800ms beside a CSS hover at 220ms is the specific
 * incoherence this prevents.
 *
 * Keep in sync with `:root` in index.css.
 */
export const CSS_DURATION = {
  /** `--dur-press`: 120ms */
  press: 0.12,
  /** `--dur-fast`: 160ms */
  fast: 0.16,
  /** `--dur-base`: 220ms */
  base: 0.22,
  /** `--dur-slow`: 280ms */
  slow: 0.28,
} as const;

/**
 * Stagger for marketing-page reveals.
 *
 * 60ms: enough that a row of cards reads as arriving in sequence
 * rather than as one block, small enough that a 3-card row finishes
 * within ~120ms of the first — so the whole group still lands inside
 * the 300ms house budget rather than trickling.
 */
export const REVEAL_STAGGER = 0.06;
