/**
 * Condenser model configuration — the ONLY place the model identifier
 * lives. The Phase-2 bake-off (cheaper OpenAI AND Anthropic models,
 * fixed manuscript set, blind grading) swaps these values, not code.
 */

export type CondenseProviderId = 'openai' | 'anthropic';

/** Provider the condense route uses. Additional providers register in
 *  narrative.ts's provider map; switching is config, not a rewrite. */
export const CONDENSER_PROVIDER: CondenseProviderId = 'openai';

// TODO: verify exact gpt-5.6 API identifier before production — unconfirmed
export const CONDENSER_MODEL = 'gpt-5.6';

/** Output ceiling: five roles + two pins at ≤200 words each is ~2.4k
 *  tokens; 4096 leaves headroom without letting a runaway reply bill. */
export const CONDENSER_MAX_TOKENS = 4096;

/** Upstream request timeout (ms). */
export const CONDENSER_TIMEOUT_MS = 60_000;
