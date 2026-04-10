/**
 * Shared GSAP eases — keeping these in one place so motion stays
 * visually consistent across the editor.
 *
 * GSAP accepts both string ease names and CustomEase functions.
 * The free core only ships the standard eases, so we use string
 * forms with the documented parameter syntax.
 */

/** Generic smooth ease — default for fades and small position tweens. */
export const SMOOTH = 'power2.out';

/** Slight overshoot — for "pop in" feels. ~10% past the target. */
export const OVERSHOOT = 'back.out(1.4)';

/** Quick snap — for button-press feedback (no overshoot). */
export const SNAP = 'power3.out';

/** Decelerate from full speed — for entrances landing softly. */
export const DECEL = 'expo.out';
