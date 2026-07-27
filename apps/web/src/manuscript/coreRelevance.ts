/**
 * Core-message relevance — DETERMINISTIC. No LLM, no randomness, no clock.
 *
 * The pipeline used to answer the wrong question. `extractFindings()`
 * ranked by effect PROMINENCE and `mapNarrative()` cut against a STATIC
 * blocklist; neither asks *does this serve the story being told?* Those
 * diverge routinely — a large incidental effect can matter less than a
 * modest one that carries the argument.
 *
 * So: establish the CORE first, then score everything else for relevance
 * to it. This is the structural form of "write backwards" (Montagnes
 * et al. 2021, docs/plans/2026-07-27-manuscript-to-presentation.md §0.1)
 * — start at the conclusion and build back from it, rather than walking
 * the manuscript front-to-back.
 *
 * Every score is TRACEABLE: it carries which signals fired and what each
 * contributed, so the outline can explain a cut in one human phrase and a
 * test can assert on the reason rather than on an opaque number.
 */
import type {
  DocumentModel,
  Finding,
  ManuscriptSection,
  SectionKind,
} from '@postr/shared';
import { contentTerms } from './sectionRelevance';

// ─────────────────────────────────────────────────────────────────────
// The core
// ─────────────────────────────────────────────────────────────────────

/** Where the core message came from. Surfaced so the UI can say so —
 *  a derived core is a guess and the user deserves to know. */
export type CoreSource = 'takeaway' | 'derived';

export interface CoreMessage {
  /** The prose the whole poster revolves around. */
  text: string;
  /** Which source produced it. */
  source: CoreSource;
  /** Weighted content terms — term → weight. */
  terms: ReadonlyMap<string, number>;
  /** Numbers and statistics appearing in the core. */
  numbers: ReadonlySet<string>;
}

/**
 * Numeric tokens shared between a candidate and the core: percentages,
 * p-values, counts, decimals. A candidate quoting the core's own numbers
 * is almost certainly the evidence for it.
 *
 * Normalised by stripping trailing zeros so "21%" matches "21.0%", and
 * bare years are excluded — "2024" in a citation is not evidence.
 */
export function statTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  // The leading-dot alternative is not optional polish: APA style writes
  // p-values as ".001", and a pattern requiring a leading digit reads
  // that as the integer 001 → "1", which then spuriously matches any
  // candidate mentioning the number one. P-values are the strongest
  // signal that two sentences describe the same result, so mis-tokenising
  // them corrupts exactly the comparison this function exists for.
  for (const raw of text.match(/\d+(?:\.\d+)?|\.\d+/g) ?? []) {
    // A four-digit integer in the 1900–2099 band reads as a year far
    // more often than as an effect size.
    const value = Number(raw);
    if (/^\d{4}$/.test(raw) && value >= 1900 && value <= 2099) continue;
    tokens.add(String(value));
  }
  return tokens;
}

/**
 * Establish the core. The author's Q1 takeaway is PRIMARY — it is their
 * own statement of their thesis, which is strictly better evidence than
 * anything we can infer.
 *
 * CRITICAL: when a takeaway exists, the top-ranked finding is NOT folded
 * into the core. It is tempting — the lead finding usually does express
 * the claim — but it makes the scoring CIRCULAR: the core would absorb
 * that finding's terms and numbers, and the finding would then score
 * near-perfectly against a core built partly out of itself. Since the
 * lead finding is chosen by PROMINENCE, that circularity quietly
 * reinstates prominence as the verdict, which is the exact behaviour
 * this module replaces. A loud but irrelevant effect would seed the core
 * with its own statistics and then win on "shared numbers".
 *
 * So: with a takeaway, the core is the takeaway plus the title (both
 * author-written statements of the claim, neither derived from the
 * candidates being judged). Only in the FALLBACK — where there is no
 * author statement to use — does the top finding contribute, and there
 * it is unavoidable rather than circular.
 */
export function buildCore(
  doc: DocumentModel,
  takeaway: string,
  findings: readonly Finding[],
): CoreMessage {
  const trimmed = takeaway.trim();
  const topFinding = findings[0]?.text ?? '';

  const weighted: ReadonlyArray<readonly [string, number]> = trimmed
    ? [
        [trimmed, 3],
        [doc.title, 1],
      ]
    : [
        [doc.title, 3],
        [topFinding, 2],
        [doc.abstract ?? '', 1],
      ];

  const terms = new Map<string, number>();
  for (const [text, weight] of weighted) {
    for (const term of new Set(contentTerms(text))) {
      terms.set(term, (terms.get(term) ?? 0) + weight);
    }
  }

  const text = trimmed
    ? trimmed
    : [doc.title, topFinding, doc.abstract ?? '']
        .filter(Boolean)
        .join(' ')
        .trim();

  return {
    text,
    source: trimmed ? 'takeaway' : 'derived',
    terms,
    // Numbers likewise: only what the author actually wrote.
    numbers: statTokens(trimmed ? trimmed : text),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Signals
// ─────────────────────────────────────────────────────────────────────

/** One named signal's contribution to a candidate's score. */
export interface SignalContribution {
  signal: 'overlap' | 'numbers' | 'kind' | 'position' | 'prominence';
  /** Raw signal value in 0..1, before weighting. */
  value: number;
  /** What this signal added to the final 0..1 score. */
  contribution: number;
}

/** Weights. Overlap dominates — it is the signal that actually answers
 *  "does this serve the story". The rest break ties. `scoreCandidate`
 *  renormalises over whichever signals apply, so these are RELATIVE
 *  weights; they need not sum to 1. */
const SIGNAL_WEIGHTS: Record<SignalContribution['signal'], number> = {
  overlap: 0.45,
  numbers: 0.2,
  kind: 0.15,
  prominence: 0.12,
  position: 0.08,
};

/**
 * Generalised term overlap, TF-IDF-ish.
 *
 * This is the generalisation of `titleOverlap()` in mapper.ts: that
 * helper measured unweighted content-word overlap against one string.
 * Here every core term carries a weight (how central it is to the claim)
 * and an IDF (how discriminating it is across this manuscript), so a
 * topic word appearing in every section counts for little while a term
 * unique to the argument counts for a lot.
 *
 * Normalised by the square root of the candidate's own term count —
 * dividing by the raw count punishes any substantial candidate too
 * harshly, since overlap grows far slower than length.
 */
export function weightedOverlap(
  text: string,
  core: ReadonlyMap<string, number>,
  idf: ReadonlyMap<string, number>,
): number {
  const terms = new Set(contentTerms(text));
  if (terms.size === 0) return 0;
  let sum = 0;
  for (const term of terms) {
    const coreWeight = core.get(term);
    if (coreWeight === undefined) continue;
    sum += coreWeight * (idf.get(term) ?? 1);
  }
  const normalised = sum / Math.sqrt(terms.size);
  // Squash into [0,1). The absolute scale is arbitrary — only ordering
  // and the tier thresholds matter.
  return normalised / (normalised + 3);
}

/** Share of the core's numbers that the candidate also quotes. */
export function numberOverlap(
  text: string,
  coreNumbers: ReadonlySet<string>,
): number {
  if (coreNumbers.size === 0) return 0;
  const own = statTokens(text);
  if (own.size === 0) return 0;
  let hits = 0;
  for (const n of coreNumbers) {
    if (own.has(n)) hits++;
  }
  return hits / coreNumbers.size;
}

/**
 * Inverse document frequency across the manuscript's own sections.
 * Computed once per document and shared by every candidate so the
 * scoring stays O(n) and, more importantly, so every candidate is
 * measured on the same yardstick.
 */
export function buildIdf(sections: readonly ManuscriptSection[]): Map<string, number> {
  const docCount = Math.max(sections.length, 1);
  const seenIn = new Map<string, number>();
  for (const section of sections) {
    const terms = new Set(
      contentTerms(`${section.heading} ${section.paragraphs.join(' ')}`),
    );
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

/**
 * Section-kind priors. These encode decades of poster convention about
 * what earns space, and they are an INPUT to scoring, not a verdict —
 * the old `CUT_BY_DEFAULT` blocklist made the final call, which is
 * exactly the behaviour being replaced. Acknowledgements really is low
 * value; a limitations section that discusses the main finding can still
 * out-score it.
 */
export const KIND_PRIOR: Readonly<Record<SectionKind, number>> = {
  results: 1,
  discussion: 0.85,
  conclusion: 0.85,
  introduction: 0.7,
  methods: 0.7,
  abstract: 0.6,
  limitations: 0.5,
  other: 0.35,
  'literature-review': 0.25,
  references: 0.15,
  appendix: 0.1,
  acknowledgements: 0.05,
};

// ─────────────────────────────────────────────────────────────────────
// Tiers
// ─────────────────────────────────────────────────────────────────────

/**
 * The hierarchy. Everything revolves around tier 1.
 *
 *   1 — the core message itself. Never cut, first claim on budget.
 *   2 — direct evidence FOR the core claim.
 *   3 — what makes the core interpretable: method detail that licenses
 *       belief, caveats that bound it.
 *   4 — everything else. Cut first when budget is tight.
 */
export type Tier = 1 | 2 | 3 | 4;

/** Score thresholds separating tier 2 / 3 / 4. Tier 1 is assigned
 *  structurally (the core role, a user override, a pin) and never by
 *  score. Tuned against the fixture manuscripts in __tests__. */
export const TIER_2_THRESHOLD = 0.5;
export const TIER_3_THRESHOLD = 0.3;

export type CandidateKind = 'finding' | 'section' | 'figure' | 'role';

/** Why a candidate landed where it did — the whole point of this module.
 *  An opaque number cannot explain a cut to a user or to a test. */
export interface RelevanceScore {
  /** Stable identity of the scored candidate. */
  id: string;
  kind: CandidateKind;
  /** Composite relevance to the core, 0..1. */
  score: number;
  tier: Tier;
  /** Every signal that fired, strongest contribution first. */
  signals: SignalContribution[];
  /** Set when something outranked the score. The user outranks the
   *  algorithm, always. */
  override: 'core' | 'user-ranking' | 'pinned' | null;
  /** One short human phrase. Never a number, never jargon. */
  reason: string;
}

/** Anything that can be scored for relevance to the core. */
export interface RelevanceCandidate {
  id: string;
  kind: CandidateKind;
  /** The text to measure against the core. */
  text: string;
  /** Section kind for the lexicon prior. Findings inherit their source
   *  section's kind; figures default to `results`. */
  sectionKind?: SectionKind;
  /** 0-based position in the manuscript, and the total, for the position
   *  signal. Omit when position is meaningless for this candidate. */
  sourceOrder?: number;
  sourceTotal?: number;
  /** Pre-existing prominence in 0..1 (a finding's effect strength). This
   *  is the OLD ranking, kept as one signal among several rather than as
   *  the verdict it used to be. */
  prominence?: number;
}

function reasonFor(
  candidate: RelevanceCandidate,
  signals: readonly SignalContribution[],
  tier: Tier,
  override: RelevanceScore['override'],
): string {
  if (override === 'core') return 'This is your main message';
  if (override === 'user-ranking') return 'You chose this to lead';
  if (override === 'pinned') return 'You asked to keep this';

  const byValue = [...signals].sort((a, b) => b.contribution - a.contribution);
  const top = byValue[0];

  if (tier === 4) {
    if (candidate.sectionKind === 'acknowledgements') return 'Credits — rarely earns poster space';
    if (candidate.sectionKind === 'appendix') return 'Supplementary detail';
    if (candidate.sectionKind === 'literature-review') return 'Background reading, not your finding';
    return 'Little overlap with your main message';
  }
  if (top?.signal === 'numbers' && top.value > 0) return 'Shares the numbers behind your point';
  if (tier === 2) return 'Direct evidence for your main message';
  if (top?.signal === 'kind') return 'Context readers need to trust the result';
  return 'Related to your main message';
}

/** The single place a score becomes a tier. Exported so callers that
 *  adjust a score (the mapper's blocklist prior) re-derive the tier from
 *  the same thresholds instead of hardcoding their own copies. */
export function tierForScore(score: number): Tier {
  if (score >= TIER_2_THRESHOLD) return 2;
  if (score >= TIER_3_THRESHOLD) return 3;
  return 4;
}

/**
 * Score one candidate against the core. Pure: same input, same output,
 * every time. No `Math.random`, no `Date` — a ranking that drifts
 * between renders is a ranking the user cannot trust or report a bug
 * against.
 */
export function scoreCandidate(
  candidate: RelevanceCandidate,
  core: CoreMessage,
  idf: ReadonlyMap<string, number>,
  overrides: {
    isCore?: boolean;
    userRanked?: boolean;
    pinned?: boolean;
  } = {},
): RelevanceScore {
  const overlap = weightedOverlap(candidate.text, core.terms, idf);
  const numbers = numberOverlap(candidate.text, core.numbers);
  const kind = candidate.sectionKind ? KIND_PRIOR[candidate.sectionKind] : 0.5;
  const prominence = candidate.prominence ?? 0;
  const position =
    candidate.sourceOrder !== undefined &&
    candidate.sourceTotal !== undefined &&
    candidate.sourceTotal > 1
      ? 1 - candidate.sourceOrder / candidate.sourceTotal
      : 0.5;

  const raw: ReadonlyArray<readonly [SignalContribution['signal'], number]> = [
    ['overlap', overlap],
    ['numbers', numbers],
    ['kind', kind],
    ['prominence', prominence],
    ['position', position],
  ];

  /**
   * Renormalise over the signals that CAN fire.
   *
   * The numbers signal is only meaningful when the core actually
   * contains numbers — and a one-sentence takeaway ("sleep restriction
   * impairs recall") usually contains none. Leaving its 0.2 weight in
   * the denominator would silently cap every candidate at 0.8 and
   * compress the whole range, pushing genuinely relevant material below
   * the tier thresholds for no reason other than how the author phrased
   * their takeaway. Dropping the weight instead keeps the thresholds
   * meaning the same thing whether or not the core quotes a statistic.
   */
  const applicable = new Set<SignalContribution['signal']>(
    raw.map(([signal]) => signal),
  );
  if (core.numbers.size === 0) applicable.delete('numbers');

  const totalWeight = [...applicable].reduce(
    (sum, signal) => sum + SIGNAL_WEIGHTS[signal],
    0,
  );

  const signals: SignalContribution[] = raw.map(([signal, value]) => ({
    signal,
    value: round(value),
    contribution: applicable.has(signal)
      ? round((value * SIGNAL_WEIGHTS[signal]) / totalWeight)
      : 0,
  }));

  const score = round(
    raw.reduce(
      (sum, [signal, value]) =>
        applicable.has(signal)
          ? sum + (value * SIGNAL_WEIGHTS[signal]) / totalWeight
          : sum,
      0,
    ),
  );

  const override: RelevanceScore['override'] = overrides.isCore
    ? 'core'
    : overrides.userRanked
      ? 'user-ranking'
      : overrides.pinned
        ? 'pinned'
        : null;

  // Overrides promote, never demote: the user said this matters, so it
  // is protected regardless of what the arithmetic thinks.
  const tier: Tier = override === 'core' ? 1 : override ? 2 : tierForScore(score);

  return {
    id: candidate.id,
    kind: candidate.kind,
    score,
    tier,
    signals,
    override,
    reason: reasonFor(candidate, signals, tier, override),
  };
}

/**
 * Score and rank a whole candidate set. Sorted by tier ascending then
 * score descending; ties keep source order, because `Array.sort` is
 * stable and the caller passes candidates in document order.
 */
export function rankCandidates(
  candidates: readonly RelevanceCandidate[],
  core: CoreMessage,
  idf: ReadonlyMap<string, number>,
  overrideFor: (
    candidate: RelevanceCandidate,
  ) => { isCore?: boolean; userRanked?: boolean; pinned?: boolean } = () => ({}),
): RelevanceScore[] {
  const scored = candidates.map((candidate) =>
    scoreCandidate(candidate, core, idf, overrideFor(candidate)),
  );
  return [...scored].sort((a, b) => a.tier - b.tier || b.score - a.score);
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
