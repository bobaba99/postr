/**
 * Undo and Redo buttons, at the left of the editor's top bar
 * (`EditorTopBar`; owner decision 5 of 2026-10-06, fix 12; record
 * docs/fixes/12-one-undo-history.md). Before, the keyboard was the only
 * way to undo: a touch screen without one had none.
 *
 * Each is greyed and disabled when there is nothing to undo or redo
 * (`canUndo` / `canRedo` from the store), named for assistive technology,
 * and a real <button>, so Tab reaches it and Enter or Space presses it.
 * A press runs the same history as ⌘Z (`onRun`). A mouse or touch press
 * puts the caret back into the text a step changed (decision 4); a press
 * from the keyboard or by assistive technology (a click with a click count
 * of 0) leaves the focus on the button, so pressing it again undoes again
 * instead of typing into the poster (review round 2, R2-F2), and selects
 * no block. Other keys pressed on the buttons are theirs: the editor's
 * delete / nudge / duplicate keys do not act from the group
 * (`onHistoryButtons`, review round 3, R3-F1).
 */
import type { CSSProperties, MouseEvent } from 'react';
import { usePosterStore } from '@/stores/posterStore';
import type { HistoryDirection, HistoryRunOptions } from './editorHistory';

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** A button's side, the gap between buttons, the group's padding and border (px). */
export const TOP_BAR_BUTTON = 28;
export const TOP_BAR_GROUP_GAP = 2;
export const TOP_BAR_GROUP_PAD = 3;
export const TOP_BAR_GROUP_BORDER = 1;
/** The History group's width: two buttons, the gap between them, its padding and border. */
export const HISTORY_GROUP_WIDTH = 2 * TOP_BAR_BUTTON + TOP_BAR_GROUP_GAP + 2 * TOP_BAR_GROUP_PAD + 2 * TOP_BAR_GROUP_BORDER;

/**
 * A top bar group's box (the History group, and the text-size group beside
 * it, TextSizeControl.tsx): 36 px tall with its 28 px buttons, centred in the
 * 44 px bar.
 */
export const topBarGroup: CSSProperties = {
  position: 'absolute',
  top: 4,
  zIndex: 10,
  display: 'flex',
  alignItems: 'center',
  gap: TOP_BAR_GROUP_GAP,
  padding: TOP_BAR_GROUP_PAD,
  background: '#1a1a26ee',
  border: `${TOP_BAR_GROUP_BORDER}px solid #2a2a3a`,
  borderRadius: 7,
};

export function button(enabled: boolean): CSSProperties {
  return {
    all: 'unset',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: TOP_BAR_BUTTON,
    height: TOP_BAR_BUTTON,
    borderRadius: 5,
    color: enabled ? '#c8cad0' : '#4b4b5a',
    cursor: enabled ? 'pointer' : 'default',
  };
}

function Arrow({ flip }: { flip: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

export function HistoryButtons({ left, onRun }: { left: number; onRun: (dir: HistoryDirection, opts?: HistoryRunOptions) => void }) {
  const canUndo = usePosterStore((s) => s.canUndo);
  const canRedo = usePosterStore((s) => s.canRedo);
  const mod = MAC ? '⌘' : 'Ctrl+';
  // Enter and Space click a focused button with a click count of 0.
  const run = (dir: HistoryDirection) => (e: MouseEvent) => onRun(dir, { keepFocus: e.detail === 0 });
  return (
    <div
      role="group"
      aria-label="History"
      data-postr-history-buttons
      // Centred in the 44 px bar: 36 px tall (28 px buttons, 3 px of
      // padding and a 1 px border each side).
      style={{ ...topBarGroup, left }}
    >
      <button
        type="button"
        aria-label="Undo"
        title={`Undo (${mod}Z)`}
        disabled={!canUndo}
        onClick={run('undo')}
        style={button(canUndo)}
      >
        <Arrow flip={false} />
      </button>
      <button
        type="button"
        aria-label="Redo"
        title={MAC ? 'Redo (⌘⇧Z)' : 'Redo (Ctrl+Y)'}
        disabled={!canRedo}
        onClick={run('redo')}
        style={button(canRedo)}
      >
        <Arrow flip />
      </button>
    </div>
  );
}
