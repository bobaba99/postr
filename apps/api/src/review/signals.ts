/**
 * Deterministic grounding signals (spec §4.4) — hard numbers computed
 * from the PosterDoc so the model cannot misjudge emphasis load or
 * figure/text balance. Pure regex/string parsing, NO DOM (the API has no
 * `document`); the tag-strip mirrors the web's
 * academicMarkdown.stripHtmlToPlainText, re-implemented here because
 * apps/api cannot import web code. This is the readability.ts pattern:
 * small pure parser, exact-value tests.
 *
 * Block classification over the PosterDoc BlockType union:
 *   figure  = 'image' | 'chart'   ('logo' is chrome, not content)
 *   table   = 'table'
 *   text    = 'text'   (prose — title/heading/authors/references are
 *                       structural: excluded from the ratio, but their
 *                       words still count in totalWordCount)
 */

export interface SignalBlock {
  id: string;
  type: string;
  content?: string | null;
}

export interface ReviewSignals {
  emphasisRunCount: number;
  boldRuns: number;
  italicRuns: number;
  highlightRuns: number;
  figureBlockCount: number;
  tableBlockCount: number;
  textBlockCount: number;
  totalWordCount: number;
  figureToTextRatio: number;
}

/**
 * Opening tags only — each emphasis run is one opener. Editor emphasis is
 * <b>/<strong>/<i>/<em>/<mark> wrappers (apps/web/src/poster/blocks.tsx);
 * inline-style emphasis is not counted (Stage 1 judges colour and size
 * visually anyway). `(?=[\s>])` keeps `<b>` from matching `<br>`/`<body>`.
 */
const BOLD_RE = /<(?:b|strong)(?=[\s>])[^>]*>/gi;
const ITALIC_RE = /<(?:i|em)(?=[\s>])[^>]*>/gi;
const HIGHLIGHT_RE = /<mark(?=[\s>])[^>]*>/gi;
const TAG_RE = /<[^>]+>/g;

function countMatches(re: RegExp, html: string): number {
  return (html.match(re) ?? []).length;
}

/**
 * Tag-strip + entity decode. Near-parity with the web's
 * stripHtmlToPlainText, with one deliberate deviation: a space is first
 * inserted between adjacent tags (`>\s*<` → `> <`) so words on either
 * side of an element boundary stay separate tokens
 * (`four.</p><p>Five` counts as two words, not one `four.Five`), while
 * punctuation hugging an inline tag stays attached (`seven</mark>.`
 * stays `seven.`).
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/>\s*</g, '> <')
    .replace(TAG_RE, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function computeReviewSignals(blocks: SignalBlock[]): ReviewSignals {
  let boldRuns = 0;
  let italicRuns = 0;
  let highlightRuns = 0;
  let figureBlockCount = 0;
  let tableBlockCount = 0;
  let textBlockCount = 0;
  let totalWordCount = 0;

  for (const block of blocks) {
    const html = block.content ?? '';
    boldRuns += countMatches(BOLD_RE, html);
    italicRuns += countMatches(ITALIC_RE, html);
    highlightRuns += countMatches(HIGHLIGHT_RE, html);
    totalWordCount += countWords(htmlToPlainText(html));
    if (block.type === 'image' || block.type === 'chart') figureBlockCount++;
    else if (block.type === 'table') tableBlockCount++;
    else if (block.type === 'text') textBlockCount++;
  }

  return {
    emphasisRunCount: boldRuns + italicRuns + highlightRuns,
    boldRuns,
    italicRuns,
    highlightRuns,
    figureBlockCount,
    tableBlockCount,
    textBlockCount,
    totalWordCount,
    // Figures per prose block; the denominator is floored at 1 so an
    // all-figure poster returns its figure count instead of Infinity.
    figureToTextRatio: figureBlockCount / Math.max(textBlockCount, 1),
  };
}
