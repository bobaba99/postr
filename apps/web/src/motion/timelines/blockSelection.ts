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

/**
 * Ends every selection pop still running on the frames under `root`: each
 * jumps to its end (scale 1, a turned block keeping its turn). The print
 * function calls it before it copies the sheet (record 30): a block
 * selected and printed at once (⌘P a moment after the click) printed up to
 * 0.6 in larger, its frame copied mid-pop (MEASURED, print-path-check
 * key+fresh: a title 0.598 in wider, a chart 0.344 in, in Chromium).
 */
export function finishBlockSelections(root: Element): void {
  const frames = root.querySelectorAll('[data-block-id]');
  if (!frames.length) return;
  for (const tween of gsap.getTweensOf(frames)) tween.progress(1);
}
