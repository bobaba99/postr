/**
 * FloatingFormatToolbar — Notion-style selection toolbar.
 *
 * Renders above the current text selection inside a RichTextEditor,
 * via a React portal to document.body so the canvas transform
 * doesn't scale it. The parent editor passes the current selection
 * info (rect + format state) via props; when info is null the
 * toolbar hides.
 *
 * Actions are wired through document.execCommand. Deprecated but
 * still the shortest path to cross-browser inline formatting and
 * exactly the set of commands we need.
 *
 * Uses pointer-events: none on the wrapping container and pointer-
 * events: auto on the pill itself so clicks outside the pill don't
 * swallow selection — this matches how Notion's toolbar behaves.
 * Each button uses onMouseDown with preventDefault so clicking
 * doesn't blur the editor (which would destroy the current
 * selection range).
 */
import { useMemo, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { SelectionInfo } from './RichTextEditor';

export interface FloatingFormatToolbarProps {
  /** null = hidden. */
  info: SelectionInfo | null;
  /** Called after any format change so the parent can re-commit. */
  onChange?: () => void;
}

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#FFEB3B66' },
  { name: 'Green', value: '#4CAF5055' },
  { name: 'Blue', value: '#2196F355' },
  { name: 'Red', value: '#FF572255' },
  { name: 'Purple', value: '#9C27B055' },
];

const TEXT_COLORS = [
  { name: 'Default', value: null },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Purple', value: '#7c3aed' },
];

const btnBase: CSSProperties = {
  all: 'unset',
  cursor: 'pointer',
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 5,
  fontSize: 14,
  fontWeight: 600,
  color: '#e2e2e8',
  boxSizing: 'border-box',
};

const divider: CSSProperties = {
  width: 1,
  alignSelf: 'stretch',
  background: '#2a2a3a',
  margin: '4px 2px',
};

function cmdButton(
  label: string,
  command: string,
  active: boolean,
  onChange: (() => void) | undefined,
  extraStyle: CSSProperties = {},
): JSX.Element {
  return (
    <button
      key={command}
      type="button"
      aria-pressed={active}
      title={label}
      onMouseDown={(e) => {
        // preventDefault so the editor doesn't blur — the selection
        // must survive the click for execCommand to target it.
        e.preventDefault();
        document.execCommand(command, false);
        onChange?.();
      }}
      style={{
        ...btnBase,
        background: active ? '#7c6aed33' : 'transparent',
        color: active ? '#c8b6ff' : '#e2e2e8',
        ...extraStyle,
      }}
    >
      {label}
    </button>
  );
}

function colorSwatch(
  color: string | null,
  command: 'foreColor' | 'hiliteColor',
  onChange: (() => void) | undefined,
  title: string,
): JSX.Element {
  const isNone = color === null;
  return (
    <button
      key={`${command}-${color ?? 'none'}`}
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        if (isNone) {
          // Reset — for foreColor set to inherit, for hiliteColor
          // set to transparent which matches "no highlight".
          document.execCommand(command, false, command === 'foreColor' ? 'inherit' : 'transparent');
        } else {
          document.execCommand(command, false, color);
        }
        onChange?.();
      }}
      style={{
        all: 'unset',
        cursor: 'pointer',
        width: 22,
        height: 22,
        borderRadius: 4,
        background: color ?? 'transparent',
        border: `1px solid ${isNone ? '#4b5563' : '#ffffff33'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#9ca3af',
        fontSize: 11,
        boxSizing: 'border-box',
      }}
    >
      {isNone ? '∅' : ''}
    </button>
  );
}

export function FloatingFormatToolbar({ info, onChange }: FloatingFormatToolbarProps) {
  // Compute a stable position above the selection. We clamp into
  // the viewport so toolbars near the top edge flip below.
  const position = useMemo(() => {
    if (!info) return null;
    const TOOLBAR_H = 44;
    const TOOLBAR_MIN_W = 320;
    const padding = 8;
    const { rect } = info;
    const centerX = rect.left + rect.width / 2;
    let top = rect.top - TOOLBAR_H - padding;
    // If too close to top, flip below the selection.
    if (top < 8) top = rect.bottom + padding;
    // Clamp horizontally so we never overflow the viewport.
    const maxLeft = window.innerWidth - TOOLBAR_MIN_W - 8;
    const minLeft = 8;
    const left = Math.max(minLeft, Math.min(maxLeft, centerX - TOOLBAR_MIN_W / 2));
    return { top, left };
  }, [info]);

  if (!info || !position) return null;

  const formats = info.formats;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 9700,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: 4,
          background: '#1a1a2e',
          border: '1px solid #3a3a4a',
          borderRadius: 8,
          boxShadow: '0 10px 30px rgba(0,0,0,0.7)',
          pointerEvents: 'auto',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {cmdButton('B', 'bold', formats.bold, onChange, { fontWeight: 800 })}
        {cmdButton('I', 'italic', formats.italic, onChange, { fontStyle: 'italic' })}
        {cmdButton('U', 'underline', formats.underline, onChange, { textDecoration: 'underline' })}
        {cmdButton('S', 'strikeThrough', formats.strikethrough, onChange, { textDecoration: 'line-through' })}

        <div style={divider} />

        {/* Highlight swatches */}
        <div style={{ display: 'flex', gap: 3, padding: '0 4px' }}>
          {HIGHLIGHT_COLORS.map((c) => colorSwatch(c.value, 'hiliteColor', onChange, `Highlight · ${c.name}`))}
          {colorSwatch(null, 'hiliteColor', onChange, 'Clear highlight')}
        </div>

        <div style={divider} />

        {/* Text color swatches */}
        <div style={{ display: 'flex', gap: 3, padding: '0 4px' }}>
          {TEXT_COLORS.filter((c) => c.value).map((c) =>
            colorSwatch(c.value, 'foreColor', onChange, `Text · ${c.name}`),
          )}
          {colorSwatch(null, 'foreColor', onChange, 'Default color')}
        </div>

        <div style={divider} />

        <button
          type="button"
          title="Clear formatting"
          onMouseDown={(e) => {
            e.preventDefault();
            document.execCommand('removeFormat', false);
            onChange?.();
          }}
          style={{
            ...btnBase,
            width: 40,
            fontSize: 11,
            fontWeight: 700,
            color: '#9ca3af',
          }}
        >
          Clear
        </button>
      </div>
    </div>,
    document.body,
  );
}
