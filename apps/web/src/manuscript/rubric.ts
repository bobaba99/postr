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

/**
 * Q6 content-budget scaling.
 *
 * A stated slot length is the author telling us how much they will have
 * to say. A tight slot (a 3-minute lightning slot, ~3 slides) means the
 * poster should carry less text, not the same text in smaller type —
 * which is the same rule as everything else in this file.
 *
 * The scale is deliberately gentle and CLAMPED: the budgets in
 * POSTER_ROLE_SPECS are the rubric, and a questionnaire answer may
 * nudge them, never rewrite them. A poster must remain a poster at
 * every slot length.
 *
 * `null` (no constraint stated) always means scale 1 — the default is
 * the rubric untouched.
 */
export const REQUIREMENT_REFERENCE_SLIDES = 10;
export const MIN_BUDGET_SCALE = 0.7;
export const MAX_BUDGET_SCALE = 1;

export function budgetScaleForSlides(slideCount: number | null): number {
  if (slideCount === null || !Number.isFinite(slideCount) || slideCount <= 0) {
    return 1;
  }
  const raw = slideCount / REQUIREMENT_REFERENCE_SLIDES;
  return Math.min(MAX_BUDGET_SCALE, Math.max(MIN_BUDGET_SCALE, raw));
}

/**
 * A role's word budget under a stated slot constraint. Rounded to whole
 * words and floored at 20 so no panel can be scaled into uselessness.
 */
export function scaledBudget(budgetWords: number, scale: number): number {
  return Math.max(20, Math.round(budgetWords * scale));
}

// ─────────────────────────────────────────────────────────────────────
// Tier-based budget allocation
// ─────────────────────────────────────────────────────────────────────

/**
 * Word budgets are allocated BY TIER, not by fixed per-role numbers.
 *
 * POSTER_ROLE_SPECS remains the shape and the CEILING — the rubric still
 * governs what a poster is. Tiering decides only who gets SQUEEZED when
 * the Q6 slot is tight: tier 4 loses words before tier 2 does, because
 * tier 4 is the material that does not serve the core message.
 *
 * The multipliers are applied on top of the Q6 scale, so a generous slot
 * (scale 1) leaves every tier at its rubric budget and only a constrained
 * slot makes the hierarchy bite. That ordering matters: tiering must
 * never shrink a poster that had room for the full rubric.
 */
export const TIER_BUDGET_MULTIPLIERS: Readonly<Record<1 | 2 | 3 | 4, number>> = {
  1: 1,
  2: 1,
  3: 0.8,
  4: 0.5,
};

/**
 * A required role may never be starved to zero. Question, keyResult and
 * takeaway are the poster's spine — a poster missing any of them is not
 * a shorter poster, it is a broken one. This floor sits ABOVE the
 * general 20-word floor in `scaledBudget` for exactly that reason.
 */
export const REQUIRED_ROLE_MIN_WORDS = 25;

/**
 * A role's word budget under both the Q6 slot scale and its tier.
 *
 * Tiering only bites under SCARCITY. At scale 1 — no stated slot
 * constraint — every role keeps its full rubric budget regardless of
 * tier, because there is nothing to ration: the rubric already describes
 * a poster that fits. The hierarchy decides who gets squeezed when the
 * author's slot forces a choice, not what a poster is by default.
 *
 * Under scarcity the tier multiplier is interpolated by how tight the
 * slot is, so the squeeze arrives gradually rather than as a cliff at
 * the first minute shaved off. Order: scale (the author's constraint),
 * then tier (our judgement), then floor.
 *
 * The rubric ceiling is never exceeded — tiering only takes words away.
 */
export function tieredBudget(
  budgetWords: number,
  scale: number,
  tier: 1 | 2 | 3 | 4,
  required: boolean,
): number {
  // How far into the scarcity range we are: 0 at scale 1 (roomy),
  // 1 at MIN_BUDGET_SCALE (tightest slot the rubric allows). The range
  // is a non-zero constant (1 − 0.7), so no divide-by-zero guard.
  const scarcity = Math.min(
    1,
    Math.max(0, (MAX_BUDGET_SCALE - scale) / (MAX_BUDGET_SCALE - MIN_BUDGET_SCALE)),
  );
  const full = TIER_BUDGET_MULTIPLIERS[tier];
  const tierFactor = 1 - (1 - full) * scarcity;

  const scaled = budgetWords * scale * tierFactor;
  const floor = required ? REQUIRED_ROLE_MIN_WORDS : 20;
  return Math.min(budgetWords, Math.max(floor, Math.round(scaled)));
}

/** Reference list is trimmed to this many entries on the poster. */
export const POSTER_MAX_REFERENCES = 5;

/** Keep at most this many findings in the Key result role. */
export const POSTER_MAX_FINDINGS = 3;

/** Q5 pin limits: each pinned section gets its own small budget, and
 *  the poster physically holds at most two extra sections. When the
 *  user wants more, we say so plainly and let them choose what gives. */
export const MAX_PINNED_SECTIONS = 2;
export const PINNED_SECTION_BUDGET_WORDS = 60;

/**
 * Hard cap on the per-role source excerpt the mapper hands to the
 * condenser, in characters.
 *
 * MUST stay ≤ the API's `MAX_SOURCE_CHARS` (apps/api/src/narrative.ts).
 * The route rejects anything larger with a 400, so an unbounded mapper
 * would make long manuscripts fail at the network edge rather than
 * degrade gracefully. Trimming is the mapper's job anyway — cutting is
 * what this layer is for.
 *
 * 20k chars is ~3.5k words, far beyond any panel's 40–150 word budget,
 * so this only ever bites pathological input (a Methods section that
 * runs to thirty pages).
 */
export const MAX_ROLE_SOURCE_CHARS = 20_000;
