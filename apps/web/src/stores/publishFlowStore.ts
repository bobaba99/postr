/**
 * Publish-flow state machine — orchestrates the two-step modal
 * sequence (consent → metadata) that every publish path goes through.
 *
 * Hoisted to a global store so any component can kick off the flow
 * (dashboard card, editor toolbar, Profile page) without prop drilling.
 */
import { create } from 'zustand';

type Step = 'closed' | 'consent' | 'metadata';

interface PublishFlowStore {
  step: Step;
  posterId: string | null;
  posterTitle: string | null;
  /**
   * Start the flow for an existing Postr poster. Poster id is stored
   * on the gallery entry so the gallery view can mark it as
   * "created in Postr".
   */
  openForPoster: (posterId: string, posterTitle: string) => void;
  /**
   * Start the flow for an external PDF / image upload — no poster id.
   */
  openForUpload: () => void;
  /** Consent accepted → advance to the metadata form. */
  advanceToMetadata: () => void;
  close: () => void;
}

export const usePublishFlowStore = create<PublishFlowStore>((set) => ({
  step: 'closed',
  posterId: null,
  posterTitle: null,
  openForPoster: (posterId, posterTitle) =>
    set({ step: 'consent', posterId, posterTitle }),
  openForUpload: () =>
    set({ step: 'consent', posterId: null, posterTitle: null }),
  advanceToMetadata: () => set({ step: 'metadata' }),
  close: () => set({ step: 'closed', posterId: null, posterTitle: null }),
}));
