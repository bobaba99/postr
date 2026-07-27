/**
 * Q5 — DERIVING which sections are critical. Deterministic scoring,
 * no LLM on the happy path.
 *
 * The old Q5 handed the user a cut list and asked "anything you must
 * NOT cut?" — which makes the user do the work of noticing what the
 * cutter is about to destroy. This module inverts it: score every
 * section for relatedness to the paper's core, RANK them, and show the
 * ranking so the user only has to adjust.
 *
 * "Derive, then let the user adjust" is the rule. Never fully
 * automatic — the owner was explicit. The scores decide what to
 * SUGGEST, and the user decides what is true.
 *
 * Signals, all cheap and all local:
 *   • term overlap with the paper's core (Q1 takeaway + title +
 *     abstract + detected findings), TF-IDF-ish weighted so a term
 *     appearing in every section counts for little;
 *   • the section lexicon's own kind, which already encodes decades of
 *     poster convention about what earns space;
 *   • position in the manuscript (earlier sections are load-bearing
 *     more often than appendices);
 *   • heading semantics — a heading whose words appear in the core is
 *     a strong signal on its own.
 */
import type { DocumentModel, Finding, ManuscriptSection, SectionKind } from '@postr/shared';

/** A scored section, with the reason shown to the user. */
export interface SectionRelevance {
  id: string;
  heading: string;
  kind: SectionKind;
  /** Composite score, higher = more related to the paper's core. */
  score: number;
  /** True when the deterministic pass suggests keeping this section. */
  suggested: boolean;
  /** Terse, user-facing reason. Never jargon — this is read at a
   *  glance by someone who has not thought about TF-IDF ever. */
  reason: string;
}

/**
 * Prior weight per section kind. The five-role spine already claims
 * intro/methods/results/discussion/conclusion, so this list scores the
 * sections that are otherwise CUT — the ones the user is deciding
 * about. Kinds the spine consumes score 0 and are excluded below.
 */
const KIND_PRIOR: Partial<Record<SectionKind, number>> = {
  limitations: 0.5,
  'literature-review': 0.25,
  appendix: 0.1,
  acknowledgements: 0.05,
  other: 0.35,
};

/** Kinds the five-role spine already maps — never offered here. */
const SPINE_KINDS: ReadonlySet<SectionKind> = new Set<SectionKind>([
  'abstract',
  'introduction',
  'methods',
  'results',
  'discussion',
  'conclusion',
  'references',
]);

/** Words carrying no topical signal. Kept short on purpose — a long
 *  stoplist is a tuning knob nobody maintains, and the IDF weighting
 *  below already suppresses ubiquitous terms. */
const STOP_WORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'these', 'those', 'from',
  'were', 'was', 'are', 'have', 'has', 'had', 'been', 'being', 'their',
  'they', 'them', 'than', 'then', 'there', 'which', 'when', 'while',
  'also', 'more', 'most', 'such', 'both', 'into', 'over', 'under',
  'each', 'other', 'some', 'between', 'among', 'because', 'however',
  'study', 'studies', 'results', 'result', 'data', 'using', 'used',
  'show', 'shows', 'shown', 'found', 'may', 'can', 'will', 'would',
  'could', 'should', 'our', 'we', 'not', 'but', 'all', 'its',
]);

/** Content terms of a string: lowercase, ≥4 chars, not a stop word. */
export function contentTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

function termSet(text: string): Set<string> {
  return new Set(contentTerms(text));
}

/**
 * The paper's "core" — what everything else is measured against.
 *
 * The Q1 takeaway is weighted heaviest because it is the author's own
 * statement of their thesis, which is strictly better evidence than
 * anything we can infer. Title and findings follow; the abstract is
 * last because it mentions everything and therefore discriminates
 * least.
 */
export function buildCoreTerms(
  doc: DocumentModel,
  takeaway: string,
  findings: Finding[],
): Map<string, number> {
  const weighted: Array<[string, number]> = [
    [takeaway, 3],
    [doc.title, 2],
    [findings.map((f) => f.text).join(' '), 2],
    [doc.abstract ?? '', 1],
  ];
  const core = new Map<string, number>();
  for (const [text, weight] of weighted) {
    for (const term of new Set(contentTerms(text))) {
      core.set(term, (core.get(term) ?? 0) + weight);
    }
  }
  return core;
}

/**
 * Inverse document frequency across the manuscript's own sections. A
 * term in every section (the study's topic word) tells us nothing
 * about which section matters; a term in one or two is discriminating.
 */
function buildIdf(sections: ManuscriptSection[]): Map<string, number> {
  const docCount = Math.max(sections.length, 1);
  const seenIn = new Map<string, number>();
  for (const section of sections) {
    const terms = termSet(sectionBody(section));
    for (const term of terms) {
      seenIn.set(term, (seenIn.get(term) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const [term, count] of seenIn) {
    idf.set(term, Math.log(1 + docCount / count));
  }
  return idf;
}

function sectionBody(section: ManuscriptSection): string {
  return `${section.heading} ${section.paragraphs.join(' ')}`;
}

/**
 * Overlap between a section and the core, normalised to roughly [0,1].
 * Each shared term contributes its core weight times its IDF; the sum
 * is divided by the section's own term count so a long section cannot
 * win on volume alone.
 */
function overlapScore(
  section: ManuscriptSection,
  core: Map<string, number>,
  idf: Map<string, number>,
): number {
  const terms = termSet(sectionBody(section));
  if (terms.size === 0) return 0;
  let sum = 0;
  for (const term of terms) {
    const coreWeight = core.get(term);
    if (coreWeight === undefined) continue;
    sum += coreWeight * (idf.get(term) ?? 1);
  }
  // Normalise by a sublinear function of size: dividing by the raw term
  // count punishes any substantial section too harshly, since overlap
  // grows far slower than length.
  const normalised = sum / Math.sqrt(terms.size);
  // Squash into [0,1) — the absolute scale is arbitrary, only the
  // ordering and the threshold matter.
  return normalised / (normalised + 3);
}

/** Heading-only overlap: a heading echoing the core is a strong hint
 *  that the section is about the paper's main claim. */
function headingScore(section: ManuscriptSection, core: Map<string, number>): number {
  const terms = termSet(section.heading);
  if (terms.size === 0) return 0;
  let hits = 0;
  for (const term of terms) {
    if (core.has(term)) hits++;
  }
  return hits / terms.size;
}

/** Earlier sections skew load-bearing; appendices trail the paper for
 *  a reason. Linear, mild — position is a tiebreaker, not a verdict. */
function positionScore(section: ManuscriptSection, total: number): number {
  if (total <= 1) return 1;
  return 1 - section.sourceOrder / total;
}

/** Sections at or above this score are SUGGESTED to the user. Tuned so
 *  a limitations section that genuinely discusses the main finding
 *  surfaces, while an acknowledgements block does not. */
export const SUGGEST_THRESHOLD = 0.4;

function reasonFor(
  section: ManuscriptSection,
  overlap: number,
  heading: number,
): string {
  if (heading > 0.3) return 'Its heading matches your main point';
  if (overlap > 0.35) return 'Closely tied to your key result';
  if (overlap > 0.2) return 'Shares wording with your takeaway';
  if (section.kind === 'limitations') return 'Limitations — often expected in your field';
  if (section.kind === 'literature-review') return 'Background reading — usually cut';
  if (section.kind === 'appendix') return 'Supplementary — usually cut';
  if (section.kind === 'acknowledgements') return 'Credits — usually a small footer';
  return 'Loosely related to your main point';
}

/**
 * Rank the sections the poster spine does NOT already claim, most
 * related to the paper's core first.
 *
 * Returns EVERY candidate, flagged — the UI shows the suggested ones
 * checked and the rest available to add, because "derive then adjust"
 * needs both halves visible.
 */
export function rankSections(
  doc: DocumentModel,
  takeaway: string,
  findings: Finding[],
): SectionRelevance[] {
  const candidates = doc.sections.filter((s) => !SPINE_KINDS.has(s.kind));
  if (candidates.length === 0) return [];

  const core = buildCoreTerms(doc, takeaway, findings);
  const idf = buildIdf(doc.sections);
  const total = doc.sections.length;

  const scored = candidates.map((section) => {
    const overlap = overlapScore(section, core, idf);
    const heading = headingScore(section, core);
    const prior = KIND_PRIOR[section.kind] ?? 0.2;
    const position = positionScore(section, total);

    // Weights: overlap dominates, the lexicon prior is a real vote,
    // heading semantics break near-ties, position barely nudges.
    const score =
      overlap * 0.45 + prior * 0.3 + heading * 0.15 + position * 0.1;

    return {
      id: section.id,
      heading: section.heading || 'Untitled section',
      kind: section.kind,
      score: Math.round(score * 1000) / 1000,
      suggested: score >= SUGGEST_THRESHOLD,
      reason: reasonFor(section, overlap, heading),
    };
  });

  // Score desc, then source order — Array.prototype.sort is stable and
  // `candidates` is already in document order, so ties stay readable.
  return [...scored].sort((a, b) => b.score - a.score);
}
