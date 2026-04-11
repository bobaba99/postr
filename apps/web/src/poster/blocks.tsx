/**
 * Block sub-components — Image, Logo, Table, AuthorLine, RefsBlock,
 * and the BlockFrame wrapper that handles selection + drag/resize
 * affordances.
 *
 * All in one file because they share the same data model and styling
 * conventions and porting them as separate modules would scatter the
 * coupling. Re-split if any one of them grows past ~150 lines.
 */
import ReactDOM from 'react-dom';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { blockSelection } from '@/motion/timelines/blockSelection';
import type {
  Author,
  Block,
  HeadingStyle,
  ImageFit,
  Institution,
  Palette,
  Reference,
  Styles,
  TableData,
} from '@postr/shared';
import { TABLE_BORDER_PRESETS } from './constants';
import { CITATION_STYLES, type CitationStyleKey } from './citations';
import { RichTextEditor, type SelectionInfo } from './RichTextEditor';
import { FloatingFormatToolbar } from './FloatingFormatToolbar';
import {
  DEFAULT_TABLE_DATA,
  deleteColAt,
  deleteRowAt,
  insertCol,
  insertRow,
  parseTablePaste,
  updateCell,
} from './tableOps';

// =========================================================================
// LogoBlock
// =========================================================================

interface LogoBlockProps {
  block: Block;
  onUpdate: (patch: Partial<Block>) => void;
}

// =========================================================================
// readImageFile — validated image upload helper
// =========================================================================
//
// Called by both LogoBlock and ImageBlock before handing a File off
// to FileReader. Rejects:
//
//   1. Anything whose MIME type doesn't start with `image/` — users
//      occasionally drop PDFs or zip files here and the previous
//      implementation happily stuffed them into the block as raw
//      base64, then the `<img src>` went blank on load with no
//      feedback.
//   2. Files larger than MAX_BYTES (10 MB). Base64 encoding inflates
//      ~33 %, so a 15 MB PNG becomes a 20 MB string in the poster
//      JSONB column. Supabase enforces its own row-size limits and
//      editors grind to a halt measuring +20 MB strings on every
//      autosave.
//
// On success, calls `onLoad(dataUrl)`. On failure, pops a browser
// alert with a human-readable reason. `alert()` is blunt but
// matches the app's existing error-feedback pattern for other
// file-level errors (e.g. parseBibtex) and avoids adding a new
// toast system just for this.

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB pre-encoding

function readImageFile(
  file: File | undefined,
  onLoad: (dataUrl: string) => void,
) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    window.alert(
      `"${file.name}" doesn't look like an image (got ${file.type || 'unknown type'}).\n\n` +
        'Upload PNG, JPEG, GIF, WebP, or SVG instead.',
    );
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    window.alert(
      `"${file.name}" is ${mb} MB — too large.\n\n` +
        'Images must be under 10 MB. Try compressing the PNG/JPEG in Preview (macOS) or an online tool.',
    );
    return;
  }
  const r = new FileReader();
  r.onload = (ev) => onLoad(ev.target?.result as string);
  r.onerror = () => {
    window.alert(
      `Couldn't read "${file.name}". The file may be corrupted or unreadable.`,
    );
  };
  r.readAsDataURL(file);
}

export function LogoBlock({ block, onUpdate }: LogoBlockProps) {
  const ref = useRef<HTMLInputElement | null>(null);
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    readImageFile(e.target.files?.[0], (dataUrl) =>
      onUpdate({ imageSrc: dataUrl }),
    );
    // Reset the input so selecting the same file twice still fires
    // onChange (browsers dedupe otherwise).
    e.target.value = '';
  };

  if (block.imageSrc) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img
          src={block.imageSrc}
          alt="Poster logo"
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        />
      </div>
    );
  }

  return (
    <div
      onClick={() => ref.current?.click()}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1.5px dashed #ccc',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 13,
        color: '#999',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <span>+ Logo</span>
      <input ref={ref} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
    </div>
  );
}

// =========================================================================
// ImageBlock
// =========================================================================

interface ImageBlockProps {
  block: Block;
  palette: Palette;
  onUpdate: (patch: Partial<Block>) => void;
  /**
   * Gates the in-image overlay (fit toggle + replace + remove).
   * The overlay only shows while the block is selected so it
   * doesn't visually clutter the canvas on deselected image blocks.
   * User-flagged 2026-04-11.
   */
  selected?: boolean;
}

export function ImageBlock({ block, palette, onUpdate, selected = false }: ImageBlockProps) {
  const ref = useRef<HTMLInputElement | null>(null);
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    readImageFile(e.target.files?.[0], (dataUrl) =>
      onUpdate({ imageSrc: dataUrl }),
    );
    e.target.value = '';
  };

  // Fit mode cycle: contain → cover → fill → contain. Labels use
  // the FULL word instead of an abbreviation — the original
  // one-letter "C/C/F" was ambiguous because contain + cover both
  // start with C, and even the short "FIT/CROP/FILL" was flagged
  // as confusing by the user. The tooltip carries the full
  // explanation so tiny blocks that can't afford the label width
  // can still show meaningful help on hover.
  const FIT_LABEL: Record<ImageFit, string> = {
    contain: 'Contain',
    cover: 'Cover',
    fill: 'Fill',
  };
  const FIT_HINT: Record<ImageFit, string> = {
    contain:
      'Contain — image scales to fit entirely inside the block (may leave blank strips if aspect ratios differ). Click to cycle to Cover.',
    cover:
      'Cover — image fills the block and overflow is cropped (no blank strips). Click to cycle to Fill.',
    fill:
      'Fill — image stretches to fill the block exactly (may distort aspect ratio). Click to cycle to Contain.',
  };
  const toggleFit = () => {
    const current = block.imageFit ?? 'contain';
    const next = current === 'contain' ? 'cover' : current === 'cover' ? 'fill' : 'contain';
    onUpdate({ imageFit: next });
  };

  if (block.imageSrc) {
    const currentFit = block.imageFit ?? 'contain';
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
        {/*
          `draggable={false}` + `onDragStart preventDefault` + CSS
          user-drag:none all three together are required to kill the
          browser's native image-drag ghost. Without them, pointerdown
          on the <img> hands over to the browser's drag-to-desktop
          behavior and the app's pointermove handler never fires,
          leaving the block "stuck". Issue reported 2026-04-11 — the
          user couldn't move image blocks because the browser
          intercepted every drag as an image drag.
          `WebkitUserDrag` covers Safari, `userSelect: none` blocks
          text-selection on decorative image alt text, and
          `pointerEvents: none` would break our own drag handler, so
          we don't use it — instead we rely on the outer frame's
          onPointerDown bubbling up from the image container div.
        */}
        <img
          src={block.imageSrc}
          alt={block.caption || 'Figure'}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          style={{
            width: '100%',
            height: '100%',
            objectFit: currentFit,
            userSelect: 'none',
            WebkitUserDrag: 'none',
            KhtmlUserDrag: 'none',
            MozUserDrag: 'none',
            OUserDrag: 'none',
          } as CSSProperties}
        />
        {/*
          In-image overlay with Contain/Cover/Fill toggle, replace
          button, and remove button. Only rendered while the block
          is selected so the canvas stays clean for deselected
          images. Matches the external-handles pattern above: chrome
          only appears when you're actively interacting with a block.
        */}
        {selected && (
          <div style={{ position: 'absolute', top: 2, right: 2, display: 'flex', gap: 2 }}>
            <button
              onClick={toggleFit}
              title={FIT_HINT[currentFit]}
              style={{
                ...iconBtn,
                width: 'auto',
                minWidth: 32,
                padding: '0 6px',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.4,
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            >
              {FIT_LABEL[currentFit]}
            </button>
            <button
              onClick={() => ref.current?.click()}
              title="Replace image — choose a different file"
              style={iconBtn}
            >
              ↻
            </button>
            <button
              onClick={() => onUpdate({ imageSrc: null })}
              title="Remove image"
              style={{ ...iconBtn, background: 'rgba(180,30,30,.8)' }}
            >
              ×
            </button>
          </div>
        )}
        <input ref={ref} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      </div>
    );
  }

  return (
    <div
      onClick={() => ref.current?.click()}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1.5px dashed ${palette.muted}44`,
        borderRadius: 4,
        // Inherit the BlockFrame's cursor: move so the user sees
        // the block is draggable. The click-to-upload path still
        // fires through the onClick handler — drag-vs-click
        // disambiguation is handled by the BlockFrame's
        // didDragRef in onClickCapture.
        cursor: 'inherit',
        color: palette.muted,
        fontSize: 13,
        gap: 3,
        textAlign: 'center',
        padding: '0 8px',
      }}
    >
      <span style={{ fontWeight: 600 }}>+ Upload figure</span>
      <span style={{ fontSize: 13, opacity: 0.7 }}>click to browse · drag to move</span>
      <input ref={ref} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
    </div>
  );
}

const iconBtn: CSSProperties = {
  background: 'rgba(0,0,0,.6)',
  color: '#fff',
  border: 'none',
  borderRadius: 3,
  width: 18,
  height: 18,
  fontSize: 13,
  cursor: 'pointer',
};

// =========================================================================
// TableBlock
// =========================================================================

interface TableBlockProps {
  block: Block;
  palette: Palette;
  fontFamily: string;
  styles: Styles;
  onUpdate: (patch: Partial<Block>) => void;
}

export function TableBlock({ block, palette, fontFamily, styles, onUpdate }: TableBlockProps) {
  const data: TableData = block.tableData ?? DEFAULT_TABLE_DATA;
  const preset = TABLE_BORDER_PRESETS[data.borderPreset] ?? TABLE_BORDER_PRESETS.apa!;
  const colWidths = data.colWidths ?? Array(data.cols).fill(100 / data.cols);

  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  // Active (focused) cell for highlight + keyboard navigation
  const [activeCell, setActiveCell] = useState<{ r: number; c: number } | null>(null);
  // Whole-row / whole-column selection — set when the user clicks
  // the narrow header strip on the left (rows) or top (cols) of the
  // table. Pressing Delete or Backspace while one of these is set
  // removes the whole row or column. Mutually exclusive with
  // activeCell (selecting a row clears cell focus and vice versa).
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  // Rectangular cell-range selection (drag-select). `rangeStart` and
  // `rangeEnd` are the two corners; normalize via min/max to compute
  // the rectangle. While dragging, `dragRangeRef` holds the start
  // cell and serves as the "drag in progress" flag — we use a ref
  // instead of state so mouseenter handlers see the latest value
  // without waiting for a re-render.
  const [rangeStart, setRangeStart] = useState<{ r: number; c: number } | null>(null);
  const [rangeEnd, setRangeEnd] = useState<{ r: number; c: number } | null>(null);
  const dragRangeRef = useRef<{ start: { r: number; c: number } } | null>(null);
  // Right-click context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; r: number; c: number } | null>(null);

  const clearHover = () => { setHoveredRow(null); setHoveredCol(null); };

  const commit = (next: TableData) => onUpdate({ tableData: next });
  const updateCellValue = (r: number, c: number, v: string) => commit(updateCell(data, r, c, v));

  // Focus a cell's contentEditable div by (row, col)
  const focusCell = (r: number, c: number) => {
    if (r < 0 || r >= data.rows || c < 0 || c >= data.cols) return;
    setActiveCell({ r, c });
    const container = tableContainerRef.current;
    if (!container) return;
    const cells = container.querySelectorAll<HTMLElement>('td [contenteditable]');
    const idx = r * data.cols + c;
    cells[idx]?.focus();
  };

  // Keyboard navigation: Tab, Shift+Tab, Arrow keys at content edges
  const onCellKeyDown = (e: React.KeyboardEvent, r: number, c: number) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        // Previous cell
        if (c > 0) focusCell(r, c - 1);
        else if (r > 0) focusCell(r - 1, data.cols - 1);
      } else {
        // Next cell
        if (c < data.cols - 1) focusCell(r, c + 1);
        else if (r < data.rows - 1) focusCell(r + 1, 0);
      }
      return;
    }
    // Arrow keys — only navigate when cursor is at the edge of content.
    // Use a range-based check that works with nested rich-text nodes
    // (e.g. <b>text</b>) by comparing the caret position against the
    // cell's full text length rather than the current text node.
    const el = e.currentTarget;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;

    // Compute caret offset relative to the entire cell, not just the
    // current text node. This handles <b>, <i>, <mark> wrappers.
    const caretRange = sel.getRangeAt(0);
    const preRange = document.createRange();
    preRange.selectNodeContents(el);
    preRange.setEnd(caretRange.startContainer, caretRange.startOffset);
    const caretOffset = preRange.toString().length;
    const totalLen = (el.textContent ?? '').length;
    const atStart = caretOffset === 0;
    const atEnd = caretOffset >= totalLen;

    if (e.key === 'ArrowUp' && atStart && r > 0) { e.preventDefault(); focusCell(r - 1, c); }
    if (e.key === 'ArrowDown' && atEnd && r < data.rows - 1) { e.preventDefault(); focusCell(r + 1, c); }
    if (e.key === 'ArrowLeft' && atStart && c > 0) { e.preventDefault(); focusCell(r, c - 1); }
    if (e.key === 'ArrowRight' && atEnd && c < data.cols - 1) { e.preventDefault(); focusCell(r, c + 1); }
    // Escape closes context menu
    if (e.key === 'Escape') setCtxMenu(null);
  };

  // Close context menu on any click or right-click outside. We listen
  // on `mousedown` instead of `click` and in the CAPTURE phase so the
  // handler fires BEFORE any stopPropagation in the canvas/block/
  // sidebar event tree can swallow it. The menu itself stops
  // propagation on mousedown (see TableContextMenu) so internal
  // clicks on menu items don't trigger dismissal before the button's
  // own onClick fires.
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener('mousedown', close, { capture: true });
    document.addEventListener('contextmenu', close, { capture: true });
    return () => {
      document.removeEventListener('mousedown', close, { capture: true } as AddEventListenerOptions);
      document.removeEventListener('contextmenu', close, { capture: true } as AddEventListenerOptions);
    };
  }, [ctxMenu]);

  // Whole-row / whole-column delete via the Delete key. Scoped to a
  // window-level listener so it works when focus is on the header
  // strip (which is NOT contentEditable) rather than a cell.
  useEffect(() => {
    if (selectedRow === null && selectedCol === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      // Don't hijack keystrokes aimed at an editable element
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      e.preventDefault();
      if (selectedRow !== null && data.rows > 1) {
        commit(deleteRowAt(data, selectedRow));
        setSelectedRow(null);
      } else if (selectedCol !== null && data.cols > 1) {
        commit(deleteColAt(data, selectedCol));
        setSelectedCol(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedRow, selectedCol, data, commit]);

  // Range cell-content clear via Delete/Backspace. Fires only when a
  // multi-cell range is selected and no editable target has focus.
  useEffect(() => {
    if (!rangeStart || !rangeEnd) return;
    // Skip if the range is just a single cell — single-cell work
    // goes through normal contentEditable editing.
    const single = rangeStart.r === rangeEnd.r && rangeStart.c === rangeEnd.c;
    if (single) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      e.preventDefault();
      const r0 = Math.min(rangeStart.r, rangeEnd.r);
      const r1 = Math.max(rangeStart.r, rangeEnd.r);
      const c0 = Math.min(rangeStart.c, rangeEnd.c);
      const c1 = Math.max(rangeStart.c, rangeEnd.c);
      let next = data;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          next = updateCell(next, r, c, '');
        }
      }
      commit(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rangeStart, rangeEnd, data, commit]);

  // Document-level mouseup to flip off the drag-in-progress flag.
  // The range state itself stays as-is — a single-cell range (no
  // drag) will be cleared when that cell's contentEditable gains
  // focus in the onFocus handler below.
  useEffect(() => {
    const onUp = () => {
      dragRangeRef.current = null;
    };
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  }, []);

  // Helpers for the cell-in-range check used by the highlight logic.
  const inRange = (r: number, c: number) => {
    if (!rangeStart || !rangeEnd) return false;
    const r0 = Math.min(rangeStart.r, rangeEnd.r);
    const r1 = Math.max(rangeStart.r, rangeEnd.r);
    const c0 = Math.min(rangeStart.c, rangeEnd.c);
    const c1 = Math.max(rangeStart.c, rangeEnd.c);
    return r >= r0 && r <= r1 && c >= c0 && c <= c1;
  };
  const isMultiCellRange = !!(
    rangeStart &&
    rangeEnd &&
    (rangeStart.r !== rangeEnd.r || rangeStart.c !== rangeEnd.c)
  );

  // Click anywhere outside the table container clears row/col selection.
  useEffect(() => {
    if (selectedRow === null && selectedCol === null) return;
    const onClick = (e: MouseEvent) => {
      const el = tableContainerRef.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      setSelectedRow(null);
      setSelectedCol(null);
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [selectedRow, selectedCol]);

  // Notion/Canva parity: drag-to-resize column borders. Capture the
  // pointer on mousedown over a border handle, track horizontal delta
  // in table-percentage units, and redistribute between the column
  // being dragged and the column to its right. Ships with a minimum
  // column width of 8% so users can't accidentally collapse a cell
  // to zero. The final colWidths is normalised so it always sums to
  // 100%.
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const onColResizeStart = (colIdx: number, e: React.PointerEvent) => {
    if (colIdx < 0 || colIdx >= data.cols - 1) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const tableEl = tableContainerRef.current?.querySelector('table');
    if (!tableEl) return;
    const tableWidthPx = tableEl.getBoundingClientRect().width;
    if (tableWidthPx <= 0) return;
    const startWidths = [...colWidths];
    const MIN = 8;
    const onMove = (ev: PointerEvent) => {
      const dxPct = ((ev.clientX - startX) / tableWidthPx) * 100;
      const next = [...startWidths];
      let delta = dxPct;
      if (next[colIdx]! + delta < MIN) delta = MIN - next[colIdx]!;
      if (next[colIdx + 1]! - delta < MIN) delta = next[colIdx + 1]! - MIN;
      next[colIdx] = next[colIdx]! + delta;
      next[colIdx + 1] = next[colIdx + 1]! - delta;
      commit({ ...data, colWidths: next });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const html = e.clipboardData.getData('text/html');
    const txt = e.clipboardData.getData('text/plain');
    const next = parseTablePaste(html, txt);
    if (next) {
      e.preventDefault();
      commit(next);
    }
  };

  // Per-cell border CSS based on the active preset.
  const cellBorder = (r: number, c: number): CSSProperties => {
    const lw = '0.8px';
    const col = palette.muted + '55';
    let t = 'none', ri = 'none', b = 'none', l = 'none';
    if (preset.outerBorder) {
      if (r === 0) t = `${lw} solid ${col}`;
      if (r === data.rows - 1) b = `${lw} solid ${col}`;
      if (c === 0) l = `${lw} solid ${col}`;
      if (c === data.cols - 1) ri = `${lw} solid ${col}`;
    }
    if (preset.topLine && r === 0) t = `1.5px solid ${palette.primary}`;
    if (preset.headerLine && r === 1) t = `1px solid ${palette.primary}`;
    if (preset.bottomLine && r === data.rows - 1) b = `1.5px solid ${palette.primary}`;
    if (preset.horizontalLines && r > 0) t = `${lw} solid ${col}`;
    if (preset.verticalLines && c > 0) l = `${lw} solid ${col}`;
    if (preset.headerBox && r === 0) {
      t = `1.5px solid ${palette.primary}`;
      b = `1px solid ${palette.primary}`;
      if (c === 0) l = `1px solid ${palette.primary}`;
      if (c === data.cols - 1) ri = `1px solid ${palette.primary}`;
    }
    return { borderTop: t, borderRight: ri, borderBottom: b, borderLeft: l };
  };

  // Shared handle button style (circle with + or ×).
  return (
    <div
      style={{ width: '100%', height: '100%', overflow: 'visible', padding: 2, position: 'relative' }}
      onPasteCapture={onPaste}
      onMouseLeave={clearHover}
    >
      {/*
        B4 fix: the bottom/right append "+" handles were positioned
        against the BlockFrame's declared `h`, not the table's actual
        height. Small tables (e.g. the default 3×3 placeholder) left
        the bottom "+" floating far below the table in empty space.
        Wrap the table + all handles in a relative container that
        shrinks to the table's intrinsic size, so "+ bottom" really
        sits on the table's bottom edge.
      */}
      <div
        ref={tableContainerRef}
        style={{ position: 'relative', display: 'inline-block', width: '100%' }}
      >
      {/*
        Column resize handles — one thin vertical stripe on every
        border EXCEPT the rightmost. Starts a drag that redistributes
        percentage width between this column and the one to its right.
        Semi-transparent by default, darkens on hover for discovery.
      */}
      {/*
        Active-cell row + column guide overlay. When a cell is focused,
        draw a faint gray band spanning the whole row and another
        spanning the whole column, so the user can see which row/col
        they're typing in at a glance (Excel / Numbers pattern). Uses
        percentage-based positioning so it survives column resize.
      */}
      {activeCell && (
        <>
          {/* Row band — full width, positioned at the active row's vertical slot */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${(activeCell.r / data.rows) * 100}%`,
              height: `${100 / data.rows}%`,
              background: '#9ca3af18',
              borderTop: '1px solid #9ca3af66',
              borderBottom: '1px solid #9ca3af66',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
          {/* Column band — full height, positioned at the active col's horizontal slot */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${colWidths.slice(0, activeCell.c).reduce((s, w) => s + w, 0)}%`,
              width: `${colWidths[activeCell.c] ?? 100 / data.cols}%`,
              background: '#9ca3af18',
              borderLeft: '1px solid #9ca3af66',
              borderRight: '1px solid #9ca3af66',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        </>
      )}
      {colWidths.slice(0, -1).map((_, i) => {
        const leftPct = colWidths.slice(0, i + 1).reduce((s, w) => s + w, 0);
        return (
          <div
            key={`col-resize-${i}`}
            title="Drag to resize column"
            onPointerDown={(e) => onColResizeStart(i, e)}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `calc(${leftPct}% - 3px)`,
              width: 6,
              cursor: 'col-resize',
              zIndex: 2,
            }}
          />
        );
      })}
      <table
        style={{ width: '100%', borderCollapse: 'collapse', fontFamily, fontSize: styles.body.size, tableLayout: 'fixed' }}
      >
        <colgroup>
          {colWidths.map((w, i) => (
            <col key={i} style={{ width: `${w}%` }} />
          ))}
        </colgroup>
        <tbody>
          {Array.from({ length: data.rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: data.cols }).map((_, c) => {
                const isActive = activeCell?.r === r && activeCell?.c === c;
                const inSelectedRow = selectedRow === r;
                const inSelectedCol = selectedCol === c;
                const inRangeCell = inRange(r, c);
                const inSelection = inSelectedRow || inSelectedCol || inRangeCell;
                return (
                <td
                  key={c}
                  onMouseDown={(e) => {
                    // Left button only; ignore right-click.
                    if (e.button !== 0) return;
                    // Seed the drag-range at this cell. If the user
                    // releases without moving, this ends up being a
                    // no-op — the contentEditable inside focuses
                    // normally and the onFocus handler clears the
                    // range. If they drag into another cell, the
                    // onMouseEnter below extends the range.
                    dragRangeRef.current = { start: { r, c } };
                    setRangeStart({ r, c });
                    setRangeEnd({ r, c });
                    // Also clear whole-row/col selection.
                    setSelectedRow(null);
                    setSelectedCol(null);
                  }}
                  onMouseEnter={() => {
                    setHoveredRow(r);
                    setHoveredCol(c);
                    // If a drag is in progress, extend the range to
                    // this cell. Also blur whatever contentEditable
                    // the drag started in so its caret doesn't
                    // stutter during the drag.
                    if (dragRangeRef.current) {
                      const start = dragRangeRef.current.start;
                      if (start.r !== r || start.c !== c) {
                        (document.activeElement as HTMLElement | null)?.blur?.();
                      }
                      setRangeEnd({ r, c });
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCtxMenu({ x: e.clientX, y: e.clientY, r, c });
                  }}
                  style={{
                    ...cellBorder(r, c),
                    padding: '2px 4px',
                    // Selected row/col/range tints the whole cell;
                    // header row keeps its faint accent underlay
                    // otherwise.
                    background: inSelection
                      ? palette.accent + '22'
                      : r === 0
                        ? palette.accent + '0a'
                        : 'transparent',
                    fontWeight: r === 0 ? 700 : 400,
                    color: palette.primary,
                    position: 'relative',
                    // Active cell highlight — subtle accent border.
                    // Selected row/col/range overrides with a stronger
                    // border on every cell in the selection.
                    boxShadow: inSelection
                      ? `inset 0 0 0 1.5px ${palette.accent}`
                      : isActive
                        ? `inset 0 0 0 1.5px ${palette.accent}88`
                        : 'none',
                    userSelect: isMultiCellRange ? 'none' : 'auto',
                  }}
                >
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    dangerouslySetInnerHTML={{ __html: data.cells[r * data.cols + c] ?? '' }}
                    onInput={(e) => updateCellValue(r, c, e.currentTarget.innerHTML)}
                    onFocus={() => {
                      setActiveCell({ r, c });
                      // Focusing a cell clears any whole-row/col
                      // selection AND any multi-cell range. If a
                      // range drag is still in progress (ref is set)
                      // we leave the range state alone so the drag
                      // can continue — focus-clear only wins on a
                      // completed click.
                      setSelectedRow(null);
                      setSelectedCol(null);
                      if (!dragRangeRef.current) {
                        setRangeStart(null);
                        setRangeEnd(null);
                      }
                    }}
                    onBlur={() => setActiveCell((prev) => prev?.r === r && prev?.c === c ? null : prev)}
                    onKeyDown={(e) => onCellKeyDown(e, r, c)}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{
                      outline: 'none',
                      width: '100%',
                      minHeight: '1em',
                      fontFamily,
                      fontSize: styles.body.size,
                      color: palette.primary,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  />
                </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/*
        Row selector strip — narrow clickable band along the left edge.
        Each row gets one strip; clicking it selects the whole row and
        highlights every cell in that row. Pressing Delete (handled by
        the window listener above) removes the row. Header row 0 is
        included so users can delete it if they don't want a header.
      */}
      {Array.from({ length: data.rows }).map((_, r) => {
        // Row height is 100% / rows — use flex spacing via top %.
        const topPct = (r / data.rows) * 100;
        const heightPct = 100 / data.rows;
        const isSel = selectedRow === r;
        return (
          <div
            key={`row-sel-${r}`}
            role="button"
            aria-label={`Select row ${r + 1}`}
            title={`Select row ${r + 1} (Delete to remove)`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedRow((prev) => (prev === r ? null : r));
              setSelectedCol(null);
              setActiveCell(null);
            }}
            style={{
              position: 'absolute',
              top: `${topPct}%`,
              height: `${heightPct}%`,
              left: -10,
              width: 8,
              cursor: 'pointer',
              background: isSel ? palette.accent : 'transparent',
              borderRadius: 2,
              opacity: isSel ? 0.9 : 0.2,
              transition: 'opacity 100ms, background 100ms',
              zIndex: 3,
            }}
            onMouseEnter={(e) => {
              if (!isSel) e.currentTarget.style.background = palette.accent + '55';
              e.currentTarget.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              if (!isSel) e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.opacity = isSel ? '0.9' : '0.2';
            }}
          />
        );
      })}

      {/*
        Column selector strip — narrow clickable band along the top
        edge. Same pattern as rows.
      */}
      {Array.from({ length: data.cols }).map((_, c) => {
        const leftPct = colWidths.slice(0, c).reduce((s, w) => s + w, 0);
        const widthPct = colWidths[c] ?? 100 / data.cols;
        const isSel = selectedCol === c;
        return (
          <div
            key={`col-sel-${c}`}
            role="button"
            aria-label={`Select column ${c + 1}`}
            title={`Select column ${c + 1} (Delete to remove)`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedCol((prev) => (prev === c ? null : c));
              setSelectedRow(null);
              setActiveCell(null);
            }}
            style={{
              position: 'absolute',
              top: -10,
              height: 8,
              left: `${leftPct}%`,
              width: `${widthPct}%`,
              cursor: 'pointer',
              background: isSel ? palette.accent : 'transparent',
              borderRadius: 2,
              opacity: isSel ? 0.9 : 0.2,
              transition: 'opacity 100ms, background 100ms',
              zIndex: 3,
            }}
            onMouseEnter={(e) => {
              if (!isSel) e.currentTarget.style.background = palette.accent + '55';
              e.currentTarget.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              if (!isSel) e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.opacity = isSel ? '0.9' : '0.2';
            }}
          />
        );
      })}

      {/*
        Hover-only "+" at bottom and right edges (Notion pattern).
        Only visible when the mouse is over the table — not permanent.
        Single append action, no delete buttons on the canvas.
        All structural edits (insert-at-position, delete) live in the
        sidebar TableEditor stepper.
      */}
      {hoveredRow !== null && hoveredRow === data.rows - 1 && (
        <button
          type="button"
          title="Add row"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            commit(insertRow(data, data.rows - 1, 'below'));
          }}
          style={{
            all: 'unset',
            cursor: 'pointer',
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 3,
            background: palette.accent,
            opacity: 0.7,
            borderRadius: 1,
            zIndex: 2,
          }}
        />
      )}
      {hoveredCol !== null && hoveredCol === data.cols - 1 && (
        <button
          type="button"
          title="Add column"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            commit(insertCol(data, data.cols - 1, 'right'));
          }}
          style={{
            all: 'unset',
            cursor: 'pointer',
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            width: 3,
            background: palette.accent,
            opacity: 0.7,
            borderRadius: 1,
            zIndex: 2,
          }}
        />
      )}
      </div>

      {/* Figma-style right-click context menu */}
      {ctxMenu && ReactDOM.createPortal(
        <TableContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          r={ctxMenu.r}
          c={ctxMenu.c}
          data={data}
          onAction={(action) => {
            setCtxMenu(null);
            switch (action) {
              case 'insertRowAbove': commit(insertRow(data, ctxMenu.r, 'above')); break;
              case 'insertRowBelow': commit(insertRow(data, ctxMenu.r, 'below')); break;
              case 'insertColLeft': commit(insertCol(data, ctxMenu.c, 'left')); break;
              case 'insertColRight': commit(insertCol(data, ctxMenu.c, 'right')); break;
              case 'deleteRow': if (data.rows > 1) commit(deleteRowAt(data, ctxMenu.r)); break;
              case 'deleteCol': if (data.cols > 1) commit(deleteColAt(data, ctxMenu.c)); break;
              case 'clearCell': commit(updateCell(data, ctxMenu.r, ctxMenu.c, '')); break;
            }
          }}
          onClose={() => setCtxMenu(null)}
        />,
        document.body,
      )}
    </div>
  );
}

// ── TableContextMenu — Figma-style right-click menu ────────────────

type CtxAction = 'insertRowAbove' | 'insertRowBelow' | 'insertColLeft' | 'insertColRight' | 'deleteRow' | 'deleteCol' | 'clearCell';

function TableContextMenu({ x, y, r, c, data, onAction, onClose }: {
  x: number;
  y: number;
  r: number;
  c: number;
  data: TableData;
  onAction: (a: CtxAction) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust position so menu doesn't overflow viewport
  const adjX = Math.min(x, window.innerWidth - 200);
  const adjY = Math.min(y, window.innerHeight - 260);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const item = (label: string, action: CtxAction, danger?: boolean, disabled?: boolean) => (
    <button
      key={action}
      onClick={(e) => { e.stopPropagation(); onAction(action); }}
      disabled={disabled}
      style={{
        all: 'unset',
        display: 'block',
        width: '100%',
        padding: '6px 12px',
        fontSize: 13,
        color: disabled ? '#555' : danger ? '#f87171' : '#c8cad0',
        cursor: disabled ? 'not-allowed' : 'pointer',
        borderRadius: 4,
        boxSizing: 'border-box',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#1e1e2e'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );

  const sep = <div style={{ height: 1, background: '#2a2a3a', margin: '4px 0' }} />;

  return (
    <div
      ref={menuRef}
      // Stop both click AND mousedown so the window-level close
      // listener below (which listens on mousedown to dodge
      // stopPropagation on button clicks elsewhere in the tree)
      // doesn't dismiss the menu while the user is trying to click
      // one of its items.
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      style={{
        position: 'fixed',
        top: adjY,
        left: adjX,
        width: 180,
        background: '#111118',
        border: '1px solid #2a2a3a',
        borderRadius: 8,
        padding: '4px 0',
        boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
        zIndex: 10003,
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <div style={{ padding: '4px 12px 6px', fontSize: 13, color: '#6b7280', fontWeight: 600 }}>
        Cell ({r + 1}, {c + 1})
      </div>
      {sep}
      {item('Insert row above', 'insertRowAbove')}
      {item('Insert row below', 'insertRowBelow')}
      {sep}
      {item('Insert column left', 'insertColLeft')}
      {item('Insert column right', 'insertColRight')}
      {sep}
      {item('Clear cell', 'clearCell')}
      {sep}
      {item('Delete row', 'deleteRow', true, data.rows <= 1)}
      {item('Delete column', 'deleteCol', true, data.cols <= 1)}
    </div>
  );
}

// =========================================================================
// AuthorLine — renders the author + affiliation footer
// =========================================================================

interface AuthorLineProps {
  authors: Author[];
  institutions: Institution[];
  palette: Palette;
  fontFamily: string;
  styles: Styles;
}

export function AuthorLine({ authors, institutions, palette, fontFamily, styles }: AuthorLineProps) {
  const used = institutions.filter((inst) => authors.some((a) => a.affiliationIds.includes(inst.id)));
  const validAuthors = authors.filter((a) => a.name);

  if (!validAuthors.length) {
    return (
      <span style={{ color: palette.muted, fontStyle: 'italic', fontSize: styles.authors.size }}>
        Add authors in sidebar →
      </span>
    );
  }

  const hasEqual = validAuthors.some((a) => a.equalContrib);
  const hasCorr = validAuthors.some((a) => a.isCorresponding);

  return (
    <div
      style={{
        textAlign: 'center',
        fontFamily,
        fontSize: styles.authors.size,
        fontWeight: styles.authors.weight,
        color: palette.primary,
        lineHeight: styles.authors.lineHeight,
      }}
    >
      <div>
        {validAuthors.map((a, i) => {
          const indices = a.affiliationIds
            .map((id) => used.findIndex((x) => x.id === id))
            .filter((x) => x >= 0)
            .map((x) => x + 1);
          const markers: (number | string)[] = [...indices];
          if (a.equalContrib) markers.push('*');
          if (a.isCorresponding) markers.push('†');
          return (
            <span key={a.id}>
              {i > 0 ? ', ' : ''}
              {a.name}
              {markers.length > 0 && (
                <sup style={{ fontSize: '0.6em', color: palette.accent, fontWeight: 600 }}>{markers.join(',')}</sup>
              )}
            </span>
          );
        })}
      </div>
      {used.length > 0 && (
        <div style={{ fontSize: styles.authors.size * 0.82, color: palette.muted, marginTop: 1 }}>
          {used.map((inst, i) => (
            <span key={inst.id}>
              {i > 0 ? ' · ' : ''}
              <sup style={{ fontSize: '0.7em', fontWeight: 600 }}>{i + 1}</sup>
              {[inst.name, inst.dept, inst.location].filter(Boolean).join(', ')}
            </span>
          ))}
        </div>
      )}
      {(hasEqual || hasCorr) && (
        <div style={{ fontSize: styles.authors.size * 0.72, color: palette.muted, marginTop: 1, fontStyle: 'italic' }}>
          {hasEqual && '*Equal contribution'}
          {hasEqual && hasCorr && ' · '}
          {hasCorr && '†Corresponding author'}
        </div>
      )}
    </div>
  );
}

// =========================================================================
// RefsBlock — references list rendered with active citation style
// =========================================================================

interface RefsBlockProps {
  references: Reference[];
  palette: Palette;
  fontFamily: string;
  styles: Styles;
  citationStyle: CitationStyleKey;
}

export function RefsBlock({ references, palette, fontFamily, styles, citationStyle }: RefsBlockProps) {
  if (!references?.length) {
    return (
      <div style={{ color: palette.muted, fontSize: styles.body.size, fontStyle: 'italic' }}>
        Add references in Refs tab →
      </div>
    );
  }
  const fmt = CITATION_STYLES[citationStyle] ?? CITATION_STYLES['APA 7'];
  return (
    <div style={{ fontFamily, fontSize: styles.body.size * 0.88, color: palette.primary, lineHeight: styles.body.lineHeight }}>
      <div style={{ fontWeight: 700, fontSize: styles.body.size, marginBottom: 3, color: palette.accent }}>
        References
      </div>
      {references.map((r, i) => (
        <div key={r.id ?? i} style={{ marginBottom: 2, opacity: 0.85 }}>
          {fmt(r, i)}
        </div>
      ))}
    </div>
  );
}

// =========================================================================
// CaptionWrapper — renders figure/table caption alongside the content
// =========================================================================
//
// Wraps image and table blocks so their optional caption renders as a
// flex sibling of the actual content. `captionPosition` controls the
// flex direction (top → column-reverse, bottom → column, left → row-
// reverse, right → row); if the position is 'none' or the block has
// no stored caption + no auto number, the wrapper is a pass-through.
//
// The `Figure N.` / `Table N.` numbering prefix is driven entirely by
// the `captionNumber` prop (auto-computed by PosterEditor based on
// reading-order rank). Users type only the descriptive text — the
// number updates automatically whenever they drag the underlying
// block into a new position on the canvas.

interface CaptionWrapperProps {
  block: Block;
  palette: Palette;
  fontFamily: string;
  styles: Styles;
  captionNumber?: number;
  label: 'Figure' | 'Table';
  children: React.ReactNode;
}

function CaptionWrapper({
  block,
  palette,
  fontFamily,
  styles,
  captionNumber,
  label,
  children,
}: CaptionWrapperProps) {
  const position = block.captionPosition ?? 'top';
  // Even an empty caption gets the auto-numbered prefix so users can
  // see "Figure 1." immediately after placing a figure. Setting
  // `captionPosition: 'none'` opts out entirely.
  const shouldRender = position !== 'none' && captionNumber !== undefined;
  if (!shouldRender) {
    return <>{children}</>;
  }

  const flexDirection: React.CSSProperties['flexDirection'] =
    position === 'top'
      ? 'column-reverse'
      : position === 'bottom'
        ? 'column'
        : position === 'left'
          ? 'row-reverse'
          : 'row';

  // Match the body font size + authors-row weight so the caption
  // reads as a subtle label under/beside the figure. Italic by
  // convention in academic publishing; user can type plain text.
  const captionStyle: React.CSSProperties = {
    fontFamily,
    fontSize: Math.round(styles.body.size * 0.85),
    lineHeight: 1.35,
    color: palette.muted || '#6b7280',
    fontStyle: 'italic',
    flex: '0 0 auto',
    // Side captions get a fixed width so the image doesn't collapse.
    width: position === 'left' || position === 'right' ? '35%' : undefined,
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    overflow: 'hidden',
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection,
        boxSizing: 'border-box',
        // User-controlled caption gap. Clamped at render time so a
        // corrupted stored value can't break layout.
        gap: Math.max(0, Math.min(24, block.captionGap ?? 6)),
      }}
    >
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, position: 'relative' }}>
        {children}
      </div>
      <div style={captionStyle}>
        <b style={{ fontStyle: 'normal', color: palette.primary }}>
          {label} {captionNumber}.
        </b>
        {block.caption ? ` ${block.caption}` : ''}
      </div>
    </div>
  );
}

// =========================================================================
// BlockFrame — wraps every block with selection chrome and drag/resize
// =========================================================================

interface BlockFrameProps {
  block: Block;
  palette: Palette;
  fontFamily: string;
  styles: Styles;
  headingStyle: HeadingStyle;
  authors: Author[];
  institutions: Institution[];
  references: Reference[];
  citationStyle: CitationStyleKey;
  headingNumber: number;
  selected: boolean;
  /**
   * True for ~700 ms after the block was inserted via the Insert
   * tab. Drives the one-shot `postr-block-insert` CSS mount
   * animation in index.css — scale-bounce + fade-in + purple
   * accent glow — so fresh blocks feel "placed" instead of just
   * popping into existence at the canvas center.
   */
  justInserted?: boolean;
  onSelect: (id: string) => void;
  onPointerDown: (
    e: React.PointerEvent,
    id: string,
    mode: 'move' | 'resize' | 'rotate',
  ) => void;
  /**
   * Shared ref from useBlockDrag — true when the user's most recent
   * pointerdown → pointerup sequence actually moved the block.
   * BlockFrame's onClick consults this to decide whether a synthetic
   * click (e.g. from a drag that ended on an image upload div)
   * should be swallowed or forwarded to children.
   */
  didDragRef: React.MutableRefObject<boolean>;
  onUpdate: (id: string, patch: Partial<Block>) => void;
  onDelete: (id: string) => void;
  titleOverflowPx?: number;
  /** True if this block extends outside the poster canvas bounds. */
  isOutOfBounds?: boolean;
  /**
   * Auto-computed figure/table index from reading order. 1-based,
   * undefined for blocks that aren't images or tables. Renders as
   * "Figure 1." / "Table 1." prefix on the caption — the user
   * can't edit the number directly, only the order of blocks.
   */
  captionNumber?: number;
}

export function BlockFrame(props: BlockFrameProps) {
  const {
    block: b,
    palette: p,
    fontFamily: ff,
    styles: st,
    headingStyle: hs,
    authors,
    institutions,
    references,
    citationStyle,
    headingNumber,
    selected,
    justInserted,
    onSelect,
    onPointerDown,
    didDragRef,
    onUpdate,
    onDelete,
    titleOverflowPx,
    isOutOfBounds,
    captionNumber,
  } = props;

  // B1 fix: every non-title block shifts DOWN by the title's overflow
  // amount so wrapped title lines no longer collide with the authors
  // row / body blocks.
  const effectiveTop =
    b.type !== 'title' && typeof titleOverflowPx === 'number' && titleOverflowPx > 0
      ? b.y + titleOverflowPx
      : b.y;

  const isHeading = b.type === 'heading';
  // Blocks that grow with their text content (B1 fix). These use
  // minHeight: b.h as a floor, height: auto so the visible area
  // expands as the user adds more text. Prevents the "title
  // clipped mid-word when too long" bug where the second line
  // disappeared behind the block's fixed bottom edge.
  //
  // B2 fix: `references` added — a poster with many refs was
  // clipping the last entry below the declared block height.
  //
  // 2026-04-11: `authors` added — the default h:22 was too tight
  // for two-line author lists (authors on line 1, institution
  // affiliations on line 2), plus the placeholder "Add authors in
  // sidebar →" was getting partially clipped even as single-line
  // content because of padding + line-height combo. Auto-grow is
  // safer than bumping the declared h and reflowing every template.
  const growsWithContent =
    b.type === 'title' ||
    b.type === 'text' ||
    b.type === 'references' ||
    b.type === 'authors';
  const level = b.type === 'title' ? st.title : b.type === 'authors' ? st.authors : isHeading ? st.heading : st.body;
  const frameRef = useRef<HTMLDivElement | null>(null);
  // Selection info for the floating format toolbar — populated by
  // the RichTextEditor inside this block when the user highlights
  // a range. null = no selection, toolbar hidden.
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);

  // Pop the selection ring when this block becomes selected.
  useEffect(() => {
    if (selected && frameRef.current) {
      blockSelection(frameRef.current);
    }
  }, [selected]);

  const headingBorderStyle = (): CSSProperties => {
    if (hs.border === 'bottom') return { borderBottom: `1.5px solid ${p.accent}44`, paddingBottom: 2 };
    if (hs.border === 'left') return { borderLeft: `3px solid ${p.accent}`, paddingLeft: 6 };
    if (hs.border === 'box') return { border: `1px solid ${p.accent}33`, padding: '3px 6px', borderRadius: 3 };
    if (hs.border === 'thick') return { borderBottom: `3px solid ${p.accent}`, paddingBottom: 1 };
    return {};
  };

  const bg = isHeading
    ? hs.fill
      ? p.accent + '15'
      : hs.border === 'box'
        ? p.accent + '08'
        : 'transparent'
    : 'transparent';

  const txtStyle: CSSProperties = {
    fontFamily: ff,
    fontSize: level.size,
    fontWeight: level.weight,
    fontStyle: level.italic ? 'italic' : 'normal',
    color: level.color || p.primary,
    lineHeight: level.lineHeight,
    backgroundColor: level.highlight || 'transparent',
  };

  const update = (patch: Partial<Block>) => onUpdate(b.id, patch);

  const isTextLike = b.type === 'title' || b.type === 'heading' || b.type === 'text';

  return (
    <div
      ref={frameRef}
      // onClickCapture runs BEFORE the bubbling onClick chain, so if
      // the user just finished a drag we can swallow the synthetic
      // click before it reaches child elements (e.g. the empty
      // ImageBlock's file-picker handler).
      onClickCapture={(e) => {
        if (didDragRef.current) {
          e.stopPropagation();
          didDragRef.current = false;
        }
      }}
      onClick={(e) => {
        e.stopPropagation();
        // Nothing to do if the click is actually the tail of a drag
        // — onClickCapture already reset the ref.
        if (!selected) {
          onSelect(b.id);
          return;
        }
        // Already selected + text-like → focus the inner contentEditable
        // so the caret blinks on the next click. Without this users
        // reported "no blinker until I arrow-key the selection".
        if (isTextLike) {
          const ce = frameRef.current?.querySelector<HTMLElement>('[contenteditable="true"]');
          ce?.focus();
        }
      }}
      onPointerDown={(e) => {
        // For image + logo blocks, require the user to use the
        // external move handle above the block. The browser's native
        // image-drag behavior is aggressive (even with
        // draggable=false there are residual cases on Firefox /
        // Safari where pointerdown on an <img> can still produce
        // weird selection states), so routing every move through the
        // dedicated handle eliminates the edge cases entirely. Text
        // and table blocks still support drag-from-anywhere because
        // there's no competing native behavior there.
        if (b.type === 'image' || b.type === 'logo') return;
        onPointerDown(e, b.id, 'move');
      }}
      data-block-id={b.id}
      data-block-type={b.type}
      style={{
        position: 'absolute',
        left: b.x,
        top: effectiveTop,
        width: b.w,
        // Headings + title/text grow with content. Everything else
        // (image, logo, table, references, authors) stays at its
        // declared h. growsWithContent blocks use minHeight as the
        // floor so they never shrink below the user's resize.
        height: isHeading || growsWithContent ? 'auto' : b.h,
        // Text-like blocks (title / text / heading / authors /
        // references) snap to their natural content height instead
        // of a `minHeight: b.h` floor. Prior behavior left blank
        // padding below short text when the user dragged the block
        // taller — users expected the frame to track the typed
        // content exactly. A small 12 px floor keeps empty blocks
        // grabbable; resizing to taller is handled by Auto-Arrange
        // + re-measuring on content change.
        minHeight: growsWithContent ? 12 : undefined,
        background: bg,
        border: isOutOfBounds
          ? '1.5px dashed #f87171'
          : selected
            ? `1.5px solid ${p.accent}88`
            : '1px solid transparent',
        borderRadius: 2,
        // Smooth the selection ring so clicking a block fades the
        // border in over ~140ms instead of snapping. Scoped to
        // border-color + box-shadow only — transitioning transform
        // would interfere with rotation/drag.
        transition:
          'border-color 140ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 140ms cubic-bezier(0.22, 1, 0.36, 1)',
        // One-shot mount animation for freshly-inserted blocks.
        // `postr-block-insert` scales 0.78 → 1.04 → 1 with a
        // purple accent glow, playing once then clearing when the
        // `justInserted` flag flips back to false 700 ms later.
        // Combined with the existing `b.rotation` transform via
        // inline style order — the animation's `transform: scale()`
        // overrides the rotate during the 500 ms animation window,
        // which is fine because users can't rotate a block the
        // same frame they insert it.
        ...(justInserted && !b.rotation
          ? { animation: 'postr-block-insert 500ms cubic-bezier(0.34, 1.3, 0.64, 1)' }
          : {}),
        // Image + logo blocks get `default` cursor because drag is
        // only available from the move handle. Tables also use
        // default because they have their own inner interactions.
        // Everything else gets the `move` cursor as a hint.
        cursor:
          b.type === 'table' || b.type === 'image' || b.type === 'logo'
            ? 'default'
            : 'move',
        // Frame has no padding — handles positioned with `top: -26`
        // are measured from the padding box edge, which means any
        // padding on the frame would push the handles visually
        // farther from the block content depending on block type.
        // Moving padding to the INNER content div keeps the frame's
        // padding box === border box, so handle positions are
        // consistent across image/logo/table (which had padding 0)
        // and text/title/heading/references (which had padding 4 6).
        padding: 0,
        boxSizing: 'border-box',
        overflow: 'visible',
        // Apply user-defined rotation around the block's center.
        // This is purely a render transform — the block's bounding
        // box in poster coords (x, y, w, h) stays axis-aligned, and
        // the drag math transforms screen-space deltas into the
        // rotated local frame for resize.
        transform: b.rotation ? `rotate(${b.rotation}deg)` : undefined,
        transformOrigin: 'center center',
      }}
    >
      <div
        style={{
          width: '100%',
          height: isHeading || growsWithContent ? 'auto' : '100%',
          // Text/title blocks no longer clip — content overflow is
          // visible so the user sees everything they typed. Image /
          // table / references still clip since they're constrained.
          overflow: isHeading || growsWithContent ? 'visible' : 'hidden',
          // Padding moved here from the outer frame so the frame's
          // padding box stays flush with its border box — that keeps
          // external handle positions (top: -26) visually consistent
          // across all block types. Image / logo / table keep
          // padding: 0 because they manage their own inner layout.
          padding: ['image', 'logo', 'table'].includes(b.type)
            ? 0
            : '4px 6px',
          boxSizing: 'border-box',
        }}
      >
        {b.type === 'title' && (
          <RichTextEditor
            value={b.content}
            onChange={(v) => update({ content: v })}
            placeholder="Poster Title"
            multiline={false}
            stopPointerDown
            onSelectionChange={setSelectionInfo}
            style={{
              ...txtStyle,
              fontSize: st.title.size,
              fontWeight: st.title.weight,
              color: st.title.color || p.primary,
              lineHeight: st.title.lineHeight,
              textAlign: 'center',
            }}
          />
        )}

        {b.type === 'authors' && (
          <AuthorLine authors={authors} institutions={institutions} palette={p} fontFamily={ff} styles={st} />
        )}

        {isHeading && (
          <div
            style={{
              ...txtStyle,
              fontSize: st.heading.size,
              fontWeight: st.heading.weight,
              color: st.heading.color || p.accent,
              lineHeight: st.heading.lineHeight,
              textAlign: hs.align,
              ...headingBorderStyle(),
              display: 'flex',
              alignItems: 'baseline',
              gap: 4,
            }}
          >
            {headingNumber > 0 && <span>{headingNumber}.</span>}
            <RichTextEditor
              value={b.content}
              onChange={(v) => update({ content: v })}
              placeholder="Section Heading"
              multiline={false}
              stopPointerDown
              onSelectionChange={setSelectionInfo}
              style={{
                fontSize: st.heading.size,
                fontWeight: st.heading.weight,
                color: st.heading.color || p.accent,
                flex: 1,
              }}
            />
          </div>
        )}

        {b.type === 'text' && (
          <RichTextEditor
            value={b.content}
            onChange={(v) => update({ content: v })}
            multiline
            stopPointerDown
            onSelectionChange={setSelectionInfo}
            placeholder="Type here… (type / for symbols)"
            style={txtStyle}
          />
        )}

        {b.type === 'references' && (
          <RefsBlock
            references={references}
            palette={p}
            fontFamily={ff}
            styles={st}
            citationStyle={citationStyle}
          />
        )}

        {b.type === 'image' && (
          <CaptionWrapper
            block={b}
            palette={p}
            fontFamily={ff}
            styles={st}
            captionNumber={captionNumber}
            label="Figure"
          >
            <ImageBlock block={b} palette={p} onUpdate={update} selected={selected} />
          </CaptionWrapper>
        )}
        {b.type === 'logo' && <LogoBlock block={b} onUpdate={update} />}

        {b.type === 'table' && (
          <CaptionWrapper
            block={b}
            palette={p}
            fontFamily={ff}
            styles={st}
            captionNumber={captionNumber}
            label="Table"
          >
            <TableBlock block={b} palette={p} fontFamily={ff} styles={st} onUpdate={update} />
          </CaptionWrapper>
        )}
      </div>

      {!isHeading && (
        <div
          onPointerDown={(e) => onPointerDown(e, b.id, 'resize')}
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 14,
            height: 14,
            cursor: 'nwse-resize',
            opacity: selected ? 0.8 : 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M12 2L2 12M12 7L7 12" stroke={p.accent} strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
      )}

      {isHeading && selected && (
        <div
          onPointerDown={(e) => onPointerDown(e, b.id, 'resize')}
          style={{ position: 'absolute', right: 0, top: 0, width: 6, height: '100%', cursor: 'ew-resize' }}
        >
          <div style={{ width: 2, height: '100%', background: p.accent, borderRadius: 1, margin: '0 auto', opacity: 0.5 }} />
        </div>
      )}

      {selected && (
        <>
          {/*
            Top handle row — move + label + delete laid out in a
            single flex container positioned above the block.
            Rewritten 2026-04-11 because narrow blocks (logo at 50
            poster units) ended up with the label pill visually
            covering the move and delete buttons. The flex container
            has a `minWidth` that guarantees enough room for all
            three children + two gaps, and since it's centered via
            `left: 50%; translate(-50%)`, the row extends beyond
            the block's bounds symmetrically on narrow blocks — no
            more button overlap. Wider blocks grow the container via
            `width: 100%` so the three items still span the block's
            full width when there's room.
          */}
          <div
            style={{
              position: 'absolute',
              top: -26,
              left: '50%',
              // Row stays glued to the block's horizontal center no
              // matter how the block is sized or rotated. The
              // rotation is cancelled so the handles stay upright.
              transform: b.rotation
                ? `translateX(-50%) rotate(${-b.rotation}deg)`
                : 'translateX(-50%)',
              transformOrigin: 'center center',
              width: '100%',
              // 110 px guarantees enough room for the 20 px move
              // button + 20 px delete button + the label pill's
              // minimum width + the two 6 px gaps between them.
              // Narrow blocks (< 110 units wide) let the row
              // overflow both sides symmetrically instead of
              // clipping or overlapping.
              minWidth: 110,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
              boxSizing: 'border-box',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                onPointerDown(e, b.id, 'move');
              }}
              style={{
                flex: '0 0 20px',
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: p.accent,
                color: '#fff',
                border: '2px solid #0a0a12',
                cursor: 'move',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                padding: 0,
                pointerEvents: 'auto',
              }}
              title="Drag to move (or use arrow keys)"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <polyline points="5 9 2 12 5 15" />
                <polyline points="9 5 12 2 15 5" />
                <polyline points="15 19 12 22 9 19" />
                <polyline points="19 9 22 12 19 15" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <line x1="12" y1="2" x2="12" y2="22" />
              </svg>
            </button>

            <div
              style={{
                flex: '1 1 auto',
                minWidth: 0,
                height: 20,
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                background: p.accent,
                color: '#fff',
                padding: '0 8px',
                borderRadius: 10,
                border: '2px solid #0a0a12',
                fontFamily: 'system-ui',
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                lineHeight: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                pointerEvents: 'none',
              }}
            >
              {b.type}
              {typeof b.rotation === 'number' && b.rotation !== 0 && (
                <span style={{ marginLeft: 6, opacity: 0.8 }}>
                  {Math.round(b.rotation)}°
                </span>
              )}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(b.id);
              }}
              style={{
                flex: '0 0 20px',
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: '#d33',
                color: '#fff',
                border: '2px solid #0a0a12',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                padding: 0,
                pointerEvents: 'auto',
              }}
              title="Delete block"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </div>

          {/*
            External ROTATE handle — BELOW the block, centered.
            Moved from top-center to bottom-center on 2026-04-11 so
            the top row is just move + delete (no three-button
            crowding). The handle sits 26px below the block's
            bottom edge with a short visual stem connecting it
            back to the block — standard rotation-handle UX from
            design tools.

            Drag in a circle around the block's center to rotate.
            Magnetic snap at 0/45/90/135/180/270° with a 4° catch
            radius (always on). Hold Shift for harder 15° snaps.
          */}
          <div
            // Stem connecting the handle to the block. `pointerEvents:
            // none` so clicks pass through to the handle below it.
            style={{
              position: 'absolute',
              bottom: -18,
              left: '50%',
              marginLeft: -1,
              width: 2,
              height: 18,
              background: p.accent,
              opacity: 0.5,
              pointerEvents: 'none',
            }}
          />
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onPointerDown(e, b.id, 'rotate');
            }}
            style={{
              position: 'absolute',
              bottom: -36,
              left: '50%',
              marginLeft: -10,
              width: 20,
              height: 20,
              borderRadius: '50%',
              // Matches the image-block's inline "replace" button
              // visual style (gray rgba background + Unicode ↻).
              // User asked 2026-04-11 to reuse that exact visual
              // so the rotate handle feels like a sibling of the
              // image block's internal controls.
              background: 'rgba(0, 0, 0, 0.6)',
              color: '#fff',
              border: '2px solid #0a0a12',
              cursor: 'grab',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1,
              zIndex: 10,
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              padding: 0,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              // Counter-rotate so the icon stays upright even when
              // the block is rotated.
              transform: b.rotation ? `rotate(${-b.rotation}deg)` : undefined,
            }}
            title="Drag to rotate — snaps at 0/45/90/135/180° (Shift = 15° steps)"
          >
            ↻
          </button>
        </>
      )}

      {/* Floating format toolbar for text-like blocks. Mounted at the
          BlockFrame level (not inside RichTextEditor) so it's
          positioned relative to the viewport via portal and doesn't
          get clipped by the poster canvas's overflow. */}
      <FloatingFormatToolbar info={selectionInfo} />
    </div>
  );
}
