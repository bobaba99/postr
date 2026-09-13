/**
 * Poster store — Zustand with undo/redo.
 *
 * Single source of truth for the in-memory PosterDoc currently being
 * edited. All mutations are immutable. Undo/redo snapshots the `doc`
 * field on every change, maintaining two stacks capped at 50 entries.
 */
import { create } from 'zustand';
import { filterDeletable, preserveLocked } from '@/export/blockLock';
import { ensureAckBlock } from '@/export/ackBlock';
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
 * The locked blocks this poster was loaded with — the baseline the
 * lock is enforced against.
 *
 * Held separately from `doc` on purpose. Enforcing only against the
 * CURRENT doc means one state that has already lost the block (a doc
 * written by a build predating the guard, a hand-edited `.postr`, a
 * direct `setState` from a test or devtool) propagates that absence
 * forever: there is nothing left to restore from. Anchoring to the
 * load-time baseline makes the invariant self-healing instead.
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
 * user just MOVED keeps its new coordinates), then the load-time
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
  // advance it into one either.
  undo: () =>
    set((state) => {
      if (undoStack.length === 0 || !state.doc) return {};
      redoStack = [...redoStack, state.doc].slice(-MAX_HISTORY);
      const prev = undoStack[undoStack.length - 1]!;
      undoStack = undoStack.slice(0, -1);
      return {
        doc: {
          ...prev,
          // `guardLocked` consults the load-time baseline as well as
          // the current doc: if the block is ALREADY missing from
          // `state.doc` (a doc written by a build without this guard,
          // or restored from a hand-edited bundle), preserving against
          // current state alone would propagate that absence forever.
          blocks: guardLocked(state.doc.blocks, prev.blocks),
        },
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
      return {
        doc: {
          ...next,
          blocks: guardLocked(state.doc.blocks, next.blocks),
        },
        canUndo: true,
        canRedo: redoStack.length > 0,
      };
    }),
}));
