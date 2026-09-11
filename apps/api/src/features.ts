/**
 * Server-side feature switches.
 *
 * The manuscript pipelines (paper-to-poster / paper-to-slides → the
 * narrative router) and the Presentation Checker (the review router +
 * the review billing SKUs) are deactivated, not deleted — the web app
 * no longer links or routes to them (apps/web/src/routes.tsx header).
 * These flags make the API match: with a flag OFF (the default) the
 * router is never mounted, so no session — anonymous or paid — can burn
 * LLM spend on a hidden feature, and create-checkout refuses the review
 * SKUs no matter which STRIPE_PRICE_* ids happen to be set.
 *
 *   FEATURE_MANUSCRIPT=1   mount createNarrativeRouter (/api/narrative/*)
 *   FEATURE_REVIEW=1       mount createReviewRouter (/api/review/*) and
 *                          let /billing/create-checkout sell review_pack
 *                          / review_addon (their price ids still required)
 *
 * Only "1" or "true" (any case, surrounding whitespace ignored) switch a
 * feature on; anything else — including unset — is off. Read once at
 * app construction; flipping a flag is a redeploy, not a hot toggle.
 * Webhook fulfilment for review SKUs sold BEFORE the switch is not
 * gated (billing.ts) — an existing add-on subscription must keep
 * reconciling.
 */
export interface FeatureFlags {
  readonly manuscript: boolean;
  readonly review: boolean;
}

type Env = Readonly<Record<string, string | undefined>>;

const ON_VALUES: ReadonlySet<string> = new Set(['1', 'true']);

function isOn(value: string | undefined): boolean {
  return value !== undefined && ON_VALUES.has(value.trim().toLowerCase());
}

/** Read every flag from the environment (defaults to process.env). */
export function readFeatureFlags(env: Env = process.env): FeatureFlags {
  return {
    manuscript: isOn(env.FEATURE_MANUSCRIPT),
    review: isOn(env.FEATURE_REVIEW),
  };
}

/** The checkout SKUs that belong to the Presentation Checker. */
const REVIEW_SKUS: ReadonlySet<string> = new Set(['review_pack', 'review_addon']);

/**
 * Whether create-checkout may sell `sku` under the current flags. The
 * term and export pack are always sellable; the review SKUs only while
 * FEATURE_REVIEW is on.
 */
export function isSkuSellable(sku: string, flags: FeatureFlags): boolean {
  return !REVIEW_SKUS.has(sku) || flags.review;
}
