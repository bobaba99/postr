/**
 * A copy or a cut of superscript or subscript text alone (record
 * docs/fixes/39-text-editing.md §9, review round 1, R1-F1; rule T3: sub- and
 * superscript survive a copy between blocks).
 *
 * Chromium and WebKit write a selection that lies inside one <sup> or <sub>
 * as a bare <span> with a computed style, and the page's base style
 * (Tailwind's preflight draws sub and sup with `vertical-align: baseline`)
 * gives that style no raise: the "2" of H<sup>2</sup>O copied alone was
 * pasted as a plain 2 (MEASURED, scripts/keep-work-check.mjs TE3i, in
 * Chromium and WebKit; Firefox writes <sup>2</sup>). A selection that
 * reaches outside it keeps it (the engines then write the <sup> element),
 * and bold, italic and underline are written as elements by all three
 * (TE3ik clean before this change).
 *
 * So for such a selection the editor writes the clipboard itself: the
 * selected contents inside copies of the formatting elements around them
 * (the sup or sub, and a b, i or u with it), and their text. Every other
 * copy and cut stays the browser's own.
 */
import { coveredTexts, offsetsIn, pointIn, tidy } from './scriptFormat';

/** The inline formats the sanitizer keeps (sanitizeHtml.ts): copied around the selected piece. */
const INLINE = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'MARK', 'SPAN', 'SUB', 'SUP']);

export interface ScriptedCopy {
  html: string;
  text: string;
}

/** The text of `node`, a <br> as a line break. */
function plainOf(node: Node): string {
  let out = '';
  const walk = (n: Node) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === Node.TEXT_NODE) out += (c as Text).data;
      else if (c.nodeType === Node.ELEMENT_NODE && (c as Element).tagName === 'BR') out += '\n';
      else walk(c);
    }
  };
  walk(node);
  return out;
}

/**
 * What to put on the clipboard for `range` in `host` when every selected
 * character lies inside one <sup> or <sub> below the host; null otherwise
 * (the browser's own copy keeps the formats).
 */
export function scriptedCopy(host: HTMLElement, range: Range): ScriptedCopy | null {
  if (range.collapsed || !host.contains(range.commonAncestorContainer)) return null;
  const texts = coveredTexts(host, range);
  const first = texts[0];
  const last = texts[texts.length - 1];
  if (!first || !last) return null;
  // The selected characters only (a selection that ends at the start of the
  // next text node covers none of it).
  const tight = host.ownerDocument.createRange();
  tight.setStart(first, first === range.startContainer ? range.startOffset : 0);
  tight.setEnd(last, last === range.endContainer ? range.endOffset : last.data.length);
  const wraps: Element[] = [];
  for (let n: Node | null = tight.commonAncestorContainer; n && n !== host; n = n.parentNode) {
    if (n.nodeType === Node.ELEMENT_NODE && INLINE.has((n as Element).tagName)) wraps.push(n as Element);
  }
  if (!wraps.some((el) => el.tagName === 'SUP' || el.tagName === 'SUB')) return null;
  let piece: Node = tight.cloneContents();
  for (const el of wraps) {
    const outer = el.cloneNode(false);
    outer.appendChild(piece);
    piece = outer;
  }
  const box = host.ownerDocument.createElement('div');
  box.appendChild(piece);
  return { html: box.innerHTML, text: plainOf(box) };
}

/**
 * Delete `range` from `host` for a cut the editor took: a sup or sub left
 * empty goes, and the caret stays where the text was.
 */
export function deleteIn(host: HTMLElement, range: Range) {
  const { start } = offsetsIn(host, range);
  range.deleteContents();
  tidy(host);
  const sel = host.ownerDocument.getSelection();
  if (!sel) return;
  const caret = host.ownerDocument.createRange();
  caret.setStart(...pointIn(host, start, 'start'));
  caret.collapse(true);
  sel.removeAllRanges();
  sel.addRange(caret);
}
