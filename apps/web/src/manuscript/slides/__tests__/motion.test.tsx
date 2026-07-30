/**
 * Task 10 — the wizard's motion contract, tested at its most load-bearing
 * seam: the reduced-motion gate.
 *
 * The one invariant a test can actually assert about GSAP (whose real work
 * is rAF-driven and invisible to jsdom) is that under
 * `prefers-reduced-motion: reduce` we hide nothing and move nothing — i.e.
 * the wizard never reaches `gsap.fromTo`. Every reveal in the wizard starts
 * content at `autoAlpha: 0` and tweens it in; if that tween is skipped in
 * reduced-motion mode but the hide is not, content vanishes. So this test
 * proves the WHOLE motion layer no-ops when the OS asks for calm, which is
 * exactly the accessibility guarantee the motion budget promises.
 *
 * A single positive assertion — motion DOES reach `fromTo` when the OS
 * allows it — keeps the reduced-motion test honest: without it, a shell
 * that simply never animated would pass the negative case trivially. The
 * FEEL of the timelines (durations, stagger, easing) is a browser review
 * (Task 10 Step 5), not a jsdom concern; here we only prove the gate.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import gsap from 'gsap';
import { SlidesWizard } from '../SlidesWizard';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * Stub matchMedia to model a real OS motion preference.
 *
 * A browser answers `(prefers-reduced-motion: reduce)` and
 * `(prefers-reduced-motion: no-preference)` as exact opposites, and the
 * wizard's entrance gate asks the affirmative `no-preference` question
 * (so it never hides content on a signal it cannot trust — jsdom's own
 * stub reports no-match for everything). This stub honors both queries so
 * both the no-op and the motion-fires paths are exercised faithfully.
 */
function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const wantsReduce = query.includes('reduce)');
    const wantsNoPreference = query.includes('no-preference');
    const matches = wantsNoPreference ? !reduce : wantsReduce ? reduce : false;
    return {
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    };
  });
}

describe('wizard motion', () => {
  it('skips gsap entirely under prefers-reduced-motion', () => {
    stubReducedMotion(true);
    const spy = vi.spyOn(gsap, 'fromTo');
    render(<SlidesWizard />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('animates the step-bar entrance on first mount when motion is allowed', () => {
    stubReducedMotion(false);
    const spy = vi.spyOn(gsap, 'fromTo');
    render(<SlidesWizard />);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
