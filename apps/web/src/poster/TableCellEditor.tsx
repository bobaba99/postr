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
 */
import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { sanitizeTyped } from './sanitizeHtml';
import { useEditableHistory } from './useEditableHistory';

const asIs = (html: string) => html;

export interface TableCellEditorProps {
  html: string;
  historyKey: string;
  onCommit: (html: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  style: CSSProperties;
}

export function TableCellEditor({ html, historyKey, onCommit, onFocus, onBlur, onKeyDown, style }: TableCellEditorProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const history = useEditableHistory({ ref, value: html, toHtml: asIs, historyKey, surface: 'canvas' });
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-history-key={historyKey}
      data-history-surface="canvas"
      onInput={(e) => history.commitInput(e.nativeEvent, () => sanitizeTyped(ref.current?.innerHTML ?? '', true), onCommit)}
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
