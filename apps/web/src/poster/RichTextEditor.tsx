/**
 * RichTextEditor — contentEditable-based rich text editor shared
 * between the canvas (inline on the poster) and the sidebar Edit
 * panel. Replaces the old SmartText (contentEditable without
 * formatting) and SmartTextarea (plain textarea) surfaces with a
 * single component so the two editors behave identically.
 *
 * Capabilities:
 *   - Inline formatting: bold / italic / underline / strikethrough,
 *     highlight color, text color, clear formatting. Applied to
 *     the current selection via a floating toolbar (the toolbar
 *     itself lives in a sibling component and is wired up by the
 *     consumer via onSelectionChange).
 *   - Slash commands using the shared matchSlashAtCaret helper,
 *     with a contentEditable caret adapter.
 *   - Paste sanitization: every paste is run through sanitizeHtml
 *     so stored XSS from copied-from-elsewhere markup is defanged.
 *   - Single-line mode (multiline=false) swallows Enter so title
 *     and heading blocks stay on one line.
 *
 * Why contentEditable and not a library like Lexical/Slate/TipTap:
 *   - We need inline formatting, not full document structure.
 *   - Bundle size matters for an anonymous-first editor.
 *   - execCommand is deprecated but still works in every major
 *     browser and gives us bold/italic/underline/strike/color/
 *     highlight for free. If it breaks we swap to a library.
 *
 * Parent contract:
 *   value         current HTML string (sanitized) — source of truth
 *   onChange      receives sanitized HTML whenever the user edits
 *   style         forwarded to the contentEditable div so the canvas
 *                 can match font/size/color/line-height from the
 *                 block style contract
 *   onSelectionChange
 *                 invoked on selectionchange events that originate
 *                 inside this editor. The argument is a SelectionInfo
 *                 object or null when the selection leaves. Parents
 *                 use it to position / dismiss the floating toolbar.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { SYMBOLS, filterSymbols } from './symbols';
import { matchSlashAtCaret } from './slashCommand';
import { htmlToPlainText, sanitizeHtml } from './sanitizeHtml';

export interface SelectionInfo {
  /** Viewport-coordinate bounding rect of the current selection. */
  rect: DOMRect;
  /** Active inline-format state, for toolbar highlighting. */
  formats: {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikethrough: boolean;
  };
}

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  multiline?: boolean;
  style?: CSSProperties;
  /** Notified when the user selects text inside this editor. */
  onSelectionChange?: (info: SelectionInfo | null) => void;
  /**
   * Optional — when true, pointer-downs inside the editor stop
   * propagating so the parent's drag handler doesn't fire.
   * Used on the canvas to prevent dragging a block when the user
   * is clicking inside its text to position the caret.
   */
  stopPointerDown?: boolean;
  /** data-* test hook */
  'data-testid'?: string;
}

interface SlashMenuState {
  open: boolean;
  prefix: string;
  /** Viewport coords of the caret for positioning. */
  caretRect: DOMRect | null;
}

const INITIAL_SLASH: SlashMenuState = { open: false, prefix: '', caretRect: null };

/**
 * Returns the character offset of the current selection's start
 * within the given root element, measured as if the root's
 * textContent were a flat string. Matches what matchSlashAtCaret
 * expects.
 */
function getCaretPlainOffset(root: Node): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  // clone a range that spans from root start to the caret
  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

/**
 * Walks text nodes inside `root` until the cumulative text length
 * reaches `offset`, then returns a Range collapsed at that point.
 * Used when inserting slash-command symbols: we need to turn a
 * plain-text character offset back into a DOM position.
 */
function rangeFromPlainOffset(root: Node, offset: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const len = node.data.length;
    if (consumed + len >= offset) {
      const range = document.createRange();
      range.setStart(node, offset - consumed);
      range.collapse(true);
      return range;
    }
    consumed += len;
    node = walker.nextNode() as Text | null;
  }
  // Fell off the end — clamp to the last position.
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  return range;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  multiline = true,
  style,
  onSelectionChange,
  stopPointerDown,
  'data-testid': testId,
}: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [slash, setSlash] = useState<SlashMenuState>(INITIAL_SLASH);
  const [focused, setFocused] = useState(false);

  // Mount + external-value sync. Only replace innerHTML when the
  // editor is NOT focused, so we don't clobber the user's caret
  // while they're actively typing. When focused, we trust the
  // DOM as the source of truth and call onChange on every input.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    const sanitized = sanitizeHtml(value ?? '');
    if (el.innerHTML !== sanitized) {
      el.innerHTML = sanitized;
    }
  }, [value]);

  const commit = () => {
    const el = ref.current;
    if (!el) return;
    // Sanitize on every commit so execCommand output doesn't leak
    // disallowed tags into the store. The sanitizer is idempotent
    // and fast (< 1 ms on typical block content).
    const clean = sanitizeHtml(el.innerHTML);
    onChange(clean);
  };

  // Recompute the slash-command menu based on the caret position.
  const recomputeSlash = () => {
    const el = ref.current;
    if (!el) return;
    const offset = getCaretPlainOffset(el);
    if (offset == null) {
      setSlash((prev) => (prev.open ? INITIAL_SLASH : prev));
      return;
    }
    const text = htmlToPlainText(el.innerHTML);
    const match = matchSlashAtCaret(text.substring(0, offset));
    if (!match) {
      setSlash((prev) => (prev.open ? INITIAL_SLASH : prev));
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setSlash({ open: true, prefix: match.prefix, caretRect: rect });
  };

  const insertSymbolAt = (symbolKey: string) => {
    insertSymbolViaExec(symbolKey, ref, commit, setSlash);
  };

  const handleInput = () => {
    commit();
    recomputeSlash();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && slash.open) {
      e.preventDefault();
      setSlash(INITIAL_SLASH);
      return;
    }
    if (slash.open && (e.key === 'Tab' || e.key === 'Enter')) {
      const items = filterSymbols(slash.prefix, 1);
      if (items.length > 0 && items[0]) {
        e.preventDefault();
        insertSymbolAt(items[0][0]);
        return;
      }
    }
    // Single-line mode: swallow Enter so title/heading stays one line.
    if (!multiline && e.key === 'Enter' && !slash.open) {
      e.preventDefault();
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown' ||
      e.key === 'Home' ||
      e.key === 'End'
    ) {
      recomputeSlash();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    const clean = sanitizeHtml(html || text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    document.execCommand('insertHTML', false, clean);
    commit();
  };

  const handleFocus = () => setFocused(true);
  const handleBlur = () => {
    setFocused(false);
    // Delay the slash dismiss so a click on a dropdown item still
    // registers before the menu unmounts.
    window.setTimeout(() => setSlash(INITIAL_SLASH), 120);
    // Parent dismisses toolbar.
    onSelectionChange?.(null);
  };

  // Selection change → emit to parent (toolbar positioning).
  useEffect(() => {
    if (!onSelectionChange) return;
    const handler = () => {
      const el = ref.current;
      if (!el) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        onSelectionChange(null);
        return;
      }
      const range = sel.getRangeAt(0);
      // Must be inside our editor
      if (!el.contains(range.commonAncestorContainer)) {
        onSelectionChange(null);
        return;
      }
      if (range.collapsed) {
        onSelectionChange(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      onSelectionChange({
        rect,
        formats: {
          bold: document.queryCommandState('bold'),
          italic: document.queryCommandState('italic'),
          underline: document.queryCommandState('underline'),
          strikethrough: document.queryCommandState('strikeThrough'),
        },
      });
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [onSelectionChange]);

  const stopDrag = (e: React.PointerEvent) => {
    if (stopPointerDown) e.stopPropagation();
  };

  const slashItems = slash.open ? filterSymbols(slash.prefix, 8) : [];

  return (
    <>
      <div
        ref={ref}
        data-testid={testId}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onPaste={handlePaste}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPointerDown={stopDrag}
        onClick={recomputeSlash}
        style={{
          outline: 'none',
          minHeight: '1em',
          cursor: 'text',
          wordWrap: 'break-word',
          whiteSpace: multiline ? 'pre-wrap' : 'normal',
          ...style,
        }}
      />

      {/* Slash-command dropdown via portal so the canvas transform
          doesn't scale it 2.6×. */}
      {focused &&
        slash.open &&
        slash.caretRect &&
        slashItems.length > 0 &&
        createPortal(
          <div
            role="listbox"
            style={{
              position: 'fixed',
              top: slash.caretRect.bottom + 6,
              left: slash.caretRect.left,
              background: '#1a1a2e',
              border: '1px solid #3a3a4a',
              borderRadius: 6,
              padding: 4,
              zIndex: 9600,
              maxHeight: 220,
              overflow: 'auto',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              minWidth: 180,
              fontFamily: 'system-ui',
            }}
          >
            {slashItems.map(([k, sym]) => (
              <div
                key={k}
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertSymbolViaExec(k, ref, commit, setSlash);
                }}
                style={{
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: '#ddd',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 16,
                  borderRadius: 4,
                }}
              >
                <span style={{ color: '#7c6aed', fontFamily: 'monospace', fontSize: 12 }}>/{k}</span>
                <span style={{ fontSize: 15 }}>{sym}</span>
              </div>
            ))}
            <div style={{ fontSize: 10, color: '#666', padding: '4px 10px', borderTop: '1px solid #333' }}>
              Tab or Enter to insert
            </div>
          </div>,
          document.body,
        )}

      {/* Focus hint when editor is focused but no slash is active. */}
      {focused &&
        !slash.open &&
        ref.current &&
        createPortal(
          <div
            aria-hidden
            style={{
              position: 'fixed',
              left: ref.current.getBoundingClientRect().left,
              top: ref.current.getBoundingClientRect().bottom + 4,
              fontSize: 11,
              fontFamily: 'system-ui',
              fontWeight: 500,
              color: '#9ca3af',
              background: '#1a1a26ee',
              border: '1px solid #2a2a3a',
              borderRadius: 4,
              padding: '3px 8px',
              letterSpacing: 0.2,
              pointerEvents: 'none',
              zIndex: 9500,
              whiteSpace: 'nowrap',
            }}
          >
            Select text to format ·{' '}
            <span style={{ color: '#c8b6ff', fontFamily: 'monospace' }}>/</span> for symbols
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * Insert a symbol at the current caret, replacing the slash prefix.
 * Extracted to a free function so the dropdown's onMouseDown can
 * reach it without closure-related staleness issues.
 */
function insertSymbolViaExec(
  symbolKey: string,
  editorRef: React.RefObject<HTMLDivElement>,
  commit: () => void,
  setSlash: (s: SlashMenuState) => void,
) {
  const symbol = SYMBOLS[symbolKey];
  if (!symbol) return;
  const el = editorRef.current;
  if (!el) return;
  const caret = getCaretPlainOffset(el);
  if (caret == null) return;

  const plain = htmlToPlainText(el.innerHTML);
  const match = matchSlashAtCaret(plain.substring(0, caret));
  if (!match) return;

  const sel = window.getSelection();
  if (!sel) return;

  // Focus the editor before manipulating selection — the mouseDown
  // on the dropdown didn't steal focus (we called preventDefault)
  // but we still need to guarantee it for execCommand.
  el.focus();

  // Build a Range that covers the `/prefix` text and select it,
  // so the upcoming insertText replaces it atomically.
  const startRange = rangeFromPlainOffset(el, match.before.length);
  const endRange = rangeFromPlainOffset(el, caret);
  if (!startRange || !endRange) return;

  const selectionRange = document.createRange();
  selectionRange.setStart(startRange.startContainer, startRange.startOffset);
  selectionRange.setEnd(endRange.startContainer, endRange.startOffset);
  sel.removeAllRanges();
  sel.addRange(selectionRange);

  document.execCommand('insertText', false, symbol);

  setSlash(INITIAL_SLASH);
  commit();
}
