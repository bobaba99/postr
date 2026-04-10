/**
 * blockSelection — soft pop on the selection ring when a block is
 * newly selected. Run from BlockFrame on `selected` flipping true.
 */
import { gsap, OVERSHOOT, DURATION } from '..';

export function blockSelection(target: Element): gsap.core.Tween {
  return gsap.fromTo(
    target,
    { scale: 1.04 },
    {
      scale: 1,
      duration: DURATION.base,
      ease: OVERSHOOT,
      transformOrigin: 'center center',
    },
  );
}
