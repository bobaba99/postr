/**
 * What the browser said about the user's action being handled now, for the
 * store's step rules (historySteps.ts, posterStore.ts). Noted by the
 * editor's document listeners (poster/useEditorHistory.ts, capture phase,
 * so before any field's own handler), read by the store in the same task,
 * gone by the next.
 *
 * A diff of a field's text before and after cannot tell these apart, and
 * each was a defect found by the fix 12 review, round 1 (record
 * docs/fixes/12-one-undo-history.md, section 9):
 *   - a letter typed from a colour picked one hex digit later (a colour
 *     input fires no `beforeinput`; typing always does);
 *   - a one-character paste or drop from a typed letter (the paste event,
 *     or `beforeinput` of type insertFrom…; the editor's own paste runs
 *     `execCommand`, whose input event says '' or 'insertText');
 *   - a letter typed in front of a word that starts with it, from one typed
 *     inside that word (the character before the caret says which);
 *   - "Jane Doe" selected and "J" typed, from a deletion (the selection);
 *   - the browser's own undo or redo, applied to a field with no
 *     `beforeinput` first (its input event, of type historyUndo/Redo);
 *   - one update of a composition (an input method, a dead key, a phone
 *     keyboard composing a word) from a letter typed over a selection: the
 *     browser selects the text composed so far before each update, so every
 *     update read as typed over a selection and was a step of its own (fix
 *     12 review R2-F1: "にほんご" took 10 ⌘Z and showed "にほんg" on the way).
 */

/** Where the caret was when a `beforeinput` began. */
export interface CaretContext {
  /** The selection was a caret, not a range. */
  collapsed: boolean;
  /** The character before the caret: null at the start of the field, undefined when unknown. */
  before: string | null | undefined;
}

interface TaskHint {
  /** The browser said a character was typed or deleted (not pasted, not dropped). */
  typed: boolean;
  /** A character was typed over a selection. */
  typedOverSelection: boolean;
  /** The typed character starts a word (null: not known from the caret). */
  wordStart: boolean | null;
  /** A paste, a drop, a cut or a deleted selection: an undo step of its own. */
  ownStep: boolean;
  /** The browser's own undo or redo changed a field: nothing is stored. */
  historyInput: boolean;
  /** A composition changed the field (its updates and its commit). */
  composing: boolean;
}

let hint: TaskHint | null = null;

/**
 * The composition last begun (compositionstart). Unlike the task's record
 * it spans tasks: every update is a task of its own. It is read only for
 * an edit the browser said was a composition's (its input types below), so
 * it need not be cleared: each composition begins with its own
 * compositionstart (UI Events), which replaces it.
 */
interface Composition {
  /** Its first edit starts a new step. */
  wordStart: boolean;
  /** Its first edit was stored: the rest continue that step. */
  begun: boolean;
}

let composition: Composition | null = null;

/**
 * A key was pressed: a new user action begins, whatever the last one left.
 * The end-of-task timer below is the usual clear, but a browser may run a
 * keystroke queued during a long task before that timer (Chromium puts
 * input first), and a record left over from the browser's own undo would
 * then refuse the keystroke's edit.
 */
export function resetInputHint() {
  hint = null;
}

/** This task's record, started on first use and dropped at the end of the task. */
function current(): TaskHint {
  if (!hint) {
    hint = { typed: false, typedOverSelection: false, wordStart: null, ownStep: false, historyInput: false, composing: false };
    setTimeout(() => {
      hint = null;
    }, 0);
  }
  return hint;
}

const isSpace = (ch: string) => /\s/.test(ch);

/**
 * Scripts written without spaces between words (Han, Hiragana, Katakana,
 * their punctuation and full-width forms): there each composed phrase is a
 * word, so a composition after one starts a new step.
 */
const NO_SPACE_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\uff00-\uffef]/u;

/** The input types only a composition fires: its updates, and WebKit's commit (Input Events Level 2). */
const COMPOSITION_INPUT = new Set(['insertCompositionText', 'deleteCompositionText', 'insertFromComposition']);

/**
 * A composition began (compositionstart), with the caret as it stood: its
 * edits will be one step, a new one when it replaces a selection or when
 * the character before it is a space, the start of the field (or not
 * known) or a character of a script written without spaces; otherwise it
 * continues the word being typed (a Korean syllable after another, é
 * after "caf").
 */
export function noteCompositionStart(caret: CaretContext) {
  const before = caret.before;
  const wordStart = !caret.collapsed || before == null || isSpace(before) || NO_SPACE_SCRIPT.test(before);
  composition = { wordStart, begun: false };
}

/**
 * The edit being stored now is a composition's: whether it starts a step
 * (only its first edit can). Null when it is not a composition's edit.
 */
export function compositionEditNow(): { startsWord: boolean } | null {
  if (!composition || hint?.composing !== true) return null;
  const first = !composition.begun;
  composition.begun = true;
  return { startsWord: first && composition.wordStart };
}

/** A `beforeinput` (not the browser's own history: useEditorHistory decides those). */
export function noteBeforeInput(inputType: string, data: string | null, caret: CaretContext) {
  const h = current();
  if (COMPOSITION_INPUT.has(inputType)) {
    // The selection over the text composed so far is the composition's,
    // not one the user made.
    h.typed = true;
    h.composing = true;
    return;
  }
  if (inputType === 'insertText') {
    h.typed = true;
    if (!caret.collapsed) h.typedOverSelection = true;
    else if (data && data.length === 1 && caret.before !== undefined) {
      h.wordStart = !isSpace(data) && (caret.before === null || isSpace(caret.before));
    }
  } else if (inputType.startsWith('delete')) {
    h.typed = true;
    // A cut, or a selection deleted: its own step. Backspaces run together.
    if (!caret.collapsed) h.ownStep = true;
  } else if (inputType.startsWith('insertFrom')) {
    h.ownStep = true; // a paste, a drop
  }
}

/** A paste: the editor's own paste handler cancels the browser's and inserts with execCommand. */
export function notePaste() {
  current().ownStep = true;
}

/** An input event of type historyUndo / historyRedo: the browser's own history ran. */
export function noteHistoryInput() {
  current().historyInput = true;
}

/** The browser reported typing or deleting in this task: a string changed now is text. */
export const typedNow = () => hint?.typed === true;
/** A character was typed over a selection: a new step, which the next letters join. */
export const typedOverSelection = () => hint?.typedOverSelection === true;
/** Whether the typed character starts a word, from the caret; null when not known. */
export const typedWordStart = (): boolean | null => hint?.wordStart ?? null;
/** This task's edit is an undo step of its own (a paste, a drop, a cut, a deleted selection). */
export const ownStepNow = () => hint?.ownStep === true;
/** The browser's own undo or redo ran in this task: no edit is stored. */
export const browserHistoryNow = () => hint?.historyInput === true;
