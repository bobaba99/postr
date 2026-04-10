/**
 * PosterEditor — top-level editor that mounts the Sidebar + Canvas
 * and wires every interaction through the Zustand poster store.
 *
 * Loads its initial state from the store (set by the Editor route
 * after fetching from Supabase). Mutations dispatch back into the
 * store; Phase 4 layers autosave on top by subscribing to changes.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { checkBounds, type OobWarning } from './boundsCheck';
import { GuidelinesPanel } from './GuidelinesPanel';
import { OnboardingTour } from '@/components/OnboardingTour';
import { Sidebar, type StylePreset } from './Sidebar';
import {
  DEFAULT_POSTER_SIZE_KEY,
  FONTS,
  PALETTES,
  POSTER_SIZES,
  PX,
  SNAP_GRID,
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
/** Match a Palette to its catalog name by comparing all color fields. */
function paletteNameFor(palette: Palette): string {
  for (const named of PALETTES) {
    if (
      named.bg === palette.bg &&
      named.primary === palette.primary &&
      named.accent === palette.accent &&
      named.accent2 === palette.accent2 &&
      named.muted === palette.muted
    ) {
      return named.name;
    }
  }
  return '';
}

// =========================================================================
// Drag/resize hook (ported from prototype useDrag)
// =========================================================================

/**
 * Drag + resize hook with click-vs-drag disambiguation.
 *
 * Does NOT call preventDefault() on pointerdown — if we did, the
 * browser would refuse to move focus into any contentEditable we
 * clicked, which is why users couldn't see a caret in text blocks
 * (issue #4). Instead:
 *
 *   - We attach window listeners on pointermove/pointerup.
 *   - The first move beyond DRAG_THRESHOLD px flips didDragRef to
 *     true. From that moment on we apply userSelect: none to the
 *     body so dragging over text doesn't ghost-highlight it.
 *   - On pointerup we leave didDragRef set exactly long enough for
 *     BlockFrame's onClick handler to read it (React fires click
 *     right after pointerup) and swallow the click. BlockFrame
 *     clears the ref after reading. This kills the "drag the empty
 *     image block always opens file picker" bug (issue #3) because
 *     the drag swallows the synthetic click that would have reached
 *     the image's upload handler.
 *
 * Returns both the pointerdown handler and didDragRef so call sites
 * can consult "did the user just drag?" in their own click handlers.
 */
const DRAG_THRESHOLD_PX = 4;

export interface UseBlockDragResult {
  onPointerDown: (e: React.PointerEvent, id: string, mode: 'move' | 'resize') => void;
  didDragRef: React.MutableRefObject<boolean>;
  /** Id of the block currently being moved/resized, null otherwise. */
  draggingId: string | null;
}

function useBlockDrag(
  blocks: Block[],
  setBlocks: (b: Block[]) => void,
  scale: number,
): UseBlockDragResult {
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
    active: boolean; // flipped true once movement passes threshold
  } | null>(null);
  const didDragRef = useRef(false);
  const prevUserSelectRef = useRef<string>('');
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, id: string, mode: 'move' | 'resize') => {
      // stopPropagation keeps the canvas backdrop's "deselect on click"
      // from firing. We intentionally do NOT call preventDefault — we
      // want the natural click/focus flow to happen when the user
      // doesn't actually drag. See block comment above.
      e.stopPropagation();

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
        active: false,
      };

      const onMove = (ev: PointerEvent) => {
        const s = sessionRef.current;
        if (!s) return;
        const dx = (ev.clientX - s.sx) / scale;
        const dy = (ev.clientY - s.sy) / scale;

        // Cheap px-space distance check against the raw (unscaled)
        // pointer deltas — we need the absolute movement the user
        // made, not the zoom-scaled equivalent.
        if (!s.active) {
          const rawDx = ev.clientX - s.sx;
          const rawDy = ev.clientY - s.sy;
          if (Math.hypot(rawDx, rawDy) < DRAG_THRESHOLD_PX) return;
          s.active = true;
          didDragRef.current = true;
          setDraggingId(s.id);
          // Disable text selection body-wide for the duration of the drag.
          prevUserSelectRef.current = document.body.style.userSelect;
          document.body.style.userSelect = 'none';
        }

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
        setDraggingId(null);
        document.body.style.userSelect = prevUserSelectRef.current;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [blocks, setBlocks, scale],
  );

  return { onPointerDown, didDragRef, draggingId };
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
  //
  // Poster display name — separate from the title block content. Used
  // for dashboard organization (e.g. "Maya — APA 2026" vs the actual
  // poster title "Single-Dose Psilocybin for Treatment-Resistant
  // Depression"). Persisted to posters.title via autosave.
  const posterDisplayName = usePosterStore((s) => s.posterTitle);
  const setPosterDisplayName = usePosterStore((s) => s.setPosterTitle);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('none');
  const [citationStyle, setCitationStyle] = useState<CitationStyleKey>(DEFAULT_CITATION_STYLE);
  // K1 fix: presets persist across posters via localStorage (not
  // component state). Previously useState — lost on every poster open.
  const [savedPresets, setSavedPresets] = useState<StylePreset[]>(() => {
    try {
      const raw = localStorage.getItem('postr.style-presets');
      return raw ? (JSON.parse(raw) as StylePreset[]) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('postr.style-presets', JSON.stringify(savedPresets));
    } catch {
      // Quota / private mode — silently drop; presets only live in-session.
    }
  }, [savedPresets]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [guidelinesOpen, setGuidelinesOpen] = useState(true);

  // B1 fix: measure how much the title block's rendered content
  // OVERRAN its declared height. When a long title wraps to multiple
  // lines, titleOverflowPx becomes positive and every non-title block
  // gets shifted down by that amount (via BlockFrame) so wrapped
  // title lines don't collide with the authors row / body blocks.
  const [titleOverflowPx, setTitleOverflowPx] = useState(0);

  // ⌘/ or Ctrl+/ toggles the sidebar (Notion shortcut).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Editor entrance animation — runs once on mount, scoped to root.
  useGsapContext(() => {
    editorEntrance();
  }, rootRef);

  // B1 fix: observe the title block's actual rendered height. The
  // block's DOM frame has `height: auto; minHeight: b.h`, so its
  // offsetHeight reflects content growth (including wrapping). The
  // canvas div has `transform: scale(z)` but offset metrics are
  // in pre-transform (poster-unit) space, so no scale math needed.
  const titleBlockId = useMemo(
    () => doc?.blocks.find((b) => b.type === 'title')?.id ?? null,
    [doc?.blocks],
  );
  const titleBlockH = useMemo(
    () => doc?.blocks.find((b) => b.type === 'title')?.h ?? 0,
    [doc?.blocks],
  );
  useLayoutEffect(() => {
    if (!titleBlockId || !canvasRef.current || titleBlockH <= 0) {
      setTitleOverflowPx(0);
      return;
    }
    const el = canvasRef.current.querySelector<HTMLElement>(
      `[data-block-id="${titleBlockId}"]`,
    );
    if (!el) return;
    const measure = () => {
      const rendered = el.offsetHeight;
      setTitleOverflowPx(Math.max(0, rendered - titleBlockH));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [titleBlockId, titleBlockH]);

  // Autosave — debounces doc changes and persists via upsertPoster.
  // Status drives the pill rendered in the top-right overlay.
  const autosave = useAutosave(posterId, doc, posterDisplayName);

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

  const { onPointerDown, didDragRef, draggingId } = useBlockDrag(doc.blocks, setBlocks, zoom);
  const draggingBlock = draggingId ? doc.blocks.find((x) => x.id === draggingId) ?? null : null;

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

  // Out-of-bounds detection — warns when blocks extend past the poster canvas
  const oobWarnings = useMemo(
    () => checkBounds(doc.blocks, cW, cH),
    [doc.blocks, cW, cH],
  );
  const oobBlockIds = useMemo(
    () => new Set(oobWarnings.map((w) => w.blockId)),
    [oobWarnings],
  );

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
    const w = type === 'logo' ? 50 : 155;
    const h = type === 'logo' ? 40 : type === 'heading' ? 22 : type === 'references' ? 120 : 140;

    // M1/S2 fix: find the first non-colliding (x, y) so an inserted
    // block doesn't render on top of existing ones. Scan down in
    // 20-unit increments from the default y=80, keeping x=20. If the
    // poster's left column is full top-to-bottom, fall back to the
    // far right. Stops as soon as no overlap with any existing block.
    const overlaps = (ax: number, ay: number) =>
      doc.blocks.some((b) => {
        if (b.type === 'title' || b.type === 'authors') return false;
        return !(ax + w <= b.x || b.x + b.w <= ax || ay + h <= b.y || b.y + b.h <= ay);
      });

    let nx = 20;
    let ny = 80;
    for (let i = 0; i < 60 && overlaps(nx, ny); i++) {
      ny += 20;
      if (ny + h > ph - 20) {
        // wrapped past the bottom of the poster — jump to next column
        ny = 80;
        nx += w + 20;
      }
    }

    const newBlock: Block = {
      id: `b${nanoid(6)}`,
      type,
      x: nx,
      y: ny,
      w,
      h,
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
      {sidebarOpen && (
        <Sidebar
          onToggleSidebar={() => setSidebarOpen(false)}
        posterTitle={posterDisplayName}
        onChangePosterTitle={setPosterDisplayName}
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
      )}

      {/* Notion-style reveal tab when the sidebar is hidden. */}
      {!sidebarOpen && (
        <button
          aria-label="Show sidebar"
          title="Show sidebar (⌘/)"
          onClick={() => setSidebarOpen(true)}
          style={{
            all: 'unset',
            position: 'fixed',
            top: 16,
            left: 16,
            width: 36,
            height: 36,
            borderRadius: 8,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
            background: '#1a1a26',
            border: '1px solid #2a2a3a',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            zIndex: 20,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.borderColor = '#7c6aed';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#9ca3af';
            e.currentTarget.style.borderColor = '#2a2a3a';
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
      )}

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
            data-postr-canvas-frame
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
                // Grid cell size equals SNAP_GRID (5 units = 1/2 inch
                // printed), so every visible line is a valid snap
                // target. The denser grid is drawn faintly and with
                // every 10th line slightly brighter for orientation.
                <svg
                  width={cW}
                  height={cH}
                  style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
                >
                  {Array.from({ length: Math.ceil(cW / SNAP_GRID) + 1 }).map((_, i) => (
                    <line
                      key={`v${i}`}
                      x1={i * SNAP_GRID}
                      y1={0}
                      x2={i * SNAP_GRID}
                      y2={cH}
                      stroke={doc.palette.primary}
                      strokeWidth={0.4}
                      opacity={i % 10 === 0 ? 0.08 : 0.03}
                    />
                  ))}
                  {Array.from({ length: Math.ceil(cH / SNAP_GRID) + 1 }).map((_, i) => (
                    <line
                      key={`h${i}`}
                      x1={0}
                      y1={i * SNAP_GRID}
                      x2={cW}
                      y2={i * SNAP_GRID}
                      stroke={doc.palette.primary}
                      strokeWidth={0.4}
                      opacity={i % 10 === 0 ? 0.08 : 0.03}
                    />
                  ))}
                </svg>
              )}

              {/*
                Drag guides — dotted edge / centerline overlay rendered
                while a block is actively being moved or resized.
                Shows:
                  · the 4 edges of the dragged block (full canvas)
                  · the dragged block's horizontal + vertical centers
                  · an accent tick where an edge matches the canvas
                    centerlines (indicates centered alignment)
                All lines use the palette accent color so they
                contrast with the body text and disappear the moment
                the drag ends.
              */}
              {draggingBlock && (
                <svg
                  width={cW}
                  height={cH}
                  style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 5 }}
                >
                  {(() => {
                    const b = draggingBlock;
                    const left = b.x;
                    const right = b.x + b.w;
                    const top = b.y;
                    const bottom = b.y + b.h;
                    const cx = b.x + b.w / 2;
                    const cy = b.y + b.h / 2;
                    const canvasCx = cW / 2;
                    const canvasCy = cH / 2;
                    const accent = doc.palette.accent;
                    const centered = (a: number, b: number) => Math.abs(a - b) < 0.5;
                    const vMatchesCenter = centered(cx, canvasCx);
                    const hMatchesCenter = centered(cy, canvasCy);
                    const line = (
                      x1: number,
                      y1: number,
                      x2: number,
                      y2: number,
                      key: string,
                      opacity = 0.5,
                      strokeWidth = 0.8,
                    ) => (
                      <line
                        key={key}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={accent}
                        strokeWidth={strokeWidth}
                        strokeDasharray="3,2"
                        opacity={opacity}
                      />
                    );
                    return (
                      <>
                        {/* Block edges */}
                        {line(left, 0, left, cH, 'edge-l')}
                        {line(right, 0, right, cH, 'edge-r')}
                        {line(0, top, cW, top, 'edge-t')}
                        {line(0, bottom, cW, bottom, 'edge-b')}
                        {/* Block centerlines */}
                        {line(cx, 0, cx, cH, 'center-v', 0.3, 0.5)}
                        {line(0, cy, cW, cy, 'center-h', 0.3, 0.5)}
                        {/* Canvas centerline matches — brighter when the
                            block is perfectly centered on that axis */}
                        {vMatchesCenter && line(canvasCx, 0, canvasCx, cH, 'cv-match', 0.9, 1.2)}
                        {hMatchesCenter && line(0, canvasCy, cW, canvasCy, 'ch-match', 0.9, 1.2)}
                      </>
                    );
                  })()}
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
                  didDragRef={didDragRef}
                  onUpdate={updateBlock}
                  onDelete={deleteBlock}
                  titleOverflowPx={titleOverflowPx}
                  isOutOfBounds={oobBlockIds.has(b.id)}
                />
              ))}
            </div>
          </div>
        </div>

        {/*
          Poster info caption — pinned above the ZoomBar so the two
          no longer overlap. The previous in-flow placement could be
          occluded by the ZoomBar when the poster nearly filled the
          canvas. Now it floats at a fixed 56 px above the bottom
          (ZoomBar sits at bottom: 12 and is ~40 px tall).
        */}
        <div
          style={{
            position: 'absolute',
            bottom: 56,
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
            fontSize: 11,
            color: '#6b7280',
            fontFamily: 'system-ui',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {POSTER_SIZES[sizeKey]!.label} · {doc.fontFamily} · {palName || 'Custom'}
        </div>

        {/* OOB warning banner */}
        {oobWarnings.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#7f1d1d',
              border: '1px solid #f87171',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 11,
              color: '#fca5a5',
              fontFamily: 'system-ui',
              maxWidth: 400,
              zIndex: 15,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              lineHeight: 1.4,
            }}
          >
            <strong style={{ color: '#f87171' }}>
              {oobWarnings.length} block{oobWarnings.length > 1 ? 's' : ''} outside poster bounds
            </strong>
            {oobWarnings.slice(0, 3).map((w) => (
              <div key={w.blockId} style={{ marginTop: 2 }}>
                {w.severity === 'full' ? '⛔' : '⚠️'} {w.message}
              </div>
            ))}
            {oobWarnings.length > 3 && (
              <div style={{ marginTop: 2, color: '#f8717188' }}>
                +{oobWarnings.length - 3} more…
              </div>
            )}
          </div>
        )}

        <ZoomBar zoom={zoom} setZoom={setZoom} />
        <AutosaveStatusPill
          status={autosave.status}
          lastSavedAt={autosave.lastSavedAt}
          error={autosave.error}
        />
      </div>

      <GuidelinesPanel open={guidelinesOpen} onToggle={() => setGuidelinesOpen((v) => !v)} />

      {/* Show guidelines toggle when panel is closed */}
      {!guidelinesOpen && (
        <button
          title="Show poster guidelines"
          onClick={() => setGuidelinesOpen(true)}
          style={{
            all: 'unset',
            position: 'fixed',
            top: 16,
            right: 16,
            width: 36,
            height: 36,
            borderRadius: 8,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
            background: '#1a1a26',
            border: '1px solid #2a2a3a',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            zIndex: 20,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
          </svg>
        </button>
      )}

      <OnboardingTour />
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
