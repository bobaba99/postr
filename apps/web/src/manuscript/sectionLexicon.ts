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
  if (/^#+\s+/.test(trimmed)) return true;
  if (classifyHeading(trimmed) !== 'other') return true;
  // Numbered heading with an unknown label ("3. Stimuli").
  if (/^\d+(\.\d+)*[.)]\s+\S/.test(trimmed)) return true;
  // SHORT ALL-CAPS LINE (≥4 letters so "DNA" alone doesn't trigger).
  const letters = trimmed.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 4 && letters === letters.toUpperCase() && words.length <= 6) {
    return true;
  }
  return false;
}
