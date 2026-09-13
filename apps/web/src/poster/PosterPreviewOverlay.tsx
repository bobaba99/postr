/**
 * PosterPreviewOverlay — the full-screen, chromeless poster view behind
 * Export → "👁 Preview poster".
 *
 * ── Why this is a component and not a branch in PosterEditor ──────
 * It used to be an `if (previewMode) { return … }` early return inside
 * `PosterEditor`. That shape caused four separate defects, and every
 * one of them is a consequence of *replacing* the editor tree rather
 * than *layering over* it:
 *
 *   1. A TDZ `ReferenceError` — the branch sat above the `const`s its
 *      JSX read (`sortedRefs`, `headingNumbers`, `printPoster`), so it
 *      threw "Cannot access 'sortedRefs' before initialization" on any
 *      poster with at least one block. Preview never worked, from the
 *      day it was written (e9952ef, 2026-04-10).
 *   2. A Rules-of-Hooks violation — 26 hooks are called after the old
 *      branch position, so toggling preview changed the hook count.
 *   3. Print from preview produced a poster with **no images**.
 *      `printPoster` clones `#poster-canvas` out of the live DOM;
 *      unmounting and remounting the editor resets `useStorageUrl`
 *      state to `null`, and it re-resolves signed URLs asynchronously,
 *      so a synchronous clone captured 1×1 placeholder GIFs instead of
 *      every uploaded figure and logo.
 *   4. Canvas zoom died after one preview round trip. The pinch/wheel
 *      effect (and three ResizeObservers) capture `canvasRef.current`
 *      with `[canvasRef]` in their deps — a stable ref *object*, so
 *      they never re-subscribe when the node is destroyed and rebuilt.
 *      Their listeners stayed on a detached node for the rest of the
 *      session.
 *
 * Rendering as an overlay from the editor's single return fixes all
 * four at once: no early return (so no TDZ and no hook-count change),
 * and the canvas is never unmounted (so images stay resolved and every
 * subscription keeps its live node). It is also why `onPrint` needs no
 * `flushSync` — `#poster-canvas` is still mounted underneath.
 *
 * Keep it that way. If this ever goes back to replacing the tree, all
 * four defects come back together.
 *
 * The editor behind is hidden with `display: none` + `inert` rather
 * than unmounted, so it keeps its DOM, its state and its listeners
 * while staying out of the accessibility tree and the tab order.
 */
import { useEffect, useState } from 'react';
import type { Block, PosterDoc } from '@postr/shared';
import { BlockFrame } from './blocks';
import { POSTER_SIZES, type PosterSizeKey } from './constants';
import type { CitationStyleKey } from './citations';

export interface PosterPreviewOverlayProps {
  doc: PosterDoc;
  /** Canvas width/height in CSS px at natural scale. */
  cW: number;
  cH: number;
  /** Resolved CSS font-family stack for the poster's font. */
  fontFamily: string;
  sortedRefs: PosterDoc['references'];
  citationStyle: CitationStyleKey;
  headingNumbers: Record<string, number>;
  titleOverflowPx: number;
  /** Shared with the editor so BlockFrame's drag guard behaves identically. */
  didDragRef: React.MutableRefObject<boolean>;
  sizeKey: PosterSizeKey;
  paletteName: string;
  onExit: () => void;
  onPrint: () => void;
}

/** Margin between the poster and the viewport edge, in CSS px. */
const VIEWPORT_GUTTER = 80;

/** SSR-safe viewport read; the fallbacks match the editor's own defaults. */
function readViewport(): { w: number; h: number } {
  if (typeof window === 'undefined') return { w: 1440, h: 900 };
  return { w: window.innerWidth, h: window.innerHeight };
}

export function PosterPreviewOverlay({
  doc,
  cW,
  cH,
  fontFamily,
  sortedRefs,
  citationStyle,
  headingNumbers,
  titleOverflowPx,
  didDragRef,
  sizeKey,
  paletteName,
  onExit,
  onPrint,
}: PosterPreviewOverlayProps) {
  // Escape is what every full-screen overlay trains people to press,
  // and this one had no keyboard exit at all.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onExit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onExit]);

  // The scale is derived from the viewport, so it has to be recomputed
  // when the viewport changes — previously it was captured once at mount
  // and the poster kept its original size through any window resize.
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    const onResize = () => setViewport(readViewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const previewScale = Math.min(
    (viewport.w - VIEWPORT_GUTTER) / cW,
    (viewport.h - VIEWPORT_GUTTER) / cH,
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Poster preview"
      data-postr-preview
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
          {doc.blocks.map((b: Block) => (
            <BlockFrame
              key={b.id}
              block={b}
              palette={doc.palette}
              fontFamily={fontFamily}
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
          onClick={onExit}
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
          onClick={onPrint}
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
          {POSTER_SIZES[sizeKey]!.label} · {doc.fontFamily} · {paletteName || 'Custom'}
        </span>
      </div>
    </div>
  );
}

