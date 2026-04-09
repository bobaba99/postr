/**
 * Block sub-components — Image, Logo, Table, AuthorLine, RefsBlock,
 * and the BlockFrame wrapper that handles selection + drag/resize
 * affordances.
 *
 * All in one file because they share the same data model and styling
 * conventions and porting them as separate modules would scatter the
 * coupling. Re-split if any one of them grows past ~150 lines.
 */
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

  // Hover state for Notion/Canva-style inline row/column controls.
  // hoveredRow/Col track which cell the pointer is currently over so
  // we can render insert/delete handles on that row's left margin and
  // that column's top margin.
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const clearHover = () => {
    setHoveredRow(null);
    setHoveredCol(null);
  };

  const commit = (next: TableData) => onUpdate({ tableData: next });
  const updateCellValue = (r: number, c: number, v: string) => commit(updateCell(data, r, c, v));

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
  const handleBtn = (variant: 'plus' | 'minus'): CSSProperties => ({
    all: 'unset',
    cursor: 'pointer',
    width: 14,
    height: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    background: variant === 'plus' ? palette.accent : '#c55',
    color: '#fff',
    fontSize: 10,
    fontWeight: 800,
    lineHeight: 1,
    boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
    pointerEvents: 'auto',
  });

  return (
    <div
      style={{ width: '100%', height: '100%', overflow: 'visible', padding: 2, position: 'relative' }}
      onPaste={onPaste}
      onMouseLeave={clearHover}
    >
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
              {Array.from({ length: data.cols }).map((_, c) => (
                <td
                  key={c}
                  onMouseEnter={() => {
                    setHoveredRow(r);
                    setHoveredCol(c);
                  }}
                  style={{
                    ...cellBorder(r, c),
                    padding: '2px 4px',
                    background: r === 0 ? palette.accent + '0a' : 'transparent',
                    fontWeight: r === 0 ? 700 : 400,
                    color: palette.primary,
                    position: 'relative',
                  }}
                >
                  <input
                    value={data.cells[r * data.cols + c] ?? ''}
                    onChange={(e) => updateCellValue(r, c, e.target.value)}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{
                      all: 'unset',
                      width: '100%',
                      fontFamily,
                      fontSize: styles.body.size,
                      color: palette.primary,
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/*
        Notion/Canva-style inline row/column handles. Absolute-
        positioned over the table. Each handle is a small circle
        with + (insert) or × (delete).

        Row handles: left side of the hovered row.
          - "+" adds a row below (Notion behavior)
          - "×" deletes the hovered row
        Column handles: top side of the hovered column.
          - "+" adds a column to the right
          - "×" deletes the hovered column

        Uses percentage positioning based on colWidths + uniform row
        height so it survives column resizing and row-count changes.
      */}
      {hoveredRow !== null && (
        <div
          style={{
            position: 'absolute',
            left: -24,
            top: `calc(${(hoveredRow / data.rows) * 100}% + ${(100 / data.rows) / 2}%)`,
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            pointerEvents: 'none',
          }}
        >
          <button
            type="button"
            title="Insert row below"
            style={handleBtn('plus')}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              commit(insertRow(data, hoveredRow, 'below'));
            }}
          >
            +
          </button>
          {data.rows > 1 && (
            <button
              type="button"
              title="Delete row"
              style={handleBtn('minus')}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                commit(deleteRowAt(data, hoveredRow));
                clearHover();
              }}
            >
              ×
            </button>
          )}
        </div>
      )}
      {hoveredCol !== null && (
        <div
          style={{
            position: 'absolute',
            top: -24,
            left: `calc(${colWidths.slice(0, hoveredCol).reduce((s, w) => s + w, 0)}% + ${
              (colWidths[hoveredCol] ?? 0) / 2
            }%)`,
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 3,
            pointerEvents: 'none',
          }}
        >
          <button
            type="button"
            title="Insert column right"
            style={handleBtn('plus')}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              commit(insertCol(data, hoveredCol, 'right'));
            }}
          >
            +
          </button>
          {data.cols > 1 && (
            <button
              type="button"
              title="Delete column"
              style={handleBtn('minus')}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                commit(deleteColAt(data, hoveredCol));
                clearHover();
              }}
            >
              ×
            </button>
          )}
        </div>
      )}
      {/*
        Permanent "add row below" and "add column right" buttons,
        anchored at the bottom-center and right-center of the table.
        Always visible so users discover the append affordance even
        if they never hover the exact row/column they want to modify.
      */}
      <button
        type="button"
        title="Add row at bottom"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          commit(insertRow(data, data.rows - 1, 'below'));
        }}
        style={{
          all: 'unset',
          cursor: 'pointer',
          position: 'absolute',
          bottom: -12,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: palette.accent + 'cc',
          color: '#fff',
          fontSize: 11,
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        }}
      >
        +
      </button>
      <button
        type="button"
        title="Add column at right"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          commit(insertCol(data, data.cols - 1, 'right'));
        }}
        style={{
          all: 'unset',
          cursor: 'pointer',
          position: 'absolute',
          right: -12,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: palette.accent + 'cc',
          color: '#fff',
          fontSize: 11,
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        }}
      >
        +
      </button>
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
  } = props;

  const isHeading = b.type === 'heading';
  // Blocks that grow with their text content (B1 fix). These use
  // minHeight: b.h as a floor, height: auto so the visible area
  // expands as the user adds more text. Prevents the "title
  // clipped mid-word when too long" bug where the second line
  // disappeared behind the block's fixed bottom edge.
  const growsWithContent = b.type === 'title' || b.type === 'text';
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
      style={{
        position: 'absolute',
        left: b.x,
        top: b.y,
        width: b.w,
        // Headings + title/text grow with content. Everything else
        // (image, logo, table, references, authors) stays at its
        // declared h. growsWithContent blocks use minHeight as the
        // floor so they never shrink below the user's resize.
        height: isHeading || growsWithContent ? 'auto' : b.h,
        minHeight: growsWithContent ? b.h : undefined,
        background: bg,
        border: selected ? `1.5px solid ${p.accent}88` : '1px solid transparent',
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
          style={{ position: 'absolute', right: -3, top: 0, width: 6, height: '100%', cursor: 'ew-resize' }}
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
            top: -9,
            right: -9,
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
            top: -9,
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
