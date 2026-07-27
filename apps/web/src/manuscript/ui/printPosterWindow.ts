/**
 * Print window for the standalone manuscript-to-poster page.
 *
 * Same industry-standard approach as the editor's print flow: clone
 * the natural-size poster DOM into a fresh window with an exact
 * `@page` size and zero margin, wait for fonts, then print. Kept as a
 * separate lean module because the standalone page has no editor
 * overlays to strip and no preview toolbar to build.
 */
import type { PosterDoc } from '@postr/shared';
import { PX } from '../../poster/constants';
import { googleFontsUrl } from '../../poster/fontLoading';

export interface PrintPosterOptions {
  /** The natural-size PosterStatic container element. */
  container: HTMLElement;
  doc: PosterDoc;
  title: string;
}

/** Opens the print window. Returns false when the popup was blocked so
 *  the caller can show its own hint. */
export function openPosterPrintWindow({
  container,
  doc,
  title,
}: PrintPosterOptions): boolean {
  const w = doc.widthIn;
  const h = doc.heightIn;
  const naturalW = w * PX;
  const naturalH = h * PX;
  const printZoom = 96 / PX; // true 96 CSS-px per inch

  const printWin = window.open('', '_blank', 'width=900,height=700');
  if (!printWin) return false;

  const safeTitle = title.replace(/[<>]/g, '');
  const clone = container.cloneNode(true) as HTMLElement;

  printWin.document.open();
  printWin.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${safeTitle} — Print</title>
<link href="${googleFontsUrl(doc.fontFamily)}" rel="stylesheet" />
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
  }
  #poster-print-root {
    width: ${naturalW}px;
    height: ${naturalH}px;
    background: ${doc.palette.bg};
    position: relative;
    overflow: hidden;
    margin: 24px auto;
    box-shadow: 0 12px 60px rgba(0, 0, 0, 0.6);
  }
  @media print {
    html, body {
      background: white !important;
      width: ${w}in !important;
      height: ${h}in !important;
    }
    #poster-print-root {
      position: fixed !important;
      left: 0 !important;
      top: 0 !important;
      zoom: ${printZoom};
      margin: 0 !important;
      box-shadow: none !important;
    }
  }
</style>
</head>
<body>
<div id="poster-print-root">${clone.outerHTML}</div>
<script>
(function(){
  var printed = false;
  function doPrint() {
    if (printed) return;
    printed = true;
    try { window.focus(); } catch (e) {}
    setTimeout(function(){ window.print(); }, 150);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(doPrint).catch(doPrint);
  } else if (document.readyState === 'complete') {
    setTimeout(doPrint, 500);
  } else {
    window.addEventListener('load', function(){ setTimeout(doPrint, 500); });
  }
})();
</script>
</body>
</html>`);
  printWin.document.close();
  return true;
}
