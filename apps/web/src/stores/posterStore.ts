/**
 * Poster store — Zustand with undo/redo.
 *
 * Single source of truth for the in-memory PosterDoc currently being
 * edited. All mutations are immutable. Undo/redo snapshots the `doc`
 * field on every change, maintaining two stacks capped at 50 entries.
 */
import { create } from 'zustand';
import { filterDeletable, preserveLocked } from '@/export/blockLock';
import { ACK_BLOCK_ID, ensureAckBlock, replaceAckBlock } from '@/export/ackBlock';
import type {
  Block,
  Palette,
  PosterDoc,
  StyleLevel,
  TypeStyle,
} from '@postr/shared';

const MAX_HISTORY = 50;

export interface SetPosterOptions {
  /**
   * Add the acknowledgement mark when the doc lacks one. Set by the
   * EDITING entry point only — read-only viewers (the public Share
   * page, version previews) must render the poster as stored.
   */
  seedAcknowledgement?: boolean;
}

export interface PosterStoreState {
  posterId: string | null;
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
  undo: () => void;
  redo: () => void;
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
 * another.
 */
let lastPush: { key: string; at: number; startedAt: number } | null = null;

/** End the current burst, so the next edit starts a fresh undo entry. */
export function breakUndoCoalescing() {
  lastPush = null;
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
function pushUndo(doc: PosterDoc, coalesceKey?: string) {
  const now = Date.now();
  const inBurst =
    coalesceKey !== undefined &&
    lastPush !== null &&
    lastPush.key === coalesceKey &&
    now - lastPush.at < COALESCE_IDLE_MS &&
    now - lastPush.startedAt < COALESCE_MAX_MS &&
    // Nothing to coalesce ONTO if the stack is empty — the first push
    // must always land, or the burst would have no undo point at all.
    undoStack.length > 0;

  if (inBurst) {
    lastPush = { ...lastPush!, at: now };
    // Still a new branch: redo cannot survive a fresh edit.
    redoStack = [];
    return;
  }

  undoStack = [...undoStack, doc].slice(-MAX_HISTORY);
  redoStack = [];
  lastPush =
    coalesceKey === undefined ? null : { key: coalesceKey, at: now, startedAt: now };
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
): Partial<PosterStoreState> {
  if (!state.doc) return {};
  pushUndo(state.doc, coalesceKey);
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
 * Deep equality by value, ignoring key order and treating an `undefined`
 * field as absent (as JSON does). Key order matters here because Postgres
 * jsonb does not keep it: a palette loaded from the database can list the
 * same colours in a different order from the catalog entry a click builds,
 * and a `JSON.stringify` comparison called that a change.
 */
function sameValue(a: unknown, b: unknown): boolean {
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

/**
 * True when every field in `patch` already holds that value — clicking the
 * option that is already selected. Compared by value because the sidebar
 * rebuilds objects (`{ ...headingStyle, border }`) on every click.
 */
function changesNothing(doc: PosterDoc, patch: Partial<PosterDoc>): boolean {
  return (Object.keys(patch) as Array<keyof PosterDoc>).every((k) => sameValue(patch[k], doc[k]));
}

/**
 * True for the patch a text editor emits on every `input`: content and
 * nothing else. Anything wider is a deliberate edit, not a keystroke.
 */
function isKeystrokePatch(patch: Partial<Block>): boolean {
  const keys = Object.keys(patch);
  return keys.length === 1 && keys[0] === 'content';
}

export const usePosterStore = create<PosterStoreState>((set) => ({
  posterId: null,
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
    const seeded = options.seedAcknowledgement ? ensureAckBlock(doc) : doc;
    lockedBaseline = seeded.blocks.filter((b) => b.locked === true);
    set({
      posterId,
      doc: seeded,
      posterTitle: title ?? '',
      canUndo: false,
      canRedo: false,
    });
  },

  setPosterTitle: (posterTitle) => set({ posterTitle }),

  patchDoc: (patch, coalesceKey = null) =>
    set((state) => {
      if (!state.doc) return {};
      // Not an edit: no undo step, and a guest who changed nothing is not
      // asked to confirm leaving (useLeaveGuard arms on canUndo).
      if (changesNothing(state.doc, patch)) return {};
      const next = withUndo(state, (doc) => ({ ...doc, ...patch }), keyForThisRun(coalesceKey));
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

  addBlock: (block) =>
    set((state) =>
      withUndo(state, (doc) => ({
        ...doc,
        blocks: [...doc.blocks, block],
      })),
    ),

  updateBlock: (id, patch) =>
    set((state) =>
      withUndo(
        state,
        (doc) => ({
          ...doc,
          blocks: doc.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        }),
        // Only a content-only patch is a keystroke. A patch that also
        // moves or resizes is a discrete act and keeps its own entry —
        // otherwise a drag landing mid-burst would be swallowed by it.
        isKeystrokePatch(patch) ? `content:${id}` : undefined,
      ),
    ),

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
  undo: () =>
    set((state) => {
      if (undoStack.length === 0 || !state.doc) return {};
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
    }),

  redo: () =>
    set((state) => {
      if (redoStack.length === 0 || !state.doc) return {};
      undoStack = [...undoStack, state.doc].slice(-MAX_HISTORY);
      const next = redoStack[redoStack.length - 1]!;
      redoStack = redoStack.slice(0, -1);
      lastPush = null;
      return {
        doc: restoreFromHistory(state.doc, next),
        canUndo: true,
        canRedo: redoStack.length > 0,
      };
    }),
}));
