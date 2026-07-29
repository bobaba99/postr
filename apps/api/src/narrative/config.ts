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

/** Upstream request timeout (ms). Shared by the extraction call below —
 *  both are single forced-tool-use requests against the same vendor, so
 *  a single timeout keeps the two LLM steps consistent. */
export const CONDENSER_TIMEOUT_MS = 60_000;

// ─────────────────────────────────────────────────────────────────────
//  Findings extraction (talk path) — ADDITIVE, server-side. This is the
//  LLM extraction arm (B) the §3.1 experiment selected: ranked findings,
//  each carrying a verbatim sourceQuote for the fidelity gate. It does
//  NOT touch the deterministic poster path (coreRelevance.ts/mapper.ts).
// ─────────────────────────────────────────────────────────────────────

/**
 * Extraction model. Same tier as the condenser and for the same reason:
 * pulling ranked findings + a verbatim supporting sentence is a
 * structured-reading task, not a frontier-reasoning one, and Terra was
 * the arm the §3.1 bake-off scored (0.62 star-hit, 0 fidelity failures,
 * ~$0.015/paper). Grade before switching tiers — a cheaper model that
 * quietly mis-ranks the star finding is worse than a dearer one.
 */
export const EXTRACTION_MODEL = 'gpt-5.6-terra';

/** Output ceiling for extraction. A ranked-finding list — short assertion
 *  + one verbatim quote per finding, a handful of findings — is well
 *  under 2k tokens; the cap bounds a runaway reply without truncating a
 *  legitimate one. */
export const EXTRACTION_MAX_TOKENS = 2048;

// ─────────────────────────────────────────────────────────────────────
//  Deck styling (Arm P) — the Phase-2 §3.1 experiment's LLM-styling arm:
//  it turns a plain SlideDeck into a structured, editable layout (device
//  + positioned elements per slide), never an image. ADDITIVE and
//  server-side; does not touch the deterministic poster path.
// ─────────────────────────────────────────────────────────────────────

/**
 * Styling model. Same tier as the condenser/extraction and for the same
 * reason: choosing a device from a fixed 5-value vocabulary and placing
 * a handful of elements per slide is a structured layout task, not a
 * frontier-reasoning one. Grade before switching tiers — a cheaper model
 * that quietly picks illegal devices is worse than a dearer one (though
 * coerceDevices gates that failure mode regardless).
 */
export const STYLE_MODEL = 'gpt-5.6-terra';

/** Output ceiling for styling. Each slide emits a device string plus a
 *  handful of positioned elements (kind/text/x/y/fontSize/color) — a
 *  multi-slide deck's worth of that is comfortably under 3k tokens; the
 *  cap bounds a runaway reply without truncating a legitimate one. */
export const STYLE_MAX_TOKENS = 3000;

// ─────────────────────────────────────────────────────────────────────
//  Theme generation (Arm T) — the Phase-2 §3.1 experiment's normalize/
//  parameter layer: a field-appropriate THEME (palette + type scale) plus
//  4 palette variations. A "vibe" re-run only re-invokes this arm.
//  ADDITIVE and server-side; does not touch the deterministic poster
//  path or the applyTheme recolor step (fbc58c0), which consumes this
//  arm's output.
// ─────────────────────────────────────────────────────────────────────

/**
 * Theme model. Same tier as the condenser/extraction/styling arms and
 * for the same reason: picking a restrained, field-appropriate palette
 * and type scale plus 4 variations is a structured-generation task, not
 * a frontier-reasoning one. Grade before switching tiers — a cheaper
 * model that quietly picks a garish or illegible palette is worse than
 * a dearer one.
 */
export const THEME_MODEL = 'gpt-5.6-terra';

/** Output ceiling for theme generation. A theme (palette + typeScale +
 *  accentTreatment + rationale) plus 4 short palette-variation arrays is
 *  comfortably under 1.5k tokens; the cap bounds a runaway reply without
 *  truncating a legitimate one. */
export const THEME_MAX_TOKENS = 1500;
