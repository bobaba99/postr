import type { KeyboardEvent } from 'react';

/**
 * A held Enter repeats, and each repeat activates the focused button. The
 * guidelines panel's two toggles hand focus to each other (fix 03), so a
 * held Enter flipped the panel open and shut on every repeat. Only the
 * first press counts.
 */
export function ignoreRepeatedEnter(e: KeyboardEvent) {
  if (e.key === 'Enter' && e.repeat) e.preventDefault();
}
