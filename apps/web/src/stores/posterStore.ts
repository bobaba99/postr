/**
 * Poster store — Zustand.
 *
 * Single source of truth for the in-memory PosterDoc currently being
 * edited. All mutations are immutable: we never reach into a block
 * and mutate it in place. New objects all the way down.
 *
 * The store knows nothing about persistence — Phase 4 layers an
 * autosave hook on top by subscribing to store changes.
 */
import { create } from 'zustand';
import type {
  Block,
  Palette,
  PosterDoc,
  StyleLevel,
  TypeStyle,
} from '@postr/shared';

export interface PosterStoreState {
  /** UUID of the poster row in Supabase, or null when nothing loaded. */
  posterId: string | null;
  /** Current in-memory document, or null when nothing loaded. */
  doc: PosterDoc | null;

  setPoster: (posterId: string, doc: PosterDoc) => void;
  addBlock: (block: Block) => void;
  updateBlock: (id: string, patch: Partial<Block>) => void;
  removeBlock: (id: string) => void;
  setStyle: (level: StyleLevel, patch: Partial<TypeStyle>) => void;
  setPalette: (palette: Palette) => void;
  setFont: (fontFamily: string) => void;
}

/** Replace `doc` only when it is non-null; pass-through otherwise. */
function withDoc(
  state: PosterStoreState,
  fn: (doc: PosterDoc) => PosterDoc,
): Partial<PosterStoreState> {
  if (!state.doc) return {};
  return { doc: fn(state.doc) };
}

export const usePosterStore = create<PosterStoreState>((set) => ({
  posterId: null,
  doc: null,

  setPoster: (posterId, doc) => set({ posterId, doc }),

  addBlock: (block) =>
    set((state) =>
      withDoc(state, (doc) => ({
        ...doc,
        blocks: [...doc.blocks, block],
      })),
    ),

  updateBlock: (id, patch) =>
    set((state) =>
      withDoc(state, (doc) => ({
        ...doc,
        blocks: doc.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      })),
    ),

  removeBlock: (id) =>
    set((state) =>
      withDoc(state, (doc) => ({
        ...doc,
        blocks: doc.blocks.filter((b) => b.id !== id),
      })),
    ),

  setStyle: (level, patch) =>
    set((state) =>
      withDoc(state, (doc) => ({
        ...doc,
        styles: {
          ...doc.styles,
          [level]: { ...doc.styles[level], ...patch },
        },
      })),
    ),

  setPalette: (palette) =>
    set((state) => withDoc(state, (doc) => ({ ...doc, palette }))),

  setFont: (fontFamily) =>
    set((state) => withDoc(state, (doc) => ({ ...doc, fontFamily }))),
}));
