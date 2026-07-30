/**
 * Review (Presentation Checker) model configuration — the ONLY place the
 * review model identifier lives (Global Constraints: "model id isolated
 * in apps/api/src/review/config.ts"). A model swap edits this file,
 * never critique.ts or a route.
 */

/**
 * The same model import.ts already uses for vision extraction, isolated
 * here per spec §2 (Model). Sonnet 4.5 carries the two-stage
 * perceive→judge pass over up to REVIEW_MAX_PAGES page images.
 */
export const REVIEW_MODEL = 'claude-sonnet-4-5-20250929';

/**
 * Output ceiling: the prompt asks for 4–10 findings ×
 * (problem + fix + personalized example) ≈ 2–4K tokens; 8192 leaves
 * headroom for multi-page decks without letting a runaway reply bill
 * (the import.ts:916-920 16K rationale, scaled to a smaller schema).
 */
export const REVIEW_MAX_TOKENS = 8192;

/**
 * Provider call deadline (milliseconds), passed per-call to the Anthropic
 * SDK alongside `maxRetries: 0` — keeps provider work bounded and prevents
 * SDK retries from silently multiplying the per-review bill. Mirrors
 * CONDENSER_TIMEOUT_MS in narrative/config.ts.
 */
export const REVIEW_TIMEOUT_MS = 60_000;

/** Hard page cap (spec §1) — over → typed error, never silent truncation. */
export const REVIEW_MAX_PAGES = 24;

/**
 * Per-page raw-byte cap, checked BEFORE base64 (which inflates 4/3) so the
 * caller gets a clean typed error instead of an opaque upstream rejection
 * (import.ts:544-551 precedent). Injectable in fetchReviewPages for tests.
 */
export const REVIEW_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** PPTX upload cap for the /api/review/render-pptx route (D10). */
export const REVIEW_PPTX_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Hard findings clamp applied by enforce.ts (Task 14). The prompt asks
 * for 4–10; this is the deterministic ceiling beyond that ask.
 */
export const REVIEW_MAX_FINDINGS = 12;

/**
 * Weekly add-on quota (D5) — placeholder, repriced from Phase-0 numbers;
 * the final value is set from day-one cost instrumentation (Task 28).
 */
export const REVIEW_ADDON_WEEKLY_QUOTA = 4;

/** Signed-URL TTL (seconds) for review page images (D11). */
export const REVIEW_SIGNED_URL_TTL_SEC = 600;
