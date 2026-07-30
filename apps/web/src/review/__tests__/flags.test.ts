import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isPresentationCheckerEditorEnabled,
  isReviewPptxEnabled,
} from '../flags';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Presentation Checker rollout flags', () => {
  it('defaults both public editor discovery and PPTX conversion off', () => {
    vi.stubEnv('VITE_ENABLE_PRESENTATION_CHECKER', '');
    vi.stubEnv('VITE_ENABLE_REVIEW_PPTX', '');

    expect(isPresentationCheckerEditorEnabled()).toBe(false);
    expect(isReviewPptxEnabled()).toBe(false);
  });

  it('requires the exact value true for each independent rollout', () => {
    vi.stubEnv('VITE_ENABLE_PRESENTATION_CHECKER', 'true');
    vi.stubEnv('VITE_ENABLE_REVIEW_PPTX', 'TRUE');

    expect(isPresentationCheckerEditorEnabled()).toBe(true);
    expect(isReviewPptxEnabled()).toBe(false);
  });
});
