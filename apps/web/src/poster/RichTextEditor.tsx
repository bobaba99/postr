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
 *     with a contentEditable caret adapter: "/" at the start of a word
 *     opens the symbol menu (all 65 symbols, filtered as letters follow);
 *     ↑ ↓ move its highlight, Tab or a click inserts the highlighted
 *     symbol, Enter inserts it only after an arrow moved the highlight
 *     (otherwise Enter closes the menu and does what Enter does in the
 *     block), Esc closes it (record docs/fixes/39-text-editing.md, rule T4).
 *   - Superscript and subscript: PowerPoint's keys toggle them on the
 *     selection while the caret is in this text (scriptFormat.ts, rule T2).
 *   - Paste sanitization: every paste is run through sanitizeHtml
 *     so stored XSS from copied-from-elsewhere markup is defanged, and
 *     takes the poster's style (pasteClean.ts: the source's colour,
 *     highlight, font and size dropped; fix 32).
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
 *   historyKey    the field's key in the editor's one undo history
 *                 (`content:<block id>`), with `surface` (canvas or
 *                 sidebar): an undo or redo of this field writes the
 *                 restored text in even while it has focus, and puts the
 *                 caret back where the change was (useEditableHistory.ts,
 *                 docs/fixes/12-one-undo-history.md).
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { breakUndoCoalescing } from '@/stores/posterStore';
import type { EditorSurface } from './editorHistory';
import { useEditableHistory } from './useEditableHistory';
import { SYMBOLS, filterSymbols } from './symbols';
import { matchSlashAtCaret, textBeforeCaretByLine } from './slashCommand';
import { listState, scriptKeyAction, scriptState, toggleScript } from './scriptFormat';
import { deleteIn, scriptedCopy } from './scriptClipboard';
import { MAC } from './selectionKeys';
import { sanitizeHtml, sanitizeTyped } from './sanitizeHtml';
import { pastedHtml } from './pasteClean';
import { imageOnlyPaste } from './canvasPaste';
import { isBlankHtml } from './startingText';

export interface SelectionInfo {
  /** Viewport-coordinate bounding rect of the current selection. */
  rect: DOMRect;
  /** Active inline-format state, for toolbar highlighting. */
  formats: {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikethrough: boolean;
    /** Read from the markup (scriptFormat.ts): the engines' own state is wrong for sub and sup here. */
    superscript: boolean;
    subscript: boolean;
    bulletList: boolean;
    numberedList: boolean;
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
  /** The field's key in the editor's undo history (`content:<block id>`). */
  historyKey?: string;
  /** Which copy of the field this is; the focused copy keeps the caret after an undo. */
  surface?: EditorSurface;
  /**
   * An image file pasted with no text (bounded-designs §3.3 table A row 3,
   * record 34): handed over instead of inserted, so the canvas places a new
   * image block next to this text. Given by the canvas's blocks only; in
   * any other field such a paste does nothing, as before.
   */
  onPasteImage?: (file: File) => void;
  /** data-* test hook */
  'data-testid'?: string;
}

interface SlashMenuState {
  open: boolean;
  prefix: string;
  /** Viewport coords of the caret for positioning. */
  caretRect: DOMRect | null;
  /** The highlighted entry's index: Tab inserts it, and Enter once an arrow moved it. */
  active: number;
  /** An arrow key moved the highlight: only then does Enter insert (rule T4). */
  moved: boolean;
}

const INITIAL_SLASH: SlashMenuState = { open: false, prefix: '', caretRect: null, active: 0, moved: false };

/** The menu's height at most, and its gap from the caret and from the window's edge. */
const MENU_MAX = 220;
const MENU_GAP = 6;
const MENU_EDGE = 8;

/**
 * Where the menu goes: below the caret, or above it when it would reach
 * past the window's bottom there and there is more room above; never
 * taller than its side's room. Near the bottom it used to be drawn partly
 * below the window, and ↑ took the highlight to an entry out of sight
 * (record 39 §9, R1-F5).
 */
function menuPlacement(caret: DOMRect, windowHeight: number): { top?: number; bottom?: number; left: number; maxHeight: number } {
  const below = windowHeight - caret.bottom - MENU_GAP - MENU_EDGE;
  const above = caret.top - MENU_GAP - MENU_EDGE;
  if (below >= MENU_MAX || below >= above) return { top: caret.bottom + MENU_GAP, left: caret.left, maxHeight: Math.max(0, Math.min(MENU_MAX, below)) };
  return { bottom: windowHeight - caret.top + MENU_GAP, left: caret.left, maxHeight: Math.min(MENU_MAX, above) };
}

/** Every symbol whose name starts with `prefix`: the bare "/" lists all 65. */
const slashEntries = (prefix: string) => filterSymbols(prefix, Number.POSITIVE_INFINITY);

/** The format state of the selection in `el` (the toolbar's highlighting). */
function formatsOf(el: HTMLElement, range: Range): SelectionInfo['formats'] {
  return {
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    underline: document.queryCommandState('underline'),
    strikethrough: document.queryCommandState('strikeThrough'),
    superscript: scriptState(el, range, 'sup'),
    subscript: scriptState(el, range, 'sub'),
    bulletList: listState(el, range, 'UL'),
    numberedList: listState(el, range, 'OL'),
  };
}

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
 *
 * At a boundary between two text nodes a `start` point goes into the
 * later one and an `end` point into the earlier one. A `/` typed at the
 * start of a line made with Enter is the first character of a text node
 * on that line (in its <div>, or after a <br>); its start used to be put
 * at the end of the line before, so the symbol's insertion deleted the
 * line break and joined the two lines ("ZQJ1", Enter, "/al", Tab gave
 * "ZQJ1α", MEASURED in Chromium and Firefox on main, record 39 §4).
 */
function rangeFromPlainOffset(root: Node, offset: number, side: 'start' | 'end'): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const len = node.data.length;
    if (side === 'start' ? consumed + len > offset : consumed + len >= offset) {
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
  historyKey,
  surface = 'canvas',
  onPasteImage,
  'data-testid': testId,
}: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [slash, setSlash] = useState<SlashMenuState>(INITIAL_SLASH);
  const [focused, setFocused] = useState(false);
  /** The last keydown was a plain ↑ ↓ that the menu took (handleKeyDown): its keyup leaves the menu alone. */
  const menuArrow = useRef(false);
  // Empty for the grey prompt (index.css reads data-empty; record 29). Read
  // from the stored value: the prompt shows only while the block has no
  // focus (index.css), and by then the typing is stored.
  const empty = isBlankHtml(value ?? '');

  // Mount + value sync. The editor's own typing is committed and left
  // alone (the DOM is the source while the user types); any other change
  // to `value` — an undo or redo, the same block edited in its other copy
  // — is written in, focused or not, keeping the caret. Before fix 12 a
  // focused editor skipped every write, so an undo with the caret inside
  // left the old text on screen and the next keystroke wrote it back.
  const history = useEditableHistory({
    ref,
    value: value ?? '',
    toHtml: sanitizeHtml,
    historyKey,
    surface,
  });

  // Sanitize on every commit so execCommand output doesn't leak
  // disallowed tags into the store. The sanitizer is idempotent and fast
  // (< 1 ms on typical block content). The browser puts a line started
  // with Enter in a <div>; `sanitizeTyped` stores it as a <br>, as the
  // paste path does (it used to join the words: OF-01, fix 27).
  const read = () => sanitizeTyped(ref.current?.innerHTML ?? '', multiline);

  /** Commit after a change the editor made itself (a symbol, a paste). */
  const commit = () => {
    if (!ref.current) return;
    history.commitValue(read(), onChange);
  };

  // Recompute the slash-command menu based on the caret position.
  const recomputeSlash = () => {
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection();
    const before = sel && sel.isCollapsed ? textBeforeCaretByLine(el) : null;
    const match = before == null ? null : matchSlashAtCaret(before);
    // Open only with something to list: a "/zz" that names no symbol is
    // text, and Esc there is the editor's (record 36), not a hidden menu's.
    if (!match || !sel || slashEntries(match.prefix).length === 0) {
      setSlash((prev) => (prev.open ? INITIAL_SLASH : prev));
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setSlash({ open: true, prefix: match.prefix, caretRect: rect, active: 0, moved: false });
  };

  const insertSymbolAt = (symbolKey: string) => {
    insertSymbol(symbolKey, ref, commit, setSlash);
  };

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    history.commitInput(e.nativeEvent, read, onChange);
    recomputeSlash();
    // A format change leaves the selection where it was, and Firefox then
    // fires no selectionchange: the toolbar's state is read again here, so
    // B shows pressed after B (record 39, TE1b).
    emitSelection();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    menuArrow.current = false;
    // PowerPoint's superscript and subscript keys, taken only here, in
    // text (rule T2); the selection is toggled, one undo step.
    const script = scriptKeyAction(e.nativeEvent, MAC);
    if (script) {
      e.preventDefault();
      toggleScript(script);
      return;
    }
    // The menu is open only while it lists something (recomputeSlash).
    if (slash.open && !e.nativeEvent.isComposing) {
      const items = slashEntries(slash.prefix);
      const plain = !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey;
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlash(INITIAL_SLASH);
        return;
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && plain) {
        e.preventDefault();
        menuArrow.current = true;
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setSlash((prev) => ({ ...prev, active: (prev.active + step + items.length) % items.length, moved: true }));
        return;
      }
      const chosen = items[Math.min(slash.active, items.length - 1)]!;
      if (e.key === 'Tab' && plain) {
        e.preventDefault();
        insertSymbolAt(chosen[0]);
        return;
      }
      if (e.key === 'Enter') {
        if (slash.moved && plain) {
          e.preventDefault();
          insertSymbolAt(chosen[0]);
          return;
        }
        // No arrow moved the highlight: Enter is the block's own (a new
        // line in text; nothing in a title or heading, below).
        setSlash(INITIAL_SLASH);
      }
    }
    // Single-line mode: swallow Enter so title/heading stays one line.
    if (!multiline && e.key === 'Enter') {
      e.preventDefault();
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // The ↑ ↓ the menu took moved its highlight, not the caret: the menu is
    // not read again (that would put the highlight back on the first entry).
    // Any other ↑ ↓, such as Shift + ↓, was the text's (handleKeyDown leaves
    // it): it moved the selection, so the menu is read again and closes on a
    // selection (record 39 §9, R1-F6: it stayed open and Tab inserted a
    // symbol). Known from the keydown, not this keyup's modifiers: Shift may
    // be let go before the arrow.
    if (menuArrow.current && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      menuArrow.current = false;
      return;
    }
    // A caret moved by key ends the typing step (the next word typed
    // elsewhere is undone on its own).
    history.onCaretKey(e);
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
    // An image and no text: a new image block beside this text (record 34);
    // the text is left as it is. It used to insert nothing, without a word.
    const image = onPasteImage ? imageOnlyPaste(e.clipboardData) : null;
    if (image) {
      onPasteImage!(image);
      return;
    }
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    // Pasting from Word, Docs or a browser takes the text/html branch,
    // whose markup is block-level — and the sanitizer's unwrap used to put
    // NOTHING in place of those boundaries, gluing the last word of one
    // paragraph to the first of the next (`weeks.Accuracy`).
    //
    // `<br>` only where the editor would let the user press Enter. In a
    // single-line block a break is text the editor actively refuses to
    // let them make, so the boundary becomes a space instead.
    //
    // The poster's style wins (fix 32, pasteClean.ts): the source's colour
    // and highlight go with its font and size, a style sheet on the
    // clipboard is not pasted as text, and a line wrapped in the source's
    // markup is not a line break (its review round, R1-F3).
    const clean = pastedHtml(html, text, multiline);
    // A paste is an undo step of its own: this paste event says so (the
    // editor's document listener notes it, useEditorHistory.ts). The
    // input event execCommand fires does not: its type is '' in Chromium
    // and Firefox and 'insertText' in WebKit (fix 12 review, round 1).
    document.execCommand('insertHTML', false, clean);
    commit();
  };

  // A copy or cut of superscript or subscript text alone: the editor writes
  // the clipboard, which Chromium and WebKit wrote as plain text
  // (scriptClipboard.ts; record 39 §9, R1-F1). Any other is the browser's.
  const handleCopy = (e: React.ClipboardEvent<HTMLDivElement>, cut: boolean) => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const copy = scriptedCopy(el, range);
    if (!copy) return;
    e.preventDefault();
    e.clipboardData.setData('text/html', copy.html);
    e.clipboardData.setData('text/plain', copy.text);
    if (!cut) return;
    // An undo step of its own: the cut event says so (useEditorHistory.ts).
    deleteIn(el, range);
    commit();
    emitSelection();
  };

  const handleFocus = () => setFocused(true);
  const handleBlur = () => {
    setFocused(false);
    // Close the undo burst. Consecutive keystrokes in one block collapse
    // into a single undo entry; leaving the block ends that burst, so
    // coming back and typing again starts a new one rather than merging
    // across a gap the user experienced as two separate edits.
    breakUndoCoalescing();
    // Delay the slash dismiss so a click on a dropdown item still
    // registers before the menu unmounts.
    window.setTimeout(() => setSlash(INITIAL_SLASH), 120);
    // Parent dismisses toolbar.
    onSelectionChange?.(null);
  };

  // Selection change → emit to parent (toolbar positioning and state).
  const selectionListener = useRef(onSelectionChange);
  selectionListener.current = onSelectionChange;
  const emitSelection = () => {
    const notify = selectionListener.current;
    const el = ref.current;
    if (!notify || !el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      notify(null);
      return;
    }
    const range = sel.getRangeAt(0);
    // Must be inside our editor, and a selection, not a caret.
    if (!el.contains(range.commonAncestorContainer) || range.collapsed) {
      notify(null);
      return;
    }
    notify({ rect: range.getBoundingClientRect(), formats: formatsOf(el, range) });
  };
  useEffect(() => {
    if (!onSelectionChange) return;
    document.addEventListener('selectionchange', emitSelection);
    return () => document.removeEventListener('selectionchange', emitSelection);
    // emitSelection reads the latest props through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSelectionChange]);

  const stopDrag = (e: React.PointerEvent) => {
    if (stopPointerDown) e.stopPropagation();
  };

  const slashItems = slash.open ? slashEntries(slash.prefix) : [];
  const activeIndex = Math.min(slash.active, Math.max(0, slashItems.length - 1));
  const menuAt = slash.caretRect ? menuPlacement(slash.caretRect, window.innerHeight) : null;

  return (
    <>
      <div
        ref={ref}
        data-testid={testId}
        data-history-key={historyKey}
        data-history-surface={historyKey ? surface : undefined}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        data-empty={placeholder && empty ? '' : undefined}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onPaste={handlePaste}
        onCopy={(e) => handleCopy(e, false)}
        onCut={(e) => handleCopy(e, true)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPointerDown={stopDrag}
        onClick={() => {
          // A click that moves the caret ends the typing step.
          history.onCaretClick();
          recomputeSlash();
        }}
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
        menuAt &&
        slashItems.length > 0 &&
        createPortal(
          <div
            role="listbox"
            // Esc closes the menu (handleKeyDown), and only the menu (record 36).
            data-postr-takes-escape=""
            style={{
              position: 'fixed',
              top: menuAt.top,
              bottom: menuAt.bottom,
              left: menuAt.left,
              background: '#1a1a2e',
              border: '1px solid #3a3a4a',
              borderRadius: 6,
              padding: 4,
              zIndex: 9600,
              maxHeight: menuAt.maxHeight,
              overflow: 'auto',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              minWidth: 180,
              fontFamily: 'system-ui',
            }}
          >
            {slashItems.map(([k, sym], i) => (
              <div
                key={k}
                role="option"
                aria-selected={i === activeIndex}
                ref={i === activeIndex ? (node) => node?.scrollIntoView?.({ block: 'nearest' }) : undefined}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertSymbol(k, ref, commit, setSlash);
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
                  background: i === activeIndex ? '#7c6aed33' : 'transparent',
                }}
              >
                <span style={{ color: '#7c6aed', fontFamily: 'monospace', fontSize: 12 }}>/{k}</span>
                <span style={{ fontSize: 15 }}>{sym}</span>
              </div>
            ))}
            <div style={{ fontSize: 10, color: '#666', padding: '4px 10px', borderTop: '1px solid #333' }}>
              Tab or click to insert · ↑ ↓ then Enter
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
            <span style={{ color: '#c8b6ff', fontFamily: 'monospace' }}>/</span> at the start of a word for symbols
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
 *
 * The `/prefix` is replaced in the DOM itself and the field committed: one
 * undo step, as a letter typed over a selection is (stores/historySteps.ts).
 * It used to be selected and replaced with execCommand('insertText'), and
 * Firefox's insertText over the whole text of a line made with Shift +
 * Enter (the text after a <br>) deleted the <br> too: "ZQB2", Shift + Enter,
 * "/al", Tab gave "ZQB2α" (MEASURED, keep-work-check TE4jb and TE4jl, a
 * list item the same; Chromium and WebKit kept the line; record 39 §9,
 * review round 1, R1-F2).
 */
function insertSymbol(
  symbolKey: string,
  editorRef: React.RefObject<HTMLDivElement | null>,
  commit: () => void,
  setSlash: (s: SlashMenuState) => void,
) {
  const symbol = SYMBOLS[symbolKey];
  if (!symbol) return;
  const el = editorRef.current;
  if (!el) return;
  const caret = getCaretPlainOffset(el);
  if (caret == null) return;

  const before = textBeforeCaretByLine(el);
  const match = before == null ? null : matchSlashAtCaret(before);
  if (!match) return;
  // The `/prefix` is the last characters before the caret (it holds no
  // line break), counted as the caret's offset is.
  const literalStart = caret - match.literal.length;

  const sel = window.getSelection();
  if (!sel) return;

  // Focus the editor before manipulating selection — the mouseDown
  // on the dropdown didn't steal focus (we called preventDefault).
  el.focus();

  // The Range that covers the `/prefix` text: its start in the later text
  // node at a boundary (the line it is on), its end in the earlier.
  const startRange = rangeFromPlainOffset(el, literalStart, 'start');
  const endRange = rangeFromPlainOffset(el, caret, 'end');
  if (!startRange || !endRange) return;

  const prefix = document.createRange();
  prefix.setStart(startRange.startContainer, startRange.startOffset);
  prefix.setEnd(endRange.startContainer, endRange.startOffset);
  prefix.deleteContents();
  let at: [Node, number];
  if (prefix.startContainer.nodeType === Node.TEXT_NODE) {
    const text = prefix.startContainer as Text;
    text.insertData(prefix.startOffset, symbol);
    at = [text, prefix.startOffset + symbol.length];
  } else {
    const text = document.createTextNode(symbol);
    prefix.insertNode(text);
    at = [text, symbol.length];
  }
  const after = document.createRange();
  after.setStart(...at);
  after.collapse(true);
  sel.removeAllRanges();
  sel.addRange(after);

  setSlash(INITIAL_SLASH);
  commit();
}
