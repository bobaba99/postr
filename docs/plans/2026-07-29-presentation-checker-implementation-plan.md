# Presentation Checker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Postr's Presentation Checker — a standalone reviewer for research posters and talks that returns per-dimension scores plus anchored, personalized fix-cards, validated against Gavin's ratings before and after the build (spec §7).

**Architecture:** Phase 0 (validation spike) first: frozen 20-poster corpus + Gavin's ground-truth ratings + a throwaway prompt-only prototype, so architecture risk is retired before the build. Then the production pipeline: client ingest normalizes any input (Postr poster / PDF / PPTX / image) to high-res page images; an Express `review` module (mirroring `narrative/`'s config/prompt/critique/enforce shape, Anthropic forced tool-use + Zod like `extractStyle.ts`) runs the two-stage perceive→judge critique composed from a versioned rubric; Supabase holds `poster_reviews` + review credits following the existing server-owned-billing-column pattern.

**Tech Stack:** TypeScript monorepo (npm workspaces, Node 22) — apps/web (React 19 + Vite + react-router 8 + vitest/jsdom), apps/api (Express 4 + @anthropic-ai/sdk 0.30 + zod 3.23 + vitest/supertest), packages/shared (TS-source types only), Supabase (Postgres 17 + pgTAP + Storage `poster-assets`).

**Spec:** `docs/plans/2026-07-29-presentation-checker-review.md` — currently on branch `docs/presentation-checker-spec-clean` (pushed); lands on main when that branch merges. Section references (§N) below point into it.

## Global Constraints

Every task implicitly includes these (values verbatim from the spec):

- **Hard page cap: ≤ 24 pages.** Over the cap → typed error → user message, let them trim. **Never silently truncate** (§1).
- **No streaming** anywhere; model id isolated in `apps/api/src/review/config.ts` (§2 Model).
- **Naming:** URL, table, and code names use "review" / "checker", **never "feedback"** (`poster_comments` and the `feedback` table are different features, §1 naming trap). User-facing copy names the *workflow* ("get feedback on your poster / talk"), **never "AI"** (framing rule, spec header).
- **Advisory only** — no auto-mutation of the artifact; every finding carries a personalized, content-specific `example` (§1, §4.5).
- **Rubric is versioned config** (§2.0): criteria live in `apps/api/src/review/rubric/` as typed data; `prompt.ts` composes from it; the issue taxonomy is the single source shared with the §7 validation harness; the rubric version is stamped into every `poster_reviews` row (`source_meta.rubric_version`).
- **Economy bias in the schema** (§4.5): `action` enum dominated by cut/demote/show-visually; `'add'` is the marked-rare case.
- **No credit consumed on ingest or model failure** (§3, §5.3). The follow-up is included in the initial credit — no second decrement, no second weekly slot (§5.3).
- **`closed` is terminal**, enforced server-side by the route, not just hidden in UI (§5.2). Up-front disclosure before the follow-up runs is a hard requirement.
- **Review-pack credits never expire** (§5.3).
- Repo conventions: ESM imports in apps/api use `.js` suffixes; the API imports **types only** from `@postr/shared` (runtime values break `node dist` — see `extractStyle.ts:22-29`); tests are vitest in both apps, pgTAP via `npm run db:test`; commit messages follow `feat(scope): …` style.

## Working-directory rules (from the handoff — hard requirements)

- All work happens in the worktree **`/Users/zihaogeng/development/postr-presentation-checker`** on branch **`feat/presentation-checker`** (already created off `origin/main`). Every command below assumes this as CWD unless stated otherwise.
- **Never** commit, stash, discard, or switch branches in `/Users/zihaogeng/development/postr` (the main working directory — it holds other sessions' uncommitted work). Never touch branches `docs/presentation-checker-spec`, `feat/talk-extraction-layer`, `docs/paper-to-slides-consolidation`, `feat/account-first-checkout-flow`, or the other worktrees.
- Phase 0 artifacts live in `docs/plans/experiments/presentation-checker/` **inside the worktree** (not the main dir, so they can be committed on `feat/presentation-checker`).

## Preflight (do once, before Task 1)

- [ ] **Step P1: Install dependencies in the worktree**

```bash
cd /Users/zihaogeng/development/postr-presentation-checker
npm ci
```

Expected: workspaces install; `node_modules/.bin/vitest`, `tsx`, `@anthropic-ai/sdk`, `zod` all resolve from the worktree root.

- [ ] **Step P2: Baseline green**

```bash
npm test --workspace=apps/api
npm test --workspace=apps/web
npm run build
```

Expected: all pass on the untouched `origin/main` tree. (pgTAP needs Docker: `npm run db:start` then `npm run db:test` — required from Task 8 on.)

- [ ] **Step P2b: Web test env (machine-local)**

`apps/web/src/lib/supabase.ts` throws at module load without `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`, and `apps/web/.env` is untracked (it lives only in the main checkout, which is off-limits). Create a fresh `apps/web/.env` in the worktree with the same placeholder values CI uses (`.github/workflows/ci.yml` web job, `ci.yml:33-34`) plus `VITE_API_BASE_URL=http://localhost:8787`. Without this, every `npm test --workspace=apps/web` run fails at import time.

- [ ] **Step P2c: Known pre-existing pgTAP red (do not be surprised)**

`supabase/tests/billing_plan_test.sql`'s three guard-message assertions on main still expect the original 4-column message — they were never updated when later migrations extended `guard_billing_columns()` to 7 columns, so `npm run db:test` is very likely already red on main. Task 8 realigns those assertions to the final 10-column message as part of its migration.

- [ ] **Step P3: Phase-0 secret**

Phase 0's prototype and the Milestone 6 gate call the live model: `export ANTHROPIC_API_KEY=...` in the shell that runs those scripts (same key the API uses for `import.ts`).

---

# MILESTONE 1 — Phase 0: validation spike (spec §7.1)

**Purpose:** retire architecture risk before the build. Deliverables: the versioned rubric (permanent, at its final home), the frozen 20-poster corpus, Gavin's ground-truth ratings, a throwaway prompt-only prototype, agreement metrics, and a go/no-go gate doc with early token-cost numbers.

Two kinds of files: **permanent** pure modules under `apps/api/src/review/` (rubric, agreement metrics — the production build and the §7 harness share them, satisfying §2.0's single-source rule) and **throwaway** harness scripts under `docs/plans/experiments/presentation-checker/` (never imported by shipped code).

### Task 1: Versioned rubric module (`review/rubric/`)

**Files:**
- Create: `apps/api/src/review/rubric/v1.ts`
- Create: `apps/api/src/review/rubric/index.ts`
- Test: `apps/api/src/__tests__/reviewRubric.test.ts`

**Interfaces:**
- Consumes: nothing (first module).
- Produces: `ISSUE_CATEGORIES` (readonly tuple), `IssueCategory`, `ReviewDimension`, `RubricRule`, `DimensionDefinition`, `Rubric`, `RUBRIC_V1`; `CURRENT_RUBRIC`, `CURRENT_RUBRIC_VERSION` from `index.ts`. Tasks 2, 3, 4, 5, 9, 11, 13 rely on these names.

- [ ] **Step 1: Write the failing test**

`apps/api/src/__tests__/reviewRubric.test.ts`:

```ts
/**
 * The rubric is versioned CONFIG (spec §2.0): criteria as typed data with
 * research/expert provenance, a version stamp, and an issue taxonomy shared
 * with the §7 validation harness. These tests pin the v1 content's shape so
 * prompt composition (Task 11) and the harness can rely on it.
 */
import { describe, it, expect } from 'vitest';
import {
  RUBRIC_V1,
  ISSUE_CATEGORIES,
  PERCEPTION_RULES,
  ECONOMY_RULES,
  DIMENSIONS,
} from '../review/rubric/v1.js';
import { CURRENT_RUBRIC, CURRENT_RUBRIC_VERSION } from '../review/rubric/index.js';

describe('rubric v1', () => {
  it('is the current rubric and carries a version stamp', () => {
    expect(CURRENT_RUBRIC).toBe(RUBRIC_V1);
    expect(CURRENT_RUBRIC_VERSION).toBe('rubric.v1');
    expect(RUBRIC_V1.version).toBe('rubric.v1');
  });

  it('taxonomy covers the seven seeded failure modes of spec §7.2', () => {
    for (const seeded of [
      'buried-key-result',
      'over-emphasis',
      'redundant-text',
      'competing-elements',
      'wall-of-text',
      'decorative-hijack',
      'no-takeaway',
    ]) {
      expect(ISSUE_CATEGORIES).toContain(seeded);
    }
  });

  it('every rule has a unique id, text, and provenance', () => {
    const all = [...PERCEPTION_RULES, ...ECONOMY_RULES];
    const ids = all.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of all) {
      expect(rule.text.length).toBeGreaterThan(20);
      expect(rule.provenance.length).toBeGreaterThan(0);
      expect(rule.dimensions.length).toBeGreaterThan(0);
    }
  });

  it('perception rules encode the §4.1 pass and economy rules the §4.3 lens', () => {
    expect(PERCEPTION_RULES.map((r) => r.id)).toEqual(
      expect.arrayContaining([
        'perc-entry-salience',
        'perc-entry-competition',
        'perc-faces-override',
        'perc-emphasis-dose',
        'perc-reading-path',
        'perc-figure-text-link',
      ]),
    );
    expect(ECONOMY_RULES.map((r) => r.id)).toEqual(
      expect.arrayContaining([
        'econ-lens',
        'econ-plots-carry',
        'econ-visual-over-text',
        'econ-one-takeaway',
        'econ-forced-priority',
      ]),
    );
  });

  it('defines the three scoring dimensions with 1/3/5 anchors', () => {
    expect(DIMENSIONS.map((d) => d.dimension)).toEqual([
      'narrative',
      'design',
      'content',
    ]);
    for (const d of DIMENSIONS) {
      expect(d.anchors.low.length).toBeGreaterThan(10);
      expect(d.anchors.mid.length).toBeGreaterThan(10);
      expect(d.anchors.high.length).toBeGreaterThan(10);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/api -- reviewRubric`
Expected: FAIL — module `../review/rubric/v1.js` does not exist.

- [ ] **Step 3: Write the rubric**

`apps/api/src/review/rubric/v1.ts`:

```ts
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
```

`apps/api/src/review/rubric/index.ts`:

```ts
/**
 * The current rubric pointer. A v2 rubric lands as `v2.ts` beside `v1.ts`;
 * this file switches CURRENT_RUBRIC to it. Historical reviews stay pinned
 * to their stamped `source_meta.rubric_version`.
 */
export { RUBRIC_V1 as CURRENT_RUBRIC, RUBRIC_VERSION as CURRENT_RUBRIC_VERSION } from './v1.js';
export type {
  IssueCategory,
  ReviewDimension,
  RubricRule,
  DimensionDefinition,
  Rubric,
} from './v1.js';
export { ISSUE_CATEGORIES, PERCEPTION_RULES, ECONOMY_RULES, DIMENSIONS } from './v1.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/api -- reviewRubric`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/review/rubric apps/api/src/__tests__/reviewRubric.test.ts
git commit -m "feat(review): versioned rubric v1 — perception + economy rules, shared issue taxonomy"
```

### Task 2: Agreement metrics module (`review/agreement.ts`)

**Files:**
- Create: `apps/api/src/review/agreement.ts`
- Test: `apps/api/src/__tests__/reviewAgreement.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `weightedKappa(a, b, levels?)`, `spearmanRho(a, b)`, `ChecklistVerdict`, `checklistPrf(gold, predicted, categories)`, `Prf`, `seededCatchRate(seededIssues, predicted)`. Task 6 and Task 28 consume these.

- [ ] **Step 1: Write the failing test**

`apps/api/src/__tests__/reviewAgreement.test.ts`:

```ts
/**
 * §7.4 agreement metrics — pure functions shared by the Phase-0 analysis
 * CLI and the Milestone-6 pre-ship gate. Exact-value cases only.
 */
import { describe, it, expect } from 'vitest';
import {
  weightedKappa,
  spearmanRho,
  checklistPrf,
  seededCatchRate,
} from '../review/agreement.js';

describe('weightedKappa (quadratic)', () => {
  it('is 1 for perfect agreement', () => {
    expect(weightedKappa([1, 3, 5, 2], [1, 3, 5, 2], 5)).toBeCloseTo(1, 10);
  });

  it('is 0 when one rater is constant (agreement no better than chance)', () => {
    // Constant rater: expected weighted disagreement equals observed.
    expect(weightedKappa([3, 3, 3, 3], [1, 2, 4, 5], 5)).toBeCloseTo(0, 10);
  });

  it('is negative for systematic disagreement', () => {
    const k = weightedKappa([1, 1, 5, 5], [5, 5, 1, 1], 5);
    expect(k).toBeLessThan(0);
  });

  it('rejects length mismatch', () => {
    expect(() => weightedKappa([1], [1, 2], 5)).toThrow();
  });
});

describe('spearmanRho', () => {
  it('is 1 for identical rankings, -1 for reversed', () => {
    expect(spearmanRho([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 10);
    expect(spearmanRho([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 10);
  });

  it('handles ties with average ranks', () => {
    // a has one tie pair; result must be strictly below 1.
    const rho = spearmanRho([1, 2, 2, 4], [1, 2, 3, 4]);
    expect(rho).toBeGreaterThan(0.9);
    expect(rho).toBeLessThan(1);
  });
});

describe('checklistPrf (micro-averaged)', () => {
  const categories = ['buried-key-result', 'wall-of-text'] as const;

  it('counts tp/fp/fn exactly', () => {
    const gold = [{ 'buried-key-result': true, 'wall-of-text': false }];
    const pred = [{ 'buried-key-result': true, 'wall-of-text': true }];
    const r = checklistPrf(gold, pred, categories);
    expect(r.tp).toBe(1);
    expect(r.fp).toBe(1);
    expect(r.fn).toBe(0);
    expect(r.precision).toBeCloseTo(0.5, 10);
    expect(r.recall).toBeCloseTo(1, 10);
    expect(r.f1).toBeCloseTo(2 / 3, 10);
  });

  it('returns zeros when nothing is flagged anywhere', () => {
    const r = checklistPrf([{ 'buried-key-result': false }], [{ 'buried-key-result': false }], categories);
    expect(r).toMatchObject({ tp: 0, fp: 0, fn: 0, precision: 0, recall: 0, f1: 0 });
  });
});

describe('seededCatchRate', () => {
  it('counts only seeded items, skipping strong posters', () => {
    const seeded = ['buried-key-result', null, 'wall-of-text'];
    const pred = [
      { 'buried-key-result': true },
      { 'buried-key-result': true }, // strong poster: ignored even if flagged
      { 'wall-of-text': false },
    ];
    const r = seededCatchRate(seeded, pred);
    expect(r).toEqual({ caught: 1, total: 2, rate: 0.5 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/api -- reviewAgreement`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the metrics**

`apps/api/src/review/agreement.ts`:

```ts
/**
 * §7.4 inter-rater agreement metrics (Gavin vs checker, later: expert
 * panel). Pure and deterministic — the Phase-0 analysis CLI and the
 * pre-ship gate (Task 28) both consume these, so agreement numbers are
 * always computed the same way.
 */

/** Quadratic-weighted Cohen's kappa for ordinal scores (e.g. 1–5). */
export function weightedKappa(a: number[], b: number[], levels = 5): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error('weightedKappa: equal non-empty inputs required');
  }
  const n = a.length;
  const norm = (levels - 1) ** 2;
  const histA = new Array<number>(levels).fill(0);
  const histB = new Array<number>(levels).fill(0);
  let observed = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    histA[x - 1]!++;
    histB[y - 1]!++;
    observed += ((x - y) ** 2) / norm;
  }
  observed /= n;
  let expected = 0;
  for (let i = 0; i < levels; i++) {
    for (let j = 0; j < levels; j++) {
      expected += (histA[i]! / n) * (histB[j]! / n) * (((i - j) ** 2) / norm);
    }
  }
  if (expected === 0) return observed === 0 ? 1 : 0;
  return 1 - observed / expected;
}

function ranks(xs: number[]): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((p, q) => p.x - q.x);
  const r = new Array<number>(xs.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]!.x === order[i]!.x) j++;
    const avg = (i + j) / 2 + 1; // average rank, 1-based
    for (let k = i; k <= j; k++) r[order[k]!.i] = avg;
    i = j + 1;
  }
  return r;
}

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

/** Spearman's rho with average ranks for ties. */
export function spearmanRho(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) {
    throw new Error('spearmanRho: equal inputs of length ≥ 2 required');
  }
  return pearson(ranks(a), ranks(b));
}

/** Per-poster map of issue-category → present. */
export interface ChecklistVerdict {
  [category: string]: boolean;
}

export interface Prf {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

/** Micro-averaged precision/recall/F1 over all (poster, category) cells. */
export function checklistPrf(
  gold: ChecklistVerdict[],
  predicted: ChecklistVerdict[],
  categories: readonly string[],
): Prf {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (let i = 0; i < gold.length; i++) {
    for (const c of categories) {
      const g = gold[i]?.[c] === true;
      const p = predicted[i]?.[c] === true;
      if (g && p) tp++;
      else if (!g && p) fp++;
      else if (g && !p) fn++;
    }
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, precision, recall, f1 };
}

/**
 * §7.4 lens 2b: of the posters seeded with a known ground-truth issue
 * (manifest.seededIssue, null for strong posters), what fraction did the
 * checker flag?
 */
export function seededCatchRate(
  seededIssues: Array<string | null>,
  predicted: ChecklistVerdict[],
): { caught: number; total: number; rate: number } {
  let caught = 0;
  let total = 0;
  seededIssues.forEach((issue, i) => {
    if (issue === null) return;
    total++;
    if (predicted[i]?.[issue] === true) caught++;
  });
  return { caught, total, rate: total === 0 ? 0 : caught / total };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/api -- reviewAgreement`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/review/agreement.ts apps/api/src/__tests__/reviewAgreement.test.ts
git commit -m "feat(review): §7.4 agreement metrics — weighted kappa, spearman, checklist PRF, seeded catch rate"
```

### Task 3: Frozen corpus — manifest schema, validator, build guide

**Files:**
- Create: `docs/plans/experiments/presentation-checker/corpus/manifest.json`
- Create: `docs/plans/experiments/presentation-checker/corpus/README.md`
- Create: `docs/plans/experiments/presentation-checker/scripts/validate-corpus.mts`

**Interfaces:**
- Consumes: `ISSUE_CATEGORIES` from `apps/api/src/review/rubric/v1.ts` (Task 1).
- Produces: the frozen corpus layout every later harness script reads: `corpus/manifest.json` + `corpus/<id>/page-N.png` (+ optional `corpus/<id>/deck.pptx`). Tasks 4, 5, 6, 28 rely on the manifest shape below.

- [ ] **Step 1: Write the manifest scaffold**

`docs/plans/experiments/presentation-checker/corpus/manifest.json` (starts empty; Gavin fills it as the corpus is built — the validator enforces completeness):

```json
{
  "version": 1,
  "frozenAt": null,
  "items": []
}
```

Each item (shape pinned by the validator in Step 2):

```json
{
  "id": "bio-01",
  "field": "biology",
  "title": "Poster title",
  "quality": "seeded",
  "seededIssue": "wall-of-text",
  "pages": ["bio-01/page-1.png"],
  "pptx": "bio-01/deck.pptx",
  "notes": "Seeded: methods section is a 180-word paragraph."
}
```

- [ ] **Step 2: Write the corpus validator**

`docs/plans/experiments/presentation-checker/scripts/validate-corpus.mts`:

```ts
/**
 * Validates the frozen §7.2 corpus: 20 posters, intentional quality spread,
 * every seeded issue drawn from the shared rubric taxonomy, all referenced
 * files on disk, page cap respected. Run:
 *   npx tsx docs/plans/experiments/presentation-checker/scripts/validate-corpus.mts
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ISSUE_CATEGORIES } from '../../../../../apps/api/src/review/rubric/v1.ts';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, '..', 'corpus');
const manifest = JSON.parse(readFileSync(join(corpusDir, 'manifest.json'), 'utf8')) as {
  version: number;
  frozenAt: string | null;
  items: Array<{
    id: string;
    field: string;
    title: string;
    quality: 'strong' | 'seeded';
    seededIssue: string | null;
    pages: string[];
    pptx?: string | null;
    notes?: string;
  }>;
};

const errors: string[] = [];
const ids = new Set<string>();
const seededCategories = new Set<string>();
let strong = 0;

if (manifest.items.length !== 20) {
  errors.push(`expected 20 items, found ${manifest.items.length}`);
}

for (const item of manifest.items) {
  if (ids.has(item.id)) errors.push(`duplicate id ${item.id}`);
  ids.add(item.id);
  if (!item.field || !item.title) errors.push(`${item.id}: field/title required`);
  if (item.quality !== 'strong' && item.quality !== 'seeded') {
    errors.push(`${item.id}: quality must be strong|seeded`);
  }
  if (item.quality === 'seeded') {
    if (!item.seededIssue) {
      errors.push(`${item.id}: seeded item must name seededIssue`);
    } else if (!(ISSUE_CATEGORIES as readonly string[]).includes(item.seededIssue)) {
      errors.push(`${item.id}: seededIssue "${item.seededIssue}" not in rubric taxonomy`);
    } else {
      seededCategories.add(item.seededIssue);
    }
  }
  if (item.quality === 'strong') {
    strong++;
    if (item.seededIssue !== null) errors.push(`${item.id}: strong item must have seededIssue null`);
  }
  if (!Array.isArray(item.pages) || item.pages.length < 1) {
    errors.push(`${item.id}: needs at least one page image`);
  } else {
    if (item.pages.length > 24) errors.push(`${item.id}: ${item.pages.length} pages exceeds the 24-page cap`);
    for (const p of item.pages) {
      if (!existsSync(join(corpusDir, p))) errors.push(`${item.id}: missing file ${p}`);
    }
  }
  if (item.pptx && !existsSync(join(corpusDir, item.pptx))) {
    errors.push(`${item.id}: missing file ${item.pptx}`);
  }
}

if (strong < 4) errors.push(`need ≥ 4 strong posters, found ${strong}`);
if (seededCategories.size < 7) {
  errors.push(`seeded items must cover ≥ 7 distinct issue categories, found ${seededCategories.size}`);
}

if (errors.length > 0) {
  console.error('corpus INVALID:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`corpus OK: ${manifest.items.length} items (${strong} strong, ${manifest.items.length - strong} seeded, ${seededCategories.size} categories)`);
```

- [ ] **Step 3: Write the build guide**

`docs/plans/experiments/presentation-checker/corpus/README.md`:

````markdown
# Frozen validation corpus (spec §7.2)

20 posters/decks, frozen once built. **Frozen means frozen:** after
`frozenAt` is set in `manifest.json`, items are never edited — every
prompt/rubric iteration measures against the same 20 so numbers are
comparable across rounds.

## Building it (manual, ~half a day)

1. **Pick 20 papers across fields** (bio, medicine, CS, physics, social
   science, …) via the Consensus / paper-search MCP — varied fields keep
   the critique field-agnostic.
2. **Generate each into a poster** with Postr (`/paper-to-poster` or the
   editor). This also dogfoods the generation pipeline.
3. **Seed the failure modes.** Pick ≥ 4 posters to keep **strong**
   (`quality: "strong"`, `seededIssue: null`). For each remaining poster,
   plant exactly ONE known issue from this table (cover ≥ 7 distinct
   categories across the corpus):

   | seededIssue | How to plant it |
   |---|---|
   | `buried-key-result` | Move the main-result figure/statement to the bottom-right; lead with background. |
   | `over-emphasis` | Bold + highlight + color 8–10 separate phrases across sections. |
   | `redundant-text` | Add a paragraph that narrates, sentence by sentence, what the key plot already shows. |
   | `competing-elements` | Include two equally large tables/figures both presenting primary results (forced-prioritization case). |
   | `wall-of-text` | Rewrite methods + results as dense 150–200-word paragraphs, no figures. |
   | `decorative-hijack` | Add a large decorative stock photo / lab group photo unrelated to the key result, top-center. |
   | `no-takeaway` | Delete the conclusion/take-home; end on methods details. |
   | `figure-text-disconnect` | Keep figures but remove every in-text reference/caption tie-in. |
   | `jargon-mismatch` | Load the intro with field-specific acronyms, unexplained. |
   | `claims-evidence-gap` | State 2–3 strong claims with no supporting data anywhere. |
   | `section-imbalance` | Inflate background to half the poster; squeeze results into a corner. |
   | `readability-at-distance` | Shrink body/figure text well below poster legibility. |

4. **Export each poster** as PPTX (dogfoods the PPTX ingest path — keep the
   file as `corpus/<id>/deck.pptx`) and as PDF.
5. **Render page images** from the PDF at ≥ 150 DPI, e.g.
   `pdftoppm -r 150 -png poster.pdf corpus/<id>/page` → `page-1.png`
   (multi-page decks: one PNG per slide). Posters are single-page; decks
   exercise the multi-page path.
6. **Fill `manifest.json`** (one entry per poster, relative paths), set
   `frozenAt` to today's date.
7. **Validate:** `npx tsx docs/plans/experiments/presentation-checker/scripts/validate-corpus.mts` → `corpus OK`.

## Rules

- Never tune a poster after freezing — not even "obvious" fixes.
- The checker prototype must never see `seededIssue`; it is ground truth
  for scoring only.
````

- [ ] **Step 4: Build the corpus (MANUAL CHECKPOINT — Gavin)**

Follow `corpus/README.md`. Ends when the validator prints `corpus OK`. This is a blocking checkpoint: Tasks 4–7 need the frozen 20.

- [ ] **Step 5: Commit**

```bash
git add docs/plans/experiments/presentation-checker
git commit -m "test(review): frozen 20-poster validation corpus + manifest validator (§7.2)"
```

### Task 4: Rating instrument — generator + Gavin's ground truth

**Files:**
- Create: `docs/plans/experiments/presentation-checker/scripts/generate-rating-sheets.mts`
- Create: `docs/plans/experiments/presentation-checker/ratings/README.md`
- Create (generated, then hand-filled): `docs/plans/experiments/presentation-checker/ratings/gavin/<id>.json`

**Interfaces:**
- Consumes: `corpus/manifest.json` (Task 3), `DIMENSIONS` + `ISSUE_CATEGORIES` (Task 1).
- Produces: `ratings/gavin/<id>.json` filled per poster with `{ posterId, dimensionScores: {narrative, design, content}, checklist: Record<IssueCategory, boolean>, comments: string }`. Task 6 consumes it.

- [ ] **Step 1: Write the generator**

`docs/plans/experiments/presentation-checker/scripts/generate-rating-sheets.mts`:

```ts
/**
 * Generates one blank rating sheet per corpus item from the SHARED rubric
 * taxonomy (§2.0 single source of truth) so the human checklist and the
 * checker's Finding categories can never drift. Run:
 *   npx tsx docs/plans/experiments/presentation-checker/scripts/generate-rating-sheets.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ISSUE_CATEGORIES } from '../../../../../apps/api/src/review/rubric/v1.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const manifest = JSON.parse(readFileSync(join(root, 'corpus', 'manifest.json'), 'utf8')) as {
  items: Array<{ id: string }>;
};

const outDir = join(root, 'ratings', 'gavin');
mkdirSync(outDir, { recursive: true });

for (const item of manifest.items) {
  const sheet = {
    posterId: item.id,
    dimensionScores: { narrative: null, design: null, content: null },
    checklist: Object.fromEntries(ISSUE_CATEGORIES.map((c) => [c, false])),
    comments: '',
  };
  writeFileSync(join(outDir, `${item.id}.json`), JSON.stringify(sheet, null, 2) + '\n');
}
console.log(`wrote ${manifest.items.length} blank rating sheets to ratings/gavin/`);
```

- [ ] **Step 2: Write the rater's guide**

`docs/plans/experiments/presentation-checker/ratings/README.md`:

```markdown
# Ground-truth rating (spec §7.3)

Rate all 20 posters BEFORE looking at any checker output. One `<id>.json`
per poster in `gavin/`. Rate as if seeing each poster for the first time —
even the ones you seeded yourself.

For each poster fill:

- **dimensionScores** — narrative / design / content, integers 1–5.
  Anchors (rubric v1):
  - **Narrative** — 1: no recoverable storyline; key result unreachable from the scan path. 3: story recoverable with effort; result present but not landing early. 5: eye lands on the key result early; hook → takeaway recoverable; every figure connects to its text.
  - **Design** — 1: over-emphasis competition or wall of text; unreadable at distance. 3: hierarchy present but contested; some legibility issues. 5: one clear entry point onto the core result; emphasis well dosed; legible at distance.
  - **Content** — 1: jargon walls or unsupported central claim. 3: mostly audience-appropriate; some under-evidenced claims. 5: right register; every claim tied to evidence shown; balanced.
- **checklist** — flip to `true` every issue actually present. Judge the
  poster, not your memory of seeding it.
- **comments** — first-class (§7.3): write what you'd tell the author.
  These get reconciled qualitatively against the checker's findings.
```

- [ ] **Step 3: Generate sheets, then rate (MANUAL CHECKPOINT — Gavin)**

```bash
npx tsx docs/plans/experiments/presentation-checker/scripts/generate-rating-sheets.mts
```

Then Gavin fills all 20 `ratings/gavin/<id>.json` (scores + checklist + comments). Blocking checkpoint — Task 6 needs all 20 filled.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/experiments/presentation-checker/ratings docs/plans/experiments/presentation-checker/scripts/generate-rating-sheets.mts
git commit -m "test(review): rating instrument + Gavin's ground-truth ratings (§7.3)"
```

### Task 5: Throwaway prompt-only prototype + corpus run

**Files:**
- Create: `docs/plans/experiments/presentation-checker/prototype/critique-prototype.mts`
- Create (generated): `docs/plans/experiments/presentation-checker/results/<id>.json`, `docs/plans/experiments/presentation-checker/results/costs.jsonl`

**Interfaces:**
- Consumes: `corpus/manifest.json` (Task 3), `CURRENT_RUBRIC` (Task 1), `ANTHROPIC_API_KEY` (Preflight P3).
- Produces: per-poster `results/<id>.json` (`{ posterId, critique, usage }`) and `results/costs.jsonl` (one `{posterId, inputTokens, outputTokens, estCostUsd}` per line). Task 6 reads `results/`.

This is the §7.1 Phase-0 spike: **just the vision call + rubric** — no ingest layer, no DB, no billing, no UI. Throwaway; the production output contract is formalized in Task 9 (keep the two in sync by hand until then).

- [ ] **Step 1: Write the prototype**

`docs/plans/experiments/presentation-checker/prototype/critique-prototype.mts`:

```ts
/**
 * Phase-0 throwaway prototype (spec §7.1): rubric + one forced-tool-use
 * vision call per poster. No ingest, no DB, no UI.
 *
 *   ANTHROPIC_API_KEY=... npx tsx docs/plans/experiments/presentation-checker/prototype/critique-prototype.mts [--only bio-01,cs-04] [--limit 3]
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_RUBRIC } from '../../../../../apps/api/src/review/rubric/index.ts';

// ---- Throwaway copy of the output contract (production: Task 9) ---------
const FindingSchema = z.object({
  dimension: z.enum(['narrative', 'design', 'content']),
  severity: z.enum(['high', 'medium', 'low']),
  category: z.enum(CURRENT_RUBRIC.issueCategories),
  anchor: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('block'), blockId: z.string().min(1) }),
    z.object({
      kind: z.literal('region'),
      page: z.number().int().min(1),
      bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    }),
    z.object({ kind: z.literal('slide'), page: z.number().int().min(1) }),
  ]),
  action: z.enum(['cut', 'demote-to-appendix', 'show-visually', 'condense', 'keep-as-primary', 'add']),
  problem: z.string().min(1),
  fix: z.string().min(1),
  example: z.string().min(1),
  tradeoff: z.string().optional(),
});
const CritiqueSchema = z.object({
  dimensionScores: z.object({
    narrative: z.number().int().min(1).max(5),
    design: z.number().int().min(1).max(5),
    content: z.number().int().min(1).max(5),
  }),
  attentionSummary: z.string().min(1),
  prioritization: z.string().optional(),
  findings: z.array(FindingSchema),
});

// ---- Prompt composed FROM the rubric (§2.0) ------------------------------
function rules(rules: { id: string; text: string }[]): string {
  return rules.map((r) => `- [${r.id}] ${r.text}`).join('\n');
}

const SYSTEM = `You are an expert reviewer of research posters and conference talks. You critique the artifact in TWO ORDERED STAGES. The ordering matters: perceive first, then judge against intent.

STAGE 1 — Perceptual-attention pass (free-viewing simulation).
Before any judgment, describe how a first-time viewer's eye would actually move across the artifact: the entry point, salience hotspots, any faces/photos that hijack gaze, the emphasis load, and the predicted reading path. Ground every prediction in these perception rules:
${rules(CURRENT_RUBRIC.perceptionRules)}

STAGE 2 — Judge the predicted flow against the intended message.
Using your Stage-1 prediction, judge: does the eye land on the KEY RESULT early, or does something decorative hijack it? Is the narrative (hook → question → method → result → takeaway) recoverable from the scan path? Does each figure connect to its explaining text? Is the content right for the audience (jargon, claims vs evidence, section balance, readability at distance)?

BOTH stages are governed by the ECONOMY principle — your default posture is "what can be removed or shown instead of told", never "what is missing":
${rules(CURRENT_RUBRIC.economyRules)}

Score each dimension 1–5 using these anchors:
${CURRENT_RUBRIC.dimensions.map((d) => `- ${d.name}: 1 = ${d.anchors.low} | 3 = ${d.anchors.mid} | 5 = ${d.anchors.high}`).join('\n')}

OUTPUT RULES:
- Emit via the emit_critique tool ONLY.
- Every finding needs a category from the issue taxonomy, an anchor (slide index; or region with a normalized [x, y, width, height] bbox in fractions of the page, 0–1), and an action. Actions are dominated by cut / demote-to-appendix / show-visually / condense; "add" is the RARE case — use it only when something essential is truly absent.
- "example" is required and must be PERSONALIZED to the artifact: the actual rewritten line, the exact rows to gray, the specific point to circle — drawn from THEIR content, never a template.
- attentionSummary is your Stage-1 prediction in prose. When two elements compete as primary, prioritization must say which one wins and where the other goes.
- 4–10 findings, highest value first.`;

const TOOL = {
  name: 'emit_critique',
  description: 'Emit the structured poster/presentation critique as JSON.',
  input_schema: {
    type: 'object',
    required: ['dimensionScores', 'attentionSummary', 'findings'],
    additionalProperties: false,
    properties: {
      dimensionScores: {
        type: 'object',
        required: ['narrative', 'design', 'content'],
        additionalProperties: false,
        properties: {
          narrative: { type: 'integer', minimum: 1, maximum: 5 },
          design: { type: 'integer', minimum: 1, maximum: 5 },
          content: { type: 'integer', minimum: 1, maximum: 5 },
        },
      },
      attentionSummary: { type: 'string' },
      prioritization: { type: 'string' },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          required: ['dimension', 'severity', 'category', 'anchor', 'action', 'problem', 'fix', 'example'],
          additionalProperties: false,
          properties: {
            dimension: { type: 'string', enum: ['narrative', 'design', 'content'] },
            severity: { type: 'string', enum: ['high', 'medium', 'low'] },
            category: { type: 'string', enum: [...CURRENT_RUBRIC.issueCategories] },
            anchor: {
              type: 'object',
              required: ['kind'],
              properties: {
                kind: { type: 'string', enum: ['block', 'region', 'slide'] },
                blockId: { type: 'string' },
                page: { type: 'integer', minimum: 1 },
                bbox: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 },
              },
            },
            action: { type: 'string', enum: ['cut', 'demote-to-appendix', 'show-visually', 'condense', 'keep-as-primary', 'add'] },
            problem: { type: 'string' },
            fix: { type: 'string' },
            example: { type: 'string' },
            tradeoff: { type: 'string' },
          },
        },
      },
    },
  },
} satisfies Anthropic.Tool;

// ---- Cost accounting (CONFIRM current pricing before pricing the pack) --
const COST_PER_MTOK = { input: 3.0, output: 15.0 }; // Sonnet 4.5 list, 2026-07: verify

// ---- Runner ---------------------------------------------------------------
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1]!.split(',') : null;
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : null;

const manifest = JSON.parse(readFileSync(join(root, 'corpus', 'manifest.json'), 'utf8')) as {
  items: Array<{ id: string; pages: string[] }>;
};

const anthropic = new Anthropic();
mkdirSync(join(root, 'results'), { recursive: true });

function mediaType(p: string): 'image/png' | 'image/jpeg' {
  const ext = extname(p).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  throw new Error(`unsupported page image ${p}`);
}

let items = manifest.items;
if (only) items = items.filter((i) => only.includes(i.id));
if (limit !== null) items = items.slice(0, limit);

for (const item of items) {
  const content: Anthropic.MessageParam['content'] = item.pages.map((p) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: mediaType(p),
      data: readFileSync(join(root, 'corpus', p)).toString('base64'),
    },
  }));
  content.push({
    type: 'text',
    text: `Artifact: ${item.pages.length} page(s). Pages are in reading order. Produce the two-stage critique now.`,
  });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 8192,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'emit_critique' },
    messages: [{ role: 'user', content }],
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!toolUse) throw new Error(`${item.id}: no tool_use in response`);
  const critique = CritiqueSchema.parse(toolUse.input); // throws on contract violation — that's a finding, keep the raw file
  const usage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
  const estCostUsd =
    (usage.inputTokens / 1e6) * COST_PER_MTOK.input + (usage.outputTokens / 1e6) * COST_PER_MTOK.output;

  writeFileSync(
    join(root, 'results', `${item.id}.json`),
    JSON.stringify({ posterId: item.id, critique, usage }, null, 2) + '\n',
  );
  appendFileSync(
    join(root, 'results', 'costs.jsonl'),
    JSON.stringify({ posterId: item.id, ...usage, estCostUsd: Number(estCostUsd.toFixed(4)) }) + '\n',
  );
  console.log(`${item.id}: ${critique.findings.length} findings, ${usage.inputTokens}+${usage.outputTokens} tokens, ~$${estCostUsd.toFixed(3)}`);
}
```

- [ ] **Step 2: Smoke run on 3 items**

```bash
ANTHROPIC_API_KEY=... npx tsx docs/plans/experiments/presentation-checker/prototype/critique-prototype.mts --limit 3
```

Expected: 3 lines of output, `results/<id>.json` valid against the inline schema. **Read all three critiques by eye** (Gavin) — this is the first prompt-tuning loop. If the output is systematically wrong in a way that suggests *architecture* (missing schema field, needs different chunking, attention pass ungrounded), stop and record it for the Task 7 gate — that is Phase 0's whole point.

- [ ] **Step 3: Full run over the frozen 20**

```bash
ANTHROPIC_API_KEY=... npx tsx docs/plans/experiments/presentation-checker/prototype/critique-prototype.mts
```

Expected: 20 result files + 20 `costs.jsonl` lines. `costs.jsonl` is the early token-cost input for pack pricing (§7.1).

- [ ] **Step 4: Commit**

```bash
git add docs/plans/experiments/presentation-checker/prototype docs/plans/experiments/presentation-checker/results
git commit -m "test(review): throwaway prompt-only prototype + first frozen-20 run (§7.1 Phase 0)"
```

### Task 6: Agreement analysis CLI + report

**Files:**
- Create: `docs/plans/experiments/presentation-checker/analysis/analyze.mts`
- Create (generated): `docs/plans/experiments/presentation-checker/analysis/report.md`

**Interfaces:**
- Consumes: `corpus/manifest.json` (Task 3), `ratings/gavin/*.json` (Task 4), `results/*.json` (Task 5), metrics from `apps/api/src/review/agreement.ts` (Task 2), `ISSUE_CATEGORIES` (Task 1).
- Produces: `analysis/report.md` with the three §7.4 lenses. Task 7 consumes it.

- [ ] **Step 1: Write the analysis CLI**

`docs/plans/experiments/presentation-checker/analysis/analyze.mts`:

```ts
/**
 * §7.4 agreement analysis: Gavin vs checker over the frozen 20.
 *   npx tsx docs/plans/experiments/presentation-checker/analysis/analyze.mts [--results results] [--out analysis/report.md]
 * Task 28 reuses this against the PRODUCTION pipeline's output (--results results-production).
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ISSUE_CATEGORIES } from '../../../../../apps/api/src/review/rubric/v1.ts';
import {
  weightedKappa,
  spearmanRho,
  checklistPrf,
  seededCatchRate,
  type ChecklistVerdict,
} from '../../../../../apps/api/src/review/agreement.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const resultsDir = args.includes('--results') ? args[args.indexOf('--results') + 1]! : 'results';
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1]! : join(here, 'report.md');

interface Rating {
  posterId: string;
  dimensionScores: { narrative: number; design: number; content: number };
  checklist: ChecklistVerdict;
  comments: string;
}
interface Result {
  posterId: string;
  critique: {
    dimensionScores: { narrative: number; design: number; content: number };
    findings: Array<{ category: string; problem: string; fix: string; severity: string }>;
  };
}
const manifest = JSON.parse(readFileSync(join(root, 'corpus', 'manifest.json'), 'utf8')) as {
  items: Array<{ id: string; seededIssue: string | null }>;
};

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

const dims = ['narrative', 'design', 'content'] as const;
const lines: string[] = [];
const push = (s = '') => lines.push(s);

push('# Presentation Checker — agreement report (§7.4)');
push('');

const gavin: Rating[] = [];
const checker: Result[] = [];
for (const item of manifest.items) {
  gavin.push(readJson(join(root, 'ratings', 'gavin', `${item.id}.json`)));
  checker.push(readJson(join(root, resultsDir, `${item.id}.json`)));
}

// Lens 1 — scores: weighted kappa + spearman per dimension.
push('## 1. Dimension scores — do we rank the same?');
push('');
push('| dimension | weighted kappa | spearman rho |');
push('|---|---|---|');
for (const d of dims) {
  const g = gavin.map((r) => r.dimensionScores[d]);
  const c = checker.map((r) => r.critique.dimensionScores[d]);
  push(`| ${d} | ${weightedKappa(g, c, 5).toFixed(3)} | ${spearmanRho(g, c).toFixed(3)} |`);
}
push('');

// Lens 2 — checklist: micro PRF + seeded catch rate.
const checkerChecklists: ChecklistVerdict[] = checker.map((r) => {
  const v: ChecklistVerdict = {};
  for (const f of r.critique.findings) v[f.category] = true;
  return v;
});
const prf = checklistPrf(gavin.map((r) => r.checklist), checkerChecklists, ISSUE_CATEGORIES);
const catchRate = seededCatchRate(manifest.items.map((i) => i.seededIssue), checkerChecklists);
push('## 2. Issue checklist — same specific problems?');
push('');
push(`- micro precision ${prf.precision.toFixed(3)} · recall ${prf.recall.toFixed(3)} · F1 ${prf.f1.toFixed(3)} (tp ${prf.tp}, fp ${prf.fp}, fn ${prf.fn})`);
push(`- **seeded ground-truth caught: ${catchRate.caught}/${catchRate.total} (${(catchRate.rate * 100).toFixed(0)}%)**`);
push('');

// Lens 3 — comments vs findings, side by side for qualitative reconciliation.
push('## 3. Comments ↔ findings (qualitative reconciliation)');
push('');
for (let i = 0; i < manifest.items.length; i++) {
  push(`### ${manifest.items[i]!.id}${manifest.items[i]!.seededIssue ? ` (seeded: ${manifest.items[i]!.seededIssue})` : ' (strong)'}`);
  push('');
  push(`Gavin: ${gavin[i]!.comments || '_(no comment)_'}`);
  push('');
  push('Checker findings:');
  for (const f of checker[i]!.critique.findings) {
    push(`- [${f.severity}/${f.category}] ${f.problem} → ${f.fix}`);
  }
  push('');
}

writeFileSync(outFile, lines.join('\n') + '\n');
console.log(`wrote ${outFile}`);
```

- [ ] **Step 2: Run it and read the report (Gavin)**

```bash
npx tsx docs/plans/experiments/presentation-checker/analysis/analyze.mts
```

Expected: `analysis/report.md` with the three lenses. Gavin reads §3 — that's where wrong-element / missed-why disagreements surface (§7.4 lens 3).

- [ ] **Step 3: Iterate the prompt if needed**

Prompt-tuning loop (§7.5): edit `prototype/critique-prototype.mts` SYSTEM (and, when a disagreement is a **rubric gap** rather than a judgment call, the rubric entry in `apps/api/src/review/rubric/v1.ts`) → re-run Task 5 Step 3 on the **same frozen 20** → re-run this analysis. Frozen corpus = comparable numbers across iterations. Log each round in `analysis/report.md` (append a `## Round N` note).

- [ ] **Step 4: Commit**

```bash
git add docs/plans/experiments/presentation-checker/analysis
git commit -m "test(review): §7.4 agreement analysis + round-1 report"
```

### Task 7: Phase-0 decision gate

**Files:**
- Create: `docs/plans/experiments/presentation-checker/gate-decision.md`

**Interfaces:**
- Consumes: `analysis/report.md` (Task 6), `results/costs.jsonl` (Task 5).
- Produces: the go/no-go record + proposed §7.5 ship-criterion numbers + pack-pricing inputs. Milestones 2–6 are gated on this.

- [ ] **Step 1: Write the gate doc**

`docs/plans/experiments/presentation-checker/gate-decision.md` — fill every `<…>` from the report and cost log:

```markdown
# Phase 0 decision gate (spec §7.1 / §7.5)

Date: <…> · Rubric: rubric.v1 · Corpus: frozen 20 (`frozenAt` in manifest)

## Round-1 agreement (from analysis/report.md)

| lens | number |
|---|---|
| kappa — narrative / design / content | <…> / <…> / <…> |
| spearman — narrative / design / content | <…> / <…> / <…> |
| checklist P / R / F1 | <…> / <…> / <…> |
| **seeded ground-truth caught** | **<…>%** |

## Disagreement triage (§7.5)

- Rubric gaps found (→ rubric edits made / planned): <…>
- Genuine judgment calls (logged, no fix): <…>
- Systematic comment-level failure modes: <… or "none">

## Architecture go/no-go (the reason Phase 0 exists)

- [ ] Output schema is sufficient (no field the comments keep surfacing is missing)
- [ ] Single-call two-stage pass grounds the attention prediction adequately (no move to approach #2 needed yet)
- [ ] Page-image input resolution is adequate (poster text legible to the model)
- [ ] No ingest-chunking change required

Any unchecked box → record the architecture change decided here BEFORE
Milestone 2; update the spec (it is a living document) and this plan.

## Proposed ship criterion for the pre-ship gate (§7.5; Gavin sets this)

- Seeded ground-truth recall ≥ <X>%
- Score weighted-kappa ≥ <Y> on all three dimensions
- No systematic comment-level failure mode

## Early token costs (from results/costs.jsonl) → pricing inputs

- tokens/review p50 / p95: <…> / <…>
- cost/review p50 / p95: $<…> / $<…>
- proposed pack: <N> credits at $<price> · proposed weekly add-on quota: <N>/week
  (final prices set in Task 28 from day-one instrumentation; these are the first anchors)

## Decision

- [ ] **GO** — proceed to Milestone 2 as planned
- [ ] **GO WITH CHANGES** — <record changes; update spec + plan>
- [ ] **NO-GO** — <record why; what pivot>

Signed: Gavin · <date>
```

- [ ] **Step 2: Decide (MANUAL CHECKPOINT — Gavin)**

Fill and sign. **GO WITH CHANGES** means: update the spec + this plan first, then proceed. **NO-GO** stops the build here — that outcome is Phase 0 succeeding at its job, not failing.

- [ ] **Step 3: Commit**

```bash
git add docs/plans/experiments/presentation-checker/gate-decision.md
git commit -m "docs(review): Phase-0 gate decision — <GO|GO WITH CHANGES|NO-GO>"
```

---
# MILESTONE 2 — Data layer (Supabase)

**Purpose:** build the database half of the review economy (spec §5): the `poster_reviews` table with its `initial → followup → closed` stage machine (§5.1/§5.2) and the review-credit billing columns + RPCs (§5.3), following the repo's server-owned-billing-column pattern. Gated on the Task 7 GO decision; the M3 API/router and billing tasks consume everything built here. Requires Docker + `npm run db:start` (Preflight P2 note).

### Task 8: `poster_reviews` + review billing columns + RPCs + pgTAP

**Files:**
- Create: `supabase/migrations/20260729120000_poster_reviews.sql`
- Test: `supabase/tests/poster_reviews_test.sql`
- Modify: `supabase/tests/billing_plan_test.sql` (three guard-message assertions)
- Modify: `supabase/tests/rpc_definitions_test.sql` (pins for the two new RPCs)
- Modify: `packages/shared/src/database.types.ts` (regenerated via `npm run db:types`)

**Interfaces:**
- Consumes: `guard_billing_columns()` current body (`supabase/migrations/20260728190000_billing_refunds.sql:81-107`); the RPC bodies of `consume_export_credit` (`supabase/migrations/20260728140000_consume_export_credit.sql`) and `grant_export_credits` (`supabase/migrations/20260728150000_grant_export_credits.sql`); the RLS policy idiom of `supabase/migrations/20260408000100_posters.sql` (`drop policy if exists` + `create policy`); pgTAP conventions of `supabase/tests/billing_plan_test.sql` and `supabase/tests/poster_versions_test.sql`.
- Produces: table `public.poster_reviews` (RLS: owner SELECT-only); columns `users.review_credits` / `users.review_addon` / `users.review_addon_subscription_id`; RPCs `public.consume_review_credit(uuid) returns integer` and `public.grant_review_credits(uuid, integer) returns integer` (both service_role-only — browser EXECUTE revoked). The M3 router calls them via `supabase.rpc('consume_review_credit' as never, { p_user_id } as never)`, the same idiom as the export-credit grant in `apps/api/src/billing.ts:532-558`; the M3 billing wiring extends `fulfillCheckout` for the `review_pack` / `review_addon` SKUs against these same columns/RPCs. `initial_findings` / `followup_findings` are `jsonb` holding the Task-9 `CritiqueResult` (whose findings carry the D2 `category` taxonomy — enforced API-side by Zod, not by the DB). Regenerated `database.types.ts` gains the table, the three columns, and both RPC signatures.

Two deliberate deviations from the §5.1 draft, both binding decisions:

- **D3 — RLS is owner SELECT-only** (the draft said owner select/insert/update). Every write goes through the API's service_role client: an owner-writable `stage` would let a client reset a `closed` review to `initial` and farm free follow-ups, and an owner-insertable row would mint unpaid reviews. The same rationale is recorded in the migration's header comment, and the pgTAP test pins it (INSERT → 42501, UPDATE → zero rows).
- **D16 — rows are written only on success.** The API writes a row exactly once, after the model call + enforce succeed, with `status: 'complete'`. `pending`/`failed` stay in the CHECK constraint for future async use; v1 never writes a failed row (model/ingest failure ⇒ no row, no charge — Global Constraints).

Also per **D8**: refunds for the review SKUs (`review_pack` payment, `review_addon` subscription) are DEFERRED — handled manually via the Stripe dashboard, no tasks. The weekly add-on quota is enforced API-side via `createRateLimiter` (M3); this task only owns the entitlement columns. Per **D9** the extended guard's error message lists all ten server-owned columns, and the three message assertions in `billing_plan_test.sql` are updated in this same task (Step 2).

- [ ] **Step 1: Write the failing pgTAP test**

`supabase/tests/poster_reviews_test.sql`:

```sql
-- ==========================================================================
-- pgTAP · public.poster_reviews — RLS + review billing columns / RPCs
-- ==========================================================================
--
-- The Presentation Checker's review rows are written ONLY by the API
-- (service_role); the owner may read them but never write (D3 — an
-- owner-writable `stage` would let a client reset a closed review and farm
-- free follow-ups). The review-credit ledger mirrors export_credits: a
-- server-owned users column with service_role-only consume/grant RPCs.
--
--   * defaults: status 'pending', stage 'initial', empty source_meta
--   * owner can SELECT their own reviews
--   * another user's reviews are invisible
--   * authenticated INSERT is rejected (42501 — no insert policy)
--   * owner UPDATE hits zero rows (no update policy — D3)
--   * the billing guard rejects a client write to review_credits
--   * service_role (the API) can INSERT and UPDATE reviews
--   * consume_review_credit decrements; returns NULL at zero
--   * grant_review_credits adds atomically
--   * CHECK rejects a negative review_credits balance
--
-- Run via `npm run db:test` (Docker + `npm run db:start`). Rolls back.
--
-- Fixture ids:
--   u1  d1000000-0000-4000-a000-000000000001
--   u2  d1000000-0000-4000-a000-000000000002
--   r1  e1000000-0000-4000-a000-000000000001  (u1's review)
--   r2  e1000000-0000-4000-a000-000000000002  (u2's review)

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(14);

-- --------------------------------------------------------------------------
-- Fixtures (as superuser): two users (handle_new_user auto-creates their
-- public.users rows) and one review each, written directly — the API's
-- service_role write path is exercised separately below.
-- --------------------------------------------------------------------------
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, is_anonymous, created_at, updated_at)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
  u.email, '', now(),
  '{"provider":"email","providers":["email"]}', '{}', false, now(), now()
from (values
  ('d1000000-0000-4000-a000-000000000001'::uuid, 'jane.doe@example.com'),
  ('d1000000-0000-4000-a000-000000000002'::uuid, 'john.smith@example.com')
) as u (id, email);

insert into public.poster_reviews (id, user_id, source_kind) values
  ('e1000000-0000-4000-a000-000000000001', 'd1000000-0000-4000-a000-000000000001', 'postr'),
  ('e1000000-0000-4000-a000-000000000002', 'd1000000-0000-4000-a000-000000000002', 'pdf');

-- 1 · default status
select is(
  (select status from public.poster_reviews where id = 'e1000000-0000-4000-a000-000000000001'),
  'pending',
  'a fresh review row starts pending');

-- 2 · default stage
select is(
  (select stage from public.poster_reviews where id = 'e1000000-0000-4000-a000-000000000001'),
  'initial',
  'a fresh review row starts at stage initial');

-- 3 · default source_meta
select is(
  (select source_meta from public.poster_reviews where id = 'e1000000-0000-4000-a000-000000000001'),
  '{}'::jsonb,
  'a fresh review row starts with empty source_meta');

-- Seed one review credit for u1. The billing guard fires for ANY
-- non-service_role caller — even this superuser session — so the fixture
-- write must run as service_role (same pattern as billing_plan_test.sql).
set local role service_role;
update public.users set review_credits = 1
  where id = 'd1000000-0000-4000-a000-000000000001';
reset role;

-- --------------------------------------------------------------------------
-- As the AUTHENTICATED owner (PostgREST-style): read yes, write never
-- --------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-4000-a000-000000000001","role":"authenticated"}',
  true);
set local role authenticated;

-- 4 · owner can select their own reviews
select is(
  (select count(*) from public.poster_reviews
    where user_id = 'd1000000-0000-4000-a000-000000000001'),
  1::bigint,
  'owner can select their own reviews');

-- 5 · another user's reviews are invisible
select is(
  (select count(*) from public.poster_reviews
    where user_id = 'd1000000-0000-4000-a000-000000000002'),
  0::bigint,
  'another user''s reviews are invisible');

-- 6 · INSERT is rejected — no insert policy (writes are service_role only)
select throws_ok(
  $q$ insert into public.poster_reviews (user_id, source_kind)
      values ('d1000000-0000-4000-a000-000000000001', 'pdf') $q$,
  '42501',
  'new row violates row-level security policy for table "poster_reviews"',
  'authenticated INSERT is rejected — no insert policy (service_role only)');

-- 7 · UPDATE hits zero rows — no update policy. The data-modifying CTE must
-- sit at the TOP LEVEL of the statement (Postgres rejects it inside is()'s
-- subquery), so is() reads the CTE.
with updated as (
  update public.poster_reviews
     set stage = 'initial'
   where id = 'e1000000-0000-4000-a000-000000000001'
  returning 1
)
select is(
  (select count(*) from updated),
  0::bigint,
  'owner UPDATE hits zero rows — a closed review cannot be reset from the client');

-- 8 · the billing guard rejects a client write to review_credits
select throws_ok(
  $q$ update public.users set review_credits = 99
      where id = 'd1000000-0000-4000-a000-000000000001' $q$,
  'P0001',
  'billing columns (plan, plan_expires_at, stripe_customer_id, export_credits, stripe_subscription_id, subscription_status, first_paid_export_at, review_credits, review_addon, review_addon_subscription_id) are server-owned and cannot be changed by the client',
  'the billing guard rejects a client write to review_credits');

reset role;
select set_config('request.jwt.claims', null, true);

-- --------------------------------------------------------------------------
-- As SERVICE_ROLE (the API): the only writer of review rows and credits
-- --------------------------------------------------------------------------
set local role service_role;

-- 9 · service_role can insert the completed review (D16: one write, after a
-- successful critique, status 'complete'; rubric version stamped in
-- source_meta per the Global Constraints)
select lives_ok(
  $q$ insert into public.poster_reviews
        (user_id, source_kind, source_meta, status, initial_findings, credit_source)
      values (
        'd1000000-0000-4000-a000-000000000001',
        'pdf',
        '{"filename":"talk.pdf","pageCount":12,"rubric_version":"rubric.v1"}'::jsonb,
        'complete',
        '{"dimensionScores":{"narrative":3,"design":3,"content":3},"attentionSummary":"The entry point is the results figure.","findings":[]}'::jsonb,
        'pack') $q$,
  'service_role (the API) can insert a completed review');

-- 10 · service_role can write followup_findings and close the review
select lives_ok(
  $q$ update public.poster_reviews
        set stage = 'closed',
            followup_findings = '{"dimensionScores":{"narrative":4,"design":4,"content":4},"attentionSummary":"The revision lands the key result early.","findings":[]}'::jsonb
      where id = 'e1000000-0000-4000-a000-000000000001' $q$,
  'service_role can write followup_findings and close the review');

-- 11 · consume_review_credit spends the seeded credit (1 → 0)
select is(
  (select public.consume_review_credit('d1000000-0000-4000-a000-000000000001')),
  0,
  'consume_review_credit decrements and returns the new balance');

-- 12 · …and returns NULL once the balance is zero (the "no credit" signal)
select ok(
  (select public.consume_review_credit('d1000000-0000-4000-a000-000000000001')) is null,
  'consume_review_credit returns NULL when no credit remains');

-- 13 · grant_review_credits adds atomically (0 → 3)
select is(
  (select public.grant_review_credits('d1000000-0000-4000-a000-000000000001', 3)),
  3,
  'grant_review_credits adds credits and returns the new balance');

-- 14 · the nonneg CHECK rejects a negative balance (checked AS service_role
-- so the billing guard passes and the write reaches the constraint — same
-- pattern as billing_plan_test.sql's plan-CHECK assertion)
select throws_ok(
  $q$ update public.users set review_credits = -1
      where id = 'd1000000-0000-4000-a000-000000000001' $q$,
  '23514',
  null,
  'the review_credits nonneg CHECK rejects a negative balance');

reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Update the three guard-message assertions in `billing_plan_test.sql`**

The extended guard (Step 5) raises a message listing all ten server-owned columns, so the three exact-message `throws_ok` assertions must match it. Note: these assertions still carry the ORIGINAL four-column message from `20260728120000_billing_plan.sql` — they were not updated when `20260728170000` / `20260728190000` extended the guard, so they mismatch the live guard's seven-column message today; this step moves them straight to the final ten-column message.

Header comment — before:

```sql
-- The plan / plan_expires_at / stripe_customer_id / export_credits columns
-- are SERVER-OWNED — only the Stripe webhook (service_role) may write them.
-- A user updating their own row (as PostgREST's `authenticated` role) must
-- NOT be able to grant themselves a paid plan or credits.
```

Header comment — after:

```sql
-- The billing columns (plan, plan_expires_at, stripe_customer_id,
-- export_credits, stripe_subscription_id, subscription_status,
-- first_paid_export_at, review_credits, review_addon,
-- review_addon_subscription_id) are SERVER-OWNED — only the API / Stripe
-- webhook (service_role) may write them. A user updating their own row (as
-- PostgREST's `authenticated` role) must NOT be able to grant themselves a
-- paid plan, credits, or the review add-on.
```

Assertion 3 — before:

```sql
select throws_ok(
  $q$ update public.users set plan = 'term'
      where id = '0b000000-0000-4000-a000-000000000001' $q$,
  'P0001',
  'billing columns (plan, plan_expires_at, stripe_customer_id, export_credits) are server-owned and cannot be changed by the client',
  'authenticated user cannot set plan = term');
```

Assertion 3 — after:

```sql
select throws_ok(
  $q$ update public.users set plan = 'term'
      where id = '0b000000-0000-4000-a000-000000000001' $q$,
  'P0001',
  'billing columns (plan, plan_expires_at, stripe_customer_id, export_credits, stripe_subscription_id, subscription_status, first_paid_export_at, review_credits, review_addon, review_addon_subscription_id) are server-owned and cannot be changed by the client',
  'authenticated user cannot set plan = term');
```

Assertion 4 — before:

```sql
select throws_ok(
  $q$ update public.users set export_credits = 99
      where id = '0b000000-0000-4000-a000-000000000001' $q$,
  'P0001',
  'billing columns (plan, plan_expires_at, stripe_customer_id, export_credits) are server-owned and cannot be changed by the client',
  'authenticated user cannot set export_credits');
```

Assertion 4 — after:

```sql
select throws_ok(
  $q$ update public.users set export_credits = 99
      where id = '0b000000-0000-4000-a000-000000000001' $q$,
  'P0001',
  'billing columns (plan, plan_expires_at, stripe_customer_id, export_credits, stripe_subscription_id, subscription_status, first_paid_export_at, review_credits, review_addon, review_addon_subscription_id) are server-owned and cannot be changed by the client',
  'authenticated user cannot set export_credits');
```

Assertion 5 — before:

```sql
select throws_ok(
  $q$ update public.users set plan_expires_at = now() + interval '4 months'
      where id = '0b000000-0000-4000-a000-000000000001' $q$,
  'P0001',
  'billing columns (plan, plan_expires_at, stripe_customer_id, export_credits) are server-owned and cannot be changed by the client',
  'authenticated user cannot set plan_expires_at');
```

Assertion 5 — after:

```sql
select throws_ok(
  $q$ update public.users set plan_expires_at = now() + interval '4 months'
      where id = '0b000000-0000-4000-a000-000000000001' $q$,
  'P0001',
  'billing columns (plan, plan_expires_at, stripe_customer_id, export_credits, stripe_subscription_id, subscription_status, first_paid_export_at, review_credits, review_addon, review_addon_subscription_id) are server-owned and cannot be changed by the client',
  'authenticated user cannot set plan_expires_at');
```

- [ ] **Step 3: Pin the two new RPCs in `rpc_definitions_test.sql`**

Change the plan count line from `select plan(19);` to `select plan(31);`, then add the blocks below — each under its matching section, in the file's existing assertion style. The negative grant pins cover BOTH `anon` and `authenticated` (the user-facing RPCs pinned above only check `anon`): these two RPCs are service_role-only, so every browser-facing role must lack EXECUTE. As the file's own notes explain, `has_function_privilege` sees privileges inherited via PUBLIC, so these pins also catch a drop+recreate that silently resurrects the default grant.

In the "Functions exist" section, after the `'enforce_feedback_rate_limit() exists');` line:

```sql
select has_function('public', 'consume_review_credit', array['uuid']::name[],
  'consume_review_credit(uuid) exists');
select has_function('public', 'grant_review_credits', array['uuid', 'integer']::name[],
  'grant_review_credits(uuid, integer) exists');
```

In the "Return types" section, after the `'enforce_feedback_rate_limit() returns trigger');` line:

```sql
select function_returns('public', 'consume_review_credit', array['uuid']::name[], 'integer',
  'consume_review_credit(uuid) returns integer');
select function_returns('public', 'grant_review_credits', array['uuid', 'integer']::name[], 'integer',
  'grant_review_credits(uuid, integer) returns integer');
```

In the "security definer" section, after the `'enforce_feedback_rate_limit() is security definer');` line:

```sql
select is_definer('public', 'consume_review_credit', array['uuid']::name[],
  'consume_review_credit(uuid) is security definer');
select is_definer('public', 'grant_review_credits', array['uuid', 'integer']::name[],
  'grant_review_credits(uuid, integer) is security definer');
```

In the "Pinned search_path" section, after the `'enforce_feedback_rate_limit() pins search_path');` block:

```sql
select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'consume_review_credit'
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  ),
  'consume_review_credit() pins search_path');
select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'grant_review_credits'
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  ),
  'grant_review_credits() pins search_path');
```

At the end of the "Wiring + grants" section, after the `'anon cannot execute is_gallery_admin(uuid)');` block (just before `select * from finish();`):

```sql
-- service_role-only RPCs: BOTH browser-facing roles must lack EXECUTE.
select ok(
  not has_function_privilege('anon', 'public.consume_review_credit(uuid)', 'EXECUTE'),
  'anon cannot execute consume_review_credit(uuid)');
select ok(
  not has_function_privilege('anon', 'public.grant_review_credits(uuid, integer)', 'EXECUTE'),
  'anon cannot execute grant_review_credits(uuid, integer)');
select ok(
  not has_function_privilege('authenticated', 'public.consume_review_credit(uuid)', 'EXECUTE'),
  'authenticated cannot execute consume_review_credit(uuid)');
select ok(
  not has_function_privilege('authenticated', 'public.grant_review_credits(uuid, integer)', 'EXECUTE'),
  'authenticated cannot execute grant_review_credits(uuid, integer)');
```

- [ ] **Step 4: Run the DB tests to verify they fail**

(`npm run db:start` first if the local Supabase stack isn't up.)

Run: `npm run db:test`
Expected: FAIL — `supabase db reset` succeeds, then `supabase test db` reports failures: `poster_reviews_test.sql` errors out (`relation "public.poster_reviews" does not exist`), `rpc_definitions_test.sql` reports `not ok` on the 12 new pins (`consume_review_credit` / `grant_review_credits` don't exist yet), and `billing_plan_test.sql` reports its three guard-message assertions failing (the live guard still raises the seven-column message, the test now expects ten).

- [ ] **Step 5: Write the migration**

`supabase/migrations/20260729120000_poster_reviews.sql`:

```sql
-- Postr · Presentation Checker — poster_reviews + review billing columns + RPCs
--
-- The data layer for the review economy (spec §5):
--   poster_reviews     one row per review: source, findings JSON, and the
--                      initial → followup → closed stage machine (§5.1/§5.2).
--   review_credits     the review pack's consumable count (§5.3) — mirrors
--                      export_credits; credits never expire.
--   review_addon / review_addon_subscription_id
--                      the term-subscription add-on granting a weekly review
--                      quota (enforced API-side via createRateLimiter; no
--                      per-review decrement).
--
-- RLS on poster_reviews is OWNER SELECT-ONLY (D3 — a hardening of the §5.1
-- draft's owner select/insert/update): every write goes through the API's
-- service_role client, which bypasses RLS. An owner-writable `stage` would
-- let a client reset a closed review to `initial` and farm free follow-ups;
-- an owner-insertable row would forge a paid review. The API writes a row
-- exactly once, after a successful critique, with status 'complete';
-- 'pending'/'failed' stay in the CHECK for future async use — v1 never
-- writes a failed row (D16).
--
-- The three users columns are SERVER-OWNED exactly like plan/export_credits:
-- folded into guard_billing_columns(), whose error message now lists all ten
-- guarded columns. consume_review_credit / grant_review_credits mirror the
-- export-credit RPCs verbatim: security definer, pinned search_path, atomic
-- conditional UPDATE, service_role only (browser EXECUTE revoked). Refunds
-- for the review SKUs are deferred (manual via the Stripe dashboard).

-- =========================================================================
-- 1. poster_reviews — the review + follow-up state machine (spec §5.1)
-- =========================================================================
create table if not exists public.poster_reviews (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  poster_id         uuid references public.posters(id) on delete set null, -- null for uploads
  source_kind       text not null check (source_kind in ('postr','pdf','pptx','image')),
  source_meta       jsonb not null default '{}'::jsonb,   -- filename, page count, ingest info
  status            text not null default 'pending'
                      check (status in ('pending','complete','failed')),
  stage             text not null default 'initial'
                      check (stage in ('initial','followup','closed')),
  initial_findings  jsonb,                                 -- CritiqueResult
  followup_findings jsonb,                                 -- CritiqueResult (diffed vs initial)
  credit_source     text check (credit_source in ('pack','subscription_addon')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.poster_reviews is
  'Presentation Checker reviews: one row per review with the initial → '
  'followup → closed stage machine. Written ONLY by the API (service_role) '
  'after a successful critique; the owner reads it back over RLS.';

alter table public.poster_reviews enable row level security;

-- Owner SELECT-only (D3): reads come back to the browser over PostgREST;
-- ALL writes are service_role (the API), which bypasses RLS. No insert /
-- update / delete policy exists on purpose — see the header comment.
drop policy if exists "poster_reviews_select_own" on public.poster_reviews;
create policy "poster_reviews_select_own"
  on public.poster_reviews
  for select
  to authenticated
  using (auth.uid() = user_id);

-- =========================================================================
-- 2. Review billing columns on public.users (server-owned)
-- =========================================================================
alter table public.users
  add column if not exists review_credits integer not null default 0,
  add column if not exists review_addon boolean not null default false,
  add column if not exists review_addon_subscription_id text;

alter table public.users
  drop constraint if exists users_review_credits_nonneg;
alter table public.users
  add constraint users_review_credits_nonneg check (review_credits >= 0);

comment on column public.users.review_credits is
  'Consumable review credits from the review pack. +N on purchase, -1 per '
  'successful initial critique (the follow-up is included — spec §5.3). '
  'Never expire. Server-owned.';
comment on column public.users.review_addon is
  'Whether the user holds the review add-on on their term subscription '
  '(weekly review quota, enforced API-side). Server-owned.';
comment on column public.users.review_addon_subscription_id is
  'Stripe subscription id of the review add-on, for webhook reconciliation. '
  'Server-owned.';

-- Reconcile an add-on subscription-lifecycle event back to its user quickly
-- (same precedent as users_stripe_subscription_id_idx).
create index if not exists users_review_addon_subscription_id_idx
  on public.users (review_addon_subscription_id)
  where review_addon_subscription_id is not null;

-- =========================================================================
-- 3. Extend the billing-column guard — ten server-owned columns
-- =========================================================================
-- review_credits / review_addon / review_addon_subscription_id are
-- server-owned exactly like the other billing columns — a client must not
-- grant itself review credits or the add-on. Body copied verbatim from
-- 20260728190000_billing_refunds.sql with the three new columns appended;
-- the error message now lists all ten. (The columns are added above, before
-- this reference, so the function body resolves.)
create or replace function public.guard_billing_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if (
        new.plan is distinct from old.plan
     or new.plan_expires_at is distinct from old.plan_expires_at
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.export_credits is distinct from old.export_credits
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.subscription_status is distinct from old.subscription_status
     or new.first_paid_export_at is distinct from old.first_paid_export_at
     or new.review_credits is distinct from old.review_credits
     or new.review_addon is distinct from old.review_addon
     or new.review_addon_subscription_id is distinct from old.review_addon_subscription_id
     )
     and current_setting('role', true) is distinct from 'service_role'
     and (select auth.role()) is distinct from 'service_role'
  then
    raise exception
      'billing columns (plan, plan_expires_at, stripe_customer_id, export_credits, stripe_subscription_id, subscription_status, first_paid_export_at, review_credits, review_addon, review_addon_subscription_id) are server-owned and cannot be changed by the client';
  end if;
  return new;
end;
$$;

-- Re-harden EXECUTE. Postgres grants EXECUTE to PUBLIC by default on a
-- create-or-replace; the revoke must name public AND anon explicitly. The
-- guard function is only ever invoked by the trigger, never directly.
revoke all on function public.guard_billing_columns() from public, anon, authenticated;

-- =========================================================================
-- 4. consume_review_credit / grant_review_credits — service_role only
-- =========================================================================
-- Verbatim mirrors of consume_export_credit / grant_export_credits against
-- review_credits, called ONLY by the API / billing webhook with the
-- service_role key. Atomicity: a single conditional UPDATE guarded by
-- `review_credits > 0`, RETURNING the new balance. Two concurrent critiques
-- cannot drive the balance negative — the second matches zero rows and
-- returns NULL, which the caller reads as "no credit".
create or replace function public.consume_review_credit(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_remaining integer;
begin
  update public.users
     set review_credits = review_credits - 1
   where id = p_user_id
     and review_credits > 0
  returning review_credits into v_remaining;

  -- NULL when the user had no credits (zero rows updated) — the caller
  -- treats that as "no credit available".
  return v_remaining;
end;
$$;

comment on function public.consume_review_credit(uuid) is
  'Atomically spend one review credit for a user; returns the new balance '
  'or NULL if none. service_role only (called by the review API).';

-- Postgres grants EXECUTE to PUBLIC by default. Strip it and every
-- browser-facing role; service_role keeps EXECUTE from schema defaults.
revoke execute on function public.consume_review_credit(uuid)
  from public, anon, authenticated;

-- Atomic credit GRANT for the webhook, mirroring grant_export_credits: a
-- single `SET review_credits = review_credits + p_amount` is atomic, so
-- concurrent grants from DISTINCT pack sessions sum correctly (the
-- per-session idempotency ledger only serialises the SAME session).
create or replace function public.grant_review_credits(
  p_user_id uuid,
  p_amount integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_remaining integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'grant amount must be a positive integer';
  end if;

  update public.users
     set review_credits = review_credits + p_amount
   where id = p_user_id
  returning review_credits into v_remaining;

  return v_remaining;
end;
$$;

comment on function public.grant_review_credits(uuid, integer) is
  'Atomically add review credits for a user; returns the new balance. '
  'service_role only (called by the billing webhook).';

revoke execute on function public.grant_review_credits(uuid, integer)
  from public, anon, authenticated;
```

- [ ] **Step 6: Run the DB tests to verify they pass**

Run: `npm run db:test`
Expected: PASS — `supabase db reset` applies the new migration, then every pgTAP file is `ok` with no `not ok` lines: `poster_reviews_test.sql` (14 assertions), `billing_plan_test.sql` (9 — its three guard assertions now match the ten-column message), `rpc_definitions_test.sql` (31).

- [ ] **Step 7: Regenerate the Supabase types**

```bash
npm run db:types
grep -c "poster_reviews" packages/shared/src/database.types.ts
grep -c "review_credits" packages/shared/src/database.types.ts
grep -c "consume_review_credit" packages/shared/src/database.types.ts
grep -c "grant_review_credits" packages/shared/src/database.types.ts
```

Expected: `packages/shared/src/database.types.ts` rewritten; every grep prints a count greater than 0 (the table under Tables, `review_credits`/`review_addon`/`review_addon_subscription_id` in the users Row/Insert/Update types, both RPCs under Functions).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260729120000_poster_reviews.sql supabase/tests/poster_reviews_test.sql supabase/tests/billing_plan_test.sql supabase/tests/rpc_definitions_test.sql packages/shared/src/database.types.ts
git commit -m "feat(review): poster_reviews + review billing columns + service_role-only consume/grant RPCs"
```

---

# MILESTONE 3 — API review module (apps/api)

**Purpose:** the server half of the critique loop (spec §2.1/§4) — typed contracts, deterministic grounding signals, rubric-composed prompts, SSRF-guarded page fetch, and the Anthropic forced tool-use provider. Everything here mirrors the `narrative/` module shape (config / prompt / provider / enforce) and the `extractStyle.ts` strict-Zod pattern; the routes that sit on top of these internals land in Tasks 15–18.

### Task 9: Shared review types + `review/config.ts` + `review/schema.ts`

**Files:**
- Create: `packages/shared/src/types/review.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/api/src/review/config.ts`
- Create: `apps/api/src/review/schema.ts`
- Test: `apps/api/src/__tests__/reviewSchema.test.ts`

**Interfaces:**
- Consumes: `ISSUE_CATEGORIES`, `IssueCategory` from `apps/api/src/review/rubric/index.js` (Task 1 — a runtime import, allowed because the rubric lives in apps/api).
- Produces: shared types `ReviewDimension`, `ReviewSeverity`, `ReviewIssueCategory`, `ReviewFindingAction`, `ReviewAnchor`, `ReviewFinding`, `CritiqueResult`, `ReviewSourceKind`, `ReviewPageRef` via `@postr/shared`; config consts `REVIEW_MODEL`, `REVIEW_MAX_TOKENS`, `REVIEW_MAX_PAGES`, `REVIEW_IMAGE_MAX_BYTES`, `REVIEW_PPTX_MAX_BYTES`, `REVIEW_MAX_FINDINGS`, `REVIEW_ADDON_WEEKLY_QUOTA`, `REVIEW_SIGNED_URL_TTL_SEC`; `validateCritique(raw: unknown): CritiqueResult | null`. Tasks 10–16 (API) and 20–23 (web) rely on these names verbatim.

- [ ] **Step 1: Write the failing test**

`apps/api/src/__tests__/reviewSchema.test.ts`:

```ts
/**
 * review/schema.ts — the critique output contract (spec §4.5 + D2's
 * required `category`). Golden fixtures must validate untouched; anything
 * malformed returns null (never throws, never half-parses) so critique.ts
 * can surface `bad_tool_json`.
 */
import { describe, it, expect } from 'vitest';
import type { CritiqueResult } from '@postr/shared';
import { validateCritique } from '../review/schema.js';

/** Golden fixture — one finding per anchor kind, all fields populated. */
const GOLDEN: CritiqueResult = {
  dimensionScores: { narrative: 4, design: 2, content: 3 },
  attentionSummary:
    'The eye lands on the large decorative lab photo top-center, drops to the dense methods column, and reaches the key-result figure only third.',
  prioritization:
    'Both tables present primary results; Table 1 lands the core result, Table 2 should move to the appendix.',
  findings: [
    {
      dimension: 'design',
      severity: 'high',
      category: 'decorative-hijack',
      anchor: { kind: 'region', page: 1, bbox: [0.3, 0.05, 0.4, 0.25] },
      action: 'cut',
      problem:
        'The stock lab photo is the most salient element on the page and carries no result.',
      fix: 'Remove the photo so the key-result figure becomes the entry point.',
      example:
        'Delete the top-center photo and move Figure 2 ("87% recovery at 6 weeks") into that space.',
    },
    {
      dimension: 'narrative',
      severity: 'medium',
      category: 'figure-text-disconnect',
      anchor: { kind: 'block', blockId: 'blk_results_fig2' },
      action: 'condense',
      problem: 'Figure 2 is never referenced from the results text.',
      fix: 'Add one sentence tying the figure to the claim it supports.',
      example:
        'After "…improved significantly", add "(Figure 2, 87% vs 41% at 6 weeks)".',
      tradeoff: 'Costs one line of the results word budget.',
    },
    {
      dimension: 'content',
      severity: 'low',
      category: 'jargon-mismatch',
      anchor: { kind: 'slide', page: 1 },
      action: 'condense',
      problem: '"qRT-PCR" appears three times before it is expanded.',
      fix: 'Expand the acronym at first use.',
      example: 'First mention becomes "quantitative RT-PCR (qRT-PCR)".',
    },
  ],
};

describe('validateCritique — golden fixtures', () => {
  it('accepts a fully-populated CritiqueResult (all three anchor kinds)', () => {
    expect(validateCritique(GOLDEN)).toEqual(GOLDEN);
  });

  it('accepts a minimal payload (no prioritization, no tradeoff, zero findings)', () => {
    const minimal = {
      dimensionScores: { narrative: 1, design: 5, content: 3 },
      attentionSummary: 'Single-page poster; the entry point is the title.',
      findings: [],
    };
    expect(validateCritique(minimal)).toEqual(minimal);
  });
});

describe('validateCritique — malformed payloads return null', () => {
  // JSON round-trip gives an `any` clone so each test can break exactly
  // one part of the contract without fighting the type system.
  const clone = () => JSON.parse(JSON.stringify(GOLDEN));

  it('rejects a finding with no example', () => {
    const raw = clone();
    delete raw.findings[0].example;
    expect(validateCritique(raw)).toBeNull();
  });

  it('rejects an unknown anchor kind', () => {
    const raw = clone();
    raw.findings[0].anchor = { kind: 'paragraph', index: 2 };
    expect(validateCritique(raw)).toBeNull();
  });

  it.each([0, 6])('rejects a dimension score of %i (outside 1–5)', (score) => {
    const raw = clone();
    raw.dimensionScores.narrative = score;
    expect(validateCritique(raw)).toBeNull();
  });

  it('rejects a category outside the rubric taxonomy', () => {
    const raw = clone();
    raw.findings[1].category = 'bad-color-choice';
    expect(validateCritique(raw)).toBeNull();
  });

  it('rejects extra top-level keys (strict schema)', () => {
    const raw = { ...clone(), posterTitle: 'leak' };
    expect(validateCritique(raw)).toBeNull();
  });

  it('rejects a region anchor with a 3-element bbox', () => {
    const raw = clone();
    raw.findings[0].anchor = { kind: 'region', page: 1, bbox: [0.1, 0.1, 0.4] };
    expect(validateCritique(raw)).toBeNull();
  });

  it('rejects non-object input', () => {
    expect(validateCritique(null)).toBeNull();
    expect(validateCritique('critique')).toBeNull();
    expect(validateCritique(42)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/api -- reviewSchema`
Expected: FAIL — module `../review/schema.js` does not exist (and `@postr/shared` has no `types/review.ts` yet).

- [ ] **Step 3: Create the shared types + export them**

`packages/shared/src/types/review.ts`:

```ts
/**
 * Presentation Checker — shared review contracts (spec §4.5, extended by
 * plan decision D2: `Finding.category` is required). Pure types, no runtime
 * values: apps/web imports these freely; apps/api imports them TYPE-ONLY
 * (@postr/shared ships TS source, which `node dist` cannot execute — see
 * the header note in apps/api/src/extractStyle.ts). The API's runtime copy
 * of the taxonomy (the rubric's ISSUE_CATEGORIES) is pinned to
 * `ReviewIssueCategory` at compile time in apps/api/src/review/schema.ts,
 * so the two can never drift (spec §2.0 single-source rule).
 */

/** Scoring dimensions, 1–5 each (score anchors live in the versioned rubric). */
export type ReviewDimension = 'narrative' | 'design' | 'content';

export type ReviewSeverity = 'high' | 'medium' | 'low';

/**
 * The shared issue taxonomy. The single source of truth is the rubric's
 * ISSUE_CATEGORIES (apps/api/src/review/rubric/); this union is its
 * compile-time mirror for web + API consumers.
 */
export type ReviewIssueCategory =
  | 'buried-key-result'
  | 'over-emphasis'
  | 'redundant-text'
  | 'competing-elements'
  | 'wall-of-text'
  | 'decorative-hijack'
  | 'no-takeaway'
  | 'figure-text-disconnect'
  | 'jargon-mismatch'
  | 'claims-evidence-gap'
  | 'section-imbalance'
  | 'readability-at-distance';

/**
 * Economy bias encoded in the schema itself (spec §4.5): the enum is
 * dominated by cut / demote-to-appendix / show-visually / condense;
 * 'add' is the RARE case — valid only when something essential is truly
 * absent. The system prompt repeats this, but the enum is the nudge that
 * cannot be prompt-engineered away.
 */
export type ReviewFindingAction =
  | 'cut'
  | 'demote-to-appendix'
  | 'show-visually'
  | 'condense'
  | 'keep-as-primary'
  | 'add';

/**
 * Where a finding points. `region.bbox` is normalized
 * `[x, y, width, height]` fractions of the page, each 0–1 (D7) — NOT
 * pixels and NOT the PosterDoc's 1/10-inch units. `block` is valid only
 * for Postr-native artifacts (D18): the API drops block-anchored findings
 * whose blockId is absent from the PosterDoc, and region/slide findings
 * whose page is out of range.
 */
export type ReviewAnchor =
  | { kind: 'block'; blockId: string }
  | { kind: 'region'; page: number; bbox: [number, number, number, number] }
  | { kind: 'slide'; page: number };

export interface ReviewFinding {
  dimension: ReviewDimension;
  severity: ReviewSeverity;
  category: ReviewIssueCategory;
  anchor: ReviewAnchor;
  action: ReviewFindingAction;
  /** The economy / attention-mismatch issue. */
  problem: string;
  /** The concrete recommendation. */
  fix: string;
  /**
   * PERSONALIZED, content-specific illustration of the fix — the actual
   * rewritten line, the exact rows to gray, the specific point to circle —
   * drawn from the artifact's own content, never a template. Required:
   * the advisory-only value proposition hangs on it (spec §4.5).
   */
  example: string;
  /** For prioritization calls — what the winning/losing element costs. */
  tradeoff?: string;
}

export interface CritiqueResult {
  dimensionScores: Record<ReviewDimension, number>;
  /** Stage-1 predicted gaze path / hotspots, in prose. */
  attentionSummary: string;
  /** Which competing element wins as primary, and where the other goes. */
  prioritization?: string;
  findings: ReviewFinding[];
}

export type ReviewSourceKind = 'postr' | 'pdf' | 'pptx' | 'image';

/** One rendered page of the normalized artifact, as served to the API. */
export interface ReviewPageRef {
  pageNumber: number;
  url: string;
  widthPx: number;
  heightPx: number;
}
```

`packages/shared/src/index.ts` — add the review export (full file after the edit):

```ts
export * from './types/poster';
export * from './types/preset';
export * from './types/library';
export * from './types/import';
export * from './types/style';
export * from './types/manuscript';
export * from './types/review';
export type { Database, Json } from './database.types';
```

- [ ] **Step 4: Create `review/config.ts`**

`apps/api/src/review/config.ts`:

```ts
/**
 * Review (Presentation Checker) model configuration — the ONLY place the
 * review model identifier lives (Global Constraints: "model id isolated
 * in apps/api/src/review/config.ts"). A model swap edits this file,
 * never critique.ts or a route.
 */

/**
 * The same model import.ts already uses for vision extraction, isolated
 * here per spec §2 (Model). Sonnet 4.5 carries the two-stage
 * perceive→judge pass over up to REVIEW_MAX_PAGES page images.
 */
export const REVIEW_MODEL = 'claude-sonnet-4-5-20250929';

/**
 * Output ceiling: the prompt asks for 4–10 findings ×
 * (problem + fix + personalized example) ≈ 2–4K tokens; 8192 leaves
 * headroom for multi-page decks without letting a runaway reply bill
 * (the import.ts:916-920 16K rationale, scaled to a smaller schema).
 */
export const REVIEW_MAX_TOKENS = 8192;

/** Hard page cap (spec §1) — over → typed error, never silent truncation. */
export const REVIEW_MAX_PAGES = 24;

/**
 * Per-page raw-byte cap, checked BEFORE base64 (which inflates 4/3) so the
 * caller gets a clean typed error instead of an opaque upstream rejection
 * (import.ts:544-551 precedent). Injectable in fetchReviewPages for tests.
 */
export const REVIEW_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** PPTX upload cap for the /api/review/render-pptx route (D10). */
export const REVIEW_PPTX_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Hard findings clamp applied by enforce.ts (Task 14). The prompt asks
 * for 4–10; this is the deterministic ceiling beyond that ask.
 */
export const REVIEW_MAX_FINDINGS = 12;

/**
 * Weekly add-on quota (D5) — placeholder, repriced from Phase-0 numbers;
 * the final value is set from day-one cost instrumentation (Task 28).
 */
export const REVIEW_ADDON_WEEKLY_QUOTA = 4;

/** Signed-URL TTL (seconds) for review page images (D11). */
export const REVIEW_SIGNED_URL_TTL_SEC = 600;
```

- [ ] **Step 5: Create `review/schema.ts`**

`apps/api/src/review/schema.ts`:

```ts
/**
 * The critique output contract, enforced server-side (spec §4.5).
 * `validateCritique` follows the extractStyle.ts:191-249 pattern: a strict
 * Zod schema + `safeParse`, malformed → null (the caller surfaces a
 * provider failure, never a half-parsed critique). Findings-count clamps
 * and anchor resolution are NOT here — that is enforce.ts (Task 14).
 *
 * Runtime imports come from ./rubric/index.js (allowed: the rubric lives
 * in apps/api). @postr/shared is imported TYPE-ONLY — its `main` is TS
 * source, which `node dist` cannot execute (extractStyle.ts:22-29). The
 * compile-time asserts below pin the shared `ReviewIssueCategory` union
 * to the rubric's `IssueCategory` in both directions: add, remove, or
 * rename a category in either place and the build breaks (the §2.0
 * single-source guarantee).
 */
import { z } from 'zod';
import type { CritiqueResult, ReviewIssueCategory } from '@postr/shared';
import { ISSUE_CATEGORIES, type IssueCategory } from './rubric/index.js';

type AssertSharedCoversRubric = [IssueCategory] extends [ReviewIssueCategory]
  ? true
  : never;
type AssertRubricCoversShared = [ReviewIssueCategory] extends [IssueCategory]
  ? true
  : never;
// Compile-time only — these fail to typecheck when the taxonomies drift.
const _sharedCoversRubric: AssertSharedCoversRubric = true;
const _rubricCoversShared: AssertRubricCoversShared = true;
void _sharedCoversRubric;
void _rubricCoversShared;

/**
 * Strict discriminated union on `kind` (D7: region bbox is normalized
 * [x, y, width, height] fractions; values are NOT range-checked here —
 * enforce.ts clamps to [0,1] and drops non-finite/out-of-range, D18).
 */
const AnchorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('block'), blockId: z.string().min(1) }).strict(),
  z
    .object({
      kind: z.literal('region'),
      page: z.number().int().min(1),
      bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    })
    .strict(),
  z.object({ kind: z.literal('slide'), page: z.number().int().min(1) }).strict(),
]);

const FindingSchema = z
  .object({
    dimension: z.enum(['narrative', 'design', 'content']),
    severity: z.enum(['high', 'medium', 'low']),
    // The category enum is derived from the rubric's runtime
    // ISSUE_CATEGORIES — never a hand-copied list (§2.0).
    category: z.enum(ISSUE_CATEGORIES),
    anchor: AnchorSchema,
    action: z.enum([
      'cut',
      'demote-to-appendix',
      'show-visually',
      'condense',
      'keep-as-primary',
      'add',
    ]),
    problem: z.string().min(1),
    fix: z.string().min(1),
    example: z.string().min(1),
    tradeoff: z.string().optional(),
  })
  .strict();

const CritiqueResultSchema = z
  .object({
    dimensionScores: z
      .object({
        narrative: z.number().int().min(1).max(5),
        design: z.number().int().min(1).max(5),
        content: z.number().int().min(1).max(5),
      })
      .strict(),
    attentionSummary: z.string().min(1),
    prioritization: z.string().optional(),
    findings: z.array(FindingSchema),
  })
  .strict();

/**
 * Validate a raw tool-use payload into a CritiqueResult. Anything outside
 * the contract — unknown category, unknown anchor kind, a score outside
 * 1–5, a missing example, extra keys — returns null, which critique.ts
 * maps to `bad_tool_json`. The declared return type doubles as a
 * compile-time pin: if the Zod output and the shared CritiqueResult ever
 * drift apart, this function stops typechecking.
 */
export function validateCritique(raw: unknown): CritiqueResult | null {
  const parsed = CritiqueResultSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test --workspace=apps/api -- reviewSchema`
Expected: PASS (10 tests).

- [ ] **Step 7: Typecheck — the compile-time pins are build-time guarantees**

Run: `npm run build --workspace=apps/api`
Expected: `tsc` exits 0. This is where the taxonomy asserts (schema.ts), the Zod-output→`CritiqueResult` pin (`validateCritique`'s return type), and the new `packages/shared/src/types/review.ts` export are all verified — vitest strips types without checking them, so do not skip this step.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/types/review.ts packages/shared/src/index.ts apps/api/src/review/config.ts apps/api/src/review/schema.ts apps/api/src/__tests__/reviewSchema.test.ts
git commit -m "feat(review): shared review types + review config + Zod critique contract pinned to rubric taxonomy"
```

### Task 10: Deterministic signals (`review/signals.ts`)

**Files:**
- Create: `apps/api/src/review/signals.ts`
- Test: `apps/api/src/__tests__/reviewSignals.test.ts`

**Interfaces:**
- Consumes: nothing (pure functions over plain blocks).
- Produces: `SignalBlock`, `ReviewSignals`, `computeReviewSignals(blocks: SignalBlock[]): ReviewSignals`. Task 11 renders `ReviewSignals` into the user message; Task 15 (router) computes signals from the PosterDoc's blocks for `sourceKind: 'postr'`.

- [ ] **Step 1: Write the failing test**

`apps/api/src/__tests__/reviewSignals.test.ts`:

```ts
/**
 * review/signals.ts — deterministic grounding numbers (spec §4.4).
 * Exact-value cases only: these numbers go into the prompt verbatim, so
 * any counting drift is a prompt drift.
 */
import { describe, it, expect } from 'vitest';
import {
  computeReviewSignals,
  type SignalBlock,
} from '../review/signals.js';

const POSTER: SignalBlock[] = [
  { id: 't1', type: 'title', content: 'A <b>bold</b> claim' },
  { id: 'h1', type: 'heading', content: 'Results' },
  {
    id: 'x1',
    type: 'text',
    content:
      '<p>One two <strong>three</strong> four.</p><p>Five <em>six</em> <mark>seven</mark>.</p>',
  },
  { id: 'x2', type: 'text', content: 'Eight nine ten' },
  { id: 'f1', type: 'image', content: null },
  { id: 'f2', type: 'chart', content: '' },
  { id: 'tb', type: 'table', content: '<td>cell one</td><td>cell two</td>' },
  { id: 'lg', type: 'logo', content: null },
];

describe('computeReviewSignals', () => {
  it('computes exact values on a synthetic poster', () => {
    expect(computeReviewSignals(POSTER)).toEqual({
      emphasisRunCount: 4,
      boldRuns: 2,
      italicRuns: 1,
      highlightRuns: 1,
      figureBlockCount: 2,
      tableBlockCount: 1,
      textBlockCount: 2,
      totalWordCount: 18,
      figureToTextRatio: 1,
    });
  });

  it('returns zeros for an empty block list', () => {
    expect(computeReviewSignals([])).toEqual({
      emphasisRunCount: 0,
      boldRuns: 0,
      italicRuns: 0,
      highlightRuns: 0,
      figureBlockCount: 0,
      tableBlockCount: 0,
      textBlockCount: 0,
      totalWordCount: 0,
      figureToTextRatio: 0,
    });
  });

  it('floors the ratio denominator at 1 (all-figure poster)', () => {
    const s = computeReviewSignals([
      { id: 'a', type: 'image', content: null },
      { id: 'b', type: 'chart', content: null },
    ]);
    expect(s.textBlockCount).toBe(0);
    expect(s.figureToTextRatio).toBe(2);
  });

  it('counts uppercase openers and tags with attributes as emphasis runs', () => {
    const s = computeReviewSignals([
      {
        id: 'x',
        type: 'text',
        content: '<STRONG>one</STRONG> <b class="k">two</b> <MARK>three</MARK>',
      },
    ]);
    expect(s.boldRuns).toBe(2);
    expect(s.highlightRuns).toBe(1);
    expect(s.emphasisRunCount).toBe(3);
    expect(s.totalWordCount).toBe(3);
  });

  it('decodes entities before counting words', () => {
    const s = computeReviewSignals([
      { id: 'x', type: 'text', content: '<p>Tom &amp; Jerry</p>' },
    ]);
    expect(s.totalWordCount).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/api -- reviewSignals`
Expected: FAIL — module `../review/signals.js` does not exist.

- [ ] **Step 3: Implement the signals**

`apps/api/src/review/signals.ts`:

```ts
/**
 * Deterministic grounding signals (spec §4.4) — hard numbers computed
 * from the PosterDoc so the model cannot misjudge emphasis load or
 * figure/text balance. Pure regex/string parsing, NO DOM (the API has no
 * `document`); the tag-strip mirrors the web's
 * academicMarkdown.stripHtmlToPlainText, re-implemented here because
 * apps/api cannot import web code. This is the readability.ts pattern:
 * small pure parser, exact-value tests.
 *
 * Block classification over the PosterDoc BlockType union:
 *   figure  = 'image' | 'chart'   ('logo' is chrome, not content)
 *   table   = 'table'
 *   text    = 'text'   (prose — title/heading/authors/references are
 *                       structural: excluded from the ratio, but their
 *                       words still count in totalWordCount)
 */

export interface SignalBlock {
  id: string;
  type: string;
  content?: string | null;
}

export interface ReviewSignals {
  emphasisRunCount: number;
  boldRuns: number;
  italicRuns: number;
  highlightRuns: number;
  figureBlockCount: number;
  tableBlockCount: number;
  textBlockCount: number;
  totalWordCount: number;
  figureToTextRatio: number;
}

/**
 * Opening tags only — each emphasis run is one opener. Editor emphasis is
 * <b>/<strong>/<i>/<em>/<mark> wrappers (apps/web/src/poster/blocks.tsx);
 * inline-style emphasis is not counted (Stage 1 judges colour and size
 * visually anyway). `(?=[\s>])` keeps `<b>` from matching `<br>`/`<body>`.
 */
const BOLD_RE = /<(?:b|strong)(?=[\s>])[^>]*>/gi;
const ITALIC_RE = /<(?:i|em)(?=[\s>])[^>]*>/gi;
const HIGHLIGHT_RE = /<mark(?=[\s>])[^>]*>/gi;
const TAG_RE = /<[^>]+>/g;

function countMatches(re: RegExp, html: string): number {
  return (html.match(re) ?? []).length;
}

/** Tag-strip + entity decode — parity with the web's stripHtmlToPlainText. */
function htmlToPlainText(html: string): string {
  return html
    .replace(TAG_RE, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function computeReviewSignals(blocks: SignalBlock[]): ReviewSignals {
  let boldRuns = 0;
  let italicRuns = 0;
  let highlightRuns = 0;
  let figureBlockCount = 0;
  let tableBlockCount = 0;
  let textBlockCount = 0;
  let totalWordCount = 0;

  for (const block of blocks) {
    const html = block.content ?? '';
    boldRuns += countMatches(BOLD_RE, html);
    italicRuns += countMatches(ITALIC_RE, html);
    highlightRuns += countMatches(HIGHLIGHT_RE, html);
    totalWordCount += countWords(htmlToPlainText(html));
    if (block.type === 'image' || block.type === 'chart') figureBlockCount++;
    else if (block.type === 'table') tableBlockCount++;
    else if (block.type === 'text') textBlockCount++;
  }

  return {
    emphasisRunCount: boldRuns + italicRuns + highlightRuns,
    boldRuns,
    italicRuns,
    highlightRuns,
    figureBlockCount,
    tableBlockCount,
    textBlockCount,
    totalWordCount,
    // Figures per prose block; the denominator is floored at 1 so an
    // all-figure poster returns its figure count instead of Infinity.
    figureToTextRatio: figureBlockCount / Math.max(textBlockCount, 1),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/api -- reviewSignals`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/review/signals.ts apps/api/src/__tests__/reviewSignals.test.ts
git commit -m "feat(review): deterministic grounding signals — emphasis runs, block mix, figure:text ratio"
```

### Task 11: Prompt composition (`review/prompt.ts`)

**Files:**
- Create: `apps/api/src/review/prompt.ts`
- Test: `apps/api/src/__tests__/reviewPrompt.test.ts`

**Interfaces:**
- Consumes: `Rubric`, `CURRENT_RUBRIC` from `./rubric/index.js` (Task 1); `ReviewSignals` from `./signals.js` (Task 10); `CritiqueResult`, `ReviewSourceKind` from `@postr/shared` (Task 9).
- Produces: `composeReviewSystemPrompt(rubric?: Rubric): string`, `buildInitialUserMessage(input): string`, `buildFollowupUserMessage(input): string`, `CRITIQUE_TOOL_INPUT_SCHEMA`. Task 13 consumes the schema; Tasks 15–16 consume the builders.

**The §4.6 seam (design note, no code):** the system prompt renders Stage 1 (perception) and Stage 2 (judgment) as two separately-composed sections from two separate rubric rule sets — that separation is the deliberate upgrade seam. When a real saliency model is warranted later, Stage 1's "model *describes* the attention pass" is replaced by "saliency model *computes* a map fed into Stage 2"; Stage 2's judge section barely changes. Keep the two sections independently editable when implementing this task.

- [ ] **Step 1: Write the failing test**

`apps/api/src/__tests__/reviewPrompt.test.ts`:

```ts
/**
 * review/prompt.ts — the §2.0 composition guarantee: every criterion in
 * the system prompt must come FROM the rubric data, never from inlined
 * prose. The custom-rubric test is the anti-inlining pin — render a fake
 * rubric and v1's rule ids must disappear entirely.
 */
import { describe, it, expect } from 'vitest';
import type { CritiqueResult } from '@postr/shared';
import {
  CURRENT_RUBRIC,
  type Rubric,
} from '../review/rubric/index.js';
import {
  composeReviewSystemPrompt,
  buildInitialUserMessage,
  buildFollowupUserMessage,
  CRITIQUE_TOOL_INPUT_SCHEMA,
} from '../review/prompt.js';
import type { ReviewSignals } from '../review/signals.js';

const SIGNALS: ReviewSignals = {
  emphasisRunCount: 4,
  boldRuns: 2,
  italicRuns: 1,
  highlightRuns: 1,
  figureBlockCount: 2,
  tableBlockCount: 1,
  textBlockCount: 2,
  totalWordCount: 18,
  figureToTextRatio: 1,
};

const INITIAL_CRITIQUE: CritiqueResult = {
  dimensionScores: { narrative: 3, design: 2, content: 4 },
  attentionSummary: 'Entry point is the decorative header band.',
  findings: [
    {
      dimension: 'design',
      severity: 'high',
      category: 'wall-of-text',
      anchor: { kind: 'region', page: 1, bbox: [0.05, 0.3, 0.4, 0.5] },
      action: 'cut',
      problem: 'The methods column is a 180-word paragraph no one will read.',
      fix: 'Cut it to three bullets of ≤ 12 words each.',
      example: '"Cells were cultured overnight at 37°C in DMEM + 10% FBS."',
    },
    {
      dimension: 'narrative',
      severity: 'medium',
      category: 'buried-key-result',
      anchor: { kind: 'slide', page: 1 },
      action: 'keep-as-primary',
      problem: 'The 87% recovery figure sits in the bottom-right corner.',
      fix: 'Move it to the top-right entry position.',
      example: 'Swap Figure 2 with the background panel above it.',
    },
  ],
};

describe('composeReviewSystemPrompt', () => {
  it('renders every rubric rule id and text (perception AND economy)', () => {
    const prompt = composeReviewSystemPrompt();
    for (const rule of [
      ...CURRENT_RUBRIC.perceptionRules,
      ...CURRENT_RUBRIC.economyRules,
    ]) {
      expect(prompt).toContain(`[${rule.id}]`);
      expect(prompt).toContain(rule.text);
    }
  });

  it('renders the economy rules inside the BOTH-stages economy section', () => {
    const prompt = composeReviewSystemPrompt();
    const economySection = prompt.slice(
      prompt.indexOf('BOTH stages are governed'),
    );
    for (const rule of CURRENT_RUBRIC.economyRules) {
      expect(economySection).toContain(`[${rule.id}]`);
      expect(economySection).toContain(rule.text);
    }
  });

  it('renders the dimension scoring anchors', () => {
    const prompt = composeReviewSystemPrompt();
    for (const d of CURRENT_RUBRIC.dimensions) {
      expect(prompt).toContain(
        `- ${d.name}: 1 = ${d.anchors.low} | 3 = ${d.anchors.mid} | 5 = ${d.anchors.high}`,
      );
    }
  });

  it('composes a custom rubric with NO v1 residue (anti-inlining pin)', () => {
    const custom: Rubric = {
      version: CURRENT_RUBRIC.version,
      issueCategories: CURRENT_RUBRIC.issueCategories,
      perceptionRules: [
        {
          id: 'test-perc-only',
          text: 'Custom perception rule text for the anti-inlining test.',
          provenance: 'test',
          dimensions: ['design'],
          checklistCategory: null,
        },
      ],
      economyRules: [
        {
          id: 'test-econ-only',
          text: 'Custom economy rule text for the anti-inlining test.',
          provenance: 'test',
          dimensions: ['narrative'],
          checklistCategory: null,
        },
      ],
      dimensions: [
        {
          dimension: 'narrative',
          name: 'TestNarrative',
          anchors: { low: 'tl', mid: 'tm', high: 'th' },
        },
      ],
    };
    const prompt = composeReviewSystemPrompt(custom);
    expect(prompt).toContain('[test-perc-only]');
    expect(prompt).toContain('[test-econ-only]');
    expect(prompt).toContain('TestNarrative');
    expect(prompt).not.toContain('perc-entry-salience');
    expect(prompt).not.toContain('econ-lens');
  });
});

describe('buildInitialUserMessage', () => {
  it('embeds the deterministic signals numbers', () => {
    const msg = buildInitialUserMessage({
      pageCount: 1,
      sourceKind: 'postr',
      signals: SIGNALS,
      posterDocPresent: true,
    });
    expect(msg).toContain(
      'Emphasis runs: 4 total (bold 2, italic 1, highlight 1)',
    );
    expect(msg).toContain('Blocks: 2 figure, 1 table, 2 text');
    expect(msg).toContain('Total words: 18');
    expect(msg).toContain('Figure-to-text ratio: 1.00');
  });

  it('declares block anchors available iff a PosterDoc is present', () => {
    const withDoc = buildInitialUserMessage({
      pageCount: 1,
      sourceKind: 'postr',
      signals: SIGNALS,
      posterDocPresent: true,
    });
    expect(withDoc).toContain('block anchors ARE available');
    const noDoc = buildInitialUserMessage({
      pageCount: 3,
      sourceKind: 'pdf',
      posterDocPresent: false,
    });
    expect(noDoc).toContain('block anchors are NOT available');
    expect(noDoc).toContain(
      'judge emphasis load and figure-to-text balance visually',
    );
  });

  it('states the page count and source kind', () => {
    const msg = buildInitialUserMessage({
      pageCount: 12,
      sourceKind: 'pptx',
      posterDocPresent: false,
    });
    expect(msg).toContain('12 page(s)');
    expect(msg).toContain('Source kind: pptx');
  });
});

describe('buildFollowupUserMessage', () => {
  it('embeds the initial findings JSON (problem strings recoverable)', () => {
    const msg = buildFollowupUserMessage({
      initialFindings: INITIAL_CRITIQUE,
      pageCount: 1,
      sourceKind: 'postr',
    });
    expect(msg).toContain(JSON.stringify(INITIAL_CRITIQUE));
    for (const f of INITIAL_CRITIQUE.findings) {
      expect(msg).toContain(f.problem);
    }
  });

  it('carries the §5.2 judge framing ("did they address these? what is still open?")', () => {
    const msg = buildFollowupUserMessage({
      initialFindings: INITIAL_CRITIQUE,
      pageCount: 1,
      sourceKind: 'postr',
    });
    expect(msg).toContain('Did they address these?');
    expect(msg).toContain('What is still open?');
  });
});

describe('CRITIQUE_TOOL_INPUT_SCHEMA', () => {
  it('derives the category enum from the rubric taxonomy', () => {
    const categories =
      CRITIQUE_TOOL_INPUT_SCHEMA.properties.findings.items.properties
        .category.enum;
    expect([...categories]).toEqual([...CURRENT_RUBRIC.issueCategories]);
  });

  it('requires example on every finding (the personalization guarantee)', () => {
    expect(
      CRITIQUE_TOOL_INPUT_SCHEMA.properties.findings.items.required,
    ).toContain('example');
  });

  it('marks the dimension scores as 1–5 integers', () => {
    const scores =
      CRITIQUE_TOOL_INPUT_SCHEMA.properties.dimensionScores.properties;
    for (const key of ['narrative', 'design', 'content'] as const) {
      expect(scores[key]).toMatchObject({
        type: 'integer',
        minimum: 1,
        maximum: 5,
      });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/api -- reviewPrompt`
Expected: FAIL — module `../review/prompt.js` does not exist.

- [ ] **Step 3: Implement prompt composition**

`apps/api/src/review/prompt.ts`:

```ts
/**
 * REVIEW PROMPT — composed FROM the versioned rubric, never inlined
 * (spec §2.0). The criteria live in ./rubric/ as typed data; this module
 * only renders them. Adding an expert-derived criterion is a rubric
 * entry, not a prompt edit.
 *
 * The structure mirrors the Phase-0 prototype's SYSTEM (Task 5, validated
 * on the frozen corpus): Stage 1 renders the perception rules, Stage 2 is
 * fixed judge framing, the ECONOMY section renders the economy rules
 * (they govern BOTH stages), scoring renders the dimension anchors. The
 * system prompt stays static per rubric version (cacheable); everything
 * artifact-specific goes into the user message.
 */
import type { CritiqueResult, ReviewSourceKind } from '@postr/shared';
import { CURRENT_RUBRIC, type Rubric } from './rubric/index.js';
import type { ReviewSignals } from './signals.js';

/** Rule ids render as [id] so findings can be traced back to rubric
 *  rules during §7 disagreement triage. */
function renderRules(rules: Rubric['perceptionRules']): string {
  return rules.map((r) => `- [${r.id}] ${r.text}`).join('\n');
}

function renderDimensions(rubric: Rubric): string {
  return rubric.dimensions
    .map(
      (d) =>
        `- ${d.name}: 1 = ${d.anchors.low} | 3 = ${d.anchors.mid} | 5 = ${d.anchors.high}`,
    )
    .join('\n');
}

/**
 * The critique system prompt for a rubric (default: CURRENT_RUBRIC).
 * Passing a rubric is how the §7 harness A/B-tests criterion changes
 * without editing this file.
 */
export function composeReviewSystemPrompt(
  rubric: Rubric = CURRENT_RUBRIC,
): string {
  return `You are an expert reviewer of research posters and conference talks. You critique the artifact in TWO ORDERED STAGES. The ordering matters: perceive first, then judge against intent.

STAGE 1 — Perceptual-attention pass (free-viewing simulation).
Before any judgment, describe how a first-time viewer's eye would actually move across the artifact: the entry point, salience hotspots, any faces/photos that hijack gaze, the emphasis load, and the predicted reading path. Ground every prediction in these perception rules:
${renderRules(rubric.perceptionRules)}

STAGE 2 — Judge the predicted flow against the intended message.
Using your Stage-1 prediction, judge: does the eye land on the KEY RESULT early, or does something decorative hijack it? Is the narrative (hook → question → method → result → takeaway) recoverable from the scan path? Does each figure connect to its explaining text? Is the content right for the audience (jargon, claims vs evidence, section balance, readability at distance)?

BOTH stages are governed by the ECONOMY principle — your default posture is "what can be removed or shown instead of told", never "what is missing":
${renderRules(rubric.economyRules)}

Score each dimension 1–5 using these anchors:
${renderDimensions(rubric)}

FINDING ANCHORS — three kinds:
- block: the id of a block in the artifact's structured document. Use ONLY when the user message says a structured document is provided.
- region: a page number plus a normalized [x, y, width, height] bbox in fractions of the page, each 0–1.
- slide: a page number only, for whole-page issues.

OUTPUT RULES:
- Emit via the emit_critique tool ONLY.
- Every finding needs a category from the issue taxonomy, an anchor, and an action. Actions are dominated by cut / demote-to-appendix / show-visually / condense; "add" is the RARE case — use it only when something essential is truly absent.
- "example" is required and must be PERSONALIZED to the artifact: the actual rewritten line, the exact rows to gray, the specific point to circle — drawn from THEIR content, never a template.
- attentionSummary is your Stage-1 prediction in prose. When two elements compete as primary, prioritization must say which one wins and where the other goes.
- 4–10 findings, highest value first.`;
}

function renderSignals(signals: ReviewSignals): string {
  return [
    'Deterministic signals measured from the structured document (trust these numbers over your own estimate):',
    `- Emphasis runs: ${signals.emphasisRunCount} total (bold ${signals.boldRuns}, italic ${signals.italicRuns}, highlight ${signals.highlightRuns})`,
    `- Blocks: ${signals.figureBlockCount} figure, ${signals.tableBlockCount} table, ${signals.textBlockCount} text`,
    `- Total words: ${signals.totalWordCount}`,
    `- Figure-to-text ratio: ${signals.figureToTextRatio.toFixed(2)}`,
  ].join('\n');
}

/**
 * Initial critique user message: artifact facts first, the closing
 * instruction last — the order the Phase-0 prototype's runs validated.
 */
export function buildInitialUserMessage(input: {
  pageCount: number;
  sourceKind: ReviewSourceKind;
  signals?: ReviewSignals;
  posterDocPresent: boolean;
}): string {
  const parts: string[] = [];
  parts.push(
    `Artifact: ${input.pageCount} page(s), in reading order, provided as the images above. Source kind: ${input.sourceKind}.`,
  );
  parts.push(
    input.posterDocPresent
      ? 'A structured poster document (PosterDoc) accompanies the images: block anchors ARE available — prefer { kind: "block", blockId } whenever a finding is about a specific text or figure block.'
      : 'No structured document exists for this source: block anchors are NOT available — anchor every finding by region (page + normalized bbox) or slide (page).',
  );
  parts.push(
    input.signals
      ? renderSignals(input.signals)
      : 'No deterministic signals are available for this source — judge emphasis load and figure-to-text balance visually.',
  );
  parts.push('Produce the two-stage critique now.');
  return parts.join('\n');
}

/**
 * Follow-up user message (spec §5.2): a diff against the initial
 * critique, not a fresh review — the "mentor tracking your improvement"
 * framing. The initial findings arrive as JSON; the judge questions are
 * fixed framing; the emit instruction reframes the output as the state
 * of the REVISED artifact.
 */
export function buildFollowupUserMessage(input: {
  initialFindings: CritiqueResult;
  pageCount: number;
  sourceKind: ReviewSourceKind;
  signals?: ReviewSignals;
}): string {
  const parts: string[] = [];
  parts.push(
    `This is a FOLLOW-UP review. The author revised their ${input.pageCount}-page ${input.sourceKind} artifact after your initial critique; the revised pages are the images above.`,
  );
  parts.push('');
  parts.push('INITIAL CRITIQUE (JSON):');
  parts.push(JSON.stringify(input.initialFindings));
  parts.push('');
  parts.push('Judge the revision against those initial findings:');
  parts.push(
    '1. Did they address these? Go finding by finding — addressed, partially addressed, or not addressed — citing what you see on the revised pages.',
  );
  parts.push(
    '2. What is still open? Carry every unaddressed or partially-addressed item into your findings.',
  );
  parts.push(
    '3. New issues introduced by the revision, if any are real — do not manufacture problems to justify the follow-up.',
  );
  if (input.signals) {
    parts.push('');
    parts.push(renderSignals(input.signals));
  }
  parts.push('');
  parts.push(
    'Emit a critique of the REVISED artifact: attentionSummary is the new Stage-1 prediction; findings are what still needs fixing (carried-forward open items plus genuine new ones), not a repeat of what is now fixed.',
  );
  return parts.join('\n');
}

/**
 * Forced tool-use input schema — mirrors the Zod contract in schema.ts
 * (validateCritique is the enforcement; this is the model-facing shape).
 * The category enum is built from CURRENT_RUBRIC.issueCategories so the
 * taxonomy stays single-source (§2.0). The anchor stays a loose object
 * here — tool input schemas cannot express a discriminated union —
 * and schema.ts validates the strict union afterwards.
 */
export const CRITIQUE_TOOL_INPUT_SCHEMA = {
  type: 'object',
  required: ['dimensionScores', 'attentionSummary', 'findings'],
  additionalProperties: false,
  properties: {
    dimensionScores: {
      type: 'object',
      required: ['narrative', 'design', 'content'],
      additionalProperties: false,
      properties: {
        narrative: { type: 'integer', minimum: 1, maximum: 5 },
        design: { type: 'integer', minimum: 1, maximum: 5 },
        content: { type: 'integer', minimum: 1, maximum: 5 },
      },
    },
    attentionSummary: { type: 'string' },
    prioritization: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'dimension',
          'severity',
          'category',
          'anchor',
          'action',
          'problem',
          'fix',
          'example',
        ],
        additionalProperties: false,
        properties: {
          dimension: {
            type: 'string',
            enum: ['narrative', 'design', 'content'],
          },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          category: {
            type: 'string',
            enum: [...CURRENT_RUBRIC.issueCategories],
          },
          anchor: {
            type: 'object',
            required: ['kind'],
            properties: {
              kind: { type: 'string', enum: ['block', 'region', 'slide'] },
              blockId: { type: 'string' },
              page: { type: 'integer', minimum: 1 },
              bbox: {
                type: 'array',
                items: { type: 'number' },
                minItems: 4,
                maxItems: 4,
              },
            },
          },
          action: {
            type: 'string',
            enum: [
              'cut',
              'demote-to-appendix',
              'show-visually',
              'condense',
              'keep-as-primary',
              'add',
            ],
          },
          problem: { type: 'string' },
          fix: { type: 'string' },
          example: { type: 'string' },
          tradeoff: { type: 'string' },
        },
      },
    },
  },
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/api -- reviewPrompt`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/review/prompt.ts apps/api/src/__tests__/reviewPrompt.test.ts
git commit -m "feat(review): rubric-composed critique prompts + emit_critique tool input schema"
```

### Task 12: SSRF-guarded page fetch (`review/fetchPages.ts`)

**Files:**
- Create: `apps/api/src/review/fetchPages.ts`
- Test: `apps/api/src/__tests__/reviewFetchPages.test.ts`

**Interfaces:**
- Consumes: `checkImageUrl` from `../imageUrlGuard.js`; `REVIEW_IMAGE_MAX_BYTES` from `./config.js` (Task 9); `ReviewPageRef` from `@postr/shared` (Task 9).
- Produces: `FetchedPage`, `PageFetchError`, `fetchReviewPages(pages, opts): Promise<FetchedPage[]>`. Tasks 15–16 (routes) consume these.

- [ ] **Step 1: Write the failing test**

`apps/api/src/__tests__/reviewFetchPages.test.ts`:

```ts
/**
 * review/fetchPages.ts — SSRF guard + byte cap + media-type allowlist.
 * fetchFn is stubbed with `new Response(...)` (the importExtract.test.ts
 * convention); no network, no vi.mock.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ReviewPageRef } from '@postr/shared';
import {
  fetchReviewPages,
  PageFetchError,
} from '../review/fetchPages.js';

const SUPABASE_URL = 'https://testref.supabase.co';

function page(n: number, url?: string): ReviewPageRef {
  return {
    pageNumber: n,
    url:
      url ??
      `${SUPABASE_URL}/storage/v1/object/sign/poster-assets/u/p/page-${n}.png?token=abc`,
    widthPx: 2048,
    heightPx: 1152,
  };
}

function imageResponse(byteLength: number, contentType = 'image/png'): Response {
  return new Response(new Uint8Array(byteLength), {
    status: 200,
    headers: { 'content-type': contentType },
  });
}

const deps = (fetchFn: ReturnType<typeof vi.fn>, extra?: object) => ({
  supabaseUrl: SUPABASE_URL,
  fetchFn: fetchFn as unknown as typeof fetch,
  ...extra,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchReviewPages', () => {
  it('fetches an allowlisted page and returns base64 + media type', async () => {
    const fetchFn = vi.fn().mockResolvedValue(imageResponse(1024));
    const out = await fetchReviewPages([page(1)], deps(fetchFn));
    expect(out).toEqual([
      {
        mediaType: 'image/png',
        imageData: Buffer.from(new Uint8Array(1024)).toString('base64'),
      },
    ]);
    expect(fetchFn).toHaveBeenCalledWith(
      page(1).url,
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('keeps page order and per-page media types for multi-page artifacts', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(imageResponse(10))
      .mockResolvedValueOnce(imageResponse(20, 'image/jpeg'));
    const out = await fetchReviewPages([page(1), page(2)], deps(fetchFn));
    expect(out.map((p) => p.mediaType)).toEqual(['image/png', 'image/jpeg']);
    expect(out[0]!.imageData).toBe(
      Buffer.from(new Uint8Array(10)).toString('base64'),
    );
    expect(out[1]!.imageData).toBe(
      Buffer.from(new Uint8Array(20)).toString('base64'),
    );
  });

  it('rejects a foreign host with url_not_allowed BEFORE any fetch', async () => {
    const fetchFn = vi.fn();
    await expect(
      fetchReviewPages([page(1, 'https://evil.com/p.png')], deps(fetchFn)),
    ).rejects.toMatchObject({
      name: 'PageFetchError',
      code: 'url_not_allowed',
      pageNumber: 1,
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fails closed as url_not_allowed when the allowlist is not configured', async () => {
    const fetchFn = vi.fn();
    await expect(
      fetchReviewPages([page(1)], {
        supabaseUrl: '',
        fetchFn: fetchFn as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'url_not_allowed' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects an oversize page with too_large (byte cap is injectable)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(imageResponse(1025));
    await expect(
      fetchReviewPages([page(1)], deps(fetchFn, { maxBytes: 1024 })),
    ).rejects.toMatchObject({ code: 'too_large', pageNumber: 1 });
  });

  it('accepts a page at exactly the byte cap', async () => {
    const fetchFn = vi.fn().mockResolvedValue(imageResponse(1024));
    const out = await fetchReviewPages(
      [page(1)],
      deps(fetchFn, { maxBytes: 1024 }),
    );
    expect(out).toHaveLength(1);
  });

  it('rejects a non-image content-type with unsupported_media', async () => {
    const fetchFn = vi.fn().mockResolvedValue(imageResponse(100, 'text/html'));
    await expect(
      fetchReviewPages([page(1)], deps(fetchFn)),
    ).rejects.toMatchObject({ code: 'unsupported_media', pageNumber: 1 });
  });

  it('rejects a failed upstream response with fetch_failed + status', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('gone', { status: 404 }));
    await expect(
      fetchReviewPages([page(1)], deps(fetchFn)),
    ).rejects.toMatchObject({ code: 'fetch_failed', status: 404 });
  });

  it('maps a rejected fetch (e.g. a refused redirect) to fetch_failed', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(new TypeError('fetch failed: unexpected redirect'));
    const err = await fetchReviewPages([page(1)], deps(fetchFn)).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(PageFetchError);
    expect(err).toMatchObject({ code: 'fetch_failed' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/api -- reviewFetchPages`
Expected: FAIL — module `../review/fetchPages.js` does not exist.

- [ ] **Step 3: Implement the guarded fetch**

`apps/api/src/review/fetchPages.ts`:

```ts
/**
 * Server-side re-fetch of review page images, SSRF-guarded. The signed
 * URLs the client uploads stay internal: the API fetches the bytes itself
 * and forwards base64 to the model (the import.ts:525-528 rationale — the
 * bucket stays private and arbitrary internal-only URLs keep working).
 *
 * Per page, modeled on import.ts:494-558: checkImageUrl allowlist →
 * fetch with redirect:'error' → ok check → raw-byte cap BEFORE base64 →
 * content-type → mediaType. Stricter than import.ts in one place: an
 * unknown content-type is `unsupported_media`, not a png fallback — a
 * "page" that isn't a jpeg/png is an ingest bug, and failing typed beats
 * confusing the vision pass.
 */
import type { ReviewPageRef } from '@postr/shared';
import { checkImageUrl } from '../imageUrlGuard.js';
import { REVIEW_IMAGE_MAX_BYTES } from './config.js';

export interface FetchedPage {
  mediaType: 'image/jpeg' | 'image/png';
  imageData: string;
}

/**
 * Typed failure the route maps to a status (url_not_allowed→400,
 * unsupported_media→400, too_large→413, fetch_failed→502). `pageNumber`
 * names the offending page; `status` carries the upstream HTTP status
 * for fetch_failed. Class shape mirrors CondenseUpstreamError.
 */
export class PageFetchError extends Error {
  constructor(
    public readonly code:
      | 'url_not_allowed'
      | 'fetch_failed'
      | 'too_large'
      | 'unsupported_media',
    detail?: string,
    public readonly pageNumber?: number,
    public readonly status?: number,
  ) {
    super(detail ?? code);
    this.name = 'PageFetchError';
  }
}

/**
 * Fetch every page in order. Any failure aborts the whole batch — a
 * critique over a partial page set would silently miss content (the
 * "never silently truncate" rule applies to dropped pages too).
 *
 * `opts.supabaseUrl` defaults to process.env.SUPABASE_URL; when it is
 * missing the guard fails closed as url_not_allowed (the detail string
 * records 'allowlist_not_configured' for logs). `opts.maxBytes` defaults
 * to REVIEW_IMAGE_MAX_BYTES and exists so tests don't allocate 5MB.
 */
export async function fetchReviewPages(
  pages: ReviewPageRef[],
  opts: {
    supabaseUrl?: string;
    fetchFn?: typeof fetch;
    maxBytes?: number;
  } = {},
): Promise<FetchedPage[]> {
  const supabaseUrl = opts.supabaseUrl ?? process.env.SUPABASE_URL;
  const fetchFn = opts.fetchFn ?? fetch;
  const maxBytes = opts.maxBytes ?? REVIEW_IMAGE_MAX_BYTES;

  const out: FetchedPage[] = [];
  for (const page of pages) {
    const check = checkImageUrl(page.url, supabaseUrl);
    if (!check.ok) {
      throw new PageFetchError(
        'url_not_allowed',
        `page ${page.pageNumber}: ${check.reason}`,
        page.pageNumber,
      );
    }

    let response: Response;
    try {
      response = await fetchFn(page.url, {
        signal: AbortSignal.timeout(15_000),
        // The host allowlist is worthless if the allowed host can 302
        // elsewhere — refuse redirects outright (import.ts:534-537).
        redirect: 'error',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      throw new PageFetchError(
        'fetch_failed',
        `page ${page.pageNumber}: ${message}`,
        page.pageNumber,
      );
    }
    if (!response.ok) {
      throw new PageFetchError(
        'fetch_failed',
        `page ${page.pageNumber}: upstream HTTP ${response.status}`,
        page.pageNumber,
        response.status,
      );
    }

    const buf = Buffer.from(await response.arrayBuffer());
    // Raw bytes BEFORE base64 (which inflates 4/3): a clean typed error
    // beats an opaque upstream rejection (import.ts:544-551).
    if (buf.byteLength > maxBytes) {
      throw new PageFetchError(
        'too_large',
        `page ${page.pageNumber}: ${buf.byteLength} bytes exceeds ${maxBytes}`,
        page.pageNumber,
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    const mediaType = contentType.includes('jpeg')
      ? ('image/jpeg' as const)
      : contentType.includes('png')
        ? ('image/png' as const)
        : null;
    if (!mediaType) {
      throw new PageFetchError(
        'unsupported_media',
        `page ${page.pageNumber}: content-type "${contentType || 'missing'}" is not image/jpeg or image/png`,
        page.pageNumber,
      );
    }

    out.push({ mediaType, imageData: buf.toString('base64') });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/api -- reviewFetchPages`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/review/fetchPages.ts apps/api/src/__tests__/reviewFetchPages.test.ts
git commit -m "feat(review): SSRF-guarded review page fetch with byte cap + jpeg/png allowlist"
```

### Task 13: Anthropic critique provider (`review/critique.ts`)

**Files:**
- Create: `apps/api/src/review/critique.ts`
- Test: `apps/api/src/__tests__/reviewCritique.test.ts`

**Interfaces:**
- Consumes: `REVIEW_MODEL`, `REVIEW_MAX_TOKENS` from `./config.js` (Task 9); `CRITIQUE_TOOL_INPUT_SCHEMA` from `./prompt.js` (Task 11); `validateCritique` from `./schema.js` (Task 9); `FetchedPage` from `./fetchPages.js` (Task 12); `CritiqueResult` from `@postr/shared` (Task 9).
- Produces: `CritiqueCallCtx`, `CritiqueCallResult`, `CritiqueUpstreamError`, `callAnthropicCritique(anthropic, ctx): Promise<CritiqueCallResult>`. Tasks 15–16 (routes) consume these.

- [ ] **Step 1: Write the failing test**

`apps/api/src/__tests__/reviewCritique.test.ts`:

```ts
/**
 * review/critique.ts — the Anthropic adapter contract. The SDK is mocked
 * at the layer (importExtract.test.ts:32-46 pattern): a `{ messages:
 * { create } }` plain object cast to Anthropic — no vi.mock, no network.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type { CritiqueResult } from '@postr/shared';
import {
  callAnthropicCritique,
  CritiqueUpstreamError,
  type CritiqueCallCtx,
} from '../review/critique.js';
import { REVIEW_MODEL, REVIEW_MAX_TOKENS } from '../review/config.js';

const VALID_CRITIQUE: CritiqueResult = {
  dimensionScores: { narrative: 4, design: 2, content: 3 },
  attentionSummary: 'The eye lands on the decorative header band first.',
  findings: [
    {
      dimension: 'design',
      severity: 'high',
      category: 'over-emphasis',
      anchor: { kind: 'block', blockId: 'blk_intro' },
      action: 'cut',
      problem: 'Nine bolded phrases compete across the intro column.',
      fix: 'Keep bold on the one result phrase; unbold the rest.',
      example: 'Keep "87% recovery at 6 weeks" bold; unbold "novel", "first", "robust".',
    },
  ],
};

const CTX: CritiqueCallCtx = {
  systemPrompt: 'SYS',
  userMessage: 'Produce the two-stage critique now.',
  pages: [
    { mediaType: 'image/png', imageData: 'QUJD' },
    { mediaType: 'image/jpeg', imageData: 'REVG' },
  ],
};

function fakeAnthropic(create: ReturnType<typeof vi.fn>) {
  return { create, client: { messages: { create } } as unknown as Anthropic };
}

function createReturningToolUse(input: unknown) {
  return vi.fn().mockResolvedValue({
    content: [
      { type: 'tool_use', id: 'toolu_test', name: 'emit_critique', input },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 1234, output_tokens: 567 },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('callAnthropicCritique — success', () => {
  it('returns the validated critique + token usage', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const anthropic = fakeAnthropic(createReturningToolUse(VALID_CRITIQUE));
    const out = await callAnthropicCritique(anthropic.client, CTX);
    expect(out.critique).toEqual(VALID_CRITIQUE);
    expect(out.usage).toEqual({ inputTokens: 1234, outputTokens: 567 });
  });

  it('forces the emit_critique tool with the config model + token cap', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const anthropic = fakeAnthropic(createReturningToolUse(VALID_CRITIQUE));
    await callAnthropicCritique(anthropic.client, CTX);
    expect(anthropic.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: REVIEW_MODEL,
        max_tokens: REVIEW_MAX_TOKENS,
        system: 'SYS',
        tool_choice: { type: 'tool', name: 'emit_critique' },
      }),
    );
  });

  it('sends pages as image blocks, then the user message as the text closer', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const anthropic = fakeAnthropic(createReturningToolUse(VALID_CRITIQUE));
    await callAnthropicCritique(anthropic.client, CTX);
    const content =
      anthropic.create.mock.calls[0]![0].messages[0].content;
    expect(content).toHaveLength(3);
    expect(content[0]).toMatchObject({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'QUJD' },
    });
    expect(content[1]).toMatchObject({
      type: 'image',
      source: { media_type: 'image/jpeg', data: 'REVG' },
    });
    expect(content[2]).toEqual({
      type: 'text',
      text: 'Produce the two-stage critique now.',
    });
  });

  it('logs token usage with the [review.critique] tag', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const anthropic = fakeAnthropic(createReturningToolUse(VALID_CRITIQUE));
    await callAnthropicCritique(anthropic.client, CTX);
    expect(log).toHaveBeenCalledWith(
      '[review.critique] anthropic done',
      expect.objectContaining({
        stopReason: 'tool_use',
        inputTokens: 1234,
        outputTokens: 567,
      }),
    );
  });
});

describe('callAnthropicCritique — failure mapping', () => {
  it('no tool_use in the response → no_tool_call', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'here is my critique' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const anthropic = fakeAnthropic(create);
    await expect(
      callAnthropicCritique(anthropic.client, CTX),
    ).rejects.toMatchObject({
      name: 'CritiqueUpstreamError',
      code: 'no_tool_call',
    });
  });

  it('contract-violating tool payload → bad_tool_json', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const broken = JSON.parse(JSON.stringify(VALID_CRITIQUE));
    delete broken.findings[0].example;
    const anthropic = fakeAnthropic(createReturningToolUse(broken));
    await expect(
      callAnthropicCritique(anthropic.client, CTX),
    ).rejects.toMatchObject({ code: 'bad_tool_json' });
  });

  it('SDK http error → http_error with the upstream status', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('rate limited'), { status: 429 }),
      );
    const anthropic = fakeAnthropic(create);
    const err = await callAnthropicCritique(anthropic.client, CTX).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(CritiqueUpstreamError);
    expect(err).toMatchObject({ code: 'http_error', status: 429 });
  });

  it('SDK timeout → timeout', async () => {
    const timeoutErr = new Error('request timed out');
    timeoutErr.name = 'APIConnectionTimeoutError';
    const create = vi.fn().mockRejectedValue(timeoutErr);
    const anthropic = fakeAnthropic(create);
    await expect(
      callAnthropicCritique(anthropic.client, CTX),
    ).rejects.toMatchObject({ code: 'timeout' });
  });

  it('non-SDK errors propagate untouched', async () => {
    const create = vi.fn().mockRejectedValue(new Error('boom'));
    const anthropic = fakeAnthropic(create);
    await expect(
      callAnthropicCritique(anthropic.client, CTX),
    ).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/api -- reviewCritique`
Expected: FAIL — module `../review/critique.js` does not exist.

- [ ] **Step 3: Implement the provider**

`apps/api/src/review/critique.ts`:

```ts
/**
 * Anthropic critique provider — the forced tool-use call behind the
 * Presentation Checker's two-stage review. Mirrors the import.ts:897-959
 * adapter skeleton (tool const, messages.create with tool_choice forced,
 * response.content.find(tool_use)) with two deliberate differences: the
 * model id and token cap come from review/config.ts (never inlined), and
 * the raw tool payload goes through schema.ts — a contract violation is
 * a `bad_tool_json` provider failure, not a parse crash.
 *
 * No streaming (Global Constraints). Token usage is logged on every call
 * under the [review.critique] tag — the day-one cost instrumentation the
 * pack price and weekly quota are set from (spec §6.2).
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { CritiqueResult } from '@postr/shared';
import { REVIEW_MODEL, REVIEW_MAX_TOKENS } from './config.js';
import { CRITIQUE_TOOL_INPUT_SCHEMA } from './prompt.js';
import { validateCritique } from './schema.js';
import type { FetchedPage } from './fetchPages.js';

export interface CritiqueCallCtx {
  systemPrompt: string;
  userMessage: string;
  pages: FetchedPage[];
}

export interface CritiqueCallResult {
  critique: CritiqueResult;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Upstream failure with enough shape for the route's status mapping
 * (the route passes 401/429/529 through, everything else 502 — the
 * imageUrlGuard-era convention). The `code` is machine-readable; raw
 * provider text stays server-side. Class shape mirrors
 * CondenseUpstreamError.
 */
export class CritiqueUpstreamError extends Error {
  constructor(
    public readonly code:
      | 'http_error'
      | 'no_tool_call'
      | 'bad_tool_json'
      | 'timeout',
    public readonly status?: number,
    detail?: string,
  ) {
    super(detail ?? code);
    this.name = 'CritiqueUpstreamError';
  }
}

export async function callAnthropicCritique(
  anthropic: Anthropic,
  ctx: CritiqueCallCtx,
): Promise<CritiqueCallResult> {
  const tool = {
    name: 'emit_critique',
    description:
      'Emit the structured poster/presentation critique as JSON.',
    input_schema:
      CRITIQUE_TOOL_INPUT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
  } satisfies Anthropic.Tool;

  // Pages first (stable, large), the instruction text last — the order
  // import.ts:924-942 and the Phase-0 prototype both use. (SDK 0.30 has
  // no ContentBlockParam union; MessageParam['content'] is the type.)
  const content: Anthropic.MessageParam['content'] = [
    ...ctx.pages.map((p) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: p.mediaType,
        data: p.imageData,
      },
    })),
    { type: 'text' as const, text: ctx.userMessage },
  ];

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: REVIEW_MODEL,
      max_tokens: REVIEW_MAX_TOKENS,
      system: ctx.systemPrompt,
      tools: [tool],
      tool_choice: { type: 'tool', name: 'emit_critique' },
      messages: [{ role: 'user', content }],
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'APIConnectionTimeoutError') {
      throw new CritiqueUpstreamError('timeout');
    }
    // The SDK's APIError carries a numeric `status`; duck-typed so tests
    // can reject with a plain Error + status (the SDK is mocked at the
    // layer, so a real APIError cannot be constructed in tests).
    const status = (err as { status?: unknown } | null)?.status;
    if (typeof status === 'number') {
      const detail = err instanceof Error ? err.message : undefined;
      throw new CritiqueUpstreamError('http_error', status, detail?.slice(0, 500));
    }
    throw err;
  }

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  );
  // Day-one cost instrumentation + max-tokens truncation spotting —
  // the import.ts:952-957 logging pattern.
  // eslint-disable-next-line no-console
  console.log('[review.critique] anthropic done', {
    stopReason: response.stop_reason,
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
    toolInputKeys: toolUse?.input ? Object.keys(toolUse.input) : null,
  });
  if (!toolUse) throw new CritiqueUpstreamError('no_tool_call');

  const critique = validateCritique(toolUse.input);
  if (!critique) throw new CritiqueUpstreamError('bad_tool_json');

  return {
    critique,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/api -- reviewCritique`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck the module set**

Run: `npm run build --workspace=apps/api`
Expected: `tsc` exits 0 — the review module (config / schema / signals / prompt / fetchPages / critique) compiles as a unit, with `@postr/shared` imported type-only everywhere.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/review/critique.ts apps/api/src/__tests__/reviewCritique.test.ts
git commit -m "feat(review): Anthropic critique provider — forced tool-use, Zod-validated output, usage logging"
```

### Task 14: `review/enforce.ts`

**Files:**
- Create: `apps/api/src/review/enforce.ts`
- Test: `apps/api/src/__tests__/reviewEnforce.test.ts`

**Interfaces:**
- Consumes: `ReviewFinding`, `ReviewAnchor`, `ReviewSeverity` (type-only imports from `@postr/shared`, Task 9); `REVIEW_MAX_FINDINGS` from `apps/api/src/review/config.ts` (Task 9).
- Produces: `EnforceCtx`, `enforceFindings(findings, ctx)` — the deterministic enforcement of spec §4.5 (drop unresolvable anchors per D18, dedupe, `add`-distribution guard, severity-ordered clamp). Task 15/16's router consumes these.

- [ ] **Step 1: Write the failing test**

`apps/api/src/__tests__/reviewEnforce.test.ts`:

```ts
/**
 * enforceFindings — the deterministic half of the output contract
 * (spec §4.5). The prompt ASKS for well-anchored, deduped,
 * economy-biased findings; this module GUARANTEES them:
 *
 *   1. drop findings whose anchor doesn't resolve (D18): block ids
 *      must exist in the PosterDoc (block anchors are postr-only),
 *      region/slide pages must be within 1..pageCount, region bboxes
 *      are clamped to [0,1] and dropped when non-finite;
 *   2. dedupe by anchor-key + action + normalized problem prefix;
 *   3. action-distribution guard: with ≥ 4 findings, 'add' may be at
 *      most half — drop low-severity adds first, then medium;
 *   4. clamp to maxFindings (default REVIEW_MAX_FINDINGS), severity
 *      order high → medium → low, stable within a severity.
 *
 * Pure functions, exact assertions.
 */
import { describe, it, expect } from 'vitest';
import type { ReviewFinding } from '@postr/shared';
import { enforceFindings } from '../review/enforce.js';
import { REVIEW_MAX_FINDINGS } from '../review/config.js';

let seq = 0;
function finding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  seq += 1;
  return {
    dimension: 'design',
    severity: 'medium',
    category: 'wall-of-text',
    anchor: { kind: 'slide', page: 1 },
    action: 'condense',
    problem: `Problem ${seq}: the methods section is a wall of text.`,
    fix: 'Condense methods to three bullets.',
    example: 'Replace the 180-word methods paragraph with three bullets.',
    ...overrides,
  };
}

function addFinding(severity: ReviewFinding['severity'], problem: string): ReviewFinding {
  return finding({ action: 'add', severity, problem });
}

describe('anchor resolution', () => {
  it('keeps block findings whose blockId resolves and drops the rest', () => {
    const kept = finding({ anchor: { kind: 'block', blockId: 'b1' }, problem: 'kept block' });
    const dropped = finding({ anchor: { kind: 'block', blockId: 'bX' }, problem: 'dropped block' });
    const out = enforceFindings([kept, dropped], { blockIds: new Set(['b1']), pageCount: 1 });
    expect(out).toEqual([kept]);
  });

  it('drops every block anchor when there is no PosterDoc (upload sources, D18)', () => {
    const f = finding({ anchor: { kind: 'block', blockId: 'b1' } });
    expect(enforceFindings([f], { pageCount: 1 })).toEqual([]);
  });

  it.each([0, 2, 1.5, -1])(
    'drops slide/region findings with page %s when pageCount is 1',
    (page) => {
      const slide = finding({ anchor: { kind: 'slide', page } });
      const region = finding({ anchor: { kind: 'region', page, bbox: [0, 0, 0.5, 0.5] } });
      expect(enforceFindings([slide, region], { pageCount: 1 })).toEqual([]);
    },
  );

  it('clamps region bboxes into [0,1] and keeps the finding', () => {
    const f = finding({ anchor: { kind: 'region', page: 1, bbox: [-0.2, 0.4, 1.7, 0.1] } });
    const out = enforceFindings([f], { pageCount: 1 });
    expect(out).toHaveLength(1);
    expect(out[0]!.anchor).toEqual({ kind: 'region', page: 1, bbox: [0, 0.4, 1, 0.1] });
  });

  it.each([NaN, Infinity, -Infinity])(
    'drops region findings with non-finite bbox value %s',
    (bad) => {
      const f = finding({ anchor: { kind: 'region', page: 1, bbox: [0, bad, 0.5, 0.5] } });
      expect(enforceFindings([f], { pageCount: 1 })).toEqual([]);
    },
  );
});

describe('dedupe', () => {
  // 44 chars — two problems sharing this opener share the 40-char
  // normalized prefix the dedupe key compares.
  const PREFIX = 'the key result is impossible to find because';

  it('drops the later finding when anchor, action, and normalized problem prefix match', () => {
    const a = finding({ problem: `${PREFIX} it sits below the fold.` });
    const b = finding({ problem: `${PREFIX} of the layout choices.` });
    const out = enforceFindings([a, b], { pageCount: 1 });
    expect(out).toEqual([a]);
  });

  it('normalizes case and whitespace before comparing prefixes', () => {
    const a = finding({ problem: 'The   KEY result is impossible to find because X.' });
    const b = finding({ problem: 'the key result is impossible to find because Y.' });
    expect(enforceFindings([a, b], { pageCount: 1 })).toEqual([a]);
  });

  it('keeps findings that share a problem prefix but differ in action or anchor', () => {
    const base = { problem: `${PREFIX} same.` };
    const a = finding({ ...base, action: 'cut' as const });
    const b = finding({ ...base, action: 'condense' as const });
    const c = finding({ ...base, action: 'cut' as const, anchor: { kind: 'slide' as const, page: 2 } });
    const out = enforceFindings([a, b, c], { pageCount: 2 });
    expect(out).toHaveLength(3);
  });
});

describe('add-distribution guard', () => {
  it('does nothing when there are fewer than 4 findings', () => {
    const fs = [addFinding('low', 'add a'), addFinding('low', 'add b'), addFinding('low', 'add c')];
    expect(enforceFindings(fs, { pageCount: 1 })).toHaveLength(3);
  });

  it('drops low-severity adds first until adds are at most half', () => {
    const keep1 = finding({ problem: 'keep 1' });
    const keep2 = finding({ problem: 'keep 2' });
    const addHigh = addFinding('high', 'add high');
    const addMed = addFinding('medium', 'add medium');
    const addLow1 = addFinding('low', 'add low 1');
    const addLow2 = addFinding('low', 'add low 2');
    const out = enforceFindings([keep1, addLow1, addHigh, addLow2, addMed, keep2], {
      pageCount: 1,
    });
    expect(out.map((f) => f.problem).sort()).toEqual([
      'add high',
      'add medium',
      'keep 1',
      'keep 2',
    ]);
  });

  it('keeps exactly 50% adds', () => {
    const fs = [
      finding({ problem: 'keep 1' }),
      finding({ problem: 'keep 2' }),
      addFinding('low', 'add low'),
      addFinding('high', 'add high'),
    ];
    expect(enforceFindings(fs, { pageCount: 1 })).toHaveLength(4);
  });
});

describe('count clamp', () => {
  it('clamps to REVIEW_MAX_FINDINGS high-severity first, stable within a severity', () => {
    const highs = [0, 1, 2].map((i) => finding({ severity: 'high' as const, problem: `high ${i}` }));
    const mediums = Array.from({ length: 8 }, (_, i) =>
      finding({ severity: 'medium' as const, problem: `medium ${i}` }),
    );
    const lows = Array.from({ length: 5 }, (_, i) =>
      finding({ severity: 'low' as const, problem: `low ${i}` }),
    );
    const out = enforceFindings([...lows, ...mediums, ...highs], { pageCount: 1 });
    expect(REVIEW_MAX_FINDINGS).toBe(12);
    expect(out).toHaveLength(REVIEW_MAX_FINDINGS);
    expect(out.map((f) => f.problem)).toEqual([
      'high 0',
      'high 1',
      'high 2',
      'medium 0',
      'medium 1',
      'medium 2',
      'medium 3',
      'medium 4',
      'medium 5',
      'medium 6',
      'medium 7',
      'low 0',
    ]);
  });

  it('respects a maxFindings override', () => {
    const fs = Array.from({ length: 5 }, (_, i) => finding({ problem: `p${i}` }));
    expect(enforceFindings(fs, { pageCount: 1, maxFindings: 2 })).toHaveLength(2);
  });
});

describe('composition (all rules in pipeline order)', () => {
  it('resolves anchors, dedupes, rebalances adds, then clamps', () => {
    const out = enforceFindings(
      [
        addFinding('low', 'add one'), // kept by guard (adds land at exactly 50%)
        finding({
          severity: 'high',
          problem: 'unresolvable',
          anchor: { kind: 'block', blockId: 'gone' }, // dropped: anchor
        }),
        finding({ severity: 'high', problem: 'dup anchor same problem text!!' }),
        finding({ severity: 'high', problem: 'dup anchor same problem text!!' }), // dropped: dedupe
        finding({ severity: 'medium', problem: 'solid medium' }),
        addFinding('high', 'add two'),
      ],
      { blockIds: new Set(['b1']), pageCount: 1 },
    );
    // High severities first (stable), then medium, then low.
    expect(out.map((f) => f.problem)).toEqual([
      'dup anchor same problem text!!',
      'add two',
      'solid medium',
      'add one',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/api -- reviewEnforce`
Expected: FAIL — module `../review/enforce.js` does not exist.

- [ ] **Step 3: Implement `enforceFindings`**

`apps/api/src/review/enforce.ts`:

```ts
/**
 * Deterministic enforcement of the critique output contract (spec
 * §4.5), applied AFTER the model replies and BEFORE anything is
 * persisted or returned. The prompt asks for well-anchored, deduped,
 * economy-biased findings; this module guarantees them:
 *
 *   1. Anchor resolution (D18): `block` anchors must reference a real
 *      PosterDoc block — with no PosterDoc (pdf/pptx/image sources)
 *      every block anchor is unresolvable. `region`/`slide` pages must
 *      be within 1..pageCount. Region bboxes are clamped into [0,1];
 *      any non-finite coordinate drops the finding (clamping NaN is
 *      still NaN — there is nothing to salvage).
 *   2. Dedupe: same anchor + same action + same normalized problem
 *      prefix (lowercased, whitespace-collapsed, first 40 chars) keeps
 *      only the first occurrence — the model lists highest value first.
 *   3. Action-distribution guard: the economy bias (§4.5) makes 'add'
 *      the rare case. With ≥ 4 findings, if more than half are 'add',
 *      drop adds — low severity first, then medium, high last — until
 *      adds are at most half. Within a severity the LATER add drops
 *      first (highest-value-first ordering again).
 *   4. Clamp: at most maxFindings (default REVIEW_MAX_FINDINGS),
 *      ordered high → medium → low, stable within a severity.
 *
 * Pure and synchronous — no I/O, no model calls.
 */
import type { ReviewAnchor, ReviewFinding, ReviewSeverity } from '@postr/shared';
import { REVIEW_MAX_FINDINGS } from './config.js';

export interface EnforceCtx {
  /** Postr-native posters only: the PosterDoc's block ids. Undefined
   *  for uploads — block anchors never resolve there (D18). */
  blockIds?: ReadonlySet<string>;
  pageCount: number;
  maxFindings?: number;
}

/** Sort rank: lower sorts first. */
const SEVERITY_RANK: Record<ReviewSeverity, number> = { high: 0, medium: 1, low: 2 };

export function enforceFindings(findings: ReviewFinding[], ctx: EnforceCtx): ReviewFinding[] {
  const resolved = findings
    .map((f) => resolveAnchor(f, ctx))
    .filter((f): f is ReviewFinding => f !== null);
  const deduped = dedupe(resolved);
  const rebalanced = guardAddDistribution(deduped);
  return clamp(rebalanced, ctx.maxFindings ?? REVIEW_MAX_FINDINGS);
}

// ─────────────────────────────────────────────────────────────────────
// Rule 1 — anchor resolution
// ─────────────────────────────────────────────────────────────────────

function resolveAnchor(finding: ReviewFinding, ctx: EnforceCtx): ReviewFinding | null {
  const anchor = finding.anchor;
  switch (anchor.kind) {
    case 'block':
      return ctx.blockIds?.has(anchor.blockId) ? finding : null;
    case 'slide':
      return inPageRange(anchor.page, ctx.pageCount) ? finding : null;
    case 'region': {
      if (!inPageRange(anchor.page, ctx.pageCount)) return null;
      if (anchor.bbox.some((v) => !Number.isFinite(v))) return null;
      const clamped = anchor.bbox.map((v) => Math.min(1, Math.max(0, v))) as [
        number,
        number,
        number,
        number,
      ];
      return { ...finding, anchor: { kind: 'region', page: anchor.page, bbox: clamped } };
    }
  }
}

function inPageRange(page: number, pageCount: number): boolean {
  return Number.isInteger(page) && page >= 1 && page <= pageCount;
}

// ─────────────────────────────────────────────────────────────────────
// Rule 2 — dedupe
// ─────────────────────────────────────────────────────────────────────

function anchorKey(anchor: ReviewAnchor): string {
  switch (anchor.kind) {
    case 'block':
      return `block:${anchor.blockId}`;
    case 'region':
      return `region:${anchor.page}`;
    case 'slide':
      return `slide:${anchor.page}`;
  }
}

function problemKey(problem: string): string {
  return problem.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40);
}

function dedupe(findings: ReviewFinding[]): ReviewFinding[] {
  const seen = new Set<string>();
  const out: ReviewFinding[] = [];
  for (const f of findings) {
    const key = `${anchorKey(f.anchor)}|${f.action}|${problemKey(f.problem)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Rule 3 — 'add'-distribution guard
// ─────────────────────────────────────────────────────────────────────

function guardAddDistribution(findings: ReviewFinding[]): ReviewFinding[] {
  if (findings.length < 4) return findings;
  // Indices of the 'add' findings in drop order: low severity first,
  // then medium, high last; within a severity the later one drops first.
  const dropOrder = findings
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.action === 'add')
    .sort((a, b) => SEVERITY_RANK[b.f.severity] - SEVERITY_RANK[a.f.severity] || b.i - a.i);
  const dropped = new Set<number>();
  let addCount = dropOrder.length;
  let total = findings.length;
  for (const { i } of dropOrder) {
    if (addCount * 2 <= total) break;
    dropped.add(i);
    addCount--;
    total--;
  }
  return findings.filter((_, i) => !dropped.has(i));
}

// ─────────────────────────────────────────────────────────────────────
// Rule 4 — severity-ordered clamp
// ─────────────────────────────────────────────────────────────────────

function clamp(findings: ReviewFinding[], maxFindings: number): ReviewFinding[] {
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => SEVERITY_RANK[a.f.severity] - SEVERITY_RANK[b.f.severity] || a.i - b.i)
    .slice(0, maxFindings)
    .map(({ f }) => f);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/api -- reviewEnforce`
Expected: PASS (19 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/review/enforce.ts apps/api/src/__tests__/reviewEnforce.test.ts
git commit -m "feat(review): deterministic finding enforcement — anchor resolution, dedupe, add-distribution guard, severity clamp"
```

### Task 15: Review router — initial critique (`apps/api/src/review.ts` + mount)

**Files:**
- Create: `apps/api/src/review.ts`
- Modify: `apps/api/src/app.ts` (mount after `createNarrativeRouter()`)
- Test: `apps/api/src/__tests__/reviewRouter.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `AuthLocals` (`apps/api/src/auth.ts`); `createRateLimiter` (`apps/api/src/rateLimit.ts`); `REVIEW_MAX_PAGES`, `REVIEW_IMAGE_MAX_BYTES`, `REVIEW_MODEL`, `REVIEW_ADDON_WEEKLY_QUOTA` (`review/config.ts`, Task 9); `CURRENT_RUBRIC_VERSION` (`review/rubric/index.ts`, Task 1); `computeReviewSignals` (Task 10); `composeReviewSystemPrompt`, `buildInitialUserMessage` (Task 11); `fetchReviewPages`, `PageFetchError`, `FetchedPage` (Task 12); `callAnthropicCritique`, `CritiqueUpstreamError`, `CritiqueCallResult` (Task 13); `enforceFindings` (Task 14); `CritiqueResult`, `ReviewSourceKind` types from `@postr/shared` (Task 9).
- Produces:

```ts
export interface ReviewRouterDeps {
  getSupabaseAdmin?: () => SupabaseClient | null;
  getAnthropic?: () => Anthropic | null;
  fetchFn?: typeof fetch;
  weeklyLimiter?: RequestHandler;   // add-on weekly window; default built per D5
  now?: () => number;
}
export function createReviewRouter(deps?: ReviewRouterDeps): Router;
// POST /api/review/critique
//   body:  { sourceKind: ReviewSourceKind; pages: ReviewPageRef[]; posterDoc?: PosterDoc;
//            posterId?: string; reviewId?: string }
//   200:   { reviewId: string; stage: 'initial' | 'closed'; critique: CritiqueResult }
//   400:   { error: 'bad_request' | 'too_many_pages' | 'url_not_allowed' | ... }
//   402:   { error: 'review_payment_required', reason: 'no_credit' | 'weekly_quota_exceeded', retryAfterSec? }
//   403:   { error: 'not_review_owner' }        404: { error: 'review_not_found' }
//   409:   { error: 'review_closed' | 'review_not_complete' }
//   413:   { error: 'image_too_large' }         502: { error: 'review_upstream' | 'bad_model_output' }
```

(The 403/404/409 rows are Task 16's follow-up branch; Task 15 wires the initial flow and the mount.)

- [ ] **Step 1: Write the failing test**

`apps/api/src/__tests__/reviewRouter.test.ts`:

```ts
/**
 * POST /api/review/critique — initial critique flow: zod validation,
 * the 24-page hard cap (§1: typed error, never silent truncation),
 * server-side entitlement resolution (D4: term-active add-on → weekly
 * window → pack credits → 402), SSRF-guarded page fetch, upstream
 * error mapping, credit consume AFTER success (D6), and the
 * success-only poster_reviews write (D16).
 *
 * Anthropic is mocked at the SDK layer (the importExtract.test.ts
 * pattern); Supabase is a stateful fake serving the users row and
 * recording rpc/insert calls (the billing.test.ts pattern).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestHandler } from 'express';
import { createReviewRouter } from '../review.js';
import { CURRENT_RUBRIC_VERSION } from '../review/rubric/index.js';
import { REVIEW_MODEL } from '../review/config.js';

const SUPABASE_URL = 'https://testref.supabase.co';
const PAGE_URL = `${SUPABASE_URL}/storage/v1/object/sign/poster-assets/u/p/review-capture.jpg?token=abc`;

const VALID_CRITIQUE = {
  dimensionScores: { narrative: 3, design: 2, content: 4 },
  attentionSummary: 'The eye lands on the decorative photo before the key-result figure.',
  findings: [
    {
      dimension: 'design',
      severity: 'high',
      category: 'decorative-hijack',
      anchor: { kind: 'region', page: 1, bbox: [0.3, 0.05, 0.4, 0.25] },
      action: 'cut',
      problem: 'A decorative lab photo hijacks the first fixation.',
      fix: 'Remove the photo so the key-result figure becomes the entry point.',
      example: 'Delete the top-center lab group photo and move Figure 2 into that slot.',
    },
  ],
};

interface FakeSupabaseOpts {
  userRow?: Record<string, unknown> | null;
  consumeResult?: number | null;
  insertedId?: string;
}

function fakeSupabase(opts: FakeSupabaseOpts = {}) {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: 'user-1', is_anonymous: false } },
        error: null,
      }),
    },
    from(table: string) {
      return {
        select: (_cols?: string) => ({
          eq: (_col: string, _val: unknown) => ({
            single: () =>
              Promise.resolve({
                data: table === 'users' ? (opts.userRow ?? null) : null,
                error: null,
              }),
          }),
        }),
        insert: (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return {
            select: (_cols?: string) => ({
              single: () =>
                Promise.resolve({ data: { id: opts.insertedId ?? 'review-new-1' }, error: null }),
            }),
          };
        },
      };
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      return Promise.resolve({
        data: opts.consumeResult === undefined ? 1 : opts.consumeResult,
        error: null,
      });
    },
  } as unknown as SupabaseClient;
  return { client, inserts, rpcs };
}

function fakeAnthropic(critique: unknown = VALID_CRITIQUE) {
  const create = vi.fn().mockResolvedValue({
    content: [{ type: 'tool_use', id: 'toolu_test', name: 'emit_critique', input: critique }],
    stop_reason: 'tool_use',
    usage: { input_tokens: 120, output_tokens: 80 },
  });
  return { create, client: { messages: { create } } as unknown as Anthropic };
}

function imageResponse(): Response {
  return new Response(new Uint8Array(1024), {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  });
}

const PACK_USER = {
  review_credits: 2,
  review_addon: false,
  plan: null,
  plan_expires_at: null,
  subscription_status: null,
};

const ADDON_USER = {
  review_credits: 0,
  review_addon: true,
  plan: 'term',
  plan_expires_at: '2099-01-01T00:00:00.000Z',
  subscription_status: 'active',
};

const BROKE_USER = {
  review_credits: 0,
  review_addon: false,
  plan: null,
  plan_expires_at: null,
  subscription_status: null,
};

function buildApp(deps: {
  supabase: SupabaseClient;
  anthropic?: Anthropic;
  fetchFn: typeof fetch;
  weeklyLimiter?: RequestHandler;
}) {
  const app = express();
  app.use(express.json());
  app.use(
    createReviewRouter({
      getSupabaseAdmin: () => deps.supabase,
      getAnthropic: () => deps.anthropic ?? fakeAnthropic().client,
      fetchFn: deps.fetchFn,
      weeklyLimiter: deps.weeklyLimiter,
    }),
  );
  return app;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    sourceKind: 'pdf',
    pages: [{ pageNumber: 1, url: PAGE_URL, widthPx: 2048, heightPx: 1152 }],
    ...overrides,
  };
}

function post(app: ReturnType<typeof buildApp>, body: object) {
  return request(app)
    .post('/api/review/critique')
    .set('Authorization', 'Bearer test-token')
    .send(body);
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', SUPABASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/review/critique — auth and validation', () => {
  it('rejects a missing bearer token with 401', async () => {
    const { client } = fakeSupabase({ userRow: PACK_USER });
    const fetchFn = vi.fn();
    const app = buildApp({ supabase: client, fetchFn: fetchFn as unknown as typeof fetch });
    const res = await request(app).post('/api/review/critique').send(validBody());
    expect(res.status).toBe(401);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects a malformed body with 400 bad_request', async () => {
    const { client } = fakeSupabase({ userRow: PACK_USER });
    const fetchFn = vi.fn();
    const app = buildApp({ supabase: client, fetchFn: fetchFn as unknown as typeof fetch });
    const res = await post(app, { sourceKind: 'pdf', pages: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad_request');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects more than 24 pages with 400 too_many_pages before any work', async () => {
    const anthropic = fakeAnthropic();
    const { client, rpcs, inserts } = fakeSupabase({ userRow: PACK_USER });
    const fetchFn = vi.fn();
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const pages = Array.from({ length: 25 }, (_, i) => ({
      pageNumber: i + 1,
      url: PAGE_URL,
      widthPx: 2048,
      heightPx: 1152,
    }));
    const res = await post(app, validBody({ pages }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('too_many_pages');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(anthropic.create).not.toHaveBeenCalled();
    expect(rpcs).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it('rejects a page URL on a foreign host with 400 before any fetch', async () => {
    const anthropic = fakeAnthropic();
    const { client } = fakeSupabase({ userRow: PACK_USER });
    const fetchFn = vi.fn();
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = await post(
      app,
      validBody({
        pages: [{ pageNumber: 1, url: 'https://evil.example.com/x.png', widthPx: 100, heightPx: 100 }],
      }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('url_not_allowed');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(anthropic.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/review/critique — entitlement (D4)', () => {
  it('rejects with 402 no_credit before the model call when the user has neither add-on nor credits', async () => {
    const anthropic = fakeAnthropic();
    const { client, rpcs, inserts } = fakeSupabase({ userRow: BROKE_USER });
    const fetchFn = vi.fn();
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const res = await post(app, validBody());
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ error: 'review_payment_required', reason: 'no_credit' });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(anthropic.create).not.toHaveBeenCalled();
    expect(rpcs).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it('maps a weekly-window rejection to 402 weekly_quota_exceeded with retryAfterSec', async () => {
    const anthropic = fakeAnthropic();
    const { client } = fakeSupabase({ userRow: ADDON_USER });
    const fetchFn = vi.fn();
    // Mirrors createRateLimiter's own rejection wire shape; the router
    // invokes it with a capturing response, never the real one.
    const weeklyLimiter: RequestHandler = (_req, res, _next) => {
      res.setHeader('Retry-After', '3600');
      res.status(429).json({ error: 'rate_limited' });
    };
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
      weeklyLimiter,
    });
    const res = await post(app, validBody());
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({
      error: 'review_payment_required',
      reason: 'weekly_quota_exceeded',
      retryAfterSec: 3600,
    });
    expect(anthropic.create).not.toHaveBeenCalled();
  });

  it('ignores the add-on when the term is not active (D4 term-active rule)', async () => {
    const anthropic = fakeAnthropic();
    const { client } = fakeSupabase({
      userRow: { ...ADDON_USER, plan_expires_at: '2000-01-01T00:00:00.000Z' },
    });
    const fetchFn = vi.fn();
    let weeklyCalls = 0;
    const weeklyLimiter: RequestHandler = (_req, _res, next) => {
      weeklyCalls++;
      next();
    };
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
      weeklyLimiter,
    });
    const res = await post(app, validBody());
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ error: 'review_payment_required', reason: 'no_credit' });
    expect(weeklyCalls).toBe(0);
    expect(anthropic.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/review/critique — initial critique', () => {
  it('runs the pack path and consumes the credit AFTER success', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const anthropic = fakeAnthropic();
    const { client, rpcs, inserts } = fakeSupabase({ userRow: PACK_USER });
    const fetchFn = vi.fn().mockResolvedValue(imageResponse());
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await post(app, validBody({ filename: 'poster.pdf' }));

    expect(res.status).toBe(200);
    expect(res.body.reviewId).toBe('review-new-1');
    expect(res.body.stage).toBe('initial');
    expect(res.body.critique.findings).toHaveLength(1);

    expect(rpcs).toEqual([{ fn: 'consume_review_credit', args: { p_user_id: 'user-1' } }]);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.table).toBe('poster_reviews');
    expect(inserts[0]!.payload).toMatchObject({
      user_id: 'user-1',
      source_kind: 'pdf',
      status: 'complete',
      stage: 'initial',
      credit_source: 'pack',
    });
    expect(inserts[0]!.payload.source_meta).toMatchObject({
      pageCount: 1,
      rubric_version: CURRENT_RUBRIC_VERSION,
      model: REVIEW_MODEL,
      input_tokens: 120,
      output_tokens: 80,
      filename: 'poster.pdf',
    });
  });

  it('runs the add-on path through the weekly limiter and never touches credits', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const anthropic = fakeAnthropic();
    const { client, rpcs, inserts } = fakeSupabase({ userRow: ADDON_USER });
    const fetchFn = vi.fn().mockResolvedValue(imageResponse());
    let weeklyCalls = 0;
    const weeklyLimiter: RequestHandler = (_req, _res, next) => {
      weeklyCalls++;
      next();
    };
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
      weeklyLimiter,
    });

    const res = await post(app, validBody());

    expect(res.status).toBe(200);
    expect(weeklyCalls).toBe(1);
    expect(rpcs).toHaveLength(0);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.payload.credit_source).toBe('subscription_addon');
  });

  it('maps an invalid model payload to 502 bad_model_output and charges nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const anthropic = fakeAnthropic({ dimensionScores: { narrative: 3 }, findings: 'not-an-array' });
    const { client, rpcs, inserts } = fakeSupabase({ userRow: PACK_USER });
    const fetchFn = vi.fn().mockResolvedValue(imageResponse());
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await post(app, validBody());

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('bad_model_output');
    expect(rpcs).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/api -- reviewRouter`
Expected: FAIL — module `../review.js` does not exist.

- [ ] **Step 3: Implement the router (initial flow)**

`apps/api/src/review.ts`:

```ts
/**
 * Presentation Checker critique router (spec §4.5, §5.2, §5.3).
 *
 * POST /api/review/critique — INITIAL critique flow:
 *   body: { sourceKind, pages, posterDoc?, posterId?, filename? }
 *   out:  200 { reviewId, stage: 'initial', critique: CritiqueResult }
 *
 * Pipeline: zod validation → 24-page hard cap (§1: typed error, never
 * silent truncation) → server-side entitlement resolution (D4:
 * term-active add-on → weekly window → pack credits → 402) →
 * SSRF-guarded page fetch → two-stage rubric critique → deterministic
 * enforce → credit consume AFTER success (D6) → single poster_reviews
 * write (success-only, D16).
 *
 * The follow-up flow (body.reviewId set) lands in Task 16.
 *
 * Stack mirrors the import/narrative routers: requireAuth (anonymous
 * sessions accepted) → rate limit → zod → provider call → generic
 * client-facing errors. API keys never leave the server. All
 * poster_reviews writes use the service_role client — the table's RLS
 * is owner SELECT-only (D3).
 *
 * Cost instrumentation (§6.2.4): every completed critique logs its
 * token usage with the [review.critique] tag so the pack price and the
 * weekly quota are set from real numbers.
 */
import express, {
  type Request,
  type RequestHandler,
  type Response,
  type Router,
} from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { z } from 'zod';
import type { CritiqueResult } from '@postr/shared';
import { requireAuth, type AuthLocals } from './auth.js';
import { createRateLimiter } from './rateLimit.js';
import {
  REVIEW_ADDON_WEEKLY_QUOTA,
  REVIEW_IMAGE_MAX_BYTES,
  REVIEW_MAX_PAGES,
  REVIEW_MODEL,
} from './review/config.js';
import { CURRENT_RUBRIC_VERSION } from './review/rubric/index.js';
import { computeReviewSignals } from './review/signals.js';
import { buildInitialUserMessage, composeReviewSystemPrompt } from './review/prompt.js';
import { fetchReviewPages, PageFetchError, type FetchedPage } from './review/fetchPages.js';
import {
  callAnthropicCritique,
  CritiqueUpstreamError,
  type CritiqueCallResult,
} from './review/critique.js';
import { enforceFindings } from './review/enforce.js';

// ─────────────────────────────────────────────────────────────────────
// Request schema
// ─────────────────────────────────────────────────────────────────────

const PageRefInput = z.object({
  pageNumber: z.number().int().min(1),
  url: z.string().url(),
  widthPx: z.number().int().min(1),
  heightPx: z.number().int().min(1),
});

// Light envelope only — the client is first-party, so full PosterDoc
// validation is deferred. enforce.ts drops block anchors that don't
// resolve against these ids, so a malformed doc degrades to
// region/slide anchors, never to a crash.
const PosterDocEnvelope = z
  .object({
    version: z.literal(1),
    blocks: z.array(
      z
        .object({
          id: z.string(),
          type: z.string(),
          content: z.string().nullish(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const CritiqueRequest = z.object({
  sourceKind: z.enum(['postr', 'pdf', 'pptx', 'image']),
  // No .max() here — over the cap must be the typed `too_many_pages`
  // error (§1), not a generic bad_request.
  pages: z.array(PageRefInput).min(1),
  posterDoc: PosterDocEnvelope.optional(),
  posterId: z.string().uuid().optional(),
  reviewId: z.string().uuid().optional(),
  filename: z.string().max(255).optional(),
});

type CritiqueBody = z.infer<typeof CritiqueRequest>;

// ─────────────────────────────────────────────────────────────────────
// Router factory
// ─────────────────────────────────────────────────────────────────────

export interface ReviewRouterDeps {
  getSupabaseAdmin?: () => SupabaseClient | null;
  getAnthropic?: () => Anthropic | null;
  fetchFn?: typeof fetch;
  /** Add-on weekly window; default built per D5. */
  weeklyLimiter?: RequestHandler;
  now?: () => number;
}

export function createReviewRouter(deps: ReviewRouterDeps = {}): Router {
  const router = express.Router();
  const getSupabase = deps.getSupabaseAdmin ?? defaultGetSupabaseAdmin;
  const getAnthropic = deps.getAnthropic ?? defaultGetAnthropic;
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.now ?? Date.now;
  // D5: the add-on weekly quota is a plain createRateLimiter instance
  // (7-day window, daily layer inert), created ONCE here so its buckets
  // persist across requests. It is invoked manually inside the handler
  // (the import.ts:484 pattern) because a rejection must not consume a
  // slot and must surface as 402, not the limiter's own 429.
  const weeklyLimiter =
    deps.weeklyLimiter ??
    createRateLimiter({
      windowMs: 7 * 24 * 60 * 60 * 1000,
      maxPerWindow: REVIEW_ADDON_WEEKLY_QUOTA,
      dailyMs: Number.MAX_SAFE_INTEGER,
      maxPerDay: Number.MAX_SAFE_INTEGER,
    });

  router.post(
    '/api/review/critique',
    requireAuth(getSupabase),
    // 4/min absorbs an impatient retry; 20/day bounds the per-user LLM
    // bill on top of the credit checks below.
    createRateLimiter({ maxPerWindow: 4, maxPerDay: 20 }),
    async (req: Request, res: Response) => {
      const parsed = CritiqueRequest.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'bad_request', details: parsed.error.flatten() });
      }
      const body = parsed.data;
      // Hard page cap (§1): a typed error, never a silent truncation.
      if (body.pages.length > REVIEW_MAX_PAGES) {
        return res
          .status(400)
          .json({ error: 'too_many_pages', maxPages: REVIEW_MAX_PAGES });
      }

      const supabase = getSupabase();
      if (!supabase) {
        return res.status(500).json({
          error: 'supabase_not_configured',
          message: 'SUPABASE_URL and SUPABASE_SECRET_KEY must both be set for review.',
        });
      }
      const anthropic = getAnthropic();
      if (!anthropic) {
        return res.status(500).json({
          error: 'provider_not_configured',
          message: 'ANTHROPIC_API_KEY is missing on the server.',
        });
      }
      const user = (res.locals as AuthLocals).user;

      // The follow-up branch (Task 16) lives behind body.reviewId;
      // until it lands, a reviewId on this route is a client error.
      if (body.reviewId) {
        return res
          .status(400)
          .json({ error: 'bad_request', message: 'followup_not_implemented' });
      }
      return runInitial({ req, res, supabase, anthropic, fetchFn, now, weeklyLimiter, user, body });
    },
  );

  return router;
}

// ─────────────────────────────────────────────────────────────────────
// Initial critique
// ─────────────────────────────────────────────────────────────────────

interface InitialCtx {
  req: Request;
  res: Response;
  supabase: SupabaseClient;
  anthropic: Anthropic;
  fetchFn: typeof fetch;
  now: () => number;
  weeklyLimiter: RequestHandler;
  user: User;
  body: CritiqueBody;
}

async function runInitial(ctx: InitialCtx): Promise<Response> {
  const { req, res, supabase, anthropic, fetchFn, now, weeklyLimiter, user, body } = ctx;

  // ── Entitlement (D4): resolved server-side, never client-chosen.
  const entitlement = await resolveEntitlement(supabase, user.id);
  if (!entitlement.ok) {
    // eslint-disable-next-line no-console
    console.error('[review.critique] entitlement lookup failed', {
      userId: user.id,
      message: entitlement.message,
    });
    return res.status(500).json({ error: 'review_internal' });
  }
  const { row } = entitlement;

  let creditSource: 'pack' | 'subscription_addon';
  if (row.review_addon === true && isTermActive(row, now())) {
    // Add-on path: weekly window, invoked manually (D5). The limiter
    // records the slot at this pre-check, so a FAILED model call still
    // consumes the slot (D17 — accepted: slots are a soft cap).
    const slot = weeklySlotAllowed(weeklyLimiter, req, res);
    if (!slot.allowed) {
      return res.status(402).json({
        error: 'review_payment_required',
        reason: 'weekly_quota_exceeded',
        ...(slot.retryAfterSec !== undefined ? { retryAfterSec: slot.retryAfterSec } : {}),
      });
    }
    creditSource = 'subscription_addon';
  } else if ((row.review_credits ?? 0) > 0) {
    creditSource = 'pack';
  } else {
    return res.status(402).json({ error: 'review_payment_required', reason: 'no_credit' });
  }

  // ── Fetch the page bytes (SSRF-guarded inside fetchReviewPages).
  let fetched: FetchedPage[];
  try {
    fetched = await fetchReviewPages(body.pages, {
      supabaseUrl: process.env.SUPABASE_URL,
      fetchFn,
      maxBytes: REVIEW_IMAGE_MAX_BYTES,
    });
  } catch (err) {
    return replyPageFetchError(res, err);
  }

  const signals = body.posterDoc ? computeReviewSignals(body.posterDoc.blocks) : undefined;

  let callResult: CritiqueCallResult;
  try {
    callResult = await callAnthropicCritique(anthropic, {
      systemPrompt: composeReviewSystemPrompt(),
      userMessage: buildInitialUserMessage({
        pageCount: body.pages.length,
        sourceKind: body.sourceKind,
        signals,
        posterDocPresent: body.posterDoc !== undefined,
      }),
      pages: fetched,
    });
  } catch (err) {
    return replyCritiqueError(res, err, { userId: user.id, stage: 'initial' });
  }
  const { critique, usage } = callResult;

  // Deterministic grounding (§4.5): the prompt asks, this guarantees.
  const enforced: CritiqueResult = {
    ...critique,
    findings: enforceFindings(critique.findings, {
      blockIds: body.posterDoc ? new Set(body.posterDoc.blocks.map((b) => b.id)) : undefined,
      pageCount: body.pages.length,
    }),
  };

  // §6.2.4 cost instrumentation — real numbers set the pack price.
  // eslint-disable-next-line no-console
  console.log('[review.critique] critique done', {
    userId: user.id,
    stage: 'initial',
    creditSource,
    model: REVIEW_MODEL,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    findings: enforced.findings.length,
  });

  // Pack path: consume AFTER success (D6). The RPC is a single atomic
  // conditional UPDATE; a NULL return means a concurrent review won the
  // race for the last credit — the model call already happened, so log
  // loudly and refuse the row.
  if (creditSource === 'pack') {
    const { data: remaining, error: consumeErr } = await supabase.rpc(
      'consume_review_credit' as never,
      { p_user_id: user.id } as never,
    );
    if (consumeErr) {
      // eslint-disable-next-line no-console
      console.error('[review.critique] consume_review_credit rpc failed', {
        userId: user.id,
        message: consumeErr.message,
      });
      return res.status(500).json({ error: 'review_internal' });
    }
    if (remaining === null || remaining === undefined) {
      // eslint-disable-next-line no-console
      console.error('[review.critique] credit race lost after successful critique', {
        userId: user.id,
      });
      return res.status(402).json({ error: 'review_payment_required', reason: 'no_credit' });
    }
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('poster_reviews')
    .insert({
      user_id: user.id,
      poster_id: body.posterId ?? null,
      source_kind: body.sourceKind,
      source_meta: {
        pageCount: body.pages.length,
        rubric_version: CURRENT_RUBRIC_VERSION,
        model: REVIEW_MODEL,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        ...(body.filename ? { filename: body.filename } : {}),
      },
      status: 'complete',
      stage: 'initial',
      initial_findings: enforced,
      credit_source: creditSource,
    })
    .select('id')
    .single();
  if (insertErr || !inserted) {
    // eslint-disable-next-line no-console
    console.error('[review.critique] poster_reviews insert failed', {
      userId: user.id,
      message: insertErr?.message ?? 'no row returned',
    });
    return res.status(500).json({ error: 'review_internal' });
  }

  return res.status(200).json({
    reviewId: inserted.id as string,
    stage: 'initial',
    critique: enforced,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Entitlement helpers (D4)
// ─────────────────────────────────────────────────────────────────────

interface EntitlementRow {
  review_credits: number | null;
  review_addon: boolean | null;
  plan: string | null;
  plan_expires_at: string | null;
  subscription_status: string | null;
}

async function resolveEntitlement(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: true; row: EntitlementRow } | { ok: false; message: string }> {
  const { data, error } = await supabase
    .from('users')
    .select('review_credits, review_addon, plan, plan_expires_at, subscription_status')
    .eq('id', userId)
    .single();
  if (error || !data) return { ok: false, message: error?.message ?? 'users row missing' };
  return { ok: true, row: data as unknown as EntitlementRow };
}

/** D4: term-active = plan 'term' + expiry in the future + status non-terminal. */
function isTermActive(row: EntitlementRow, nowMs: number): boolean {
  if (row.plan !== 'term') return false;
  if (!row.plan_expires_at) return false;
  const expiresMs = new Date(row.plan_expires_at).getTime();
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) return false;
  return !['canceled', 'unpaid', 'incomplete_expired'].includes(row.subscription_status ?? '');
}

/**
 * Invoke the weekly add-on limiter manually (the import.ts:484
 * pattern), but capture its 429 instead of letting it own the response:
 * a quota rejection here is a BILLING state, so the client sees 402
 * review_payment_required with the limiter's Retry-After surfaced as
 * retryAfterSec — not a generic 429. The capture object must carry
 * `locals` because createRateLimiter reads res.locals.user.
 */
function weeklySlotAllowed(
  limiter: RequestHandler,
  req: Request,
  res: Response,
): { allowed: true } | { allowed: false; retryAfterSec?: number } {
  let allowed = false;
  let retryAfterSec: number | undefined;
  const capture = {
    locals: res.locals,
    setHeader(name: string, value: string) {
      if (name.toLowerCase() === 'retry-after') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) retryAfterSec = parsed;
      }
    },
    status(_code: number) {
      return { json: (_body: unknown) => undefined };
    },
  } as unknown as Response;
  limiter(req, capture, () => {
    allowed = true;
  });
  return allowed ? { allowed: true } : { allowed: false, retryAfterSec };
}

// ─────────────────────────────────────────────────────────────────────
// Error mapping
// ─────────────────────────────────────────────────────────────────────

function replyPageFetchError(res: Response, err: unknown): Response {
  if (err instanceof PageFetchError) {
    if (err.code === 'too_large') {
      return res.status(413).json({ error: 'image_too_large' });
    }
    // url_not_allowed | fetch_failed | unsupported_media — the typed
    // code IS the client-facing error string.
    return res.status(400).json({ error: err.code });
  }
  // eslint-disable-next-line no-console
  console.error('[review.critique] page fetch crashed', {
    message: err instanceof Error ? err.message : 'unknown',
  });
  return res.status(500).json({ error: 'review_internal' });
}

function replyCritiqueError(
  res: Response,
  err: unknown,
  logCtx: Record<string, unknown>,
): Response {
  const upstream = err instanceof CritiqueUpstreamError ? err : null;
  // eslint-disable-next-line no-console
  console.error('[review.critique] critique failed', {
    ...logCtx,
    code: upstream?.code,
    status: upstream?.status,
    message: err instanceof Error ? err.message : 'unknown',
  });
  // No/invalid structured output is distinct from a transport failure
  // so the client can message it honestly.
  if (upstream && (upstream.code === 'no_tool_call' || upstream.code === 'bad_tool_json')) {
    return res.status(502).json({ error: 'bad_model_output', message: upstream.code });
  }
  // 401/429/529 pass through so the client can react (back off on
  // 429); everything else is a generic 502. Raw upstream text stays in
  // the server log.
  const status = upstream?.code === 'http_error' ? upstream.status : undefined;
  const passthrough = status === 401 || status === 429 || status === 529 ? status : 502;
  return res.status(passthrough).json({ error: 'review_upstream' });
}

// ─────────────────────────────────────────────────────────────────────
// Default factories
// ─────────────────────────────────────────────────────────────────────

function defaultGetSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function defaultGetAnthropic(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/api -- reviewRouter`
Expected: PASS (10 tests).

- [ ] **Step 5: Mount the router in `app.ts`**

In `apps/api/src/app.ts`, add the import beside the other router imports:

```ts
import express, { type Express } from 'express';
import cors from 'cors';
import { createCronRouter } from './cron.js';
import { createImportRouter } from './import.js';
import { createNarrativeRouter } from './narrative.js';
import { createReviewRouter } from './review.js';
import { createBillingRouter, createBillingWebhookRouter } from './billing.js';
```

and mount AFTER `createNarrativeRouter()`:

```ts
  // Manuscript narrative condenser — the one LLM step in the
  // manuscript→poster pipeline. OPENAI_API_KEY required at request
  // time; missing key returns 500 only when the route fires.
  app.use(createNarrativeRouter());

  // Presentation Checker — poster/talk critique. ANTHROPIC_API_KEY +
  // Supabase service key required at request time; missing config
  // returns 500 only when the route fires.
  app.use(createReviewRouter());

  return app;
}
```

- [ ] **Step 6: Run the full API suite + typecheck**

```bash
npm test --workspace=apps/api
npm run build
```

Expected: all tests pass (existing suites + the new review tests); build clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/review.ts apps/api/src/__tests__/reviewRouter.test.ts apps/api/src/app.ts
git commit -m "feat(review): critique router — initial critique, D4 entitlement, spend-after-success credit consume"
```

### Task 16: Follow-up state machine (same file)

**Files:**
- Modify: `apps/api/src/review.ts`
- Test: `apps/api/src/__tests__/reviewFollowup.test.ts`

**Interfaces:**
- Consumes: everything Task 15 wired, plus `buildFollowupUserMessage` (`review/prompt.ts`, Task 11). No new config, no new credit path — the follow-up is included in the initial credit (§5.3, D6).
- Produces: the follow-up branch of `POST /api/review/critique`: `body.reviewId` set → load review → 404 `review_not_found` / 403 `not_review_owner` / 409 `review_closed` / 409 `review_not_complete` → diff critique against `initial_findings` → single UPDATE (`followup_findings`, `stage: 'closed'`, `updated_at`) → 200 `{ reviewId, stage: 'closed', critique }`. `closed` is terminal, enforced server-side (§5.2).

- [ ] **Step 1: Write the failing test**

`apps/api/src/__tests__/reviewFollowup.test.ts` (self-contained: helpers duplicated from reviewRouter.test.ts so this file reads standalone):

```ts
/**
 * POST /api/review/critique — FOLLOW-UP flow (spec §5.2): one follow-up
 * per review, a DIFF against the stored initial findings, then the
 * review closes for good. Included in the initial credit — no second
 * entitlement check, no second consume, no second weekly slot (D6).
 * `closed` is terminal and enforced by the route, not hidden in UI.
 *
 * Ownership is checked manually in the route because the service_role
 * client bypasses the table's owner-SELECT RLS (D3) — the
 * not_review_owner test is what keeps another user's review safe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createReviewRouter } from '../review.js';

const SUPABASE_URL = 'https://testref.supabase.co';
const PAGE_URL = `${SUPABASE_URL}/storage/v1/object/sign/poster-assets/u/p/review-capture.jpg?token=abc`;

const VALID_CRITIQUE = {
  dimensionScores: { narrative: 4, design: 3, content: 4 },
  attentionSummary: 'The key-result figure now earns the first fixation.',
  findings: [
    {
      dimension: 'design',
      severity: 'medium',
      category: 'over-emphasis',
      anchor: { kind: 'region', page: 1, bbox: [0.05, 0.3, 0.25, 0.4] },
      action: 'condense',
      problem: 'Six bolded phrases still compete in the methods column.',
      fix: 'Keep bold only on the sampling-rate number.',
      example: 'Unbold "novel", "first", and "significantly" in the second paragraph.',
    },
  ],
};

/** The stored review the follow-up runs against (stage 'initial'). */
const REVIEW_ROW = {
  id: 'review-1',
  user_id: 'user-1',
  status: 'complete',
  stage: 'initial',
  initial_findings: {
    dimensionScores: { narrative: 2, design: 2, content: 3 },
    attentionSummary: 'First pass: the key result is hard to find.',
    findings: [
      {
        dimension: 'narrative',
        severity: 'high',
        category: 'buried-key-result',
        anchor: { kind: 'region', page: 1, bbox: [0.55, 0.7, 0.4, 0.25] },
        action: 'keep-as-primary',
        problem: 'The key result is buried in the bottom-right corner.',
        fix: 'Make the key-result figure the entry point of the poster.',
        example: 'Move Figure 3 ("72% reduction in error") to the top-left column.',
      },
    ],
  },
};

interface FakeSupabaseOpts {
  reviewRow?: Record<string, unknown> | null;
}

function fakeSupabase(opts: FakeSupabaseOpts = {}) {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; payload: Record<string, unknown>; eqVal: unknown }> = [];
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: 'user-1', is_anonymous: false } },
        error: null,
      }),
    },
    from(table: string) {
      return {
        select: (_cols?: string) => ({
          eq: (_col: string, _val: unknown) => ({
            maybeSingle: () =>
              Promise.resolve({
                data: table === 'poster_reviews' ? (opts.reviewRow ?? null) : null,
                error: null,
              }),
          }),
        }),
        insert: (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return {
            select: (_cols?: string) => ({
              single: () => Promise.resolve({ data: { id: 'review-new-1' }, error: null }),
            }),
          };
        },
        update: (payload: Record<string, unknown>) => ({
          eq: (_col: string, val: unknown) => {
            updates.push({ table, payload, eqVal: val });
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      return Promise.resolve({ data: 1, error: null });
    },
  } as unknown as SupabaseClient;
  return { client, inserts, updates, rpcs };
}

function fakeAnthropic(critique: unknown = VALID_CRITIQUE) {
  const create = vi.fn().mockResolvedValue({
    content: [{ type: 'tool_use', id: 'toolu_test', name: 'emit_critique', input: critique }],
    stop_reason: 'tool_use',
    usage: { input_tokens: 140, output_tokens: 90 },
  });
  return { create, client: { messages: { create } } as unknown as Anthropic };
}

function imageResponse(): Response {
  return new Response(new Uint8Array(1024), {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  });
}

function buildApp(deps: { supabase: SupabaseClient; anthropic?: Anthropic; fetchFn: typeof fetch }) {
  const app = express();
  app.use(express.json());
  app.use(
    createReviewRouter({
      getSupabaseAdmin: () => deps.supabase,
      getAnthropic: () => deps.anthropic ?? fakeAnthropic().client,
      fetchFn: deps.fetchFn,
    }),
  );
  return app;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    sourceKind: 'pdf',
    pages: [{ pageNumber: 1, url: PAGE_URL, widthPx: 2048, heightPx: 1152 }],
    reviewId: 'review-1',
    ...overrides,
  };
}

function post(app: ReturnType<typeof buildApp>, body: object) {
  return request(app)
    .post('/api/review/critique')
    .set('Authorization', 'Bearer test-token')
    .send(body);
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', SUPABASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/review/critique — follow-up (§5.2)', () => {
  it('runs the follow-up against the initial findings and closes the review without charging', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const anthropic = fakeAnthropic();
    const { client, inserts, updates, rpcs } = fakeSupabase({ reviewRow: REVIEW_ROW });
    const fetchFn = vi.fn().mockResolvedValue(imageResponse());
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await post(app, validBody());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reviewId: 'review-1', stage: 'closed' });
    expect(res.body.critique.findings).toHaveLength(1);

    // The follow-up is a diff, not a fresh review: the model received
    // the initial findings' problem text in its user message.
    const createArg = anthropic.create.mock.calls[0]![0];
    expect(JSON.stringify(createArg)).toContain('buried in the bottom-right corner');

    // One write: follow-up findings + terminal close.
    expect(updates).toHaveLength(1);
    expect(updates[0]!.table).toBe('poster_reviews');
    expect(updates[0]!.eqVal).toBe('review-1');
    expect(updates[0]!.payload.stage).toBe('closed');
    expect(updates[0]!.payload.followup_findings).toBeDefined();
    expect(typeof updates[0]!.payload.updated_at).toBe('string');

    // No new review row, and NO credit consume — the follow-up is
    // included in the initial credit (D6).
    expect(inserts).toHaveLength(0);
    expect(rpcs).toHaveLength(0);
  });

  it('rejects a third critique on a closed review with 409 review_closed', async () => {
    const anthropic = fakeAnthropic();
    const { client, updates } = fakeSupabase({
      reviewRow: { ...REVIEW_ROW, stage: 'closed' },
    });
    const fetchFn = vi.fn();
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await post(app, validBody());

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('review_closed');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(anthropic.create).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("rejects a follow-up on another user's review with 403 not_review_owner", async () => {
    const anthropic = fakeAnthropic();
    const { client } = fakeSupabase({ reviewRow: { ...REVIEW_ROW, user_id: 'user-2' } });
    const fetchFn = vi.fn();
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await post(app, validBody());

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('not_review_owner');
    expect(anthropic.create).not.toHaveBeenCalled();
  });

  it('rejects a missing review with 404 review_not_found', async () => {
    const anthropic = fakeAnthropic();
    const { client } = fakeSupabase({ reviewRow: null });
    const fetchFn = vi.fn();
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await post(app, validBody());

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('review_not_found');
    expect(anthropic.create).not.toHaveBeenCalled();
  });

  it('rejects a review whose initial critique never completed with 409 review_not_complete', async () => {
    const anthropic = fakeAnthropic();
    const { client } = fakeSupabase({
      reviewRow: { ...REVIEW_ROW, status: 'pending', initial_findings: null },
    });
    const fetchFn = vi.fn();
    const app = buildApp({
      supabase: client,
      anthropic: anthropic.client,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await post(app, validBody());

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('review_not_complete');
    expect(anthropic.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/api -- reviewFollowup`
Expected: FAIL — all 5 tests fail: the route currently rejects any body carrying `reviewId` with 400 `followup_not_implemented` (Task 15's interim stub).

- [ ] **Step 3: Add the follow-up branch to `review.ts`**

Four edits to `apps/api/src/review.ts`.

(a) Extend the header comment — replace:

```ts
 * The follow-up flow (body.reviewId set) lands in Task 16.
```

with:

```ts
 * POST /api/review/critique — FOLLOW-UP flow (body.reviewId set):
 * a diff critique against the stored initial findings, then the review
 * closes (stage 'closed' is terminal, enforced HERE, not just hidden
 * in UI). Included in the initial credit: no entitlement check, no
 * second consume, no second weekly slot (§5.2/§5.3, D6). Ownership is
 * checked MANUALLY — the service_role client bypasses the table's
 * owner-SELECT RLS (D3).
```

(b) Extend the prompt import — replace:

```ts
import { buildInitialUserMessage, composeReviewSystemPrompt } from './review/prompt.js';
```

with:

```ts
import {
  buildFollowupUserMessage,
  buildInitialUserMessage,
  composeReviewSystemPrompt,
} from './review/prompt.js';
```

(c) Replace the interim stub inside the route handler:

```ts
      const user = (res.locals as AuthLocals).user;

      // The follow-up branch (Task 16) lives behind body.reviewId;
      // until it lands, a reviewId on this route is a client error.
      if (body.reviewId) {
        return res
          .status(400)
          .json({ error: 'bad_request', message: 'followup_not_implemented' });
      }
      return runInitial({ req, res, supabase, anthropic, fetchFn, now, weeklyLimiter, user, body });
```

with:

```ts
      const user = (res.locals as AuthLocals).user;

      return body.reviewId
        ? runFollowup({ res, supabase, anthropic, fetchFn, now, user, body })
        : runInitial({ req, res, supabase, anthropic, fetchFn, now, weeklyLimiter, user, body });
```

(d) Append the follow-up implementation after `runInitial` (before the entitlement helpers section):

```ts
// ─────────────────────────────────────────────────────────────────────
// Follow-up critique (§5.2)
// ─────────────────────────────────────────────────────────────────────

interface ReviewRow {
  id: string;
  user_id: string;
  status: 'pending' | 'complete' | 'failed';
  stage: 'initial' | 'followup' | 'closed';
  initial_findings: CritiqueResult | null;
}

interface FollowupCtx {
  res: Response;
  supabase: SupabaseClient;
  anthropic: Anthropic;
  fetchFn: typeof fetch;
  now: () => number;
  user: User;
  body: CritiqueBody;
}

/**
 * One follow-up per review: judge the revised artifact AGAINST the
 * stored initial findings ("did they address these? what's still
 * open?"), then close the review. Included in the initial credit —
 * no entitlement check, no consume, no weekly slot (D6).
 */
async function runFollowup(ctx: FollowupCtx): Promise<Response> {
  const { res, supabase, anthropic, fetchFn, now, user, body } = ctx;
  const reviewId = body.reviewId!;

  // The API reads/writes poster_reviews through the service_role
  // client, which BYPASSES the table's owner-SELECT RLS (D3).
  // Ownership is therefore enforced HERE, manually — without this
  // check any authenticated user could drive another user's review
  // by id.
  const { data: reviewRaw, error: loadErr } = await supabase
    .from('poster_reviews')
    .select('id, user_id, status, stage, initial_findings')
    .eq('id', reviewId)
    .maybeSingle();
  if (loadErr) {
    // eslint-disable-next-line no-console
    console.error('[review.critique] review load failed', {
      reviewId,
      message: loadErr.message,
    });
    return res.status(500).json({ error: 'review_internal' });
  }
  const review = reviewRaw as unknown as ReviewRow | null;
  if (!review) {
    return res.status(404).json({ error: 'review_not_found' });
  }
  if (review.user_id !== user.id) {
    return res.status(403).json({ error: 'not_review_owner' });
  }
  // `closed` is terminal (§5.2): a further critique needs a new credit.
  if (review.stage !== 'initial') {
    return res.status(409).json({ error: 'review_closed' });
  }
  if (review.status !== 'complete' || !review.initial_findings) {
    return res.status(409).json({ error: 'review_not_complete' });
  }

  // Fetch the REVISED pages (SSRF-guarded inside fetchReviewPages).
  let fetched: FetchedPage[];
  try {
    fetched = await fetchReviewPages(body.pages, {
      supabaseUrl: process.env.SUPABASE_URL,
      fetchFn,
      maxBytes: REVIEW_IMAGE_MAX_BYTES,
    });
  } catch (err) {
    return replyPageFetchError(res, err);
  }

  const signals = body.posterDoc ? computeReviewSignals(body.posterDoc.blocks) : undefined;

  let callResult: CritiqueCallResult;
  try {
    callResult = await callAnthropicCritique(anthropic, {
      systemPrompt: composeReviewSystemPrompt(),
      userMessage: buildFollowupUserMessage({
        initialFindings: review.initial_findings,
        pageCount: body.pages.length,
        sourceKind: body.sourceKind,
        signals,
      }),
      pages: fetched,
    });
  } catch (err) {
    return replyCritiqueError(res, err, { userId: user.id, reviewId, stage: 'followup' });
  }
  const { critique, usage } = callResult;

  const enforced: CritiqueResult = {
    ...critique,
    findings: enforceFindings(critique.findings, {
      blockIds: body.posterDoc ? new Set(body.posterDoc.blocks.map((b) => b.id)) : undefined,
      pageCount: body.pages.length,
    }),
  };

  // §6.2.4 cost instrumentation — follow-ups are part of the true
  // cost per review credit.
  // eslint-disable-next-line no-console
  console.log('[review.critique] critique done', {
    userId: user.id,
    reviewId,
    stage: 'followup',
    model: REVIEW_MODEL,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    findings: enforced.findings.length,
  });

  // One write: follow-up findings + terminal close, a single UPDATE.
  const { error: updateErr } = await supabase
    .from('poster_reviews')
    .update({
      followup_findings: enforced,
      stage: 'closed',
      updated_at: new Date(now()).toISOString(),
    })
    .eq('id', reviewId);
  if (updateErr) {
    // eslint-disable-next-line no-console
    console.error('[review.critique] follow-up update failed', {
      reviewId,
      message: updateErr.message,
    });
    return res.status(500).json({ error: 'review_internal' });
  }

  return res.status(200).json({ reviewId, stage: 'closed', critique: enforced });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/api -- reviewFollowup reviewRouter`
Expected: PASS (5 follow-up tests + the 10 Task-15 router tests still green).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/review.ts apps/api/src/__tests__/reviewFollowup.test.ts
git commit -m "feat(review): follow-up state machine — diff critique against initial findings, terminal close, no second charge"
```

### Task 17: Billing wiring — review pack SKU + weekly add-on (`apps/api/src/billing.ts`)

**Files:**
- Modify: `apps/api/src/billing.ts`
- Test: `apps/api/src/__tests__/billing.test.ts`

**Interfaces:**
- Consumes: Task 8's `grant_review_credits(uuid, integer)` RPC and the `users.review_credits` / `users.review_addon` / `users.review_addon_subscription_id` columns (server-owned, guard-covered); the existing private seams `sessionAlreadyFulfilled`, `markSessionFulfilled`, `findUserIdForSubscriptionEvent`, `TERM_ACTIVE_STATUSES`, `advanceTermAccess`, `subscriptionPeriodEnd` (all in `billing.ts`); Stripe env vars `STRIPE_PRICE_REVIEW_PACK` / `STRIPE_PRICE_REVIEW_ADDON`.
- Produces: `BillingSku` widened with `'review_pack' | 'review_addon'` (the web billing client mirrors the union in Task 23); fulfilled review entitlements the critique route resolves per D4 (Task 16); the `review_addon` flag maintained across subscription lifecycle events.

Wires the two review SKUs (spec §5.3, D8) into the existing Stripe router + webhook: `review_pack` (one-time payment, grants review credits via the `grant_review_credits` RPC — mirrors the export pack exactly) and `review_addon` (a recurring add-on subscription granting the weekly review quota — its flag lives in the NEW columns and never touches the term's `plan` / `plan_expires_at` / `subscription_status`). Ops: create the two Stripe prices and set `STRIPE_PRICE_REVIEW_PACK` / `STRIPE_PRICE_REVIEW_ADDON` (sandbox and prod), same as the existing `STRIPE_PRICE_TERM` / `STRIPE_PRICE_PACK` env vars.

**Refunds (D8):** review-SKU refunds are DEFERRED to manual handling in the Stripe dashboard — no self-serve route and no refund automation are built. Operator caveat: a dashboard refund still fires `charge.refunded`, which `handleChargeRefunded` reconciles with its term/pack heuristics (a subscription charge → revokes the term; a one-time charge → revokes export credits at the pack per-credit rate). Until refund automation exists, every manual review-SKU refund must be followed by manually correcting the user's entitlement columns (check `plan`, `plan_expires_at`, `export_credits`, `review_credits`, `review_addon`).

**Add-on without a term (deliberate):** the checkout route does NOT hard-block a `review_addon` purchase by a non-term user in v1 — the client gates that path (Task 24 points non-term users at `/pricing` first), and a direct-API purchase simply stays inert: the D4 entitlement rule requires `review_addon` AND term-active, so the flag does nothing until the account has an active term (and activates when it does). If that ever feels too sharp for a real user, support refunds manually per the D8 note above.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/__tests__/billing.test.ts` (the file's existing imports — `fulfillCheckout`, `handleInvoicePaid`, `handleSubscriptionChange`, `fakeSupabase`, `fakeStripe`, `fakeSub`, `session` — already cover everything below; no import changes):

```ts
describe('fulfillCheckout — review_pack (one-time)', () => {
  it('grants 3 review credits atomically via the grant_review_credits RPC', async () => {
    const fake = fakeSupabase();
    await fulfillCheckout(
      fake.client,
      fakeStripe({}),
      session({ mode: 'payment', subscription: undefined, metadata: { user_id: 'user-1', sku: 'review_pack' } }),
    );
    const grant = fake.rpcs.find((r) => r.fn === 'grant_review_credits');
    expect(grant).toBeTruthy();
    expect(grant?.args).toEqual({ p_user_id: 'user-1', p_amount: 3 });
    // never touches the export-credit pool
    expect(fake.rpcs.some((r) => r.fn === 'grant_export_credits')).toBe(false);
    const marker = fake.inserts.find((i) => i.table === 'billing_fulfilled_sessions');
    expect(marker?.payload.credits_granted).toBe(3);
  });

  it('is idempotent — an already-fulfilled session grants nothing', async () => {
    const fake = fakeSupabase({ alreadyFulfilled: true });
    await fulfillCheckout(
      fake.client,
      fakeStripe({}),
      session({ mode: 'payment', subscription: undefined, metadata: { user_id: 'user-1', sku: 'review_pack' } }),
    );
    expect(fake.rpcs).toHaveLength(0);
    expect(fake.inserts).toHaveLength(0);
  });

  it('does nothing for an unpaid review_pack session', async () => {
    const fake = fakeSupabase();
    await fulfillCheckout(
      fake.client,
      fakeStripe({}),
      session({ mode: 'payment', subscription: undefined, payment_status: 'unpaid', metadata: { user_id: 'user-1', sku: 'review_pack' } }),
    );
    expect(fake.updates).toHaveLength(0);
    expect(fake.rpcs).toHaveLength(0);
  });
});

describe('fulfillCheckout — review_addon (subscription)', () => {
  it('sets review_addon + review_addon_subscription_id — never the plan columns', async () => {
    const fake = fakeSupabase();
    await fulfillCheckout(
      fake.client,
      fakeStripe({ id: 'sub_addon_1', status: 'active', metadata: { user_id: 'user-1', sku: 'review_addon' } }),
      session({ metadata: { user_id: 'user-1', sku: 'review_addon' }, subscription: 'sub_addon_1' }),
    );
    expect(fake.updates).toHaveLength(1);
    const { table, payload } = fake.updates[0]!;
    expect(table).toBe('users');
    expect(payload.review_addon).toBe(true);
    expect(payload.review_addon_subscription_id).toBe('sub_addon_1');
    expect(payload.stripe_customer_id).toBe('cus_1');
    // the term's columns are the term's — an add-on never writes them
    expect(payload).not.toHaveProperty('plan');
    expect(payload).not.toHaveProperty('plan_expires_at');
    expect(payload).not.toHaveProperty('subscription_status');
    expect(payload).not.toHaveProperty('stripe_subscription_id');
    // absolute-value write, naturally idempotent: no credit RPC, no ledger row
    expect(fake.rpcs).toHaveLength(0);
    expect(fake.inserts).toHaveLength(0);
  });

  it('does nothing for an incomplete review_addon session', async () => {
    const fake = fakeSupabase();
    await fulfillCheckout(
      fake.client,
      fakeStripe({}),
      session({ status: 'open', payment_status: 'unpaid', metadata: { user_id: 'user-1', sku: 'review_addon' } }),
    );
    expect(fake.updates).toHaveLength(0);
    expect(fake.rpcs).toHaveLength(0);
  });
});

describe('handleSubscriptionChange — review_addon', () => {
  it('a live add-on status sets the flag + subscription id (no plan columns)', async () => {
    const fake = fakeSupabase({ lookupUserId: 'user-1' });
    await handleSubscriptionChange(
      fake.client,
      fakeSub({ id: 'sub_addon_1', status: 'active', metadata: { user_id: 'user-1', sku: 'review_addon' } }),
    );
    expect(fake.updates).toHaveLength(1);
    const { payload } = fake.updates[0]!;
    expect(payload.review_addon).toBe(true);
    expect(payload.review_addon_subscription_id).toBe('sub_addon_1');
    expect(payload).not.toHaveProperty('plan');
    expect(payload).not.toHaveProperty('plan_expires_at');
    expect(payload).not.toHaveProperty('subscription_status');
  });

  it('a deleted (canceled) add-on clears the flag but KEEPS the subscription id for reconciliation', async () => {
    const fake = fakeSupabase({ lookupUserId: 'user-1' });
    await handleSubscriptionChange(
      fake.client,
      fakeSub({ id: 'sub_addon_1', status: 'canceled', metadata: { user_id: 'user-1', sku: 'review_addon' } }),
    );
    expect(fake.updates).toHaveLength(1);
    // exactly { review_addon: false } — sub id kept, plan columns untouched
    expect(fake.updates[0]!.payload).toEqual({ review_addon: false });
  });
});

describe('handleInvoicePaid — review_addon invoice', () => {
  it('is NOT treated as a term renewal — no writes at all', async () => {
    const fake = fakeSupabase({ lookupUserId: 'user-1' });
    const stripe = {
      subscriptions: {
        retrieve: () =>
          Promise.resolve(
            fakeSub({ id: 'sub_addon_1', status: 'active', metadata: { user_id: 'user-1', sku: 'review_addon' } }),
          ),
      },
    } as unknown as Stripe;
    const invoice = { subscription: 'sub_addon_1', customer: 'cus_1' } as unknown as Stripe.Invoice;
    await handleInvoicePaid(fake.client, stripe, invoice);
    expect(fake.updates).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/api -- billing`
Expected: FAIL — 5 of the 8 new tests fail: `grant_review_credits` is never called (a review_pack session falls through to the export-pack branch), the review_addon checkout grants export credits instead of setting the review columns, add-on subscription events rewrite the plan columns, and an add-on invoice advances the term. The 3 no-op guard tests (unpaid / already-fulfilled / incomplete session) and all 28 existing tests pass.

- [ ] **Step 3: Extend the SKU + price plumbing in `billing.ts`**

Four edits.

Edit 1 — replace the file header comment (the `Billing — Stripe Managed Payments …` block) so the product list is accurate:

```ts
/**
 * Billing — Stripe Managed Payments (a Merchant of Record).
 *
 * Four paid products:
 *   - Term:  $18.99, a recurring subscription (4-month cadence), unlocks
 *     unlimited editable exports.
 *   - Pack:  $9.99 one-time, grants 3 export credits (consumable).
 *   - Review pack:  one-time, grants REVIEW_PACK_CREDITS presentation-
 *     review credits (consumable, never expire).
 *   - Review add-on:  a recurring add-on subscription granting a weekly
 *     presentation-review quota (the 7-day window is enforced in
 *     review.ts, not here).
 * Review-SKU refunds are handled MANUALLY via the Stripe dashboard
 * (deferred — Presentation Checker plan D8); the self-serve
 * /billing/refund route covers term and export pack only.
 *
 * Managed Payments makes Stripe the merchant of record, so Stripe files
 * and remits tax worldwide. That requires:
 *   - an eligible product tax_code on each product,
 *   - `managed_payments[enabled] = true` on the Checkout Session,
 *   - the `2026-02-25.preview` (or later) Stripe API version header.
 *
 * The plan/credits columns on public.users are SERVER-OWNED (a DB
 * trigger rejects any non-service_role write — see
 * 20260728120000_billing_plan.sql and the review-column migration). This
 * webhook, running with the service_role key, is the ONLY writer. A
 * client can start a checkout but can never grant itself a plan.
 *
 * Provider swap note: this is wired for the Stripe SANDBOX for testing;
 * flipping to production is only an env-var change (STRIPE_SECRET_KEY,
 * STRIPE_WEBHOOK_SECRET, the price ids) — no code change.
 */
```

Edit 2 — replace the `BillingSku` declaration and the const block beside it:

```ts
/** The SKUs the client can ask to buy. */
export type BillingSku = 'term' | 'pack' | 'review_pack' | 'review_addon';

/** How many export credits a pack purchase grants. */
const PACK_EXPORT_CREDITS = 3;
/** How many review credits a review-pack purchase grants. Placeholder —
 * repriced from Phase-0 token-cost numbers in Task 28. */
const REVIEW_PACK_CREDITS = 3;
/** The pack price in cents (CA$9.99) — the basis for the per-credit refund. */
const PACK_PRICE_CENTS = 999;
```

Edit 3 — in the `/billing/create-checkout` route, replace the SKU validation + session-params block (from `const sku = req.body?.sku …` through the `if (sku === 'term') { … }` statement) with:

```ts
      const sku = req.body?.sku as BillingSku | undefined;
      const priceId = priceIdForSku(sku);
      if (!sku || !priceId) {
        return res.status(400).json({
          error: 'invalid_sku',
          message:
            'sku must be "term", "pack", "review_pack" or "review_addon", and its price id env var must be set.',
        });
      }

      const user = (res.locals as AuthLocals).user;
      const successUrl = billingUrl('success');
      const cancelUrl = billingUrl('cancel');

      try {
        // Shared params. The SKUs differ ONLY in mode:
        //   - term / review_addon = recurring subscriptions → mode
        //     'subscription'.
        //   - pack / review_pack = one-time purchases → mode 'payment'.
        // A single mode is wrong: mode 'payment' with a recurring price is
        // rejected by Stripe ("passed a recurring price").
        const params: Stripe.Checkout.SessionCreateParams = {
          mode: sku === 'term' || sku === 'review_addon' ? 'subscription' : 'payment',
          line_items: [{ price: priceId, quantity: 1 }],
          // Managed Payments — Stripe becomes the merchant of record and
          // handles tax filing/remittance worldwide. Composes with both
          // payment and subscription mode.
          managed_payments: { enabled: true },
          // Bind the session to our user so the webhook can reconcile it
          // even before a Stripe customer exists. NOTE: client_reference_id
          // exists ONLY on the checkout.session — later subscription
          // lifecycle events (invoice.paid, customer.subscription.*) do not
          // carry it, which is why the subscription SKUs also stamp the
          // user id into subscription_data.metadata below.
          client_reference_id: user.id,
          customer_email: user.email ?? undefined,
          // Carried onto the completed event so the webhook knows the SKU.
          metadata: { user_id: user.id, sku },
          success_url: successUrl,
          cancel_url: cancelUrl,
        };

        if (sku === 'term' || sku === 'review_addon') {
          // Copy the user id AND the sku onto the Subscription object so
          // later lifecycle events (which lack client_reference_id) can
          // still be reconciled to this user — and so
          // handleSubscriptionChange / handleInvoicePaid can tell a review
          // add-on (weekly-quota flag only) apart from the term (plan
          // columns). No client-side expiry — Stripe drives the billing
          // period from the recurring price.
          params.subscription_data = {
            metadata: { user_id: user.id, sku },
          };
        }
```

Edit 4 — replace `priceIdForSku`:

```ts
/** Map a SKU to its configured Stripe price id (env-driven). */
function priceIdForSku(sku: BillingSku | undefined): string | null {
  if (sku === 'term') return process.env.STRIPE_PRICE_TERM ?? null;
  if (sku === 'pack') return process.env.STRIPE_PRICE_PACK ?? null;
  if (sku === 'review_pack') return process.env.STRIPE_PRICE_REVIEW_PACK ?? null;
  if (sku === 'review_addon') return process.env.STRIPE_PRICE_REVIEW_ADDON ?? null;
  return null;
}
```

- [ ] **Step 4: Extend fulfillment + the subscription lifecycle in `billing.ts`**

Three edits (complete function replacements — the unchanged branches are repeated verbatim so the file reads as one whole).

Edit 1 — replace `fulfillCheckout` (and its doc comment):

```ts
/**
 * Apply a completed checkout to the user's billing state. Idempotent:
 * safe to run twice for the same session (a webhook can fire more than
 * once) — the credit grants are guarded by a per-session marker, and the
 * term / add-on paths write absolute values derived from the retrieved
 * subscription.
 *
 * The `stripe` client is needed for the subscription paths (term and
 * review_addon): a subscription-mode session carries only the
 * subscription id, so we retrieve the subscription to read its status
 * and period end. The pack paths ignore it.
 *
 * Exported for tests.
 */
export async function fulfillCheckout(
  supabase: SupabaseClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const userId = session.client_reference_id ?? session.metadata?.user_id;
  const sku = session.metadata?.sku as BillingSku | undefined;
  if (!userId || !sku) {
    throw new Error('checkout session missing user_id / sku metadata');
  }

  const customerId =
    typeof session.customer === 'string' ? session.customer : null;

  if (sku === 'term') {
    // Subscription mode: the completion signal is session.status ===
    // 'complete', NOT payment_status (which can be 'no_payment_required').
    // An incomplete session is a no-op the webhook will re-fire on.
    const paid =
      session.status === 'complete' ||
      session.payment_status === 'paid' ||
      session.payment_status === 'no_payment_required';
    if (!paid) return;

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;
    if (!subscriptionId) {
      throw new Error('term checkout session missing subscription id');
    }

    // Retrieve the subscription for its status + item-level period end.
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const periodEndSec = subscriptionPeriodEnd(sub); // fails hard if absent
    const expiresAtIso = new Date(periodEndSec * 1000).toISOString();

    // Forward-only expiry: never move plan_expires_at backward on the term
    // path (guards against an out-of-order webhook redelivery regressing a
    // paying user's access). Only advance it.
    await advanceTermAccess(supabase, userId, {
      expiresAtIso,
      subscriptionStatus: sub.status,
      subscriptionId: sub.id,
      customerId: customerId ?? (typeof sub.customer === 'string' ? sub.customer : null),
    });
    return;
  }

  if (sku === 'review_addon') {
    // The weekly-quota add-on is a subscription, so it uses the term's
    // completion semantics (status 'complete', not payment_status) — but
    // it grants ONLY the review_addon flag. plan / plan_expires_at /
    // subscription_status belong to the term and are never written here.
    const paid =
      session.status === 'complete' ||
      session.payment_status === 'paid' ||
      session.payment_status === 'no_payment_required';
    if (!paid) return;

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;
    if (!subscriptionId) {
      throw new Error('review_addon checkout session missing subscription id');
    }

    // Retrieve so the stored id is Stripe's real object (a replayed or
    // malformed session without a live subscription throws → 500 → retry).
    const sub = await stripe.subscriptions.retrieve(subscriptionId);

    // Absolute-value write = naturally idempotent (like the term), so no
    // billing_fulfilled_sessions marker is needed. stripe_customer_id is
    // recorded alongside (not part of the entitlement) so later add-on
    // lifecycle events can also reconcile by customer id.
    const { error } = await supabase
      .from('users')
      .update({
        review_addon: true,
        review_addon_subscription_id: sub.id,
        ...(customerId ? { stripe_customer_id: customerId } : {}),
      })
      .eq('id', userId);
    if (error) throw new Error(`review_addon grant update: ${error.message}`);
    return;
  }

  // review_pack — grant review credits. Mirrors the pack branch exactly:
  // paid-only, idempotent via billing_fulfilled_sessions, atomic RPC grant.
  if (sku === 'review_pack') {
    if (session.payment_status !== 'paid') return;

    // Idempotency: record fulfilled session ids so a retry can't double-grant.
    const alreadyFulfilled = await sessionAlreadyFulfilled(supabase, session.id);
    if (alreadyFulfilled) return;

    // Grant credits atomically (SET review_credits = review_credits + N in
    // one statement, via the Task-8 RPC) so two distinct concurrent
    // fulfillments can't lose a grant on a stale read. service_role can
    // run it; the billing-column guard permits the write.
    const { error: grantErr } = await supabase.rpc(
      'grant_review_credits' as never,
      { p_user_id: userId, p_amount: REVIEW_PACK_CREDITS } as never,
    );
    if (grantErr) throw new Error(`review_pack credit grant: ${grantErr.message}`);

    // Record the Stripe customer id separately (not part of the atomic
    // credit math). Guarded write, service_role.
    if (customerId) {
      await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
    }

    await markSessionFulfilled(supabase, session.id, userId, REVIEW_PACK_CREDITS);
    return;
  }

  // pack — grant credits. Only fulfill paid sessions.
  if (session.payment_status !== 'paid') return;

  // Idempotency: record fulfilled session ids so a retry can't double-grant.
  const alreadyFulfilled = await sessionAlreadyFulfilled(supabase, session.id);
  if (alreadyFulfilled) return;

  // Grant credits atomically (SET export_credits = export_credits + N in
  // one statement, via the RPC) so two distinct concurrent pack
  // fulfillments can't lose a grant on a stale read. service_role can run
  // it; the billing-column guard permits the write.
  const { error: grantErr } = await supabase.rpc(
    'grant_export_credits' as never,
    { p_user_id: userId, p_amount: PACK_EXPORT_CREDITS } as never,
  );
  if (grantErr) throw new Error(`pack credit grant: ${grantErr.message}`);

  // Record the Stripe customer id separately (not part of the atomic
  // credit math). Guarded write, service_role.
  if (customerId) {
    await supabase
      .from('users')
      .update({ stripe_customer_id: customerId })
      .eq('id', userId);
  }

  await markSessionFulfilled(supabase, session.id, userId, PACK_EXPORT_CREDITS);
}
```

Edit 2 — replace `handleInvoicePaid` (the add-on guard is new; the rest is verbatim):

```ts
export async function handleInvoicePaid(
  supabase: SupabaseClient,
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<void> {
  // `invoice.subscription` is a string id when the invoice belongs to a
  // subscription. The SDK's Invoice type varies by API version, so read it
  // defensively via unknown rather than a direct field access.
  const rawSub = (invoice as unknown as { subscription?: unknown }).subscription;
  const subscriptionId = typeof rawSub === 'string' ? rawSub : undefined;
  // A one-time pack produces no subscription invoice we act on — guard.
  if (!subscriptionId) return;

  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  // A review add-on invoice is NOT a term renewal: the add-on's weekly
  // quota needs no period-end write, and routing it through
  // advanceTermAccess would grant plan='term' to a user who never bought
  // it (and clobber stripe_subscription_id with the add-on's id).
  if (sub.metadata?.sku === 'review_addon') return;

  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : null;

  const userId = await findUserIdForSubscriptionEvent(supabase, {
    subscriptionId,
    customerId,
    metadataUserId: sub.metadata?.user_id ?? null,
  });

  const periodEndSec = subscriptionPeriodEnd(sub);
  await advanceTermAccess(supabase, userId, {
    expiresAtIso: new Date(periodEndSec * 1000).toISOString(),
    subscriptionStatus: sub.status,
    subscriptionId: sub.id,
    customerId,
  });
}
```

(Keep the existing doc comment above `handleInvoicePaid` — "A term renewal — `invoice.paid` fires on the first invoice AND every 4-month renewal …" — and extend its first sentence to note the add-on guard: `A term renewal — invoice.paid fires on the first invoice AND every 4-month renewal. Review add-on invoices return early below.`)

Edit 3 — replace `handleSubscriptionChange` (the add-on branch on top is new; the term logic below it is verbatim):

```ts
export async function handleSubscriptionChange(
  supabase: SupabaseClient,
  sub: Stripe.Subscription,
): Promise<void> {
  // Review add-on subscriptions are not the term: they only flip the
  // weekly-quota flag. Checked FIRST so an add-on event can never rewrite
  // plan / plan_expires_at / subscription_status. The user resolves via
  // the metadata user_id stamped at checkout (or the shared customer id)
  // — findUserIdForSubscriptionEvent needs no change for add-on subs.
  if (sub.metadata?.sku === 'review_addon') {
    const addOnCustomerId =
      typeof sub.customer === 'string' ? sub.customer : null;
    const addOnUserId = await findUserIdForSubscriptionEvent(supabase, {
      subscriptionId: sub.id,
      customerId: addOnCustomerId,
      metadataUserId: sub.metadata?.user_id ?? null,
    });

    if (TERM_ACTIVE_STATUSES.has(sub.status)) {
      // Still entitled — (re)set the flag and record WHICH subscription
      // grants it (absolute values, so redelivery is safe).
      const { error } = await supabase
        .from('users')
        .update({
          review_addon: true,
          review_addon_subscription_id: sub.id,
        })
        .eq('id', addOnUserId);
      if (error) throw new Error(`review_addon update: ${error.message}`);
      return;
    }

    // Terminal (canceled / unpaid / incomplete_expired) — clear the flag.
    // review_addon_subscription_id is KEPT (not nulled) so a late-arriving
    // event for this same subscription can still reconcile the user.
    const { error } = await supabase
      .from('users')
      .update({ review_addon: false })
      .eq('id', addOnUserId);
    if (error) throw new Error(`review_addon revoke update: ${error.message}`);
    return;
  }

  const customerId =
    typeof sub.customer === 'string' ? sub.customer : null;
  const userId = await findUserIdForSubscriptionEvent(supabase, {
    subscriptionId: sub.id,
    customerId,
    metadataUserId: sub.metadata?.user_id ?? null,
  });

  if (TERM_ACTIVE_STATUSES.has(sub.status)) {
    // Still entitled — advance access to the (item-level) period end.
    const periodEndSec = subscriptionPeriodEnd(sub);
    await advanceTermAccess(supabase, userId, {
      expiresAtIso: new Date(periodEndSec * 1000).toISOString(),
      subscriptionStatus: sub.status,
      subscriptionId: sub.id,
      customerId,
    });
    return;
  }

  // Terminal — revoke access, keeping plan and expiry consistent.
  const { error } = await supabase
    .from('users')
    .update({
      plan: 'free',
      plan_expires_at: new Date().toISOString(),
      subscription_status: sub.status,
    })
    .eq('id', userId);
  if (error) throw new Error(`subscription revoke update: ${error.message}`);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace=apps/api -- billing`
Expected: PASS (36 tests — 28 existing + 8 new).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/billing.ts apps/api/src/__tests__/billing.test.ts
git commit -m "feat(billing): review pack + weekly review add-on SKUs — checkout, fulfillment, subscription lifecycle (§5.3, D8)"
```

### Task 18: `POST /api/review/render-pptx` + `review/pptx.ts`

**Files:**
- Create: `apps/api/src/review/pptx.ts`
- Modify: `apps/api/src/review.ts` (created in Task 15 — this task MODIFIES it)
- Test: `apps/api/src/__tests__/reviewPptx.test.ts`
- Test: `apps/api/src/__tests__/reviewRenderPptx.test.ts`

**Interfaces:**
- Consumes: `createReviewRouter` / `ReviewRouterDeps` (Task 15, per the CONTEXT contract); `REVIEW_MAX_PAGES`, `REVIEW_PPTX_MAX_BYTES`, `REVIEW_SIGNED_URL_TTL_SEC` from `apps/api/src/review/config.ts` (Task 9); `ReviewPageRef` (type-only) from `@postr/shared` (Task 9); `checkImageUrl` (`apps/api/src/imageUrlGuard.ts`); `createRateLimiter` (`apps/api/src/rateLimit.ts`); `requireAuth` / `AuthLocals` (`apps/api/src/auth.ts`); the private `poster-assets` bucket (migration `20260408000500_storage.sql`).
- Produces: `PptxRenderer`, `RenderedPage`, `ExecFileFn`, `LibreOfficeRendererOptions`, `createLibreOfficeRenderer(opts)` from `apps/api/src/review/pptx.ts`; the route `POST /api/review/render-pptx` → `200 { pages: ReviewPageRef[] }`, consumed by the web PPTX ingest (Tasks 20–22); `ReviewRouterDeps.getPptxRenderer`.

Server-side PPTX → page-JPEG rendering (D10, spec §6.2.2). Two parts: the `PptxRenderer` seam + its LibreOffice reference implementation (`review/pptx.ts`), and the `POST /api/review/render-pptx` route added to `apps/api/src/review.ts`. No credit is consumed here — rendering is an ingest utility; the critique route (Task 16) charges. The client uploads the `.pptx` to Storage temp first; this route re-fetches it through the SSRF guard, converts, and returns short-lived signed page URLs.

**Ops note (D10):** Render's native Node image has neither `soffice` nor `pdftoppm`. Deploy the API as a Docker-based service with `libreoffice-impress` + `poppler-utils` installed, or swap in a hosted-convert `PptxRenderer` behind the same interface — PPTX ships LAST of the input kinds (spec §6.2.2), so it never blocks Postr-native / image / PDF ingest.

- [ ] **Step 1: Write the failing renderer test**

`apps/api/src/__tests__/reviewPptx.test.ts`:

```ts
/**
 * review/pptx.ts — the LibreOffice PptxRenderer. A fake execFileFn stands
 * in for soffice/pdftoppm (no real LibreOffice in CI): it captures argv,
 * verifies the input file was actually written, and materializes the page
 * JPEGs pdftoppm would produce. Asserts the page-order read-back, the
 * SOF0 dimension parse, and the finally-cleanup of the temp dir.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createLibreOfficeRenderer,
  type ExecFileFn,
} from '../review/pptx.js';

/** Minimal JPEG carrying real SOF0 dimensions (what the parser reads). */
function fakeJpeg(widthPx: number, heightPx: number): Buffer {
  return Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xc0, // SOF0
    0x00, 0x11, // segment length
    0x08, // precision
    (heightPx >> 8) & 0xff, heightPx & 0xff,
    (widthPx >> 8) & 0xff, widthPx & 0xff,
  ]);
}

interface ExecCall {
  file: string;
  args: string[];
}

function fakeExec(
  opts: {
    pages?: Array<{ widthPx: number; heightPx: number }>;
    failOn?: 'soffice' | 'pdftoppm';
  } = {},
) {
  const calls: ExecCall[] = [];
  const pages = opts.pages ?? [
    { widthPx: 2550, heightPx: 3300 },
    { widthPx: 2550, heightPx: 3300 },
  ];
  let sawInputBytes: Buffer | null = null;
  const execFileFn: ExecFileFn = async (file, args) => {
    calls.push({ file, args });
    if (calls.length === 1) {
      // soffice --headless --convert-to pdf --outdir <dir> <in>
      if (opts.failOn === 'soffice') throw new Error('soffice crashed');
      const outDir = args[args.indexOf('--outdir') + 1]!;
      const inPath = args[args.length - 1]!;
      sawInputBytes = await readFile(inPath); // proves the pptx was written
      await writeFile(join(outDir, 'deck.pdf'), sawInputBytes);
    } else {
      // pdftoppm -jpeg -r 150 <pdf> <outPrefix>
      if (opts.failOn === 'pdftoppm') throw new Error('pdftoppm crashed');
      const outPrefix = args[args.length - 1]!;
      for (let i = 0; i < pages.length; i++) {
        await writeFile(
          `${outPrefix}-${i + 1}.jpg`,
          fakeJpeg(pages[i]!.widthPx, pages[i]!.heightPx),
        );
      }
    }
    return { stdout: '', stderr: '' };
  };
  return { execFileFn, calls, getSawInputBytes: () => sawInputBytes };
}

let workDir: string;
beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'pptx-test-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('createLibreOfficeRenderer', () => {
  it('runs soffice → pdftoppm and reads the page JPEGs back in order with dimensions', async () => {
    const fake = fakeExec();
    const renderer = createLibreOfficeRenderer({
      sofficePath: '/usr/bin/soffice',
      pdftoppmPath: '/usr/bin/pdftoppm',
      workDir,
      execFileFn: fake.execFileFn,
    });

    const pages = await renderer.render(Buffer.from('fake-pptx-bytes'));

    // argv: the conversion pipeline as deployed (D10)
    expect(fake.calls).toHaveLength(2);
    const [soffice, pdftoppm] = fake.calls;
    expect(soffice!.file).toBe('/usr/bin/soffice');
    expect(soffice!.args.slice(0, 4)).toEqual([
      '--headless',
      '--convert-to',
      'pdf',
      '--outdir',
    ]);
    const dir = soffice!.args[4]!;
    expect(dir.startsWith(workDir)).toBe(true);
    expect(soffice!.args[5]).toBe(join(dir, 'deck.pptx'));
    expect(pdftoppm!.file).toBe('/usr/bin/pdftoppm');
    expect(pdftoppm!.args).toEqual([
      '-jpeg',
      '-r',
      '150',
      join(dir, 'deck.pdf'),
      join(dir, 'page'),
    ]);

    // the input bytes were really written to the temp dir for soffice
    expect(fake.getSawInputBytes()?.toString()).toBe('fake-pptx-bytes');

    // pages come back in page order, with SOF0-parsed dimensions
    expect(pages.map((p) => p.pageNumber)).toEqual([1, 2]);
    expect(pages[0]).toMatchObject({ widthPx: 2550, heightPx: 3300 });
    expect(pages[0]!.jpeg.equals(fakeJpeg(2550, 3300))).toBe(true);

    // finally-cleanup removed the whole temp dir
    expect(existsSync(dir)).toBe(false);
  });

  it('cleans the temp dir even when conversion fails', async () => {
    const fake = fakeExec({ failOn: 'pdftoppm' });
    const renderer = createLibreOfficeRenderer({
      sofficePath: '/usr/bin/soffice',
      pdftoppmPath: '/usr/bin/pdftoppm',
      workDir,
      execFileFn: fake.execFileFn,
    });

    await expect(renderer.render(Buffer.from('x'))).rejects.toThrow(
      'pdftoppm crashed',
    );
    const dir = fake.calls[0]!.args[4]!;
    expect(existsSync(dir)).toBe(false);
  });

  it('returns an empty page list when pdftoppm produced nothing (the route turns it into a 502)', async () => {
    const fake = fakeExec({ pages: [] });
    const renderer = createLibreOfficeRenderer({
      workDir,
      execFileFn: fake.execFileFn,
    });
    await expect(renderer.render(Buffer.from('x'))).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/api -- reviewPptx`
Expected: FAIL — module `../review/pptx.js` does not exist.

- [ ] **Step 3: Implement `review/pptx.ts`**

`apps/api/src/review/pptx.ts`:

```ts
/**
 * Server-side PPTX → page-image renderer (D10, spec §6.2.2).
 *
 * The client uploads a .pptx to Supabase Storage; /api/review/render-pptx
 * re-fetches it through the SSRF guard and hands the bytes here. The
 * reference implementation shells out to LibreOffice headless (soffice
 * --convert-to pdf) + poppler (pdftoppm -jpeg -r 150) in a per-request
 * temp dir that is always removed in a `finally`.
 *
 * OPS NOTE: Render's native Node image has neither soffice nor pdftoppm.
 * Deploy the API as a Docker-based service with `libreoffice-impress` +
 * `poppler-utils` installed, or swap in a hosted-convert PptxRenderer
 * behind this same interface — PPTX ships last (spec §6.2.2), so it
 * never blocks the other input kinds.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** One rendered slide: the JPEG bytes plus their pixel dimensions. */
export interface RenderedPage {
  pageNumber: number;
  jpeg: Buffer;
  widthPx: number;
  heightPx: number;
}

/** The render seam the route depends on — swap implementations freely. */
export interface PptxRenderer {
  render(pptx: Buffer): Promise<RenderedPage[]>;
}

/** Narrow execFile surface (injectable for tests — no real LibreOffice). */
export type ExecFileFn = (
  file: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>;

const execFileAsync: ExecFileFn = async (file, args) => {
  const { stdout, stderr } = await promisify(execFile)(file, args, {
    maxBuffer: 16 * 1024 * 1024,
  });
  return { stdout: String(stdout), stderr: String(stderr) };
};

export interface LibreOfficeRendererOptions {
  /** Path/name of the LibreOffice binary (default 'soffice'). */
  sofficePath?: string;
  /** Path/name of the poppler binary (default 'pdftoppm'). */
  pdftoppmPath?: string;
  /** Parent dir for per-request temp dirs (default os.tmpdir()). */
  workDir?: string;
  /** Injectable process runner for tests. */
  execFileFn?: ExecFileFn;
}

export function createLibreOfficeRenderer(
  opts: LibreOfficeRendererOptions = {},
): PptxRenderer {
  const sofficePath = opts.sofficePath ?? 'soffice';
  const pdftoppmPath = opts.pdftoppmPath ?? 'pdftoppm';
  const workDir = opts.workDir ?? tmpdir();
  const execFileFn = opts.execFileFn ?? execFileAsync;

  return {
    async render(pptx: Buffer): Promise<RenderedPage[]> {
      const dir = await mkdtemp(join(workDir, 'postr-pptx-'));
      try {
        const inPath = join(dir, 'deck.pptx');
        await writeFile(inPath, pptx);

        // PPTX → PDF (LibreOffice headless; writes deck.pdf into --outdir).
        await execFileFn(sofficePath, [
          '--headless',
          '--convert-to',
          'pdf',
          '--outdir',
          dir,
          inPath,
        ]);

        // PDF → one JPEG per slide at 150 DPI (page-1.jpg, page-2.jpg, …).
        const outPrefix = join(dir, 'page');
        await execFileFn(pdftoppmPath, [
          '-jpeg',
          '-r',
          '150',
          join(dir, 'deck.pdf'),
          outPrefix,
        ]);

        const names = (await readdir(dir))
          .filter((n) => /^page-\d+\.jpg$/.test(n))
          .sort((a, b) => pageNumberOf(a) - pageNumberOf(b));
        const pages: RenderedPage[] = [];
        for (const [index, name] of names.entries()) {
          const jpeg = await readFile(join(dir, name));
          const { widthPx, heightPx } = jpegDimensions(jpeg);
          pages.push({ pageNumber: index + 1, jpeg, widthPx, heightPx });
        }
        return pages;
      } finally {
        // Always scrub the temp dir — pptx bytes and renders are user data.
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

/** pdftoppm zero-pads page numbers to the deck's digit width (page-1 … page-24). */
function pageNumberOf(name: string): number {
  return Number(name.slice('page-'.length, -'.jpg'.length));
}

/**
 * Read pixel dimensions from a JPEG's SOF segment. No dependency needed:
 * after the SOI marker a JPEG is length-prefixed segments; the SOF
 * segment (FFC0–FFCF except C4/C8/CC) carries height/width as big-endian
 * u16s at segment offsets 5 and 7.
 */
function jpegDimensions(buf: Buffer): { widthPx: number; heightPx: number } {
  let off = 2; // skip SOI (FF D8)
  // Need 9 readable bytes from off: marker(2) + length(2) + precision(1)
  // + height(2) + width(2) — the highest index read is off + 8.
  while (off + 9 <= buf.length) {
    if (buf[off] !== 0xff) break;
    const marker = buf[off + 1]!;
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        heightPx: buf.readUInt16BE(off + 5),
        widthPx: buf.readUInt16BE(off + 7),
      };
    }
    const segmentLength = buf.readUInt16BE(off + 2);
    off += 2 + segmentLength;
  }
  throw new Error('pptx render: unreadable JPEG dimensions');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/api -- reviewPptx`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing route test**

`apps/api/src/__tests__/reviewRenderPptx.test.ts`:

```ts
/**
 * POST /api/review/render-pptx — route tests with a fake PptxRenderer and
 * fake Supabase Storage (no LibreOffice, no network). Pins: the signed-URL
 * happy path + storage layout, the 24-page hard cap (spec §1 — never
 * silently truncate), and the SSRF guard rejecting foreign hosts before
 * any fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createReviewRouter } from '../review.js';
import type { PptxRenderer, RenderedPage } from '../review/pptx.js';

const SUPABASE_URL = 'https://testref.supabase.co';
const VALID_FILE_URL = `${SUPABASE_URL}/storage/v1/object/sign/poster-assets/user-1/review-tmp/deck.pptx?token=abc`;
const PPTX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);

function fakeSupabase() {
  const uploads: Array<{
    bucket: string;
    path: string;
    contentType?: string;
    byteLength: number;
  }> = [];
  const signed: Array<{ bucket: string; path: string; ttlSec: number }> = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: 'user-1', is_anonymous: false } },
        error: null,
      }),
    },
    storage: {
      from(bucket: string) {
        return {
          upload: async (
            path: string,
            body: Buffer,
            opts?: { contentType?: string },
          ) => {
            uploads.push({
              bucket,
              path,
              contentType: opts?.contentType,
              byteLength: body.length,
            });
            return { data: { path }, error: null };
          },
          createSignedUrl: async (path: string, ttlSec: number) => {
            signed.push({ bucket, path, ttlSec });
            return {
              data: { signedUrl: `https://signed.test/${path}?token=sig` },
              error: null,
            };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
  return { client, uploads, signed };
}

function fakeRenderer(pages: Array<{ widthPx: number; heightPx: number }>) {
  const calls: Buffer[] = [];
  const renderer: PptxRenderer = {
    render: async (pptx: Buffer): Promise<RenderedPage[]> => {
      calls.push(pptx);
      return pages.map((d, i) => ({
        pageNumber: i + 1,
        jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
        widthPx: d.widthPx,
        heightPx: d.heightPx,
      }));
    },
  };
  return { renderer, calls };
}

function buildApp(deps: { renderer: PptxRenderer; fetchFn?: typeof fetch }) {
  const fake = fakeSupabase();
  const fetchFn =
    deps.fetchFn ??
    ((async () =>
      new Response(PPTX_BYTES, {
        status: 200,
        headers: {
          'content-type':
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        },
      })) as unknown as typeof fetch);
  const app = express();
  app.use(express.json());
  app.use(
    createReviewRouter({
      getSupabaseAdmin: () => fake.client,
      fetchFn,
      getPptxRenderer: () => deps.renderer,
    }),
  );
  return { app, fake };
}

function postRender(app: ReturnType<typeof express>, fileUrl: string) {
  return request(app)
    .post('/api/review/render-pptx')
    .set('Authorization', 'Bearer test-token')
    .send({ fileUrl });
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', SUPABASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/review/render-pptx', () => {
  it('renders the deck, uploads page JPEGs to review-temp, returns signed URLs', async () => {
    const { renderer, calls } = fakeRenderer([
      { widthPx: 2048, heightPx: 1152 },
      { widthPx: 2048, heightPx: 1152 },
    ]);
    const { app, fake } = buildApp({ renderer });

    const res = await postRender(app, VALID_FILE_URL);

    expect(res.status).toBe(200);
    expect(res.body.pages).toHaveLength(2);
    expect(res.body.pages[0]).toMatchObject({
      pageNumber: 1,
      widthPx: 2048,
      heightPx: 1152,
    });
    expect(res.body.pages[0].url).toContain('https://signed.test/');

    // the renderer received exactly the fetched .pptx bytes
    expect(calls).toHaveLength(1);
    expect(calls[0]!.equals(Buffer.from(PPTX_BYTES))).toBe(true);

    // one upload per page under {user}/review-temp/{batch}/page-N.jpg
    expect(fake.uploads).toHaveLength(2);
    expect(fake.uploads[0]!.bucket).toBe('poster-assets');
    expect(fake.uploads[0]!.contentType).toBe('image/jpeg');
    expect(fake.uploads[0]!.path).toMatch(
      /^user-1\/review-temp\/[0-9a-f-]{36}\/page-1\.jpg$/,
    );
    expect(fake.uploads[1]!.path).toMatch(
      /^user-1\/review-temp\/[0-9a-f-]{36}\/page-2\.jpg$/,
    );

    // signed URLs minted for the uploaded paths at the review TTL (600s)
    expect(fake.signed).toEqual([
      { bucket: 'poster-assets', path: fake.uploads[0]!.path, ttlSec: 600 },
      { bucket: 'poster-assets', path: fake.uploads[1]!.path, ttlSec: 600 },
    ]);
  });

  it('rejects a deck over the 24-page cap (400 too_many_pages) and uploads nothing', async () => {
    const { renderer } = fakeRenderer(
      Array.from({ length: 25 }, () => ({ widthPx: 2048, heightPx: 1152 })),
    );
    const { app, fake } = buildApp({ renderer });

    const res = await postRender(app, VALID_FILE_URL);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('too_many_pages');
    expect(fake.uploads).toHaveLength(0);
  });

  it('rejects a fileUrl on a foreign host with 400 before any fetch or render', async () => {
    const fetchFn = vi.fn();
    const { renderer, calls } = fakeRenderer([
      { widthPx: 2048, heightPx: 1152 },
    ]);
    const { app } = buildApp({
      renderer,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await postRender(app, 'https://evil.example.com/deck.pptx');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('url_not_allowed');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test --workspace=apps/api -- reviewRenderPptx`
Expected: FAIL — all 3 tests return 404 (the Task-15 router has no `/api/review/render-pptx` route yet; the unknown `getPptxRenderer` dep is ignored at runtime). `npm run build` would also fail on the excess dep property until Step 7 — that is expected mid-task.

- [ ] **Step 7: Wire the route into `apps/api/src/review.ts`**

Task 15 created `apps/api/src/review.ts` with `createReviewRouter`, the `ReviewRouterDeps` interface, and the `/api/review/critique` route. Make three edits; everything referenced that is not listed as a new import (`requireAuth`, `AuthLocals`, `createRateLimiter`, `z`, `Request`, `Response`, and the resolved `fetchFn` / `getSupabaseAdmin` bindings inside `createReviewRouter`) is already in scope from Task 15.

Edit 1 — merge these into the file's imports (ESM `.js` suffixes; `ReviewPageRef` is a TYPE-only import from `@postr/shared` — the API never imports runtime values from shared):

```ts
import { randomUUID } from 'node:crypto';
import type { ReviewPageRef } from '@postr/shared';
import { checkImageUrl } from './imageUrlGuard.js';
import {
  REVIEW_MAX_PAGES,
  REVIEW_PPTX_MAX_BYTES,
  REVIEW_SIGNED_URL_TTL_SEC,
} from './review/config.js';
import {
  createLibreOfficeRenderer,
  type PptxRenderer,
  type RenderedPage,
} from './review/pptx.js';
```

(If Task 15 already imports from `./review/config.js`, merge the three names into that import instead of adding a second one.)

Edit 2 — add the render seam to `ReviewRouterDeps` (shown in full; the five existing fields stay verbatim, only the last field + comment is new):

```ts
export interface ReviewRouterDeps {
  getSupabaseAdmin?: () => SupabaseClient | null;
  getAnthropic?: () => Anthropic | null;
  fetchFn?: typeof fetch;
  weeklyLimiter?: RequestHandler;   // add-on weekly window; default built per D5
  now?: () => number;
  /** PPTX render seam (Task 18). Default: LibreOffice headless via review/pptx.ts. */
  getPptxRenderer?: () => PptxRenderer;
}
```

and at module scope beside it add the default factory + the body schema:

```ts
/** Built per call — createLibreOfficeRenderer() is a cheap closure. */
function defaultGetPptxRenderer(): PptxRenderer {
  return createLibreOfficeRenderer();
}

const RenderPptxRequest = z.object({
  fileUrl: z.string().url(),
});
```

Edit 3 — inside `createReviewRouter`, resolve the dep beside the others (`const getPptxRenderer = deps.getPptxRenderer ?? defaultGetPptxRenderer;`) and register the route AFTER the `/api/review/critique` registration, before `return router;`:

```ts
  // ── Render an uploaded .pptx to page JPEGs (D10). No credit is consumed
  //    here — this is an ingest utility; the critique route charges. The
  //    .pptx is re-fetched through the same SSRF guard as import images.
  router.post(
    '/api/review/render-pptx',
    requireAuth(getSupabaseAdmin),
    // Conversion is CPU-heavy (LibreOffice) — a tight burst + daily cap.
    createRateLimiter({ maxPerWindow: 2, maxPerDay: 10 }),
    async (req: Request, res: Response) => {
      const parsed = RenderPptxRequest.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: 'bad_request', details: parsed.error.flatten() });
      }
      const { fileUrl } = parsed.data;

      const supabase = getSupabaseAdmin();
      if (!supabase) {
        return res.status(500).json({
          error: 'supabase_not_configured',
          message: 'SUPABASE_URL and SUPABASE_SECRET_KEY must both be set.',
        });
      }

      // SSRF guard: only ever fetch our own Supabase Storage host.
      const urlCheck = checkImageUrl(fileUrl, process.env.SUPABASE_URL);
      if (!urlCheck.ok) {
        if (urlCheck.reason === 'allowlist_not_configured') {
          return res.status(500).json({
            error: 'supabase_not_configured',
            message: 'SUPABASE_URL must be set to validate file sources.',
          });
        }
        return res.status(400).json({
          error: 'url_not_allowed',
          message: 'fileUrl must be an https URL on the project storage host.',
        });
      }

      // Re-fetch the .pptx server-side. Redirects are refused outright —
      // the host allowlist is worthless if the allowed host can 302 to an
      // internal address.
      let pptx: Buffer;
      try {
        const r = await fetchFn(fileUrl, {
          signal: AbortSignal.timeout(30_000),
          redirect: 'error',
        });
        if (!r.ok) {
          return res
            .status(502)
            .json({ error: 'file_fetch_failed', status: r.status });
        }
        pptx = Buffer.from(await r.arrayBuffer());
        // Raw-byte cap BEFORE any conversion — a huge deck gets a clean
        // 413 instead of a LibreOffice timeout.
        if (pptx.byteLength > REVIEW_PPTX_MAX_BYTES) {
          return res.status(413).json({ error: 'pptx_too_large' });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown';
        return res.status(502).json({ error: 'file_fetch_failed', message });
      }

      let rendered: RenderedPage[];
      try {
        rendered = await getPptxRenderer().render(pptx);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown';
        // eslint-disable-next-line no-console
        console.error('[review.render-pptx] render failed:', message);
        return res.status(502).json({ error: 'pptx_render_failed' });
      }

      if (rendered.length === 0) {
        return res.status(502).json({
          error: 'pptx_render_failed',
          message: 'The deck produced no pages.',
        });
      }
      // Hard page cap (spec §1) — never silently truncate.
      if (rendered.length > REVIEW_MAX_PAGES) {
        return res.status(400).json({
          error: 'too_many_pages',
          message: `Presentation Checker accepts at most ${REVIEW_MAX_PAGES} pages — trim the deck and try again.`,
        });
      }

      // Persist each page JPEG to the user's review-temp batch and mint
      // short-lived signed URLs for the client + the critique page fetcher.
      const user = (res.locals as AuthLocals).user;
      const batchId = randomUUID();
      const pages: ReviewPageRef[] = [];
      for (const page of rendered) {
        const path = `${user.id}/review-temp/${batchId}/page-${page.pageNumber}.jpg`;
        const { error: uploadErr } = await supabase.storage
          .from('poster-assets')
          .upload(path, page.jpeg, { contentType: 'image/jpeg' });
        if (uploadErr) {
          // eslint-disable-next-line no-console
          console.error('[review.render-pptx] page upload failed:', uploadErr.message);
          return res.status(502).json({ error: 'page_upload_failed' });
        }
        const { data: signed, error: signErr } = await supabase.storage
          .from('poster-assets')
          .createSignedUrl(path, REVIEW_SIGNED_URL_TTL_SEC);
        if (signErr || !signed?.signedUrl) {
          // eslint-disable-next-line no-console
          console.error('[review.render-pptx] sign failed:', signErr?.message);
          return res.status(502).json({ error: 'page_upload_failed' });
        }
        pages.push({
          pageNumber: page.pageNumber,
          url: signed.signedUrl,
          widthPx: page.widthPx,
          heightPx: page.heightPx,
        });
      }

      return res.json({ pages });
    },
  );
```

- [ ] **Step 8: Run tests + build to verify**

Run: `npm test --workspace=apps/api -- reviewPptx reviewRenderPptx`
Expected: PASS (6 tests).

Run: `npm test --workspace=apps/api && npm run build`
Expected: all API suites pass (including Task 15/16's review tests — the new route changes nothing they assert); typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/review/pptx.ts apps/api/src/review.ts apps/api/src/__tests__/reviewPptx.test.ts apps/api/src/__tests__/reviewRenderPptx.test.ts
git commit -m "feat(review): server-side PPTX render — LibreOffice PptxRenderer + POST /api/review/render-pptx (D10)"
```

---

# MILESTONE 4 — Client ingest (apps/web)

**Purpose:** build the spec §3 ingest layer — every input (Postr poster / PDF / PPTX / image) becomes the same `NormalizedArtifact` (ordered high-res page images + optional `PosterDoc`), guarded by deterministic pre-model checks that fail with typed errors before anything is rendered, uploaded, or charged for. PPTX is the one server-rendered input (D10); the other three are zero-backend. Everything lands under `apps/web/src/review/ingest/`; Milestone 5's UI consumes the Task-22 barrel wrappers `ingestFileForReview` / `ingestPosterForReview` + the `IngestError` kinds — `normalizeInput` stays the internal dispatcher.

### Task 19: Higher-res poster capture (`data/thumbnails.ts` refactor)

**Files:**
- Modify: `apps/web/src/data/thumbnails.ts`
- Test: `apps/web/src/data/__tests__/thumbnails.test.ts`

**Interfaces:**
- Consumes: the mounted `#poster-canvas` element (poster open in the editor), `html-to-image`'s `toCanvas`, the `poster-assets` bucket via `@/lib/supabase` (existing seams, `thumbnails.ts:10-16`).
- Produces: `pixelRatioFor(canvasWidthPx, targetWidthPx): number`; `capturePosterJpeg(opts: { targetWidthPx: number; quality: number }): Promise<Blob | null>`; `captureReviewImage(userId, posterId): Promise<{ path: string; signedUrl: string } | null>` (D11 — consumed by Task 22's `fromPoster`). `captureThumbnail` / `getThumbnailUrl` keep their signatures and behavior byte-identical.

The only unit-tested surface is the extracted pure `pixelRatioFor` math. The DOM capture itself (clone → strip editor chrome → html-to-image → JPEG) is verified manually — house coverage class for canvas/DOM paths, same as the pdfjs render path (`pdfImport.test.ts` header); the Milestone-6 manual flow exercises the review capture end-to-end.

- [ ] **Step 1: Write the failing test**

`apps/web/src/data/__tests__/thumbnails.test.ts`:

```ts
/**
 * Pins the extracted pixelRatioFor math (the 400px thumb and the
 * 2048px review capture share it). The DOM capture path itself is
 * verified manually — house pattern for canvas/DOM capture, same
 * coverage class as the pdfjs render path (see pdfImport.test.ts
 * header).
 */
import { describe, it, expect, vi } from 'vitest';

// thumbnails.ts imports the supabase singleton, which throws at module
// load without env vars (lib/supabase.ts:14-18) — mock it even though
// these tests never touch storage.
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
}));

import { pixelRatioFor } from '../thumbnails';

describe('pixelRatioFor', () => {
  it('scales down for the 400px thumbnail', () => {
    expect(pixelRatioFor(1000, 400)).toBeCloseTo(0.4, 10);
  });

  it('scales up for the 2048px review capture', () => {
    expect(pixelRatioFor(1024, 2048)).toBe(2);
  });

  it('is 1 when the canvas already matches the target', () => {
    expect(pixelRatioFor(2048, 2048)).toBe(1);
  });

  it('passes fractional ratios through unrounded', () => {
    expect(pixelRatioFor(1200, 2048)).toBeCloseTo(2048 / 1200, 10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- thumbnails`
Expected: FAIL — `pixelRatioFor` is not exported from `../thumbnails` (the module currently exports only `captureThumbnail` / `getThumbnailUrl`).

- [ ] **Step 3: Refactor thumbnails.ts**

Replace the whole file. The clone/strip/render/toBlob body moves verbatim into `capturePosterJpeg` (parameterized on `targetWidthPx` + `quality`, no in-flight guard of its own); `captureThumbnail` keeps the guard + upload + exact 400px/q0.7 behavior; `captureReviewImage` is the new D11 entry point.

`apps/web/src/data/thumbnails.ts`:

```ts
/**
 * Poster canvas capture + upload.
 *
 * Two capture paths share one DOM body (capturePosterJpeg):
 *   - captureThumbnail — 400px JPEG for the dashboard preview, runs
 *     after autosave (fire-and-forget, never blocks editing).
 *   - captureReviewImage — 2048px-long-edge JPEG + 600s signed URL
 *     for the presentation checker's critique call (D11).
 *
 * Both generate a JPEG of #poster-canvas via html-to-image and upload
 * it to the poster-assets Storage bucket.
 */
import { toCanvas } from 'html-to-image';
import { supabase } from '@/lib/supabase';

const BUCKET = 'poster-assets';
const THUMB_WIDTH = 400; // px target width
const JPEG_QUALITY = 0.7;
const SIGNED_URL_TTL = 3600; // 1 hour

const REVIEW_LONG_EDGE_PX = 2048; // matches the vision ceiling (imageImport.ts downscaleForVision)
const REVIEW_JPEG_QUALITY = 0.85;
const REVIEW_SIGNED_URL_TTL = 600; // 10 minutes — the critique call re-fetches within this window

/** In-flight guard — only one canvas capture at a time (the clone +
 *  html-to-image pass is heavy; autosave thumbs and review captures
 *  must not interleave). Held by the two public entry points. */
let capturing = false;

/** html-to-image pixelRatio that lands the capture width on targetWidthPx. */
export function pixelRatioFor(canvasWidthPx: number, targetWidthPx: number): number {
  return targetWidthPx / canvasWidthPx;
}

/**
 * Capture #poster-canvas to a JPEG blob at the given width/quality.
 * Returns null on any failure (non-blocking). Does NOT take the
 * in-flight guard — the guarded public entry points below do.
 */
export async function capturePosterJpeg(opts: {
  targetWidthPx: number;
  quality: number;
}): Promise<Blob | null> {
  try {
    const el = document.getElementById('poster-canvas');
    if (!el) return null;

    // Clone the element so the live DOM is never visually disrupted
    // (the previous approach mutated the live element's transform,
    // causing visible flicker during autosave).
    //
    // Hiding strategy: wrap the clone in a fixed-position 0×0 div
    // with overflow:hidden. The clone keeps its natural layout
    // coordinates (top-left at 0,0 within the wrapper), so when
    // html-to-image inlines computed styles into its <foreignObject>
    // SVG the children render inside the SVG viewport. Earlier
    // versions used `position: absolute; left: -9999px` which got
    // inlined verbatim and pushed every child outside the SVG
    // viewport — captured output was a blank white image.
    const clone = el.cloneNode(true) as HTMLElement;
    clone.style.transform = 'none';
    clone.style.position = 'relative';
    clone.style.left = '0';
    clone.style.top = '0';

    // Strip editor-only chrome from the clone so the captured
    // image looks like the printed poster, not the live edit
    // surface. Without this, a selected block would appear in the
    // capture with its resize handles, move/delete pills,
    // and accent border baked in.
    //
    // Selectors mirror the data attributes set by:
    //   - resizeHandles.tsx → [data-postr-resize-handle]
    //   - blocks.tsx top handle row, GroupFrame, SelectionRect,
    //     FigureSizeOverlay → [data-postr-selection-ui]
    //   - the grid / ruler overlays → [data-postr-overlay]
    clone
      .querySelectorAll(
        '[data-postr-resize-handle], [data-postr-selection-ui], [data-postr-overlay]',
      )
      .forEach((el) => el.remove());

    // Reset the selected-block border back to its unselected state
    // (1px transparent matches the inline style on non-selected
    // blocks). The block frame is tagged when selected via
    // data-postr-selected so we can find it without re-deriving the
    // selection from React state.
    clone
      .querySelectorAll<HTMLElement>('[data-postr-selected="true"]')
      .forEach((el) => {
        el.style.border = '1px solid transparent';
      });

    const wrapper = document.createElement('div');
    wrapper.style.cssText =
      'position: fixed; top: 0; left: 0; width: 0; height: 0; overflow: hidden; pointer-events: none; opacity: 0;';
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    const canvasWidth = clone.offsetWidth;
    if (canvasWidth === 0) { document.body.removeChild(wrapper); return null; }
    const pixelRatio = pixelRatioFor(canvasWidth, opts.targetWidthPx);

    let canvas: HTMLCanvasElement;
    try {
      canvas = await toCanvas(clone, {
        pixelRatio,
        backgroundColor: '#ffffff',
        skipFonts: true,
      });
    } finally {
      document.body.removeChild(wrapper);
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', opts.quality);
    });

    return blob;
  } catch {
    return null;
  }
}

/**
 * Capture the poster canvas and upload a thumbnail.
 * Returns the storage path on success, null on failure (non-blocking).
 */
export async function captureThumbnail(
  userId: string,
  posterId: string,
): Promise<string | null> {
  if (capturing) return null;
  capturing = true;

  try {
    const blob = await capturePosterJpeg({ targetWidthPx: THUMB_WIDTH, quality: JPEG_QUALITY });
    if (!blob) return null;

    const path = `${userId}/${posterId}/thumbnail.jpg`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      return null;
    }

    return path;
  } catch {
    return null;
  } finally {
    capturing = false;
  }
}

/**
 * Capture the poster at critique resolution and upload it for the
 * presentation checker (D11): 2048px long edge, JPEG q0.85, 600s
 * signed URL. Returns the storage path + signed URL, or null on
 * failure. The poster must be open in the editor (#poster-canvas
 * mounted).
 */
export async function captureReviewImage(
  userId: string,
  posterId: string,
): Promise<{ path: string; signedUrl: string } | null> {
  if (capturing) return null;
  capturing = true;

  try {
    // capturePosterJpeg scales by WIDTH. offsetWidth/offsetHeight are
    // layout sizes — unaffected by the editor's zoom transform — so
    // the live element's aspect ratio matches the clone's. Shrink the
    // width target on portrait posters so the LONG edge lands at
    // 2048px.
    const el = document.getElementById('poster-canvas');
    if (!el) return null;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w === 0 || h === 0) return null;
    const targetWidthPx =
      w >= h ? REVIEW_LONG_EDGE_PX : Math.round((REVIEW_LONG_EDGE_PX * w) / h);

    const blob = await capturePosterJpeg({ targetWidthPx, quality: REVIEW_JPEG_QUALITY });
    if (!blob) return null;

    const path = `${userId}/${posterId}/review-capture.jpg`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (error) return null;

    const { data, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, REVIEW_SIGNED_URL_TTL);
    if (signErr || !data) return null;

    return { path, signedUrl: data.signedUrl };
  } catch {
    return null;
  } finally {
    capturing = false;
  }
}

/**
 * Get a signed URL for a thumbnail path. Returns null if the path
 * is null or the signed URL fails to generate.
 */
export async function getThumbnailUrl(
  thumbnailPath: string | null,
): Promise<string | null> {
  if (!thumbnailPath) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(thumbnailPath, SIGNED_URL_TTL);
  if (error || !data) return null;
  return data.signedUrl;
}
```

- [ ] **Step 4: Run test to verify it passes, then check for regressions**

Run: `npm test --workspace=apps/web -- thumbnails`
Expected: PASS (4 tests).

Then the neighboring data suites (the refactor touched a shared file):

Run: `npm test --workspace=apps/web -- src/data`
Expected: PASS — all existing suites (`posters`, `posterImages`, `posterVersions`, `consent`) plus the new `thumbnails`.

Manual follow-up (house coverage, no unit harness): open a poster in the editor, confirm the dashboard thumbnail still renders after autosave, and capture once via the review entry point in Milestone 5's flow — the captured JPEG must show the poster without selection chrome.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/data/thumbnails.ts apps/web/src/data/__tests__/thumbnails.test.ts
git commit -m "feat(review): extract capturePosterJpeg from thumbnails + add 2048px captureReviewImage (D11)"
```

### Task 20: Ingest types + deterministic guards

**Files:**
- Create: `apps/web/src/review/ingest/types.ts`
- Create: `apps/web/src/review/ingest/guards.ts`
- Test: `apps/web/src/review/ingest/__tests__/guards.test.ts`

**Interfaces:**
- Consumes: `PosterDoc` + `ReviewSourceKind` types from `@postr/shared` (`types/review.ts` lands in Task 9; web imports types freely).
- Produces: `PageImage`, `IngestMeta`, `NormalizedArtifact`, `IngestError`, `IngestErrorKind`, `IngestContext`, `INGEST_MAX_PAGES`, `INGEST_MAX_FILE_BYTES`, `INGEST_ALLOWED_MIME` (types.ts); `assertPageCap(pageCount)`, `assertFileAllowed(file, allowedMime?)`, `isCanvasBlank(imageData)` (guards.ts). Tasks 21, 22, and the Milestone-5 UI consume these verbatim.

- [ ] **Step 1: Write the failing test**

`apps/web/src/review/ingest/__tests__/guards.test.ts`:

```ts
/**
 * Deterministic ingest guards (spec §3) — the pre-model checks that
 * reject bad input with typed errors before any page is rendered,
 * uploaded, or charged for. Exact typed-error kinds and the D15 copy
 * (names the workflow, never "AI") are pinned here.
 */
import { describe, it, expect } from 'vitest';
import {
  IngestError,
  INGEST_ALLOWED_MIME,
  INGEST_MAX_FILE_BYTES,
  INGEST_MAX_PAGES,
} from '../types';
import { assertFileAllowed, assertPageCap, isCanvasBlank } from '../guards';

/** RGBA pixel buffer helper — w×h pixels painted by `paint` (white default). */
function makePixels(
  w: number,
  h: number,
  paint: (x: number, y: number) => [number, number, number] = () => [255, 255, 255],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe('ingest constants (contract with Tasks 21–23)', () => {
  it('pins the page cap, size cap, and MIME allowlist', () => {
    expect(INGEST_MAX_PAGES).toBe(24);
    expect(INGEST_MAX_FILE_BYTES).toBe(50 * 1024 * 1024);
    expect(INGEST_ALLOWED_MIME).toEqual([
      'application/pdf',
      'image/png',
      'image/jpeg',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ]);
  });
});

describe('IngestError', () => {
  it('is an Error with a machine-readable kind', () => {
    const err = new IngestError('msg', 'blank-render');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(IngestError);
    expect(err.name).toBe('IngestError');
    expect(err.kind).toBe('blank-render');
    expect(err.message).toBe('msg');
  });
});

describe('assertPageCap', () => {
  it('accepts exactly INGEST_MAX_PAGES pages', () => {
    expect(() => assertPageCap(INGEST_MAX_PAGES)).not.toThrow();
    expect(() => assertPageCap(1)).not.toThrow();
  });

  it('rejects over the cap with the D15 trim message', () => {
    let caught: unknown;
    try {
      assertPageCap(INGEST_MAX_PAGES + 1);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(IngestError);
    expect((caught as IngestError).kind).toBe('too-many-pages');
    expect((caught as IngestError).message).toBe(
      'That file has 25 pages — the checker reads up to 24. Trim it and try again.',
    );
  });
});

describe('assertFileAllowed', () => {
  it('accepts every allowlisted MIME type', () => {
    for (const type of INGEST_ALLOWED_MIME) {
      expect(() => assertFileAllowed({ size: 1, type })).not.toThrow();
    }
  });

  it('rejects a non-allowlisted MIME type with the unreadable copy', () => {
    let caught: unknown;
    try {
      assertFileAllowed({ size: 1, type: 'image/gif' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(IngestError);
    expect((caught as IngestError).kind).toBe('unsupported-mime');
    expect((caught as IngestError).message).toBe(
      "We couldn't read that file. Try exporting it as a PDF and upload that instead.",
    );
  });

  it('accepts a file at exactly the size cap, rejects one byte over', () => {
    expect(() =>
      assertFileAllowed({ size: INGEST_MAX_FILE_BYTES, type: 'image/png' }),
    ).not.toThrow();
    let caught: unknown;
    try {
      assertFileAllowed({ size: INGEST_MAX_FILE_BYTES + 1, type: 'image/png' });
    } catch (err) {
      caught = err;
    }
    expect((caught as IngestError).kind).toBe('file-too-large');
  });

  it('checks size before MIME (oversized beats unsupported)', () => {
    let caught: unknown;
    try {
      assertFileAllowed({ size: INGEST_MAX_FILE_BYTES + 1, type: 'image/gif' });
    } catch (err) {
      caught = err;
    }
    expect((caught as IngestError).kind).toBe('file-too-large');
  });

  it('honors a caller-narrowed MIME list', () => {
    expect(() =>
      assertFileAllowed({ size: 1024, type: 'image/png' }, ['image/png', 'image/jpeg']),
    ).not.toThrow();
    let caught: unknown;
    try {
      assertFileAllowed({ size: 1, type: 'application/pdf' }, ['image/png', 'image/jpeg']);
    } catch (err) {
      caught = err;
    }
    expect((caught as IngestError).kind).toBe('unsupported-mime');
  });
});

describe('isCanvasBlank', () => {
  it('treats an all-white render as blank', () => {
    expect(isCanvasBlank({ data: makePixels(16, 16) })).toBe(true);
  });

  it('treats any near-uniform color as blank (all-black, flat gray)', () => {
    expect(isCanvasBlank({ data: makePixels(16, 16, () => [0, 0, 0]) })).toBe(true);
    expect(isCanvasBlank({ data: makePixels(16, 16, () => [250, 250, 250]) })).toBe(true);
  });

  it('tolerates JPEG-level noise within the ±8 channel range', () => {
    const noisy = makePixels(16, 16, (x) => [255, 255 - (x % 3), 255 - (x % 2)]);
    expect(isCanvasBlank({ data: noisy })).toBe(true);
  });

  it('flags a single dark pixel as content (stride covers small images)', () => {
    const data = makePixels(16, 16, (x, y) =>
      x === 8 && y === 8 ? [20, 20, 20] : [255, 255, 255],
    );
    expect(isCanvasBlank({ data })).toBe(false);
  });

  it('flags a real gradient as content', () => {
    const gradient = makePixels(64, 4, (x) => [
      Math.round((x / 63) * 250),
      128,
      255 - Math.round((x / 63) * 250),
    ]);
    expect(isCanvasBlank({ data: gradient })).toBe(false);
  });

  it('treats an empty buffer as blank', () => {
    expect(isCanvasBlank({ data: new Uint8ClampedArray(0) })).toBe(true);
  });

  it('treats a large uniform render as blank (sampling stride > 1)', () => {
    expect(isCanvasBlank({ data: makePixels(200, 200) })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- guards`
Expected: FAIL — module `../types` does not exist.

- [ ] **Step 3: Write types.ts + guards.ts**

`apps/web/src/review/ingest/types.ts`:

```ts
/**
 * Presentation Checker ingest contracts (spec §3).
 *
 * Every input (Postr poster / PDF / PPTX / image) normalizes to the
 * same artifact: an ordered array of uploaded page images plus an
 * optional PosterDoc (Postr-native only). Ingest failures throw
 * IngestError with a machine-readable `kind` — the UI maps kinds to
 * user-facing copy, and NO credit is ever consumed on an ingest
 * failure (Global Constraints).
 */
import type { PosterDoc, ReviewSourceKind } from '@postr/shared';

/** One uploaded, signed page image ready for the critique call. */
export interface PageImage {
  pageNumber: number; // 1-based, reading order
  storagePath: string; // poster-assets path ('' for server-owned PPTX pages)
  signedUrl: string;
  widthPx: number;
  heightPx: number;
}

export interface IngestMeta {
  sourceKind: ReviewSourceKind;
  filename?: string;
  pageCount: number;
  ingestedAt: string; // ISO 8601
}

export interface NormalizedArtifact {
  pages: PageImage[];
  posterDoc?: PosterDoc;
  meta: IngestMeta;
}

export type IngestErrorKind =
  | 'too-many-pages'
  | 'unsupported-mime'
  | 'file-too-large'
  | 'unreadable-file'
  | 'blank-render'
  | 'upload-failed'
  | 'server-render-failed';

export class IngestError extends Error {
  constructor(
    message: string,
    public readonly kind: IngestErrorKind,
  ) {
    super(message);
    this.name = 'IngestError';
  }
}

/** Hard page cap (spec §1) — never silently truncate; over → typed error. */
export const INGEST_MAX_PAGES = 24;

/** Largest accepted input — the raw .pptx. Matches the server's REVIEW_PPTX_MAX_BYTES. */
export const INGEST_MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

export const INGEST_ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

/** Per-ingest-run context: who is uploading + which review session's
 *  review-temp/ folder the pages land in. */
export interface IngestContext {
  userId: string;
  sessionId: string;
}
```

`apps/web/src/review/ingest/guards.ts`:

```ts
/**
 * Deterministic pre-model guards (spec §3). Pure + synchronous; every
 * rejection is a typed IngestError so the UI can show the matching
 * message and no credit is consumed. User-facing copy names the
 * workflow ("the checker"), never "AI" (D15).
 */
import {
  IngestError,
  INGEST_ALLOWED_MIME,
  INGEST_MAX_FILE_BYTES,
  INGEST_MAX_PAGES,
} from './types';

/** Page cap — checked BEFORE rendering or uploading anything. */
export function assertPageCap(pageCount: number): void {
  if (pageCount > INGEST_MAX_PAGES) {
    throw new IngestError(
      `That file has ${pageCount} pages — the checker reads up to ${INGEST_MAX_PAGES}. Trim it and try again.`,
      'too-many-pages',
    );
  }
}

/** Size + MIME allowlist — checked before reading the file's bytes. */
export function assertFileAllowed(
  file: { size: number; type: string },
  allowedMime: readonly string[] = INGEST_ALLOWED_MIME,
): void {
  if (file.size > INGEST_MAX_FILE_BYTES) {
    throw new IngestError(
      'That file is over 50 MB — the checker can read files up to 50 MB. Export a smaller copy and try again.',
      'file-too-large',
    );
  }
  if (!allowedMime.includes(file.type)) {
    throw new IngestError(
      "We couldn't read that file. Try exporting it as a PDF and upload that instead.",
      'unsupported-mime',
    );
  }
}

/** Channel range under which a sampled render counts as near-uniform
 *  (blank). 8/255 tolerates JPEG noise on an empty white page. */
const BLANK_CHANNEL_RANGE = 8;
/** Max pixels sampled per blank check — keeps the loop O(1) on 24MP renders. */
const BLANK_SAMPLE_COUNT = 1024;

/**
 * True when the render is near-uniform (all-white, all-black, flat
 * gray) — nothing for the checker to read. Samples up to 1024 pixels
 * evenly across the image and compares the min→max channel range.
 * Structural input: works with ImageData or any { data } RGBA buffer.
 */
export function isCanvasBlank(imageData: { data: Uint8ClampedArray }): boolean {
  const { data } = imageData;
  const totalPixels = Math.floor(data.length / 4);
  if (totalPixels === 0) return true;
  const stride = Math.max(1, Math.floor(totalPixels / BLANK_SAMPLE_COUNT));
  let min = 255;
  let max = 0;
  for (let p = 0; p < totalPixels; p += stride) {
    const i = p * 4;
    for (let c = 0; c < 3; c++) {
      const v = data[i + c]!;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return max - min <= BLANK_CHANNEL_RANGE;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/web -- guards`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/review/ingest/types.ts apps/web/src/review/ingest/guards.ts apps/web/src/review/ingest/__tests__/guards.test.ts
git commit -m "feat(review): ingest types + deterministic guards — page cap, MIME/size, blank-render"
```

### Task 21: `fromImage` + `fromPdf`

**Files:**
- Create: `apps/web/src/review/ingest/uploadReviewPage.ts`
- Create: `apps/web/src/review/ingest/fromImage.ts`
- Create: `apps/web/src/review/ingest/fromPdf.ts`
- Test: `apps/web/src/review/ingest/__tests__/uploadReviewPage.test.ts`
- Test: `apps/web/src/review/ingest/__tests__/fromImage.test.ts`
- Test: `apps/web/src/review/ingest/__tests__/fromPdf.test.ts`

**Interfaces:**
- Consumes: types + guards (Task 20); `rasterizeImage`, `downscaleForVision` (2048px ceiling), `canvasToBlob`, `releaseCanvas` from `@/import/imageImport` (seams: `imageImport.ts:156,604-689`); `pdfjs-dist` with the worker-`?url` idiom (seam: `pdfImport.ts:49-56`; vitest alias stub `vite.config.ts:67-78`); `supabase` storage (seam: `posterImages.ts` conventions).
- Produces: `uploadReviewPage(userId, sessionId, pageNumber, blob, dims): Promise<PageImage>`; `fromImage(file, ctx): Promise<NormalizedArtifact>`; `fromPdf(file, ctx): Promise<NormalizedArtifact>`. Task 22 consumes all three.

**Note (spec §1 / §3):** `fromPdf` deliberately lifts the single-page restriction of `pdfImport.ts:144-149` — a talk PDF is multi-page by nature, and the checker accepts up to `INGEST_MAX_PAGES`. This layer does **not** reuse `extractFromPdf`: that path clusters a text layer into `PosterDoc` blocks, while the checker needs page *images*, not blocks.

`uploadReviewPage`'s signature carries a 5th `dims` argument beyond the sketch in the milestone breakdown — `PageImage.widthPx/heightPx` must describe the uploaded (post-downscale) image, and only the caller knows those pixels.

- [ ] **Step 1: Write the failing uploadReviewPage test**

`apps/web/src/review/ingest/__tests__/uploadReviewPage.test.ts`:

```ts
/**
 * uploadReviewPage: poster-assets upload + 600s signed URL, typed
 * IngestError on failure. Supabase is mocked (the singleton throws at
 * module load without env vars — lib/supabase.ts:14-18).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUpload, mockCreateSignedUrl } = vi.hoisted(() => ({
  mockUpload: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: mockUpload,
        createSignedUrl: mockCreateSignedUrl,
      }),
    },
  },
}));

import { uploadReviewPage } from '../uploadReviewPage';

beforeEach(() => {
  vi.clearAllMocks();
  mockUpload.mockResolvedValue({ error: null });
  mockCreateSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://signed/page-3' },
    error: null,
  });
});

describe('uploadReviewPage', () => {
  it('uploads to the review-temp path and returns the signed PageImage', async () => {
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' });

    const page = await uploadReviewPage('u1', 'sess-1', 3, blob, {
      widthPx: 1755,
      heightPx: 2048,
    });

    expect(mockUpload).toHaveBeenCalledWith(
      'u1/review-temp/sess-1/page-3.jpg',
      blob,
      { contentType: 'image/jpeg', upsert: true },
    );
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(
      'u1/review-temp/sess-1/page-3.jpg',
      600,
    );
    expect(page).toEqual({
      pageNumber: 3,
      storagePath: 'u1/review-temp/sess-1/page-3.jpg',
      signedUrl: 'https://signed/page-3',
      widthPx: 1755,
      heightPx: 2048,
    });
  });

  it('throws upload-failed when the upload errors', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'gateway 504' } });
    await expect(
      uploadReviewPage('u1', 'sess-1', 1, new Blob(['x']), { widthPx: 1, heightPx: 1 }),
    ).rejects.toMatchObject({ name: 'IngestError', kind: 'upload-failed' });
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it('throws upload-failed when signing fails', async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: 'nope' } });
    await expect(
      uploadReviewPage('u1', 'sess-1', 1, new Blob(['x']), { widthPx: 1, heightPx: 1 }),
    ).rejects.toMatchObject({ name: 'IngestError', kind: 'upload-failed' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- uploadReviewPage`
Expected: FAIL — module `../uploadReviewPage` does not exist.

- [ ] **Step 3: Implement uploadReviewPage**

`apps/web/src/review/ingest/uploadReviewPage.ts`:

```ts
/**
 * Upload one rendered review page to the poster-assets bucket and
 * mint the short-lived signed URL the critique call re-fetches
 * through. Mirrors the posterImages.ts storage conventions (upsert +
 * contentType, supabase-js error objects) but throws the ingest
 * layer's typed IngestError instead of returning null — spec §3:
 * ingest failures are typed errors, never silent nulls.
 *
 * Pages live under {userId}/review-temp/{sessionId}/ so concurrent
 * ingests never collide; the UI deletes the folder after the critique
 * completes (Milestone 5).
 */
import { supabase } from '@/lib/supabase';
import { IngestError, type PageImage } from './types';

const BUCKET = 'poster-assets';
const SIGNED_URL_TTL_SEC = 600; // 10 minutes — the critique call fetches within this window

export async function uploadReviewPage(
  userId: string,
  sessionId: string,
  pageNumber: number,
  blob: Blob,
  dims: { widthPx: number; heightPx: number },
): Promise<PageImage> {
  const storagePath = `${userId}/review-temp/${sessionId}/page-${pageNumber}.jpg`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (error) {
    throw new IngestError(
      "The upload didn't complete — check your connection and try again.",
      'upload-failed',
    );
  }

  const { data, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);
  if (signErr || !data?.signedUrl) {
    throw new IngestError(
      "The upload didn't complete — check your connection and try again.",
      'upload-failed',
    );
  }

  return {
    pageNumber,
    storagePath,
    signedUrl: data.signedUrl,
    widthPx: dims.widthPx,
    heightPx: dims.heightPx,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/web -- uploadReviewPage`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing fromImage test**

`apps/web/src/review/ingest/__tests__/fromImage.test.ts`:

```ts
/**
 * fromImage: validate → rasterize → downscale → blank check → upload.
 * Canvas + storage seams are module mocks (jsdom has no 2D canvas);
 * the guards themselves are covered in guards.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockRasterizeImage,
  mockDownscale,
  mockCanvasToBlob,
  mockReleaseCanvas,
  mockUploadReviewPage,
} = vi.hoisted(() => ({
  mockRasterizeImage: vi.fn(),
  mockDownscale: vi.fn(),
  mockCanvasToBlob: vi.fn(),
  mockReleaseCanvas: vi.fn(),
  mockUploadReviewPage: vi.fn(),
}));

vi.mock('@/import/imageImport', () => ({
  rasterizeImage: mockRasterizeImage,
  downscaleForVision: mockDownscale,
  canvasToBlob: mockCanvasToBlob,
  releaseCanvas: mockReleaseCanvas,
}));

vi.mock('../uploadReviewPage', () => ({
  uploadReviewPage: mockUploadReviewPage,
}));

import { fromImage } from '../fromImage';
import { IngestError, type PageImage } from '../types';

const CTX = { userId: 'u1', sessionId: 'sess-1' };

/** Fake canvas feeding `data` to getImageData — plain object, since
 *  jsdom's HTMLCanvasElement has no working 2D context. */
function fakeCanvas(data: Uint8ClampedArray, widthPx = 100, heightPx = 50): HTMLCanvasElement {
  return {
    width: widthPx,
    height: heightPx,
    getContext: () => ({
      getImageData: () => ({ data }),
    }),
  } as unknown as HTMLCanvasElement;
}

const NON_BLANK = new Uint8ClampedArray([
  255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255,
]); // 2×2, one dark pixel
const ALL_WHITE = new Uint8ClampedArray(2 * 2 * 4).fill(255);

function uploadedPage(pageNumber: number): PageImage {
  return {
    pageNumber,
    storagePath: `u1/review-temp/sess-1/page-${pageNumber}.jpg`,
    signedUrl: `https://signed/page-${pageNumber}`,
    widthPx: 100,
    heightPx: 50,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDownscale.mockImplementation((c: HTMLCanvasElement) => c); // identity
  mockCanvasToBlob.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
  mockUploadReviewPage.mockImplementation(
    async (_u: string, _s: string, pageNumber: number) => uploadedPage(pageNumber),
  );
});

describe('fromImage', () => {
  it('normalizes a PNG to a single-page artifact', async () => {
    mockRasterizeImage.mockResolvedValue({
      canvas: fakeCanvas(NON_BLANK),
      pageWidthPt: 288,
      pageHeightPt: 144,
    });
    const file = new File(['png-bytes'], 'poster.png', { type: 'image/png' });

    const artifact = await fromImage(file, CTX);

    expect(artifact.pages).toEqual([uploadedPage(1)]);
    expect(artifact.posterDoc).toBeUndefined();
    expect(artifact.meta).toMatchObject({
      sourceKind: 'image',
      filename: 'poster.png',
      pageCount: 1,
    });
    expect(typeof artifact.meta.ingestedAt).toBe('string');
    expect(mockUploadReviewPage).toHaveBeenCalledWith(
      'u1',
      'sess-1',
      1,
      expect.any(Blob),
      { widthPx: 100, heightPx: 50 },
    );
  });

  it('rejects a non-image MIME type before reading bytes', async () => {
    const file = new File(['x'], 'deck.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    await expect(fromImage(file, CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'unsupported-mime',
    });
    expect(mockRasterizeImage).not.toHaveBeenCalled();
  });

  it('maps a corrupt image to unreadable-file with the D15 copy', async () => {
    mockRasterizeImage.mockRejectedValue(new Error('Image has no dimensions'));
    const file = new File(['garbage'], 'broken.png', { type: 'image/png' });

    let caught: unknown;
    try {
      await fromImage(file, CTX);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(IngestError);
    expect((caught as IngestError).kind).toBe('unreadable-file');
    expect((caught as IngestError).message).toBe(
      "We couldn't read that file. Try exporting it as a PDF and upload that instead.",
    );
  });

  it('rejects a blank render without uploading', async () => {
    mockRasterizeImage.mockResolvedValue({
      canvas: fakeCanvas(ALL_WHITE),
      pageWidthPt: 288,
      pageHeightPt: 144,
    });
    const file = new File(['png-bytes'], 'blank.png', { type: 'image/png' });

    await expect(fromImage(file, CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'blank-render',
    });
    expect(mockUploadReviewPage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- fromImage`
Expected: FAIL — module `../fromImage` does not exist.

- [ ] **Step 7: Implement fromImage**

`apps/web/src/review/ingest/fromImage.ts`:

```ts
/**
 * PNG/JPG ingest (spec §3): validate → rasterize → downscale to the
 * vision ceiling → blank check → upload. Single page, client-side,
 * zero backend. Reuses the Tier-1 import raster helpers
 * (imageImport.ts) — rasterizeImage rejects corrupt/0-dimension
 * images, downscaleForVision caps the long edge at 2048px (the
 * resolution-ceiling guard).
 */
import {
  canvasToBlob,
  downscaleForVision,
  rasterizeImage,
  releaseCanvas,
} from '@/import/imageImport';
import { assertFileAllowed, isCanvasBlank } from './guards';
import { IngestError, type IngestContext, type NormalizedArtifact } from './types';
import { uploadReviewPage } from './uploadReviewPage';

const IMAGE_MIME = ['image/png', 'image/jpeg'] as const;
const JPEG_QUALITY = 0.85;
const UNREADABLE_COPY =
  "We couldn't read that file. Try exporting it as a PDF and upload that instead.";

export async function fromImage(
  file: File,
  ctx: IngestContext,
): Promise<NormalizedArtifact> {
  assertFileAllowed(file, IMAGE_MIME);

  let canvas: HTMLCanvasElement;
  try {
    ({ canvas } = await rasterizeImage(file));
  } catch {
    throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
  }

  const scaled = downscaleForVision(canvas);
  try {
    const ctx2d = scaled.getContext('2d');
    if (!ctx2d) {
      throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
    }
    if (isCanvasBlank(ctx2d.getImageData(0, 0, scaled.width, scaled.height))) {
      throw new IngestError(
        'That image looks blank — the checker needs something to read. Check the file and try again.',
        'blank-render',
      );
    }

    const dims = { widthPx: scaled.width, heightPx: scaled.height };
    const blob = await canvasToBlob(scaled, 'image/jpeg', JPEG_QUALITY);
    if (!blob) {
      throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
    }

    const page = await uploadReviewPage(ctx.userId, ctx.sessionId, 1, blob, dims);
    return {
      pages: [page],
      meta: {
        sourceKind: 'image',
        filename: file.name,
        pageCount: 1,
        ingestedAt: new Date().toISOString(),
      },
    };
  } finally {
    releaseCanvas(canvas);
    if (scaled !== canvas) releaseCanvas(scaled);
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test --workspace=apps/web -- fromImage`
Expected: PASS (4 tests).

- [ ] **Step 9: Write the failing fromPdf test**

`apps/web/src/review/ingest/__tests__/fromPdf.test.ts`:

```ts
/**
 * fromPdf: the multi-page PDF path. Deliberately lifts the single-page
 * restriction of pdfImport.ts:144-149 — the checker renders EVERY
 * page (capped at INGEST_MAX_PAGES, asserted BEFORE any page renders,
 * never silently truncated).
 *
 * pdfjs, the canvas helpers, and the upload helper are module mocks —
 * jsdom has no 2D canvas, and the house pattern covers real render
 * paths manually (see pdfImport.test.ts header).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockGetDocument,
  mockDownscale,
  mockCanvasToBlob,
  mockReleaseCanvas,
  mockUploadReviewPage,
} = vi.hoisted(() => ({
  mockGetDocument: vi.fn(),
  mockDownscale: vi.fn(),
  mockCanvasToBlob: vi.fn(),
  mockReleaseCanvas: vi.fn(),
  mockUploadReviewPage: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: mockGetDocument,
}));

vi.mock('@/import/imageImport', () => ({
  downscaleForVision: mockDownscale,
  canvasToBlob: mockCanvasToBlob,
  releaseCanvas: mockReleaseCanvas,
}));

vi.mock('../uploadReviewPage', () => ({
  uploadReviewPage: mockUploadReviewPage,
}));

import { fromPdf } from '../fromPdf';
import type { PageImage } from '../types';

const CTX = { userId: 'u1', sessionId: 'sess-1' };

interface FakePage {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: ReturnType<typeof vi.fn>;
}

/** A fake pdfjs page: 612×792pt (letter) at scale 1; render resolves immediately. */
function fakePdfPage(): FakePage {
  return {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 612 * scale,
      height: 792 * scale,
    }),
    render: vi.fn(() => ({ promise: Promise.resolve() })),
  };
}

function fakePdfDoc(numPages: number, pages: FakePage[]) {
  return {
    numPages,
    getPage: vi.fn(async (n: number) => pages[n - 1]!),
    destroy: vi.fn(async () => {}),
  };
}

/** Fake canvas; getContext returns a 2d-ish object feeding `data` to getImageData. */
function fakeCanvas(data: Uint8ClampedArray): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    getContext: () => ({
      getImageData: () => ({ data }),
    }),
  } as unknown as HTMLCanvasElement;
}

const NON_BLANK = new Uint8ClampedArray([
  255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255,
]);
const ALL_WHITE = new Uint8ClampedArray(2 * 2 * 4).fill(255);

let canvases: HTMLCanvasElement[];
let createElementSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  canvases = [];
  // fromPdf creates its render targets via document.createElement —
  // hand out the fake canvases in page order.
  const realCreateElement = document.createElement.bind(document);
  createElementSpy = vi
    .spyOn(document, 'createElement')
    .mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      if (tagName === 'canvas') {
        const c = canvases.shift();
        if (!c) throw new Error('test ran out of fake canvases');
        return c;
      }
      return realCreateElement(tagName, options);
    }) as typeof document.createElement);
  mockDownscale.mockImplementation((c: HTMLCanvasElement) => c); // identity
  mockCanvasToBlob.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
  mockUploadReviewPage.mockImplementation(
    async (
      u: string,
      s: string,
      pageNumber: number,
      _b: Blob,
      dims: { widthPx: number; heightPx: number },
    ): Promise<PageImage> => ({
      pageNumber,
      storagePath: `${u}/review-temp/${s}/page-${pageNumber}.jpg`,
      signedUrl: `https://signed/page-${pageNumber}`,
      ...dims,
    }),
  );
});

afterEach(() => {
  createElementSpy.mockRestore();
});

describe('fromPdf', () => {
  it('rejects a 30-page PDF before rendering any page', async () => {
    const pages = Array.from({ length: 30 }, () => fakePdfPage());
    const doc = fakePdfDoc(30, pages);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) });
    const file = new File(['pdf-bytes'], 'talk.pdf', { type: 'application/pdf' });

    let caught: unknown;
    try {
      await fromPdf(file, CTX);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ name: 'IngestError', kind: 'too-many-pages' });
    expect((caught as Error).message).toBe(
      'That file has 30 pages — the checker reads up to 24. Trim it and try again.',
    );
    expect(doc.getPage).not.toHaveBeenCalled();
    for (const p of pages) expect(p.render).not.toHaveBeenCalled();
    expect(mockCanvasToBlob).not.toHaveBeenCalled();
    expect(mockUploadReviewPage).not.toHaveBeenCalled();
    expect(doc.destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects a page that renders blank', async () => {
    const doc = fakePdfDoc(1, [fakePdfPage()]);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) });
    canvases = [fakeCanvas(ALL_WHITE)];
    const file = new File(['pdf-bytes'], 'blank.pdf', { type: 'application/pdf' });

    await expect(fromPdf(file, CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'blank-render',
    });
    expect(mockUploadReviewPage).not.toHaveBeenCalled();
    expect(doc.destroy).toHaveBeenCalledTimes(1);
  });

  it('normalizes a 2-page PDF in reading order', async () => {
    const pages = [fakePdfPage(), fakePdfPage()];
    const doc = fakePdfDoc(2, pages);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) });
    canvases = [fakeCanvas(NON_BLANK), fakeCanvas(NON_BLANK)];
    const file = new File(['pdf-bytes'], 'poster.pdf', { type: 'application/pdf' });

    const artifact = await fromPdf(file, CTX);

    expect(artifact.meta).toMatchObject({
      sourceKind: 'pdf',
      filename: 'poster.pdf',
      pageCount: 2,
    });
    expect(artifact.pages.map((p) => p.pageNumber)).toEqual([1, 2]);
    expect(artifact.pages.map((p) => p.storagePath)).toEqual([
      'u1/review-temp/sess-1/page-1.jpg',
      'u1/review-temp/sess-1/page-2.jpg',
    ]);
    expect(pages[0]!.render).toHaveBeenCalledTimes(1);
    expect(pages[1]!.render).toHaveBeenCalledTimes(1);
    expect(mockUploadReviewPage).toHaveBeenCalledTimes(2);
    expect(doc.destroy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- fromPdf`
Expected: FAIL — module `../fromPdf` does not exist.

- [ ] **Step 11: Implement fromPdf**

`apps/web/src/review/ingest/fromPdf.ts`:

```ts
/**
 * PDF ingest (spec §3): pdf.js renders EVERY page to a canvas at
 * scale 2 → downscale to the vision ceiling → blank check → JPEG →
 * upload. Client-side, zero backend.
 *
 * This layer deliberately lifts the single-page restriction of the
 * Tier-0 poster import (pdfImport.ts:144-149 rejects numPages > 1):
 * a talk PDF is SUPPOSED to be multi-page, and the checker accepts up
 * to INGEST_MAX_PAGES. It does NOT reuse extractFromPdf — that path
 * clusters a text layer into PosterDoc blocks; the checker only needs
 * page images. The page cap is asserted from pdf.numPages BEFORE any
 * page renders (never silently truncate, spec §1).
 */
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — the `?url` import shape is provided by Vite at build time.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import {
  canvasToBlob,
  downscaleForVision,
  releaseCanvas,
} from '@/import/imageImport';
import { assertFileAllowed, assertPageCap, isCanvasBlank } from './guards';
import {
  IngestError,
  type IngestContext,
  type NormalizedArtifact,
  type PageImage,
} from './types';
import { uploadReviewPage } from './uploadReviewPage';

// pdfjs needs a worker URL. Vite resolves this with `?url`; the vitest
// alias maps it to a stub (vite.config.ts test.alias). Same setup as
// pdfImport.ts:49-56 — harmless if that module already set it.
if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl as string;
}

const RENDER_SCALE = 2; // same rasterize idiom as imageImport.ts:623-631
const JPEG_QUALITY = 0.85;
const UNREADABLE_COPY =
  "We couldn't read that file. Try exporting it as a PDF and upload that instead.";

export async function fromPdf(
  file: File,
  ctx: IngestContext,
): Promise<NormalizedArtifact> {
  assertFileAllowed(file, ['application/pdf']);

  const buf = await file.arrayBuffer();
  let pdf: PDFDocumentProxy;
  try {
    pdf = await pdfjs.getDocument({ data: buf }).promise;
  } catch {
    throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
  }

  try {
    // Page cap BEFORE rendering a single page.
    assertPageCap(pdf.numPages);

    const pages: PageImage[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const pdfPage = await pdf.getPage(n);
      const viewport = pdfPage.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const renderCtx = canvas.getContext('2d');
      if (!renderCtx) {
        throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
      }
      await pdfPage.render({ canvasContext: renderCtx, viewport }).promise;

      const scaled = downscaleForVision(canvas);
      try {
        const scaledCtx = scaled.getContext('2d');
        if (!scaledCtx) {
          throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
        }
        if (isCanvasBlank(scaledCtx.getImageData(0, 0, scaled.width, scaled.height))) {
          throw new IngestError(
            `Page ${n} of that PDF looks blank — the checker needs something to read. Check the file and try again.`,
            'blank-render',
          );
        }

        const dims = { widthPx: scaled.width, heightPx: scaled.height };
        const blob = await canvasToBlob(scaled, 'image/jpeg', JPEG_QUALITY);
        if (!blob) {
          throw new IngestError(UNREADABLE_COPY, 'unreadable-file');
        }

        pages.push(await uploadReviewPage(ctx.userId, ctx.sessionId, n, blob, dims));
      } finally {
        releaseCanvas(canvas);
        if (scaled !== canvas) releaseCanvas(scaled);
      }
    }

    return {
      pages,
      meta: {
        sourceKind: 'pdf',
        filename: file.name,
        pageCount: pdf.numPages,
        ingestedAt: new Date().toISOString(),
      },
    };
  } finally {
    // Always release the worker-side document — otherwise each ingest
    // leaks its transport + page buffers until the tab reloads.
    void pdf.destroy();
  }
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npm test --workspace=apps/web -- fromPdf`
Expected: PASS (3 tests).

- [ ] **Step 13: Commit**

```bash
git add apps/web/src/review/ingest/uploadReviewPage.ts apps/web/src/review/ingest/fromImage.ts apps/web/src/review/ingest/fromPdf.ts apps/web/src/review/ingest/__tests__/uploadReviewPage.test.ts apps/web/src/review/ingest/__tests__/fromImage.test.ts apps/web/src/review/ingest/__tests__/fromPdf.test.ts
git commit -m "feat(review): image + multi-page PDF ingest with review-temp page uploads"
```

### Task 22: `fromPoster` + `fromPptx` + `normalizeInput`

**Files:**
- Create: `apps/web/src/review/ingest/fromPoster.ts`
- Create: `apps/web/src/review/ingest/fromPptx.ts`
- Create: `apps/web/src/review/ingest/normalizeInput.ts`
- Create: `apps/web/src/review/ingest/index.ts` (UI barrel)
- Test: `apps/web/src/review/ingest/__tests__/fromPoster.test.ts`
- Test: `apps/web/src/review/ingest/__tests__/fromPptx.test.ts`
- Test: `apps/web/src/review/ingest/__tests__/normalizeInput.test.ts`
- Test: `apps/web/src/review/ingest/__tests__/index.test.ts`

**Interfaces:**
- Consumes: `captureReviewImage` (Task 19); types + guards (Task 20); `fromImage` / `fromPdf` (Task 21); `postJson` + `ApiError` from `@/lib/apiClient` (seam: `apiClient.ts:12-25,49-114`); `ensureSession` (`@/lib/auth`) + `supabase` (`@/lib/supabase`) for the barrel's context resolution; `ReviewPageRef` type from `@postr/shared` (Task 9); the `/api/review/render-pptx` route (Task 18 — D10: body `{ fileUrl }` → `{ pages: ReviewPageRef[] }`, page cap enforced server-side as `{ error: 'too_many_pages' }`).
- Produces: `reviewPixelDims(doc): { widthPx; heightPx }`; `fromPoster(doc, { userId, posterId }): Promise<NormalizedArtifact>`; `fromPptx(file, ctx): Promise<NormalizedArtifact>`; `ReviewInput` type; `normalizeInput(input, ctx): Promise<NormalizedArtifact>` — the internal dispatcher; the `@/review/ingest` barrel `ingestFileForReview(file: File): Promise<NormalizedArtifact>` and `ingestPosterForReview(input: { doc: PosterDoc; posterId: string }): Promise<NormalizedArtifact>` — the entry points the Milestone-5 UI calls (context resolution included, so components never build `IngestContext` themselves).

Two wiring notes: `fromPoster` only works with the poster open in the editor (`#poster-canvas` mounted) — the UI offers the postr-kind input only from the editor surface. The live PPTX path needs Task 18's route + its soffice/pdftoppm ops setup (D10: Docker-based service or hosted-convert swap behind `PptxRenderer`); this task's tests mock the route, so it neither blocks nor is blocked by the other inputs.

- [ ] **Step 1: Write the failing fromPoster test**

`apps/web/src/review/ingest/__tests__/fromPoster.test.ts`:

```ts
/**
 * fromPoster: captureReviewImage (Task 19) → single-page artifact with
 * the PosterDoc attached. The DOM capture itself is manual-verified
 * (thumbnails.test.ts header); this pins the artifact mapping + the
 * long-edge pixel math.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PosterDoc } from '@postr/shared';

const { mockCaptureReviewImage } = vi.hoisted(() => ({
  mockCaptureReviewImage: vi.fn(),
}));

vi.mock('@/data/thumbnails', () => ({
  captureReviewImage: mockCaptureReviewImage,
}));

import { fromPoster, reviewPixelDims } from '../fromPoster';

const CTX = { userId: 'u1', posterId: 'p1' };

/** Minimal PosterDoc stand-in — fromPoster only reads widthIn/heightIn
 *  and passes the doc through. */
function fakeDoc(widthIn: number, heightIn: number): PosterDoc {
  return { widthIn, heightIn } as PosterDoc;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCaptureReviewImage.mockResolvedValue({
    path: 'u1/p1/review-capture.jpg',
    signedUrl: 'https://signed/review-capture',
  });
});

describe('reviewPixelDims', () => {
  it('lands the long edge at 2048px for landscape posters', () => {
    expect(reviewPixelDims({ widthIn: 48, heightIn: 36 })).toEqual({
      widthPx: 2048,
      heightPx: 1536,
    });
  });

  it('lands the long edge at 2048px for portrait posters', () => {
    expect(reviewPixelDims({ widthIn: 36, heightIn: 48 })).toEqual({
      widthPx: 1536,
      heightPx: 2048,
    });
  });

  it('handles square posters', () => {
    expect(reviewPixelDims({ widthIn: 40, heightIn: 40 })).toEqual({
      widthPx: 2048,
      heightPx: 2048,
    });
  });
});

describe('fromPoster', () => {
  it('normalizes the capture to a single-page artifact with the PosterDoc', async () => {
    const doc = fakeDoc(48, 36);

    const artifact = await fromPoster(doc, CTX);

    expect(mockCaptureReviewImage).toHaveBeenCalledWith('u1', 'p1');
    expect(artifact.pages).toEqual([
      {
        pageNumber: 1,
        storagePath: 'u1/p1/review-capture.jpg',
        signedUrl: 'https://signed/review-capture',
        widthPx: 2048,
        heightPx: 1536,
      },
    ]);
    expect(artifact.posterDoc).toBe(doc);
    expect(artifact.meta).toMatchObject({ sourceKind: 'postr', pageCount: 1 });
    expect(typeof artifact.meta.ingestedAt).toBe('string');
  });

  it('throws unreadable-file when the capture fails', async () => {
    mockCaptureReviewImage.mockResolvedValue(null);
    await expect(fromPoster(fakeDoc(48, 36), CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'unreadable-file',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- fromPoster`
Expected: FAIL — module `../fromPoster` does not exist.

- [ ] **Step 3: Implement fromPoster**

`apps/web/src/review/ingest/fromPoster.ts`:

```ts
/**
 * Postr-native ingest (spec §3): re-capture the open poster at
 * critique resolution (D11) and ship the PosterDoc alongside the page
 * image — the doc powers block-anchored findings and the
 * deterministic grounding signals downstream (§4.4).
 */
import type { PosterDoc } from '@postr/shared';
import { captureReviewImage } from '@/data/thumbnails';
import { IngestError, type NormalizedArtifact, type PageImage } from './types';

/** captureReviewImage lands the long edge at 2048px (D11). */
const REVIEW_LONG_EDGE_PX = 2048;

/** Pixel dims of the captured review image, derived from the doc's
 *  aspect ratio — matches captureReviewImage's long-edge targeting. */
export function reviewPixelDims(doc: {
  widthIn: number;
  heightIn: number;
}): { widthPx: number; heightPx: number } {
  const scale = REVIEW_LONG_EDGE_PX / Math.max(doc.widthIn, doc.heightIn);
  return {
    widthPx: Math.round(doc.widthIn * scale),
    heightPx: Math.round(doc.heightIn * scale),
  };
}

export async function fromPoster(
  doc: PosterDoc,
  ctx: { userId: string; posterId: string },
): Promise<NormalizedArtifact> {
  const capture = await captureReviewImage(ctx.userId, ctx.posterId);
  if (!capture) {
    throw new IngestError(
      "We couldn't capture the poster — reopen it in the editor and try again.",
      'unreadable-file',
    );
  }

  const page: PageImage = {
    pageNumber: 1,
    storagePath: capture.path,
    signedUrl: capture.signedUrl,
    ...reviewPixelDims(doc),
  };
  return {
    pages: [page],
    posterDoc: doc,
    meta: {
      sourceKind: 'postr',
      pageCount: 1,
      ingestedAt: new Date().toISOString(),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/web -- fromPoster`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing fromPptx test**

`apps/web/src/review/ingest/__tests__/fromPptx.test.ts`:

```ts
/**
 * fromPptx: raw upload → signed URL → /api/review/render-pptx → pages.
 * Supabase and the API client are mocked; the real ApiError class is
 * kept (importOriginal) so the instanceof error mapping is exercised
 * for real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPostJson, mockUpload, mockCreateSignedUrl, mockRemove } = vi.hoisted(() => ({
  mockPostJson: vi.fn(),
  mockUpload: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
  mockRemove: vi.fn(),
}));

vi.mock('@/lib/apiClient', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  postJson: mockPostJson,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: mockUpload,
        createSignedUrl: mockCreateSignedUrl,
        remove: mockRemove,
      }),
    },
  },
}));

import { ApiError } from '@/lib/apiClient';
import { fromPptx } from '../fromPptx';

const CTX = { userId: 'u1', sessionId: 'sess-1' };
const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

function pptxFile(name = 'deck.pptx'): File {
  return new File(['pptx-bytes'], name, { type: PPTX_MIME });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpload.mockResolvedValue({ error: null });
  mockCreateSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://signed/raw-pptx' },
    error: null,
  });
  mockRemove.mockResolvedValue({ data: null, error: null });
});

describe('fromPptx', () => {
  it('round-trips the raw file and normalizes the rendered pages', async () => {
    mockPostJson.mockResolvedValue({
      pages: [
        { pageNumber: 1, url: 'https://signed/p1', widthPx: 1280, heightPx: 720 },
        { pageNumber: 2, url: 'https://signed/p2', widthPx: 1280, heightPx: 720 },
      ],
    });

    const artifact = await fromPptx(pptxFile(), CTX);

    expect(mockUpload).toHaveBeenCalledWith(
      'u1/review-temp/sess-1/source.pptx',
      expect.any(File),
      { contentType: PPTX_MIME, upsert: true },
    );
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(
      'u1/review-temp/sess-1/source.pptx',
      600,
    );
    expect(mockPostJson).toHaveBeenCalledWith(
      '/api/review/render-pptx',
      { fileUrl: 'https://signed/raw-pptx' },
      { auth: true },
    );
    expect(artifact.pages).toEqual([
      { pageNumber: 1, storagePath: '', signedUrl: 'https://signed/p1', widthPx: 1280, heightPx: 720 },
      { pageNumber: 2, storagePath: '', signedUrl: 'https://signed/p2', widthPx: 1280, heightPx: 720 },
    ]);
    expect(artifact.meta).toMatchObject({
      sourceKind: 'pptx',
      filename: 'deck.pptx',
      pageCount: 2,
    });
    expect(mockRemove).toHaveBeenCalledWith(['u1/review-temp/sess-1/source.pptx']);
  });

  it("maps the route's too_many_pages body to too-many-pages", async () => {
    mockPostJson.mockRejectedValue(
      new ApiError('too_many_pages', 400, { error: 'too_many_pages' }),
    );

    let caught: unknown;
    try {
      await fromPptx(pptxFile(), CTX);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ name: 'IngestError', kind: 'too-many-pages' });
    expect((caught as Error).message).toBe(
      'That deck has too many slides — the checker reads up to 24. Trim it and try again.',
    );
    expect(mockRemove).toHaveBeenCalledWith(['u1/review-temp/sess-1/source.pptx']);
  });

  it('maps any other ApiError to server-render-failed with the D15 copy', async () => {
    mockPostJson.mockRejectedValue(
      new ApiError('render_failed', 502, { error: 'render_failed' }),
    );

    let caught: unknown;
    try {
      await fromPptx(pptxFile(), CTX);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ name: 'IngestError', kind: 'server-render-failed' });
    expect((caught as Error).message).toBe(
      "We couldn't read that file. Try exporting it as a PDF and upload that instead.",
    );
  });

  it('rethrows non-ApiError rejections untouched', async () => {
    const boom = new TypeError('network down');
    mockPostJson.mockRejectedValue(boom);
    await expect(fromPptx(pptxFile(), CTX)).rejects.toBe(boom);
  });

  it('rejects a non-PPTX MIME type before uploading', async () => {
    const file = new File(['x'], 'poster.pdf', { type: 'application/pdf' });
    await expect(fromPptx(file, CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'unsupported-mime',
    });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('throws upload-failed when the raw upload errors', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'gateway 504' } });
    await expect(fromPptx(pptxFile(), CTX)).rejects.toMatchObject({
      name: 'IngestError',
      kind: 'upload-failed',
    });
    expect(mockPostJson).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- fromPptx`
Expected: FAIL — module `../fromPptx` does not exist.

- [ ] **Step 7: Implement fromPptx**

`apps/web/src/review/ingest/fromPptx.ts`:

```ts
/**
 * PPTX ingest (spec §3, D10): the browser has no faithful PPTX
 * renderer, so the raw .pptx round-trips through Storage to the
 * server route /api/review/render-pptx (LibreOffice → PDF → page
 * JPEGs). The route returns short-lived signed page URLs; the raw
 * upload is removed best-effort afterwards (same temp-cleanup idiom
 * as imageImport.ts:365). The route enforces the page cap server-side
 * and reports it as { error: 'too_many_pages' } — mapped to the
 * ingest layer's typed error here.
 */
import type { ReviewPageRef } from '@postr/shared';
import { supabase } from '@/lib/supabase';
import { ApiError, postJson } from '@/lib/apiClient';
import { assertFileAllowed } from './guards';
import {
  IngestError,
  INGEST_MAX_PAGES,
  type IngestContext,
  type NormalizedArtifact,
  type PageImage,
} from './types';

const BUCKET = 'poster-assets';
const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const SIGNED_URL_TTL_SEC = 600;

export async function fromPptx(
  file: File,
  ctx: IngestContext,
): Promise<NormalizedArtifact> {
  assertFileAllowed(file, [PPTX_MIME]);

  const rawPath = `${ctx.userId}/review-temp/${ctx.sessionId}/source.pptx`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(rawPath, file, { contentType: PPTX_MIME, upsert: true });
  if (error) {
    throw new IngestError(
      "The upload didn't complete — check your connection and try again.",
      'upload-failed',
    );
  }

  const { data, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(rawPath, SIGNED_URL_TTL_SEC);
  if (signErr || !data?.signedUrl) {
    throw new IngestError(
      "The upload didn't complete — check your connection and try again.",
      'upload-failed',
    );
  }

  try {
    const { pages } = await postJson<{ pages: ReviewPageRef[] }>(
      '/api/review/render-pptx',
      { fileUrl: data.signedUrl },
      { auth: true },
    );
    const pageImages: PageImage[] = pages.map((p) => ({
      pageNumber: p.pageNumber,
      // Server-owned temp paths aren't exposed to the client; cleanup
      // of the rendered pages is the route's job.
      storagePath: '',
      signedUrl: p.url,
      widthPx: p.widthPx,
      heightPx: p.heightPx,
    }));
    return {
      pages: pageImages,
      meta: {
        sourceKind: 'pptx',
        filename: file.name,
        pageCount: pageImages.length,
        ingestedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    if (err instanceof ApiError) {
      const code = (err.body as { error?: string } | null)?.error;
      if (code === 'too_many_pages') {
        throw new IngestError(
          `That deck has too many slides — the checker reads up to ${INGEST_MAX_PAGES}. Trim it and try again.`,
          'too-many-pages',
        );
      }
      throw new IngestError(
        "We couldn't read that file. Try exporting it as a PDF and upload that instead.",
        'server-render-failed',
      );
    }
    throw err;
  } finally {
    // Best-effort: the raw .pptx has round-tripped — RLS protects
    // against cross-user deletes; failure is fine.
    void supabase.storage.from(BUCKET).remove([rawPath]);
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test --workspace=apps/web -- fromPptx`
Expected: PASS (6 tests).

- [ ] **Step 9: Write the failing normalizeInput test**

`apps/web/src/review/ingest/__tests__/normalizeInput.test.ts`:

```ts
/**
 * normalizeInput: pure dispatch over the four input kinds. The from*
 * modules are mocked — their own suites cover the behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PosterDoc } from '@postr/shared';

const { mockFromPoster, mockFromPdf, mockFromImage, mockFromPptx } = vi.hoisted(() => ({
  mockFromPoster: vi.fn(),
  mockFromPdf: vi.fn(),
  mockFromImage: vi.fn(),
  mockFromPptx: vi.fn(),
}));

vi.mock('../fromPoster', () => ({ fromPoster: mockFromPoster }));
vi.mock('../fromPdf', () => ({ fromPdf: mockFromPdf }));
vi.mock('../fromImage', () => ({ fromImage: mockFromImage }));
vi.mock('../fromPptx', () => ({ fromPptx: mockFromPptx }));

import { normalizeInput } from '../normalizeInput';
import type { NormalizedArtifact } from '../types';

const CTX = { userId: 'u1', sessionId: 'sess-1' };

function artifact(sourceKind: NormalizedArtifact['meta']['sourceKind']): NormalizedArtifact {
  return {
    pages: [],
    meta: { sourceKind, pageCount: 0, ingestedAt: '2026-07-29T00:00:00.000Z' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromPoster.mockResolvedValue(artifact('postr'));
  mockFromPdf.mockResolvedValue(artifact('pdf'));
  mockFromImage.mockResolvedValue(artifact('image'));
  mockFromPptx.mockResolvedValue(artifact('pptx'));
});

describe('normalizeInput', () => {
  it('dispatches postr input with the posterId from the input, not the ctx', async () => {
    const doc = { widthIn: 48, heightIn: 36 } as PosterDoc;
    const out = await normalizeInput({ kind: 'postr', doc, posterId: 'p1' }, CTX);
    expect(mockFromPoster).toHaveBeenCalledWith(doc, { userId: 'u1', posterId: 'p1' });
    expect(out.meta.sourceKind).toBe('postr');
  });

  it('dispatches pdf input to fromPdf with the shared ctx', async () => {
    const file = new File(['x'], 'talk.pdf', { type: 'application/pdf' });
    const out = await normalizeInput({ kind: 'pdf', file }, CTX);
    expect(mockFromPdf).toHaveBeenCalledWith(file, CTX);
    expect(out.meta.sourceKind).toBe('pdf');
  });

  it('dispatches image input to fromImage', async () => {
    const file = new File(['x'], 'poster.png', { type: 'image/png' });
    const out = await normalizeInput({ kind: 'image', file }, CTX);
    expect(mockFromImage).toHaveBeenCalledWith(file, CTX);
    expect(out.meta.sourceKind).toBe('image');
  });

  it('dispatches pptx input to fromPptx', async () => {
    const file = new File(['x'], 'deck.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    const out = await normalizeInput({ kind: 'pptx', file }, CTX);
    expect(mockFromPptx).toHaveBeenCalledWith(file, CTX);
    expect(out.meta.sourceKind).toBe('pptx');
  });
});
```

- [ ] **Step 10: Write the failing barrel test, then run both suites to verify they fail**

`apps/web/src/review/ingest/__tests__/index.test.ts`:

```ts
/**
 * The UI barrel: the wrappers resolve the ingest context (session
 * userId + a fresh sessionId per call) and dispatch through
 * normalizeInput — components never build IngestContext themselves.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PosterDoc } from '@postr/shared';

const { mockNormalize, mockEnsureSession } = vi.hoisted(() => ({
  mockNormalize: vi.fn(),
  mockEnsureSession: vi.fn(),
}));

vi.mock('../normalizeInput', () => ({ normalizeInput: mockNormalize }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/auth', () => ({ ensureSession: mockEnsureSession }));

import { ingestFileForReview, ingestPosterForReview } from '../index';

beforeEach(() => {
  vi.clearAllMocks();
  mockEnsureSession.mockResolvedValue({ user: { id: 'u1' } });
  mockNormalize.mockResolvedValue({
    pages: [],
    meta: { sourceKind: 'pdf', pageCount: 0, ingestedAt: '2026-07-29T00:00:00.000Z' },
  });
});

describe('ingestFileForReview', () => {
  it('dispatches by MIME and resolves the context per call', async () => {
    const pdf = new File(['x'], 'deck.pdf', { type: 'application/pdf' });
    await ingestFileForReview(pdf);
    expect(mockNormalize).toHaveBeenCalledWith(
      { kind: 'pdf', file: pdf },
      { userId: 'u1', sessionId: expect.any(String) },
    );

    const pptx = new File(['x'], 'deck.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    await ingestFileForReview(pptx);
    expect(mockNormalize).toHaveBeenCalledWith(
      { kind: 'pptx', file: pptx },
      expect.objectContaining({ userId: 'u1' }),
    );

    const png = new File(['x'], 'poster.png', { type: 'image/png' });
    await ingestFileForReview(png);
    expect(mockNormalize).toHaveBeenCalledWith(
      { kind: 'image', file: png },
      expect.objectContaining({ userId: 'u1' }),
    );
  });
});

describe('ingestPosterForReview', () => {
  it('dispatches the postr kind with doc + posterId', async () => {
    const doc = { version: 1, blocks: [] } as unknown as PosterDoc;
    await ingestPosterForReview({ doc, posterId: 'p1' });
    expect(mockNormalize).toHaveBeenCalledWith(
      { kind: 'postr', doc, posterId: 'p1' },
      { userId: 'u1', sessionId: expect.any(String) },
    );
  });
});
```

Run: `npm test --workspace=apps/web -- ingest`
Expected: FAIL — modules `../normalizeInput` and `../index` do not exist.

- [ ] **Step 11: Implement normalizeInput**

`apps/web/src/review/ingest/normalizeInput.ts`:

```ts
/**
 * The ingest dispatcher (spec §3): one entry point for every input
 * kind — each normalizes to the same NormalizedArtifact. The UI picks
 * the kind from how the user arrived (editor → postr with the doc +
 * posterId; file drop → pdf/image/pptx from the file's MIME type).
 */
import type { PosterDoc } from '@postr/shared';
import { fromImage } from './fromImage';
import { fromPdf } from './fromPdf';
import { fromPoster } from './fromPoster';
import { fromPptx } from './fromPptx';
import type { IngestContext, NormalizedArtifact } from './types';

export type ReviewInput =
  | { kind: 'postr'; doc: PosterDoc; posterId: string }
  | { kind: 'pdf' | 'image' | 'pptx'; file: File };

export async function normalizeInput(
  input: ReviewInput,
  ctx: IngestContext,
): Promise<NormalizedArtifact> {
  switch (input.kind) {
    case 'postr':
      return fromPoster(input.doc, { userId: ctx.userId, posterId: input.posterId });
    case 'pdf':
      return fromPdf(input.file, ctx);
    case 'image':
      return fromImage(input.file, ctx);
    case 'pptx':
      return fromPptx(input.file, ctx);
  }
}
```

`apps/web/src/review/ingest/index.ts`:

```ts
/**
 * UI-facing entry points (spec §3, consumed by Milestone 5): resolve the
 * ingest context (the current session's user id — anonymous sessions are
 * fine, storage RLS scopes to auth.uid() — plus a fresh sessionId per
 * call for the temp upload prefix) and dispatch through normalizeInput.
 */
import type { PosterDoc } from '@postr/shared';
import { ensureSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { normalizeInput } from './normalizeInput';
import type { IngestContext, NormalizedArtifact } from './types';

async function resolveIngestContext(): Promise<IngestContext> {
  const session = await ensureSession(supabase);
  return { userId: session.user.id, sessionId: crypto.randomUUID() };
}

function kindForFile(file: File): 'pdf' | 'image' | 'pptx' {
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    return 'pptx';
  }
  return 'image'; // the MIME allowlist (Task 20) rejects non-images downstream
}

export async function ingestFileForReview(file: File): Promise<NormalizedArtifact> {
  const ctx = await resolveIngestContext();
  return normalizeInput({ kind: kindForFile(file), file }, ctx);
}

export async function ingestPosterForReview(input: {
  doc: PosterDoc;
  posterId: string;
}): Promise<NormalizedArtifact> {
  const ctx = await resolveIngestContext();
  return normalizeInput({ kind: 'postr', ...input }, ctx);
}
```

- [ ] **Step 12: Run test to verify it passes, then the full web suite + typecheck**

Run: `npm test --workspace=apps/web -- normalizeInput`
Expected: PASS (4 tests).

Milestone-close verification (whole suite + typecheck — build is the typecheck, per repo conventions):

Run: `npm test --workspace=apps/web && npm run build`
Expected: all web tests PASS (the pre-existing suites plus the 47 new ingest/thumbnail tests — 4 thumbnails + 16 guards + 3 uploadReviewPage + 4 fromImage + 3 fromPdf + 5 fromPoster + 6 fromPptx + 4 normalizeInput + 2 barrel), and `npm run build` completes with no type errors.

- [ ] **Step 13: Commit**

```bash
git add apps/web/src/review/ingest/fromPoster.ts apps/web/src/review/ingest/fromPptx.ts apps/web/src/review/ingest/normalizeInput.ts apps/web/src/review/ingest/index.ts apps/web/src/review/ingest/__tests__/fromPoster.test.ts apps/web/src/review/ingest/__tests__/fromPptx.test.ts apps/web/src/review/ingest/__tests__/normalizeInput.test.ts apps/web/src/review/ingest/__tests__/index.test.ts
git commit -m "feat(review): poster/pptx ingest + normalizeInput dispatcher + UI barrel"
```

---

# MILESTONE 5 — Review UI (apps/web)

**Purpose:** give the review pipeline its two user surfaces — the public `/presentation-checker` page (upload or pick a Postr poster → scored review with anchored fix cards → one disclosed follow-up → paywall on 402) and the editor's `ReviewTab` sidebar panel reusing the same shared finding-card components. Web-only: the API, DB, and ingest layers from Milestones 2–4 are consumed, never modified.

### Task 23: Web review API client + entitlements (`review/reviewApi.ts`, `usePlan`, `data/billing.ts`)

**Files:**
- Create: `apps/web/src/review/reviewApi.ts`
- Modify: `apps/web/src/hooks/usePlan.ts` (gains `reviewCredits`, `hasReviewAddon`, `canReview`)
- Modify: `apps/web/src/data/billing.ts` (`BillingSku` gains the review SKUs)
- Modify: `apps/web/src/data/checkoutIntent.ts` (`VALID` gains the review SKUs, or a guest's review purchase dies at the auth detour)
- Modify: `apps/web/src/pages/Auth.tsx` (paid-intent banner label — the existing `term`/`pack` ternary would mislabel a review SKU)
- Test: `apps/web/src/review/__tests__/reviewApi.test.ts`
- Test: `apps/web/src/hooks/__tests__/usePlan.test.ts` (new file — no usePlan test exists today)

**Interfaces:**
- Consumes: `postJson`, `ApiError`, `formatRetryAfter` from `@/lib/apiClient`; `supabase` from `@/lib/supabase`; `CritiqueResult`, `PosterDoc`, `ReviewDimension`, `ReviewPageRef`, `ReviewSourceKind` types from `@postr/shared` (Task 9).
- Produces (CONTEXT contract, verbatim): `CritiqueRequestBody`, `CritiqueResponse`, `ReviewPaymentRequiredError`, `requestCritique(body)`. Also produces (this task's own additions, consumed by Tasks 24–25): `PosterReviewSummary`, `listMyReviews()`; `PlanState.reviewCredits` / `hasReviewAddon` / `canReview`; `BillingSku = 'term' | 'pack' | 'review_pack' | 'review_addon'`.

- [ ] **Step 1: Write the failing reviewApi test**

`apps/web/src/review/__tests__/reviewApi.test.ts`:

```ts
/**
 * reviewApi — the web client for the Presentation Checker API.
 *
 * Pins the two error translations the UI depends on (402 →
 * ReviewPaymentRequiredError carrying the server's reason; 429 → an
 * ApiError whose message carries the human wait from formatRetryAfter)
 * and the listMyReviews row→summary mapping. apiClient and supabase are
 * module-mocked (the data/__tests__/posters.test.ts convention) — no
 * network.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiError } from '@/lib/apiClient';

const { postJsonMock, fromMock } = vi.hoisted(() => ({
  postJsonMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>();
  return { ...actual, postJson: postJsonMock };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock },
}));

import {
  ReviewPaymentRequiredError,
  listMyReviews,
  requestCritique,
} from '../reviewApi';

const BODY = {
  sourceKind: 'pdf' as const,
  pages: [
    {
      pageNumber: 1,
      url: 'https://example.supabase.co/storage/v1/object/sign/poster-assets/temp/review/p1.jpg?token=x',
      widthPx: 1650,
      heightPx: 1275,
    },
  ],
};

beforeEach(() => {
  postJsonMock.mockReset();
  fromMock.mockReset();
});

describe('requestCritique', () => {
  it('posts to the critique route with auth and returns the response', async () => {
    const response = {
      reviewId: 'rev-1',
      stage: 'initial' as const,
      critique: {
        dimensionScores: { narrative: 4, design: 3, content: 5 },
        attentionSummary: 'The eye lands on the results figure first.',
        findings: [],
      },
    };
    postJsonMock.mockResolvedValue(response);

    const result = await requestCritique(BODY);

    expect(postJsonMock).toHaveBeenCalledWith('/api/review/critique', BODY, {
      auth: true,
    });
    expect(result).toBe(response);
  });

  it('maps a 402 ApiError to ReviewPaymentRequiredError with the server reason', async () => {
    postJsonMock.mockRejectedValue(
      new ApiError(
        'review_payment_required',
        402,
        { error: 'review_payment_required', reason: 'weekly_quota_exceeded' },
        3600,
      ),
    );

    const err: unknown = await requestCritique(BODY).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ReviewPaymentRequiredError);
    expect((err as ReviewPaymentRequiredError).reason).toBe(
      'weekly_quota_exceeded',
    );
    expect((err as ReviewPaymentRequiredError).retryAfterSec).toBe(3600);
  });

  it("defaults the 402 reason to 'no_credit' when the body lacks one", async () => {
    postJsonMock.mockRejectedValue(
      new ApiError('review_payment_required', 402, null),
    );

    const err: unknown = await requestCritique(BODY).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ReviewPaymentRequiredError);
    expect((err as ReviewPaymentRequiredError).reason).toBe('no_credit');
    expect((err as ReviewPaymentRequiredError).retryAfterSec).toBeUndefined();
  });

  it('rethrows a 429 with the human wait from formatRetryAfter in the message', async () => {
    postJsonMock.mockRejectedValue(
      new ApiError('rate_limited', 429, { error: 'rate_limited' }, 90),
    );

    const err: unknown = await requestCritique(BODY).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(429);
    expect((err as ApiError).message).toContain('2 minutes');
    expect((err as ApiError).retryAfterSec).toBe(90);
  });

  it('propagates other ApiErrors untouched', async () => {
    const upstream = new ApiError('review_upstream', 502, {
      error: 'review_upstream',
    });
    postJsonMock.mockRejectedValue(upstream);

    const err: unknown = await requestCritique(BODY).catch((e: unknown) => e);

    expect(err).toBe(upstream);
  });
});

describe('listMyReviews', () => {
  function chainResolving(response: { data: unknown; error: unknown }) {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => response),
    };
    fromMock.mockReturnValue(chain);
    return chain;
  }

  it('selects the owner-visible columns newest-first and maps rows to summaries', async () => {
    const chain = chainResolving({
      data: [
        {
          id: 'rev-1',
          poster_id: null,
          source_kind: 'pdf',
          source_meta: { filename: 'talk.pdf', pageCount: 12 },
          status: 'complete',
          stage: 'initial',
          initial_findings: {
            dimensionScores: { narrative: 4, design: 2, content: 4 },
          },
          created_at: '2026-07-29T10:00:00Z',
        },
      ],
      error: null,
    });

    const reviews = await listMyReviews();

    expect(fromMock).toHaveBeenCalledWith('poster_reviews');
    expect(chain.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
    expect(reviews).toEqual([
      {
        id: 'rev-1',
        posterId: null,
        sourceKind: 'pdf',
        status: 'complete',
        stage: 'initial',
        filename: 'talk.pdf',
        pageCount: 12,
        dimensionScores: { narrative: 4, design: 2, content: 4 },
        createdAt: '2026-07-29T10:00:00Z',
      },
    ]);
  });

  it('returns an empty list when the user has no reviews', async () => {
    chainResolving({ data: [], error: null });

    await expect(listMyReviews()).resolves.toEqual([]);
  });

  it('throws a descriptive error when the select fails', async () => {
    chainResolving({ data: null, error: { message: 'rls denied' } });

    await expect(listMyReviews()).rejects.toThrow('rls denied');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- reviewApi`
Expected: FAIL — module `../reviewApi` does not exist.

- [ ] **Step 3: Write the review API client**

`apps/web/src/review/reviewApi.ts`:

```ts
/**
 * Presentation Checker API client — the web side of the review feature
 * (spec §5; the naming trap is why nothing here says "feedback").
 *
 * `requestCritique` wraps POST /api/review/critique in the shared
 * postJson helper and translates the two statuses the UI handles
 * specially:
 *   402 → ReviewPaymentRequiredError (the paywall; `reason` tells the
 *         panel which pitch to show — 'no_credit' buys a pack,
 *         'weekly_quota_exceeded' waits or buys a pack)
 *   429 → rethrown as an ApiError whose message carries the human wait
 *         ("2 minutes") from formatRetryAfter, so error panels can show
 *         the message verbatim
 * Everything else (400/403/404/409/413/502) propagates as the original
 * ApiError — the route's snake_case `error` code is its message.
 *
 * `listMyReviews` reads the user's own poster_reviews rows directly via
 * supabase-js: the table's RLS is owner SELECT-only (D3) — all writes go
 * through the API's service_role client, so there is nothing to wrap.
 */
import type {
  CritiqueResult,
  PosterDoc,
  ReviewDimension,
  ReviewPageRef,
  ReviewSourceKind,
} from '@postr/shared';
import { ApiError, formatRetryAfter, postJson } from '@/lib/apiClient';
import { supabase } from '@/lib/supabase';

export interface CritiqueRequestBody {
  sourceKind: ReviewSourceKind;
  pages: ReviewPageRef[];
  posterDoc?: PosterDoc;
  posterId?: string;
  reviewId?: string;
  /** Upload filename — the API stamps it into source_meta (shown in the past-reviews list). */
  filename?: string;
}

export interface CritiqueResponse {
  reviewId: string;
  stage: 'initial' | 'closed';
  critique: CritiqueResult;
}

/** The 402 paywall signal from the review route. */
export class ReviewPaymentRequiredError extends Error {
  /** Server-provided: 'no_credit' | 'weekly_quota_exceeded'. */
  readonly reason: string;
  readonly retryAfterSec?: number;
  constructor(reason: string, retryAfterSec?: number) {
    super('review_payment_required');
    this.name = 'ReviewPaymentRequiredError';
    this.reason = reason;
    this.retryAfterSec = retryAfterSec;
  }
}

export async function requestCritique(
  body: CritiqueRequestBody,
): Promise<CritiqueResponse> {
  try {
    return await postJson<CritiqueResponse>('/api/review/critique', body, {
      auth: true,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 402) {
      const paymentBody = err.body as { reason?: string } | null;
      throw new ReviewPaymentRequiredError(
        paymentBody?.reason ?? 'no_credit',
        err.retryAfterSec,
      );
    }
    if (err instanceof ApiError && err.status === 429) {
      throw new ApiError(
        `Too many review requests right now — try again in ${formatRetryAfter(err.retryAfterSec ?? 60)}.`,
        err.status,
        err.body,
        err.retryAfterSec,
      );
    }
    throw err;
  }
}

/** One row of the signed-in user's review history (past-reviews list). */
export interface PosterReviewSummary {
  id: string;
  posterId: string | null;
  sourceKind: ReviewSourceKind;
  status: 'pending' | 'complete' | 'failed';
  stage: 'initial' | 'followup' | 'closed';
  /** source_meta.filename — set for uploads, null for Postr posters. */
  filename: string | null;
  /** source_meta.pageCount. */
  pageCount: number | null;
  /** Dimension scores of the initial critique, once complete. */
  dimensionScores: Record<ReviewDimension, number> | null;
  createdAt: string;
}

interface PosterReviewRow {
  id: string;
  poster_id: string | null;
  source_kind: ReviewSourceKind;
  source_meta: { filename?: string; pageCount?: number } | null;
  status: 'pending' | 'complete' | 'failed';
  stage: 'initial' | 'followup' | 'closed';
  initial_findings: {
    dimensionScores?: Record<ReviewDimension, number>;
  } | null;
  created_at: string;
}

/**
 * The signed-in user's reviews, newest first, capped at 20. Owner
 * SELECT-only RLS scopes the read to the caller — an anonymous session
 * simply sees its own (usually empty) set.
 */
export async function listMyReviews(): Promise<PosterReviewSummary[]> {
  // poster_reviews is newer than the generated Database type in some
  // builds; cast the projection (same convention as usePlan).
  const { data, error } = await supabase
    .from('poster_reviews')
    .select(
      'id, poster_id, source_kind, source_meta, status, stage, initial_findings, created_at' as never,
    )
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(`listMyReviews failed: ${error.message}`);
  const rows = (data ?? []) as unknown as PosterReviewRow[];
  return rows.map((row) => ({
    id: row.id,
    posterId: row.poster_id,
    sourceKind: row.source_kind,
    status: row.status,
    stage: row.stage,
    filename: row.source_meta?.filename ?? null,
    pageCount: row.source_meta?.pageCount ?? null,
    dimensionScores: row.initial_findings?.dimensionScores ?? null,
    createdAt: row.created_at,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/web -- reviewApi`
Expected: PASS (8 tests).

- [ ] **Step 5: Write the failing usePlan review-entitlement test**

`apps/web/src/hooks/__tests__/usePlan.test.ts`:

```ts
/**
 * usePlan — review entitlements derived from the server-owned users
 * columns. Mirrors D4 exactly:
 *
 *   canReview = (hasReviewAddon && hasActiveTerm) || reviewCredits > 0
 *
 * The add-on alone unlocks nothing without an active term; credits
 * stand alone and never expire. The supabase client is module-mocked
 * (the data/__tests__/posters.test.ts convention) — no network.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

let fakeUser: { id: string; is_anonymous?: boolean } | null = { id: 'user-1' };
let nextRow: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: fakeUser }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: nextRow, error: null })),
    })),
  },
}));

import { usePlan } from '../usePlan';

function row(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    plan: null,
    plan_expires_at: null,
    export_credits: 0,
    subscription_status: null,
    review_credits: 0,
    review_addon: false,
    ...overrides,
  };
}

beforeEach(() => {
  fakeUser = { id: 'user-1' };
  nextRow = null;
});

describe('usePlan — review entitlements', () => {
  it('review credits alone unlock canReview (no term, no add-on)', async () => {
    nextRow = row({ review_credits: 2 });
    const { result } = renderHook(() => usePlan());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.reviewCredits).toBe(2);
    expect(result.current.hasReviewAddon).toBe(false);
    expect(result.current.canReview).toBe(true);
  });

  it('the add-on alone is NOT enough — the term must be active (D4)', async () => {
    nextRow = row({ review_addon: true });
    const { result } = renderHook(() => usePlan());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasReviewAddon).toBe(true);
    expect(result.current.hasActiveTerm).toBe(false);
    expect(result.current.canReview).toBe(false);
  });

  it('add-on + active term unlocks canReview with zero credits', async () => {
    nextRow = row({
      plan: 'term',
      plan_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      subscription_status: 'active',
      review_addon: true,
    });
    const { result } = renderHook(() => usePlan());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.reviewCredits).toBe(0);
    expect(result.current.canReview).toBe(true);
  });

  it('no credits and no add-on means no review', async () => {
    nextRow = row({});
    const { result } = renderHook(() => usePlan());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.reviewCredits).toBe(0);
    expect(result.current.hasReviewAddon).toBe(false);
    expect(result.current.canReview).toBe(false);
  });

  it('an expired term with the add-on falls back to credits only', async () => {
    nextRow = row({
      plan: 'term',
      plan_expires_at: new Date(Date.now() - 86_400_000).toISOString(),
      subscription_status: 'canceled',
      review_addon: true,
      review_credits: 1,
    });
    const { result } = renderHook(() => usePlan());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasActiveTerm).toBe(false);
    expect(result.current.canReview).toBe(true); // via the credit, not the add-on
  });

  it('no session at all is a guest who cannot review', async () => {
    fakeUser = null;
    const { result } = renderHook(() => usePlan());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isGuest).toBe(true);
    expect(result.current.canReview).toBe(false);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- usePlan`
Expected: FAIL — `result.current.canReview` is `undefined` (the derivations don't exist yet).

- [ ] **Step 7: Extend usePlan with the review entitlement**

`apps/web/src/hooks/usePlan.ts` — four edits, everything else untouched.

Edit 1 — `PlanState` gains three fields (insert after the `credits` field's doc-comment block, before `canExport`):

```ts
  /** Remaining consumable export credits from the pack. */
  credits: number;
  /** Remaining review credits from the review pack. Never expire (§5.3). */
  reviewCredits: number;
  /** Whether the weekly review add-on rides on the user's subscription. */
  hasReviewAddon: boolean;
  /**
   * True if the user may run a review right now (mirrors D4's
   * server-side resolution): an active term WITH the review add-on
   * (weekly window), or at least one review credit. The follow-up is
   * included in the initial credit — it never needs a second one.
   */
  canReview: boolean;
```

Edit 2 — `INITIAL` gains the same three keys:

```ts
const INITIAL: PlanState = {
  loading: true,
  hasActiveTerm: false,
  credits: 0,
  reviewCredits: 0,
  hasReviewAddon: false,
  canReview: false,
  canExport: false,
  isGuest: true,
  subscriptionStatus: null,
};
```

Edit 3 — `BillingRow` and `BillingDerived` cover the new columns:

```ts
interface BillingRow {
  plan?: string | null;
  plan_expires_at?: string | null;
  export_credits?: number | null;
  review_credits?: number | null;
  review_addon?: boolean | null;
  subscription_status?: string | null;
}

/** The billing-derived slice of PlanState (everything except loading/isGuest,
 *  which come from the auth check, not the billing row). */
type BillingDerived = Pick<
  PlanState,
  | 'hasActiveTerm'
  | 'credits'
  | 'reviewCredits'
  | 'hasReviewAddon'
  | 'canReview'
  | 'canExport'
  | 'subscriptionStatus'
>;
```

Edit 4 — `derive()` computes them, and the select projection reads them:

```ts
function derive(row: BillingRow | null): BillingDerived {
  const expires = row?.plan_expires_at ? new Date(row.plan_expires_at) : null;
  const hasActiveTerm =
    row?.plan === 'term' && expires !== null && expires.getTime() > Date.now();
  const credits = row?.export_credits ?? 0;
  const reviewCredits = row?.review_credits ?? 0;
  const hasReviewAddon = row?.review_addon === true;
  return {
    hasActiveTerm,
    credits,
    reviewCredits,
    hasReviewAddon,
    // D4 client mirror: add-on path needs the term active; the pack path
    // needs a credit. The server re-resolves this authoritatively.
    canReview: (hasReviewAddon && hasActiveTerm) || reviewCredits > 0,
    canExport: hasActiveTerm || credits > 0,
    subscriptionStatus: row?.subscription_status ?? null,
  };
}
```

```ts
      const { data } = await supabase
        .from('users')
        .select(
          'plan, plan_expires_at, export_credits, review_credits, review_addon, subscription_status' as never,
        )
        .eq('id', auth.user.id)
        .maybeSingle();
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test --workspace=apps/web -- usePlan`
Expected: PASS (6 tests).

- [ ] **Step 9: Extend BillingSku, checkout intent, and the Auth banner label**

The review SKUs are pure pass-through on the client — the server validates the price id and the entitlement (D4/D8). Three small edits so a review purchase can travel the same checkout path as term/pack, including the guest account-first detour.

`apps/web/src/data/billing.ts`:

```ts
export type BillingSku = 'term' | 'pack' | 'review_pack' | 'review_addon';
```

(Keep the rest of the file unchanged — `createCheckout(sku)` already forwards any sku to `/billing/create-checkout`; the server owns validation.)

`apps/web/src/data/checkoutIntent.ts` — `VALID` gains the review SKUs (without this, `parseCheckoutPlan` narrows a guest's `/auth?plan=review_pack` intent to `null` and the purchase silently dies at the auth detour):

```ts
const VALID: readonly CheckoutPlan[] = ['term', 'pack', 'review_pack', 'review_addon'];
```

`apps/web/src/pages/Auth.tsx` — the paid-intent banner (:379) is a term-or-pack ternary that would label a review SKU "Export pack · CA$9.99". Replace the ternary with a per-plan label (prices for the review SKUs are set in Task 28, so their labels carry no numbers):

```tsx
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#9b8cf0]">
              {
                (
                  {
                    term: 'Term · CA$18.99 / 4 months',
                    pack: 'Export pack · CA$9.99',
                    review_pack: 'Review pack · credits never expire',
                    review_addon: 'Review add-on · weekly reviews',
                  } as Record<CheckoutPlan, string>
                )[checkoutPlan]
              }
            </div>
```

- [ ] **Step 10: Run the web suite and the build**

Run:

```bash
npm test --workspace=apps/web
npm run build
```

Expected: all web tests pass (the two new files plus every pre-existing suite — the `PlanState` additions are additive, and existing usePlan mocks in `EditableExport*.test.tsx` return partial objects typed as the mock's return, so they still compile); the monorepo build typechecks (`BillingSku` widening flows into `CheckoutPlan` automatically).

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/review/reviewApi.ts apps/web/src/review/__tests__/reviewApi.test.ts apps/web/src/hooks/usePlan.ts apps/web/src/hooks/__tests__/usePlan.test.ts apps/web/src/data/billing.ts apps/web/src/data/checkoutIntent.ts apps/web/src/pages/Auth.tsx
git commit -m "feat(review): web review API client + review entitlements in usePlan + review SKUs"
```

### Task 24: `/presentation-checker` page + shared finding cards

**Files:**
- Create: `apps/web/src/review/FindingCards.tsx` (the SHARED card components — Task 25 imports them)
- Create: `apps/web/src/pages/PresentationChecker.tsx`
- Test: `apps/web/src/pages/__tests__/PresentationChecker.test.tsx`

**Interfaces:**
- Consumes: `requestCritique`, `ReviewPaymentRequiredError`, `listMyReviews`, `PosterReviewSummary`, `CritiqueResponse` from `@/review/reviewApi` (Task 23); `usePlan` (`canReview` is NOT pre-gated here — the server is authoritative and a 402 renders the paywall); `createCheckout` (`@/data/billing`); `stashCheckoutIntent` (`@/data/checkoutIntent`); `listPosters`, `loadPoster`, `PosterListRow` (`@/data/posters`); `NormalizedArtifact`, `IngestError`, `IngestErrorKind` from `@/review/ingest/types` (Task 20, contract-pinned); `ingestFileForReview(file: File): Promise<NormalizedArtifact>` and `ingestPosterForReview(input: { doc: PosterDoc; posterId: string }): Promise<NormalizedArtifact>` from `@/review/ingest` (Task 22 barrel); `PublicHeader` / `PublicFooter`; `APP_ROUTE_META` (record arrives in Task 26 — read defensively with `?? null`); `useDocumentMeta`; `BusyIndicator`, `busyProps`; review types from `@postr/shared`.
- Produces: default-export `PresentationChecker` page (wired in Task 26); `FindingCard({ finding: ReviewFinding; onJump?: () => void })`, `ReviewScoreHeader({ scores })`, `SEVERITY_LABELS`, `SEVERITY_COLORS` from `@/review/FindingCards` — consumed by Task 25.

- [ ] **Step 1: Write the failing page test**

`apps/web/src/pages/__tests__/PresentationChecker.test.tsx`:

```tsx
/**
 * /presentation-checker page — the public review surface.
 *
 * reviewApi, the ingest layer, usePlan, the posters repo, billing,
 * checkout intent, and supabase are all module-mocked: these tests pin
 * the page's behaviour (happy path, paywall on 402, follow-up
 * disclosure, region-anchor overlay), never the network. The mocked
 * ReviewPaymentRequiredError class keeps `instanceof` working because
 * the page and the test share the same mocked binding.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import PresentationChecker from '../../pages/PresentationChecker';

const {
  requestCritiqueMock,
  listMyReviewsMock,
  ingestFileMock,
  ingestPosterMock,
} = vi.hoisted(() => ({
  requestCritiqueMock: vi.fn(),
  listMyReviewsMock: vi.fn(async () => []),
  ingestFileMock: vi.fn(),
  ingestPosterMock: vi.fn(),
}));

vi.mock('@/review/reviewApi', () => ({
  requestCritique: requestCritiqueMock,
  listMyReviews: listMyReviewsMock,
  ReviewPaymentRequiredError: class extends Error {
    readonly reason: string;
    readonly retryAfterSec?: number;
    constructor(reason: string, retryAfterSec?: number) {
      super('review_payment_required');
      this.name = 'ReviewPaymentRequiredError';
      this.reason = reason;
      this.retryAfterSec = retryAfterSec;
    }
  },
}));

vi.mock('@/review/ingest', () => ({
  ingestFileForReview: ingestFileMock,
  ingestPosterForReview: ingestPosterMock,
}));

const planState = {
  value: {
    loading: false,
    hasActiveTerm: false,
    credits: 0,
    reviewCredits: 1,
    hasReviewAddon: false,
    canReview: true,
    canExport: false,
    isGuest: false,
    subscriptionStatus: null as string | null,
  },
};
vi.mock('@/hooks/usePlan', () => ({ usePlan: () => planState.value }));

vi.mock('@/data/posters', () => ({
  listPosters: vi.fn(async () => []),
  loadPoster: vi.fn(async () => null),
}));
vi.mock('@/data/billing', () => ({ createCheckout: vi.fn() }));
vi.mock('@/data/checkoutIntent', () => ({ stashCheckoutIntent: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

import { ReviewPaymentRequiredError } from '@/review/reviewApi';

const ARTIFACT = {
  pages: [
    {
      pageNumber: 1,
      storagePath: 'user-1/temp/review/p1.jpg',
      signedUrl:
        'https://example.supabase.co/storage/v1/object/sign/poster-assets/user-1/temp/review/p1.jpg?token=x',
      widthPx: 1650,
      heightPx: 1275,
    },
    {
      pageNumber: 2,
      storagePath: 'user-1/temp/review/p2.jpg',
      signedUrl:
        'https://example.supabase.co/storage/v1/object/sign/poster-assets/user-1/temp/review/p2.jpg?token=x',
      widthPx: 1650,
      heightPx: 1275,
    },
  ],
  meta: {
    sourceKind: 'pdf' as const,
    filename: 'talk.pdf',
    pageCount: 2,
    ingestedAt: '2026-07-29T10:00:00Z',
  },
};

const CRITIQUE = {
  reviewId: 'rev-1',
  stage: 'initial' as const,
  critique: {
    dimensionScores: { narrative: 4, design: 2, content: 5 },
    attentionSummary:
      'The eye lands on the decorative header photo before the results figure.',
    prioritization:
      'Keep the results figure as primary; demote Table 2 to an appendix.',
    findings: [
      {
        dimension: 'design' as const,
        severity: 'high' as const,
        category: 'decorative-hijack' as const,
        anchor: {
          kind: 'region' as const,
          page: 1,
          bbox: [0.1, 0.2, 0.3, 0.4] as [number, number, number, number],
        },
        action: 'demote-to-appendix' as const,
        problem: 'The decorative header photo outranks the results figure.',
        fix: 'Shrink the photo and give the results figure the top-left entry point.',
        example:
          'Move "Figure 3: recall accuracy" to the top-left column at full width.',
        tradeoff: 'A smaller photo makes a plainer first impression.',
      },
      {
        dimension: 'narrative' as const,
        severity: 'low' as const,
        category: 'no-takeaway' as const,
        anchor: { kind: 'slide' as const, page: 2 },
        action: 'add' as const,
        problem: 'The deck ends on methods details with no take-home.',
        fix: 'Close on a single takeaway slide.',
        example: 'End with: "Sleep loss cut recall by a fifth — test less, sleep more."',
      },
    ],
  },
};

function uploadFile(name = 'talk.pdf') {
  fireEvent.change(screen.getByLabelText('File to review'), {
    target: { files: [new File(['x'], name, { type: 'application/pdf' })] },
  });
}

beforeEach(() => {
  requestCritiqueMock.mockReset();
  listMyReviewsMock.mockReset();
  listMyReviewsMock.mockResolvedValue([]);
  ingestFileMock.mockReset();
  ingestFileMock.mockResolvedValue(ARTIFACT);
  ingestPosterMock.mockReset();
  planState.value = {
    loading: false,
    hasActiveTerm: false,
    credits: 0,
    reviewCredits: 1,
    hasReviewAddon: false,
    canReview: true,
    canExport: false,
    isGuest: false,
    subscriptionStatus: null,
  };
});

describe('PresentationChecker page', () => {
  it('happy path: upload → scores, finding cards, and the personalized example', async () => {
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );

    uploadFile();

    // Score header — all three dimensions.
    expect(await screen.findByTestId('score-narrative')).toHaveTextContent(
      '4/5',
    );
    expect(screen.getByTestId('score-design')).toHaveTextContent('2/5');
    expect(screen.getByTestId('score-content')).toHaveTextContent('5/5');
    // Attention summary prose + prioritization callout.
    expect(
      screen.getByText(/decorative header photo before the results figure/i),
    ).toBeTruthy();
    expect(screen.getByText(/demote Table 2 to an appendix/i)).toBeTruthy();
    // Finding cards render problem + fix, and the example as a blockquote.
    expect(
      screen.getByText(
        'The decorative header photo outranks the results figure.',
      ),
    ).toBeTruthy();
    const quote = screen.getByText(/Move "Figure 3: recall accuracy"/i);
    expect(quote.tagName).toBe('BLOCKQUOTE');
    expect(screen.getByText(/Sleep loss cut recall by a fifth/i)).toBeTruthy();
    // The critique request carried the page refs mapped from the artifact
    // (signedUrl → url, per the ReviewPageRef contract).
    expect(requestCritiqueMock).toHaveBeenCalledWith({
      sourceKind: 'pdf',
      pages: [
        {
          pageNumber: 1,
          url: ARTIFACT.pages[0]!.signedUrl,
          widthPx: 1650,
          heightPx: 1275,
        },
        {
          pageNumber: 2,
          url: ARTIFACT.pages[1]!.signedUrl,
          widthPx: 1650,
          heightPx: 1275,
        },
      ],
      posterDoc: undefined,
      posterId: undefined,
      reviewId: undefined,
    });
  });

  it('402 renders the paywall panel instead of results', async () => {
    requestCritiqueMock.mockRejectedValue(
      new ReviewPaymentRequiredError('no_credit'),
    );
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );

    uploadFile();

    expect(
      await screen.findByText(/Get feedback on your poster or talk/i),
    ).toBeTruthy();
    expect(screen.getByText(/Get the review pack/i)).toBeTruthy();
    expect(screen.queryByTestId('score-narrative')).toBeNull();
  });

  it('the follow-up button reveals the up-front disclosure before anything runs', async () => {
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );
    uploadFile();
    await screen.findByTestId('score-narrative');

    fireEvent.click(screen.getByText(/Request your one follow-up/i));

    // The verbatim disclosure (§5.2 hard requirement) — shown BEFORE the
    // follow-up can run, and clicking the button must not run anything.
    expect(
      screen.getByText(
        'This is your one follow-up — the review closes after it.',
      ),
    ).toBeTruthy();
    expect(requestCritiqueMock).toHaveBeenCalledTimes(1);
  });

  it('clicking a region-anchored card shows the bbox overlay on that page', async () => {
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    render(
      <MemoryRouter>
        <PresentationChecker />
      </MemoryRouter>,
    );
    uploadFile();
    await screen.findByTestId('score-narrative');
    expect(screen.queryByTestId('region-overlay')).toBeNull();

    fireEvent.click(
      screen.getByText(
        'The decorative header photo outranks the results figure.',
      ),
    );

    const overlay = await screen.findByTestId('region-overlay');
    // bbox is normalized [x, y, width, height] fractions (D7) →
    // absolutely-positioned percentages.
    expect(overlay.style.left).toBe('10%');
    expect(overlay.style.top).toBe('20%');
    expect(overlay.style.width).toBe('30%');
    expect(overlay.style.height).toBe('40%');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- PresentationChecker`
Expected: FAIL — module `../../pages/PresentationChecker` does not exist.

- [ ] **Step 3: Write the shared finding-card components**

`apps/web/src/review/FindingCards.tsx`:

```tsx
/**
 * Shared review finding card + score header — used by BOTH review
 * surfaces: the /presentation-checker page (Task 24) and the editor's
 * ReviewTab (Task 25). One component so the two surfaces can never
 * drift on how a finding reads.
 *
 * Card anatomy (spec §4.5): dimension chip, severity chip, action chip,
 * problem, fix, the personalized `example` as a blockquote, and the
 * `tradeoff` when the reviewer gave one. When `onJump` is provided the
 * whole card becomes clickable — region anchors scroll to a page
 * overlay on the checker page; block anchors jump to the block in the
 * editor.
 */
import type {
  ReviewDimension,
  ReviewFinding,
  ReviewFindingAction,
  ReviewSeverity,
} from '@postr/shared';

const DIMENSION_LABELS: Record<ReviewDimension, string> = {
  narrative: 'Narrative',
  design: 'Design',
  content: 'Content',
};

export const SEVERITY_LABELS: Record<ReviewSeverity, string> = {
  high: 'High impact',
  medium: 'Medium',
  low: 'Polish',
};

export const SEVERITY_COLORS: Record<ReviewSeverity, string> = {
  high: '#f38ba8',
  medium: '#f9e2af',
  low: '#89b4fa',
};

const ACTION_LABELS: Record<ReviewFindingAction, string> = {
  cut: 'Cut',
  'demote-to-appendix': 'Demote to appendix',
  'show-visually': 'Show visually',
  condense: 'Condense',
  'keep-as-primary': 'Keep as primary',
  add: 'Add',
};

function Chip({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ color, border: `1px solid ${color}55`, background: `${color}11` }}
    >
      {text}
    </span>
  );
}

export function FindingCard({
  finding,
  onJump,
}: {
  finding: ReviewFinding;
  onJump?: () => void;
}) {
  const severityColor = SEVERITY_COLORS[finding.severity];
  return (
    <div
      role={onJump ? 'button' : undefined}
      tabIndex={onJump ? 0 : undefined}
      onClick={onJump}
      onKeyDown={
        onJump
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onJump();
              }
            }
          : undefined
      }
      className="rounded-lg border p-3 text-left"
      style={{
        cursor: onJump ? 'pointer' : 'default',
        borderColor: `${severityColor}44`,
        background: '#0d0d15',
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Chip text={DIMENSION_LABELS[finding.dimension]} color="#9b8cf0" />
        <Chip text={SEVERITY_LABELS[finding.severity]} color={severityColor} />
        <Chip text={ACTION_LABELS[finding.action]} color="#8ec5ff" />
      </div>
      <div className="mt-2 text-sm font-semibold leading-snug text-[#e2e2e8]">
        {finding.problem}
      </div>
      <div className="mt-1 text-sm leading-relaxed text-[#c8cad0]">
        {finding.fix}
      </div>
      <blockquote className="mt-2 border-l-2 border-[#7c6aed] pl-3 text-sm italic leading-relaxed text-[#9ca3af]">
        {finding.example}
      </blockquote>
      {finding.tradeoff && (
        <div className="mt-2 text-xs leading-relaxed text-[#6b7280]">
          Tradeoff: {finding.tradeoff}
        </div>
      )}
      {onJump && (
        <div className="mt-2 text-xs text-[#6b7280]">→ click to see it</div>
      )}
    </div>
  );
}

/** The three dimension scores (narrative / design / content, 1–5). */
export function ReviewScoreHeader({
  scores,
}: {
  scores: Record<ReviewDimension, number>;
}) {
  const dims: Array<{ key: ReviewDimension; label: string }> = [
    { key: 'narrative', label: 'Narrative' },
    { key: 'design', label: 'Design' },
    { key: 'content', label: 'Content' },
  ];
  return (
    <div aria-label="Review scores" className="flex gap-3">
      {dims.map((d) => (
        <div
          key={d.key}
          data-testid={`score-${d.key}`}
          className="flex-1 rounded-lg border border-[#1f1f2e] bg-[#0d0d15] px-4 py-3 text-center"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-[#6b7280]">
            {d.label}
          </div>
          <div className="mt-1 text-xl font-bold text-white">
            {scores[d.key]}/5
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write the page**

`apps/web/src/pages/PresentationChecker.tsx`:

```tsx
/**
 * /presentation-checker — the Presentation Checker standalone page
 * (spec §1: one unified surface for posters AND talks).
 *
 * Upload a poster PDF, a talk deck (.pptx / .pdf), or an image — or,
 * signed in, pick one of your Postr posters — and get per-dimension
 * scores plus anchored fix cards with a rewritten example for each.
 * One follow-up per review, disclosed up front ("This is your one
 * follow-up — the review closes after it."), then the review closes.
 *
 * The route is registered but deliberately NOT linked from nav (D12) —
 * the SEO record is an `app` (noindex) entry until the Milestone-6
 * launch checklist flips it to a prerendered static record. The record
 * is read defensively (`?? null`) because Task 26 adds it after this
 * page lands.
 *
 * Entitlements are NOT pre-gated here: the server resolves them (D4)
 * and a 402 renders the paywall panel — the client plan read only
 * decides which checkout path a button takes (guest → account-first).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type {
  PosterDoc,
  ReviewSeverity,
  ReviewSourceKind,
} from '@postr/shared';
import { BusyIndicator, busyProps } from '@/components/BusyIndicator';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { APP_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';
import { usePlan } from '@/hooks/usePlan';
import { ApiError, formatRetryAfter } from '@/lib/apiClient';
import { createCheckout } from '@/data/billing';
import { stashCheckoutIntent } from '@/data/checkoutIntent';
import { listPosters, loadPoster, type PosterListRow } from '@/data/posters';
import { ingestFileForReview, ingestPosterForReview } from '@/review/ingest';
import {
  IngestError,
  type IngestErrorKind,
  type NormalizedArtifact,
} from '@/review/ingest/types';
import {
  listMyReviews,
  requestCritique,
  ReviewPaymentRequiredError,
  type CritiqueResponse,
  type PosterReviewSummary,
} from '@/review/reviewApi';
import {
  FindingCard,
  ReviewScoreHeader,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
} from '@/review/FindingCards';

type Phase = 'idle' | 'ingesting' | 'reviewing' | 'done' | 'error';

const SEVERITY_ORDER: ReviewSeverity[] = ['high', 'medium', 'low'];

const SOURCE_LABELS: Record<ReviewSourceKind, string> = {
  postr: 'Postr poster',
  pdf: 'PDF',
  pptx: 'Slides',
  image: 'Image',
};

const STAGE_LABELS: Record<'initial' | 'followup' | 'closed', string> = {
  initial: 'Initial review',
  followup: 'Follow-up',
  closed: 'Closed',
};

/** User-facing copy for each typed ingest failure (never a silent truncation). */
const INGEST_ERROR_MESSAGES: Record<IngestErrorKind, string> = {
  'too-many-pages':
    'That file has more than 24 pages — trim it to 24 pages or fewer and try again.',
  'unsupported-mime':
    'That file type is not supported — upload a PDF, PPTX, PNG, or JPG.',
  'file-too-large':
    'That file is too large to review — export a lighter copy and try again.',
  'unreadable-file':
    "We couldn't read that file — try exporting it again from the app that made it.",
  'blank-render':
    'That file rendered blank — check it opens correctly and try again.',
  'upload-failed':
    'Something went wrong uploading your file. Try again, or use Send Feedback if it keeps happening.',
  'server-render-failed':
    'Something went wrong preparing your file. Try again, or use Send Feedback if it keeps happening.',
};

function critiqueErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    // 429 arrives with the human wait already in the message (Task 23).
    if (err.status === 429) return err.message;
    if (err.message === 'too_many_pages') {
      return 'That file has more than 24 pages — trim it to 24 pages or fewer and try again.';
    }
    if (err.message === 'image_too_large') {
      return 'One of the page images is too large to review — export a lighter copy and try again.';
    }
    if (err.message === 'review_closed') {
      return 'That review is already closed — start a new one instead.';
    }
    if (err.message === 'review_not_complete') {
      return 'That review is not ready for its follow-up yet — run the initial review first.';
    }
  }
  return 'Something went wrong reviewing your file. Try again, or use Send Feedback if it keeps happening.';
}

export default function PresentationChecker() {
  useDocumentMeta(APP_ROUTE_META['/presentation-checker'] ?? null);
  const plan = usePlan();

  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<NormalizedArtifact | null>(null);
  const [sourcePosterId, setSourcePosterId] = useState<string | null>(null);
  const [result, setResult] = useState<CritiqueResponse | null>(null);
  const [paywall, setPaywall] = useState<ReviewPaymentRequiredError | null>(null);
  const [followupConfirm, setFollowupConfirm] = useState(false);
  const [pendingFollowup, setPendingFollowup] = useState(false);
  const [activeRegion, setActiveRegion] = useState<{
    page: number;
    bbox: [number, number, number, number];
  } | null>(null);
  const [pastReviews, setPastReviews] = useState<PosterReviewSummary[]>([]);
  const [myPosters, setMyPosters] = useState<PosterListRow[]>([]);
  const [pickedPosterId, setPickedPosterId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refreshHistory() {
    try {
      setPastReviews(await listMyReviews());
    } catch (err) {
      console.error('[review] history read failed:', err);
    }
  }

  async function refreshPosters() {
    try {
      setMyPosters(await listPosters());
    } catch (err) {
      console.error('[review] poster list read failed:', err);
    }
  }

  useEffect(() => {
    if (plan.loading || plan.isGuest) return;
    void refreshHistory();
    void refreshPosters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.loading, plan.isGuest]);

  /**
   * The one path every review takes: ingest → critique. Ingest failures
   * map to their typed messages; critique failures map 402 → paywall
   * and everything else to a generic line (the error itself is always
   * console-logged first — the export-flow house rule).
   */
  async function startReview(
    job: () => Promise<NormalizedArtifact>,
    opts: { posterId?: string; reviewId?: string } = {},
  ) {
    setPaywall(null);
    setErrorMessage(null);
    setActiveRegion(null);
    setPhase('ingesting');
    let art: NormalizedArtifact;
    try {
      art = await job();
    } catch (err) {
      console.error('[review] ingest failed:', err);
      setErrorMessage(
        err instanceof IngestError
          ? INGEST_ERROR_MESSAGES[err.kind]
          : 'Something went wrong reading that file. Try again, or use Send Feedback if it keeps happening.',
      );
      setPhase('error');
      return;
    }
    setArtifact(art);
    setSourcePosterId(opts.posterId ?? null);
    setPhase('reviewing');
    try {
      const res = await requestCritique({
        sourceKind: art.meta.sourceKind,
        filename: art.meta.filename,
        pages: art.pages.map((p) => ({
          pageNumber: p.pageNumber,
          url: p.signedUrl,
          widthPx: p.widthPx,
          heightPx: p.heightPx,
        })),
        posterDoc: art.posterDoc,
        posterId: opts.posterId,
        reviewId: opts.reviewId,
      });
      setResult(res);
      setFollowupConfirm(false);
      setPendingFollowup(false);
      setPhase('done');
      void refreshHistory();
    } catch (err) {
      if (err instanceof ReviewPaymentRequiredError) {
        // The paywall replaces the working view; the artifact stays in
        // state so a successful purchase can simply re-run.
        setPaywall(err);
        setPhase('idle');
        return;
      }
      console.error('[review] critique failed:', err);
      setErrorMessage(critiqueErrorMessage(err));
      setPhase('error');
    }
  }

  async function handleFile(file: File) {
    await startReview(() => ingestFileForReview(file), {
      reviewId: pendingFollowup ? result?.reviewId : undefined,
    });
  }

  async function runPosterReview(posterId: string) {
    const row = await loadPoster(posterId);
    if (!row) {
      setErrorMessage('That poster could not be loaded — it may have been deleted.');
      setPhase('error');
      return;
    }
    const doc: PosterDoc = row.data;
    await startReview(() => ingestPosterForReview({ doc, posterId }), {
      posterId,
    });
  }

  /** Follow-up on a Postr poster: re-read it fresh — the user revised. */
  async function runPosterFollowup() {
    if (!result || !sourcePosterId) return;
    const row = await loadPoster(sourcePosterId);
    if (!row) {
      setErrorMessage('That poster could not be loaded — it may have been deleted.');
      setPhase('error');
      return;
    }
    const doc: PosterDoc = row.data;
    const posterId = row.id;
    await startReview(() => ingestPosterForReview({ doc, posterId }), {
      posterId,
      reviewId: result.reviewId,
    });
  }

  function resetForNewReview() {
    setResult(null);
    setArtifact(null);
    setSourcePosterId(null);
    setFollowupConfirm(false);
    setPendingFollowup(false);
    setActiveRegion(null);
    setPhase('idle');
  }

  const busy = phase === 'ingesting' || phase === 'reviewing';

  return (
    <main className="flex min-h-screen w-screen flex-col bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 pb-8 pt-6">
        <h1 className="text-2xl font-bold text-white">Presentation Checker</h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Get feedback on your poster or talk — scores for narrative, design,
          and content, plus fix cards anchored to the exact spots to change.
        </p>

        {/* The ONE file input, always mounted: the follow-up's "Choose
            the revised file" button needs it during the results phase,
            when the upload card is no longer rendered. sr-only — every
            trigger is a real button that forwards the click. */}
        <input
          id="review-file"
          ref={fileInputRef}
          type="file"
          accept=".pdf,.pptx,.png,.jpg"
          aria-label="File to review"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset so picking the same file twice still fires.
            e.target.value = '';
            if (file) void handleFile(file);
          }}
        />

        {paywall ? (
          <ReviewPaywallPanel
            error={paywall}
            isGuest={plan.isGuest}
            hasActiveTerm={plan.hasActiveTerm}
            onDismiss={() => setPaywall(null)}
          />
        ) : phase === 'done' && result && artifact ? (
          <section aria-label="Review results" className="mt-5 flex flex-col gap-5">
            <ReviewScoreHeader scores={result.critique.dimensionScores} />

            <div className="rounded-lg border border-[#1f1f2e] bg-[#0d0d15] p-4">
              <h2 className="text-sm font-semibold text-[#e2e2e8]">
                How a first-time viewer reads it
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#c8cad0]">
                {result.critique.attentionSummary}
              </p>
            </div>

            {result.critique.prioritization && (
              <div className="rounded-md border border-[#7c6aed55] bg-[#17142a] px-4 py-3">
                <div className="text-xs font-bold uppercase tracking-wider text-[#9b8cf0]">
                  Priority call
                </div>
                <p className="mt-1 text-sm leading-relaxed text-[#e2e2e8]">
                  {result.critique.prioritization}
                </p>
              </div>
            )}

            {/* Page strip — region-anchored cards light up a bbox overlay
                here. bbox is normalized [x, y, w, h] fractions (D7). */}
            <div aria-label="Reviewed pages" className="flex gap-2 overflow-x-auto pb-1">
              {artifact.pages.map((p) => (
                <div key={p.pageNumber} className="relative shrink-0">
                  <img
                    src={p.signedUrl}
                    alt={`Page ${p.pageNumber}`}
                    className="block w-40 rounded border border-[#1f1f2e]"
                  />
                  {activeRegion && activeRegion.page === p.pageNumber && (
                    <div
                      data-testid="region-overlay"
                      className="pointer-events-none absolute rounded-sm border-2 border-[#f97316] bg-[#f9731622]"
                      style={{
                        left: `${activeRegion.bbox[0] * 100}%`,
                        top: `${activeRegion.bbox[1] * 100}%`,
                        width: `${activeRegion.bbox[2] * 100}%`,
                        height: `${activeRegion.bbox[3] * 100}%`,
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-[#e2e2e8]">
                Fix cards ({result.critique.findings.length})
              </h2>
              {SEVERITY_ORDER.map((sev) => {
                const items = result.critique.findings.filter(
                  (f) => f.severity === sev,
                );
                if (items.length === 0) return null;
                return (
                  <div key={sev} className="flex flex-col gap-2">
                    <div
                      className="text-xs font-bold uppercase tracking-wider"
                      style={{ color: SEVERITY_COLORS[sev] }}
                    >
                      {SEVERITY_LABELS[sev]} ({items.length})
                    </div>
                    {items.map((f, i) => {
                      const anchor = f.anchor;
                      const onJump =
                        anchor.kind === 'region'
                          ? () =>
                              setActiveRegion({
                                page: anchor.page,
                                bbox: anchor.bbox,
                              })
                          : undefined;
                      return (
                        <FindingCard
                          key={`${f.category}-${i}`}
                          finding={f}
                          onJump={onJump}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {result.stage === 'initial' ? (
              <section
                aria-label="Follow-up review"
                className="rounded-lg border border-[#1f1f2e] bg-[#0d0d15] p-4"
              >
                <h2 className="text-sm font-semibold text-[#e2e2e8]">
                  Your one follow-up
                </h2>
                {!followupConfirm ? (
                  <>
                    <p className="mt-1 text-sm leading-relaxed text-[#9ca3af]">
                      Revise against these cards, then run the follow-up — it
                      checks your revision against these exact findings.
                    </p>
                    <button
                      type="button"
                      onClick={() => setFollowupConfirm(true)}
                      className="mt-3 inline-flex min-h-11 items-center rounded-md border border-[#3a3a4e] px-4 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] hover:text-white"
                    >
                      Request your one follow-up
                    </button>
                  </>
                ) : (
                  <div role="note" className="mt-2">
                    <p className="text-sm font-semibold text-[#f9e2af]">
                      This is your one follow-up — the review closes after it.
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[#9ca3af]">
                      {sourcePosterId
                        ? 'Save your revisions in the editor first — the follow-up re-reads your poster as it is now.'
                        : 'Pick the revised file — the follow-up reads it against the findings above.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {sourcePosterId ? (
                        <button
                          type="button"
                          onClick={() => void runPosterFollowup()}
                          className="inline-flex min-h-11 items-center rounded-md bg-[#7c6aed] px-4 text-sm font-semibold text-white hover:brightness-110"
                        >
                          Run the follow-up on my poster
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setPendingFollowup(true);
                            fileInputRef.current?.click();
                          }}
                          className="inline-flex min-h-11 items-center rounded-md bg-[#7c6aed] px-4 text-sm font-semibold text-white hover:brightness-110"
                        >
                          Choose the revised file
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setFollowupConfirm(false)}
                        className="inline-flex min-h-11 items-center rounded-md border border-[#3a3a4e] px-4 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed]"
                      >
                        Not yet
                      </button>
                    </div>
                  </div>
                )}
              </section>
            ) : (
              <section
                aria-label="Review closed"
                className="rounded-lg border border-[#1f1f2e] bg-[#0d0d15] p-4"
              >
                <p className="text-sm leading-relaxed text-[#9ca3af]">
                  This review is closed — the follow-up was its last pass. A
                  fresh review uses a new credit.
                </p>
                <button
                  type="button"
                  onClick={resetForNewReview}
                  className="mt-3 inline-flex min-h-11 items-center rounded-md border border-[#3a3a4e] px-4 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] hover:text-white"
                >
                  Start a new review
                </button>
              </section>
            )}
          </section>
        ) : (
          <>
            <section
              aria-label="Start a review"
              className="mt-5 rounded-lg border border-[#1f1f2e] bg-[#0d0d15] p-5"
              {...busyProps(busy)}
            >
              {busy ? (
                <BusyIndicator
                  label={
                    phase === 'ingesting'
                      ? 'Preparing your file for review…'
                      : 'Reading your poster or talk…'
                  }
                  hint={
                    phase === 'ingesting'
                      ? 'Large files can take a moment.'
                      : 'A full review usually takes under a minute.'
                  }
                />
              ) : phase === 'error' && errorMessage ? (
                <div>
                  <p role="alert" className="text-sm text-[#fca5a5]">
                    {errorMessage}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPhase('idle')}
                    className="mt-3 inline-flex min-h-11 items-center rounded-md border border-[#3a3a4e] px-4 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] hover:text-white"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <>
                  <div className="block text-sm font-semibold text-[#e2e2e8]">
                    Upload a poster PDF, talk deck, or image
                  </div>
                  <p className="mt-1 text-xs text-[#6b7280]">
                    PDF, PPTX, PNG, or JPG — up to 24 pages. Nothing is
                    published; the review is only for you.
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 inline-flex min-h-11 items-center rounded-md bg-[#7c6aed] px-4 text-sm font-semibold text-white hover:brightness-110"
                  >
                    Choose a file
                  </button>

                  {!plan.isGuest && myPosters.length > 0 && (
                    <div className="mt-5 border-t border-[#1f1f2e] pt-4">
                      <label
                        htmlFor="review-poster"
                        className="block text-sm font-semibold text-[#e2e2e8]"
                      >
                        …or review one of your Postr posters
                      </label>
                      <div className="mt-2 flex gap-2">
                        <select
                          id="review-poster"
                          value={pickedPosterId}
                          onChange={(e) => setPickedPosterId(e.target.value)}
                          className="min-w-0 flex-1 rounded-md border border-[#3a3a4e] bg-[#111118] px-3 py-2 text-sm text-[#c8cad0]"
                        >
                          <option value="">Choose a poster…</option>
                          {myPosters.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title || 'Untitled poster'}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!pickedPosterId}
                          onClick={() => void runPosterReview(pickedPosterId)}
                          className="inline-flex min-h-11 shrink-0 items-center rounded-md bg-[#7c6aed] px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
                        >
                          Review this poster
                        </button>
                      </div>
                    </div>
                  )}

                  {plan.isGuest && (
                    <p className="mt-3 text-xs leading-relaxed text-[#6b7280]">
                      You&apos;re browsing as a guest — upload a file to start;
                      you&apos;ll create a free account to run the review.
                    </p>
                  )}
                </>
              )}
            </section>

            {!plan.isGuest && pastReviews.length > 0 && (
              <section aria-label="Your past reviews" className="mt-6">
                <h2 className="text-sm font-semibold text-[#e2e2e8]">
                  Your past reviews
                </h2>
                <ul className="mt-2 space-y-2">
                  {pastReviews.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[#1f1f2e] bg-[#0d0d15] px-3 py-2 text-xs text-[#9ca3af]"
                    >
                      <span className="font-semibold text-[#c8cad0]">
                        {r.filename ?? SOURCE_LABELS[r.sourceKind]}
                      </span>
                      <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                      <span>{STAGE_LABELS[r.stage]}</span>
                      {r.dimensionScores && (
                        <span>
                          Narrative {r.dimensionScores.narrative}/5 · Design{' '}
                          {r.dimensionScores.design}/5 · Content{' '}
                          {r.dimensionScores.content}/5
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
      <PublicFooter />
    </main>
  );
}

/**
 * The 402 paywall. Copy names what the user GETS (a scored review with
 * fix cards and a follow-up), never what they're blocked from, and
 * never says "AI" (D15). Guests route through the account-first flow
 * (stash + /auth?plan=…), exactly like the export paywall
 * (EditableExportButtons). The add-on button appears only for term
 * holders — without an active term the weekly quota unlocks nothing
 * (D4), so selling it there would be a dead end.
 */
function ReviewPaywallPanel({
  error,
  isGuest,
  hasActiveTerm,
  onDismiss,
}: {
  error: ReviewPaymentRequiredError;
  isGuest: boolean;
  hasActiveTerm: boolean;
  onDismiss: () => void;
}) {
  const navigate = useNavigate();
  const [checkoutFailed, setCheckoutFailed] = useState(false);
  const quotaHit = error.reason === 'weekly_quota_exceeded';

  async function buy(sku: 'review_pack' | 'review_addon') {
    if (isGuest) {
      stashCheckoutIntent(sku);
      navigate(`/auth?plan=${sku}`);
      return;
    }
    try {
      window.location.href = await createCheckout(sku);
    } catch (err) {
      console.error('[billing] review checkout failed:', err);
      setCheckoutFailed(true);
    }
  }

  return (
    <section
      aria-label="Unlock reviews"
      className="mt-5 rounded-lg border border-[#3a3050] bg-[#17141f] p-5"
    >
      <h2 className="text-base font-semibold text-[#e2e2e8]">
        Get feedback on your poster or talk
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[#9ca3af]">
        A review scores your narrative, design, and content, then walks you
        through fix cards anchored to the exact spots to change — each with
        a rewritten example from your own content. One follow-up review is
        included, so you can check your revision.
      </p>
      {quotaHit && (
        <p
          role="status"
          className="mt-3 rounded-md border border-[#eab30833] bg-[#eab30811] px-3 py-2 text-xs text-[#eab308]"
        >
          You&apos;ve used this week&apos;s reviews
          {error.retryAfterSec
            ? ` — your next weekly review opens up in ${formatRetryAfter(error.retryAfterSec)}`
            : ''}
          . A review pack works right away.
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void buy('review_pack')}
          className="inline-flex min-h-11 items-center rounded-md bg-[#5641b8] px-4 text-sm font-semibold text-white hover:bg-[#4c39a6]"
        >
          Get the review pack
        </button>
        {hasActiveTerm ? (
          <button
            type="button"
            onClick={() => void buy('review_addon')}
            className="inline-flex min-h-11 items-center rounded-md border border-[#3a3050] bg-[#1a1a26] px-4 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed]"
          >
            Add weekly reviews to your term
          </button>
        ) : (
          <span className="text-xs leading-relaxed text-[#6b7280]">
            The weekly review add-on rides on the semester term —{' '}
            <a href="/pricing" className="text-[#9b8cf0]">
              start the term
            </a>{' '}
            to add it.
          </span>
        )}
      </div>
      {isGuest && (
        <p className="mt-3 text-xs leading-relaxed text-[#8b8f99]">
          You&apos;re working as a guest — you&apos;ll create a free account
          (or sign in with Google) first, so your purchase and reviews stay
          yours across devices.
        </p>
      )}
      {checkoutFailed && (
        <p role="alert" className="mt-3 text-xs text-[#fca5a5]">
          Something went wrong starting checkout. Try again, or use Send
          Feedback so we can look into it.
        </p>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="mt-4 text-xs text-[#6b7280] underline hover:text-[#c8cad0]"
      >
        Back to the upload
      </button>
    </section>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace=apps/web -- PresentationChecker`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/PresentationChecker.tsx apps/web/src/review/FindingCards.tsx apps/web/src/pages/__tests__/PresentationChecker.test.tsx
git commit -m "feat(review): /presentation-checker page + shared finding cards, paywall, disclosed follow-up"
```

### Task 25: `ReviewTab` sidebar panel

**Files:**
- Create: `apps/web/src/poster/sidebar/ReviewTab.tsx`
- Modify: `apps/web/src/poster/Sidebar.tsx` (tab union, rail entry, panel block, auto-switch exemption, import)
- Test: `apps/web/src/poster/__tests__/ReviewTab.test.tsx`

**Interfaces:**
- Consumes: `FindingCard`, `ReviewScoreHeader`, `SEVERITY_LABELS`, `SEVERITY_COLORS` from `@/review/FindingCards` (Task 24); `requestCritique`, `ReviewPaymentRequiredError`, `CritiqueResponse` from `@/review/reviewApi` (Task 23); `usePlan` (`canReview`, `isGuest`, `hasActiveTerm` — Task 23); `createCheckout`, `stashCheckoutIntent` (Task 23 SKUs); `usePosterStore` (`doc`, `posterId` — the EditableExportButtons direct-read pattern); `ingestPosterForReview(input: { doc: PosterDoc; posterId: string }): Promise<NormalizedArtifact>` from `@/review/ingest` (Task 22 barrel); `ReviewAnchor`, `ReviewSeverity` types from `@postr/shared` (Task 9); `SidebarProps.onJumpToBlock` / `SidebarProps.posterId` — both already in scope (`Sidebar.tsx:205`, `:212`), so NO new props are threaded; the tab reads the poster id from the store.
- Produces: `ReviewTab({ onJumpToBlock?: (blockId: string) => void })`; the `'review'` `SidebarTab` value.

- [ ] **Step 1: Write the failing ReviewTab test**

`apps/web/src/poster/__tests__/ReviewTab.test.tsx`:

```tsx
/**
 * ReviewTab — the editor's Presentation Checker panel, tested in
 * isolation: the poster store is seeded directly (the
 * EditableExportButtons.test.tsx convention), and reviewApi / ingest /
 * usePlan / billing / checkout-intent are module-mocked. The mocked
 * ReviewPaymentRequiredError class keeps `instanceof` working because
 * the component and the test share the same mocked binding.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ReviewTab } from '../sidebar/ReviewTab';
import { usePosterStore } from '@/stores/posterStore';

const { requestCritiqueMock, ingestMock } = vi.hoisted(() => ({
  requestCritiqueMock: vi.fn(),
  ingestMock: vi.fn(),
}));

vi.mock('@/review/reviewApi', () => ({
  requestCritique: requestCritiqueMock,
  ReviewPaymentRequiredError: class extends Error {
    readonly reason: string;
    readonly retryAfterSec?: number;
    constructor(reason: string, retryAfterSec?: number) {
      super('review_payment_required');
      this.name = 'ReviewPaymentRequiredError';
      this.reason = reason;
      this.retryAfterSec = retryAfterSec;
    }
  },
}));

vi.mock('@/review/ingest', () => ({ ingestPosterForReview: ingestMock }));

const planState = {
  value: {
    loading: false,
    hasActiveTerm: true,
    credits: 0,
    reviewCredits: 1,
    hasReviewAddon: false,
    canReview: true,
    canExport: true,
    isGuest: false,
    subscriptionStatus: 'active' as string | null,
  },
};
vi.mock('@/hooks/usePlan', () => ({ usePlan: () => planState.value }));

vi.mock('@/data/billing', () => ({ createCheckout: vi.fn() }));
vi.mock('@/data/checkoutIntent', () => ({ stashCheckoutIntent: vi.fn() }));

import { ReviewPaymentRequiredError } from '@/review/reviewApi';

const DOC = {
  version: 1,
  widthIn: 48,
  heightIn: 36,
  blocks: [
    {
      id: 'block-1',
      type: 'text',
      x: 10,
      y: 10,
      w: 400,
      h: 120,
      content: '<p>Background filler</p>',
      imageSrc: null,
      imageFit: 'contain',
      tableData: null,
    },
  ],
  fontFamily: 'Inter',
  palette: {
    bg: '#ffffff',
    primary: '#0f172a',
    accent: '#2563eb',
    accent2: '#0ea5e9',
    muted: '#64748b',
    headerBg: '#0f172a',
    headerFg: '#ffffff',
  },
  styles: {
    title: { size: 72, weight: 700, italic: false, lineHeight: 1.1, color: null, highlight: null },
    heading: { size: 28, weight: 600, italic: false, lineHeight: 1.2, color: null, highlight: null },
    authors: { size: 18, weight: 400, italic: false, lineHeight: 1.3, color: null, highlight: null },
    body: { size: 14, weight: 400, italic: false, lineHeight: 1.4, color: null, highlight: null },
  },
  headingStyle: { border: 'bottom', fill: false, align: 'left' },
  institutions: [],
  authors: [],
  references: [],
};

const ARTIFACT = {
  pages: [
    {
      pageNumber: 1,
      storagePath: 'user-1/poster-1/review-capture.jpg',
      signedUrl:
        'https://example.supabase.co/storage/v1/object/sign/poster-assets/user-1/poster-1/review-capture.jpg?token=x',
      widthPx: 2048,
      heightPx: 1536,
    },
  ],
  posterDoc: DOC,
  meta: {
    sourceKind: 'postr' as const,
    pageCount: 1,
    ingestedAt: '2026-07-29T10:00:00Z',
  },
};

const CRITIQUE = {
  reviewId: 'rev-1',
  stage: 'initial' as const,
  critique: {
    dimensionScores: { narrative: 3, design: 2, content: 4 },
    attentionSummary: 'The eye lands on the background paragraph first.',
    findings: [
      {
        dimension: 'narrative' as const,
        severity: 'high' as const,
        category: 'buried-key-result' as const,
        anchor: { kind: 'block' as const, blockId: 'block-1' },
        action: 'condense' as const,
        problem: 'The background block outranks the key result.',
        fix: 'Condense the background to two lines and lead with the result.',
        example: 'Cut "Sleep has been studied since…" down to "Sleep loss impairs recall."',
      },
    ],
  },
};

function seedPoster() {
  usePosterStore.setState({
    posterId: 'poster-1',
    posterTitle: 'Test poster',
    doc: DOC,
  } as never);
}

beforeEach(() => {
  seedPoster();
  requestCritiqueMock.mockReset();
  ingestMock.mockReset();
  ingestMock.mockResolvedValue(ARTIFACT);
  planState.value = {
    loading: false,
    hasActiveTerm: true,
    credits: 0,
    reviewCredits: 1,
    hasReviewAddon: false,
    canReview: true,
    canExport: true,
    isGuest: false,
    subscriptionStatus: 'active',
  };
});

describe('ReviewTab', () => {
  it('run renders the score header and finding cards from the fromPoster ingest', async () => {
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    render(
      <MemoryRouter>
        <ReviewTab />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Review this poster'));

    // The ingest ran off the store's doc + posterId…
    expect(ingestMock).toHaveBeenCalledWith({ doc: DOC, posterId: 'poster-1' });
    // …and the critique carried the postr sourceKind, mapped page refs,
    // and the structured doc.
    expect(requestCritiqueMock).toHaveBeenCalledWith({
      sourceKind: 'postr',
      pages: [
        {
          pageNumber: 1,
          url: ARTIFACT.pages[0]!.signedUrl,
          widthPx: 2048,
          heightPx: 1536,
        },
      ],
      posterDoc: DOC,
      posterId: 'poster-1',
      reviewId: undefined,
    });
    expect(await screen.findByTestId('score-design')).toHaveTextContent('2/5');
    expect(
      screen.getByText('The background block outranks the key result.'),
    ).toBeTruthy();
    expect(
      screen.getByText(/Sleep loss impairs recall/i),
    ).toBeTruthy();
  });

  it('clicking a block-anchored card calls onJumpToBlock with the blockId', async () => {
    requestCritiqueMock.mockResolvedValue(CRITIQUE);
    const onJumpToBlock = vi.fn();
    render(
      <MemoryRouter>
        <ReviewTab onJumpToBlock={onJumpToBlock} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('Review this poster'));
    await screen.findByTestId('score-design');

    fireEvent.click(
      screen.getByText('The background block outranks the key result.'),
    );

    expect(onJumpToBlock).toHaveBeenCalledWith('block-1');
  });

  it('a user who cannot review sees the paywall instead of the run button', () => {
    planState.value = { ...planState.value, canReview: false, reviewCredits: 0 };
    render(
      <MemoryRouter>
        <ReviewTab />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Get feedback on your poster/i)).toBeTruthy();
    expect(screen.getByText(/Get the review pack/i)).toBeTruthy();
    expect(screen.queryByText('Review this poster')).toBeNull();
    expect(requestCritiqueMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- ReviewTab`
Expected: FAIL — module `../sidebar/ReviewTab` does not exist.

- [ ] **Step 3: Write the ReviewTab component**

`apps/web/src/poster/sidebar/ReviewTab.tsx`:

```tsx
/**
 * ReviewTab — the Presentation Checker inside the editor (spec §1: the
 * Postr-native poster is the richest input — the review gets both the
 * rendered capture AND the structured PosterDoc).
 *
 * Runs a review of the CURRENT poster: capture + upload via the ingest
 * layer, critique via the review API, then the same shared score header
 * and finding cards the /presentation-checker page shows — a
 * block-anchored card jumps straight to its block via onJumpToBlock.
 * One follow-up per review, disclosed up front ("This is your one
 * follow-up — the review closes after it."); then the review closes and
 * a fresh review needs a new credit.
 *
 * Lives in its own file rather than inside Sidebar.tsx (the IssuesTab
 * pattern) because the review flow carries real state — ingest,
 * request, paywall, follow-up — that needs isolated tests, and
 * Sidebar.tsx is already ~4.3k lines.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { ReviewAnchor, ReviewSeverity } from '@postr/shared';
import { BusyIndicator, busyProps } from '@/components/BusyIndicator';
import { usePosterStore } from '@/stores/posterStore';
import { usePlan } from '@/hooks/usePlan';
import { formatRetryAfter } from '@/lib/apiClient';
import { createCheckout } from '@/data/billing';
import { stashCheckoutIntent } from '@/data/checkoutIntent';
import { ingestPosterForReview } from '@/review/ingest';
import {
  requestCritique,
  ReviewPaymentRequiredError,
  type CritiqueResponse,
} from '@/review/reviewApi';
import {
  FindingCard,
  ReviewScoreHeader,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
} from '@/review/FindingCards';

const SEVERITY_ORDER: ReviewSeverity[] = ['high', 'medium', 'low'];

const primaryButton: React.CSSProperties = {
  padding: '12px 16px',
  background: '#5641b8',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
  textAlign: 'center',
  width: '100%',
};

const secondaryButton: React.CSSProperties = {
  padding: '10px 14px',
  background: '#1a1a26',
  color: '#c8cad0',
  border: '1px solid #3a3050',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};

export function ReviewTab({
  onJumpToBlock,
}: {
  onJumpToBlock?: (blockId: string) => void;
}) {
  const doc = usePosterStore((s) => s.doc);
  const posterId = usePosterStore((s) => s.posterId);
  const plan = usePlan();
  const navigate = useNavigate();

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CritiqueResponse | null>(null);
  const [paywall, setPaywall] = useState<ReviewPaymentRequiredError | null>(null);
  const [failed, setFailed] = useState(false);
  const [checkoutFailed, setCheckoutFailed] = useState(false);
  const [followupConfirm, setFollowupConfirm] = useState(false);

  async function run(reviewId?: string) {
    if (!doc || !posterId || running) return;
    setRunning(true);
    setFailed(false);
    setPaywall(null);
    try {
      const art = await ingestPosterForReview({ doc, posterId });
      const res = await requestCritique({
        sourceKind: 'postr',
        pages: art.pages.map((p) => ({
          pageNumber: p.pageNumber,
          url: p.signedUrl,
          widthPx: p.widthPx,
          heightPx: p.heightPx,
        })),
        posterDoc: art.posterDoc ?? doc,
        posterId,
        reviewId,
      });
      setResult(res);
      setFollowupConfirm(false);
    } catch (err) {
      if (err instanceof ReviewPaymentRequiredError) {
        setPaywall(err);
        return;
      }
      console.error('[review] poster review failed:', err);
      setFailed(true);
    } finally {
      setRunning(false);
    }
  }

  async function buy(sku: 'review_pack' | 'review_addon') {
    // A guest cannot check out — the account-first flow (same as the
    // export paywall) creates the permanent account and resumes
    // checkout for this sku.
    if (plan.isGuest) {
      stashCheckoutIntent(sku);
      navigate(`/auth?plan=${sku}`);
      return;
    }
    try {
      window.location.href = await createCheckout(sku);
    } catch (err) {
      console.error('[billing] review checkout failed:', err);
      setCheckoutFailed(true);
    }
  }

  function jumpFor(anchor: ReviewAnchor): (() => void) | undefined {
    if (anchor.kind !== 'block' || !onJumpToBlock) return undefined;
    const blockId = anchor.blockId;
    return () => onJumpToBlock(blockId);
  }

  // Two gates, one panel: the plan pre-gate (saves a wasted capture)
  // and the server's 402 (authoritative, D4). The pre-gate only applies
  // with no result on screen — a user mid-review must always see their
  // findings and their INCLUDED follow-up, even at zero credits. Never
  // flashes while the plan loads (the export-paywall rule).
  if (paywall || (!plan.loading && !plan.canReview && !result)) {
    return (
      <PaywallPanel
        error={paywall ?? new ReviewPaymentRequiredError('no_credit')}
        hasActiveTerm={plan.hasActiveTerm}
        checkoutFailed={checkoutFailed}
        onBuy={(sku) => void buy(sku)}
      />
    );
  }

  return (
    <div
      {...busyProps(running)}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      {!result && (
        <>
          <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, margin: 0 }}>
            Get a scored review of this poster — narrative, design, and
            content — with fix cards that jump to the block they affect. One
            follow-up is included.
          </p>
          <button
            type="button"
            disabled={!doc || !posterId || running}
            onClick={() => void run()}
            style={{
              ...primaryButton,
              opacity: !doc || !posterId || running ? 0.65 : 1,
            }}
          >
            {running ? (
              <BusyIndicator inline label="Reading your poster…" />
            ) : (
              'Review this poster'
            )}
          </button>
          <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
            Uses one review credit, or your weekly add-on review.
          </div>
        </>
      )}

      {failed && (
        <div role="alert" style={{ fontSize: 12, color: '#fca5a5', lineHeight: 1.5 }}>
          Something went wrong. Try again, or use Send Feedback so we can look
          into it.
        </div>
      )}

      {result && (
        <>
          <ReviewScoreHeader scores={result.critique.dimensionScores} />

          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
              }}
            >
              How a first-time viewer reads it
            </div>
            <p style={{ fontSize: 13, color: '#c8cad0', lineHeight: 1.55, margin: '6px 0 0' }}>
              {result.critique.attentionSummary}
            </p>
          </div>

          {result.critique.prioritization && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #7c6aed55',
                background: '#17142a',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#9b8cf0',
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                }}
              >
                Priority call
              </div>
              <div style={{ fontSize: 13, color: '#e2e2e8', lineHeight: 1.5, marginTop: 4 }}>
                {result.critique.prioritization}
              </div>
            </div>
          )}

          {SEVERITY_ORDER.map((sev) => {
            const items = result.critique.findings.filter(
              (f) => f.severity === sev,
            );
            if (items.length === 0) return null;
            return (
              <div key={sev} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: SEVERITY_COLORS[sev],
                    textTransform: 'uppercase',
                    letterSpacing: 0.8,
                  }}
                >
                  {SEVERITY_LABELS[sev]} ({items.length})
                </div>
                {items.map((f, i) => (
                  <FindingCard
                    key={`${f.category}-${i}`}
                    finding={f}
                    onJump={jumpFor(f.anchor)}
                  />
                ))}
              </div>
            );
          })}

          {result.stage === 'initial' ? (
            <div style={{ borderTop: '1px solid #1f1f2e', paddingTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e2e8' }}>
                Your one follow-up
              </div>
              {!followupConfirm ? (
                <>
                  <p style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.5, margin: '6px 0 0' }}>
                    Revise the poster, then run the follow-up — it checks your
                    revision against these exact findings.
                  </p>
                  <button
                    type="button"
                    onClick={() => setFollowupConfirm(true)}
                    style={{ ...secondaryButton, marginTop: 8 }}
                  >
                    Request your one follow-up
                  </button>
                </>
              ) : (
                <div role="note" style={{ marginTop: 6 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: '#f9e2af', margin: 0 }}>
                    This is your one follow-up — the review closes after it.
                  </p>
                  <p style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5, margin: '6px 0 0' }}>
                    The follow-up re-reads your poster exactly as it is now —
                    make your edits first.
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => void run(result.reviewId)}
                      style={secondaryButton}
                    >
                      {running ? (
                        <BusyIndicator inline label="Reading your poster…" />
                      ) : (
                        'Run the follow-up'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFollowupConfirm(false)}
                      style={secondaryButton}
                    >
                      Not yet
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ borderTop: '1px solid #1f1f2e', paddingTop: 12 }}>
              <p style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.5, margin: 0 }}>
                This review is closed — the follow-up was its last pass. A
                fresh review uses a new credit.
              </p>
              <button
                type="button"
                disabled={running}
                onClick={() => void run()}
                style={{ ...secondaryButton, marginTop: 8 }}
              >
                Start a new review
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The paywall state — reached from the plan pre-gate or a 402. Copy
 * names what the review DOES, never "AI" (D15). The add-on button
 * appears only for term holders: without an active term the weekly
 * quota unlocks nothing (D4), so selling it there would be a dead end.
 */
function PaywallPanel({
  error,
  hasActiveTerm,
  checkoutFailed,
  onBuy,
}: {
  error: ReviewPaymentRequiredError;
  hasActiveTerm: boolean;
  checkoutFailed: boolean;
  onBuy: (sku: 'review_pack' | 'review_addon') => void;
}) {
  const quotaHit = error.reason === 'weekly_quota_exceeded';
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 8,
        border: '1px solid #3a3050',
        background: '#17141f',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e2e8', marginBottom: 4 }}>
        Get feedback on your poster
      </div>
      <div style={{ fontSize: 12.5, color: '#9ca3af', lineHeight: 1.5 }}>
        A review scores narrative, design, and content, then gives you fix
        cards that jump to the exact block to change — each with a rewritten
        example from your own poster. One follow-up review is included.
      </div>
      {quotaHit && (
        <div
          role="status"
          style={{ marginTop: 8, fontSize: 12, color: '#eab308', lineHeight: 1.5 }}
        >
          You&apos;ve used this week&apos;s reviews
          {error.retryAfterSec
            ? ` — your next weekly review opens up in ${formatRetryAfter(error.retryAfterSec)}`
            : ''}
          . A review pack works right away.
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" onClick={() => onBuy('review_pack')} style={secondaryButton}>
          Get the review pack
        </button>
        {hasActiveTerm && (
          <button type="button" onClick={() => onBuy('review_addon')} style={secondaryButton}>
            Add weekly reviews
          </button>
        )}
      </div>
      {checkoutFailed && (
        <div role="alert" style={{ marginTop: 8, fontSize: 12, color: '#fca5a5' }}>
          Something went wrong starting checkout. Try again, or use Send
          Feedback so we can look into it.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/web -- ReviewTab`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the tab into Sidebar.tsx**

Five edits to `apps/web/src/poster/Sidebar.tsx`. `onJumpToBlock` (`:205`) and `posterId` (`:212`) already exist in `SidebarProps` — ReviewTab takes the jump handler as a prop and reads the poster id from the store itself, so no prop threading is needed.

Edit 1 — the import (after `import { EditableExportButtons } from './sidebar/EditableExportButtons';`, :63):

```ts
import { ReviewTab } from './sidebar/ReviewTab';
```

Edit 2 — the `SidebarTab` union (:71-82) gains `'review'` after `'issues'`:

```ts
export type SidebarTab =
  | 'layout'
  | 'authors'
  | 'refs'
  | 'style'
  | 'edit'
  | 'insert'
  | 'check'
  | 'issues'
  | 'review'
  | 'comments'
  | 'versions'
  | 'export';
```

Edit 3 — the auto-switch exemption (:327-344): the effect that routes block selection to a tab must never fire while the Review tab is open (the user clicks findings to jump to blocks; each jump selects a block and would otherwise bounce the sidebar to Edit). Insert after the existing `check`-tab exemption (:334):

```ts
    if ((t === 'image' || t === 'chart') && tab === 'check') return;
    // The Review tab is never yanked away on selection: the user is
    // reading findings and clicking them to jump to blocks — each jump
    // selects a block, and without this exemption the first click would
    // bounce the sidebar straight back to Edit.
    if (tab === 'review') return;
```

Edit 4 — the rail array (:606-657) gains the entry after `['issues', 'issues'],`:

```ts
                  ['check', 'figure'],
                  ['issues', 'issues'],
                  ['review', 'review'],
                  ['comments', 'comments'],
```

Edit 5 — the panel block, after the `issues` block (:761-766):

```tsx
        {tab === 'issues' && (
          <IssuesTab
            issues={props.issues}
            onJumpToBlock={props.onJumpToBlock}
          />
        )}

        {tab === 'review' && (
          <ReviewTab onJumpToBlock={props.onJumpToBlock} />
        )}
```

- [ ] **Step 6: Re-run the tab tests and typecheck the wiring**

Run:

```bash
npm test --workspace=apps/web -- ReviewTab
npm run build
```

Expected: PASS (3 tests); the monorepo build typechecks the Sidebar wiring.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/poster/sidebar/ReviewTab.tsx apps/web/src/poster/Sidebar.tsx apps/web/src/poster/__tests__/ReviewTab.test.tsx
git commit -m "feat(review): editor ReviewTab — fromPoster review, block-anchor jumps, paywall, disclosed follow-up"
```

### Task 26: Route + SEO wiring

**Files:**
- Modify: `apps/web/src/routes.tsx` (lazy page + public route after `/paper-to-poster` + header-comment entry)
- Modify: `apps/web/src/seo/routes.json` (`app` noindex record — D12: registered, NOT linked from nav and NOT prerendered)
- Modify: `apps/web/vercel.json` (rewrite to `/` + `X-Robots-Tag` header — app routes have no prerendered file, so without the rewrite the route 404s in production)
- Test: `apps/web/src/__tests__/routes.test.tsx`
- Test: `apps/web/src/seo/__tests__/vercelRouting.test.ts` (it enumerates client routes in `CLIENT_ROUTES` — update both together, per the file's own contract)

**Interfaces:**
- Consumes: default-export `PresentationChecker` (Task 24); `APP_ROUTE_META` shape (an `AppRouteRecord` — title/description/robots only, no h1/copy).
- Produces: the public `/presentation-checker` route; `APP_ROUTE_META['/presentation-checker']` consumed by the page's `useDocumentMeta`. No nav links anywhere (D12) — the Milestone-6 launch checklist owns flipping the record to `static` and adding links.

- [ ] **Step 1: Write the failing route assertions**

`apps/web/src/__tests__/routes.test.tsx` — two additions.

Addition 1 — at the top, extend the vitest import and stub the heavy page (the page's own behaviour is pinned by `pages/__tests__/PresentationChecker.test.tsx`; this file pins ROUTING only):

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../routes';

// The presentation-checker page pulls in the review API client and the
// ingest layer; routing behaviour doesn't need them.
vi.mock('@/pages/PresentationChecker', () => ({
  default: () => <h1>Presentation Checker</h1>,
}));
```

Addition 2 — a new describe block at the end of the file:

```tsx
describe('presentation checker route', () => {
  it('serves /presentation-checker publicly — registered, not redirected', async () => {
    renderAt('/presentation-checker');

    expect(
      await screen.findByRole('heading', {
        name: /presentation checker/i,
        level: 1,
      }),
    ).toBeInTheDocument();
    // …and the URL stays put (no alias redirect).
    expect(await screen.findByTestId('location-probe')).toHaveTextContent(
      /^\/presentation-checker$/,
    );
  });
});
```

`apps/web/src/seo/__tests__/vercelRouting.test.ts` — add the route to `CLIENT_ROUTES` (the file's contract: it mirrors the `<Route path=…>` entries). The existing `it.each(CLIENT_ROUTES)('%s is served (prerender or rewrite)')` then asserts vercel.json coverage for it:

```ts
const CLIENT_ROUTES = [
  '/',
  '/about',
  '/gallery',
  '/gallery/:entryId',
  '/privacy',
  '/cookies',
  '/terms',
  '/auth',
  '/s/:slug',
  '/dashboard',
  '/p/:posterId',
  '/profile',
  '/admin/gallery',
  '/presentation-checker',
];
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=apps/web -- routes vercelRouting`
Expected: FAIL — `routes.test.tsx` finds no `Presentation Checker` heading (the path falls through to `*`/NotFound), and `vercelRouting.test.ts` reports `/presentation-checker has no prerendered file and no rewrite — it would 404 in production`.

- [ ] **Step 3: Register the route**

`apps/web/src/routes.tsx` — three edits.

Edit 1 — the header comment's route list, after the `/paper-to-poster` line:

```
 *   /paper-to-poster    → Paper→poster standalone flow (public, code-split)
 *   /presentation-checker → Presentation Checker review flow (public,
 *                           code-split, noindex; registered but not
 *                           linked from nav — D12)
```

Edit 2 — the lazy import, after the `PaperToPoster` one:

```ts
const PaperToPoster = lazy(() => import('@/pages/PaperToPoster'));
// Presentation Checker — the review upload surface. Kept out of the
// initial bundle for the same reason as the other standalone tools.
const PresentationChecker = lazy(() => import('@/pages/PresentationChecker'));
```

Edit 3 — the route, immediately after `/paper-to-poster`:

```tsx
        <Route path="/paper-to-poster" element={<PaperToPoster />} />
        {/* Presentation Checker — public but noindex (D12): registered
            now, deliberately NOT linked from nav; the indexed static
            record + nav links are the Milestone-6 launch checklist. */}
        <Route path="/presentation-checker" element={<PresentationChecker />} />
```

- [ ] **Step 4: Add the SEO record and the vercel.json coverage**

`apps/web/src/seo/routes.json` — an `app` record (noindex; no h1/copy — those are static-record fields), inserted after the `"/profile"` block. Title is the measured-keyword phrasing from spec §8; copy names the workflow, never "AI" (D15):

```json
    "/presentation-checker": {
      "title": "Presentation Checker: Get Feedback on Your Poster or Talk | Postr",
      "description": "Upload a poster PDF, talk deck, or image — or pick one of your Postr posters — and get narrative, design, and content scores with anchored fix cards.",
      "robots": "noindex,nofollow"
    },
```

(The page already calls `useDocumentMeta(APP_ROUTE_META['/presentation-checker'] ?? null)` — Task 24 — so this record takes effect as soon as it lands.)

`apps/web/vercel.json` — two edits. The rewrite (after the `/billing/cancel` entry) serves the SPA shell at the route — app routes have no prerendered file, and there is deliberately no catch-all rewrite:

```json
    { "source": "/billing/success", "destination": "/" },
    { "source": "/billing/cancel", "destination": "/" },
    { "source": "/presentation-checker", "destination": "/" },
```

The `X-Robots-Tag` header (after the `/auth` header block) — belt-and-braces noindex alongside the runtime robots meta, matching every other app route:

```json
    {
      "source": "/presentation-checker",
      "headers": [{ "key": "X-Robots-Tag", "value": "noindex, nofollow" }]
    },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace=apps/web -- routes vercelRouting siteMeta`
Expected: PASS — the route renders publicly; the `CLIENT_ROUTES` coverage test finds the rewrite; the `APP_ROUTE_META` generic assertions (noindex, no canonical, no OG image) cover the new record automatically (no siteMeta test changes needed — only `STATIC_ROUTE_META` is hard-enumerated there).

- [ ] **Step 6: Full web suite + build**

Run:

```bash
npm test --workspace=apps/web
npm run build
```

Expected: every web suite passes; the monorepo build typechecks.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/routes.tsx apps/web/src/seo/routes.json apps/web/vercel.json apps/web/src/__tests__/routes.test.tsx apps/web/src/seo/__tests__/vercelRouting.test.ts
git commit -m "feat(review): register /presentation-checker route + noindex SEO record (D12)"
```

---

# MILESTONE 6 — Rollout + pre-ship gate

**Purpose:** prove the shipped flow end-to-end before anyone pays for it, then run the §7.1 pre-ship gate — the frozen 20 through the REAL production pipeline, agreement re-measured against Gavin's frozen ground truth, GO/NO-GO against the Task-7 criterion, and the launch flip. Everything here is verification + rollout plumbing; no new product code.

### Task 27: API flow E2E + rollout plumbing + docs hygiene

**Files:**
- Test: `apps/api/src/__tests__/reviewFlow.test.ts`
- Modify (conditional, D14 — only if present on main at execution time): `docs/feature-graph.md`, `docs/manual-test-flows.md`

**Interfaces:**
- Consumes: `createReviewRouter(deps)` + `ReviewRouterDeps { getSupabaseAdmin?, getAnthropic?, fetchFn?, weeklyLimiter?, now? }` from `apps/api/src/review.ts` (Tasks 15/16/18); `REVIEW_ADDON_WEEKLY_QUOTA` from `apps/api/src/review/config.ts` (Task 9); `createRateLimiter({ windowMs?, maxPerWindow?, dailyMs?, maxPerDay?, now? })` from `apps/api/src/rateLimit.ts`; the `POST /api/review/critique` contract (200 `{ reviewId, stage: 'initial' | 'closed', critique }`, 402 `{ error: 'review_payment_required', reason }`, 409 `{ error: 'review_closed' | 'review_not_complete' }`, 502 `{ error: 'review_upstream' | 'bad_model_output' }`); the §5.2 state machine (1 initial + 1 included follow-up, then `closed` terminal); D4 entitlement order; D5/D17 weekly-window semantics; D6/D16 no-charge-on-failure.
- Produces: the executable E2E gate of D13; the §6.2 rollout evidence (route dark per D12, `[review.critique]` cost line, dogfood order); the §6.3 docs updates.

- [ ] **Step 1: Write the flow test**

`apps/api/src/__tests__/reviewFlow.test.ts`:

```ts
/**
 * /api/review flow — the executable §5.2 state-machine gate (D13):
 *   initial critique (1 credit) → follow-up (INCLUDED — no second
 *   credit, no second weekly slot, §5.3) → closed → third critique 409s.
 * Plus the billing invariants that protect the moat:
 *   - no credit consumed and no poster_reviews row on model failure
 *     (D6/D16 — §5.3 "no credit consumed on ingest or model failure");
 *   - add-on weekly-window accounting: initials consume slots, the
 *     follow-up does not, quota exhaustion 402s, and sliding the
 *     injected clock past 7 days re-opens the window (D5/D17).
 * Supabase is ONE stateful in-memory fake (poster_reviews store + users
 * billing row + consume_review_credit semantics mirroring the
 * export-credit RPC it was copied from); Anthropic is mocked at the SDK
 * layer (the importExtract.test.ts pattern); page bytes come from an
 * injected fetchFn, exactly like the import router tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createReviewRouter } from '../review.js';
import { createRateLimiter } from '../rateLimit.js';
import { REVIEW_ADDON_WEEKLY_QUOTA } from '../review/config.js';

const SUPABASE_URL = 'https://testref.supabase.co';
const USER_ID = 'user-1';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** One signed-URL page ref on the allowlisted host (checkImageUrl). */
const ONE_PAGE = [
  {
    pageNumber: 1,
    url: `${SUPABASE_URL}/storage/v1/object/sign/poster-assets/temp/review/page-1.png?token=test`,
    widthPx: 2048,
    heightPx: 1152,
  },
];

// ---- Stateful fake Supabase ----------------------------------------------

interface FakeUserRow {
  id: string;
  plan: 'free' | 'term';
  plan_expires_at: string | null;
  subscription_status: string | null;
  review_credits: number;
  review_addon: boolean;
}

interface FakeReviewRow {
  id: string;
  user_id: string;
  poster_id: string | null;
  source_kind: string;
  source_meta: Record<string, unknown>;
  status: string;
  stage: string;
  initial_findings: unknown | null;
  followup_findings: unknown | null;
  credit_source: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

interface EqFilter {
  col: string;
  val: unknown;
}

function applyFilters<T extends Record<string, unknown>>(rows: T[], filters: EqFilter[]): T[] {
  return rows.filter((row) => filters.every((f) => String(row[f.col]) === String(f.val)));
}

/**
 * Serves the chains the review router uses: insert(...).select().single(),
 * select(...).eq(...).single()/maybeSingle(), update(...).eq(...), rpc(...).
 * Awaiting an insert/update directly resolves `{ error: null }`.
 */
function fakeReviewSupabase(userOverrides: Partial<FakeUserRow> = {}) {
  const users: FakeUserRow = {
    id: USER_ID,
    plan: 'free',
    plan_expires_at: null,
    subscription_status: null,
    review_credits: 0,
    review_addon: false,
    ...userOverrides,
  };
  const reviews = new Map<string, FakeReviewRow>();
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  let reviewSeq = 0;

  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: USER_ID, is_anonymous: false } },
        error: null,
      }),
    },
    from(table: string) {
      if (table === 'users') {
        return {
          select: (_cols?: string) => {
            const filters: EqFilter[] = [];
            const chain = {
              eq(col: string, val: unknown) {
                filters.push({ col, val });
                return chain;
              },
              single: async () => {
                const hit = applyFilters([users as unknown as Record<string, unknown>], filters)[0];
                return hit
                  ? { data: { ...hit }, error: null }
                  : { data: null, error: { code: 'PGRST116', message: '0 rows' } };
              },
              maybeSingle: async () => {
                const hit = applyFilters([users as unknown as Record<string, unknown>], filters)[0];
                return { data: hit ? { ...hit } : null, error: null };
              },
            };
            return chain;
          },
        };
      }
      if (table === 'poster_reviews') {
        return {
          insert(payload: Record<string, unknown>) {
            reviewSeq += 1;
            const now = new Date().toISOString();
            const row = {
              id: `review-${reviewSeq}`,
              user_id: USER_ID,
              poster_id: null,
              source_kind: 'image',
              source_meta: {},
              status: 'complete',
              stage: 'initial',
              initial_findings: null,
              followup_findings: null,
              credit_source: null,
              created_at: now,
              updated_at: now,
              ...payload,
            } as FakeReviewRow;
            reviews.set(row.id, row);
            return {
              select: (_cols?: string) => ({
                single: async () => ({ data: { ...row }, error: null }),
              }),
              then(onFulfilled?: (v: { error: null }) => unknown) {
                return Promise.resolve({ error: null }).then(onFulfilled);
              },
            };
          },
          select: (_cols?: string) => {
            const filters: EqFilter[] = [];
            const chain = {
              eq(col: string, val: unknown) {
                filters.push({ col, val });
                return chain;
              },
              single: async () => {
                const hit = applyFilters([...reviews.values()], filters)[0];
                return hit
                  ? { data: { ...hit }, error: null }
                  : { data: null, error: { code: 'PGRST116', message: '0 rows' } };
              },
              maybeSingle: async () => {
                const hit = applyFilters([...reviews.values()], filters)[0];
                return { data: hit ? { ...hit } : null, error: null };
              },
            };
            return chain;
          },
          update(payload: Record<string, unknown>) {
            updates.push({ table, payload });
            const filters: EqFilter[] = [];
            const apply = () => {
              for (const row of applyFilters([...reviews.values()], filters)) {
                Object.assign(row, payload);
              }
            };
            const chain = {
              eq(col: string, val: unknown) {
                filters.push({ col, val });
                apply();
                return chain;
              },
              then(onFulfilled?: (v: { error: null }) => unknown) {
                return Promise.resolve({ error: null }).then(onFulfilled);
              },
            };
            return chain;
          },
        };
      }
      throw new Error(`fake supabase: unexpected table "${table}"`);
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      if (fn !== 'consume_review_credit') {
        return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } });
      }
      // Verbatim mirror of consume_export_credit: conditional decrement,
      // returns the new balance, NULL when the balance was already 0.
      if (users.review_credits > 0) {
        users.review_credits -= 1;
        return Promise.resolve({ data: users.review_credits, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as SupabaseClient;

  return { client, users, reviews, rpcs, updates };
}

// ---- Anthropic SDK-layer fake + contract-valid fixtures -------------------

function fakeAnthropic() {
  const create = vi.fn();
  return { create, client: { messages: { create } } as unknown as Anthropic };
}

function toolReply(input: unknown) {
  return {
    content: [
      { type: 'tool_use', id: 'toolu_review', name: 'emit_critique', input },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 1200, output_tokens: 480 },
  };
}

const INITIAL_CRITIQUE = {
  dimensionScores: { narrative: 2, design: 3, content: 4 },
  attentionSummary:
    'The eye lands on the decorative banner photo first; the key-result figure sits third in the predicted scan path.',
  prioritization:
    'The results chart wins primary; the methods table moves to supplementary.',
  findings: [
    {
      dimension: 'design',
      severity: 'high',
      category: 'decorative-hijack',
      anchor: { kind: 'region', page: 1, bbox: [0.05, 0.04, 0.9, 0.2] },
      action: 'cut',
      problem:
        'The full-width lab photo at the top is the first fixation but carries no result.',
      fix: 'Remove the banner photo and let the main results figure take the top slot.',
      example:
        'Delete the top banner; move "Figure 2 — 38% reduction" into the upper-left entry position.',
    },
    {
      dimension: 'narrative',
      severity: 'medium',
      category: 'buried-key-result',
      anchor: { kind: 'slide', page: 1 },
      action: 'condense',
      problem: 'The headline result appears only in the final column.',
      fix: 'State the key result in the title bar and the first figure caption.',
      example: 'Retitle to "X reduces Y by 38%" and lead the results column with Figure 2.',
    },
  ],
};

const FOLLOWUP_CRITIQUE = {
  dimensionScores: { narrative: 4, design: 4, content: 4 },
  attentionSummary:
    'The eye now lands on the results figure first; the predicted path is title → key figure → supporting plots.',
  findings: [
    {
      dimension: 'narrative',
      severity: 'low',
      category: 'redundant-text',
      anchor: { kind: 'slide', page: 1 },
      action: 'cut',
      problem: 'The results paragraph still narrates Figure 2 sentence by sentence.',
      fix: 'Cut the paragraph to one sentence that names what the figure cannot show.',
      example: 'Keep only: "The effect holds across all three cohorts (n = 412)."',
    },
  ],
};

// ---- App plumbing ----------------------------------------------------------

function pngFetch() {
  // Tiny stand-in bytes — the route forwards them to the model untouched.
  return vi.fn().mockResolvedValue(
    new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }),
  );
}

function buildApp(deps: {
  supabase: SupabaseClient;
  anthropic: Anthropic;
  weeklyLimiter?: RequestHandler;
  now?: () => number;
}) {
  const app = express();
  app.use(express.json());
  app.use(
    createReviewRouter({
      getSupabaseAdmin: () => deps.supabase,
      getAnthropic: () => deps.anthropic,
      fetchFn: pngFetch() as unknown as typeof fetch,
      ...(deps.weeklyLimiter ? { weeklyLimiter: deps.weeklyLimiter } : {}),
      ...(deps.now ? { now: deps.now } : {}),
    }),
  );
  return app;
}

function postCritique(app: ReturnType<typeof buildApp>, body: object) {
  return request(app)
    .post('/api/review/critique')
    .set('Authorization', 'Bearer test-token')
    .send(body);
}

beforeEach(() => {
  // checkImageUrl allowlists exactly this host for the page re-fetch.
  vi.stubEnv('SUPABASE_URL', SUPABASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---- The flow --------------------------------------------------------------

describe('POST /api/review/critique — §5.2 state machine', () => {
  it('initial → follow-up (included) → closed → third 409s; exactly one credit spent', async () => {
    // Two credits so the third-critique 409 cannot be confused with a 402
    // — this test pins STAGE enforcement, not balance enforcement.
    const sb = fakeReviewSupabase({ review_credits: 2 });
    const { create, client: anthropic } = fakeAnthropic();
    create
      .mockResolvedValueOnce(toolReply(INITIAL_CRITIQUE))
      .mockResolvedValueOnce(toolReply(FOLLOWUP_CRITIQUE));
    const app = buildApp({ supabase: sb.client, anthropic });

    // 1. Initial critique — spends the one credit, writes the row (D16).
    const initial = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE });
    expect(initial.status).toBe(200);
    expect(initial.body.stage).toBe('initial');
    expect(typeof initial.body.reviewId).toBe('string');
    expect(initial.body.critique.dimensionScores).toEqual(INITIAL_CRITIQUE.dimensionScores);
    expect(initial.body.critique.findings).toHaveLength(2);
    const reviewId = initial.body.reviewId as string;

    const row = sb.reviews.get(reviewId)!;
    expect(row).toMatchObject({
      user_id: USER_ID,
      status: 'complete',
      stage: 'initial',
      credit_source: 'pack',
    });
    expect(row.initial_findings).toBeTruthy();
    expect(sb.rpcs.filter((r) => r.fn === 'consume_review_credit')).toHaveLength(1);
    expect(sb.users.review_credits).toBe(1);

    // 2. Follow-up — included in the initial credit: NO second decrement (§5.3).
    const followup = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE, reviewId });
    expect(followup.status).toBe(200);
    expect(followup.body.reviewId).toBe(reviewId);
    expect(followup.body.stage).toBe('closed');
    expect(followup.body.critique.dimensionScores).toEqual(FOLLOWUP_CRITIQUE.dimensionScores);
    expect(sb.rpcs.filter((r) => r.fn === 'consume_review_credit')).toHaveLength(1); // still one
    expect(sb.users.review_credits).toBe(1);
    expect(sb.reviews.get(reviewId)).toMatchObject({ status: 'complete', stage: 'closed' });
    expect(sb.reviews.get(reviewId)!.followup_findings).toBeTruthy();
    expect(sb.reviews.get(reviewId)!.initial_findings).toBeTruthy(); // initial preserved

    // 3. Third critique on the closed review — closed is terminal,
    // enforced server-side (§5.2); the model never runs.
    const third = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE, reviewId });
    expect(third.status).toBe(409);
    expect(third.body.error).toBe('review_closed');
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('POST /api/review/critique — no charge on model failure (D6)', () => {
  it('a failed initial consumes no credit and writes no row', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sb = fakeReviewSupabase({ review_credits: 1 });
    const { create, client: anthropic } = fakeAnthropic();
    create.mockRejectedValueOnce(new Error('upstream 529: overloaded'));
    const app = buildApp({ supabase: sb.client, anthropic });

    const failed = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE });
    expect(failed.status).toBe(502);
    // The 502 contract is a union; which member maps to an SDK throw is
    // the router's choice (Tasks 15/16) — either satisfies D6.
    expect(['review_upstream', 'bad_model_output']).toContain(failed.body.error);
    expect(sb.rpcs).toHaveLength(0); // consume_review_credit never called
    expect(sb.users.review_credits).toBe(1);
    expect(sb.reviews.size).toBe(0); // no poster_reviews row on failure (D16)

    // Retry succeeds and spends exactly one credit.
    create.mockResolvedValueOnce(toolReply(INITIAL_CRITIQUE));
    const ok = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE });
    expect(ok.status).toBe(200);
    expect(sb.users.review_credits).toBe(0);
    expect(sb.reviews.size).toBe(1);
  });

  it('a failed follow-up writes nothing and leaves the review open for retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sb = fakeReviewSupabase({ review_credits: 1 });
    const { create, client: anthropic } = fakeAnthropic();
    create.mockResolvedValueOnce(toolReply(INITIAL_CRITIQUE));
    const app = buildApp({ supabase: sb.client, anthropic });

    const initial = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE });
    const reviewId = initial.body.reviewId as string;

    create.mockRejectedValueOnce(new Error('upstream 500'));
    const failed = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE, reviewId });
    expect(failed.status).toBe(502);
    expect(sb.reviews.get(reviewId)).toMatchObject({
      status: 'complete',
      stage: 'initial', // still open — the included follow-up is not forfeit
      followup_findings: null,
    });
    expect(sb.rpcs.filter((r) => r.fn === 'consume_review_credit')).toHaveLength(1);

    create.mockResolvedValueOnce(toolReply(FOLLOWUP_CRITIQUE));
    const retried = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE, reviewId });
    expect(retried.status).toBe(200);
    expect(retried.body.stage).toBe('closed');
    expect(sb.rpcs.filter((r) => r.fn === 'consume_review_credit')).toHaveLength(1);
  });
});

describe('POST /api/review/critique — add-on weekly window (D5/D17)', () => {
  it('initials consume weekly slots, the follow-up does not, exhaustion 402s, reset re-opens', async () => {
    let nowMs = 1_800_000_000_000; // fixed fake clock, injected everywhere
    // The REAL limiter from rateLimit.ts (D5 writes no new rate-limit
    // code), driven by the injected clock.
    const weeklyLimiter = createRateLimiter({
      windowMs: WEEK_MS,
      maxPerWindow: REVIEW_ADDON_WEEKLY_QUOTA,
      dailyMs: Number.MAX_SAFE_INTEGER,
      maxPerDay: Number.MAX_SAFE_INTEGER,
      now: () => nowMs,
    });
    const sb = fakeReviewSupabase({
      plan: 'term',
      // Term-active per D4 (plan + future expiry + non-terminal status).
      plan_expires_at: new Date(nowMs + 30 * 24 * 60 * 60 * 1000).toISOString(),
      subscription_status: 'active',
      review_addon: true,
      review_credits: 0,
    });
    const { create, client: anthropic } = fakeAnthropic();
    create.mockResolvedValue(toolReply(INITIAL_CRITIQUE));
    const app = buildApp({ supabase: sb.client, anthropic, weeklyLimiter, now: () => nowMs });

    // Slot 1 — an initial critique.
    const first = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE });
    expect(first.status).toBe(200);
    expect(first.body.stage).toBe('initial');
    expect([...sb.reviews.values()][0]).toMatchObject({ credit_source: 'subscription_addon' });

    // The follow-up is included — NO second weekly slot (§5.3).
    create.mockResolvedValueOnce(toolReply(FOLLOWUP_CRITIQUE));
    const followup = await postCritique(app, {
      sourceKind: 'image',
      pages: ONE_PAGE,
      reviewId: first.body.reviewId,
    });
    expect(followup.status).toBe(200);
    expect(followup.body.stage).toBe('closed');

    // Slots 2..N — one per initial, all inside the same window.
    for (let i = 2; i <= REVIEW_ADDON_WEEKLY_QUOTA; i++) {
      const res = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE });
      expect(res.status).toBe(200);
    }

    // Slot N+1 — quota exhausted → 402 weekly_quota_exceeded (contract).
    const over = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE });
    expect(over.status).toBe(402);
    expect(over.body.error).toBe('review_payment_required');
    expect(over.body.reason).toBe('weekly_quota_exceeded');
    expect(
      over.body.retryAfterSec === undefined || typeof over.body.retryAfterSec === 'number',
    ).toBe(true);

    // The add-on path never decrements pack credits (D4).
    expect(sb.rpcs.filter((r) => r.fn === 'consume_review_credit')).toHaveLength(0);
    expect(sb.users.review_credits).toBe(0);

    // Slide the injected clock past the 7-day window — quota re-opens.
    nowMs += WEEK_MS + 1_000;
    const afterReset = await postCritique(app, { sourceKind: 'image', pages: ONE_PAGE });
    expect(afterReset.status).toBe(200);
    expect(afterReset.body.stage).toBe('initial');
  });
});
```

- [ ] **Step 2: Run the flow gate**

Run: `npm test --workspace=apps/api -- reviewFlow`
Expected: PASS (4 tests). Any failure is a Milestone-3 router defect against the §5.2/§5.3 contract — this test IS the executable contract (D13); fix the router (Tasks 15/16/18 scope) and re-run before continuing. Do NOT weaken the test to make it pass.

- [ ] **Step 3: Confirm the route is registered but unlinked (D12)**

```bash
grep -n "presentation-checker" apps/web/src/routes.tsx
```

Expected: the lazy route entry for `/presentation-checker` (registered by the Milestone-5 route/SEO task) — registered.

```bash
python3 - <<'EOF'
import json
routes = json.load(open('apps/web/src/seo/routes.json'))
rec = routes['app'].get('/presentation-checker')
assert rec is not None, 'missing /presentation-checker app record (Milestone-5 route/SEO task)'
assert 'noindex' in rec['robots'], rec
assert '/presentation-checker' not in routes['static'], 'must not be static until Task 28 (D12)'
print('OK — /presentation-checker registered as app/noindex:', rec)
EOF
```

Expected: `OK — /presentation-checker registered as app/noindex: ...`.

```bash
grep -rn "presentation-checker" apps/web/src/components/ --include="*.tsx"
```

Expected: no matches — nothing in `PublicHeader`, footers, or pricing links to the page yet. Links are a Task 28 launch-checklist item (the gallery precedent: dark first, linked at launch).

- [ ] **Step 4: Run one live critique against the dev API — cost log + `source_meta` (§6.2 item 4)**

This fires the day-one cost instrumentation for real (one paid model call, a few cents). Needs Docker for local Supabase and a real `ANTHROPIC_API_KEY` (Preflight P3).

```bash
# 1. Local Supabase with the review migration applied.
npm run db:start
npm run db:reset   # re-applies supabase/migrations/20260729120000_poster_reviews.sql
```

```bash
# 2. Point the dev API at it: apps/api/.env must have
#    SUPABASE_URL=http://127.0.0.1:54321, SUPABASE_SECRET_KEY=<SERVICE_ROLE_KEY below>,
#    ANTHROPIC_API_KEY=<real key>. Copy the keys from:
npx supabase status -o env
```

```bash
# 3. Mint a test user (local auth has email confirmations disabled) and
#    capture its JWT + id.
ANON_KEY=<ANON_KEY from supabase status>
SIGNUP=$(curl -s -X POST "http://127.0.0.1:54321/auth/v1/signup" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"review-smoke@postr.dev","password":"review-smoke-123"}')
ACCESS_TOKEN=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])' <<<"$SIGNUP")
USER_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["id"])' <<<"$SIGNUP")

# 4. Grant one review credit. The column is server-owned (guard trigger),
#    so this is SQL-only — exactly what the guard enforces.
docker exec -i supabase_db_postr psql -U postgres -d postgres \
  -c "update public.users set review_credits = 1 where id = '$USER_ID';"
```

Expected: `UPDATE 1`.

```bash
# 5. Stage one frozen-corpus page into poster-assets and sign it (600 s —
#    REVIEW_SIGNED_URL_TTL_SEC). Pages come from the Task 3 corpus.
SERVICE_KEY=<SERVICE_ROLE_KEY from supabase status>
PAGE=$(python3 -c 'import json; m=json.load(open("docs/plans/experiments/presentation-checker/corpus/manifest.json")); print(m["items"][0]["pages"][0])')
curl -s -X POST "http://127.0.0.1:54321/storage/v1/object/poster-assets/temp/review-smoke/page-1.png" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: image/png" \
  --data-binary @"docs/plans/experiments/presentation-checker/corpus/$PAGE"
SIGNED=$(curl -s -X POST "http://127.0.0.1:54321/storage/v1/object/sign/poster-assets/temp/review-smoke/page-1.png" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" -d '{"expiresIn":600}')
PAGE_URL="http://127.0.0.1:54321$(python3 -c 'import json,sys; print(json.load(sys.stdin)["signedURL"])' <<<"$SIGNED")"
W=$(sips -g pixelWidth "docs/plans/experiments/presentation-checker/corpus/$PAGE" | awk '/pixelWidth/{print $2}')
H=$(sips -g pixelHeight "docs/plans/experiments/presentation-checker/corpus/$PAGE" | awk '/pixelHeight/{print $2}')
```

```bash
# 6. Start the dev API in a second terminal (logs land there):
npm run dev:api    # tsx watch src/index.ts → http://localhost:8787

# 7. One live critique through the mounted review router (Task 18):
curl -s -X POST "http://localhost:8787/api/review/critique" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "{\"sourceKind\":\"image\",\"pages\":[{\"pageNumber\":1,\"url\":\"$PAGE_URL\",\"widthPx\":$W,\"heightPx\":$H}]}" \
  | python3 -m json.tool
```

Expected response: HTTP 200 with `{ "reviewId": "…", "stage": "initial", "critique": { "dimensionScores": …, "attentionSummary": …, "findings": [ … ] } }`.

In the dev-API terminal, expected log: a `[review.critique]` line carrying the token counts (the `import.ts:952-957` usage-log pattern — `stopReason` + `inputTokens` + `outputTokens`). **Record those numbers** — they are the first day-one cost data point behind pack pricing (§6.2 item 4; the Task 28 quota/pricing step consumes them).

```bash
# 8. Verify the row: rubric version + token usage stamped in source_meta.
REVIEW_ID=<reviewId from the curl output>
docker exec -i supabase_db_postr psql -U postgres -d postgres \
  -c "select status, stage, credit_source, source_meta from public.poster_reviews where id = '$REVIEW_ID';"
```

Expected: one row — `status=complete`, `stage=initial`, `credit_source=pack` — and `source_meta` containing `"rubric_version": "rubric.v1"` (Global Constraints) plus the same input/output token counts the log line reported (exact token key names per the Task 15/16 router; confirm they agree with the log).

- [ ] **Step 5: Internal dogfood in the §6.2.2 order (MANUAL CHECKLIST — Gavin)**

Internal enable order — Postr-native first (richest input), PPTX last
(fiddliest ingest). All four are implementation scope; the public checker may
launch for Postr-native, PDF, and image inputs while PPTX is visibly “coming
next” until its production toolchain passes the Task-28 smoke. Each pass = the
full loop: initial critique → eyeball the fix-cards → revise → included
follow-up → review closes; and a `402` eyeballed once with an exhausted balance
(paywall copy names the workflow, never "AI" — D15).

- [ ] **Postr-native poster** — from the editor's `review` sidebar tab on a real poster: block-anchored fix-cards jump to the right blocks (`onJumpToBlock`), the follow-up assesses progress against the initial findings, the third critique is refused.
- [ ] **Image upload** — single-page poster PNG/photo through `/presentation-checker`: region anchors only, same loop.
- [ ] **PDF upload** — an exported poster PDF, then a multi-page deck PDF (≤ 24 pages; over-cap file shows the typed too-many-pages message, never silent truncation): slide anchors per page, same loop.
- [ ] **PPTX — LAST** (D10): only once the Task 28 Render Docker service (soffice + pdftoppm) is live. Export a deck `.pptx`, run the same loop via `/api/review/render-pptx`.
- [ ] Each pass: confirm one `[review.critique]` cost line + the `source_meta` stamp per review (Step 4 checks), and log any critique-quality miss into the prompt/rubric loop (Task 6 Step 3) — never ad-hoc code edits.

- [ ] **Step 6: Docs hygiene (§6.3, D14 — CONDITIONAL)**

Both files are another session's untracked work today; they may land on main before this task executes. For EACH file: **read it first**, match its existing format exactly, add the checker section. If a file is absent from main at execution time, skip it and note the skip in the commit message — do not create it from scratch (D14).

- [ ] `docs/feature-graph.md` — exhaustive per-feature inventory with `- [ ]` sweep items, file:line refs, verbatim copy strings, and a §9 external-services map. Add a Presentation Checker section covering: the `/presentation-checker` page + route entry, the `review` sidebar tab (rail entry + panel + auto-switch exemption, mirroring the `'check'` precedent), the paywall panel strings, and §9 externals: `public.poster_reviews`, RPCs `consume_review_credit(uuid)` / `grant_review_credits(uuid, integer)`, the guarded columns `review_credits` / `review_addon` / `review_addon_subscription_id`, API endpoints `/api/review/critique` + `/api/review/render-pptx`, and the PPTX toolchain (soffice + pdftoppm on the Render Docker service). Bump the file's revision header per its own convention.
- [ ] `docs/manual-test-flows.md` — admin-surface walkthroughs driven by a test-account table + nested journeys, with off-app steps (Stripe sandbox / SQL) called out in its "can't fully test from the app UI" style. Add a review journey: pack purchase → initial critique → included follow-up → closed → third refused; add-on weekly-quota exhaustion and window reset; credit grant/consume verified by SQL (server-owned columns); webhook fulfillment for the two review SKUs noted as off-app steps.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/__tests__/reviewFlow.test.ts
git commit -m "test(review): API flow E2E — §5.2 state machine, no-charge-on-failure, add-on weekly window"

# Only when the D14-conditional docs files were present and updated:
git add docs/feature-graph.md docs/manual-test-flows.md
git commit -m "docs(review): checker entries in feature-graph + manual test flows (§6.3)"
```

### Task 28: Pre-ship validation gate + launch checklist

**Files:**
- Create: `docs/plans/experiments/presentation-checker/analysis/run-production-gate.mts`
- Create: `docs/plans/experiments/presentation-checker/analysis/production-gate-support.mts`
- Create: `docs/plans/experiments/presentation-checker/analysis/production-gate-support.test.mts`
- Create: `docs/plans/experiments/presentation-checker/analysis/run-production-gate.test.mts`
- Create (generated): `docs/plans/experiments/presentation-checker/results-production/<id>.json` (× 20) + `docs/plans/experiments/presentation-checker/results-production/costs.jsonl` + `docs/plans/experiments/presentation-checker/results-production/run-metadata.json`
- Create (generated): `docs/plans/experiments/presentation-checker/analysis/gate-report.md`
- Create (manual, after the live run): `docs/plans/experiments/presentation-checker/analysis/gate-decision-production.md`
- Create (launch checklist only, and only on GO): `docs/plans/experiments/presentation-checker/analysis/launch-checklist.md`
- Modify (launch checklist only, and only on GO): `apps/web/src/seo/routes.json`, `apps/web/vercel.json`, `apps/web/src/components/PublicHeader.tsx`, `apps/web/src/pages/Pricing.tsx`, `apps/web/src/pages/BillingResult.tsx`, `apps/web/src/pages/PresentationChecker.tsx` + its test if PPTX remains unavailable, `apps/api/src/review/config.ts`, the spec's living-document sections

**Interfaces:**
- Consumes: `composeReviewSystemPrompt(rubric?)` + `buildInitialUserMessage({ pageCount, sourceKind, signals?, posterDocPresent })` from `apps/api/src/review/prompt.ts` (Task 11); `callAnthropicCritique(anthropic, { systemPrompt, userMessage, pages })` → `{ critique, usage }` from `apps/api/src/review/critique.ts` (Task 13); `enforceFindings(findings, { blockIds?, pageCount, maxFindings? })` from `apps/api/src/review/enforce.ts` (Task 14); `computeReviewSignals(blocks)` from `apps/api/src/review/signals.ts` (Task 10); `FetchedPage { mediaType, imageData }` from `apps/api/src/review/fetchPages.ts` (Task 12); the frozen corpus `corpus/manifest.json` (Task 3); the analyzer's `--results` / `--out` flags (Task 6 — added for exactly this reuse); the §7.5 ship-criterion numbers Gavin must set in `gate-decision.md` (Task 7) before the full run; `ANTHROPIC_API_KEY` (Preflight P3).
- Produces: `results-production/` (same `{ posterId, critique, usage }` shape `analysis/analyze.mts` already reads), `analysis/gate-report.md` (the three §7.4 lenses on the PRODUCTION pipeline), the GO/NO-GO record, and the launch checklist.

- [ ] **Step 1: Write and harden the gate runner**

The checked-in runner and support module are authoritative over the compact
scaffold below. Before any live request or output mutation they must validate:
the exact CLI grammar; a valid `frozenAt`; exactly 20 unique, path-safe item
IDs; 1–24 existing, corpus-contained images per item within the production
5 MiB/page limit; and a non-empty, known selection. It must reject symlinked
output directories. Before merging a partial rerun, it validates a persisted
SHA-256 fingerprint over the frozen manifest and page bytes plus the model,
rubric, prompt/schema, limits, and production pipeline sources. A full run
removes only prior gate JSON/cost artifacts. A partial rerun removes only the
selected result/cost rows, and malformed cost logs fail without mutating prior
output. The support and subprocess tests pin those guarantees, including the
no-key preflight and an injected unfrozen-corpus failure that cannot touch the
real result directory.

`docs/plans/experiments/presentation-checker/analysis/run-production-gate.mts`:

```ts
/**
 * §7.1 pre-ship gate: runs the frozen 20 through the PRODUCTION critique
 * pipeline — prompt.ts → critique.ts → enforce.ts, the same modules the
 * API route uses — NOT the Task-5 throwaway prototype. Output lands in
 * results-production/ in the exact shape analysis/analyze.mts reads, so
 * the Task-6 analyzer produces the gate report unchanged:
 *
 *   ANTHROPIC_API_KEY=... npx tsx docs/plans/experiments/presentation-checker/analysis/run-production-gate.mts [--only bio-01,cs-04] [--limit 3]
 *   cd docs/plans/experiments/presentation-checker && npx tsx analysis/analyze.mts --results results-production --out analysis/gate-report.md
 *
 * Corpus items have no PosterDoc, so deterministic signals are absent:
 * the gate passes posterDocPresent: false with no signals, and enforce
 * runs without a block-id set — the same shape an image/PDF upload takes
 * through the route. Page images are read straight from the corpus (the
 * prototype's convention): the gate measures prompt + model + enforce,
 * not signed-URL re-fetch.
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  composeReviewSystemPrompt,
  buildInitialUserMessage,
} from '../../../../../apps/api/src/review/prompt.ts';
import { callAnthropicCritique } from '../../../../../apps/api/src/review/critique.ts';
import { enforceFindings } from '../../../../../apps/api/src/review/enforce.ts';
import { computeReviewSignals } from '../../../../../apps/api/src/review/signals.ts';
import type { FetchedPage } from '../../../../../apps/api/src/review/fetchPages.ts';

// Same pricing caveat as the prototype: CONFIRM current Sonnet 4.5 list
// prices before using these for pack pricing.
const COST_PER_MTOK = { input: 3.0, output: 15.0 };

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY must be set (Preflight P3) — the gate calls the live model.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1]!.split(',') : null;
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : null;

const manifest = JSON.parse(readFileSync(join(root, 'corpus', 'manifest.json'), 'utf8')) as {
  items: Array<{ id: string; pages: string[] }>;
};

// Wiring assertion: the gate measures the PRODUCTION modules — signals
// included. Corpus posters carry no PosterDoc, so their deterministic-
// grounding block is empty; this pins the zero-signals baseline the
// prompt renders for uploads.
console.log('[gate] zero-signals baseline:', computeReviewSignals([]));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const systemPrompt = composeReviewSystemPrompt();
const outDir = join(root, 'results-production');
mkdirSync(outDir, { recursive: true });

const costsPath = join(outDir, 'costs.jsonl');
if (!only && limit === null && existsSync(costsPath)) {
  // Full re-run: start the cost log fresh so p50/p95 stay honest.
  rmSync(costsPath);
}

function mediaType(p: string): FetchedPage['mediaType'] {
  const ext = extname(p).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  throw new Error(`unsupported page image ${p}`);
}

let items = manifest.items;
if (only) items = items.filter((i) => only.includes(i.id));
if (limit !== null) items = items.slice(0, limit);

for (const item of items) {
  const pages: FetchedPage[] = item.pages.map((p) => ({
    mediaType: mediaType(p),
    imageData: readFileSync(join(root, 'corpus', p)).toString('base64'),
  }));

  const userMessage = buildInitialUserMessage({
    pageCount: item.pages.length,
    // Every corpus page is rendered from the exported PDF
    // (corpus/README step 5), so 'pdf' is the truthful source kind.
    sourceKind: 'pdf',
    posterDocPresent: false,
  });

  const { critique, usage } = await callAnthropicCritique(anthropic, {
    systemPrompt,
    userMessage,
    pages,
  });

  // The same enforce pass the route runs: no PosterDoc → no block ids;
  // page-range + bbox clamps still apply (D18).
  const findings = enforceFindings(critique.findings, { pageCount: item.pages.length });
  const result = { ...critique, findings };

  const estCostUsd =
    (usage.inputTokens / 1e6) * COST_PER_MTOK.input +
    (usage.outputTokens / 1e6) * COST_PER_MTOK.output;

  writeFileSync(
    join(outDir, `${item.id}.json`),
    JSON.stringify({ posterId: item.id, critique: result, usage }, null, 2) + '\n',
  );
  appendFileSync(
    costsPath,
    JSON.stringify({ posterId: item.id, ...usage, estCostUsd: Number(estCostUsd.toFixed(4)) }) + '\n',
  );
  console.log(
    `${item.id}: ${findings.length} findings, ${usage.inputTokens}+${usage.outputTokens} tokens, ~$${estCostUsd.toFixed(3)}`,
  );
}

console.log(`[gate] wrote ${items.length} production result(s) to results-production/`);
```

- [ ] **Step 2: Smoke run on 3 items**

```bash
ANTHROPIC_API_KEY=... npx tsx docs/plans/experiments/presentation-checker/analysis/run-production-gate.mts --limit 3
```

Expected: the `[gate] zero-signals baseline:` line, then one line per item (`<id>: N findings, <in>+<out> tokens, ~$<cost>`) and the final `[gate] wrote 3 production result(s)`. Read one critique by eye — this is the production prompt's first contact with the corpus; divergence from the Task-5 prototype's voice is expected (the production prompt also carries signals/posterDoc branches), quality regressions are not.

- [ ] **Step 3: Full run over the frozen 20 + the Task-6 analyzer**

**Manual prerequisite — Gavin, before spending on the full run:** replace
`<X>` and `<Y>` in `gate-decision.md` with the seeded-recall and
all-dimensions weighted-kappa thresholds. They are still placeholders in the
checked-in file. Freeze those values before Step 3 so the pass criterion
cannot move after the results are known.

```bash
ANTHROPIC_API_KEY=... npx tsx docs/plans/experiments/presentation-checker/analysis/run-production-gate.mts
```

Expected: 20 `results-production/<id>.json` files + 20 fresh `costs.jsonl`
lines + `run-metadata.json` carrying the run fingerprint, then
`[gate] wrote 20 production result(s)`.

```bash
cd docs/plans/experiments/presentation-checker
npx tsx analysis/analyze.mts --results results-production --out analysis/gate-report.md
```

Expected: `wrote analysis/gate-report.md` — the same three §7.4 lenses (score kappa/spearman, checklist PRF + seeded catch rate, comments ↔ findings), computed on the PRODUCTION pipeline's output. The analyzer needs no edits: its `--results` / `--out` flags were added in Task 6 for exactly this reuse.

- [ ] **Step 4: GO/NO-GO against the Task-7 criterion, then the launch checklist (MANUAL CHECKPOINT — Gavin)**

Fill the decision block below from `analysis/gate-report.md` and the frozen
§7.5 numbers in `gate-decision.md` (Task 7), and save it first as
`analysis/gate-decision-production.md`. On **NO-GO**: retain that decision
record, return to the prompt/rubric loop (Task 6 Step 3), and re-run this gate
on the same frozen 20 — do not create or touch the launch checklist. On
**GO**: copy the signed result into `analysis/launch-checklist.md` and execute
that checklist in order.

````markdown
# Presentation Checker — pre-ship gate + launch checklist

Date: <…> · Rubric: <version stamped in results> · Corpus: frozen 20 (`frozenAt` in manifest)

## Gate result (from analysis/gate-report.md vs gate-decision.md §7.5 criterion)

| lens | gate number | Task-7 criterion | pass? |
|---|---|---|---|
| weighted kappa — narrative | <…> | ≥ <Y> | [ ] |
| weighted kappa — design | <…> | ≥ <Y> | [ ] |
| weighted kappa — content | <…> | ≥ <Y> | [ ] |
| seeded ground-truth recall | <…>% | ≥ <X>% | [ ] |
| comment-level failure modes (lens 3 reconciliation) | <…> | none systematic | [ ] |

- [ ] **GO** — every criterion passes → execute the launch checklist below
- [ ] **NO-GO** — prompt/rubric loop (Task 6 Step 3) → re-run run-production-gate.mts on the same frozen 20

## Launch checklist (GO only, in order)

- [ ] **Record the launch run.** Copy this gate-result table and checklist to
  `analysis/launch-checklist.md`; fill its date, rubric version, frozen-corpus
  timestamp, gate numbers, and explicit GO signature. This file is the launch
  date of record.
- [ ] **Stripe LIVE prices.** Create the `review_pack` (payment mode) and `review_addon` (subscription mode) prices in the LIVE Stripe account; set `STRIPE_PRICE_REVIEW_PACK` / `STRIPE_PRICE_REVIEW_ADDON` in Render. Review-SKU refunds stay manual via the Stripe dashboard (D8 — deferred, no code).
- [ ] **Price from real numbers.** Set `REVIEW_PACK_CREDITS` (the pack-grant const from the Milestone-3 billing task, beside the `PACK_EXPORT_CREDITS` precedent) and `REVIEW_ADDON_WEEKLY_QUOTA` (`apps/api/src/review/config.ts`) from the day-one `[review.critique]` cost lines (Task 27 Step 4 + dogfood) and the p50/p95 of `results-production/costs.jsonl` — not the placeholders (`3` / `4`).
- [ ] **Checkout landing covers review SKUs.** In `apps/web/src/pages/BillingResult.tsx` extend the `granted` check with `|| plan.canReview` (and its copy) so a review-pack buyer sees the confirmation instead of the "will appear shortly" fallback.
- [ ] **Choose truthful PPTX availability (non-blocking for the other three inputs).** Run the Docker-based Render service with `libreoffice-impress` + `poppler-utils` and smoke one PPTX review before claiming PPTX support. If that smoke has not passed, remove `.pptx` from the file input and launch copy in `PresentationChecker.tsx`, add visible “PPTX coming next” copy, and pin it in the page test. Continue the PDF/image/Postr-native launch; track the Docker deployment + PPTX smoke as a separate rollout item. If the smoke passes, keep the current PPTX input. PPTX ships last (§6.2.2).
- [ ] **Living spec.** If the rubric changed since Task 1 and the living-spec
  file is present, update its rubric-version and §7.5 criterion record with
  the final version and gate numbers. If the file is absent, record that fact
  in `analysis/launch-checklist.md`; do not invent a replacement path.
- [ ] **Production smoke while still noindex.** Run one Postr-native critique
  end-to-end in production and verify the `[review.critique]` cost line,
  `source_meta`, stored result, and included follow-up. The registered route
  is directly reachable for this smoke even though it is unlinked and
  noindex. Do not expose it publicly until this passes.
- [ ] **Index the page (D12 flip).** In `apps/web/src/seo/routes.json` move `/presentation-checker` out of `app` (noindex) into `static` with this record (workflow-named, never "AI" — D15; measured slug rationale in `docs/plans/2026-07-26-seo-plan.md` §4.0.2):

  ```json
  "/presentation-checker": {
    "title": "Presentation Checker for Posters & Talks | Postr",
    "description": "Get feedback on your research poster or talk before the conference: narrative, design and content scores, plus anchored fix cards that show exactly what to cut, demote or show visually.",
    "robots": "index,follow",
    "h1": "Check your presentation before the room does.",
    "copy": [
      "Upload a poster, an exported talk PDF or an image — or check the poster you're already editing — and get a reviewer-style read: what a first-time viewer's eye lands on, whether your key result survives the scan path, and what to do about it.",
      "Every finding is anchored to a block, slide or region of your artifact and comes with a personalized fix: the line to rewrite, the table to demote to an appendix, the plot to make primary.",
      "One follow-up is included with every review: revise, re-check, and see your scores move. Review packs never expire; the add-on gives you a weekly quota on top of your term."
    ]
  }
  ```

- [ ] **Remove the HTTP noindex.** Delete the
  `/presentation-checker` `X-Robots-Tag: noindex, nofollow` header block from
  `apps/web/vercel.json`. The static record's `index,follow` meta cannot
  override a noindex response header.
- [ ] **Prerender + sitemap via the normal build.** `npm run build` — the apps/web build already runs `scripts/prerender.mjs` (prerenders every `static` route) and `scripts/gen-sitemap.mjs` (regenerates the sitemap); verify `/presentation-checker` appears in both outputs.
- [ ] **Link it.** Add the nav entry in `apps/web/src/components/PublicHeader.tsx` and the review pack + add-on tiers/links on `apps/web/src/pages/Pricing.tsx`.
- [ ] **Deploy and verify indexability before announcing.** Against the
  production URL, verify: status 200; no `X-Robots-Tag: noindex`; HTML
  contains the canonical title, description, H1, and self-canonical;
  `/presentation-checker` is present in the sitemap; the nav/Pricing links
  resolve; and the page still completes a non-PPTX review. Record the commands
  and results in `analysis/launch-checklist.md`, then publish the launch note.
````

- [ ] **Step 5: Commit the tested runner, then the live artifacts separately**

```bash
git add docs/plans/experiments/presentation-checker/analysis/run-production-gate.mts \
        docs/plans/experiments/presentation-checker/analysis/production-gate-support.mts \
        docs/plans/experiments/presentation-checker/analysis/production-gate-support.test.mts \
        docs/plans/experiments/presentation-checker/analysis/run-production-gate.test.mts
git commit -m "test(review): harden the production pre-ship gate runner"
```

After the frozen-corpus run and signed decision exist:

```bash
git add docs/plans/experiments/presentation-checker/analysis/gate-report.md \
        docs/plans/experiments/presentation-checker/analysis/gate-decision-production.md \
        docs/plans/experiments/presentation-checker/results-production
git commit -m "test(review): pre-ship gate — frozen 20 through the production pipeline + gate report (§7.1)"
```

Launch-checklist edits (GO only) land as their own commit when executed:

```bash
# apps/api/src/billing.ts is included because REVIEW_PACK_CREDITS may live
# there (the PACK_EXPORT_CREDITS precedent) — git add of an unchanged
# tracked file is a no-op, so stage both candidates.
git add apps/web/src/seo/routes.json apps/web/src/components/PublicHeader.tsx \
        apps/web/src/pages/Pricing.tsx apps/web/src/pages/BillingResult.tsx \
        apps/web/src/pages/PresentationChecker.tsx \
        apps/web/src/pages/PresentationChecker.test.tsx \
        apps/web/vercel.json apps/api/src/review/config.ts \
        apps/api/src/billing.ts \
        docs/plans/experiments/presentation-checker/analysis/launch-checklist.md
git commit -m "feat(review): launch the checker — index /presentation-checker, nav + pricing links, final pack/quota numbers"
```
