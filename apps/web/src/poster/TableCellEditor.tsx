/**
 * One table cell's text, on the canvas.
 *
 * The cell used to render its text with `dangerouslySetInnerHTML`. Each
 * keystroke stored the cell, the table rendered again with the new HTML,
 * React wrote it into the cell, and the write dropped the caret to the
 * cell's start, so the next letter landed there: "abc" typed became "cba"
 * (12 of 12 cases in Chromium, Firefox and WebKit, MEASURED by the item 12
 * reproducer). React 19 also writes that HTML on a render that did not
 * change it (5 renders, 5 rewrites, MEASURED by its confirmer in jsdom). The
 * cell now writes its HTML only when the stored value changes from outside
 * (an undo, a row inserted, the table formatted from the sidebar), keeping
 * the caret, and its typing joins the editor's one undo history by word
 * under the key `cell:<block id>:<index>` (useEditableHistory.ts; record
 * docs/fixes/12-one-undo-history.md).
 *
 * The cell stores its typed text the way a text block does
 * (`sanitizeTyped`): the line Enter starts, which the browser puts in a
 * `<div>`, is stored as a `<br>`. The cell used to store its innerHTML as
 * typed, and the PowerPoint export wrote that `<div>` into the cell as text
 * ("Measure ZQE<div>ZQF</div>", MEASURED in the three engines; fix 27,
 * docs/fixes/27-keep-work-safe.md). It still shows a stored value as it
 * is (`asIs`), so a cell saved before keeps its look.
 *
 * A paste into the cell follows tablePaste.ts's rule table (fix 32,
 * docs/fixes/32-table-paste.md): a grid (an HTML table, or text with tabs
 * or line breaks) goes to the table, which fills from this cell
 * (`onPasteGrid`); one line of text goes in here at the caret, cleaned as a
 * text block's paste is. Before, the table's own handler replaced the whole
 * table with one built from any paste with text.
 */
import { useRef, type ClipboardEvent, type CSSProperties, type KeyboardEvent } from 'react';
import { sanitizeTyped } from './sanitizeHtml';
import { useEditableHistory } from './useEditableHistory';
import { isBlankHtml } from './startingText';
import { readCellPaste } from './tablePaste';

const asIs = (html: string) => html;

export interface TableCellEditorProps {
  html: string;
  historyKey: string;
  onCommit: (html: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  /** A grid was pasted with the caret in this cell: the table fills from here. */
  onPasteGrid: (rows: string[][]) => void;
  style: CSSProperties;
  /** The table's grey prompt, given to its first body cell while the body is empty (record 29). */
  placeholder?: string;
}

export function TableCellEditor({ html, historyKey, onCommit, onFocus, onBlur, onKeyDown, onPasteGrid, style, placeholder }: TableCellEditorProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const history = useEditableHistory({ ref, value: html, toHtml: asIs, historyKey, surface: 'canvas' });
  // Empty for the table's prompt, from the stored value (record 29).
  const empty = isBlankHtml(html);

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const paste = readCellPaste(e.clipboardData.getData('text/html'), e.clipboardData.getData('text/plain'));
    // No text in it (an image alone): the browser's own paste, as before.
    if (!paste) return;
    e.preventDefault();
    if (paste.kind === 'grid') {
      onPasteGrid(paste.rows);
      return;
    }
    // Stored by the input event execCommand fires, as typing is; a step of
    // its own, as the paste event says (useEditorHistory.ts).
    document.execCommand('insertHTML', false, paste.html);
  };
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-history-key={historyKey}
      data-history-surface="canvas"
      data-placeholder={placeholder}
      data-empty={placeholder && empty ? '' : undefined}
      onInput={(e) => history.commitInput(e.nativeEvent, () => sanitizeTyped(ref.current?.innerHTML ?? '', true), onCommit)}
      onPaste={onPaste}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onKeyUp={history.onCaretKey}
      onClick={history.onCaretClick}
      onPointerDown={(e) => e.stopPropagation()}
      style={style}
    />
  );
}
