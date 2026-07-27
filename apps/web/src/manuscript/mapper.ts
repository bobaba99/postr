/**
 * Narrative mapper — DETERMINISTIC. Rubric §2, no LLM.
 *
 * Maps DocumentModel sections onto the five-role poster spine, ranks
 * findings, and applies every cut decision. The LLM never decides
 * structure: letting the model decide structure is how you get a
 * poster with a 300-word literature review, because that is what the
 * source emphasised.
 *
 * Selection is HIERARCHICAL, not a ranked truncation. The core message
 * is established first (coreRelevance.ts), and everything else is scored
 * for relevance TO that core and placed in tiers: 1 the core, 2 direct
 * evidence, 3 context that makes it interpretable, 4 everything else.
 * Budget is squeezed from tier 4 upward.
 *
 * `CUT_BY_DEFAULT` survives as a scoring PRIOR, not a verdict —
 * acknowledgements really is low value, but a limitations section that
 * genuinely discusses the main finding can now out-score it instead of
 * being deleted by list membership.
 */
import type {
  DocumentModel,
  Finding,
  ManuscriptSection,
  MappedPinnedSection,
  MappedRole,
  NarrativeRoleId,
  NarrativeTier,
} from '@postr/shared';
import {
  buildCore,
  buildIdf,
  rankCandidates,
  tierForScore,
  scoreCandidate,
  type CoreMessage,
  type RelevanceCandidate,
  type RelevanceScore,
} from './coreRelevance';
import {
  budgetScaleForSlides,
  MAX_PINNED_SECTIONS,
  MAX_ROLE_SOURCE_CHARS,
  PINNED_SECTION_BUDGET_WORDS,
  POSTER_MAX_FINDINGS,
  POSTER_ROLE_SPECS,
  tieredBudget,
} from './rubric';

/** Everything the hierarchy needs from the interview. All optional —
 *  the mapper runs before Q1 is answered (ingest summary) and must
 *  degrade to a derived core rather than fail. */
export interface NarrativeContext {
  /** Q1 — the author's takeaway. The primary core source. */
  takeaway?: string;
  /** Q5 — pinned section ids. A pin outranks any score. */
  pinnedSectionIds?: string[];
  /** Q2 — the author's finding ranking. Overrides core relevance:
   *  if the author said finding B leads, B leads. */
  rankedFindingIds?: string[];
  /** Q6 — slot constraint. `null`/undefined = rubric budgets untouched. */
  slideCount?: number | null;
}

export interface NarrativeMap {
  /** Present roles in poster reading order. */
  roles: MappedRole[];
  /** Ranked candidate findings (top POSTER_MAX_FINDINGS). */
  findings: Finding[];
  /** Sections scored into tier 4 — offered as Q5 pin options. */
  cutSections: ManuscriptSection[];
  /** Pinned sections rescued from the cut, each with its own budget. */
  pinned: MappedPinnedSection[];
  /** The established core message and where it came from. */
  core: CoreMessage;
  /** Traceable scores for every section candidate, tier order. */
  sectionScores: RelevanceScore[];
  /** Traceable scores for every finding, in final selection order. */
  findingScores: RelevanceScore[];
  /** Structural problems worth telling the user about. */
  warnings: string[];
}

const QUESTION_PATTERN =
  /\b(we (asked|tested|hypothesi\w+|investigat\w+|examin\w+|predict\w+|sought)|aim(s|ed)?\s+(of|to|was|were)|objectives?\s+(of|was|were)|research question|whether|to (test|determine|investigate|examine|assess))\b/i;

const METHODS_NOISE_PATTERN =
  /\b(version\s+\d|v\d+\.\d|ethics (approval|committee|board)|IRB|institutional review board|RRID|protocol (number|#)|catalog(ue)? (number|#))\b/i;

const FINDING_EFFECT_PATTERN =
  /\b(significant(ly)?|increased?|decreased?|reduced?|improved?|higher|lower|greater|smaller|faster|slower|associated|predict(ed|s)?|correlated?|difference|effect|declined?|rose|fell)\b/i;

/**
 * Kinds the poster historically deleted wholesale. Now a scoring PRIOR
 * rather than the verdict: membership here penalises a section, but a
 * high core-relevance score can still rescue it, and a Q5 pin always
 * does. Kept because the prior is genuinely informative — an
 * acknowledgements block earns poster space roughly never.
 */
const CUT_BY_DEFAULT: ReadonlySet<string> = new Set([
  'literature-review',
  'limitations',
  'acknowledgements',
  'appendix',
  'other',
]);

/** How much being on the historic blocklist costs a section's score.
 *  Large enough that a genuinely peripheral section stays cut, small
 *  enough that a limitations section discussing the main finding can
 *  climb out. */
const BLOCKLIST_PENALTY = 0.15;

/** Sections at or below this score are cut. Sits just under the tier-3
 *  boundary so "tier 4" and "cut" mean the same thing. */
const CUT_TIER: NarrativeTier = 4;

/** Split a paragraph into sentences. Deterministic and intentionally
 *  simple — abbreviation edge cases cost a split, not a crash. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z("'‘“])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function sectionText(section: ManuscriptSection): string {
  return section.paragraphs.join('\n\n');
}

/**
 * Bound a role's source excerpt to MAX_ROLE_SOURCE_CHARS.
 *
 * The condense route rejects over-long `sourceText` outright, so an
 * unbounded excerpt turns a long manuscript into a hard 400 instead of
 * a poster. Cut at the last sentence boundary inside the budget so the
 * model never receives a half-sentence; fall back to a hard slice when
 * a single "sentence" is itself over the cap (unpunctuated dumps).
 *
 * Losing the tail is correct behaviour, not a compromise: every role
 * has a 40–150 word budget, and this only trims sources already ~25x
 * larger than anything that could survive condensing.
 */
export function capSourceText(text: string): string {
  if (text.length <= MAX_ROLE_SOURCE_CHARS) return text;
  const head = text.slice(0, MAX_ROLE_SOURCE_CHARS);
  const lastBreak = Math.max(
    head.lastIndexOf('. '),
    head.lastIndexOf('.\n'),
    head.lastIndexOf('! '),
    head.lastIndexOf('? '),
  );
  // Require the boundary to keep most of the budget, else hard-slice.
  if (lastBreak > MAX_ROLE_SOURCE_CHARS * 0.5) {
    return head.slice(0, lastBreak + 1).trim();
  }
  return head.trim();
}

function sectionsOfKind(doc: DocumentModel, kind: ManuscriptSection['kind']) {
  return doc.sections.filter((s) => s.kind === kind);
}

function abstractParagraphs(doc: DocumentModel): string[] {
  return (doc.abstract ?? '').split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
}

/** Content-word overlap: how much of `text`'s meaning the title
 *  already carries. Used for the hook's "drop entirely" cut rule. */
export function titleOverlap(title: string, text: string): number {
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );
  const titleWords = words(title);
  const textWords = words(text);
  if (textWords.size === 0) return 0;
  let shared = 0;
  for (const w of textWords) {
    if (titleWords.has(w)) shared++;
  }
  return shared / textWords.size;
}

// ─────────────────────────────────────────────────────────────────────
// Findings extraction + ranking
// ─────────────────────────────────────────────────────────────────────

function scoreFindingSentence(sentence: string): number {
  let score = 0;
  if (/[( ]p\s*[<=>≤≥]/i.test(sentence)) score += 3;
  if (/\d+(\.\d+)?\s*%/.test(sentence)) score += 2;
  if (FINDING_EFFECT_PATTERN.test(sentence)) score += 2;
  if (/\d/.test(sentence)) score += 1;
  if (/\b(figure|fig\.?|table)\s*\d/i.test(sentence)) score += 1;
  return score;
}

/** Highest `scoreFindingSentence` can plausibly reach (p-value 3 +
 *  percentage 2 + effect verb 2 + digit 1 + figure ref 1). Used to
 *  normalise prominence into the 0..1 the relevance scorer expects. */
const MAX_FINDING_PROMINENCE = 9;

/**
 * Stable id for a finding, derived from its own text.
 *
 * MUST NOT be random. `mapNarrative` runs twice — once at ingest with a
 * derived core, once after Q6 with the full context — and the author's
 * Q2 ranking is stored as finding IDS between those two calls. A
 * `nanoid` here would mint fresh ids on the re-map, silently orphaning
 * the ranking so the user's explicit "this finding leads" became a
 * no-op. Content-derived ids make the override actually bind, and make
 * the whole map reproducible for the same input.
 *
 * FNV-1a: tiny, dependency-free, and collision-safe enough for the
 * handful of sentences a Results section yields.
 */
export function findingId(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `f${hash.toString(36)}`;
}

/** Every candidate finding, unranked, in document order. */
function findingCandidates(doc: DocumentModel): Finding[] {
  const resultSections = sectionsOfKind(doc, 'results');
  const candidates: Finding[] = [];
  const seen = new Set<string>();
  for (const section of resultSections) {
    for (const paragraph of section.paragraphs) {
      for (const sentence of splitSentences(paragraph)) {
        const score = scoreFindingSentence(sentence);
        if (score < 2) continue;
        const id = findingId(sentence);
        // A manuscript can repeat a sentence verbatim; ids must stay
        // unique or the Q2 override would address two candidates.
        if (seen.has(id)) continue;
        seen.add(id);
        candidates.push({
          id,
          text: sentence,
          score,
          sectionId: section.id,
          hasNumber: /\d/.test(sentence),
        });
      }
    }
  }
  return candidates;
}

/**
 * Rank findings by effect prominence alone; keep the top 3.
 *
 * Retained for callers that have no core yet (the ingest summary runs
 * before Q1). `rankFindingsByCore` is the hierarchical path and is what
 * `mapNarrative` uses once a takeaway exists — prominence answers "is
 * this a big effect", not "does this carry the argument".
 */
export function extractFindings(doc: DocumentModel): Finding[] {
  // Stable ranking: score desc, then source order (candidates were
  // collected in document order, and Array.prototype.sort is stable).
  return [...findingCandidates(doc)]
    .sort((a, b) => b.score - a.score)
    .slice(0, POSTER_MAX_FINDINGS);
}

/**
 * Rank findings by RELEVANCE TO THE CORE, with prominence as one signal
 * among several rather than the verdict.
 *
 * The author's Q2 ranking is an absolute override: an id listed first in
 * `rankedFindingIds` leads, even when it scores lower. The user outranks
 * the algorithm — that is the standing rule, not a special case.
 *
 * The converse rule is just as load-bearing: an EMPTY `rankedFindingIds`
 * must fall through to pure score order and mark nothing
 * `override: 'user-ranking'`. Callers signal "the user declined to
 * reorder" by passing nothing, so anything that quietly fills this
 * parameter with a default order both freezes that order past the
 * takeaway and makes the outline claim the user picked the lead. Telling
 * someone they made a decision they did not make removes the very signal
 * that would let them spot a wrong ordering, so the override is applied
 * strictly per-id and only for ids the caller actually named.
 */
export function rankFindingsByCore(
  findings: readonly Finding[],
  core: CoreMessage,
  idf: ReadonlyMap<string, number>,
  rankedFindingIds: readonly string[] = [],
): { findings: Finding[]; scores: RelevanceScore[] } {
  if (findings.length === 0) return { findings: [], scores: [] };

  const byId = new Map(findings.map((f) => [f.id, f]));
  // Only ids we actually hold — a stale ranking must not resurrect a
  // finding that no longer exists.
  const userOrder = rankedFindingIds.filter((id) => byId.has(id));
  // `undefined` when the user named nothing, and `c.id === undefined` is
  // false for every candidate — so no finding is attributed to them.
  const userLead = userOrder[0];

  const candidates: RelevanceCandidate[] = findings.map((f, index) => ({
    id: f.id,
    kind: 'finding',
    text: f.text,
    sectionKind: 'results',
    sourceOrder: index,
    sourceTotal: findings.length,
    prominence: Math.min(1, f.score / MAX_FINDING_PROMINENCE),
  }));

  const scores = rankCandidates(candidates, core, idf, (c) => ({
    userRanked: userLead !== undefined && c.id === userLead,
  }));

  // Score order first, then let the author's explicit ordering pull its
  // named findings to the front in the order they gave.
  const scoreOrder = scores.map((s) => s.id);
  const finalOrder = [
    ...userOrder,
    ...scoreOrder.filter((id) => !userOrder.includes(id)),
  ];

  const scoreById = new Map(scores.map((s) => [s.id, s]));
  const ordered = finalOrder
    .map((id) => byId.get(id))
    .filter((f): f is Finding => f !== undefined)
    .slice(0, POSTER_MAX_FINDINGS);

  return {
    findings: ordered,
    scores: ordered
      .map((f) => scoreById.get(f.id))
      .filter((s): s is RelevanceScore => s !== undefined),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Role mapping
//
// Roles are emitted WITHOUT a tier; `assignRoleTiers` scores them
// against the core afterwards. Keeping the two apart means the sourcing
// rules (which paragraph does the hook come from) stay independent of
// the hierarchy rules (how much budget does it deserve).
// ─────────────────────────────────────────────────────────────────────

type UntieredRole = Omit<MappedRole, 'tier' | 'reason'>;

/**
 * The role that IS the core message. The takeaway states the claim
 * everything else revolves around, so it is structurally tier 1 — never
 * cut, first claim on budget — rather than earning that by score.
 */
const CORE_ROLE: NarrativeRoleId = 'takeaway';

/**
 * Roles whose job is to make the core interpretable rather than to
 * evidence it. They are floored at tier 3 even when they share little
 * wording with the core: a poster whose methods have been squeezed to
 * nothing gives the reader no reason to believe the claim, and the hook
 * is what makes anyone care enough to read on.
 */
const CONTEXT_ROLES: ReadonlySet<NarrativeRoleId> = new Set<NarrativeRoleId>([
  'hook',
  'methods',
]);

/**
 * Place every role in the hierarchy around the core.
 *
 * A required role never lands in tier 4 — `question`, `keyResult` and
 * `takeaway` are the poster's spine, and tier 4 is the "cut first" band.
 * Squeezing them to nothing produces a broken poster, not a shorter one.
 */
function assignRoleTiers(
  roles: readonly UntieredRole[],
  core: CoreMessage,
  idf: ReadonlyMap<string, number>,
): MappedRole[] {
  return roles.map((role) => {
    if (role.role === CORE_ROLE) {
      return { ...role, tier: 1 as NarrativeTier, reason: 'This is your main message' };
    }

    const scored = scoreCandidate(
      {
        id: role.role,
        kind: 'role',
        text: role.sourceText,
        sectionKind: ROLE_SECTION_KIND[role.role],
      },
      core,
      idf,
    );

    // Floors, in order of authority: required roles can never be cut
    // first (tier 3 at worst), and context roles carry the belief the
    // core needs even when they echo none of its wording.
    let tier = scored.tier;
    if (role.required && tier > 3) tier = 3;
    if (CONTEXT_ROLES.has(role.role) && tier > 3) tier = 3;

    return {
      ...role,
      tier,
      reason: tier === scored.tier ? scored.reason : ROLE_FLOOR_REASON[role.role],
    };
  });
}

/** Section kind each role draws from, for the lexicon prior. */
const ROLE_SECTION_KIND: Record<NarrativeRoleId, ManuscriptSection['kind']> = {
  hook: 'introduction',
  question: 'introduction',
  methods: 'methods',
  keyResult: 'results',
  takeaway: 'discussion',
};

/** Shown when a floor, not the score, decided the tier. */
const ROLE_FLOOR_REASON: Record<NarrativeRoleId, string> = {
  hook: 'Sets up why your point matters',
  question: 'Every poster needs its question',
  methods: 'Context readers need to trust the result',
  keyResult: 'The evidence for your main message',
  takeaway: 'This is your main message',
};

function mapHook(doc: DocumentModel, warnings: string[]): UntieredRole | null {
  const intro = sectionsOfKind(doc, 'introduction')[0];
  const abstractParas = abstractParagraphs(doc);
  const source = intro?.paragraphs[0] ?? abstractParas[0] ?? '';
  if (!source) return null;
  // Cut rule: drop entirely if the title already carries it.
  if (titleOverlap(doc.title, splitSentences(source)[0] ?? '') >= 0.8) {
    warnings.push('Background dropped — your title already carries the hook.');
    return null;
  }
  return {
    role: 'hook',
    budgetWords: POSTER_ROLE_SPECS.hook.budgetWords,
    sourceText: capSourceText(source),
    sourceHeadings: intro ? [intro.heading] : ['Abstract'],
    required: POSTER_ROLE_SPECS.hook.required,
    missing: false,
  };
}

function mapQuestion(doc: DocumentModel, warnings: string[]): UntieredRole {
  const intro = sectionsOfKind(doc, 'introduction')[0];
  const introFinal = intro?.paragraphs[intro.paragraphs.length - 1] ?? '';
  const abstractSentences = abstractParagraphs(doc).flatMap(splitSentences);

  const fromIntro = splitSentences(introFinal).filter((s) =>
    QUESTION_PATTERN.test(s),
  );
  const fromAbstract = abstractSentences.filter((s) => QUESTION_PATTERN.test(s));
  const matched = fromIntro.length > 0 ? fromIntro : fromAbstract;

  const missing = matched.length === 0;
  if (missing) {
    warnings.push(
      'No explicit research question found. A poster without a question is the most common structural failure — the outline lets you write one in.',
    );
  }
  const sourceText = missing ? introFinal : matched.join(' ');
  const sourceHeadings = missing
    ? intro
      ? [intro.heading]
      : []
    : fromIntro.length > 0
      ? [intro!.heading]
      : ['Abstract'];
  return {
    role: 'question',
    budgetWords: POSTER_ROLE_SPECS.question.budgetWords,
    sourceText: capSourceText(sourceText),
    sourceHeadings,
    required: true,
    missing,
  };
}

function mapMethods(doc: DocumentModel): UntieredRole | null {
  const methodSections = sectionsOfKind(doc, 'methods');
  if (methodSections.length === 0) return null;
  // Cut rule: drop instrument model numbers, software versions,
  // ethics IDs — sentences that build no trust at three feet.
  const kept = methodSections
    .flatMap((s) => s.paragraphs)
    .flatMap(splitSentences)
    .filter((s) => !METHODS_NOISE_PATTERN.test(s));
  if (kept.length === 0) return null;
  return {
    role: 'methods',
    budgetWords: POSTER_ROLE_SPECS.methods.budgetWords,
    sourceText: capSourceText(kept.join(' ')),
    sourceHeadings: methodSections.map((s) => s.heading),
    required: POSTER_ROLE_SPECS.methods.required,
    missing: false,
  };
}

function mapKeyResult(
  doc: DocumentModel,
  findings: Finding[],
  warnings: string[],
): UntieredRole {
  const resultSections = sectionsOfKind(doc, 'results');
  const missing = findings.length === 0;
  if (missing) {
    warnings.push(
      'No quantitative findings detected in the Results section — the Key Findings panel will need your input.',
    );
  }
  return {
    role: 'keyResult',
    budgetWords: POSTER_ROLE_SPECS.keyResult.budgetWords,
    sourceText: capSourceText(findings.map((f) => f.text).join('\n')),
    sourceHeadings: resultSections.map((s) => s.heading),
    required: true,
    missing,
  };
}

function mapTakeaway(doc: DocumentModel, warnings: string[]): UntieredRole {
  const discussion = sectionsOfKind(doc, 'discussion')[0];
  const conclusion = sectionsOfKind(doc, 'conclusion')[0];
  const abstractParas = abstractParagraphs(doc);
  const lastAbstractSentence = splitSentences(
    abstractParas[abstractParas.length - 1] ?? '',
  ).at(-1);

  // Discussion ¶1, else conclusion ¶1, else the abstract's close.
  const source =
    discussion?.paragraphs[0] ?? conclusion?.paragraphs[0] ?? lastAbstractSentence ?? '';
  const missing = !source;
  if (missing) {
    warnings.push('No discussion or conclusion found for the take-home message.');
  }
  const sourceHeadings = discussion
    ? [discussion.heading]
    : conclusion
      ? [conclusion.heading]
      : source
        ? ['Abstract']
        : [];
  return {
    role: 'takeaway',
    budgetWords: POSTER_ROLE_SPECS.takeaway.budgetWords,
    sourceText: capSourceText(source),
    sourceHeadings,
    required: true,
    missing,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Section tiering
// ─────────────────────────────────────────────────────────────────────

/**
 * Kinds the five-role spine already consumes. They are not scored as
 * standalone sections — their content reaches the poster through a role,
 * and scoring them twice would double-count.
 */
const SPINE_KINDS: ReadonlySet<ManuscriptSection['kind']> = new Set([
  'abstract',
  'introduction',
  'methods',
  'results',
  'discussion',
  'conclusion',
  'references',
]);

/**
 * Score every non-spine section against the core and place it in a tier.
 *
 * This replaces the static blocklist as the CUT DECISION. The blocklist
 * still votes — via `BLOCKLIST_PENALTY` — but the score makes the call,
 * so a limitations section that genuinely bounds the main claim can now
 * survive where list membership alone would have deleted it.
 *
 * A Q5 pin is ABSOLUTE: pinned sections are forced to tier 2 before any
 * arithmetic runs, because a pin is the user telling us the answer.
 */
function scoreSections(
  doc: DocumentModel,
  core: CoreMessage,
  idf: ReadonlyMap<string, number>,
  pinnedIds: ReadonlySet<string>,
): RelevanceScore[] {
  const candidates: RelevanceCandidate[] = doc.sections
    .filter((s) => !SPINE_KINDS.has(s.kind))
    .map((s) => ({
      id: s.id,
      kind: 'section' as const,
      text: `${s.heading} ${s.paragraphs.join(' ')}`,
      sectionKind: s.kind,
      sourceOrder: s.sourceOrder,
      sourceTotal: doc.sections.length,
    }));

  const scored = rankCandidates(candidates, core, idf, (c) => ({
    pinned: pinnedIds.has(c.id),
  }));

  const kindById = new Map(doc.sections.map((s) => [s.id, s.kind]));

  // Apply the historic-blocklist prior AFTER scoring so the penalty is
  // visible as its own effect rather than buried inside the composite.
  // Pins are exempt — nothing demotes a pin.
  const penalised = scored.map((s) => {
    const kind = kindById.get(s.id);
    if (kind === undefined || s.override !== null) return s;
    if (!CUT_BY_DEFAULT.has(kind)) return s;
    const score = Math.max(
      0,
      Math.round((s.score - BLOCKLIST_PENALTY) * 1000) / 1000,
    );
    const tier = tierForScore(score);
    return {
      ...s,
      score,
      tier,
      // The reason must describe the tier the section ACTUALLY landed
      // in. Leaving the pre-penalty reason attached is how the outline
      // ends up telling the user "direct evidence for your main message"
      // next to something it just cut.
      reason: tier === s.tier ? s.reason : reasonForCutKind(kind),
    };
  });

  // Re-sort: the penalty can move a section across a tier boundary, and
  // callers (and the outline) rely on this list being in tier order.
  return [...penalised].sort((a, b) => a.tier - b.tier || b.score - a.score);
}

/** Terse, kind-specific phrase for a section the penalty pushed down. */
function reasonForCutKind(kind: ManuscriptSection['kind']): string {
  switch (kind) {
    case 'acknowledgements':
      return 'Credits — rarely earns poster space';
    case 'appendix':
      return 'Supplementary detail';
    case 'literature-review':
      return 'Background reading, not your finding';
    case 'limitations':
      return 'Caveats — kept only if they bound your claim';
    default:
      return 'Little overlap with your main message';
  }
}

// ─────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────

/**
 * Build the hierarchical narrative map.
 *
 * Order matters and mirrors "write backwards": establish the CORE, then
 * rank findings by relevance to it, then place every role and section in
 * the hierarchy around it, then allocate budget by tier. Nothing here
 * consults the LLM — this is a scoring problem.
 *
 * `context` is optional throughout: the mapper runs once at ingest,
 * before Q1 exists, and must degrade to a derived core rather than fail.
 */
export function mapNarrative(
  doc: DocumentModel,
  context: NarrativeContext = {},
): NarrativeMap {
  const warnings: string[] = [];
  const {
    takeaway = '',
    pinnedSectionIds = [],
    rankedFindingIds = [],
    slideCount = null,
  } = context;

  const scale = budgetScaleForSlides(slideCount);
  const idf = buildIdf(doc.sections);

  // 1. The core, first — everything else is measured against it.
  const prominenceRanked = extractFindings(doc);
  const core = buildCore(doc, takeaway, prominenceRanked);
  if (core.source === 'derived' && doc.sections.length > 0) {
    warnings.push(
      'Working from your title and abstract for now — your answer below will sharpen what gets kept.',
    );
  }

  // 2. Findings, ranked by relevance to the core, with Q2 as override.
  const { findings, scores: findingScores } = rankFindingsByCore(
    findingCandidates(doc),
    core,
    idf,
    rankedFindingIds,
  );

  // 3. Sections placed in the hierarchy. Pins are absolute.
  const pinnedIds = new Set(pinnedSectionIds.slice(0, MAX_PINNED_SECTIONS));
  const sectionScores = scoreSections(doc, core, idf, pinnedIds);
  const cutIds = new Set(
    sectionScores.filter((s) => s.tier === CUT_TIER).map((s) => s.id),
  );
  const cutSections = doc.sections.filter(
    (s) => cutIds.has(s.id) && !pinnedIds.has(s.id),
  );

  const scoreById = new Map(sectionScores.map((s) => [s.id, s]));
  const pinned: MappedPinnedSection[] = doc.sections
    .filter((s) => pinnedIds.has(s.id))
    .map((s) => ({
      id: s.id,
      heading: s.heading || 'Additional Notes',
      // Pins are tier 2 — protected, squeezed only after tier 3 and 4.
      budgetWords: tieredBudget(PINNED_SECTION_BUDGET_WORDS, scale, 2, false),
      sourceText: capSourceText(sectionText(s)),
      tier: 2 as NarrativeTier,
      reason: scoreById.get(s.id)?.reason ?? 'You asked to keep this',
    }));

  // 4. Roles tiered around the core, then budgeted BY TIER.
  const roles = assignRoleTiers(
    [
      mapHook(doc, warnings),
      mapQuestion(doc, warnings),
      mapMethods(doc),
      mapKeyResult(doc, findings, warnings),
      mapTakeaway(doc, warnings),
    ].filter((r): r is UntieredRole => r !== null),
    core,
    idf,
  ).map((role) => ({
    ...role,
    budgetWords: tieredBudget(role.budgetWords, scale, role.tier, role.required),
  }));

  return {
    roles,
    findings,
    cutSections,
    pinned,
    core,
    sectionScores,
    findingScores,
    warnings,
  };
}
