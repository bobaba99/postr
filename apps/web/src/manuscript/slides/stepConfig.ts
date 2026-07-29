/**
 * stepConfig — the ordered wizard step list and their labels (spec §2).
 *
 * The wizard is one surface with a fixed spine: constraints → star-finding
 * → figures/tables → narrative → visuals & notes → tweaks. The order here
 * is authoritative: the step-bar renders in this order, completion is
 * derived from position in it, and the progress bar counts against its
 * length. Keep it in sync with the turn sequence in spec §2.
 */
export const WIZARD_STEPS = [
  'constraints',
  'starFinding',
  'figures',
  'narrative',
  'visualsNotes',
  'tweaks',
] as const;

export type StepId = (typeof WIZARD_STEPS)[number];

export const STEP_LABELS: Record<StepId, string> = {
  constraints: 'Constraints',
  starFinding: 'Star finding',
  figures: 'Figures & tables',
  narrative: 'Narrative',
  visualsNotes: 'Visuals & notes',
  tweaks: 'Tweaks',
};
