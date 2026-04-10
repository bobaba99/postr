/**
 * editorEntrance — slides the sidebar in from the left and fades +
 * scales the canvas in. Runs once on PosterEditor mount.
 *
 * Selectors are scoped to the GSAP context that wraps PosterEditor's
 * root <div>, so we can use simple class/id selectors safely.
 *
 * IMPORTANT: the scale tween targets [data-postr-canvas-frame], the
 * OUTER boxShadow wrapper — NOT #poster-canvas itself. #poster-canvas
 * owns the `transform: scale(${zoom})` that React manages for the
 * fit-to-viewport zoom bar, so letting GSAP write to its transform
 * would clobber the zoom on mount and the poster would appear stuck
 * at ~1× regardless of what the bar says.
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
    '[data-postr-canvas-frame]',
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
