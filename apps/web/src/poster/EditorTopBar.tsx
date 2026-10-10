/**
 * The editor's top bar: a row across the top of the whole editor, above the
 * sidebar and the workspace, holding the Undo and Redo buttons (owner
 * decision 5 of 2026-10-06, "Undo and Redo buttons in the editor's top
 * bar"; record docs/fixes/12-one-undo-history.md, section 11).
 *
 * Before, the buttons floated over the workspace's top gutter, which is
 * where a selected block's handle row is drawn for a block at the top of
 * the sheet: on some poster shapes at the fit they covered its move button
 * (the merge review's F2, MEASURED in Chromium, Firefox and WebKit). In a
 * bar of its own, outside the scrolling workspace, nothing on the sheet can
 * be drawn under them, at any zoom or scroll.
 *
 * Not drawn for read-only viewers (the phone share view is one): they get
 * no buttons, and a bar with nothing in it would only take the poster's
 * room. It spans the window, so it is as wide as the editor at every width.
 *
 * At its right end, "Save PDF" (owner decision D2, the MVP design doc §3.0
 * and §3.10; record docs/fixes/30-one-print-path.md): the editor's one
 * print function, the same as the Export tab's "⎙ Save PDF", Preview's
 * Print / Save PDF and ⌘P / Ctrl+P.
 */
import { HistoryButtons } from './HistoryButtons';
import type { HistoryDirection, HistoryRunOptions } from './editorHistory';

/** The bar's height, in px. The sidebar's Show button is centred in it. */
export const TOP_BAR_HEIGHT = 44;

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function EditorTopBar({
  sidebarOpen,
  onRun,
  onSavePdf,
}: {
  sidebarOpen: boolean;
  onRun: (dir: HistoryDirection, opts?: HistoryRunOptions) => void;
  onSavePdf: () => void;
}) {
  return (
    <div
      data-postr-editor-topbar
      style={{
        flex: '0 0 auto',
        position: 'relative',
        height: TOP_BAR_HEIGHT,
        background: '#111118',
        borderBottom: '1px solid #1e1e2e',
        boxSizing: 'border-box',
      }}
    >
      {/* Clear of the sidebar's Show button (fixed, 16–52 px from the
          left) when the sidebar is hidden. */}
      <HistoryButtons left={sidebarOpen ? 12 : 64} onRun={onRun} />
      <button
        type="button"
        data-postr-topbar-print
        title={`Save PDF (${MAC ? '⌘P' : 'Ctrl+P'})`}
        onClick={onSavePdf}
        style={{
          all: 'unset',
          position: 'absolute',
          // Centred in the 44 px bar, 30 px tall.
          top: 7,
          right: 12,
          height: 30,
          padding: '0 14px',
          display: 'flex',
          alignItems: 'center',
          boxSizing: 'border-box',
          borderRadius: 6,
          background: '#7c6aed',
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
          fontFamily: "'DM Sans', system-ui, sans-serif",
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Save PDF
      </button>
    </div>
  );
}
