/**
 * Motion module — public surface.
 *
 * Imports the GSAP singleton and configures the reduced-motion gate
 * once at module load. Anything that wants to fire a timeline goes
 * through `useGsapContext` (component-scoped) and the named timeline
 * factories under `motion/timelines/`.
 */
import { gsap } from 'gsap';

// Reduced-motion gate: when the OS prefers reduced motion, collapse
// every default duration to ~0 so animations effectively become
// instant transitions. Individual timelines can still opt out by
// passing an explicit duration to .to()/.from(), but the defaults
// shrink — which covers ~95% of our usage.
const mm = gsap.matchMedia();
mm.add(
  {
    isReduced: '(prefers-reduced-motion: reduce)',
  },
  (ctx) => {
    if (ctx.conditions?.isReduced) {
      gsap.defaults({ duration: 0.001 });
    }
  },
);

export { gsap };
export * from './eases';
export * from './presets';
export { useGsapContext } from './useGsapContext';
