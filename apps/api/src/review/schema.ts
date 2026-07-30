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
