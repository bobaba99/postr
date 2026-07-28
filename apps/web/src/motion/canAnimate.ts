/**
 * canAnimate — is it safe to hide content in order to animate it in?
 *
 * The marketing pages reveal content by starting it at `opacity: 0`
 * and tweening to 1. That is only safe if the tween is actually going
 * to run. GSAP advances on requestAnimationFrame, and rAF does not
 * fire in a background tab — so on a page opened in an inactive tab
 * (a restored session, a middle-click "open in new tab", a link
 * prefetch, an automated crawler or screenshotter) the hide happens,
 * the tween never advances, and the visitor switches to the tab to
 * find a blank page. Observed in exactly that state during review:
 * hero gone, seven of eight cards gone.
 *
 * `once: true` ScrollTriggers make it worse — the reveal is spent, so
 * the content never comes back even after the tab is focused.
 *
 * The rule this encodes: motion is an enhancement, and an enhancement
 * that cannot prove it will run does not get to hide anything. When
 * the document is hidden we skip the animation entirely and leave the
 * content in its final, visible, prerendered state — which is what a
 * crawler and a JS-disabled visitor already see.
 */

/**
 * True when animations may safely hide content before revealing it.
 *
 * Checked at setup time rather than watched: a page that starts hidden
 * simply renders static, and that is a perfectly good outcome. Adding
 * a visibilitychange listener to retro-fire entrance animations would
 * mean content sliding around under a user who just switched to the
 * tab and started reading — worse than no animation at all.
 */
export function canAnimate(): boolean {
  if (typeof document === 'undefined') return false;
  return !document.hidden;
}
