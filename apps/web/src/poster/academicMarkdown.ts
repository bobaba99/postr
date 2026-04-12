/**
 * academicMarkdown — light-touch formatter for table cells + notes.
 *
 * Academic posters use a small set of text conventions that cross
 * disciplines:
 *
 *   - `**bold**`  → <strong>
 *   - `*italic*`  → <em>
 *   - `_italic_`  → <em>
 *   - `^super^`   → <sup>
 *   - `~sub~`     → <sub>
 *   - `word*`, `word†`, `word‡`, `word§`, `word¶`, `word#`
 *     (standalone footnote markers attached to a preceding word)
 *     → auto-superscripted
 *
 * Plain text like `p < .05`, `M (SD)`, `df` passes through unchanged.
 *
 * Design note:
 * The poster editor's table cells are contentEditable divs populated
 * via `dangerouslySetInnerHTML`. Trying to auto-format on every
 * keystroke fought the caret, paste handler, and selection state in
 * complicated ways (the user asked for a code-check-style
 * "format-on-demand" flow instead). So this module exports a pure
 * text→HTML function that TableEditor's "Format" button runs across
 * every cell + the note field as a ONE-SHOT conversion. No live
 * re-parsing, no contentEditable gymnastics.
 *
 * The parser is deliberately conservative: it HTML-escapes input
 * first (to prevent script injection), then peels off a finite set
 * of recognized spans. Anything it doesn't recognize stays as
 * literal text.
 */

/** HTML-escape text so user input can't inject tags. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Pair-delimited spans, ordered outer-first so `**x**` isn't
// parsed as two `*x*` spans. Each entry has a regex tested on the
// ESCAPED string (so `&amp;` inside `**foo**` still matches).
const INLINE_PATTERNS: Array<{ re: RegExp; tag: string }> = [
  { re: /\*\*([^*]+?)\*\*/, tag: 'strong' },
  { re: /\*([^*\s][^*]*?)\*/, tag: 'em' },
  { re: /_([^_\s][^_]*?)_/, tag: 'em' },
  { re: /\^([^\s^]+?)\^/, tag: 'sup' },
  { re: /~([^\s~]+?)~/, tag: 'sub' },
];

// Standalone footnote markers that auto-superscript when attached
// to a word. `M (SD)*` → `M (SD)<sup>*</sup>`. Double markers
// (`**`, `††`, `‡‡`) are supported too.
const SUPER_MARKER = '(?:\\*{1,2}|†{1,2}|‡{1,2}|§|¶|#)';
const SUPER_RE = new RegExp(
  `([A-Za-z0-9.,)\\]}])(${SUPER_MARKER})(?=\\s|$|[)\\]},.])`,
  'g',
);

/**
 * Convert a plain-text string with academic-markdown markers into
 * an HTML string suitable for `dangerouslySetInnerHTML`. Safe
 * against script injection because the input is HTML-escaped
 * first — only the recognized markers get replaced with tags.
 */
export function academicMarkdownToHtml(raw: string): string {
  if (!raw) return '';
  let s = escapeHtml(raw);

  // Peel pair-delimited patterns one span at a time. Each pass
  // rewrites the FIRST matching span in `s`, then we loop until
  // no patterns match. Capped at 100 passes so a pathological
  // input can't hang the loop.
  let guard = 0;
  while (guard < 100) {
    guard += 1;
    let replaced = false;
    for (const { re, tag } of INLINE_PATTERNS) {
      const next = s.replace(re, (_m, inner: string) => `<${tag}>${inner}</${tag}>`);
      if (next !== s) {
        s = next;
        replaced = true;
        break;
      }
    }
    if (!replaced) break;
  }

  // Auto-superscript footnote markers attached to a word.
  s = s.replace(SUPER_RE, (_m, word: string, marker: string) => `${word}<sup>${marker}</sup>`);

  return s;
}

/**
 * Strip HTML back to plain text. Used when the Format button re-runs
 * on a cell that already contains HTML tags from a previous format
 * pass — we want the second press to be idempotent, not produce
 * `<sup><sup>*</sup></sup>`. Drops every tag and unescapes the few
 * entities we introduced.
 */
export function stripHtmlToPlainText(html: string): string {
  if (!html) return '';
  const withoutTags = html.replace(/<[^>]+>/g, '');
  return withoutTags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Does this string look like it already has academic-markdown
 * HTML applied? Used by the Format button to flag when a pass is
 * a no-op (so we can show a friendly "nothing to format" toast).
 */
export function hasAcademicMarkup(html: string): boolean {
  return /<(strong|em|sup|sub)\b/.test(html);
}
