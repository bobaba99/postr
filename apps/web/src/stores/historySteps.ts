/**
 * What one undo step is, for the poster store (posterStore.ts). Pure: no
 * DOM, no store, so the rules can be read and tested on their own.
 *
 * TEXT is grouped by word, as in PowerPoint (owner decision of 2026-10-06,
 * plan item 12; docs/fixes/12-one-undo-history.md):
 *   - consecutive edits to the SAME text field (a block's content, one table
 *     cell, a caption, a note, one author's name ...) join one step while
 *     the user keeps typing within a word;
 *   - a new step starts with the first non-space character typed after a
 *     space (the space stays with the word before it), or at the start of
 *     the text;
 *   - consecutive single-character deletions (Backspace, Delete) are one
 *     step, separate from the typing around them;
 *   - a character typed over a selection starts a new step, which the
 *     letters typed after it join (select a word, type its replacement:
 *     one ⌘Z brings the word back);
 *   - anything else that changes the text — a paste, a cut, a deleted
 *     selection, Enter, a format change (the text is the same but its
 *     markup is not) — is a step of its own, and the next keystroke starts
 *     a new one;
 *   - a composition (an input method, a dead key, a phone keyboard that
 *     composes each word) is typed as one unit: every update and its
 *     commit join one step, a new one when it starts after a space, at
 *     the start of the field, after a Han, Hiragana or Katakana character
 *     (scripts written without spaces: each composed phrase is a word), or
 *     over a selection; after any other letter it continues the word
 *     being typed (stores/inputHint.ts, fix 12 review R2-F1).
 * A pause does not split a word. The editors also end a step when the caret
 * moves (a click, an arrow key) or the field loses focus.
 *
 * The text alone cannot always say what happened, so the store asks the
 * browser first (stores/inputHint.ts, posterStore.ts `textEdit`): a paste,
 * a drop, a cut or a deleted selection of ONE character reads like typing
 * or a backspace here; a letter typed in front of a word that starts with
 * it reads as typed inside that word ("the dog" → "the ddog"); and a
 * sidebar string that changes one character at a time need not be typed
 * at all (a colour picked). `classifyTextEdit` is what is left when the
 * browser said nothing more.
 *
 * Everything else keeps the time windows it had (a slider drag, a burst of
 * typing in a number field, a colour drag): the store's COALESCE_IDLE_MS /
 * COALESCE_MAX_MS.
 */
import type { Block, PosterDoc } from '@postr/shared';

/** What a text edit did, for deciding where one undo step ends. */
export interface TextEdit {
  kind: 'type' | 'delete' | 'other';
  /** A non-space character typed after a space, or at the start: a new word. */
  startsWord: boolean;
}

/**
 * Deep equality by value, ignoring key order and treating an `undefined`
 * field as absent (as JSON does). Key order matters here because Postgres
 * jsonb does not keep it: a palette loaded from the database can list the
 * same colours in a different order from the catalog entry a click builds,
 * and a `JSON.stringify` comparison called that a change.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => sameValue(v, b[i]))
    );
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = (r: Record<string, unknown>) => Object.keys(r).filter((k) => r[k] !== undefined);
  const ka = keys(ra);
  return ka.length === keys(rb).length && ka.every((k) => sameValue(ra[k], rb[k]));
}

const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#160': ' ',
};

/**
 * The text a user reads in stored HTML (tags dropped, the common entities
 * decoded, a no-break space read as a space). Only compared with itself,
 * so it needs to be consistent, not a full HTML parser; it needs no DOM.
 */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39|#160);/g, (_m, name: string) => ENTITIES[name] ?? '')
    .replace(/ /g, ' ');
}

const isSpace = (ch: string | undefined) => ch !== undefined && /\s/.test(ch);

/** Classify the change from `before` to `after` (plain text of one field). */
export function classifyTextEdit(before: string, after: string): TextEdit {
  let p = 0;
  const max = Math.min(before.length, after.length);
  while (p < max && before[p] === after[p]) p += 1;
  let s = 0;
  while (s < max - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s += 1;
  const removed = before.length - p - s;
  const inserted = after.slice(p, after.length - s);
  if (inserted.length === 1 && inserted !== '\n') {
    // Over a selection (something removed) it is a new step too.
    if (removed > 0) return { kind: 'type', startsWord: true };
    return { kind: 'type', startsWord: !isSpace(inserted) && (p === 0 || isSpace(after[p - 1])) };
  }
  if (inserted.length === 0 && removed === 1) return { kind: 'delete', startsWord: false };
  return { kind: 'other', startsWord: false };
}

/** Whether an edit continues the text step `previous`, given what it did. */
export function continuesTextStep(previous: TextEdit['kind'] | null, edit: TextEdit): boolean {
  if (previous === null || edit.kind === 'other' || edit.kind !== previous) return false;
  return !(edit.kind === 'type' && edit.startsWord);
}

/** The one text field a block patch edits: what it is called, and its text before and after. */
export interface TextFieldEdit {
  key: string;
  before: string;
  after: string;
}

/**
 * The text field `patch` changes on `block`, when it changes exactly one:
 * the content, one table cell, the caption or the note. Null for any other
 * patch (a move, a resize, a slider, a table's rows or columns), which
 * keeps its own rules. A table patch that changes one cell and something
 * else of the table at once is not made by any control (each changes one
 * or the other), so it is read as the cell.
 */
export function textFieldOfBlockPatch(block: Block, patch: Partial<Block>): TextFieldEdit | null {
  const keys = Object.keys(patch) as Array<keyof Block>;
  if (keys.length !== 1) return null;
  const k = keys[0]!;
  if (k === 'content' || k === 'caption' || k === 'note') {
    const after = patch[k];
    if (typeof after !== 'string') return null;
    return { key: `${k}:${block.id}`, before: plainText(String(block[k] ?? '')), after: plainText(after) };
  }
  if (k === 'tableData') {
    const was = block.tableData;
    const next = patch.tableData;
    if (!was || !next || was.cells.length !== next.cells.length) return null;
    const c0 = was.cells;
    const c1 = next.cells;
    const changed = c1.map((v, i) => (v === c0[i] ? -1 : i)).filter((i) => i >= 0);
    if (changed.length !== 1) return null;
    const i = changed[0]!;
    return { key: `cell:${block.id}:${i}`, before: plainText(c0[i] ?? ''), after: plainText(c1[i] ?? '') };
  }
  return null;
}

/**
 * The one string a document patch changes (an author's name, an
 * institution's city ...), or null when it changes something else or more
 * than one thing. Walks objects and arrays of the same shape.
 */
export function singleStringChange(before: unknown, after: unknown): { before: string; after: string } | null {
  if (typeof before === 'string' && typeof after === 'string') {
    return before === after ? null : { before, after };
  }
  if (typeof before !== 'object' || typeof after !== 'object' || before === null || after === null) return null;
  if (Array.isArray(before) !== Array.isArray(after)) return null;
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  if (Array.isArray(before) && (before as unknown[]).length !== (after as unknown[]).length) return null;
  let found: { before: string; after: string } | null = null;
  for (const k of keys) {
    if (sameValue(a[k], b[k])) continue;
    if (found) return null;
    const va = a[k] === undefined && typeof b[k] === 'string' ? '' : a[k];
    found = singleStringChange(va, b[k]);
    if (!found) return null;
  }
  return found;
}

/** Where an undone or redone text change is: a block's content, or one cell of a table. */
export interface TextTarget {
  /** `content:<block id>` or `cell:<block id>:<index>`, the editors' history keys. */
  key: string;
  blockId: string;
}

/**
 * The text field that differs between two documents, when that is the only
 * difference: what undo or redo of a text step restores. Null when the step
 * changed anything else (a move, a style, a block added or removed) or more
 * than one field.
 */
export function textTargetOf(before: PosterDoc | null, after: PosterDoc | null): TextTarget | null {
  if (!before || !after || before.blocks.length !== after.blocks.length) return null;
  const { blocks: bb, ...restBefore } = before;
  const { blocks: ab, ...restAfter } = after;
  if (!sameValue(restBefore, restAfter)) return null;
  let found: TextTarget | null = null;
  for (let i = 0; i < bb.length; i += 1) {
    const x = bb[i]!;
    const y = ab[i]!;
    if (x.id !== y.id) return null;
    if (x === y || sameValue(x, y)) continue;
    if (found) return null;
    const { content: cx, tableData: tx, ...ox } = x;
    const { content: cy, tableData: ty, ...oy } = y;
    if (!sameValue(ox, oy)) return null;
    if (cx !== cy && sameValue(tx, ty)) {
      found = { key: `content:${x.id}`, blockId: x.id };
      continue;
    }
    const cell = cx === cy && tx && ty ? textFieldOfBlockPatch(x, { tableData: ty }) : null;
    if (!cell) return null;
    found = { key: cell.key, blockId: x.id };
  }
  return found;
}
