/**
 * Presentation Checker rollout controls.
 *
 * Both features fail closed: unset, misspelled, or differently-cased values
 * remain disabled. The direct noindex route is intentionally independent of
 * the editor-discovery flag so owners can dogfood before public launch.
 */
export function isPresentationCheckerEditorEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_PRESENTATION_CHECKER === 'true';
}

export function isReviewPptxEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_REVIEW_PPTX === 'true';
}
