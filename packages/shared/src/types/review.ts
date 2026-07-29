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
  /** Private poster-assets object path, when the page is temporary. */
  storagePath?: string;
}
