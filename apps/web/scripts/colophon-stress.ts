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
import { LAYOUT_TEMPLATES } from '../src/poster/templates';

const outDir = process.argv[2] ?? 'colophon-stress';
// Which layout to render. The default is the WORST case, not the
// default template: a gate should be run against the layout most likely
// to expose the defect, and `sidebar` runs 42.6u past the band top.
const layout = process.argv[3] ?? 'sidebar';
mkdirSync(outDir, { recursive: true });

/**
 * A canvas built from a REAL layout template.
 *
 * The first version of this harness synthesised two body columns that
 * stopped exactly at the margin band, and called that hostile. It was
 * not — it was more forgiving than the shipped defaults. Measured at
 * 48x36, the real templates put their lowest block bottom at:
 *
 *     3col      342.2   (7.8u of slack above the band top)
 *     2col      371.6   (21.6u PAST the band top, 11.6u off the sheet)
 *     billboard 374.1   (24.1u past, 14.1u off the sheet)
 *     sidebar   392.6   (42.6u past, 32.6u off the sheet)
 *
 * So a gate built on the synthetic fixture goes green while a user who
 * picks Sidebar still gets the credit line on their references. Render
 * what ships instead.
 */
function canvasHtml(wIn: number, hIn: number, layout: string): string {
  const w = wIn * PX;
  const h = hIn * PX;
  const tpl = (LAYOUT_TEMPLATES as Record<string, { build: (a: number, b: number) => Array<Record<string, unknown>> }>)[layout];
  const blocks = tpl.build(wIn, hIn);

  // Render each block the way blocks.tsx does, NOT at its stored height.
  // The first version of this harness drew every block at `height: b.h`
  // with `overflow: hidden`. That is not what the editor renders and not
  // what prints: `printPoster` clones the live #poster-canvas with its
  // inline `height: auto` intact, so the PDF carries RENDERED geometry.
  // Measuring overlap against stored boxes therefore measured a poster
  // nobody ever sees.
  const GROWS = new Set(['title', 'text', 'references', 'authors']);
  const TIGHT_FLOOR = new Set(['title', 'authors']);

  const body = blocks
    .map((b) => {
      const x = Number(b.x), y = Number(b.y), bw = Number(b.w), bh = Number(b.h);
      const type = String(b.type);
      const size = type === 'title' ? 5.5 : type === 'heading' ? 3.4 : 2.6;
      const grows = GROWS.has(type) || type === 'heading';
      // A filled template, not an empty one: enough copy to occupy about
      // the height the template reserved. An empty block collapses to its
      // minHeight and would understate every overlap.
      const perLine = Math.max(8, Math.floor(bw / (size * 0.5)));
      const lines = Math.max(1, Math.floor(bh / (size * 1.3)));
      const filler = type === 'title' || type === 'heading'
        ? String(b.content ?? '') || type
        : 'Sample body copy at the readability floor. '.repeat(
            Math.max(1, Math.ceil((perLine * lines) / 44)),
          );
      const heightCss = grows
        ? `height:auto;min-height:${TIGHT_FLOOR.has(type) ? 6 : 12}px;overflow:visible;`
        : `height:${bh}px;overflow:hidden;`;
      return `<div data-block-id="${String(b.id)}" data-block-type="${type}"
        style="position:absolute;left:${x}px;top:${y}px;width:${bw}px;${heightCss}
        font-size:${size}px;line-height:1.3;color:#1a1a26;
        outline:0.4px solid rgba(124,106,237,0.35);">
        <strong>${String(b.content ?? '') || type}</strong> ${filler}
      </div>`;
    })
    .join('');

  return `<div id="poster-canvas" style="position:relative;width:${w}px;height:${h}px;background:#ffffff;">
    ${body}
    <!-- Top of the 1in bottom margin band. Anything the colophon paints
         ABOVE this line is in the region blocks are allowed to occupy. -->
    <div style="position:absolute;left:0;top:${h - M}px;width:${w}px;height:0;
                border-top:0.6px dashed #d33;"></div>
  </div>`;
}

/**
 * Every sheet is rendered to the SAME on-screen width. That is the
 * point: it normalises away absolute size so what you compare is the
 * colophon's size RELATIVE to its poster — the property the adaptive
 * geometry controls. Screenshots at different widths would be
 * unreadable as a comparison.
 *
 * NOTE this is a SCREEN-view aid only. The real print size comes from
 * the `@media print` block's own `zoom: 96/PX`, which this does not
 * touch — but because this rule is emitted after that block at equal
 * specificity, it WOULD win under print emulation. Do not screenshot
 * these files with `media: 'print'` and expect production geometry.
 */
const PREVIEW_W = 1100;

function withPreviewScale(html: string, wIn: number): string {
  const naturalW = wIn * PX;
  const zoom = PREVIEW_W / naturalW;
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
    title: `${key} — ${layout} — colophon stress`,
    canvasHtml: canvasHtml(size.w, size.h, layout),
    attribution: {},
  });
  const safe = key.replace(/[^\w.-]/g, '_');
  const file = join(outDir, `${safe}.html`);
  writeFileSync(file, withPreviewScale(html, size.w), 'utf-8');
  rows.push(`${key.padEnd(8)} ${String(size.w).padStart(5)} x ${String(size.h).padEnd(5)} in  ->  ${file}`);
}

// eslint-disable-next-line no-console
console.log(rows.join('\n'));
