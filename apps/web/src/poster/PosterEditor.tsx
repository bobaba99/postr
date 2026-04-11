/**
 * PosterEditor — top-level editor that mounts the Sidebar + Canvas
 * and wires every interaction through the Zustand poster store.
 *
 * Loads its initial state from the store (set by the Editor route
 * after fetching from Supabase). Mutations dispatch back into the
 * store; Phase 4 layers autosave on top by subscribing to changes.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
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
import { usePublishFlowStore } from '@/stores/publishFlowStore';
import { useAutosave } from '@/hooks/useAutosave';
import { AutosaveStatusPill } from '@/components/AutosaveStatusPill';
import { useGsapContext } from '@/motion';
import { editorEntrance } from '@/motion/timelines/editorEntrance';
import { BlockFrame } from './blocks';
import { checkBounds, type OobWarning } from './boundsCheck';
import { GuidelinesPanel } from './GuidelinesPanel';
import { OnboardingTour } from '@/components/OnboardingTour';
import {
  Sidebar,
  type PosterIssue,
  type SidebarTab,
  type StylePreset,
} from './Sidebar';
import {
  DEFAULT_POSTER_SIZE_KEY,
  FONTS,
  PALETTES,
  POSTER_SIZES,
  PX,
  SNAP_GRID,
  type NamedPalette,
  type PosterSizeKey,
} from './constants';
import {
  deleteCustomPalette,
  loadCustomPalettes,
  upsertCustomPalette,
} from './customPalettes';
import { PaletteDesigner } from '@/components/PaletteDesigner';
import { StaplesPrintModal } from '@/components/StaplesPrintModal';
import {
  CITATION_STYLES,
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

/**
 * Google Fonts stylesheet URL covering all curated font families.
 * Shared by the main editor window (on mount) and the print window
 * (written into the new-tab HTML shell so printed posters render
 * with the correct typeface instead of a system fallback).
 */
const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Charter:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600;700;800&family=Fira+Sans:wght@300;400;500;600;700;800&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=Libre+Franklin:wght@300;400;500;600;700;800&family=Literata:wght@400;500;600;700;800&family=Lora:wght@400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&family=Source+Sans+3:wght@300;400;500;600;700;800&family=Source+Serif+4:wght@400;500;600;700;800&display=swap';

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
function paletteNameFor(
  palette: Palette,
  customPalettes: NamedPalette[] = [],
): string {
  const all: NamedPalette[] = [...PALETTES, ...customPalettes];
  for (const named of all) {
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

export type BlockDragMode = 'move' | 'resize' | 'rotate';

export interface UseBlockDragResult {
  onPointerDown: (e: React.PointerEvent, id: string, mode: BlockDragMode) => void;
  didDragRef: React.MutableRefObject<boolean>;
  /** Id of the block currently being moved/resized/rotated, null otherwise. */
  draggingId: string | null;
}

function useBlockDrag(
  blocks: Block[],
  setBlocks: (b: Block[]) => void,
  setBlocksSilent: (b: Block[]) => void,
  scale: number,
): UseBlockDragResult {
  // Keep a ref to blocks so the pointermove handler always reads the
  // latest positions. Previously the handler closed over a stale
  // blocks snapshot from when onPointerDown was created, causing
  // image blocks to "snap back" on drag because React re-renders
  // between pointer events updated the blocks array but the handler
  // still mapped over the old one.
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  const sessionRef = useRef<{
    id: string;
    mode: BlockDragMode;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    ow: number;
    oh: number;
    // Rotation state (only used when mode === 'rotate'):
    // - cx/cy: block center in CLIENT coordinates (screen px), read
    //   from getBoundingClientRect() at pointerdown time. The BCR of
    //   a CSS-rotated element gives its axis-aligned bounding box,
    //   so its center IS the rotation pivot (rotate() defaults to
    //   50% 50% which matches).
    // - startAngle: atan2 from center to pointer at pointerdown.
    // - oRot: block.rotation at pointerdown time (degrees).
    cx: number;
    cy: number;
    startAngle: number;
    oRot: number;
    isHeading: boolean;
    active: boolean;
  } | null>(null);
  const didDragRef = useRef(false);
  const prevUserSelectRef = useRef<string>('');
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, id: string, mode: BlockDragMode) => {
      e.stopPropagation();

      const b = blocksRef.current.find((x) => x.id === id);
      if (!b) return;

      // For rotate, look up the block's DOM element so we can read
      // its center. BCR returns the axis-aligned bounding box of the
      // visually-rendered (possibly rotated) element, so its center
      // is the rotation pivot.
      let cx = 0;
      let cy = 0;
      let startAngle = 0;
      if (mode === 'rotate') {
        const target = e.currentTarget as HTMLElement;
        const frame = target.closest<HTMLElement>('[data-block-id]');
        if (frame) {
          const r = frame.getBoundingClientRect();
          cx = r.left + r.width / 2;
          cy = r.top + r.height / 2;
          startAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
        }
      }

      sessionRef.current = {
        id,
        mode,
        sx: e.clientX,
        sy: e.clientY,
        ox: b.x,
        oy: b.y,
        ow: b.w,
        oh: b.h,
        cx,
        cy,
        startAngle,
        oRot: b.rotation ?? 0,
        isHeading: b.type === 'heading',
        active: false,
      };

      const onMove = (ev: PointerEvent) => {
        const s = sessionRef.current;
        if (!s) return;
        const dx = (ev.clientX - s.sx) / scale;
        const dy = (ev.clientY - s.sy) / scale;

        if (!s.active) {
          const rawDx = ev.clientX - s.sx;
          const rawDy = ev.clientY - s.sy;
          if (Math.hypot(rawDx, rawDy) < DRAG_THRESHOLD_PX) return;
          s.active = true;
          didDragRef.current = true;
          setDraggingId(s.id);
          prevUserSelectRef.current = document.body.style.userSelect;
          document.body.style.userSelect = 'none';
        }

        // Use blocksRef.current to read the latest block positions,
        // not the stale closure from onPointerDown creation time.
        const nextBlocks = blocksRef.current.map((blk) => {
          if (blk.id !== s.id) return blk;
          if (s.mode === 'move') {
            // Move is rotation-invariant: screen-space delta maps
            // directly to canvas-space (x, y). The block's bounding
            // box in poster coords stays axis-aligned; the rotation
            // is purely a render-time decoration.
            return {
              ...blk,
              x: snap(Math.max(0, s.ox + dx)),
              y: snap(Math.max(0, s.oy + dy)),
            };
          }
          if (s.mode === 'rotate') {
            // atan2 delta → rotation delta in degrees.
            const angle = Math.atan2(ev.clientY - s.cy, ev.clientX - s.cx);
            const deltaRad = angle - s.startAngle;
            const deltaDeg = (deltaRad * 180) / Math.PI;
            let nextRot = s.oRot + deltaDeg;
            // Normalize to [-180, 180] so the stored value doesn't
            // drift unbounded across multiple spin-arounds.
            nextRot = ((nextRot + 180) % 360 + 360) % 360 - 180;

            // Magnetic snap at common angles. Always-on — users
            // expect rotations to "stick" at 0/45/90/135/180 etc.
            // without holding a modifier. The 4° catch radius is
            // tight enough that intentional non-aligned rotations
            // still work (you can rotate to 43° and it won't yank
            // you to 45°), but loose enough that you feel the pull
            // when you're nearby.
            //
            // Shift key switches to hard 15° steps instead — for
            // when the user explicitly wants every rotation to
            // land on a clean multiple.
            if (ev.shiftKey) {
              nextRot = Math.round(nextRot / 15) * 15;
            } else {
              const SNAP_ANGLES = [
                -180, -135, -90, -45, 0, 45, 90, 135, 180,
              ];
              const SNAP_THRESHOLD = 4;
              for (const target of SNAP_ANGLES) {
                if (Math.abs(nextRot - target) < SNAP_THRESHOLD) {
                  nextRot = target === -180 ? 180 : target;
                  break;
                }
              }
            }
            return { ...blk, rotation: nextRot };
          }
          // mode === 'resize' — transform the screen-space delta
          // into the block's LOCAL rotated frame so dragging the
          // bottom-right handle always grows the block in its own
          // "right" / "down" direction, even when rotated 45° or 90°.
          const rot = ((s.oRot ?? 0) * Math.PI) / 180;
          const cos = Math.cos(rot);
          const sin = Math.sin(rot);
          const localDx = dx * cos + dy * sin;
          const localDy = -dx * sin + dy * cos;
          const nw = Math.max(40, s.ow + localDx);
          if (s.isHeading) return { ...blk, w: snap(nw) };
          return {
            ...blk,
            w: snap(nw),
            h: snap(Math.max(20, s.oh + localDy)),
          };
        });
        // Use silent setter during drag to avoid flooding the undo stack
        setBlocksSilent(nextBlocks);
      };

      const onUp = () => {
        // Push one undo entry for the entire drag operation
        if (sessionRef.current?.active) {
          setBlocks(blocksRef.current);
        }
        sessionRef.current = null;
        setDraggingId(null);
        document.body.style.userSelect = prevUserSelectRef.current;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [setBlocks, setBlocksSilent, scale],
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
  const [showRuler, setShowRuler] = useState(true);
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
  const [previewMode, setPreviewMode] = useState(false);
  // Lifted from Sidebar so the Check tab can render a draggable
  // figure-size overlay on the canvas — needs to know which tab
  // is active, and needs to share the tab setter with Sidebar.
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('layout');
  // Id of the most recently inserted block. Used by BlockFrame to
  // play a one-shot `postr-block-insert` CSS animation when the
  // block mounts. Cleared 700 ms later (slightly longer than the
  // animation) so re-renders don't re-trigger the animation and
  // subsequent edits are visually calm.
  const [justInsertedId, setJustInsertedId] = useState<string | null>(null);
  // Gray figure-size preview rectangle on the canvas, only rendered
  // while the Check tab is active AND no image block is selected.
  // Default: 10"×7" placed roughly center-ish on a standard 48×36
  // canvas (190, 145, 100, 70 in poster units = center of 480×360).
  const [checkFigureRect, setCheckFigureRect] = useState({
    x: 190,
    y: 145,
    w: 100,
    h: 70,
  });

  // Custom palettes persist via localStorage (postr.custom-palettes).
  // They appear in the Style tab beneath the curated catalog and can
  // be embedded in saved style presets so they survive even if the
  // user later deletes the custom palette from their catalog.
  const [customPalettes, setCustomPalettes] = useState<NamedPalette[]>(() =>
    loadCustomPalettes(),
  );
  const [paletteDesignerOpen, setPaletteDesignerOpen] = useState(false);
  const [editingPaletteName, setEditingPaletteName] = useState<string | null>(
    null,
  );
  const [staplesPrintOpen, setStaplesPrintOpen] = useState(false);

  // B1 fix: measure how much the title block's rendered content
  // OVERRAN its declared height. When a long title wraps to multiple
  // lines, titleOverflowPx becomes positive and every non-title block
  // gets shifted down by that amount (via BlockFrame) so wrapped
  // title lines don't collide with the authors row / body blocks.
  const [titleOverflowPx, setTitleOverflowPx] = useState(0);

  // Undo/redo keyboard shortcuts
  const undo = usePosterStore((s) => s.undo);
  const redo = usePosterStore((s) => s.redo);

  // ⌘/ or Ctrl+/ toggles the sidebar (Notion shortcut).
  // ⌘Z / Ctrl+Z = undo, ⌘⇧Z / Ctrl+Y = redo.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
      // Undo: Ctrl+Z / Cmd+Z (not in a contentEditable or input)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        const isEditable = (e.target as HTMLElement)?.isContentEditable;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || isEditable) return;
        e.preventDefault();
        undo();
      }
      // Redo: Ctrl+Y or Cmd+Shift+Z
      if (
        ((e.metaKey || e.ctrlKey) && e.key === 'y') ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z')
      ) {
        const tag = (e.target as HTMLElement)?.tagName;
        const isEditable = (e.target as HTMLElement)?.isContentEditable;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || isEditable) return;
        e.preventDefault();
        redo();
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
  const palName = paletteNameFor(doc.palette, customPalettes);

  // Preview mode — full-screen poster, no UI chrome
  if (previewMode) {
    // Compute scale to fit the viewport with padding
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
    const previewScale = Math.min((vw - 80) / cW, (vh - 80) / cH);

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50000,
          background: '#0a0a12',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div
          style={{
            width: cW * previewScale,
            height: cH * previewScale,
            boxShadow: '0 8px 60px rgba(0,0,0,0.6)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: cW,
              height: cH,
              transform: `scale(${previewScale})`,
              transformOrigin: 'top left',
              background: doc.palette.bg,
              position: 'relative',
            }}
          >
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
                selected={false}
                onSelect={() => {}}
                onPointerDown={() => {}}
                didDragRef={didDragRef}
                onUpdate={() => {}}
                onDelete={() => {}}
                titleOverflowPx={titleOverflowPx}
              />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            onClick={() => setPreviewMode(false)}
            style={{
              cursor: 'pointer',
              padding: '10px 24px',
              fontSize: 14,
              fontWeight: 600,
              color: '#fff',
              background: '#7c6aed',
              border: 'none',
              borderRadius: 8,
            }}
          >
            Back to Editor
          </button>
          <button
            onClick={() => { setPreviewMode(false); printPoster(); }}
            style={{
              cursor: 'pointer',
              padding: '10px 24px',
              fontSize: 14,
              fontWeight: 600,
              color: '#c8cad0',
              background: '#1a1a26',
              border: '1px solid #2a2a3a',
              borderRadius: 8,
            }}
          >
            Print / Save PDF
          </button>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            {POSTER_SIZES[sizeKey]!.label} · {doc.fontFamily} · {palName || 'Custom'}
          </span>
        </div>
      </div>
    );
  }

  const { zoom, setZoom } = useZoom(canvasRef, sizeKey);

  // ── Touchpad pinch-to-zoom + pan ───────────────────────────────────
  //
  // Industry-standard canvas zoom, modeled on Figma / Excalidraw /
  // tldraw:
  //
  // * Pinch (ctrlKey wheel) → zoom ANCHORED AT THE CURSOR. The
  //   canvas content under the pointer stays fixed in screen space
  //   while the rest of the canvas scales around it — the only way
  //   pinch feels natural. Center-anchored zoom is the "weird"
  //   sensation the previous commit shipped: users pinched over a
  //   spot in the corner of the poster and the center leapt away.
  // * Pinch zoom uses `preventDefault()` on a non-passive listener
  //   to block the browser's default "zoom the whole webpage" path.
  // * Plain two-finger scroll (no ctrlKey) is left alone — the
  //   outer wrapper's native `overflow: auto` handles panning a
  //   zoomed-in poster.
  // * Mouse-wheel + Cmd/Ctrl also sets ctrlKey, so desktop users
  //   get zoom via the same keyboard shortcut.
  //
  // Math:
  //   Before zoom, measure the cursor's position relative to the
  //   canvas frame in SCREEN pixels (`cursorInFrameX/Y`). Convert
  //   to content-space coords via `/ oldZoom`. After applying the
  //   new zoom, compute where that same content-space point now
  //   renders in screen pixels: it's `contentX * newZoom`. The
  //   difference between the old and new on-screen position is
  //   the amount we need to scroll `el` to keep the cursor locked.
  //   `flushSync` forces React to apply the zoom state change to
  //   the DOM immediately so we can read the post-zoom frame rect
  //   on the very next line — otherwise the adjustment lags by one
  //   frame and the cursor visibly drifts.
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const ZOOM_MIN = 0.2;
    const ZOOM_MAX = 5;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // not a pinch / Cmd+wheel — let it scroll
      e.preventDefault();

      const frame = el.querySelector(
        '[data-postr-canvas-frame]',
      ) as HTMLElement | null;
      if (!frame) return;

      // Pre-zoom state — captured BEFORE the setZoom call so the
      // math runs against the values the user actually sees on
      // screen at the moment of the gesture tick.
      const oldZoom = zoomRef.current;
      const frameRect = frame.getBoundingClientRect();
      // Cursor in screen pixels relative to the frame's top-left.
      const cursorInFrameX = e.clientX - frameRect.left;
      const cursorInFrameY = e.clientY - frameRect.top;

      // Exponential factor. Dividing deltaY by 240 tunes the
      // sensitivity: a 12 px trackpad pinch tick → ~5 % zoom
      // change, which composes smoothly across a 60-event gesture
      // without feeling sluggish or runaway. Figma uses roughly
      // the same range.
      const factor = Math.exp(-e.deltaY / 240);
      const newZoom = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, oldZoom * factor),
      );
      if (newZoom === oldZoom) return;

      // Synchronously commit the zoom so the following scroll math
      // reads the post-zoom layout (not the stale one).
      zoomRef.current = newZoom;
      flushSync(() => setZoom(newZoom));

      // The frame just resized around its top-left (the sibling
      // outer wrapper uses flex centering, so top-left may have
      // also shifted if the frame still fits in the viewport).
      // Recompute the cursor's position on the NEW frame and
      // scroll `el` by the delta to keep the same content point
      // under the pointer.
      const newFrameRect = frame.getBoundingClientRect();
      const scale = newZoom / oldZoom;
      const newCursorInFrameX = cursorInFrameX * scale;
      const newCursorInFrameY = cursorInFrameY * scale;
      const dx =
        newCursorInFrameX - (e.clientX - newFrameRect.left);
      const dy =
        newCursorInFrameY - (e.clientY - newFrameRect.top);
      el.scrollLeft += dx;
      el.scrollTop += dy;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [canvasRef, setZoom]);

  // ── Publish-to-gallery flow ────────────────────────────────────────
  // `handlePublish` opens the consent→metadata sequence managed by
  // usePublishFlowStore. If the user arrived with ?publish=1 (from the
  // dashboard card), auto-open the flow once the poster has rendered
  // so html-to-image can capture #poster-canvas.
  const posterIdFromStore = usePosterStore((s) => s.posterId);
  const posterTitleFromStore = usePosterStore((s) => s.posterTitle);
  const openPublishFlow = usePublishFlowStore((s) => s.openForPoster);
  const [searchParams, setSearchParams] = useSearchParams();
  const handlePublish = useCallback(() => {
    if (!posterIdFromStore) return;
    openPublishFlow(posterIdFromStore, posterTitleFromStore || 'Untitled Poster');
  }, [posterIdFromStore, posterTitleFromStore, openPublishFlow]);

  useEffect(() => {
    if (searchParams.get('publish') !== '1') return;
    if (!posterIdFromStore) return;
    // Wait one animation frame so the canvas has mounted, then open.
    const id = requestAnimationFrame(() => {
      handlePublish();
      // Strip the query param so a refresh doesn't re-open the flow.
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('publish');
        return next;
      }, { replace: true });
    });
    return () => cancelAnimationFrame(id);
  }, [searchParams, posterIdFromStore, handlePublish, setSearchParams]);

  // Helper: replace blocks immutably
  const storeSetBlocks = usePosterStore((s) => s.setBlocks);
  const storeSetBlocksSilent = usePosterStore((s) => s.setBlocksSilent);
  const setBlocks = (next: Block[]) => storeSetBlocks(next);

  const { onPointerDown, didDragRef, draggingId } = useBlockDrag(doc.blocks, setBlocks, storeSetBlocksSilent, zoom);
  const draggingBlock = draggingId ? doc.blocks.find((x) => x.id === draggingId) ?? null : null;

  // Heading auto-numbering: use the block ARRAY ORDER as the source
  // of truth, not geometry. Every previous attempt (row-first, then
  // column-first with a bucket tolerance) broke on at least one
  // template — row-first numbered Hypotheses as #5 in a 3-column
  // poster, column-first mis-ordered 2-column-wide-figure layouts
  // whose full-width heading spans all columns. The array order in
  // doc.blocks is authored by each template to match the intended
  // reading flow, and new headings append to the end which naturally
  // gives them the next number. Drag-to-reorder on the canvas
  // doesn't change array position, so numbers stay stable while
  // the user fine-tunes layout — exactly what you'd expect from
  // an "auto-number" feature.
  const headingNumbers = useMemo(() => {
    const m: Record<string, number> = {};
    let counter = 0;
    for (const b of doc.blocks) {
      if (b.type === 'heading') {
        counter++;
        m[b.id] = counter;
      }
    }
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

  // Aggregated pre-flight issues surfaced in the Issues sidebar tab.
  // Combines OOB detection with a handful of other "did you forget X"
  // validations so the user has one place to look before exporting.
  const posterIssues = useMemo<PosterIssue[]>(() => {
    const out: PosterIssue[] = [];

    // OOB — translate the `checkBounds` output. `severity: 'full'`
    // means the block is 100 % off-canvas (hard error); `partial`
    // means it clips the edge (warning).
    for (const w of oobWarnings) {
      out.push({
        id: `oob-${w.blockId}`,
        severity: w.severity === 'full' ? 'error' : 'warning',
        category: `${w.blockType} out of bounds`,
        message: w.message,
        blockId: w.blockId,
      });
    }

    // Block-level checks
    for (const b of doc.blocks) {
      if (b.type === 'image' && !b.imageSrc) {
        out.push({
          id: `empty-image-${b.id}`,
          severity: 'warning',
          category: 'Empty figure',
          message:
            'Image block has no file attached — it will export as a dashed placeholder.',
          blockId: b.id,
        });
      }
      if (
        b.type === 'title' &&
        (!b.content || b.content.trim().length === 0 || /Your Poster Title/i.test(b.content))
      ) {
        out.push({
          id: `empty-title-${b.id}`,
          severity: 'warning',
          category: 'Default title',
          message: 'Poster title is still the default placeholder.',
          blockId: b.id,
        });
      }
      if (
        b.type === 'text' &&
        b.content &&
        /Enter your text here/i.test(b.content)
      ) {
        out.push({
          id: `placeholder-text-${b.id}`,
          severity: 'info',
          category: 'Placeholder text',
          message: 'A text block still contains "Enter your text here."',
          blockId: b.id,
        });
      }
      if (b.type === 'title' && b.content && b.content.length > 180) {
        out.push({
          id: `long-title-${b.id}`,
          severity: 'info',
          category: 'Long title',
          message: `Poster title is ${b.content.length} characters — may wrap to 3+ lines at typical poster sizes.`,
          blockId: b.id,
        });
      }
    }

    // Document-level checks
    if (doc.authors.length === 0) {
      out.push({
        id: 'no-authors',
        severity: 'warning',
        category: 'Missing authors',
        message:
          'No authors have been added yet. Use the Authors tab to add them.',
      });
    }
    if (doc.institutions.length === 0 && doc.authors.length > 0) {
      out.push({
        id: 'no-institutions',
        severity: 'info',
        category: 'Missing institutions',
        message:
          'Authors are listed but no institution affiliations are set.',
      });
    }
    const hasRefBlock = doc.blocks.some((b) => b.type === 'references');
    if (hasRefBlock && doc.references.length === 0) {
      out.push({
        id: 'empty-refs',
        severity: 'warning',
        category: 'Empty references',
        message:
          'References block is on the canvas but the Refs tab is empty.',
      });
    }
    for (const r of doc.references) {
      if (r.rawText) continue; // pre-formatted paste — skip field checks
      if (!r.title || !r.title.trim()) {
        out.push({
          id: `ref-no-title-${r.id}`,
          severity: 'warning',
          category: 'Reference missing title',
          message: `Reference "${(r.authors[0] ?? 'Unknown').slice(0, 40)} ${r.year ?? ''}" has no title.`,
        });
      }
      if (!r.authors.length) {
        out.push({
          id: `ref-no-authors-${r.id}`,
          severity: 'info',
          category: 'Reference missing authors',
          message: `Reference "${(r.title ?? 'Untitled').slice(0, 40)}" has no authors listed.`,
        });
      }
    }

    return out;
  }, [
    doc.blocks,
    doc.authors,
    doc.institutions,
    doc.references,
    oobWarnings,
  ]);

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
    // Logo is limited to ONE per poster. Multiple logos stack at
    // the top-center and their external handles collide (both
    // occupy top: -26, so move/delete/rotate controls end up
    // overlapping with each other and the title's handles).
    // Selecting the existing logo instead of adding a duplicate
    // matches user intent: "I want to edit the logo" → jump to it.
    if (type === 'logo') {
      const existing = doc.blocks.find((b) => b.type === 'logo');
      if (existing) {
        setSelectedId(existing.id);
        return;
      }
    }
    const w = type === 'logo' ? 50 : 155;
    const h = type === 'logo' ? 40 : type === 'heading' ? 22 : type === 'references' ? 120 : 140;

    // Place new blocks centered on the canvas. If the dead-center
    // slot collides with an existing non-header block, spiral outward
    // in 20-unit steps (right, down, left, up, repeat with a larger
    // radius) until a clear slot is found — this keeps fresh blocks
    // near the middle of the user's working area instead of dumping
    // them top-left. Headers (title/authors) are still ignored for
    // collision since they're pinned to the top anyway.
    //
    // IMPORTANT: block x/y/w/h live in POSTER UNITS (1 unit = 1/10",
    // set by the PX constant), not raw inches. `pw` / `ph` here come
    // from POSTER_SIZES which ARE in inches — we have to multiply by
    // PX (or use `cW` / `cH` which are already pre-multiplied) or the
    // center math divides by 10× too many and every new block ends up
    // clamped to the top-left corner. The 2026-04 regression was
    // exactly this — `pw/2` computed `24` for a 48" poster, then
    // subtracting `w/2 = 77.5` gave a negative centerX that clamp
    // pinned to 10.
    const posterW = cW; // poster units
    const posterH = cH; // poster units

    const overlaps = (ax: number, ay: number) =>
      doc.blocks.some((b) => {
        if (b.type === 'title' || b.type === 'authors') return false;
        return !(ax + w <= b.x || b.x + b.w <= ax || ay + h <= b.y || b.y + b.h <= ay);
      });

    const clampX = (x: number) => Math.max(10, Math.min(posterW - w - 10, x));
    const clampY = (y: number) => Math.max(10, Math.min(posterH - h - 10, y));

    const centerX = clampX(Math.round(posterW / 2 - w / 2));
    const centerY = clampY(Math.round(posterH / 2 - h / 2));

    // Outward spiral offset table: no-op, right, down, left, up,
    // right×2, down×2, left×2, up×2, ... up to 8 rings.
    let nx = centerX;
    let ny = centerY;
    const STEP = 20;
    outer: for (let ring = 0; ring <= 8; ring++) {
      const offsets: Array<[number, number]> =
        ring === 0
          ? [[0, 0]]
          : [
              [ring, 0],
              [0, ring],
              [-ring, 0],
              [0, -ring],
              [ring, ring],
              [-ring, ring],
              [-ring, -ring],
              [ring, -ring],
            ];
      for (const [dx, dy] of offsets) {
        const tx = clampX(centerX + dx * STEP);
        const ty = clampY(centerY + dy * STEP);
        if (!overlaps(tx, ty)) {
          nx = tx;
          ny = ty;
          break outer;
        }
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
    // Trigger the one-shot insert animation. 700 ms is slightly
    // longer than the `postr-block-insert` keyframe (~500 ms) so
    // the browser completes the animation before the flag clears,
    // which stops the animation from re-firing on subsequent
    // re-renders.
    setJustInsertedId(newBlock.id);
    setTimeout(() => setJustInsertedId((id) => (id === newBlock.id ? null : id)), 700);
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
    // Measure the NATURAL content height of every text-like block
    // BEFORE auto-arrange so the layout packs them tightly.
    //
    // The subtlety: we can't measure the outer frame's BCR because
    // grow-with-content blocks have `minHeight: b.h` set on them,
    // which means the rendered frame is at LEAST the current b.h
    // tall regardless of actual content. If auto-arrange previously
    // committed b.h = 110 but the content is now only 2 lines, the
    // frame is still 110 tall — so measuring it would never shrink.
    //
    // Instead we use a fresh hidden measurement DOM: clone the
    // block's RichTextEditor content into a detached div at the
    // block's width, with the same typography, let the browser lay
    // it out, and read the resulting height. That gives us the
    // natural content height independent of the current b.h floor.
    //
    // Only measures blocks that natively grow with content (title /
    // text / heading / references / authors); image / logo / table
    // blocks keep their declared height because their content is
    // aspect-ratio or grid driven, not text-length driven.
    const GROW_TYPES = new Set<Block['type']>([
      'title',
      'text',
      'heading',
      'references',
      'authors',
    ]);
    const HEIGHT_SLACK_UNITS = 4; // padding + line-height slack so nothing clips

    const ffc = FONTS[doc.fontFamily]?.css ?? doc.fontFamily;
    const styleLevelFor = (t: Block['type']) =>
      t === 'title' ? doc.styles.title
      : t === 'authors' ? doc.styles.authors
      : t === 'heading' ? doc.styles.heading
      : doc.styles.body;

    // Detached measurement host — positioned offscreen so it never
    // flashes visually, but still rendered by the layout engine.
    const host = document.createElement('div');
    host.style.cssText =
      'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;';
    document.body.appendChild(host);

    const measureContent = (blk: Block): number => {
      const level = styleLevelFor(blk.type);
      const probe = document.createElement('div');
      probe.style.cssText = [
        `width:${blk.w}px`,
        'box-sizing:border-box',
        'padding:4px 6px',
        `font-family:${ffc}`,
        `font-size:${level.size}px`,
        `font-weight:${level.weight}`,
        `line-height:${level.lineHeight}`,
        'white-space:pre-wrap',
        'word-wrap:break-word',
      ].join(';');

      let text: string;
      if (blk.type === 'references') {
        // References don't use blk.content — they render from
        // doc.references via the selected citation formatter plus a
        // "References" header line. Reproduce that here so the probe
        // actually measures the rendered refs block height.
        const fmt = CITATION_STYLES[citationStyle] ?? CITATION_STYLES[DEFAULT_CITATION_STYLE];
        const lines = doc.references.map((r, i) =>
          fmt(r, i).replace(/_([^_]+)_/g, '$1'),
        );
        text = ['References', ...lines].join('\n');
      } else {
        // For title/text/heading/authors, use the raw content string
        // (minus any inline HTML tags from rich text formatting).
        text = (blk.content || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
      }
      probe.textContent = text || ' ';
      host.appendChild(probe);
      const h = probe.offsetHeight;
      host.removeChild(probe);
      return h;
    };

    const measured = doc.blocks.map((blk) => {
      if (!GROW_TYPES.has(blk.type)) return blk;
      const naturalH = Math.max(
        20, // floor — same lower bound autoLayout uses
        Math.ceil(measureContent(blk)) + HEIGHT_SLACK_UNITS,
      );
      if (Math.abs(naturalH - blk.h) < 2) return blk;
      return { ...blk, h: naturalH };
    });

    document.body.removeChild(host);

    const next = autoLayout(measured, cW, cH, doc.styles);
    setBlocks(next);
  };

  const savePreset = (name: string) => {
    setSavedPresets((prev) => [
      ...prev.filter((x) => x.name !== name),
      {
        name,
        fontFamily: doc.fontFamily,
        paletteName: palName || name,
        // Embed the full palette so custom palettes survive even
        // if the user later deletes them from their catalog.
        palette: doc.palette,
        styles: doc.styles,
        headingStyle: doc.headingStyle,
      },
    ]);
  };

  const loadPreset = (preset: StylePreset) => {
    // Prefer the embedded palette (post-2026-04-11 presets). For older
    // presets that only have `paletteName`, look up by name in both the
    // curated catalog and the user's custom palettes.
    const palette: Palette = (() => {
      if (preset.palette) return preset.palette;
      const builtIn = PALETTES.find((p) => p.name === preset.paletteName);
      if (builtIn) {
        const { name: _n, ...rest } = builtIn;
        return rest;
      }
      const custom = customPalettes.find((p) => p.name === preset.paletteName);
      if (custom) {
        const { name: _n, ...rest } = custom;
        return rest;
      }
      return doc.palette;
    })();
    updateDoc({
      fontFamily: preset.fontFamily,
      palette,
      styles: preset.styles,
      headingStyle: preset.headingStyle,
    });
  };

  const handleSavePaletteDesign = (named: NamedPalette) => {
    const next = upsertCustomPalette(named);
    setCustomPalettes(next);
    setPaletteDesignerOpen(false);
    setEditingPaletteName(null);
    // Apply the new/updated palette to the current poster immediately.
    const { name: _name, ...palette } = named;
    updateDoc({ palette });
  };

  const handleDeleteCustomPalette = (name: string) => {
    const next = deleteCustomPalette(name);
    setCustomPalettes(next);
  };

  // Delete key + arrow-key nudge — both gated on the canvas, not
  // on input fields. When a block is selected AND the user isn't
  // typing:
  //
  //   Arrow key         → nudge by SNAP_GRID (5 units = half-inch,
  //                       one grid cell). Default respects grid so
  //                       blocks stay aligned with the canvas
  //                       overlay + other blocks that were placed
  //                       via drag (which also snaps to SNAP_GRID).
  //   Shift + Arrow     → nudge by 1 unit (1/10 inch) for fine
  //                       sub-grid adjustment. Reverses the usual
  //                       Figma/Sketch convention (fine default,
  //                       shift for coarse) because Postr's whole
  //                       "constraint as feature" philosophy says
  //                       on-grid should be the easy path.
  //
  //   Delete / Backspace → remove the selected block.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const target = document.activeElement as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.getAttribute('contenteditable') === 'true';
      if (isInput) return;

      // Delete / Backspace → remove the selected block.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteBlock(selectedId);
        return;
      }

      // Arrow keys → nudge.
      const nudge = e.shiftKey ? 1 : SNAP_GRID;
      const arrowMap: Record<string, [number, number] | undefined> = {
        ArrowLeft: [-nudge, 0],
        ArrowRight: [nudge, 0],
        ArrowUp: [0, -nudge],
        ArrowDown: [0, nudge],
      };
      const delta = arrowMap[e.key];
      if (!delta) return;

      e.preventDefault();
      const blk = doc.blocks.find((b) => b.id === selectedId);
      if (!blk) return;
      const [dx, dy] = delta;
      updateBlock(selectedId, {
        x: Math.max(0, blk.x + dx),
        y: Math.max(0, blk.y + dy),
      });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, doc.blocks]);

  // Inject Google Fonts once on mount.
  useEffect(() => {
    const link = document.createElement('link');
    link.href = GOOGLE_FONTS_URL;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  // ── Print flow ─────────────────────────────────────────────────
  //
  // Industry-standard approach used by Google Docs, Canva, Figma,
  // and similar editors: instead of trying to coerce the live editor
  // DOM into looking right under `@media print`, open a brand-new
  // browser window containing a bare HTML shell with nothing but the
  // poster content. That window has no sidebar, no toolbar, no
  // transforms, no overflow-hidden parents — so the browser's print
  // pipeline gets a pristine page to work with.
  //
  // Flow:
  //   1. Clone #poster-canvas (so we don't touch the live DOM)
  //   2. Strip editor-only overlays (grid, ruler) from the clone
  //   3. Open a new window via `window.open('', '_blank')`
  //   4. Write a minimal HTML document with:
  //        • Google Fonts <link>
  //        • `@page { size: WxH in; margin: 0 }`
  //        • A <div> that holds the cloned canvas at its natural
  //          pixel dimensions (cW × cH) with `zoom: 96/PX` so it
  //          scales up to true print size (96 CSS-px per inch)
  //   5. Wait for fonts to load via `document.fonts.ready`
  //   6. Call `window.print()` inside the new window
  //   7. Auto-close on `afterprint` so the tab doesn't linger
  //
  // If the user's browser blocks popups, we fall back to in-window
  // print with a warning — better than silent failure.
  const printPoster = useCallback(() => {
    const canvas = document.getElementById('poster-canvas');
    if (!canvas) return;

    // Deep-clone and strip editor overlays. Grid and ruler are marked
    // with `data-postr-overlay` so we can pull them out cleanly
    // without touching user-added SVG content inside blocks.
    const clone = canvas.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-postr-overlay]').forEach((el) => {
      el.parentNode?.removeChild(el);
    });
    // Reset the editor's zoom-slider transform on the clone itself —
    // we scale via `zoom` in the print window instead.
    clone.style.transform = '';
    clone.style.transformOrigin = '';
    clone.style.position = 'relative';

    const w = doc.widthIn;
    const h = doc.heightIn;
    const naturalW = w * PX;
    const naturalH = h * PX;
    const printZoom = 96 / PX; // 9.6 at PX=10 → true 96 CSS-px/inch

    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) {
      alert(
        'Popup blocked. Please allow popups for this site to use "Save PDF", or press Ctrl/⌘+P directly from the editor as a fallback.',
      );
      return;
    }

    const title = (posterDisplayName || 'Poster').replace(/[<>]/g, '');
    const bgColor = doc.palette.bg;

    printWin.document.open();
    printWin.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${title} — Print</title>
<link href="${GOOGLE_FONTS_URL}" rel="stylesheet" />
<style>
  @page {
    size: ${w}in ${h}in;
    margin: 0;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #0a0a12;
    font-family: '${doc.fontFamily}', system-ui, -apple-system, sans-serif;
  }

  /* ── Screen view ─────────────────────────────────────────── */
  /* The user lands on this tab with a live preview of the
     poster at its natural pixel size, plus a top toolbar with a
     Print button and instructions. Close-tab reminder sits at
     the far right so they can dismiss the tab cleanly after
     printing. */
  .print-toolbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 20px;
    background: rgba(17, 17, 24, 0.96);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid #2a2a3a;
    color: #c8cad0;
    font-family: 'DM Sans', system-ui, sans-serif;
    font-size: 13px;
  }
  .print-toolbar-title {
    font-weight: 700;
    color: #e2e2e8;
    font-size: 14px;
  }
  .print-toolbar-size {
    color: #9ca3af;
    font-size: 12px;
  }
  .print-toolbar-spacer { flex: 1; }
  .print-toolbar button {
    cursor: pointer;
    padding: 9px 18px;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    background: #7c6aed;
    border: none;
    border-radius: 6px;
    font-family: inherit;
  }
  .print-toolbar button.secondary {
    background: transparent;
    color: #9ca3af;
    border: 1px solid #2a2a3a;
  }
  .print-toolbar button:hover { filter: brightness(1.1); }
  .print-toolbar-hint {
    color: #6b7280;
    font-size: 11px;
    padding: 10px 20px;
    background: rgba(124, 106, 237, 0.06);
    border-bottom: 1px solid #1f1f2e;
  }
  .print-toolbar-hint strong { color: #c8b6ff; }

  .print-stage {
    padding: 120px 30px 60px;
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }

  /* Screen-only: natural pixel size with shadow, wrapped in a
     flex container so posters much larger than the viewport
     stay centered horizontally and scroll vertically. */
  #poster-print-root {
    width: ${naturalW}px;
    height: ${naturalH}px;
    background: ${bgColor};
    position: relative;
    overflow: hidden;
    box-shadow: 0 12px 60px rgba(0, 0, 0, 0.6);
  }
  #poster-print-root #poster-canvas {
    width: 100% !important;
    height: 100% !important;
    transform: none !important;
    position: relative !important;
    overflow: visible !important;
    box-shadow: none !important;
  }

  /* ── Print view ──────────────────────────────────────────── */
  @media print {
    html, body {
      background: white !important;
      width: ${w}in !important;
      height: ${h}in !important;
    }
    .print-toolbar, .print-toolbar-hint { display: none !important; }
    .print-stage {
      padding: 0 !important;
      display: block !important;
      min-height: 0 !important;
    }
    #poster-print-root {
      position: fixed !important;
      left: 0 !important;
      top: 0 !important;
      zoom: ${printZoom};
      box-shadow: none !important;
      margin: 0 !important;
    }
  }
</style>
</head>
<body>
<div class="print-toolbar">
  <div>
    <div class="print-toolbar-title">${title}</div>
    <div class="print-toolbar-size">${w} × ${h} in</div>
  </div>
  <div class="print-toolbar-spacer"></div>
  <button id="postr-print-btn" type="button">🖨 Print / Save as PDF</button>
  <button class="secondary" id="postr-close-btn" type="button">Close tab</button>
</div>
<div class="print-toolbar-hint">
  💡 <strong>Before printing:</strong> in the Print dialog, set Destination to
  <strong>Save as PDF</strong>, Paper size to <strong>${w} × ${h} in</strong>,
  Margins = <strong>None</strong>, and enable <strong>Background graphics</strong>.
  The page will auto-open the Print dialog once the fonts finish loading.
</div>
<div class="print-stage">
  <div id="poster-print-root">${clone.outerHTML}</div>
</div>
<script>
(function(){
  var printed = false;
  function doPrint() {
    if (printed) return;
    printed = true;
    try { window.focus(); } catch (e) {}
    setTimeout(function(){ window.print(); }, 150);
  }

  // Auto-trigger print as soon as fonts are ready, mimicking the
  // one-click UX of Google Docs / Canva print flow.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(doPrint).catch(doPrint);
  } else if (document.readyState === 'complete') {
    setTimeout(doPrint, 500);
  } else {
    window.addEventListener('load', function(){ setTimeout(doPrint, 500); });
  }

  // Manual retry — if the user dismisses the auto-opened dialog
  // and wants another go without reloading the tab.
  var btn = document.getElementById('postr-print-btn');
  if (btn) btn.addEventListener('click', function(){
    printed = false;
    doPrint();
  });
  var closeBtn = document.getElementById('postr-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', function(){
    window.close();
  });
})();
</script>
</body>
</html>`);
    printWin.document.close();
  }, [doc.widthIn, doc.heightIn, doc.fontFamily, doc.palette.bg, posterDisplayName]);

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
      {/* Animated sidebar wrapper — the inner Sidebar stays mounted
          always so collapse/expand can fade+slide via width transition
          rather than popping. `overflow: hidden` clips the 484-wide
          Sidebar while the wrapper is animating to width 0. The
          `display: flex` + `minHeight: 0` combo is load-bearing: it
          lets the inner Sidebar's own `overflow: auto` panel children
          bound their height against the wrapper, so the panel scrolls
          instead of growing unbounded and clipping the bottom. */}
      <div
        style={{
          flex: '0 0 auto',
          width: sidebarOpen ? 484 : 0,
          minWidth: sidebarOpen ? 484 : 0,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
          transition:
            'width 280ms cubic-bezier(0.22, 1, 0.36, 1), min-width 280ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <Sidebar
          onToggleSidebar={() => setSidebarOpen(false)}
        posterTitle={posterDisplayName}
        onChangePosterTitle={setPosterDisplayName}
        posterSizeKey={sizeKey}
        posterWidthIn={doc.widthIn}
        posterHeightIn={doc.heightIn}
        onChangePosterSize={changeSize}
        onChangeCustomSize={(w, h) => {
          updateDoc({ widthIn: w, heightIn: h });
          setZoom(null);
        }}
        showGrid={showGrid}
        onToggleGrid={setShowGrid}
        showRuler={showRuler}
        onToggleRuler={setShowRuler}
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
        onPrint={printPoster}
        onPrintAtStaples={() => setStaplesPrintOpen(true)}
        onPreview={() => setPreviewMode(true)}
        onPublish={handlePublish}
        savedPresets={savedPresets}
        onSavePreset={savePreset}
        onLoadPreset={loadPreset}
        customPalettes={customPalettes}
        onCreateCustomPalette={() => {
          setEditingPaletteName(null);
          setPaletteDesignerOpen(true);
        }}
        onEditCustomPalette={(name) => {
          setEditingPaletteName(name);
          setPaletteDesignerOpen(true);
        }}
        onDeleteCustomPalette={handleDeleteCustomPalette}
        activeTab={sidebarTab}
        onChangeTab={setSidebarTab}
        checkFigureWidthIn={checkFigureRect.w / PX}
        checkFigureHeightIn={checkFigureRect.h / PX}
        issues={posterIssues}
        onJumpToBlock={(id) => {
          setSelectedId(id);
          const el = document.querySelector(
            `[data-block-id="${id}"]`,
          ) as HTMLElement | null;
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }}
      />
      </div>

      {/* Palette Designer — create or edit a custom palette */}
      <PaletteDesigner
        open={paletteDesignerOpen}
        initialName={editingPaletteName ?? undefined}
        initialPalette={(() => {
          if (!editingPaletteName) return doc.palette;
          const existing = customPalettes.find(
            (p) => p.name === editingPaletteName,
          );
          if (existing) {
            const { name: _n, ...rest } = existing;
            return rest;
          }
          return doc.palette;
        })()}
        onSave={handleSavePaletteDesign}
        onCancel={() => {
          setPaletteDesignerOpen(false);
          setEditingPaletteName(null);
        }}
      />

      {/* Staples Print & Go walkthrough */}
      <StaplesPrintModal
        open={staplesPrintOpen}
        posterTitle={posterDisplayName}
        onClose={() => setStaplesPrintOpen(false)}
        onSavePdf={() => {
          setStaplesPrintOpen(false);
          printPoster();
        }}
      />

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

      {/* Canvas stage — wraps the scroll container + floating
          chrome (ZoomBar, AutosaveStatusPill, OOB banner) so the
          chrome stays fixed in viewport space regardless of the
          inner scroll position. Previously the chrome was nested
          inside the scroll container and moved with scrollLeft
          during pinch-zoom. */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          minWidth: 0,
          minHeight: 0,
        }}
      >
      <div
        ref={canvasRef}
        data-postr-canvas-outer
        onClick={() => setSelectedId(null)}
        style={{
          flex: 1,
          position: 'relative',
          // IMPORTANT: this div is purely a scroll container. It
          // does NOT flex-center its children. Flex centering
          // breaks cursor-anchored pinch-to-zoom because when the
          // frame is larger than the wrapper, `justify-content:
          // center` pushes half the frame off each side and
          // `scrollLeft` starts from a center-based origin that
          // the zoom math can't predict. Centering is instead
          // handled by an inner `data-postr-canvas-workarea` div
          // that grows with the frame via `minWidth/minHeight:
          // 100%` — flex centering still applies but always from
          // a scroll origin of 0.
          display: 'block',
          overflow: 'auto',
          background: '#0a0a12',
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <div
          data-postr-canvas-workarea
          style={{
            // This div is the "pasteboard" — it must grow both
            // with the outer scroll container (so flex centering
            // fills the viewport when the frame is small) AND
            // with its own content (so scroll bars appear when
            // the frame zooms past the viewport). `width:
            // max-content` lets it size to content, while
            // `min-width / min-height: 100%` floors it to the
            // scroll container's content box. A plain
            // `min-width: 100%` alone would clamp the div to the
            // parent because its parent is `display: block` — so
            // the frame would overflow visually but the work-area
            // wouldn't grow, and `scrollLeft` would be pinned at
            // zero. That's the "horizontal always resets" bug.
            width: 'max-content',
            height: 'max-content',
            minWidth: '100%',
            minHeight: '100%',
            boxSizing: 'border-box',
            padding: 96,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
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
              // Deliberately NOT overflow:hidden — handles that sit
              // at top: -26 above the block, out-of-bounds blocks
              // dragged past the canvas edge, and rotation corners
              // all need to render into the working-area gutter.
              // The canvas visual boundary is preserved by the drop
              // shadow + border-radius on this div; anything past
              // the bounds floats freely over the workspace.
              overflow: 'visible',
              // NO transition on width/height. An earlier commit
              // added a 220 ms cubic-bezier to smooth zoom-button
              // clicks, but during a pinch gesture that transition
              // causes getBoundingClientRect() to return the
              // mid-animation size, and the scroll adjustment in
              // the wheel handler uses stale values → lag + drift.
              // Zoom-button clicks still feel fine without the
              // transition because they only fire once per click.
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
                // Same no-transition rationale as the frame above —
                // `transform: scale` animations fight the wheel
                // handler's scroll math and produce lag.
              }}
            >
              {showGrid && (
                // Grid cell size equals SNAP_GRID (5 units = 1/2 inch
                // printed), so every visible line is a valid snap
                // target. The denser grid is drawn faintly and with
                // every 10th line slightly brighter for orientation.
                <svg
                  data-postr-overlay="grid"
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
              {showRuler && (
                // Ruler overlay — inch marks along the top and left
                // edges of the canvas. Major tick every inch, labeled;
                // minor tick every half-inch. PX = 10, so 1 inch = 10
                // units. Sits above the grid with pointerEvents:none
                // so it never steals clicks from blocks underneath.
                <svg
                  data-postr-overlay="ruler"
                  width={cW}
                  height={cH}
                  style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
                >
                  {/* Top ruler — horizontal inch marks */}
                  {Array.from({ length: Math.ceil(doc.widthIn) + 1 }).map((_, i) => {
                    const x = i * PX;
                    return (
                      <g key={`rt${i}`}>
                        <line
                          x1={x}
                          y1={0}
                          x2={x}
                          y2={i % 5 === 0 ? 6 : 3}
                          stroke={doc.palette.primary}
                          strokeWidth={0.5}
                          opacity={0.55}
                        />
                        {i % 5 === 0 && i > 0 && i < doc.widthIn && (
                          <text
                            x={x + 1}
                            y={10}
                            fontSize={4}
                            fill={doc.palette.primary}
                            opacity={0.55}
                            fontFamily="ui-monospace, monospace"
                          >
                            {i}"
                          </text>
                        )}
                      </g>
                    );
                  })}
                  {/* Half-inch minor ticks along top */}
                  {Array.from({ length: Math.ceil(doc.widthIn * 2) + 1 }).map((_, i) => {
                    if (i % 2 === 0) return null;
                    const x = (i * PX) / 2;
                    return (
                      <line
                        key={`rth${i}`}
                        x1={x}
                        y1={0}
                        x2={x}
                        y2={2}
                        stroke={doc.palette.primary}
                        strokeWidth={0.4}
                        opacity={0.35}
                      />
                    );
                  })}
                  {/* Left ruler — vertical inch marks */}
                  {Array.from({ length: Math.ceil(doc.heightIn) + 1 }).map((_, i) => {
                    const y = i * PX;
                    return (
                      <g key={`rl${i}`}>
                        <line
                          x1={0}
                          y1={y}
                          x2={i % 5 === 0 ? 6 : 3}
                          y2={y}
                          stroke={doc.palette.primary}
                          strokeWidth={0.5}
                          opacity={0.55}
                        />
                        {i % 5 === 0 && i > 0 && i < doc.heightIn && (
                          <text
                            x={1}
                            y={y + 3}
                            fontSize={4}
                            fill={doc.palette.primary}
                            opacity={0.55}
                            fontFamily="ui-monospace, monospace"
                          >
                            {i}"
                          </text>
                        )}
                      </g>
                    );
                  })}
                  {/* Half-inch minor ticks along left */}
                  {Array.from({ length: Math.ceil(doc.heightIn * 2) + 1 }).map((_, i) => {
                    if (i % 2 === 0) return null;
                    const y = (i * PX) / 2;
                    return (
                      <line
                        key={`rlh${i}`}
                        x1={0}
                        y1={y}
                        x2={2}
                        y2={y}
                        stroke={doc.palette.primary}
                        strokeWidth={0.4}
                        opacity={0.35}
                      />
                    );
                  })}
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
                  justInserted={justInsertedId === b.id}
                  onSelect={setSelectedId}
                  onPointerDown={onPointerDown}
                  didDragRef={didDragRef}
                  onUpdate={updateBlock}
                  onDelete={deleteBlock}
                  titleOverflowPx={titleOverflowPx}
                  isOutOfBounds={oobBlockIds.has(b.id)}
                />
              ))}
              {sidebarTab === 'check' && selectedBlock?.type !== 'image' && (
                <FigureSizeOverlay
                  rect={checkFigureRect}
                  onChange={setCheckFigureRect}
                  canvasWidth={cW}
                  canvasHeight={cH}
                  zoom={zoom}
                />
              )}
            </div>
          </div>
        </div>
        </div>
      </div>

        {/* OOB warning banner — outside the scroll container so it
            stays anchored to the visible viewport even when the
            user has scrolled the pasteboard. */}
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
              pointerEvents: 'none',
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

      {/* Animated guidelines wrapper — mirrors the Sidebar pattern so
          the right-side panel collapses with the same width transition
          instead of unmounting abruptly. The inner GuidelinesPanel no
          longer early-returns on !open. Same `display: flex` +
          `minHeight: 0` load-bearing combo as the sidebar wrapper so
          the inside panel's own scroll container bounds correctly. */}
      <div
        style={{
          flex: '0 0 auto',
          width: guidelinesOpen ? 320 : 0,
          minWidth: guidelinesOpen ? 320 : 0,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
          transition:
            'width 280ms cubic-bezier(0.22, 1, 0.36, 1), min-width 280ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <GuidelinesPanel open={guidelinesOpen} onToggle={() => setGuidelinesOpen((v) => !v)} />
      </div>

      {/* Show guidelines toggle when panel is closed.
          Positioned bottom-right instead of top-right so it doesn't
          collide with the AutosaveStatusPill (which also lives in the
          top-right corner). The ZoomBar is centered horizontally at
          the bottom, so bottom-right is free real estate. */}
      {!guidelinesOpen && (
        <button
          title="Show poster guidelines"
          onClick={() => setGuidelinesOpen(true)}
          style={{
            all: 'unset',
            position: 'fixed',
            bottom: 16,
            right: 16,
            width: 40,
            height: 40,
            borderRadius: 10,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
            background: '#1a1a26',
            border: '1px solid #2a2a3a',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            zIndex: 20,
            transition: 'color 120ms, border-color 120ms, background 120ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.borderColor = '#7c6aed';
            e.currentTarget.style.background = '#1e1e2e';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#9ca3af';
            e.currentTarget.style.borderColor = '#2a2a3a';
            e.currentTarget.style.background = '#1a1a26';
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

// =========================================================================
// FigureSizeOverlay — gray draggable/resizable rectangle on the canvas
// =========================================================================
//
// Rendered inside #poster-canvas while the Check tab is active and no
// image block is selected. Lets the user see and adjust the figure
// dimensions the readability analyzer is computing against, instead of
// staring at an invisible hardcoded 10"×7" default.
//
// The rect is stored in poster units (same coordinate system as blocks).
// Drag converts screen pixel deltas to poster units via `/ zoom` just
// like `useBlockDrag` does, then snaps to the grid so the overlay lines
// up with the rest of the canvas. Resize is only enabled from the
// bottom-right corner — a full 8-handle resize would add UI noise for
// a feature whose only job is "give me a ballpark figure size".

interface FigureSizeOverlayProps {
  rect: { x: number; y: number; w: number; h: number };
  onChange: (rect: { x: number; y: number; w: number; h: number }) => void;
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
}

function FigureSizeOverlay({
  rect,
  onChange,
  canvasWidth,
  canvasHeight,
  zoom,
}: FigureSizeOverlayProps) {
  // Share drag state across pointer handlers via a ref — same pattern
  // useBlockDrag uses. Avoids the re-render thrash that state-driven
  // pointer tracking would introduce.
  const dragRef = useRef<{
    mode: 'move' | 'resize';
    sx: number;
    sy: number;
    orig: { x: number; y: number; w: number; h: number };
  } | null>(null);

  const startDrag = (e: React.PointerEvent, mode: 'move' | 'resize') => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      mode,
      sx: e.clientX,
      sy: e.clientY,
      orig: { ...rect },
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = dragRef.current;
    if (!s) return;
    const dx = (e.clientX - s.sx) / zoom;
    const dy = (e.clientY - s.sy) / zoom;
    if (s.mode === 'move') {
      const nx = snap(Math.max(0, Math.min(canvasWidth - s.orig.w, s.orig.x + dx)));
      const ny = snap(Math.max(0, Math.min(canvasHeight - s.orig.h, s.orig.y + dy)));
      onChange({ ...s.orig, x: nx, y: ny });
    } else {
      // Enforce minimum 20×20 (2"×2") so the overlay can't collapse
      // into an un-grabbable sliver. Also clamp to canvas right/bottom.
      const nw = snap(Math.max(20, Math.min(canvasWidth - s.orig.x, s.orig.w + dx)));
      const nh = snap(Math.max(20, Math.min(canvasHeight - s.orig.y, s.orig.h + dy)));
      onChange({ ...s.orig, w: nw, h: nh });
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore — pointer may have already been released
    }
  };

  const widthIn = (rect.w / PX).toFixed(1);
  const heightIn = (rect.h / PX).toFixed(1);

  return (
    <div
      data-postr-figure-size-overlay
      className="postr-overlay-enter"
      onPointerDown={(e) => startDrag(e, 'move')}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        // Translucent gray fill + dashed accent border so it's
        // obviously *temporary UI*, distinct from a real block.
        background: 'rgba(100, 110, 130, 0.18)',
        border: '2px dashed #7c6aed',
        borderRadius: 3,
        cursor: 'move',
        boxSizing: 'border-box',
        zIndex: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'none',
      }}
    >
      <div
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 9,
          fontWeight: 700,
          color: '#fff',
          background: 'rgba(30, 30, 46, 0.88)',
          padding: '4px 8px',
          borderRadius: 4,
          border: '1px solid #7c6aed',
          pointerEvents: 'none',
          textAlign: 'center',
          lineHeight: 1.3,
          letterSpacing: 0.3,
        }}
      >
        FIGURE PREVIEW
        <div style={{ fontSize: 11, fontWeight: 800, marginTop: 1 }}>
          {widthIn}&quot; × {heightIn}&quot;
        </div>
        <div style={{ fontSize: 7, fontWeight: 400, marginTop: 2, opacity: 0.7 }}>
          drag to move · corner to resize
        </div>
      </div>
      {/* Bottom-right resize handle */}
      <div
        onPointerDown={(e) => startDrag(e, 'resize')}
        style={{
          position: 'absolute',
          right: -1,
          bottom: -1,
          width: 14,
          height: 14,
          background: '#7c6aed',
          border: '1.5px solid #fff',
          borderRadius: 2,
          cursor: 'nwse-resize',
          touchAction: 'none',
        }}
      />
    </div>
  );
}
