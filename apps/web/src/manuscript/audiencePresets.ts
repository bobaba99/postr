/**
 * Q3 "Other" — deterministic audience matching. NO LLM, no fuzzy-match
 * dependency, no new package.
 *
 * The user types who reads their poster; we search PREPARED PRESETS
 * first and only fall through to a custom string when nothing
 * reasonable matches. Classifying free text is exactly the kind of job
 * a model gets asked to do by reflex — and exactly the kind a keyword
 * table does more cheaply, more predictably, and offline.
 *
 * Matching is word-boundary based on a normalised string. Substring
 * matching alone is a trap here: "public" is inside "publication",
 * "children" is inside "children's hospital" (which we DO want, but
 * via its own keyword). Anchoring on token boundaries keeps
 * "publication deadline" from resolving to the general public.
 */
import type { AudienceOption } from '@postr/shared';

/** A preset the free-text search can resolve to. */
export interface AudiencePreset {
  id: Exclude<AudienceOption, 'custom'>;
  /** Shown back to the user once matched. */
  label: string;
  /** Lowercase keywords/synonyms. Multi-word entries match as phrases. */
  keywords: readonly string[];
}

/**
 * Specificity, not declaration order, decides a match: the longest
 * matching keyword across ALL presets wins, so "medical students"
 * reaches undergraduates and "phd students" reaches general researchers
 * regardless of where their presets sit in this list. Declaration order
 * only breaks ties between equally long keywords, which is why the more
 * specific audiences still come first.
 */
export const AUDIENCE_PRESETS: readonly AudiencePreset[] = [
  {
    id: 'children',
    label: 'Children',
    keywords: [
      'children',
      'child',
      'kids',
      'kid',
      'primary school',
      'elementary school',
      'schoolchildren',
      'pupils',
      'young children',
    ],
  },
  {
    id: 'adolescents',
    label: 'Adolescents',
    keywords: [
      'adolescents',
      'adolescent',
      'teenagers',
      'teenager',
      'teens',
      'teen',
      'youth',
      'high school',
      'high schoolers',
      'secondary school',
      'young people',
    ],
  },
  {
    id: 'undergraduates',
    label: 'Undergraduates',
    keywords: [
      'undergraduates',
      'undergraduate',
      'undergrads',
      'undergrad',
      'students',
      'student',
      'medical students',
      'university students',
      'college students',
      'trainees',
      'first years',
    ],
  },
  {
    id: 'clinicians',
    label: 'Clinicians',
    keywords: [
      'clinicians',
      'clinician',
      'doctors',
      'doctor',
      'physicians',
      'physician',
      'nurses',
      'nurse',
      'gps',
      'general practitioners',
      'psychiatrists',
      'psychologists',
      'therapists',
      'practitioners',
      'clinical staff',
      'healthcare professionals',
      'health professionals',
      'medical professionals',
    ],
  },
  {
    id: 'policymakers',
    label: 'Policymakers',
    keywords: [
      'policymakers',
      'policymaker',
      'policy makers',
      'policy',
      'government',
      'ministers',
      'civil servants',
      'regulators',
      'regulator',
      'commissioners',
      'legislators',
      'public health officials',
      'funders',
      'funding bodies',
    ],
  },
  {
    id: 'industry',
    label: 'Industry',
    keywords: [
      'industry',
      'commercial',
      'companies',
      'company',
      'startups',
      'startup',
      'investors',
      'investor',
      'business',
      'pharma',
      'pharmaceutical',
      'biotech',
      'engineers',
      'product teams',
      'vendors',
    ],
  },
  {
    id: 'public',
    label: 'General public',
    keywords: [
      'public',
      'general public',
      'lay audience',
      'laypeople',
      'lay people',
      'layperson',
      'non specialists',
      'nonspecialists',
      'community',
      'patients',
      'patient',
      'families',
      'carers',
      'caregivers',
      'open day',
      'outreach',
      'science fair',
      'everyone',
      'anyone',
    ],
  },
  {
    id: 'specialists',
    label: 'Specialists in my subfield',
    keywords: [
      'specialists',
      'specialist',
      'experts',
      'expert',
      'my subfield',
      'subfield',
      'my field',
      'peers',
      'my lab',
      'domain experts',
      'the same field',
    ],
  },
  {
    id: 'general',
    label: 'General researchers in my field',
    keywords: [
      'researchers',
      'researcher',
      'academics',
      'academic',
      'scientists',
      'scientist',
      'faculty',
      'postdocs',
      'postdoc',
      'phd students',
      'graduate students',
      'doctoral students',
      'grad students',
      'masters students',
      'conference',
      'department',
      'departmental',
      'mixed',
      'general audience',
      'other labs',
      'colleagues',
    ],
  },
] as const;

/**
 * Normalise for matching: lowercase, strip punctuation to spaces,
 * collapse whitespace, and pad with spaces so `includes(' word ')` is a
 * true word-boundary test without a regex per keyword.
 */
export function normaliseAudienceText(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')} `;
}

/**
 * Does the normalised haystack contain this keyword as whole word(s)?
 * The haystack is space-padded, so a padded keyword can only match at
 * token boundaries — "publication" never satisfies "public".
 */
function hasKeyword(paddedText: string, keyword: string): boolean {
  return paddedText.includes(` ${keyword} `);
}

export interface AudienceMatch {
  /** The resolved option — 'custom' when no preset matched. */
  option: AudienceOption;
  /** The preset's label, or the user's own trimmed text for 'custom'. */
  label: string;
  /** The user's text, kept verbatim only when nothing matched. */
  custom: string;
}

/**
 * Resolve free text to a preset, or fall through to a custom audience.
 *
 * Deliberately conservative: a single confident keyword hit wins, and
 * anything else becomes `custom` and gets passed through to the prompt
 * verbatim. Guessing wrong here is worse than not guessing — the
 * audience controls how much jargon survives, and silently deciding a
 * poster for policymakers is "for specialists" produces a poster the
 * author cannot use.
 */
export function matchAudience(text: string): AudienceMatch {
  const trimmed = text.trim();
  const padded = normaliseAudienceText(trimmed);

  if (padded.trim().length > 0) {
    // Collect every hit across every preset, then let the GLOBALLY
    // longest keyword win. Sorting within a preset was not enough:
    // "phd students" (general) has to beat "students" (undergraduates)
    // even though undergraduates is declared first.
    const hits = AUDIENCE_PRESETS.flatMap((preset, presetIndex) =>
      preset.keywords
        .filter((keyword) => hasKeyword(padded, keyword))
        .map((keyword) => ({ preset, presetIndex, keyword })),
    );

    // Longest keyword first; declaration order breaks exact-length ties.
    const best = [...hits].sort(
      (a, b) =>
        b.keyword.length - a.keyword.length || a.presetIndex - b.presetIndex,
    )[0];

    if (best) {
      return { option: best.preset.id, label: best.preset.label, custom: '' };
    }
  }

  return { option: 'custom', label: trimmed, custom: trimmed };
}
