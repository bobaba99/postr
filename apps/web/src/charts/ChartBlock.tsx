/**
 * ChartBlock — renders a chart block's ChartSpec to SVG on the
 * poster canvas.
 *
 * The chart is a live object: it re-renders when the poster palette
 * or font changes and scales losslessly through both export paths
 * (html-to-image and window.print) because the output is a single
 * inline <svg> with a viewBox.
 *
 * Observable Plot stays lazy — the first chart block on a poster
 * triggers the import; posters without charts never load it.
 */
import { useEffect, useRef, useState } from 'react';
import type { Block, Palette } from '@postr/shared';
import { PX, POINTS_PER_UNIT } from '@/poster/constants';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { renderChart } from './renderChart';

interface ChartBlockProps {
  block: Block;
  palette: Palette;
  /** Resolved CSS font-family string (same as text blocks receive). */
  fontFamily: string;
}

type Status = 'loading' | 'ready' | 'error';

export function ChartBlock({ block, palette, fontFamily }: ChartBlockProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const openFeedback = useFeedbackStore((s) => s.open);
  const spec = block.chartSpec ?? null;

  useEffect(() => {
    if (!spec) {
      setStatus('error');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    renderChart(spec, {
      palette,
      fontFamily,
      widthPx: Math.max(120, Math.round(block.w * PX)),
      heightPx: Math.max(90, Math.round(block.h * PX)),
      pxPerPt: PX / POINTS_PER_UNIT,
    })
      .then((svg) => {
        if (cancelled || !hostRef.current) return;
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
  }, [spec, palette, fontFamily, block.w, block.h]);

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
