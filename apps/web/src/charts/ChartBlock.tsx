/**
 * ChartBlock — renders a chart block's ChartSpec to SVG on the
 * poster canvas.
 *
 * The chart is a live object: it re-renders when the poster palette
 * or font changes and scales losslessly through both export paths
 * (html-to-image and window.print) because the output is a single
 * inline <svg> with a viewBox.
 *
 * It is drawn at the box its host is laid out in (plan item 13 part 2):
 * the block less the frame's border, less a side caption's share, the
 * chart's own height when a caption sits under it. At that size the
 * viewBox maps 10 render px to one poster unit, so the text prints at the
 * size renderChart drew it. Drawn at the block's stored size instead, the
 * svg was scaled down to the smaller box and every text with it.
 *
 * When even the minimum text sizes do not fit the box's height (a long
 * legend or long category labels in a small block), the chart reports the
 * least height it takes (`onMinHeight`, poster units) and BlockFrame grows
 * the block to it, as it grows for a caption, rather than let the svg be
 * scaled down below the minimums (fix 13c review Q-R1).
 *
 * Observable Plot stays lazy — the first chart block on a poster
 * triggers the import; posters without charts never load it.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Block, Palette } from '@postr/shared';
import { PX, POINTS_PER_UNIT } from '@/poster/constants';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { renderChartLaidOut } from './renderChart';

interface ChartBlockProps {
  block: Block;
  palette: Palette;
  /** Resolved CSS font-family string (same as text blocks receive). */
  fontFamily: string;
  /**
   * The least height, in poster units, the chart takes at the minimum
   * text sizes at its current width. BlockFrame grows the chart's box to
   * it when the block is shorter. (A box the layout rounds a hair short of
   * it shows the chart a hair smaller: its floor sits PRINT_HEADROOM above
   * the minimums for that.)
   */
  onMinHeight?: (units: number) => void;
}

type Status = 'loading' | 'ready' | 'error';

/**
 * The content box `ref` is laid out in, in poster units (CSS px on the
 * sheet, before its zoom transform), as the browser reports it after
 * layout; null until it has. A box of zero (the editor hidden behind
 * Export › Preview poster, whose Print copies the hidden sheet) keeps the
 * last one, so the chart is not redrawn for a box it is not shown in.
 */
function useLaidOutBox(ref: RefObject<HTMLDivElement | null>): { w: number; h: number } | null {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver((entries) => {
      const r = entries[entries.length - 1]?.contentRect;
      if (!r || r.width <= 0 || r.height <= 0) return;
      setBox({ w: r.width, h: r.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return box;
}

/** A font family's name as a FontFace reports it: unquoted, lower case. */
const familyName = (f: string) => f.trim().replace(/^['"]|['"]$/g, '').toLowerCase();

/**
 * A count that goes up each time a face of `fontFamily` finishes loading.
 * The chart measures its text in the font the page has when it draws
 * (textMeasure.ts, which waits up to 3 s for it); drawn before the
 * poster's font arrived, it is drawn again once it has, so its layout is
 * measured in the font it shows.
 */
function useFontLoads(fontFamily: string): number {
  const [loads, setLoads] = useState(0);
  useEffect(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts || typeof fonts.addEventListener !== 'function') return;
    const families = fontFamily.split(',').map(familyName);
    const onDone = (e: Event) => {
      const faces = (e as Event & { fontfaces?: ReadonlyArray<{ family: string }> }).fontfaces ?? [];
      if (faces.some((f) => families.includes(familyName(f.family)))) setLoads((n) => n + 1);
    };
    fonts.addEventListener('loadingdone', onDone);
    return () => fonts.removeEventListener('loadingdone', onDone);
  }, [fontFamily]);
  return loads;
}

export function ChartBlock({ block, palette, fontFamily, onMinHeight }: ChartBlockProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const openFeedback = useFeedbackStore((s) => s.open);
  const spec = block.chartSpec ?? null;
  const laidOut = useLaidOutBox(hostRef);
  // With no layout to report (no ResizeObserver, or a host not laid out:
  // jsdom, a hidden tree), the stored size, as before.
  const box = laidOut ?? { w: block.w, h: block.h };
  const known = laidOut !== null;
  const fontLoads = useFontLoads(fontFamily);
  // Read through a ref: a new callback from the parent is no reason to redraw.
  const onMinHeightRef = useRef(onMinHeight);
  onMinHeightRef.current = onMinHeight;

  useEffect(() => {
    if (!spec) {
      setStatus('error');
      return;
    }
    // In a laid-out page the box comes from the observer, which reports it
    // right after layout: wait for it rather than draw first at the stored
    // size (in WebKit that first draw landed, so every chart was drawn twice
    // as the editor opened).
    if (!known && hostRef.current && hostRef.current.offsetWidth > 0 && typeof ResizeObserver === 'function') return;
    let cancelled = false;
    // A chart already on screen stays there while it redraws for a new box
    // (a resize, a selected frame's wider border): no loading flash.
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    renderChartLaidOut(spec, {
      palette,
      fontFamily,
      widthPx: Math.max(120, box.w * PX),
      heightPx: Math.max(90, box.h * PX),
      pxPerPt: PX / POINTS_PER_UNIT,
    })
      .then(({ svg, minHeightPx }) => {
        if (cancelled || !hostRef.current) return;
        onMinHeightRef.current?.(minHeightPx / PX);
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.display = 'block';
        hostRef.current.replaceChildren(svg);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [spec, palette, fontFamily, box.w, box.h, known, fontLoads]);

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 0, position: 'relative' }}>
      <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
      {status !== 'ready' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            border: '2px dashed #c9c6c0',
            borderRadius: 4,
            color: '#8a8a95',
            fontSize: 16,
            textAlign: 'center',
            padding: 12,
            background: 'transparent',
          }}
        >
          {status === 'loading' ? (
            <span>Rendering chart…</span>
          ) : (
            <>
              <span>Something went wrong rendering this chart.</span>
              <button
                type="button"
                onClick={() => openFeedback('bug', { title: 'Chart failed to render' })}
                style={{
                  border: '1px solid #c9c6c0',
                  borderRadius: 6,
                  background: 'transparent',
                  color: '#6b6b76',
                  padding: '4px 10px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Send Feedback
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
