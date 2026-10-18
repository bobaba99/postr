/**
 * How the user is moving around the page: with a pointer, or with the
 * keyboard. Kept on <html> as `data-postr-input-modality` ("pointer" or
 * "keyboard"), so index.css draws the house focus ring on buttons for
 * keyboard navigation only, and in pointer mode turns the browser's own
 * ring off on buttons, links, checkboxes and <summary> disclosures (plan
 * item 20, record docs/fixes/20-focus-ring.md).
 *
 * Why: the ring is drawn on `:focus-visible`, and Chromium turns
 * `:focus-visible` on for a button the mouse focused as soon as a key is
 * pressed: an arrow, Shift, Enter, Space, a letter, Esc, F2; not ⌘, Ctrl or
 * Alt, alone or in a chord. A mouse user who clicked Zoom in, FIT or a rail
 * tab and then nudged a block or held Shift saw a ring on that button.
 * Firefox draws none there, and WebKit does not focus a button on a click.
 *
 * The rule, in the order events arrive:
 *   - a pointer pressed anywhere (mouse, pen or touch) → "pointer";
 *   - Tab or Shift+Tab (with any modifier: Safari moves to buttons with
 *     Option+Tab) → "keyboard";
 *   - any other key leaves it as it is, even when the page then moves the
 *     focus (Esc closing a dialog gives it back to the opener; Enter opening
 *     one moves it in): the plan's rule, Enter and Esc after a click do not
 *     switch the ring on (review round 1 of record 20, R20-2).
 * Before any input the attribute is absent and the ring follows the
 * browser's own `:focus-visible`, as it did before this rule.
 *
 * The listeners are on the window in the capture phase, installed once at
 * startup (main.tsx), so they run before the page's own: a dialog stops
 * every key in the window's capture phase (ConfirmModal), and the block
 * controls stop the pointer's propagation.
 */

export const INPUT_MODALITY_ATTR = 'data-postr-input-modality';

export type InputModality = 'pointer' | 'keyboard';

/**
 * Start tracking the modality on `win`'s document. Returns a function that
 * stops it (for tests; the app tracks it for the life of the page).
 */
export function installInputModality(win: Window = window): () => void {
  const root = win.document.documentElement;
  const set = (m: InputModality) => {
    if (root.getAttribute(INPUT_MODALITY_ATTR) !== m) root.setAttribute(INPUT_MODALITY_ATTR, m);
  };
  const onPointerDown = () => set('pointer');
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Tab') set('keyboard');
  };
  win.addEventListener('pointerdown', onPointerDown, true);
  win.addEventListener('keydown', onKeyDown, true);
  return () => {
    win.removeEventListener('pointerdown', onPointerDown, true);
    win.removeEventListener('keydown', onKeyDown, true);
  };
}
