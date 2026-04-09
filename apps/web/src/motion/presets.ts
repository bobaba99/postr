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
