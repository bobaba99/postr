/**
 * Every browser-storage key the app writes, with its area and its writer.
 *
 * Shared by cookiesStorageInventory.test.ts (the Cookies Policy lists each
 * one, and a new writer fails there until it is listed) and
 * Profile.dangerZone.test.tsx (account deletion clears each one in the
 * browser that deletes; record 24, review round 1). Keeping the list in
 * one place is what ties the two together: a key added for the policy is
 * also checked by the deletion test.
 */
import { SHARING_ENABLED } from '@/config/features';

export type Area = 'localStorage' | 'sessionStorage';

export interface Writer {
  /** The key as the code writes it; a prefix for keys with an id suffix. */
  stored: string;
  area: Area;
  /** File under src that writes it. */
  file: string;
}

export const WRITERS: readonly Writer[] = [
  { stored: 'postr.onboarding-done', area: 'localStorage', file: 'components/OnboardingTour.tsx' },
  { stored: 'postr.style-presets', area: 'localStorage', file: 'poster/PosterEditor.tsx' },
  { stored: 'postr.style-presets', area: 'localStorage', file: 'components/PresetEditModal.tsx' },
  { stored: 'postr.custom-palettes', area: 'localStorage', file: 'poster/customPalettes.ts' },
  { stored: 'postr.cb-random-pref', area: 'localStorage', file: 'components/PaletteDesigner.tsx' },
  { stored: 'postr.checklist-templates', area: 'localStorage', file: 'poster/GuidelinesPanel.tsx' },
  { stored: 'postr.scratch-pad', area: 'localStorage', file: 'poster/GuidelinesPanel.tsx' },
  { stored: 'postr.scratch-note', area: 'localStorage', file: 'poster/GuidelinesPanel.tsx' },
  { stored: 'postr.profile', area: 'localStorage', file: 'profile/ProfileFields.tsx' },
  { stored: 'postr.welcome-seeded:', area: 'localStorage', file: 'data/seedWelcomePoster.ts' },
  { stored: 'postr.active-editor.', area: 'localStorage', file: 'hooks/useTwoTabGuard.ts' },
  { stored: 'postr.figure-script.', area: 'localStorage', file: 'poster/figureScriptDraft.ts' },
  { stored: 'postr.figure-script-page', area: 'sessionStorage', file: 'poster/figureScriptDraft.ts' },
  { stored: 'postr.figure-size-page', area: 'sessionStorage', file: 'poster/figureScriptDraft.ts' },
  { stored: 'postr.tab-id', area: 'sessionStorage', file: 'hooks/useTwoTabGuard.ts' },
  { stored: 'postr.signupConsent', area: 'sessionStorage', file: 'data/consent.ts' },
  { stored: 'postr.checkoutIntent', area: 'sessionStorage', file: 'data/checkoutIntent.ts' },
  { stored: 'postr.autoArrangeOnLoad', area: 'sessionStorage', file: 'components/ImportPosterModal.tsx' },
  { stored: 'postr-just-refreshed', area: 'sessionStorage', file: 'components/UpdateAvailableToast.tsx' },
  { stored: 'postr-acknowledged-build', area: 'sessionStorage', file: 'components/UpdateAvailableToast.tsx' },
  { stored: 'postr.mobile-notice-dismissed', area: 'sessionStorage', file: 'components/MobileNotice.tsx' },
];

/**
 * Writers the page may leave out, with the reason. The guest commenter
 * name is written only by the comments panel, which is not rendered
 * while sharing and comments are switched off (config/features.ts).
 */
export const UNREACHABLE_WRITERS: readonly Writer[] = SHARING_ENABLED
  ? []
  : [{ stored: 'postr.comment-name', area: 'localStorage', file: 'hooks/useComments.ts' }];
