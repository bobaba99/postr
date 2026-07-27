/**
 * Condenser model configuration — the ONLY place the model identifier
 * lives. The Phase-2 bake-off (cheaper OpenAI AND Anthropic models,
 * fixed manuscript set, blind grading) swaps these values, not code.
 */

export type CondenseProviderId = 'openai' | 'anthropic';

/** Provider the condense route uses. Additional providers register in
 *  narrative.ts's provider map; switching is config, not a rewrite. */
export const CONDENSER_PROVIDER: CondenseProviderId = 'openai';

/**
 * Verified 2026-07-27 against developers.openai.com/api/docs/models.
 *
 * Terra (mini tier) is the deliberate default: condensing a manuscript
 * into ≤200-word role summaries is a summarisation task, not a frontier
 * reasoning one, and Terra halves the input cost of the flagship.
 *
 *   gpt-5.6 / gpt-5.6-sol   $5.00 in / $15.00 out per 1M — frontier
 *   gpt-5.6-terra           $2.50 in / $15.00 out per 1M — mini  ← here
 *   gpt-5.6-luna            $1.00 in /  $6.00 out per 1M — nano
 *
 * All three carry a ~1.05M context window, so the manuscript fits at
 * any tier. Luna is the next step down if the Phase-2 bake-off shows
 * it preserves scientific meaning; grade it before switching, because
 * a condenser that quietly drops a finding is worse than a dearer one.
 */
export const CONDENSER_MODEL = 'gpt-5.6-terra';

/** Output ceiling: five roles + two pins at ≤200 words each is ~2.4k
 *  tokens; 4096 leaves headroom without letting a runaway reply bill. */
export const CONDENSER_MAX_TOKENS = 4096;

/** Upstream request timeout (ms). */
export const CONDENSER_TIMEOUT_MS = 60_000;
