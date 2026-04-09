/**
 * editorEntrance — slides the sidebar in from the left and fades +
 * scales the canvas in. Runs once on PosterEditor mount.
 *
 * Selectors are scoped to the GSAP context that wraps PosterEditor's
 * root <div>, so we can use simple class/id selectors safely.
 */
import { gsap, DECEL, SMOOTH, DURATION } from '..';

export function editorEntrance(): gsap.core.Timeline {
  const tl = gsap.timeline();

  tl.from('[data-postr-sidebar]', {
    x: -40,
    autoAlpha: 0,
    duration: DURATION.slow,
    ease: DECEL,
  });

  tl.from(
    '#poster-canvas',
    {
      autoAlpha: 0,
      scale: 0.96,
      transformOrigin: 'center center',
      duration: DURATION.slow,
      ease: SMOOTH,
    },
    '<0.05', // overlap slightly with the sidebar slide
  );

  return tl;
}
