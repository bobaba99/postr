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

/**
 * Minimum prefix length (including the slash) before the menu opens.
 * 1 = open on the bare `/` character. 2 = open on `/x`. We use 1
 * so the menu surfaces immediately — the user can see the full
 * symbol list to pick from.
 */
const MIN_SLASH_LENGTH = 1;

export interface SlashMatch {
  /** Text before the slash (passes through unchanged on insert). */
  before: string;
  /** The matched `/prefix` literal, including the slash. */
  literal: string;
  /** The prefix after the slash (e.g. `"al"` for `/al`). May be ''. */
  prefix: string;
}

/**
 * Look at the text to the left of the caret and decide whether an
 * active slash-command is in progress. Returns null when the caret
 * is not immediately after a `/...` token.
 */
export function matchSlashAtCaret(textBeforeCaret: string): SlashMatch | null {
  const m = textBeforeCaret.match(/\/([a-zA-Z0-9]*)$/);
  if (!m) return null;
  const literal = m[0];
  if (literal.length < MIN_SLASH_LENGTH) return null;
  return {
    before: textBeforeCaret.substring(0, textBeforeCaret.length - literal.length),
    literal,
    prefix: m[1] ?? '',
  };
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
