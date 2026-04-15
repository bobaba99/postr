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

// -----------------------------------------------------------------
// APA stats auto-italicization
// -----------------------------------------------------------------
// APA 7 italicizes statistical symbols when they appear in running
// text: `p < .05`, `t(29) = 2.4`, `M = 4.1`, `F(2, 30) = 8.2`.
// We detect the symbol when it's followed by whitespace + an
// operator (=, <, >, ≤, ≥, ≈) or an opening paren (the df form).
// Standalone cells that contain *only* a symbol also get italicized
// — common for table headers like `M`, `SD`, `p`.
//
// Multi-char symbols (SD, SE, Mdn, df, R², χ², η², ω²) are sorted
// longest-first so they win against their single-char prefixes.

const STAT_SYMBOLS = [
  'Mdn', 'SD', 'SE', 'df',
  'R²', 'χ²', 'η²', 'ω²',
  'p', 't', 'F', 'M', 'N', 'n', 'r', 'R', 'z', 'd', 'g', 'β', 'U', 'H', 'Q',
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const STAT_ALT = STAT_SYMBOLS
  .slice()
  .sort((a, b) => b.length - a.length)
  .map(escapeRegex)
  .join('|');

// Inline context: symbol followed by (optional space) + operator or (.
// Runs on PLAIN text (before HTML escape) so `<`, `>` are literal here.
const STAT_INLINE_RE = new RegExp(
  `(^|[^A-Za-zα-ωΑ-Ω])(${STAT_ALT})(?=\\s*[=<>≤≥≈~(])`,
  'g',
);

// Standalone: the whole trimmed plain-text equals just the symbol.
const STAT_STANDALONE_RE = new RegExp(`^(${STAT_ALT})$`);

// Placeholder chars — picked from U+0000/U+0001 so they can never
// appear in user text and they survive HTML-escape unchanged.
const EM_OPEN = '\u0001';
const EM_CLOSE = '\u0002';

/**
 * Wrap APA stat symbols with placeholder tokens in PLAIN text.
 * Called before HTML escape so angle brackets in `p < .05` are
 * still literal `<` at match time. Placeholders are swapped for
 * real `<em>` tags after escape.
 */
function italicizeStatsPlain(plain: string): string {
  if (!plain) return '';
  return plain.replace(
    STAT_INLINE_RE,
    (_m, pre: string, sym: string) => `${pre}${EM_OPEN}${sym}${EM_CLOSE}`,
  );
}

/**
 * Swap placeholder tokens for real `<em>` tags. Safe to run on
 * already-escaped HTML because the tokens are non-printable and
 * never appear in HTML escape output.
 */
function materializeEmPlaceholders(escaped: string): string {
  return escaped.split(EM_OPEN).join('<em>').split(EM_CLOSE).join('</em>');
}

/**
 * Auto-format a text field for APA style: strip any prior HTML,
 * tokenize stat symbols, then run the markdown escape+peel pass,
 * then materialize tokens back into `<em>` tags. Idempotent:
 * re-running on already-formatted content reproduces the same
 * output because we strip first.
 *
 * Handles the common "cell contains only a stat symbol" case by
 * wrapping the whole cell.
 */
export function autoFormatAPA(raw: string): string {
  const plain = stripHtmlToPlainText(raw).trim();
  if (!plain) return '';
  // Standalone symbol cell — e.g., a column header that's just `M`.
  if (STAT_STANDALONE_RE.test(plain)) {
    return `<em>${escapeHtml(plain)}</em>`;
  }
  const tokenized = italicizeStatsPlain(stripHtmlToPlainText(raw));
  const withMarkup = academicMarkdownToHtml(tokenized);
  return materializeEmPlaceholders(withMarkup);
}
