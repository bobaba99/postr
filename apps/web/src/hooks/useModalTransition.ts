/**
 * useModalTransition — keeps a modal mounted through its exit animation.
 *
 * Modals in this app render an entrance animation on mount (via the
 * `[data-postr-modal-backdrop] / [data-postr-modal-content]` CSS) but
 * historically unmounted instantly on close (`if (!open) return null`),
 * so the exit had no motion — the dialog just vanished, leaving the
 * gesture's spatial story half-told.
 *
 * This hook defers the unmount: when `open` flips false it keeps the
 * component mounted for `exitMs` and reports `state: 'closing'`, which
 * the CSS uses (`[data-state='closing']`) to play a short reverse
 * animation — faster than the entrance, per the asymmetric-timing rule
 * (the system's response snaps). After `exitMs` it unmounts.
 *
 * Usage:
 *
 *   const { mounted, state } = useModalTransition(open);
 *   if (!mounted) return null;
 *   // <div data-postr-modal-backdrop data-state={state}>
 *   //   <div data-postr-modal-content data-state={state}>…
 *
 * Under `prefers-reduced-motion`, the CSS nulls both animations, so the
 * only effect is a sub-frame delay before unmount — imperceptible.
 */
import { useEffect, useRef, useState } from 'react';

export type ModalTransitionState = 'open' | 'closing';

export function useModalTransition(open: boolean, exitMs = 140) {
  const [mounted, setMounted] = useState(open);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      // Re-opening mid-exit: cancel the pending unmount and stay up.
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      setMounted(true);
      return;
    }
    if (!mounted) return;
    // Closing: hold the mount for the exit animation, then drop it.
    timer.current = setTimeout(() => {
      setMounted(false);
      timer.current = null;
    }, exitMs);
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [open, mounted, exitMs]);

  return { mounted, state: (open ? 'open' : 'closing') as ModalTransitionState };
}
