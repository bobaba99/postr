/**
 * Poster store — Zustand with undo/redo.
 *
 * Single source of truth for the in-memory PosterDoc currently being
 * edited. All mutations are immutable. Undo/redo snapshots the `doc`
 * field on every change, maintaining two stacks capped at
 * UNDO_HISTORY_LIMIT (100) entries. What one step is lives in
 * historySteps.ts (text by word, docs/fixes/12-one-undo-history.md).
 */
import { create } from 'zustand';
import { filterDeletable, preserveLocked } from '@/export/blockLock';
import { ACK_BLOCK_ID, ensureAckBlock, replaceAckBlock } from '@/export/ackBlock';
import { withUsableSheetSize } from '@/poster/constants';
import {
  classifyTextEdit,
  continuesTextStep,
  sameValue,
  singleStringChange,
  textFieldOfBlockPatch,
  type TextEdit,
} from './historySteps';
import { browserHistoryNow, compositionEditNow, ownStepNow, typedNow, typedOverSelection, typedWordStart } from './inputHint';
import type {
  Block,
  Palette,
  PosterDoc,
  StyleLevel,
  TypeStyle,
} from '@postr/shared';

/**
 * How many steps undo and redo each keep. The plan's accepted value (fix
 * plan, 2026-09-27); the About page states it.
 */
export const UNDO_HISTORY_LIMIT = 100;
const MAX_HISTORY = UNDO_HISTORY_LIMIT;

export interface SetPosterOptions {
  /**
   * Add the acknowledgement mark when the doc lacks one. Set by the
   * EDITING entry point only — read-only viewers (the public Share
   * page, version previews) must render the poster as stored.
   */
  seedAcknowledgement?: boolean;
  /**
   * The size to use for a side the document has no usable size for, before
   * the 48 × 36 default: the poster row's own columns on the share page,
   * the poster's current size when a version is restored.
   */
  sizeFallback?: { widthIn?: unknown; heightIn?: unknown };
  /**
   * The user who owns the poster, as the editor checked when it opened it.
   * Images put into the poster go into this user's storage folder, not the
   * folder of whoever the session names at that moment (another account's
   * sign-in in another tab replaces the session before this tab hears of
   * it; docs/fixes/23-new-poster-owner-only.md). The same poster loaded again
   * without one (Import over it) keeps it; another poster clears it.
   */
  ownerId?: string;
}

export interface PosterStoreState {
  posterId: string | null;
  /** The poster's owner, when the editor opened it (SetPosterOptions.ownerId). */
  posterOwnerId: string | null;
  posterTitle: string;
  doc: PosterDoc | null;

  // Undo/redo
  canUndo: boolean;
  canRedo: boolean;

  setPoster: (
    posterId: string,
    doc: PosterDoc,
    title?: string,
    options?: SetPosterOptions,
  ) => void;
  setPosterTitle: (title: string) => void;
  /**
   * Change document-level fields (palette, font, size, authors,
   * references...) as ONE undoable edit. This is the editing counterpart
   * of `setPoster`, which LOADS a poster and therefore resets history
   * and the display name. See docs/fixes/01-sidebar-undo-history.md.
   *
   * `coalesceKey`: a string merges a burst of edits to the same thing
   * (typing an author's name) into one undo step; `null` makes this edit
   * its own step. Calls made in the same synchronous run — one user
   * action — always land in one step. A patch that changes nothing adds
   * no step.
   */
  patchDoc: (patch: Partial<PosterDoc>, coalesceKey?: string | null) => void;
  /**
   * Put a saved version's document in place as ONE undoable step (owner
   * decision 6, fix 12): ⌘Z returns to the poster as it was, and the
   * history before it is kept. The poster's id, owner and display name
   * stay; a version with no usable size takes `sizeFallback`'s; the
   * locked blocks follow the same rule as undo (`restoreFromHistory`).
   */
  restoreVersion: (doc: PosterDoc, options?: { sizeFallback?: SetPosterOptions['sizeFallback'] }) => void;
  addBlock: (block: Block) => void;
  updateBlock: (id: string, patch: Partial<Block>) => void;
  removeBlock: (id: string) => void;
  setStyle: (level: StyleLevel, patch: Partial<TypeStyle>) => void;
  setPalette: (palette: Palette) => void;
  setFont: (fontFamily: string) => void;
  /**
   * Apply a copied design (palette and/or font) as ONE undo step —
   * the copy-a-design flow's escape hatch is ⌘Z, so both fields must
   * revert together (plan §4). Omitted fields are left untouched.
   */
  applyExtractedStyle: (patch: {
    palette?: Palette;
    fontFamily?: string;
  }) => void;
  setBlocks: (blocks: Block[]) => void;
  /** Set blocks without pushing to undo — for drag intermediates. */
  setBlocksSilent: (blocks: Block[]) => void;
  /** Undo one step; false when there was nothing to undo. */
  undo: () => boolean;
  /** Redo one step; false when there was nothing to redo. */
  redo: () => boolean;
}

// Internal stacks — kept outside Zustand to avoid triggering
// subscriptions on every push (autosave watches `doc`, not stacks).
let undoStack: PosterDoc[] = [];
let redoStack: PosterDoc[] = [];

/**
 * The locked blocks of the poster as loaded, refreshed after each sidebar
 * edit (`patchDoc`) — the baseline the lock is enforced against.
 *
 * Held separately from `doc` on purpose. Enforcing only against the
 * CURRENT doc means one state that has already lost the block (a doc
 * written by a build predating the guard, a hand-edited `.postr`, a
 * direct `setState` from a test or devtool) propagates that absence
 * forever: there is nothing left to restore from. A baseline held outside
 * the doc lets the guard restore a block that some other write lost. It
 * follows sidebar edits, so a mark a size change deliberately dropped for
 * lack of room stays dropped instead of coming back off the sheet.
 *
 * Reset in `setPoster` along with the history stacks, since a
 * different poster has a different baseline.
 */
let lockedBaseline: Block[] = [];

/**
 * Longest pause inside one typing burst. A gap larger than this starts a
 * new undo entry, so "undo" lands where the user stopped thinking.
 */
const COALESCE_IDLE_MS = 600;

/**
 * Longest a single burst may run. Without it, continuous typing would
 * be one unbounded entry and undo would throw away minutes of work.
 */
const COALESCE_MAX_MS = 5_000;

/**
 * The burst currently being coalesced, if any. `key` identifies WHAT is
 * being edited, so typing in one block cannot merge with typing in
 * another. `text` is the kind of the last text edit in it, for a text
 * field (historySteps.ts); null for every other edit, which is grouped by
 * the time windows above.
 */
let lastPush: { key: string; at: number; startedAt: number; text: TextEdit['kind'] | null } | null = null;

/**
 * End the current burst, so the next edit starts a fresh undo entry. Not
 * while a drag is held (below): the focus a slider takes, or the text it
 * leaves, is part of the same gesture (Firefox moves the focus after the
 * slider's first value; fix 12, merge review F1).
 */
export function breakUndoCoalescing() {
  if (dragStep !== null) return;
  lastPush = null;
}

/**
 * The pointer gesture being held, if any: a crop edge, a table column's
 * width grip, a slider's thumb. Every edit made while it is held is ONE
 * undo step, however many pointer moves and however long it takes, as a
 * move, resize or rotate drag already is (PowerPoint; owner decision 3,
 * the lead's decision on fix 12's merge review F1: a crop drag of ~330
 * moves had been ~330 steps, pushing older edits out of the history).
 * Begun at pointerdown and ended at pointerup (`poster/dragStep.ts`).
 */
let dragStep: string | null = null;
let dragSeq = 0;

/** A drag begins: its edits, until `endDragStep`, are one undo step. */
export function beginDragStep() {
  dragStep = `drag:${++dragSeq}`;
}

/** The drag ends: the next edit starts a step of its own. */
export function endDragStep() {
  dragStep = null;
}

/**
 * The coalesce key of the document edit made earlier in the SAME
 * synchronous run, if any. One user action can patch the document more
 * than once — pasting a list of authors adds the new institutions, then
 * the authors — and PowerPoint-style undo treats that as one step.
 * Cleared at the next microtask, so two separate clicks never merge.
 */
let runKey: string | null = null;
let runSeq = 0;

function keyForThisRun(requested: string | null): string {
  if (runKey !== null) return runKey;
  runKey = requested ?? `run:${++runSeq}`;
  queueMicrotask(() => {
    runKey = null;
  });
  return runKey;
}

/**
 * Push the current doc onto the undo stack, clearing redo (new branch).
 *
 * `coalesceKey` marks an edit that arrives in a burst — a keystroke.
 * Consecutive pushes with the SAME key, inside the idle and total
 * windows, do not add an entry: the snapshot taken before the burst
 * began stays as the single undo point, so one undo reverts the whole
 * burst.
 *
 * Without this, every `input` event stored a whole-document snapshot
 * and MAX_HISTORY evicted oldest-first, so roughly fifty keystrokes
 * discarded ALL prior structural history — delete a block, type a
 * sentence, and the deletion was unrecoverable (FINDINGS.md F3).
 * Raising the cap alone does not fix it: 78 keystrokes would still burn
 * 78 entries. The cap is the amplifier; the push rate is the defect.
 */
function pushUndo(doc: PosterDoc, coalesceKey?: string, text?: TextEdit) {
  const now = Date.now();
  // A held drag groups whatever it edits under its own key, with no time
  // window: pointerdown to pointerup is one step.
  const key = dragStep ?? coalesceKey;
  const sameThing =
    key !== undefined &&
    lastPush !== null &&
    lastPush.key === key &&
    // Nothing to coalesce ONTO if the stack is empty — the first push
    // must always land, or the burst would have no undo point at all.
    undoStack.length > 0;
  const inBurst =
    sameThing &&
    (dragStep !== null ||
      (text
        ? // Text: by word, whatever the pauses (historySteps.ts).
          continuesTextStep(lastPush!.text, text)
        : lastPush!.text === null &&
          now - lastPush!.at < COALESCE_IDLE_MS &&
          now - lastPush!.startedAt < COALESCE_MAX_MS));

  if (inBurst) {
    lastPush = { ...lastPush!, at: now, text: text?.kind ?? null };
    // Still a new branch: redo cannot survive a fresh edit.
    redoStack = [];
    return;
  }

  undoStack = [...undoStack, doc].slice(-MAX_HISTORY);
  redoStack = [];
  lastPush = key === undefined ? null : { key, at: now, startedAt: now, text: text?.kind ?? null };
}

/**
 * Apply the locked-block invariant to a candidate block list.
 *
 * Sources are tried in order — the current doc first (so a block the
 * user just MOVED keeps its new coordinates), then the
 * baseline (so a block already missing from current state is still
 * recoverable).
 */
function guardLocked(current: readonly Block[], next: readonly Block[]): Block[] {
  return preserveLocked(current, next, lockedBaseline);
}

/**
 * Wrap a doc mutation: snapshot the current doc before applying,
 * then return the new state with updated canUndo/canRedo flags.
 */
function withUndo(
  state: PosterStoreState,
  fn: (doc: PosterDoc) => PosterDoc,
  coalesceKey?: string,
  text?: TextEdit,
): Partial<PosterStoreState> {
  // Not an edit: the browser's own undo or redo changed a field with no
  // beforeinput to cancel first (Chromium's and Firefox's execCommand). It
  // never reaches the poster (owner decision 1, fix 12 review R1-F3); a
  // controlled field is put back by React when its change is refused.
  if (!state.doc || browserHistoryNow()) return {};
  pushUndo(state.doc, coalesceKey, text);
  return {
    doc: fn(state.doc),
    canUndo: true,
    canRedo: false,
  };
}

/**
 * The doc to adopt when undo or redo restores `target` from history.
 *
 * `guardLocked` puts back any locked block `target` is missing, at the
 * coordinates it has in `current`. For the credit mark that is wrong when
 * the step crosses a size change that DROPPED the mark: a mark from a
 * 36-inch sheet lands past the edge of a 24-inch one. So the mark is
 * re-placed for `target`'s sheet — ackBlock.ts asks this of every write
 * that changes the sheet size — but ONLY when the guard brought it back.
 * A mark `target` already has is where the user left it, even on top of
 * other content, and an unrelated undo must not move or drop it.
 */
function restoreFromHistory(current: PosterDoc, target: PosterDoc): PosterDoc {
  const restored = { ...target, blocks: guardLocked(current.blocks, target.blocks) };
  const has = (blocks: readonly Block[]) => blocks.some((b) => b.id === ACK_BLOCK_ID);
  return has(restored.blocks) && !has(target.blocks) ? replaceAckBlock(restored) : restored;
}

/**
 * True when every field in `patch` already holds that value — clicking the
 * option that is already selected. Compared by value because the sidebar
 * rebuilds objects (`{ ...headingStyle, border }`) on every click.
 */
function changesNothing(doc: PosterDoc, patch: Partial<PosterDoc>): boolean {
  return (Object.keys(patch) as Array<keyof PosterDoc>).every((k) => sameValue(patch[k], doc[k]));
}

/**
 * A keyed sidebar edit that is typing in one string (an author's name), so
 * it is grouped by word like the canvas, or a paste into one (a step of its
 * own). Undefined for anything else — a number, a list, a colour picked —
 * which keeps the time windows. Only the browser can tell typing from a
 * colour picked one hex digit later ('#112233' → '#112234' reads as a typed
 * letter): it fires `beforeinput` for typing and a paste, and none for a
 * colour input (fix 12 review R1-F1; stores/inputHint.ts).
 */
function textEditOfDocPatch(doc: PosterDoc, patch: Partial<PosterDoc>): TextEdit | undefined {
  if (!typedNow() && !ownStepNow()) return undefined;
  const keys = (Object.keys(patch) as Array<keyof PosterDoc>).filter((k) => !sameValue(patch[k], doc[k]));
  if (keys.length !== 1) return undefined;
  const change = singleStringChange(doc[keys[0]!], patch[keys[0]!]);
  return change ? textEdit(change.before, change.after) : undefined;
}

/**
 * Classify a text change, with what the browser said about it first
 * (stores/inputHint.ts): a composition's edits (an input method, a dead
 * key) are typing that continues the step its first edit began, whatever
 * each update replaced (fix 12 review R2-F1); a paste, a drop, a cut or a
 * deleted selection is a step of its own; a letter typed over a selection
 * starts a new step, even where the text alone reads as a deletion ("Jane
 * Doe" → "J"); and a typed letter starts a word when the character before
 * the caret is a space, even where the text alone cannot say where it went
 * ("the dog" → "the ddog").
 */
function textEdit(before: string, after: string): TextEdit {
  const composed = compositionEditNow();
  if (composed) return { kind: 'type', startsWord: composed.startsWord };
  if (ownStepNow()) return { kind: 'other', startsWord: false };
  if (typedOverSelection()) return { kind: 'type', startsWord: true };
  const edit = classifyTextEdit(before, after);
  const word = typedWordStart();
  return edit.kind === 'type' && word !== null ? { kind: 'type', startsWord: word } : edit;
}

export const usePosterStore = create<PosterStoreState>((set) => ({
  posterId: null,
  posterOwnerId: null,
  posterTitle: '',
  doc: null,
  canUndo: false,
  canRedo: false,

  setPoster: (posterId, doc, title, options = {}) => {
    // Reset undo history when loading a new poster
    undoStack = [];
    redoStack = [];
    // Seeding is OPT-IN (`seedAcknowledgement`) rather than automatic.
    //
    // A store setter that silently adds content would break its own
    // contract — "replaces the current doc" has to mean that — and
    // `setPoster` serves read-only paths too (the public Share page,
    // a version-history preview) where injecting a block into someone
    // else's poster is wrong. The EDITING entry point opts in; the
    // viewing ones do not.
    //
    // `ensureAckBlock` is a no-op when the mark is already present, so
    // opting in neither duplicates on re-entry nor overwrites a mark
    // the user has moved. It returns the doc unchanged when there is
    // no room, in which case the references-line credit carries the
    // acknowledgement alone.
    //
    // This runs BEFORE the baseline snapshot, so a freshly seeded mark
    // is part of the baseline the lock enforces against.
    // Every document enters here, so this is where an unusable stored size
    // (missing, 0, a string, absurd) is repaired: opening, sharing,
    // importing and restoring a version then all draw and print one real
    // size (docs/fixes/02-poster-size.md).
    const sized = withUsableSheetSize(doc, options.sizeFallback);
    const seeded = options.seedAcknowledgement ? ensureAckBlock(sized) : sized;
    lockedBaseline = seeded.blocks.filter((b) => b.locked === true);
    set((state) => ({
      posterId,
      posterOwnerId: options.ownerId ?? (state.posterId === posterId ? state.posterOwnerId : null),
      doc: seeded,
      posterTitle: title ?? '',
      canUndo: false,
      canRedo: false,
    }));
  },

  setPosterTitle: (posterTitle) => set({ posterTitle }),

  patchDoc: (patch, coalesceKey = null) =>
    set((state) => {
      if (!state.doc) return {};
      // Not an edit: no undo step, and a guest who changed nothing is not
      // asked to confirm leaving (useLeaveGuard arms on canUndo).
      if (changesNothing(state.doc, patch)) return {};
      // Only an edit that fires on every keystroke passes a key; a text one
      // is grouped by word (historySteps.ts).
      const text = coalesceKey !== null ? textEditOfDocPatch(state.doc, patch) : undefined;
      const next = withUndo(state, (doc) => ({ ...doc, ...patch }), keyForThisRun(coalesceKey), text);
      // Keep the locked-block baseline in step with the edited doc, as
      // setPoster did on this path before. It matters when a size change
      // DROPS the credit mark for lack of room: the guard restores a locked
      // block missing from the current doc out of this baseline, so a stale
      // one would bring the mark back at the old sheet's coordinates on the
      // next template swap.
      if (next.doc) lockedBaseline = next.doc.blocks.filter((b) => b.locked === true);
      // posterId and posterTitle are deliberately untouched: routing
      // sidebar edits through setPoster blanked the display name, and the
      // next autosave then wrote the title block's text over it.
      return next;
    }),

  restoreVersion: (doc, options = {}) =>
    set((state) => {
      if (!state.doc) return {};
      const restored = restoreFromHistory(state.doc, withUsableSheetSize(doc, options.sizeFallback));
      // Restoring the version already on screen is not an edit.
      if (sameValue(restored, state.doc)) return {};
      // Like undo and redo, it leaves the locked baseline alone.
      return withUndo(state, () => restored);
    }),

  addBlock: (block) =>
    set((state) =>
      withUndo(state, (doc) => ({
        ...doc,
        blocks: [...doc.blocks, block],
      })),
    ),

  updateBlock: (id, patch) =>
    set((state) => {
      const block = state.doc?.blocks.find((b) => b.id === id);
      if (!state.doc || !block) return {};
      // Not an edit: an input that changes nothing (a browser's own undo
      // firing over text the editor already restored) must not add a step,
      // or it wipes the redo (fix 12, U10).
      const keys = Object.keys(patch) as Array<keyof Block>;
      if (keys.every((k) => sameValue(patch[k], block[k]))) return {};
      // A patch to ONE text field (the content, one table cell, the
      // caption, the note) is typing, grouped by word under that field's
      // key. Any other patch — one that also moves or resizes, a slider,
      // a table's rows — is a discrete act with its own entry, so a drag
      // landing mid-burst is never swallowed by it.
      const field = textFieldOfBlockPatch(block, patch);
      return withUndo(
        state,
        (doc) => ({
          ...doc,
          blocks: doc.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        }),
        field?.key,
        field ? textEdit(field.before, field.after) : undefined,
      );
    }),

  // Locked blocks refuse deletion here too, not only at the UI call
  // sites. `removeBlock` is a public store action — anything holding
  // the store can call it — so the guard has to sit at the mutation,
  // not only in front of it.
  //
  // A fully-refused removal makes NO doc change and pushes NO undo
  // entry: a delete that did nothing should not cost the user a ⌘Z.
  removeBlock: (id) =>
    set((state) => {
      if (!state.doc) return {};
      const outcome = filterDeletable(state.doc.blocks, [id]);
      if (outcome.removedIds.length === 0) return {};
      return withUndo(state, (doc) => ({
        ...doc,
        blocks: outcome.blocks,
      }));
    }),

  setStyle: (level, patch) =>
    set((state) =>
      withUndo(state, (doc) => ({
        ...doc,
        styles: {
          ...doc.styles,
          [level]: { ...doc.styles[level], ...patch },
        },
      })),
    ),

  setPalette: (palette) =>
    set((state) => withUndo(state, (doc) => ({ ...doc, palette }))),

  setFont: (fontFamily) =>
    set((state) => withUndo(state, (doc) => ({ ...doc, fontFamily }))),

  applyExtractedStyle: (patch) =>
    set((state) => {
      // Nothing selected → no doc change, no undo entry.
      if (patch.palette === undefined && patch.fontFamily === undefined) {
        return {};
      }
      return withUndo(state, (doc) => ({
        ...doc,
        ...(patch.palette !== undefined ? { palette: patch.palette } : {}),
        ...(patch.fontFamily !== undefined
          ? { fontFamily: patch.fontFamily }
          : {}),
      }));
    }),

  // Whole-list replacement. Every UI delete path ultimately lands
  // here, as do auto-layout, template swaps and clear-all — so this
  // is the chokepoint where a locked block that went missing gets put
  // back, whatever removed it. Locked blocks PRESENT in `blocks` pass
  // through untouched, which is what keeps them movable and
  // resizable while still undeletable.
  setBlocks: (blocks) =>
    set((state) =>
      withUndo(state, (doc) => ({
        ...doc,
        blocks: guardLocked(doc.blocks, blocks),
      })),
    ),

  /** Set blocks WITHOUT pushing to undo — used for drag intermediates. */
  setBlocksSilent: (blocks: Block[]) =>
    set((state) => {
      if (!state.doc) return {};
      return {
        doc: { ...state.doc, blocks: guardLocked(state.doc.blocks, blocks) },
      };
    }),

  // Undo/redo restore whole documents from the history stacks, which
  // is a second way to lose a locked block: a snapshot taken BEFORE
  // the acknowledgement was added contains no such block, and
  // restoring it would delete the block without any delete path
  // running. Both directions therefore re-apply `guardLocked`
  // against the doc being replaced.
  //
  // Consequence, and it is the intended one: undo cannot take the
  // poster back to a state without the credit, and redo cannot
  // advance it into one either — unless the restored sheet has no
  // room for the mark at all, the same degradation a size change makes
  // (see `restoreFromHistory`).
  //
  // Both directions also end any edit in progress: without that, the
  // next keystroke into the same field joined the undone burst, and the
  // following undo went one step too far.
  undo: () => {
    let applied = false;
    set((state) => {
      if (undoStack.length === 0 || !state.doc) return {};
      applied = true;
      redoStack = [...redoStack, state.doc].slice(-MAX_HISTORY);
      const prev = undoStack[undoStack.length - 1]!;
      undoStack = undoStack.slice(0, -1);
      lastPush = null;
      return {
        // `guardLocked` (inside) consults the locked baseline as well
        // as the current doc: if the block is ALREADY missing from
        // `state.doc` (a doc written by a build without this guard, or
        // restored from a hand-edited bundle), preserving against current
        // state alone would propagate that absence forever.
        doc: restoreFromHistory(state.doc, prev),
        canUndo: undoStack.length > 0,
        canRedo: true,
      };
    });
    return applied;
  },

  redo: () => {
    let applied = false;
    set((state) => {
      if (redoStack.length === 0 || !state.doc) return {};
      applied = true;
      undoStack = [...undoStack, state.doc].slice(-MAX_HISTORY);
      const next = redoStack[redoStack.length - 1]!;
      redoStack = redoStack.slice(0, -1);
      lastPush = null;
      return {
        doc: restoreFromHistory(state.doc, next),
        canUndo: true,
        canRedo: redoStack.length > 0,
      };
    });
    return applied;
  },
}));
