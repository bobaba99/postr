// Probe: what does the editor's sanitizer (the one every text commit runs
// through) keep from the markup the format toolbar's buttons produce?
// Read-only against the repo copy at main f554eaa. Run:
//   cd apps/web && npx tsx ../../docs/launch/mvp-editor/probes/inventory-probe-sanitize.mts
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const { JSDOM } = req('jsdom');
const dom = new JSDOM('<!doctype html><body></body>');
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).DOMParser = dom.window.DOMParser;
(globalThis as any).Node = dom.window.Node;
(globalThis as any).NodeFilter = dom.window.NodeFilter;

const { sanitizeHtml } = await import(
  '../../../../apps/web/src/poster/sanitizeHtml.ts'
);

// Markup shapes the toolbar emits (FloatingFormatToolbar.tsx): A+/A- wrap the
// selection in <span style="font-size:1.06em|0.94em"> (bumpFontSize, :91-104),
// its fallback is execCommand('fontSize') which emits <font size="4">;
// Chrome's justifyCenter wraps in <div style="text-align: center;">.
const cases: Array<[string, string]> = [
  ['A+ span (bumpFontSize)', 'Hello <span style="font-size: 1.06em;">big</span> world'],
  ['A- span (bumpFontSize)', 'Hello <span style="font-size: 0.94em;">small</span> world'],
  ['A+ fallback execCommand fontSize', 'Hello <font size="4">big</font> world'],
  ['justifyCenter (Chrome div)', '<div style="text-align: center;">centred</div>'],
  ['justifyRight (align attr)', '<div align="right">right</div>'],
  ['bold', 'Hello <b>bold</b>'],
  ['text colour', 'Hello <span style="color: rgb(239, 68, 68);">red</span>'],
  ['highlight', 'Hello <span style="background-color: rgba(255, 235, 59, 0.4);">hl</span>'],
  ['bullet list', '<ul><li>one</li><li>two</li></ul>'],
  ['pasted Word font-size+family', '<span style="font-family: Calibri; font-size: 11pt;">pasted</span>'],
];
for (const [name, html] of cases) {
  const out = sanitizeHtml(html);
  console.log(`${name}\n  in : ${html}\n  out: ${out}\n`);
}
