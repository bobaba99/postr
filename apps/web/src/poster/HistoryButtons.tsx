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

function button(enabled: boolean): CSSProperties {
  return {
    all: 'unset',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
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
      style={{
        // Centred in the 44 px bar: 36 px tall (28 px buttons, 3 px of
        // padding and a 1 px border each side).
        position: 'absolute',
        top: 4,
        left,
        zIndex: 10,
        display: 'flex',
        gap: 2,
        padding: 3,
        background: '#1a1a26ee',
        border: '1px solid #2a2a3a',
        borderRadius: 7,
      }}
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
