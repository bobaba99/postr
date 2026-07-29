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
