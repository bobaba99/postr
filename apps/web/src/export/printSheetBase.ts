/**
 * The editor's base styles for the sheet, restated for the print window
 * (record docs/fixes/30-one-print-path.md, cause B).
 *
 * "⎙ Save PDF" copies the editor's sheet (`#poster-canvas`) into a page of
 * its own. The copy keeps every inline style, but not what the editor's
 * stylesheet and the editor around the sheet give it: Tailwind's base
 * (preflight), index.css's list rules, and what the sheet inherits (the
 * page's line height of 1.5, its font, its text rendering). Without them a
 * table printed up to 3.2 in shorter than the editor draws it, an authors
 * block 0.07 in taller in Firefox, formatted text with lists broken into
 * other lines, and an empty figure's "+ Upload figure" wrapped differently
 * (MEASURED, scripts/print-path-check.mjs BASE, POS and WRAP, three
 * engines). The reasons, read from the computed styles: a table cell has no
 * line height of its own (1.5 × its font in the editor, "normal" in print)
 * and its borders do not collapse; a superscript has preflight's line
 * height of 0 only in the editor.
 *
 * So the print window restates, for its sheet only, each rule of the
 * editor's stylesheet that matches something on the sheet, word for word,
 * and the values the sheet inherits in the editor. The harness's BASE claim
 * reads the editor's own stylesheet and fails when a rule that matches the
 * sheet is not restated here, so a rule added to index.css or a Tailwind
 * upgrade shows up there. Left out on purpose: motion (transitions,
 * animations), Tailwind's custom properties (read by utility classes the
 * sheet does not use), the out-of-bounds colouring (`data-postr-oob`, the
 * editor's warning, not the poster) and Observable Plot's own rules (a
 * <style> inside each chart's svg, copied with it).
 *
 * Scoped to the sheet, so the print window's toolbar and the credit line
 * beside the sheet are laid out as before.
 */

/** The print window's sheet: the copied `#poster-canvas` in its root. */
export const PRINT_SHEET = '#poster-print-root > #poster-canvas';

/** Each part of a selector list, scoped to the sheet's descendants. */
const scoped = (selectors: string): string =>
  selectors
    .split(',')
    .map((s) => `${PRINT_SHEET} ${s.trim()}`)
    .join(',\n  ');

/** [selector list as in the editor's stylesheet, declarations]. */
const RULES: ReadonlyArray<readonly [string, string]> = [
  // Tailwind preflight (tailwindcss 3.4), the rules that match the sheet.
  ['b, strong', 'font-weight: bolder;'],
  ['sub, sup', 'font-size: 75%; line-height: 0; position: relative; vertical-align: baseline;'],
  ['sub', 'bottom: -0.25em;'],
  ['sup', 'top: -0.5em;'],
  ['table', 'text-indent: 0; border-color: inherit; border-collapse: collapse;'],
  [
    'button, input, optgroup, select, textarea',
    'font-family: inherit; font-feature-settings: inherit; font-variation-settings: inherit; font-size: 100%; font-weight: inherit; line-height: inherit; letter-spacing: inherit; color: inherit; margin: 0; padding: 0;',
  ],
  ['button, select', 'text-transform: none;'],
  [
    'button, input:where([type="button"]), input:where([type="reset"]), input:where([type="submit"])',
    '-webkit-appearance: button; appearance: button; background-color: transparent; background-image: none;',
  ],
  ['button, [role="button"]', 'cursor: pointer;'],
  ['ol, ul, menu', 'list-style: none; margin: 0; padding: 0;'],
  ['img, svg, video, canvas, audio, iframe, embed, object', 'display: block; vertical-align: middle;'],
  ['img, video', 'max-width: 100%; height: auto;'],
  // index.css: lists inside blocks keep their bullets and indent.
  ['[data-block-id] ul, [data-block-id] ol', 'list-style: revert; padding-left: 1.2em; margin: 0.25em 0;'],
  ['[data-block-id] li', 'list-style: revert; display: list-item;'],
];

/**
 * The stylesheet text: what the sheet inherits in the editor (Tailwind's
 * `html` line height 1.5, tab size 4 and font settings, index.css's body
 * text rendering and smoothing, the editor's own font at 16 px), preflight's
 * universal rule (which also matches the sheet itself), then RULES.
 */
export function printSheetBaseCss(): string {
  return [
    `${PRINT_SHEET} {
  font-family: 'DM Sans', system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  tab-size: 4;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}`,
    `${PRINT_SHEET},
  ${scoped('*, ::before, ::after')} {
  box-sizing: border-box; border-width: 0; border-style: solid; border-color: #e5e7eb;
}`,
    ...RULES.map(([sel, css]) => `${scoped(sel)} {\n  ${css}\n}`),
  ].join('\n');
}
