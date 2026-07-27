/**
 * Narrative mapper — DETERMINISTIC. Rubric §2, no LLM.
 *
 * Maps DocumentModel sections onto the five-role poster spine, ranks
 * findings, and applies every cut decision. The LLM never decides
 * structure: letting the model decide structure is how you get a
 * poster with a 300-word literature review, because that is what the
 * source emphasised.
 *
 * Deleted wholesale by default: literature review, limitations
 * (unless pinned), discussion beyond ¶1, acknowledgements, appendices,
 * unrecognized sections. References are trimmed later by the poster
 * builder (≤ POSTER_MAX_REFERENCES).
 */
import { nanoid } from 'nanoid';
import type {
  DocumentModel,
  Finding,
  ManuscriptSection,
  MappedPinnedSection,
  MappedRole,
} from '@postr/shared';
import {
  MAX_PINNED_SECTIONS,
  MAX_ROLE_SOURCE_CHARS,
  PINNED_SECTION_BUDGET_WORDS,
  POSTER_MAX_FINDINGS,
  POSTER_ROLE_SPECS,
} from './rubric';

export interface NarrativeMap {
  /** Present roles in poster reading order. */
  roles: MappedRole[];
  /** Ranked candidate findings (top POSTER_MAX_FINDINGS). */
  findings: Finding[];
  /** Sections deleted wholesale — offered as Q5 pin options. */
  cutSections: ManuscriptSection[];
  /** Pinned sections rescued from the cut, each with its own budget. */
  pinned: MappedPinnedSection[];
  /** Structural problems worth telling the user about. */
  warnings: string[];
}

const QUESTION_PATTERN =
  /\b(we (asked|tested|hypothesi\w+|investigat\w+|examin\w+|predict\w+|sought)|aim(s|ed)?\s+(of|to|was|were)|objectives?\s+(of|was|were)|research question|whether|to (test|determine|investigate|examine|assess))\b/i;

const METHODS_NOISE_PATTERN =
  /\b(version\s+\d|v\d+\.\d|ethics (approval|committee|board)|IRB|institutional review board|RRID|protocol (number|#)|catalog(ue)? (number|#))\b/i;

const FINDING_EFFECT_PATTERN =
  /\b(significant(ly)?|increased?|decreased?|reduced?|improved?|higher|lower|greater|smaller|faster|slower|associated|predict(ed|s)?|correlated?|difference|effect|declined?|rose|fell)\b/i;

const CUT_BY_DEFAULT: ReadonlySet<string> = new Set([
  'literature-review',
  'limitations',
  'acknowledgements',
  'appendix',
  'other',
]);

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

/** Rank findings by effect prominence; keep the top 3. Every kept
 *  finding must carry a figure or a number (rubric cut rule). */
export function extractFindings(doc: DocumentModel): Finding[] {
  const resultSections = sectionsOfKind(doc, 'results');
  const candidates: Finding[] = [];
  for (const section of resultSections) {
    for (const paragraph of section.paragraphs) {
      for (const sentence of splitSentences(paragraph)) {
        const score = scoreFindingSentence(sentence);
        if (score < 2) continue;
        candidates.push({
          id: nanoid(8),
          text: sentence,
          score,
          sectionId: section.id,
          hasNumber: /\d/.test(sentence),
        });
      }
    }
  }
  // Stable ranking: score desc, then source order (candidates were
  // collected in document order, and Array.prototype.sort is stable).
  return [...candidates]
    .sort((a, b) => b.score - a.score)
    .slice(0, POSTER_MAX_FINDINGS);
}

// ─────────────────────────────────────────────────────────────────────
// Role mapping
// ─────────────────────────────────────────────────────────────────────

function mapHook(doc: DocumentModel, warnings: string[]): MappedRole | null {
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

function mapQuestion(doc: DocumentModel, warnings: string[]): MappedRole {
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

function mapMethods(doc: DocumentModel): MappedRole | null {
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
): MappedRole {
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

function mapTakeaway(doc: DocumentModel, warnings: string[]): MappedRole {
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
// Entry point
// ─────────────────────────────────────────────────────────────────────

export function mapNarrative(
  doc: DocumentModel,
  pinnedSectionIds: string[] = [],
): NarrativeMap {
  const warnings: string[] = [];
  const findings = extractFindings(doc);

  const pinnedIds = new Set(pinnedSectionIds.slice(0, MAX_PINNED_SECTIONS));
  const cutSections = doc.sections.filter(
    (s) => CUT_BY_DEFAULT.has(s.kind) && !pinnedIds.has(s.id),
  );
  const pinned: MappedPinnedSection[] = doc.sections
    .filter((s) => pinnedIds.has(s.id))
    .map((s) => ({
      id: s.id,
      heading: s.heading || 'Additional Notes',
      budgetWords: PINNED_SECTION_BUDGET_WORDS,
      sourceText: capSourceText(sectionText(s)),
    }));

  const roles = [
    mapHook(doc, warnings),
    mapQuestion(doc, warnings),
    mapMethods(doc),
    mapKeyResult(doc, findings, warnings),
    mapTakeaway(doc, warnings),
  ].filter((r): r is MappedRole => r !== null);

  return { roles, findings, cutSections, pinned, warnings };
}
