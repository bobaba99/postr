/**
 * Manuscript → poster pipeline types.
 *
 * `DocumentModel` is the single intermediate representation between
 * every ingest format (pasted text, .docx, later PDF/.tex) and every
 * output (poster today, talk in a later phase). Without one IR the
 * pipeline becomes an N×M matrix of converters — see
 * docs/plans/2026-07-27-manuscript-pipeline.md §3.
 *
 * The split the plan mandates: everything in this file describes
 * DETERMINISTIC data. The only LLM step in the pipeline is the
 * condenser (`CondenseRequestBody` → `CondensedNarrative`), and even
 * its budgets arrive as data computed by the deterministic mapper.
 */
import type { Author, Institution, Reference } from './poster';

// ─────────────────────────────────────────────────────────────────────
// Document model (IR)
// ─────────────────────────────────────────────────────────────────────

/** Canonical manuscript section kinds detected from the heading
 *  lexicon. `other` keeps unrecognized sections addressable so the
 *  pin mechanism (questionnaire Q5) can still protect them. */
export type SectionKind =
  | 'abstract'
  | 'introduction'
  | 'literature-review'
  | 'methods'
  | 'results'
  | 'discussion'
  | 'conclusion'
  | 'limitations'
  | 'references'
  | 'acknowledgements'
  | 'appendix'
  | 'other';

export interface ManuscriptSection {
  id: string;
  /** Heading text as written in the source ("2. Materials and Methods"). */
  heading: string;
  /** Canonical kind from the heading lexicon. */
  kind: SectionKind;
  /** Heading level, 1 = top-level. */
  level: number;
  paragraphs: string[];
  /** Position in the source document, 0-based. */
  sourceOrder: number;
}

export interface ManuscriptFigure {
  id: string;
  /** data: URL (DOCX ingest) or storage path — null when the source
   *  referenced a figure we could not extract. */
  imageRef: string | null;
  caption: string;
  /** Section id the figure appeared in, when known. */
  sourceSectionId: string | null;
  /** Deterministic salience in [0, 1] — drives "which figure is the
   *  money figure". Derived from mention count in Results + position. */
  prominence: number;
}

/** A table's reconstructed grid, when the ingest path could recover
 *  one (.docx `<table>`). Cells are raw strings — typing them is the
 *  chart chooser's job, not the ingest's. */
export interface ManuscriptTableData {
  header: string[];
  rows: string[][];
}

/** Caption-level record of a table in the source manuscript.
 *
 *  `data` is populated when the source carried a real grid we could
 *  read (DOCX tables); it stays null for caption-only detections
 *  (pasted text says "Table 1." but the numbers are an image). Q2's
 *  plot branch offers `data` to the chart chooser pre-filled — the
 *  extraction is deterministic parsing, never a model call. */
export interface ManuscriptTableRef {
  id: string;
  caption: string;
  sourceSectionId: string | null;
  data: ManuscriptTableData | null;
}

/** One IR for every input format and every output format. */
export interface DocumentModel {
  version: 1;
  title: string;
  /** Reuses the existing first-class poster author model. */
  authors: Author[];
  institutions: Institution[];
  abstract: string | null;
  sections: ManuscriptSection[];
  figures: ManuscriptFigure[];
  tables: ManuscriptTableRef[];
  references: Reference[];
  venue: { name: string; year: number } | null;
  /** Whole-document word count — surfaced in the ingest summary. */
  wordCount: number;
}

// ─────────────────────────────────────────────────────────────────────
// Narrative mapping (deterministic — rubric §2)
// ─────────────────────────────────────────────────────────────────────

/** The five-role poster spine, in reading order. */
export type NarrativeRoleId =
  | 'hook'
  | 'question'
  | 'methods'
  | 'keyResult'
  | 'takeaway';

/** An auto-extracted candidate finding from the Results section. */
export interface Finding {
  id: string;
  text: string;
  /** Deterministic ranking score — higher is more prominent. */
  score: number;
  /** Section id it was extracted from (provenance). */
  sectionId: string;
  /** Rubric rule: every kept finding must have a figure or a number. */
  hasNumber: boolean;
}

/**
 * Where a candidate sits in the hierarchy around the core message.
 * 1 = the core itself (never cut), 2 = direct evidence for it,
 * 3 = context that makes it interpretable, 4 = everything else.
 */
export type NarrativeTier = 1 | 2 | 3 | 4;

/** Output of the deterministic narrative mapper for one role. */
export interface MappedRole {
  role: NarrativeRoleId;
  /** Hard word budget from the rubric, after Q6 scaling and tiering.
   *  Never negotiable by the LLM, and never above the rubric ceiling. */
  budgetWords: number;
  /** Raw source material handed to the condenser. */
  sourceText: string;
  /** Provenance — which manuscript headings this role came from. */
  sourceHeadings: string[];
  /** Roles that may never be dropped (question, takeaway). */
  required: boolean;
  /** True when the manuscript had no usable source for this role —
   *  surfaced to the user (a poster without a question is the #1
   *  structural failure). */
  missing: boolean;
  /** Hierarchy position relative to the core message. */
  tier: NarrativeTier;
  /** One short human phrase explaining the tier. Never a number. */
  reason: string;
}

/** A section the user pinned against the budget cutter (Q5). Pinned
 *  content is exempt from the wholesale cuts but still gets condensed
 *  to its own small budget — the poster has physical limits. */
export interface MappedPinnedSection {
  /** Section id in the DocumentModel. */
  id: string;
  heading: string;
  budgetWords: number;
  sourceText: string;
  /** A pin is a user instruction, so it is always protected (tier 2) —
   *  a pin outranks any score. */
  tier: NarrativeTier;
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────
// Emphasis questionnaire (§2.5) — structured answers only
// ─────────────────────────────────────────────────────────────────────

/**
 * Q3 audience. The first two are the chips the user sees; the rest are
 * PRESETS reached by typing into "Other" and matched deterministically
 * (see apps/web/src/manuscript/audiencePresets.ts). `custom` is the
 * escape hatch when the search finds nothing — the typed text then
 * rides along in `EmphasisAnswers.audienceCustom`.
 *
 * Every value here MUST have an entry in the condenser prompt's
 * AUDIENCE_DESCRIPTIONS. A missing key renders "undefined" into the
 * prompt, silently, which is the worst kind of bug this file can ship.
 */
export type AudienceOption =
  | 'specialists'
  | 'general'
  | 'clinicians'
  | 'public'
  | 'adolescents'
  | 'children'
  | 'undergraduates'
  | 'policymakers'
  | 'industry'
  | 'custom';

/**
 * Q4 purpose. Widened 2026-07-27 from four options to what students
 * actually do: the common case is a poster presentation for its own
 * sake, then committee meetings and lab presentations. Wanting FEEDBACK
 * is now explicitly distinct from a ONE-TIME presentation — they pull
 * the hook in opposite directions (an ask versus a summary).
 *
 * Every value here MUST have an entry in PURPOSE_DESCRIPTIONS.
 */
export type PurposeOption =
  | 'requirement'
  | 'one-time'
  | 'committee'
  | 'lab-meeting'
  | 'feedback'
  | 'collaborators'
  | 'job-market';

/** Q2 — how the key results should be shown on the poster. A plot
 *  usually condenses results better than a table at three feet, which
 *  the question says out loud rather than deciding for the user. */
export type ResultDisplay = 'plot' | 'table';

/**
 * Q6 — presentation constraints. Either side may be user-stated; the
 * other is DERIVED at one minute per slide and shown, never hidden.
 * Captured even when it cannot change today's poster output, because
 * the poster-to-deck path needs it.
 */
export interface PresentationRequirements {
  /** What the user actually told us — the other field is derived. */
  statedAs: 'slides' | 'duration' | 'none';
  slideCount: number | null;
  durationMinutes: number | null;
}

/** The questionnaire's structured answers — the ONLY user input the
 *  condenser receives beyond the manuscript itself. */
export interface EmphasisAnswers {
  /** Q1 — the one thing someone should remember (free text, ≤25 words).
   *  Load-bearing: the author stating their own thesis. */
  takeaway: string;
  /** Q2 — how key results are shown. */
  resultDisplay: ResultDisplay;
  /** Q2 — finding ids in the user's preferred order (most important
   *  first). Empty = keep the auto-extracted ranking. */
  rankedFindingIds: string[];
  /** Q3 — audience, controls jargon tolerance. */
  audience: AudienceOption;
  /** Q3 — free text, set only when `audience` is 'custom' (the preset
   *  search found no reasonable match). */
  audienceCustom: string;
  /** Q4 — what the poster is for, controls hook framing. */
  purpose: PurposeOption;
  /** Q5 — section ids the user confirmed as critical. Derived
   *  deterministically, then adjusted by the user — never automatic. */
  pinnedSectionIds: string[];
  /** Q6 — slide/duration constraints. */
  requirements: PresentationRequirements;
}

// ─────────────────────────────────────────────────────────────────────
// Condenser wire types (shared by apps/web and apps/api)
// ─────────────────────────────────────────────────────────────────────

export interface CondenseRoleInput {
  role: NarrativeRoleId;
  budgetWords: number;
  sourceText: string;
}

/** Structured emphasis facts forwarded to the condenser. Kept flat and
 *  minimal — the prompt module owns how these become instructions. */
export interface CondenseEmphasis {
  takeaway: string;
  audience: AudienceOption;
  /** Present only when `audience` is 'custom' — the user's own words
   *  for who reads this, after the preset search found no match. */
  audienceCustom?: string;
  purpose: PurposeOption;
  /** Verbatim finding texts in the user's preferred order. */
  rankedFindings: string[];
}

export interface CondensePinnedInput {
  id: string;
  heading: string;
  budgetWords: number;
  sourceText: string;
}

export interface CondenseRequestBody {
  roles: CondenseRoleInput[];
  pinned: CondensePinnedInput[];
  emphasis: CondenseEmphasis;
}

export interface CondensedRole {
  role: NarrativeRoleId;
  /** Condensed prose, guaranteed within budget after enforcement. */
  text: string;
  /** True when the server had to hard-truncate an over-budget reply —
   *  surfaced so the outline can mark the role for a second look. */
  truncated: boolean;
}

export interface CondensedPinnedSection {
  id: string;
  heading: string;
  text: string;
  truncated: boolean;
}

export interface CondensedNarrative {
  roles: CondensedRole[];
  pinned: CondensedPinnedSection[];
}
