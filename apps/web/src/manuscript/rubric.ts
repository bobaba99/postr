/**
 * The narrative rubric — docs/plans/2026-07-27-manuscript-pipeline.md §2
 * encoded as DATA.
 *
 * Every output section has a HARD word budget. When the source exceeds
 * it, we cut — we never shrink the type to fit. Type size is a
 * print-legibility constraint owned by the readability checker and is
 * not negotiable by the narrative layer. That single rule is what
 * separates this pipeline from proportional-summarisation tools.
 *
 * The budgets here are injected into the condenser prompt as data and
 * enforced deterministically after the LLM replies. Change them here,
 * nowhere else.
 */
import type { NarrativeRoleId } from '@postr/shared';

export interface RoleSpec {
  /** Hard word budget for the condensed text. */
  budgetWords: number;
  /** Never dropped. A missing required role is flagged to the user. */
  required: boolean;
  /** Heading text used on the generated poster. */
  displayHeading: string;
  /** One-line description shown on the outline card. */
  descriptor: string;
}

/** The five-role poster spine, in reading order. Total body budget
 *  ≈ 390 words against the ~800-word ceiling conference guidance
 *  implies — the gap is deliberate: figures and whitespace get the
 *  rest. */
export const POSTER_ROLE_SPECS: Record<NarrativeRoleId, RoleSpec> = {
  hook: {
    budgetWords: 40,
    required: false,
    displayHeading: 'Background',
    descriptor: 'Why anyone should care',
  },
  question: {
    budgetWords: 60,
    required: true,
    displayHeading: 'Research Question',
    descriptor: 'The actual question or hypothesis',
  },
  methods: {
    budgetWords: 80,
    required: false,
    displayHeading: 'Methods',
    descriptor: 'Only what is needed to trust the result',
  },
  keyResult: {
    budgetWords: 150,
    required: true,
    displayHeading: 'Key Findings',
    descriptor: 'Figure-led, 1-3 findings max',
  },
  takeaway: {
    budgetWords: 60,
    required: true,
    displayHeading: 'Take-Home Message',
    descriptor: 'What changes now',
  },
};

/** Poster reading order for the five roles. */
export const POSTER_ROLE_ORDER: NarrativeRoleId[] = [
  'hook',
  'question',
  'methods',
  'keyResult',
  'takeaway',
];

/** Reference list is trimmed to this many entries on the poster. */
export const POSTER_MAX_REFERENCES = 5;

/** Keep at most this many findings in the Key result role. */
export const POSTER_MAX_FINDINGS = 3;

/** Q5 pin limits: each pinned section gets its own small budget, and
 *  the poster physically holds at most two extra sections. When the
 *  user wants more, we say so plainly and let them choose what gives. */
export const MAX_PINNED_SECTIONS = 2;
export const PINNED_SECTION_BUDGET_WORDS = 60;
