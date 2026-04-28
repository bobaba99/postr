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

/**
 * Wrap the current selection in a `<span style="font-size: 1.06em">`
 * (or 0.94em for shrink) so repeated presses compound smoothly at
 * ~6% per press. Falls back to `execCommand('fontSize')` for
 * selections that cross element boundaries — `surroundContents`
 * throws in that case and we catch it.
 */
/**
 * Compute the plain-text character offset of `node` + `offset` within
 * `root.textContent`. Used to translate a DOM Range into stable
 * offsets for comment text anchors. Returns -1 if `node` is outside
 * `root`.
 */
function plainTextOffset(root: Node, node: Node, offset: number): number {
  if (!root.contains(node)) return -1;
  let count = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n = walker.nextNode();
  while (n) {
    if (n === node) return count + offset;
    count += (n.nodeValue ?? '').length;
    n = walker.nextNode();
  }
  // Element nodes: if the range endpoint is an element, offset is a
  // child index — count textContent of preceding children.
  if (node.nodeType === Node.ELEMENT_NODE) {
    count = 0;
    const w2 = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let t = w2.nextNode();
    const target = node.childNodes[offset] ?? null;
    const range = document.createRange();
    range.selectNodeContents(root);
    if (target) range.setEndBefore(target);
    return range.toString().length;
    void t;
  }
  return -1;
}

/**
 * Dispatch a global `postr:comment-text` event carrying the current
 * selection's block id + plain-text offsets + quote. PosterEditor
 * listens for this and primes the comments sidebar with a text
 * anchor.
 */
function startCommentOnSelection() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const anchorEl = range.startContainer.parentElement;
  const blockEl = anchorEl?.closest<HTMLElement>('[data-block-id]');
  if (!blockEl) return;
  const blockId = blockEl.dataset.blockId;
  if (!blockId) return;
  const start = plainTextOffset(blockEl, range.startContainer, range.startOffset);
  const end = plainTextOffset(blockEl, range.endContainer, range.endOffset);
  const quote = sel.toString();
  if (start < 0 || end <= start) return;
  window.dispatchEvent(
    new CustomEvent('postr:comment-text', {
      detail: { blockId, start, end, quote },
    }),
  );
}

function bumpFontSize(direction: 1 | -1) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (range.collapsed) return;
  const span = document.createElement('span');
  span.style.fontSize = direction > 0 ? '1.06em' : '0.94em';
  try {
    range.surroundContents(span);
  } catch {
    // Range crosses element boundaries — fall back to the legacy
    // command. Coarser, but better than nothing.
    document.execCommand('fontSize', false, direction > 0 ? '4' : '3');
  }
}

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

/** Inner button row — all the format affordances, no positioning.
 *  Reused by:
 *    - `FloatingFormatToolbar` (portal-positioned above the selection)
 *    - The Edit-tab sidebar panel (always visible above the
 *      RichTextEditor so users don't have to make a selection
 *      first to see lists / alignment / colors)
 *
 *  Active-format highlighting requires a `formats` object — when it's
 *  null (no selection), buttons render unpressed but stay clickable;
 *  the underlying execCommand still acts on the focused block. */
export interface FormatToolbarButtonsProps {
  formats?: SelectionInfo['formats'] | null;
  onChange?: () => void;
}

export function FormatToolbarButtons({
  formats: f,
  onChange,
}: FormatToolbarButtonsProps) {
  const formats = f ?? {
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
  };
  return (
    <>
      {cmdButton('B', 'bold', formats.bold, onChange, { fontWeight: 800 })}
      {cmdButton('I', 'italic', formats.italic, onChange, { fontStyle: 'italic' })}
      {cmdButton('U', 'underline', formats.underline, onChange, { textDecoration: 'underline' })}
      {cmdButton('S', 'strikeThrough', formats.strikethrough, onChange, { textDecoration: 'line-through' })}

        <div style={divider} />

        {/*
          Text alignment triad — left / center / right. `justifyLeft`
          etc. are deprecated execCommand IDs, but along with
          `bold` / `italic` they're the cross-browser baseline we
          already depend on. Alignment applies to the block the
          caret is inside, not the selected span — that's fine for
          one-line titles, headings, and simple paragraphs (which is
          what academic posters use these for).
        */}
        {cmdButton('⟸', 'justifyLeft', false, onChange, { fontSize: 12 })}
        {cmdButton('≡', 'justifyCenter', false, onChange, { fontSize: 16 })}
        {cmdButton('⟹', 'justifyRight', false, onChange, { fontSize: 12 })}

        <div style={divider} />

        {/*
          List + indent controls. `insertUnorderedList` /
          `insertOrderedList` toggle list formatting on the block
          containing the caret; `indent` / `outdent` nest or unnest
          the list item. These are deprecated execCommand IDs but
          still ship in every modern browser and are the lowest-
          friction path to "give text blocks bulleted lists with
          indent" for imported / freshly-typed content.
        */}
        {cmdButton('•', 'insertUnorderedList', false, onChange, { fontSize: 14 })}
        {cmdButton('1.', 'insertOrderedList', false, onChange, { fontSize: 11, fontWeight: 600 })}
        {cmdButton('⇥', 'indent', false, onChange, { fontSize: 14 })}
        {cmdButton('⇤', 'outdent', false, onChange, { fontSize: 14 })}

        <div style={divider} />

        {/*
          Inline font-size bump — small increments (~6 %/press).

          `execCommand('fontSize', …)` takes a 1–7 legacy scale,
          which jumps ~25 % per step and looks like a different
          typeface entirely after one click. Instead we grab the
          current selection range directly, wrap it in a span
          with `font-size: 1.06em` (or `0.94em` for shrink), and
          let the browser compose sizes multiplicatively as the
          user taps. Repeated presses compound smoothly, which
          matches Figma / Canva's "A+ / A−" feel.

          `surroundContents` throws when the range crosses
          element boundaries (e.g. the selection starts inside a
          `<b>` and ends outside it). The catch falls back to
          `execCommand('fontSize')` for those edge cases so the
          user still gets SOME effect instead of nothing.
        */}
        <button
          type="button"
          title="Smaller"
          onMouseDown={(e) => {
            e.preventDefault();
            bumpFontSize(-1);
            onChange?.();
          }}
          style={{ ...btnBase, width: 28, fontSize: 11 }}
        >
          A−
        </button>
        <button
          type="button"
          title="Larger"
          onMouseDown={(e) => {
            e.preventDefault();
            bumpFontSize(1);
            onChange?.();
          }}
          style={{ ...btnBase, width: 28, fontSize: 14 }}
        >
          A+
        </button>

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

        <div style={divider} />

        <button
          type="button"
          title="Comment on selection"
          onMouseDown={(e) => {
            e.preventDefault();
            startCommentOnSelection();
          }}
          style={{
            ...btnBase,
            width: 40,
            fontSize: 11,
            fontWeight: 700,
            color: '#b8a9ff',
          }}
        >
          💬
        </button>
    </>
  );
}

/** Visual chrome shared between the floating + docked variants —
 *  the dark pill background with a thin border and inner padding. */
const TOOLBAR_PILL: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  padding: 4,
  background: '#1a1a2e',
  border: '1px solid #3a3a4a',
  borderRadius: 8,
  boxShadow: '0 10px 30px rgba(0,0,0,0.7)',
  fontFamily: 'system-ui, sans-serif',
  flexWrap: 'wrap',
};

/** Static / docked variant of the toolbar — render in any container
 *  (typically the sidebar Edit tab). Always visible regardless of
 *  selection state; clicking a button acts on the focused
 *  RichTextEditor's selection (or, when none, the focused block). */
export function DockedFormatToolbar({
  onChange,
}: {
  onChange?: () => void;
}) {
  return (
    <div style={{ ...TOOLBAR_PILL, boxShadow: 'none' }}>
      <FormatToolbarButtons onChange={onChange} />
    </div>
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
    if (top < 8) top = rect.bottom + padding;
    const maxLeft = window.innerWidth - TOOLBAR_MIN_W - 8;
    const minLeft = 8;
    const left = Math.max(minLeft, Math.min(maxLeft, centerX - TOOLBAR_MIN_W / 2));
    return { top, left };
  }, [info]);

  if (!info || !position) return null;

  return createPortal(
    <div
      // `top` / `left` get a short transition so when the user
      // expands or shrinks the selection the toolbar glides to the
      // new position instead of teleporting. The mount animation
      // (`postr-format-toolbar-enter`) handles the first appearance:
      // fade + tiny scale + downward drop, the same easing curve
      // Notion uses on its inline format menu.
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 9700,
        pointerEvents: 'none',
        transition:
          'top 140ms cubic-bezier(0.22, 1, 0.36, 1), left 140ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <div
        className="postr-format-toolbar-enter"
        style={{ ...TOOLBAR_PILL, pointerEvents: 'auto' }}
      >
        <FormatToolbarButtons formats={info.formats} onChange={onChange} />
      </div>
    </div>,
    document.body,
  );
}
