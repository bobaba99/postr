/**
 * ════════════════════════════════════════════════════════════════════
 *  NARRATIVE PROMPT — OWNER-AUDITED MODULE
 * ════════════════════════════════════════════════════════════════════
 *
 * This is the ONLY module allowed to contain condenser prompt text.
 * Do not assemble prompt fragments at call sites, do not scatter
 * instructions through the router, do not add a second prompt file.
 * Gavin audits this file personally — keep every instruction here,
 * commented, with the rubric's word budgets injected as DATA (the
 * `{{...}}` values below come from the request, which the
 * deterministic mapper produced).
 *
 * Scope of the LLM's job, per the plan (§3 "Where the LLM is and is
 * not"): condensing each mapped role to its word budget under the
 * user's stated emphasis. Nothing else. Structure, ranking, and all
 * cut decisions already happened deterministically.
 */
import type {
  CondenseEmphasis,
  CondensePinnedInput,
  CondenseRoleInput,
} from '@postr/shared';

/**
 * System prompt. Static — everything document-specific arrives in the
 * user message so the system half stays cacheable and auditable.
 */
export const CONDENSER_SYSTEM_PROMPT = `You condense manuscript excerpts into poster panel text for an academic research poster.

You will receive:
- A list of PANELS. Each panel has a role name, a HARD word budget, and source text taken verbatim from the author's manuscript.
- The author's stated EMPHASIS: their own one-sentence takeaway, their preferred finding order, the audience, and what the poster is for.

Rules, in priority order:
1. NEVER exceed a panel's word budget. Shorter is fine; over is a failure. Do not compensate by inventing abbreviations that lose meaning.
2. NEVER invent facts, numbers, statistics, or claims. Every number in your output must appear in that panel's source text. Keep p-values, percentages, effect sizes, and sample sizes VERBATIM — do not round or restate them.
3. The author's takeaway sentence is their thesis. The takeaway panel must express that idea (polished for a poster if needed), and the other panels must not contradict or bury it.
4. Respect the given finding order in the key-results panel: first listed = most important = first and fullest treatment.
5. Write for the stated audience: specialists tolerate field jargon; adjacent researchers need method shorthand expanded once; a mixed/general audience and clinicians need plain terms and outcomes over mechanisms.
6. Poster prose style: short declarative sentences, active voice, no filler ("In this study, we..." becomes the finding itself). No citations inside panel text. No headings — the poster supplies them.
7. Output text only for the panels you were given, one entry per panel. Do not add panels, notes, or commentary.`;

/** Human-readable audience phrasing injected into the user message. */
const AUDIENCE_DESCRIPTIONS: Record<CondenseEmphasis['audience'], string> = {
  specialists: 'specialists in the author\'s own subfield',
  adjacent: 'researchers in adjacent fields',
  general: 'a mixed, general conference audience',
  clinicians: 'practicing clinicians',
};

/** What the poster is for — nudges hook framing only. */
const PURPOSE_DESCRIPTIONS: Record<CondenseEmphasis['purpose'], string> = {
  feedback: 'getting feedback on work in progress',
  collaborators: 'recruiting collaborators',
  'job-market': 'the academic job market',
  requirement: 'a course or programme requirement',
};

/**
 * Build the user message. All budgets are injected as data — the
 * numbers come from the rubric via the request, never hard-coded here.
 */
export function buildCondenserUserMessage(
  roles: CondenseRoleInput[],
  pinned: CondensePinnedInput[],
  emphasis: CondenseEmphasis,
): string {
  const parts: string[] = [];

  parts.push('AUTHOR EMPHASIS');
  parts.push(
    emphasis.takeaway
      ? `- The one thing a reader should remember: "${emphasis.takeaway}"`
      : '- The author did not state a takeaway; derive it faithfully from the source.',
  );
  if (emphasis.rankedFindings.length > 0) {
    parts.push('- Findings in the author\'s preferred order:');
    for (const [i, finding] of emphasis.rankedFindings.entries()) {
      parts.push(`  ${i + 1}. ${finding}`);
    }
  }
  parts.push(`- Audience: ${AUDIENCE_DESCRIPTIONS[emphasis.audience]}.`);
  parts.push(`- The poster is for: ${PURPOSE_DESCRIPTIONS[emphasis.purpose]}.`);
  parts.push('');
  parts.push('PANELS');

  for (const role of roles) {
    parts.push('');
    parts.push(`[panel role=${role.role} budget=${role.budgetWords} words]`);
    parts.push(role.sourceText);
  }
  for (const pin of pinned) {
    parts.push('');
    parts.push(
      `[panel pinned=${pin.id} heading="${pin.heading}" budget=${pin.budgetWords} words]`,
    );
    parts.push(pin.sourceText);
  }

  return parts.join('\n');
}

/**
 * Forced tool-use output schema. One entry per requested panel; the
 * router validates the reply against the request and enforces budgets
 * deterministically afterwards — the schema is the contract, not the
 * enforcement.
 */
export const CONDENSE_TOOL_SCHEMA = {
  type: 'object',
  required: ['roles', 'pinned'],
  additionalProperties: false,
  properties: {
    roles: {
      type: 'array',
      items: {
        type: 'object',
        required: ['role', 'text'],
        additionalProperties: false,
        properties: {
          role: {
            type: 'string',
            enum: ['hook', 'question', 'methods', 'keyResult', 'takeaway'],
          },
          text: {
            type: 'string',
            description:
              'The condensed panel text, within the panel word budget.',
          },
        },
      },
    },
    pinned: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'text'],
        additionalProperties: false,
        properties: {
          id: {
            type: 'string',
            description: 'The pinned panel id exactly as given.',
          },
          text: {
            type: 'string',
            description:
              'The condensed pinned-section text, within its word budget.',
          },
        },
      },
    },
  },
} as const;
