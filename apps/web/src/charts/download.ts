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
import { zipSync } from 'fflate';
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

export async function chartToPngBlob(
  spec: ChartSpec,
  palette: Palette,
  fontFamily: string,
  scale = 2,
): Promise<Blob> {
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
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png encode failed'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadChartPng(
  spec: ChartSpec,
  palette: Palette,
  fontFamily: string,
  filename: string,
  scale = 2,
): Promise<void> {
  triggerDownload(await chartToPngBlob(spec, palette, fontFamily, scale), filename);
}

/** One figure destined for a multi-figure download. */
export interface ChartDownloadEntry {
  spec: ChartSpec;
  /** Entry filename inside the zip, e.g. "figure-A-bar-chart.svg". */
  filename: string;
}

/**
 * Bundle several figures into one `.zip` rather than firing N
 * downloads. Browsers throttle or block rapid successive downloads
 * and the user gets an unordered pile of files either way; a single
 * archive with predictable entry names is the honest shape for a
 * multi-select result.
 *
 * Rendering is sequential on purpose — each render mounts a detached
 * SVG and the previews are already competing for the same main
 * thread; a Promise.all over ten specs just makes the tab jank.
 */
export async function downloadChartsZip(
  entries: readonly ChartDownloadEntry[],
  palette: Palette,
  fontFamily: string,
  kind: 'svg' | 'png',
  zipFilename: string,
  scale = 2,
): Promise<void> {
  if (entries.length === 0) throw new Error('no figures selected');

  const files: Record<string, Uint8Array> = {};
  for (const entry of entries) {
    if (kind === 'svg') {
      const text = await chartToSvgString(entry.spec, palette, fontFamily);
      files[entry.filename] = new TextEncoder().encode(text);
    } else {
      const blob = await chartToPngBlob(entry.spec, palette, fontFamily, scale);
      // PNG is already deflated; storing it again wastes CPU for ~0%.
      files[entry.filename] = new Uint8Array(await blob.arrayBuffer());
    }
  }

  const zipped = zipSync(files, { level: kind === 'png' ? 0 : 6 });
  const buf = zipped.buffer.slice(
    zipped.byteOffset,
    zipped.byteOffset + zipped.byteLength,
  ) as ArrayBuffer;
  triggerDownload(new Blob([buf], { type: 'application/zip' }), zipFilename);
}
