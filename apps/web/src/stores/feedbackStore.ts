/**
 * Feedback modal state.
 *
 * Global because the modal is triggered from Dashboard, Profile, and
 * About pages — hoisting to a store lets any component open it without
 * prop-drilling a setter through every layout.
 */
import { create } from 'zustand';
import type { FeedbackKind } from '@/data/feedback';

interface FeedbackStore {
  isOpen: boolean;
  initialKind: FeedbackKind;
  open: (kind?: FeedbackKind) => void;
  close: () => void;
}

export const useFeedbackStore = create<FeedbackStore>((set) => ({
  isOpen: false,
  initialKind: 'feature',
  open: (kind = 'feature') => set({ isOpen: true, initialKind: kind }),
  close: () => set({ isOpen: false }),
}));
