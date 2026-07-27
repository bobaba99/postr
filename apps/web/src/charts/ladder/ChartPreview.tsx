/**
 * ChartPreview — renders one candidate spec as a live SVG preview.
 * Previews render at the natural print-legible size and scale down
 * via the svg viewBox, so what the user sees is exactly what the
 * poster (or download) will contain.
 */
import { useEffect, useRef, useState } from 'react';
import type { ChartSpec, Palette } from '@postr/shared';
import { renderChart } from '../renderChart';
import { PREVIEW_THEME_BASE } from '../download';
import { BusyIndicator, busyProps } from '@/components/BusyIndicator';

interface ChartPreviewProps {
  spec: ChartSpec;
  palette: Palette;
  fontFamily: string;
}

/**
 * Reserve the preview's eventual height while it renders. Without
 * this the card is 0px tall until the SVG lands and the whole ladder
 * jumps — worse than a spinner. 800×560 is PREVIEW_THEME_BASE.
 */
const ASPECT = PREVIEW_THEME_BASE.heightPx / PREVIEW_THEME_BASE.widthPx;

export function ChartPreview({ spec, palette, fontFamily }: ChartPreviewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  // Starts true: renderChart is async (Plot is dynamically imported and
  // a large series takes real time), so there is always at least one
  // frame with nothing to show. That frame gets the skeleton.
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setRendering(true);
    renderChart(spec, { ...PREVIEW_THEME_BASE, palette, fontFamily })
      .then((svg) => {
        if (cancelled || !hostRef.current) return;
        svg.style.width = '100%';
        svg.style.height = 'auto';
        svg.style.display = 'block';
        hostRef.current.replaceChildren(svg);
        setRendering(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setRendering(false);
      });
    return () => {
      cancelled = true;
    };
  }, [spec, palette, fontFamily]);

  return (
    <div style={{ width: '100%' }} {...busyProps(rendering)}>
      <div
        ref={hostRef}
        style={{ width: '100%', display: rendering || failed ? 'none' : undefined }}
      />
      {rendering && (
        <div
          style={{
            width: '100%',
            aspectRatio: `${PREVIEW_THEME_BASE.widthPx} / ${PREVIEW_THEME_BASE.heightPx}`,
            minHeight: 120,
            background: '#f1efe9',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            boxSizing: 'border-box',
          }}
        >
          <BusyIndicator
            inline
            tone="#6e6a62"
            label="Drawing the figure…"
            style={{ fontSize: 12 }}
          />
        </div>
      )}
      {failed && (
        <div
          style={{
            padding: 16,
            fontSize: 13,
            color: '#8a8a95',
            textAlign: 'center',
            minHeight: Math.round(120 * ASPECT),
          }}
        >
          Something went wrong rendering this preview.
        </div>
      )}
    </div>
  );
}
