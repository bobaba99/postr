/**
 * Slash-command matching + insertion logic, shared between
 * SmartTextarea (plain <textarea>) and SmartText (contentEditable).
 *
 * The two surfaces differ in how they measure caret position:
 *   - textarea: textarea.selectionStart
 *   - contentEditable: DOM Range walking
 *
 * But the rules for "is there an active slash prefix?" and "how do
 * I replace /prefix with a symbol" are the same on both, so the
 * pure helpers live here and each surface plugs in its own caret
 * adapter. Keeping the logic centralized means a bug fix in one
 * place fixes both surfaces at once.
 */
import { SYMBOLS } from './symbols';

export interface SlashMatch {
  /** Text before the slash (passes through unchanged on insert). */
  before: string;
  /** The matched `/prefix` literal, including the slash. */
  literal: string;
  /** The prefix after the slash (e.g. `"al"` for `/al`). May be ''. */
  prefix: string;
}

/**
 * Look at the text to the left of the caret and decide whether an active
 * slash command is in progress: a `/` at the start of a word, then letters
 * and digits up to the caret. Returns null otherwise.
 *
 * "At the start of a word" (record docs/fixes/39-text-editing.md, the MVP
 * design doc bounded-designs.md §3.2): the `/` is the first character of
 * the text, or follows a space (any white space, a no-break space
 * included) or a line break. Pass the text with its line breaks as "\n"
 * (`textBeforeCaretByLine`): a line typed after Enter starts a word. A `/`
 * inside a word is just a slash: "n/a", "mg/kg", "w/", "μg/d" and
 * "see Fig. 2/" open no menu (before, the menu opened on `/` anywhere and
 * Enter took its first entry: "n/a" + Enter gave "nα", MEASURED in record
 * 39 §4).
 */
export function matchSlashAtCaret(textBeforeCaret: string): SlashMatch | null {
  const m = textBeforeCaret.match(/(?:^|\s)(\/([a-zA-Z0-9]*))$/);
  if (!m || m[1] === undefined) return null;
  const literal = m[1];
  return {
    before: textBeforeCaret.substring(0, textBeforeCaret.length - literal.length),
    literal,
    prefix: m[2] ?? '',
  };
}

/** Elements that start a line of their own in an editing host. */
const LINE_TAGS = new Set(['DIV', 'P', 'LI', 'UL', 'OL']);

/**
 * The text of `root` from its start to the caret, a line break (a <br>, or
 * the start of a line the browser made a <div>, <p> or list item for) as
 * "\n". Null when the selection is not in `root`. Its length can differ
 * from the caret's character offset (`Range.toString` has no line breaks);
 * only its end is read, for the match.
 */
export function textBeforeCaretByLine(root: Node): string | null {
  const sel = root.ownerDocument?.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const caret = sel.getRangeAt(0);
  if (!root.contains(caret.startContainer)) return null;
  const pre = root.ownerDocument!.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(caret.startContainer, caret.startOffset);
  let out = '';
  const walk = (node: Node) => {
    for (let n = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === Node.TEXT_NODE) {
        out += (n as Text).data;
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        const tag = (n as Element).tagName;
        if (tag === 'BR') {
          out += '\n';
          continue;
        }
        if (LINE_TAGS.has(tag) && out !== '' && !out.endsWith('\n')) out += '\n';
        walk(n);
      }
    }
  };
  walk(pre.cloneContents());
  return out;
}

/**
 * Given the full text, a caret position, and a symbol key, produce
 * the replacement string and new caret position. Returns null if
 * there is no active slash token at the caret.
 */
export function applySymbolInsertion(
  text: string,
  caret: number,
  symbolKey: string,
): { text: string; caret: number } | null {
  const sym = SYMBOLS[symbolKey];
  if (!sym) return null;
  const match = matchSlashAtCaret(text.substring(0, caret));
  if (!match) return null;
  const after = text.substring(caret);
  const next = match.before + sym + after;
  return { text: next, caret: match.before.length + sym.length };
}
