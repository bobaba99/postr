/**
 * Colophon stress harness — renders the print document at every poster
 * size so the acknowledgement line can be reviewed at real proportions.
 *
 * `buildPrintDocument` is a pure `inputs -> string` function, which is
 * the whole reason it was extracted from PosterEditor. That makes this
 * harness possible without a browser, a Supabase session, or a poster:
 * we synthesise a representative canvas and let the real print
 * stylesheet do the rest.
 *
 * Usage:  npx tsx apps/web/scripts/colophon-stress.ts <outDir>
 *
 * Each size produces one HTML file. Open them in a browser (or
 * screenshot them) and check the two things that matter:
 *   1. the colophon sits inside the bottom margin band, never over content
 *   2. it reads as a credit at every size — neither a billboard nor invisible
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildPrintDocument } from '../src/export/printDocument';
import { POSTER_SIZES, PX, M } from '../src/poster/constants';

const outDir = process.argv[2] ?? 'colophon-stress';
mkdirSync(outDir, { recursive: true });

/**
 * A canvas whose content runs right up to the margin band, so any
 * colophon that escapes the band lands visibly on top of text rather
 * than in empty space. A forgiving fixture would hide the defect.
 */
function canvasHtml(wIn: number, hIn: number): string {
  const w = wIn * PX;
  const h = hIn * PX;
  const bodyTop = M + 26;
  const bodyH = h - bodyTop - M; // content fills everything down to the band
  const colW = (w - M * 2 - 12) / 2;

  const block = (x: number, y: number, bw: number, bh: number, label: string, size: number) => `
    <div style="position:absolute;left:${x}px;top:${y}px;width:${bw}px;height:${bh}px;
                font-size:${size}px;line-height:1.35;color:#1a1a26;overflow:hidden;
                outline:0.4px solid rgba(124,106,237,0.35);">
      <strong style="font-size:${size * 1.4}px">${label}</strong><br/>
      ${'Sample body copy at the readability floor. '.repeat(26)}
    </div>`;

  return `<div id="poster-canvas" style="position:relative;width:${w}px;height:${h}px;background:#ffffff;">
    <div style="position:absolute;left:${M}px;top:${M}px;width:${w - M * 2}px;height:22px;
                font-size:18px;font-weight:800;color:#1a1a26;">
      Diagnostic Utility of the FTLD Module — ${wIn}in x ${hIn}in
    </div>
    ${block(M, bodyTop, colW, bodyH, 'Background', 3.2)}
    ${block(M + colW + 12, bodyTop, colW, bodyH, 'Results', 3.2)}
    <!-- A marker exactly at the top of the 1in bottom margin band. Anything
         the colophon paints ABOVE this line is overlapping real content. -->
    <div style="position:absolute;left:0;top:${h - M}px;width:${w}px;height:0;
                border-top:0.6px dashed #d33;"></div>
  </div>`;
}

/**
 * Every sheet is rendered to the SAME on-screen width. That is the
 * point: it normalises away absolute size so what you are comparing is
 * the colophon's size RELATIVE to its poster — which is exactly the
 * property the adaptive geometry is supposed to control. Screenshots
 * taken at different widths would be unreadable as a comparison.
 */
const PREVIEW_W = 1100;

function withPreviewScale(html: string, wIn: number): string {
  const naturalW = wIn * PX;
  const zoom = PREVIEW_W / naturalW;
  // Injected as the last rule so it wins on the screen view only; the
  // @media print block is untouched, so this cannot affect real output.
  return html.replace(
    '</style>',
    `  /* harness-only: normalise the screen preview width */
  .print-stage { padding: 90px 20px 40px !important; }
  #poster-print-root { zoom: ${zoom.toFixed(4)}; }
</style>`,
  );
}

const rows: string[] = [];
for (const [key, size] of Object.entries(POSTER_SIZES)) {
  const html = buildPrintDocument({
    widthIn: size.w,
    heightIn: size.h,
    px: PX,
    fontFamily: 'Source Sans 3',
    fontHref: 'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;700&display=swap',
    bgColor: '#ffffff',
    title: `${key} — colophon stress`,
    canvasHtml: canvasHtml(size.w, size.h),
    attribution: {},
  });
  const safe = key.replace(/[^\w.-]/g, '_');
  const file = join(outDir, `${safe}.html`);
  writeFileSync(file, withPreviewScale(html, size.w), 'utf-8');
  rows.push(`${key.padEnd(8)} ${String(size.w).padStart(5)} x ${String(size.h).padEnd(5)} in  ->  ${file}`);
}

// eslint-disable-next-line no-console
console.log(rows.join('\n'));
