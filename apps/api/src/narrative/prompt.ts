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

You will receive, in this order:
1. A list of PANELS. Each panel has a role name, a HARD word budget, and source text taken verbatim from the author's manuscript.
2. The author's stated EMPHASIS: their own one-sentence takeaway, their preferred finding order, the audience, and what the poster is for. The emphasis arrives AFTER the panels and applies to all of them — read it before writing anything.

Rules, in priority order:
1. NEVER exceed a panel's word budget. Shorter is fine; over is a failure. Do not compensate by inventing abbreviations that lose meaning.
2. NEVER invent facts, numbers, statistics, or claims. Every number in your output must appear in that panel's source text. Keep p-values, percentages, effect sizes, and sample sizes VERBATIM — do not round or restate them.
3. The author's takeaway sentence is their thesis. The takeaway panel must express that idea (polished for a poster if needed), and the other panels must not contradict or bury it.
4. Respect the given finding order in the key-results panel: first listed = most important = first and fullest treatment.
5. Write for the stated audience. Specialists tolerate field jargon. General researchers in the same field need method shorthand expanded once. Clinicians, policymakers and industry readers want outcomes and implications over mechanisms. The public, undergraduates, adolescents and children need plain terms, no unexplained acronyms, and shorter sentences the younger the reader.
6. Poster prose style: short declarative sentences, active voice, no filler ("In this study, we..." becomes the finding itself). No citations inside panel text. No headings — the poster supplies them.
7. Output text only for the panels you were given, one entry per panel. Do not add panels, notes, or commentary.`;

/**
 * Human-readable audience phrasing injected into the user message.
 *
 * EXHAUSTIVE BY CONSTRUCTION. `Record<CondenseEmphasis['audience'], …>`
 * means adding an AudienceOption in packages/shared without adding a
 * line here is a TYPE ERROR, not a silent "undefined" in the prompt.
 * Keep it that way — do not loosen this to Partial or index-signature.
 */
const AUDIENCE_DESCRIPTIONS: Record<CondenseEmphasis['audience'], string> = {
  specialists: 'specialists in the author\'s own subfield',
  general: 'general researchers in the author\'s field, such as a conference or department audience',
  clinicians: 'practicing clinicians',
  public: 'the general public, with no research training',
  adolescents: 'adolescents — teenage readers',
  children: 'children — young readers',
  undergraduates: 'undergraduate students',
  policymakers: 'policymakers and funders, who need implications over mechanisms',
  industry: 'an industry audience, who need applications and outcomes',
  // 'custom' is replaced verbatim by the user's own words below, so
  // this string only shows if `audienceCustom` was somehow empty.
  custom: 'a specific audience the author described',
};

/**
 * What the poster is for — nudges hook framing only. Also exhaustive by
 * construction; see the note above.
 *
 * The feedback / one-time split is deliberate and load-bearing: a
 * poster seeking feedback should surface open questions, and a
 * one-time presentation should close them.
 */
const PURPOSE_DESCRIPTIONS: Record<CondenseEmphasis['purpose'], string> = {
  requirement: 'a course or programme requirement',
  'one-time': 'a single presentation with no follow-up — state conclusions plainly rather than inviting critique',
  committee: 'a thesis or progress committee meeting — show the work is on track and defensible',
  'lab-meeting': 'an internal lab presentation among colleagues who know the project',
  feedback: 'getting feedback on work in progress — make the open questions visible',
  collaborators: 'recruiting collaborators',
  'job-market': 'the academic job market',
};

/** The audience line, with the custom escape hatch resolved. */
function audienceLine(emphasis: CondenseEmphasis): string {
  if (emphasis.audience === 'custom' && emphasis.audienceCustom?.trim()) {
    return emphasis.audienceCustom.trim();
  }
  return AUDIENCE_DESCRIPTIONS[emphasis.audience];
}

/**
 * Build the user message. All budgets are injected as data — the
 * numbers come from the rubric via the request, never hard-coded here.
 *
 * ORDER IS LOAD-BEARING, FOR CACHING — do not reorder these sections.
 *
 * Prompt caching keys on the longest matching PREFIX of a request. The
 * whole point of the manuscript pipeline is that a user re-runs it on
 * the SAME manuscript while adjusting their emphasis, so the ideal
 * split is:
 *
 *   stable, large  → PANELS   (~2500 tok of manuscript, identical
 *                              across every iteration)  ......... FIRST
 *   volatile, small→ EMPHASIS (~120 tok, changes every iteration) . LAST
 *
 * This module previously emitted EMPHASIS first. Because the volatile
 * block sat at the head of the message, every iteration produced a
 * different prefix from byte one and the cache never hit — the
 * manuscript was re-billed at full input rate on every single run.
 * Modelled at ~43% of repeat-run cost thrown away
 * (docs/plans/experiments/founding-cohort-cost-model.mjs).
 *
 * Putting PANELS first makes the manuscript a stable cacheable prefix
 * across a user's iterations. The instructions themselves are unchanged
 * — this is purely a reordering of the same content, so the model sees
 * identical information. The system prompt already tells it both
 * sections are coming, and the EMPHASIS block is explicitly framed
 * below as applying to the panels above.
 */
export function buildCondenserUserMessage(
  roles: CondenseRoleInput[],
  pinned: CondensePinnedInput[],
  emphasis: CondenseEmphasis,
): string {
  const parts: string[] = [];

  // ── Cacheable prefix: the manuscript. Identical across iterations.
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

  // ── Volatile suffix: the author's emphasis. Changes every iteration,
  //    so everything above it stays a stable cache prefix.
  parts.push('');
  parts.push('AUTHOR EMPHASIS');
  parts.push('Apply the following to the panels above.');
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
  parts.push(`- Audience: ${audienceLine(emphasis)}.`);
  parts.push(`- The poster is for: ${PURPOSE_DESCRIPTIONS[emphasis.purpose]}.`);

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
