/**
 * What a paste puts into the poster's text: the poster's style wins
 * (bounded-designs.md §3.3 A; fix 32, docs/fixes/32-table-paste.md).
 *
 * Kept: bold, italic, underline, strikethrough, sub, sup, lists and line
 * breaks (the sanitizer's tags, sanitizeHtml.ts). Dropped: the source's
 * font and size (the sanitizer never kept them) and, since fix 32, its
 * text colour and highlight (`style` attributes and `<mark>`), on paste
 * only: text already stored keeps its colours. Also dropped since fix 32,
 * because they are not text the source shows:
 *   - a style sheet, a script, the page's title and head (Google Sheets,
 *     Excel and Word put a style sheet on the clipboard; the sanitizer
 *     unwraps an element it does not allow, so the sheet's CSS was pasted
 *     as words, MEASURED in three engines, scripts/table-paste-check.mjs
 *     F-text-sheets);
 *   - a `<b>` or `<strong>` whose own style says it is not bold (Google
 *     Docs wraps a whole paste in `<b style="font-weight:normal">`, which
 *     drew the paste bold, F-text-docs). The style is read by property
 *     name: Word writes its bold as `<b style='mso-bidi-font-weight:
 *     normal'>` (the weight of right-to-left text), which a pattern looking
 *     for "font-weight: normal" anywhere in the style matched, so Word's
 *     bold was dropped (record 32 section 9, R1-F1);
 *   - the line wraps and indents of the source's markup: a run of
 *     whitespace is one space and none is drawn at a line's start or end,
 *     as HTML draws it, except where the source keeps its whitespace
 *     (`<pre>`, or `white-space: pre-wrap` as Google Docs writes) or where
 *     the plain text shows the HTML's text exactly as written (an engine's
 *     copy of text drawn pre-wrap: Firefox's copy of a field's own text is
 *     the bare text, with no style to say so, and reading it as drawn lost
 *     a Shift+Enter line and a double space copied from one block to
 *     another, MEASURED, record 32 section 9). Every field draws its text
 *     pre-wrap, so a wrap in Word's HTML source, or in a page Firefox
 *     copied, was stored as a line break (R1-F3).
 */
import { sanitizeHtml } from './sanitizeHtml';

/** Elements whose text is not text the source shows. */
const NOT_SHOWN = 'style, script, template, title, head, meta, link';

/** A weight that is not bold: normal, lighter, or a number up to 500. */
const NOT_BOLD = /^(?:normal|lighter|[1-5]00)$/;

/** Elements that start and end a line as HTML draws them (whitespace beside them is not drawn). */
const LINE_EDGE = /^(?:P|DIV|H[1-6]|LI|UL|OL|DL|DT|DD|TABLE|TBODY|THEAD|TFOOT|TR|TD|TH|CAPTION|BLOCKQUOTE|PRE|SECTION|ARTICLE|HEADER|FOOTER|ADDRESS|FIGURE|FIGCAPTION|BR)$/;

/** Replace `el` with its children. */
function unwrap(el: Element) {
  el.replaceWith(...Array.from(el.childNodes));
}

/** Escape plain text for HTML (the characters markup is made of). */
export function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The value a style attribute's last declaration of `prop` gives, in lower
 * case and without `!important`; null when it declares none. The property
 * is matched by its whole name, so `mso-bidi-font-weight` is not
 * `font-weight`.
 */
function styleValue(style: string | null, prop: string): string | null {
  let value: string | null = null;
  for (const rule of (style ?? '').split(';')) {
    const at = rule.indexOf(':');
    if (at > 0 && rule.slice(0, at).trim().toLowerCase() === prop) {
      value = rule.slice(at + 1).replace(/!\s*important\s*$/i, '').trim().toLowerCase();
    }
  }
  return value;
}

/**
 * Whether the source draws the whitespace in `el` as written: the nearest
 * element whose own style declares `white-space` decides (anything but
 * normal and nowrap keeps it; Google Docs' spans say pre-wrap), else a
 * `<pre>` around it.
 */
function keepsWhitespace(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    const ws = styleValue(e.getAttribute('style'), 'white-space');
    if (ws) return ws !== 'normal' && ws !== 'nowrap';
    if (e.tagName === 'PRE') return true;
  }
  return false;
}

/**
 * The whitespace of the source's markup as HTML draws it, in place: a run
 * is one space, and none at the start or end of a line (beside a block's
 * edge or a `<br>`). Text whose source keeps its whitespace is left as it
 * is, and is a line's content.
 */
function collapseSourceWhitespace(root: Element) {
  const texts: Array<{ node: Text; kept: boolean } | 'edge'> = [];
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child as Text;
        const kept = keepsWhitespace(text.parentElement);
        if (!kept) text.data = text.data.replace(/[ \t\n\r\f]+/g, ' ');
        texts.push({ node: text, kept });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const edge = LINE_EDGE.test((child as Element).tagName);
        if (edge) texts.push('edge');
        walk(child);
        if (edge) texts.push('edge');
      }
    }
  };
  walk(root);
  // A space at a line's start goes (forward), then one at its end (backward).
  const trim = (order: typeof texts, cut: (s: string) => string) => {
    let atEdge = true;
    for (const t of order) {
      if (t === 'edge') { atEdge = true; continue; }
      if (!t.kept && atEdge) t.node.data = cut(t.node.data);
      if (t.node.data !== '') atEdge = false;
    }
  };
  trim(texts, (s) => s.replace(/^ /, ''));
  trim([...texts].reverse(), (s) => s.replace(/ $/, ''));
}

/** The text under `root` as written, with a line end for each `<br>` and at each line-edge element's start and end. */
function writtenText(root: Element): string {
  let out = '';
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) out += (child as Text).data;
      else if (child.nodeType === Node.ELEMENT_NODE) {
        const lineEnd = LINE_EDGE.test((child as Element).tagName) ? '\n' : '';
        out += lineEnd;
        walk(child);
        out += lineEnd;
      }
    }
  };
  walk(root);
  return out;
}

/** Text compared by its spaces and its lines: a line end, or a tab between cells, as one `\n`; blank lines and the ends aside. */
const byLines = (s: string) => s.replace(/\r\n?|\t/g, '\n').replace(/\n+/g, '\n').trim();

/**
 * The clipboard's HTML parsed as the document it is (so a `<head>` stays
 * one), without what it does not show, its whitespace read as drawn unless
 * the plain text (`text`, the engine's rendering of the copy) shows the
 * HTML's text with its spaces and line breaks as written.
 */
export function parsePasted(html: string, text = ''): Document {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(NOT_SHOWN).forEach((el) => el.remove());
  const written = byLines(writtenText(doc.body));
  if (!written || !byLines(text).includes(written)) collapseSourceWhitespace(doc.body);
  return doc;
}

/**
 * The content of `root`, an element of a parsePasted document, cleaned for
 * the poster: a copy without the source's colours and its not-bold `<b>`,
 * run through the sanitizer with a line break (or, in a one-line field, a
 * space) where a paragraph ended.
 */
export function cleanPastedContent(root: Element, multiline: boolean): string {
  const copy = root.cloneNode(true) as Element;
  copy.querySelectorAll('b, strong').forEach((el) => {
    if (NOT_BOLD.test(styleValue(el.getAttribute('style'), 'font-weight') ?? '')) unwrap(el);
  });
  copy.querySelectorAll('mark').forEach(unwrap);
  copy.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'));
  return sanitizeHtml(copy.innerHTML, { blockSeparator: multiline ? '<br>' : ' ' });
}

/** The source's HTML, cleaned for the poster (`text`: the clipboard's plain text, parsePasted). */
export function cleanPastedHtml(html: string, multiline: boolean, text = ''): string {
  return cleanPastedContent(parsePasted(html, text).body, multiline);
}

/** The HTML a paste inserts: the clipboard's HTML cleaned, or else its plain text. */
export function pastedHtml(html: string, text: string, multiline: boolean): string {
  if (html) return cleanPastedHtml(html, multiline, text);
  return sanitizeHtml(escapeText(text), { blockSeparator: multiline ? '<br>' : ' ' });
}
