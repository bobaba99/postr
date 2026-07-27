/**
 * Print-window document builder — the HTML shell `printPoster` writes
 * into the popup it opens.
 *
 * Extracted from PosterEditor as a pure `inputs → string` function so
 * the printed sheet is TESTABLE: the attribution colophon must land in
 * the bottom margin, and the poster's `@page` size, canvas dimensions,
 * and block positions must be provably unchanged by it.
 *
 * No DOM access here — the caller passes the already-cloned canvas
 * markup. Keeping it pure is what lets the test assert on the exact
 * printed geometry.
 */
import { attributionPrintCss, attributionPrintHtml, type AttributionOptions } from './attribution';

export interface PrintDocumentInput {
  /** Poster width in inches — drives `@page size` verbatim. */
  widthIn: number;
  /** Poster height in inches — drives `@page size` verbatim. */
  heightIn: number;
  /** Internal coordinate scale (poster units per inch). */
  px: number;
  /** Poster font family, already validated by the curated font list. */
  fontFamily: string;
  /** Google Fonts stylesheet URL for `fontFamily`. */
  fontHref: string;
  /** Poster background color (CSS). */
  bgColor: string;
  /** Display title, with angle brackets already stripped by the caller. */
  title: string;
  /** `outerHTML` of the cloned, overlay-stripped `#poster-canvas`. */
  canvasHtml: string;
  /** Paid-plan seam — see export/attribution.ts. */
  attribution?: AttributionOptions;
}

/**
 * Build the complete print-window document.
 *
 * The colophon is a sibling overlay INSIDE `#poster-print-root`,
 * absolutely positioned against the print root's bottom-left. It is
 * not part of the canvas, does not participate in its layout, and
 * cannot shift a block: `#poster-canvas` keeps its own explicit
 * width/height and every block keeps its absolute coordinates.
 */
export function buildPrintDocument(input: PrintDocumentInput): string {
  const {
    widthIn: w,
    heightIn: h,
    px,
    fontFamily,
    fontHref,
    bgColor,
    title,
    canvasHtml,
  } = input;
  const naturalW = w * px;
  const naturalH = h * px;
  const printZoom = 96 / px; // 9.6 at PX=10 → true 96 CSS-px/inch

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${title} — Print</title>
<!--
  Only the poster's own family. This used to request all ten curated
  families, which cost ~560ms of CSS plus ten woff2 downloads before
  the print dialog could paint — the editor was fixed to lazy-load a
  single family but the print window kept the old blanket URL.

  Safe because a poster has exactly one font: PosterDoc.fontFamily is
  document-level, there is no per-block or per-style override, and
  sanitizeHtml's ALLOWED_STYLE_PROPS is limited to color and
  background-color, so inline rich text cannot introduce another
  family. If a per-block font is ever added, this must go back to
  collecting the distinct set of families in use.
-->
<link href="${fontHref}" rel="stylesheet" />
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
    font-family: '${fontFamily}', system-ui, -apple-system, sans-serif;
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
${attributionPrintCss(input.attribution)}

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
  <div id="poster-print-root">${canvasHtml}${attributionPrintHtml(input.attribution)}</div>
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
</html>`;
}
