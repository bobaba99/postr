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

interface ChartPreviewProps {
  spec: ChartSpec;
  palette: Palette;
  fontFamily: string;
}

export function ChartPreview({ spec, palette, fontFamily }: ChartPreviewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    renderChart(spec, { ...PREVIEW_THEME_BASE, palette, fontFamily })
      .then((svg) => {
        if (cancelled || !hostRef.current) return;
        svg.style.width = '100%';
        svg.style.height = 'auto';
        svg.style.display = 'block';
        hostRef.current.replaceChildren(svg);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [spec, palette, fontFamily]);

  return (
    <div style={{ width: '100%' }}>
      <div ref={hostRef} style={{ width: '100%' }} />
      {failed && (
        <div style={{ padding: 16, fontSize: 13, color: '#8a8a95', textAlign: 'center' }}>
          Something went wrong rendering this preview.
        </div>
      )}
    </div>
  );
}
