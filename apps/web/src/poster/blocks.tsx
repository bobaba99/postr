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
import { LogoPicker } from '@/components/LogoPicker';
import type {
  Author,
  Block,
  HeadingStyle,
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
import { ResizeHandles, type ResizeHandle } from './resizeHandles';
import { useStorageUrl } from '@/hooks/useStorageUrl';
import { uploadPosterImage } from '@/data/posterImages';

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
  // Clicking the empty placeholder or the "change" overlay opens
  // the LogoPicker modal, which gives the user three paths:
  //   1. Search the preset catalog of ~80 NA universities
  //   2. Pick a previously-uploaded logo from their account library
  //   3. Upload a new file (saved to library + used immediately)
  //
  // The picker calls `onPick(dataUrl)` with a base64 data URL,
  // which we stash in the block's `imageSrc` field so the logo
  // travels with the poster JSONB and doesn't rely on remote
  // fetches at render / export time.
  const [pickerOpen, setPickerOpen] = useState(false);
  const resolvedLogoSrc = useStorageUrl(block.imageSrc);

  if (block.imageSrc) {
    const displaySrc = resolvedLogoSrc ?? block.imageSrc;
    return (
      <>
        <div
          onClick={() => setPickerOpen(true)}
          title="Click to change logo"
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <img
            src={displaySrc}
            alt="Poster logo"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              pointerEvents: 'none',
            }}
          />
        </div>
        <LogoPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={(imageSrc) => onUpdate({ imageSrc })}
        />
      </>
    );
  }

  return (
    <>
      <div
        onClick={() => setPickerOpen(true)}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1.5px dashed #ccc',
          borderRadius: 4,
          cursor: 'pointer',
          // Logo blocks are tiny (50 poster units default); the
          // placeholder font is halved (was 13) so "+ Logo" + the
          // hint line both fit without wrapping or clipping.
          fontSize: 7,
          color: '#999',
          flexDirection: 'column',
          gap: 1,
          textAlign: 'center',
          padding: '4px 6px',
        }}
      >
        <span style={{ fontWeight: 600 }}>+ Logo</span>
        <span style={{ fontSize: 5, opacity: 0.8 }}>
          presets · upload · reuse
        </span>
      </div>
      <LogoPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(imageSrc) => onUpdate({ imageSrc })}
      />
    </>
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
   */
  selected?: boolean;
  /** Required for uploading images to Supabase Storage. */
  userId?: string;
  posterId?: string;
}

export function ImageBlock({ block, palette, onUpdate, userId, posterId }: ImageBlockProps) {
  const ref = useRef<HTMLInputElement | null>(null);
  const resolvedSrc = useStorageUrl(block.imageSrc);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (userId && posterId) {
      const previewUrl = URL.createObjectURL(file);
      onUpdate({ imageSrc: previewUrl });

      uploadPosterImage(userId, posterId, block.id, file).then((storageSrc) => {
        URL.revokeObjectURL(previewUrl);
        if (storageSrc) {
          onUpdate({ imageSrc: storageSrc });
        } else {
          readImageFile(file, (dataUrl) => onUpdate({ imageSrc: dataUrl }));
        }
      });
    } else {
      readImageFile(file, (dataUrl) => onUpdate({ imageSrc: dataUrl }));
    }

    // Auto-size block to match image aspect ratio
    const img = new Image();
    img.onload = () => {
      const aspect = img.naturalWidth / img.naturalHeight;
      const newH = Math.round(block.w / aspect);
      if (Math.abs(newH - block.h) > 2) {
        onUpdate({ h: newH });
      }
    };
    img.src = URL.createObjectURL(file);

    e.target.value = '';
  };

  if (block.imageSrc) {
    const displaySrc = resolvedSrc ?? block.imageSrc;
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <img
          src={displaySrc}
          alt={block.caption || 'Figure'}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onLoad={(e) => {
            // Auto-size block height to match image aspect ratio
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              const aspect = img.naturalWidth / img.naturalHeight;
              const newH = Math.round(block.w / aspect);
              if (Math.abs(newH - block.h) > 2) {
                onUpdate({ h: newH });
              }
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            userSelect: 'none',
            WebkitUserDrag: 'none',
            KhtmlUserDrag: 'none',
            MozUserDrag: 'none',
            OUserDrag: 'none',
          } as CSSProperties}
        />
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
        // Placeholder font size halved (was 13) so the "+ Upload
        // figure" prompt doesn't dominate small image blocks and
        // the preview reads as subtle chrome rather than content.
        fontSize: 7,
        gap: 2,
        textAlign: 'center',
        padding: '0 8px',
      }}
    >
      <span style={{ fontWeight: 600 }}>+ Upload figure</span>
      <span style={{ fontSize: 6, opacity: 0.7 }}>click to browse · drag to move</span>
      <input ref={ref} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
    </div>
  );
}

/** Circular handle button — shared base for move, delete, rotate. */
const circleBtn: CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: '50%',
  color: '#fff',
  border: 'none',
  display: 'grid',
  placeItems: 'center',
  placeContent: 'center',
  boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
  padding: 0,
  boxSizing: 'border-box',
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
  // Resolve which edge-flag set to use. Named presets come from
  // TABLE_BORDER_PRESETS; the literal 'custom' key reads from
  // `data.customBorder` instead so users can toggle individual
  // edges via the TableEditor's Custom panel.
  //
  // For custom mode the cell-border logic below calls
  // `customInnerH(r)` and `customInnerV(c)` which consult the
  // per-line `innerH[]` / `innerV[]` arrays — each inner gap
  // is independent of the others so a user can toggle only the
  // line below row 3 without affecting row 2 or row 4.
  const isCustomBorder = data.borderPreset === 'custom' && !!data.customBorder;
  const preset = isCustomBorder
    ? {
        name: 'Custom',
        // These grouped flags are no longer consulted by the
        // cell-border renderer in custom mode (see the
        // `isCustomBorder` branch in `cellBorder` below), but
        // they still need to be non-undefined so the rest of
        // the code that reads `preset.*` shortcircuits cleanly.
        horizontalLines: false,
        verticalLines: false,
        outerBorder:
          !!data.customBorder!.leftLine || !!data.customBorder!.rightLine,
        headerLine: !!data.customBorder!.headerLine,
        topLine: !!data.customBorder!.topLine,
        bottomLine: !!data.customBorder!.bottomLine,
        headerBox: !!data.customBorder!.headerBox,
      }
    : TABLE_BORDER_PRESETS[data.borderPreset] ?? TABLE_BORDER_PRESETS.apa!;
  // Pull the independent left/right flags when using custom, so
  // cell-border rendering below can paint only the edges the
  // user actually enabled instead of both together.
  const leftEdge = isCustomBorder
    ? !!data.customBorder!.leftLine
    : preset.outerBorder;
  const rightEdge = isCustomBorder
    ? !!data.customBorder!.rightLine
    : preset.outerBorder;
  /**
   * In custom-border mode, drawing the TOP of cell-row `r` means
   * rendering the gap BELOW row `r - 1`. `innerH[i]` describes
   * the gap below data row `i + 1`, so "top of row r" maps to
   * `innerH[r - 2]`:
   *
   *   r=2 → innerH[0] (gap below row 1)
   *   r=3 → innerH[1] (gap below row 2)
   *   ...
   *
   * Row 0 is the header row and row 1's top border is owned by
   * `headerLine` (handled outside this helper), so this is only
   * consulted for r ≥ 2. Out-of-range indices return false
   * (missing / short arrays cleanly default to "no line").
   */
  const customInnerH = (r: number): boolean => {
    if (!isCustomBorder) return false;
    const arr = data.customBorder!.innerH ?? [];
    return arr[r - 2] === true;
  };
  /**
   * In custom-border mode, the gap to the LEFT of column `c` is
   * drawn if `innerV[c - 1]` is true. `innerV[i]` describes the
   * gap to the RIGHT of col i, so the left border of col c is
   * innerV[c - 1].
   */
  const customInnerV = (c: number): boolean => {
    if (!isCustomBorder) return false;
    const arr = data.customBorder!.innerV ?? [];
    return arr[c - 1] === true;
  };
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
  //
  // Named presets fall through the legacy path using
  // `preset.horizontalLines` / `preset.verticalLines` as grouped
  // flags. Custom mode branches on `isCustomBorder` and calls
  // `customInnerH(r)` / `customInnerV(c)` so each inner gap is
  // drawn based on its own per-line flag — toggling innerH[2]
  // does NOT affect innerH[1] or innerH[3].
  const cellBorder = (r: number, c: number): CSSProperties => {
    const lw = '0.8px';
    const col = palette.muted + '55';
    let t = 'none', ri = 'none', b = 'none', l = 'none';
    if (leftEdge && c === 0) l = `${lw} solid ${col}`;
    if (rightEdge && c === data.cols - 1) ri = `${lw} solid ${col}`;
    if (preset.topLine && r === 0) t = `1.5px solid ${palette.primary}`;
    if (preset.headerLine && r === 1) t = `1px solid ${palette.primary}`;
    if (preset.bottomLine && r === data.rows - 1) b = `1.5px solid ${palette.primary}`;
    if (isCustomBorder) {
      // Per-line inner flags. Draw the TOP border of a cell
      // when the gap above it is enabled (innerH[r - 1]) and
      // the LEFT border when innerV[c - 1] is enabled. The
      // outer edges are already set above.
      if (r > 1 && customInnerH(r)) t = `${lw} solid ${col}`;
      if (c > 0 && customInnerV(c)) l = `${lw} solid ${col}`;
    } else {
      if (preset.outerBorder) {
        if (r === 0) t = `${lw} solid ${col}`;
        if (r === data.rows - 1) b = `${lw} solid ${col}`;
      }
      if (preset.horizontalLines && r > 0) t = `${lw} solid ${col}`;
      if (preset.verticalLines && c > 0) l = `${lw} solid ${col}`;
    }
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

      {/*
        Table note — optional footnote rendered below the grid.
        Stored at the block level (`block.note`) so figures and
        tables share the same field. Content is HTML pre-formatted
        by the "Format" button in the Caption / Table editor
        (academicMarkdownToHtml), so `dangerouslySetInnerHTML`
        is safe: the parser HTML-escapes user input and only adds
        strong / em / sup / sub tags. Hidden entirely when the
        note field is empty.
      */}
      {block.note && (
        <div
          style={{
            fontFamily,
            fontSize: Math.round(styles.body.size * 0.85),
            lineHeight: 1.35,
            color: palette.muted || '#6b7280',
            fontStyle: 'italic',
            paddingTop: 4,
            paddingLeft: 2,
          }}
          dangerouslySetInnerHTML={{ __html: block.note }}
        />
      )}

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
  const validAuthors = authors.filter((a) => a.name);
  // Prefer institutions actually referenced by an author's
  // affiliationIds, but fall back to ALL institutions when no
  // author has linked one (or when there are no authors yet).
  // That way users who added institutions in the sidebar still
  // see them on the canvas even if they haven't wired up the
  // author→institution mapping — the block reads as a visible
  // placeholder for the affiliation line rather than vanishing.
  const linked = institutions.filter((inst) =>
    authors.some((a) => a.affiliationIds.includes(inst.id)),
  );
  const used = linked.length > 0 ? linked : institutions;

  // Empty state: show the appropriate "add X in sidebar" prompt.
  // If the user has already added institutions, render them even
  // without authors so their work isn't invisible.
  if (!validAuthors.length) {
    if (institutions.length === 0) {
      return (
        <span style={{ color: palette.muted, fontStyle: 'italic', fontSize: styles.authors.size }}>
          Add authors in sidebar →
        </span>
      );
    }
    return (
      <div
        style={{
          textAlign: 'center',
          fontFamily,
          fontSize: styles.authors.size,
          color: palette.primary,
          lineHeight: 1.15,
        }}
      >
        <span style={{ color: palette.muted, fontStyle: 'italic' }}>
          Add authors in sidebar →
        </span>
        <div style={{ fontSize: styles.authors.size * 0.82, color: palette.muted }}>
          {institutions.map((inst, i) => (
            <span key={inst.id}>
              {i > 0 ? ' · ' : ''}
              {[inst.name, inst.dept, inst.location].filter(Boolean).join(', ')}
            </span>
          ))}
        </div>
      </div>
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
        // Force tight line-height at the component level (was
        // `styles.authors.lineHeight` which defaults to 1.5 and
        // left ~50 % blank space above/below each line). The
        // authors block now wraps as snugly as the title block,
        // matching the user's expectation that the block frame
        // track the font size. Users can still override via the
        // Style tab — we read back from styles.authors.lineHeight
        // but clamp to a tighter ceiling to avoid the old bloat.
        lineHeight: Math.min(1.2, styles.authors.lineHeight),
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
        <div style={{ fontSize: styles.authors.size * 0.82, color: palette.muted }}>
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
        <div style={{ fontSize: styles.authors.size * 0.72, color: palette.muted, fontStyle: 'italic' }}>
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
        gap: Math.max(0, Math.min(24, block.captionGap ?? 0)),
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
        {/*
          Optional figure note rendered under the caption line.
          Stored as HTML pre-parsed by the Format button so inline
          tags (strong / em / sup / sub) survive round-trips
          through the poster JSONB. Falls back to nothing when
          the note field is empty.
        */}
        {block.note && (
          <div
            style={{ marginTop: 2, fontStyle: 'normal' }}
            dangerouslySetInnerHTML={{ __html: block.note }}
          />
        )}
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
  onSelect: (id: string, additive?: boolean) => void;
  onPointerDown: (
    e: React.PointerEvent,
    id: string,
    mode: 'move' | 'resize' | 'rotate',
    handle?: import('./resizeHandles').ResizeHandle,
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
  /**
   * Clone the block at a small position offset. Wired from
   * PosterEditor's `duplicateBlock`. Used by the ⌘D shortcut
   * AND the right-click context menu's "Duplicate" entry.
   */
  onDuplicate?: (id: string) => void;
  /**
   * Move the block +1 / -1 in the document's block array. Later
   * indices paint on top, so +1 = "bring forward" and -1 =
   * "send back". Used by the right-click context menu.
   */
  onReorder?: (id: string, direction: 1 | -1) => void;
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
  /** For uploading images to Supabase Storage. */
  userId?: string;
  posterId?: string;
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
    onDuplicate,
    onReorder,
    titleOverflowPx,
    isOutOfBounds,
    captionNumber,
    userId,
    posterId,
  } = props;

  // Block context menu state. Right-clicking a non-table block
  // pops a small menu with Duplicate / Bring Forward / Send
  // Back / Delete. Tables have their own richer menu handled
  // inside TableBlock. Text-like blocks skip this so the
  // browser's native right-click (copy/paste for
  // contentEditable) still works.
  const [blockMenu, setBlockMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

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
    b.type === 'authors' ||
    // Tables auto-size too — otherwise the user's stored `b.h`
    // was forcing the frame taller than the grid needed, and
    // the caption wrapper's `flex: 1 content` stretched to
    // fill, leaving a blank strip under the table. Growing with
    // content guarantees the block frame hugs (caption + gap +
    // grid) exactly. Users can still resize tables — the
    // resize handle updates b.w for width (fixed) and the drag
    // math doesn't depend on h.
    b.type === 'table';
  const level = b.type === 'title' ? st.title : b.type === 'authors' ? st.authors : isHeading ? st.heading : st.body;
  const frameRef = useRef<HTMLDivElement | null>(null);
  // Selection info for the floating format toolbar — populated by
  // the RichTextEditor inside this block when the user highlights
  // a range. null = no selection, toolbar hidden.
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);

  // Pop the selection ring when this block becomes selected.
  // Skip on initial mount to avoid GSAP forced reflows during page load.
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
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
        const additive = e.shiftKey || e.metaKey || e.ctrlKey;
        // Nothing to do if the click is actually the tail of a drag
        // — onClickCapture already reset the ref.
        if (!selected || additive) {
          onSelect(b.id, additive);
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
      onContextMenu={(e) => {
        // Right-click → pop our block-level menu. Skip for table
        // blocks (they have a richer menu managed inside
        // TableBlock) and for text-like blocks where the user
        // usually wants the browser's default menu for
        // cut/copy/paste inside contentEditable.
        if (
          b.type === 'table' ||
          b.type === 'title' ||
          b.type === 'text' ||
          b.type === 'heading' ||
          b.type === 'authors'
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (!selected) onSelect(b.id);
        setBlockMenu({ x: e.clientX, y: e.clientY });
      }}
      data-block-id={b.id}
      data-block-type={b.type}
      style={{
        position: 'absolute',
        left: b.x,
        top: effectiveTop,
        width: b.w,
        // Selected block renders above all unselected blocks so
        // resize handles are never covered by overlapping siblings.
        zIndex: selected ? 2 : 0,
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
        // content exactly. A small floor keeps empty blocks
        // grabbable; resizing to taller is handled by Auto-Arrange
        // + re-measuring on content change. Authors + title get
        // the tightest floor (6 units) since they should read as
        // a single line of header text at ~5 units font size.
        minHeight: growsWithContent
          ? b.type === 'authors' || b.type === 'title'
            ? 6
            : 12
          : undefined,
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
          // Zero padding on all block types — content fills the
          // block edge-to-edge. Users control whitespace by
          // positioning blocks with gaps between them, matching
          // PowerPoint/Slides behavior.
          padding: 0,
          // Let flex children (the CaptionWrapper for image/table
          // blocks) align to the top of the frame rather than
          // stretching to fill — this prevents a blank strip
          // between the content and the bottom border when the
          // table or image is shorter than the stored `b.h`.
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
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
            <ImageBlock block={b} palette={p} onUpdate={update} selected={selected} userId={userId} posterId={posterId} />
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

      {selected && (
        <ResizeHandles
          accent={p.accent}
          onPointerDown={(e, handle) => onPointerDown(e, b.id, 'resize', handle)}
        />
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
              top: -24,
              left: '50%',
              // Row stays glued to the block's horizontal center no
              // matter how the block is sized or rotated. The
              // rotation is cancelled so the handles stay upright.
              transform: b.rotation
                ? `translateX(-50%) rotate(${-b.rotation}deg)`
                : 'translateX(-50%)',
              transformOrigin: 'center center',
              // Width is driven by the row's three children — the
              // two fixed 20 px buttons + the pill sized to its
              // text content. This makes the total handle row
              // **independent of the block's own width** so
              // resizing the block shrinks/grows the block but
              // leaves the control row the same length. The row
              // just stays horizontally centered above the block.
              width: 'fit-content',
              height: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
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
                ...circleBtn,
                background: p.accent,
                cursor: 'move',
                pointerEvents: 'auto',
              }}
              title="Drag to move (or use arrow keys)"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                style={{ display: 'block' }}
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
                // Pill sizes to its text content — never grows or
                // shrinks with block width. The outer row is
                // `width: fit-content` so this intrinsic size
                // bubbles up and the whole control row stays a
                // constant length regardless of the block's own
                // dimensions.
                flex: '0 0 auto',
                height: 18,
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 8,
                background: p.accent,
                color: '#fff',
                padding: '0 8px',
                borderRadius: 9,
                border: 'none',
                fontFamily: 'system-ui',
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                lineHeight: 1,
                whiteSpace: 'nowrap',
                boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
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
                ...circleBtn,
                background: '#d33',
                cursor: 'pointer',
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
                style={{ display: 'block' }}
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
              bottom: -12,
              left: '50%',
              marginLeft: -1,
              width: 1.5,
              height: 12,
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
              ...circleBtn,
              position: 'absolute',
              bottom: -30,
              left: '50%',
              marginLeft: -9,
              background: 'rgba(0, 0, 0, 0.6)',
              cursor: 'grab',
              zIndex: 10,
              // Counter-rotate so the icon stays upright even when
              // the block is rotated.
              transform: b.rotation ? `rotate(${-b.rotation}deg)` : undefined,
            }}
            title="Drag to rotate — snaps at 0/45/90/135/180° (Shift = 15° steps)"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block' }}>
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
          </button>
        </>
      )}

      {/* Floating format toolbar for text-like blocks. Mounted at the
          BlockFrame level (not inside RichTextEditor) so it's
          positioned relative to the viewport via portal and doesn't
          get clipped by the poster canvas's overflow. */}
      <FloatingFormatToolbar info={selectionInfo} />

      {/* Block-level right-click context menu (non-table, non-text
          blocks only). Portal to document.body so the canvas
          transform doesn't scale it, same reason the LogoPicker
          modal uses a portal. Dismissed by clicking anywhere
          outside via an overlay backdrop. */}
      {blockMenu &&
        ReactDOM.createPortal(
          <div
            onClick={() => setBlockMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setBlockMenu(null);
            }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9998,
              // No background — just a click-catcher so the menu
              // closes on any outside click.
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                left: blockMenu.x,
                top: blockMenu.y,
                minWidth: 180,
                padding: 4,
                background: '#1a1a26',
                border: '1px solid #2a2a3a',
                borderRadius: 8,
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
                color: '#e2e2e8',
                fontFamily: "'DM Sans', system-ui, sans-serif",
                fontSize: 13,
                zIndex: 9999,
              }}
            >
              {(
                [
                  ['Duplicate', 'onDuplicate', '⌘D'],
                  ['Bring Forward', 'bringForward', ''],
                  ['Send Back', 'sendBack', ''],
                  ['Delete', 'delete', '⌫'],
                ] as const
              ).map(([label, action, shortcut]) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => {
                    setBlockMenu(null);
                    if (action === 'onDuplicate') onDuplicate?.(b.id);
                    else if (action === 'bringForward') onReorder?.(b.id, 1);
                    else if (action === 'sendBack') onReorder?.(b.id, -1);
                    else if (action === 'delete') onDelete(b.id);
                  }}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    padding: '8px 12px',
                    borderRadius: 5,
                    color: action === 'delete' ? '#f87171' : '#e2e2e8',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      action === 'delete'
                        ? 'rgba(248, 113, 113, 0.12)'
                        : 'rgba(124, 106, 237, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      'transparent';
                  }}
                >
                  <span>{label}</span>
                  {shortcut && (
                    <span style={{ fontSize: 11, color: '#6b7280' }}>
                      {shortcut}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
