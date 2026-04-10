/**
 * Poster store — Zustand with undo/redo.
 *
 * Single source of truth for the in-memory PosterDoc currently being
 * edited. All mutations are immutable. Undo/redo snapshots the `doc`
 * field on every change, maintaining two stacks capped at 50 entries.
 */
import { create } from 'zustand';
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

  removeBlock: (id) =>
    set((state) =>
      withUndo(state, (doc) => ({
        ...doc,
        blocks: doc.blocks.filter((b) => b.id !== id),
      })),
    ),

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

  setBlocks: (blocks) =>
    set((state) => withUndo(state, (doc) => ({ ...doc, blocks }))),

  /** Set blocks WITHOUT pushing to undo — used for drag intermediates. */
  setBlocksSilent: (blocks: Block[]) =>
    set((state) => {
      if (!state.doc) return {};
      return { doc: { ...state.doc, blocks } };
    }),

  undo: () =>
    set((state) => {
      if (undoStack.length === 0 || !state.doc) return {};
      redoStack = [...redoStack, state.doc].slice(-MAX_HISTORY);
      const prev = undoStack[undoStack.length - 1]!;
      undoStack = undoStack.slice(0, -1);
      return {
        doc: prev,
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
        doc: next,
        canUndo: true,
        canRedo: redoStack.length > 0,
      };
    }),
}));
