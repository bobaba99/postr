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
 * For Arm A, a finding's `sourceQuote` IS the verbatim sentence that
 * scored it, so `text === sourceQuote` and the fidelity gate (does the
 * quote appear verbatim in the paper?) passes for free.
 *
 * Three signals, combined into one score (per the experiment doc §Arm A):
 *   1. semantic/word-content frequency — how often a candidate's content
 *      terms recur across the Results/Discussion corpus (TF-style,
 *      stopword-filtered);
 *   2. informational density — numbers + effect-size patterns
 *      (d=, p<, %, CI, r=, β=) + capitalized entities, per token;
 *   3. position/section prior — a Results sentence outranks
 *      Discussion/Conclusion, which outrank Methods/Introduction, etc.
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
 */
function capitalizedEntityCount(sentence) {
  const tokens = sentence.split(/\s+/);
  let n = 0;
  for (let i = 1; i < tokens.length; i++) {
    if (/^[A-Z][a-zA-Z]{2,}/.test(tokens[i])) n += 1;
  }
  return n;
}

/**
 * Density = (numbers + 2×stat-patterns + 0.5×capitalized-entities) per
 * token, squashed to [0,1). Stat patterns are worth double a bare number
 * because "d = 1.12" is a finding signature, "60" alone is not.
 */
function densityScore(sentence) {
  const tokenCount = Math.max(sentence.split(/\s+/).length, 1);
  const raw =
    (numberCount(sentence) +
      2 * statCount(sentence) +
      0.5 * capitalizedEntityCount(sentence)) /
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
    for (const term of contentTerms(section.body.join(' '))) {
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
function frequencyScore(sentence, corpusFreq, corpusMax) {
  if (corpusMax <= 0) return 0;
  const terms = new Set(contentTerms(sentence));
  if (terms.size === 0) return 0;
  let sum = 0;
  for (const term of terms) sum += corpusFreq.get(term) ?? 0;
  const mean = sum / terms.size;
  return Math.min(mean / corpusMax, 1);
}

// ─────────────────────────────────────────────────────────────────────
// Combination + ranking.
// ─────────────────────────────────────────────────────────────────────

/** Relative signal weights. Density leads — a spike ranking findings
 *  cares most about which sentences actually carry a stated result;
 *  frequency and the section prior break ties. Not required to sum to 1. */
const WEIGHTS = { frequency: 0.35, density: 0.45, prior: 0.2 };

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
  const candidates = [];
  for (const section of sections) {
    // References/acknowledgements never yield findings.
    if (section.kind === 'references' || section.kind === 'acknowledgements') {
      continue;
    }
    const paragraphs = section.body
      .join('\n')
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const paragraph of paragraphs) {
      for (const sentence of splitSentences(paragraph)) {
        if (sentence.split(/\s+/).length < minTokens) continue;
        const terms = new Set(contentTerms(sentence));
        const frequency = frequencyScore(sentence, corpusFreq, corpusMax);
        const density = densityScore(sentence);
        const prior = KIND_PRIOR[section.kind] ?? 0.35;
        const score =
          frequency * WEIGHTS.frequency +
          density * WEIGHTS.density +
          prior * WEIGHTS.prior;
        candidates.push({
          text: sentence,
          sourceSection: section.heading,
          terms,
          score: Math.round(score * 1e6) / 1e6,
        });
      }
    }
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
