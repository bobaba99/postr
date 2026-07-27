/**
 * SVG + PNG downloads for the standalone chart chooser.
 *
 * Downloads re-render the spec fresh at the shared preview size
 * rather than scraping the on-screen preview — deterministic output,
 * independent of viewport. PNG rasterizes at 2× for crispness.
 *
 * Phase 1 formats: SVG + PNG. PDF is an open question in the plan
 * (possibly redundant with the poster export path) and deliberately
 * not built.
 */
import type { ChartSpec, Palette } from '@postr/shared';
import { renderChart } from './renderChart';
import type { ChartTheme } from './plotOptions';

/**
 * Base render geometry shared by previews and downloads. 800×560 at
 * the editor's px-per-pt keeps text at the same printed proportions
 * as an inserted chart block.
 */
export const PREVIEW_THEME_BASE: Omit<ChartTheme, 'palette' | 'fontFamily'> = {
  widthPx: 800,
  heightPx: 560,
  pxPerPt: 10 / 7.2,
};

export async function chartToSvgString(
  spec: ChartSpec,
  palette: Palette,
  fontFamily: string,
): Promise<string> {
  const svg = await renderChart(spec, { ...PREVIEW_THEME_BASE, palette, fontFamily });
  // Standalone SVG files need explicit namespaces and a white
  // background rect (transparent renders black in some viewers).
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const rect = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('width', '100%');
  rect.setAttribute('height', '100%');
  rect.setAttribute('fill', '#ffffff');
  svg.insertBefore(rect, svg.firstChild);
  return new XMLSerializer().serializeToString(svg);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a beat to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function downloadChartSvg(
  spec: ChartSpec,
  palette: Palette,
  fontFamily: string,
  filename: string,
): Promise<void> {
  const text = await chartToSvgString(spec, palette, fontFamily);
  triggerDownload(new Blob([text], { type: 'image/svg+xml' }), filename);
}

export async function downloadChartPng(
  spec: ChartSpec,
  palette: Palette,
  fontFamily: string,
  filename: string,
  scale = 2,
): Promise<void> {
  const text = await chartToSvgString(spec, palette, fontFamily);
  const svgBlob = new Blob([text], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('chart image failed to load'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((image.naturalWidth || PREVIEW_THEME_BASE.widthPx) * scale);
    canvas.height = Math.round((image.naturalHeight || PREVIEW_THEME_BASE.heightPx) * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png encode failed'))), 'image/png');
    });
    triggerDownload(blob, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}
