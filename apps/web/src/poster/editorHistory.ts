/**
 * The editor's ONE undo history: which key presses and which browser
 * events reach it, which fields keep the browser's own undo, and where the
 * caret goes after a text step is undone or redone. Plan item 12, the
 * owner's decisions of 2026-10-06; record docs/fixes/12-one-undo-history.md.
 *
 * Before this, the browser's own undo ran in every text field (the editor's
 * ⌘Z handler returned before `preventDefault` there), its changes were
 * committed back as new edits, and it crossed blocks and fields: two
 * histories that never met.
 *
 * ZONES. Everything in the editor edits the poster and uses the store's
 * history, except:
 *   - text fields inside an element marked `data-own-undo` (the Figure
 *     tab's code box, the poster name, the version name, the paste boxes
 *     and other drafts that are not the poster yet): they keep the
 *     browser's undo for their own text;
 *   - while a dialog or the preview is open: ⌘Z there never edits the
 *     poster; a text field in the dialog keeps its own undo.
 * The browser's history is per document in Chromium and WebKit, so its
 * undo in such a field can step on to a canvas block: `beforeinput` of
 * type historyUndo/historyRedo aimed anywhere but the field the key was
 * pressed in is cancelled (`historyInputVerdict`).
 *
 * No React here; `useEditorHistory.ts` installs the listeners.
 */
import { usePosterStore } from '@/stores/posterStore';
import { textTargetOf, type TextTarget } from '@/stores/historySteps';

export type HistoryDirection = 'undo' | 'redo';

/** Marks a container whose text fields keep the browser's own undo (see ZONES). */
export const OWN_UNDO_ATTR = 'data-own-undo';

/**
 * A key pressed on the Undo or Redo button (`HistoryButtons.tsx`, its group
 * `data-postr-history-buttons`) is the button's: Enter and Space press it,
 * and the editor's delete / nudge / duplicate keys must not reach the
 * poster from there. A press from the keyboard keeps the focus on the
 * button, so the next key lands there (fix 12 review R3-F1: an arrow moved
 * the selected block and Backspace removed it, the redo lost).
 */
export function onHistoryButtons(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-postr-history-buttons]') !== null;
}

/**
 * The history action a key press asks for, or null. ⌘Z / Ctrl+Z undo;
 * ⌘⇧Z / Ctrl+Shift+Z / ⌘Y / Ctrl+Y redo. The letter is matched without
 * case (Shift turns "z" into "Z" in some browsers and on Windows), and by
 * its physical key only when the layout types a letter that is not Latin
 * there (a Cyrillic or Greek layout): on Dvorak the physical Z key types
 * ";", and ⌘; is not undo (fix 12 review R1-F5). Alt is left alone: AltGr
 * is Ctrl+Alt on Windows.
 */
export function historyKeyAction(e: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>): HistoryDirection | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  const k = typeof e.key === 'string' ? e.key.toLowerCase() : '';
  const otherLetter = /^\p{L}$/u.test(k);
  const letter = /^[a-z]$/.test(k) ? k : !otherLetter ? '' : e.code === 'KeyZ' ? 'z' : e.code === 'KeyY' ? 'y' : '';
  if (letter === 'z') return e.shiftKey ? 'redo' : 'undo';
  return letter === 'y' ? 'redo' : null;
}

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number']);

/** A field the user types text into: a text-like input, a textarea, or an editing host. */
export function isTextEntry(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') return TEXT_INPUT_TYPES.has((el as HTMLInputElement).type);
  return el.closest('[contenteditable]') !== null;
}

/** A text field that keeps the browser's own undo: inside `data-own-undo`, or in a dialog. */
export function keepsOwnUndo(el: Element | null): boolean {
  return isTextEntry(el) && (el.closest(`[${OWN_UNDO_ATTR}]`) !== null || inDialog(el));
}

const DIALOG = '[role="dialog"][aria-modal="true"], [data-postr-modal-content]';

function inDialog(el: Element): boolean {
  return el.closest(DIALOG) !== null;
}

/**
 * A dialog is open (one that is closing has been answered already). Wider
 * than PosterEditor's `modalDialogOpen`: some of the app's modals carry the
 * shared modal markup but no `aria-modal`.
 */
export function dialogOpen(): boolean {
  return Array.from(document.querySelectorAll(DIALOG)).some((d) => d.getAttribute('data-state') !== 'closing');
}

/**
 * What a ⌘Z / ⌘⇧Z key press does, from where it was pressed:
 *   'history' — the editor undoes or redoes (the key is cancelled);
 *   'own'     — left to the browser for that field (the code box, a field
 *               in a dialog);
 *   'block'   — cancelled and nothing else (a dialog or the preview is
 *               open and the focus is not in a field of its own).
 */
export function routeHistoryKey(target: Element | null, overlayOpen: boolean): 'history' | 'own' | 'block' {
  if (keepsOwnUndo(target)) return 'own';
  return overlayOpen ? 'block' : 'history';
}

/**
 * The key press being handled right now, for the `beforeinput` the same
 * press may fire. Set by the keydown, cleared at the end of the task: a
 * browser fires the history input inside the key's own task.
 */
let pressNow: { route: 'history' | 'own' | 'block'; field: HTMLElement | null } | null = null;

export function notePress(route: 'history' | 'own' | 'block', field: Element | null) {
  pressNow = { route, field: field instanceof HTMLElement ? field : null };
  setTimeout(() => {
    pressNow = null;
  }, 0);
}

/**
 * What to do with a `beforeinput` of type historyUndo / historyRedo:
 *   'allow'  — the field's own undo, in the field the key was pressed in;
 *   'cancel' — anything else the browser's history would change (the
 *              browser keeps the focus where it was: MEASURED in Chromium,
 *              Firefox and WebKit, record section 7);
 *   'route'  — cancel it and run the editor's history instead: the
 *              browser's Edit menu (no key press) with the focus in the
 *              poster.
 */
export function historyInputVerdict(target: Element | null, overlayOpen: boolean): 'allow' | 'cancel' | 'route' {
  const press = pressNow;
  if (press) return press.route === 'own' && target === press.field ? 'allow' : 'cancel';
  // No key press: the browser's menu, or a gesture. In a field that keeps
  // its own undo, that field's own history; elsewhere, the poster's.
  const active = document.activeElement;
  if (keepsOwnUndo(target) && target === active) return 'allow';
  if (overlayOpen || keepsOwnUndo(active)) return 'cancel';
  return 'route';
}

// ------------------------------------------------------------ the caret

/** Which copy of a text field asks for the caret after an undo: the canvas or the sidebar. */
export type EditorSurface = 'canvas' | 'sidebar';

let focusRequest: { key: string; surface: EditorSurface } | null = null;

/**
 * Called by an editor when its field's value changed from outside (an undo
 * or redo): true when it should take the focus and select what changed.
 * The request is consumed by the first editor that matches.
 */
export function takeHistoryFocus(key: string | undefined, surface: EditorSurface): boolean {
  if (!key || !focusRequest || focusRequest.key !== key || focusRequest.surface !== surface) return false;
  focusRequest = null;
  return true;
}

/** How a history step was asked for. */
export interface HistoryRunOptions {
  /**
   * Leave the focus where it is (an Undo or Redo button pressed from the
   * keyboard or by assistive technology): moving it into the text would
   * make the next Enter or Space type there (fix 12 review R2-F2).
   */
  keepFocus?: boolean;
}

/**
 * Run one undo or redo of the editor's history. Returns whether a step was
 * applied, and the text field it changed when it was a text step (owner
 * decision 4: that field gets the focus, with the restored text selected,
 * unless `keepFocus`). The copy of the field that has the focus keeps it
 * (the sidebar's Content box); otherwise the canvas's copy takes it.
 */
export function runHistory(dir: HistoryDirection, opts: HistoryRunOptions = {}): { applied: boolean; target: TextTarget | null } {
  const store = usePosterStore.getState();
  const before = store.doc;
  focusRequest = null;
  const applied = dir === 'undo' ? store.undo() : store.redo();
  if (!applied) return { applied, target: null };
  const target = textTargetOf(before, usePosterStore.getState().doc);
  if (target && !opts.keepFocus) {
    const active = document.activeElement as HTMLElement | null;
    const here = active?.closest('[data-history-key]');
    const surface: EditorSurface =
      here && here.getAttribute('data-history-key') === target.key && here.getAttribute('data-history-surface') === 'sidebar'
        ? 'sidebar'
        : 'canvas';
    // Taken by the editor of that field as it renders the restored value:
    // every block's editors are on the canvas, and the sidebar's copy is
    // picked only when it has the focus, so one always takes it.
    focusRequest = { key: target.key, surface };
  }
  return { applied, target };
}
