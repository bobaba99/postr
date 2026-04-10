/**
 * useGsapContext — React 18 / Strict-Mode-safe wrapper around
 * `gsap.context()`.
 *
 * Why: GSAP timelines created inside React effects must be cleaned
 * up on unmount AND on Strict Mode's intentional double-mount,
 * otherwise tweens leak across remounts and you get flicker. The
 * official pattern is `gsap.context(scope)` which records every
 * tween created inside the callback and reverts them all in one
 * call.
 *
 * Usage:
 *
 *   const ref = useRef<HTMLDivElement>(null);
 *   useGsapContext(() => {
 *     gsap.from('.sidebar', { x: -100, duration: 0.4 });
 *     gsap.from('#poster-canvas', { opacity: 0, scale: 0.96 });
 *   }, ref);
 *
 *   <div ref={ref}>...</div>
 */
import { useLayoutEffect, type RefObject } from 'react';
import { gsap } from 'gsap';

type SetupFn = (ctx: gsap.Context) => void;

export function useGsapContext(setup: SetupFn, scopeRef: RefObject<Element | null>) {
  useLayoutEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    const ctx = gsap.context(setup, scope);
    return () => ctx.revert();
    // We deliberately re-run only when the scope element identity
    // changes — caller controls re-runs by changing the setup closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeRef]);
}
