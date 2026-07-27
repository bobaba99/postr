/**
 * Heading lexicon — deterministic classification of manuscript section
 * headings into canonical `SectionKind`s.
 *
 * Order matters: more specific kinds are listed before the broad ones
 * they could be mistaken for ("Background and literature review" must
 * classify as literature-review before "background" matches
 * introduction; "Results and Discussion" classifies as results so the
 * findings extractor still sees it).
 */
import type { SectionKind } from '@postr/shared';

const KIND_PATTERNS: ReadonlyArray<readonly [SectionKind, RegExp]> = [
  ['literature-review', /\b(literature\s+review|related\s+work|prior\s+work)\b/i],
  ['limitations', /\blimitations?\b/i],
  ['references', /\b(references?|bibliography|works\s+cited|cited\s+literature)\b/i],
  ['acknowledgements', /\b(acknowledg\w*|funding|conflicts?\s+of\s+interest|disclosures?)\b/i],
  ['appendix', /\b(appendix|appendices|supplementar\w*|supporting\s+information)\b/i],
  ['abstract', /\babstract\b/i],
  ['methods', /\b(methods?|materials?|participants|procedures?|study\s+design|experimental\s+(setup|design)|analysis\s+plan|measures)\b/i],
  ['results', /\b(results?|findings)\b/i],
  ['discussion', /\bdiscussion\b/i],
  ['conclusion', /\bconclusions?\b/i],
  ['introduction', /\b(introduction|background|motivation)\b/i],
];

/** Strip leading list numbering ("2.", "3.1)", "IV.") and markdown
 *  hashes so classification sees only the words. */
export function stripHeadingMarkers(heading: string): string {
  return heading
    .replace(/^#+\s*/, '')
    .replace(/^[IVXLC]+[.)]\s+/i, '')
    .replace(/^\d+(\.\d+)*[.)]?\s+/, '')
    .trim();
}

/** Classify a heading string into a canonical section kind. */
export function classifyHeading(heading: string): SectionKind {
  const cleaned = stripHeadingMarkers(heading);
  for (const [kind, pattern] of KIND_PATTERNS) {
    if (pattern.test(cleaned)) return kind;
  }
  return 'other';
}

/** Function words a real heading may carry around its section term
 *  ("Materials and Methods", "Results and Discussion", "The Present
 *  Study"). Anything outside this set is prose vocabulary. */
const HEADING_FILLER =
  /^(and|or|of|the|a|an|in|on|for|to|with|study|studies|section|part|chapter|our|present|information|statement|data|note|notes)$/i;

/**
 * True when a lexicon match describes the WHOLE line rather than
 * appearing incidentally inside a sentence.
 *
 * `classifyHeading` matches its patterns anywhere in the string, which
 * is right for a known heading but wrong as a heading *detector*: a
 * hard-wrapped prose line like "The results showed a clear dose-
 * response" contains "results" and would otherwise be promoted to a
 * section heading, fabricating sections and misrouting the real
 * Methods/Results text away from the mapper.
 *
 * A genuine heading is (near-)entirely its section term plus filler:
 * "Materials and Methods" yes, "and the background literature is
 * extensive" no.
 */
function lexiconDominatesLine(trimmed: string): boolean {
  const kind = classifyHeading(trimmed);
  if (kind === 'other') return false;
  const cleaned = stripHeadingMarkers(trimmed).replace(/[:.]$/, '');
  const words = cleaned.split(/\s+/).filter(Boolean);
  // Headings are terse. Beyond five words this is a sentence fragment.
  if (words.length === 0 || words.length > 5) return false;
  // Strip everything the lexicon itself claims, plus filler. A genuine
  // heading has nothing left over ("Materials and Methods" → ""); prose
  // does ("The results showed a clear dose-response" → "showed clear
  // dose-response"). Matching against the whole pattern set, not per
  // word, keeps multi-word terms like "Literature Review" intact.
  const residue = KIND_PATTERNS.reduce(
    (text, [, pattern]) => text.replace(new RegExp(pattern.source, 'gi'), ' '),
    cleaned,
  );
  return residue
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => HEADING_FILLER.test(word));
}

/** True when a standalone text line reads like a section heading.
 *  Used by the pasted-text parser, which has no style information. */
export function looksLikeHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Headings are short — a 13+ word line is body text.
  const words = trimmed.split(/\s+/);
  if (words.length > 12) return false;
  // A sentence-terminal period means body text ("We did X.") — but
  // trailing colons and numbering dots are fine ("Methods:", "2.").
  if (/[.!?]$/.test(trimmed) && !/^\d+(\.\d+)*\.$/.test(trimmed)) {
    return false;
  }
  // An explicit markdown hash is an unambiguous author signal.
  if (/^#+\s+/.test(trimmed)) return true;
  // A lowercase opening word is prose continuing across a hard wrap —
  // real headings are capitalised. Checked before the lexicon so
  // "discussion of these findings follows" cannot slip through.
  const firstLetter = trimmed.match(/[A-Za-z]/)?.[0];
  if (firstLetter && firstLetter === firstLetter.toLowerCase()) return false;
  if (lexiconDominatesLine(trimmed)) return true;
  // Numbered heading with an unknown label ("3. Stimuli").
  if (/^\d+(\.\d+)*[.)]\s+\S/.test(trimmed)) return true;
  // SHORT ALL-CAPS LINE (≥4 letters so "DNA" alone doesn't trigger).
  const letters = trimmed.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 4 && letters === letters.toUpperCase() && words.length <= 6) {
    return true;
  }
  return false;
}
