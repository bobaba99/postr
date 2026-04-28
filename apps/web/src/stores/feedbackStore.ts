/**
 * Feedback modal state.
 *
 * Global because the modal is triggered from Dashboard, Profile, and
 * About pages — hoisting to a store lets any component open it without
 * prop-drilling a setter through every layout.
 *
 * Optional `context` lets a caller (e.g., a failed import flow)
 * pre-populate the modal with diagnostic data: the file the user
 * tried to upload + the captured console log + a starter title/body.
 * The modal previews the context so the user can see exactly what
 * gets sent before clicking Send.
 */
import { create } from 'zustand';
import type { FeedbackKind } from '@/data/feedback';

export interface FeedbackContext {
  /** Pre-fills the title field (the user can still edit). */
  title?: string;
  /** Pre-fills the body field (the user can still edit). */
  body?: string;
  /** A file the user uploaded that triggered the issue. Will be
   *  stored under `poster-assets/{userId}/feedback/...` and the
   *  resulting path is appended to the feedback row. */
  attachment?: File | null;
  /** A captured console-log blob (typically from `getCapturedLog`).
   *  Appended to the body when the user submits. */
  log?: string;
}

interface FeedbackStore {
  isOpen: boolean;
  initialKind: FeedbackKind;
  context: FeedbackContext | null;
  open: (kind?: FeedbackKind, context?: FeedbackContext) => void;
  close: () => void;
}

export const useFeedbackStore = create<FeedbackStore>((set) => ({
  isOpen: false,
  initialKind: 'feature',
  context: null,
  open: (kind = 'feature', context = undefined) =>
    set({ isOpen: true, initialKind: kind, context: context ?? null }),
  close: () => set({ isOpen: false, context: null }),
}));
