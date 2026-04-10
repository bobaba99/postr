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

export function LogoBlock({ block, onUpdate }: LogoBlockProps) {
  const ref = useRef<HTMLInputElement | null>(null);
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => onUpdate({ imageSrc: ev.target?.result as string });
    r.readAsDataURL(f);
  };

  if (block.imageSrc) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={block.imageSrc} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
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
        fontSize: 8,
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
}

export function ImageBlock({ block, palette, onUpdate }: ImageBlockProps) {
  const ref = useRef<HTMLInputElement | null>(null);
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => onUpdate({ imageSrc: ev.target?.result as string });
    r.readAsDataURL(f);
  };

  const toggleFit = () => {
    const current = block.imageFit ?? 'contain';
    const next = current === 'contain' ? 'cover' : current === 'cover' ? 'fill' : 'contain';
    onUpdate({ imageFit: next });
  };

  if (block.imageSrc) {
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
        <img
          src={block.imageSrc}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: block.imageFit ?? 'contain' }}
        />
        <div style={{ position: 'absolute', top: 2, right: 2, display: 'flex', gap: 2 }}>
          <button onClick={toggleFit} style={iconBtn}>
            {(block.imageFit ?? 'contain')[0]?.toUpperCase()}
          </button>
          <button onClick={() => ref.current?.click()} style={iconBtn}>
            ↻
          </button>
          <button onClick={() => onUpdate({ imageSrc: null })} style={{ ...iconBtn, background: 'rgba(180,30,30,.8)' }}>
            ×
          </button>
        </div>
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
        fontSize: 9,
        gap: 3,
        textAlign: 'center',
        padding: '0 8px',
      }}
    >
      <span style={{ fontWeight: 600 }}>+ Upload figure</span>
      <span style={{ fontSize: 7, opacity: 0.7 }}>click to browse · drag to move</span>
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
  fontSize: 8,
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

  // Close context menu on any click outside
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
    };
  }, [ctxMenu]);

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
                return (
                <td
                  key={c}
                  onMouseEnter={() => {
                    setHoveredRow(r);
                    setHoveredCol(c);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCtxMenu({ x: e.clientX, y: e.clientY, r, c });
                  }}
                  style={{
                    ...cellBorder(r, c),
                    padding: '2px 4px',
                    background: r === 0 ? palette.accent + '0a' : 'transparent',
                    fontWeight: r === 0 ? 700 : 400,
                    color: palette.primary,
                    position: 'relative',
                    // Active cell highlight — subtle accent border
                    boxShadow: isActive ? `inset 0 0 0 1.5px ${palette.accent}88` : 'none',
                  }}
                >
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    dangerouslySetInnerHTML={{ __html: data.cells[r * data.cols + c] ?? '' }}
                    onInput={(e) => updateCellValue(r, c, e.currentTarget.innerHTML)}
                    onFocus={() => setActiveCell({ r, c })}
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
        fontSize: 12,
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
      onClick={(e) => e.stopPropagation()}
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
      <div style={{ padding: '4px 12px 6px', fontSize: 10, color: '#6b7280', fontWeight: 600 }}>
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
  onSelect: (id: string) => void;
  onPointerDown: (e: React.PointerEvent, id: string, mode: 'move' | 'resize') => void;
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
    onSelect,
    onPointerDown,
    didDragRef,
    onUpdate,
    onDelete,
    titleOverflowPx,
    isOutOfBounds,
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
  const growsWithContent = b.type === 'title' || b.type === 'text' || b.type === 'references';
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
        minHeight: growsWithContent ? b.h : undefined,
        background: bg,
        border: isOutOfBounds
          ? '1.5px dashed #f87171'
          : selected
            ? `1.5px solid ${p.accent}88`
            : '1px solid transparent',
        borderRadius: 2,
        cursor: b.type === 'table' ? 'default' : 'move',
        padding: ['table', 'image', 'logo'].includes(b.type) ? 0 : '4px 6px',
        boxSizing: 'border-box',
        overflow: 'visible',
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

        {b.type === 'image' && <ImageBlock block={b} palette={p} onUpdate={update} />}
        {b.type === 'logo' && <LogoBlock block={b} onUpdate={update} />}

        {b.type === 'table' && (
          <TableBlock block={b} palette={p} fontFamily={ff} styles={st} onUpdate={update} />
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
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(b.id);
          }}
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#d33',
            color: '#fff',
            border: '2px solid #0a0a12',
            fontSize: 10,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            zIndex: 10,
          }}
        >
          ×
        </button>
      )}
      {selected && (
        <div
          style={{
            position: 'absolute',
            top: -1,
            left: 3,
            fontSize: 6,
            background: p.accent,
            color: '#fff',
            padding: '1px 5px',
            borderRadius: 2,
            fontFamily: 'system-ui',
            fontWeight: 700,
            textTransform: 'uppercase',
            zIndex: 10,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {b.type}
        </div>
      )}

      {/* Floating format toolbar for text-like blocks. Mounted at the
          BlockFrame level (not inside RichTextEditor) so it's
          positioned relative to the viewport via portal and doesn't
          get clipped by the poster canvas's overflow. */}
      <FloatingFormatToolbar info={selectionInfo} />
    </div>
  );
}
