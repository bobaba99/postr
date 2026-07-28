/**
 * Shared GSAP eases — keeping these in one place so motion stays
 * visually consistent across the editor.
 *
 * GSAP accepts both string ease names and CustomEase functions.
 * The free core only ships the standard eases, so we use string
 * forms with the documented parameter syntax.
 */
import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(CustomEase);

/**
 * The house curves, registered as CustomEase from the SAME
 * cubic-bezier values as the `--ease-*` tokens in index.css.
 *
 * These exist because the marketing pages animate elements that sit
 * directly beside CSS-driven ones — a GSAP card reveal next to a CSS
 * `transition-colors` hover on the same card. An approximation like
 * `power2.out` is visibly not `cubic-bezier(0.22, 1, 0.36, 1)`: the
 * house curve leaves far harder and settles later, so a "close
 * enough" built-in reads as two different systems on one surface.
 * Registering the real values means there is one curve, defined once
 * in CSS, mirrored here.
 *
 * Keep in sync with `:root` in index.css. If a token changes there,
 * change it here — they are the same design decision expressed twice
 * because CSS and GSAP cannot share a value.
 */

/** Entering / exiting UI. Mirrors `--ease-out`. */
export const HOUSE_OUT = CustomEase.create('postrOut', '0.22, 1, 0.36, 1');

/** Movement / morph on screen. Mirrors `--ease-in-out`. */
export const HOUSE_IN_OUT = CustomEase.create('postrInOut', '0.77, 0, 0.175, 1');

/** Subtle overshoot "pop". Mirrors `--ease-back`. */
export const HOUSE_BACK = CustomEase.create('postrBack', '0.34, 1.3, 0.64, 1');

/** Generic smooth ease — default for fades and small position tweens. */
export const SMOOTH = 'power2.out';

/** Slight overshoot — for "pop in" feels. ~10% past the target. */
export const OVERSHOOT = 'back.out(1.4)';

/** Quick snap — for button-press feedback (no overshoot). */
export const SNAP = 'power3.out';

/** Decelerate from full speed — for entrances landing softly. */
export const DECEL = 'expo.out';
