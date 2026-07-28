/**
 * canAnimate — the guard that keeps marketing content visible.
 *
 * Regression cover for a real, observed failure: the landing page was
 * opened in a background tab, GSAP's requestAnimationFrame ticker
 * never fired, and the entrance tweens sat forever on their hidden
 * first frame. Result was a near-blank page — hero gone, seven of
 * eight feature cards gone — on a prerendered, SEO-load-bearing page.
 *
 * These pages reveal content by hiding it first, so the decision
 * "may I hide this?" is the single point where that bug can come
 * back. It is cheap to test and expensive to rediscover.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { canAnimate } from '../canAnimate';

/**
 * `document.hidden` is a readonly accessor on the prototype, so it is
 * redefined rather than assigned. Configurable so afterEach can put
 * the original descriptor back and not leak into other suites.
 */
function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
}

afterEach(() => {
  // jsdom's own descriptor returns false; restoring it explicitly
  // keeps this suite from depending on test ordering.
  setDocumentHidden(false);
});

describe('canAnimate', () => {
  it('allows animation when the tab is visible', () => {
    setDocumentHidden(false);
    expect(canAnimate()).toBe(true);
  });

  it('refuses to animate when the tab is hidden', () => {
    // The load-bearing case. A false here is what stops the entrance
    // timelines from setting opacity: 0 on content that would never
    // be tweened back — the blank-page bug.
    setDocumentHidden(true);
    expect(canAnimate()).toBe(false);
  });
});
