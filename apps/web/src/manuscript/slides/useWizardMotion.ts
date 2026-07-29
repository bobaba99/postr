/**
 * useWizardMotion — the wizard's entire GSAP layer, in one scoped hook.
 *
 * Motion budget (Task 10 / spec §Phase 2 motion — animate occasional and
 * first-time surfaces only, never keyboard-repeated actions):
 *
 *   • step-bar cards, FIRST mount — staggered fade + rise, 40ms stagger,
 *     `--ease-out`, 220ms. Occasional surface → animate.
 *   • active-step change — the newly-active card's open body fades/rises
 *     in (`animateStepIn`, 220ms). Occasional → animate.
 *   • export drawer OPEN — `playExportDrawer`, `--ease-drawer`, 280ms
 *     opacity + short rise. Occasional → animate. Close is an instant
 *     React unmount (no exit tween): the reveal is the only beat worth
 *     spending motion on, and no lingering surface keeps the code honest.
 *
 * Deliberately NOT animated here: thumbnail selection, text input, and the
 * progress bar (all high-frequency — a single CSS transition, never a
 * per-frame tween). Button :active compression is CSS (index.css), not
 * GSAP. Finding cards (star-finding step) are SKIPPED — that UI does not
 * exist in Phase 1; wire their stagger when it lands.
 *
 * Everything is transform/opacity only (via GSAP `autoAlpha` + `y`), never
 * `scale(0)`. Under `prefers-reduced-motion` every tween no-ops and the
 * surfaces render in their resting, fully-visible state — the drawer body
 * is toggled by React's mount/unmount, so nothing is left hidden. We also
 * honor the hidden-tab guard (`canAnimate`): a wizard opened in a
 * background tab renders static rather than hiding content behind a tween
 * that rAF will never advance.
 */
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { RefObject } from 'react';
import { canAnimate } from '@/motion/canAnimate';

gsap.registerPlugin(useGSAP);

// House curves, mirrored from the `--ease-*` tokens in index.css. GSAP
// cannot read a CSS custom property, so the cubic-bezier values live here
// too — the same design decision expressed twice. Keep in sync.
const EASE_OUT = 'cubic-bezier(0.22,1,0.36,1)';
const EASE_DRAWER = 'cubic-bezier(0.32,0.72,0,1)';

/**
 * May a hide-then-reveal entrance run right now?
 *
 * This asks the AFFIRMATIVE question — "does the OS positively allow
 * motion?" — not the weaker "is reduce unset?". The distinction is the
 * same one `landingEntrance` relies on: any surface that starts content at
 * `autoAlpha: 0` must be certain the tween will actually advance, or that
 * hidden first frame becomes the last frame. Three things must all hold:
 *
 *   • `prefers-reduced-motion: no-preference` matches — a real motion-OK
 *     signal. Under jsdom the matchMedia stub reports no-match for every
 *     query, so this is false and entrances simply don't run in tests,
 *     leaving content visible for role/text queries (mirrors the landing
 *     page's test-safety).
 *   • `canAnimate()` — the tab is visible, so rAF will tick.
 */
function entranceAllowed(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  const motionOk = window.matchMedia(
    '(prefers-reduced-motion: no-preference)',
  ).matches;
  return motionOk && canAnimate();
}

/** Reactive inputs the scoped orchestration re-synchronizes against. */
interface WizardMotionState {
  /** The active step id — changes drive the active card-body reveal. */
  activeStep?: string;
  /** Whether the export drawer is open — changes drive its reveal/exit. */
  exportOpen?: boolean;
}

export function useWizardMotion(
  // Nullable to match a real React ref (`useRef<HTMLElement>(null)`), whose
  // node is null until the first render commits.
  scopeRef: RefObject<HTMLElement | null>,
  opts: { reducedMotion: boolean } & WizardMotionState,
) {
  const { reducedMotion, activeStep, exportOpen } = opts;

  // Step entry: fade + subtle rise. Never scale(0). <300ms. transform +
  // opacity only. Returned for imperative callers/tests.
  const animateStepIn = (el: HTMLElement) => {
    if (reducedMotion) return;
    gsap.fromTo(
      el,
      { autoAlpha: 0, y: 8 },
      { autoAlpha: 1, y: 0, duration: 0.22, ease: EASE_OUT },
    );
  };

  // Export drawer reveal — opacity + a short rise. Enter is unhurried
  // (280ms); exit is quicker (180ms) so dismissal feels immediate.
  const playExportDrawer = (el: HTMLElement, open: boolean) => {
    if (reducedMotion) {
      el.style.opacity = open ? '1' : '0';
      return;
    }
    if (open) {
      gsap.fromTo(
        el,
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, duration: 0.28, ease: EASE_DRAWER },
      );
    } else {
      gsap.to(el, { autoAlpha: 0, y: 10, duration: 0.18, ease: EASE_DRAWER });
    }
  };

  // ── Scoped orchestration ───────────────────────────────────────────
  // One useGSAP owns the reactive tweens: it re-runs (reverting the prior
  // context) whenever the active step or drawer state changes, so every
  // tween is cleaned up on unmount and on each re-sync. Selectors are
  // scoped to the wizard root — they never reach elements outside it.

  // First-mount stagger for the step-bar cards. Empty deps → runs once.
  useGSAP(
    () => {
      if (!entranceAllowed()) return;
      const cards = gsap.utils.toArray<HTMLElement>('[data-motion-card]');
      if (cards.length === 0) return;
      gsap.fromTo(
        cards,
        { autoAlpha: 0, y: 8 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.22,
          ease: EASE_OUT,
          stagger: 0.04, // 40ms — within the 30–80ms budget
        },
      );
    },
    { scope: scopeRef },
  );

  // Active-step change → reveal the newly-active card's open body.
  useGSAP(
    () => {
      if (!entranceAllowed()) return;
      const body = scopeRef.current?.querySelector<HTMLElement>(
        '[data-step-body][data-active="true"]',
      );
      if (body) animateStepIn(body);
    },
    { dependencies: [activeStep], scope: scopeRef },
  );

  // Export drawer open → reveal the drawer body. Only the OPEN body is in
  // the DOM (React mounts it conditionally), so close is an instant unmount
  // with no lingering exit tween — the reveal is the only occasional beat
  // worth spending motion on.
  useGSAP(
    () => {
      if (!entranceAllowed()) return;
      const body = scopeRef.current?.querySelector<HTMLElement>(
        '[data-export-body]',
      );
      if (body && exportOpen) playExportDrawer(body, true);
    },
    { dependencies: [exportOpen], scope: scopeRef },
  );

  return { animateStepIn, playExportDrawer };
}
