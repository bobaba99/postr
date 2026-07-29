import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { RefObject } from 'react';

gsap.registerPlugin(useGSAP);

const EASE_OUT = 'cubic-bezier(0.22,1,0.36,1)';
const EASE_DRAWER = 'cubic-bezier(0.32,0.72,0,1)';

export function useWizardMotion(
  scopeRef: RefObject<HTMLElement>,
  opts: { reducedMotion: boolean },
) {
  const { reducedMotion } = opts;

  // Step entry: fade + subtle rise. Never scale(0). <300ms. transform+opacity only.
  const animateStepIn = (el: HTMLElement) => {
    if (reducedMotion) return;
    gsap.fromTo(
      el,
      { autoAlpha: 0, y: 8 },
      { autoAlpha: 1, y: 0, duration: 0.22, ease: EASE_OUT },
    );
  };

  // Export drawer: height-safe reveal via scaleY from origin top + opacity.
  const playExportDrawer = (el: HTMLElement, open: boolean) => {
    if (reducedMotion) {
      el.style.opacity = open ? '1' : '0';
      return;
    }
    gsap.to(el, {
      autoAlpha: open ? 1 : 0,
      duration: open ? 0.28 : 0.18, // exit faster than enter
      ease: EASE_DRAWER,
    });
  };

  return { animateStepIn, playExportDrawer };
}
