/**
 * Rubric v1 — the Presentation Checker's criteria as versioned CONFIG
 * (spec §2.0). prompt.ts composes the system prompt FROM this data; the
 * §7 validation harness reuses ISSUE_CATEGORIES so expert checklists and
 * the checker's Finding categories can never drift. Adding an
 * expert-derived criterion = a new entry here (+ optional new
 * ISSUE_CATEGORIES value) + re-running the frozen corpus. No engine change.
 *
 * Provenance strings cite spec §9 (research grounding, 2026-07-29) or the
 * house style agreed in the 2026-07-29 brainstorm ("house style").
 */

export const RUBRIC_VERSION = 'rubric.v1' as const;

export const ISSUE_CATEGORIES = [
  'buried-key-result',
  'over-emphasis',
  'redundant-text',
  'competing-elements',
  'wall-of-text',
  'decorative-hijack',
  'no-takeaway',
  'figure-text-disconnect',
  'jargon-mismatch',
  'claims-evidence-gap',
  'section-imbalance',
  'readability-at-distance',
] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export type ReviewDimension = 'narrative' | 'design' | 'content';

export interface RubricRule {
  /** Stable id, rendered into the prompt so findings can be traced to rules. */
  id: string;
  text: string;
  /** Research citation (spec §9) or "house style". */
  provenance: string;
  dimensions: ReviewDimension[];
  /** The checklist category a violation of this rule maps to, if any. */
  checklistCategory: IssueCategory | null;
}

export interface DimensionDefinition {
  dimension: ReviewDimension;
  name: string;
  /** Score anchors for 1, 3, 5 on the 1–5 scale. */
  anchors: { low: string; mid: string; high: string };
}

export const PERCEPTION_RULES: RubricRule[] = [
  {
    id: 'perc-entry-salience',
    text: 'Figures and plots capture the first fixation fastest: image-rich areas have shorter time-to-first-fixation than text. Identify the most salient visual before reasoning about anything else.',
    provenance: 'Galibourg 2026; Grabowska-Chenczke 2026 (pictures fixated 3–7× faster than logos); Wang 2019',
    dimensions: ['design'],
    checklistCategory: null,
  },
  {
    id: 'perc-entry-competition',
    text: 'The entry point is not always a figure: on text-heavy layouts the headline can be the entry point, and center-placed content dominates. Predict the ACTUAL first fixation from the competition; never assume figure-first.',
    provenance: 'Konovalova 2023; Wianto 2025',
    dimensions: ['design'],
    checklistCategory: null,
  },
  {
    id: 'perc-faces-override',
    text: 'Faces, photos and social icons are strong attention magnets that pull gaze regardless of layout intent — faces are fixated with >80% probability within the first two fixations and social cues override low-level saliency. Flag any face or photo as a predicted hotspot and judge whether it earns that pull.',
    provenance: 'McKay 2021 (423-effect gaze-cueing meta-analysis); Cerf 2007; Flechsenhar 2017',
    dimensions: ['design'],
    checklistCategory: 'decorative-hijack',
  },
  {
    id: 'perc-emphasis-dose',
    text: 'Emphasis (bold, color, size jumps) captures attention as a DOSE effect: light signaling helps, heavy signaling kills the benefit — everything emphasized means nothing is. Flag over-emphasis competition, never the mere presence of bold.',
    provenance: 'Wu 2023; Lorch 1995; Fitzsimmons 2019; Osipenko 2023',
    dimensions: ['design'],
    checklistCategory: 'over-emphasis',
  },
  {
    id: 'perc-reading-path',
    text: 'Predict the likely scan order across sections before judging. The predicted path — a free-viewing, first-impression pass — is the evidence every narrative judgment must cite.',
    provenance: 'house style; free-viewing framing per Polatsek 2018 (bottom-up saliency poorly predicts task-based viewing)',
    dimensions: ['narrative', 'design'],
    checklistCategory: null,
  },
  {
    id: 'perc-figure-text-link',
    text: 'Signaling that links a figure to its explaining text improves comprehension. A figure disconnected from its text is a NARRATIVE failure, not just a design one.',
    provenance: 'Scheiter 2015; Richter 2016 (meta-analysis)',
    dimensions: ['narrative'],
    checklistCategory: 'figure-text-disconnect',
  },
];

export const ECONOMY_RULES: RubricRule[] = [
  {
    id: 'econ-lens',
    text: 'Economy is the top-level lens: ask what can be removed or shown instead of told, never what is missing. Save space for the take-away message and the important plots.',
    provenance: 'house style 2026-07-29',
    dimensions: ['narrative', 'design', 'content'],
    checklistCategory: null,
  },
  {
    id: 'econ-plots-carry',
    text: 'Plots and tables carry the story; prose explains only what the visual cannot. Flag detailed text that merely narrates what a figure already shows and recommend cutting it.',
    provenance: 'house style 2026-07-29',
    dimensions: ['narrative'],
    checklistCategory: 'redundant-text',
  },
  {
    id: 'econ-visual-over-text',
    text: 'Visual emphasis replaces text: circles, highlight, and gray/shadow de-emphasis are space-saving devices. Suggest them to reduce text — subject to the emphasis-dose limit (perc-emphasis-dose).',
    provenance: 'house style 2026-07-29',
    dimensions: ['design'],
    checklistCategory: null,
  },
  {
    id: 'econ-one-takeaway',
    text: 'One take-away message per slide or section — subordinate to economy. The core result gets the space; everything else is mentioned only when necessary.',
    provenance: 'house style 2026-07-29',
    dimensions: ['narrative'],
    checklistCategory: 'no-takeaway',
  },
  {
    id: 'econ-forced-priority',
    text: 'Forced prioritization is a first-class output: when two elements both compete as primary (e.g. two tables), you MUST pick one as primary and recommend the other be summarized in-text or demoted to supplementary/appendix ("available if someone asks about the details"). Say so explicitly — ranking under a space budget is the job; do not cop out.',
    provenance: 'house style 2026-07-29',
    dimensions: ['narrative', 'design'],
    checklistCategory: 'competing-elements',
  },
];

export const DIMENSIONS: DimensionDefinition[] = [
  {
    dimension: 'narrative',
    name: 'Narrative',
    anchors: {
      low: 'No recoverable storyline; the key result is unreachable from the predicted scan path.',
      mid: 'Story recoverable with effort; the result is present but does not land early.',
      high: 'The eye lands on the key result early; hook → question → method → result → takeaway is recoverable; every figure connects to its explaining text.',
    },
  },
  {
    dimension: 'design',
    name: 'Design',
    anchors: {
      low: 'Over-emphasis competition or wall of text; nothing is readable at distance.',
      mid: 'Hierarchy present but contested; emphasis mostly dosed; some distance-legibility issues.',
      high: 'One clear entry point onto the core result; emphasis spent only where it buys attention; legible at poster distance.',
    },
  },
  {
    dimension: 'content',
    name: 'Content',
    anchors: {
      low: 'Jargon walls, unsupported claims, or missing evidence for the central claim.',
      mid: 'Mostly audience-appropriate; some claims under-evidenced or sections unbalanced.',
      high: 'Right register for the audience; every claim tied to evidence shown; balanced sections.',
    },
  },
];

export interface Rubric {
  version: typeof RUBRIC_VERSION;
  issueCategories: typeof ISSUE_CATEGORIES;
  perceptionRules: RubricRule[];
  economyRules: RubricRule[];
  dimensions: DimensionDefinition[];
}

export const RUBRIC_V1: Rubric = {
  version: RUBRIC_VERSION,
  issueCategories: ISSUE_CATEGORIES,
  perceptionRules: PERCEPTION_RULES,
  economyRules: ECONOMY_RULES,
  dimensions: DIMENSIONS,
};
