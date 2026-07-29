#!/usr/bin/env node
/**
 * Arm A — DETERMINISTIC extraction spike (THROWAWAY).
 * ═══════════════════════════════════════════════════════════════════
 * This is a MEASUREMENT SPIKE, not production code. Its only job is to
 * let the experiment in
 *   docs/plans/experiments/extraction-deterministic-vs-llm.md
 * measure whether an upgraded deterministic engine *can* compete with an
 * LLM at finding + ranking a paper's star results. It deliberately does
 * NOT import the app's `coreRelevance.ts` / `mapper.ts`: the signals are
 * re-implemented here in plain JS so the spike stays standalone and the
 * poster engine is never perturbed while we measure.
 *
 * IF ARM A WINS: the winning signals get productionized INTO
 * `apps/web/src/manuscript/coreRelevance.ts` properly — with the full
 * app test suite, immutable data flow, and the traceable-signal
 * contract that module already keeps. Nothing here ships as-is.
 *
 * Common output shape (identical to Arm B, so both are scored the same):
 *   { text, sourceQuote, sourceSection, rank }[]
 * For Arm A, a finding's `sourceQuote` IS a VERBATIM SLICE of the paper that
 * scored it, so `text === sourceQuote` and the fidelity gate (does the quote
 * appear verbatim in the paper?) passes for free.
 *
 * INPUT SHAPE these fixtures actually have: Elicit systematic-review SYNTHESIS
 * prose — markdown with `**bold**` citation labels, `[text](url)` links, inline
 * `[Author, Year]` brackets, a `**Source:** https://…` metadata line, and a
 * per-paper list whose findings are `- **Supporting quote:** "…"` / `> "…"`
 * items. So BEFORE scoring we (a) DROP formatting artifacts (Source/URL/table/
 * bare-citation-label lines), (b) extract the finding CLAUSE from list items,
 * and (c) score every candidate on a MARKDOWN-DE-NOISED copy (`scoringText`)
 * while emitting the untouched verbatim slice. See the de-noising block below.
 * The emitted quote's characters are never altered, only sliced — the fidelity
 * invariant (verbatim substring of text.md after norm) holds for all outputs.
 *
 * Three signals, combined into one score (per the experiment doc §Arm A):
 *   1. semantic/word-content frequency — how often a candidate's content
 *      terms recur across the Results/Discussion corpus (TF-style,
 *      stopword-filtered), measured on the de-noised text;
 *   2. informational density — numbers + effect-size patterns
 *      (d=, p<, %, CI, r=, β=) + capitalized entities, per token, on the
 *      de-noised text (a RUN of Capitalized words = one entity, not many, so a
 *      citation/title can't inflate this);
 *   3. position/section prior — a Results sentence outranks
 *      Discussion/Conclusion, which outrank Methods/Introduction, etc.; an
 *      author-CURATED per-paper finding gets a dedicated high prior.
 * Every candidate must ALSO pass an assertion gate (carries a finding verb or a
 * statistic) — titles, labels, and section captions carry neither and are cut.
 *
 * TODO (production Arm A, out of scope for a no-dependency spike):
 *   The experiment doc names *embedding-based semantic relatedness*
 *   (cosine between a candidate sentence and the paper's core) as the
 *   ideal semantic signal. That needs an embedding model / vector call,
 *   which this dependency-free spike deliberately avoids. Here, signal 1
 *   approximates "semantic relatedness" with lexical content-term
 *   frequency only. The productionized Arm A would ADD embedding cosine
 *   as a fourth signal (or replace signal 1's lexical core with an
 *   embedded one) and re-tune the weights against the fixture papers.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─────────────────────────────────────────────────────────────────────
// Vocabulary — mirrors sectionRelevance.ts's stoplist in spirit, copied
// here so the spike imports nothing from the app.
// ─────────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'these', 'those', 'from',
  'were', 'was', 'are', 'have', 'has', 'had', 'been', 'being', 'their',
  'they', 'them', 'than', 'then', 'there', 'which', 'when', 'while',
  'also', 'more', 'most', 'such', 'both', 'into', 'over', 'under',
  'each', 'other', 'some', 'between', 'among', 'because', 'however',
  'study', 'studies', 'results', 'result', 'data', 'using', 'used',
  'show', 'shows', 'shown', 'found', 'may', 'can', 'will', 'would',
  'could', 'should', 'our', 'not', 'but', 'all', 'its',
]);

/** Content terms of a string: lowercase, ≥4 chars, not a stop word. */
function contentTerms(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

// ─────────────────────────────────────────────────────────────────────
// Markdown de-noising — the fixtures are Elicit systematic-review SYNTHESIS
// prose: markdown with `**bold**` citation labels, `[text](url)` links,
// `- ` list markers, `#` headings, a `**Source:** https://…` metadata line,
// and inline `[Author, Year]` citation brackets. None of that is *content*.
//
// CRITICAL INVARIANT: the emitted `sourceQuote` MUST stay a verbatim slice of
// text.md after the scorer's normalization (collapse-whitespace + trim +
// lowercase). We therefore NEVER strip characters from the emitted quote. We
// strip markdown ONLY to build the internal SCORING signal (`scoringText`
// below): frequency, density, and capitalized-entity counts are measured on
// the de-noised text so formatting tokens can't inflate an artifact, while the
// quote we emit is left byte-for-byte as it appears in the paper.
// ─────────────────────────────────────────────────────────────────────

/**
 * De-noise a candidate line into the plain content we SCORE on. Removes
 * markdown emphasis (`**`, `*`, `__`, `_`), converts `[text](url)` links to
 * their visible `text`, drops inline `[Author, Year]` citation brackets and
 * bare URLs, and collapses whitespace. This return value is used ONLY for
 * scoring — never emitted as a quote.
 */
function scoringText(line) {
  return line
    // [visible](http://url) → visible
    .replace(/\[([^\]]*)\]\((?:[^)]*)\)/g, '$1')
    // inline citation brackets [Author, 2019] / [1] → removed (they are not
    // content, and their many Capitalized author tokens otherwise inflate the
    // capitalized-entity signal).
    .replace(/\[[^\]]*\]/g, ' ')
    // bold / italic / underscore emphasis markers.
    .replace(/\*\*|__|\*|(?<=\w)_(?=\w)|_/g, '')
    // bare URLs anywhere in the line.
    .replace(/https?:\/\/\S+/gi, ' ')
    // markdown table pipes.
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A finding ASSERTS something — it carries a finding verb or a statistic.
// Titles, citation labels, section captions ("Each entry lists …"), and table
// headers are noun phrases with no assertion, so this is the principled gate
// that keeps them out of the ranking. (Every gold finding across the 15
// fixtures satisfies this at the sentence level; the one BIO1 star clause that
// lacks a verb is a substring of a full prose sentence that has one, and we
// emit the full sentence.)
// STRICT: inflected VERB forms only — never noun-stem `\w+` wildcards. A paper
// TITLE full of nouns like "Causality", "Correlation", "Association" must NOT
// register as asserting a finding, so we match "causes/caused", not "caus\w+".
const FINDING_VERB =
  /\b(is|are|was|were|found|finds|shows?|showed|shown|demonstrates?|demonstrated|reduces?|reduced|increases?|increased|leads?|led|suggests?|suggested|associated|impairs?|impaired|improves?|improved|exhibits?|exhibited|retains?|retained|estimated|indicates?|indicated|results?|resulted|reveals?|revealed|highlights?|highlighted|confers?|conferred|causes?|caused|drives?|driven|predisposes?|predisposed|enhances?|enhanced|decreases?|decreased|elevated|correlates?|correlated|contributes?|contributed|linked|affects?|affected|induces?|induced|provides?|provided|supports?|supported|disrupts?|disrupted|establish\w*|extends?|extended)\b/i;
const STAT_ASSERTION =
  /[drtzfβbβη]\s*=\s*-?\.?\d|\bp\s*[<>=]\s*\.?\d|\bci\b|\d+(?:\.\d+)?\s*%|\b(?:od|hr|rr|or)\s*=\s*\d|\$\s?\d/i;

/** Does this candidate state a finding (has a finding verb or a statistic)? */
function assertsFinding(scored) {
  return FINDING_VERB.test(scored) || STAT_ASSERTION.test(scored);
}

/** Fraction of a string's non-space characters that belong to a URL. */
function urlCharFraction(line) {
  const nonSpace = line.replace(/\s+/g, '');
  if (nonSpace.length === 0) return 0;
  let urlChars = 0;
  for (const m of line.match(/https?:\/\/\S+/gi) ?? []) {
    urlChars += m.replace(/\s+/g, '').length;
  }
  return urlChars / nonSpace.length;
}

/**
 * Formatting artifacts that are NOT findings and must never be ranked:
 *   - a `**Source:**` / `Source:` metadata line (Elicit's provenance line);
 *   - a line that is >30% URL characters (mostly a link);
 *   - a markdown table row / separator (`| … |`, `|----|`);
 *   - a bare citation LABEL with no finding clause — a line whose stripped
 *     content is just "Author Year — Title" / "Author, Year" with no prose
 *     after the label (detected in extractCandidate by the absence of an
 *     extractable finding clause), handled at the call site.
 */
function isMetadataOrArtifactLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  // "**Source:** …" or "Source: …" provenance line.
  if (/^[-*\s>]*(?:\*\*|__)?\s*source\s*:?\s*(?:\*\*|__)?\s*:/i.test(trimmed)) return true;
  if (/^[-*\s>]*(?:\*\*|__)?source(?:\*\*|__)?:/i.test(trimmed)) return true;
  // Line that is mostly a URL.
  if (urlCharFraction(trimmed) > 0.3) return true;
  // Markdown table row or separator.
  if (/^\|/.test(trimmed) || /^[-|:\s]+$/.test(trimmed)) return true;
  // "Papers extracted:" style metadata header.
  if (/^\*{0,2}papers?\s+extracted\s*:?/i.test(trimmed)) return true;
  return false;
}

/**
 * Does a stripped line OPEN with an author-year citation label — a run of
 * `Surname (et al.)?, YEAR` (accented letters allowed)? These head the per-paper
 * entries in the Elicit synthesis:
 *   "Morán-Ramos et al., 2017 — Gut Microbiota …"
 *   "Zhang et al., 2024 — The complex link …"
 *   "B. Gilroy, 2012 — Center for International …"
 *   "J. Gromadzki, 2021 — Labor supply effects …"   (### sub-heading form)
 * The finding for such an entry is NEVER on this head line — it lives on the
 * sibling "- Supporting quote:" / "- Main finding:" sub-lines. So a line headed
 * by an author-year label is dropped, and its em-dashed TITLE never leaks in.
 * Uses Unicode letters so "Morán"/"Báñez"/"Gérard" are recognized.
 */
const AUTHOR_YEAR_HEAD =
  /^\p{Lu}[\p{L}.'’-]*(?:\s+(?:&|and|et\s+al\.?|\p{Lu}[\p{L}.'’-]*))*,?\s*\(?(?:19|20)\d{2}\)?/u;

function startsWithAuthorYearLabel(stripped) {
  return AUTHOR_YEAR_HEAD.test(stripped.trim());
}

/**
 * Turn ONE candidate line into { quote, scored } — or null to drop it.
 *
 *   • `quote`  is what we emit as `sourceQuote`. It is ALWAYS a verbatim slice
 *              of the original line (hence of text.md), so the fidelity gate
 *              and gold substring-matching pass. We only ever *slice* the line,
 *              never rewrite its characters.
 *   • `scored` is the de-noised text we compute signals on.
 *
 * List items in the "Per-paper findings" section are written as
 *   `- **Author Year** — Title: <finding>` or
 *   `- **Supporting quote (verbatim):** "<finding>"`.
 * The real finding is the clause AFTER the citation label / quote-label — the
 * label itself is not a finding. When such a clause exists AND is a verbatim
 * substring of the line, we emit THAT clause; otherwise we fall back to the
 * whole line minus its leading list marker.
 */
function extractCandidate(line) {
  const trimmed = line.trim();
  if (isMetadataOrArtifactLine(trimmed)) return null;

  // (0) A blockquote finding line: `> "…"` (SS3-style). The inner quoted text is
  //     the review's curated supporting quote and is verbatim in text.md.
  if (/^\s*>/.test(line)) {
    const q = /"([^"]+)"/.exec(line);
    if (q && q[1].trim()) {
      const quote = q[1].trim();
      return { quote, scored: scoringText(quote), kind: 'curated' };
    }
    // A blockquote without an explicit quoted span → emit its verbatim body.
    const body = line.replace(/^\s*>+\s?/, '').trim();
    if (body) return { quote: body, scored: scoringText(body), kind: 'curated' };
    return null;
  }

  // Strip a leading list marker ("- ", "* ", "1. ") / heading hashes, keeping a
  // verbatim tail (we only ever SLICE, so the emitted quote stays a substring).
  const listMarker = /^(\s*(?:[-*]|\d+\.|#{1,6})\s+)/.exec(line);
  const afterMarker = listMarker ? line.slice(listMarker[0].length) : line;
  const strippedWhole = scoringText(afterMarker);

  // (1) A "Supporting quote"-style item: the finding is the FIRST double-quoted
  //     span. Its inner text is verbatim in text.md, so emit the inner text.
  //     This is an author-CURATED per-paper finding → kind 'curated'.
  if (/supporting quote/i.test(afterMarker) || /^\s*(?:\*\*|__)?\s*quote\b/i.test(afterMarker)) {
    const q = /"([^"]+)"/.exec(afterMarker);
    if (q && q[1].trim()) {
      const quote = q[1].trim();
      return { quote, scored: scoringText(quote), kind: 'curated' };
    }
    // A "Supporting quote: Not mentioned" item with no quoted span → not a
    // finding; drop it rather than emit the label.
    return null;
  }

  // (2) A per-paper ENTRY head line — "Author, Year — Title" (numbered,
  //     bulleted, or ### sub-heading). The finding is NOT on this line (it's on
  //     the sibling "- Supporting quote:" / "- Main finding:" lines), so drop
  //     it. This is what kept citation labels and their em-dashed TITLES out.
  if (startsWithAuthorYearLabel(strippedWhole)) return null;

  // (3) A "- **Title** (Year) — <finding>" item (SS2-style): the head is a
  //     TITLE + parenthetical year and the finding follows the em-dash. This is
  //     the review's per-paper finding → kind 'curated'.
  const clause = findFindingClause(afterMarker);
  if (clause) {
    return { quote: clause, scored: scoringText(clause), kind: 'curated' };
  }

  // (4) "- **Main finding:** <finding>" item: emit the text after the bold
  //     label, verbatim. Also author-curated. (Effect-direction lines carry no
  //     finding verb and are dropped by the assertion gate upstream.)
  const labeled = /^\s*(?:\*\*|__)?\s*[A-Za-z][A-Za-z \-()]*:\s*(?:\*\*|__)?\s*(\S.*)$/.exec(afterMarker);
  if (labeled && /main finding|finding|effect/i.test(afterMarker)) {
    // Slice the verbatim tail from the ORIGINAL line so it stays a substring.
    const idx = afterMarker.indexOf(labeled[1]);
    if (idx >= 0) {
      const quote = afterMarker.slice(idx).trim();
      return { quote, scored: scoringText(quote), kind: 'curated' };
    }
  }

  // (5) Fallback: the whole line minus the leading marker, emitted verbatim.
  //     Prose sentences land here (no marker, no label) → kind 'prose'.
  const quote = afterMarker.trim();
  if (!quote) return null;
  return { quote, scored: scoringText(quote), kind: 'prose' };
}

/**
 * "- **Title** (Year) — <finding>" (SS2-style): the finding follows the EM-DASH,
 * with a TITLE + parenthetical year as the head. Return the verbatim finding
 * clause after the em-dash, or null if this shape doesn't apply. We split ONLY
 * on the em-dash (never a colon — titles carry "Subtitle:" colons that would
 * mis-split), and require (a) a year in the head and (b) a finding verb in the
 * tail so we don't slice an ordinary prose sentence that happens to contain a
 * dash.
 */
function findFindingClause(body) {
  for (const m of body.matchAll(/[—–]/g)) {
    const idx = m.index;
    const head = scoringText(body.slice(0, idx));
    const tail = body.slice(idx + 1).trim();
    if (!tail) continue;
    if (!/\b(19|20)\d{2}\b/.test(head)) continue; // head must carry a year
    if (!FINDING_VERB.test(scoringText(tail))) continue; // tail must assert
    // Emit the verbatim tail slice (drop only leading emphasis/space chars that
    // are actually present, so the result stays a real substring of the line).
    const rawTail = body.slice(idx + 1);
    const lead = /^[\s*_]+/.exec(rawTail);
    const start = idx + 1 + (lead ? lead[0].length : 0);
    const verbatim = body.slice(start).trim();
    if (verbatim) return verbatim;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Section prior — signal 3. A Results sentence should outrank a Methods
// or References one before a single word is weighed.
// ─────────────────────────────────────────────────────────────────────

const KIND_PRIOR = {
  results: 1.0,
  discussion: 0.85,
  conclusion: 0.85,
  abstract: 0.6,
  introduction: 0.5,
  methods: 0.45,
  limitations: 0.5,
  other: 0.35,
  references: 0.1,
  acknowledgements: 0.05,
};

/** Map a markdown heading to a coarse section kind for the prior. */
function classifyHeading(heading) {
  const h = heading.toLowerCase();
  if (/(^|\W)result/.test(h)) return 'results';
  if (/discussion/.test(h)) return 'discussion';
  if (/conclusion|summary/.test(h)) return 'conclusion';
  if (/abstract/.test(h)) return 'abstract';
  if (/introduction|background/.test(h)) return 'introduction';
  if (/method|material|procedure|participant/.test(h)) return 'methods';
  if (/limitation/.test(h)) return 'limitations';
  if (/reference|bibliograph|citation/.test(h)) return 'references';
  if (/acknowledg/.test(h)) return 'acknowledgements';
  return 'other';
}

// The corpus over which content-term frequency (signal 1) is measured:
// the sections where findings actually live.
const FREQUENCY_CORPUS_KINDS = new Set(['results', 'discussion', 'conclusion', 'abstract']);

// ─────────────────────────────────────────────────────────────────────
// Parsing — markdown → { heading, kind, sentences[] } sections.
// ─────────────────────────────────────────────────────────────────────

/**
 * Split markdown into sections keyed by `#`/`##` headings. The document
 * title (the single top `#`) is treated as a heading too but yields no
 * sentence candidates on its own.
 */
function parseSections(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sections = [];
  let current = { heading: '(preamble)', kind: 'other', body: [] };
  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      if (current.body.length > 0) sections.push(current);
      const heading = m[2].trim();
      current = { heading, kind: classifyHeading(heading), body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.body.length > 0) sections.push(current);
  return sections;
}

/**
 * Sentence segmentation, verbatim-preserving. Splits a paragraph on
 * sentence-final punctuation followed by whitespace, but does NOT break
 * on the period inside abstractions like "p < .001", "d = 1.12", "vs.",
 * "et al.", decimals, or initials. Whitespace is collapsed to single
 * spaces so the returned quote is clean yet still substring-matchable
 * against the paper after the same normalization.
 */
function splitSentences(paragraph) {
  const text = paragraph.replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const out = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    const next = text[i + 1];
    // Must be followed by a space (or end) to be a boundary.
    if (next !== undefined && next !== ' ') continue;
    const prev = text[i - 1];
    // Decimal point: digit . digit — never a boundary ("p < .001").
    if (ch === '.' && /\d/.test(prev ?? '') && /\d/.test(text[i + 2] ?? '')) {
      continue;
    }
    // A leading-dot value ". 001" cannot happen post-normalization, but
    // a period preceded by a space+digit (" .001") also is not a break.
    // Common abbreviations that end in a period mid-sentence.
    const tail = text.slice(Math.max(0, i - 5), i + 1).toLowerCase();
    if (/\b(vs|etc|al|fig|no|eq|cf|e\.g|i\.e)\.$/.test(tail)) continue;
    const sentence = text.slice(start, i + 1).trim();
    if (sentence) out.push(sentence);
    start = i + 1;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Signal 2 — informational density.
// ─────────────────────────────────────────────────────────────────────

/**
 * Effect-size / statistic patterns worth extra weight: a sentence
 * carrying `d = 1.12`, `p < .001`, `r = 0.54`, `95% CI`, `β = …`, or a
 * bare percentage is far more likely to state a finding than one that
 * carries none.
 */
const STAT_PATTERNS = [
  /\b[drtzfβbβη]\s*=\s*-?\.?\d/gi, // d=, r=, t=, z=, F=, β=, b=  effect/test stats
  /\bp\s*[<>=]\s*\.?\d/gi, //             p-values
  /\bci\b/gi, //                          confidence intervals
  /\b\d+(?:\.\d+)?\s*%/g, //              percentages
  /\b(?:od|hr|rr|or)\s*=\s*\d/gi, //      odds/hazard/risk ratios
];

/** Count numeric tokens, excluding bare years (1900–2099). */
function numberCount(sentence) {
  let n = 0;
  for (const raw of sentence.match(/\d+(?:\.\d+)?|\.\d+/g) ?? []) {
    const value = Number(raw);
    if (/^\d{4}$/.test(raw) && value >= 1900 && value <= 2099) continue;
    n += 1;
  }
  return n;
}

/** Count effect-size / statistic pattern hits. */
function statCount(sentence) {
  let n = 0;
  for (const re of STAT_PATTERNS) {
    n += (sentence.match(re) ?? []).length;
  }
  return n;
}

/**
 * Capitalized entities: interior Capitalized words (not the first token
 * of the sentence, so a normal sentence-initial capital does not count).
 * A crude named-entity proxy — instrument names, scales, brain regions.
 *
 * FIX: a RUN of consecutive Capitalized words is almost always a citation or a
 * paper TITLE ("Gut Microbiota in Obesity and Metabolic Abnormalities",
 * "Morán-Ramos et al.") — NOT a set of independent entities. Rewarding each
 * word in the run inflated citation/header lines to the top. So we count each
 * consecutive-capital run as ONE entity (discounted), not one per word. A
 * genuine lone entity ("hippocampus modulated by GABA") still counts.
 */
function capitalizedEntityCount(sentence) {
  const tokens = sentence.split(/\s+/);
  let n = 0;
  let inRun = false;
  for (let i = 1; i < tokens.length; i++) {
    const isCap = /^[A-Z][a-zA-Z]{2,}/.test(tokens[i]);
    if (isCap && !inRun) {
      // start of a (possibly single-word) run — count it once.
      n += 1;
      inRun = true;
    } else if (!isCap) {
      inRun = false;
    }
    // isCap && inRun → continuation of a run → NOT counted again.
  }
  return n;
}

/**
 * Density = (numbers + 2×stat-patterns + 0.5×capitalized-entities) per
 * token, squashed to [0,1). Stat patterns are worth double a bare number
 * because "d = 1.12" is a finding signature, "60" alone is not.
 *
 * Measured on the de-noised `scored` text (markdown/citations removed) so that
 * `**bold**` markers, `[Author, Year]` brackets, and their Capitalized tokens
 * do not count as density — they are formatting, not information.
 */
function densityScore(scored) {
  const tokenCount = Math.max(scored.split(/\s+/).length, 1);
  const raw =
    (numberCount(scored) +
      2 * statCount(scored) +
      0.5 * capitalizedEntityCount(scored)) /
    tokenCount;
  return raw / (raw + 0.15); // squash; 0.15 ≈ "moderately dense"
}

// ─────────────────────────────────────────────────────────────────────
// Signal 1 — content-term frequency across the Results/Discussion corpus.
// ─────────────────────────────────────────────────────────────────────

/**
 * Term frequency over the findings corpus: how often each content term
 * appears across Results/Discussion/Conclusion/Abstract. A candidate
 * whose terms recur across the results narrative is more likely to state
 * a load-bearing finding than one built from one-off words.
 */
function buildCorpusFrequency(sections) {
  const freq = new Map();
  for (const section of sections) {
    if (!FREQUENCY_CORPUS_KINDS.has(section.kind)) continue;
    // De-noise the corpus too, so inline-citation author names (Janssen,
    // Kersten, …) don't dominate the frequency table and pull citation-heavy
    // lines to the top.
    for (const term of contentTerms(scoringText(section.body.join(' ')))) {
      freq.set(term, (freq.get(term) ?? 0) + 1);
    }
  }
  return freq;
}

/**
 * Frequency score for one sentence: mean corpus-frequency of its content
 * terms, normalized by the corpus max so it lands in [0,1). Sentences
 * with no content terms score 0.
 */
function frequencyScore(scored, corpusFreq, corpusMax) {
  if (corpusMax <= 0) return 0;
  const terms = new Set(contentTerms(scored));
  if (terms.size === 0) return 0;
  let sum = 0;
  for (const term of terms) sum += corpusFreq.get(term) ?? 0;
  const mean = sum / terms.size;
  return Math.min(mean / corpusMax, 1);
}

// ─────────────────────────────────────────────────────────────────────
// Combination + ranking.
// ─────────────────────────────────────────────────────────────────────

/** Relative signal weights. For Elicit systematic-REVIEW synthesis, the key
 *  finding is the review-level consensus, which is usually QUALITATIVE — so
 *  frequency (how central a candidate's terms are to the whole review) leads,
 *  density (numbers / effect sizes) is a supporting signal that must not bury a
 *  qualitative consensus under a single study's big number, and the section /
 *  candidate-kind prior breaks ties. Not required to sum to 1. */
const WEIGHTS = { frequency: 0.5, density: 0.2, prior: 0.3 };

/** Prior for an author-CURATED per-paper finding (a "Supporting quote" /
 *  "Main finding" list item, or a "Title (Year) — finding" entry). The review
 *  already selected these as each paper's finding, so they outrank incidental
 *  narrative sentences. Used in place of the section prior for curated items. */
const CURATED_PRIOR = 1.0;

/**
 * Near-duplicate detection: Jaccard over content-term sets. Two Results
 * sentences that differ only in "compared with" vs "compared to" should
 * collapse to one finding, not two.
 */
function jaccard(aTerms, bTerms) {
  if (aTerms.size === 0 && bTerms.size === 0) return 1;
  let inter = 0;
  for (const t of aTerms) if (bTerms.has(t)) inter += 1;
  const union = aTerms.size + bTerms.size - inter;
  return union === 0 ? 0 : inter / union;
}

const DEDUPE_THRESHOLD = 0.8;

/**
 * Core of the spike: score every candidate sentence, drop near-dupes
 * (keeping the higher-scoring member), rank, and return the top N in the
 * common shape. Exported for the test harness; `runArmA` wraps it with
 * file IO.
 *
 * @param {string} markdown  full paper text
 * @param {{ top?: number, minTokens?: number }} [opts]
 * @returns {{ text: string, sourceQuote: string, sourceSection: string, rank: number }[]}
 */
export function extractFindingsFromText(markdown, opts = {}) {
  const top = opts.top ?? 8;
  const minTokens = opts.minTokens ?? 5;

  const sections = parseSections(markdown);
  const corpusFreq = buildCorpusFrequency(sections);
  const corpusMax = Math.max(0, ...corpusFreq.values());

  // Collect candidate sentences with their section context.
  //
  // Two candidate shapes coexist in these fixtures and must be handled
  // differently BEFORE scoring:
  //   • prose paragraphs (Results/Discussion/Synthesis narrative) — blank-line
  //     separated; sentence-split as before.
  //   • per-paper LIST items ("- **Author Year** — Title: <finding>",
  //     "- **Supporting quote:** \"<finding>\"") — one candidate per line; the
  //     finding CLAUSE is extracted, and formatting artifacts are dropped.
  // `extractCandidate` unifies both: it returns { quote, scored } (a verbatim
  // slice + its de-noised scoring text) or null to drop the line. We score on
  // `scored` but emit `quote`.
  const candidates = [];
  const seenQuotes = new Set();

  /** Turn one verbatim candidate unit into a scored candidate (or skip it). */
  const consider = (unit, section) => {
    if (!unit) return;
    const { quote, scored, kind } = unit;
    // Guard length on the SCORED (content) text, not the raw quote, so a short
    // finding padded by a long citation label still passes/fails on content.
    if (scored.split(/\s+/).filter(Boolean).length < minTokens) return;
    // Eligibility gate: a finding ASSERTS something. Titles, citation labels,
    // section captions, and table headers carry no finding verb / statistic, so
    // they are dropped here even if they survived the artifact filters.
    if (!assertsFinding(scored)) return;
    if (seenQuotes.has(quote)) return; // exact-dup line (repeated list items)
    seenQuotes.add(quote);
    const terms = new Set(contentTerms(scored));
    if (terms.size === 0) return;
    const frequency = frequencyScore(scored, corpusFreq, corpusMax);
    const density = densityScore(scored);
    // An author-curated per-paper finding gets the curated prior; a narrative
    // sentence gets its section prior. This lets the review's own extracted
    // findings outrank incidental prose without discarding the prose (which is
    // the only source of findings for papers that have no per-paper list).
    const prior = kind === 'curated' ? CURATED_PRIOR : (KIND_PRIOR[section.kind] ?? 0.35);
    const score =
      frequency * WEIGHTS.frequency + density * WEIGHTS.density + prior * WEIGHTS.prior;
    candidates.push({
      text: quote,
      sourceSection: section.heading,
      terms,
      score: Math.round(score * 1e6) / 1e6,
    });
  };

  for (const section of sections) {
    // References/acknowledgements never yield findings.
    if (section.kind === 'references' || section.kind === 'acknowledgements') {
      continue;
    }
    // Walk the section body, grouping consecutive prose lines into paragraphs
    // but treating each list-item / label line as its own candidate unit.
    let proseBuffer = [];
    const flushProse = () => {
      if (proseBuffer.length === 0) return;
      const paragraph = proseBuffer.join(' ').replace(/\s+/g, ' ').trim();
      proseBuffer = [];
      if (!paragraph) return;
      for (const sentence of splitSentences(paragraph)) {
        consider(extractCandidate(sentence), section);
      }
    };
    for (const rawLine of section.body) {
      const line = rawLine;
      if (line.trim() === '') {
        flushProse();
        continue;
      }
      const isListy = /^\s*(?:[-*]|\d+\.)\s+/.test(line) || /^\s*#{1,6}\s+/.test(line);
      const isTableRow = /^\s*\|/.test(line);
      const isBlockquote = /^\s*>/.test(line);
      // A line that is ENTIRELY italic ("*C. Hoxby (2000) — Quarterly Journal*")
      // is a citation/metadata line — keep it out of the prose buffer so it does
      // not merge into an adjacent finding sentence; it is then dropped by the
      // label/assertion filters.
      const isItalicMetaLine = /^\s*\*[^*].*\*\s*$/.test(line) && !/^\s*\*\s/.test(line);
      if (isListy || isTableRow || isBlockquote || isItalicMetaLine) {
        // Line-level candidate (may be dropped as an artifact/label inside).
        flushProse();
        consider(extractCandidate(line), section);
      } else {
        proseBuffer.push(line);
      }
    }
    flushProse();
  }

  // Rank by score descending; stable, so equal scores keep document order.
  const ranked = [...candidates].sort((a, b) => b.score - a.score);

  // Greedy near-duplicate suppression: walk best-first, drop any
  // candidate too similar to one already kept.
  const kept = [];
  for (const cand of ranked) {
    const dup = kept.some((k) => jaccard(cand.terms, k.terms) >= DEDUPE_THRESHOLD);
    if (!dup) kept.push(cand);
    if (kept.length >= top) break;
  }

  // Emit the common shape. sourceQuote IS the scored sentence, so
  // fidelity is automatic for Arm A.
  return kept.map((k, i) => ({
    text: k.text,
    sourceQuote: k.text,
    sourceSection: k.sourceSection,
    rank: i + 1,
  }));
}

/**
 * Read a paper's `text.md` and emit ranked findings. Missing files are
 * handled gracefully (returns []) so the harness can point at an
 * EXAMPLE path that may not exist yet without crashing.
 *
 * @param {string} textPath  absolute or relative path to a paper's text.md
 * @param {{ top?: number, minTokens?: number }} [opts]
 * @returns {Promise<{ text, sourceQuote, sourceSection, rank }[]>}
 */
export async function runArmA(textPath, opts = {}) {
  let markdown;
  try {
    markdown = await fs.readFile(textPath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      process.stderr.write(`[runArmA] no paper at ${textPath} — skipping\n`);
      return [];
    }
    throw new Error(`[runArmA] failed to read ${textPath}: ${error.message}`);
  }
  return extractFindingsFromText(markdown, opts);
}

// ─────────────────────────────────────────────────────────────────────
// CLI: `node runArmA.mjs [paperDir]` — defaults to papers/EXAMPLE.
// Prints findings.json to stdout so the harness can capture it.
// ─────────────────────────────────────────────────────────────────────

const isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMain) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const arg = process.argv[2] ?? path.join(here, 'papers', 'EXAMPLE');
  // Accept either a paper directory or a direct text.md path.
  const textPath = arg.endsWith('.md') ? arg : path.join(arg, 'text.md');
  const findings = await runArmA(textPath, { top: 8 });
  process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
}
