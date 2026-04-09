/**
 * PosterEditor — top-level editor that mounts the Sidebar + Canvas
 * and wires every interaction through the Zustand poster store.
 *
 * Loads its initial state from the store (set by the Editor route
 * after fetching from Supabase). Mutations dispatch back into the
 * store; Phase 4 layers autosave on top by subscribing to changes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Block,
  HeadingStyle,
  Palette,
  PosterDoc,
  Reference,
  Styles,
} from '@postr/shared';
import { nanoid } from 'nanoid';
import { usePosterStore } from '@/stores/posterStore';
import { useAutosave } from '@/hooks/useAutosave';
import { AutosaveStatusPill } from '@/components/AutosaveStatusPill';
import { useGsapContext } from '@/motion';
import { editorEntrance } from '@/motion/timelines/editorEntrance';
import { BlockFrame } from './blocks';
import { Sidebar, type StylePreset } from './Sidebar';
import {
  DEFAULT_POSTER_SIZE_KEY,
  FONTS,
  PALETTES,
  POSTER_SIZES,
  PX,
  type PosterSizeKey,
} from './constants';
import {
  DEFAULT_CITATION_STYLE,
  sortReferences,
  type CitationStyleKey,
  type SortMode,
} from './citations';
import { autoLayout } from './autoLayout';
import { LAYOUT_TEMPLATES, makeBlocks, type LayoutKey } from './templates';
import { snap } from './snap';

// =========================================================================
// Helpers
// =========================================================================

/** Find the closest poster-size key that matches the doc's dimensions. */
function findSizeKey(widthIn: number, heightIn: number): PosterSizeKey {
  for (const [key, value] of Object.entries(POSTER_SIZES)) {
    if (Math.abs(value.w - widthIn) < 0.5 && Math.abs(value.h - heightIn) < 0.5) {
      return key as PosterSizeKey;
    }
  }
  return DEFAULT_POSTER_SIZE_KEY;
}

/** Resolve a Palette object to its catalog name (or empty string). */
function paletteNameFor(palette: Palette): string {
  for (const named of PALETTES) {
    const { name, ...rest } = named;
    if (
      rest.bg === palette.bg &&
      rest.primary === palette.primary &&
      rest.accent === palette.accent
    ) {
      return name;
    }
  }
  return '';
}

// =========================================================================
// Drag/resize hook (ported from prototype useDrag)
// =========================================================================

function useBlockDrag(
  blocks: Block[],
  setBlocks: (b: Block[]) => void,
  scale: number,
) {
  const sessionRef = useRef<{
    id: string;
    mode: 'move' | 'resize';
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    ow: number;
    oh: number;
    isHeading: boolean;
  } | null>(null);

  return useCallback(
    (e: React.PointerEvent, id: string, mode: 'move' | 'resize') => {
      e.stopPropagation();
      e.preventDefault();
      const b = blocks.find((x) => x.id === id);
      if (!b) return;

      sessionRef.current = {
        id,
        mode,
        sx: e.clientX,
        sy: e.clientY,
        ox: b.x,
        oy: b.y,
        ow: b.w,
        oh: b.h,
        isHeading: b.type === 'heading',
      };

      const onMove = (ev: PointerEvent) => {
        const s = sessionRef.current;
        if (!s) return;
        const dx = (ev.clientX - s.sx) / scale;
        const dy = (ev.clientY - s.sy) / scale;

        const nextBlocks = blocks.map((blk) => {
          if (blk.id !== s.id) return blk;
          if (s.mode === 'move') {
            return {
              ...blk,
              x: snap(Math.max(0, s.ox + dx)),
              y: snap(Math.max(0, s.oy + dy)),
            };
          }
          const nw = Math.max(40, s.ow + dx);
          if (s.isHeading) return { ...blk, w: snap(nw) };
          return { ...blk, w: snap(nw), h: snap(Math.max(20, s.oh + dy)) };
        });
        setBlocks(nextBlocks);
      };

      const onUp = () => {
        sessionRef.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [blocks, setBlocks, scale],
  );
}

// =========================================================================
// Zoom hook
// =========================================================================

function useZoom(canvasRef: React.RefObject<HTMLDivElement>, sizeKey: PosterSizeKey) {
  const [manual, setManual] = useState<number | null>(null);
  const [fit, setFit] = useState(1);

  useEffect(() => {
    const compute = () => {
      if (!canvasRef.current) return;
      const r = canvasRef.current.getBoundingClientRect();
      const sz = POSTER_SIZES[sizeKey]!;
      // Fit-to-viewport picks the tighter of width vs height ratio
      // minus 60 px of canvas padding. The 5× upper bound is a
      // safety net for pathological cases (canvas not yet measured,
      // offscreen, etc.) — it's not a "sensible max zoom", auto-fit
      // on a large monitor should happily go to 3–4×.
      const wRatio = (r.width - 60) / (sz.w * PX);
      const hRatio = (r.height - 60) / (sz.h * PX);
      const ratio = Math.min(wRatio, hRatio, 5);
      // Guard against NaN / negative when the container hasn't laid
      // out yet (width < 60).
      setFit(ratio > 0 && Number.isFinite(ratio) ? ratio : 1);
    };
    compute();

    // Re-fit when the canvas element itself resizes (sidebar changes
    // width, devtools open/close, etc.) not just the window.
    const ro = new ResizeObserver(compute);
    if (canvasRef.current) ro.observe(canvasRef.current);

    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('resize', compute);
      ro.disconnect();
    };
  }, [sizeKey, canvasRef]);

  return { zoom: manual ?? fit, setZoom: setManual };
}

// =========================================================================
// PosterEditor
// =========================================================================

export function PosterEditor() {
  const doc = usePosterStore((s) => s.doc);
  const setPoster = usePosterStore((s) => s.setPoster);
  const posterId = usePosterStore((s) => s.posterId);

  // Local UI state — selection, grid, sort, citation style, presets.
  // (Style/font/palette/etc live in the doc itself, persisted via store.)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('none');
  const [citationStyle, setCitationStyle] = useState<CitationStyleKey>(DEFAULT_CITATION_STYLE);
  const [savedPresets, setSavedPresets] = useState<StylePreset[]>([]);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Editor entrance animation — runs once on mount, scoped to root.
  useGsapContext(() => {
    editorEntrance();
  }, rootRef);

  // Autosave — debounces doc changes and persists via upsertPoster.
  // Status drives the pill rendered in the top-right overlay.
  const autosave = useAutosave(posterId, doc);

  if (!doc || !posterId) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
        <div className="text-sm tracking-wide">No poster loaded.</div>
      </div>
    );
  }

  const sizeKey = findSizeKey(doc.widthIn, doc.heightIn);
  const { w: pw, h: ph } = POSTER_SIZES[sizeKey]!;
  const cW = pw * PX;
  const cH = ph * PX;
  const ffc = FONTS[doc.fontFamily]?.css ?? doc.fontFamily;
  const palName = paletteNameFor(doc.palette);

  const { zoom, setZoom } = useZoom(canvasRef, sizeKey);

  // Helper: replace blocks immutably
  const setBlocks = (next: Block[]) => setPoster(posterId, { ...doc, blocks: next });

  const onPointerDown = useBlockDrag(doc.blocks, setBlocks, zoom);

  // Heading auto-numbering: index by reading order (y then x).
  const headingNumbers = useMemo(() => {
    const m: Record<string, number> = {};
    let counter = 0;
    [...doc.blocks]
      .filter((b) => b.type === 'heading')
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .forEach((b) => {
        counter++;
        m[b.id] = counter;
      });
    return m;
  }, [doc.blocks]);

  const sortedRefs = useMemo(
    () => sortReferences(doc.references, sortMode),
    [doc.references, sortMode],
  );

  const selectedBlock = doc.blocks.find((b) => b.id === selectedId) ?? null;

  // -----------------------------------------------------------------------
  // Mutators (all push back through setPoster for store immutability)
  // -----------------------------------------------------------------------

  const updateDoc = (patch: Partial<PosterDoc>) => setPoster(posterId, { ...doc, ...patch });

  const updateBlock = (id: string, patch: Partial<Block>) =>
    setBlocks(doc.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const deleteBlock = (id: string) => {
    setBlocks(doc.blocks.filter((b) => b.id !== id));
    setSelectedId(null);
  };

  const addBlock = (type: Block['type']) => {
    const newBlock: Block = {
      id: `b${nanoid(6)}`,
      type,
      x: 20,
      y: 80,
      w: type === 'logo' ? 50 : 155,
      h: type === 'logo' ? 40 : type === 'heading' ? 22 : type === 'references' ? 120 : 140,
      content: type === 'heading' ? 'Section Title' : type === 'text' ? 'Enter your text here.' : '',
      imageSrc: null,
      imageFit: 'contain',
      tableData:
        type === 'table'
          ? { rows: 3, cols: 3, cells: Array(9).fill(''), colWidths: null, borderPreset: 'apa' }
          : null,
    };
    setBlocks([...doc.blocks, newBlock]);
    setSelectedId(newBlock.id);
  };

  const applyTemplate = (key: LayoutKey) => {
    setBlocks(makeBlocks(key, pw, ph));
    setSelectedId(null);
  };

  const changeSize = (key: PosterSizeKey) => {
    const sz = POSTER_SIZES[key]!;
    updateDoc({
      widthIn: sz.w,
      heightIn: sz.h,
      blocks: makeBlocks('3col', sz.w, sz.h),
    });
    setSelectedId(null);
    setZoom(null);
  };

  const onAutoLayout = () => {
    const next = autoLayout(doc.blocks, cW, cH, doc.styles);
    setBlocks(next);
  };

  const savePreset = (name: string) => {
    setSavedPresets((prev) => [
      ...prev.filter((x) => x.name !== name),
      {
        name,
        fontFamily: doc.fontFamily,
        paletteName: palName,
        styles: doc.styles,
        headingStyle: doc.headingStyle,
      },
    ]);
  };

  const loadPreset = (preset: StylePreset) => {
    const matched = PALETTES.find((p) => p.name === preset.paletteName);
    const palette = matched ? (() => {
      const { name, ...rest } = matched;
      return rest;
    })() : doc.palette;
    updateDoc({
      fontFamily: preset.fontFamily,
      palette,
      styles: preset.styles,
      headingStyle: preset.headingStyle,
    });
  };

  // Delete key support (ignored when typing in inputs / contentEditable)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' || !selectedId) return;
      const target = document.activeElement as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.getAttribute('contenteditable') === 'true';
      if (!isInput) deleteBlock(selectedId);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, doc.blocks]);

  // Inject Google Fonts + print CSS once on mount.
  useEffect(() => {
    const link = document.createElement('link');
    link.href =
      'https://fonts.googleapis.com/css2?family=Charter:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600;700;800&family=Fira+Sans:wght@300;400;500;600;700;800&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=Libre+Franklin:wght@300;400;500;600;700;800&family=Literata:wght@400;500;600;700;800&family=Lora:wght@400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&family=Source+Sans+3:wght@300;400;500;600;700;800&family=Source+Serif+4:wght@400;500;600;700;800&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    const style = document.createElement('style');
    style.textContent = `@media print{body *{visibility:hidden!important}#poster-canvas,#poster-canvas *{visibility:visible!important}#poster-canvas{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;transform:none!important;box-shadow:none!important}}`;
    document.head.appendChild(style);
  }, []);

  return (
    <div
      ref={rootRef}
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        background: '#0a0a12',
        fontFamily: "'DM Sans',system-ui,sans-serif",
        overflow: 'hidden',
      }}
    >
      <Sidebar
        posterSizeKey={sizeKey}
        onChangePosterSize={changeSize}
        showGrid={showGrid}
        onToggleGrid={setShowGrid}
        fontFamily={doc.fontFamily}
        onChangeFont={(font) => updateDoc({ fontFamily: font })}
        palette={doc.palette}
        paletteName={palName}
        onChangePalette={(palette) => updateDoc({ palette })}
        styles={doc.styles}
        onChangeStyles={(styles) => updateDoc({ styles })}
        headingStyle={doc.headingStyle}
        onChangeHeadingStyle={(headingStyle) => updateDoc({ headingStyle })}
        authors={doc.authors}
        onChangeAuthors={(authors) => updateDoc({ authors })}
        institutions={doc.institutions}
        onChangeInstitutions={(institutions) => updateDoc({ institutions })}
        references={doc.references}
        onChangeReferences={(refs: Reference[]) => updateDoc({ references: refs })}
        citationStyle={citationStyle}
        onChangeCitationStyle={setCitationStyle}
        sortMode={sortMode}
        onChangeSortMode={setSortMode}
        selectedBlock={selectedBlock}
        onUpdateBlock={updateBlock}
        onAddBlock={addBlock}
        onApplyTemplate={applyTemplate}
        onAutoLayout={onAutoLayout}
        onPrint={() => window.print()}
        savedPresets={savedPresets}
        onSavePreset={savePreset}
        onLoadPreset={loadPreset}
      />

      <div
        ref={canvasRef}
        onClick={() => setSelectedId(null)}
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'auto',
          padding: 30,
          background: '#0a0a12',
        }}
      >
        <div style={{ position: 'relative' }}>
          <div
            style={{
              width: cW * zoom,
              height: cH * zoom,
              boxShadow: '0 4px 40px rgba(0,0,0,.5)',
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <div
              id="poster-canvas"
              style={{
                width: cW,
                height: cH,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                background: doc.palette.bg,
                position: 'relative',
              }}
            >
              {showGrid && (
                <svg
                  width={cW}
                  height={cH}
                  style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', opacity: 0.03 }}
                >
                  {Array.from({ length: Math.ceil(cW / 40) + 1 }).map((_, i) => (
                    <line
                      key={`v${i}`}
                      x1={i * 40}
                      y1={0}
                      x2={i * 40}
                      y2={cH}
                      stroke={doc.palette.primary}
                      strokeWidth=".5"
                    />
                  ))}
                  {Array.from({ length: Math.ceil(cH / 40) + 1 }).map((_, i) => (
                    <line
                      key={`h${i}`}
                      x1={0}
                      y1={i * 40}
                      x2={cW}
                      y2={i * 40}
                      stroke={doc.palette.primary}
                      strokeWidth=".5"
                    />
                  ))}
                </svg>
              )}
              {doc.blocks.map((b) => (
                <BlockFrame
                  key={b.id}
                  block={b}
                  palette={doc.palette}
                  fontFamily={ffc}
                  styles={doc.styles}
                  headingStyle={doc.headingStyle}
                  authors={doc.authors}
                  institutions={doc.institutions}
                  references={sortedRefs}
                  citationStyle={citationStyle}
                  headingNumber={headingNumbers[b.id] ?? 0}
                  selected={selectedId === b.id}
                  onSelect={setSelectedId}
                  onPointerDown={onPointerDown}
                  onUpdate={updateBlock}
                  onDelete={deleteBlock}
                />
              ))}
            </div>
          </div>
          <div
            style={{
              textAlign: 'center',
              marginTop: 8,
              fontSize: 9,
              color: '#333',
              fontFamily: 'system-ui',
            }}
          >
            {POSTER_SIZES[sizeKey]!.label} · {doc.fontFamily} · {palName || 'Custom'}
          </div>
        </div>

        <ZoomBar zoom={zoom} setZoom={setZoom} />
        <AutosaveStatusPill
          status={autosave.status}
          lastSavedAt={autosave.lastSavedAt}
          error={autosave.error}
        />
      </div>
    </div>
  );
}

// =========================================================================
// ZoomBar
// =========================================================================

function ZoomBar({ zoom, setZoom }: { zoom: number; setZoom: (z: number | null) => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: '#1a1a26ee',
        borderRadius: 6,
        padding: '4px 8px',
        border: '1px solid #2a2a3a',
        zIndex: 10,
      }}
    >
      <button
        onClick={() => setZoom(Math.max(0.3, zoom - 0.15))}
        style={{ all: 'unset', cursor: 'pointer', color: '#aaa', fontSize: 14, padding: '2px 6px', fontWeight: 700 }}
      >
        −
      </button>
      <button
        onClick={() => setZoom(null)}
        style={{ all: 'unset', cursor: 'pointer', color: '#888', fontSize: 9, padding: '2px 8px', fontWeight: 600, fontFamily: 'system-ui' }}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        onClick={() => setZoom(Math.min(3, zoom + 0.15))}
        style={{ all: 'unset', cursor: 'pointer', color: '#aaa', fontSize: 14, padding: '2px 6px', fontWeight: 700 }}
      >
        +
      </button>
      <div style={{ width: 1, height: 14, background: '#333', margin: '0 4px' }} />
      <button
        onClick={() => setZoom(null)}
        style={{ all: 'unset', cursor: 'pointer', color: '#666', fontSize: 8, padding: '2px 6px', fontWeight: 600 }}
      >
        FIT
      </button>
    </div>
  );
}
