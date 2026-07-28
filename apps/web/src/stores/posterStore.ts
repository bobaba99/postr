/**
 * Poster store — Zustand with undo/redo.
 *
 * Single source of truth for the in-memory PosterDoc currently being
 * edited. All mutations are immutable. Undo/redo snapshots the `doc`
 * field on every change, maintaining two stacks capped at 50 entries.
 */
import { create } from 'zustand';
import { filterDeletable, preserveLocked } from '@/export/blockLock';
import type {
  Block,
  Palette,
  PosterDoc,
  StyleLevel,
  TypeStyle,
} from '@postr/shared';

const MAX_HISTORY = 50;

export interface PosterStoreState {
  posterId: string | null;
  posterTitle: string;
  doc: PosterDoc | null;

  // Undo/redo
  canUndo: boolean;
  canRedo: boolean;

  setPoster: (posterId: string, doc: PosterDoc, title?: string) => void;
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

/** Push current doc onto undo stack, clear redo (new branch). */
function pushUndo(doc: PosterDoc) {
  undoStack = [...undoStack, doc].slice(-MAX_HISTORY);
  redoStack = [];
}

/**
 * Wrap a doc mutation: snapshot the current doc before applying,
 * then return the new state with updated canUndo/canRedo flags.
 */
function withUndo(
  state: PosterStoreState,
  fn: (doc: PosterDoc) => PosterDoc,
): Partial<PosterStoreState> {
  if (!state.doc) return {};
  pushUndo(state.doc);
  return {
    doc: fn(state.doc),
    canUndo: true,
    canRedo: false,
  };
}

export const usePosterStore = create<PosterStoreState>((set) => ({
  posterId: null,
  posterTitle: '',
  doc: null,
  canUndo: false,
  canRedo: false,

  setPoster: (posterId, doc, title) => {
    // Reset undo history when loading a new poster
    undoStack = [];
    redoStack = [];
    set({ posterId, doc, posterTitle: title ?? '', canUndo: false, canRedo: false });
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
      withUndo(state, (doc) => ({
        ...doc,
        blocks: doc.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      })),
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
        blocks: preserveLocked(doc.blocks, blocks),
      })),
    ),

  /** Set blocks WITHOUT pushing to undo — used for drag intermediates. */
  setBlocksSilent: (blocks: Block[]) =>
    set((state) => {
      if (!state.doc) return {};
      return {
        doc: { ...state.doc, blocks: preserveLocked(state.doc.blocks, blocks) },
      };
    }),

  // Undo/redo restore whole documents from the history stacks, which
  // is a second way to lose a locked block: a snapshot taken BEFORE
  // the acknowledgement was added contains no such block, and
  // restoring it would delete the block without any delete path
  // running. Both directions therefore re-apply `preserveLocked`
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
        doc: { ...prev, blocks: preserveLocked(state.doc.blocks, prev.blocks) },
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
        doc: { ...next, blocks: preserveLocked(state.doc.blocks, next.blocks) },
        canUndo: true,
        canRedo: redoStack.length > 0,
      };
    }),
}));
