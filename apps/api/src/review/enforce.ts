/**
 * Deterministic enforcement of the critique output contract (spec §4.5).
 * Applied after validation and before findings are persisted or returned.
 */
import type { ReviewAnchor, ReviewFinding, ReviewSeverity } from '@postr/shared';
import { REVIEW_MAX_FINDINGS } from './config.js';

export interface EnforceCtx {
  /**
   * PosterDoc block ids. Undefined for uploads because block anchors cannot
   * resolve without a PosterDoc (D18).
   */
  blockIds?: ReadonlySet<string>;
  pageCount: number;
  maxFindings?: number;
}

const SEVERITY_RANK: Record<ReviewSeverity, number> = { high: 0, medium: 1, low: 2 };

export function enforceFindings(findings: ReviewFinding[], ctx: EnforceCtx): ReviewFinding[] {
  const resolvedFindings = findings
    .map((finding) => resolveAnchor(finding, ctx))
    .filter((finding): finding is ReviewFinding => finding !== null);
  const dedupedFindings = dedupeFindings(resolvedFindings);
  const rebalancedFindings = guardAddDistribution(dedupedFindings);
  return clampFindings(rebalancedFindings, ctx.maxFindings ?? REVIEW_MAX_FINDINGS);
}

function resolveAnchor(finding: ReviewFinding, ctx: EnforceCtx): ReviewFinding | null {
  const anchor = finding.anchor;

  switch (anchor.kind) {
    case 'block':
      return ctx.blockIds?.has(anchor.blockId) ? finding : null;
    case 'slide':
      return isPageInRange(anchor.page, ctx.pageCount) ? finding : null;
    case 'region':
      return resolveRegionAnchor(finding, anchor, ctx.pageCount);
  }
}

function resolveRegionAnchor(
  finding: ReviewFinding,
  anchor: Extract<ReviewAnchor, { kind: 'region' }>,
  pageCount: number,
): ReviewFinding | null {
  if (!isPageInRange(anchor.page, pageCount)) {
    return null;
  }

  if (anchor.bbox.some((coordinate) => !Number.isFinite(coordinate))) {
    return null;
  }

  const bbox = anchor.bbox.map((coordinate) => Math.min(1, Math.max(0, coordinate))) as [
    number,
    number,
    number,
    number,
  ];

  return { ...finding, anchor: { ...anchor, bbox } };
}

function isPageInRange(page: number, pageCount: number): boolean {
  return Number.isInteger(page) && page >= 1 && page <= pageCount;
}

function dedupeFindings(findings: ReviewFinding[]): ReviewFinding[] {
  const seenKeys = new Set<string>();

  return findings.filter((finding) => {
    const key = `${getAnchorKey(finding.anchor)}|${finding.action}|${getProblemKey(finding.problem)}`;
    if (seenKeys.has(key)) {
      return false;
    }

    seenKeys.add(key);
    return true;
  });
}

function getAnchorKey(anchor: ReviewAnchor): string {
  switch (anchor.kind) {
    case 'block':
      return `block:${anchor.blockId}`;
    case 'region':
      return `region:${anchor.page}`;
    case 'slide':
      return `slide:${anchor.page}`;
  }
}

function getProblemKey(problem: string): string {
  return problem.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40);
}

function guardAddDistribution(findings: ReviewFinding[]): ReviewFinding[] {
  if (findings.length < 4) {
    return findings;
  }

  const addFindingsInDropOrder = findings
    .map((finding, index) => ({ finding, index }))
    .filter(({ finding }) => finding.action === 'add')
    .sort(
      (left, right) =>
        SEVERITY_RANK[right.finding.severity] - SEVERITY_RANK[left.finding.severity] ||
        right.index - left.index,
    );
  const droppedIndexes = selectAddIndexesToDrop(addFindingsInDropOrder, findings.length);

  return findings.filter((_, index) => !droppedIndexes.has(index));
}

function selectAddIndexesToDrop(
  addFindingsInDropOrder: Array<{ finding: ReviewFinding; index: number }>,
  findingCount: number,
): ReadonlySet<number> {
  const droppedIndexes = new Set<number>();
  let addCount = addFindingsInDropOrder.length;
  let remainingCount = findingCount;

  for (const { index } of addFindingsInDropOrder) {
    if (addCount * 2 <= remainingCount) {
      break;
    }

    droppedIndexes.add(index);
    addCount -= 1;
    remainingCount -= 1;
  }

  return droppedIndexes;
}

function clampFindings(findings: ReviewFinding[], maxFindings: number): ReviewFinding[] {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort(
      (left, right) =>
        SEVERITY_RANK[left.finding.severity] - SEVERITY_RANK[right.finding.severity] ||
        left.index - right.index,
    )
    .slice(0, maxFindings)
    .map(({ finding }) => finding);
}
